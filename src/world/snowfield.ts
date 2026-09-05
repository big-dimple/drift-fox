/**
 * snowfield.ts — the ground the fox runs on.
 *
 * Two layers, per the key art: a LowPoly dune field in white toon snow
 * (subtle cyan trough tint) and, over it, a windswept ice-streak overlay —
 * long cyan flow lines, broad blue washes and glinting specks generated on
 * a deterministic canvas. The overlay conforms to the dune geometry (no
 * z-fighting) and fades out radially into the fogged far field, so the seam
 * to the matte-painting vista stays invisible.
 *
 * The height function is the sim's ground truth — same one the renderer
 * displaces by (render/collision/progress share it).
 */
import * as THREE from 'three';
import { createToonMaterial } from '../render/toonMaterial';

function hash2(ix: number, iz: number): number {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function smooth01(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/** Sim + render shared ground truth. */
export function snowHeight(x: number, z: number): number {
  const dunes = (valueNoise(x / 16, z / 16) - 0.5) * 1.4 + (valueNoise(x / 52 + 31, z / 52 + 17) - 0.5) * 3.0;
  // Flatten the test arena (r<~95) and the ravine corridor so the sim runs
  // on honest ground; dunes live toward the vista ring.
  const r = Math.hypot(x, z);
  const arenaMask = 0.12 + 0.88 * smooth01((r - 50) / 45);
  const ravineMask = smooth01((Math.abs(z - 150) - 12) / 14);
  return dunes * arenaMask * ravineMask;
}

const SNOW_MIN_H = -(0.7 + 1.5);
const SNOW_MAX_H = 0.7 + 1.5;

/** Deterministic RNG for texture painting. */
function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The key art's ice sheet: mostly white, crossed by long windswept cyan
 * flow lines with a few broad blue washes and glinting debris specks.
 * Transparent background — the white comes from the toon snow underneath.
 */
function makeStreakTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rnd = mulberry(1337);

  ctx.lineCap = 'round';

  // Broad blue washes first (they sit under the crisp lines).
  for (let i = 0; i < 30; i++) {
    const y = rnd() * size;
    const x = rnd() * size;
    const len = 260 + rnd() * 560;
    const wobble = (rnd() - 0.5) * 0.16;
    ctx.strokeStyle = `rgba(86, 158, 216, ${0.15 + rnd() * 0.15})`;
    ctx.lineWidth = 24 + rnd() * 50;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y + wobble * len * 0.3, x + len, y + wobble * len);
    ctx.stroke();
  }

  // Crisp windswept flow lines — dense and dark enough to read on white.
  for (let i = 0; i < 420; i++) {
    const y = rnd() * size;
    const x = rnd() * size;
    const len = 80 + rnd() * 460;
    const wobble = (rnd() - 0.5) * 0.12;
    const roll = rnd();
    ctx.strokeStyle = roll > 0.70
      ? `rgba(255, 255, 255, ${0.35 + rnd() * 0.30})`
      : roll > 0.30
        ? `rgba(96, 188, 238, ${0.38 + rnd() * 0.32})`
        : `rgba(23, 116, 200, ${0.30 + rnd() * 0.25})`; // deep sapphire accents
    ctx.lineWidth = 4 + rnd() * 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y + wobble * len * 0.3, x + len, y + wobble * len);
    ctx.stroke();
  }

  // Glinting debris specks.
  for (let i = 0; i < 240; i++) {
    const r = 0.8 + rnd() * 2.2;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + rnd() * 0.5})`;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Radial fade so the streak field dissolves before the fog line. */
function makeFadeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export interface Snowfield {
  readonly object: THREE.Object3D;
  readonly height: (x: number, z: number) => number;
}

export function createSnowfield(): Snowfield {
  const group = new THREE.Group();
  group.name = 'snowfield';

  // --- dune field ------------------------------------------------------------
  // Past the day fog bands (260/760 m) extra ground detail is invisible, so a
  // 900 m plane at 6.25 m facets is all the field we need.
  const snowGeo = new THREE.PlaneGeometry(900, 900, 144, 144);
  snowGeo.rotateX(-Math.PI / 2);
  const pos = snowGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, snowHeight(pos.getX(i), pos.getZ(i)));
  }
  // Per-vertex tint: crests pure white, troughs barely cyan — the painting's
  // 白雪蓝影 comes mostly from the streak overlay, the vertex tint only
  // supports it.
  const tint = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = (pos.getY(i) - SNOW_MIN_H) / (SNOW_MAX_H - SNOW_MIN_H);
    tint[i * 3] = 0.86 + 0.14 * f;
    tint[i * 3 + 1] = 0.92 + 0.08 * f;
    tint[i * 3 + 2] = 1.0;
  }
  snowGeo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
  const snow = new THREE.Mesh(
    snowGeo.toNonIndexed(),
    createToonMaterial({ color: 0xffffff, rimStrength: 0.15, specColor: 0xcfe4f8, vertexColors: true }),
  );
  snow.geometry.computeVertexNormals();
  group.add(snow);

  // --- streak overlays conforming to the dunes -------------------------------
  const streaks = makeStreakTexture();
  const fade = makeFadeTexture();
  const overlayGeo = snow.geometry.clone();
  {
    const op = overlayGeo.attributes.position;
    for (let i = 0; i < op.count; i++) op.setY(i, op.getY(i) + 0.06);
  }
  const overlayDefs = [
    { repeat: 9, opacity: 1.0, lift: 0.0, rot: 0.0 },
    { repeat: 4.6, opacity: 0.5, lift: 0.05, rot: 0.06 },
  ];
  for (const def of overlayDefs) {
    const tex = streaks.clone();
    tex.needsUpdate = true;
    tex.repeat.set(def.repeat, def.repeat);
    tex.rotation = def.rot;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: def.opacity,
      alphaMap: fade,
      depthWrite: false,
      fog: false,
    });
    const layer = new THREE.Mesh(def.lift > 0 ? overlayGeo.clone() : overlayGeo, mat);
    if (def.lift > 0) {
      const lp = layer.geometry.attributes.position;
      for (let i = 0; i < lp.count; i++) lp.setY(i, lp.getY(i) + def.lift);
    }
    layer.renderOrder = 5; // after the snow (default 0) — no depth write, so order is the blend contract
    group.add(layer);
  }

  return { object: group, height: snowHeight };
}
