/**
 * La brume de vallée — un plugin matériau qui ÉTAGE les plans. Le brouillard
 * exponentiel de Babylon noie tout uniformément avec la distance ; ici on
 * ajoute une nappe basse : plus un fragment est proche du sol, plus il se
 * fond dans la brume. Résultat, les troncs et le sol du lointain disparaissent
 * pendant que les cimes émergent — c'est exactement ce qui sépare le premier
 * plan, la forêt de mi-distance et les crêtes du fond.
 * S'applique aux matériaux du décor ; le ciel et les nuages en sont exclus.
 */
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { hazeShared } from '../vegetation/wind.js';

export class HazePlugin extends MaterialPluginBase {
  constructor(material) {
    super(material, 'Haze', 210, { HAZE: false });
    this._enable(true);
  }
  getClassName() { return 'HazePlugin'; }
  prepareDefines(defines) { defines.HAZE = true; }
  getUniforms() {
    return {
      ubo: [
        { name: 'hzD', size: 1, type: 'float' },
        { name: 'hzTop', size: 1, type: 'float' },
        { name: 'hzCol', size: 3, type: 'vec3' },
      ],
      fragment: `#ifdef HAZE
uniform float hzD; uniform float hzTop; uniform vec3 hzCol;
#endif`,
    };
  }
  bindForSubMesh(ubo) {
    ubo.updateFloat('hzD', hazeShared.d);
    ubo.updateFloat('hzTop', hazeShared.top);
    ubo.updateFloat3('hzCol', hazeShared.r, hazeShared.g, hazeShared.b);
  }
  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef HAZE
        float hzDist = length(vEyePosition.xyz - vPositionW);
        // Hauteur RELATIVE à l'œil, pas absolue : le monde descend jusqu'à
        // −40 m le long de la route, une altitude absolue aurait plongé tout
        // le décor dans la nappe dès le premier plan.
        float hzH = clamp(1.0 - (vPositionW.y - vEyePosition.y + 6.0) / hzTop, 0.0, 1.0);
        // et rien avant 18 m : le premier plan garde ses couleurs franches
        float hzNear = smoothstep(18.0, 55.0, hzDist);
        float hzF = (1.0 - exp(-hzDist * hzD * (0.25 + 1.55 * hzH * hzH))) * hzNear;
        color.rgb = mix(color.rgb, hzCol, clamp(hzF, 0.0, 0.93));
#endif
`,
    };
  }
}

/** applique la brume à tous les matériaux du décor (jamais au ciel) */
export function applyHaze(scene, skip) {
  const skipSet = new Set(skip);
  for (const m of scene.materials) {
    if (skipSet.has(m.name)) continue;
    if (m.fogEnabled === false) continue;              // ciel, nuages, rais
    new HazePlugin(m);
  }
}
