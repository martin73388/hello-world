/**
 * Post-traitement (M7) : chaîne DefaultRenderingPipeline sur la caméra —
 * FXAA + MSAA, bloom discret, grain animé, sharpen léger, ACES + vignette
 * bleu nuit. Chaque passe est toggleable (comparaison A/B). L'exposition
 * RÉELLE glisse vers sa cible comme un œil qui s'adapte (~1,2 s) : appeler
 * update(dt) chaque frame. Même chaîne sur WebGPU et sur le chemin dev ?gl.
 */
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';

export function createPost(scene, camera) {
  // hdr:true — le bloom travaille en demi-flottants avant le tone mapping
  const pipe = new DefaultRenderingPipeline('post', true, scene, [camera]);
  pipe.fxaaEnabled = true;
  pipe.samples = 4;                       // MSAA sur la cible de la chaîne

  // bloom généreux : c'est lui qui fait « respirer » les hautes lumières —
  // l'herbe à contre-jour, les trouées de ciel, l'eau au soleil
  pipe.bloomEnabled = true;
  pipe.bloomThreshold = 0.62;
  pipe.bloomWeight = 0.42;
  pipe.bloomKernel = 64;
  pipe.bloomScale = 0.75;

  pipe.grainEnabled = true;               // grain pellicule, animé
  pipe.grain.intensity = 5;
  pipe.grain.animated = true;

  pipe.sharpenEnabled = true;             // récupère le piqué mangé par le FXAA
  pipe.sharpen.edgeAmount = 0.2;
  pipe.sharpen.colorAmount = 1.0;

  const ip = pipe.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.0;
  ip.contrast = 1.02;                     // l'ACES contraste déjà — ne pas boucher les ombres
  ip.vignetteEnabled = true;              // discret : ferme les coins en bleu nuit
  ip.vignetteWeight = 1.0;
  ip.vignetteColor = new Color4(0.03, 0.05, 0.11, 0);

  /* ---- exposition adaptative (aucune allocation par frame) ---- */
  let expTarget = 1.0;
  const TAU = 0.4;                        // constante de temps : ~95 % du chemin en 1,2 s

  /** fixe la CIBLE d'exposition ; la valeur réelle glisse dans update(dt) */
  const setExposure = (v) => { expTarget = v; };
  const getExposure = () => ip.exposure;

  /** à appeler CHAQUE frame : l'œil s'adapte, jamais de snap */
  const update = (dt) => {
    ip.exposure += (expTarget - ip.exposure) * (1 - Math.exp(-dt / TAU));
  };

  /* ---- passes toggleables (A/B) ---- */
  const set = (name, on) => {
    // 'msaa' porte un ENTIER (1, 2 ou 4), pas un booléen : on le traite avant
    // la coercition, sinon 4 devient true et l'appel ne veut plus rien dire.
    if (name === 'msaa') { pipe.samples = (on | 0) || 1; return; }
    on = !!on;
    switch (name) {
      case 'fxaa': pipe.fxaaEnabled = on; break;
      case 'bloom': pipe.bloomEnabled = on; break;
      case 'grain': pipe.grainEnabled = on; break;
      case 'sharpen': pipe.sharpenEnabled = on; break;
      case 'vignette': ip.vignetteEnabled = on; break;
      case 'tonemapping': ip.toneMappingEnabled = on; break;
    }
  };
  /** état courant d'une passe (false si nom inconnu) */
  const has = (name) => {
    switch (name) {
      case 'fxaa': return pipe.fxaaEnabled;
      case 'bloom': return pipe.bloomEnabled;
      case 'grain': return pipe.grainEnabled;
      case 'sharpen': return pipe.sharpenEnabled;
      case 'vignette': return ip.vignetteEnabled;
      case 'tonemapping': return ip.toneMappingEnabled;
      // MSAA 4x sur une cible HDR demi-flottante est le seul poste de la chaîne
      // dont le coût croît avec la résolution ET avec le nombre d'échantillons.
      // C'est donc le premier suspect si on est limité par le remplissage — et
      // il n'avait aucune poignée, donc personne ne pouvait le mesurer.
      case 'msaa': return pipe.samples;
      default: return false;
    }
  };

  /** force du bloom, réglable à chaud depuis l'overlay */
  const setBloom = (w) => { pipe.bloomWeight = w; };

  // `pipe` sort aussi : les sondes de perf ont besoin de le manipuler passe
  // par passe, et `samples` ne se lit pas autrement.
  return { setExposure, getExposure, update, set, has, setBloom, pipe };
}
