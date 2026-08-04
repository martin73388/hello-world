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
import { hazeShared, sunShared } from '../vegetation/wind.js';

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
        { name: 'hzAmb', size: 3, type: 'vec3' },
        { name: 'hzSun', size: 3, type: 'vec3' },
      ],
      fragment: `#ifdef HAZE
uniform float hzD; uniform float hzTop; uniform vec3 hzCol; uniform vec3 hzAmb;
uniform vec3 hzSun;
#endif`,
    };
  }
  bindForSubMesh(ubo) {
    ubo.updateFloat('hzD', hazeShared.d);
    ubo.updateFloat('hzTop', hazeShared.top);
    ubo.updateFloat3('hzCol', hazeShared.r, hazeShared.g, hazeShared.b);
    ubo.updateFloat3('hzAmb', hazeShared.ar, hazeShared.ag, hazeShared.ab);
    ubo.updateFloat3('hzSun', sunShared.x, sunShared.y, sunShared.z);
  }
  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef HAZE
        // Plancher de ciel diffus : sous un soleil rasant, une surface
        // horizontale reçoit N·L ~ 0 et tombe au noir. Le ciel, lui, éclaire
        // toujours un peu — sans ce terme, l'aube et le couchant creusent des
        // trous noirs entre les touffes et sous les arbres.
        // ATTENTION : baseColor est la texture SEULE (blanche si le matériau
        // n'en a pas). Sans vDiffuseColor, le plancher ajoutait du bleu de
        // ciel PUR à tout ce qui n'est pas texturé — les troncs viraient au
        // mauve à contre-jour au lieu de rester des silhouettes brunes.
        color.rgb += baseColor.rgb * vDiffuseColor.rgb * hzAmb;
        float hzDist = length(vEyePosition.xyz - vPositionW);
        // Hauteur RELATIVE à l'œil, pas absolue : le monde descend jusqu'à
        // −40 m le long de la route, une altitude absolue aurait plongé tout
        // le décor dans la nappe dès le premier plan.
        float hzH = clamp(1.0 - (vPositionW.y - vEyePosition.y + 6.0) / hzTop, 0.0, 1.0);
        // et rien avant 18 m : le premier plan garde ses couleurs franches
        float hzNear = smoothstep(18.0, 55.0, hzDist);
        float hzF = (1.0 - exp(-hzDist * hzD * (0.25 + 1.55 * hzH * hzH))) * hzNear;
        // La brume prend la COULEUR DE LA LUMIÈRE QUI LA TRAVERSE. Une nappe
        // d'une seule teinte étageait bien les plans mais laissait l'image
        // plate : dans la référence, la moitié tournée vers le soleil est
        // orangée et l'autre franchement bleue, et c'est ce basculement qui
        // fait le contre-jour. On module donc la teinte par l'angle entre le
        // regard et le soleil — gratuit, et il suit l'arc solaire tout seul.
        vec3 hzV = normalize(vEyePosition.xyz - vPositionW);
        float hzBack = clamp(dot(hzV, normalize(hzSun)), 0.0, 1.0);
        vec3 hzTint = mix(vec3(0.80, 0.90, 1.18), vec3(1.42, 1.12, 0.72), pow(hzBack, 1.6));
        color.rgb = mix(color.rgb, hzCol * hzTint, clamp(hzF, 0.0, 0.93));
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
