/**
 * La patine PS1 — passe de post finale : quantification des couleurs sur une
 * palette réduite, avec tramage ordonné (matrice de Bayer 4×4) pour que les
 * dégradés du ciel et de la brume se cassent en trames au lieu de bander.
 * C'est la signature « console 32 bits » que Valheim revisite : peu de
 * couleurs, beaucoup d'atmosphère.
 * Débrayable depuis l'overlay F1 (comparaison A/B).
 */
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';
import { Effect } from '@babylonjs/core/Materials/effect.js';

Effect.ShadersStore.retroFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float rtLevels;    // paliers par canal
uniform float rtDither;    // force du tramage

// Bayer 4×4 déplié : pas de tableau indexé dynamiquement (WebGPU/WGSL friendly)
float bayer(vec2 p) {
  float x = mod(p.x, 4.0), y = mod(p.y, 4.0);
  float i = y * 4.0 + x;
  float v = 0.0;
  v += step(0.5, 1.0 - abs(i -  0.0)) *  0.0;
  v += step(0.5, 1.0 - abs(i -  1.0)) *  8.0;
  v += step(0.5, 1.0 - abs(i -  2.0)) *  2.0;
  v += step(0.5, 1.0 - abs(i -  3.0)) * 10.0;
  v += step(0.5, 1.0 - abs(i -  4.0)) * 12.0;
  v += step(0.5, 1.0 - abs(i -  5.0)) *  4.0;
  v += step(0.5, 1.0 - abs(i -  6.0)) * 14.0;
  v += step(0.5, 1.0 - abs(i -  7.0)) *  6.0;
  v += step(0.5, 1.0 - abs(i -  8.0)) *  3.0;
  v += step(0.5, 1.0 - abs(i -  9.0)) * 11.0;
  v += step(0.5, 1.0 - abs(i - 10.0)) *  1.0;
  v += step(0.5, 1.0 - abs(i - 11.0)) *  9.0;
  v += step(0.5, 1.0 - abs(i - 12.0)) * 15.0;
  v += step(0.5, 1.0 - abs(i - 13.0)) *  7.0;
  v += step(0.5, 1.0 - abs(i - 14.0)) * 13.0;
  v += step(0.5, 1.0 - abs(i - 15.0)) *  5.0;
  return v / 16.0 - 0.5;
}

void main(void) {
  vec3 c = texture2D(textureSampler, vUV).rgb;
  // gl_FragCoord plutôt que vUV × résolution : entier exact, pas de bandes
  // dues à la précision quand les UV sont multipliés par 2560
  float d = bayer(gl_FragCoord.xy) * rtDither / rtLevels;
  gl_FragColor = vec4(floor(clamp(c + d, 0.0, 1.0) * rtLevels + 0.5) / rtLevels, 1.0);
}
`;

export function createRetro(scene, camera) {
  const pp = new PostProcess('retro', 'retro', ['rtLevels', 'rtDither'],
    null, 1.0, camera);
  const cfg = { levels: 26, dither: 0.9 };
  pp.onApply = (effect) => {
    effect.setFloat('rtLevels', cfg.levels);
    effect.setFloat('rtDither', cfg.dither);
  };
  let on = true;
  return {
    cfg,
    set(v) {
      if (v === on) return;
      on = v;
      if (v) camera.attachPostProcess(pp);
      else camera.detachPostProcess(pp);
    },
    has: () => on,
  };
}
