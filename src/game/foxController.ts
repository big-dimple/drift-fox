/**
 * foxController.ts — the fox's ground-truth simulation (60 Hz fixed step).
 *
 * Feel targets (derived from board-race boat.ts authority values, retuned
 * for a grounded fox: snappier yaw, grip-drift carve):
 *   auto full-speed run; Shift = claws-in grip drift (higher yaw authority,
 *   velocity direction lags heading = readable slip, frost charges);
 *   release = burst of speed (蹬冰); frost is the leap resource: full at a
 *   gate = scripted leap over the chasm (no flight physics branch), short
 *   or off-gate = fall. Action edges stay in the input contract; physics
 *   here only reads holds. One fox world transform is shared by render,
 *   collision and progress — this controller owns it.
 */
import * as THREE from 'three';
import type { BoatInput } from '../contracts';

export const FOX_TUNING = {
  cruiseSpeed: 24, // m/s auto-run settle
  accel: 18, // m/s² toward cruise
  boostSpeed: 35, // release-burst ceiling
  boostDecay: 5.0, // 1/s exponential decay back toward cruise
  yawRateMax: 2.3, // rad/s steering authority (boat: 2.0)
  driftYawRateMax: 3.6, // rad/s claws-in authority (boat drift: 2.85)
  yawResponse: 11, // 1/s yaw-rate approach
  gripAlign: 9.0, // 1/s velocity→heading alignment while running
  driftAlign: 1.9, // 1/s while drifting — the slip lag
  driftSpeedKeep: 0.992, // per-second retention while carving
  steerScrub: 0.35, // fraction of |steer| scrubbing speed per second
  frostPerRad: 0.16, // frost per radian of carve yaw at reference speed
  frostRefSpeed: 22,
  frostDecay: 0.005, // 1/s slow bleed when not drifting
  burstMin: 0.25, // min drift charge paying out a burst
  leapVyBase: 7.6, // m/s vertical pop of the scripted leap
  leapVyPerSpeed: 0.045, // plus a share of ground speed
  gravity: 9.8,
} as const;

export interface FoxState {
  readonly position: THREE.Vector3;
  heading: number; // facing, rad; 0 = +Z, positive turning left (CCW from above)
  velocityDir: number; // actual travel direction, rad
  speed: number;
  drifting: boolean;
  /** 0..1 leap resource, charged by carving. */
  frost: number;
  boosting: boolean;
  boostRemaining: number; // normalized 0..1
  lateralG: number;
  /** One-frame pulse on drift release (burst fired). */
  burstFired: boolean;
  /** Scripted leap over a chasm (gate + full frost). */
  leaping: boolean;
  leapT: number;
  /** Lost the chasm: falling until the director respawns the run. */
  falling: boolean;
  /** One-frame pulse when a leap lands cleanly. */
  landed: boolean;
}

export class FoxController {
  readonly state: FoxState = {
    position: new THREE.Vector3(),
    heading: 0,
    velocityDir: 0,
    speed: 0,
    drifting: false,
    frost: 0,
    boosting: false,
    boostRemaining: 0,
    lateralG: 0,
    burstFired: false,
    leaping: false,
    leapT: 0,
    falling: false,
    landed: false,
  };

  private yawRate = 0;
  private driftCharge = 0; // seconds-equivalent of carve paying into the burst
  private leapVy = 0;
  private fallVy = 0;
  private readonly groundY: (x: number, z: number) => number;

  constructor(groundY: (x: number, z: number) => number) {
    this.groundY = groundY;
  }

  /** Place the run (spawn/respawn). */
  place(x: number, z: number, heading: number): void {
    const st = this.state;
    st.position.set(x, this.groundY(x, z), z);
    st.heading = heading;
    st.velocityDir = heading;
    st.speed = 0;
    st.drifting = false;
    st.boosting = false;
    st.boostRemaining = 0;
    st.leaping = false;
    st.falling = false;
    st.landed = false;
    st.burstFired = false;
    st.lateralG = 0;
    this.yawRate = 0;
    this.driftCharge = 0;
  }

  /**
   * Begin the scripted leap (frost spent by the caller). Steering locks;
   * the arc clears the chasm and lands back on honest ground. Not a flight
   * physics branch — one ballistic arc, then ground truth resumes.
   */
  beginLeap(): void {
    const st = this.state;
    st.leaping = true;
    st.leapT = 0;
    st.landed = false;
    this.leapVy = FOX_TUNING.leapVyBase + st.speed * FOX_TUNING.leapVyPerSpeed;
  }

  /** Begin the fall into the chasm. */
  beginFall(): void {
    const st = this.state;
    st.falling = true;
    st.drifting = false;
    st.boosting = false;
    this.fallVy = 0;
  }

  /** One fixed step of ground truth. */
  step(dt: number, input: BoatInput): void {
    const st = this.state;
    st.burstFired = false;
    st.landed = false;

    if (st.falling) {
      this.fallVy -= FOX_TUNING.gravity * dt;
      st.position.y += this.fallVy * dt;
      st.position.x += Math.sin(st.velocityDir) * st.speed * dt * 0.4;
      st.position.z += Math.cos(st.velocityDir) * st.speed * dt * 0.4;
      return;
    }

    if (st.leaping) {
      st.leapT += dt;
      st.position.x += Math.sin(st.heading) * st.speed * dt;
      st.position.z += Math.cos(st.heading) * st.speed * dt;
      st.position.y += this.leapVy * dt;
      this.leapVy -= FOX_TUNING.gravity * dt;
      const ground = this.groundY(st.position.x, st.position.z);
      if (this.leapVy < 0 && st.position.y <= ground) {
        st.position.y = ground;
        st.leaping = false;
        st.landed = true;
        st.velocityDir = st.heading;
      }
      return;
    }

    // --- yaw authority -----------------------------------------------------
    const wasDrifting = st.drifting;
    st.drifting = input.drift && st.speed > 4;
    if (st.drifting && !wasDrifting) this.driftCharge = 0;
    if (!st.drifting && wasDrifting && this.driftCharge >= FOX_TUNING.burstMin) {
      // 蹬冰: the carve pays out as a straight-line burst.
      st.speed = Math.min(FOX_TUNING.boostSpeed,
        st.speed + 6 + this.driftCharge * 5);
      st.boosting = true;
      st.boostRemaining = 1;
      st.burstFired = true;
    }

    const yawMax = st.drifting ? FOX_TUNING.driftYawRateMax : FOX_TUNING.yawRateMax;
    const yawTarget = input.steer * yawMax;
    this.yawRate += (yawTarget - this.yawRate) * (1 - Math.exp(-FOX_TUNING.yawResponse * dt));
    st.heading += this.yawRate * dt;

    // --- velocity direction lags heading while drifting (the slip) --------
    const align = st.drifting ? FOX_TUNING.driftAlign : FOX_TUNING.gripAlign;
    let delta = st.heading - st.velocityDir;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    st.velocityDir += delta * (1 - Math.exp(-align * dt));

    // --- speed -------------------------------------------------------------
    if (st.boosting) {
      st.boostRemaining = Math.max(0, st.boostRemaining - dt * FOX_TUNING.boostDecay / 6);
      st.speed += (FOX_TUNING.cruiseSpeed - st.speed) * (1 - Math.exp(-FOX_TUNING.boostDecay * dt)) * 0.35;
      if (st.speed <= FOX_TUNING.cruiseSpeed + 0.5) st.boosting = false;
    }
    if (st.drifting) {
      st.speed *= Math.pow(FOX_TUNING.driftSpeedKeep, dt * 60);
      this.driftCharge += Math.abs(this.yawRate) * dt * (st.speed / FOX_TUNING.frostRefSpeed);
      st.frost = Math.min(1, st.frost + Math.abs(this.yawRate) * FOX_TUNING.frostPerRad * dt
        * (st.speed / FOX_TUNING.frostRefSpeed));
    } else {
      st.frost = Math.max(0, st.frost - FOX_TUNING.frostDecay * dt);
      const scrub = 1 - Math.abs(input.steer) * FOX_TUNING.steerScrub * dt;
      st.speed *= scrub;
    }
    st.speed += (FOX_TUNING.cruiseSpeed - st.speed) * (1 - Math.exp(-FOX_TUNING.accel * dt / FOX_TUNING.cruiseSpeed));

    // --- integrate position (shared world transform) ----------------------
    st.position.x += Math.sin(st.velocityDir) * st.speed * dt;
    st.position.z += Math.cos(st.velocityDir) * st.speed * dt;

    st.position.y = this.groundY(st.position.x, st.position.z);
    st.lateralG = this.yawRate * st.speed;
  }
}
