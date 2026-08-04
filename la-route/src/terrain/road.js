/**
 * La route : spline Catmull-Rom échantillonnée finement, hauteur lissée le
 * long du tracé, et requête « distance au tracé » utilisée pour sculpter le
 * terrain (déblai/remblai) et écarter les arbres.
 */
import { baseHeight } from './noise.js';

const CTRL = [
  [0, 60], [0, 30], [0, 0], [-9, -35], [7, -70], [26, -105],
  [8, -140], [-22, -175], [-34, -215], [-30, -255], [-30, -290],
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** échantillons {x, z, y, tx, tz} tous les ~2 m */
export const samples = [];
for (let i = 1; i < CTRL.length - 2; i++) {
  const [x0, z0] = CTRL[i - 1], [x1, z1] = CTRL[i], [x2, z2] = CTRL[i + 1], [x3, z3] = CTRL[i + 2];
  const segLen = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(4, Math.ceil(segLen / 2));
  for (let j = 0; j < n; j++) {
    const t = j / n;
    samples.push({
      x: catmull(x0, x1, x2, x3, t),
      z: catmull(z0, z1, z2, z3, t),
      y: 0, tx: 0, tz: 0,
    });
  }
}
// hauteur : moyenne glissante du sol le long du tracé (la route épouse en lissant)
for (const s of samples) s.y = baseHeight(s.x, s.z);
for (let pass = 0; pass < 3; pass++) {
  for (let i = 1; i < samples.length - 1; i++) {
    samples[i].y = (samples[i - 1].y + samples[i].y * 2 + samples[i + 1].y) / 4;
  }
}
// tangentes
for (let i = 0; i < samples.length; i++) {
  const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  samples[i].tx = (b.x - a.x) / l;
  samples[i].tz = (b.z - a.z) / l;
}

export const ROAD_HALF = 2.9;     // demi-largeur roulable
export const SHOULDER = 8.5;      // fin du talus

/* Grille d'accélération : candidat « échantillon le plus proche » par cellule
 * de 2 m (BFS multi-source), affiné par un balayage local exact. Fait passer
 * roadQuery de O(n) à O(1) — indispensable au re-remplissage du patch de
 * déformation (66 k sommets par recentrage). */
const GX0 = -210, GZ0 = -330, GCELL = 2, GW = 220, GH = 210;
const roadGrid = new Int32Array(GW * GH).fill(-1);
{
  const qx = [], qz = [];
  for (let i = 0; i < samples.length; i++) {
    const cx = Math.round((samples[i].x - GX0) / GCELL);
    const cz = Math.round((samples[i].z - GZ0) / GCELL);
    if (cx >= 0 && cx < GW && cz >= 0 && cz < GH) {
      const c = cz * GW + cx;
      if (roadGrid[c] < 0) { roadGrid[c] = i; qx.push(cx); qz.push(cz); }
    }
  }
  for (let h = 0; h < qx.length; h++) {              // BFS 4-connexe
    const cx = qx[h], cz = qz[h], src = roadGrid[cz * GW + cx];
    if (cx > 0 && roadGrid[cz * GW + cx - 1] < 0) { roadGrid[cz * GW + cx - 1] = src; qx.push(cx - 1); qz.push(cz); }
    if (cx < GW - 1 && roadGrid[cz * GW + cx + 1] < 0) { roadGrid[cz * GW + cx + 1] = src; qx.push(cx + 1); qz.push(cz); }
    if (cz > 0 && roadGrid[(cz - 1) * GW + cx] < 0) { roadGrid[(cz - 1) * GW + cx] = src; qx.push(cx); qz.push(cz - 1); }
    if (cz < GH - 1 && roadGrid[(cz + 1) * GW + cx] < 0) { roadGrid[(cz + 1) * GW + cx] = src; qx.push(cx); qz.push(cz + 1); }
  }
}

/** distance au tracé + hauteur de la route au droit du point.
 * La hauteur est INTERPOLÉE par projection sur les segments voisins — la
 * version « plus proche échantillon » créait des marches de 2 m sous le
 * ruban de route. */
export function roadQuery(x, z) {
  const cx = Math.min(GW - 1, Math.max(0, Math.round((x - GX0) / GCELL)));
  const cz = Math.min(GH - 1, Math.max(0, Math.round((z - GZ0) / GCELL)));
  const c = roadGrid[cz * GW + cx];
  let best = Infinity, bi = 0;
  const i0 = Math.max(0, c - 10), i1 = Math.min(samples.length - 1, c + 10);
  for (let i = i0; i <= i1; i++) {
    const s = samples[i];
    const dx = x - s.x, dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; bi = i; }
  }
  let dist = Math.sqrt(best), y = samples[bi].y;
  for (let j = bi - 1; j <= bi; j++) {
    if (j < 0 || j + 1 >= samples.length) continue;
    const a = samples[j], b = samples[j + 1];
    const ex = b.x - a.x, ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1;
    let t = ((x - a.x) * ex + (z - a.z) * ez) / l2;
    t = Math.max(0, Math.min(1, t));
    const dx = x - (a.x + ex * t), dz = z - (a.z + ez * t);
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= dist) { dist = d; y = a.y + (b.y - a.y) * t; }
  }
  rqOut.dist = dist; rqOut.y = y;
  return rqOut;
}
// scratch réutilisé — roadQuery est appelé plusieurs fois par frame ;
// consommer le résultat avant l'appel suivant
const rqOut = { dist: 0, y: 0 };

function sstep(a, b, v) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** l'esplanade du garage (M7) : rectangle aplani au départ de la route,
 * au niveau du premier échantillon du tracé — le seuil affleure la chaussée */
export const GARAGE = { x: 0, z0: 31.5, z1: 42, hw: 5.0, y: samples[0].y };
function padDist(x, z) {
  const dx = Math.max(Math.abs(x - GARAGE.x) - GARAGE.hw, 0);
  const dz = Math.max(GARAGE.z0 - 2.5 - z, z - GARAGE.z1, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

/* Le gué : un ruisseau perpendiculaire au tracé, creusé dans le terrain.
 * Il faut le décrire ICI parce que c'est height() qui creuse — water.js ne
 * fait que poser la nappe et les berges par-dessus. */
let fi = 0, fbest = 1e9;
for (let i = 0; i < samples.length; i++) {
  const d = Math.abs(samples[i].z + 100);
  if (d < fbest) { fbest = d; fi = i; }
}
const FS = samples[fi];
export const FORD = {
  x: FS.x, z: FS.z, y: FS.y - 0.09,
  nx: -FS.tz, nz: FS.tx, tx: FS.tx, tz: FS.tz,
  halfLen: 46,
};
/** demi-largeur et méandre du lit à l'abscisse t ∈ [−1, 1] */
export function fordShape(t) {
  return {
    wob: Math.sin(t * 4.1) * 2.6 + Math.sin(t * 9.3) * 1.1,
    half: 1.6 + 1.9 * (0.5 + 0.5 * Math.sin(t * 5.7 + 1.2)),
  };
}
/** profondeur à creuser sous le niveau de l'eau (0 hors du lit) */
function fordCut(x, z) {
  const dx = x - FORD.x, dz = z - FORD.z;
  const along = dx * FORD.nx + dz * FORD.nz;
  if (Math.abs(along) > FORD.halfLen) return 0;
  const sh = fordShape(along / FORD.halfLen);
  const across = dx * FORD.tx + dz * FORD.tz - sh.wob;
  const a = Math.abs(across);
  const bank = sh.half + 2.6;                     // les berges remontent
  if (a > bank) return 0;
  // profil en U doux : plat au fond, remontée sur les berges
  const t = Math.min(1, Math.max(0, (a - sh.half) / (bank - sh.half)));
  return 0.62 * (1 - t * t * (3 - 2 * t));
}

/** hauteur finale du terrain : sol sculpté par la route (déblai/remblai + bombé) */
export function height(x, z) {
  const h = baseHeight(x, z);
  const r = roadQuery(x, z);
  let out = h;
  if (r.dist < SHOULDER) {
    const t = sstep(ROAD_HALF, SHOULDER, r.dist); // 0 sur la chaussée → 1 au-delà du talus
    out = r.y * (1 - t) + h * t;
  }
  const pd = padDist(x, z);
  if (pd < 3) {
    const t = sstep(0, 3, pd);
    out = GARAGE.y * (1 - t) + out * t;
  }
  // le ruisseau se creuse en dernier : il passe SOUS la chaussée, donc le van
  // traverse dans l'eau au lieu de rouler sur un pont invisible
  const cut = fordCut(x, z);
  if (cut > 0) out = Math.min(out, FORD.y + 0.02 - cut);
  return out;
}

/** hauteur de MARCHE/ROULAGE : terrain + épaisseur du ruban de route (bombé
 * 14 cm au centre → 5 cm au bord). Le ruban est un maillage posé AU-DESSUS
 * du terrain : joueur et van doivent rouler dessus, pas dedans. */
export function groundHeight(x, z) {
  const h = height(x, z);
  const r = roadQuery(x, z);
  if (r.dist >= ROAD_HALF + 0.4) return h;
  const inT = Math.min(1, r.dist / ROAD_HALF);
  const crown = 0.14 - 0.09 * inT;
  const fade = r.dist <= ROAD_HALF ? 1 : 1 - (r.dist - ROAD_HALF) / 0.4;
  return h + crown * fade;
}
