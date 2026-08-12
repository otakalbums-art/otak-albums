const REFERRAL_CODE_KEY = "otak_referral_code";

/**
 * Викликати одразу після успішного входу (login-form.tsx) — щоб при
 * протуханні/недійсності сесії пізніше (401 з /api/photos, /api/album-slots,
 * /api/profile) можна було повернути учня саме на ЙОГО реальне
 * посилання-запрошення (/login/{code}), а не на голий /login. Голий /login
 * без коду не має форми взагалі — лише повідомлення "потрібне персональне
 * посилання" (apps/client/app/login/page.tsx) — учню це виглядає як "мене
 * викинуло в нікуди", хоча насправді сесія просто скінчилась.
 */
export function rememberReferralCode(code: string) {
  try {
    localStorage.setItem(REFERRAL_CODE_KEY, code);
  } catch {
    // localStorage може бути недоступний (приватний режим тощо) — не критично,
    // просто редірект на 401 впаде назад на голий /login.
  }
}

/** Сесія недійсна/протухла (401 від будь-якого /api/*) — повернути на форму входу. */
export function redirectToLogin() {
  let code: string | null = null;
  try {
    code = localStorage.getItem(REFERRAL_CODE_KEY);
  } catch {
    // ignore
  }
  window.location.href = code ? `/login/${code}` : "/login";
}
