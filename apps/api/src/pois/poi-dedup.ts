/**
 * Dédoublonnage des POI Google Places contre les POI déjà en cache pour un segment.
 *
 * Contexte (bug 2026-08-19) : le garde-fou d'origine était `hasNearbyPoi(100m)`, agnostique
 * de la source et purement géométrique. Comme le prefetch Google insère les 4 calques en
 * parallèle, il dédoublonnait les POI Google **entre eux** : dans un village, 8 hébergements
 * distincts sur 10 étaient supprimés (« Haus zum Falken » vs « Villa Hallau » à 80 m), et le
 * survivant dépendait de l'ordre d'exécution → résultats non déterministes d'un env à l'autre.
 *
 * Règle actuelle : on ne dédoublonne QUE cross-source (Google ↔ OSM/Overpass, où le même
 * lieu existe réellement deux fois) ET seulement si les noms se ressemblent. Deux POI Google
 * ne peuvent pas être des doublons : `place_id` est unique et l'index unique
 * `(segment_id, external_id, source)` s'en charge.
 */

/** Rayon de recherche des voisins candidats au dédoublonnage (dérive de coordonnées OSM). */
export const POI_DEDUP_RADIUS_M = 100

/**
 * Mots trop génériques pour porter une identité : deux « Gasthaus » différents à 80 m ne sont
 * pas le même établissement. Ils sont retirés avant comparaison des jetons.
 */
const GENERIC_TOKENS = new Set([
  // FR
  'hotel', 'hotels', 'auberge', 'gite', 'gites', 'chambre', 'chambres', 'hote', 'hotes',
  'camping', 'refuge', 'restaurant', 'pension', 'residence', 'maison', 'appartement',
  'appartements', 'studio', 'logement', 'ferme', 'chalet', 'villa',
  // DE
  'gasthaus', 'gasthof', 'ferienwohnung', 'ferienwohnungen', 'ferienhaus', 'haus', 'hof',
  'zimmer', 'monteurzimmer', 'campingplatz', 'jugendherberge', 'berghaus', 'huette',
  // EN
  'house', 'apartment', 'apartments', 'room', 'rooms', 'guest', 'guesthouse', 'hostel',
  'inn', 'lodge', 'motel', 'resort', 'stay', 'holiday', 'bed', 'breakfast', 'campsite',
  // articles / prépositions
  'der', 'die', 'das', 'den', 'dem', 'zum', 'zur', 'auf', 'and', 'the', 'les', 'des',
  'aux', 'chez', 'sur', 'sous', 'avec',
])

/** Minuscules, sans accents, sans ponctuation, espaces normalisés. */
export function normalizePoiName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Jetons porteurs d'identité (≥ 3 caractères, hors mots génériques). */
function significantTokens(normalized: string): string[] {
  return normalized
    .split(' ')
    .filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t))
}

/**
 * Deux noms désignent-ils probablement le même établissement ?
 *
 * Vrai si : noms normalisés identiques, OU inclusion d'un nom normalisé dans l'autre
 * (≥ 6 caractères, cas « Hôtel Bellevue » ⊂ « Hôtel Bellevue Restaurant »), OU recouvrement
 * des jetons significatifs (Jaccard ≥ 0,5 avec au moins un jeton commun).
 *
 * Faux dès qu'aucun jeton porteur d'identité n'est partagé — c'est le cas nominal de deux
 * établissements distincts dans le même village.
 */
export function isLikelySamePlace(nameA: string, nameB: string): boolean {
  const a = normalizePoiName(nameA)
  const b = normalizePoiName(nameB)
  if (!a || !b) return false
  if (a === b) return true

  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length >= 6 && longer.includes(shorter)) return true

  const tokensA = new Set(significantTokens(a))
  const tokensB = new Set(significantTokens(b))
  if (tokensA.size === 0 || tokensB.size === 0) return false

  let shared = 0
  for (const token of tokensA) if (tokensB.has(token)) shared++
  if (shared === 0) return false

  const union = tokensA.size + tokensB.size - shared
  return shared / union >= 0.5
}
