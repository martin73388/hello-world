/**
 * Les nuages — des CARTES en billboard, comme les faisaient les consoles 32
 * bits : une trentaine de quads dispersés sur un anneau très large autour du
 * joueur, chacun portant un cumulus peint (grappe de disques éclairés par le
 * haut, ventre gris-bleu). Ils tournent toujours face à la caméra, dérivent
 * avec le vent et suivent le joueur en gardant leur parallaxe.
 *
 * Pourquoi pas un dôme texturé : le ciel en occupe déjà un, et à 700 m de
 * distance la précision du depth buffer ne sépare plus les deux surfaces —
 * les nuages disparaissaient derrière le ciel. Des cartes bien plus proches
 * (250 à 400 m) n'ont pas ce problème.
 */
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

const TW = 256, TH = 128;

/** un cumulus peint : grappe de disques, sommet blanc, ventre gris-bleu */
function cumulusTexture(scene, name, seed) {
  const tex = new DynamicTexture(name, { width: TW, height: TH }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, TW, TH);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const puffs = 16 + Math.floor(rnd() * 12);
  for (let i = 0; i < puffs; i++) {
    const t = i / (puffs - 1) - 0.5;
    // silhouette : base plate en bas, bosses arrondies vers le haut
    const r = (16 + rnd() * 26) * (1 - Math.abs(t) * 0.6);
    const px = TW * 0.5 + t * TW * 0.78 + (rnd() - 0.5) * 14;
    const py = TH * 0.72 - Math.max(0, 1 - Math.abs(t) * 2.0) * r * 0.85
      - rnd() * 10;
    // le dégradé est décalé vers le haut : le soleil vient d'en haut, le
    // ventre reste dans l'ombre du nuage — c'est ce qui donne le volume
    const gr = g.createRadialGradient(px, py - r * 0.45, r * 0.1, px, py, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.98)');
    gr.addColorStop(0.5, 'rgba(240,243,250,0.9)');
    gr.addColorStop(0.82, 'rgba(186,198,216,0.55)');
    gr.addColorStop(1, 'rgba(164,178,200,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
  }
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

const N = 26;

export function buildClouds(scene) {
  // trois silhouettes différentes, réparties sur les cartes
  const texes = [
    cumulusTexture(scene, 'cumulus0', 17),
    cumulusTexture(scene, 'cumulus1', 91),
    cumulusTexture(scene, 'cumulus2', 233),
  ];
  const banks = [];
  const state = [];                                  // {ang, dist, y, w, h, kind}
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    state.push({
      ang: rnd() * Math.PI * 2,
      dist: 420 + rnd() * 380,
      y: 150 + rnd() * 180,
      w: 190 + rnd() * 260,
      kind: i % 3,
      drift: 0.0032 + rnd() * 0.0026,
    });
  }

  const mats = [];
  for (let k = 0; k < 3; k++) {
    const plane = MeshBuilder.CreatePlane('cloudBank' + k, { width: 1, height: 1 }, scene);
    const mat = new StandardMaterial('cloudBankM' + k, scene);
    mat.emissiveTexture = texes[k];
    mat.opacityTexture = texes[k];
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.fogEnabled = false;
    mat.backFaceCulling = false;
    mat.emissiveColor = new Color3(1, 1, 1);
    plane.material = mat;
    plane.applyFog = false;
    plane.isPickable = false;
    plane.alwaysSelectAsActiveMesh = true;           // suit le joueur : pas de culling
    plane.alphaIndex = 5 + k;                        // derrière tout le reste
    plane.receiveShadows = false;
    const count = state.filter((c) => c.kind === k).length;
    banks.push({ plane, mat, buf: new Float32Array(count * 16), idx: [] });
    mats.push(mat);
  }
  for (let i = 0; i < N; i++) banks[state[i].kind].idx.push(i);
  for (const b of banks) b.plane.thinInstanceSetBuffer('matrix', b.buf, 16, false);

  const q = new Quaternion(), sc = new Vector3(), tr = new Vector3(), m = new Matrix();
  const tint = new Color3(1, 1, 1);

  /**
   * @param sunY   hauteur du soleil (−1 … 1) : teinte et luminosité
   * @param cloudy couverture 0 … 1 : opacité et nombre visible
   * @param camX/camZ  position du joueur
   * @param camYaw     cap de la caméra (les cartes lui font face)
   */
  function update(dt, sunY, cloudy, camX, camZ, camYaw) {
    const day = Math.min(1, Math.max(0, (sunY + 0.1) / 0.32));
    const high = Math.min(1, Math.max(0, (sunY - 0.15) / 0.42));
    // bleu d'encre la nuit → ocre au ras → blanc franc à midi
    tint.r = 0.17 + day * (1.0 - 0.17);
    tint.g = 0.2 + day * (0.74 + high * 0.26 - 0.2);
    tint.b = 0.34 + day * (0.56 + high * 0.44 - 0.34);
    const vis = 0.55 + 0.45 * cloudy;
    // les cartes font toujours face à la caméra (billboard sur l'axe Y)
    Quaternion.RotationYawPitchRollToRef(camYaw + Math.PI, 0, 0, q);

    for (const b of banks) {
      b.mat.emissiveColor.copyFrom(tint);
      b.mat.alpha = vis;
      for (let j = 0; j < b.idx.length; j++) {
        const c = state[b.idx[j]];
        c.ang += c.drift * dt;                       // la nappe tourne au vent
        sc.set(c.w, c.w * 0.5, 1);
        tr.set(camX + Math.cos(c.ang) * c.dist, c.y, camZ + Math.sin(c.ang) * c.dist);
        Matrix.ComposeToRef(sc, q, tr, m);
        m.copyToArray(b.buf, j * 16);
      }
      b.plane.thinInstanceBufferUpdated('matrix');
    }
  }

  return { update, banks };
}
