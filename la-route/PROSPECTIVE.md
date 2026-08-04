# LA ROUTE — note de prospective

*« Un jour, la route. » — l'affiche punaisée dans le garage, `world/garage.js:210`*

---

## 1. L'ÂME DU JEU

Il y a une phrase peinte sur un mur de ce projet, et personne ne l'a mise là par
hasard. Dans `posterTexture()`, une route serpente vers un soleil bas, sous deux
mots en Georgia crème : **UN JOUR, LA ROUTE**. C'est une affiche de rêve différé,
accrochée dans un garage où un homme répare les voitures des autres.

Tout le reste en découle. Ce jeu n'est pas une démo de forêt. C'est **le jeu du
seuil franchi** : la porte sectionnelle qui s'enroule panneau par panneau,
l'exposition qui redescend de 1,3 à 1,0 comme un œil qui s'adapte, et le monde
qui était une affiche devient un lieu.

Et une fois dehors, le jeu ne demande rien. Pas de HUD, pas d'objectif, pas de
score. Alors qu'est-ce que le joueur vient y chercher ? La réponse est dans le
système le plus coûteux et le plus original du projet, celui que personne
n'aurait écrit pour une simple carte postale : **le buffer d'état du terrain**.
Un RGBA16F persistant, additif, jamais reconstruit, où la brûlure décroît en
`exp(-dt·0.0012)` — c'est-à-dire, en pratique, jamais. L'herbe se couche dans
les ornières et se relève à mesure que la terre guérit. Les feuilles tombées
restent quatre-vingt-dix secondes.

Quelqu'un a passé des semaines à faire en sorte que **le monde garde la trace du
passage du joueur**. Ce n'est pas une feature. C'est la thèse.

> **La promesse émotionnelle de LA ROUTE : la permission de partir, et la preuve
> d'être passé.**
>
> Le joueur vient y chercher un endroit où sa présence compte sans qu'on lui
> demande rien. Pas de conquête, pas de progression : de la présence, un objet
> aimé, et une trace.

Trois piliers, qui doivent arbitrer toute idée future :

| Pilier | Ce qui l'incarne aujourd'hui | Question de tri |
| --- | --- | --- |
| **Le départ** | le garage, la porte, l'affiche, l'esplanade | est-ce que ça rend le fait de partir plus grave ? |
| **L'objet aimé** | le van, le sapin désodorisant à ressort, le jerrican sanglé | est-ce que ça rend le van plus vivant ? |
| **La trace** | le buffer d'état, les ornières, les bermes, la brûlure | est-ce que le monde s'en souviendra ? |

Une idée qui ne coche aucune des trois n'a rien à faire dans ce jeu, même si
elle est belle.

---

## 2. QUINZE DIRECTIONS, DE LA PLUS PROCHE À LA PLUS LOINTAINE

### 1. Le carnet de la boîte à gants — *facile*

**La scène.** Tu t'arrêtes en haut de la côte, moteur coupé. Sur le tableau de
bord, une trappe. Tu l'ouvres : un carnet à spirale, papier jauni, écriture
penchée. Dernière page :

> *Quatrième jour. 31 km depuis le garage. Averse à la sortie du gué — j'ai
> attendu sous les pins. Feu allumé au bord du talus, la terre en garde le rond.
> Le van tire à droite depuis la tôle ondulée.*

Personne n'a écrit ça. C'est l'odomètre, le buffer, et cinq booléens.

**L'appui.** `van.st.odo` est déjà incrémenté à chaque frame dans
`vehicle/van.js:264` — **et n'est lu par personne aujourd'hui**. `fire.burning()`,
`rain.ease()`, `day.t()`, `garage.doorFrac()` sont déjà des accesseurs publics.
La page se peint exactement comme l'affiche du garage : une `DynamicTexture`, du
Georgia, un fond `#ded0b0`, un pli et deux bouts de scotch jauni
(`world/garage.js:164-222` est le patron complet).

**Pourquoi.** Le monde acquiert une voix sans qu'on lui donne un HUD. Des
scalaires deviennent un souvenir. Et surtout : le carnet est **l'infrastructure
narrative** de la moitié des directions suivantes.

### 2. La radio, le grondement, et le silence — *facile*

**La scène.** Tu roules. Tu tournes la molette du poste : du grésillement, puis
une nappe lo-fi et une mélodie pentatonique qui traîne, en ré mineur, avec un
delay long. Elle s'affaiblit quand la route monte sur la crête, revient dans la
vallée. Au bout de trois minutes elle se tait d'elle-même, et il ne reste que le
moteur — un sawtooth grave qui monte avec le régime — et le crissement du
gravier.

**L'appui.** **Ce code est déjà écrit, dans l'autre jeu.** `game.js:1772-1798` :
pad triangle 146,83 / 220 / 293,66 Hz, lowpass à 850, delay 0,42 s avec feedback
0,3, mélodie tirée d'une gamme de six notes toutes les 620 ms.
`game.js:1855-1873` : le moteur, sawtooth 52 Hz + square 26 Hz dans un lowpass
240. À porter tel quel, et à indexer sur `van.st.speed` et `van.st.odo`. La
réception module son gain par `roadQuery(x,z).y`. Et la molette a déjà son
emplacement : la planche de bord `vDash` (`van.js:149`).

**Pourquoi.** C'est le plus gros gisement d'émotion encore intact du projet — et
il coûte trois cents lignes déjà debout dans `game.js`. Un road movie muet est
une carte postale ; avec une radio qui s'éteint au bout de la vallée, c'est un
voyage.

### 3. Le long trajet — cent kilomètres en trois minutes — *facile*

**La scène.** Tu tiens la route, tu ne fais rien d'autre. La caméra recule très
lentement. Le temps s'accélère sans que tu le remarques : les ombres tournent,
une averse traverse en diagonale et s'en va, le soleil s'écrase, la nuit tombe,
les lucioles s'allument, et le ciel repâlit. Tu n'as jamais lâché
l'accélérateur. Puis tout ralentit, et tu es ailleurs.

**L'appui.** La vitesse du temps est déjà une variable ; il suffit de la coupler
à `van.st.speed`. La cellule météo sait déjà arriver et repartir toute seule. Le
seul travail est d'écrire une **dramaturgie**. Zéro asset, zéro shader.

### 4. Ce qui reste — *moyenne*

**La scène.** Deux heures plus tard, tu reviens au bivouac de l'autre soir. Le
cercle de six pierres est là, les bûches carbonisées aussi. La terre garde son
rond noir. Et le sillon que tu avais tracé en dérapant dans le virage est encore
lisible — adouci, l'herbe a repoussé au fond, la berme s'est affaissée, mais on
voit qu'il y a eu quelqu'un.

**L'appui.** C'est l'aboutissement du système central, et son angle mort actuel :
`terrain/deform.js` couvre **80 m** (`SIZE = 80`). Il faut une **couche lente** :
une grille CPU au pas de 2 m qui reçoit un double de chaque écriture. Les portes
d'entrée sont déjà uniques et propres — `addSplat`, `addWet`, `addScorch`
(`deform.js:118-120`). Et le semis de `vegetation/grass.js:169` est **déjà
déterministe par cellule**.

**Pourquoi.** Sans ça, le pilier « la trace » n'existe qu'à moins de quarante
mètres du pare-chocs. C'est la différence entre un effet et une mémoire.

### 5. Vingt-quatre poses — *moyenne*

**La scène.** Tu lèves l'appareil. L'image se resserre en 4:3, un cadre gravé, un
compteur en bas à droite : **24**. Tu attends. Le soleil descend entre deux
troncs, un chevreuil lève la tête, la brume monte du gué. *Clac.* Vingt-trois.
Le soir, dans le van, tu ouvres l'album : tes photos, quantifiées, tramées, un
peu jaunies, chacune légendée d'une date et d'un kilométrage. Il en reste six
pour tout le reste du voyage.

**L'appui.** Le tirage **est déjà la direction artistique du jeu** : `retro.js`
quantifie sur 26 paliers avec une matrice de Bayer 4×4 — une photo n'est rien
d'autre qu'un `readPixels` après cette passe.

**Pourquoi.** Un jeu contemplatif a besoin d'un **verbe**. Sans appareil,
regarder n'est pas un acte. Et une pellicule limitée est une dramaturgie
complète en une seule variable.

### 6. L'entretien — le mécano a un métier — *moyenne*

**La scène.** Depuis le gué, un cliquetis. Le sapin désodorisant bat une note de
travers. Tu t'arrêtes, tu descends, tu ouvres le capot : la courroie. Tu poses la
caisse à outils dans la poussière, tu changes la pièce prise sur l'étagère du
garage il y a quarante minutes, tu claques le capot, tu remontes. Le cliquetis a
disparu.

**L'appui.** L'usure se calcule **entièrement à partir de grandeurs déjà
présentes** : `van.st.odo`, `input.offroad`, et surtout `bumpV`, déjà calculé
chaque frame dans `main.js:459` — c'est littéralement la mesure des coups
encaissés par la suspension, et elle ne sert aujourd'hui qu'à faire trembler
l'image. Le jerrican est déjà modélisé et sanglé.

**Réserve.** **Le carburant ne doit jamais punir**. Réservoir large, panne sèche
jamais fatale. Il n'est pas là pour créer de la tension, il est là pour que
rouler *coûte* quelque chose — et ce qui ne coûte rien ne se savoure pas.

### 7. Dormir dans le van, et rêver — *moyenne*

**La scène.** Tu rentres, tu tires la porte latérale, tu t'allonges sur la
couchette. L'écran ne coupe pas au noir : le plafond du van reste là, le grain
grossit, la lumière bleuit, la pluie tambourine sur la tôle. Puis les formes
glissent. **Le rêve est le monde repeint** : les mêmes pins, mais dans une
palette impossible — six paliers de couleur au lieu de vingt-six, pas de sol, la
route qui flotte dans le vide, la porte du garage seule au milieu de nulle part,
ouverte.

**L'appui.** Le rêve n'exige **aucun asset nouveau** : les stops du dôme céleste
sont des données, `retro.cfg.levels` descend de 26 à 7, les `diffuseColor` sont
des objets mutables. Trente lignes pour une séquence qu'aucun autre système ne
peut donner.

### 8. Ce que la tôle retient — *moyenne à ambitieuse*

**La scène.** Au bout de six jours, tu fais le tour du van et tu ne le reconnais
plus tout à fait. La boue du gué a séché en croûte sur les bas de caisse. Une
branche a rayé le flanc gauche. Le lettrage **GARAGE MODERNE** s'est délavé du
côté sud, celui qui prend le soleil. Le pare-brise est constellé de moucherons.
Tu ne l'as jamais lavé. Tu ne le laveras pas.

**L'appui.** **La peinture du van est un canvas.** `paintTexture()`
(`van.js:20-43`) dessine tout dans une `DynamicTexture` 512² — un contexte 2D
**qu'on peut continuer à peindre en cours de partie**. Chaque événement devient
un coup de pinceau.

**Pourquoi.** Le van devient la **carte de votre voyage**, portée sur lui. Les
piliers « objet aimé » et « trace » fusionnés en un seul objet.

### 9. Une main levée dans la courbe — *moyenne*

**La scène.** Dans un virage, une silhouette assise sur un sac, le pouce mou. Tu
ralentis ou tu passes. Si tu t'arrêtes, il monte, il pose son sac entre ses
pieds. Il ne parle pas. Trois kilomètres plus loin, à un embranchement qui ne
mène nulle part, il tape deux fois sur le tableau de bord. Il descend, il lève la
main. Sur le siège, il a laissé une carte postale d'un endroit que tu n'as pas
encore vu.

**L'appui.** `character/driver.js` est déjà un rig complet dont la foulée est
calculée pour correspondre à la vitesse réelle. Un second `buildDriver()` coûte
quelques dizaines de lignes. Le siège passager existe, et `setSeated()` sait déjà
parenter un corps dans le repère de la caisse.

### 10. Le conducteur fantôme — *moyenne*

**La scène.** Tu es assis près du feu, la nuit. En contrebas, deux phares. Un van
descend la côte, exactement le tien, avec son sillage de poussière. Il passe sans
ralentir. C'est toi, il y a trois jours, dans l'autre sens.

**L'appui.** L'état du van tient en douze nombres. Enregistré à 10 Hz, une heure
pèse quelques centaines de kilo-octets. Le van est intégralement procédural : il
n'y a aucun asset à dupliquer.

### 11. Le village aux volets clos — *ambitieuse*

**La scène.** La route s'élargit, le gravier devient pavé. Un muret de pierres
sèches, une pompe à bras, quatre maisons aux volets fermés, un lavoir plein de
feuilles noires. Personne. À la nuit, une fenêtre est allumée à l'étage — celle
qui l'était déjà quand tu es arrivé.

**L'appui.** `world/garage.js` est la démonstration, en 530 lignes, qu'on sait
bâtir un lieu entier en boîtes, textures canvas et colliders. Un générateur de
village, c'est `buildGarage()` transformé en **grammaire**.

**Pourquoi.** L'absence est plus habitée que la présence.

### 12. La route ne revient jamais — *ambitieuse*

**La scène.** Tu franchis la crête et la route continue. Elle ne boucle pas. Au
vingtième kilomètre, une combe où les pins ont brûlé. Au soixante-dixième, la
forêt s'ouvre d'un coup sur des landes et le ciel devient énorme.

**L'appui.** **Tout est déjà analytique** : `baseHeight(x,z)` est une fonction
pure, infinie par construction. Le passage à l'infini est un **anneau glissant**
— exactement la mécanique déjà écrite deux fois dans ce dépôt (le recentrage
cranté de `deform.update()` et le `patchTick` en deux phases). Le vrai chantier
est le clipmap différé au M2.

**Pourquoi.** Tant que la route boucle, on **visite**. Quand elle avance, on
**part**.

### 13. L'hiver, puis un autre printemps — *ambitieuse*

**La scène.** Un matin, la première neige : elle ne tient pas partout — elle
tient **dans tes ornières**, au creux des bermes, à l'ombre du nord, et pas sur
la chaussée compactée. Dans la montée du gué, le van patine.

**L'appui.** La neige est une **relecture du buffer d'état** :
`deformPlugin.js:100-104` mélange déjà `baseColor` vers du charbon et vers du
bleu de flaque. L'adhérence est un seul nombre, `grip` (`van.js:256`).

**Pourquoi.** Ce n'est pas le joueur qui monte de niveau : c'est **le monde qui
traverse un automne**. La seule forme de progrès compatible avec cette âme, et
la plus émouvante, parce qu'elle est irréversible.

### 14. Les autres passages, et le kilomètre 412 — *folle*

**La scène.** Un matin, dans une combe où tu n'es jamais allé, deux ornières que
tu n'as pas faites. Trente mètres plus loin, un cercle de six pierres froid.
Sous une pierre, une photographie tramée d'un lieu que tu ne connais pas. Tu ne
croiseras jamais personne. Et en bas de la photo : *km 412, à l'aube*. Tu peux y
aller. C'est le même endroit, exactement, pour tout le monde.

**L'appui.** Une trace est un format minuscule : quelques kilo-octets par
bivouac, rejoués par les trois portes d'écriture. Aucun serveur temps réel. Et si
le monde est une fonction pure de `(graine, abscisse)` — et il l'est déjà —
**une coordonnée devient une carte postale**.

### 15. La fin du voyage — *folle (en jugement, pas en code)*

**La scène.** Très loin, la forêt s'arrête. La route descend vers quelque chose
de large et de vide. Le van s'arrête tout seul. Le carnet s'ouvre à côté de
l'album : les vingt-quatre photos, les kilomètres, les feux, les averses. Puis le
titre. Et le jeu propose de repartir du garage. Cette fois, tes ornières sont
déjà dans la cour.

**Pourquoi.** Un jeu qui parle de partir a besoin d'un endroit où le départ
**s'accomplit**. Sans fin, « partir » n'est qu'une boucle décorative.

---

## 3. TROIS SCÉNARIOS À CINQ ANS

### A. La carte postale technique

Quatre-vingt-dix secondes irréprochables. Le clipmap est vrai, le TAA existe, la
SSR sur les flaques est de retour, les 90 fps sont mesurés. Un article technique,
une conférence.

- **Exige** : un polissage obsessionnel plutôt que de la largeur.
- **Gagne** : une réputation, un objet fini en douze mois.
- **Perd** : personne n'y joue deux fois. Le buffer d'état n'aura jamais servi
  qu'à faire une jolie ornière que personne ne reverra.

### B. Le road movie contemplatif

Trois à huit heures. La route infinie, les saisons, le carnet, la pellicule, le
sommeil, l'entretien, deux ou trois rencontres, une fin.

- **Exige** : deux à quatre ans à temps partiel. Du son — non négociable. Et un
  **renoncement** : passer de « chaque pixel est AAA » à « tout est cohérent
  partout ».
- **Gagne** : un objet fini qui existera encore dans dix ans, un public réel,
  l'accomplissement de l'affiche.
- **Perd** : le web devient une contrainte ; la tentation du natif sera forte.

### C. L'instrument — un générateur de road movies

On dessine la spline, on règle l'heure et la saison, on lâche le van, on exporte
une séquence d'images.

- **Exige** : un éditeur, un rendu déterministe hors temps réel, une communauté.
- **Gagne** : **la contrainte de performance s'effondre** — un export à 6 fps
  produit une vidéo à 60. D'un coup on peut se payer le TAA, la SSR, la
  volumétrie.
- **Perd** : l'âme. On distribue un outil, pas un sentiment.

> **Avis :** B est le seul scénario où l'affiche du garage dit la vérité. A est
> un excellent chemin **vers** B si on le traite comme un jalon. C est un
> magnifique sous-produit de B — à faire *après*, jamais à la place.

---

## 4. LES TROIS À FAIRE ENSUITE

1. **La radio et le moteur** *(une à deux journées)* — le code existe déjà dans
   `game.js`, écrit par la même personne, et les entrées du filtre sont déjà
   calculées. C'est le plus grand écart effort/émotion de toute cette note.

2. **La mémoire longue des lieux** *(quelques jours)* — l'achèvement du système
   que le projet a payé le plus cher, aujourd'hui à quarante mètres de son but.
   Trois portes d'écriture, une ligne dans chacune.

3. **Le carnet de la boîte à gants** *(deux à trois journées)* — toutes les
   données existent déjà, nommées, publiques et inutilisées. Et c'est
   l'infrastructure narrative de l'album, du conducteur fantôme et de la fin.

> Si un seul pour demain matin : **la radio**. Six heures de portage, et à la fin
> de ces six heures, quelqu'un qui roule au crépuscule avec une nappe en ré
> mineur qui s'éteint dans la vallée ne verra plus jamais ce projet comme une
> démo technique.
