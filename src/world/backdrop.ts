/**
 * backdrop.ts — near/mid-field scenery built from the ported toon pipeline:
 * scattered ice shards across the field.
 *
 * The far scenery (skyline peaks, distant ice walls, sky) is the key-art
 * painting itself — see render/vista.ts — and the ravine is now real
 * gameplay geometry owned by world/course.ts + the snowfield ground truth.
 * Pure scenery: no collision, no gameplay truth. Everything is
 * deterministic so screenshots stay reproducible.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../render/toonMaterial';
import { PALETTE } from '../core/palette';

/** Deterministic hash → 0..1 (stable layout across runs/screenshots). */
function hash(i: number, k: number): number {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Faceted LowPoly helper: shared vertices lie — rebuild flat-face normals. */
function faceted(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

export interface Backdrop {
  readonly object: THREE.Object3D;
}

export function createBackdrop(): Backdrop {
  const group = new THREE.Group();
  group.name = 'backdrop';

  // Scattered ice shards across the near field — the key art's debris spray.
  const shardMat = createToonMaterial({ color: PALETTE.iceCyan, rimStrength: 0.35 });
  for (let i = 0; i < 34; i++) {
    const h = 0.8 + hash(i, 31) * 3.2;
    const shard = new THREE.Mesh(
      faceted(new THREE.ConeGeometry(0.5 + hash(i, 32) * 1.1, h, 4)),
      shardMat,
    );
    shard.position.set(
      (hash(i, 33) - 0.5) * 700,
      h / 2 - 0.3,
      20 + hash(i, 34) * 330,
    );
    shard.rotation.y = hash(i, 35) * Math.PI;
    shard.rotation.z = (hash(i, 36) - 0.5) * 0.35;
    group.add(shard);
  }

  return { object: group };
}
