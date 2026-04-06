import { Link } from "react-router-dom";
import type { GameListItem } from "../types";
import DaysBadge from "./DaysBadge";

interface HeroSectionProps {
  game: GameListItem | null;
  loading?: boolean;
}

function daysOld(releaseDate: string | null): number | null {
  if (!releaseDate) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(releaseDate).getTime()) / 86400000));
}

function buildVerdict(game: GameListItem, days: number | null): string {
  const ops = game.latest_ops?.score ?? 0;
  const delta = game.ops_delta_7d;
  const channels = game.youtube_channels?.length ?? 0;

  const parts: string[] = [];

  if (delta && delta > 2) {
    parts.push(`OPS up +${Math.round(delta)} this week`);
  }
  if (channels >= 3) {
    parts.push(`${channels} tracked creators covering it`);
  } else if (channels === 2) {
    parts.push(`2 creators covering it`);
  } else if (channels === 1) {
    parts.push(`${game.youtube_channels[0].name} on it`);
  }
  if (days !== null && days <= 14) {
    parts.push(`only ${days} days old`);
  }

  if (parts.length === 0) {
    return `Scoring ${Math.round(ops)} on the Overperformance Scale — outpacing peers in its launch window.`;
  }

  return parts.join(" · ") + ".";
}

function opsCircleClasses(score: number): { ring: string; text: string; bg: string } {
  if (score >= 60)
    return {
      ring: "border-status-pos",
      text: "text-status-pos",
      bg: "bg-status-pos/[0.06]",
    };
  if (score >= 30)
    return {
      ring: "border-status-warn",
      text: "text-status-warn",
      bg: "bg-status-warn/[0.06]",
    };
  return {
    ring: "border-status-neg",
    text: "text-status-neg",
    bg: "bg-status-neg/[0.06]",
  };
}

/** Full-width hero card featuring the current #1 OPS breakout. */
export default function HeroSection({ game, loading = false }: HeroSectionProps) {
  if (loading) {
    return (
      <section
        className="mt-8 rounded-xl border border-border-dark overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1e1210 0%, #111314 50%, #0d1117 100%)",
        }}
      >
        <div className="px-10 sm:px-12 py-12 sm:py-14 grid grid-cols-[1fr_auto] gap-10 items-center">
          <div className="space-y-3">
            <div className="h-3 w-36 bg-surface-dark rounded animate-pulse" />
            <div className="h-10 w-72 bg-surface-dark rounded animate-pulse" />
            <div className="h-4 w-52 bg-surface-dark rounded animate-pulse" />
            <div className="h-4 w-80 bg-surface-dark rounded animate-pulse" />
            <div className="h-10 w-36 bg-surface-dark rounded animate-pulse mt-2" />
          </div>
          <div className="w-28 h-28 rounded-full bg-surface-dark animate-pulse flex-shrink-0" />
        </div>
      </section>
    );
  }

  if (!game || !game.latest_ops?.score) return null;

  const ops = game.latest_ops.score;
  const days = daysOld(game.release_date);
  const { ring, text, bg } = opsCircleClasses(ops);
  const verdict = buildVerdict(game, days);

  return (
    <section
      className="mt-8 rounded-xl border border-border-dark overflow-hidden relative"
      style={{
        background: "linear-gradient(135deg, #1e1210 0%, #111314 50%, #0d1117 100%)",
      }}
    >
      {/* Radial accent glows */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 75% 40%, rgba(128,38,38,0.12) 0%, transparent 70%), radial-gradient(ellipse 40% 50% at 20% 80%, rgba(94,194,105,0.04) 0%, transparent 60%)",
        }}
      />

      <div className="relative px-8 sm:px-12 py-10 sm:py-14 grid grid-cols-[1fr_auto] gap-8 sm:gap-10 items-center">
        <div>
          {/* Eyebrow label */}
          <p className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase text-status-warn mb-3">
            Breaking Out This Week
          </p>

          {/* Game title */}
          <h2 className="font-serif text-3xl sm:text-[2.8rem] font-bold leading-tight text-text-main mb-3">
            {game.title}
          </h2>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {game.developer && (
              <span className="text-sm text-text-mid">by {game.developer}</span>
            )}
            {game.price_usd != null && (
              <span className="font-mono text-xs font-medium text-text-main bg-white/[0.06] px-2.5 py-0.5 rounded">
                {game.price_usd === 0 ? "Free" : `$${game.price_usd.toFixed(2)}`}
              </span>
            )}
            {days !== null && <DaysBadge days={days} />}
            {game.is_multiplayer && (
              <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded border border-status-info/30 bg-status-info/10 text-status-info">
                Multiplayer
              </span>
            )}
          </div>

          {/* Auto-generated verdict */}
          <p className="text-sm italic text-text-mid mb-6 leading-relaxed max-w-lg">
            "{verdict}"
          </p>

          {/* CTA */}
          <Link
            to={`/game/${game.appid}`}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-light text-white text-sm font-semibold px-6 py-3 rounded-lg transition-all duration-150 hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(128,38,38,0.4)]"
          >
            Read the Signal <span>→</span>
          </Link>
        </div>

        {/* OPS circle badge */}
        <div
          className={`flex-shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-full border-[3px] ${ring} ${bg} flex flex-col items-center justify-center`}
        >
          <span className={`font-mono text-3xl sm:text-4xl font-black leading-none ${text}`}>
            {Math.round(ops)}
          </span>
          <span className={`font-mono text-[10px] font-semibold tracking-widest mt-1 ${text} opacity-70`}>
            OPS
          </span>
        </div>
      </div>
    </section>
  );
}
