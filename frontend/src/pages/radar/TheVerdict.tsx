/**
 * Concept A — "The Verdict"
 *
 * A long-read magazine feature. Full-bleed hero with serif title,
 * editorial prose reasons, single OPS momentum chart.
 */
import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Mock Data: Hollowfield ─────────────────────────────────────
const MOCK = {
  title: "Hollowfield",
  developer: "Ashgrove Studio",
  appid: 99999,
  headerImage: "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/2179390/header.jpg",
  price: 9.99,
  daysSinceLaunch: 18,
  reviews: 1847,
  sentiment: 91,
  velocity7d: 340,
  velocityPrev7d: 89,
  owners: 28000,
  peakCcu: 847,
  currentCcu: 120,
  ytVideos: 3,
  ytLargestSubs: 280000,
  redditThread: { title: "This game broke me — in a good way", upvotes: 4200, sub: "r/horrorgaming", daysAgo: 11 },
  demoReviews: 847,
  demoScore: 78,
  ops: {
    score: 84,
    delta14d: 22,
    percentile: 94,
    components: {
      velocity: { value: 2.86, weight: 0.35, label: "Velocity" },
      decay: { value: 0.72, weight: 0.25, label: "Decay" },
      reviews: { value: 1.94, weight: 0.15, label: "Reviews" },
      youtube: { value: 0.48, weight: 0.15, label: "YouTube" },
      creator: { value: 1.31, weight: 0.10, label: "Creator" },
    },
  },
  opsHistory: [
    { day: 0, score: 0 }, { day: 1, score: 12 }, { day: 2, score: 24 },
    { day: 3, score: 38 }, { day: 4, score: 42 }, { day: 5, score: 48 },
    { day: 6, score: 51 }, { day: 7, score: 55 }, { day: 8, score: 54 },
    { day: 9, score: 56 }, { day: 10, score: 58 }, { day: 11, score: 62 },
    { day: 12, score: 67 }, { day: 13, score: 70 }, { day: 14, score: 74 },
    { day: 15, score: 78 }, { day: 16, score: 80 }, { day: 17, score: 82 },
    { day: 18, score: 84 },
  ],
};

const PREV_PICKS = [
  { title: "Scam Line", date: "Mar 24", ops: 72, status: "climbing" as const },
  { title: "Fears to Fathom: Ep 5", date: "Mar 17", ops: 65, status: "steady" as const },
  { title: "The Midnight Walkers", date: "Mar 10", ops: 58, status: "peaked" as const },
  { title: "SIGNALIS: DLC", date: "Mar 3", ops: 81, status: "climbing" as const },
];

// ─── Palette ────────────────────────────────────────────────────
const C = {
  bg: "#111314",
  surface: "#1a1a1c",
  accent: "#802626",
  accentDim: "rgba(128,38,38,0.25)",
  text: "#e8e0d4",
  textDim: "#6b6058",
  textFaint: "#3d3530",
  border: "#2a2420",
  green: "#1a5c3a",
  amber: "#8b6914",
  velocityColor: "#e8e0d4",
  decayColor: "#bb7125",
  reviewColor: "#802626",
  ytColor: "#a36aa5",
  creatorColor: "#a36aa5",
};

const serif: React.CSSProperties = { fontFamily: "'Playfair Display', Georgia, serif" };
const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const sans: React.CSSProperties = { fontFamily: "'Public Sans', sans-serif" };

// ─── Component ──────────────────────────────────────────────────
export default function TheVerdict() {
  const velocityMultiplier = (MOCK.velocity7d / MOCK.velocityPrev7d).toFixed(1);
  const reviewOwnerRatio = ((MOCK.reviews / MOCK.owners) * 100).toFixed(1);

  const compEntries = useMemo(() => {
    const comps = MOCK.ops.components;
    return Object.values(comps);
  }, []);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text }}>

      {/* ═══ SECTION 1: HERO ═══ */}
      <section style={{ position: "relative", height: "85vh", minHeight: 560, overflow: "hidden" }}>
        {/* Background image */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${MOCK.headerImage})`,
          backgroundSize: "cover", backgroundPosition: "center",
          filter: "saturate(0.6) brightness(0.5)",
        }} />

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

        {/* Content */}
        <div style={{
          position: "relative", height: "100%", maxWidth: 1100, margin: "0 auto",
          padding: "0 40px", display: "flex", flexDirection: "column", justifyContent: "flex-end",
          paddingBottom: 48,
        }}>
          {/* Radar Pick label */}
          <div style={{ ...mono, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.accent, marginBottom: 20, opacity: 0.8 }}>
            Radar Pick — Week 13, 2026
          </div>

          {/* Title + Developer */}
          <h1 style={{ ...serif, fontSize: 64, fontWeight: 700, lineHeight: 1.05, margin: 0, letterSpacing: -1 }}>
            {MOCK.title}
          </h1>
          <div style={{ ...mono, fontSize: 11, color: C.textDim, marginTop: 8, textTransform: "uppercase", letterSpacing: 2 }}>
            {MOCK.developer} · ${MOCK.price} · Day {MOCK.daysSinceLaunch}
          </div>

          {/* Verdict line */}
          <p style={{ ...serif, fontSize: 20, fontStyle: "italic", lineHeight: 1.6, maxWidth: 640, marginTop: 20, color: `${C.text}cc` }}>
            {MOCK.reviews.toLocaleString()} reviews. {MOCK.sentiment}% positive. Zero major creators.
            Hollowfield found its audience on its own — and it's still accelerating.
          </p>

          {/* OPS Badge — bottom right */}
          <div style={{
            position: "absolute", bottom: 48, right: 40,
            display: "flex", flexDirection: "column", alignItems: "center",
            border: `1px solid ${C.accentDim}`, borderRadius: 10, padding: "16px 24px",
            background: `${C.bg}cc`, backdropFilter: "blur(8px)",
          }}>
            <div style={{ ...mono, fontSize: 44, fontWeight: 700, color: C.accent, lineHeight: 1 }}>
              {MOCK.ops.score}
            </div>
            <div style={{ ...mono, fontSize: 9, color: C.textDim, letterSpacing: 2, marginTop: 4 }}>
              OPS SCORE
            </div>
            <div style={{ ...mono, fontSize: 11, color: C.accent, marginTop: 6 }}>
              ↑ {MOCK.ops.delta14d} pts / 14d
            </div>
          </div>
        </div>

        {/* Bottom rule */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: `${C.accent}33` }} />
      </section>

      {/* ═══ SECTION 2: QUICK FACTS STRIP ═══ */}
      <section style={{
        maxWidth: 1100, margin: "0 auto", padding: "24px 40px",
        display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16,
        borderBottom: `1px solid ${C.border}`,
      }}>
        {[
          { label: "REVIEWS", value: MOCK.reviews.toLocaleString() },
          { label: "SENTIMENT", value: `${MOCK.sentiment}%` },
          { label: "VELOCITY", value: `${MOCK.velocity7d} / 7d` },
          { label: "OWNERS", value: `~${(MOCK.owners / 1000).toFixed(0)}K` },
          { label: "PEAK CCU", value: MOCK.peakCcu.toLocaleString() },
          { label: "PRICE", value: `$${MOCK.price}` },
        ].map(m => (
          <div key={m.label} style={{ textAlign: "center", minWidth: 100 }}>
            <div style={{ ...mono, fontSize: 9, letterSpacing: 2, color: C.textDim, marginBottom: 4 }}>{m.label}</div>
            <div style={{ ...mono, fontSize: 16, fontWeight: 600, color: C.text }}>{m.value}</div>
          </div>
        ))}
      </section>

      {/* ═══ SECTION 3: OPS EXPLANATION + BREAKDOWN ═══ */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "48px 40px 0" }}>
        <p style={{ ...sans, fontSize: 15, lineHeight: 1.75, color: `${C.text}bb`, margin: 0 }}>
          Our <span style={{ color: C.accent, fontWeight: 600 }}>Overperformance Score</span> measures
          how a game performs against every horror indie released in the same window — review velocity,
          how well that velocity sustains, audience reach, and creator impact. Hollowfield's{" "}
          <span style={{ color: C.accent, fontWeight: 600 }}>84</span> puts it in the top{" "}
          <span style={{ color: C.accent, fontWeight: 600 }}>{100 - MOCK.ops.percentile}%</span> of
          releases this quarter. It's been climbing for two straight weeks.
        </p>

        {/* Component Bar */}
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 14 }}>
            {compEntries.map(comp => {
              const colors: Record<string, string> = {
                Velocity: C.velocityColor, Decay: C.decayColor,
                Reviews: C.reviewColor, YouTube: C.ytColor, Creator: C.creatorColor,
              };
              return (
                <div
                  key={comp.label}
                  style={{
                    width: `${comp.weight * 100}%`,
                    background: colors[comp.label] || C.textDim,
                    opacity: 0.65,
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", marginTop: 8 }}>
            {compEntries.map(comp => {
              const colors: Record<string, string> = {
                Velocity: C.velocityColor, Decay: C.decayColor,
                Reviews: C.reviewColor, YouTube: C.ytColor, Creator: C.creatorColor,
              };
              return (
                <div key={comp.label} style={{ width: `${comp.weight * 100}%` }}>
                  <div style={{ ...mono, fontSize: 9, color: colors[comp.label] || C.textDim, opacity: 0.7 }}>
                    {comp.label}
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: C.textDim, marginTop: 1 }}>
                    {comp.value.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 4: THE CASE — REASONS TO PLAY ═══ */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "56px 40px 0" }}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: C.accent, marginBottom: 32, opacity: 0.7 }}>
          The Case
        </div>

        {/* Reason 1: Velocity */}
        <div style={{ marginBottom: 40 }}>
          <h3 style={{ ...sans, fontSize: 16, fontWeight: 600, margin: "0 0 10px", color: C.text }}>
            Players can't stop talking about it.
          </h3>
          <p style={{ ...sans, fontSize: 15, lineHeight: 1.75, color: `${C.text}aa`, margin: 0 }}>
            <span style={{ color: C.accent, fontWeight: 500 }}>{MOCK.velocity7d}</span> new reviews
            landed in the last 7 days — up from{" "}
            <span style={{ color: C.accent, fontWeight: 500 }}>{MOCK.velocityPrev7d}</span> the week before.
            That's a <span style={{ color: C.accent, fontWeight: 500 }}>{velocityMultiplier}x acceleration</span> in
            review velocity, placing Hollowfield in the top 2% of horror launches for week-two momentum.
            Games that accelerate after week one don't do so by accident. Word of mouth is compounding.
          </p>
        </div>

        {/* Reason 2: No creator coverage */}
        <div style={{ marginBottom: 40 }}>
          <h3 style={{ ...sans, fontSize: 16, fontWeight: 600, margin: "0 0 10px", color: C.text }}>
            The algorithm hasn't found it yet.
          </h3>
          <p style={{ ...sans, fontSize: 15, lineHeight: 1.75, color: `${C.text}aa`, margin: 0 }}>
            Just <span style={{ color: C.accent, fontWeight: 500 }}>{MOCK.ytVideos} YouTube videos</span> total.
            The largest creator to cover Hollowfield has{" "}
            <span style={{ color: C.accent, fontWeight: 500 }}>{(MOCK.ytLargestSubs / 1000).toFixed(0)}K subscribers</span> —
            respectable, but not the reach that moves {(MOCK.owners / 1000).toFixed(0)}K copies.
            Zero coverage from anyone above 500K. This game found its audience entirely through
            word of mouth. When the big creators do arrive, expect the second wave.
          </p>
        </div>

        {/* Reason 3: Engagement ratio */}
        <div style={{ marginBottom: 40 }}>
          <h3 style={{ ...sans, fontSize: 16, fontWeight: 600, margin: "0 0 10px", color: C.text }}>
            Everyone who plays it has something to say.
          </h3>
          <p style={{ ...sans, fontSize: 15, lineHeight: 1.75, color: `${C.text}aa`, margin: 0 }}>
            The review-to-owner ratio is{" "}
            <span style={{ color: C.accent, fontWeight: 500 }}>{reviewOwnerRatio}%</span> — the genre
            average sits at 2.1%. For every 15 people who buy Hollowfield, one writes a review.
            That's <span style={{ color: C.accent, fontWeight: 500 }}>3x the normal engagement rate</span>.
            High ratios mean players aren't just finishing the game — they're compelled to tell
            someone about it.
          </p>
        </div>

        {/* Reason 4: Demo overdelivery */}
        <div style={{ marginBottom: 40 }}>
          <h3 style={{ ...sans, fontSize: 16, fontWeight: 600, margin: "0 0 10px", color: C.text }}>
            The full game overdelivered on the demo.
          </h3>
          <p style={{ ...sans, fontSize: 15, lineHeight: 1.75, color: `${C.text}aa`, margin: 0 }}>
            The demo pulled <span style={{ color: C.accent, fontWeight: 500 }}>{MOCK.demoReviews} reviews
            at {MOCK.demoScore}% positive</span> — decent, not exceptional. The full game is running
            at <span style={{ color: C.accent, fontWeight: 500 }}>{MOCK.sentiment}%</span>. That{" "}
            <span style={{ color: C.accent, fontWeight: 500 }}>
              {MOCK.sentiment - MOCK.demoScore}-point lift
            </span>{" "}
            means the developers took the feedback and delivered. The players who tried the demo
            are now the ones writing the reviews. One Reddit thread in{" "}
            {MOCK.redditThread.sub} — "{MOCK.redditThread.title}" — pulled{" "}
            <span style={{ color: C.accent, fontWeight: 500 }}>
              {MOCK.redditThread.upvotes.toLocaleString()} upvotes
            </span>. That single thread is doing more work than any algorithm.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 5: MOMENTUM CHART ═══ */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "24px 40px 0" }}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: C.accent, marginBottom: 16, opacity: 0.7 }}>
          Momentum
        </div>
        <div style={{ height: 180, width: "100%" }}>
          <ResponsiveContainer>
            <AreaChart data={MOCK.opsHistory} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="opsGradA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={{ fontSize: 9, fill: C.textDim } as any}
                axisLine={false} tickLine={false}
                ticks={[0, 7, 14, MOCK.opsHistory.length - 1]}
                tickFormatter={(v: number) => v === 0 ? "Launch" : `Day ${v}`}
              />
              <YAxis hide domain={[0, 100]} />
              <ReferenceLine y={60} stroke={C.border} strokeDasharray="4 4" />
              <Area
                type="monotone" dataKey="score" stroke={C.accent}
                strokeWidth={2} fill="url(#opsGradA)" dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p style={{ ...serif, fontSize: 13, fontStyle: "italic", color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
          OPS trajectory since launch. The steepest 14-day climb we've tracked for a sub-$10 horror title this quarter.
        </p>
      </section>

      {/* ═══ SECTION 6: PREVIOUS PICKS ═══ */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 40px 0" }}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: C.textDim, marginBottom: 20 }}>
          Previous Picks
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {PREV_PICKS.map((pick, i) => {
            const statusColor = pick.status === "climbing" ? C.green : pick.status === "peaked" ? C.amber : C.textFaint;
            const statusLabel = pick.status === "climbing" ? "Still climbing" : pick.status === "peaked" ? "Peaked" : "Steady";
            return (
              <div
                key={i}
                style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "16px 20px", minWidth: 170, flex: "1 1 170px",
                  cursor: "pointer", transition: "border-color 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              >
                <div style={{ ...sans, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{pick.title}</div>
                <div style={{ ...mono, fontSize: 10, color: C.textDim, marginBottom: 8 }}>{pick.date}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
                  <span style={{ ...mono, fontSize: 10, color: C.textDim }}>{statusLabel}</span>
                  <span style={{ ...mono, fontSize: 10, color: C.accent, marginLeft: "auto" }}>OPS {pick.ops}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ SECTION 7: FOOTER CTA ═══ */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 40px 80px", textAlign: "center" }}>
        <a
          href={`https://store.steampowered.com/app/${MOCK.appid}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...serif, fontSize: 16, fontStyle: "italic", color: C.accent,
            textDecoration: "none", borderBottom: `1px solid ${C.accentDim}`,
            paddingBottom: 2, transition: "border-color 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = C.accentDim)}
        >
          Play {MOCK.title} on Steam — ${MOCK.price} →
        </a>
      </section>
    </div>
  );
}
