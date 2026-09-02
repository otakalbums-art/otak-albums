interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

/** Перемикач для увімкнення/вимкнення посилань для мам (локально/глобально). */
export function Toggle({ checked, onChange, disabled, ...rest }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[21px] w-[38px] rounded-full transition-colors ${checked ? "bg-purple" : "bg-line"} ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
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
