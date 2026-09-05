/**
 * coldAir.ts — the drift's second voice: cyan breath/kicked-frost particles
 * streaming off the carving fox. Pooled THREE.Points with a custom point
 * shader (per-particle alpha); all buffers preallocated, the per-frame path
 * only writes typed arrays.
 */
import * as THREE from 'three';

const POOL = 360;
const EMIT_PER_SECOND = 130;

const vertexShader = /* glsl */ `
attribute float aAlpha;
attribute float aSize;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (280.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float soft = 1.0 - smoothstep(0.10, 0.5, d);
  gl_FragColor = vec4(uColor, vAlpha * soft);
}
`;

export class ColdAir {
  readonly object: THREE.Points;
  private readonly pos: Float32Array = new Float32Array(POOL * 3);
  private readonly vel: Float32Array = new Float32Array(POOL * 3);
  private readonly life = new Float32Array(POOL).fill(-1);
  private readonly maxLife = new Float32Array(POOL).fill(1);
  private readonly alpha = new Float32Array(POOL);
  private readonly sizes = new Float32Array(POOL);
  private head = 0;
  private emitAccum = 0;
  private aliveCount = 0;
  private seed = 421;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      name: 'ColdAir',
      uniforms: { uColor: { value: new THREE.Color(0x6fd8ff) } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Points(geo, mat);
    this.object.renderOrder = 7;
    this.object.frustumCulled = false;
    for (let i = 0; i < POOL; i++) this.pos[i * 3 + 1] = -50;
  }

  get alive(): number {
    return this.aliveCount;
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number,
    life: number, size: number): void {
    const i = this.head;
    this.head = (this.head + 1) % POOL;
    if (this.life[i] < 0) this.aliveCount++;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.sizes[i] = size;
  }

  /** Emit cold air off the rear paws while carving. */
  update(dt: number, x: number, z: number, dirRad: number, speed: number,
    drifting: boolean, groundY: (x: number, z: number) => number): void {
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] < 0) continue;
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.life[i] = -1;
        this.aliveCount = Math.max(0, this.aliveCount - 1);
        this.pos[i * 3 + 1] = -50;
        this.alpha[i] = 0;
        continue;
      }
      const f = this.life[i] / this.maxLife[i];
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] += 0.9 * dt; // cold breath buoys upward
      this.alpha[i] = (1 - f) * 0.68;
    }

    if (drifting && speed > 6) {
      this.emitAccum += EMIT_PER_SECOND * dt;
      const px = Math.cos(dirRad);
      const pz = -Math.sin(dirRad);
      const bx = -Math.sin(dirRad);
      const bz = -Math.cos(dirRad);
      const y = groundY(x, z);
      while (this.emitAccum >= 1) {
        this.emitAccum -= 1;
        const side = this.rnd() > 0.5 ? 1 : -1;
        this.emit(
          x + px * 0.17 * side + bx * -0.3,
          y + 0.12,
          z + pz * 0.17 * side + bz * -0.3,
          bx * speed * 0.22 + (this.rnd() - 0.5) * 1.6,
          0.7 + this.rnd() * 1.1,
          bz * speed * 0.22 + (this.rnd() - 0.5) * 1.6,
          0.45 + this.rnd() * 0.5,
          0.55 + this.rnd() * 0.55,
        );
      }
    }

    this.object.geometry.attributes.position.needsUpdate = true;
    this.object.geometry.attributes.aAlpha.needsUpdate = true;
    this.object.geometry.attributes.aSize.needsUpdate = true;
  }
}
