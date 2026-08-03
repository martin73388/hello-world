/**
 * Pins en thin instances : un maillage de feuillage + un de tronc, mêmes
 * matrices. Placement déterministe, la route et ses talus restent libres.
 * (Le vent hiérarchique — tronc/branche/aiguille — est un chantier M2b :
 * consigné dans DECISIONS.md.)
 */
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { height, roadQuery } from '../terrain/road.js';

export function plantPines(scene, shadows) {
  // gabarit feuillage : 3 étages de cône
  const c1 = MeshBuilder.CreateCylinder('c1', { diameterTop: 0, diameterBottom: 3.1, height: 2.6, tessellation: 10 }, scene);
  c1.position.y = 2.4;
  const c2 = c1.clone('c2'); c2.scaling.setAll(0.78); c2.position.y = 3.6;
  const c3 = c1.clone('c3'); c3.scaling.setAll(0.55); c3.position.y = 4.7;
  const foliage = Mesh.MergeMeshes([c1, c2, c3], true, true);
  foliage.name = 'pineFoliage';
  const fmat = new StandardMaterial('pineMat', scene);
  fmat.diffuseColor = new Color3(0.115, 0.2, 0.135);
  fmat.specularColor = new Color3(0.02, 0.03, 0.02);
  foliage.material = fmat;

  const trunk = MeshBuilder.CreateCylinder('pineTrunk', { diameterTop: 0.22, diameterBottom: 0.34, height: 2.4, tessellation: 7 }, scene);
  trunk.position.y = 0;
  trunk.bakeCurrentTransformIntoVertices();
  trunk.position.y = 1.2;
  trunk.bakeCurrentTransformIntoVertices();
  const tmat = new StandardMaterial('trunkMat', scene);
  tmat.diffuseColor = new Color3(0.21, 0.15, 0.1);
  tmat.specularColor = new Color3(0.02, 0.02, 0.02);
  trunk.material = tmat;

  // placement
  let seed = 17;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mats = [];
  const q = new Quaternion(), sc = new Vector3(), tr = new Vector3();
  for (let i = 0; i < 9000 && mats.length < 1900; i++) {
    const x = (rnd() - 0.5) * 330 - 8;
    const z = 40 - rnd() * 320;
    const rq = roadQuery(x, z);
    if (rq.dist < 6.5) continue;                       // la route respire
    const s = 0.75 + rnd() * 1.15;
    const y = height(x, z) - 0.08;
    Quaternion.RotationYawPitchRollToRef(rnd() * Math.PI * 2, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06, q);
    sc.set(s, s * (0.9 + rnd() * 0.3), s);
    tr.set(x, y, z);
    const m = Matrix.Compose(sc, q, tr);
    mats.push(m);
  }
  const buf = new Float32Array(mats.length * 16);
  for (let i = 0; i < mats.length; i++) mats[i].copyToArray(buf, i * 16);
  foliage.thinInstanceSetBuffer('matrix', buf, 16, true);
  trunk.thinInstanceSetBuffer('matrix', buf, 16, true);
  foliage.receiveShadows = true;
  shadows.addShadowCaster(foliage);
  shadows.addShadowCaster(trunk);
  return { count: mats.length };
}
