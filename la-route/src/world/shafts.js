/**
 * Les rais de lumière — des lames translucides plantées le long de l'axe du
 * soleil, qui ne deviennent visibles que lorsqu'on regarde vers lui, et
 * seulement quand il rase. C'est la contrefaçon honnête du volumétrique :
 * pas de ray-marching, mais l'effet qui compte — des colonnes de lumière
 * poussiéreuse entre les troncs, à l'aube et au couchant.
 * Elles s'ancrent aux troncs proches (un rai part de derrière un arbre) et
 * s'effacent complètement à midi, la nuit, et dès qu'on tourne le dos.
 */
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

const N = 16;

/** une lame : bande verticale au bord fondu, plus dense en haut */
function shaftTexture(scene) {
  const tex = new DynamicTexture('shaftTex', { width: 64, height: 128 }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, 64, 128);
  // horizontalement : fondu sur les deux bords, cœur plein
  const gx = g.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)');
  gx.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  gx.addColorStop(0.5, 'rgba(255,255,255,1)');
  gx.addColorStop(0.65, 'rgba(255,255,255,0.85)');
  gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx; g.fillRect(0, 0, 64, 128);
  // verticalement : le rai naît fort dans la canopée et se dilue en bas
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, 128);
  gy.addColorStop(0, 'rgba(0,0,0,0)');
  gy.addColorStop(0.22, 'rgba(0,0,0,1)');
  gy.addColorStop(0.62, 'rgba(0,0,0,0.5)');
  gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0, 0, 64, 128);
  g.globalCompositeOperation = 'source-over';
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export function buildShafts(scene, trunks, groundHeight) {
  const plane = MeshBuilder.CreatePlane('shafts', { width: 1, height: 1 }, scene);
  const mat = new StandardMaterial('shaftsM', scene);
  const tex = shaftTexture(scene);
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.emissiveColor = new Color3(1, 0.88, 0.62);
  mat.alphaMode = 1;                                 // ADDITIF : de la lumière
  mat.alpha = 0;
  // fogEnabled=false : c'est le drapeau que applyHaze() lit pour NE PAS
  // greffer la brume sur ce matériau. Sans lui, le plugin de brume se posait
  // sur un matériau à `disableLighting` — donc sans vPositionW déclaré — le
  // shader ne compilait pas et le maillage n'était JAMAIS dessiné. Les rais
  // existaient, se plaçaient, s'allumaient dans la bonne fenêtre solaire, et
  // ne s'affichaient pas. `plane.applyFog` ne suffit pas : il porte sur le
  // maillage, applyHaze() inspecte les MATÉRIAUX.
  mat.fogEnabled = false;
  plane.material = mat;
  plane.applyFog = false;
  plane.isPickable = false;
  plane.alwaysSelectAsActiveMesh = true;
  plane.alphaIndex = 900;                            // par-dessus la forêt
  plane.receiveShadows = false;

  const buf = new Float32Array(N * 16);
  plane.thinInstanceSetBuffer('matrix', buf, 16, false);

  let s = 41;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const slots = [];
  for (let i = 0; i < N; i++) {
    // hauteur calée sur la CANOPÉE, qui est montée à 12 m avec les nouveaux
    // pins : des lames de 9 m ne descendaient plus du feuillage, elles
    // flottaient à mi-tronc
    slots.push({ ox: 0, oz: 0, w: 2.0 + rnd() * 4.2, h: 15 + rnd() * 10, ph: rnd() * 6.3, live: false });
  }
  let reseed = 1e9, seedX = 1e9, seedZ = 1e9;

  const q = new Quaternion(), sc = new Vector3(), tr = new Vector3(), m = new Matrix();

  /**
   * @param sunY   hauteur du soleil : les rais n'existent qu'en lumière rasante
   * @param camYaw cap caméra ; sunAz azimut du soleil
   */
  function update(dt, px, pz, sunY, sunAz, camYaw, clear) {
    // fenêtre d'existence : rasant (0 → 0.42), rien la nuit ni à midi
    const graze = Math.max(0, Math.min(1, sunY / 0.1))
      * Math.max(0, Math.min(1, (0.46 - sunY) / 0.16));
    // et seulement si on regarde VERS le soleil
    let d = (camYaw + Math.PI - sunAz) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    const facing = Math.max(0, Math.min(1, (1.5 - Math.abs(d)) / 0.9));
    const amt = graze * facing * clear;
    mat.alpha = amt * 0.5;
    if (amt <= 0.002) return;                        // rien à animer

    // Les rais s'accrochent à des troncs proches, comme si la lumière passait
    // derrière eux. Le déclencheur est le DÉPLACEMENT, pas seulement un
    // minuteur : sur un minuteur de 2,5 s de temps simulé, il suffisait de
    // marcher un peu pour que les lames restent plantées 80 m en arrière,
    // hors champ — les rais existaient et ne se voyaient jamais.
    reseed += dt;
    if (reseed > 2.5 || Math.hypot(px - seedX, pz - seedZ) > 6) {
      reseed = 0; seedX = px; seedZ = pz;
      let k = 0;
      for (let i = 0; i < trunks.length && k < N; i += 7) {
        const t = trunks[i];
        const dx = t.x - px, dz = t.z - pz;
        const dd = dx * dx + dz * dz;
        if (dd > 25 && dd < 1600) {                  // entre 5 et 40 m
          slots[k].ox = t.x; slots[k].oz = t.z; slots[k].live = true; k++;
        }
      }
      for (; k < N; k++) slots[k].live = false;
    }

    // la lame est perpendiculaire au regard, donc toujours de face
    Quaternion.RotationYawPitchRollToRef(camYaw + Math.PI, 0, 0, q);
    for (let i = 0; i < N; i++) {
      const c = slots[i];
      if (!c.live) { sc.set(0, 0, 0); tr.set(0, -999, 0); }
      else {
        // largeur qui respire : la poussière bouge dans le faisceau
        const br = 0.82 + 0.18 * Math.sin(c.ph + performance.now() * 0.0004);
        sc.set(c.w * br, c.h, 1);
        // le pied de la lame reste au sol, le sommet monte dans le feuillage
        tr.set(c.ox, groundHeight(c.ox, c.oz) + c.h * 0.46, c.oz);
      }
      Matrix.ComposeToRef(sc, q, tr, m);
      m.copyToArray(buf, i * 16);
    }
    plane.thinInstanceBufferUpdated('matrix');
  }

  return { update, slots };            // slots exposés : diagnostic depuis la console
}
