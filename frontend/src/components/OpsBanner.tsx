import { useEffect, useState } from "react";

const STORAGE_KEY = "horror-radar-ops-banner-dismissed";

interface OpsComponent {
  icon: string;
  name: string;
  weight: string;
  desc: string;
}

const COMPONENTS: OpsComponent[] = [
  { icon: "📈", name: "Velocity",  weight: "30% weight", desc: "Review growth rate vs. age-adjusted median" },
  { icon: "🔄", name: "Decay",     weight: "20% weight", desc: "Week 2-4 velocity held vs. launch week" },
  { icon: "⭐", name: "Reviews",   weight: "13% weight", desc: "Total review count vs. price-adjusted median" },
  { icon: "▶",  name: "YouTube",   weight: "13% weight", desc: "Creator coverage + view performance" },
  { icon: "🎮", name: "CCU",       weight: "10% weight", desc: "Peak concurrent players vs. peer median" },
  { icon: "💬", name: "Sentiment", weight: "8% weight",  desc: "Review score % with trend multiplier" },
  { icon: "📺", name: "Twitch",    weight: "6% weight",  desc: "Streamer count + peak viewers" },
];

export default function OpsBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }

  return (
    <aside
      aria-label="OPS score explanation"
      className="mx-4 md:mx-6 xl:mx-10 my-4 bg-surface-dark border border-border-dark border-l-[3px] border-l-secondary rounded-lg p-5 md:p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-lg font-bold text-text-main">
          <span className="text-secondary" aria-hidden="true">⚡</span>
          What is OPS (Overperformance Score)?
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss OPS explanation"
          title="Dismiss"
          className="text-text-dim hover:text-text-main hover:bg-white/5 rounded p-2 leading-none transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-text-mid mb-5 max-w-[640px] leading-relaxed">
        OPS measures how much a game is outperforming its peers in the first 90 days
        after release. A score of 60+ signals a potential breakout. It combines 7
        real-time engagement signals:
      </p>

      {/* Component grid */}
      <div role="list" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {COMPONENTS.map((c) => (
          <div
            key={c.name}
            role="listitem"
            className="bg-white/[0.02] border border-border-dark rounded-md px-3 py-3 text-center"
          >
            <div className="text-lg mb-1" aria-hidden="true">{c.icon}</div>
            <div className="text-sm font-semibold text-text-main mb-0.5">{c.name}</div>
            <div className="text-xs font-mono text-text-dim mb-1">{c.weight}</div>
            <div className="text-xs text-text-dim leading-tight">{c.desc}</div>
          </div>
        ))}
      </div>

      {/* Scale + tiers */}
      <div className="mt-4 pt-4 border-t border-border-dark flex items-center gap-4 flex-wrap">
        <span className="text-xs uppercase tracking-wider font-semibold text-text-dim">Score range</span>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span>0</span>
          <div className="flex h-[6px] w-[120px] rounded-full overflow-hidden">
            <div className="flex-1 bg-status-neg" />
            <div className="flex-1 bg-status-warn" />
            <div className="flex-1 bg-status-pos" />
          </div>
          <span>100</span>
        </div>
        <span className="text-xs uppercase tracking-wider font-semibold text-text-dim ml-4">Tiers</span>
        <span className="font-mono text-sm text-secondary bg-secondary/[0.08] px-3 py-0.5 rounded">0-29 Quiet</span>
        <span className="font-mono text-sm text-secondary bg-secondary/[0.08] px-3 py-0.5 rounded">30-59 Rising</span>
        <span className="font-mono text-sm text-secondary bg-secondary/[0.08] px-3 py-0.5 rounded">60+ Breakout</span>
      </div>

      {/* Confidence legend */}
      <div className="mt-3 pt-3 border-t border-border-dark flex gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span className="font-mono text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded bg-status-pos/15 text-status-pos">HIGH</span>
          <span>6-7 signals active</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span className="font-mono text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded bg-status-warn/15 text-status-warn">MED</span>
          <span>4-5 signals active</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span className="font-mono text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded bg-status-neg/15 text-status-neg">LOW</span>
          <span>1-3 signals active</span>
        </div>
      </div>
    </aside>
  );
}
