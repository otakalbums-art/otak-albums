import type { MetadataRoute } from "next";

/**
 * PWA-маніфест (нативний Next.js metadata route — /manifest.webmanifest).
 * Назва на головному екрані — «OA Admin». Потрібен, щоб "Додати на
 * головний екран" працювало як застосунок (display: standalone), і як
 * передумова для Push API на iOS (працює лише для встановленого на
 * головний екран PWA, не для вкладки браузера). Кнопка встановлення —
 * app/install-app-button.tsx.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "OA Admin",
    short_name: "OA Admin",
    description: "Otak Albums — адмін-панель: класи, CRM, прийом фото з камер, сповіщення.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F5F7",
    theme_color: "#460464",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/logo.png", sizes: "1080x1080", type: "image/png", purpose: "any" },
    ],
  };
}
