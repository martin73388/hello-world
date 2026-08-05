/**
 * La litière — le tapis de feuilles mortes INDIVIDUELLES du couloir de la
 * route (référence jungle-trail 01/02 : le sol est un semis de vraies
 * feuilles, pas une texture). Trois archétypes de feuille recroquevillée
 * (bentCard), chacun son maillage thin-instancé, sa teinte, sa texture à
 * découpe alpha. ~4200 instances par archétype.
 *
 * Le placement suit le tracé (samples) comme les bouleaux de flora.js, des
 * deux côtés, entre le bord du talus et 26 m. La probabilité est modulée par
 * trois octaves de value-noise (produit, écrasé en puissance 2) : la litière
 * fait des NAPPES sous les arbres, pas un semis uniforme.
 *
 * Tout est construit une fois (zéro allocation par frame), tout est
 * déterministe (LCG + hash sin/fract). Pas de WindPlugin : une feuille au
 * sol ne bat pas au vent. Pas de shadow caster : 12 600 cartes dans la
 * shadow map seraient du gâchis pour des ombres de 2 cm.
 */
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { height, roadQuery, samples, GARAGE, ROAD_HALF, FORD } from '../terrain/road.js';
import { addBentCard, cardAcc, accToMesh } from '../vegetation/bentCard.js';

/* ---- bruit de grumeaux : trois octaves de value-noise maison ----
 * hash sin/fract déterministe (même graine → même monde), lissage smoothstep.
 * Les périodes (~18 m, 6 m, 2.2 m) donnent des nappes de la taille d'un
 * bosquet, trouées à l'échelle du pas, granuleuses à l'échelle de la feuille. */
function hash2(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
/** probabilité de pose en (x,z) : produit des trois octaves, remonté (le
 * produit brut plafonne vers 0.125) puis élevé au carré — les creux se
 * vident, les bosses saturent : des nappes franches, pas un voile. */
function clump(x, z) {
  const n = vnoise(x / 18, z / 18)
    * vnoise(x / 6 + 11.7, z / 6 + 5.3)
    * vnoise(x / 2.2 + 31.4, z / 2.2 + 17.9);
  const t = Math.min(1, n * 6.5);
  return t * t;
}

/* ---- texture de feuille morte 64×64 : silhouette ovale pointue au bord
 * irrégulier, nervure centrale sombre, 3-4 nervures latérales. Base de la
 * feuille en bas du canvas (v = 0 = pied de la carte). ---- */
function leafTexture(scene, name, seed, cBase, cTip, cVein) {
  // QUATRIÈME argument false : PAS de mipmaps — le moyennage de l'alpha
  // transformerait les feuilles lointaines en confettis pleins.
  const S = 64;
  const tex = new DynamicTexture(name, { width: S, height: S }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, S, S);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

  const cx = S / 2;
  const p1 = rnd() * 6.28, p2 = rnd() * 6.28, p3 = rnd() * 6.28;
  // demi-largeur du limbe en t (0 pied → 1 pointe) : ovale pointu aux deux
  // bouts, rongé par trois sinus — le bord d'une feuille morte est déchiré
  const half = (t, sg) => {
    const oval = Math.sin(Math.PI * Math.pow(t, 0.85));
    const bite = 1 + 0.14 * Math.sin(t * 19 + p1 + sg * 1.7)
      + 0.1 * Math.sin(t * 41 + p2 - sg * 2.9)
      + 0.06 * Math.sin(t * 87 + p3 + sg);
    return Math.max(1.2, oval * (S * 0.42) * bite);
  };
  const yOf = (t) => S - 2 - t * (S - 4);              // pied en bas, pointe en haut

  const grad = g.createLinearGradient(0, S, 0, 0);     // sombre au pied, passé en pointe
  grad.addColorStop(0, cBase);
  grad.addColorStop(1, cTip);
  g.fillStyle = grad;
  const N = 26;
  g.beginPath();
  g.moveTo(cx, yOf(0));
  for (let i = 1; i <= N; i++) { const t = i / N; g.lineTo(cx + half(t, 1), yOf(t)); }
  for (let i = N; i >= 0; i--) { const t = i / N; g.lineTo(cx - half(t, -1), yOf(t)); }
  g.closePath();
  g.fill();

  // taches de décomposition, discrètes
  g.fillStyle = 'rgba(30,22,12,0.22)';
  for (let i = 0; i < 6; i++) {
    const t = 0.15 + rnd() * 0.7;
    const r = 1.5 + rnd() * 3;
    g.beginPath();
    g.ellipse(cx + (rnd() - 0.5) * half(t, 1) * 1.2, yOf(t), r, r * 0.7, rnd() * 3, 0, 7);
    g.fill();
  }

  // nervure centrale : du pied à la pointe, léger flottement
  g.strokeStyle = cVein; g.lineCap = 'round';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, yOf(0));
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    g.lineTo(cx + Math.sin(t * 9 + p1) * 1.4, yOf(t));
  }
  g.stroke();
  // 3-4 paires de nervures latérales, inclinées vers la pointe
  const nv = 3 + (rnd() < 0.5 ? 1 : 0);
  g.lineWidth = 1;
  for (let i = 0; i < nv; i++) {
    const t = 0.16 + (i / nv) * 0.62 + rnd() * 0.06;
    const y0 = yOf(t);
    for (let sg = -1; sg <= 1; sg += 2) {
      const L = half(t + 0.08, sg) * (0.8 + rnd() * 0.15);
      g.beginPath();
      g.moveTo(cx, y0);
      g.lineTo(cx + sg * L, y0 - L * (0.55 + rnd() * 0.25));
      g.stroke();
    }
  }

  tex.update();
  tex.hasAlpha = true;
  tex.updateSamplingMode(1);                           // nearest : grain 32 bits
  return tex;
}

/* ---- les trois teintes de la litière ---- */
const KINDS = [
  { seed: 911, base: '#6b4a26', tip: '#a8845a', vein: 'rgba(52,34,16,0.85)' },  // brun feuille-morte
  { seed: 1723, base: '#7a6234', tip: '#b09a5c', vein: 'rgba(66,50,22,0.85)' }, // ocre passé
  { seed: 2609, base: '#565a30', tip: '#8a8a52', vein: 'rgba(42,45,20,0.85)' }, // olive terne
];

export function plantLitter(scene) {
  let s = 5309;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

  const DMIN = ROAD_HALF + 0.3;                        // le talus respire
  const DMAX = 26;                                     // fin du couloir
  const N_PER = 4200;                                  // par archétype
  const q = new Quaternion(), sc = new Vector3(), tr = new Vector3();
  let total = 0;

  for (let k = 0; k < KINDS.length; k++) {
    const kind = KINDS[k];

    /* archétype : UNE petite carte très pliée. bend NÉGATIF : la nervure
     * remonte, la feuille se recroqueville VERS LE CIEL — avec le bend
     * positif de la spec la pointe plongerait sous le sol. relax bas : la
     * cuvette tient jusqu'à la pointe (une feuille sèche ne se détend pas). */
    const acc = cardAcc();
    const len = 0.14 + rnd() * 0.08;
    addBentCard(acc, Matrix.Translation(0, 0.002, -len * 0.45), {
      len, hw: len * (0.3 + rnd() * 0.12),
      bend: -(0.9 + rnd() * 0.8),
      sag: 0.06, twist: (rnd() - 0.5) * 0.5,
      cup: 0.5, relax: 0.35, roll: 0.18,
      ripple: 0.08, tilt: (rnd() - 0.5) * 0.2,
      asym: 0.08, nick: 0.25, phase: rnd() * 6.28,
      steps: 4, nu: 3,
    });
    const mesh = accToMesh(scene, 'litter' + k, acc);

    const mat = new StandardMaterial('litterMat' + k, scene);
    mat.diffuseColor = new Color3(0.92, 0.89, 0.84);
    mat.specularColor = new Color3(0.01, 0.01, 0.008); // le sol mat ne brille pas
    mat.backFaceCulling = false;                       // le dessous se voit (feuille pliée)
    mat.diffuseTexture = leafTexture(scene, 'litterTex' + k, kind.seed, kind.base, kind.tip, kind.vein);
    mat.useAlphaFromDiffuseTexture = true;
    mat.needAlphaTesting = () => true;                 // découpe franche, aucun tri
    mat.needAlphaBlending = () => false;
    mesh.material = mat;

    /* placement : graine sur le tracé, un côté, une distance dans le
     * couloir, un glissement le long de la tangente (sinon les feuilles
     * s'alignent sur le pas de 2 m des échantillons). Le bruit de grumeaux
     * décide ENSUITE — c'est lui qui fait les nappes. */
    const mats = [];
    for (let tries = 0; tries < 120000 && mats.length < N_PER; tries++) {
      const sm = samples[2 + Math.floor(rnd() * (samples.length - 4))];
      const side = rnd() < 0.5 ? 1 : -1;
      const d = DMIN + rnd() * (DMAX - DMIN);
      const jit = (rnd() - 0.5) * 2.6;
      const x = sm.x + sm.tz * side * d + sm.tx * jit;
      const z = sm.z - sm.tx * side * d + sm.tz * jit;
      if (rnd() > clump(x, z)) continue;               // les nappes
      const rd = roadQuery(x, z).dist;                 // scratch consommé aussitôt
      if (rd < DMIN || rd > DMAX) continue;            // le couloir peut se replier
      if (Math.abs(x - GARAGE.x) < GARAGE.hw + 5 && z > GARAGE.z0 - 8 && z < GARAGE.z1 + 5) continue;
      const fdx = x - FORD.x, fdz = z - FORD.z;
      if (fdx * fdx + fdz * fdz < 49) continue;        // le gué reste propre (7 m)

      const sv = 0.7 + rnd() * 0.7;
      Quaternion.RotationYawPitchRollToRef(rnd() * Math.PI * 2,
        (rnd() - 0.5) * 0.24, (rnd() - 0.5) * 0.24, q); // elles épousent le sol
      sc.set(sv, sv, sv);
      // léger empilement : les feuilles ne sont pas toutes au même étage
      tr.set(x, height(x, z) + 0.01 + rnd() * 0.025, z);
      mats.push(Matrix.Compose(sc, q, tr));
    }

    const buf = new Float32Array(mats.length * 16);
    for (let i = 0; i < mats.length; i++) mats[i].copyToArray(buf, i * 16);
    mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
    mesh.receiveShadows = true;                        // les ombres des arbres tombent dessus
    mesh.isPickable = false;
    total += mats.length;
  }

  return { count: total };
}
