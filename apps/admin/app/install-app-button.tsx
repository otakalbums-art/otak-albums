"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * «Встановити застосунок» (PWA «OA Admin», app/manifest.ts).
 * Android / Chrome / Edge: системне вікно встановлення (beforeinstallprompt).
 * iPhone / iPad: такого API немає — показуємо, як додати вручну
 * (Поділитися → «На початковий екран»).
 * Уже встановлений застосунок (standalone) — кнопку не показуємо.
 */
export function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!prompt && !isIos)) return null;

  return (
    <>
      <button
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            await prompt.userChoice.catch(() => null);
            setPrompt(null);
          } else {
            setShowIosHelp(true);
          }
        }}
        className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-purple hover:bg-page md:mt-0"
      >
        <Download className="h-4 w-4" /> Встановити застосунок «OA Admin»
      </button>

      {showIosHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setShowIosHelp(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-bold">Додати «OA Admin» на екран</h3>
              <button onClick={() => setShowIosHelp(false)} aria-label="Закрити" className="text-ink-soft">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="ml-4 list-decimal space-y-1.5 text-[13.5px]">
              <li>
                Відкрийте адмінку в <b>Safari</b>.
              </li>
              <li>
                Натисніть <Share className="inline h-4 w-4 -translate-y-0.5 text-purple" /> <b>Поділитися</b> внизу екрана.
              </li>
              <li>
                Оберіть <b>«На початковий екран»</b> → <b>«Додати»</b>.
              </li>
            </ol>
            <p className="mt-3 text-[12px] text-ink-soft">
              Після цього «OA Admin» відкривається як окремий застосунок, і на iPhone запрацюють push-сповіщення.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
