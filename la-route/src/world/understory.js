/**
 * L'étage moyen — la végétation d'épaule (0,8-2,5 m) qui FERME les flancs du
 * cadre, entre le tapis d'herbe et les couronnes des pins. C'est le manque
 * n°1 face à la référence (02-mid-trail) : là-bas les bords du sentier sont
 * pleins à hauteur d'épaule, ici on voyait le sol jusqu'à l'horizon.
 * Deux archétypes en cartes courbées (bentCard), un maillage thin-instancé
 * chacun :
 *   1. la GRANDE ROSETTE (~0,9 m) : feuilles LARGES en éventail qui retombent
 *      — la masse basse qui bouche la vue au ras du talus ;
 *   2. l'ARBUSTE ARQUÉ (~2,0-2,6 m) : longues tiges en fontaine, silhouette
 *      de noisetier — c'est lui qui monte jusqu'à l'épaule et au-dessus.
 * Placement le long du tracé, en MASSIFS troués par un champ fBm 3 octaves :
 * les trouées comptent autant que les masses — la forêt doit encore se lire
 * au travers. Tout est construit une fois, rien ne s'alloue par frame ; le
 * mouvement vient du WindPlugin, dans le vertex shader.
 */
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { height, roadQuery, samples, GARAGE, FORD } from '../terrain/road.js';
import { fbm } from '../terrain/noise.js';
import { WindPlugin } from '../vegetation/wind.js';
import { addBentCard, cardAcc, accToMesh } from '../vegetation/bentCard.js';

const sstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ---- feuille de rosette : UN limbe entier, large, peint LE LONG de v
 * (pied en bas du canvas = v0, la carte n'a PAS d'uvSwap). Nervure centrale
 * et nervures latérales claires, bord finement denté — c'est la denture qui
 * casse le contour de la découpe, pas la géométrie. */
function rosetteLeafTexture(scene) {
  // PAS de mipmaps : le moyennage de l'alpha ferait passer des cartes
  // entières au test de découpe (blocs verts flottants à distance).
  const W = 96, H = 96;
  const tex = new DynamicTexture('usRosetteTex', { width: W, height: H }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, W, H);
  let s = 907;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const yOf = (t) => H - 3 - t * (H - 8);                     // t=0 pied → t=1 pointe
  const cOf = (t) => W / 2 + 3.5 * Math.sin(t * 2.8 + 0.4);   // le limbe s'incurve un peu
  // enveloppe : pétiole étroit, ventre large, pointe effilée
  const wOf = (t) => (2 + 34 * Math.sin(Math.PI * Math.min(1, 0.08 + 0.92 * t)))
    * (0.22 + 0.78 * sstep(0, 0.22, t)) * (1 - 0.82 * sstep(0.78, 1, t));
  const wS = (t) => Math.max(0.6, wOf(t) + 1.4 * Math.sin(t * 46 + 0.7)); // denture
  const N = 30;
  g.beginPath();
  g.moveTo(cOf(0) - wS(0), yOf(0));
  for (let i = 1; i <= N; i++) { const t = i / N; g.lineTo(cOf(t) - wS(t), yOf(t)); }
  for (let i = N; i >= 0; i--) { const t = i / N; g.lineTo(cOf(t) + wS(t), yOf(t)); }
  g.closePath();
  const grad = g.createLinearGradient(0, H, 0, 0);            // pied sombre → pointe claire
  grad.addColorStop(0, '#254414');
  grad.addColorStop(1, '#4e7a24');
  g.fillStyle = grad;
  g.fill();
  // nervure centrale, puis 6 latérales par paire qui montent vers le bord
  g.strokeStyle = 'rgba(168,196,110,0.65)';
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(cOf(0), yOf(0));
  for (let i = 1; i <= N; i++) { const t = (i / N) * 0.96; g.lineTo(cOf(t), yOf(t)); }
  g.stroke();
  g.strokeStyle = 'rgba(150,180,95,0.5)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) {
    const t = 0.14 + k * 0.125 + (rnd() - 0.5) * 0.03;
    for (let sg = -1; sg <= 1; sg += 2) {
      const x0 = cOf(t), y0 = yOf(t);
      const x1 = cOf(t) + sg * wOf(t + 0.05) * (0.78 + rnd() * 0.12);
      const y1 = yOf(Math.min(1, t + 0.15));
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 + sg * 2, (y0 + y1) / 2 + 3, x1, y1);
      g.stroke();
    }
  }
  tex.update();
  tex.hasAlpha = true;
  tex.updateSamplingMode(1);                                  // nearest : grain 32 bits
  return tex;
}

/* ---- tige d'arbuste : une tige sombre du pied (bas, v0) à la pointe, garnie
 * de paires de feuilles moyennes qui raccourcissent en montant. Le vide entre
 * les feuilles est le point : c'est lui qui rend la fontaine ajourée. */
function shrubStemTexture(scene) {
  // PAS de mipmaps, même règle que toutes les découpes alpha du projet.
  const W = 64, H = 128;
  const tex = new DynamicTexture('usShrubTex', { width: W, height: H }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, W, H);
  let s = 1721;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const SX = (t) => 32 + Math.sin(t * 4.6 + 0.8) * 3.5 + Math.sin(t * 11.2) * 1.2;
  const SY = (t) => 124 - t * 114;
  g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {                              // la tige, par tronçons (taper)
    const t0 = i / 12, t1 = (i + 1) / 12;
    g.strokeStyle = i % 3 === 2 ? '#3a2d18' : '#2c2110';
    g.lineWidth = 3.2 * (1 - t0 * 0.6);
    g.beginPath(); g.moveTo(SX(t0), SY(t0)); g.lineTo(SX(t1), SY(t1)); g.stroke();
  }
  for (let k = 0; k < 7; k++) {                               // paires de feuilles opposées
    const t = 0.18 + k * 0.115 + (rnd() - 0.5) * 0.03;
    const L = (16 - k * 1.5) * (0.85 + rnd() * 0.3);
    const a = 0.5 + rnd() * 0.35;                             // vers le haut et l'extérieur
    const px = SX(t), py = SY(t);
    for (let sg = -1; sg <= 1; sg += 2) {
      const dx = sg * Math.cos(a), dy = -Math.sin(a);
      g.strokeStyle = '#2c2110'; g.lineWidth = 1.1;           // le pétiole
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx * 4, py + dy * 4); g.stroke();
      g.fillStyle = k >= 4 || rnd() < 0.3 ? '#4e7a24' : '#2c4a15';
      g.beginPath();
      g.ellipse(px + dx * (L * 0.62 + 2), py + dy * (L * 0.62 + 2),
        L * 0.6, L * 0.26, -sg * a, 0, 7);
      g.fill();
    }
  }
  g.fillStyle = '#4e7a24';                                    // la feuille terminale
  g.beginPath(); g.ellipse(SX(1) + 1, 7, 7, 3, -1.2, 0, 7); g.fill();
  tex.update();
  tex.hasAlpha = true;
  tex.updateSamplingMode(1);
  return tex;
}

/* ---- archétype 1 : la grande rosette. Six feuilles larges en éventail qui
 * montent puis retombent, deux jeunes feuilles dressées au cœur. Le Scaling
 * vertical est cuit dans l'archétype : les instances gardent un rapport sy/sx
 * modéré, sinon la feuille large se lit étirée. */
function buildRosette(scene) {
  const acc = cardAcc();
  let s = 311;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const leaf = (yaw, pitch, len) => {
    const m = Matrix.RotationZ((rnd() - 0.5) * 0.24)
      .multiply(Matrix.RotationX(-pitch))                     // l'attache vise le ciel
      .multiply(Matrix.RotationY(yaw))
      .multiply(Matrix.Scaling(1, 1.25, 1))
      .multiply(Matrix.Translation(0, 0.03, 0));
    addBentCard(acc, m, {
      len, hw: 0.2 + rnd() * 0.1,
      bend: 0.7 + rnd() * 0.4,                                // monte puis retombe
      sag: 0.05, twist: (rnd() - 0.5) * 0.2,
      cup: 0.45, relax: 0.6, roll: 0.12,
      ripple: 0.1, tilt: (rnd() - 0.5) * 0.16,
      asym: 0.07, nick: 0.12, phase: rnd() * 6.28,
      steps: 4, nu: 4,               // pas d'uvSwap : la feuille est peinte le long de v
    });
  };
  for (let k = 0; k < 6; k++) {
    leaf((k / 6) * Math.PI * 2 + (rnd() - 0.5) * 0.6, 0.8 + rnd() * 0.3, 0.6 + rnd() * 0.25);
  }
  for (let k = 0; k < 2; k++) {                               // le cœur, plus dressé
    leaf(rnd() * Math.PI * 2, 1.15 + rnd() * 0.15, 0.55 + rnd() * 0.1);
  }
  return accToMesh(scene, 'usRosette', acc);
}

/* ---- archétype 2 : l'arbuste arqué. Neuf longues tiges presque verticales
 * à l'attache qui retombent en fontaine — la retombée est DANS la carte
 * (bend), pas dans l'orientation. Même remarque : l'étirement vertical est
 * cuit ici pour épargner les instances. */
function buildShrub(scene) {
  const acc = cardAcc();
  let s = 577;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const N = 9;
  for (let k = 0; k < N; k++) {
    const yaw = (k / N) * Math.PI * 2 + (rnd() - 0.5) * 0.8;
    const m = Matrix.RotationZ((rnd() - 0.5) * 0.2)
      .multiply(Matrix.RotationX(-(1.18 + rnd() * 0.22)))     // le jet part presque droit
      .multiply(Matrix.RotationY(yaw))
      .multiply(Matrix.Scaling(1, 1.5, 1))
      .multiply(Matrix.Translation(Math.sin(yaw) * 0.07, 0.02, Math.cos(yaw) * 0.07));
    addBentCard(acc, m, {
      len: 1.2 + rnd() * 0.6, hw: 0.14,
      bend: 1.2 + rnd() * 0.4,                                // la fontaine
      sag: 0.06, twist: (rnd() - 0.5) * 0.3,
      cup: 0.22, relax: 0.5, roll: 0.06,
      ripple: 0.05, tilt: (rnd() - 0.5) * 0.12,
      asym: 0.05, nick: 0, phase: rnd() * 6.28,
      steps: 5, nu: 2,
    });
  }
  return accToMesh(scene, 'usShrub', acc);
}

/** matériau à découpe standard du projet : test d'alpha franc, jamais de
 * blending — aucun tri de transparence sur des centaines d'instances */
function leafMat(scene, name, tex, windOpts) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = new Color3(0.82, 0.9, 0.78);
  mat.specularColor = new Color3(0.02, 0.03, 0.02);
  mat.backFaceCulling = false;                                // la carte se voit des deux bords
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.needAlphaTesting = () => true;
  mat.needAlphaBlending = () => false;
  new WindPlugin(mat, windOpts);
  return mat;
}

export function plantUnderstory(scene, shadows) {
  const rosette = buildRosette(scene);
  rosette.material = leafMat(scene, 'usRosetteMat', rosetteLeafTexture(scene),
    { strength: 0.35, transl: 0.6 });
  const shrub = buildShrub(scene);
  shrub.material = leafMat(scene, 'usShrubMat', shrubStemTexture(scene),
    { strength: 0.5, transl: 0.55 });

  /* Placement : on marche le long du tracé (samples, ~2 m) et on tente des
   * positions dans la bande latérale des deux côtés. La probabilité est
   * modulée par un fBm 3 octaves — le principe des grumeaux : des massifs
   * pleins ET des trouées de plusieurs mètres où la forêt reste visible.
   * Les seuils sont calés sur les quantiles réels du champ le long du tracé
   * (il plafonne vers 0,41 ici, pas 1). */
  let sd = 4099;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const q = new Quaternion(), sc = new Vector3(), tr = new Vector3();
  const matsR = [], matsA = [];

  // exclusions : le van passe (3,5 m), l'esplanade du garage, 7 m du gué
  const free = (x, z, minRoad) => {
    if (roadQuery(x, z).dist < minRoad) return false;         // scratch consommé aussitôt
    if (Math.abs(x - GARAGE.x) < GARAGE.hw + 5 && z > GARAGE.z0 - 8 && z < GARAGE.z1 + 5) return false;
    const dx = x - FORD.x, dz = z - FORD.z;
    return dx * dx + dz * dz > 49;
  };

  for (let i = 0; i < samples.length; i++) {
    const sp = samples[i];
    const nx = -sp.tz, nz = sp.tx;                            // normale au tracé
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < 4; k++) {                           // rosettes : bande 3,5-13 m
        const d = 3.5 + rnd() * 9.5;
        const j = (rnd() - 0.5) * 2.4;                        // brouillage le long du tracé
        const x = sp.x + nx * d * side + sp.tx * j;
        const z = sp.z + nz * d * side + sp.tz * j;
        const cl = fbm(x / 11 + 31, z / 11 - 7, 3, 2.3, 0.55);
        // massif si le champ est haut, trouée sinon ; plus dense près du bord
        const p = sstep(0.245, 0.315, cl) * (1 - (d - 3.5) / 9.5 * 0.55);
        if (rnd() > p) continue;
        if (!free(x, z, 3.5)) continue;
        Quaternion.RotationYawPitchRollToRef(rnd() * Math.PI * 2,
          (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1, q);
        // l'archétype culmine à 0,79 m pour 1,42 m d'envergure : ces échelles
        // le portent à ~0,9 m de haut, ~1,3-1,6 m de large
        const s1 = 0.8 + rnd() * 0.4;
        sc.set(s1, s1 * (0.95 + rnd() * 0.3), s1);
        tr.set(x, height(x, z) - 0.05, z);
        matsR.push(Matrix.Compose(sc, q, tr));
      }
      for (let k = 0; k < 3; k++) {                           // arbustes : bande 4,5-13 m
        const d = 4.5 + rnd() * 8.5;
        const j = (rnd() - 0.5) * 2.4;
        const x = sp.x + nx * d * side + sp.tx * j;
        const z = sp.z + nz * d * side + sp.tz * j;
        // champ décalé : les massifs d'arbustes ne calquent pas ceux des rosettes
        const cl = fbm(x / 14 - 12, z / 14 + 23, 3, 2.3, 0.55);
        const p = sstep(0.234, 0.304, cl) * (1 - (d - 4.5) / 8.5 * 0.45);
        if (rnd() > p) continue;
        if (!free(x, z, 4.5)) continue;
        Quaternion.RotationYawPitchRollToRef(rnd() * Math.PI * 2,
          (rnd() - 0.5) * 0.09, (rnd() - 0.5) * 0.09, q);
        // l'archétype culmine à 1,75 m : sy 1,05-1,63 → 1,85-2,85 m de haut,
        // centré sur la fourchette 2,0-2,6 m visée
        const s1 = 1.0 + rnd() * 0.3;
        sc.set(s1 * 0.92, s1 * (1.05 + rnd() * 0.25), s1 * 0.92);
        tr.set(x, height(x, z) - 0.05, z);
        matsA.push(Matrix.Compose(sc, q, tr));
      }
    }
  }

  // buffers statiques, uploadés UNE fois
  const bufR = new Float32Array(matsR.length * 16);
  for (let i = 0; i < matsR.length; i++) matsR[i].copyToArray(bufR, i * 16);
  rosette.thinInstanceSetBuffer('matrix', bufR, 16, true);
  const bufA = new Float32Array(matsA.length * 16);
  for (let i = 0; i < matsA.length; i++) matsA[i].copyToArray(bufA, i * 16);
  shrub.thinInstanceSetBuffer('matrix', bufA, 16, true);

  for (const m of [rosette, shrub]) {
    m.isPickable = false;
    m.receiveShadows = true;
    shadows.addShadowCaster(m);
  }
  return { count: matsR.length + matsA.length };
}
