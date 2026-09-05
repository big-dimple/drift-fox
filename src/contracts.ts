/**
 * contracts.ts — shared types crossing subsystem boundaries.
 *
 * M1 keeps only what the ported render/core pipeline plus the fox read: the
 * ink/energy layer ids, the ink marker, and the unified input contract.
 * Course contracts arrive with M2; do not grow this file ahead of them.
 */
import type * as THREE from 'three';

/** Layer for "solid ink" objects; the normal/depth prepass renders ONLY this layer. */
export const LAYER_INK = 1;
/** Selective energy/glow layer. Never contributes to the ink prepass. */
export const LAYER_ENERGY = 2;

/** Recursively enable the ink layer on an object subtree (call after building a mesh tree). */
export function markInk(root: THREE.Object3D): void {
  if (root.userData.noInk === true) {
    root.traverse((object) => object.layers.disable(LAYER_INK));
    return;
  }
  root.layers.enable(LAYER_INK);
  for (const child of root.children) markInk(child);
}

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
