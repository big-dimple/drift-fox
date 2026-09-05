/**
 * course.ts — the M2 run: a point-to-point serpentine that crosses the
 * chasm five times (一局 5 个飞跃点). Owns the course visuals: ice pylons
 * along the intended line, the glowing chasm rims, and the five golden
 * gates. The ground truth for the chasm lives in snowfield.ts.
 *
 * Deterministic: the spline, pylons and gate placements are authored
 * constants; screenshots stay reproducible.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../render/toonMaterial';
import { PALETTE } from '../core/palette';
import { LAYER_ENERGY } from '../contracts';
import { chasmZ, snowHeight } from './snowfield';

export interface GateInfo {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  /** Respawn pose on the approach side of this gate. */
  readonly respawn: { x: number; z: number; heading: number };
  readonly object: THREE.Object3D;
}

export interface Course {
  readonly object: THREE.Object3D;
  readonly gates: readonly GateInfo[];
  readonly start: { x: number; z: number; heading: number };
  readonly finish: { x: number; z: number };
}

const GATE_XS = [-200, -110, -20, 70, 170] as const;

/** Authored serpentine through the five crossings. */
function buildSpline(): THREE.CatmullRomCurve3 {
  const pts = [
    new THREE.Vector3(-280, 0, -170),
    new THREE.Vector3(-252, 0, -50),
    new THREE.Vector3(-200, 0, chasmZ(-200)),
    new THREE.Vector3(-168, 0, 135),
    new THREE.Vector3(-138, 0, 140),
    new THREE.Vector3(-110, 0, chasmZ(-110)),
    new THREE.Vector3(-82, 0, -105),
    new THREE.Vector3(-50, 0, -115),
    new THREE.Vector3(-20, 0, chasmZ(-20)),
    new THREE.Vector3(24, 0, 140),
    new THREE.Vector3(48, 0, 145),
    new THREE.Vector3(70, 0, chasmZ(70)),
    new THREE.Vector3(112, 0, -105),
    new THREE.Vector3(142, 0, -112),
    new THREE.Vector3(170, 0, chasmZ(170)),
    new THREE.Vector3(215, 0, 125),
    new THREE.Vector3(250, 0, 135),
  ];
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
}

function faceted(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

/** Nearest spline parameter for a point (coarse scan is fine at build time). */
function nearestU(spline: THREE.CatmullRomCurve3, x: number, z: number): number {
  let bestU = 0;
  let bestD = Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i <= 2000; i++) {
    const u = i / 2000;
    spline.getPoint(u, p);
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < bestD) {
      bestD = d;
      bestU = u;
    }
  }
  return bestU;
}

function buildPylons(parent: THREE.Group, spline: THREE.CatmullRomCurve3): void {
  const pylonGeo = faceted(new THREE.ConeGeometry(0.55, 1.7, 5));
  const cyanMat = createToonMaterial({ color: PALETTE.iceCyan, rimStrength: 0.35 });
  const length = spline.getLength();
  const count = Math.floor(length / 14);
  const p = new THREE.Vector3();
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    spline.getPoint(u, p);
    // No pylons near the gates — the crossing must read clean.
    if (GATE_XS.some((gx) => Math.hypot(p.x - gx, p.z - chasmZ(gx)) < 18)) continue;
    const pylon = new THREE.Mesh(pylonGeo, cyanMat);
    pylon.position.set(p.x, snowHeight(p.x, p.z) + 0.75, p.z);
    pylon.rotation.y = (i * 0.7) % Math.PI;
    parent.add(pylon);
  }
}

/** Glowing rims along both chasm edges (energy layer → bloom). */
function buildChasmRims(parent: THREE.Group): void {
  const mat = new THREE.MeshBasicMaterial({
    color: PALETTE.iceGlow,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const positions: number[] = [];
    const indices: number[] = [];
    let n = 0;
    for (let x = -288; x <= 300; x += 6) {
      const z = chasmZ(x) + side * 10.2;
      const y = snowHeight(x, z) + 0.35;
      positions.push(x, y, z - 0.7, x, y, z + 0.7);
      if (n > 0) {
        const b = n * 2;
        indices.push(b - 2, b - 1, b, b - 1, b + 1, b);
      }
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(indices);
    const strip = new THREE.Mesh(geo, mat);
    strip.layers.set(LAYER_ENERGY);
    strip.frustumCulled = false;
    parent.add(strip);
  }
}

export function createCourse(gateProto: THREE.Object3D): Course {
  const group = new THREE.Group();
  group.name = 'course';
  const spline = buildSpline();
  const length = spline.getLength();

  buildPylons(group, spline);
  buildChasmRims(group);

  const gates: GateInfo[] = [];
  const gateU: number[] = [];
  const tan = new THREE.Vector3();
  const rp = new THREE.Vector3();
  for (let i = 0; i < GATE_XS.length; i++) {
    const x = GATE_XS[i];
    const z = chasmZ(x);
    const object = gateProto.clone(true);
    object.scale.setScalar(1.6);
    object.position.set(x, snowHeight(x, z - 12) + 1.2, z);
    group.add(object);

    const u = nearestU(spline, x, z);
    gateU.push(u);
    const respawnU = Math.max(0, u - 30 / length);
    spline.getPoint(respawnU, rp);
    spline.getTangent(respawnU, tan);
    gates.push({
      index: i,
      x,
      z,
      respawn: { x: rp.x, z: rp.z, heading: Math.atan2(tan.x, tan.z) },
      object,
    });
  }

  const startP = spline.getPoint(0, new THREE.Vector3());
  const startT = spline.getTangent(0, new THREE.Vector3());
  const endP = spline.getPoint(1, new THREE.Vector3());
  return {
    object: group,
    gates,
    start: { x: startP.x, z: startP.z, heading: Math.atan2(startT.x, startT.z) },
    finish: { x: endP.x, z: endP.z },
  };
}
