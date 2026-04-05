import { ResponsiveContainer, AreaChart, Area } from "recharts";

interface MiniSparklineProps {
  /** Array of numeric values to plot. */
  data: number[];
  /** Color of the sparkline area. Default: status-pos (#5ec269). */
  color?: string;
  /** Height in px. Default 24. */
  height?: number;
  /** CSS class for outer wrapper. */
  className?: string;
}

/** Minimal Recharts area sparkline — no axes, no tooltips, just the shape. */
export default function MiniSparkline({
  data,
  color = "#5ec269",
  height = 24,
  className = "",
}: MiniSparklineProps) {
  if (!data || data.length < 2) return null;

  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sparkGrad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#sparkGrad-${color.replace("#", "")})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
