import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  size?: "md" | "sm";
}

export function Button({ variant = "primary", size = "md", className = "", ...rest }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-[9px] font-bold transition-colors disabled:opacity-50";
  const variants = {
    primary: "bg-purple text-white hover:bg-purple-deep",
    ghost: "bg-page text-ink border border-line hover:bg-line/40",
  };
  const sizes = {
    md: "px-5 py-[11px] text-[13.5px] w-full",
    sm: "px-3.5 py-2 text-[12.5px] w-auto",
  };
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest} />;
}
