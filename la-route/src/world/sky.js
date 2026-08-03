/**
 * Ciel : dôme inversé avec dégradé peint — bleu profond au zénith, ambre
 * vers le soleil bas. Hors brouillard, derrière tout.
 */
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';

export function buildSky(scene) {
  const dome = MeshBuilder.CreateSphere('sky', { diameter: 1500, segments: 12, sideOrientation: 1 }, scene);
  const mat = new StandardMaterial('skyMat', scene);
  const tex = new DynamicTexture('skyTex', { width: 64, height: 256 }, scene, true);
  const g = tex.getContext();
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#131a28');
  grad.addColorStop(0.30, '#2a3348');
  grad.addColorStop(0.40, '#e8a25c');
  grad.addColorStop(0.46, '#b87a4a');
  grad.addColorStop(0.55, '#4a5a74');
  grad.addColorStop(0.70, '#1c3050');
  grad.addColorStop(1.0, '#0c1626');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 256);
  tex.update();
  mat.emissiveTexture = tex;
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  mat.fogEnabled = false;
  dome.material = mat;
  dome.infiniteDistance = true;
  dome.applyFog = false;
  dome.isPickable = false;
  return dome;
}
