/**
 * vista.ts — the key art as a full-sphere sky dome (no edges, ever).
 *
 * The vista-dome texture (tools/make_vista_dome.py) wraps the painting's
 * sky/aurora/peaks/horizon band around a complete sphere: zenith gradient
 * above, snow haze below the horizon. MirroredRepeatWrapping tiles the
 * painting three times around the compass with mirrored seams, so the world
 * reads as painted in EVERY direction — turning never reveals an edge.
 *
 * The dome is world-fixed in rotation (it does NOT follow the fox heading)
 * and only re-centers on the camera position, reading as infinite distance.
 * Colors are verbatim: NoColorSpace texture, MeshBasicMaterial, no fog —
 * the dome IS the art direction, the toon pipeline must not re-shade it.
 */
import * as THREE from 'three';

export interface Vista {
  readonly object: THREE.Object3D;
  /** Follow the camera position so the dome reads as infinite distance. */
  update(camPos: THREE.Vector3): void;
}

const RADIUS = 2600;
/** Painting tiles around the compass (mirrored, so seams are symmetric). */
const TILES = 3;

export function createVista(texture: THREE.Texture): Vista {
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // Sphere UV: +Z (spawn heading) samples u=0.25; with 3 mirrored tiles the
  // offset below lands the painting's hero twin peaks (plate x~0.6) there.
  texture.repeat.set(TILES, 1);
  texture.offset.set(0.6233, 0);
  const geometry = new THREE.SphereGeometry(RADIUS, 72, 36);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -900; // after the sky dome (-1000), before the world
  dome.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'vista';
  group.add(dome);
  return {
    object: group,
    update(camPos: THREE.Vector3): void {
      group.position.set(camPos.x, 0, camPos.z);
    },
  };
}
