/**
 * backdrop.ts — the key-art vista, built from the ported toon pipeline:
 * a jagged snow-capped mountain ridge on the skyline, cyan ice cliffs
 * walling the right side, and a glowing ravine crossing the snowfield.
 *
 * Pure M0 scenery: no collision, no gameplay truth. M2 replaces the ravine
 * with the authored leap geometry; M3 tunes shapes and placement.
 * Everything is deterministic so screenshots stay reproducible.
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

/** Skyline ridge: paired rock cone + snow cap, leaning slightly, jagged. */
function buildPeaks(parent: THREE.Group): void {
  const rockMat = createToonMaterial({ color: PALETTE.rockBlue, rimStrength: 0.15 });
  const capMat = createToonMaterial({ color: PALETTE.snowWhite, rimStrength: 0.2 });
  for (let i = 0; i < 9; i++) {
    const x = -640 + i * 135 + (hash(i, 1) - 0.5) * 80;
    const z = 380 + hash(i, 2) * 180;
    const height = 80 + hash(i, 3) * 120;
    const radius = 55 + hash(i, 4) * 65;
    const sides = 5 + Math.floor(hash(i, 5) * 2);
    const lean = (hash(i, 6) - 0.5) * 0.22;

    const peak = new THREE.Group();
    const body = new THREE.Mesh(faceted(new THREE.ConeGeometry(radius, height, sides)), rockMat);
    body.position.y = height / 2 - 4;
    peak.add(body);
    const capHeight = height * (0.30 + hash(i, 7) * 0.12);
    const cap = new THREE.Mesh(
      faceted(new THREE.ConeGeometry(radius * (capHeight / height) * 1.06, capHeight, sides)),
      capMat,
    );
    cap.position.y = height - capHeight / 2 - 4;
    peak.add(cap);

    peak.position.set(x, 0, z);
    peak.rotation.z = lean;
    peak.rotation.y = hash(i, 8) * Math.PI;
    parent.add(peak);
  }
}

/**
 * Right-hand ice wall — on SCREEN RIGHT when the camera faces +Z, +X world
 * is frame left, so the wall lives at negative x. Slabs overlap into a tall
 * layered wall like the key art's right side.
 */
function buildIceCliffs(parent: THREE.Group): void {
  const cyanMat = createToonMaterial({ color: PALETTE.iceCyan, rimStrength: 0.3, specThreshold: 0.96 });
  const deepMat = createToonMaterial({ color: PALETTE.iceDeep, rimStrength: 0.25, specThreshold: 0.96 });
  const capMat = createToonMaterial({ color: PALETTE.snowWhite, rimStrength: 0.2 });
  for (let i = 0; i < 10; i++) {
    const w = 26 + hash(i, 11) * 38;
    const h = 34 + hash(i, 12) * 78;
    const d = 24 + hash(i, 13) * 36;
    const x = -(150 + i * 34 + hash(i, 14) * 26);
    const z = 120 + hash(i, 15) * 220;
    const slab = new THREE.Mesh(
      faceted(new THREE.BoxGeometry(w, h, d)),
      hash(i, 16) > 0.45 ? cyanMat : deepMat,
    );
    slab.position.set(x, h / 2 - 2, z);
    slab.rotation.y = (hash(i, 17) - 0.5) * 0.9;
    slab.rotation.z = (hash(i, 18) - 0.5) * 0.07;
    parent.add(slab);

    const cap = new THREE.Mesh(
      faceted(new THREE.BoxGeometry(w * 1.04, 3.2, d * 1.04)),
      capMat,
    );
    cap.position.set(x, h - 2 + 1.6, z);
    cap.rotation.y = slab.rotation.y;
    cap.rotation.z = slab.rotation.z;
    parent.add(cap);
  }
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
  buildPeaks(group);
  buildIceCliffs(group);

  const ravine = new THREE.Group();
  ravine.name = 'ravine';
  buildRavine(ravine);
  ravine.position.set(0, 0, 85);
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
