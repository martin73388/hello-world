/**
 * L'heure dorée (interaction 4) — la fin d'après-midi glisse vers le
 * crépuscule en ~35 s : soleil qui s'écrase et rougit, ambiance qui vire au
 * bleu, brouillard qui s'épaissit, dôme repeint au vol, et les lucioles qui
 * s'éveillent à l'heure bleue. Tout est continu et amorti : rampe linéaire
 * unique adoucie par un smootherstep, rappuyer sur 4 inverse simplement la
 * direction depuis la position courante — rien ne saute jamais.
 */
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { groundHeight } from '../terrain/road.js';

const DUR = 35;              // durée du glissement complet (s)
const PAINT_STEP = 0.15;     // throttle du repeint du dôme (s)

/* Extrémité « crépuscule » — les valeurs JOUR ne sont pas ici : elles sont
 * capturées à l'init sur les objets existants (source de vérité : main.js). */
const K_SUN_DIF = [1, 0.42, 0.22];
const K_SUN_INT = 1.25;
const K_AMB_INT = 0.62;      // l'heure bleue reste lisible — jamais de noir bouché
const K_AMB_DIF = [0.22, 0.28, 0.54];
const K_AMB_GND = [0.12, 0.12, 0.17];
const K_FOG_D = 0.0155;
const K_FOG_C = [0.12, 0.12, 0.19];
const K_CLEAR = [0.045, 0.055, 0.1];

/* Dégradé du dôme : les 7 stops JOUR repris tels quels de sky.js, et leur
 * version crépuscule — zénith noir-bleu, bande ambrée plus basse et rouge
 * sombre, horizon bas presque noir. Positions ET couleurs interpolées. */
const SKY_POS_DAY = [0.0, 0.30, 0.40, 0.46, 0.55, 0.70, 1.0];
const SKY_POS_DUSK = [0.0, 0.33, 0.47, 0.53, 0.62, 0.75, 1.0];
const SKY_HEX_DAY = ['#131a28', '#2a3348', '#e8a25c', '#b87a4a', '#4a5a74', '#1c3050', '#0c1626'];
const SKY_HEX_DUSK = ['#0a0f1c', '#141c30', '#8a3f28', '#5c2c22', '#303a58', '#101a34', '#05080f'];
// hex parsés UNE fois en triplets [r, g, b] pré-alloués
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const SKY_RGB_DAY = SKY_HEX_DAY.map(hx);
const SKY_RGB_DUSK = SKY_HEX_DUSK.map(hx);

const lerp = (a, b, t) => a + (b - a) * t;
function sstep(a, b, v) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** point lumineux au cœur franc — même recette procédurale que dust.js */
function glowTexture(scene) {
  const tex = new DynamicTexture('fireflyTex', 64, scene, true);
  const g = tex.getContext();
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export function createDaycycle(scene, refs) {
  const { sun, amb, sky } = refs;

  /* ---- capture des valeurs « jour » (points de départ, jamais redéfinis) ---- */
  const D_SDIR = [sun.direction.x, sun.direction.y, sun.direction.z];
  const D_SDIF = [sun.diffuse.r, sun.diffuse.g, sun.diffuse.b];
  const D_SINT = sun.intensity;
  const D_AINT = amb.intensity;
  const D_ADIF = [amb.diffuse.r, amb.diffuse.g, amb.diffuse.b];
  const D_AGND = [amb.groundColor.r, amb.groundColor.g, amb.groundColor.b];
  const D_FOGD = scene.fogDensity;
  const D_FOGC = [scene.fogColor.r, scene.fogColor.g, scene.fogColor.b];
  const D_CLEAR = [scene.clearColor.r, scene.clearColor.g, scene.clearColor.b, scene.clearColor.a];
  // crépuscule : le soleil s'écrase (y → -0.10), x/z conservés, renormalisés
  const kl = Math.hypot(D_SDIR[0], -0.10, D_SDIR[2]);
  const K_SDIR = [D_SDIR[0] / kl, -0.10 / kl, D_SDIR[2] / kl];

  const skyTex = sky.material.emissiveTexture;
  const skyCtx = skyTex.getContext();

  /* ---- lucioles : le système tourne en permanence, seul emitRate respire.
   * 18/s × 3,5 s ≈ 63 vivantes en régime — capacité 70. ---- */
  const flies = new ParticleSystem('fireflies', 70, scene);
  flies.particleTexture = glowTexture(scene);
  flies.emitter = new Vector3(0, -100, 0);
  flies.minEmitBox = new Vector3(-12, 0.3, -12);   // boîte 24 × 24 m,
  flies.maxEmitBox = new Vector3(12, 1.4, 12);     // 0,3–1,4 m au-dessus du sol
  flies.minLifeTime = 3.5; flies.maxLifeTime = 3.5;
  flies.minSize = 0.05; flies.maxSize = 0.09;
  // clignotement : double pulse d'alpha sur la vie (0 → 1 → 0 → 0.7 → 0),
  // les émissions étant décalées, les phases se désynchronisent d'elles-mêmes
  flies.addColorGradient(0, new Color4(0.75, 0.9, 0.45, 0));
  flies.addColorGradient(0.25, new Color4(0.75, 0.9, 0.45, 1));
  flies.addColorGradient(0.5, new Color4(0.75, 0.9, 0.45, 0));
  flies.addColorGradient(0.75, new Color4(0.75, 0.9, 0.45, 0.7));
  flies.addColorGradient(1, new Color4(0.75, 0.9, 0.45, 0));
  flies.minEmitPower = 0.12; flies.maxEmitPower = 0.4;   // dérive lente
  flies.direction1 = new Vector3(-1, -0.35, -1);
  flies.direction2 = new Vector3(1, 0.5, 1);
  flies.blendMode = ParticleSystem.BLENDMODE_ADD;
  flies.emitRate = 0;
  flies.start();
  let flyY = groundHeight(0, 20);      // hauteur amortie de la boîte (y du joueur)

  /* ---- état du glissement ---- */
  let u = 0;             // rampe linéaire 0..1, continue même en cas d'inversion
  let target = 0;        // extrémité visée (0 = après-midi, 1 = crépuscule)
  let tVal = 0;          // sortie adoucie (smootherstep), lue par le main
  let paintedT = 0;      // dernier t peint sur le dôme
  let paintClock = 0;

  /* repeint du dégradé — SEULE fonction qui alloue (gradient canvas +
   * chaînes rgb, inévitable), d'où le throttle à 0,15 s pendant le
   * glissement uniquement, plus un dernier passage exact à l'arrivée */
  function paintSky(t) {
    const grad = skyCtx.createLinearGradient(0, 0, 0, 256);
    for (let i = 0; i < 7; i++) {
      const a = SKY_RGB_DAY[i], b = SKY_RGB_DUSK[i];
      grad.addColorStop(lerp(SKY_POS_DAY[i], SKY_POS_DUSK[i], t),
        'rgb(' + Math.round(lerp(a[0], b[0], t)) + ','
        + Math.round(lerp(a[1], b[1], t)) + ','
        + Math.round(lerp(a[2], b[2], t)) + ')');
    }
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 64, 256);
    skyTex.update();
  }

  function toggle() {
    // vers l'autre extrémité ; en cours de route, u repart d'où il est
    target = 1 - target;
  }

  function update(dt, px, pz) {
    if (u < target) u = Math.min(target, u + dt / DUR);
    else if (u > target) u = Math.max(target, u - dt / DUR);
    tVal = u * u * u * (u * (u * 6 - 15) + 10);      // smootherstep
    const t = tVal;

    // interpolation ABSOLUE chaque frame, en mutant les objets existants —
    // la pluie module ces valeurs APRÈS (cf. main.js), il faut donc les reposer
    sun.direction.copyFromFloats(
      lerp(D_SDIR[0], K_SDIR[0], t), lerp(D_SDIR[1], K_SDIR[1], t), lerp(D_SDIR[2], K_SDIR[2], t));
    sun.diffuse.copyFromFloats(
      lerp(D_SDIF[0], K_SUN_DIF[0], t), lerp(D_SDIF[1], K_SUN_DIF[1], t), lerp(D_SDIF[2], K_SUN_DIF[2], t));
    sun.intensity = lerp(D_SINT, K_SUN_INT, t);
    amb.intensity = lerp(D_AINT, K_AMB_INT, t);
    amb.diffuse.copyFromFloats(
      lerp(D_ADIF[0], K_AMB_DIF[0], t), lerp(D_ADIF[1], K_AMB_DIF[1], t), lerp(D_ADIF[2], K_AMB_DIF[2], t));
    amb.groundColor.copyFromFloats(
      lerp(D_AGND[0], K_AMB_GND[0], t), lerp(D_AGND[1], K_AMB_GND[1], t), lerp(D_AGND[2], K_AMB_GND[2], t));
    scene.fogDensity = lerp(D_FOGD, K_FOG_D, t);
    scene.fogColor.copyFromFloats(
      lerp(D_FOGC[0], K_FOG_C[0], t), lerp(D_FOGC[1], K_FOG_C[1], t), lerp(D_FOGC[2], K_FOG_C[2], t));
    scene.clearColor.copyFromFloats(
      lerp(D_CLEAR[0], K_CLEAR[0], t), lerp(D_CLEAR[1], K_CLEAR[1], t), lerp(D_CLEAR[2], K_CLEAR[2], t),
      D_CLEAR[3]);

    // dôme : repeint throttlé pendant le glissement, une dernière fois à
    // l'arrivée (u === target garantit t exactement 0 ou 1)
    if (t !== paintedT) {
      paintClock += dt;
      if (paintClock >= PAINT_STEP || u === target) {
        paintClock = 0;
        paintedT = t;
        paintSky(t);
      }
    }

    // lucioles : la boîte suit le joueur, hauteur amortie sur le relief (une
    // requête sol par frame suffit, pas d'échantillonnage par particule)
    flyY += (groundHeight(px, pz) - flyY) * Math.min(1, 3 * dt);
    flies.emitter.set(px, flyY, pz);
    flies.emitRate = 18 * sstep(0.62, 0.92, t);      // éveil à l'heure bleue
  }

  return { toggle, update, t: () => tVal };
}
