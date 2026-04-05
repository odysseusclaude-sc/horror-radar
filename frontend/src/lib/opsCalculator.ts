/**
 * TypeScript port of OPS v4 formula for the weight sandbox.
 * Mirrors backend/collectors/ops.py logic exactly (v4, 5 components).
 */

export interface OpsComponents {
  velocity: number | null;
  decay: number | null;
  reviews: number | null;
  youtube: number | null;
  ccu: number | null;
}

export interface OpsWeights {
  velocity: number;
  decay: number;
  reviews: number;
  youtube: number;
  ccu: number;
}

export const DEFAULT_WEIGHTS: OpsWeights = {
  velocity: 0.35,
  decay: 0.20,
  reviews: 0.15,
  youtube: 0.15,
  ccu: 0.15,
};

// Component caps (same as backend)
const CAPS: Record<keyof OpsWeights, number> = {
  velocity: 5.0,
  decay: 2.0,
  reviews: 5.0,
  youtube: 1.8,
  ccu: 5.0,
};

// Coverage penalty (v4 — 5 components)
const COVERAGE_PENALTY: Record<number, number> = {
  1: 0.50,
  2: 0.70,
  3: 0.85,
  4: 0.95,
  5: 1.00,
};

/**
 * Compute OPS score from raw component values and custom weights.
 * Returns a score clamped to [0, 100].
 */
export function computeOps(
  components: OpsComponents,
  weights: OpsWeights = DEFAULT_WEIGHTS,
): number {
  const keys: (keyof OpsWeights)[] = ["velocity", "decay", "reviews", "youtube", "ccu"];

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
  const penalty = COVERAGE_PENALTY[active.length] ?? 1.0;
  rawOps *= penalty;

  // Scale to 0-100 (same multiplier as backend)
  return Math.min(100, Math.round(rawOps * 24));
}
