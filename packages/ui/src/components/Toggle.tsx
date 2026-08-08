interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  "aria-label"?: string;
}

/** Перемикач для увімкнення/вимкнення посилань для мам (локально/глобально). */
export function Toggle({ checked, onChange, ...rest }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[21px] w-[38px] rounded-full transition-colors ${checked ? "bg-purple" : "bg-line"}`}
      {...rest}
    >
      <span
        className={`absolute top-[2px] h-[17px] w-[17px] rounded-full bg-white transition-all ${
          checked ? "left-[19px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}
