/**
 * La forêt enrichie — la couche qui casse la monotonie des 1900 pins.
 * Bouleaux clairs en bosquets (thin instances, tronc + feuillage sur les mêmes
 * matrices), souches, troncs couchés moussus dont un en travers d'un creux,
 * rochers coiffés de mousse, champignons au pied des arbres, et le panneau de
 * bois penché au bord de la route. Tout est procédural et déterministe (LCG),
 * tout le gros est shadow caster ET receiveShadows, et rien ne s'anime hors du
 * vent des feuillages : aucune fonction par frame, donc aucune allocation.
 * Ce module N'EST PAS un remplacement de pines.js — il s'empile dessus, avec
 * les mêmes exclusions (8 m du tracé, emprise du garage).
 */
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { height, roadQuery, samples, GARAGE } from '../terrain/road.js';
import { WindPlugin } from './wind.js';

const MIN_ROAD = 8.0;              // même respiration que les pins (couronnes comprises)

/** exclusions communes : le tracé respire, l'esplanade du garage reste nue */
function freeAt(x, z, minRoad) {
  if (roadQuery(x, z).dist < minRoad) return false;   // scratch consommé aussitôt
  if (Math.abs(x - GARAGE.x) < GARAGE.hw + 5 && z > GARAGE.z0 - 8 && z < GARAGE.z1 + 5) return false;
  return true;
}

/* ---- écorce de bouleau : blanc crème, lenticelles noires irrégulières ----
 * v = 0 est le PIED du cylindre (bas du canvas) : le socle sombre s'y peint.
 * u boucle une fois autour du tronc — les marques qui débordent à droite sont
 * redessinées à gauche pour que la couture ne se voie pas. */
function birchBarkTexture(scene) {
  const W = 128, H = 256;
  const tex = new DynamicTexture('flBirchBark', { width: W, height: H }, scene, true);
  const g = tex.getContext();
  let s = 601;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const band = (x, y, w, h) => { g.fillRect(x, y, w, h); if (x + w > W) g.fillRect(x - W, y, w, h); };
  g.fillStyle = '#e7e0ce'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {                                // marbrures très douces
    g.fillStyle = rnd() < 0.5 ? 'rgba(172,166,148,.16)' : 'rgba(255,253,246,.5)';
    band(rnd() * W, rnd() * H, 6 + rnd() * 28, 2 + rnd() * 6);
  }
  g.fillStyle = 'rgba(24,20,17,.8)';                            // lenticelles
  for (let i = 0; i < 56; i++) {
    const x = rnd() * W, y = rnd() * H, w = 4 + rnd() * 32, h = 1 + rnd() * 3.5;
    band(x, y, w, h);
    if (rnd() < 0.45) band(x + w * 0.3, y + h + 1 + rnd() * 4, w * 0.45, 1 + rnd() * 2);
  }
  g.fillStyle = 'rgba(28,23,19,.62)';                           // cicatrices de branches
  for (let i = 0; i < 5; i++) {
    const x = 16 + rnd() * (W - 32), y = 24 + rnd() * (H - 110);
    g.beginPath();
    g.moveTo(x - 10, y); g.lineTo(x, y - 12); g.lineTo(x + 10, y);
    g.lineTo(x + 5, y + 4); g.lineTo(x, y - 4); g.lineTo(x - 5, y + 4);
    g.closePath(); g.fill();
  }
  const gr = g.createLinearGradient(0, H, 0, H - 76);           // le pied s'encrasse
  gr.addColorStop(0, 'rgba(36,30,24,.78)'); gr.addColorStop(1, 'rgba(36,30,24,0)');
  g.fillStyle = gr; g.fillRect(0, H - 76, W, 76);
  tex.update();
  return tex;
}

/* ---- bois mort : moitié gauche = écorce (le fût), moitié droite = la coupe
 * (cernes). Les faceUV des cylindres piochent l'une ou l'autre : les souches
 * et les troncs couchés montrent un vrai bois de bout, sans maillage en plus. */
function deadWoodTexture(scene) {
  const tex = new DynamicTexture('flDeadWood', { width: 512, height: 256 }, scene, true);
  const g = tex.getContext();
  let s = 233;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // écorce : sillons dans le sens du fût (v), plaques qui se décollent
  g.fillStyle = '#4b3b2b'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 130; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(24,17,11,.45)' : 'rgba(124,99,68,.2)';
    g.fillRect(rnd() * 256, rnd() * 256 - 60, 2 + rnd() * 8, 40 + rnd() * 150);
  }
  for (let i = 0; i < 10; i++) {                                // plaques décollées
    const x = rnd() * 240, y = rnd() * 210;
    g.fillStyle = 'rgba(16,11,7,.4)';
    g.fillRect(x, y, 10 + rnd() * 22, 24 + rnd() * 46);
  }
  // la coupe : aubier clair, cernes décentrés, fentes de retrait
  g.fillStyle = '#b28c5e'; g.fillRect(256, 0, 256, 256);
  const cx = 390, cy = 122;
  for (let r = 118; r > 3; r -= 2 + rnd() * 4) {
    g.strokeStyle = rnd() < 0.5 ? 'rgba(92,64,36,.5)' : 'rgba(206,176,130,.4)';
    g.lineWidth = 1 + rnd() * 1.8;
    g.beginPath();
    for (let a = 0; a <= 22; a++) {                             // cercle imparfait
      const t = (a / 22) * Math.PI * 2;
      const rr = r * (1 + Math.sin(t * 3 + r * 0.4) * 0.05);
      const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr * 0.95;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(58,40,22,.6)'; g.lineWidth = 2.5;       // fentes
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * 112, cy + Math.sin(a) * 108); g.stroke();
  }
  g.strokeStyle = 'rgba(50,37,24,.9)'; g.lineWidth = 13;        // l'écorce au pourtour
  g.beginPath(); g.arc(384, 128, 121, 0, 7); g.stroke();
  tex.update();
  return tex;
}

/* ---- chapeau d'amanite : rouge sombre, points crème ---- */
function capTexture(scene) {
  const tex = new DynamicTexture('flCapTex', 64, scene, true);
  const g = tex.getContext();
  let s = 907;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#a4271b'; g.fillRect(0, 0, 64, 64);
  const rg = g.createLinearGradient(0, 0, 0, 64);
  rg.addColorStop(0, 'rgba(216,74,40,.5)'); rg.addColorStop(1, 'rgba(88,18,12,.5)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(240,234,212,.92)';
  for (let i = 0; i < 24; i++) {
    g.beginPath(); g.arc(rnd() * 64, rnd() * 56, 1.4 + rnd() * 2.3, 0, 7); g.fill();
  }
  tex.update();
  return tex;
}

/* ---- la planche du panneau : bois grisé, peinture écaillée ---- */
function signTexture(scene) {
  const tex = new DynamicTexture('flSignTex', { width: 512, height: 160 }, scene, true);
  const g = tex.getContext();
  let s = 313;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#6e6353'; g.fillRect(0, 0, 512, 160);          // gris de dix hivers
  for (let i = 0; i < 100; i++) {                               // fil du bois
    g.fillStyle = rnd() < 0.5 ? 'rgba(38,32,24,.28)' : 'rgba(152,144,126,.22)';
    g.fillRect(rnd() * 512, rnd() * 160, 40 + rnd() * 170, 1 + rnd() * 2);
  }
  g.fillStyle = 'rgba(26,22,17,.45)'; g.fillRect(0, 96, 512, 3); // joint des 2 planches
  g.textAlign = 'center';
  g.font = '700 62px Georgia, serif';
  g.fillStyle = 'rgba(18,13,9,.55)'; g.fillText('LA ROUTE', 259, 73);
  g.fillStyle = '#e8dec2'; g.fillText('LA ROUTE', 256, 70);
  // la flèche : à z ≈ -40 le tracé part vers +x, soit la GAUCHE de qui arrive
  g.fillStyle = '#e8dec2';
  g.beginPath();
  g.moveTo(150, 128); g.lineTo(206, 106); g.lineTo(206, 119);
  g.lineTo(362, 119); g.lineTo(362, 137); g.lineTo(206, 137); g.lineTo(206, 150);
  g.closePath(); g.fill();
  for (let i = 0; i < 70; i++) {                                // la peinture s'écaille
    g.fillStyle = 'rgba(110,99,83,.5)';
    g.fillRect(rnd() * 512, rnd() * 160, 2 + rnd() * 9, 2 + rnd() * 7);
  }
  g.fillStyle = 'rgba(30,26,20,.6)';                            // clous
  for (const [x, y] of [[16, 20], [496, 20], [16, 140], [496, 140]]) {
    g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  }
  tex.update();
  return tex;
}

export function plantFlora(scene, shadows) {
  let s = 4409;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const obstacles = [];                                // {x, z, r}, format de pines.trunks
  // scratchs de composition : réutilisés pour les milliers de matrices
  const q = new Quaternion(), sc = new Vector3(), tr = new Vector3();

  const mat = (name, color, tex) => {
    const m = new StandardMaterial(name, scene);
    if (color) m.diffuseColor = color;
    if (tex) m.diffuseTexture = tex;
    m.specularColor = new Color3(0.03, 0.03, 0.03);   // le bois et la mousse ne brillent pas
    m.maxSimultaneousLights = 6;                      // soleil + ciel + phares/feu/garage
    return m;
  };
  const woodTex = deadWoodTexture(scene);
  const barkM = mat('flBirchBarkM', null, birchBarkTexture(scene));
  new WindPlugin(barkM, { strength: 0.18 });          // le fût plie à peine
  const leafM = mat('flBirchLeafM', new Color3(0.44, 0.56, 0.24));
  // feuilles fines : elles s'allument à contre-jour et dansent plus que l'aiguille
  new WindPlugin(leafM, { strength: 1.2, transl: 0.7 });
  const woodM = mat('flDeadWoodM', null, woodTex);
  const mossM = mat('flMossM', new Color3(0.21, 0.35, 0.15));
  const rockM = mat('flRockM', new Color3(0.34, 0.35, 0.38));
  const stemM = mat('flStemM', new Color3(0.86, 0.83, 0.74));
  const capRM = mat('flCapRM', null, capTexture(scene));
  const capBM = mat('flCapBM', new Color3(0.44, 0.29, 0.16));
  const signWoodM = mat('flSignWoodM', new Color3(0.42, 0.39, 0.33));
  const signM = mat('flSignM', null, signTexture(scene));

  /** un maillage de thin instances : ombres des deux côtés, jamais pické */
  const setup = (mesh, material, caster) => {
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    if (caster) shadows.addShadowCaster(mesh);
    return mesh;
  };
  /** upload d'un tableau de matrices dans un buffer de thin instances */
  const upload = (mats) => {
    const buf = new Float32Array(mats.length * 16);
    for (let i = 0; i < mats.length; i++) mats[i].copyToArray(buf, i * 16);
    return buf;
  };

  /* ================= 1. BOULEAUX ================= */
  // fût élancé, 6 côtés : la silhouette suffit, le reste est dans la texture
  const bTrunk = MeshBuilder.CreateCylinder('flBirchTrunk',
    { diameterTop: 0.13, diameterBottom: 0.30, height: 5.6, tessellation: 6 }, scene);
  bTrunk.position.y = 2.8;
  bTrunk.bakeCurrentTransformIntoVertices();          // origine au pied, comme les pins
  setup(bTrunk, barkM, true);
  // trois masses arrondies décalées : un houppier, pas une boule
  const f1 = MeshBuilder.CreateSphere('flB1', { diameter: 2.5, segments: 5 }, scene);
  f1.position.set(0.12, 3.75, 0.06); f1.scaling.set(1, 0.85, 1);
  const f2 = MeshBuilder.CreateSphere('flB2', { diameter: 1.95, segments: 5 }, scene);
  f2.position.set(-0.5, 4.6, 0.28); f2.scaling.set(1, 0.9, 1);
  const f3 = MeshBuilder.CreateSphere('flB3', { diameter: 1.4, segments: 4 }, scene);
  f3.position.set(0.45, 5.0, -0.3);
  const bLeaf = Mesh.MergeMeshes([f1, f2, f3], true, true);
  bLeaf.name = 'flBirchLeaf';
  setup(bLeaf, leafM, true);

  const N_BIRCH = 420;
  const birchMats = [];
  const feet = [];                                    // pieds d'arbres : hôtes à champignons
  let guard = 0;
  while (birchMats.length < N_BIRCH && guard++ < 6000) {
    // graine de bosquet : un point du tracé, un côté, 10 à 30 m au large —
    // les bouleaux bordent la route, c'est là qu'ils tranchent avec les pins
    const sm = samples[2 + Math.floor(rnd() * (samples.length - 4))];
    const side = rnd() < 0.5 ? 1 : -1;                // droite/gauche du sens de marche
    const d = 10 + rnd() * 20;
    const gx = sm.x + sm.tz * side * d, gz = sm.z - sm.tx * side * d;
    if (!freeAt(gx, gz, MIN_ROAD + 1.5)) continue;
    if (height(gx, gz) > sm.y + 1.3) continue;        // pas sur les buttes : ils aiment les fonds
    const n = 5 + Math.floor(rnd() * 8);              // grappe de 5 à 12
    const spread = 2.6 + rnd() * 4.4;
    for (let k = 0; k < n && birchMats.length < N_BIRCH; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spread;
      const x = gx + Math.cos(a) * r, z = gz + Math.sin(a) * r;
      if (!freeAt(x, z, MIN_ROAD)) continue;
      const sv = 0.8 + rnd() * 0.42;
      Quaternion.RotationYawPitchRollToRef(rnd() * Math.PI * 2,
        (rnd() - 0.5) * 0.07, (rnd() - 0.5) * 0.07, q);
      sc.set(sv, sv * (0.9 + rnd() * 0.32), sv);
      tr.set(x, height(x, z) - 0.1, z);
      birchMats.push(Matrix.Compose(sc, q, tr));
      obstacles.push({ x, z, r: 0.15 * sv + 0.09 });
      feet.push({ x, z, r: 0.55 * sv });
    }
  }
  const birchBuf = upload(birchMats);
  bTrunk.thinInstanceSetBuffer('matrix', birchBuf, 16, true);
  bLeaf.thinInstanceSetBuffer('matrix', birchBuf, 16, true);

  /* ================= 2. SOUCHES ================= */
  // cylindre bas, coupé net : faceUV[0] et [2] (les deux fonds) piochent la
  // coupe cernée, faceUV[1] (le fût) l'écorce
  const CUT = new Vector4(0.5, 0, 1, 1), BARK = new Vector4(0, 0, 0.5, 1);
  const stump = MeshBuilder.CreateCylinder('flStump', {
    diameterTop: 0.58, diameterBottom: 0.76, height: 0.5, tessellation: 8,
    faceUV: [CUT, BARK, CUT],
  }, scene);
  stump.position.y = 0.25;
  stump.bakeCurrentTransformIntoVertices();
  setup(stump, woodM, true);
  // la mousse au pied : un tore écrasé, collerette qui noie le raccord au sol
  const stumpMoss = MeshBuilder.CreateTorus('flStumpMoss',
    { diameter: 0.86, thickness: 0.3, tessellation: 8 }, scene);
  stumpMoss.scaling.set(1, 0.4, 1);
  stumpMoss.position.y = 0.06;
  stumpMoss.bakeCurrentTransformIntoVertices();
  setup(stumpMoss, mossM, false);

  const N_STUMP = 40;
  const stumpMats = [];
  guard = 0;
  while (stumpMats.length < N_STUMP && guard++ < 3000) {
    const x = (rnd() - 0.5) * 300 - 8, z = 34 - rnd() * 300;
    if (!freeAt(x, z, MIN_ROAD)) continue;
    const sv = 0.7 + rnd() * 0.65;
    Quaternion.RotationYawPitchRollToRef(rnd() * Math.PI * 2,
      (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1, q);
    sc.set(sv, sv * (0.7 + rnd() * 0.6), sv);
    tr.set(x, height(x, z) - 0.06, z);
    stumpMats.push(Matrix.Compose(sc, q, tr));
    obstacles.push({ x, z, r: 0.4 * sv });
    feet.push({ x, z, r: 0.5 * sv });
  }
  const stumpBuf = upload(stumpMats);
  stump.thinInstanceSetBuffer('matrix', stumpBuf, 16, true);
  stumpMoss.thinInstanceSetBuffer('matrix', stumpBuf, 16, true);

  /* ================= 3. TRONCS COUCHÉS ================= */
  // couché sur l'axe local +z (rotation.x = π/2 : +y devient +z), légèrement
  // enfoncé ; le fût est étiré 3× en v pour que l'écorce ne bave pas sur 4 m
  const log = MeshBuilder.CreateCylinder('flLog', {
    diameterTop: 0.46, diameterBottom: 0.5, height: 4.0, tessellation: 8,
    faceUV: [CUT, new Vector4(0, 0, 0.5, 3), CUT],
  }, scene);
  log.rotation.x = Math.PI / 2;
  log.position.y = 0.24;
  log.bakeCurrentTransformIntoVertices();
  setup(log, woodM, true);
  // la mousse du dessus : même cylindre, à peine plus large et APLATI (l'axe
  // radial local z devient la verticale après la rotation) — seul le sommet
  // du tronc émerge sous la mousse, les flancs restent en bois nu
  const logMoss = MeshBuilder.CreateCylinder('flLogMoss',
    { diameter: 0.5, height: 3.4, tessellation: 8 }, scene);
  logMoss.scaling.set(1, 1, 0.78);
  logMoss.rotation.x = Math.PI / 2;
  logMoss.position.y = 0.31;
  logMoss.bakeCurrentTransformIntoVertices();
  setup(logMoss, mossM, false);

  const N_LOG = 14;
  const logs = [];                                    // {x, y, z, yaw, sy, sz}
  // LA PASSERELLE : on cherche le meilleur creux — deux berges de même niveau,
  // un milieu nettement plus bas. Le tronc s'y pose de niveau, comme un pont.
  {
    let bx = 0, bz = 0, byaw = 0, by = 0, best = -1e9;
    for (let i = 0; i < 1400; i++) {
      const x = (rnd() - 0.5) * 280 - 8, z = 28 - rnd() * 280;
      if (!freeAt(x, z, MIN_ROAD + 2)) continue;
      const yaw = rnd() * Math.PI;
      const dx = Math.sin(yaw) * 3.1, dz = Math.cos(yaw) * 3.1;
      if (!freeAt(x + dx, z + dz, MIN_ROAD) || !freeAt(x - dx, z - dz, MIN_ROAD)) continue;
      const ha = height(x + dx, z + dz), hb = height(x - dx, z - dz), hc = height(x, z);
      if (Math.abs(ha - hb) > 0.5) continue;          // berges de niveau, sinon ça glisse
      const span = Math.min(ha, hb) - hc;
      if (span > best) { best = span; bx = x; bz = z; byaw = yaw; by = Math.min(ha, hb); }
    }
    logs.push({ x: bx, y: by - 0.1, z: bz, yaw: byaw, roll: 0.05, sx: 1.2, sy: 1.2, sz: 1.55 });
  }
  guard = 0;
  while (logs.length < N_LOG && guard++ < 3000) {
    const x = (rnd() - 0.5) * 300 - 8, z = 32 - rnd() * 300;
    if (!freeAt(x, z, MIN_ROAD)) continue;
    const yaw = rnd() * Math.PI * 2;
    const sv = 0.75 + rnd() * 0.55;
    const dx = Math.sin(yaw) * 2.0 * sv, dz = Math.cos(yaw) * 2.0 * sv;
    if (!freeAt(x + dx, z + dz, MIN_ROAD) || !freeAt(x - dx, z - dz, MIN_ROAD)) continue;
    const ha = height(x + dx, z + dz), hb = height(x - dx, z - dz);
    if (Math.abs(ha - hb) > 0.45) continue;           // un tronc ne tient pas en travers d'un talus
    logs.push({
      x, y: Math.min(ha, hb) - 0.09, z, yaw,
      roll: (rnd() - 0.5) * 0.3, sx: sv, sy: sv, sz: sv * (0.85 + rnd() * 0.5),
    });
  }
  const logMats = [];
  for (const l of logs) {
    Quaternion.RotationYawPitchRollToRef(l.yaw, 0, l.roll, q);
    sc.set(l.sx, l.sy, l.sz);
    tr.set(l.x, l.y, l.z);
    logMats.push(Matrix.Compose(sc, q, tr));
    // obstacle SEULEMENT là où le fût touche le sol : la passerelle enjambe le
    // creux, on ne bloque pas le passage sous elle
    const dx = Math.sin(l.yaw), dz = Math.cos(l.yaw);
    for (const t of [-1.5, 0, 1.5]) {
      const ox = l.x + dx * t * l.sz, oz = l.z + dz * t * l.sz;
      if (l.y + 0.24 * l.sy - height(ox, oz) < 0.5) obstacles.push({ x: ox, z: oz, r: 0.34 * l.sx });
    }
  }
  const logBuf = upload(logMats);
  log.thinInstanceSetBuffer('matrix', logBuf, 16, true);
  logMoss.thinInstanceSetBuffer('matrix', logBuf, 16, true);

  /* ================= 4. ROCHERS MOUSSUS ================= */
  const rock = MeshBuilder.CreateIcoSphere('flRock', { radius: 1, subdivisions: 1 }, scene);
  setup(rock, rockM, true);
  // calotte : icosphère plus petite remontée — elle n'émerge qu'au-dessus du
  // tiers supérieur, exactement où la mousse pousse (au nord, à l'ombre)
  const rockMoss = MeshBuilder.CreateIcoSphere('flRockMoss', { radius: 0.86, subdivisions: 1 }, scene);
  rockMoss.position.y = 0.26;
  rockMoss.rotation.y = 0.7;                          // facettes désalignées du granit
  rockMoss.bakeCurrentTransformIntoVertices();
  setup(rockMoss, mossM, false);

  const N_ROCK = 30;
  const rockMats = [];
  guard = 0;
  while (rockMats.length < N_ROCK && guard++ < 3000) {
    const x = (rnd() - 0.5) * 300 - 8, z = 34 - rnd() * 300;
    if (!freeAt(x, z, MIN_ROAD)) continue;
    const sx = 0.7 + rnd() * 1.5;
    const sy = sx * (0.5 + rnd() * 0.3);              // aplati : un affleurement, pas un ballon
    Quaternion.RotationYawPitchRollToRef(rnd() * Math.PI * 2,
      (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, q);
    sc.set(sx, sy, sx * (0.8 + rnd() * 0.45));
    tr.set(x, height(x, z) - sy * 0.35, z);           // en partie enterré
    rockMats.push(Matrix.Compose(sc, q, tr));
    obstacles.push({ x, z, r: sx * 0.82 });
  }
  const rockBuf = upload(rockMats);
  rock.thinInstanceSetBuffer('matrix', rockBuf, 16, true);
  rockMoss.thinInstanceSetBuffer('matrix', rockBuf, 16, true);

  /* ================= 5. CHAMPIGNONS ================= */
  const stem = MeshBuilder.CreateCylinder('flStem',
    { diameterTop: 0.035, diameterBottom: 0.055, height: 0.12, tessellation: 5 }, scene);
  stem.position.y = 0.06;
  stem.bakeCurrentTransformIntoVertices();
  setup(stem, stemM, false);
  // deux chapeaux : rouge à points, brun. PAS de clone() — un mesh cloné
  // PARTAGE sa géométrie, et le second buffer de thin instances écraserait
  // les matrices du premier (les attributs world0..3 vivent dans la géométrie)
  const dome = (name) => {
    const m = MeshBuilder.CreateSphere(name, { diameter: 0.15, segments: 6 }, scene);
    m.scaling.set(1, 0.62, 1);                        // galette, pas bille
    m.position.y = 0.12;
    m.bakeCurrentTransformIntoVertices();
    return m;
  };
  const capR = dome('flCapR');
  setup(capR, capRM, false);
  const capB = dome('flCapB');
  setup(capB, capBM, false);

  const N_SHROOM = 180;
  const stemMats = [], capRMats = [], capBMats = [];
  guard = 0;
  while (stemMats.length < N_SHROOM && guard++ < 900) {
    // une colonie pousse au pied d'un arbre ou sur le dos d'un tronc couché
    const onLog = rnd() < 0.34;
    const host = onLog ? logs[Math.floor(rnd() * logs.length)] : feet[Math.floor(rnd() * feet.length)];
    if (!host) break;
    const n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n && stemMats.length < N_SHROOM; k++) {
      let x, y, z;
      if (onLog) {
        const t = (rnd() - 0.5) * 2.8 * host.sz;      // le long du dos
        const o = (rnd() - 0.5) * 0.16;               // à peine de part et d'autre
        x = host.x + Math.sin(host.yaw) * t + Math.cos(host.yaw) * o;
        z = host.z + Math.cos(host.yaw) * t - Math.sin(host.yaw) * o;
        y = host.y + 0.44 * host.sy;                  // sur la crête, sous la mousse
      } else {
        const a = rnd() * Math.PI * 2, r = host.r + 0.15 + rnd() * 0.7;
        x = host.x + Math.cos(a) * r; z = host.z + Math.sin(a) * r;
        y = height(x, z) - 0.015;
      }
      Quaternion.RotationYawPitchRollToRef(rnd() * Math.PI * 2,
        (rnd() - 0.5) * 0.24, (rnd() - 0.5) * 0.24, q);
      const sv = 0.55 + rnd() * 0.85;
      sc.set(sv, sv * (0.8 + rnd() * 0.5), sv);
      tr.set(x, y, z);
      const m = Matrix.Compose(sc, q, tr);
      stemMats.push(m);
      (rnd() < 0.55 ? capRMats : capBMats).push(m);
    }
  }
  stem.thinInstanceSetBuffer('matrix', upload(stemMats), 16, true);
  capR.thinInstanceSetBuffer('matrix', upload(capRMats), 16, true);
  capB.thinInstanceSetBuffer('matrix', upload(capBMats), 16, true);

  /* ================= 6. LE PANNEAU ================= */
  // l'échantillon du tracé le plus proche de z = -40
  let si = 0;
  for (let i = 1; i < samples.length; i++) {
    if (Math.abs(samples[i].z + 40) < Math.abs(samples[si].z + 40)) si = i;
  }
  const sp = samples[si];
  // seule pièce plantée dans les 8 m : un panneau se lit depuis la chaussée,
  // sinon il ne sert à rien. 5,4 m de l'axe = hors d'atteinte du van qui
  // tient sa voie (ses palpeurs portent à 1,6 m + 1,0 m de rayon).
  const pxs = sp.x + sp.tz * 5.4, pzs = sp.z - sp.tx * 5.4;   // (tz,-tx) = la droite du sens de marche
  const signRoot = new TransformNode('flSignRoot', scene);
  signRoot.position.set(pxs, height(pxs, pzs) - 0.12, pzs);
  // la face avant d'un plan regarde -z : yaw = atan2(tx,tz) la retourne vers
  // qui arrive ; le reste, c'est du travers assumé
  signRoot.rotation.set(0.05, Math.atan2(sp.tx, sp.tz) + 0.22, 0.15);
  const signParts = [];
  const post = MeshBuilder.CreateCylinder('flSignPost',
    { diameter: 0.13, height: 2.35, tessellation: 6 }, scene);
  post.position.y = 1.17;
  const plank = MeshBuilder.CreateBox('flSignPlank',
    { width: 1.5, height: 0.42, depth: 0.07 }, scene);
  plank.position.set(0.04, 1.88, -0.055);
  const face = MeshBuilder.CreatePlane('flSignFace', { width: 1.44, height: 0.38 }, scene);
  face.position.set(0.04, 1.88, -0.096);
  post.material = signWoodM; plank.material = signWoodM; face.material = signM;
  for (const m of [post, plank, face]) {
    m.parent = signRoot;
    m.receiveShadows = true;
    m.isPickable = false;
    signParts.push(m);
  }
  shadows.addShadowCaster(post);
  shadows.addShadowCaster(plank);
  for (const m of signParts) m.freezeWorldMatrix();   // rien ne bouge plus jamais
  signRoot.freezeWorldMatrix();
  obstacles.push({ x: pxs, z: pzs, r: 0.22 });

  const count = birchMats.length + stumpMats.length + logMats.length
    + rockMats.length + stemMats.length + 1;
  return { obstacles, count };
}
