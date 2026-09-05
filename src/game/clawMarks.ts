/**
 * clawMarks.ts — the grip-drift's signature: claw streaks carved into the
 * snow. A pooled InstancedMesh of short dark streaks stamped under the rear
 * paws while drifting; each mark fades toward the snow color over its life.
 * Allocations happen once at construction — the per-frame path writes into
 * preallocated buffers only.
 */
import * as THREE from 'three';

const POOL = 240;
const LIFE = 7; // seconds
const STAMP_EVERY_M = 0.45; // travel distance between stamps
const MARK_LEN = 0.8;
const MARK_W = 0.10;
const INK = new THREE.Color(0x2e5a9e);
const GONE = new THREE.Color(0xe6f0fa);
const UP = new THREE.Vector3(0, 1, 0);

export class ClawMarks {
  readonly object: THREE.InstancedMesh;
  private readonly age = new Float32Array(POOL).fill(-1);
  private head = 0;
  private travel = 0;
  private aliveCount = 0;
  private readonly mtx = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3(1, 1, 1);
  private readonly col = new THREE.Color();

  constructor() {
    const geo = new THREE.PlaneGeometry(MARK_W, MARK_LEN);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.object = new THREE.InstancedMesh(geo, mat, POOL);
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.renderOrder = 6; // over the streak overlay
    this.object.frustumCulled = false;
    this.pos.set(0, -50, 0);
    this.mtx.compose(this.pos, this.quat, this.scl);
    for (let i = 0; i < POOL; i++) {
      this.object.setMatrixAt(i, this.mtx);
      this.object.setColorAt(i, GONE);
    }
    this.object.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }

  get alive(): number {
    return this.aliveCount;
  }

  /**
   * Stamp while the fox carves (drifting, speed>6), every STAMP_EVERY_M of
   * travel. Two streaks, one under each rear paw.
   */
  update(dt: number, x: number, z: number, dirRad: number, speed: number,
    drifting: boolean, groundY: (x: number, z: number) => number): void {
    let dirty = false;
    for (let i = 0; i < POOL; i++) {
      if (this.age[i] < 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= LIFE) {
        this.age[i] = -1;
        this.aliveCount = Math.max(0, this.aliveCount - 1);
        this.pos.set(0, -50, 0);
        this.mtx.compose(this.pos, this.quat, this.scl);
        this.object.setMatrixAt(i, this.mtx);
        dirty = true;
        continue;
      }
      const f = this.age[i] / LIFE;
      this.col.lerpColors(INK, GONE, f * f);
      this.object.setColorAt(i, this.col);
      dirty = true;
    }

    if (drifting && speed > 6) {
      this.travel += speed * dt;
      if (this.travel >= STAMP_EVERY_M) {
        this.travel = 0;
        const px = Math.cos(dirRad); // perpendicular to travel
        const pz = -Math.sin(dirRad);
        for (const side of [-1, 1]) {
          this.stamp(x + px * 0.16 * side, z + pz * 0.16 * side, dirRad, groundY);
        }
        dirty = true;
      }
    }

    if (dirty) {
      this.object.instanceMatrix.needsUpdate = true;
      if (this.object.instanceColor) this.object.instanceColor.needsUpdate = true;
    }
  }

  private stamp(x: number, z: number, dirRad: number, groundY: (x: number, z: number) => number): void {
    const i = this.head;
    this.head = (this.head + 1) % POOL;
    if (this.age[i] < 0) this.aliveCount++;
    this.age[i] = 0;
    this.pos.set(x, groundY(x, z) + 0.10, z);
    this.quat.setFromAxisAngle(UP, dirRad);
    this.mtx.compose(this.pos, this.quat, this.scl);
    this.object.setMatrixAt(i, this.mtx);
    this.object.setColorAt(i, INK);
  }
}
