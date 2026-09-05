/**
 * fox.ts — the arctic fox, a SKINNED character.
 *
 * The mesh + armature come from tools/blender/make_fox.py (one continuous
 * tube-built skin, 19 bones, hand-assigned weights — no primitive parts, no
 * "shoe" paws). This class loads the GLB, remaps the semantic materials to
 * PALETTE/toon via the shared prop loader, and drives the bones at render
 * rate with a pose state machine:
 *
 *   idle / run (trot <-> gallop by speed, real quadruped footfalls)
 *   drift (claws planted, NO leg cycling — braced carve)
 *   leap / fall
 *
 * Bone rotations are authored in fox space (+Z forward, +Y up, +X left) and
 * conjugated into each bone's rest frame, so the rig tolerates any bone
 * axis conventions the exporter produces. Deterministic given the same
 * (t, run) sequence; allocates nothing per frame after load.
 */
import * as THREE from 'three';
import { loadProp } from '../world/props';

export interface FoxRunState {
  speed01: number;
  lateralG01: number;
  drifting: boolean;
  leaping?: boolean;
  falling?: boolean;
}

type BoneName =
  | 'pelvis' | 'chest' | 'neck' | 'head'
  | 'tail_1' | 'tail_2' | 'tail_3'
  | 'fl_shoulder' | 'fl_forearm' | 'fl_paw'
  | 'fr_shoulder' | 'fr_forearm' | 'fr_paw'
  | 'rl_thigh' | 'rl_shin' | 'rl_paw'
  | 'rr_thigh' | 'rr_shin' | 'rr_paw';

const BONE_NAMES: readonly BoneName[] = [
  'pelvis', 'chest', 'neck', 'head',
  'tail_1', 'tail_2', 'tail_3',
  'fl_shoulder', 'fl_forearm', 'fl_paw',
  'fr_shoulder', 'fr_forearm', 'fr_paw',
  'rl_thigh', 'rl_shin', 'rl_paw',
  'rr_thigh', 'rr_shin', 'rr_paw',
];

interface DrivenBone {
  readonly bone: THREE.Object3D;
  readonly restLocal: THREE.Quaternion;
  readonly parentWorld: THREE.Quaternion;
  readonly parentWorldInv: THREE.Quaternion;
}

const TWO_PI = Math.PI * 2;

/** Accumulated fox-space euler pose for every driven bone. */
class PoseBuffer {
  readonly data = new Float32Array(BONE_NAMES.length * 3);

  reset(): void {
    this.data.fill(0);
  }

  add(name: BoneName, x: number, y: number, z: number): void {
    const i = BONE_NAMES.indexOf(name) * 3;
    this.data[i] += x;
    this.data[i + 1] += y;
    this.data[i + 2] += z;
  }
}

export class Fox {
  readonly object: THREE.Group;
  /** Inner rig: body bob / crouch offsets without touching the sim transform. */
  private readonly rig: THREE.Object3D;
  private readonly driven: DrivenBone[] = [];
  private readonly pose = new PoseBuffer();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpConv = new THREE.Quaternion();

  // Pose blend weights (smoothed).
  private wRun = 1;
  private wDrift = 0;
  private wLeap = 0;
  private wFall = 0;
  private wIdle = 0;
  private wGallop = 0;
  private stridePhase = 0;
  private lastT = -1;

  private constructor(rig: THREE.Object3D) {
    this.object = new THREE.Group();
    this.object.name = 'fox';
    this.rig = rig;
    this.object.add(rig);
  }

  static async load(url: string): Promise<Fox> {
    const root = await loadProp(url);
    const fox = new Fox(root);
    // Capture rest pose with the fox at identity so fox-space pose math has a
    // stable reference frame.
    root.updateMatrixWorld(true);
    for (const name of BONE_NAMES) {
      const bone = root.getObjectByName(name);
      if (!bone) throw new Error(`fox rig missing bone: ${name}`);
      const parentWorld = new THREE.Quaternion();
      (bone.parent as THREE.Object3D).getWorldQuaternion(parentWorld);
      fox.driven.push({
        bone,
        restLocal: bone.quaternion.clone(),
        parentWorld,
        parentWorldInv: parentWorld.clone().invert(),
      });
    }
    root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
    });
    return fox;
  }

  /**
   * Drive the pose from the sim state. Quadruped gait while running; planted
   * brace while drifting (claws dug in — legs never cycle); tuck on the
   * leap; splay on the fall; idle breathing when nearly stopped.
   */
  update(t: number, run?: FoxRunState): void {
    const dt = this.lastT < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;

    const speed01 = run?.speed01 ?? 0;
    const lateral = THREE.MathUtils.clamp(run?.lateralG01 ?? 0, -1, 1);

    // --- pose weights -------------------------------------------------------
    const tFall = run?.falling ? 1 : 0;
    const tLeap = !tFall && run?.leaping ? 1 : 0;
    const tDrift = !tFall && !tLeap && run?.drifting ? 1 : 0;
    const tIdle = !tFall && !tLeap && !tDrift && speed01 < 0.08 ? 1 : 0;
    const tRun = 1 - Math.min(1, tFall + tLeap + tDrift + tIdle);
    const k = 1 - Math.exp(-10 * dt);
    this.wFall += (tFall - this.wFall) * k;
    this.wLeap += (tLeap - this.wLeap) * k;
    this.wDrift += (tDrift - this.wDrift) * k;
    this.wIdle += (tIdle - this.wIdle) * k;
    this.wRun += (tRun - this.wRun) * k;
    const tGallop = THREE.MathUtils.smoothstep(speed01, 0.4, 0.62);
    this.wGallop += (tGallop - this.wGallop) * k;

    // Stride phase advances at the blended gait frequency so transitions
    // never pop.
    const freq = THREE.MathUtils.lerp(2.1, 4.1, this.wGallop) * (0.25 + speed01 * 0.75);
    this.stridePhase += dt * freq * TWO_PI * this.wRun * (1 - this.wIdle);
    const phi = this.stridePhase;

    const p = this.pose;
    p.reset();

    this.poseRun(p, phi, speed01);
    this.poseDrift(p, lateral);
    this.poseLeap(p);
    this.poseFall(p, t);
    this.poseIdle(p, t);

    // --- apply blended pose to bones ----------------------------------------
    const w = this.wRun + this.wDrift + this.wLeap + this.wFall + this.wIdle || 1;
    for (const b of this.driven) {
      const i = BONE_NAMES.indexOf(b.bone.name as BoneName) * 3;
      this.tmpEuler.set(p.data[i] / w, p.data[i + 1] / w, p.data[i + 2] / w);
      this.tmpQ.setFromEuler(this.tmpEuler);
      this.tmpConv.copy(b.parentWorldInv).multiply(this.tmpQ).multiply(b.parentWorld);
      b.bone.quaternion.copy(this.tmpConv).multiply(b.restLocal);
    }

    // --- object-level motion ------------------------------------------------
    const g = this.wGallop * this.wRun;
    const bob = g * 0.045 * Math.sin(phi + 1.2);
    const breathe = this.wIdle * Math.sin(t * 2.2) * 0.012;
    this.rig.position.y = bob + breathe - 0.10 * this.wDrift;
    this.object.rotation.z = lateral * (0.12 * this.wRun + 0.26 * this.wDrift);
    this.object.rotation.x = -0.16 * this.wLeap + 0.3 * this.wFall;
  }

  /** Quadruped locomotion: trot at low speed, gallop (with spine flex and a
   * suspension moment) at speed. Per-leg phase offsets blend between gaits. */
  private poseRun(p: PoseBuffer, phi: number, speed01: number): void {
    const w = this.wRun * (1 - this.wIdle);
    if (w < 1e-4) return;
    const g = this.wGallop;
    const swingAmp = THREE.MathUtils.lerp(0.5, 0.8, g);
    const foldAmp = THREE.MathUtils.lerp(0.7, 1.1, g);

    const legs: [BoneName, BoneName, BoneName, number, boolean][] = [
      ['fl_shoulder', 'fl_forearm', 'fl_paw', THREE.MathUtils.lerp(0, 0.55, g), false],
      ['fr_shoulder', 'fr_forearm', 'fr_paw', THREE.MathUtils.lerp(0.5, 0.67, g), false],
      ['rl_thigh', 'rl_shin', 'rl_paw', THREE.MathUtils.lerp(0.5, 0.0, g), true],
      ['rr_thigh', 'rr_shin', 'rr_paw', THREE.MathUtils.lerp(0, 0.12, g), true],
    ];
    for (const [hip, mid, paw, off, rear] of legs) {
      const a = phi + TWO_PI * off;
      const swing = Math.sin(a);
      const fold = Math.max(0, Math.sin(a + 0.45 * Math.PI));
      p.add(hip, -swing * swingAmp * w, 0, 0);
      p.add(mid, fold * foldAmp * w * (rear ? 0.9 : 1.0), 0, 0);
      p.add(paw, -fold * foldAmp * 0.55 * w - swing * 0.15 * w, 0, 0);
    }

    // Gallop spine flex: pelvis and chest counter-pitch, neck stabilizes.
    p.add('pelvis', g * 0.14 * Math.sin(phi + 2.6) * w, 0, 0);
    p.add('chest', g * 0.12 * Math.sin(phi + 0.9) * w, 0, 0);
    p.add('neck', -g * 0.10 * Math.sin(phi + 0.9) * w, 0, 0);
    p.add('tail_1', g * 0.12 * Math.sin(phi + 3.4) * w, 0, 0);
    // Trot residual: tiny diagonal body rock.
    p.add('pelvis', 0, 0, (1 - g) * 0.03 * Math.sin(phi * 2) * w);
    // Tail streams with speed.
    p.add('tail_1', -speed01 * 0.3 * w, 0, 0);
    p.add('tail_2', -speed01 * 0.12 * w, 0, 0);
    // Head counters the body pitch so the gaze stays level.
    p.add('head', -g * 0.06 * Math.sin(phi + 0.9) * w, 0, 0);
  }

  /** Claws-in carve: legs planted and splayed, body low, spine twisted into
   * the turn, head looking through the corner, tail swung out as ballast.
   * Zero leg cycling — that is the whole point of the grip drift. */
  private poseDrift(p: PoseBuffer, lateral: number): void {
    const d = this.wDrift;
    if (d < 1e-4) return;
    const lat = lateral;

    p.add('pelvis', 0.06 * d, -0.10 * lat * d, 0.10 * lat * d);
    p.add('chest', 0.04 * d, 0.20 * lat * d, 0.14 * lat * d);
    p.add('neck', 0.02 * d, 0.24 * lat * d, 0);
    p.add('head', 0.10 * d, 0.18 * lat * d, 0);

    // Brace: fronts reach forward-out, rears push back-out; elbows/hocks
    // flexed so the paws stay planted flat on the snow.
    p.add('fl_shoulder', -0.34 * d, 0, 0.30 * d);
    p.add('fl_forearm', 0.38 * d, 0, 0.10 * d);
    p.add('fl_paw', -0.15 * d, 0, 0);
    p.add('fr_shoulder', -0.34 * d, 0, -0.30 * d);
    p.add('fr_forearm', 0.38 * d, 0, -0.10 * d);
    p.add('fr_paw', -0.15 * d, 0, 0);
    p.add('rl_thigh', 0.30 * d, 0, 0.34 * d);
    p.add('rl_shin', 0.30 * d, 0, 0.08 * d);
    p.add('rl_paw', -0.18 * d, 0, 0);
    p.add('rr_thigh', 0.30 * d, 0, -0.34 * d);
    p.add('rr_shin', 0.30 * d, 0, -0.08 * d);
    p.add('rr_paw', -0.18 * d, 0, 0);

    // Tail swings out of the turn as a counterweight, lifted clear of snow.
    p.add('tail_1', -0.18 * d, 0, -0.5 * lat * d);
    p.add('tail_2', -0.08 * d, 0, -0.28 * lat * d);
  }

  /** Leap: fronts folded under the chest, rears extended off the tailboard,
   * spine arched, tail streamed up. */
  private poseLeap(p: PoseBuffer): void {
    const l = this.wLeap;
    if (l < 1e-4) return;
    p.add('fl_shoulder', -0.95 * l, 0, 0.15 * l);
    p.add('fl_forearm', 1.25 * l, 0, 0);
    p.add('fl_paw', -0.5 * l, 0, 0);
    p.add('fr_shoulder', -0.95 * l, 0, -0.15 * l);
    p.add('fr_forearm', 1.25 * l, 0, 0);
    p.add('fr_paw', -0.5 * l, 0, 0);
    p.add('rl_thigh', 0.75 * l, 0, 0.12 * l);
    p.add('rl_shin', -0.3 * l, 0, 0);
    p.add('rl_paw', 0.25 * l, 0, 0);
    p.add('rr_thigh', 0.75 * l, 0, -0.12 * l);
    p.add('rr_shin', -0.3 * l, 0, 0);
    p.add('rr_paw', 0.25 * l, 0, 0);
    p.add('pelvis', -0.12 * l, 0, 0);
    p.add('chest', 0.14 * l, 0, 0);
    p.add('neck', -0.12 * l, 0, 0);
    p.add('tail_1', -0.35 * l, 0, 0);
    p.add('tail_2', -0.15 * l, 0, 0);
  }

  /** Fall: legs splayed, spine extended, tail up. */
  private poseFall(p: PoseBuffer, t: number): void {
    const f = this.wFall;
    if (f < 1e-4) return;
    const flail = Math.sin(t * 9) * 0.15 * f;
    p.add('fl_shoulder', -0.4 * f + flail, 0, 0.55 * f);
    p.add('fr_shoulder', -0.4 * f - flail, 0, -0.55 * f);
    p.add('fl_forearm', 0.5 * f, 0, 0);
    p.add('fr_forearm', 0.5 * f, 0, 0);
    p.add('rl_thigh', 0.5 * f - flail, 0, 0.55 * f);
    p.add('rr_thigh', 0.5 * f + flail, 0, -0.55 * f);
    p.add('rl_shin', 0.35 * f, 0, 0);
    p.add('rr_shin', 0.35 * f, 0, 0);
    p.add('chest', 0.18 * f, 0, 0);
    p.add('neck', -0.25 * f, 0, 0);
    p.add('head', -0.15 * f, 0, 0);
    p.add('tail_1', -0.45 * f, 0, 0);
    p.add('tail_2', -0.2 * f, 0, 0);
  }

  /** Idle: breathing chest, slow head scan, tail sway. */
  private poseIdle(p: PoseBuffer, t: number): void {
    const w = this.wIdle;
    if (w < 1e-4) return;
    p.add('chest', Math.sin(t * 2.2) * 0.02 * w, 0, 0);
    p.add('head', Math.sin(t * 0.71) * 0.04 * w, Math.sin(t * 0.53) * 0.16 * w, 0);
    p.add('neck', 0, Math.sin(t * 0.53) * 0.08 * w, 0);
    p.add('tail_1', 0, 0, Math.sin(t * 1.1) * 0.10 * w);
    p.add('tail_2', 0, 0, Math.sin(t * 1.1 + 0.8) * 0.14 * w);
  }
}
