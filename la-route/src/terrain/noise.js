/**
 * Bruit procédural déterministe (aucun Math.random) :
 * value noise bilinéaire + fBm, avec cisaillement directionnel du vent.
 */
function hash(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177 | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
}

export function fbm(x, z, octaves, lac, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}

/**
 * Bruit à CRÊTES. Le fBm ordinaire fait des bosses molles, toutes semblables,
 * qui de loin lisent comme un matelas. En repliant le bruit sur lui-même —
 * 1 - |2n-1| — les creux deviennent des arêtes : on obtient des croupes et des
 * vallons, c'est-à-dire du relief qu'on peut nommer. Le carré accentue les
 * crêtes et adoucit les fonds, ce qui est le sens d'écoulement d'un terrain
 * réel : les vallées s'évasent, les lignes de partage restent nettes.
 */
export function ridged(x, z, octaves, lac, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(vnoise(x * freq, z * freq) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}

/**
 * Le TRACÉ, points de contrôle. Il vit ici et non dans road.js parce que le
 * terrain en a besoin AVANT la route : c'est lui qui définit l'axe du fond de
 * vallée, donc l'endroit où les montagnes ne se lèvent pas. road.js l'importe
 * pour en faire sa spline — une seule source, sinon la route finirait par
 * grimper le flanc qu'on aura creusé pour elle.
 */
export const CTRL = [
  [0, 60], [0, 30], [0, 0], [-9, -35], [7, -70], [26, -105],
  [8, -140], [-22, -175], [-34, -215], [-30, -255], [-30, -290],
];

/**
 * Abscisse du fond de vallée à la cote z. Interpolation linéaire sur les points
 * de contrôle, pas de spline : on cherche un AXE, pas un tracé au centimètre,
 * et cette fonction est appelée des dizaines de milliers de fois par
 * remplissage de patch. Onze points parcourus au pire, sans allocation.
 */
export function valleyAxisX(z) {
  if (z >= CTRL[0][1]) return CTRL[0][0];
  const last = CTRL[CTRL.length - 1];
  if (z <= last[1]) return last[0];
  for (let i = 0; i < CTRL.length - 1; i++) {
    const a = CTRL[i], b = CTRL[i + 1];
    if (z <= a[1] && z >= b[1]) {
      const t = (a[1] - z) / (a[1] - b[1]);
      return a[0] + (b[0] - a[0]) * t;
    }
  }
  return 0;
}

/**
 * Les PRAIRIES. Renvoie 0 sous couvert, 1 en pleine clairière.
 *
 * Une forêt uniforme n'a pas d'échelle : sans trouée, l'œil ne voit jamais plus
 * loin que trente mètres et le relief qu'on vient de sculpter reste invisible.
 * Les clairières ne sont donc pas un ornement — ce sont elles qui donnent à
 * voir la montagne, et qui font que la forêt redevient un lieu quand on y
 * rentre.
 *
 * Bruit basse fréquence sur 120 m, seuillé haut. Le seuil est MESURÉ, pas
 * deviné : à cette échelle le fBm du projet ne s'étale pas de 0 à 1 mais de
 * 0,07 à 0,44, médiane 0,27 — le lissage bilinéaire ramène tout vers le
 * milieu. Un seuil posé à 0,52 « au jugé » n'ouvrait donc RIEN du tout, ce que
 * le premier relevé a montré immédiatement. À 0,27 sur une largeur de 0,10, un
 * cinquième du sol s'ouvre dont la moitié en pleine clairière, en taches larges
 * et molles avec une bordure d'une quarantaine de mètres.
 */
export function clearing(x, z) {
  const n = fbm(x / 120 + 5.1, z / 120 - 2.7, 2, 2.1, 0.5);
  return smooth(Math.min(1, Math.max(0, (n - 0.27) / 0.10)));
}

// vent dominant : les formes moyennes et fines s'étirent le long de cet axe
const WIND = { x: 0.85, z: 0.53 };

/**
 * Hauteur du sol forestier, sans la route (mètres).
 *
 * Le terrain avait trois octaves et paraissait plat, ce qui n'est pas une
 * contradiction : c'est une affaire d'ÉCHELLE VUE. Les grandes ondulations
 * font seize mètres de creux à crête mais sur quatre-vingt-quinze de long —
 * dans un champ de vision de trente mètres, ça ne fait qu'une pente douce, et
 * une pente uniforme se lit comme un plan. À l'autre bout, l'octave fine ne
 * pesait que cinquante centimètres sur cinq mètres et demi : quatre pour cent
 * de pente, sous le seuil du visible. Entre les deux, rien.
 *
 * Ce qui manquait, c'est l'échelle du REGARD — celle qu'on embrasse d'un coup
 * d'œil et qu'on traverse en dix secondes de marche. On l'ajoute deux fois :
 *   - des CROUPES en bruit à crêtes vers cinquante mètres, qui donnent au
 *     vallon des lignes de partage au lieu d'un fond de cuvette uniforme ;
 *   - des MAMELONS de deux mètres six sur onze mètres, qui font qu'on monte et
 *     qu'on descend en marchant, et sur lesquels la végétation conformée à la
 *     pente a enfin quelque chose à épouser.
 *
 * La grille porte 1,15 m par sommet : onze mètres de longueur d'onde, c'est
 * dix sommets par bosse, largement au-dessus du seuil de restitution. La route
 * échantillonne cette fonction puis lisse : elle ondulera avec le terrain, et
 * ses déblais-remblais se creuseront d'autant.
 */
export function baseHeight(x, z) {
  /* ---- LES MONTAGNES ----
   * Une montagne posée n'importe où rendrait la route impraticable : elle
   * l'escaladerait, puisqu'elle échantillonne ce terrain. On construit donc une
   * VALLÉE — un fond plat le long de l'axe du tracé, des flancs qui montent
   * au-delà. La route reste au fond, le relief se lève autour d'elle, et c'est
   * la même chose vue de la route ou vue d'en haut.
   *
   * Le fond fait 52 m de demi-largeur, de quoi loger la chaussée, ses talus,
   * les prairies et le ruisseau. Les flancs montent ensuite sur 140 m jusqu'à
   * 62 m de haut : à cette pente moyenne (24°) on peut encore y grimper, et
   * elle suffit à ce que la crête sorte du couvert et ferme l'horizon.
   *
   * Le relief des flancs n'est PAS un simple profil lissé : il est modulé par
   * le bruit à crêtes, à amplitude proportionnelle à la montée. Une pente
   * uniforme lit comme un talus de remblai ; ce sont les ravines et les épaules
   * qui la font lire comme une montagne. Au fond de vallée le terme s'annule,
   * donc la prairie reste une prairie. */
  const dAxe = Math.abs(x - valleyAxisX(z));
  const flanc = smooth(Math.min(1, Math.max(0, (dAxe - 52) / 140)));
  const mont = flanc * 62
    + flanc * (ridged(x / 78 - 4.2, z / 78 + 9.6, 3, 2.1, 0.5) - 0.42) * 34;
  // grandes ondulations de vallée
  const broad = (fbm(x / 95, z / 95, 3, 2.1, 0.5) - 0.5) * 16;
  // croupes et vallons : les lignes de partage du terrain
  const crest = (ridged(x / 52 + 11.3, z / 52 - 7.1, 2, 2.0, 0.5) - 0.42) * 7.0;
  // bosses moyennes, cisaillées par le vent
  const wx = x * WIND.x + z * WIND.z, wz = -x * WIND.z + z * WIND.x;
  const medium = (fbm(wx / 21, wz / 34, 3, 2.2, 0.5) - 0.5) * 6.2;
  // mamelons : l'échelle de la marche, celle qu'on sent sous les pieds
  const hum = (vnoise(x / 11 + 31.7, z / 11 - 17.3) - 0.5) * 2.6;
  // litière fine
  const fine = (fbm(x / 5.5, z / 5.5, 2, 2.3, 0.5) - 0.5) * 0.9;
  // la vallée s'incline doucement vers le nord (la route descend)
  return mont + broad + crest + medium + hum + fine - z * 0.012;
}
