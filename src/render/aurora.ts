/**
 * aurora.ts — stylized aurora curtains for the day-sky color script.
 *
 * The key art hangs teal-green aurora ribbons across a bright blue arctic
 * sky; realism (auroras only show at night) is deliberately ignored — this
 * is the arcade color contract. Ribbons are additive, camera-following, and
 * sway slowly with deterministic phases so screenshots stay reproducible.
 * M0 ships the minimal shape; M3 owns density/motion tuning.
 */
import * as THREE from 'three';

export interface Aurora {
  readonly object: THREE.Object3D;
  /** Follow the camera (dome illusion) and advance the sway. Allocates nothing. */
  update(t: number, camPos: THREE.Vector3): void;
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uPhase;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 p = position;
  // Curtains hang from their top edge: the sway grows toward the bottom.
  float sway = sin(uv.x * 6.0 + uTime * 0.21 + uPhase) * 36.0
             + sin(uv.x * 14.0 - uTime * 0.13 + uPhase * 1.7) * 14.0;
  p.y += sway * (1.0 - uv.y * 0.7);
  p.z += sin(uv.x * 4.0 + uTime * 0.09 + uPhase) * 24.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uPhase;
varying vec2 vUv;

void main() {
  // The lower edge of a real curtain is never straight: fold a slow wave
  // into the vertical profile so the hem ripples along the ribbon.
  float hem = vUv.y + 0.38 * sin(vUv.x * 4.0 + uPhase + uTime * 0.10)
                   + 0.16 * sin(vUv.x * 11.0 - uTime * 0.17 + uPhase * 2.0);
  float curtain = smoothstep(0.0, 0.06, hem) * (1.0 - smoothstep(0.25, 0.95, hem));
  // Broad brightness envelope, so the ribbon breathes in long stretches.
  float envelope = 0.60 + 0.40 * sin(vUv.x * 3.1 + uPhase + uTime * 0.06);
  // Fine vertical rays — texture only, never blocks.
  float rays = 0.92 + 0.08 * sin(vUv.x * 220.0 + uPhase * 7.0 + uTime * 0.4);
  // Deep teal -> green drift along the ribbon.
  vec3 teal = vec3(0.05, 0.85, 0.70);
  vec3 green = vec3(0.22, 1.00, 0.38);
  vec3 col = mix(teal, green, 0.5 + 0.5 * sin(vUv.x * 3.0 + uPhase + uTime * 0.05));
  float alpha = curtain * envelope * rays * 0.42;
  gl_FragColor = vec4(col, alpha);
}
`;

interface RibbonDef {
  readonly width: number;
  readonly height: number;
  readonly pos: readonly [number, number, number];
  readonly rotY: number;
  readonly tilt: number;
  readonly roll: number;
  readonly phase: number;
}

/** Three parallax curtains sweeping across the forward (+Z) sky. */
const RIBBONS: readonly RibbonDef[] = [
  { width: 3800, height: 260, pos: [-350, 820, 1500], rotY: 0.10, tilt: -0.12, roll: 0.10, phase: 0.0 },
  { width: 2800, height: 190, pos: [600, 980, 1850], rotY: -0.22, tilt: -0.10, roll: -0.07, phase: 2.3 },
  { width: 2000, height: 130, pos: [-150, 1120, 2150], rotY: 0.05, tilt: -0.08, roll: 0.05, phase: 4.1 },
];

export function createAurora(): Aurora {
  const group = new THREE.Group();
  group.name = 'aurora';
  const materials: THREE.ShaderMaterial[] = [];
  for (const def of RIBBONS) {
    const material = new THREE.ShaderMaterial({
      name: 'AuroraRibbon',
      uniforms: {
        uTime: { value: 0 },
        uPhase: { value: def.phase },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(def.width, def.height, 96, 8), material);
    ribbon.position.set(def.pos[0], def.pos[1], def.pos[2]);
    ribbon.rotation.order = 'YXZ';
    ribbon.rotation.y = def.rotY;
    ribbon.rotation.x = def.tilt;
    ribbon.rotation.z = def.roll;
    ribbon.frustumCulled = false;
    ribbon.renderOrder = -500; // over the sky dome (renderOrder -1000), under the clouds
    group.add(ribbon);
    materials.push(material);
  }
  return {
    object: group,
    update(t: number, camPos: THREE.Vector3): void {
      group.position.set(camPos.x, 0, camPos.z);
      for (const material of materials) material.uniforms.uTime.value = t;
    },
  };
}
