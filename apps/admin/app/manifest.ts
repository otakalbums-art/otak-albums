import type { MetadataRoute } from "next";

/**
 * PWA-маніфест (нативний Next.js metadata route — /manifest.webmanifest).
 * Потрібен, щоб "Додати на головний екран" працювало як застосунок
 * (display: standalone), і як передумова для Push API на iOS (працює
 * лише для встановленого на головний екран PWA, не для вкладки браузера).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Otak Albums — адмін-панель",
    short_name: "Otak Admin",
    description: "Керування класами, типами альбомів, посиланнями для мам і бекап-сервером.",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F5F7",
    theme_color: "#460464",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/logo.png", sizes: "1080x1080", type: "image/png" },
    ],
  };
}
