/**
 * `Promise.all`-like mapping with a bounded number of in-flight tasks.
 *
 * Motivation (2026-08-19) : le prefetch Google Places enchaînait ses Place Details **une par
 * une** (`for (const placeId of placeIds) await …`). Sur une bbox froide c'est ~50 à 90
 * allers-retours HTTP séquentiels → 10 à 25 s de latence pour la première recherche d'une zone,
 * ressentie comme « la recherche est longue » quel que soit l'état du toggle Overpass.
 *
 * On ne passe pas pour autant à un `Promise.all` non borné : les quotas Google et la charge DB
 * (chaque item fait aussi une requête PostGIS) veulent une limite.
 *
 * Les résultats sont renvoyés **dans l'ordre des entrées**. Une tâche qui rejette fait rejeter
 * l'ensemble : les appelants qui veulent une tolérance par item doivent capturer dans `fn`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const effectiveLimit = Math.max(1, Math.min(limit, items.length))

  const results = new Array<R>(items.length)
  let cursor = 0

  const workers = Array.from({ length: effectiveLimit }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}
