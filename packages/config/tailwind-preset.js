/**
 * Спільний Tailwind-пресет: кольори, шрифти й тіні варіанту 3.
 * Підключається в apps/client/tailwind.config.ts і apps/admin/tailwind.config.ts через `presets: [preset]`.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        purple: {
          DEFAULT: "#460464",
          deep: "#2E0342",
          mid: "#8C57A8",
          soft: "#C6A3D6",
          pale: "#EFE4F4",
        },
        page: "#F4F5F7",
        card: "#FFFFFF",
        ink: {
          DEFAULT: "#22242B",
          soft: "#8A8E98",
        },
        line: "#EAEBEF",
        ok: "#1FAA59",
        warn: "#E14F4F",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,20,30,0.04), 0 8px 24px -12px rgba(20,20,30,0.10)",
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
};
