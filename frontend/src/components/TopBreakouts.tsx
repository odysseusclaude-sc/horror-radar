import { Link } from "react-router-dom";
import type { GameListItem } from "../types";
import { opsScoreColor } from "./OpsBadge";
import { daysBadgeColor } from "./DaysBadge";

interface TopBreakoutsProps {
  games: GameListItem[];
  loading?: boolean;
}

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) return (parsed as string[]).slice(0, 3);
    if (typeof parsed === "object" && parsed !== null)
      return Object.keys(parsed).slice(0, 3);
    return [];
  } catch {
    return [];
  }
}

function daysOld(releaseDate: string | null): number | null {
  if (!releaseDate) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(releaseDate).getTime()) / 86400000));
}

function opsBgClasses(score: number): string {
  if (score >= 60) return "bg-status-pos/10 border-status-pos/20";
  if (score >= 30) return "bg-status-warn/10 border-status-warn/20";
  return "bg-status-neg/10 border-status-neg/20";
}

const SKELETON_COUNT = 4;

/** 4-card grid showing the next top breakout games (positions 2–5 by OPS). */
export default function TopBreakouts({ games, loading = false }: TopBreakoutsProps) {
  if (!loading && games.length === 0) return null;

  return (
    <section className="mt-10">
      {/* Section heading */}
      <div className="flex items-baseline gap-4 mb-5">
        <h2 className="text-base font-semibold text-text-main">Trending This Week</h2>
        <span className="text-xs text-text-dim">Highest OPS scores right now</span>
        <Link
          to="/"
          className="ml-auto text-xs font-medium text-text-mid hover:text-text-main transition-colors"
          onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
        >
          View all →
        </Link>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div
                key={i}
                className="bg-surface-dark border border-border-dark rounded-xl p-5 animate-pulse"
              >
                <div className="flex justify-between mb-3 gap-2">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-background-dark rounded" />
                    <div className="h-3 w-1/2 bg-background-dark rounded" />
                  </div>
                  <div className="h-7 w-10 bg-background-dark rounded flex-shrink-0" />
                </div>
                <div className="flex gap-2 mt-3">
                  <div className="h-4 w-16 bg-background-dark rounded" />
                  <div className="h-4 w-12 bg-background-dark rounded" />
                </div>
                <div className="flex justify-between mt-4 pt-3 border-t border-border-dark/60">
                  <div className="h-3 w-12 bg-background-dark rounded" />
                  <div className="h-4 w-8 bg-background-dark rounded" />
                </div>
              </div>
            ))
          : games.map((game) => {
              const ops = game.latest_ops?.score ?? 0;
              const days = daysOld(game.release_date);
              const tags = parseTags(game.tags);

              return (
                <Link
                  key={game.appid}
                  to={`/game/${game.appid}`}
                  className="group bg-surface-dark border border-border-dark rounded-xl p-5 block hover:border-primary/50 hover:-translate-y-1 hover:shadow-xl transition-all duration-200"
                >
                  {/* Card header: title + OPS badge */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-main leading-snug line-clamp-2">
                        {game.title}
                      </p>
                      {game.developer && (
                        <p className="text-xs text-text-dim mt-0.5 truncate">{game.developer}</p>
                      )}
                    </div>
                    <span
                      className={`font-mono text-sm font-bold px-2.5 py-1 rounded border flex-shrink-0 ${opsBgClasses(ops)} ${opsScoreColor(ops)}`}
                    >
                      {Math.round(ops)}
                    </span>
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-medium text-text-dim bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer: price + days */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-dark/60">
                    <span className="font-mono text-xs text-text-mid">
                      {game.price_usd == null
                        ? ""
                        : game.price_usd === 0
                        ? "Free"
                        : `$${game.price_usd.toFixed(2)}`}
                    </span>
                    {days !== null && (
                      <span
                        className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${daysBadgeColor(days)}`}
                      >
                        {days}d
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
      </div>
    </section>
  );
}
