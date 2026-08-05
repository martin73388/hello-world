/**
 * LE CIEL ET LE TEMPS — cycle jour/nuit complet (10 min réelles) + météo
 * autonome. Ce module remplace daycycle.js (glissement manuel après-midi ↔
 * crépuscule) et rain.js (averse au clavier) : ici rien n'est piloté à la
 * main, tout dérive.
 *
 * Le soleil décrit un VRAI arc — angle horaire et déclinaison, pas une
 * interpolation entre deux poses : il se lève à l'est, culmine au sud, se
 * couche à l'ouest. Sous l'horizon, la MÊME lumière directionnelle est
 * retournée à l'opposé et devient la lune (le budget est de 6 lumières par
 * matériau : on n'en crée pas une septième). Le retournement tombe dans une
 * fenêtre où les deux intensités valent exactement zéro — invisible.
 *
 * La météo est une machine à états DOUCE : cinq états (clair, voilé, couvert,
 * averse, brume) dont chaque paramètre est un scalaire interpolé sur ~20 s.
 * Aucun état ne s'installe ni ne se retire d'un coup ; les particules
 * tournent en permanence, seuls les débits respirent.
 *
 * Zéro allocation par frame : le seul point qui alloue est le repeint du
 * dégradé du dôme (gradient canvas + chaînes rgb, inévitable), throttlé.
 */
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { groundHeight, GARAGE } from '../terrain/road.js';

/** durée d'une journée complète, en secondes réelles */
export const DAY_LENGTH = 600;

const TAU = Math.PI * 2;
const PAINT_STEP = 0.12;      // throttle du repeint du dôme (s)
const SKIP_DUR = 4;           // durée du glissement de skipTo (s)
const BLEND = 20;             // durée d'une transition météo (s)
const DWELL_MIN = 60;         // ...et l'attente entre deux transitions (s)
const DWELL_SPAN = 80;

/* Géométrie céleste : latitude ~46° N, déclinaison quasi nulle (quelques
 * jours après l'équinoxe) pour que le lever tombe à t ≈ 0,24 et le coucher à
 * t ≈ 0,76 — la convention du brief (0,25 = aube, 0,75 = crépuscule). */
const SIN_LAT = Math.sin(0.80), COS_LAT = Math.cos(0.80);
const SIN_DEC = Math.sin(0.06), COS_DEC = Math.cos(0.06);

// vent dominant, normalisé (même direction que la poussière et les pins)
const WL = Math.hypot(0.81, 0.59);
const WX = 0.81 / WL, WZ = 0.59 / WL;

/* ---- averse : reprise du rideau de rain.js ---- */
const CELL_HALF = 17;         // demi-côté de la boîte d'émission (34 × 34 m)
const CELL_H = 13;            // hauteur d'émission au-dessus du sol (m)
const DRIFT = 0.6;            // dérive de la cellule au vent (m/s)
const LEASH = 12;             // au-delà, rappel doux vers le joueur (m)
const DRIP_HOLD = 8;          // la canopée goutte encore... (s)
const DRIP_FADE = 2;          // ...puis se tait (s)

const lerp = (a, b, t) => a + (b - a) * t;
/** smoothstep tolérant a > b (rampe descendante) */
function sstep(a, b, v) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);

/* ---------------------------------------------------------------------- *
 * Palettes du dôme — 7 stops du zénith (position 0) au nadir (1), l'horizon
 * tombant à 0,5 (les UV de la sphère sont linéaires en angle polaire). Les
 * stops 3-4 portent la bande solaire : elle descend légèrement quand le
 * soleil plonge. Les couleurs « crépuscule » sont celles de sky.js, gardées
 * telles quelles — c'est l'image de référence du projet.
 * ---------------------------------------------------------------------- */
const POS = {
  nuit: [0.00, 0.30, 0.44, 0.505, 0.60, 0.76, 1.00],
  aube: [0.00, 0.30, 0.435, 0.50, 0.585, 0.75, 1.00],
  lever: [0.00, 0.29, 0.425, 0.495, 0.575, 0.74, 1.00],
  matin: [0.00, 0.28, 0.42, 0.49, 0.57, 0.73, 1.00],
  jour: [0.00, 0.27, 0.41, 0.485, 0.565, 0.72, 1.00],
  aprem: [0.00, 0.28, 0.42, 0.49, 0.57, 0.73, 1.00],
  crep: [0.00, 0.30, 0.42, 0.487, 0.57, 0.73, 1.00],
  couchant: [0.00, 0.31, 0.43, 0.497, 0.58, 0.75, 1.00],
  bleue: [0.00, 0.31, 0.44, 0.503, 0.59, 0.76, 1.00],
};
const HEX = {
  nuit: ['#050914', '#0a1026', '#111c3c', '#1a2650', '#0e1730', '#070c1a', '#04060e'],
  aube: ['#0a1130', '#16224c', '#33356a', '#6b4668', '#3a2c48', '#141527', '#070a14'],
  lever: ['#28457e', '#4d6cac', '#9a86ac', '#f2b884', '#d99a72', '#5e4660', '#1c1728'],
  matin: ['#1f56a8', '#4180cc', '#84b2dc', '#e6cfa2', '#a89880', '#4a5464', '#1e2736'],
  jour: ['#0b4fd4', '#2b7ae4', '#6cadec', '#a8d4f2', '#8fbcda', '#5c82a0', '#2c3a48'],
  aprem: ['#2360c4', '#4a88d2', '#94c0dc', '#e8dcb6', '#b8a684', '#5c6874', '#2a2f3a'],
  crep: ['#264c92', '#4a6ea8', '#a08ea0', '#e8a25c', '#b87a4a', '#4a5a74', '#1c3050'],
  couchant: ['#1a3068', '#35487e', '#84587a', '#e08a52', '#a85e3c', '#3a3c56', '#121a2c'],
  bleue: ['#0c1738', '#182354', '#3a3668', '#6a415a', '#43314b', '#1a1d35', '#080c18'],
};
// hex parsés UNE fois en triplets [r, g, b] pré-alloués
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// la clé de voûte : quelle palette à quelle heure. La liste boucle (0 = 1).
const SKY = [
  ['nuit', 0.000], ['nuit', 0.175], ['aube', 0.222], ['lever', 0.262],
  ['matin', 0.330], ['jour', 0.500], ['aprem', 0.635], ['crep', 0.715],
  ['couchant', 0.768], ['bleue', 0.815], ['nuit', 0.875], ['nuit', 1.000],
].map((k) => ({ t: k[1], pos: POS[k[0]], rgb: HEX[k[0]].map(hx) }));

/* ---------------------------------------------------------------------- *
 * Ambiante / brouillard : trois jeux (nuit, entre-deux, jour) mélangés par
 * la hauteur du soleil. Un seul barycentre pilote lumière, brume et fond.
 * ---------------------------------------------------------------------- */
const AMB_I = [0.55, 0.7, 0.9];   // la nuit reste LISIBLE : clair de lune, pas néant
const AMB_D = [[0.24, 0.32, 0.62], [0.34, 0.30, 0.46], [0.40, 0.50, 0.70]];
const AMB_G = [[0.06, 0.06, 0.09], [0.14, 0.11, 0.11], [0.20, 0.18, 0.15]];
const FOG_D = [0.0135, 0.0125, 0.0082];
const FOG_C = [[0.055, 0.065, 0.105], [0.20, 0.17, 0.21], [0.46, 0.53, 0.62]];

/* ---------------------------------------------------------------------- *
 * Météo : chaque état n'est qu'un vecteur de scalaires. La transition
 * interpole ce vecteur, donc TOUT (lumière, brume, nuages, pluie) glisse
 * ensemble sans qu'aucun cas particulier n'ait à être écrit.
 * ---------------------------------------------------------------------- */
const WKEYS = ['sun', 'amb', 'fog', 'cloud', 'rain', 'mist', 'grey'];
const W = {
  clair: { sun: 1.00, amb: 1.00, fog: 0.0000, cloud: 0.00, rain: 0, mist: 0.00, grey: 0.00 },
  'voilé': { sun: 0.80, amb: 1.06, fog: 0.0016, cloud: 0.34, rain: 0, mist: 0.00, grey: 0.24 },
  couvert: { sun: 0.34, amb: 1.26, fog: 0.0042, cloud: 0.82, rain: 0, mist: 0.05, grey: 0.62 },
  averse: { sun: 0.24, amb: 1.14, fog: 0.0062, cloud: 1.00, rain: 1, mist: 0.12, grey: 0.74 },
  brume: { sun: 0.52, amb: 1.18, fog: 0.0230, cloud: 0.46, rain: 0, mist: 1.00, grey: 0.46 },
};
// enchaînements plausibles (une averse ne succède pas à un grand ciel clair)
const NEXT = {
  clair: ['voilé', 'voilé', 'brume', 'couvert'],
  'voilé': ['clair', 'couvert', 'couvert', 'brume'],
  couvert: ['averse', 'averse', 'voilé', 'brume'],
  averse: ['couvert', 'couvert', 'voilé'],
  brume: ['voilé', 'clair', 'couvert'],
};

/** point lumineux au cœur franc — même recette que dust.js et les lucioles */
function glowTexture(scene, name, core, halo) {
  const tex = new DynamicTexture(name, 64, scene, true);
  const g = tex.getContext();
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, core);
  grad.addColorStop(0.28, halo);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** trait vertical doux : dégradé radial écrasé en x (repris de rain.js) */
function dropTexture(scene) {
  const tex = new DynamicTexture('rainTex', 128, scene, true);
  const g = tex.getContext();
  g.save();
  g.scale(0.16, 1);
  const grad = g.createRadialGradient(400, 64, 3, 400, 64, 58);
  grad.addColorStop(0, 'rgba(255,255,255,.95)');
  grad.addColorStop(0.4, 'rgba(255,255,255,.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 800, 128);
  g.restore();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export function createWeather(scene, refs) {
  const { sun, amb, sky, deform, shadows } = refs;

  /* ---- dôme : la DynamicTexture 64 × 256 de buildSky, repeinte au vol ---- */
  const skyTex = sky.material.emissiveTexture;
  const skyCtx = skyTex.getContext();
  const SW = skyTex.getSize().width;
  const SH = skyTex.getSize().height;

  /* ---- étoiles : quadrilatères en thin instances sur une calotte de 600 m,
   * chacun tourné vers le centre. infiniteDistance suit la caméra, donc le
   * champ ne « tourne » jamais quand on roule — seul le ciel bouge. ---- */
  const stars = MeshBuilder.CreatePlane('stars', { size: 1 }, scene);
  const starMat = new StandardMaterial('starMat', scene);
  starMat.emissiveTexture = glowTexture(scene, 'starTex',
    'rgba(255,255,255,1)', 'rgba(214,228,255,.5)');
  starMat.opacityTexture = starMat.emissiveTexture;   // l'alpha du sprite
  starMat.diffuseColor = new Color3(0, 0, 0);         // sinon le quad est blanc
  starMat.specularColor = new Color3(0, 0, 0);
  starMat.disableLighting = true;
  starMat.fogEnabled = false;
  starMat.backFaceCulling = false;
  starMat.disableDepthWrite = true;                   // n'occulte jamais rien
  starMat.alphaMode = Constants.ALPHA_ADD;            // une étoile s'ajoute
  starMat.alpha = 0.001;
  stars.material = starMat;
  stars.infiniteDistance = true;
  stars.applyFog = false;
  stars.isPickable = false;
  stars.alwaysSelectAsActiveMesh = true;              // dôme : jamais à culler
  stars.isVisible = false;
  {
    const N = 260, R = 600;
    let s = 1237;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const buf = new Float32Array(N * 16);
    const q = new Quaternion(), sc = new Vector3(), tr = new Vector3();
    for (let i = 0; i < N; i++) {
      // uniforme en AIRE sur la calotte : y tiré à plat, rayon = sqrt(1-y²)
      const y = 0.03 + rnd() * 0.97;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const a = rnd() * TAU;
      const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
      // face avant d'un plan = -z : on aligne +z local sur le rayon sortant
      Quaternion.RotationYawPitchRollToRef(Math.atan2(dx, dz), -Math.asin(y), 0, q);
      const size = 1.8 + rnd() * rnd() * 4.2;          // quelques-unes plus vives
      sc.set(size, size, size);
      tr.set(dx * R, y * R, dz * R);
      Matrix.Compose(sc, q, tr).copyToArray(buf, i * 16);
    }
    stars.thinInstanceSetBuffer('matrix', buf, 16, true);
  }

  /* ---- averse : rideau de gouttes étirées, cellule qui suit le joueur ---- */
  const rainPS = new ParticleSystem('rain', 1400, scene);
  rainPS.particleTexture = dropTexture(scene);
  rainPS.emitter = new Vector3(0, CELL_H, 20);
  rainPS.minEmitBox = new Vector3(-CELL_HALF, -0.6, -CELL_HALF);
  rainPS.maxEmitBox = new Vector3(CELL_HALF, 0.6, CELL_HALF);
  rainPS.minLifeTime = 0.8; rainPS.maxLifeTime = 0.9;  // ~13-16 m de chute
  rainPS.minSize = 1.5; rainPS.maxSize = 2.1;
  rainPS.minScaleX = 0.06; rainPS.maxScaleX = 0.08;    // le sprite s'étire
  rainPS.minScaleY = 0.65; rainPS.maxScaleY = 0.85;
  rainPS.billboardMode = ParticleSystem.BILLBOARDMODE_Y;
  // les Color4 des gradients sont GARDÉS et mutés en place : la pluie prend
  // la teinte de l'heure (grise à midi, presque noire à minuit) sans rien
  // réallouer. Une particule ne relit son palier qu'en le franchissant : la
  // teinte accuse au plus une vie de retard — invisible sur une dérive qui
  // dure des minutes.
  const RAIN_G = [
    new Color4(0.66, 0.72, 0.84, 0), new Color4(0.66, 0.72, 0.84, 0.34),
    new Color4(0.64, 0.70, 0.82, 0.30), new Color4(0.64, 0.70, 0.82, 0),
  ];
  rainPS.addColorGradient(0, RAIN_G[0]);
  rainPS.addColorGradient(0.12, RAIN_G[1]);
  rainPS.addColorGradient(0.8, RAIN_G[2]);
  rainPS.addColorGradient(1, RAIN_G[3]);
  rainPS.minEmitPower = 15; rainPS.maxEmitPower = 19;
  rainPS.direction1 = new Vector3(WX * 0.08 - 0.03, -1, WZ * 0.08 - 0.03);
  rainPS.direction2 = new Vector3(WX * 0.08 + 0.03, -1, WZ * 0.08 + 0.03);
  rainPS.gravity = new Vector3(WX, -2.5, WZ);          // cisaillement au vent
  rainPS.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  rainPS.emitRate = 0;
  rainPS.start();

  /* ---- brume : nappe basse, bancs énormes et quasi transparents ---- */
  const mistPS = new ParticleSystem('mistBank', 40, scene);
  mistPS.particleTexture = glowTexture(scene, 'mistTex',
    'rgba(255,255,255,.55)', 'rgba(255,255,255,.3)');
  mistPS.emitter = new Vector3(0, -100, 0);
  mistPS.minEmitBox = new Vector3(-34, 0.2, -34);      // 68 m de nappe
  mistPS.maxEmitBox = new Vector3(34, 2.4, 34);
  // peu de bancs, énormes et presque transparents : c'est fogDensity qui
  // porte la brume, ces voiles ne font qu'y mettre du mouvement (le pire cas
  // 1,6/s × 22 s = 36 vivants tient sous la capacité, et le remplissage
  // reste raisonnable malgré des sprites de 14 m)
  mistPS.minLifeTime = 16; mistPS.maxLifeTime = 22;
  mistPS.addSizeGradient(0, 6);
  mistPS.addSizeGradient(1, 14);                       // le banc s'étale en mourant
  const MIST_G = [
    new Color4(0.72, 0.75, 0.80, 0), new Color4(0.72, 0.75, 0.80, 0.075),
    new Color4(0.70, 0.73, 0.78, 0.065), new Color4(0.68, 0.71, 0.76, 0),
  ];
  mistPS.addColorGradient(0, MIST_G[0]);
  mistPS.addColorGradient(0.3, MIST_G[1]);
  mistPS.addColorGradient(0.75, MIST_G[2]);
  mistPS.addColorGradient(1, MIST_G[3]);
  mistPS.minEmitPower = 0.02; mistPS.maxEmitPower = 0.12;
  mistPS.direction1 = new Vector3(WX * 0.5 - 0.15, 0.0, WZ * 0.5 - 0.15);
  mistPS.direction2 = new Vector3(WX * 0.5 + 0.15, 0.06, WZ * 0.5 + 0.15);
  mistPS.gravity = new Vector3(WX * 0.05, 0.004, WZ * 0.05);
  mistPS.minAngularSpeed = -0.05; mistPS.maxAngularSpeed = 0.05;
  mistPS.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  mistPS.emitRate = 0;
  mistPS.start();

  /* ---- lucioles (reprises de daycycle.js) : la nuit, et par beau temps ---- */
  const flies = new ParticleSystem('fireflies', 70, scene);
  flies.particleTexture = glowTexture(scene, 'fireflyTex',
    'rgba(255,255,255,1)', 'rgba(255,255,255,.55)');
  flies.emitter = new Vector3(0, -100, 0);
  flies.minEmitBox = new Vector3(-12, 0.3, -12);       // boîte 24 × 24 m,
  flies.maxEmitBox = new Vector3(12, 1.4, 12);         // 0,3–1,4 m au-dessus du sol
  flies.minLifeTime = 3.5; flies.maxLifeTime = 3.5;
  flies.minSize = 0.05; flies.maxSize = 0.09;
  // clignotement : double pulse d'alpha sur la vie, les émissions décalées
  // désynchronisent les phases d'elles-mêmes
  flies.addColorGradient(0, new Color4(0.75, 0.9, 0.45, 0));
  flies.addColorGradient(0.25, new Color4(0.75, 0.9, 0.45, 1));
  flies.addColorGradient(0.5, new Color4(0.75, 0.9, 0.45, 0));
  flies.addColorGradient(0.75, new Color4(0.75, 0.9, 0.45, 0.7));
  flies.addColorGradient(1, new Color4(0.75, 0.9, 0.45, 0));
  flies.minEmitPower = 0.12; flies.maxEmitPower = 0.4; // dérive lente
  flies.direction1 = new Vector3(-1, -0.35, -1);
  flies.direction2 = new Vector3(1, 0.5, 1);
  flies.blendMode = ParticleSystem.BLENDMODE_ADD;
  flies.emitRate = 0;
  flies.start();

  /* ---- état (tout est scalaire, rien n'est alloué dans update) ---- */
  let t = 0.30;                        // heure du monde, milieu de matinée
  let sy = 0;                          // sinus de la hauteur du soleil
  let nf = 0;
  let sunE = 0, sunN = 1;                    // composantes d'azimut, lues par les rais                          // nightFactor
  let paintClock = 1e9;                // force un premier repeint
  let skipP = 1, skipE = 1, skipD = 0; // glissement de skipTo
  // les étoiles restent visibles (à 0,002 d'alpha : rien à l'écran) le temps
  // que le warm-up de main.js compile leur pipeline sous l'écran de
  // chargement — jamais un à-coup au premier crépuscule
  let warm = 20;

  let seed = 4021;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cur = {}, from = {};
  for (let i = 0; i < WKEYS.length; i++) { cur[WKEYS[i]] = W.clair[WKEYS[i]]; from[WKEYS[i]] = 0; }
  let toName = 'clair', wp = 1;
  let dwell = DWELL_MIN + rnd() * DWELL_SPAN;

  let cellX = 0, cellZ = 20, cellY = CELL_H;   // cellule de pluie
  let dripClock = 1e9;                         // temps depuis la fin de l'averse
  let flyY = groundHeight(0, 20);              // hauteur amortie des boîtes
  const SH_DARK = shadows ? shadows.getDarkness() : 0;
  const SH_MAXZ = shadows ? shadows.shadowMaxZ : 0;
  let shLight = false;                         // cascades allégées ?

  /* Repeint du dégradé : SEUL point qui alloue (gradient canvas + chaînes),
   * d'où le throttle. Le « grey » désature vers la luminance du stop — un
   * couvert n'est pas une couleur de plus, c'est la même image aplatie. */
  function paintSky(tt, grey, cloud, day) {
    let i = 0;
    while (i < SKY.length - 2 && tt >= SKY[i + 1].t) i++;
    const a = SKY[i], b = SKY[i + 1];
    const raw = (tt - a.t) / (b.t - a.t);
    const u = raw * raw * (3 - 2 * raw);
    const grad = skyCtx.createLinearGradient(0, 0, 0, SH);
    for (let k = 0; k < 7; k++) {
      const ca = a.rgb[k], cb = b.rgb[k];
      let r = lerp(ca[0], cb[0], u);
      let g = lerp(ca[1], cb[1], u);
      let bl = lerp(ca[2], cb[2], u);
      if (grey > 0.001) {
        const l = r * 0.3 + g * 0.55 + bl * 0.15;
        r = lerp(r, l * 0.95, grey); g = lerp(g, l * 0.98, grey); bl = lerp(bl, l * 1.08, grey);
      }
      grad.addColorStop(lerp(a.pos[k], b.pos[k], u),
        'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(bl) + ')');
    }
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, SW, SH);
    // la couche : trois bandes au-dessus de l'horizon. Sur un dôme, une
    // bande horizontale devient un anneau — donc un vrai stratus, pour trois
    // fillRect. Elles s'assombrissent avec la nuit comme le reste du ciel.
    if (cloud > 0.02) {
      const c = Math.round(26 + 128 * day);
      for (let k = 0; k < 3; k++) {
        const y0 = (0.26 + k * 0.075) * SH, hgt = 0.078 * SH;
        const band = skyCtx.createLinearGradient(0, y0, 0, y0 + hgt);
        const al = (cloud * (0.17 - k * 0.035)).toFixed(3);
        band.addColorStop(0, 'rgba(' + c + ',' + (c + 5) + ',' + (c + 14) + ',0)');
        band.addColorStop(0.5, 'rgba(' + c + ',' + (c + 5) + ',' + (c + 14) + ',' + al + ')');
        band.addColorStop(1, 'rgba(' + c + ',' + (c + 5) + ',' + (c + 14) + ',0)');
        skyCtx.fillStyle = band;
        skyCtx.fillRect(0, y0, SW, hgt);
      }
    }
    skyTex.update();
  }

  /** ouvre une transition vers un état : la position courante devient le
   * point de départ, donc changer d'avis en cours de route ne saute jamais */
  function startTo(name, instant) {
    if (!W[name]) return;
    if (name === toName && !instant) return;
    for (let i = 0; i < WKEYS.length; i++) from[WKEYS[i]] = cur[WKEYS[i]];
    toName = name;
    wp = instant ? 1 : 0;
    // `instant` sert au mode capture : une transition de météo dure une
    // vingtaine de secondes, on ne peut pas cadrer une image dessus
    if (instant) {
      const to = W[name];
      for (let i = 0; i < WKEYS.length; i++) cur[WKEYS[i]] = to[WKEYS[i]];
    }
    dwell = DWELL_MIN + rnd() * DWELL_SPAN;
  }

  function update(dt, px, pz) {
    /* ---- l'heure : avance continue + éventuel glissement de skipTo ---- */
    let adv = dt / DAY_LENGTH;
    if (skipP < 1) {
      skipP = Math.min(1, skipP + dt / SKIP_DUR);
      const e = smoother(skipP);
      adv += skipD * (e - skipE);            // delta toujours positif : monotone
      skipE = e;
    }
    t += adv;
    if (t >= 1) t -= Math.floor(t);

    /* ---- arc solaire : angle horaire H, déclinaison fixe. Le vecteur
     * (est, haut, nord) est unitaire par construction. ---- */
    const H = (t - 0.5) * TAU;
    const cH = Math.cos(H), sH = Math.sin(H);
    sy = SIN_DEC * SIN_LAT + COS_DEC * cH * COS_LAT;
    const se = -COS_DEC * sH;
    sunE = se;
    const sn = SIN_DEC * COS_LAT - COS_DEC * cH * SIN_LAT;
    sunN = sn;

    /* ---- météo : un seul vecteur interpolé, tout en découle ---- */
    dwell -= dt;
    if (wp < 1) {
      wp = Math.min(1, wp + dt / BLEND);
      const e = smoother(wp);
      const to = W[toName];
      for (let i = 0; i < WKEYS.length; i++) {
        const k = WKEYS[i];
        cur[k] = lerp(from[k], to[k], e);
      }
    } else if (dwell <= 0) {
      const list = NEXT[toName];
      startTo(list[Math.min(list.length - 1, Math.floor(rnd() * list.length))]);
    }

    /* ---- lumière : soleil tant qu'il est levé, lune ensuite. Les deux
     * fondus sont DISJOINTS (le soleil est nul dès sy ≤ 0, la lune dès
     * sy ≥ -0,02) : le retournement de direction à sy = -0,01 se fait donc
     * à intensité rigoureusement nulle — pas de saut d'ombres. ---- */
    const sunAmt = sstep(0.0, 0.09, sy);
    const moonAmt = sstep(-0.02, -0.13, sy);
    if (sy < -0.01) {
      // la lune est l'antisolaire : haute à minuit, bleue et molle
      sun.direction.copyFromFloats(se, sy, sn);
      sun.diffuse.copyFromFloats(0.40, 0.52, 0.86);
      sun.intensity = 0.8 * moonAmt * (1 - 0.7 * cur.cloud);   // pleine lune
    } else {
      sun.direction.copyFromFloats(-se, -sy, -sn);
      // Couleur par EXTINCTION atmosphérique (PORTAGE 1.1), plus par
      // paliers keyframés : masse d'air de Kasten-Young, puis
      // exp(-β·airmass) par canal, normalisé au canal max — le rasant
      // rougit PARCE QUE le bleu s'éteint, pas parce qu'on l'a décidé.
      // Les palettes chaudes restent au DÔME ; ici on retire toute teinte
      // décidée à la main pour ne pas compter le rougissement deux fois.
      const hDeg = Math.max(0, Math.asin(Math.min(1, sy)) * 57.2958);
      const am = Math.min(38, 1 / (sy + 0.50572 * Math.pow(6.07995 + hDeg, -1.6364)));
      let cr = Math.exp(-0.19 * am), cg = Math.exp(-0.42 * am), cb = Math.exp(-0.95 * am);
      const cm = Math.max(cr, Math.max(cg, cb));
      sun.diffuse.copyFromFloats(cr / cm, cg / cm, cb / cm);
      // même plafond qu'avant (≈2,5 à midi) mais en loi y^0.8 : la montée
      // du matin est plus franche, le plateau de midi inchangé
      sun.intensity = sunAmt * (1.05 + 1.45 * Math.min(1, Math.pow(sy / 0.55, 0.8))) * cur.sun;
    }

    /* ---- barycentre nuit / entre-deux / jour ---- */
    const wD = sstep(0.02, 0.30, sy);
    const wN = sstep(-0.02, -0.20, sy);
    const wT = Math.max(0, 1 - wD - wN);
    nf = sstep(0.10, -0.16, sy);

    amb.intensity = (AMB_I[0] * wN + AMB_I[1] * wT + AMB_I[2] * wD) * cur.amb;
    amb.diffuse.copyFromFloats(
      AMB_D[0][0] * wN + AMB_D[1][0] * wT + AMB_D[2][0] * wD,
      AMB_D[0][1] * wN + AMB_D[1][1] * wT + AMB_D[2][1] * wD,
      AMB_D[0][2] * wN + AMB_D[1][2] * wT + AMB_D[2][2] * wD);
    amb.groundColor.copyFromFloats(
      AMB_G[0][0] * wN + AMB_G[1][0] * wT + AMB_G[2][0] * wD,
      AMB_G[0][1] * wN + AMB_G[1][1] * wT + AMB_G[2][1] * wD,
      AMB_G[0][2] * wN + AMB_G[1][2] * wT + AMB_G[2][2] * wD);

    // brume du matin : une nappe se lève au ras du sol autour du lever, même
    // par ciel clair — le pays respire avant que le soleil ne la brûle
    const dawnMist = 0.55 * Math.max(0, 1 - Math.abs(t - 0.255) / 0.055);
    const mistAmt = Math.max(cur.mist, dawnMist);

    let fr = FOG_C[0][0] * wN + FOG_C[1][0] * wT + FOG_C[2][0] * wD;
    let fg = FOG_C[0][1] * wN + FOG_C[1][1] * wT + FOG_C[2][1] * wD;
    let fb = FOG_C[0][2] * wN + FOG_C[1][2] * wT + FOG_C[2][2] * wD;
    if (cur.grey > 0.001) {                  // le couvert délave aussi la brume
      const l = fr * 0.3 + fg * 0.55 + fb * 0.15;
      const k = cur.grey * 0.8;
      fr = lerp(fr, l * 0.98, k); fg = lerp(fg, l * 1.0, k); fb = lerp(fb, l * 1.08, k);
    }
    scene.fogColor.copyFromFloats(fr, fg, fb);
    scene.fogDensity = (FOG_D[0] * wN + FOG_D[1] * wT + FOG_D[2] * wD)
      + cur.fog + 0.006 * dawnMist;
    // le fond n'est visible que par les trous du dôme : on le tient au ton
    // de l'horizon, un cran plus sombre
    scene.clearColor.copyFromFloats(fr * 0.85, fg * 0.85, fb * 0.85, 1);

    /* ---- dôme et étoiles ---- */
    paintClock += dt;
    if (paintClock >= PAINT_STEP) {
      paintClock = 0;
      paintSky(t, cur.grey, cur.cloud, wD);
    }
    // les étoiles percent dès que le soleil passe l'horizon, et les nuages
    // les mangent ; sous 0,01 d'alpha on coupe le maillage (rien à dessiner)
    const starA = 0.98 * sstep(0.0, -0.14, sy) * (1 - 0.92 * cur.cloud);
    const starOn = starA > 0.01 || warm > 0;
    if (starOn !== stars.isVisible) stars.isVisible = starOn;
    if (starOn) starMat.alpha = Math.max(0.002, starA);
    if (warm > 0) warm--;

    /* ---- averse : cellule qui dérive au vent, retenue par une laisse ---- */
    // le débit effectif garde un plancher d'égouttement de la canopée : le
    // max() assure la continuité quand la sortie croise la traîne
    if (cur.rain > 0.05) dripClock = 0; else dripClock += dt;
    const drip = dripClock < DRIP_HOLD ? 1
      : Math.max(0, 1 - (dripClock - DRIP_HOLD) / DRIP_FADE);
    const wet = Math.max(cur.rain, drip * 0.2);
    // sous le toit du garage, la cellule est tenue franchement dehors : son
    // demi-côté fait 17 m, il en faut plus pour qu'aucune goutte ne traverse
    const inside = Math.abs(px - GARAGE.x) < GARAGE.hw && pz > GARAGE.z0 && pz < GARAGE.z1;
    const tz = inside ? GARAGE.z0 - 26 : pz;
    cellX += WX * DRIFT * dt;
    cellZ += WZ * DRIFT * dt;
    const dx = px - cellX, dz = tz - cellZ;
    const d = Math.hypot(dx, dz);
    if (d > LEASH) {
      const k = (d - LEASH) * (1 - Math.exp(-2 * dt)) / d;
      cellX += dx * k; cellZ += dz * k;
    }
    cellY += (groundHeight(cellX, cellZ) + CELL_H - cellY) * Math.min(1, 3 * dt);
    rainPS.emitter.set(cellX, cellY, cellZ);
    rainPS.emitRate = 950 * wet;
    // la goutte n'est pas une source : elle prend la lumière de l'heure
    const rl = 0.24 + 0.76 * (wD + wT * 0.55);
    for (let i = 0; i < 4; i++) {
      const c = RAIN_G[i];
      c.r = (i < 2 ? 0.66 : 0.64) * rl;
      c.g = (i < 2 ? 0.72 : 0.70) * rl;
      c.b = (i < 2 ? 0.84 : 0.82) * rl;
    }
    // humidité au sol : addWet ACCUMULE côté GPU (canal saturé à 1, séchage
    // ~1 min) — a ≈ 0,05 × débit × dt donne un sol mouillé après ~8 s
    if (wet > 0.05) {
      const a = 0.05 * wet * dt;
      for (let i = 0; i < 3; i++) {          // file wsplats : 8 max/frame
        deform.addWet(
          cellX + (rnd() * 2 - 1) * (CELL_HALF - 2),
          cellZ + (rnd() * 2 - 1) * (CELL_HALF - 2),
          4 + rnd() * 10, a);
      }
    }

    /* ---- nappes et lucioles : une seule requête de sol par frame ---- */
    flyY += (groundHeight(px, pz) - flyY) * Math.min(1, 3 * dt);
    mistPS.emitter.set(px, flyY + 0.15, pz);
    mistPS.emitRate = 1.6 * mistAmt;
    for (let i = 0; i < 4; i++) {            // la nappe prend la teinte du ciel
      const c = MIST_G[i];
      c.r = fr * 0.5 + 0.42 * (wD + wT * 0.6);
      c.g = fg * 0.5 + 0.44 * (wD + wT * 0.6);
      c.b = fb * 0.5 + 0.48 * (wD + wT * 0.6);
    }
    flies.emitter.set(px, flyY, pz);
    // seulement la nuit, et seulement quand le ciel n'est pas bouché
    flies.emitRate = 18 * sstep(0.35, 0.85, nf) * (1 - sstep(0.35, 0.70, cur.cloud));

    /* ---- ombres : la lune ne creuse pas comme le soleil, et un ciel
     * couvert n'a pas d'ombre portée du tout. Au cœur de la nuit les
     * cascades se resserrent (moins de géométrie rendue) — bascule à
     * hystérésis, donc jamais de va-et-vient. ---- */
    if (shadows) {
      shadows.setDarkness(Math.min(0.95, SH_DARK + 0.54 * nf + 0.26 * cur.cloud));
      if (!shLight && nf > 0.92) { shLight = true; shadows.shadowMaxZ = SH_MAXZ * 0.5; }
      else if (shLight && nf < 0.86) { shLight = false; shadows.shadowMaxZ = SH_MAXZ; }
    }
  }

  /** pose l'heure sèchement (outil de cadrage) */
  function setTime(v) {
    t = v - Math.floor(v);
    skipP = 1; skipD = 0;
    paintClock = 1e9;                        // repeint dès la frame suivante
  }

  /** y glisse en ~4 s, toujours vers l'avant (le temps ne recule pas) */
  function skipTo(v) {
    let d = (v - Math.floor(v)) - t;
    if (d < 0) d += 1;
    skipD = d; skipP = 0; skipE = 0;
  }

  return {
    update,
    setTime,
    skipTo,
    setWeather: startTo,
    timeOfDay: () => t,
    weatherName: () => toName,               // l'état visé — le temps qu'il fait
    rainEase: () => cur.rain,
    nightFactor: () => nf,
    sunUp: () => sy > 0,
    sunHeight: () => sy,                     // hauteur du soleil, pour les nuages
    cloudiness: () => cur.cloud,
    // azimut du soleil : d'où vient la lumière, pour les rais
    sunAzimuth: () => Math.atan2(sunE, sunN),
  };
}
