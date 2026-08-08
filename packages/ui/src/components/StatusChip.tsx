interface StatusChipProps {
  status: "active" | "off";
  children: React.ReactNode;
}

export function StatusChip({ status, children }: StatusChipProps) {
  const styles =
    status === "active" ? "bg-[#E7F7EE] text-ok" : "bg-[#FBEAEA] text-warn";
  return (
    <span className={`rounded-full px-[9px] py-[3px] text-[10.5px] font-bold ${styles}`}>
      {children}
    </span>
  );
}
