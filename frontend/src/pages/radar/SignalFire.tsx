/**
 * Concept B — "Signal Fire"
 *
 * Intelligence briefing: alert banner, metric tiles with editorial
 * subtexts, numbered evidence blocks, OPS anatomy with component cards.
 * Now wired to the real `/radar-pick` endpoint.
 */
import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip,
} from "recharts";
import { fetchOne } from "../../api/client";
import type { RadarPickResponse, RadarOpsComponent } from "../../types";

// ─── Palette ────────────────────────────────────────────────────
const C = {
  bg: "#111314",
  surface: "#1a1a1c",
  tile: "#1f1f22",
  accent: "#802626",
  accentDim: "rgba(128,38,38,0.25)",
  text: "#e8e0d4",
  textMid: "#a09080",
  textDim: "#6b6058",
  textFaint: "#3d3530",
  border: "#2a2420",
  green: "#22c55e",
  amber: "#bb7125",
  greenDim: "#1a5c3a",
  amberDim: "#5c3a12",
};

const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const sans: React.CSSProperties = { fontFamily: "'Public Sans', sans-serif" };
const heading: React.CSSProperties = { fontFamily: "'Public Sans', sans-serif" };

// ─── Helpers ───────────────────────────────────────────────────
function fmt(n: number): string { return n.toLocaleString(); }
function fmtK(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n); }
/** Generate the italic verdict line from data signals. */
function buildVerdict(d: RadarPickResponse): string {
  const parts: string[] = [];

  if (d.review_count != null) parts.push(`${fmt(d.review_count)} reviews`);
  if (d.sentiment_pct != null) parts.push(`${d.sentiment_pct.toFixed(0)}% positive`);

  // Creator coverage insight
  if (d.youtube && d.youtube.video_count > 0) {
    const biggest = d.youtube.largest_subscriber_count;
    if (biggest != null && biggest >= 1_000_000) {
      parts.push(`Major creator coverage (${fmtSubs(biggest)} subs)`);
    } else if (biggest != null && biggest >= 500_000) {
      parts.push("Mid-tier creator attention");
    } else {
      parts.push("Zero major creators");
    }
  } else {
    parts.push("No YouTube coverage yet");
  }

  // Trajectory statement
  const isAccelerating = d.velocity_7d != null && d.velocity_prev_7d != null && d.velocity_7d > d.velocity_prev_7d;
  const isDecaying = d.velocity_7d != null && d.velocity_prev_7d != null && d.velocity_7d < d.velocity_prev_7d * 0.7;

  if (isAccelerating) {
    return `${parts.join(". ")}. ${d.title} found its audience on its own — and it's still accelerating.`;
  } else if (isDecaying) {
    return `${parts.join(". ")}. ${d.title} spiked hard at launch and the numbers are settling — but the floor is still high.`;
  } else {
    return `${parts.join(". ")}. ${d.title} is holding steady — sustained interest without a single breakout catalyst.`;
  }
}

function fmtSubs(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
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
  mon.setDate(d.getDate() - ((day + 6) % 7)); // Monday
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6); // Sunday
  const fmt = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { start: fmt(mon), end: fmt(sun) };
}

function sentimentLabel(pct: number): string {
  if (pct >= 90) return "Exceptional";
  if (pct >= 80) return "Very Positive";
  if (pct >= 70) return "Positive";
  if (pct >= 50) return "Mixed";
  return "Negative";
}

function priceLabel(price: number | null, reviewCount: number | null): string {
  if (price == null || price === 0) return "Free to Play";
  if (reviewCount != null && reviewCount > 500 && price < 10) return "Underpriced";
  if (price < 5) return "Budget";
  if (price < 15) return "Mid-range";
  return "Premium";
}

// ─── Tiny inline sparkline ──────────────────────────────────────
function MiniSpark({ data, color, width = 80, height = 28 }: { data: number[], color: string, width?: number, height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Evidence block type ───────────────────────────────────────
interface EvidenceBlock {
  signal: string;
  label: string;
  headline: string;
  body: ReactNode;
  artifact: ReactNode;
  artifactLabel: string;
}

// ─── Build evidence blocks from data ───────────────────────────
function buildEvidenceBlocks(d: RadarPickResponse): EvidenceBlock[] {
  const blocks: EvidenceBlock[] = [];
  let idx = 1;

  // Signal: Review Velocity
  if (d.velocity_7d != null && d.velocity_prev_7d != null && d.velocity_prev_7d > 0) {
    const multiplier = (d.velocity_7d / d.velocity_prev_7d).toFixed(1);
    const isAccelerating = d.velocity_7d > d.velocity_prev_7d;
    const velocityWord = isAccelerating ? "accelerating" : "decelerating";
    const rarity = parseFloat(multiplier) >= 2 ? "fewer than 5%" : parseFloat(multiplier) >= 1.5 ? "fewer than 15%" : "around 25%";

    blocks.push({
      signal: String(idx).padStart(2, "0"),
      label: "REVIEW VELOCITY",
      headline: isAccelerating ? "Acceleration, not just growth" : "Sustained momentum despite natural decay",
      body: (
        <>
          <Hl>{fmt(d.velocity_7d)}</Hl> new reviews in the last 7 days — {isAccelerating ? "up" : "down"} from{" "}
          <Hl>{fmt(d.velocity_prev_7d)}</Hl> the week before.
          That's a <Hl>{multiplier}x {isAccelerating ? "acceleration" : "retention"}</Hl>.
          Most horror releases lose 70-90% of their review velocity by week two. {d.title}'s
          velocity is <em>{velocityWord}</em>. This pattern appears in {rarity} of horror releases.
        </>
      ),
      artifact: d.velocity_spark.length >= 2
        ? <MiniSpark data={d.velocity_spark.map(v => v.value)} color={C.accent} width={100} height={32} />
        : null,
      artifactLabel: "Weekly velocity",
    });
    idx++;
  }

  // Signal: Organic Discovery / YouTube
  if (d.youtube && d.youtube.video_count > 0) {
    const yt = d.youtube;
    const coverageLevel = yt.video_count <= 3 ? "minimal" : yt.video_count <= 8 ? "growing" : "significant";
    const largestStr = yt.largest_subscriber_count ? fmtSubs(yt.largest_subscriber_count) : "unknown";
    const bigCreator = yt.largest_subscriber_count != null && yt.largest_subscriber_count >= 500000;

    blocks.push({
      signal: String(idx).padStart(2, "0"),
      label: "CREATOR COVERAGE",
      headline: bigCreator
        ? `Major creators are already watching`
        : `${coverageLevel.charAt(0).toUpperCase() + coverageLevel.slice(1)} creator interest with room to grow`,
      body: (
        <>
          <Hl>{yt.video_count} YouTube video{yt.video_count === 1 ? "" : "s"}</Hl> cover{" "}
          {d.title}. The largest creator has{" "}
          <Hl>{largestStr} subscribers</Hl>.
          {!bigCreator && <> No one above 500K has touched it yet. </>}
          {d.review_count != null && (
            <>
              {" "}<Hl>~{fmtK(d.review_count * 30)} copies</Hl> estimated
              {!bigCreator && " largely through organic Steam discovery"}.
            </>
          )}
          {bigCreator
            ? " Major creator coverage is already driving visibility — momentum is building from the top down."
            : " When the larger creators arrive, the second wave begins."}
        </>
      ),
      artifact: (
        <div style={{ ...mono, fontSize: 11, color: C.textDim, textAlign: "right" }}>
          <div>YT: <span style={{ color: C.accent }}>{yt.video_count}</span> videos</div>
          <div>Max: <span style={{ color: C.accent }}>{largestStr}</span> subs</div>
          {yt.total_views > 0 && <div>Views: <span style={{ color: C.accent }}>{fmtK(yt.total_views)}</span></div>}
        </div>
      ),
      artifactLabel: "Creator coverage",
    });
    idx++;
  }

  // Signal: Demo Conversion
  if (d.demo && d.sentiment_pct != null) {
    const sentimentLift = d.sentiment_pct - d.demo.score_pct;
    const hasLift = sentimentLift > 0;

    blocks.push({
      signal: String(idx).padStart(2, "0"),
      label: "DEMO CONVERSION",
      headline: hasLift
        ? "The full game overdelivered on the promise"
        : "Demo reception carried into launch",
      body: (
        <>
          Demo: <Hl>{fmt(d.demo.review_count)} reviews at {d.demo.score_pct.toFixed(0)}%</Hl>.
          Full game: <Hl>{d.sentiment_pct.toFixed(0)}%</Hl>.
          {hasLift && (
            <> A <Hl>{sentimentLift.toFixed(0)}-point sentiment lift</Hl> from demo to full release
            means the developers listened and delivered. </>
          )}
          {d.peak_ccu != null && (
            <>Peak CCU of <Hl>{fmt(d.peak_ccu)}</Hl></>
          )}
          {d.current_ccu != null && d.peak_ccu != null && (
            <> has settled to <Hl>{fmt(d.current_ccu)}</Hl> concurrent — a healthy long tail. </>
          )}
          {d.price_usd != null && d.price_usd > 0 && (
            <>At <Hl>${d.price_usd.toFixed(2)}</Hl>, {d.price_usd < 15 ? "this is competitively priced for its quality tier" : "priced at a confident premium"}.</>
          )}
        </>
      ),
      artifact: (
        <div style={{ ...mono, fontSize: 11, textAlign: "right" }}>
          <div style={{ color: C.textDim }}>Demo: <span style={{ color: C.amber }}>{d.demo.score_pct.toFixed(0)}%</span></div>
          <div style={{ color: C.textDim }}>Full: <span style={{ color: C.green }}>{d.sentiment_pct.toFixed(0)}%</span></div>
          {hasLift && <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>+{sentimentLift.toFixed(0)}pt lift</div>}
        </div>
      ),
      artifactLabel: "Sentiment",
    });
    idx++;
  }

  return blocks;
}

// ─── Inline highlight ──────────────────────────────────────────
function Hl({ children }: { children: ReactNode }) {
  return <span style={{ color: C.accent, fontWeight: 500 }}>{children}</span>;
}

// ─── OPS component calculation/example generator ───────────────
function getComponentCalcText(comp: RadarOpsComponent, d: RadarPickResponse): { calculation: string; example: string } {
  const v = comp.value;
  switch (comp.key) {
    case "velocity":
      return {
        calculation: "Rolling 3-day average of daily new reviews, divided by the expected median velocity for a horror game at this age. Week 1 baseline: 1.14 reviews/day. Week 2-4: 0.14/day. Month 2-3: 0.03/day.",
        example: d.velocity_per_day != null
          ? `${d.title} is averaging ${d.velocity_per_day.toFixed(1)} reviews/day at Day ${d.days_since_launch ?? "?"}. Normalized component value: ${v?.toFixed(2) ?? "N/A"}.`
          : `Component value: ${v?.toFixed(2) ?? "N/A"}.`,
      };
    case "decay":
      return {
        calculation: "Compares review velocity in weeks 2-4 against week 1. A ratio of 1.0 means no decay. Below 0.3 is a flash-in-the-pan. Above 1.0 means the game is accelerating.",
        example: v != null
          ? `Decay ratio: ${v.toFixed(2)} — ${v >= 0.8 ? "very strong retention" : v >= 0.5 ? "moderate retention" : "significant decay, typical of flash-in-the-pan releases"}.`
          : "Not enough data for decay calculation yet.",
      };
    case "reviews":
      return {
        calculation: "Total review count divided by the median for horror games in the same launch window. Multiplied by a price modifier (free: 0.6x, $5-10: 1.0x, $10-20: 1.15x, $20+: 1.3x).",
        example: d.review_count != null
          ? `${fmt(d.review_count)} reviews. Price modifier for $${d.price_usd?.toFixed(2) ?? "?"}: ${d.price_usd != null ? (d.price_usd < 5 ? "0.85x" : d.price_usd < 10 ? "1.0x" : d.price_usd < 20 ? "1.15x" : "1.3x") : "?"}. Component value: ${v?.toFixed(2) ?? "N/A"}.`
          : `Component value: ${v?.toFixed(2) ?? "N/A"}.`,
      };
    case "youtube":
      return {
        calculation: "Best-performing video's views-to-subscriber ratio, normalized against the median ratio of 0.074x. Plus channel breadth: how many unique creators covered it, out of 10. 60/40 split between ratio quality and breadth.",
        example: d.youtube
          ? `${d.youtube.video_count} video${d.youtube.video_count === 1 ? "" : "s"} from ${d.youtube.channels.length} creator${d.youtube.channels.length === 1 ? "" : "s"}. ${d.youtube.total_views > 0 ? `Total views: ${fmtK(d.youtube.total_views)}.` : ""} Component value: ${v?.toFixed(2) ?? "N/A"}.`
          : `Component value: ${v?.toFixed(2) ?? "N/A"}.`,
      };
    case "ccu":
      return {
        calculation: "Peak concurrent players divided by the peer median CCU, multiplied by an age-decay factor that falls linearly to 0 by day 14. After launch fortnight this component drops out entirely.",
        example: d.peak_ccu != null
          ? `Peak CCU ${fmt(d.peak_ccu)}${d.current_ccu != null ? `, currently ${fmt(d.current_ccu)}` : ""}. Component value: ${v?.toFixed(2) ?? "N/A"}.`
          : `Component value: ${v?.toFixed(2) ?? "N/A"}.`,
      };
    case "sentiment":
      return {
        calculation: "Current review score percentage scaled by a post-launch trend multiplier. Delta vs day 7: ≥+5pt → 1.30x, flat → 1.00x, mild drop → 0.85x, steep drop → 0.65x. Requires at least 10 reviews.",
        example: d.sentiment_pct != null
          ? `Current sentiment: ${d.sentiment_pct.toFixed(0)}%. Component value: ${v?.toFixed(2) ?? "N/A"}.`
          : `Component value: ${v?.toFixed(2) ?? "N/A"}.`,
      };
    case "twitch":
      return {
        calculation: "Peak Twitch viewers over the past 7 days divided by the peer median (capped at 5x), plus a streamer breadth bonus: min(1, unique_streamers/5) x 2. Weighted 70/30 between viewer ratio and breadth.",
        example: v != null
          ? `Twitch component: ${v.toFixed(2)} — ${v >= 2 ? "strong broadcast attention" : v >= 1 ? "meaningful streamer interest" : "minimal Twitch footprint"}.`
          : "No Twitch activity recorded in the past 7 days.",
      };
    default:
      return { calculation: "", example: `Component value: ${v?.toFixed(2) ?? "N/A"}.` };
  }
}

// ─── Component ──────────────────────────────────────────────────
export default function SignalFire() {
  const navigate = useNavigate();
  const [data, setData] = useState<RadarPickResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOne<RadarPickResponse>("/radar-pick")
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...mono, fontSize: 12, color: C.textDim, letterSpacing: 2 }}>SCANNING SIGNALS...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ ...mono, fontSize: 12, color: C.textDim, letterSpacing: 2, marginBottom: 8 }}>NO SIGNAL</div>
          <div style={{ ...sans, fontSize: 14, color: C.textMid }}>{error ?? "No radar pick available this week."}</div>
        </div>
      </div>
    );
  }

  const d = data;
  const now = new Date();
  const weekNum = getISOWeek(now);
  const year = now.getFullYear();
  const weekRange = getWeekRange(now);
  const evidenceBlocks = buildEvidenceBlocks(d);
  const activeComponents = d.ops?.components.filter(c => c.value != null) ?? [];

  // Metric tiles — only include those with data
  const tiles: { label: string; value: string; sub: string; subColor: string }[] = [];
  if (d.review_count != null) {
    const velSub = d.velocity_7d != null ? `+${fmt(d.velocity_7d)} this week` : "";
    tiles.push({ label: "REVIEWS", value: fmt(d.review_count), sub: velSub, subColor: C.green });
  }
  if (d.sentiment_pct != null) {
    tiles.push({ label: "SENTIMENT", value: `${d.sentiment_pct.toFixed(0)}%`, sub: sentimentLabel(d.sentiment_pct), subColor: d.sentiment_pct >= 80 ? C.green : d.sentiment_pct >= 60 ? C.amber : C.accent });
  }
  if (d.velocity_per_day != null) {
    const medianSub = d.velocity_prev_7d != null && d.velocity_prev_7d > 0
      ? `${(d.velocity_7d! / d.velocity_prev_7d).toFixed(1)}x prev week`
      : "";
    tiles.push({ label: "VELOCITY", value: `${d.velocity_per_day.toFixed(1)}/d`, sub: medianSub, subColor: C.accent });
  }
  if (d.review_count != null) {
    const estOwners = d.review_count * 30;
    tiles.push({ label: "EST. OWNERS", value: `~${fmtK(estOwners)}`, sub: "reviews × 30", subColor: C.textDim });
  }
  if (d.peak_ccu != null) {
    const ccuSub = d.current_ccu != null ? `${d.current_ccu} current` : "";
    tiles.push({ label: "PEAK CCU", value: fmt(d.peak_ccu), sub: ccuSub, subColor: C.textDim });
  }
  if (d.price_usd != null) {
    tiles.push({ label: "PRICE", value: d.price_usd > 0 ? `$${d.price_usd.toFixed(2)}` : "Free", sub: priceLabel(d.price_usd, d.review_count), subColor: C.accent });
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text }}>

      {/* ═══ SECTION 1: ALERT BANNER ═══ */}
      <section style={{
        position: "sticky", top: 56, zIndex: 40,
        background: `${C.surface}ee`, backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
        padding: "12px 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: "100%",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", width: 8, height: 8 }}>
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%", background: C.accent,
              animation: "signal-pulse 4s ease-in-out infinite",
            }} />
            <style>{`
              @keyframes signal-pulse {
                0%, 100% { opacity: 0.4; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.5); }
              }
            `}</style>
          </div>
          <span style={{ ...mono, fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", color: C.textDim }}>
            Radar Pick — Week {weekNum}, {year} · {weekRange.start} – {weekRange.end}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ ...heading, fontSize: 20, fontWeight: 700 }}>{d.title}</span>
          {d.developer && <span style={{ ...sans, fontSize: 13, color: C.textDim }}>by {d.developer}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {d.ops && (
            <>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: d.ops.score >= 60 ? C.greenDim : d.ops.score >= 30 ? C.amberDim : `${C.accent}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: "#fff" }}>{Math.round(d.ops.score)}</span>
              </div>
              {d.ops.delta_14d != null && d.ops.delta_14d !== 0 && (
                <span style={{ ...mono, fontSize: 11, color: d.ops.delta_14d > 0 ? C.green : C.accent }}>
                  {d.ops.delta_14d > 0 ? "+" : ""}{d.ops.delta_14d.toFixed(0)}
                </span>
              )}
            </>
          )}
        </div>
      </section>

      {/* ═══ SECTION 1B: HERO ═══ */}
      <section style={{ position: "relative", height: "70vh", minHeight: 420, overflow: "hidden" }}>
        {/* Background image */}
        {d.header_image_url && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${d.header_image_url})`,
            backgroundSize: "cover", backgroundPosition: "center",
            filter: "saturate(0.6) brightness(0.5)",
          }} />
        )}
        {/* Gradient overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, transparent 10%, ${C.bg}ee 65%, ${C.bg} 100%)`,
        }} />
        {/* Grain texture */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04, mixBlendMode: "overlay",
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }} />

        {/* Hero content */}
        <div style={{
          position: "relative", height: "100%", maxWidth: 1100, margin: "0 auto",
          padding: "0 40px", display: "flex", flexDirection: "column", justifyContent: "flex-end",
          paddingBottom: 48,
        }}>
          <div style={{ ...mono, fontSize: 11, color: C.accent, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 16, opacity: 0.8 }}>
            Radar Pick — Week {weekNum}, {year} · {weekRange.start} – {weekRange.end}
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 64, fontWeight: 700, lineHeight: 1.05, margin: 0, letterSpacing: -1,
          }}>
            {d.title}
          </h1>
          <div style={{ ...mono, fontSize: 11, color: C.textDim, marginTop: 8, textTransform: "uppercase", letterSpacing: 2 }}>
            {d.developer ?? "Unknown"} · {d.price_usd != null && d.price_usd > 0 ? `$${d.price_usd.toFixed(2)}` : "Free"} · Day {d.days_since_launch ?? "?"}
          </div>
          <p style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 20, fontStyle: "italic", lineHeight: 1.6, maxWidth: 640,
            marginTop: 20, color: `${C.text}cc`,
          }}>
            {buildVerdict(d)}
          </p>

          {/* OPS Badge — bottom right */}
          {d.ops && (
            <div style={{
              position: "absolute", bottom: 48, right: 40,
              display: "flex", flexDirection: "column", alignItems: "center",
              border: `1px solid ${C.accentDim}`, borderRadius: 10, padding: "16px 24px",
              background: `${C.bg}cc`, backdropFilter: "blur(8px)",
            }}>
              <div style={{ ...mono, fontSize: 44, fontWeight: 700, color: C.accent, lineHeight: 1 }}>
                {Math.round(d.ops.score)}
              </div>
              <div style={{ ...mono, fontSize: 9, color: C.textDim, letterSpacing: 2, marginTop: 4 }}>
                OPS SCORE
              </div>
              {d.ops.delta_14d != null && d.ops.delta_14d !== 0 && (
                <div style={{ ...mono, fontSize: 11, color: C.accent, marginTop: 6 }}>
                  {d.ops.delta_14d > 0 ? "+" : ""}{d.ops.delta_14d.toFixed(0)} pts / 14d
                </div>
              )}
            </div>
          )}
        </div>
        {/* Bottom rule */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: `${C.accent}33` }} />
      </section>

      {/* ═══ SECTION 2: METRIC TILES ═══ */}
      {tiles.length > 0 && (
        <section style={{
          maxWidth: 1100, margin: "0 auto", padding: "28px 40px",
          display: "grid", gridTemplateColumns: `repeat(${Math.min(tiles.length, 6)}, 1fr)`, gap: 20,
          borderBottom: `1px solid ${C.border}`,
        }}>
          {tiles.map(m => (
            <div key={m.label} style={{ borderLeft: `2px solid ${C.accent}33`, paddingLeft: 12 }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: 2, color: C.textDim, marginBottom: 4 }}>{m.label}</div>
              <div style={{ ...mono, fontSize: 18, fontWeight: 600, lineHeight: 1 }}>{m.value}</div>
              {m.sub && <div style={{ ...mono, fontSize: 10, color: m.subColor, marginTop: 4 }}>{m.sub}</div>}
            </div>
          ))}
        </section>
      )}

      {/* ═══ SECTION 3: EVIDENCE BLOCKS ═══ */}
      {evidenceBlocks.length > 0 && (
        <section style={{ maxWidth: 780, margin: "0 auto", padding: "64px 40px 0" }}>
          {evidenceBlocks.map((ev, i) => (
            <div key={i} style={{
              paddingBottom: 40, marginBottom: 40,
              borderBottom: i < evidenceBlocks.length - 1 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: 2.5, color: C.accent, marginBottom: 8, opacity: 0.8 }}>
                    SIGNAL {ev.signal} — {ev.label}
                  </div>
                  <h3 style={{ ...heading, fontSize: 18, fontWeight: 600, margin: "0 0 12px", lineHeight: 1.3 }}>
                    {ev.headline}
                  </h3>
                  <p style={{ ...sans, fontSize: 14, lineHeight: 1.75, color: `${C.text}aa`, margin: 0, maxWidth: 580 }}>
                    {ev.body}
                  </p>
                </div>
                <div style={{ marginLeft: 32, flexShrink: 0, textAlign: "right", minWidth: 100 }}>
                  {ev.artifact}
                  <div style={{ ...mono, fontSize: 8, color: C.textFaint, marginTop: 4, letterSpacing: 1 }}>
                    {ev.artifactLabel}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ═══ SECTION 4: OPS ANATOMY ═══ */}
      {d.ops && activeComponents.length > 0 && (
        <section style={{ maxWidth: 780, margin: "0 auto", padding: "64px 40px 0" }}>
          {/* Section divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
            <div style={{ height: 1, flex: 1, background: `linear-gradient(to right, ${C.accent}66, ${C.accent}00)` }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 6, height: 6, background: C.accent, borderRadius: 1, transform: "rotate(45deg)" }} />
              <span style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.accent }}>
                Score Breakdown
              </span>
              <div style={{ width: 6, height: 6, background: C.accent, borderRadius: 1, transform: "rotate(45deg)" }} />
            </div>
            <div style={{ height: 1, flex: 1, background: `linear-gradient(to left, ${C.accent}66, ${C.accent}00)` }} />
          </div>

          <h2 style={{
            ...heading, fontSize: 28, fontWeight: 700, margin: "0 0 8px", color: C.text, letterSpacing: -0.5,
          }}>
            OPS Anatomy
          </h2>
          <p style={{ ...sans, fontSize: 14, lineHeight: 1.6, color: `${C.text}99`, margin: "0 0 28px", maxWidth: 620 }}>
            The Overperformance Score is a weighted composite of seven signals. Each measures a
            different axis of breakout potential. Here's exactly how {d.title}'s{" "}
            <span style={{ color: C.accent, fontWeight: 600 }}>{Math.round(d.ops.score)}</span> was calculated.
          </p>

          {/* Segmented bar overview */}
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 10, marginBottom: 32 }}>
            {activeComponents.map(comp => (
              <div key={comp.key} style={{ width: `${comp.weight * 100}%`, background: comp.color, opacity: 0.55 }} />
            ))}
          </div>

          {/* Detailed component cards */}
          {activeComponents.map(comp => {
            const pct = Math.min(100, (comp.value! / comp.max) * 100);
            const { calculation, example } = getComponentCalcText(comp, d);
            return (
              <div key={comp.key} style={{
                marginBottom: 28, padding: "20px 24px", background: C.tile,
                borderRadius: 8, borderLeft: `3px solid ${comp.color}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ ...mono, fontSize: 11, color: comp.color, fontWeight: 600, letterSpacing: 1.5 }}>
                      {comp.label}
                    </span>
                    <span style={{
                      ...mono, fontSize: 9, color: C.bg, background: comp.color, opacity: 0.8,
                      padding: "2px 7px", borderRadius: 3, fontWeight: 600,
                    }}>
                      {(comp.weight * 100).toFixed(0)}% weight
                    </span>
                  </div>
                  <span style={{ ...mono, fontSize: 18, color: comp.color, fontWeight: 700 }}>
                    {comp.value!.toFixed(2)}
                  </span>
                </div>

                <div style={{ height: 6, background: `${C.border}88`, borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                  <div style={{
                    width: `${pct}%`, height: "100%",
                    background: comp.color, opacity: 0.7, borderRadius: 3,
                  }} />
                </div>

                <div style={{
                  ...mono, fontSize: 11, color: `${C.text}cc`, marginBottom: 10,
                  padding: "8px 12px", background: `${C.bg}aa`, borderRadius: 4,
                  border: `1px solid ${C.border}`,
                }}>
                  <span style={{ color: C.textDim, fontSize: 9, letterSpacing: 1 }}>FORMULA </span>
                  {comp.formula}
                </div>

                <p style={{ ...sans, fontSize: 13, lineHeight: 1.65, color: `${C.text}88`, margin: "0 0 8px" }}>
                  {calculation}
                </p>

                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ ...mono, fontSize: 9, color: comp.color, marginTop: 2, flexShrink: 0, letterSpacing: 1 }}>
                    THIS GAME
                  </span>
                  <p style={{ ...sans, fontSize: 12, lineHeight: 1.6, color: C.textDim, margin: 0 }}>
                    {example}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Final score summary */}
          <div style={{
            marginTop: 8, padding: "20px 24px", background: C.tile,
            borderRadius: 8, border: `1px solid ${C.border}`,
          }}>
            <div style={{ ...mono, fontSize: 9, letterSpacing: 2, color: C.textDim, marginBottom: 10 }}>
              FINAL CALCULATION
            </div>
            <div style={{
              ...mono, fontSize: 11, color: `${C.text}cc`, padding: "10px 12px",
              background: `${C.bg}aa`, borderRadius: 4, border: `1px solid ${C.border}`,
              marginBottom: 12, lineHeight: 1.8,
            }}>
              raw_ops = weighted_sum(active_components) × coverage_penalty — NULL components redistribute weight<br />
              score = min(100, raw_ops × 24 × next_fest_multiplier)
            </div>
            <div style={{ ...mono, fontSize: 13, color: C.text }}>
              Score: <span style={{ color: C.accent, fontWeight: 700, fontSize: 16 }}>{Math.round(d.ops.score)}</span> / 100
              {d.ops.percentile != null && (
                <> — <span style={{ color: C.textMid }}>
                  top {(100 - d.ops.percentile).toFixed(0)}% of horror releases this quarter
                </span></>
              )}
            </div>
            <div style={{ ...mono, fontSize: 10, color: C.textDim, marginTop: 4 }}>
              Formula v5 · Peer window: 30-150 days · Minimum 20 baseline games · Next Fest bonus 1.10× (first 30d)
            </div>
          </div>
        </section>
      )}

      {/* ═══ SECTION 5: TRAJECTORY CHART ═══ */}
      {d.ops_history.length >= 2 && (
        <section style={{ maxWidth: 780, margin: "0 auto", padding: "48px 40px 0" }}>
          <div style={{ ...mono, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: C.textDim, marginBottom: 16 }}>
            Trajectory
          </div>
          <div style={{ height: 160, width: "100%" }}>
            <ResponsiveContainer>
              <AreaChart data={d.ops_history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="opsGradB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.accent} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={C.accent} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 9, fill: C.textDim } as any}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => v === 0 ? "Launch" : `D${v}`}
                />
                <YAxis hide domain={[0, 100]} />
                <ReferenceLine y={60} stroke={C.border} strokeDasharray="4 4" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const pt = payload[0].payload as { day: number; score: number };
                    return (
                      <div style={{
                        ...mono, background: C.tile, border: `1px solid ${C.border}`,
                        borderRadius: 6, padding: "8px 12px", fontSize: 11,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                      }}>
                        <div style={{ color: C.textDim, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          {pt.day === 0 ? "LAUNCH" : `DAY ${pt.day}`}
                        </div>
                        <div style={{ color: C.accent, fontWeight: 700, fontSize: 16 }}>
                          {Math.round(pt.score)}
                          <span style={{ color: C.textDim, fontWeight: 400, fontSize: 10, marginLeft: 4 }}>OPS</span>
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ stroke: `${C.accent}44`, strokeWidth: 1 }}
                />
                <Area
                  type="monotone" dataKey="score" stroke={C.accent}
                  strokeWidth={2} fill="url(#opsGradB)" dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...mono, fontSize: 10, color: C.textDim, marginTop: 6 }}>
            OPS trajectory since launch
            {d.ops?.delta_14d != null && d.ops.delta_14d !== 0 && (
              <> — {d.ops.delta_14d > 0 ? "+" : ""}{d.ops.delta_14d.toFixed(0)}-point change over 14 days</>
            )}
          </div>
        </section>
      )}

      {/* ═══ SECTION 6: PREVIOUS INTERCEPTS ═══ */}
      {d.previous_picks.length > 0 && (
        <section style={{ maxWidth: 780, margin: "0 auto", padding: "64px 40px 0" }}>
          <div style={{ ...mono, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: C.textDim, marginBottom: 16 }}>
            Other High Performers
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {d.previous_picks.map((pick, i) => {
              const statusColor = pick.status === "climbing" ? C.green : pick.status === "peaked" ? C.amber : C.textFaint;
              const statusLabel = pick.status === "climbing" ? "Still climbing" : pick.status === "peaked" ? "Peaked" : "Steady";
              const hasFollowthrough = pick.reviews_30d != null || pick.reviews_60d != null || pick.reviews_90d != null;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex", flexDirection: "column", gap: 4,
                    padding: "10px 0",
                    borderBottom: `1px solid ${C.border}`,
                    cursor: "pointer", transition: "background 0.15s",
                  }}
                  onClick={() => navigate(`/game/${pick.appid}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = C.tile)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ ...sans, fontSize: 14, fontWeight: 600, flex: 1, textDecoration: "underline", textDecorationColor: C.border, textUnderlineOffset: 2 }}>{pick.title}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, width: 110 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
                      <span style={{ ...mono, fontSize: 10, color: C.textDim }}>{statusLabel}</span>
                    </div>
                    <span style={{ ...mono, fontSize: 11, color: C.accent, width: 50, textAlign: "right" }}>
                      OPS {pick.ops_now != null ? Math.round(pick.ops_now) : Math.round(pick.ops_at_pick)}
                    </span>
                  </div>
                  {hasFollowthrough && (
                    <div style={{ display: "flex", gap: 20, paddingLeft: 0 }}>
                      {[
                        { label: "At pick", val: pick.reviews_at_pick },
                        { label: "+30d", val: pick.reviews_30d },
                        { label: "+60d", val: pick.reviews_60d },
                        { label: "+90d", val: pick.reviews_90d },
                      ].map(({ label, val }) => (
                        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ ...mono, fontSize: 8, color: C.textFaint, letterSpacing: 1 }}>{label.toUpperCase()}</span>
                          <span style={{ ...mono, fontSize: 10, color: val != null ? C.textDim : C.textFaint }}>
                            {val != null ? val.toLocaleString() : "—"}
                          </span>
                        </div>
                      ))}
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, marginLeft: "auto" }}>
                        <span style={{ ...mono, fontSize: 8, color: C.textFaint, letterSpacing: 1 }}>REVIEWS</span>
                        <span style={{ ...mono, fontSize: 8, color: C.textFaint }}>followthrough</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ SECTION 7: ACTION ═══ */}
      <section style={{ maxWidth: 780, margin: "0 auto", padding: "56px 40px 80px" }}>
        <a
          href={`https://store.steampowered.com/app/${d.appid}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...mono, fontSize: 13, color: C.accent,
            textDecoration: "none", transition: "opacity 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.7")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          ▸ {d.title} on Steam — {d.price_usd != null && d.price_usd > 0 ? `$${d.price_usd.toFixed(2)}` : "Free"}
        </a>
      </section>
    </div>
  );
}
