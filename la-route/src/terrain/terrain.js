/**
 * Terrain M2 : grille dense au centre + tablier lointain grossier.
 * M3 : un patch de 32 m à ~12,5 cm/vertex suit le joueur (l'esprit clipmap,
 * réduit à l'anneau utile) et lit le buffer de déformation au vertex ; le
 * terrain grossier plonge sous son emprise pour ne jamais crever les ornières.
 * Recentrage en deux phases (hauteurs, puis normales + upload) pour étaler
 * le coût CPU sur deux frames.
 */
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { height, roadQuery, ROAD_HALF, samples } from './road.js';
import { DeformPlugin } from './deformPlugin.js';

function buildGrid(scene, name, size, subdiv, cx, cz, hole) {
  const pos = new Float32Array((subdiv + 1) * (subdiv + 1) * 3);
  const uv = new Float32Array((subdiv + 1) * (subdiv + 1) * 2);
  const idx = new Uint32Array(subdiv * subdiv * 6);
  let p = 0, u = 0;
  for (let j = 0; j <= subdiv; j++) {
    for (let i = 0; i <= subdiv; i++) {
      const x = cx + (i / subdiv - 0.5) * size;
      const z = cz + (j / subdiv - 0.5) * size;
      pos[p++] = x; pos[p++] = height(x, z); pos[p++] = z;
      uv[u++] = x / 9.5; uv[u++] = z / 9.5;
    }
  }
  let k = 0;
  for (let j = 0; j < subdiv; j++) {
    for (let i = 0; i < subdiv; i++) {
      if (hole) {
        const qx = cx + ((i + 0.5) / subdiv - 0.5) * size;
        const qz = cz + ((j + 0.5) / subdiv - 0.5) * size;
        if (qx > hole.x0 && qx < hole.x1 && qz > hole.z0 && qz < hole.z1) continue;
      }
      const a = j * (subdiv + 1) + i, b = a + 1, c = a + subdiv + 1, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;
      idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
  }
  const usedIdx = idx.subarray(0, k);
  const normals = new Float32Array(pos.length);
  VertexData.ComputeNormals(pos, usedIdx, normals);
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = pos; vd.indices = usedIdx; vd.normals = normals; vd.uvs = uv;
  vd.applyToMesh(mesh);
  mesh.freezeWorldMatrix();
  return mesh;
}

function floorTexture(scene) {
  const tex = new DynamicTexture('floorTex', 512, scene, true);
  const g = tex.getContext();
  g.fillStyle = '#2a2e1f'; g.fillRect(0, 0, 512, 512);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5200; i++) {
    const v = rnd();
    g.fillStyle = v < 0.45 ? 'rgba(74,60,40,.35)' : v < 0.8 ? 'rgba(44,56,34,.4)' : 'rgba(18,16,10,.4)';
    const x = rnd() * 512, y = rnd() * 512, a = rnd() * Math.PI;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillRect(-3 - rnd() * 5, -0.8, 6 + rnd() * 10, 1.6);   // aiguilles
    g.restore();
  }
  for (let i = 0; i < 46; i++) {                             // plaques de mousse
    const x = rnd() * 512, y = rnd() * 512, r = 14 + rnd() * 34;
    const rg = g.createRadialGradient(x, y, 2, x, y, r);
    rg.addColorStop(0, 'rgba(58,74,42,.5)'); rg.addColorStop(1, 'rgba(58,74,42,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  tex.update();
  return tex;
}

function roadTexture(scene) {
  const tex = new DynamicTexture('roadTex', 512, scene, true);
  const g = tex.getContext();
  g.fillStyle = '#57493a'; g.fillRect(0, 0, 512, 512);
  let seed = 29;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(20,16,12,.35)' : 'rgba(120,104,84,.3)';
    g.fillRect(rnd() * 512, rnd() * 512, 1.5 + rnd() * 3, 1.5 + rnd() * 3);
  }
  // deux lignes d'usure des roues
  for (const cx of [512 * 0.3, 512 * 0.7]) {
    const grad = g.createLinearGradient(cx - 40, 0, cx + 40, 0);
    grad.addColorStop(0, 'rgba(30,25,18,0)');
    grad.addColorStop(0.5, 'rgba(30,25,18,.4)');
    grad.addColorStop(1, 'rgba(30,25,18,0)');
    g.fillStyle = grad; g.fillRect(cx - 40, 0, 80, 512);
  }
  // herbe médiane clairsemée
  for (let i = 0; i < 300; i++) {
    g.fillStyle = 'rgba(64,78,44,.5)';
    g.fillRect(512 * 0.5 - 14 + rnd() * 28, rnd() * 512, 1.6, 3.5 + rnd() * 4);
  }
  tex.update();
  return tex;
}

/* Patch de déformation : grille dense recentrée sur le joueur. */
function buildPatch(scene, deformState, floorTex) {
  const SIZE = 32, SUB = 256;                        // 12,5 cm / vertex
  const NV = (SUB + 1) * (SUB + 1);
  const pos = new Float32Array(NV * 3);
  const uv = new Float32Array(NV * 2);
  const nrm = new Float32Array(NV * 3);
  const idx = new Uint32Array(SUB * SUB * 6);
  let k = 0;
  for (let j = 0; j < SUB; j++) {
    for (let i = 0; i < SUB; i++) {
      const a = j * (SUB + 1) + i, b = a + 1, c = a + SUB + 1, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;
      idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
  }
  const mesh = new Mesh('deformPatch', scene);
  const fill = (cx, cz) => {
    let p = 0, u = 0;
    for (let j = 0; j <= SUB; j++) {
      for (let i = 0; i <= SUB; i++) {
        const x = cx + (i / SUB - 0.5) * SIZE;
        const z = cz + (j / SUB - 0.5) * SIZE;
        pos[p++] = x; pos[p++] = height(x, z); pos[p++] = z;
        uv[u++] = x / 9.5; uv[u++] = z / 9.5;
      }
    }
  };
  fill(deformState.patchX, deformState.patchZ);
  VertexData.ComputeNormals(pos, idx, nrm);
  const vd = new VertexData();
  vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uv;
  vd.applyToMesh(mesh, true);
  mesh.alwaysSelectAsActiveMesh = true;              // suit le joueur : pas de culling
  mesh.receiveShadows = true;

  const mat = new StandardMaterial('patchMat', scene);
  mat.diffuseTexture = floorTex;
  mat.specularColor = new Color3(0.015, 0.015, 0.015);
  mat.zOffset = -2;                                  // gagne les égalités de profondeur au bord
  new DeformPlugin(mat, deformState, { patch: true });
  mesh.material = mat;

  // recentrage en deux phases : 1) hauteurs CPU, 2) normales + upload GPU
  let phase = 0, tx = 0, tz = 0;
  deformState.patchHalf = SIZE / 2;
  const tick = (px, pz) => {
    if (phase === 0) {
      if (Math.max(Math.abs(px - deformState.patchX), Math.abs(pz - deformState.patchZ)) > 6) {
        tx = Math.round(px * 2) / 2; tz = Math.round(pz * 2) / 2;
        phase = 1;
      }
      return;
    }
    if (phase === 1) { fill(tx, tz); phase = 2; return; }
    VertexData.ComputeNormals(pos, idx, nrm);
    mesh.updateVerticesData(VertexBuffer.PositionKind, pos);
    mesh.updateVerticesData(VertexBuffer.NormalKind, nrm);
    mesh.updateVerticesData(VertexBuffer.UVKind, uv);
    deformState.patchX = tx; deformState.patchZ = tz; // les deux matériaux basculent la même frame
    phase = 0;
  };
  return { mesh, tick };
}

export function buildTerrain(scene, shadows, deformState) {
  // sol : centre dense (≈1,15 m/vertex), tablier lointain
  const inner = buildGrid(scene, 'terrainInner', 320, 278, -8, -110, null);
  const outer = buildGrid(scene, 'terrainOuter', 1100, 90, -8, -110,
    { x0: -166, x1: 150, z0: -268, z1: 48 });
  const mat = new StandardMaterial('terrainMat', scene);
  const floorTex = floorTexture(scene);
  mat.diffuseTexture = floorTex;
  mat.diffuseTexture.uScale = 1; mat.diffuseTexture.vScale = 1;
  mat.specularColor = new Color3(0.015, 0.015, 0.015);
  new DeformPlugin(mat, deformState);                // plongée sous le patch + ombrage des traces
  inner.material = mat; outer.material = mat;
  inner.receiveShadows = true;
  outer.receiveShadows = true;
  const patch = buildPatch(scene, deformState, floorTex);

  // ruban de route posé juste au-dessus du terrain sculpté
  const CROSS = [-1, 0, 1], LIFT = [0.05, 0.14, 0.05];
  const rpos = new Float32Array(samples.length * 3 * 3);
  const ruv = new Float32Array(samples.length * 3 * 2);
  const ridx = new Uint32Array((samples.length - 1) * 12);
  let p = 0, u = 0, k = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const nx = -s.tz, nz = s.tx;
    for (let c2 = 0; c2 < 3; c2++) {
      const px = s.x + nx * CROSS[c2] * ROAD_HALF;
      const pz = s.z + nz * CROSS[c2] * ROAD_HALF;
      rpos[p++] = px; rpos[p++] = s.y + LIFT[c2]; rpos[p++] = pz;
      ruv[u++] = (CROSS[c2] + 1) / 2; ruv[u++] = i * 0.16;
    }
  }
  for (let i = 0; i < samples.length - 1; i++) {
    for (let c2 = 0; c2 < 2; c2++) {
      const a = i * 3 + c2, b = a + 1, c3 = a + 3, d = a + 4;
      ridx[k++] = a; ridx[k++] = b; ridx[k++] = c3;
      ridx[k++] = b; ridx[k++] = d; ridx[k++] = c3;
    }
  }
  const rnorm = new Float32Array(rpos.length);
  VertexData.ComputeNormals(rpos, ridx, rnorm);
  const road = new Mesh('road', scene);
  const rvd = new VertexData();
  rvd.positions = rpos; rvd.indices = ridx; rvd.normals = rnorm; rvd.uvs = ruv;
  rvd.applyToMesh(road);
  const rmat = new StandardMaterial('roadMat', scene);
  rmat.diffuseTexture = roadTexture(scene);
  rmat.specularColor = new Color3(0.03, 0.03, 0.03);
  road.material = rmat;
  road.receiveShadows = true;
  road.freezeWorldMatrix();

  // affleurements rocheux épars (silhouette de mi-distance)
  const rockMat = new StandardMaterial('rockMat', scene);
  rockMat.diffuseColor = new Color3(0.32, 0.34, 0.38);
  rockMat.specularColor = new Color3(0.05, 0.05, 0.05);
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 10; i++) {
    const x = (rnd() - 0.5) * 260 - 8, z = -rnd() * 220 + 10;
    if (roadQuery(x, z).dist < 12) continue;
    const s = 1.2 + rnd() * 2.6;
    const rock = MeshBuilder.CreateIcoSphere('rock' + i, { radius: s, subdivisions: 1 }, scene);
    rock.position.set(x, height(x, z) + s * 0.18, z);
    rock.scaling.set(1 + rnd() * 0.7, 0.45 + rnd() * 0.25, 1 + rnd() * 0.7);
    rock.rotation.y = rnd() * Math.PI;
    rock.material = rockMat;
    rock.receiveShadows = true;
    shadows.addShadowCaster(rock);
    rock.freezeWorldMatrix();
  }
  return { inner, outer, road, patchTick: patch.tick };
}
