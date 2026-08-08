/**
 * Дизайн-токени варіанту 3 ("аналітичний SaaS").
 * Використовуються і в tailwind-preset (packages/config), і напряму в компонентах,
 * де потрібні inline-значення (наприклад, conic-gradient для донат-діаграм).
 */
export const colors = {
  purple: "#460464",
  purpleDeep: "#2E0342",
  purpleMid: "#8C57A8",
  purpleSoft: "#C6A3D6",
  purplePale: "#EFE4F4",
  page: "#F4F5F7",
  card: "#FFFFFF",
  ink: "#22242B",
  inkSoft: "#8A8E98",
  line: "#EAEBEF",
  ok: "#1FAA59",
  warn: "#E14F4F",
} as const;

export const radius = {
  sm: "9px",
  md: "12px",
  lg: "14px",
} as const;

export const shadow = {
  card: "0 1px 2px rgba(20,20,30,0.04), 0 8px 24px -12px rgba(20,20,30,0.10)",
} as const;

export const fonts = {
  sans: "'Inter', sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;
