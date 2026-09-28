// ── Generic Elo rating math ───────────────────────────────────────────────────
// No knowledge of songs or traits here - just the standard chess-Elo formulas,
// reused for "player's per-trait rating" vs. "this question's song rating".

export const BASE_RATING = 1000;
export const K_FACTOR = 32;

/** a's expected score (win probability) against b, from the rating difference alone. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** New rating for `current` after scoring `actualScore` (1 = correct, 0 = incorrect) against `opponent`. */
export function updateRating(current: number, opponent: number, actualScore: 0 | 1): number {
  return current + K_FACTOR * (actualScore - expectedScore(current, opponent));
}
