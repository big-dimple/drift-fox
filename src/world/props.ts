/**
 * props.ts — load authored .glb props (Blender headless pipeline) and fold
 * them into the cel pipeline.
 *
 * Assets carry only semantic material names; the exact colors come from
 * PALETTE via MATERIAL_MAP, so palette discipline lives in code. Materials
 * named `energy_*` move to the bloom layer (LAYER_ENERGY). Every prop gets
 * inverted-hull ink outlines.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial } from '../render/toonMaterial';
import type { ToonOptions } from '../render/toonMaterial';
import { addOutline } from '../render/outline';
import { PALETTE } from '../core/palette';
import { LAYER_ENERGY } from '../contracts';

const MATERIAL_MAP: Record<string, ToonOptions> = {
  gold: { color: PALETTE.gold, rimStrength: 0.5, specThreshold: 0.9 },
  gold_dark: { color: PALETTE.goldDeep, rimStrength: 0.4 },
  energy_rune: { color: PALETTE.iceCyan, emissive: PALETTE.iceGlow, emissiveIntensity: 2.0, rimStrength: 0 },
  ice_cyan: { color: PALETTE.iceCyan, rimStrength: 0.3, specThreshold: 0.96 },
  ice_deep: { color: PALETTE.iceDeep, rimStrength: 0.25, specThreshold: 0.96 },
  snow_cap: { color: PALETTE.snowWhite, rimStrength: 0.2 },
  // The skinned fox (tools/blender/make_fox.py).
  fox_body: { color: PALETTE.foxWhite, rimStrength: 0.5 },
  fox_shade: { color: PALETTE.foxShade, rimStrength: 0.4 },
  fox_dark: { color: PALETTE.foxDark, rimStrength: 0.25 },
  // Fur shells: undercoat + sparse guard hairs (alpha-discard strands).
  fox_fur_1: { color: PALETTE.foxWhite, rimStrength: 0.55, furShell: 1 },
  fox_fur_2: { color: PALETTE.foxShade, rimStrength: 0.45, furShell: 2 },
};

export async function loadProp(url: string): Promise<THREE.Object3D> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  const unmapped = new Set<string>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = (mesh.material as THREE.Material)?.name ?? '';
    const opts = MATERIAL_MAP[name];
    if (!opts) unmapped.add(name || '(unnamed)');
    mesh.material = createToonMaterial(opts ?? { color: PALETTE.snowWhite });
    if (name.startsWith('energy_')) mesh.layers.set(LAYER_ENERGY);
  });
  if (unmapped.size > 0) {
    console.warn(`[props] unmapped material names in ${url}:`, [...unmapped].join(', '));
  }
  addOutline(root);
  return root;
}
