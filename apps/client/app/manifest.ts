import type { MetadataRoute } from "next";

/**
 * PWA-маніфест сайту для батьків/учнів (/manifest.webmanifest) — щоб кабінет
 * можна було "Додати на головний екран" і відкривати як застосунок.
 * Сесія живе в cookie, тож після першого переходу за персональним
 * посиланням застосунок одразу відкриває кабінет.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Otak Albums",
    short_name: "Otak Albums",
    description: "Кабінет дитини: час фотосесії, анкета, галерея й альбом.",
    start_url: "/cabinet",
    display: "standalone",
    background_color: "#F5F5F7",
    theme_color: "#460464",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/logo.png", sizes: "1080x1080", type: "image/png" },
    ],
  };
}
