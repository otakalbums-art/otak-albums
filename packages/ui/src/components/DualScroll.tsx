"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Горизонтальна прокрутка широкої таблиці зі смугою і знизу, і зверху —
 * щоб не гортати сторінку до кінця таблиці заради бігунка. Обидві смуги
 * синхронізовані; верхня ховається, коли таблиця вміщається в ширину.
 */
export function DualScroll({ children, className = "" }: { children: ReactNode; className?: string }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const syncing = useRef(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      setWidth(body.scrollWidth);
      setOverflow(body.scrollWidth > body.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    if (body.firstElementChild) ro.observe(body.firstElementChild);
    return () => ro.disconnect();
  }, []);

  function sync(from: HTMLDivElement | null, to: HTMLDivElement | null) {
    if (!from || !to) return;
    if (syncing.current) {
      syncing.current = false;
      return;
    }
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
  }

  return (
    <div className={className}>
      <div
        ref={topRef}
        onScroll={() => sync(topRef.current, bodyRef.current)}
        className={`overflow-x-auto overflow-y-hidden ${overflow ? "" : "hidden"}`}
        aria-hidden
      >
        <div style={{ width, height: 1 }} />
      </div>
      <div ref={bodyRef} onScroll={() => sync(bodyRef.current, topRef.current)} className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
