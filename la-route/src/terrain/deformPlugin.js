/**
 * Lecture du buffer d'état par les matériaux de sol.
 * Deux modes :
 *  - patch (DEFORM_PATCH) : déplacement réel des sommets (berme − enfoncement)
 *    + petite surélévation, fondus vers le bord du patch ;
 *  - terrain grossier : plongée de 32 cm sous l'emprise du patch (les ornières
 *    ne crèvent jamais le maillage à 1,15 m), rien d'autre au vertex.
 * Les deux modes recalculent la normale depuis le gradient du buffer et
 * assombrissent la terre compressée dans le fragment — c'est là que
 * l'empreinte « s'intègre à l'éclairage » (berme au soleil, creux à l'ombre).
 */
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';

export class DeformPlugin extends MaterialPluginBase {
  constructor(material, deformState, opts = {}) {
    super(material, 'Deform', 195, { DEFORM: false, DEFORM_PATCH: false });
    this._st = deformState;
    this._patch = !!opts.patch;
    this._enable(true);
  }

  getClassName() { return 'DeformPlugin'; }
  prepareDefines(defines) { defines.DEFORM = true; defines.DEFORM_PATCH = this._patch; }
  getSamplers(samplers) { samplers.push('dfTex'); }

  getUniforms() {
    const decl = `#ifdef DEFORM
uniform vec2 dfCenter; uniform float dfSize; uniform float dfTexel; uniform vec3 dfPatch;
#endif`;
    return {
      ubo: [
        { name: 'dfCenter', size: 2, type: 'vec2' },
        { name: 'dfSize', size: 1, type: 'float' },
        { name: 'dfTexel', size: 1, type: 'float' },
        { name: 'dfPatch', size: 3, type: 'vec3' },   // centre x, z, demi-côté
      ],
      vertex: decl,
      fragment: decl,
    };
  }

  bindForSubMesh(ubo) {
    const s = this._st;
    ubo.updateFloat2('dfCenter', s.cx, s.cz);
    ubo.updateFloat('dfSize', s.size);
    ubo.updateFloat('dfTexel', 1 / s.res);
    ubo.updateFloat3('dfPatch', s.patchX, s.patchZ, s.patchHalf);
    ubo.setTexture('dfTex', s.frontTex);
  }

  getCustomCode(shaderType) {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
#ifdef DEFORM_PATCH
uniform sampler2D dfTex;
#endif
`,
        CUSTOM_VERTEX_UPDATE_POSITION: `
#ifdef DEFORM
        vec2 dfPd = abs(positionUpdated.xz - dfPatch.xy);
        float dfPr = max(dfPd.x, dfPd.y);
#ifdef DEFORM_PATCH
        float dfF = 1.0 - smoothstep(dfPatch.z - 6.0, dfPatch.z - 2.2, dfPr);
        vec2 dfUv = clamp((positionUpdated.xz - dfCenter) / dfSize + 0.5, 0.001, 0.999);
        vec2 dfD = texelFetch(dfTex, ivec2(dfUv / dfTexel), 0).rg;
        positionUpdated.y += (dfD.y - dfD.x + 0.015) * dfF;
#else
        float dfF = 1.0 - smoothstep(dfPatch.z - 2.0, dfPatch.z - 0.5, dfPr);
        positionUpdated.y -= 0.32 * dfF;
#endif
#endif
`,
      };
    }
    if (shaderType === 'fragment') {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef DEFORM
uniform sampler2D dfTex;
float dfWetG = 0.0;   // brillance humide, posée avant l'éclairage, lue après
#endif
`,
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef DEFORM
        vec2 dfUvF = (vPositionW.xz - dfCenter) / dfSize + 0.5;
        vec2 dfE = min(dfUvF, vec2(1.0) - dfUvF);
        float dfM = clamp(min(dfE.x, dfE.y) * dfSize * 0.5, 0.0, 1.0);
        if (dfM > 0.0) {
          vec4 dfC0 = texture2D(dfTex, dfUvF);
          float dfH = dfC0.y - dfC0.x;
          float dfHx = dot(texture2D(dfTex, dfUvF + vec2(dfTexel, 0.0)).rg, vec2(-1.0, 1.0));
          float dfHz = dot(texture2D(dfTex, dfUvF + vec2(0.0, dfTexel)).rg, vec2(-1.0, 1.0));
          float dfW = dfSize * dfTexel;
          vec3 dfN = vec3(-(dfHx - dfH) / dfW, 0.0, -(dfHz - dfH) / dfW);
          normalW = normalize(normalW + dfN * 1.4 * dfM);
          baseColor.rgb *= 1.0 - clamp(dfC0.x * 2.4, 0.0, 0.5) * dfM;   // terre compressée
          float dfWet = clamp(dfC0.b, 0.0, 1.0) * dfM;
          float dfSc = clamp(dfC0.a, 0.0, 1.0) * dfM;
          baseColor.rgb *= 1.0 - dfWet * 0.38;                           // terre mouillée sombre
          baseColor.rgb = mix(baseColor.rgb, vec3(0.055, 0.048, 0.042), dfSc * 0.85); // charbon
          // flaque : l'eau s'accumule là où c'est mouillé ET creusé
          float dfPud = smoothstep(0.55, 0.95, dfC0.b) * smoothstep(0.02, 0.08, dfC0.x) * dfM;
          baseColor.rgb = mix(baseColor.rgb, vec3(0.07, 0.085, 0.115), dfPud);
          dfWetG = max(dfWet * 0.55, dfPud);
        }
#endif
`,
        // ici specularBase (somme spéculaire des lumières) et color existent :
        // le reflet du soleil s'allume sur la terre mouillée et les flaques
        CUSTOM_FRAGMENT_BEFORE_FOG: `
#if defined(DEFORM) && defined(SPECULARTERM)
        if (dfWetG > 0.0) {
          color.rgb += specularBase * vec3(0.5, 0.55, 0.62) * dfWetG;
        }
#endif
`,
      };
    }
    return null;
  }
}
