/**
 * courseDirector.ts — owns the run: gate crossings, leaps, falls, respawns,
 * finish. Reads the fox's shared state, calls the controller's leap/fall/
 * place primitives, and emits presentation pulses through hooks. Frost is
 * spent here (the only place allowed to write it besides the controller's
 * charge/decay).
 */
import { FoxController } from './foxController';
import type { Course } from '../world/course';

export interface DirectorHooks {
  onLeap(gateIndex: number): void;
  onLand(): void;
  onFall(): void;
  onRespawn(): void;
  onFinish(raceTime: number): void;
}

export interface RunState {
  gatesPassed: number;
  falls: number;
  finished: boolean;
  raceTime: number;
}

export class CourseDirector {
  private readonly course: Course;
  private readonly fox: FoxController;
  private readonly hooks: DirectorHooks;
  private _gatesPassed = 0;
  private _falls = 0;
  private _finished = false;
  private _raceTime = 0;
  private landPending = false;

  constructor(course: Course, fox: FoxController, hooks: DirectorHooks) {
    this.course = course;
    this.fox = fox;
    this.hooks = hooks;
  }

  get run(): RunState {
    return {
      gatesPassed: this._gatesPassed,
      falls: this._falls,
      finished: this._finished,
      raceTime: this._raceTime,
    };
  }

  reset(): void {
    this._gatesPassed = 0;
    this._falls = 0;
    this._finished = false;
    this._raceTime = 0;
    this.landPending = false;
    this.fox.state.frost = 0;
    const s = this.course.start;
    this.fox.place(s.x, s.z, s.heading);
  }

  /** Harness/debug: drop the fox on a gate approach with chosen charge/speed. */
  debugWarpToGate(index: number, frost: number, speed = 0): void {
    const g = this.course.gates[Math.max(0, Math.min(this.course.gates.length - 1, index))];
    this._gatesPassed = g.index;
    this.fox.state.frost = frost;
    this.fox.place(g.respawn.x, g.respawn.z, g.respawn.heading);
    this.fox.state.speed = speed;
  }

  update(dt: number): void {
    const st = this.fox.state;
    if (!this._finished) this._raceTime += dt;

    if (st.falling) {
      if (st.position.y < -16) {
        this._falls++;
        const g = this.course.gates[Math.min(this._gatesPassed, this.course.gates.length - 1)];
        st.frost = 0.6;
        this.fox.place(g.respawn.x, g.respawn.z, g.respawn.heading);
        this.hooks.onFall();
        this.hooks.onRespawn();
      }
      return;
    }

    if (st.leaping) {
      this.landPending = true;
      return;
    }
    if (this.landPending) {
      this.landPending = false;
      this.hooks.onLand();
    }

    // The ground dropped out from under the run: begin the fall.
    if (st.position.y < -4) {
      this.fox.beginFall();
      return;
    }

    if (this._finished) return;
    const gate = this.course.gates[this._gatesPassed];
    if (!gate) return;
    const dx = st.position.x - gate.x;
    const dz = st.position.z - gate.z;
    if (dx * dx + dz * dz < 9.5 * 9.5) {
      // 满格才能飞跃 — binary, no tiers; 0.98 absorbs the decay ride-in.
      if (st.frost >= 0.98) {
        st.frost = 0; // the leap spends the full charge — 寒气不分档
        this.fox.beginLeap();
        this._gatesPassed++;
        this.landPending = true;
        this.hooks.onLeap(gate.index);
        if (this._gatesPassed >= this.course.gates.length) {
          this._finished = true;
          this.hooks.onFinish(this._raceTime);
        }
      }
      // Short on frost the fox simply runs past the gate and meets the chasm.
    }
  }
}
