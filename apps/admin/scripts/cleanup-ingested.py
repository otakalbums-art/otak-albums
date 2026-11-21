#!/usr/bin/env python3
"""
Щоденне очищення сервера камер (systemd-таймер otak-cleanup, 23:00 за Києвом).

ftp-ingest після вивантаження кладе локальну копію кожного файлу в
.photo-drop/<class>/<category>/_ingested/. Диск сервера малий (~24 ГБ), а
одна зйомка з RAW — ~20 ГБ, тож копії видаляємо того ж дня. Файл видаляється
ЛИШЕ якщо в базі є фото цього класу з такою самою назвою (рядок photos
створюється тільки після успішного вивантаження у Storage). Файли молодші
за MIN_AGE_MIN хвилин не чіпаємо.

  python3 cleanup-ingested.py            # видалити
  python3 cleanup-ingested.py --dry-run  # лише показати, що було б видалено
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DROP = os.path.join(APP, ".photo-drop")
MIN_AGE_MIN = 10
DRY = "--dry-run" in sys.argv


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
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def class_filenames(class_id):
    """Усі назви файлів класу в базі (сторінками по 1000)."""
    names, start = set(), 0
    while True:
        q = f"{URL}/rest/v1/photos?select=filename&class_id=eq.{urllib.parse.quote(class_id)}&order=id"
        req = urllib.request.Request(q, headers={**H, "Range": f"{start}-{start + 999}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            rows = json.load(r)
        names.update(row["filename"].lower() for row in rows)
        if len(rows) < 1000:
            return names
        start += 1000


def main():
    if not URL or not KEY:
        sys.exit("[cleanup] немає NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    if not os.path.isdir(DROP):
        print("[cleanup] немає .photo-drop — нічого чистити")
        return
    now = time.time()
    freed = deleted = kept = 0
    for class_id in sorted(os.listdir(DROP)):
        class_dir = os.path.join(DROP, class_id)
        if not os.path.isdir(class_dir):
            continue
        ingested_dirs = []
        for root, dirs, _files in os.walk(class_dir):
            if os.path.basename(root) == "_ingested":
                ingested_dirs.append(root)
                dirs[:] = []
        if not ingested_dirs:
            continue
        try:
            known = class_filenames(class_id)
        except Exception as e:  # база недоступна — нічого не видаляємо
            print(f"[cleanup] ✗ {class_id}: не вдалося перевірити базу ({e}) — пропускаю клас")
            continue
        for d in ingested_dirs:
            for name in os.listdir(d):
                path = os.path.join(d, name)
                if not os.path.isfile(path):
                    continue
                st = os.stat(path)
                if now - st.st_mtime < MIN_AGE_MIN * 60:
                    kept += 1
                    continue
                if name.lower() not in known:
                    kept += 1
                    print(f"[cleanup] залишаю (немає на платформі): {os.path.relpath(path, DROP)}")
                    continue
                if not DRY:
                    os.remove(path)
                deleted += 1
                freed += st.st_size
    mode = "буде видалено" if DRY else "видалено"
    print(f"[cleanup] {mode}: {deleted} файлів, {freed / 1e9:.2f} ГБ; залишено: {kept}")


if __name__ == "__main__":
    main()
