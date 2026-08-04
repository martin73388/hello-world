/**
 * Vent hiérarchique + translucidité des aiguilles (M2b), en plugin matériau.
 * Trois échelles superposées dans le vertex shader : rafale lente de l'arbre
 * entier (phase par instance), oscillation moyenne des branches, frisson fin
 * des aiguilles. Le fragment ajoute un rétro-éclairage à contre-jour du
 * soleil (faux « subsurface » des aiguilles). GLSL : Babylon le compile
 * aussi bien vers WebGPU (glslang) que vers WebGL (chemin dev ?gl).
 */
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';

/** horloge partagée, avancée par la boucle de rendu (aucune allocation) */
export const windClock = { t: 0 };

/**
 * Direction du soleil PARTAGÉE et vivante : le cycle jour/nuit la met à jour
 * chaque frame, tous les feuillages en contre-jour la lisent. Sans ça, la
 * translucidité resterait calée sur la pose du premier jour et ne suivrait
 * jamais l'arc solaire.
 */
export const sunShared = { x: -0.62, y: -0.3, z: -0.75 };

/**
 * Brume de vallée partagée : densité et couleur de la nappe basse, tenues à
 * jour par le cycle météo. C'est elle qui étage les plans — le sol lointain
 * se noie pendant que les cimes émergent.
 */
export const hazeShared = {
  d: 0.02, top: 26, r: 0.62, g: 0.7, b: 0.82,
  ar: 0.1, ag: 0.12, ab: 0.15,          // plancher de ciel diffus
};

export class WindPlugin extends MaterialPluginBase {
  constructor(material, opts = {}) {
    super(material, 'Wind', 190, { WIND: false });
    this.strength = opts.strength ?? 1;
    this.transl = opts.transl ?? 0;
    this._enable(true);
  }

  getClassName() { return 'WindPlugin'; }
  prepareDefines(defines) { defines.WIND = true; }

  getUniforms() {
    return {
      ubo: [
        { name: 'wTime', size: 1, type: 'float' },
        { name: 'wStrength', size: 1, type: 'float' },
        { name: 'wTransl', size: 1, type: 'float' },
        { name: 'wSunDir', size: 3, type: 'vec3' },
      ],
      vertex: `#ifdef WIND
uniform float wTime; uniform float wStrength;
#endif`,
      fragment: `#ifdef WIND
uniform float wTransl; uniform vec3 wSunDir;
#endif`,
    };
  }

  bindForSubMesh(ubo) {
    ubo.updateFloat('wTime', windClock.t);
    ubo.updateFloat('wStrength', this.strength);
    ubo.updateFloat('wTransl', this.transl);
    ubo.updateFloat3('wSunDir', sunShared.x, sunShared.y, sunShared.z);
  }

  getCustomCode(shaderType) {
    if (shaderType === 'vertex') {
      return {
        // avant l'application de finalWorld : on lit la translation de
        // l'instance (world3) pour déphaser chaque arbre
        CUSTOM_VERTEX_UPDATE_POSITION: `
#ifdef WIND
#ifdef INSTANCES
          vec2 wWp = vec2(world3.x, world3.z);
#else
          vec2 wWp = vec2(0.0);
#endif
          float wPh = dot(wWp, vec2(0.31, 0.27));
          float wBend = max(0.0, positionUpdated.y) * 0.185;
          wBend *= wBend;                                    // ancré au sol, souple en cime
          float wGust = sin(wTime * 0.9 + wPh) * 0.6 + sin(wTime * 0.331 + wPh * 0.7) * 0.4;
          float wBr = sin(wTime * 2.6 + wPh * 3.1 + positionUpdated.x * 2.1 + positionUpdated.z * 1.7);
          float wNd = sin(wTime * 7.3 + (positionUpdated.x + positionUpdated.y * 1.3 + positionUpdated.z) * 9.0);
          float wAmp = wStrength * wBend;
          positionUpdated.x += (0.81 * wGust * 0.6 + wBr * 0.16 + wNd * 0.05) * wAmp;
          positionUpdated.z += (0.59 * wGust * 0.6 + wBr * 0.13 + wNd * 0.05) * wAmp;
          positionUpdated.y -= abs(wGust) * wAmp * 0.10;     // l'arc raccourcit la cime
#endif
`,
      };
    }
    if (shaderType === 'fragment') {
      return {
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef WIND
          if (wTransl > 0.0) {
            vec3 wV = normalize(vEyePosition.xyz - vPositionW);   // fragment -> œil
            float wBack = clamp(dot(wV, normalize(wSunDir)), 0.0, 1.0);
            float wRim = 1.0 - abs(dot(normalize(vNormalW), wV));
            color.rgb += vec3(0.62, 0.55, 0.22) * pow(wBack, 3.0) * (0.35 + 0.65 * wRim) * wTransl;
          }
#endif
`,
      };
    }
    return null;
  }
}
