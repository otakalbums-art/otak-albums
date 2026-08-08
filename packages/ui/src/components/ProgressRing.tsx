interface ProgressRingProps {
  selected: number;
  total: number;
  size?: number;
}

/** Кільце прогресу для екрана "Відбір для альбому" (5/8 обрано). */
export function ProgressRing({ selected, total, size = 110 }: ProgressRingProps) {
  const pct = total > 0 ? (selected / total) * 100 : 0;
  return (
    <div
      className="relative mx-auto"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `conic-gradient(#460464 0% ${pct}%, #EFE4F4 ${pct}% 100%)`,
      }}
    >
      <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-card">
        <b className="text-[19px]">{selected}/{total}</b>
        <span className="text-[10px] text-ink-soft">обрано</span>
      </div>
    </div>
  );
}
