/**
 * fox.ts — the arctic fox. Procedural LowPoly mesh, built in code (not
 * Blender): legs/tail/head animate around their own pivots at 60 Hz, so
 * there is no export roundtrip and the palette stays exact.
 *
 * Reads by silhouette and color blocking per the key art: snow-white body,
 * dark ear tips and paws, oversized bushy tail. Forward is +Z (heading 0).
 */
import * as THREE from 'three';
import { createToonMaterial } from '../render/toonMaterial';
import { addOutline } from '../render/outline';
import { PALETTE } from '../core/palette';

/** Faceted LowPoly helper: shared vertices lie — rebuild flat-face normals. */
function faceted(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

const BODY = { color: PALETTE.foxWhite, rimStrength: 0.5 };
const SHADE = { color: PALETTE.foxShade, rimStrength: 0.4 };
const DARK = { color: PALETTE.foxDark, rimStrength: 0.25 };

interface Leg {
  readonly hip: THREE.Group;
  readonly phase: number;
}

export class Fox {
  readonly object: THREE.Group;
  private readonly legs: Leg[] = [];
  private readonly tail: THREE.Group;
  private readonly tailMid: THREE.Group;
  private readonly bodyGroup: THREE.Group;
  private readonly headGroup: THREE.Group;

  constructor() {
    this.object = new THREE.Group();
    this.object.name = 'fox';

    const bodyMat = createToonMaterial(BODY);
    const shadeMat = createToonMaterial(SHADE);
    const darkMat = createToonMaterial(DARK);

    // --- body: long low-slung capsule-ish volume ---
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = 0.52;
    const torso = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.34, 10, 7)), bodyMat);
    torso.scale.set(1.0, 0.92, 1.75);
    this.bodyGroup.add(torso);
    const chest = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.26, 9, 6)), bodyMat);
    chest.position.set(0, 0.05, 0.42);
    chest.scale.set(0.95, 1.0, 1.05);
    this.bodyGroup.add(chest);
    const belly = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.30, 9, 6)), shadeMat);
    belly.position.set(0, -0.09, 0.02);
    belly.scale.set(0.9, 0.72, 1.6);
    this.bodyGroup.add(belly);
    this.object.add(this.bodyGroup);

    // --- head: skull + slender snout + dark-tipped ears ---
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.78, 0.62);
    const skull = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.20, 9, 7)), bodyMat);
    skull.scale.set(0.9, 0.92, 1.0);
    this.headGroup.add(skull);
    const snout = new THREE.Mesh(faceted(new THREE.ConeGeometry(0.10, 0.26, 6)), bodyMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.045, 0.24);
    this.headGroup.add(snout);
    const nose = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.035, 6, 5)), darkMat);
    nose.position.set(0, -0.045, 0.375);
    this.headGroup.add(nose);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(faceted(new THREE.ConeGeometry(0.065, 0.17, 5)), bodyMat);
      ear.position.set(side * 0.115, 0.19, -0.02);
      ear.rotation.z = -side * 0.28;
      this.headGroup.add(ear);
      const tip = new THREE.Mesh(faceted(new THREE.ConeGeometry(0.032, 0.07, 5)), darkMat);
      tip.position.set(side * 0.135, 0.255, -0.02);
      tip.rotation.z = -side * 0.28;
      this.headGroup.add(tip);
    }
    this.object.add(this.headGroup);

    // --- legs: hip pivot groups, dark paws ---
    const legDefs: { x: number; z: number; phase: number }[] = [
      { x: 0.17, z: 0.38, phase: 0 },             // front right
      { x: -0.17, z: 0.38, phase: Math.PI },      // front left
      { x: 0.16, z: -0.40, phase: Math.PI },      // rear right
      { x: -0.16, z: -0.40, phase: 0 },           // rear left
    ];
    for (const def of legDefs) {
      const hip = new THREE.Group();
      hip.position.set(def.x, 0.46, def.z);
      const upper = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.052, 0.042, 0.30, 6)), bodyMat);
      upper.position.y = -0.15;
      hip.add(upper);
      const paw = new THREE.Mesh(faceted(new THREE.BoxGeometry(0.085, 0.11, 0.12)), darkMat);
      paw.position.set(0, -0.36, 0.015);
      hip.add(paw);
      this.object.add(hip);
      this.legs.push({ hip, phase: def.phase });
    }

    // --- tail: the oversized bushy signature, chained in two pivots ---
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.62, -0.52);
    const tailBase = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.16, 8, 6)), bodyMat);
    tailBase.scale.set(0.85, 0.8, 1.5);
    tailBase.position.z = -0.18;
    this.tail.add(tailBase);
    this.tailMid = new THREE.Group();
    this.tailMid.position.set(0, 0.03, -0.42);
    const tailMidMesh = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.19, 8, 6)), bodyMat);
    tailMidMesh.scale.set(0.95, 0.9, 1.6);
    tailMidMesh.position.z = -0.2;
    this.tailMid.add(tailMidMesh);
    const tailTip = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.13, 7, 5)), shadeMat);
    tailTip.scale.set(0.8, 0.75, 1.3);
    tailTip.position.z = -0.52;
    this.tailMid.add(tailTip);
    this.tail.add(this.tailMid);
    this.tail.rotation.x = -0.5; // swept up, key-art silhouette
    this.object.add(this.tail);

    addOutline(this.object, { width: 0.9 });
  }

  /**
   * Drive the pose from the sim state: stride frequency/amplitude scale with
   * speed, the body rolls into a drift, the tail streams outward. Leaping
   * tucks the legs and pitches up; falling spreads the legs and drops the
   * nose. Idle breathing when nearly stopped. Deterministic in `t`;
   * allocates nothing.
   */
  update(t: number, run?: { speed01: number; lateralG01: number; drifting: boolean; leaping?: boolean; falling?: boolean }): void {
    const speed01 = run?.speed01 ?? 0;
    const lateral = run ? THREE.MathUtils.clamp(run.lateralG01, -1, 1) : 0;
    const stride = 2.2 + speed01 * 7.5;
    const amp = 0.10 + speed01 * 0.5;
    const bob = Math.sin(t * stride * 2) * 0.035 * speed01;
    const breathe = Math.sin(t * 2.2) * 0.012 * (1 - speed01);
    this.bodyGroup.scale.set(1 + breathe, 1 - breathe * 0.6, 1);
    this.bodyGroup.position.y = 0.52 + bob + (run?.drifting ? -0.05 : 0);
    // Roll into the carve; pitch with the leap, nose-drop on the fall.
    this.object.rotation.z = lateral * (run?.drifting ? 0.34 : 0.12);
    this.object.rotation.x = run?.leaping ? -0.22 : run?.falling ? 0.35 : 0;
    this.headGroup.rotation.y = Math.sin(t * 0.53) * 0.14 * (1 - speed01) + lateral * 0.25;
    this.headGroup.rotation.x = Math.sin(t * 0.71) * 0.05 - 0.02 + speed01 * 0.08;
    for (let li = 0; li < this.legs.length; li++) {
      const leg = this.legs[li];
      if (run?.leaping) {
        // Tuck: fronts fold back, rears extend — the key art's leap read.
        leg.hip.rotation.x = li < 2 ? -0.72 : 0.58;
      } else if (run?.falling) {
        leg.hip.rotation.x = li < 2 ? 0.5 : -0.5;
      } else {
        leg.hip.rotation.x = Math.sin(t * stride + leg.phase) * amp;
      }
    }
    this.tail.rotation.z = Math.sin(t * 1.1) * 0.08 * (1 - speed01) - lateral * 0.3;
    this.tail.rotation.x = -0.5 - speed01 * 0.25 + (run?.leaping ? 0.35 : 0);
    this.tailMid.rotation.y = Math.sin(t * 1.7) * 0.14 * (1 - speed01 * 0.5) - lateral * 0.2;
    this.tailMid.rotation.x = Math.sin(t * 0.9 + 1.3) * 0.06;
  }
}
