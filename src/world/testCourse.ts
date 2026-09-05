/**
 * testCourse.ts — the M1 proving ground: a stadium loop inside the arena
 * (two straights + two hairpin caps), marked by ice pylons. Visual guides
 * only — no gameplay enforcement until M2's real course.
 *
 * Everything is deterministic so screenshots stay reproducible.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../render/toonMaterial';
import { PALETTE } from '../core/palette';

const STRAIGHT_HALF = 55; // straights run z in [-55, 55]
const LANE_X = 55; // straights sit at x = ±55
const PYLON_EVERY_M = 11;

/** Stadium perimeter: straights at x=±55 plus semicircle caps at z=±55. */
function loopPoint(t: number, out: THREE.Vector3): THREE.Vector3 {
  const straight = STRAIGHT_HALF * 2; // 110 m per straight
  const cap = Math.PI * LANE_X; // semicircle arc length
  const total = straight * 2 + cap * 2;
  let d = t * total;
  if (d < straight) {
    return out.set(LANE_X, 0, -STRAIGHT_HALF + d); // right straight, +Z
  }
  d -= straight;
  if (d < cap) {
    const a = d / LANE_X; // 0..π around the far cap
    return out.set(Math.cos(a) * LANE_X, 0, STRAIGHT_HALF + Math.sin(a) * LANE_X);
  }
  d -= cap;
  if (d < straight) {
    return out.set(-LANE_X, 0, STRAIGHT_HALF - d); // left straight, -Z
  }
  d -= straight;
  const a = Math.PI + d / LANE_X;
  return out.set(Math.cos(a) * LANE_X, 0, -STRAIGHT_HALF + Math.sin(a) * LANE_X);
}

function faceted(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

export function createTestCourse(groundY: (x: number, z: number) => number): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'test-course';

  const perimeter = (STRAIGHT_HALF * 2 + Math.PI * LANE_X) * 2;
  const count = Math.floor(perimeter / PYLON_EVERY_M);
  const cyanMat = createToonMaterial({ color: PALETTE.iceCyan, rimStrength: 0.35 });
  const darkMat = createToonMaterial({ color: PALETTE.iceDeep, rimStrength: 0.3 });
  const pylonGeo = faceted(new THREE.ConeGeometry(0.55, 1.7, 5));
  const hairpinGeo = faceted(new THREE.ConeGeometry(0.8, 3.2, 5));

  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const t = i / count;
    loopPoint(t, p);
    // Taller double pylons mark the two hairpin caps.
    const onCap = Math.abs(p.x) < LANE_X * 0.45 && Math.abs(p.z) > STRAIGHT_HALF * 0.9;
    const hairpinMarker = onCap && i % 2 === 0;
    const pylon = new THREE.Mesh(hairpinMarker ? hairpinGeo : pylonGeo, hairpinMarker ? darkMat : cyanMat);
    pylon.position.set(p.x, groundY(p.x, p.z) + (hairpinMarker ? 1.5 : 0.75), p.z);
    pylon.rotation.y = (i * 0.7) % Math.PI;
    group.add(pylon);
  }
  return group;
}
