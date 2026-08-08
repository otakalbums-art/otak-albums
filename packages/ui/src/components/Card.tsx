import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: ReactNode;
  period?: ReactNode;
  menu?: boolean;
  children?: ReactNode;
}

/** Базова картка варіанту 3: біла, тонка рамка, м'яка тінь, фіолетовий ромбик перед заголовком. */
export function Card({ title, period, menu = true, children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`relative rounded-[14px] border border-line bg-card p-[18px] shadow-card ${className}`}
      {...rest}
    >
      {title && (
        <div className="mb-0.5 flex items-start justify-between">
          <div className="flex items-center gap-[7px] text-[13.5px] font-bold">
            <span className="h-[7px] w-[7px] flex-shrink-0 rotate-45 rounded-sm bg-purple" />
            {title}
          </div>
          {menu && <span className="cursor-pointer text-[16px] tracking-widest text-ink-soft">⋯</span>}
        </div>
      )}
      {period && <div className="mb-3 mt-0.5 text-[11px] text-ink-soft">{period}</div>}
      {children}
    </div>
  );
}
