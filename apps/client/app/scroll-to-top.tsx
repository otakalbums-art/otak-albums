"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Напівпрозора кругла кнопка «нагору» в правому нижньому куті — з'являється,
 * коли сторінку прокрутили більше ніж на півтора екрана (довгі галереї).
 * Відступ від низу враховує «чубчик»/жест-панель iPhone (safe-area).
 */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 1.5);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Нагору"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      className={`fixed right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-purple/70 text-white shadow-[0_6px_20px_rgba(70,4,100,0.35)] backdrop-blur-md transition-all duration-300 hover:bg-purple/90 active:scale-95 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
    </button>
  );
}
