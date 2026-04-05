interface DaysBadgeProps {
  days: number;
}

export function daysBadgeColor(d: number): string {
  if (d <= 7) return "bg-status-pos/10 text-status-pos border-status-pos/20";
  if (d <= 30) return "bg-status-warn/10 text-status-warn border-status-warn/20";
  return "bg-status-neg/10 text-status-neg border-status-neg/20";
}

/** Small pill badge showing days since launch, color-coded by age. */
export default function DaysBadge({ days }: DaysBadgeProps) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${daysBadgeColor(days)}`}>
      {days}d
    </span>
  );
}
