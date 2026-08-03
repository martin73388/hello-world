/**
 * L'averse (interaction 2) — une cellule de pluie locale qui suit le focus en
 * dérivant au vent dominant : rideau de gouttes étirées (particules CPU,
 * compatible WebGPU/WebGL) + écriture d'humidité dans le buffer de
 * déformation (canal B). Tout est continu et amorti : montée ~4 s, sortie
 * ~5 s, puis la canopée égoutte encore ~8 s (20 % du débit) avant de se
 * taire. Aucun spawn/despawn : le système tourne en permanence, seul
 * emitRate respire.
 */
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { groundHeight } from '../terrain/road.js';

// vent dominant, normalisé (même direction que dust.js et le cisaillement des pins)
const WL = Math.hypot(0.81, 0.59);
const WX = 0.81 / WL, WZ = 0.59 / WL;

const RISE = 4;          // montée du fondu (s)
const FALL = 5;          // sortie (s)
const DRIP_HOLD = 8;     // la traîne d'égouttement tient... (s)
const DRIP_FADE = 2;     // ...puis s'éteint en douceur (s)
const CELL_HALF = 17;    // demi-côté de la boîte d'émission (34 × 34 m)
const CELL_H = 13;       // hauteur d'émission au-dessus du sol (m)
const DRIFT = 0.6;       // vitesse de dérive de la cellule (m/s)
const LEASH = 12;        // au-delà, rappel doux vers le focus (m)

/** trait vertical doux : dégradé radial écrasé en x par la transformation du
 * contexte — même recette procédurale que le sprite de poussière */
function dropTexture(scene) {
  const tex = new DynamicTexture('rainTex', 128, scene, true);
  const g = tex.getContext();
  g.save();
  g.scale(0.16, 1);
  const grad = g.createRadialGradient(400, 64, 3, 400, 64, 58);
  grad.addColorStop(0, 'rgba(255,255,255,.95)');
  grad.addColorStop(0.4, 'rgba(255,255,255,.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 800, 128);
  g.restore();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export function createRain(scene, deform) {
  const ps = new ParticleSystem('rain', 1400, scene);
  ps.particleTexture = dropTexture(scene);
  ps.emitter = new Vector3(0, CELL_H, 20);
  ps.minEmitBox = new Vector3(-CELL_HALF, -0.6, -CELL_HALF);
  ps.maxEmitBox = new Vector3(CELL_HALF, 0.6, CELL_HALF);
  ps.minLifeTime = 0.8; ps.maxLifeTime = 0.9;         // ~13-16 m de chute
  ps.minSize = 1.5; ps.maxSize = 2.1;
  ps.minScaleX = 0.06; ps.maxScaleX = 0.08;           // le sprite s'étire en goutte
  ps.minScaleY = 0.65; ps.maxScaleY = 0.85;
  ps.billboardMode = ParticleSystem.BILLBOARDMODE_Y;  // traits verticaux monde
  ps.addColorGradient(0, new Color4(0.66, 0.72, 0.84, 0));
  ps.addColorGradient(0.12, new Color4(0.66, 0.72, 0.84, 0.34));
  ps.addColorGradient(0.8, new Color4(0.64, 0.7, 0.82, 0.3));
  ps.addColorGradient(1, new Color4(0.64, 0.7, 0.82, 0));
  ps.minEmitPower = 15; ps.maxEmitPower = 19;
  ps.direction1 = new Vector3(WX * 0.08 - 0.03, -1, WZ * 0.08 - 0.03);
  ps.direction2 = new Vector3(WX * 0.08 + 0.03, -1, WZ * 0.08 + 0.03);
  ps.gravity = new Vector3(WX, -2.5, WZ);             // léger cisaillement au vent
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.emitRate = 0;
  ps.start();

  let activeBool = false;
  let easeRaw = 0;                 // rampe linéaire 0..1
  let easeVal = 0;                 // sortie adoucie (smoothstep), lue par le main
  let dripClock = 1e9;             // temps depuis l'arrêt (grand = traîne finie)
  let cellX = 0, cellZ = 20, cellY = CELL_H;
  let lfx = 0, lfz = 20;           // dernier focus connu (pour le replacement)
  let seed = 73;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function toggle() {
    if (activeBool) {
      activeBool = false;
      dripClock = 0;               // la canopée commence à goutter
    } else {
      // redémarrage à froid : la cellule se replace sur le focus — invisible
      // puisque le débit repart de zéro ; si la traîne goutte encore, on
      // laisse la cellule où elle est (continuité)
      if (easeRaw <= 0 && dripClock > DRIP_HOLD + DRIP_FADE) { cellX = lfx; cellZ = lfz; }
      activeBool = true;
    }
  }

  function update(dt, fx, fz) {
    lfx = fx; lfz = fz;
    // fondus : rampe linéaire, adoucie aux deux bouts par un smoothstep
    easeRaw = Math.min(1, Math.max(0, easeRaw + (activeBool ? dt / RISE : -dt / FALL)));
    easeVal = easeRaw * easeRaw * (3 - 2 * easeRaw);
    if (!activeBool) dripClock += dt;
    const drip = dripClock < DRIP_HOLD ? 1
      : Math.max(0, 1 - (dripClock - DRIP_HOLD) / DRIP_FADE);
    // débit effectif : l'averse, avec un plancher d'égouttement à 20 % — le
    // max() garantit la continuité quand la sortie croise la traîne
    const rain = Math.max(easeVal, drip * 0.2);

    // dérive au vent, retenue par une laisse douce autour du focus : seul
    // l'excès au-delà de 12 m est résorbé (exponentiellement, jamais d'à-coup)
    cellX += WX * DRIFT * dt;
    cellZ += WZ * DRIFT * dt;
    const dx = fx - cellX, dz = fz - cellZ;
    const d = Math.hypot(dx, dz);
    if (d > LEASH) {
      const k = (d - LEASH) * (1 - Math.exp(-2 * dt)) / d;
      cellX += dx * k; cellZ += dz * k;
    }
    // la boîte d'émission suit le relief, amortie (la route descend)
    cellY += (groundHeight(cellX, cellZ) + CELL_H - cellY) * Math.min(1, 3 * dt);
    ps.emitter.set(cellX, cellY, cellZ);
    ps.emitRate = 950 * rain;

    // humidité au sol : addWet ACCUMULE côté GPU frame après frame (canal
    // saturé à 1, séchage ~1 min dans deform) — a ≈ 0.05 × ease × dt donne un
    // sol visiblement mouillé après ~8 s d'averse pleine
    if (rain > 0.05) {
      const a = 0.05 * rain * dt;
      for (let i = 0; i < 3; i++) {                    // file wsplats : 8 max/frame
        deform.addWet(
          cellX + (rnd() * 2 - 1) * (CELL_HALF - 2),
          cellZ + (rnd() * 2 - 1) * (CELL_HALF - 2),
          4 + rnd() * 10, a);
      }
    }
  }

  return { toggle, update, ease: () => easeVal, active: () => activeBool };
}
