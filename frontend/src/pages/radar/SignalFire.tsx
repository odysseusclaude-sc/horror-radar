import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchOne } from "../../api/client";
import { useWatchlist } from "../../hooks/useWatchlist";
import type { RadarPickResponse } from "../../types";

// ─── Helpers ───────────────────────────────────────────────────
function fmt(n: number): string { return n.toLocaleString(); }
function fmtSubs(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

function opsColor(score: number): string {
  if (score >= 60) return "text-status-pos";
  if (score >= 30) return "text-status-warn";
  return "text-status-neg";
}
function opsGlyph(score: number): string {
  if (score >= 60) return "▲";
  if (score >= 30) return "◆";
  return "▼";
}
function opsTier(score: number): string {
  if (score >= 60) return "BREAKOUT";
  if (score >= 30) return "WATCH";
  return "COLD";
}

function sentimentLabel(pct: number): string {
  if (pct >= 90) return "Exceptional";
  if (pct >= 80) return "Very Positive";
  if (pct >= 70) return "Positive";
  if (pct >= 50) return "Mixed";
  return "Negative";
}

function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getWeekRange(d: Date): { start: string; end: string } {
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmtDate = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { start: fmtDate(mon), end: fmtDate(sun) };
}

function buildVerdict(d: RadarPickResponse): string {
  const parts: string[] = [];
  if (d.review_count != null) parts.push(`${fmt(d.review_count)} reviews`);
  if (d.sentiment_pct != null) parts.push(`${d.sentiment_pct.toFixed(0)}% positive`);

  if (d.youtube && d.youtube.video_count > 0) {
    const biggest = d.youtube.largest_subscriber_count;
    if (biggest != null && biggest >= 1_000_000) parts.push(`Major creator coverage (${fmtSubs(biggest)} subs)`);
    else if (biggest != null && biggest >= 500_000) parts.push("Mid-tier creator attention");
    else parts.push("No major creators yet");
  } else {
    parts.push("No YouTube coverage yet");
  }

  const isAccelerating = d.velocity_7d != null && d.velocity_prev_7d != null && d.velocity_7d > d.velocity_prev_7d;
  const isDecaying = d.velocity_7d != null && d.velocity_prev_7d != null && d.velocity_7d < d.velocity_prev_7d * 0.7;

  if (isAccelerating) {
    return `${parts.join(". ")}. ${d.title} found its audience on its own — and it's still accelerating.`;
  } else if (isDecaying) {
    return `${parts.join(". ")}. ${d.title} spiked hard at launch and numbers are settling — but the floor is still high.`;
  }
  return `${parts.join(". ")}. ${d.title} is holding steady — sustained interest without a single breakout catalyst.`;
}

// ─── Component ──────────────────────────────────────────────────
export default function SignalFire() {
  const navigate = useNavigate();
  const [data, setData] = useState<RadarPickResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisit, setLastVisit] = useState<Date | null>(null);
  const { isWatched, toggle: toggleWatch } = useWatchlist();

  useEffect(() => {
    const stored = localStorage.getItem("horror-radar-last-visit");
    if (stored) setLastVisit(new Date(stored));
    localStorage.setItem("horror-radar-last-visit", new Date().toISOString());
  }, []);

  useEffect(() => {
    fetchOne<RadarPickResponse>("/radar-pick")
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
          <Link to="/browse" className="font-mono text-[11px] text-status-warn tracking-[1.5px] mt-4 inline-block hover:underline">
            BROWSE ALL GAMES →
          </Link>
        </div>
      </div>
    );
  }

  const d = data;
  const now = new Date();
  const weekNum = getISOWeek(now);
  const year = now.getFullYear();
  const weekRange = getWeekRange(now);

  // Evidence strip: up to 4 inline metrics
  const evidenceItems: { label: string; value: string; sub: string }[] = [];
  if (d.velocity_per_day != null) {
    const sub = d.velocity_7d != null && d.velocity_prev_7d != null && d.velocity_prev_7d > 0
      ? `+${(d.velocity_7d / d.velocity_prev_7d).toFixed(1)}× prev week`
      : d.velocity_7d != null ? `${fmt(d.velocity_7d)}/7d` : "";
    evidenceItems.push({ label: "Velocity", value: `${d.velocity_per_day.toFixed(1)}/day`, sub });
  }
  if (d.sentiment_pct != null) {
    evidenceItems.push({ label: "Sentiment", value: `${d.sentiment_pct.toFixed(0)}%`, sub: sentimentLabel(d.sentiment_pct) });
  }
  if (d.youtube != null) {
    const creatorSub = d.youtube.largest_subscriber_count
      ? `Max ${fmtSubs(d.youtube.largest_subscriber_count)} subs`
      : "No major creators";
    evidenceItems.push({ label: "Creators", value: String(d.youtube.video_count), sub: creatorSub });
  }
  if (d.peak_ccu != null && d.peak_ccu > 0) {
    const ccuSub = d.current_ccu != null ? `→ ${fmt(d.current_ccu)} now` : "";
    evidenceItems.push({ label: "Peak CCU", value: fmt(d.peak_ccu), sub: ccuSub });
  }

  const ops = d.ops;
  const scoreColor = ops ? opsColor(ops.score) : "text-text-dim";
  const runners = d.previous_picks.slice(0, 4);

  return (
    <>
      {/* Since-last-visit band */}
      {lastVisit && (
        <div className="bg-primary/[0.08] border-b border-primary/20 px-10 py-2.5 flex justify-between items-center text-sm">
          <div className="flex items-center gap-3.5">
            <span className="font-mono text-[10px] tracking-[2px] text-primary px-2 py-0.5 bg-primary/15 border border-primary/30 rounded-[3px]">
              SINCE YOUR LAST VISIT
            </span>
            <span className="text-text-mid">
              Last visited{" "}
              <strong className="text-text-main">
                {lastVisit.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </strong>
            </span>
          </div>
          <Link to="/browse" className="font-mono text-[11px] text-status-warn tracking-[1px] hover:underline">
            BROWSE ALL →
          </Link>
        </div>
      )}

      {/* Hero */}
      <section className="relative py-14 px-10 border-b border-border-dark overflow-hidden" aria-labelledby="radar-title">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ background: "linear-gradient(180deg, #241010 0%, rgba(36,16,16,0.3) 60%, #111314 100%)", opacity: 0.6 }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ backgroundImage: "radial-gradient(circle at 75% 30%, rgba(128,38,38,0.25) 0%, transparent 60%)" }}
        />

        <div className="relative max-w-[1120px] mx-auto grid grid-cols-1 md:grid-cols-[1fr_300px] gap-8 md:gap-16 items-end">
          {/* Left: text */}
          <div>
            <div className="font-mono text-[11px] tracking-[3px] text-primary mb-[18px] flex items-center gap-2.5">
              <span
                className="w-2 h-2 bg-primary rounded-full flex-shrink-0"
                style={{ boxShadow: "0 0 0 4px rgba(128,38,38,0.25)" }}
                aria-hidden="true"
              />
              Radar Pick · Week {weekNum}, {year} · {weekRange.start} – {weekRange.end}
            </div>

            <h1
              id="radar-title"
              className="font-serif text-[52px] md:text-[76px] font-bold leading-none tracking-[-2px] mb-3.5"
            >
              {d.title}
            </h1>

            <div className="font-mono text-[11px] text-text-dim tracking-[2px] uppercase mb-6">
              {d.developer ?? "Unknown"} · {d.price_usd != null && d.price_usd > 0 ? `$${d.price_usd.toFixed(2)}` : "Free"} · Day {d.days_since_launch ?? "?"}
            </div>

            <p className="font-serif italic text-[18px] md:text-[20px] leading-[1.55] text-text-main/90 max-w-[620px] mb-8">
              {buildVerdict(d)}
            </p>

            {/* Evidence strip */}
            {evidenceItems.length > 0 && (
              <div className="flex flex-wrap gap-7 py-4 border-y border-primary/20 max-w-[700px]">
                {evidenceItems.map((item) => (
                  <div key={item.label} className="flex flex-col gap-1">
                    <span className="font-display text-[10px] tracking-[1.5px] uppercase text-text-mid font-semibold">
                      {item.label}
                    </span>
                    <span className="font-mono text-[22px] font-bold text-text-main leading-tight">
                      {item.value}
                    </span>
                    {item.sub && (
                      <span className="font-mono text-[10px] text-status-pos">{item.sub}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* CTA row */}
            <div className="flex flex-wrap gap-[18px] mt-7 items-center">
              <a
                href={`https://store.steampowered.com/app/${d.appid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs tracking-[1.5px] uppercase py-3 px-5 rounded-md bg-primary text-white font-bold hover:bg-[#9a3333] transition-colors"
              >
                ▸ Open on Steam
              </a>
              <Link
                to={`/game/${d.appid}`}
                className="font-mono text-xs tracking-[1.5px] uppercase py-3 px-5 rounded-md border border-border-dark text-text-mid font-bold hover:text-text-main hover:border-text-dim transition-colors"
              >
                Full signal trace →
              </Link>
              <button
                onClick={() => toggleWatch(d.appid)}
                className="font-mono text-xs tracking-[1.5px] uppercase py-3 px-5 rounded-md border border-border-dark text-text-mid font-bold hover:text-text-main hover:border-text-dim transition-colors"
              >
                {isWatched(d.appid) ? "★ In watchlist" : "☆ Add to watchlist"}
              </button>
            </div>
          </div>

          {/* Right: OPS badge */}
          {ops && (
            <div
              className="flex flex-col items-center gap-2 rounded-[10px] text-center border border-primary/40 backdrop-blur-md self-center md:self-end"
              style={{ background: "rgba(30,20,20,0.75)", padding: "22px 28px" }}
            >
              <span className={`text-[20px] font-bold ${scoreColor}`} aria-label={opsTier(ops.score)}>
                {opsGlyph(ops.score)} {opsTier(ops.score)}
              </span>
              <span className={`font-mono font-bold leading-[0.9] ${scoreColor}`} style={{ fontSize: 72 }}>
                {Math.round(ops.score)}
              </span>
              <span className="font-mono text-[10px] tracking-[2.5px] text-text-dim uppercase">
                OPS / 100
              </span>
              {ops.delta_14d != null && ops.delta_14d !== 0 && (
                <span className={`font-mono text-xs ${ops.delta_14d > 0 ? "text-status-pos" : "text-status-neg"}`}>
                  {ops.delta_14d > 0 ? "+" : ""}{ops.delta_14d.toFixed(0)} · 14 days
                </span>
              )}
              {ops.percentile != null && (
                <div className="font-display text-[11px] text-text-mid mt-2 pt-2 border-t border-border-dark w-full text-center">
                  top {(100 - ops.percentile).toFixed(0)}% of horror this quarter
                </div>
              )}
              <Link
                to={`/game/${d.appid}`}
                className="font-mono text-[10px] text-status-warn underline tracking-[1px] mt-1"
              >
                ⓘ what this means
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Runners-up */}
      {runners.length > 0 && (
        <section className="py-14 px-10 max-w-[1200px] mx-auto" aria-labelledby="runners-title">
          <p className="font-mono text-[11px] tracking-[3px] text-primary uppercase mb-2">
            Also on the radar
          </p>
          <h2 id="runners-title" className="font-serif text-[32px] font-bold mb-2.5 tracking-[-0.5px]">
            More to watch this week
          </h2>
          <p className="text-[15px] text-text-mid mb-9 max-w-[640px] leading-[1.55]">
            Other games in the breakout window with distinct signal patterns. Click any card for a full signal trace.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {runners.map((pick) => {
              const pickOps = pick.ops_now ?? pick.ops_at_pick;
              const pickColor = pickOps != null ? opsColor(pickOps) : "text-text-dim";
              const pickGlyph = pickOps != null ? opsGlyph(pickOps) : "—";

              const badge =
                pick.status === "climbing"
                  ? { label: "CLIMBING", cls: "bg-status-pos/10 text-status-pos border border-status-pos/30" }
                  : pick.status === "peaked"
                  ? { label: "PEAKED", cls: "bg-status-warn/10 text-status-warn border border-status-warn/30" }
                  : { label: "STEADY", cls: "bg-surface-dark text-text-dim border border-border-dark" };

              const evidenceText =
                pick.reviews_at_pick != null && pick.reviews_30d != null
                  ? `${pick.reviews_at_pick.toLocaleString()} reviews at pick · ${pick.reviews_30d.toLocaleString()} at 30d`
                  : pick.reviews_at_pick != null
                  ? `${pick.reviews_at_pick.toLocaleString()} reviews at pick`
                  : pick.ops_at_pick != null
                  ? `OPS ${Math.round(pick.ops_at_pick)} at pick`
                  : null;

              return (
                <article
                  key={pick.appid}
                  className="bg-surface-dark border border-border-dark rounded-[10px] overflow-hidden grid grid-cols-[120px_1fr_80px] md:grid-cols-[180px_1fr_100px] cursor-pointer hover:border-primary/40 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-status-warn"
                  onClick={() => navigate(`/game/${pick.appid}`)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/game/${pick.appid}`)}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative min-h-[140px]"
                    style={{ background: "linear-gradient(135deg, #201010, #301818)" }}
                    aria-hidden="true"
                  >
                    <div
                      className="absolute inset-0"
                      style={{ background: "radial-gradient(circle at 30% 40%, rgba(226,85,53,0.25) 0%, transparent 70%)" }}
                    />
                  </div>

                  {/* Body */}
                  <div className="p-[18px_20px]">
                    <div className="flex gap-2 mb-2.5">
                      <span className={`font-mono text-[9px] tracking-[1.5px] px-2 py-0.5 rounded-[3px] font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="font-display text-lg font-bold mb-1 text-text-main">{pick.title}</div>
                    {evidenceText && (
                      <div className="text-[13px] leading-[1.55] text-text-mid italic mt-2">
                        {evidenceText}
                      </div>
                    )}
                  </div>

                  {/* OPS col */}
                  <div className="bg-[#1f1f22] flex flex-col items-center justify-center py-4 px-2 border-l border-border-dark">
                    <span className={`text-xs font-bold ${pickColor}`}>{pickGlyph}</span>
                    <span className={`font-mono text-[34px] font-bold leading-none my-1 ${pickColor}`}>
                      {pickOps != null ? Math.round(pickOps) : "—"}
                    </span>
                    <span className="font-mono text-[9px] tracking-[2px] text-text-dim">OPS</span>
                    <span className="font-mono text-[10px] text-text-dim mt-1.5 capitalize">{pick.status}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Below strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-12 px-10 max-w-[1200px] mx-auto border-t border-border-dark">
        <div className="bg-surface-dark border border-border-dark rounded-lg p-7">
          <h3 className="font-serif text-[22px] font-bold mb-2.5">Browse all games</h3>
          <p className="text-sm text-text-mid mb-4 leading-[1.55]">
            The full tracker — dense table view with filters on release date, price, subgenre,
            and YouTube coverage. For when you already know what you're looking for.
          </p>
          <Link to="/browse" className="font-mono text-xs text-status-warn tracking-[1.5px] hover:underline">
            OPEN BROWSE →
          </Link>
        </div>
        <div className="bg-surface-dark border border-border-dark rounded-lg p-7">
          <h3 className="font-serif text-[22px] font-bold mb-2.5">Market intelligence</h3>
          <p className="text-sm text-text-mid mb-4 leading-[1.55]">
            Subgenre momentum, price-tier performance, demo cohort analysis. For weekly strategic
            reads, not per-game scouting.
          </p>
          <Link to="/trends" className="font-mono text-xs text-status-warn tracking-[1.5px] hover:underline">
            OPEN MARKET →
          </Link>
        </div>
      </div>
    </>
  );
}
