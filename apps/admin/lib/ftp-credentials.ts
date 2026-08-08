import { createHmac } from "crypto";

/**
 * Детерміновані FTP-креденшли для класу — обчислюються з class_id +
 * FTP_INGEST_SECRET, нічого додатково не зберігається в БД.
 *
 * Той самий алгоритм продубльований у scripts/ftp-ingest.mjs (окремий
 * Node-процес, не проходить через збірку Next.js, тому імпортувати звідси
 * напряму не може) — тримай обидва місця синхронними при зміні.
 */
export function ftpCredentialsForClass(classId: string) {
  const secret = process.env.FTP_INGEST_SECRET || "dev-only-insecure-secret-change-me";
  const h = createHmac("sha256", secret).update(classId).digest("hex");
  return { username: `class-${h.slice(0, 6)}`, password: h.slice(6, 18) };
}

export function lanIps() {
  const { networkInterfaces } = require("os") as typeof import("os");
  const out: { name: string; address: string }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}
