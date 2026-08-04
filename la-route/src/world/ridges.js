/**
 * Les crêtes lointaines — trois rideaux concentriques portant des silhouettes
 * de montagnes peintes dans l'alpha, de plus en plus pâles et bleutés avec la
 * distance. C'est le TROISIÈME PLAN : sans lui, le fond de l'image n'est
 * qu'une forêt qui s'estompe, et l'œil n'a aucune échelle.
 * Chaque rideau prend la couleur de la brume du moment, donc les crêtes
 * rosissent à l'aube, bleuissent à midi et s'éteignent la nuit — la vraie
 * perspective aérienne, pour trois cylindres.
 */
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { hazeShared } from '../vegetation/wind.js';

const TW = 2048, TH = 256;

/**
 * Une ligne de crête : marche aléatoire fractale sur le pourtour, opaque en
 * dessous. Le sommet est plus clair que le pied (la lumière tombe d'en haut),
 * ce qui suffit à faire lire du relief sur une silhouette plate.
 */
function ridgeTexture(scene, name, seed, peaks, rough, baseH) {
  const tex = new DynamicTexture(name, { width: TW, height: TH }, scene, false);
  const g = tex.getContext();
  g.clearRect(0, 0, TW, TH);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

  // profil : somme de sinus déphasés + bruit, échantillonné finement
  const prof = new Float32Array(TW);
  const oct = [];
  for (let k = 0; k < 5; k++) {
    oct.push({ f: peaks * Math.pow(2, k), a: Math.pow(rough, k), p: rnd() * 6.283 });
  }
  for (let x = 0; x < TW; x++) {
    const u = x / TW;
    let h = 0, norm = 0;
    for (const o of oct) {
      h += Math.sin(u * 6.283 * o.f + o.p) * o.a;
      norm += o.a;
    }
    prof[x] = baseH * (0.55 + 0.45 * (h / norm));
  }

  // remplissage : dégradé vertical, sommet clair, pied plus dense
  const grad = g.createLinearGradient(0, 0, 0, TH);
  grad.addColorStop(0, 'rgba(255,255,255,0.72)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, TH);
  for (let x = 0; x < TW; x++) g.lineTo(x, TH - prof[x]);
  g.lineTo(TW - 1, TH);
  g.closePath();
  g.fill();

  // une arête plus claire juste sous la ligne de crête : la neige, ou
  // simplement la lumière qui accroche le fil du sommet
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 3;
  g.beginPath();
  for (let x = 0; x < TW; x++) {
    const y = TH - prof[x] + 2;
    if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();

  tex.update();
  tex.hasAlpha = true;
  tex.wrapV = 0;                                     // CLAMP en hauteur
  return tex;
}

export function buildRidges(scene) {
  const layers = [];
  // du plus lointain au plus proche : plus c'est loin, plus c'est pâle
  const specs = [
    { d: 1500, h: 300, seed: 11, peaks: 5, rough: 0.5, base: 200, pale: 0.9, y: 40 },
    { d: 1180, h: 235, seed: 47, peaks: 7, rough: 0.52, base: 172, pale: 0.72, y: 22 },
    { d: 900, h: 180, seed: 89, peaks: 9, rough: 0.55, base: 140, pale: 0.5, y: 8 },
  ];
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    // un cylindre ouvert vu de l'intérieur : le rideau fait le tour complet
    const curt = MeshBuilder.CreateCylinder('ridge' + i, {
      diameter: sp.d, height: sp.h, tessellation: 48, cap: 0,
      sideOrientation: 1,
    }, scene);
    curt.position.y = sp.y;
    const mat = new StandardMaterial('ridgeM' + i, scene);
    const tex = ridgeTexture(scene, 'ridgeT' + i, sp.seed, sp.peaks, sp.rough, sp.base);
    mat.emissiveTexture = tex;
    mat.opacityTexture = tex;
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.fogEnabled = false;                          // la brume est peinte à la main
    mat.backFaceCulling = false;
    curt.material = mat;
    curt.applyFog = false;
    curt.isPickable = false;
    curt.alwaysSelectAsActiveMesh = true;
    curt.alphaIndex = 1 + i;                         // derrière les nuages et tout le reste
    curt.receiveShadows = false;
    layers.push({ curt, mat, pale: sp.pale });
  }

  const col = new Color3(0.5, 0.6, 0.72);
  /**
   * @param sunY  hauteur du soleil : les crêtes s'éteignent la nuit
   * @param camX/camZ : le rideau reste centré sur le joueur
   */
  function update(sunY, camX, camZ) {
    const day = Math.min(1, Math.max(0, (sunY + 0.14) / 0.3));
    for (const L of layers) {
      // la crête tire vers la couleur de la brume : c'est ce qui la fait
      // « reculer » dans l'image au lieu de flotter comme un décor collé
      col.copyFromFloats(
        hazeShared.r * (0.72 + L.pale * 0.34),
        hazeShared.g * (0.72 + L.pale * 0.34),
        hazeShared.b * (0.76 + L.pale * 0.34));
      L.mat.emissiveColor.copyFrom(col);
      L.mat.alpha = 0.22 + 0.68 * L.pale * (0.35 + 0.65 * day);
      L.curt.position.x = camX;
      L.curt.position.z = camZ;
    }
  }

  return { update, layers };
}
