#!/usr/bin/env python3
"""
Аналіз облич на фото — фоновий процес на сервері камер (systemd: otak-faces).

Кожні POLL_S секунд бере JPEG без аналізу (photos.faces_analyzed_at is null),
знаходить обличчя (OpenCV YuNet), рахує «відбиток» кожного (OpenCV SFace, 128
чисел) і зберігає в photo_faces. Після першого аналізу фото один раз
автосортується за правилами категорій (photo_categories.auto_faces):
  1 обличчя -> категорія з правилом 'single', 2+ -> з правилом 'multi'.
Сортуються лише фото з категорій, що мають правило, або з «Без категорії» —
свідомо обрану категорію (церемонія, персональні…) не чіпаємо. RAW-пара
кадру переїжджає разом із JPEG.

Моделі (opencv_zoo, ліцензії дозволяють комерційне використання):
  models/face_detection_yunet_2023mar.onnx, models/face_recognition_sface_2021dec.onnx
Оточення: .env.local поруч із ftp-ingest (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
Залежності: opencv-python-headless, numpy (venv у /opt/otak-ftp/faces-venv).
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
MODELS = os.environ.get("FACE_MODELS_DIR", os.path.join(APP, "models"))
POLL_S = int(os.environ.get("FACE_POLL_S", "15"))
BATCH = int(os.environ.get("FACE_BATCH", "20"))
MAX_SIDE = 1600  # аналізуємо preview ~1600 px — обличчя дітей там достатньо великі
MIN_FACE = 0.04  # «велике» обличчя: ширина ≥ 4% кадру (відсікає дрібні обличчя на фоні)


def load_env():
    env = dict(os.environ)
    path = os.path.join(APP, ".env.local")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return env


ENV = load_env()
URL = (ENV.get("NEXT_PUBLIC_SUPABASE_URL") or ENV.get("SUPABASE_URL") or "").rstrip("/")
KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not URL or not KEY:
    sys.exit("[faces] немає NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def log(msg):
    print(f"[faces] {msg}", flush=True)


def rest(method, path, body=None, extra=None, timeout=60):
    data = None if body is None else json.dumps(body).encode()
    headers = {**HEADERS, "Content-Type": "application/json", **(extra or {})}
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def storage_get(path, timeout=120):
    req = urllib.request.Request(
        f"{URL}/storage/v1/object/photos/{urllib.parse.quote(path)}", headers=HEADERS
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def now():
    return datetime.now(timezone.utc).isoformat()


# --- push адмінам (через адмінку /api/push/internal, як і ftp-ingest.mjs) ---
ADMIN_URL = (ENV.get("ADMIN_URL") or "https://admin.otakalbums.online").rstrip("/")
PUSH_SECRET = ENV.get("FTP_CONTROL_SECRET", "")
QUIET_S = int(os.environ.get("FACE_QUIET_S", str(15 * 60)))  # тиша в класі = зйомку завершено


def notify(title, body, url="/", tab="classes"):
    if not PUSH_SECRET:
        return
    data = json.dumps({"tab": tab, "title": title, "body": body, "url": url}).encode()
    req = urllib.request.Request(
        f"{ADMIN_URL}/api/push/internal",
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {PUSH_SECRET}"},
    )
    try:
        urllib.request.urlopen(req, timeout=20).read()
    except Exception as e:
        log(f"✗ push: {e}")


# Підсумок по класу після зйомки: {class_id: {"last": ts, "n": кадрів, "single": .., "multi": ..}}
session = {}


def frame_no(filename):
    nums = re.findall(r"\d+", filename)
    return int(nums[-1]) if nums else None


def missing_ranges(class_id):
    """Пропуски в нумерації JPEG за останню добу: [(від, до), ...]."""
    since = datetime.fromtimestamp(time.time() - 24 * 3600, timezone.utc).isoformat()
    rows, start = [], 0
    while True:
        q = (f"photos?select=filename&class_id=eq.{class_id}&file_kind=eq.jpeg"
             f"&uploaded_at=gte.{urllib.parse.quote(since)}&order=id")
        batch = rest("GET", q, extra={"Range": f"{start}-{start + 999}"}) or []
        rows += batch
        if len(batch) < 1000:
            break
        start += 1000
    nums = sorted({n for n in (frame_no(r["filename"]) for r in rows) if n is not None})
    return [(a + 1, b - 1) for a, b in zip(nums, nums[1:]) if b - a > 1]


def class_summaries():
    """Клас, де вже QUIET_S немає нових фото й усе проаналізовано, — надсилаємо підсумок (пуші 6 і 7)."""
    t = time.time()
    for class_id, st in list(session.items()):
        if t - st["last"] < QUIET_S:
            continue
        pending = rest("GET", f"photos?select=id&class_id=eq.{class_id}&file_kind=eq.jpeg&faces_analyzed_at=is.null&limit=1") or []
        if pending:
            continue
        del session[class_id]
        klass = (rest("GET", f"classes?select=name&id=eq.{class_id}") or [{}])[0]
        name = klass.get("name", "клас")
        url = f"/classes/{class_id}/photos"
        parts = [f"нових фото: {st['n']}"]
        if st["single"] or st["multi"]:
            parts.append(f"портретів {st['single']}, групових {st['multi']}")
        notify(f"Обличчя проаналізовано — {name}", ", ".join(parts).capitalize(), url)
        try:
            gaps = missing_ranges(class_id)
        except Exception as e:
            log(f"✗ пропуски кадрів: {e}")
            gaps = []
        total = sum(b - a + 1 for a, b in gaps)
        if total >= 3:
            shown = ", ".join(f"{a}" if a == b else f"{a}–{b}" for a, b in gaps[:5]) + ("…" if len(gaps) > 5 else "")
            notify(
                f"Бракує кадрів — {name}",
                f"Не дійшло ~{total} кадрів ({shown}). Якщо їх не видаляли на камері й не знімали для іншого класу — дозавантажте з картки («Лише нові файли»).",
                f"/classes/{class_id}/upload",
            )


detector = cv2.FaceDetectorYN.create(
    os.path.join(MODELS, "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.8, 0.3, 5000
)
recognizer = cv2.FaceRecognizerSF.create(os.path.join(MODELS, "face_recognition_sface_2021dec.onnx"), "")


def load_image(storage_path):
    """Preview (webp ~1600 px), якщо є; інакше оригінал JPEG."""
    candidates = []
    if "/JPEG/" in storage_path:
        candidates.append(re.sub(r"\.[^./]+$", ".webp", storage_path.replace("/JPEG/", "/PREVIEW/")))
    candidates.append(storage_path)
    for p in candidates:
        try:
            buf = np.frombuffer(storage_get(p), np.uint8)
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                continue
            raise
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if img is None:
            continue
        h, w = img.shape[:2]
        if max(h, w) > MAX_SIDE:
            s = MAX_SIDE / max(h, w)
            img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        return img
    return None


def analyze(img):
    h, w = img.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(img)
    out = []
    for f in [] if faces is None else faces:
        if f[2] < MIN_FACE * w:
            continue
        feat = recognizer.feature(recognizer.alignCrop(img, f)).flatten()
        feat = feat / (np.linalg.norm(feat) or 1.0)
        out.append({
            "box": [round(float(f[0] / w), 4), round(float(f[1] / h), 4), round(float(f[2] / w), 4), round(float(f[3] / h), 4)],
            "score": round(float(f[14]), 3),
            "embedding": [round(float(x), 5) for x in feat],
        })
    # Найбільше обличчя — першим (face_index 0 = «головне» обличчя кадру).
    out.sort(key=lambda x: -(x["box"][2] * x["box"][3]))
    return out


def sort_rules():
    rows = rest("GET", "photo_categories?select=key,auto_faces&auto_faces=not.is.null") or []
    return {r["auto_faces"]: r["key"] for r in rows}


def frame_key(filename):
    return re.sub(r"\.[^.]+$", "", filename).lower()


def move_with_raw(photo, target):
    """JPEG у target-категорію + його RAW-пару (та сама назва кадру) в класі."""
    rest("PATCH", f"photos?id=eq.{photo['id']}", {"category": target})
    base = re.sub(r"\.[^.]+$", "", photo["filename"])
    like = urllib.parse.quote(base.replace("*", "") + ".*")
    raws = rest("GET", f"photos?select=id,filename&class_id=eq.{photo['class_id']}&file_kind=eq.raw&filename=ilike.{like}") or []
    for r in raws:
        if frame_key(r["filename"]) == frame_key(photo["filename"]):
            rest("PATCH", f"photos?id=eq.{r['id']}", {"category": target})


def auto_sort(photo, count, rules):
    eligible = set(rules.values()) | {"uncategorized"}
    target = rules.get("single") if count == 1 else rules.get("multi") if count >= 2 else None
    if target and photo["category"] in eligible and photo["category"] != target:
        move_with_raw(photo, target)
        return target
    return None


def process(photo, rules):
    img = load_image(photo["storage_path"])
    if img is None:
        # Файлу немає/битий — позначаємо, щоб не крутитись на ньому вічно.
        rest("PATCH", f"photos?id=eq.{photo['id']}", {"faces_analyzed_at": now(), "face_count": 0, "faces_sorted_at": now()})
        log(f"✗ не вдалося прочитати {photo['filename']}")
        return
    faces = analyze(img)
    rest("DELETE", f"photo_faces?photo_id=eq.{photo['id']}")
    if faces:
        rest("POST", "photo_faces", [
            {"photo_id": photo["id"], "class_id": photo["class_id"], "face_index": i, **f} for i, f in enumerate(faces)
        ], {"Prefer": "return=minimal"})
    patch = {"face_count": len(faces), "faces_analyzed_at": now()}
    st = session.setdefault(photo["class_id"], {"last": 0, "n": 0, "single": 0, "multi": 0})
    st["last"] = time.time()
    st["n"] += 1
    moved = None
    if not photo.get("faces_sorted_at"):
        moved = auto_sort(photo, len(faces), rules)
        patch["faces_sorted_at"] = now()
        if moved and moved == rules.get("single"):
            st["single"] += 1
        elif moved and moved == rules.get("multi"):
            st["multi"] += 1
    rest("PATCH", f"photos?id=eq.{photo['id']}", patch)
    log(f"✓ {photo['filename']}: облич {len(faces)}" + (f" -> {moved}" if moved else ""))


def main():
    log(f"запущено, моделі: {MODELS}")
    while True:
        try:
            rules = sort_rules()
            batch = rest(
                "GET",
                "photos?select=id,class_id,filename,storage_path,category,faces_sorted_at"
                f"&file_kind=eq.jpeg&faces_analyzed_at=is.null&order=uploaded_at.asc&limit={BATCH}",
            ) or []
            for photo in batch:
                try:
                    process(photo, rules)
                except Exception as e:  # одне фото не зупиняє чергу
                    log(f"✗ {photo.get('filename')}: {e}")
                    time.sleep(2)
            if len(batch) == BATCH:
                continue  # є ще — одразу далі
            class_summaries()
        except Exception as e:
            log(f"✗ цикл: {e}")
        time.sleep(POLL_S)


if __name__ == "__main__":
    main()
