# Plan de portage jungle-trail → LA ROUTE

Document de travail produit par la passe de reconnaissance (8 agents : 6
lectures de jungle-trail + 1 inventaire de LA ROUTE + 1 synthèse). Chaque
item porte son critère de vérification par capture. Les notes de lecture
brutes sont dans le scratchpad de session (lectures.json).

# PLAN DE PORTAGE jungle-trail → LA ROUTE

Classement par ratio gain visuel / coût. Identité conservée : forêt tempérée, DA 32 bits assumée (quantification retro, nearest, silhouettes franches), pas de photoréalisme. Le but n'est pas de copier la jungle mais d'importer ce qui fait sa **densité** (semis à queue lourde, variation), sa **profondeur** (litière, occlusion de contact, macro anti-répétition) et sa **lumière** (extinction solaire, translucidité, dapple oblique).

**Contrainte transverse** : tout GLSL nouveau passe par la transpilation glslang/twgsl → WGSL. Pas de tableau indexé dynamiquement, samplers déclarés dans `CUSTOM_VERTEX_DEFINITIONS`, respect du drapeau `fogEnabled===false` pour tout matériau exclu de la brume. Le dev à 2,5 fps en WebGL logiciel valide tout ce qui est **statique par capture** ; tout ce qui est temporel, perf ou spécifique WebGPU exige la machine cible (noté ⚠︎cible par item).

---

## TIER 1 — quasi gratuit, gain disproportionné (faire d'abord, dans cet ordre)

### 1.1 Couleur/intensité du soleil dérivées de l'extinction (airmass Kasten-Young)
- **Source** : sky.js:251-289 de jungle-trail. CPU pur, ~20 lignes, zéro dépendance moteur.
- **Change** : `src/world/weather.js` (là où la DirectionalLight est pilotée par l'heure). Garder les palettes du dôme telles quelles ; seule la **directionnelle** passe à `color = normalize(exp(-β·airmass))`, `intensity = clamp(k·y^0.8)`. Reprendre les 3 décisions : β=(0.19,0.42,0.95), normalisation au canal max, exposant 0.8 (pas sinus).
- **Casse** : les constantes actuelles d'intensité par heure deviennent redondantes → risque de double comptage (rougissement × palette chaude). Retirer toute teinte keyframée de la directionnelle, ne garder les palettes que pour le dôme/ambiante. La lune (direction retournée) doit garder sa propre couleur, pas l'extinction.
- **Vérif capture** : à sunY≈0.10, ratio R/B de la lumière directe sur un tronc éclairé ≥ 2.0 ; à midi ≈ 1.0 — mesuré sur pixels de fût plein soleil, **aucune palette dédiée au couchant côté lumière**. Vérifiable à 2,5 fps (debug heure fixe).

### 1.2 Teinte par instance + sénescence (~1/9 mourante)
- **Source** : vegetation.js:1477-1519.
- **Change** : `grass.js`, `pines.js`, `flora.js` — ajouter un buffer thin-instance `color` (4 floats) + un multiply dans les plugins existants (hook fragment déjà en place). Tirage au semis : `v=(0.60+rng·0.46)·shade`, chroma quasi neutre, `age>0.93` → lerp vers (0.58,0.47,0.28), `age>0.84` → jaunissant. `shade` par espèce : le mur d'arbres lointain **plus sombre** (0.74) que le premier plan — c'est la réponse la moins chère au « voile sauge » de la moyenne distance, et LA ROUTE a exactement ce problème avec la brume.
- **Casse** : +64 o/instance sur 23 000 instances (négligeable) ; les buffers étant figés à l'init, prévoir le buffer couleur dès l'allocation. Si un jour un LOD hi/lo existe (1.6), tirer la couleur **une fois par emplacement**, pas par mesh.
- **Vérif capture** : sur 100 touffes d'un même cadre, écart de valeur ≥ ±20 % et 8-14 individus à note chaude identifiable ; A/B toggle → le tapis ne lit plus comme un seul vert. 2,5 fps OK.

### 1.3 stand() + bulk() (orientation conformée, échelle non uniforme)
- **Source** : vegetation.js:550-582. 10 lignes.
- **Change** : les boucles de placement de `grass.js:388-467`, `flora.js`, `pines.js` — quaternion lerpé vers la normale terrain (`height()` analytique donne la normale par différences finies, déjà fait pour les roseaux) avec `conform` par espèce (herbe 0.9, fougère 0.7, buisson 0.5, bouleau 0.3, pin 0.15) ; échelle (x,y,z) indépendante ±15 % (×1.4 en Y).
- **Casse** : rien — matrices thin instance déjà écrites à la main, c'est 3 floats de plus dans la composition.
- **Vérif capture** : sur un talus, les brins penchent partiellement avec la pente (plus aucune touffe perpendiculaire au sol sur le remblai) ; deux pins voisins de même variante n'ont plus le même rapport hauteur/largeur. 2,5 fps OK.

### 1.4 Occlusion de contact **locale** (pas SSAO)
- **Source** : principe de canopy.js:311-314, mais version simplifiée sans champ monde : les plantes sont posées à y=0 local, donc `low = 1 - smoothstep(0, 0.5, yLocal)` est disponible **au vertex, gratuitement** (le vent utilise déjà `max(0,y)`).
- **Change** : `wind.js` et `grass.js` (plugins) : `color *= 1 - 0.45·low·(1-|N.y|)` — le terme de normale épargne la litière/les feuilles à plat. Pour les troncs : occlusion croissante vers le pied dans la géométrie de `pines.js`/`flora.js` (vertex color ou atténuation UV.v).
- **Casse** : rien. Attention à ne pas l'empiler avec l'assombrissement humide du deformPlugin (trois multiplications d'occlusion = troncs noirs, leçon aSurf de jungle-trail : tenir chaque terme à une fraction).
- **Vérif capture** : plan rapproché : ligne sombre à la jonction tige/sol, diff A/B localisée aux ~40 premiers cm de chaque plante ; le sous-bois cesse de « flotter à 1 cm du sol ». 2,5 fps OK.

### 1.5 Translucidité : lobe courbé par la normale + variance par feuille + faces abaxiales
- **Source** : vegetation.js:242-334. **C'est le levier n°1 identifié par le diagnostic G-R de jungle-trail** : la séparation vert-rouge se fabrique dans le matériau, jamais dans le post. LA ROUTE a déjà le contre-jour (wind.js:95-104), il manque trois choses :
  1. **Courber le vecteur lumière** : `Hs = normalize(sunView + N·0.6)`, `I = pow(dot(V,-Hs),3.2)` au lieu du `dot(V,sun)` pur — une feuille de profil transmet encore.
  2. **Variance par instance** : moduler `transl` par un hash de position d'instance (0.55–1.45, moyenne 1) — sinon la canopée rétroéclairée est UNE lueur uniforme.
  3. **Face abaxiale** sur les cartes larges (`!gl_FrontFacing` dans le plugin) : dessous mat, plus pâle/gris, échelonné par un aléa — supprime le panneau ocre identique de toutes les feuilles vues d'en dessous.
- **Change** : `wind.js`, `grass.js` (fragments), garde `× baseColor` (la lumière ressort verte — non négociable).
- **Casse** : risque néon vert sur les surfaces larges — garder le réglage modéré consigné (0.5 fougère). WGSL : `gl_FrontFacing` existe, OK.
- **Vérif capture** : contre-jour, mesurer **G-R en code values** sur le feuillage rétroéclairé : gain ≥ +8 vs actuel ; une branche de pin **de profil** au soleil garde du glow (test du lobe courbé) ; vue en contre-plongée sous un bouleau : les cartes ne sont plus toutes identiques. 2,5 fps OK. → **prérequis obligatoire avant tout travail de grade (3.2)**.

### 1.6 Semis à queue lourde : 3 octaves de clump, probabilité continue, `dens`
- **Source** : vegetation.js:826-987 (`_scatter`, edgeLight, rooting).
- **Change** : `grass.js` `sow()` et le placement de `flora.js` : `accept()` retourne une **probabilité** (jamais un booléen), multipliée par `(0.08 + 10.9·clump²)` avec clump = produit de 3 octaves de bruit de valeur (21/7/2.6 m — **trois**, deux ne suffisent pas) ; `dens` passé au dimensionnement (les gros individus au cœur des touffes : `s = base + rng·spread + dens·bonus`). Renormaliser l'espérance après la mise au carré (le piège du ÷2 silencieux est documenté). Ajouter `edgeLight` inversé pour LA ROUTE : le bord de route est le puits de lumière → herbe/fleurs plus denses en lisière, fougères refoulées (cohérent avec les seuils roadQuery existants).
- **Casse** : les tailles de buffers thin instance sont **figées à l'init** — la saturation des nœuds denses peut dépasser le budget par cellule de re-semis. Deux options : plafonner par cellule, ou dimensionner les buffers sur le pire cas. Le déterminisme par graine de cellule est préservé (le clump est un champ de position, pas un flux rng).
- **Ordre imposé** : la **hausse globale de densité** (viser 3-4× le comptage actuel pour approcher la lecture jungle) est **gâtée par 2.5 (bucketing)**. À budget constant, ce changement seul redistribue déjà : c'est ce qu'on livre en premier.
- **Vérif capture** : caméra debug zénithale : nœuds quasi saturés séparés de clairières ; test stat : variance du comptage par cellule de 5 m ≥ 3× Poisson ; au sol : on voit **à travers** la prairie par endroits et pas d'autres. 2,5 fps OK.

---

## TIER 2 — coût moyen, structurant

### 2.1 Litière deux étages (LE chantier « sol de forêt »)
- **Source** : leafField (glsl.js:180-231), texture LITTER (groundTex.js:133-229), litterMat + transport (plants.js:1964-2169, vegetation.js:1142-1229), addLitterSkirt (plants.js:1921-1962). Adapté tempéré : **aiguilles de pin** (leafField à widRatio 0.05 — la primitive brindille EST une aiguille), feuilles de bouleau ovales, pommes de pin en fuseaux.
- **Change** :
  - *Étage A (texture)* : nouveau bake GLSL via EffectWrapper (l'infra ping-pong de `deform.js` sait déjà faire) → une texture tuilée aiguilles+feuilles, échantillonnée dans le matériau terrain sous les bosquets. Reprendre les invariants : quasi-charbon (0.078,0.064,0.048) dans les interstices, **curl** (rim de hauteur au bord → normal map dérivée = liseré), 5 couches empilées par z-order, humus noir. Masque de présence = distance aux pins (les positions sont connues au semis → baker un champ de densité 1 texel/m, cf. 2.4).
  - *Étage B (géométrie)* : nouvelle espèce dans `grass.js`/nouveau `litter.js` : patches de 20-40 petites cartes bentCard, 4 familles (plate / roulée en tube / fragment / squelette), **curl signé 62 % négatif**, pitch ±0.22 rad max (couché, pas fiché).
  - *Semis par TRANSPORT* : `held=(1-ss(0.16,0.62,slope))³`, `caught=hollow²·2.6`, `trodden` aminci sur la route via roadQuery et le canal R du buffer d'état. `hollow` = moyenne 4 voisins à ±1 m de `height()` − hauteur locale — LA ROUTE le calcule déjà pour les roseaux, le généraliser.
  - *Jupes* : 6-10 cartes mortes en anneau au pied de chaque pin/bouleau, **dans la géométrie de la plante** (toujours à la bonne hauteur).
- **Casse** : budget instances (cf. 2.5) ; le contrat « luminance = hauteur » ne s'applique pas aux textures de litière (elles ne prennent pas la translucidité herbe — nouveau matériau ou flag) ; exclusion eau du gué à seuil serré (0.005 — z-fight documenté).
- **Vérif capture** : sous bosquet : bords de feuilles individuels avec liseré éclairé + ombre interne ; pente > 30° = sol décapé, creux = dérives ; **aucune tige de pin ne rencontre le sol en ligne nette** (diff A/B des jupes) ; la bande roulée de la route amincie mais jamais vide. 2,5 fps OK.

### 2.2 Sénescence par sommet (aDead) + rampe vert→jaune→tan→noir
- **Source** : plants.js:122-130, vegetation.js:261-288.
- **Change** : `bentCard.js` : émettre un float `dead` par sommet (`d = dead + deadTip·s^1.6 + 0.35·deadTip·|x|` — meurt par la pointe et les marges) ; plugins `wind.js`/`grass.js` : rampe 3 segments **passant par le jaune**, chroma ocre poussiéreux basse ; couplages : rough↑, translucidité ×(1-0.72·d). Utilisé par la litière (2.1), les frondes basses, les branches basses de pins (roussissement réaliste des épicéas).
- **Casse** : un attribut de plus dans les géométries fusionnées → toucher `accToMesh` et les déclarations vertex des 3 plugins. Économise un jeu de textures « mortes » peintes.
- **Vérif capture** : une fronde jaunissante sur une fougère par ailleurs verte ; litière multi-stades avec quelques jaunes vifs (pas uniformément brune). 2,5 fps OK.

### 2.3 Architecture par index de variante (tables pondérées)
- **Source** : plants.js:887-1077, 2180-2235.
- **Change** : `flora.js`/`grass.js` : les builders reçoivent `vi` **sémantique** (pas un tirage rng de plus). Tables : fougère `[divisée, nid, divisée, rampante, divisée]` ; buisson `[rosette, canne, rosette]` ; bouleau : phyllotaxie des grappes ; pin : 2-3 tables de verticilles différentes (couronne étroite / cassée / dissymétrique par vent dominant — très tempéré). Zéro draw call en plus (mêmes meshes, N variantes = N géométries déjà).
- **Casse** : coût en **contenu** (écrire les architectures), pas en machinerie. Piège documenté : `vi % n` avec table pondérée, pas modulo nu (sinon monoculture inversée).
- **Vérif capture** : dans un bosquet, deux **silhouettes** distinguables après normalisation d'échelle (imprimer 2 arbres au même pixel-height : contours différents). 2,5 fps OK.

### 2.4 Champ monde 1 m/texel + dapple analytique sous les bosquets (canopy-lite)
- **Source** : field.js (atlas monde), canopy.js:130-242 (transmittance), les 4 invariants **non négociables** : (a) distance **oblique** `slant = hUp/sin(elev)` partout, jamais la verticale ; (b) lookup de toit décalé `xz + sunStep.xy·hUp`, **jamais clampé**, analytique ; (c) masque de feuilles projeté sur la base **perpendiculaire au soleil** (constant le long d'un rayon) ; (d) pénombre = niveau de mip ∝ distance à l'occulteur, masque **seuillé avant mipping**, rampe glissante pour ré-étendre le contraste.
- **Change** :
  - Baker au boot une texture champ (RGBA16F, ~1 m/texel sur le corridor) : R = hauteur `height()`, G = hollow, B = **densité de couronnes** splattée depuis les positions réelles des 1900 pins + bosquets de bouleaux (= « même fonction pour le placement et l'éclairage » : ici c'est trivial, on splatte les instances), A = libre (humidité).
  - Nouveau plugin (priorité entre Deform 195 et Haze 210) sur sol + végétation + van : multiplier la **lumière directe seule** par la transmittance ; texture de grappes 512² seuillée-puis-mippée (bake EffectWrapper), `uSunU/uSunV` CPU avec fallback zénith, `uSunStep` packé en un seul vec3 (la raison du packing est documentée : impossible d'utiliser .xy sans .z).
  - Drift + shear lents (canopy.js:523-533, 8 lignes CPU).
- **Casse / contradictions** :
  - **NE PAS porter `cast:false`** sur les pins : la jungle retirait la canopée du shadow map parce que trois strates fermées rendaient l'ombre constante ; la colonnade de LA ROUTE est ouverte, le CSM 2 cascades garde les ombres de troncs (dures, correctes). Le dapple **complète** (taches douces des couronnes que 2 cascades 2048 ne résolvent pas), il ne remplace pas. Risque de double ombrage couronne (CSM du feuillage + dapple) : soit sortir le **feuillage seul** des casters (garder les troncs), soit calibrer le dapple sur les zones où le CSM est déjà flou. À trancher par A/B.
  - Textures StandardMaterial : le plugin doit multiplier la contribution directionnelle — en Babylon StandardMaterial il n'y a pas d'équivalent propre du wrap `RE_Direct` ; approximation acceptable pour la DA : moduler `color` par le masque × part directe estimée (`clamp(dot(N,L))`) à BEFORE_FOG. Moins juste que jungle-trail, suffisant en 32 bits.
  - Mipmaps requis sur la texture de grappes (autorisé : ce n'est pas une texture alpha-cut).
- **Vérif capture** : soleil bas fixé en debug : les taches au sol sont **décalées horizontalement** du pied des arbres (slant) ; bord d'une tache 12 m sous couronne visiblement plus doux qu'une tache 2 m sous branche basse (mesurer la largeur du gradient en px) ; les taches tombent **entre** les couronnes visibles au-dessus. Statique = 2,5 fps OK ; le drift ⚠︎cible (ou deux captures à 30 s : motif déplacé ~0.5 m).
- **Ordre** : après 1.1 (les couleurs interagissent) ; le champ monde sert aussi 2.1 (masque litière) → **baker le champ d'abord**, dapple ensuite.

### 2.5 Bucketing en tuiles + LOD binaire même-graine — PRÉREQUIS de la densité
- **Source** : vegetation.js:99-124, 1443-1641, plants.js:865-874.
- **Change** : `pines.js` (1900 instances, un seul mesh → bounding sphere de la taille du monde, jamais cullée) et `flora.js` : découper en tuiles de 48-64 m, un couple de meshes thin-instance par (tuile, variante), `setEnabled()` sur distance² au centre de tuile. Le tapis `grass.js` garde son re-semis à rayon (équivalent fonctionnel). LOD hi/lo : **même graine rejouée**, le flag lod ne touche QUE les comptes de segments de bentCard, jamais un appel rng (contrat écrit noir sur blanc — toute divergence = pop).
- **Casse** : multiplication des draw calls (2 → ~40-80 pour les pins) — c'est le prix de la densité ; mesurer la bascule taille de tuile/draw calls. Les couleurs d'instance (1.2) doivent être tirées par emplacement, pas par mesh (accord hi/lo).
- **Vérif** : compteur de l'inspecteur (draw calls, instances actives) — vérifiable même à 2,5 fps ; visuel : aucune disparition en bord de frustum, aucun pop de teinte au switch hi/lo. Perf réelle ⚠︎cible.
- **Ordre imposé** : **avant** de pousser la densité de 1.6 et d'ajouter 2.1. Sans ça, tripler les instances triple le coût de soumission de tout, tout le temps.

### 2.6 Texture MACRO anti-répétition sur le sol
- **Source** : groundTex.js:282-298 — « tiling is not defeated by better tiles » : c'est la **moyenne** de chaque tuile qu'il faut moduler.
- **Change** : petit bake (3 fbm décorrélés RGB) + 1 fetch et 1 multiply dans le matériau terrain/route (extension de `deformPlugin.js`, il a déjà les hooks fragment).
- **Casse** : rien. 1 fetch/pixel de sol.
- **Vérif capture** : route sur 200 m : moyenne locale par fenêtre de 50 px non constante (diff des moyennes ≥ 4 code values entre zones) ; la répétition du bombé/des bandes cesse d'être trouvable à l'œil. 2,5 fps OK.

### 2.7 widenThin (plancher de largeur écran)
- **Source** : vegetation.js:201-223. Sous 1 px, une carte alpha-testée devient **intermittente**, pas plus fine — avec nearest sans mips, LA ROUTE est le pire cas.
- **Change** : `bentCard.js` émet `aRib` (point d'axe par sommet) ; `wind.js`/`grass.js` vertex : `rib + off·clamp(need/w, 1, 2.4)` avec `need = ribMin·dist/uProj`, `uProj` recalculé par frame CPU. **Désactivé dans la passe d'ombre** (uRibMin=0) — LA ROUTE n'applique déjà pas ses plugins à la shadow map, donc gratuit.
- **Casse** : un attribut vec3 de plus partout ; interaction avec le vent (élargir AVANT le vent, comme la source).
- **Vérif capture** : herbe/aiguilles à 30 m : brins continus, comptage de fragments isolés (specks < 3 px) divisé par ≥ 3 en A/B. Statique OK à 2,5 fps mais le rasterizer logiciel peut sous-échantillonner différemment → confirmer ⚠︎cible.

---

## TIER 3 — cher, conditionnel, ou décision de DA à trancher

### 3.1 Revisiter l'impasse mipmaps : mips préservant la couverture + LOD_DAMP ⚠︎décision DA
- L'impasse consignée (« mipmaps sur alpha-cut = blocs verts volants ») est précisément le bug que la chaîne de mips à couverture constante **corrige** : le moyennage naïf de l'alpha détruit la couverture, la recherche binaire par niveau la restaure. La cause enregistrée de l'impasse est donc invalidée — mais **nearest + pas de mips fait partie du grain 32 bits**. Proposition à A/B : min filter trilinéaire avec mips à couverture constante + dilatation d'alpha par le mip (LOD_DAMP, 4 lignes), **mag filter nearest conservé** (le grain proche reste), quantification retro inchangée. Coût Babylon réel : upload de mips manuels (`_uploadDataToTextureDirectly` par niveau) + readback des DynamicTextures — moyen.
- **Vérif capture** : fraction de pixels « feuillage » par couronne normalisée par l'aire : écart ≤ 15 % entre 10 m et 40 m (aujourd'hui la couverture s'effondre) ; disparition du moucheté de moyenne distance. 2,5 fps OK pour le visuel ; si l'A/B tranche contre, **ne pas garder à moitié**.
- **Ordre** : indépendant, mais fait avant, il change la lecture de 1.6/2.1 à distance — idéalement trancher tôt.

### 3.2 Grade « stock + print » léger + métrique G-R
- **Source** : grade.js. À porter en deux morceaux inégaux :
  - **La métrique d'abord** (coût ½ journée, hors ligne) : script de capture qui diffe des paires de frames contrôlées (état gelé, un terme basculé) et sort G-R par zone. C'est l'outil qui valide 1.5 et calibre tout le reste. Brancher sur `src/ui/capture.js`.
  - **Le grade ensuite, minimal** : toe sur valeurs encodées (`c += 0.014·(1-c)⁴`, 1 ligne), crosstalk hautes lumières (désature le plein soleil — anti « rendu 3D »), split-tone borné ≤1. À insérer dans `retro.js` **avant** le lift/Bayer/quantification, **après** l'ACES du pipeline. Problème : le côté « stock » (CDL en linéaire) doit vivre AVANT l'ACES, qui est interne au DefaultRenderingPipeline → soit s'en passer (acceptable en DA 32 bits), soit sortir l'ACES du pipeline vers la passe custom (refactor moyen).
- **Casse** : ordre des passes (toggles F1 à préserver) ; le toe interagit avec le lift bleu existant (deux planchers → additionner = ombres laiteuses ; fusionner en un seul).
- **Contradiction assumée** : un grade filmique lourd se bat contre la quantification à 30 niveaux (banding sur les rampes retravaillées). Rester minimal.
- **Ordre imposé** : **après 1.5** — leçon explicite de jungle-trail : le grade ne fabrique pas la séparation verte, il la redistribue. Corriger matériaux d'abord, chiffres du grade ensuite (ils ont reculé plutôt que shipper l'inverse, commit a8842aa).
- **Vérif capture** : G-R canopée ensoleillée ≥ 4 code values après grade ; 1er percentile de la frame entre 3 et 8 code values (toe présent, pas de « lumière allumée derrière la caméra »). 2,5 fps OK.

### 3.3 Volumétrique raymarch demi-résolution ⚠︎cible obligatoire
- **Source** : atmosphere.js (marche 14-22 pas, IGN, sortie (inscatter, transmittance), upsample bilatéral **relatif** — le poids `exp(-|Δd|/(0.05·d+0.02))` est non négociable, c'est lui qui évite le halo autour de chaque silhouette).
- **Change** : gros morceau : PrePassRenderer pour la depth (pas le DepthRenderer : repasse complète d'une scène à 23 k instances), PostProcess custom demi-res, composite `c·vol.a + vol.rgb` avant retro. Gating par l'ouverture (plancher + pow — **un** faisceau fort, pas six moyens), auto-atténuation par la colonne, phase g=0.5 + plancher isotrope 0.055. Le masque de canopée de 2.4 sert de gate — c'est ce qui rend les deux cohérents (« un shaft et sa tache au sol = le même événement »).
- **Contradiction** : **remplace `shafts.js`** (les lames additives) — les garder ensemble double-compte la lumière. Prévoir le toggle : billboards = tier bas/WebGL, raymarch = tier haut. Les billboards restent la sortie de secours, ne pas les supprimer du code.
- **Casse** : WGSL (boucle bornée statiquement `for(i<32) if(i>=uSteps) break` — seule forme acceptée, coïncidence heureuse avec la contrainte de transpilation) ; minZ 0.2 (impasse dôme consignée) à revérifier avec la reconstruction viewPos.
- **Vérif** : ⚠︎cible uniquement (perf + depth + WebGPU). Critères : angle de la crête d'in-scatter ≈ élévation solaire (le bug « colonnes verticales » est LE piège documenté, deux fois) ; médiane/p90 du buffer d'in-scatter en régime « faisceaux » (~21/43), pas en plateau (~51/62 = fumée opaque) ; un seul faisceau dominant par cadre.
- **Ratio le plus faible du plan rapporté au coût — à faire en dernier, et seulement si 2.4 est en place.**

### 3.4 Raccord horizon : bas du dôme fondu dans la couleur de brume
- **Source** : sky.js:143-157. LA ROUTE fait déjà l'inverse (ridges tirées vers `hazeShared`) ; vérifier le cas symétrique : une ligne de visée au ras trouvant du **dôme brut** entre les troncs au point de fuite = « sortie éclairée » qui détruit l'enfermement. Ajouter au repaint du dôme (`weather.js` paintSky) : les 15° au-dessus de l'horizon fondus à 90 %+ vers `hazeShared` du moment.
- **Vérif capture** : caméra basse dans l'axe de la route : diff de teinte entre le dernier plan de brume et le ciel qui le touche ≤ 3 code values (aucune couture d'horizon). 2,5 fps OK. Coût : ~30 min — ratio excellent, classé Tier 3 uniquement parce qu'il dépend de l'état exact actuel (peut-être déjà correct : auditer une capture d'abord).

---

## NE PAS PORTER (et pourquoi)

| Item | Raison |
|---|---|
| **Contreforts (addRootRidge, butLobe)** | Botanique tropicale, 200 lignes, 5 réécritures, ne vaut que troncs au premier plan. Un pin n'a pas de contreforts. **Garder la leçon gratuite** : toute excroissance = lobe sur le profil du parent (une surface, une texture, zéro couture), normale différenciée de la surface réelle — s'applique aux racines de surface des pins si on en fait un jour. |
| **SSAO double-rayon** | SSAO explicitement écarté dans DECISIONS M7, et le raisonnement de jungle-trail confirme (depth d'alpha-test = normales bruitées). L'occlusion analytique 1.4 rend le service pour 4 ALU. |
| **Ciel physique Rayleigh/Mie + identité IBL/PMREM** | Contraire à la DA : le dôme à palettes 7 stops EST l'identité visuelle de LA ROUTE ; StandardMaterial n'intègre pas d'IBL GGX de toute façon. On ne prend que 1.1 (extinction CPU) et 3.4 (raccord horizon). Piège PMREM/NaN sans objet. |
| **Atlas de feuilles GLSL procédural 2048² (leafSurf, 350 lignes)** | Les DynamicTextures canvas sont l'identité et le bon niveau de détail pour du 32 bits. **Porter le PLAN, pas le shader** : organiser les textures canvas en 4×4 (colonnes = forme, lignes = individu ET usure croissante) et faire tirer `oldLeaf`/`freshLeaf` selon l'usage (litière vs pousse) — ça, c'est gratuit et ça sert 2.1/2.2. |
| **Mécanique d'injection Three (onBeforeCompile, #undef RE_Direct, customProgramCacheKey, depthMaterial aliasé)** | Three-only. Le principe (masquer la directe seule, fill dans l'ambiante, uniforms partagés par référence) est déjà couvert par MaterialPluginBase + le bus `sunShared`/`hazeShared` existant. |
| **`cast:false` sur la canopée** | Motivé par trois strates fermées (ombre = constante). Colonnade tempérée ouverte : les ombres CSM des pins sont exactement l'information que l'œil attend. Cf. réserve en 2.4. |
| **A2C désactivé** (la contre-recommandation) | Sans objet : LA ROUTE n'utilise pas A2C. Ne pas l'introduire non plus — même conclusion, scène majoritairement feuillage devant brume claire. |
| **Chaîne de mips CPU** si 3.1 est tranché contre | Ne se justifie que si on adopte les mips ; ne pas la porter « au cas où ». |
| **Cible HDR MSAA + tone map déplacé complet** | Le DefaultRenderingPipeline hdr fait déjà ce service à 90 % ; le refactor complet ne paie que si 3.3 est retenu (le raymarch a besoin de composer en linéaire avant tone map). Lié à 3.3, pas autonome. |

---

## SYNTHÈSE DES ORDRES IMPOSÉS

```
1.1 airmass ──────────────┐
1.5 translucidité ──► 3.2 grade (jamais l'inverse — leçon G-R)
2.5 bucketing ──► hausse de densité de 1.6 ──► 2.1 litière (budget instances)
champ monde (dans 2.4) ──► 2.4 dapple ET masque litière de 2.1
3.1 mips : trancher TÔT (change la lecture à distance de tout le reste)
2.4 dapple ──► 3.3 volumétrique (le gate partagé est ce qui rend le rai honnête)
3.3 volumétrique ⟂ shafts.js : exclusifs à l'exécution, pas au code
```

**Résumé vérifiabilité à 2,5 fps** : Tier 1 entier + 2.1/2.2/2.3/2.6 + critères visuels de 2.4/2.7/3.1/3.2/3.4 = captures statiques, OK en dev. Machine cible obligatoire : perf de 2.5, drift/shear de 2.4, rendu exact de 2.7, tout 3.3, et **toute validation WebGPU** (le dev tourne en `?gl` : chaque plugin nouveau doit être re-testé transpilé WGSL sur cible avant d'être considéré porté — l'échec est un maillage invisible sans erreur, cf. shafts).
