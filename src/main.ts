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
import { createBackdrop } from './world/backdrop';
import { loadProp } from './world/props';
import { LAYER_ENERGY } from './contracts';
import gateUrl from './assets/models/gate.glb?url';

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

// ---------------------------------------------------------------------------
// Snowfield: deterministic LowPoly dunes. White albedo reads near-white on
// the lit band and cyan-blue on the shade band (the toon shader hue-shifts
// shadows toward the sky), matching the key art's 白雪蓝影. Distance fog
// melts the far dunes into the pale horizon exactly like the reference.
// ---------------------------------------------------------------------------
function hash2(ix: number, iz: number): number {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function snowHeight(x: number, z: number): number {
  return (valueNoise(x / 16, z / 16) - 0.5) * 1.4 + (valueNoise(x / 52 + 31, z / 52 + 17) - 0.5) * 3.0;
}

// Past the day fog bands (260/760 m) extra ground detail is invisible, so a
// 900 m plane at 6.25 m facets is all the field we need.
const SNOW_MIN_H = -(0.7 + 1.5);
const SNOW_MAX_H = 0.7 + 1.5;
const snowGeo = new THREE.PlaneGeometry(900, 900, 144, 144);
snowGeo.rotateX(-Math.PI / 2);
const snowPositions = snowGeo.attributes.position;
for (let i = 0; i < snowPositions.count; i++) {
  snowPositions.setY(i, snowHeight(snowPositions.getX(i), snowPositions.getZ(i)));
}
// Per-vertex tint: crests pure white, troughs pale cyan — the key art's
// 白雪蓝影 patchwork, multiplied into the albedo by the toon shader.
const snowTint = new Float32Array(snowPositions.count * 3);
for (let i = 0; i < snowPositions.count; i++) {
  const f = (snowPositions.getY(i) - SNOW_MIN_H) / (SNOW_MAX_H - SNOW_MIN_H);
  snowTint[i * 3] = 0.62 + 0.38 * f;
  snowTint[i * 3 + 1] = 0.78 + 0.22 * f;
  snowTint[i * 3 + 2] = 1.0;
}
snowGeo.setAttribute('color', new THREE.BufferAttribute(snowTint, 3));
const snow = new THREE.Mesh(
  snowGeo.toNonIndexed(),
  createToonMaterial({ color: 0xffffff, rimStrength: 0.15, specColor: 0xcfe4f8, vertexColors: true }),
);
snow.geometry.computeVertexNormals();
stage.scene.add(snow);

// A vast flat apron carries the snowfield out to the horizon so the backdrop
// peaks and cliffs never float above a sky gap.
const farGround = new THREE.Mesh(
  new THREE.CircleGeometry(4200, 48),
  createToonMaterial({ color: 0xe8f4fd, rimStrength: 0.2 }),
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -0.6;
stage.scene.add(farGround);

// The key-art vista: skyline peaks, right-hand ice cliffs, glowing ravine.
const backdrop = createBackdrop();
stage.scene.add(backdrop.object);

// The golden gate floats over the ravine — the key art's focal point and the
// first asset off the Blender headless pipeline. Awaited so harness
// screenshots are deterministic.
const gate = await loadProp(gateUrl);
gate.scale.setScalar(1.5);
gate.position.set(-26, 2.0, 85);
stage.scene.add(gate);

// Emissive ravine rims live on the shared energy layer; the beauty camera
// must see them too (the bloom composer masks the layer itself per frame).
stage.camera.layers.enable(LAYER_ENERGY);

// Low chase vantage facing +Z: snow fills the lower frame, the ravine cuts
// the midfield, the ice wall looms frame right (-X world = screen right when
// facing +Z), peaks carry the skyline, aurora curtains arc overhead, and the
// warm horizon wash off-frame left keeps the 蓝金对比 without a sun disc.
stage.camera.position.set(0, snowHeight(0, 10) + 4.2, 10);
stage.camera.lookAt(-14, 8, 90);

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
