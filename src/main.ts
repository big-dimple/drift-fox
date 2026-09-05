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
import type { PostFxState } from './render/postPipeline';
import { createAurora } from './render/aurora';
import { createVista } from './render/vista';
import { createBackdrop } from './world/backdrop';
import { createSnowfield } from './world/snowfield';
import { loadProp } from './world/props';
import { Fox } from './game/fox';
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

// The golden gate floats over the ravine — the key art's focal point and the
// first asset off the Blender headless pipeline. Awaited so harness
// screenshots are deterministic.
const gate = await loadProp(gateUrl);
gate.scale.setScalar(1.8);
gate.position.set(-26, 2.0, 85);
stage.scene.add(gate);

// The fox, standing on the snow at the origin. Movement physics lands next
// in M1; the mesh and pose loop come first.
const fox = new Fox();
fox.object.position.set(0, snowfield.height(0, 0), 0);
stage.scene.add(fox.object);

// Emissive ravine rims live on the shared energy layer; the beauty camera
// must see them too (the bloom composer masks the layer itself per frame).
stage.camera.layers.enable(LAYER_ENERGY);

// Chase framing (the game's real camera): fox low in frame, the ravine, the
// floating gate and the painted skyline ahead.
stage.camera.position.set(1.1, snowfield.height(0, 0) + 1.7, -4.4);
stage.camera.lookAt(-0.5, 1.0, 10);

const pipeline = createPostPipeline(stage.renderer, stage.scene, stage.camera, null, stage.quality);
stage.onResize((w, h, pr) => pipeline.setSize(w, h, pr));

const input = new Input();
const gamepad = new GamepadInput();

const IDLE_FX: PostFxState = {
  boosting: false,
  flightPhase: 'surface',
  flightThrust: 0,
  flightPressure: 0,
  flightAirBrake: 0,
  drifting: false,
  boostCharge: 0,
};

function applyTimeOfDay(): void {
  sky.setTimeOfDay(timeOfDay.current, timeOfDay.blend);
  setToonTimeOfDay(timeOfDay.current, timeOfDay.blend);
  pipeline.setNightBlend(timeOfDay.blend);
}
applyTimeOfDay();

function renderFrame(dt: number): void {
  applyTimeOfDay();
  sky.update(loop.simTime, stage.camera.position);
  aurora.update(loop.simTime, stage.camera.position);
  vista.update(stage.camera.position);
  fox.update(loop.simTime);
  pipeline.update(dt, loop.simTime, IDLE_FX, 'running');
  pipeline.render();
}

let framesRendered = 0;
const loop = new Loop(
  (dt) => {
    timeOfDay.update(dt);
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
