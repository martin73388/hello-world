/**
 * Buffer d'état du terrain (M3) — le système interactif central du brief.
 * Cible RGBA16F qui suit le joueur (80 m de côté), mise à jour en ping-pong
 * par une passe plein-écran : relecture décalée (recentrage), diffusion douce
 * + décroissance (guérison : ornière encore nette après 60 s), puis tampons
 * des splats de la frame. Canaux : R = profondeur d'enfoncement (m),
 * G = masse déplacée / berme (m). Persistant et additif — jamais reconstruit
 * depuis un historique d'événements. Pieds aujourd'hui, pneus du van demain :
 * même file d'écriture (addSplat).
 */
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { EffectRenderer, EffectWrapper } from '@babylonjs/core/Materials/effectRenderer.js';
import { ThinTexture } from '@babylonjs/core/Materials/Textures/thinTexture.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';

// Nombre de tampons acceptés par frame et par file. Ce sont AUSSI les tailles
// des files côté CPU — une seule source de vérité.
const N_SPLAT = 16, N_WET = 8, N_SCORCH = 4;

/**
 * Pourquoi ce shader n'a aucun TABLEAU d'uniformes, alors que tamponner seize
 * empreintes en appelle un.
 *
 * Sur WebGPU, notre GLSL part chez glslang (→ SPIR-V) puis chez twgsl (→ WGSL).
 * Un `uniform vec4 splats[16]` ressort de cette chaîne en
 * `alias Arr = @stride(16) array<vec4<f32>, 16u>;` — et `@stride` a été RETIRÉ
 * de la spécification WGSL : Tint refuse le module, la passe de déformation ne
 * compile pas, et le sol perd ornières, bermes, humidité et brûlure d'un coup.
 * Le piège déjà consigné (« pas de tableau indexé dynamiquement ») était trop
 * étroit : c'est la DÉCLARATION du tableau qui casse, indexée ou non.
 *
 * On déroule donc les trois boucles à la génération du source. Le coût est nul
 * — les bornes sont des constantes, un compilateur les aurait déroulées de
 * toute façon — et le shader ne dépend plus d'une version de transpileur
 * téléchargée sur un CDN.
 */
const decls = (name, n) =>
  Array.from({ length: n }, (_, i) => `uniform vec4 ${name}${i};`).join('\n');
const unroll = (name, n, body) =>
  Array.from({ length: n }, (_, i) =>
    `  if (${name}Count > ${i}) { vec4 s = ${name}${i};\n${body}\n  }`).join('\n');

const FRAG = `
precision highp float;
varying vec2 vUV;
uniform sampler2D prevTex;
uniform vec2 shiftUV;
uniform float dtU;
uniform float texel;
uniform vec2 centerW;
uniform float sizeW;
${decls('splats', N_SPLAT)}
uniform int splatsCount;
${decls('wsplats', N_WET)}
uniform int wsplatsCount;
${decls('ssplats', N_SCORCH)}
uniform int ssplatsCount;

void main(void) {
  vec2 uv = vUV + shiftUV;
  // Les cinq lectures se font INCONDITIONNELLEMENT, puis on annule le résultat
  // hors du domaine : en WGSL, textureSample doit être appelé en flot de
  // contrôle uniforme, or uv dépend de vUV — donc du fragment. Sous un if,
  // Tint refuse le module entier. (textureSampleLevel échapperait à la règle,
  // mais la chaîne GLSL→SPIR-V ne l'émet pas d'elle-même en fragment.)
  vec4 c = texture2D(prevTex, uv);
  vec4 b = (texture2D(prevTex, uv + vec2(texel, 0.0))
          + texture2D(prevTex, uv - vec2(texel, 0.0))
          + texture2D(prevTex, uv + vec2(0.0, texel))
          + texture2D(prevTex, uv - vec2(0.0, texel))) * 0.25;
  float inside = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? 1.0 : 0.0;
  vec4 d = mix(c, b, clamp(0.18 * dtU, 0.0, 1.0));              // la boue se relâche
  // guérison : ornières lentes, bermes un peu plus vite ; l'eau sèche en
  // ~1 min ; la brûlure reste (quasi) pour la session
  d *= vec4(exp(-dtU * 0.008), exp(-dtU * 0.013), exp(-dtU * 0.016), exp(-dtU * 0.0012));
  d *= inside;                                                  // ce que le recentrage a fait sortir du cadre
  vec2 wp = centerW + (vUV - 0.5) * sizeW;
${unroll('splats', N_SPLAT, `
    float r = distance(wp, s.xy);
    float t = clamp(1.0 - r / s.z, 0.0, 1.0);
    d.x += s.w * t * t * (3.0 - 2.0 * t);                       // enfoncement
    float rt = clamp(1.0 - abs(r - s.z * 1.3) / (s.z * 0.7), 0.0, 1.0);
    d.y += s.w * 0.55 * rt * rt;                                // berme au bord`)}
${unroll('wsplats', N_WET, `
    float t = clamp(1.0 - distance(wp, s.xy) / s.z, 0.0, 1.0);
    d.z += s.w * t * t;                                         // pluie : humidité`)}
${unroll('ssplats', N_SCORCH, `
    float t = clamp(1.0 - distance(wp, s.xy) / s.z, 0.0, 1.0);
    d.w += s.w * t * t * (3.0 - 2.0 * t);                       // feu : brûlure`)}
  d = min(d, vec4(0.22, 0.12, 1.0, 1.0));                       // saturation du sol
  gl_FragColor = d;
}
`;

export function createDeform(engine, opts = {}) {
  const RES = opts.res ?? 2048;
  const SIZE = 80;
  const rtOpts = {
    generateMipMaps: false,
    generateDepthBuffer: false,
    generateStencilBuffer: false,
    type: Constants.TEXTURETYPE_HALF_FLOAT,
    format: Constants.TEXTUREFORMAT_RGBA,
    samplingMode: Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
  };
  const rts = [
    engine.createRenderTargetTexture({ width: RES, height: RES }, rtOpts),
    engine.createRenderTargetTexture({ width: RES, height: RES }, rtOpts),
  ];
  const clearCol = new Color4(0, 0, 0, 1);
  for (const rt of rts) {
    engine.bindFramebuffer(rt);
    engine.clear(clearCol, true, false, false);
    engine.unBindFramebuffer(rt);
  }
  const thin = rts.map((rt) => {
    const t = new ThinTexture(rt.texture);
    // ThinTexture arrive en RÉPÉTITION par défaut. Ici c'est faux deux fois :
    // le filtrage bilinéaire recollerait le bord opposé du buffer sur la
    // couture, et surtout les consommateurs (sol, herbe) lisent hors domaine
    // en toute confiance parce qu'ils masquent le résultat — ils doivent y
    // trouver le bord, pas l'autre bout du monde.
    t.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    t.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    return t;
  });

  const names = (n, c) => Array.from({ length: c }, (_, i) => n + i);
  const wrapper = new EffectWrapper({
    engine, name: 'dfUpdate', fragmentShader: FRAG,
    uniformNames: ['shiftUV', 'dtU', 'texel', 'centerW', 'sizeW',
      ...names('splats', N_SPLAT), 'splatsCount',
      ...names('wsplats', N_WET), 'wsplatsCount',
      ...names('ssplats', N_SCORCH), 'ssplatsCount'],
    samplerNames: ['prevTex'],
  });
  const renderer = new EffectRenderer(engine);

  let front = 0;
  // état partagé avec DeformPlugin (lu à chaque bind de matériau)
  const state = {
    cx: 0, cz: 20, size: SIZE, res: RES,
    frontTex: thin[0],
    patchX: 0, patchZ: 20, patchHalf: 16,
  };
  const queue = [];                       // x, z, rayon, profondeur — à plat
  const wetQueue = [];                    // pluie : x, z, rayon, quantité
  const scorchQueue = [];                 // feu : x, z, rayon, quantité
  const splatArr = new Array(N_SPLAT * 4).fill(0);   // vec4 à plat, réutilisé
  const wetArr = new Array(N_WET * 4).fill(0);
  const scorchArr = new Array(N_SCORCH * 4).fill(0);
  /** Pousse `count` vec4 pris à plat dans `arr` vers les uniformes déroulés. */
  const push = (e, name, arr, count) => {
    for (let i = 0; i < count; i++) {
      const k = i * 4;
      e.setFloat4(name + i, arr[k], arr[k + 1], arr[k + 2], arr[k + 3]);
    }
  };

  function addSplat(x, z, r, d) { queue.push(x, z, r, d); }
  function addWet(x, z, r, a) { wetQueue.push(x, z, r, a); }
  function addScorch(x, z, r, a) { scorchQueue.push(x, z, r, a); }

  function update(dt, px, pz) {
    if (!wrapper.effect.isReady()) return;
    const texelW = SIZE / RES;
    let sx = 0, sz = 0;
    if (Math.abs(px - state.cx) > 12 || Math.abs(pz - state.cz) > 12) {
      // recentrage cranté au texel (pas de nage du contenu)
      sx = Math.round((px - state.cx) / texelW) * texelW;
      sz = Math.round((pz - state.cz) / texelW) * texelW;
      state.cx += sx; state.cz += sz;
    }
    const n = Math.min(N_SPLAT, queue.length >> 2);
    if (n) {
      for (let i = 0; i < n * 4; i++) splatArr[i] = queue[i];
      queue.splice(0, n * 4);
    }
    const wn = Math.min(N_WET, wetQueue.length >> 2);
    if (wn) {
      for (let i = 0; i < wn * 4; i++) wetArr[i] = wetQueue[i];
      wetQueue.splice(0, wn * 4);
    }
    const sn = Math.min(N_SCORCH, scorchQueue.length >> 2);
    if (sn) {
      for (let i = 0; i < sn * 4; i++) scorchArr[i] = scorchQueue[i];
      scorchQueue.splice(0, sn * 4);
    }

    const back = 1 - front;
    const cdt = dt, csx = sx / SIZE, csz = sz / SIZE, ccx = state.cx, ccz = state.cz;
    wrapper.onApplyObservable.addOnce(() => {
      const e = wrapper.effect;
      e.setTexture('prevTex', thin[front]);
      e.setFloat2('shiftUV', csx, csz);
      e.setFloat('dtU', cdt);
      e.setFloat('texel', 1 / RES);
      e.setFloat2('centerW', ccx, ccz);
      e.setFloat('sizeW', SIZE);
      push(e, 'splats', splatArr, n);
      e.setInt('splatsCount', n);
      push(e, 'wsplats', wetArr, wn);
      e.setInt('wsplatsCount', wn);
      push(e, 'ssplats', scorchArr, sn);
      e.setInt('ssplatsCount', sn);
    });
    renderer.render(wrapper, rts[back]);
    renderer.restoreStates();
    engine.restoreDefaultFramebuffer();
    front = back;
    state.frontTex = thin[front];
  }

  return { state, update, addSplat, addWet, addScorch };
}
