/**
 * Interaction 5 — le klaxon (M6). Pas d'audio : le coup de klaxon EST son
 * effet visuel. blast() fait jaillir jusqu'à 10 oiseaux des cimes dans un
 * rayon de 28 m et décroche une bourrasque de feuilles de la canopée ;
 * update() simule le tout, plus une chute de feuilles ambiante continue —
 * la forêt vit même sans klaxon. Tout est amorti : oiseaux et feuilles
 * entrent ET sortent en fondu d'échelle, jamais de pop. Pools pré-alloués
 * (10 oiseaux, 130 feuilles en thin instances) ; zéro allocation par frame
 * hors groundHeight (API du projet) et le ré-envoi du buffer de matrices.
 */
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';

// vent dominant du monde (même direction que poussière, fumée et pins)
const WIND = { x: 0.81, z: 0.59 };

const MAX_BIRDS = 10;
const MAX_LEAVES = 130;
const BLAST_R = 28;                                   // rayon d'effroi du klaxon
const AMBIENT_R = 15;                                 // chute ambiante autour du joueur

export function createHorn(scene, trunks, groundHeight) {
  // LCG maison (Park-Miller, même famille que pines.js) : tout l'aléatoire
  // du module passe par lui — déterministe, zéro alloc
  let seed = 4451;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // échelle du pin retrouvée depuis son rayon de collision (voir pines.js)
  const pineScale = (t) => (t.r - 0.1) / 0.17;

  /* ---- oiseaux : pool de 10, chaque oiseau = un node + 2 ailes ---- */
  const birdMat = new StandardMaterial('hornBirdM', scene);
  birdMat.diffuseColor = new Color3(0.06, 0.055, 0.05);         // silhouette sombre
  birdMat.specularColor = new Color3(0.01, 0.01, 0.01);

  // aile ~8×16 cm, charnière à l'emplanture : la géométrie est décalée pour
  // que rotation.z pivote au corps, pas au centre du plan
  const mkWing = (parent, side, i) => {
    const w = MeshBuilder.CreatePlane('hornWing' + i + (side > 0 ? 'R' : 'L'),
      { width: 0.16, height: 0.08, sideOrientation: Mesh.DOUBLESIDE }, scene);
    w.rotation.x = Math.PI / 2;                       // l'aile est horizontale
    w.position.x = side * 0.085;
    w.bakeCurrentTransformIntoVertices();
    w.material = birdMat;
    w.isPickable = false;
    w.parent = parent;
    return w;
  };
  const birds = [];
  for (let i = 0; i < MAX_BIRDS; i++) {
    const node = new TransformNode('hornBird' + i, scene);
    node.setEnabled(false);
    birds.push({
      node, wingL: mkWing(node, -1, i), wingR: mkWing(node, 1, i),
      active: false, dying: false, age: 0, sc: 0, flap: 0,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      hdx: 0, hdz: 1, cruise: 7.5,                    // cap lointain propre à l'oiseau
    });
  }

  /* ---- feuilles : un quad de 7 cm, 130 thin instances ---- */
  const leafMesh = MeshBuilder.CreatePlane('hornLeaf',
    { size: 0.07, sideOrientation: Mesh.DOUBLESIDE }, scene);
  const leafMat = new StandardMaterial('hornLeafM', scene);
  leafMat.diffuseColor = new Color3(0.3, 0.3, 0.12);            // vert-brun mat
  leafMat.specularColor = new Color3(0.02, 0.02, 0.02);
  leafMesh.material = leafMat;
  leafMesh.isPickable = false;
  // les matrices sont dispersées dans le monde et changent chaque frame :
  // on court-circuite le culling plutôt que de recalculer une bounding box
  leafMesh.alwaysSelectAsActiveMesh = true;

  // état des feuilles en tableaux parallèles (slot libre : mode 0, échelle 0)
  // modes : 0 libre, 1 en chute, 2 posée, 3 se résorbe
  const lMode = new Uint8Array(MAX_LEAVES);
  const lPx = new Float32Array(MAX_LEAVES), lPy = new Float32Array(MAX_LEAVES),
    lPz = new Float32Array(MAX_LEAVES), lGy = new Float32Array(MAX_LEAVES);
  const lPh1 = new Float32Array(MAX_LEAVES), lPh2 = new Float32Array(MAX_LEAVES),
    lW1 = new Float32Array(MAX_LEAVES), lW2 = new Float32Array(MAX_LEAVES),
    lA1 = new Float32Array(MAX_LEAVES), lA2 = new Float32Array(MAX_LEAVES);
  const lRx = new Float32Array(MAX_LEAVES), lRy = new Float32Array(MAX_LEAVES),
    lRz = new Float32Array(MAX_LEAVES);
  const lSrx = new Float32Array(MAX_LEAVES), lSry = new Float32Array(MAX_LEAVES),
    lSrz = new Float32Array(MAX_LEAVES);
  const lFall = new Float32Array(MAX_LEAVES);         // vitesse de chute propre
  const lKx = new Float32Array(MAX_LEAVES), lKz = new Float32Array(MAX_LEAVES);
  const lAge = new Float32Array(MAX_LEAVES), lSc = new Float32Array(MAX_LEAVES),
    lSize = new Float32Array(MAX_LEAVES);
  const lTrx = new Float32Array(MAX_LEAVES), lTrz = new Float32Array(MAX_LEAVES);

  // buffer de matrices + scratch de composition (mutés en place chaque frame)
  const buf = new Float32Array(MAX_LEAVES * 16);
  const S = new Vector3(), T = new Vector3(), Q = new Quaternion(), M = new Matrix();
  const writeMatrix = (i) => {
    const s = lSc[i] * lSize[i];
    S.set(s, s, s);
    Quaternion.RotationYawPitchRollToRef(lRy[i], lRx[i], lRz[i], Q);
    T.set(lPx[i], lPy[i], lPz[i]);
    Matrix.ComposeToRef(S, Q, T, M);
    M.copyToArray(buf, i * 16);
  };
  // init : échelle 0 partout, mais translation (0,0,0,1) valide — un buffer
  // tout à zéro donnerait w=0 et des NaN à la division homogène
  for (let i = 0; i < MAX_LEAVES; i++) writeMatrix(i);
  leafMesh.thinInstanceSetBuffer('matrix', buf, 16, false);

  /* ---- état du module ---- */
  let hornX = 0, hornZ = 0;                           // dernier point de klaxon
  let tAcc = 0;                                       // horloge des sinus de flottement
  let frame = 0;                                      // cadence les recalages de sol
  let ambT = 0, ambNext = 2.5;                        // chute ambiante ~1 / 2,5 s
  const cand = new Int32Array(64);                    // troncs candidats d'un blast
  let candN = 0;

  // déclenchement ponctuel : les allocations transitoires y sont tolérées,
  // mais tout passe quand même par les pools
  function spawnLeaf(t, kx, kz) {
    let i = -1;
    for (let k = 0; k < MAX_LEAVES; k++) if (lMode[k] === 0) { i = k; break; }
    if (i < 0) return;                                // pool plein : on renonce
    const s = pineScale(t);
    const a = rnd() * Math.PI * 2, rr = rnd() * 1.2 * s;
    lPx[i] = t.x + Math.sin(a) * rr;
    lPz[i] = t.z + Math.cos(a) * rr;
    const gy = groundHeight(t.x, t.z);
    lPy[i] = gy + s * (2.1 + rnd() * 2.5);            // dans la canopée (cime ≈ 4.8 s)
    lGy[i] = gy;                                      // recalé en chute, cadencé
    lPh1[i] = rnd() * 6.28; lPh2[i] = rnd() * 6.28;
    lW1[i] = 1.4 + rnd(); lW2[i] = 1.8 + rnd();
    lA1[i] = 0.32 + rnd() * 0.16; lA2[i] = 0.32 + rnd() * 0.16;
    lRx[i] = rnd() * 6.28; lRy[i] = rnd() * 6.28; lRz[i] = rnd() * 6.28;
    lSrx[i] = (rnd() - 0.5) * 5; lSry[i] = (rnd() - 0.5) * 5; lSrz[i] = (rnd() - 0.5) * 5;
    lFall[i] = 0.4 + rnd() * 0.2;
    lKx[i] = kx; lKz[i] = kz;                         // bourrasque, décroît en chute
    lAge[i] = 0; lSc[i] = 0;                          // fondu d'entrée depuis 0
    lSize[i] = 0.85 + rnd() * 0.45;
    lMode[i] = 1;
  }

  /** le coup de klaxon : oiseaux + bourrasque de feuilles autour de (x, z) */
  function blast(x, z) {
    hornX = x; hornZ = z;
    candN = 0;
    for (let i = 0; i < trunks.length && candN < cand.length; i++) {
      const dx = trunks[i].x - x, dz = trunks[i].z - z;
      if (dx * dx + dz * dz < BLAST_R * BLAST_R) cand[candN++] = i;
    }
    if (candN === 0) return;                          // pas d'arbre : rien à effrayer

    // jusqu'à 10 oiseaux — seuls les slots libres partent, un second coup
    // de klaxon complète le vol au lieu de le réinitialiser
    for (const b of birds) {
      if (b.active) continue;
      const t = trunks[cand[(rnd() * candN) | 0]];
      const s = pineScale(t);
      b.x = t.x + (rnd() - 0.5) * 0.8;
      b.z = t.z + (rnd() - 0.5) * 0.8;
      b.y = groundHeight(t.x, t.z) + 4.8 * s + 0.15;  // il jaillit de la cime
      // cap lointain : opposé au klaxon, dévié d'un travers propre à l'oiseau
      let dx = b.x - x, dz = b.z - z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= d; dz /= d;
      const j = (rnd() - 0.5) * 0.9, cj = Math.cos(j), sj = Math.sin(j);
      b.hdx = dx * cj + dz * sj;
      b.hdz = -dx * sj + dz * cj;
      b.cruise = 6 + rnd() * 3;
      b.vx = b.hdx * 3.5; b.vz = b.hdz * 3.5;
      b.vy = 2.6 + rnd();
      b.age = 0; b.sc = 0; b.flap = rnd() * 6.28; b.dying = false; b.active = true;
      b.node.position.set(b.x, b.y, b.z);
      b.node.rotation.y = Math.atan2(b.vx, b.vz);
      b.node.rotation.x = 0;
      b.node.scaling.setAll(0.001);                   // fondu d'entrée
      b.node.setEnabled(true);
    }

    // la bourrasque : ~45 feuilles poussées radialement depuis le klaxon
    const nl = 40 + ((rnd() * 11) | 0);
    for (let k = 0; k < nl; k++) {
      const t = trunks[cand[(rnd() * candN) | 0]];
      const dx = t.x - x, dz = t.z - z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const p = 0.8 + rnd() * 0.8;
      spawnLeaf(t, (dx / d) * p, (dz / d) * p);
    }
  }

  /** simulation continue — aucune allocation ici */
  function update(dt, px, pz) {
    tAcc += dt; frame++;

    /* ---- oiseaux ---- */
    // une passe : centre et vélocité moyenne du vol (cohésion / alignement)
    let n = 0, cx = 0, cy = 0, cz = 0, mx = 0, my = 0, mz = 0;
    for (let i = 0; i < MAX_BIRDS; i++) {
      const b = birds[i];
      if (!b.active) continue;
      n++; cx += b.x; cy += b.y; cz += b.z; mx += b.vx; my += b.vy; mz += b.vz;
    }
    if (n > 0) { cx /= n; cy /= n; cz /= n; mx /= n; my /= n; mz /= n; }
    for (let i = 0; i < MAX_BIRDS; i++) {
      const b = birds[i];
      if (!b.active) continue;
      b.age += dt;
      const hx = b.x - hornX, hz = b.z - hornZ;
      const hd2 = hx * hx + hz * hz;
      if (!b.dying && (b.age > 11 || hd2 > 6400)) b.dying = true;   // 80 m
      // fondu d'échelle : entrée vive, sortie douce — jamais de pop
      b.sc += ((b.dying ? 0 : 1) - b.sc) * Math.min(1, (b.dying ? 3 : 9) * dt);
      if (b.dying && b.sc < 0.02) { b.active = false; b.node.setEnabled(false); continue; }
      if (b.age < 3) {
        // fuite du point de klaxon : forte, s'éteint sur 3 s
        const d = Math.sqrt(hd2) || 1;
        const f = 14 * (1 - b.age / 3);
        b.vx += (hx / d) * f * dt;
        b.vz += (hz / d) * f * dt;
      } else {
        // puis chacun tient son cap lointain
        const k = Math.min(1, 0.9 * dt);
        b.vx += (b.hdx * b.cruise - b.vx) * k;
        b.vz += (b.hdz * b.cruise - b.vz) * k;
      }
      // cohésion / alignement faibles : le vol se groupe sans se coller
      if (n > 1) {
        b.vx += ((cx - b.x) * 0.22 + (mx - b.vx) * 0.5) * dt;
        b.vy += ((cy - b.y) * 0.22 + (my - b.vy) * 0.5) * dt;
        b.vz += ((cz - b.z) * 0.22 + (mz - b.vz) * 0.5) * dt;
      }
      // montée constante au départ, plané presque plat ensuite
      b.vy += ((b.age < 4 ? 2.1 : 0.4) - b.vy) * Math.min(1, 1.6 * dt);
      // vitesse tenue entre 6 et 9 m/s (le plancher attend la fin du décollage)
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz) || 1;
      const cl = sp > 9 ? 9 / sp : (sp < 6 && b.age > 1 ? 6 / sp : 1);
      b.vx *= cl; b.vy *= cl; b.vz *= cl;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      // orienté selon la vélocité (main gauche), assiette selon vy
      const hsp = Math.sqrt(b.vx * b.vx + b.vz * b.vz) || 1;
      b.node.rotation.y = Math.atan2(b.vx, b.vz);
      b.node.rotation.x = -Math.atan2(b.vy, hsp) * 0.7;
      // battement ~9 Hz qui ralentit et s'atténue en plané
      const glide = Math.min(1, Math.max(0, (b.age - 2.5) / 3.5));
      b.flap += dt * 6.2832 * (9 - 4.5 * glide);
      const wz = Math.sin(b.flap) * (1 - 0.8 * glide);
      b.wingR.rotation.z = wz;
      b.wingL.rotation.z = -wz;                       // ailes opposées
      b.node.position.set(b.x, b.y, b.z);
      b.node.scaling.setAll(b.sc);
    }

    /* ---- feuilles ---- */
    const kickDecay = Math.exp(-2 * dt);              // la bourrasque s'essouffle
    for (let i = 0; i < MAX_LEAVES; i++) {
      const m = lMode[i];
      if (m === 0) continue;
      if (m === 1) {                                  // en chute
        lAge[i] += dt;
        lSc[i] += (1 - lSc[i]) * Math.min(1, 6 * dt); // fondu d'entrée
        lKx[i] *= kickDecay; lKz[i] *= kickDecay;
        // flottement : deux sinus déphasés + bourrasque + un rien de vent
        const vx = lA1[i] * Math.sin(tAcc * lW1[i] + lPh1[i]) + lKx[i] + WIND.x * 0.12;
        const vz = lA2[i] * Math.sin(tAcc * lW2[i] + lPh2[i]) + lKz[i] + WIND.z * 0.12;
        lPx[i] += vx * dt; lPz[i] += vz * dt;
        lPy[i] -= lFall[i] * dt;
        lRx[i] += lSrx[i] * dt; lRy[i] += lSry[i] * dt; lRz[i] += lSrz[i] * dt;
        // groundHeight coûte un roadQuery : recalé 1 frame sur 3, et
        // systématiquement quand la feuille approche du sol mémorisé
        if (lPy[i] - lGy[i] < 0.6 || ((i + frame) % 3) === 0) {
          lGy[i] = groundHeight(lPx[i], lPz[i]);
        }
        if (lPy[i] <= lGy[i] + 0.03) {                // elle se pose
          lMode[i] = 2; lAge[i] = 0;
          lPy[i] = lGy[i] + 0.022;
          // cible « à plat » la plus proche de l'orientation d'arrivée
          lTrx[i] = Math.round((lRx[i] - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
          lTrz[i] = Math.round(lRz[i] / Math.PI) * Math.PI;
        }
        writeMatrix(i);
      } else if (m === 2) {                           // posée : persiste 90 s
        lAge[i] += dt;
        if (lAge[i] < 0.6) {
          // elle finit de se coucher, puis sa matrice ne bouge plus
          const k = Math.min(1, 10 * dt);
          lRx[i] += (lTrx[i] - lRx[i]) * k;
          lRz[i] += (lTrz[i] - lRz[i]) * k;
          lSc[i] += (1 - lSc[i]) * Math.min(1, 6 * dt);
          writeMatrix(i);
        } else if (lAge[i] > 90) lMode[i] = 3;
      } else {                                        // elle se résorbe et libère le slot
        lSc[i] -= lSc[i] * Math.min(1, 2.5 * dt);
        if (lSc[i] < 0.01) { lSc[i] = 0; lMode[i] = 0; }
        writeMatrix(i);
      }
    }
    // le buffer a été fourni UNE fois à l'init (staticBuffer=false, même
    // référence) : on notifie seulement la mutation — pas de re-création GPU
    leafMesh.thinInstanceBufferUpdated('matrix');

    /* ---- chute ambiante : la forêt vit sans klaxon ---- */
    ambT += dt;
    if (ambT >= ambNext) {
      ambT = 0; ambNext = 1.8 + rnd() * 1.4;          // ~2,5 s de moyenne
      // réservoir : un tronc uniforme parmi ceux à moins de 15 m du joueur
      let pick = -1, count = 0;
      for (let i = 0; i < trunks.length; i++) {
        const dx = trunks[i].x - px, dz = trunks[i].z - pz;
        if (dx * dx + dz * dz < AMBIENT_R * AMBIENT_R) {
          count++;
          if (rnd() * count < 1) pick = i;
        }
      }
      if (pick >= 0) spawnLeaf(trunks[pick], 0, 0);
    }
  }

  return { blast, update };
}
