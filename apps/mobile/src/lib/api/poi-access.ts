import {
  AccessResponseSchema,
  type AccessOrigin,
  type AccessResponse,
} from '@ridenrest/shared';

import { apiFetch } from '@/lib/api/api-client';

// Façade API « accès POI » (MOB-4.6 / T1, AC1-3). Unique point d'accès HTTP à
// `POST /pois/:id/access` — via `apiFetch` (Bearer JWT + 401/refresh + déballage
// `{ data }`), jamais `fetch` direct.
//
// ⚠️ Chemin SANS préfixe `/api` : `apiFetch` l'ajoute déjà (api-client.ts).
//
// 🔒 RGPD : le client envoie **TOUJOURS** `{ origin: { type: 'nearest-trace' } }` —
// jamais de `stage`, jamais de `profileOverride`, jamais de GPS. L'origine (point de
// trace le plus pertinent) est résolue **serveur** (`ST_ClosestPoint`).
//
// Divergence epic documentée : le profil de routage par aventure a été supprimé côté
// backend (poi-access 2.7) — l'accès utilise un profil BRouter fixe (`trekking`) et
// renvoie **plusieurs variantes**. On ne force donc jamais de profil ici.

/** Origine par défaut (et unique) envoyée au serveur — point de trace le plus proche. */
export const DEFAULT_ACCESS_ORIGIN: AccessOrigin = { type: 'nearest-trace' };

/**
 * POST /pois/:id/access → itinéraire d'accès cyclable réel vers un POI d'hébergement.
 * La réponse (`{ data }` déballée par `apiFetch`) est validée par `AccessResponseSchema`
 * (source de vérité partagée `@ridenrest/shared`) → discrimination `ok`/`fallback`/`error`.
 *
 * Lève `ApiError` sur échec HTTP (403/404/429/500) ou réseau — l'appelant (`useAccess`)
 * le mappe en `isError` sans crash.
 */
export async function computeAccess(
  poiId: string,
  origin: AccessOrigin = DEFAULT_ACCESS_ORIGIN,
): Promise<AccessResponse> {
  const raw = await apiFetch<unknown>(`/pois/${poiId}/access`, {
    method: 'POST',
    body: JSON.stringify({ origin }),
  });
  return AccessResponseSchema.parse(raw);
}
