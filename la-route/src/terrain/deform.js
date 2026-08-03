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

const FRAG = `
precision highp float;
varying vec2 vUV;
uniform sampler2D prevTex;
uniform vec2 shiftUV;
uniform float dtU;
uniform float texel;
uniform vec2 centerW;
uniform float sizeW;
uniform vec4 splats[16];
uniform int splatCount;

void main(void) {
  vec2 uv = vUV + shiftUV;
  vec2 d = vec2(0.0);
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    vec2 c = texture2D(prevTex, uv).rg;
    vec2 b = (texture2D(prevTex, uv + vec2(texel, 0.0)).rg
            + texture2D(prevTex, uv - vec2(texel, 0.0)).rg
            + texture2D(prevTex, uv + vec2(0.0, texel)).rg
            + texture2D(prevTex, uv - vec2(0.0, texel)).rg) * 0.25;
    d = mix(c, b, clamp(0.18 * dtU, 0.0, 1.0));                 // la boue se relâche
    d *= vec2(exp(-dtU * 0.008), exp(-dtU * 0.013));            // guérison lente
  }
  vec2 wp = centerW + (vUV - 0.5) * sizeW;
  for (int i = 0; i < 16; i++) {
    if (i >= splatCount) { break; }
    vec4 s = splats[i];
    float r = distance(wp, s.xy);
    float t = clamp(1.0 - r / s.z, 0.0, 1.0);
    d.x += s.w * t * t * (3.0 - 2.0 * t);                       // enfoncement
    float rt = clamp(1.0 - abs(r - s.z * 1.3) / (s.z * 0.7), 0.0, 1.0);
    d.y += s.w * 0.55 * rt * rt;                                // berme au bord
  }
  d = min(d, vec2(0.22, 0.12));                                 // saturation du sol
  gl_FragColor = vec4(d, 0.0, 1.0);
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
  const thin = rts.map((rt) => new ThinTexture(rt.texture));

  const wrapper = new EffectWrapper({
    engine, name: 'dfUpdate', fragmentShader: FRAG,
    uniformNames: ['shiftUV', 'dtU', 'texel', 'centerW', 'sizeW', 'splats', 'splatCount'],
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
  const splatArr = new Array(64).fill(0); // 16 vec4, réutilisé

  function addSplat(x, z, r, d) { queue.push(x, z, r, d); }

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
    const n = Math.min(16, queue.length >> 2);
    for (let i = 0; i < n * 4; i++) splatArr[i] = queue[i];
    queue.splice(0, n * 4);

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
      e.setArray4('splats', splatArr);
      e.setInt('splatCount', n);
    });
    renderer.render(wrapper, rts[back]);
    renderer.restoreStates();
    engine.restoreDefaultFramebuffer();
    front = back;
    state.frontTex = thin[front];
  }

  return { state, update, addSplat };
}
