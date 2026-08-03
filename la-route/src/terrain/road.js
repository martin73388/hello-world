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

/** distance au tracé + hauteur de la route au droit du point */
export function roadQuery(x, z) {
  let best = Infinity, by = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const dx = x - s.x, dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; by = s.y; }
  }
  return { dist: Math.sqrt(best), y: by };
}

function sstep(a, b, v) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** hauteur finale du terrain : sol sculpté par la route (déblai/remblai + bombé) */
export function height(x, z) {
  const h = baseHeight(x, z);
  const r = roadQuery(x, z);
  if (r.dist >= SHOULDER) return h;
  const roadH = r.y;
  const t = sstep(ROAD_HALF, SHOULDER, r.dist);   // 0 sur la chaussée → 1 au-delà du talus
  return roadH * (1 - t) + h * t;
}
