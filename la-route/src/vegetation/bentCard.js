/**
 * LA primitive de feuille : une carte COURBÉE, pas un quad.
 *
 * Recette reprise de la référence (jungle-trail, plants.js) : la feuille est
 * une grille (steps+1)×(nu+1) construite le long d'un arc de nervure, avec
 * une section transversale qui combine cuvette, marge roulée, ondulation et
 * gauchissement antisymétrique. Un quad plat change de luminosité d'un bloc ;
 * une carte courbée capte un highlight EN BANDE qui balaie la surface quand
 * la caméra ou le vent bouge — c'est ça qui fait lire « feuille » au lieu de
 * « carte », et c'est le levier n°1 de la passe densité.
 *
 * Détails load-bearing hérités de la référence :
 * - la cuvette SE DÉTEND vers la pointe (une cuvette constante lit comme un
 *   pli de carton) ;
 * - les colonnes sont réparties en |q|^0.74 : resserrées vers le BORD, là où
 *   la marge roulée a besoin de segments ;
 * - la normale vient de la DÉRIVÉE ANALYTIQUE de la section, pas d'un
 *   ComputeNormals après coup ;
 * - la demi-largeur est perturbée par trois sinus par CÔTÉ (`nick`) : les
 *   excursions profondes lisent comme des déchirures, et comme l'UV n'est
 *   pas touché c'est un vrai changement de silhouette.
 *
 * Repère local : la feuille pousse vers +Z depuis l'origine, +Y en haut.
 * Tout est en repère main gauche Babylon — le cross() de Babylon est main
 * gauche aussi, donc les formules de la référence tiennent telles quelles.
 */
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';

/** répartition des colonnes : dense au bord, là où vit la courbure */
function colPos(q) { return Math.sign(q) * Math.pow(Math.abs(q), 0.74); }

const _p = new Vector3(), _n = new Vector3();

/**
 * Fabrique les tableaux (positions, normales, uv, indices) d'UNE feuille
 * courbée et les écrit dans `out` (un accumulateur {pos, nrm, uv, idx}).
 * `m` est la matrice de placement (Matrix Babylon).
 *
 * opts : len, hw (demi-largeur), bend (courbure de nervure, rad ; positif =
 * la pointe retombe), sag (ondulation de nervure), twist (torsion vers la
 * pointe), cup (cuvette), relax (détente de la cuvette, 0..1), roll (marge
 * roulée), ripple (ondulation transverse), tilt (gauchissement), asym,
 * nick (déchirures), phase (déphasage des sinus), steps, nu,
 * uv0/uv1 (fenêtre UV, pour un atlas — défaut la carte entière).
 */
export function addBentCard(out, m, opts) {
  const len = opts.len, hw = opts.hw;
  const bend = opts.bend ?? 0.5, sag = opts.sag ?? 0.08;
  const twist = opts.twist ?? 0.12, cup = opts.cup ?? 0.34;
  const relax = opts.relax ?? 0.6, roll = opts.roll ?? 0.16;
  const ripple = opts.ripple ?? 0.06, tilt = opts.tilt ?? 0.1;
  const asym = opts.asym ?? 0.06, nick = opts.nick ?? 0.0;
  const phase = opts.phase ?? 0;
  const steps = opts.steps ?? 4, nu = opts.nu ?? 4;
  const u0 = opts.uv0 ?? 0, u1 = opts.uv1 ?? 1;

  const base = out.pos.length / 3;
  // 1) l'arc de nervure : intégration au point milieu. Le retrait de
  // sin(phase) garantit que le limbe quitte l'attache dans la direction
  // demandée par m — ajouter du sag ne fait jamais tourner toute la feuille.
  const d = len / steps;
  const C = [], F = [];
  let py = 0, pz = 0;
  const ang = (s) => -bend * Math.pow(s, 1.25) + sag * (Math.sin(5.1 * s + phase) - Math.sin(phase));
  C.push([0, 0]); F.push(ang(0));
  for (let i = 0; i < steps; i++) {
    const a = ang((i + 0.5) / steps);
    py += Math.sin(a) * d; pz += Math.cos(a) * d;
    C.push([py, pz]); F.push(ang((i + 1) / steps));
  }

  const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const fy = Math.sin(F[i]), fz = Math.cos(F[i]);        // tangente (0, fy, fz)
    const tw = twist * Math.pow(s, 1.25);                  // la torsion vit vers la pointe
    // S latéral et N normal de la rangée, tournés par la torsion
    const Sx = Math.cos(tw), Sy = Math.sin(tw) * fz, Sz = -Math.sin(tw) * fy;
    // N = -cross(F, S) — la normale regarde +Y quand tout est à plat
    const Nx = -(fy * Sz - fz * Sy), Ny = -(fz * Sx), Nz = fy * Sx;

    const cupS = -cup * (1 - relax * smooth01(1.2 * s));   // la cuvette se détend
    const rip = ripple * Math.sin(6.4 * s + phase);
    const tw2 = tilt * (0.3 + 0.7 * s);
    const dead = s;                                        // 0 pied → 1 pointe (pour l'UV v)

    for (let j = 0; j <= nu; j++) {
      const q = (j / nu) * 2 - 1;
      const xf = colPos(q);
      const ax = Math.abs(xf);
      const cs = cupS * xf * xf - roll * ax * ax * ax * ax * ax + rip * xf * xf + tw2 * xf * ax;
      const dcs = 2 * cupS * xf - 5 * roll * ax * ax * ax * ax * Math.sign(xf) + 2 * rip * xf + 2 * tw2 * ax;
      const wSide = 1 + asym * Math.sign(xf);
      // déchirures : chaque côté ondule séparément (le sign entre dans la phase)
      const sg = Math.sign(xf) || 1;
      const hwj = hw * (1 + nick * (0.55 * Math.sin(9.7 * s + 2.3 * phase + 1.9 * sg)
        + 0.3 * Math.sin(21.3 * s - 1.7 * phase + 3.4 * sg)
        + 0.15 * Math.sin(44 * s + phase + sg)));

      _p.set(Sx * (xf * hwj * wSide) + Nx * (cs * hwj),
        C[i][0] + Sy * (xf * hwj * wSide) + Ny * (cs * hwj),
        C[i][1] + Sz * (xf * hwj * wSide) + Nz * (cs * hwj));
      Vector3.TransformCoordinatesToRef(_p, m, _p);
      out.pos.push(_p.x, _p.y, _p.z);

      // normale analytique : T = S*wSide + N*dcs ; NN = -cross(F, T)
      // avec F = (0, fy, fz) : cross(F,T) = (fy·Tz − fz·Ty, fz·Tx, −fy·Tx)
      const Tx = Sx * wSide + Nx * dcs, Ty = Sy * wSide + Ny * dcs, Tz = Sz * wSide + Nz * dcs;
      _n.set(-(fy * Tz - fz * Ty), -(fz * Tx), fy * Tx);
      Vector3.TransformNormalToRef(_n, m, _n);
      _n.normalize();
      out.nrm.push(_n.x, _n.y, _n.z);

      // uvSwap : u suit la LONGUEUR (textures peintes le long de u, comme la
      // branche de pin) ; sinon u traverse la feuille et v suit la longueur
      if (opts.uvSwap) out.uv.push(u0 + dead * (u1 - u0), 0.5 + xf * 0.5);
      else out.uv.push(u0 + (0.5 + xf * 0.5) * (u1 - u0), dead);
    }
  }
  const row = nu + 1;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < nu; j++) {
      const a = base + i * row + j;
      out.idx.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
    }
  }
}

/** accumulateur neuf */
export function cardAcc() { return { pos: [], nrm: [], uv: [], idx: [] }; }

/** fabrique le Mesh Babylon depuis l'accumulateur (normales DÉJÀ calculées) */
export function accToMesh(scene, name, acc) {
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = new Float32Array(acc.pos);
  vd.normals = new Float32Array(acc.nrm);
  vd.uvs = new Float32Array(acc.uv);
  vd.indices = acc.idx;
  vd.applyToMesh(mesh);
  return mesh;
}

/** matrice TRS locale utilitaire (yaw, pitch appliqués à l'attache) */
export function cardMatrix(x, y, z, yaw, pitch, roll2, scale) {
  const s = scale ?? 1;
  return Matrix.Scaling(s, s, s)
    .multiply(Matrix.RotationZ(roll2 ?? 0))
    .multiply(Matrix.RotationX(pitch ?? 0))
    .multiply(Matrix.RotationY(yaw ?? 0))
    .multiply(Matrix.Translation(x, y, z));
}
