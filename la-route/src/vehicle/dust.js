/**
 * Le sillage (M5) — panaches de poussière derrière les roues sur gravier et
 * terre : volutes qui gonflent, montent un peu, dérivent avec le vent
 * dominant et se dissipent. Particules CPU (quads alpha, sprite radial
 * procédural) : suffisant pour la densité visée, compatible WebGPU/WebGL.
 * + le pof d'échappement au démarrage (dû depuis le M4).
 */
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';

function puffTexture(scene) {
  const tex = new DynamicTexture('dustTex', 128, scene, true);
  const g = tex.getContext();
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,.8)');
  grad.addColorStop(0.45, 'rgba(255,255,255,.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

// vent dominant (même direction que le cisaillement du terrain et des pins)
const WIND = { x: 0.81, z: 0.59 };

export function createDust(scene) {
  const tex = puffTexture(scene);

  const mkPlume = () => {
    const ps = new ParticleSystem('dustPlume', 240, scene);
    ps.particleTexture = tex;
    ps.emitter = new Vector3(0, -100, 0);
    ps.minEmitBox = new Vector3(-0.16, -0.05, -0.16);
    ps.maxEmitBox = new Vector3(0.16, 0.1, 0.16);
    ps.minLifeTime = 1.1; ps.maxLifeTime = 2.4;
    ps.minSize = 0.35; ps.maxSize = 0.7;
    ps.addSizeGradient(0, 0.4);
    ps.addSizeGradient(1, 2.6);                        // la volute gonfle en mourant
    ps.addColorGradient(0, new Color4(0.5, 0.42, 0.32, 0));
    ps.addColorGradient(0.12, new Color4(0.5, 0.42, 0.32, 0.38));
    ps.addColorGradient(0.5, new Color4(0.46, 0.4, 0.32, 0.2));
    ps.addColorGradient(1, new Color4(0.44, 0.4, 0.34, 0));
    ps.minEmitPower = 0.5; ps.maxEmitPower = 1.6;
    ps.direction1 = new Vector3(-0.4, 0.25, -0.4);     // réorienté chaque frame
    ps.direction2 = new Vector3(0.4, 0.9, 0.4);
    ps.gravity = new Vector3(WIND.x * 0.42, 0.34, WIND.z * 0.42);  // flotte et dérive
    ps.minAngularSpeed = -0.6; ps.maxAngularSpeed = 0.6;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitRate = 0;
    ps.start();
    return ps;
  };

  const exhaust = new ParticleSystem('exhaust', 60, scene);
  exhaust.particleTexture = tex;
  exhaust.emitter = new Vector3(0, -100, 0);
  exhaust.minEmitBox = new Vector3(-0.06, 0, -0.06);
  exhaust.maxEmitBox = new Vector3(0.06, 0.06, 0.06);
  exhaust.minLifeTime = 0.7; exhaust.maxLifeTime = 1.5;
  exhaust.minSize = 0.18; exhaust.maxSize = 0.3;
  exhaust.addSizeGradient(0, 0.22);
  exhaust.addSizeGradient(1, 1.1);
  exhaust.addColorGradient(0, new Color4(0.4, 0.42, 0.46, 0));
  exhaust.addColorGradient(0.15, new Color4(0.4, 0.42, 0.46, 0.5));
  exhaust.addColorGradient(1, new Color4(0.45, 0.46, 0.5, 0));
  exhaust.minEmitPower = 0.5; exhaust.maxEmitPower = 1.1;
  exhaust.direction1 = new Vector3(-0.5, 0.3, -1.2);
  exhaust.direction2 = new Vector3(0.5, 0.9, -0.4);
  exhaust.gravity = new Vector3(0, 0.5, 0);
  exhaust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  exhaust.emitRate = 0;
  exhaust.start();

  return {
    plumes: [mkPlume(), mkPlume()],
    /** pof de démarrage à la position monde donnée */
    puff(x, y, z) {
      exhaust.emitter.set(x, y, z);
      exhaust.manualEmitCount = 30;
    },
  };
}
