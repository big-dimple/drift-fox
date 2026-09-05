/**
 * vista.ts — the key art itself as the far scenery (matte-painting band).
 *
 * The painting (src/assets/textures/keyart-vista.png) carries the sky,
 * aurora, skyline peaks and far ice walls — none of that needs to be 3D.
 * It is wrapped onto a tall camera-following cylinder band around the
 * forward horizon, so it reads as infinitely distant while the snowfield,
 * ravine, gate and (later) the fox stay real geometry with parallax.
 *
 * The band renders keyart-vista-plate.png: the painting with its own gate
 * and fox patched out (they return as real 3D), and only down to the
 * horizon glow (v window 0.50..1.0) so the painted snowfield never shows.
 * Colors are verbatim: NoColorSpace texture, MeshBasicMaterial, no fog —
 * the band IS the art direction, the toon pipeline must not re-shade it.
 */
import * as THREE from 'three';

export interface Vista {
  readonly object: THREE.Object3D;
  /** Follow the camera so the band reads as infinite distance. */
  update(camPos: THREE.Vector3): void;
}

const RADIUS = 2600;
const HEIGHT = 2600;
/** Arc covered by the painting around +Z (radians). */
const THETA = 2.2;
/** Vertical window of the plate: sky down to the horizon glow, skipping the
 * painting's darkest top strokes so the band melts into the dome. */
const V_OFFSET = 0.50;
const V_REPEAT = 0.97 - V_OFFSET;

export function createVista(texture: THREE.Texture): Vista {
  texture.colorSpace = THREE.NoColorSpace;
  texture.repeat.set(-1, V_REPEAT); // cylinder seen from inside mirrors U
  texture.offset.set(1, V_OFFSET);
  const geometry = new THREE.CylinderGeometry(
    RADIUS, RADIUS, HEIGHT, 72, 1, true,
    -THETA / 2, THETA,
  );
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const band = new THREE.Mesh(geometry, material);
  band.position.y = HEIGHT / 2 - 80; // horizon window tucks below y=0, top edge past 44° elevation // horizon window tucks below y=0
  band.renderOrder = -900; // after the sky dome (-1000), before the world
  band.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'vista';
  group.add(band);
  return {
    object: group,
    update(camPos: THREE.Vector3): void {
      group.position.set(camPos.x, 0, camPos.z);
    },
  };
}
