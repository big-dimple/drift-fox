/**
 * main.ts — M0 boot: an empty LowPoly snowfield under the key-art sky
 * (bright arctic day + aurora curtains + white snow with cyan-blue shade).
 *
 * Wires the ported foundation together: Stage (renderer/camera/quality
 * governor), Sky + toon time-of-day blend, the post pipeline (no ink prepass
 * until M1's fox exists), the 60 Hz fixed-step loop, and the unified input
 * contracts (constructed here to prove the contract; gameplay consumes them
 * in M1). `?harness=1` exposes the smoke-test bridge.
 */
import * as THREE from 'three';
import { Stage, resolveQualityMode } from './core/stage';
import { Loop } from './core/loop';
import { Input } from './core/input';
import { GamepadInput } from './core/gamepadInput';
import { TimeOfDayManager } from './core/timeOfDay';
import { Sky } from './render/sky';
import { createToonMaterial, setToonTimeOfDay } from './render/toonMaterial';
import { createPostPipeline } from './render/postPipeline';
import { PrePass } from './render/prePass';
import { createAurora } from './render/aurora';
import { createVista } from './render/vista';
import { createBackdrop } from './world/backdrop';
import { createSnowfield } from './world/snowfield';
import { createCourse } from './world/course';
import { loadProp } from './world/props';
import { Fox } from './game/fox';
import { FoxController, FOX_TUNING } from './game/foxController';
import { CourseDirector } from './game/courseDirector';
import { ClawMarks } from './game/clawMarks';
import { ColdAir } from './game/coldAir';
import { FrostHud } from './hud/frostHud';
import { RunHud } from './hud/runHud';
import { TouchInput } from './core/touchInput';
import { LAYER_ENERGY, markInk } from './contracts';
import gateUrl from './assets/models/gate.glb?url';
import foxUrl from './assets/models/fox.glb?url';
import vistaUrl from './assets/textures/vista-dome.png?url';

const params = new URLSearchParams(window.location.search);
const app = document.getElementById('app');
if (!app) throw new Error('#app container missing');

// The key-art vista is the bright arctic day; ?tod=night only for pipeline
// debugging.
const timeOfDay = new TimeOfDayManager(params.get('tod') ?? 'day');
const stage = new Stage(app, resolveQualityMode(params.get('quality')));
const sky = new Sky();
stage.scene.add(sky.object);
const aurora = createAurora();
stage.scene.add(aurora.object);

// The snowfield (dunes + key-art ice streaks) lives in world/snowfield.ts;
// its height function is the ground truth for both renderer and sim.
const snowfield = createSnowfield();
stage.scene.add(snowfield.object);

// A vast ring apron carries the snowfield out to the horizon so the vista
// band never shows a gap under the painting's ice line — a ring, not a disc,
// so it never paves over the chasm. Color sampled from the painting's field.
const farGround = new THREE.Mesh(
  new THREE.RingGeometry(455, 4200, 48),
  createToonMaterial({ color: 0x9fc8e6, rimStrength: 0.2 }),
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -0.6;
stage.scene.add(farGround);

// The far scenery is the key art wrapped on a full sphere (awaited so
// harness screenshots are deterministic). World-fixed: it never turns.
const vistaTexture = await new THREE.TextureLoader().loadAsync(vistaUrl);
const vista = createVista(vistaTexture);
stage.scene.add(vista.object);

// Near/mid scenery: scattered ice shards.
const backdrop = createBackdrop();
stage.scene.add(backdrop.object);

// The golden gate proto — first asset off the Blender pipeline. Awaited so
// harness screenshots are deterministic. The course clones it five times
// onto the chasm crossings.
const gateProto = await loadProp(gateUrl);
markInk(gateProto);

// The M2 run: serpentine course, chasm rims, five gates.
const course = createCourse(gateProto);
stage.scene.add(course.object);

// The fox runs the shared ground truth: the controller owns the world
// transform (render/collision/progress read it), the skinned mesh mirrors
// it. Awaited like the gate so harness screenshots stay deterministic.
const fox = await Fox.load(foxUrl);
markInk(fox.object);
stage.scene.add(fox.object);
const foxSim = new FoxController(snowfield.height);
const clawMarks = new ClawMarks();
stage.scene.add(clawMarks.object);
const coldAir = new ColdAir();
stage.scene.add(coldAir.object);
const frostHud = new FrostHud();

const director = new CourseDirector(course, foxSim, {
  onLeap: () => pipeline.pulse('launch'),
  onLand: () => pipeline.pulse('gate'),
  onFall: () => pipeline.pulse('defeat'),
  onRespawn: () => pipeline.pulse('ready'),
  onFinish: () => pipeline.pulse('finish'),
});
director.reset();
fox.object.position.copy(foxSim.state.position);

// Emissive ravine rims live on the shared energy layer; the beauty camera
// must see them too (the bloom composer masks the layer itself per frame).
stage.camera.layers.enable(LAYER_ENERGY);

// Chase camera, seeded behind the fox.
stage.camera.position.set(
  foxSim.state.position.x,
  foxSim.state.position.y + 2.2,
  foxSim.state.position.z - 5.6,
);
stage.camera.lookAt(foxSim.state.position.x, foxSim.state.position.y + 1, foxSim.state.position.z + 8);

const prePass = new PrePass(4, 4);
const pipeline = createPostPipeline(stage.renderer, stage.scene, stage.camera, prePass, stage.quality);
stage.onResize((w, h, pr) => {
  pipeline.setSize(w, h, pr);
  prePass.setSize(w * pr, h * pr);
});

const input = new Input();
const gamepad = new GamepadInput();
const touch = new TouchInput();
const runHud = new RunHud(() => director.reset());
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') director.reset();
});

function applyTimeOfDay(): void {
  sky.setTimeOfDay(timeOfDay.current, timeOfDay.blend);
  setToonTimeOfDay(timeOfDay.current, timeOfDay.blend);
  pipeline.setNightBlend(timeOfDay.blend);
}
applyTimeOfDay();

const camTmp = new THREE.Vector3();
const camGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
let cameraSeated = false;
let viewMode: 'chase' | 'closeup' = 'chase';

function renderFrame(dt: number): void {
  applyTimeOfDay();
  sky.update(loop.simTime, stage.camera.position);
  aurora.update(loop.simTime, stage.camera.position);
  // The vista dome and aurora are world-fixed: only their position follows
  // the camera, so turning never slides the scenery.
  vista.update(stage.camera.position);

  // Mirror the shared transform, then animate the pose from the sim state.
  const st = foxSim.state;
  fox.object.position.copy(st.position);
  fox.object.rotation.y = st.heading;
  fox.update(loop.simTime, {
    speed01: Math.min(1, st.speed / FOX_TUNING.boostSpeed),
    lateralG01: st.lateralG / 30,
    drifting: st.drifting,
    leaping: st.leaping,
    falling: st.falling,
  });
  if (st.burstFired) pipeline.pulse('boost');
  frostHud.update(st.frost);
  const run = director.run;
  runHud.update(run, st.frost >= 0.98, st.falling, touch.active);

  // Chase: sit back and above, look ahead of the fox. During leaps and falls
  // the camera holds its height over the GROUND, not the fox — the player
  // sees the gap open beneath the arc (the key art framing). Seat instantly
  // on the first frame so screenshots are deterministic, then smooth.
  const fx = Math.sin(st.heading);
  const fz = Math.cos(st.heading);
  if (viewMode === 'closeup') {
    // Art-review closeup: park at the fox's front-left, chest height.
    const a = st.heading + 2.55;
    camGoal.set(
      st.position.x + Math.sin(a) * 2.3,
      st.position.y + 0.85,
      st.position.z + Math.cos(a) * 2.3,
    );
    lookGoal.set(st.position.x, st.position.y + 0.6, st.position.z);
  } else {
    const camBaseY = (st.leaping || st.falling)
      ? snowfield.height(st.position.x, st.position.z) + 2.6
      : st.position.y + 2.2;
    camGoal.set(st.position.x - fx * 5.6, camBaseY, st.position.z - fz * 5.6);
    lookGoal.set(st.position.x + fx * 7.5, st.position.y + 1.0, st.position.z + fz * 7.5);
  }
  if (!cameraSeated) {
    stage.camera.position.copy(camGoal);
    cameraSeated = true;
  } else {
    stage.camera.position.lerp(camGoal, 1 - Math.exp(-9 * dt));
  }
  camTmp.copy(lookGoal);
  stage.camera.lookAt(camTmp);

  pipeline.update(dt, loop.simTime, {
    boosting: st.boosting,
    flightPhase: 'surface',
    flightThrust: 0,
    flightPressure: Math.min(1, st.speed / FOX_TUNING.boostSpeed),
    flightAirBrake: 0,
    drifting: st.drifting,
    boostCharge: st.frost,
  }, 'running');
  pipeline.render();
}

let framesRendered = 0;
// Synthetic input override for the harness (deterministic gameplay shots
// and contract assertions). Expires by sim time.
let driveOverride: { steer: number; drift: boolean; until: number } | null = null;

const loop = new Loop(
  (dt) => {
    timeOfDay.update(dt);
    // Priority: synthetic harness drive > touch > gamepad > keyboard.
    let inp: { throttle: number; steer: number; drift: boolean; flightTrigger: boolean; airBrake: boolean };
    if (driveOverride && loop.simTime < driveOverride.until) {
      inp = { throttle: 1, steer: driveOverride.steer, drift: driveOverride.drift, flightTrigger: false, airBrake: false };
    } else {
      const touchState = touch.read();
      if (touchState) {
        inp = { throttle: 1, steer: touchState.steer, drift: touchState.drift, flightTrigger: false, airBrake: false };
      } else {
        gamepad.poll();
        const pad = gamepad.connected ? gamepad.read(false) : null;
        const kb = input.read(dt, false);
        inp = pad && (pad.steer !== 0 || pad.drift || pad.flightTrigger) ? pad : kb;
      }
    }
    foxSim.step(dt, inp);
    director.update(dt);
    clawMarks.update(dt, foxSim.state.position.x, foxSim.state.position.z,
      foxSim.state.velocityDir, foxSim.state.speed, foxSim.state.drifting, snowfield.height);
    coldAir.update(dt, foxSim.state.position.x, foxSim.state.position.z,
      foxSim.state.velocityDir, foxSim.state.speed, foxSim.state.drifting, snowfield.height);
  },
  (frameMs) => {
    stage.updatePerf(frameMs);
    renderFrame(frameMs / 1000);
    framesRendered++;
  },
);
loop.start();

interface HarnessBridge {
  readonly ready: boolean;
  render(): void;
  advance(seconds: number): void;
  drive(steer: number, drift: boolean, seconds: number): void;
  warpToGate(index: number, frost: number, speed?: number): void;
  resetRun(): void;
  view(mode: 'chase' | 'closeup'): void;
  course(): { gatesPassed: number; falls: number; finished: boolean; raceTime: number };
  fox(): { x: number; z: number; speed: number; frost: number; heading: number; drifting: boolean; leaping: boolean; falling: boolean };
  stats(): Record<string, number | string>;
}

if (params.get('harness') === '1') {
  const bridge: HarnessBridge = {
    get ready() {
      return framesRendered > 0;
    },
    render() {
      renderFrame(1 / 60);
    },
    advance(seconds: number) {
      loop.advance(seconds);
    },
    drive(steer: number, drift: boolean, seconds: number) {
      driveOverride = { steer, drift, until: loop.simTime + seconds };
    },
    warpToGate(index: number, frost: number, speed = 0) {
      director.debugWarpToGate(index, frost, speed);
    },
    resetRun() {
      director.reset();
    },
    view(mode) {
      viewMode = mode;
    },
    course() {
      return director.run;
    },
    fox() {
      const st = foxSim.state;
      return {
        x: st.position.x,
        z: st.position.z,
        speed: st.speed,
        frost: st.frost,
        heading: st.heading,
        drifting: st.drifting,
        leaping: st.leaping,
        falling: st.falling,
      };
    },
    stats() {
      return {
        ...stage.stats(),
        activity: input.activitySerial,
        gamepadConnected: gamepad.connected ? 1 : 0,
        clawMarks: clawMarks.alive,
        coldAir: coldAir.alive,
      };
    },
  };
  (window as unknown as { __harness: HarnessBridge }).__harness = bridge;
}
