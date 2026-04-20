/**
 * TypeScript port of OPS v5 formula for the weight sandbox.
 * Mirrors backend/collectors/ops.py logic exactly (v5, 7 components).
 */

export interface OpsComponents {
  velocity: number | null;
  decay: number | null;
  reviews: number | null;
  youtube: number | null;
  ccu: number | null;
  sentiment: number | null;
  twitch: number | null;
}

export interface OpsWeights {
  velocity: number;
  decay: number;
  reviews: number;
  youtube: number;
  ccu: number;
  sentiment: number;
  twitch: number;
}

export const DEFAULT_WEIGHTS: OpsWeights = {
  velocity: 0.30,
  decay: 0.20,
  reviews: 0.13,
  youtube: 0.13,
  ccu: 0.10,
  sentiment: 0.08,
  twitch: 0.06,
};

// Component caps (same as backend)
const CAPS: Record<keyof OpsWeights, number> = {
  velocity: 5.0,
  decay: 2.0,
  reviews: 5.0,
  youtube: 2.0,
  ccu: 5.0,
  sentiment: 2.0,
  twitch: 3.0,
};

// 7-component coverage penalty (matches backend _COVERAGE_PENALTY)
const COVERAGE_PENALTY: Record<number, number> = {
  1: 0.40,
  2: 0.55,
  3: 0.70,
  4: 0.82,
  5: 0.91,
  6: 0.97,
  7: 1.00,
};

/**
 * Compute OPS score from raw component values and custom weights.
 * Returns a score clamped to [0, 100].
 */
export function computeOps(
  components: OpsComponents,
  weights: OpsWeights = DEFAULT_WEIGHTS,
): number {
  const keys: (keyof OpsWeights)[] = ["velocity", "decay", "reviews", "youtube", "ccu", "sentiment", "twitch"];

  // Collect non-null components
  const active = keys.filter((k) => components[k] != null);
  if (active.length === 0) return 0;

  // Redistribute weights to active components
  const totalActiveWeight = active.reduce((s, k) => s + weights[k], 0);
  if (totalActiveWeight <= 0) return 0;

  // Normalised weighted sum
  let rawOps = 0;
  for (const k of active) {
    const val = Math.min(components[k]!, CAPS[k]);
    const normalisedWeight = weights[k] / totalActiveWeight;
    rawOps += val * normalisedWeight;
  }

  // Coverage penalty
  const penalty = COVERAGE_PENALTY[active.length] ?? COVERAGE_PENALTY[7];
  rawOps *= penalty;

  // Scale to 0-100 (multiplier × 24, same as backend settings.ops_score_multiplier)
  return Math.min(100, Math.round(rawOps * 24));
}
