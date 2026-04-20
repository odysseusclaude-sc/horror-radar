import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchOne } from "../../api/client";
import { useWatchlist } from "../../hooks/useWatchlist";
import type { RadarOpsComponent, RadarPickResponse, RadarPreviousPick } from "../../types";

// ─── Helpers ───────────────────────────────────────────────────
function fmt(n: number): string { return n.toLocaleString(); }
function fmtSubs(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

function opsTier(score: number): string {
  if (score >= 60) return "BREAKOUT";
  if (score >= 40) return "WATCH";
  if (score >= 20) return "EMERGING";
  return "COLD";
}

function opsToneClasses(score: number): { text: string; badgeBg: string } {
  if (score >= 60) return { text: "text-status-pos", badgeBg: "bg-status-pos/10" };
  if (score >= 40) return { text: "text-status-warn", badgeBg: "bg-status-warn/10" };
  if (score >= 20) return { text: "text-secondary", badgeBg: "bg-secondary/10" };
  return { text: "text-status-neg", badgeBg: "bg-status-neg/10" };
}

function inferConfidence(historyLength: number): "HIGH" | "MEDIUM" | "LOW" {
  if (historyLength >= 7) return "HIGH";
  if (historyLength >= 4) return "MEDIUM";
  return "LOW";
}

function priceModifier(price: number | null | undefined): { label: string; multiplier: string } {
  if (price == null || price === 0) return { label: "Free", multiplier: "0.6x" };
  if (price < 5) return { label: "<$5", multiplier: "0.85x" };
  if (price < 10) return { label: "$5-10", multiplier: "1.0x" };
  if (price < 20) return { label: "$10-20", multiplier: "1.15x" };
  return { label: "$20+", multiplier: "1.3x" };
}

function buildVerdict(d: RadarPickResponse): string {
  const parts: string[] = [];
  if (d.review_count != null) parts.push(`${fmt(d.review_count)} reviews in ${d.days_since_launch ?? "?"} days`);
  if (d.sentiment_pct != null) parts.push(`${d.sentiment_pct.toFixed(0)}% positive`);

  if (d.youtube && d.youtube.video_count > 0) {
    const biggest = d.youtube.largest_subscriber_count;
    if (biggest != null && biggest >= 1_000_000) {
      parts.push(`coverage from ${d.youtube.channels.length} creator${d.youtube.channels.length === 1 ? "" : "s"} (top: ${fmtSubs(biggest)} subs)`);
    } else if (biggest != null && biggest >= 500_000) {
      parts.push("mid-tier creator attention");
    } else {
      parts.push("smaller-creator coverage");
    }
  }

  const isAccelerating = d.velocity_7d != null && d.velocity_prev_7d != null && d.velocity_7d > d.velocity_prev_7d;
  const isDecaying = d.velocity_7d != null && d.velocity_prev_7d != null && d.velocity_7d < d.velocity_prev_7d * 0.7;

  const summary = parts.length > 0 ? `${parts.join(", ")}.` : "";
  if (isAccelerating) return `${d.title} is outpacing its peers: ${summary} Momentum is still building.`;
  if (isDecaying) return `${d.title} spiked hard and numbers are settling, but the floor is still high. ${summary}`;
  return `${d.title} is holding its launch signal. ${summary}`;
}

function buildEvidence(d: RadarPickResponse): Array<{
  type: "youtube" | "steam" | "community" | "demo";
  title: string;
  body: React.ReactNode;
  confidence: "strong" | "moderate";
}> {
  const items: Array<{
    type: "youtube" | "steam" | "community" | "demo";
    title: string;
    body: React.ReactNode;
    confidence: "strong" | "moderate";
  }> = [];

  if (d.youtube && d.youtube.channels.length > 0) {
    const topChannel = d.youtube.channels[0];
    const topSubs = topChannel.subscriber_count ?? 0;
    const otherCount = d.youtube.channels.length - 1;
    if (topSubs >= 500_000 || d.youtube.video_count >= 3) {
      items.push({
        type: "youtube",
        title: `${topChannel.name} led creator coverage`,
        body: (
          <>
            <strong>{topChannel.name}</strong> ({fmtSubs(topSubs)} subs) posted coverage, with {otherCount > 0 ? `${otherCount} additional creator${otherCount === 1 ? "" : "s"} following` : "standalone attention"}.
            Total tracked videos: <strong>{d.youtube.video_count}</strong>, combined reach <strong>{fmtSubs(d.youtube.total_views)} views</strong>.
          </>
        ),
        confidence: topSubs >= 1_000_000 ? "strong" : "moderate",
      });
    } else if (d.youtube.video_count > 0) {
      items.push({
        type: "youtube",
        title: `${d.youtube.video_count} tracked creator${d.youtube.video_count === 1 ? "" : "s"} covered this`,
        body: <>Top channel: <strong>{topChannel.name}</strong> ({fmtSubs(topSubs)} subs). Combined views: <strong>{fmtSubs(d.youtube.total_views)}</strong>.</>,
        confidence: "moderate",
      });
    }
  }

  if (d.velocity_per_day != null && d.velocity_per_day > 0) {
    const age = d.days_since_launch ?? 0;
    const expected = age <= 7 ? 1.14 : age <= 28 ? 0.14 : 0.03;
    const ratio = d.velocity_per_day / expected;
    if (ratio >= 1.2) {
      items.push({
        type: "steam",
        title: "Review velocity outpaces peer median",
        body: (
          <>
            Sustaining <strong>{d.velocity_per_day.toFixed(1)} reviews/day</strong> at day {age}.
            Peer median for this age band is {expected.toFixed(2)}/day — this is <strong>{ratio.toFixed(1)}x above</strong> baseline.
          </>
        ),
        confidence: ratio >= 2 ? "strong" : "moderate",
      });
    }
  }

  if (d.sentiment_pct != null && d.review_count != null && d.review_count >= 10) {
    items.push({
      type: "steam",
      title: `${d.sentiment_pct.toFixed(0)}% positive across ${fmt(d.review_count)} reviews`,
      body: (
        <>
          {d.sentiment_pct >= 85 ? (
            <>Sentiment is <strong>Very Positive</strong>. Review quality holds up as volume grows.</>
          ) : d.sentiment_pct >= 70 ? (
            <>Sentiment is <strong>Positive</strong>. Most players are recommending the game.</>
          ) : (
            <>Sentiment is <strong>Mixed</strong>. Raw volume is there but reception is split.</>
          )}
        </>
      ),
      confidence: d.sentiment_pct >= 85 ? "strong" : "moderate",
    });
  }

  if (d.demo && d.demo.review_count >= 10) {
    items.push({
      type: "demo",
      title: `Demo converted with ${d.demo.score_pct.toFixed(0)}% positive`,
      body: (
        <>
          <strong>{fmt(d.demo.review_count)} demo reviews</strong> at {d.demo.score_pct.toFixed(0)}% positive.
          Demo-to-purchase signal is {d.demo.score_pct >= 85 ? "strong" : "moderate"}.
        </>
      ),
      confidence: d.demo.score_pct >= 85 ? "strong" : "moderate",
    });
  }

  if (d.peak_ccu != null && d.peak_ccu > 0 && d.current_ccu != null) {
    const retention = d.current_ccu / d.peak_ccu;
    if (retention >= 0.25 && (d.days_since_launch ?? 0) >= 7) {
      items.push({
        type: "community",
        title: "Concurrent players still elevated",
        body: (
          <>
            Peak CCU of <strong>{fmt(d.peak_ccu)}</strong> with <strong>{fmt(d.current_ccu)} current</strong> — retaining <strong>{(retention * 100).toFixed(0)}%</strong> of peak past the typical 7-day launch decay window.
          </>
        ),
        confidence: retention >= 0.5 ? "strong" : "moderate",
      });
    }
  }

  return items.slice(0, 5);
}

// ─── Sub-components ─────────────────────────────────────────────
function MetricCard({
  icon,
  iconClass,
  label,
  value,
  context,
}: {
  icon: string;
  iconClass: string;
  label: string;
  value: string;
  context: React.ReactNode;
}) {
  return (
    <article className="bg-surface-dark border border-border-dark rounded-lg p-5 hover:border-[#3a342e] transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded flex items-center justify-center text-base ${iconClass}`} aria-hidden="true">
          {icon}
        </div>
        <span className="text-xs text-text-dim uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="font-mono text-xl font-semibold text-text-main mb-1">{value}</div>
      <p className="text-xs text-text-dim leading-relaxed">{context}</p>
    </article>
  );
}

function EvidenceCard({
  num,
  type,
  title,
  body,
  confidence,
}: {
  num: number;
  type: "youtube" | "steam" | "community" | "demo";
  title: string;
  body: React.ReactNode;
  confidence: "strong" | "moderate";
}) {
  const typeClass = {
    youtube: "text-status-neg",
    steam: "text-status-info",
    community: "text-status-special",
    demo: "text-status-special",
  }[type];
  const typeLabel = {
    youtube: "YouTube",
    steam: "Steam",
    community: "Community",
    demo: "Demo",
  }[type];
  const confClass = confidence === "strong"
    ? "bg-status-pos/10 text-status-pos"
    : "bg-status-warn/10 text-status-warn";

  return (
    <article className="relative bg-surface-dark border border-border-dark rounded-lg p-5">
      <span className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono text-text-dim bg-white/[0.03]">
        {num}
      </span>
      <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${typeClass}`}>{typeLabel}</div>
      <h3 className="text-sm font-semibold text-text-main mb-2 pr-8">{title}</h3>
      <p className="text-xs text-text-mid leading-relaxed [&>strong]:text-text-main [&>strong]:font-medium">{body}</p>
      <span className={`inline-flex items-center font-mono text-[10px] mt-3 px-2 py-0.5 rounded font-medium ${confClass}`}>
        {confidence === "strong" ? "STRONG signal" : "MODERATE signal"}
      </span>
    </article>
  );
}

function AnatomyBar({ component }: { component: RadarOpsComponent }) {
  const value = component.value ?? 0;
  const pct = component.max > 0 ? Math.min(100, (value / component.max) * 100) : 0;
  const weightPct = Math.round(component.weight * 100);
  return (
    <div className="grid grid-cols-[100px_1fr_70px] gap-3 items-center" role="listitem">
      <div>
        <div className="text-sm font-semibold text-text-main">{component.label}</div>
        <div className="text-[10px] text-text-dim">{weightPct}% weight</div>
      </div>
      <div
        className="h-5 bg-white/[0.03] border border-border-dark rounded-sm relative overflow-hidden"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={component.max}
        aria-label={`${component.label}: ${value.toFixed(1)} of ${component.max}`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${component.color}, ${component.color}99)`,
          }}
        />
      </div>
      <div className="font-mono text-sm text-text-main text-right">
        {component.value != null ? value.toFixed(1) : "—"}
        <span className="text-text-dim"> / {component.max.toFixed(1)}</span>
      </div>
    </div>
  );
}

function PickRow({ pick, rank }: { pick: RadarPreviousPick; rank: number }) {
  const pickOps = pick.ops_now ?? pick.ops_at_pick;
  const opsClass = pickOps >= 60 ? "text-status-pos" : pickOps >= 30 ? "text-status-warn" : "text-status-neg";
  const statusIcon = pick.status === "climbing" ? "↑" : pick.status === "peaked" ? "↓" : "→";
  const statusClass = pick.status === "climbing"
    ? "bg-status-pos/10 text-status-pos"
    : pick.status === "peaked"
      ? "bg-status-neg/10 text-status-neg"
      : "bg-status-warn/10 text-status-warn";
  const initials = pick.title.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Link
      to={`/game/${pick.appid}`}
      className="flex items-center gap-4 bg-surface-dark border border-border-dark rounded-lg px-5 py-4 hover:border-[#3a342e] hover:bg-[#222224] transition-colors group focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c04040]"
      role="listitem"
    >
      <span className="font-mono text-xs text-text-dim w-5 text-center shrink-0">#{rank}</span>
      <div className="w-10 h-10 bg-border-dark rounded-sm flex items-center justify-center text-xs text-text-dim shrink-0" aria-hidden="true">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-text-main truncate">{pick.title}</div>
        <div className="text-xs text-text-dim flex gap-3 flex-wrap mt-0.5">
          <span>picked {pick.picked_date}</span>
          <span>OPS {Math.round(pick.ops_at_pick)} at pick</span>
        </div>
      </div>
      <span className={`font-mono text-sm font-semibold shrink-0 ${opsClass}`}>
        {Math.round(pickOps)}
      </span>
      <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-medium px-2 py-0.5 rounded shrink-0 capitalize ${statusClass}`}>
        <span aria-hidden="true">{statusIcon}</span> {pick.status}
      </span>
      <span className="text-text-dim text-base shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-text-main" aria-hidden="true">›</span>
    </Link>
  );
}

// ─── Main component ─────────────────────────────────────────────
export default function SignalFire() {
  const [data, setData] = useState<RadarPickResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { isWatched, toggle: toggleWatch } = useWatchlist();

  useEffect(() => {
    fetchOne<RadarPickResponse>("/radar-pick")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const evidence = useMemo(() => (data ? buildEvidence(data) : []), [data]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.ops_history.map((p) => ({ day: `Day ${p.day}`, score: p.score }));
  }, [data]);

  if (loading) {
    return (
      <div className="bg-background-dark min-h-screen text-text-main flex items-center justify-center">
        <div className="font-mono text-xs text-text-dim tracking-[2px]">SCANNING SIGNALS...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-background-dark min-h-screen text-text-main flex items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-xs text-text-dim tracking-[2px] mb-2">NO SIGNAL</div>
          <div className="font-display text-sm text-text-mid">{error ?? "No radar pick available this week."}</div>
          <Link to="/" className="font-mono text-[11px] text-status-warn tracking-[1.5px] mt-4 inline-block hover:underline">
            BROWSE ALL GAMES →
          </Link>
        </div>
      </div>
    );
  }

  const d = data;
  const ops = d.ops;
  const opsScore = ops?.score ?? 0;
  const tone = opsToneClasses(opsScore);
  const confidence = inferConfidence(d.ops_history.length);
  const watched = isWatched(d.appid);
  const tier = opsTier(opsScore);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // silently ignore — clipboard unavailable
    }
  }

  const priceDisplay = d.price_usd != null && d.price_usd > 0 ? `$${d.price_usd.toFixed(2)}` : "Free";
  const priceMod = priceModifier(d.price_usd);
  const velocityPerDay = d.velocity_per_day ?? (d.review_count && d.days_since_launch ? d.review_count / Math.max(1, d.days_since_launch) : null);

  return (
    <>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 px-4 md:px-6 xl:px-10 py-3 text-xs text-text-dim">
        <Link to="/" className="hover:text-text-main transition-colors">Database</Link>
        <span aria-hidden="true" className="opacity-50">/</span>
        <span aria-current="page" className="text-text-mid">Radar Pick</span>
      </nav>

      {/* HERO */}
      <section
        className="relative border-b border-border-dark overflow-hidden px-4 md:px-6 xl:px-10 py-10 md:py-12"
        aria-label="Featured game"
        style={{ background: "linear-gradient(180deg, rgba(128,38,38,0.15) 0%, #111314 100%)" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(128,38,38,0.12) 0%, transparent 70%)" }}
        />

        <div className="relative">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[1px] text-secondary bg-secondary/10 border border-secondary/20 rounded-full px-3 py-0.5">
              <span aria-hidden="true">📡</span>
              Signal Fire — This Week's Pick
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-2 bg-surface-dark border border-border-dark rounded-md px-3 py-2 text-xs font-medium text-text-mid hover:text-text-main hover:border-text-dim transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c04040]"
                aria-label="Copy link to this page"
              >
                <span aria-hidden="true">🔗</span> {copied ? "Copied!" : "Copy Link"}
              </button>
              <button
                type="button"
                onClick={() => toggleWatch(d.appid)}
                className="inline-flex items-center gap-2 bg-surface-dark border border-border-dark rounded-md px-3 py-2 text-xs font-medium text-text-mid hover:text-text-main hover:border-text-dim transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c04040]"
                aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
              >
                <span aria-hidden="true">{watched ? "★" : "☆"}</span> {watched ? "In Watchlist" : "Watchlist"}
              </button>
              <a
                href={`https://store.steampowered.com/app/${d.appid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-primary border border-primary rounded-md px-3 py-2 text-xs font-semibold text-white hover:bg-primary-light transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c04040]"
              >
                <span aria-hidden="true">▸</span> Open on Steam
              </a>
            </div>
          </div>

          <h1 className="font-serif text-2xl md:text-3xl font-bold leading-[1.1] mb-3 max-w-3xl">{d.title}</h1>
          <p className="text-sm text-text-mid mb-5">
            by <span className="text-[#c04040]">{d.developer ?? "Unknown"}</span>
          </p>

          <div className="flex items-center flex-wrap gap-5">
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-3xl font-semibold leading-none ${tone.text}`}>
                {Math.round(opsScore)}
              </span>
              <span className="font-mono text-sm text-text-dim">OPS</span>
            </div>
            <span className={`font-mono text-sm font-semibold px-3 py-0.5 rounded-sm tracking-[0.5px] ${tone.badgeBg} ${tone.text}`}>
              {tier}
            </span>
            <span className={`font-mono text-xs font-medium px-2 py-0.5 rounded ${tone.badgeBg} ${tone.text}`}>
              {confidence} confidence
            </span>
            {ops?.percentile != null && (
              <span className="text-sm text-text-mid">
                <strong className="text-secondary font-mono">{Math.round(ops.percentile)}th</strong> percentile
              </span>
            )}
            {ops?.delta_14d != null && ops.delta_14d !== 0 && (
              <span className={`font-mono text-xs ${ops.delta_14d > 0 ? "text-status-pos" : "text-status-neg"}`}>
                {ops.delta_14d > 0 ? "+" : ""}
                {ops.delta_14d.toFixed(0)} · 14 days
              </span>
            )}
          </div>

          <div className="mt-5 text-base text-text-mid max-w-2xl leading-relaxed border-l-[3px] border-secondary pl-4 [&>strong]:text-text-main [&>strong]:font-semibold">
            {buildVerdict(d)}
          </div>

          <div className="flex gap-4 mt-5 flex-wrap">
            {d.price_usd != null && (
              <span className="inline-flex items-center gap-2 text-xs text-text-dim bg-white/[0.03] border border-border-dark rounded-full px-3 py-0.5">
                <span aria-hidden="true">💰</span>
                <strong className="text-text-main font-medium">{priceDisplay}</strong>
              </span>
            )}
            {d.days_since_launch != null && (
              <span className="inline-flex items-center gap-2 text-xs text-text-dim bg-white/[0.03] border border-border-dark rounded-full px-3 py-0.5">
                <span aria-hidden="true">📅</span>
                <strong className="text-text-main font-medium">{d.days_since_launch} days</strong> since launch
              </span>
            )}
            {d.demo && (
              <span className="inline-flex items-center gap-2 text-xs text-text-dim bg-white/[0.03] border border-border-dark rounded-full px-3 py-0.5">
                <span aria-hidden="true">🎮</span>
                Demo available
              </span>
            )}
            {d.sentiment_pct != null && (
              <span className="inline-flex items-center gap-2 text-xs text-text-dim bg-white/[0.03] border border-border-dark rounded-full px-3 py-0.5">
                <span aria-hidden="true">⭐</span>
                <strong className="text-text-main font-medium">{d.sentiment_pct.toFixed(0)}%</strong> positive
              </span>
            )}
          </div>
        </div>
      </section>

      {/* KEY METRICS */}
      <h2 className="text-lg font-bold px-4 md:px-6 xl:px-10 mt-6 mb-4 flex items-center gap-2">
        <span className="text-secondary text-base" aria-hidden="true">📊</span>
        Key Metrics
      </h2>
      <div className="grid gap-4 px-4 md:px-6 xl:px-10 pb-8 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {d.review_count != null && (
          <MetricCard
            icon="⭐"
            iconClass="bg-status-pos/10 text-status-pos"
            label="Reviews"
            value={fmt(d.review_count)}
            context={
              <>
                {velocityPerDay != null && (
                  <>
                    <strong className="text-status-pos font-medium">{velocityPerDay.toFixed(1)}/day</strong> pace.{" "}
                  </>
                )}
                {d.sentiment_pct != null && <>{d.sentiment_pct.toFixed(0)}% positive review ratio.</>}
              </>
            }
          />
        )}
        {d.peak_ccu != null && d.peak_ccu > 0 && (
          <MetricCard
            icon="🎮"
            iconClass="bg-status-info/10 text-status-info"
            label="Peak CCU"
            value={fmt(d.peak_ccu)}
            context={
              d.current_ccu != null ? (
                <>
                  Current: <strong className="text-status-pos font-medium">{fmt(d.current_ccu)}</strong> concurrent players
                  {d.days_since_launch != null && d.days_since_launch > 7 ? " (past typical 7-day decay window)" : ""}.
                </>
              ) : (
                <>Peak concurrent players to date.</>
              )
            }
          />
        )}
        {d.youtube && d.youtube.video_count > 0 && (
          <MetricCard
            icon="▶"
            iconClass="bg-status-neg/10 text-status-neg"
            label="YouTube Coverage"
            value={`${d.youtube.video_count} video${d.youtube.video_count === 1 ? "" : "s"}`}
            context={
              <>
                {d.youtube.channels.slice(0, 3).map((c, i) => (
                  <span key={c.channel_id}>
                    {c.name} ({fmtSubs(c.subscriber_count ?? 0)} subs)
                    {i < Math.min(2, d.youtube!.channels.length - 1) ? ", " : ""}
                  </span>
                ))}
                . Combined reach: <strong className="text-status-pos font-medium">{fmtSubs(d.youtube.total_views)} views</strong>.
              </>
            }
          />
        )}
        {d.price_usd != null && (
          <MetricCard
            icon="💰"
            iconClass="bg-secondary/10 text-secondary"
            label="Price Tier"
            value={priceDisplay}
            context={
              <>
                {priceMod.label} tier. Review modifier: <span className="text-status-warn">{priceMod.multiplier}</span>.
              </>
            }
          />
        )}
        {d.demo && (
          <MetricCard
            icon="🕹"
            iconClass="bg-status-special/10 text-status-special"
            label="Demo Performance"
            value={`${d.demo.score_pct.toFixed(0)}%`}
            context={
              <>
                <strong className="text-text-main font-medium">{fmt(d.demo.review_count)} demo reviews</strong> at {d.demo.score_pct.toFixed(0)}% positive.{" "}
                {d.demo.score_pct >= 85 ? "Conversion signal strong." : "Moderate conversion signal."}
              </>
            }
          />
        )}
        {velocityPerDay != null && d.days_since_launch != null && (
          <MetricCard
            icon="⏱"
            iconClass="bg-status-warn/10 text-status-warn"
            label="Launch Velocity"
            value={`${velocityPerDay.toFixed(1)}/day`}
            context={
              <>
                Average reviews per day across first {d.days_since_launch} days.
                Week 1 median is 1.14/day —{" "}
                <strong className="text-status-pos font-medium">{(velocityPerDay / 1.14).toFixed(1)}x baseline</strong>.
              </>
            }
          />
        )}
      </div>

      {/* SIGNAL EVIDENCE */}
      {evidence.length > 0 && (
        <section className="px-4 md:px-6 xl:px-10 pb-8" aria-label="Signal evidence">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span className="text-secondary" aria-hidden="true">🔍</span>
              Signal Evidence
            </h2>
            <span className="font-mono text-xs text-text-dim bg-white/[0.03] border border-border-dark rounded-full px-3 py-0.5">
              {evidence.length} of 5 signals available
            </span>
          </div>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
            {evidence.map((ev, i) => (
              <EvidenceCard
                key={i}
                num={i + 1}
                type={ev.type}
                title={ev.title}
                body={ev.body}
                confidence={ev.confidence}
              />
            ))}
          </div>
        </section>
      )}

      {/* OPS ANATOMY */}
      {ops && ops.components.length > 0 && (
        <section className="px-4 md:px-6 xl:px-10 pb-8" aria-label="OPS score breakdown">
          <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
            <span className="text-secondary" aria-hidden="true">🧬</span>
            OPS Anatomy
          </h2>
          <p className="text-sm text-text-mid mb-5 max-w-xl">
            How each component contributes to {d.title}'s OPS of {Math.round(opsScore)}. Bars show value relative to maximum cap.
          </p>
          <div className="flex flex-col gap-4 max-w-2xl" role="list">
            {ops.components.map((c) => (
              <AnatomyBar key={c.key} component={c} />
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-border-dark flex items-center gap-4 text-sm flex-wrap max-w-2xl">
            <span className="text-text-mid font-semibold">Final Score</span>
            <span className={`font-mono text-xl font-semibold ${tone.text}`}>{Math.round(opsScore)}</span>
            <span className="font-mono text-xs text-text-dim bg-white/[0.03] px-3 py-0.5 rounded-sm border border-border-dark">
              {ops.components.filter((c) => c.value != null).length}/{ops.components.length} components active
            </span>
          </div>
        </section>
      )}

      {/* TRAJECTORY CHART */}
      {chartData.length >= 2 && (
        <section className="px-4 md:px-6 xl:px-10 pb-8" aria-label="OPS trajectory">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span className="text-secondary" aria-hidden="true">📈</span>
            OPS Trajectory
          </h2>
          <div className="bg-surface-dark border border-border-dark rounded-lg p-5 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                <defs>
                  <linearGradient id="opsTrajectoryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5ec269" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#5ec269" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#2a2420" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="day" stroke="#6b6058" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="#6b6058" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1c",
                    border: "1px solid #2a2420",
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: "JetBrains Mono",
                  }}
                  labelStyle={{ color: "#a09080" }}
                  itemStyle={{ color: "#5ec269" }}
                  formatter={(v) => [typeof v === "number" ? v.toFixed(1) : String(v), "OPS"] as [string, string]}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#5ec269"
                  strokeWidth={2.5}
                  fill="url(#opsTrajectoryGrad)"
                  dot={{ fill: "#5ec269", r: 3 }}
                  activeDot={{ r: 5, fill: "#5ec269", stroke: "#111314", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* PREVIOUS PICKS */}
      {d.previous_picks.length > 0 && (
        <section className="px-4 md:px-6 xl:px-10 pb-12" aria-label="Previous radar picks">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span className="text-secondary" aria-hidden="true">📜</span>
            Previous Picks
          </h2>
          <div className="flex flex-col gap-2" role="list">
            {d.previous_picks.slice(0, 5).map((pick, i) => (
              <PickRow key={pick.appid} pick={pick} rank={i + 2} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
