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
import { createAurora } from './render/aurora';
import { createVista } from './render/vista';
import { createBackdrop } from './world/backdrop';
import { createSnowfield } from './world/snowfield';
import { loadProp } from './world/props';
import { Fox } from './game/fox';
import { FoxController, FOX_TUNING } from './game/foxController';
import { LAYER_ENERGY } from './contracts';
import gateUrl from './assets/models/gate.glb?url';
import vistaUrl from './assets/textures/keyart-vista-plate.png?url';

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

// A vast flat apron carries the snowfield out to the horizon so the vista
// band never shows a gap under the painting's ice line. Color sampled from
// the painting's far field.
const farGround = new THREE.Mesh(
  new THREE.CircleGeometry(4200, 48),
  createToonMaterial({ color: 0x9fc8e6, rimStrength: 0.2 }),
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -0.6;
stage.scene.add(farGround);

// The far scenery is the key art itself (awaited so harness screenshots are
// deterministic).
const vistaTexture = await new THREE.TextureLoader().loadAsync(vistaUrl);
const vista = createVista(vistaTexture);
stage.scene.add(vista.object);

// Near/mid scenery: glowing ravine, scattered ice shards.
const backdrop = createBackdrop();
stage.scene.add(backdrop.object);

// The fox runs the shared ground truth: the controller owns the world
// transform (render/collision/progress read it), the mesh mirrors it.
const fox = new Fox();
stage.scene.add(fox.object);
const foxSim = new FoxController(snowfield.height);
fox.object.position.copy(foxSim.state.position);

// The golden gate floats over the decorative ravine beyond the arena berm —
// the key art's focal point and the first asset off the Blender pipeline.
// Awaited so harness screenshots are deterministic.
const gate = await loadProp(gateUrl);
gate.scale.setScalar(1.8);
gate.position.set(-26, 2.0, 158);
stage.scene.add(gate);

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

const pipeline = createPostPipeline(stage.renderer, stage.scene, stage.camera, null, stage.quality);
stage.onResize((w, h, pr) => pipeline.setSize(w, h, pr));

const input = new Input();
const gamepad = new GamepadInput();

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

function renderFrame(dt: number): void {
  applyTimeOfDay();
  sky.update(loop.simTime, stage.camera.position);
  aurora.update(loop.simTime, stage.camera.position);
  vista.update(stage.camera.position);

  // Mirror the shared transform, then animate the pose from the sim state.
  const st = foxSim.state;
  fox.object.position.copy(st.position);
  fox.object.rotation.y = st.heading;
  fox.update(loop.simTime, {
    speed01: Math.min(1, st.speed / FOX_TUNING.boostSpeed),
    lateralG01: st.lateralG / 30,
    drifting: st.drifting,
  });
  if (st.burstFired) pipeline.pulse('boost');

  // Chase: sit back and above, look ahead of the fox. Seat instantly on the
  // first frame so screenshots are deterministic, then smooth.
  const fx = Math.sin(st.heading);
  const fz = Math.cos(st.heading);
  camGoal.set(st.position.x - fx * 5.6, st.position.y + 2.2, st.position.z - fz * 5.6);
  if (!cameraSeated) {
    stage.camera.position.copy(camGoal);
    cameraSeated = true;
  } else {
    stage.camera.position.lerp(camGoal, 1 - Math.exp(-9 * dt));
  }
  lookGoal.set(st.position.x + fx * 7.5, st.position.y + 1.0, st.position.z + fz * 7.5);
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
    // Keyboard is the baseline; a connected gamepad with live input wins.
    const kb = input.read(dt, false);
    gamepad.poll();
    const pad = gamepad.connected ? gamepad.read(false) : null;
    const live = pad && (pad.steer !== 0 || pad.drift || pad.flightTrigger) ? pad : kb;
    const inp = driveOverride && loop.simTime < driveOverride.until
      ? { throttle: 1, steer: driveOverride.steer, drift: driveOverride.drift, flightTrigger: false, airBrake: false }
      : live;
    foxSim.step(dt, inp);
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
  fox(): { x: number; z: number; speed: number; frost: number; heading: number; drifting: boolean };
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
    fox() {
      const st = foxSim.state;
      return {
        x: st.position.x,
        z: st.position.z,
        speed: st.speed,
        frost: st.frost,
        heading: st.heading,
        drifting: st.drifting,
      };
    },
    stats() {
      return {
        ...stage.stats(),
        activity: input.activitySerial,
        gamepadConnected: gamepad.connected ? 1 : 0,
      };
    },
  };
  (window as unknown as { __harness: HarnessBridge }).__harness = bridge;
}
