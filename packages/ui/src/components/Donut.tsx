interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  segments: DonutSegment[];
  centerLabel: string | number;
  size?: number;
}

/** Донат-діаграма на conic-gradient (як у варіанті 3) + легенда праворуч. */
export function Donut({ segments, centerLabel, size = 118 }: DonutProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let acc = 0;
  const stops = segments
    .map((s) => {
      const from = (acc / total) * 100;
      acc += s.value;
      const to = (acc / total) * 100;
      return `${s.color} ${from}% ${to}%`;
    })
    .join(", ");

  return (
    <div className="flex flex-wrap items-center gap-[18px]">
      <div
        className="relative flex-shrink-0 rounded-full"
        style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
      >
        <div className="absolute inset-[17px] flex items-center justify-center rounded-full bg-card text-[16px] font-extrabold">
          {centerLabel}
        </div>
      </div>
      <div className="flex min-w-[140px] flex-1 flex-col gap-[7px] text-xs">
        {segments.map((s) => (
          <div key={s.label} className="flex justify-between gap-2.5">
            <span className="flex items-center gap-[7px] text-ink-soft">
              <span className="h-[9px] w-[9px] rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-bold">
              {s.value} · {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
