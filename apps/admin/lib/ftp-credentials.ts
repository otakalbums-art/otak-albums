import { createHmac } from "crypto";

/**
 * Детерміновані FTP-креденшли для класу — обчислюються з class_id +
 * FTP_INGEST_SECRET, нічого додатково не зберігається в БД.
 *
 * Той самий алгоритм продубльований у scripts/ftp-ingest.mjs (окремий
 * Node-процес, не проходить через збірку Next.js, тому імпортувати звідси
 * напряму не може) — тримай обидва місця синхронними при зміні.
 */
// Значення навмисно чисто цифрові (6+6 знаків) — набагато швидше набирати
// колесом/D-pad'ом на екрані камери, ніж hex-рядок з буквами.
export function ftpCredentialsForClass(classId: string) {
  const secret = process.env.FTP_INGEST_SECRET || "dev-only-insecure-secret-change-me";
  const h = createHmac("sha256", secret).update(classId).digest();
  const username = String(100000 + (h.readUInt32BE(0) % 900000));
  const password = String(100000 + (h.readUInt32BE(4) % 900000));
  return { username, password };
}

export function lanIps() {
  const { networkInterfaces } = require("os") as typeof import("os");
  const out: { name: string; address: string }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      // 169.254.x.x (APIPA/link-local) — самопризначена адреса "мертвого"
      // адаптера без DHCP (VPN, Hyper-V, вимкнений Wi-Fi тощо); камера по
      // ній ніколи не достукається, тож одразу відкидаємо, щоб не
      // підсунути фотографу неробочий Host.
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) {
        out.push({ name, address: a.address });
      }
    }
  }
  return out;
}
