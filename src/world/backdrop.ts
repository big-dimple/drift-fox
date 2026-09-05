/**
 * backdrop.ts — near/mid-field scenery built from the ported toon pipeline:
 * a glowing ravine crossing the snowfield and scattered ice shards.
 *
 * The far scenery (skyline peaks, distant ice walls, sky) is the key-art
 * painting itself — see render/vista.ts — so this module owns only what the
 * fox will physically approach. Pure M0 scenery: no collision, no gameplay
 * truth. M2 replaces the ravine with the authored leap geometry; M3 tunes
 * shapes and placement. Everything is deterministic so screenshots stay
 * reproducible.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../render/toonMaterial';
import { PALETTE } from '../core/palette';
import { LAYER_ENERGY } from '../contracts';

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

/**
 * The ravine: a sunken dark-blue chasm with ice walls and two emissive cyan
 * rims on the energy layer so the ported bloom makes the crack glow.
 */
function buildRavine(parent: THREE.Group): void {
  const length = 1000;
  const halfWidth = 19;
  const depth = 18;
  const wallMat = createToonMaterial({ color: PALETTE.ravineWall, rimStrength: 0.2 });
  const floorMat = createToonMaterial({ color: PALETTE.ravineFloor, rimStrength: 0.05 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(length, 2, halfWidth * 2), floorMat);
  floor.position.y = -depth;
  parent.add(floor);

  // From a fox-height camera the chasm interior is invisible; what reads is
  // the dark gash on the snow surface between the glowing rims.
  const slit = new THREE.Mesh(
    new THREE.PlaneGeometry(length, halfWidth * 2),
    createToonMaterial({ color: PALETTE.ravineFloor, rimStrength: 0 }),
  );
  slit.rotation.x = -Math.PI / 2;
  slit.position.y = 0.12;
  parent.add(slit);

  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      faceted(new THREE.BoxGeometry(length, depth + 2, 3.5)),
      wallMat,
    );
    wall.position.set(0, -depth / 2 + 0.5, side * (halfWidth + 1.5));
    parent.add(wall);

    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(length, 1.4, 3.2),
      createToonMaterial({ color: PALETTE.iceGlow, emissive: PALETTE.iceGlow, emissiveIntensity: 2.2 }),
    );
    glow.position.set(0, 0.8, side * (halfWidth + 0.8));
    glow.layers.set(LAYER_ENERGY);
    parent.add(glow);
  }

  // Jagged ice teeth along the rims sell the crack.
  const toothMat = createToonMaterial({ color: PALETTE.iceCyan, rimStrength: 0.3 });
  for (let i = 0; i < 26; i++) {
    const side = hash(i, 21) > 0.5 ? 1 : -1;
    const h = 2 + hash(i, 22) * 6;
    const tooth = new THREE.Mesh(faceted(new THREE.ConeGeometry(1.2 + hash(i, 23) * 1.6, h, 4)), toothMat);
    tooth.position.set((hash(i, 24) - 0.5) * length * 0.96, h / 2 - 0.4, side * (halfWidth + 2.5 + hash(i, 25) * 4));
    tooth.rotation.y = hash(i, 26) * Math.PI;
    parent.add(tooth);
  }
}

export interface Backdrop {
  readonly object: THREE.Object3D;
}

export function createBackdrop(): Backdrop {
  const group = new THREE.Group();
  group.name = 'backdrop';

  const ravine = new THREE.Group();
  ravine.name = 'ravine';
  buildRavine(ravine);
  ravine.position.set(0, 0, 150);
  ravine.rotation.y = 0.06;
  group.add(ravine);

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
