/**
 * contracts.ts — shared types crossing subsystem boundaries.
 *
 * M0 keeps only what the ported render/core pipeline reads: the ink/energy
 * layer ids and the unified input contract. The fox gameplay state and
 * course contracts arrive with M1; do not grow this file ahead of them.
 */

/** Layer for "solid ink" objects; the normal/depth prepass renders ONLY this layer. */
export const LAYER_INK = 1;
/** Selective energy/glow layer. Never contributes to the ink prepass. */
export const LAYER_ENERGY = 2;

/** Per-frame driving input, produced by the player keyboard or a gamepad. */
export interface BoatInput {
  /** -1 (full reverse/brake) .. 1 (full throttle). */
  throttle: number;
  /** -1 (full left) .. 1 (full right). */
  steer: number;
  /** Held = grip drift. Releasing after a long drift pays out boost. */
  drift: boolean;
  /** Edge-triggered leap request. */
  flightTrigger: boolean;
  /** Held context brake. */
  airBrake: boolean;
}
