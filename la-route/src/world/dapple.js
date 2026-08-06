/**
 * Les TACHES DE SOLEIL sous la canopée (PORTAGE 2.4, version « lite »).
 *
 * C'est la pièce maîtresse du rendu jungle-trail : sous une forêt, la lumière
 * n'arrive jamais en nappe, elle arrive en taches — et ce sont les taches qui
 * dessinent la route. Jusqu'ici ce rôle était tenu par la shadow map des
 * couronnes : 3,1 millions de triangles alpha-testés re-rendus par cascade,
 * pour un semis de points que le PCF lissait en gris uniforme. On sort donc le
 * feuillage des casters (mesuré : 6,3 ms rendues sur 25,3) et on le remplace
 * par une transmittance ANALYTIQUE : moins cher, et mieux tenu — c'est la
 * leçon n° 1 du README de la référence.
 *
 * Le principe. Au boot, on peint une carte du CIEL DE LA FORÊT : pour chaque
 * pin, un disque doux de densité (canal R, accumulation additive) et son toit
 * (canal G, hauteur du sommet, fusion par maximum). Au rendu, chaque fragment
 * remonte le rayon vers le soleil jusqu'au plan du toit, lit la densité de
 * couronnes à CET endroit-là — c'est le décalage qui fait que les taches
 * s'allongent au couchant et bougent avec l'heure — et en déduit ce qui reste
 * de lumière directe.
 *
 * Les invariants du PORTAGE 2.4, repris tels quels :
 *   (a) la distance à l'occulteur est OBLIQUE (hauteur / sin d'élévation),
 *       jamais verticale — c'est elle qui gouverne la pénombre ;
 *   (b) le lookup de toit est DÉCALÉ vers le soleil et jamais clampé : la
 *       carte couvre le semis avec une marge, et au-delà elle est noire, ce
 *       qui est la bonne réponse (pas de canopée = pas d'ombre) ;
 *   (c) simplifié ici : le toit est un plan local lu dans la carte, pas une
 *       base perpendiculaire au soleil — l'erreur est de l'ordre du rayon
 *       d'une couronne, invisible en DA 32 bits ;
 *   (d) la pénombre est un NIVEAU DE MIP proportionnel à la distance oblique
 *       (la carte est mippée — autorisé, ce n'est pas une texture à découpe
 *       alpha), suivi d'une rampe qui ré-étend le contraste que le moyennage
 *       a mangé.
 *
 * Ce que ça remplace et ce que ça garde : les TRONCS restent dans la shadow
 * map — la colonnade est ouverte et les ombres de fûts sont l'information que
 * l'œil attend (PORTAGE, « ne pas porter cast:false », réserve honorée). Le
 * feuillage, lui, sort : garder les deux aurait compté l'ombre de canopée
 * deux fois, le piège que PORTAGE 2.4 signale explicitement.
 */
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { sunShared } from '../vegetation/wind.js';

/* Le champ couvre le semis des pins (x -173..157, z -280..40) avec une marge
 * d'une quinzaine de mètres : au bord de la carte la densité est nulle, donc
 * le CLAMP des UV donne « pas de canopée », qui est la vérité du monde là-bas. */
const REG = { cx: -8, cz: -120, size: 360 };
/* Normalisation des hauteurs de toit : le monde va de -15 (fond de vallée
 * nord) à ~69 m (crêtes), plus ~12 m d'arbre — on encode -20..100 sur 0..1. */
const H0 = -20, HSPAN = 120;

/** État partagé plugin ↔ réglages (overlay, A/B depuis la console). */
export const dappleShared = { k: 2.4, floor: 0.34 };

/**
 * Peint la carte de canopée. Deux toiles intermédiaires parce que le canvas
 * 2D n'a qu'un mode de composition à la fois : la densité s'ACCUMULE
 * (`lighter` — deux couronnes qui se chevauchent font plus sombre dessous)
 * quand le toit se prend au MAXIMUM (`lighten` — c'est la plus haute couronne
 * qui définit le plan d'entrée du rayon). Fusion CPU en une seule RGBA au
 * boot : 512² = 262 144 texels, une fois, personne ne le sentira.
 */
export function bakeCrownField(scene, crowns) {
  const N = 512;
  const px = (wx) => ((wx - REG.cx) / REG.size + 0.5) * N;
  const pz = (wz) => ((wz - REG.cz) / REG.size + 0.5) * N;

  const densC = document.createElement('canvas');
  densC.width = densC.height = N;
  const dg = densC.getContext('2d');
  dg.fillStyle = '#000'; dg.fillRect(0, 0, N, N);
  dg.globalCompositeOperation = 'lighter';

  const topC = document.createElement('canvas');
  topC.width = topC.height = N;
  const tg = topC.getContext('2d');
  tg.fillStyle = '#000'; tg.fillRect(0, 0, N, N);
  tg.globalCompositeOperation = 'lighten';

  const texel = REG.size / N;
  for (const c of crowns) {
    const x = px(c.x), z = pz(c.z);
    const r = Math.max(2, c.r / texel);
    const grad = dg.createRadialGradient(x, z, 0, x, z, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.72)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = grad;
    dg.beginPath(); dg.arc(x, z, r, 0, 7); dg.fill();
    const v = Math.round(Math.min(1, Math.max(0, (c.top - H0) / HSPAN)) * 255);
    tg.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    tg.beginPath(); tg.arc(x, z, r, 0, 7); tg.fill();
  }

  // mipmaps ACTIVÉS : c'est eux qui font la pénombre (invariant d). La règle
  // « pas de mipmaps » du projet ne vise que les textures à découpe alpha.
  const tex = new DynamicTexture('dappleField', N, scene, true,
    Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = tex.getContext();
  const dd = dg.getImageData(0, 0, N, N).data;
  const tt = tg.getImageData(0, 0, N, N).data;
  const out = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    out.data[i * 4] = dd[i * 4];          // R : densité de couronnes
    out.data[i * 4 + 1] = tt[i * 4];      // G : hauteur du toit
    out.data[i * 4 + 2] = 0;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  // update(false) : pas de retournement vertical. La rangée 0 du canvas est le
  // nord du monde (z petit), et l'UV est calculé (z - cz)/size + 0.5 — les
  // deux conventions coïncident SANS flip. Avec le flip par défaut, chaque
  // tache d'ombre serait au symétrique nord-sud de son arbre.
  tex.update(false);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

export class DapplePlugin extends MaterialPluginBase {
  constructor(material, tex) {
    // 205 : après Grass (200), qui écrit la couleur de base du tapis, et
    // AVANT Haze (210) — la brume ajoute le plancher de ciel diffus, et il
    // doit s'ajouter PAR-DESSUS nos taches, sinon l'ombre de canopée mange le
    // plancher et vire au noir bouché, ce que DECISIONS interdit.
    super(material, 'Dapple', 205, { DAPPLE: false });
    this._tex = tex;
    this._enable(true);
  }

  getClassName() { return 'DapplePlugin'; }
  prepareDefines(defines) { defines.DAPPLE = true; }
  getSamplers(samplers) { samplers.push('dpTex'); }

  getUniforms() {
    return {
      ubo: [
        { name: 'dpSun', size: 3, type: 'vec3' },
        { name: 'dpInfo', size: 4, type: 'vec4' },   // cx, cz, 1/size, k
        { name: 'dpFloor', size: 1, type: 'float' },
      ],
      fragment: `#ifdef DAPPLE
uniform vec3 dpSun; uniform vec4 dpInfo; uniform float dpFloor;
#endif`,
    };
  }

  bindForSubMesh(ubo) {
    ubo.updateFloat3('dpSun', sunShared.x, sunShared.y, sunShared.z);
    ubo.updateFloat4('dpInfo', REG.cx, REG.cz, 1 / REG.size, dappleShared.k);
    ubo.updateFloat('dpFloor', dappleShared.floor);
    ubo.setTexture('dpTex', this._tex);
  }

  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    return {
      // le sampler se déclare ICI et jamais dans le bloc d'uniformes : dans
      // l'UBO il casserait la compilation WebGPU (piège consigné)
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef DAPPLE
uniform sampler2D dpTex;
#endif
`,
      /* Toutes les lectures sont inconditionnelles et par textureLod — deux
       * raisons WGSL : textureSample sous un if non uniforme est refusé par
       * Tint, et textureSampleLevel (ce que devient textureLod) en est
       * exempté par la spec. On lit, PUIS on masque. */
      CUSTOM_FRAGMENT_BEFORE_FOG: `
#ifdef DAPPLE
        vec3 dpL = -normalize(dpSun);                 // direction VERS le soleil
        float dpDay = clamp(dpL.y * 4.0, 0.0, 1.0);  // la nuit, tout s'éteint
        // 1er échantillon à l'aplomb : où est le toit de canopée ici ?
        vec2 dpUV0 = (vPositionW.xz - dpInfo.xy) * dpInfo.z + 0.5;
        float dpTop = textureLod(dpTex, dpUV0, 0.0).g * ${HSPAN.toFixed(1)} + (${H0.toFixed(1)});
        float dpUp = max(dpTop - vPositionW.y, 0.0);
        // remontée du rayon vers le soleil jusqu'au plan du toit (invariant b)
        float dpSinE = max(dpL.y, 0.25);
        vec2 dpUV = dpUV0 + (dpL.xz / dpSinE) * dpUp * dpInfo.z;
        // pénombre : distance OBLIQUE -> niveau de mip (invariants a et d)
        float dpSlant = dpUp / dpSinE;
        float dpLod = clamp(log2(1.0 + dpSlant * 0.5), 0.0, 4.0);
        float dpDens = textureLod(dpTex, dpUV, dpLod).r;
        // transmittance, puis rampe qui ré-étend le contraste mangé par le mip
        float dpT = smoothstep(0.10, 0.90, exp(-dpDens * dpInfo.w));
        // seule la part DIRECTE est modulée : l'ambiante et le plancher de
        // ciel (Haze, priorité 210, donc APRÈS nous) restent entiers — une
        // tache d'ombre de forêt est bleue, jamais noire
        float dpSunFrac = clamp(dot(normalize(normalW), dpL), 0.0, 1.0) * dpDay;
        color.rgb *= mix(1.0, dpFloor + (1.0 - dpFloor) * dpT, dpSunFrac * 0.9);
#endif
`,
    };
  }
}

/**
 * Branche les taches sur les matériaux qui reçoivent le soleil au sol : le
 * terrain, la route, le patch de déformation et les six strates du tapis.
 * PAS le feuillage des arbres : c'est lui l'occulteur, s'auto-ombrer ferait
 * un mur sombre — et c'est le sol qu'on est venu tacheter.
 */
export function createDapple(scene, crowns) {
  const tex = bakeCrownField(scene, crowns);
  const NAMES = ['terrainMat', 'patchMat', 'roadMat',
    'grassM', 'tallM', 'reedM', 'flowerM', 'fernM', 'bushM'];
  let applied = 0;
  for (const n of NAMES) {
    const m = scene.getMaterialByName(n);
    if (m) { new DapplePlugin(m, tex); applied++; }
  }
  return { tex, applied, shared: dappleShared };
}
