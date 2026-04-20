import type { OpsScore, OpsConfidence } from "../types";

interface OpsBadgeProps {
  ops: OpsScore;
  delta?: number | null;
  /** dot size class, e.g. "w-[5px] h-[5px]" (default) or "w-1 h-1" */
  dotSize?: string;
  /** If true, shows score larger (GameRow style). Default false (GameCard style). */
  large?: boolean;
}

export function opsScoreColor(score: number): string {
  if (score >= 60) return "text-status-pos";
  if (score >= 30) return "text-status-warn";
  return "text-status-neg";
}

export function opsGlyph(score: number): string {
  if (score >= 60) return "▲";
  if (score >= 30) return "◆";
  return "▼";
}

function confidenceTitle(confidence: OpsConfidence | null): string {
  if (confidence === "high") return "High data coverage";
  if (confidence === "medium") return "Moderate data coverage";
  return "Limited data coverage";
}

function dotsFilled(confidence: OpsConfidence | null, i: number): boolean {
  if (confidence === "high") return i <= 2;
  if (confidence === "medium") return i <= 1;
  return i === 0;
}

/** OPS score display: score number + optional trend delta + confidence dots. */
export default function OpsBadge({ ops, delta, dotSize = "w-[5px] h-[5px]", large = false }: OpsBadgeProps) {
  if (ops.score == null || ops.score <= 0) return null;

  return (
    <div className="flex flex-col items-end gap-0.5">
      {/* Score + delta */}
      <div className="flex items-baseline gap-1 justify-end">
        <span className={`text-[9px] opacity-60 ${opsScoreColor(ops.score)}`}>
          {opsGlyph(ops.score)}
        </span>
        <span className={`${large ? "text-lg" : "text-base"} font-black tabular-nums ${opsScoreColor(ops.score)}`}>
          {Math.round(ops.score)}
        </span>
        {delta != null && Math.abs(delta) >= 2 && (
          <span
            className={`${large ? "text-[10px]" : "text-[9px]"} font-bold tabular-nums ${
              delta > 0 ? "text-status-pos" : "text-status-neg"
            }`}
          >
            {delta > 0 ? "↑" : "↓"}{Math.abs(Math.round(delta))}
          </span>
        )}
      </div>
      {/* Confidence dots */}
      <div
        className="flex items-center gap-0.5 justify-end"
        title={confidenceTitle(ops.confidence)}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`inline-block ${dotSize} rounded-full ${
              dotsFilled(ops.confidence, i) ? "bg-text-mid" : "bg-border-dark"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
