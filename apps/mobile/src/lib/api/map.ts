import { apiFetch } from '@/lib/api/api-client';
import type { AdventureMapResponse } from '@ridenrest/shared';

// Façade API typée carte (MOB-4.1 / AC1). Unique point d'accès HTTP aux données
// carte d'une aventure — via `apiFetch` (Bearer JWT + 401/refresh + déballage
// `{ data }`), jamais `fetch`/`axios` direct.
//
// ⚠️ Path SANS préfixe `/api` : `apiFetch` l'ajoute déjà (api-client.ts). Le
// contrôleur serveur expose `GET /adventures/:id/map` → `{ data: AdventureMapResponse }`
// (segments + waypoints déjà simplifiés RDP côté serveur, ≤ 2000 pts). Backend
// epic 4 web 100 % livré — rien à recréer côté serveur.

/** GET /adventures/:adventureId/map → segments (+ waypoints) de la carte. */
export function getAdventureMapData(
  adventureId: string,
): Promise<AdventureMapResponse> {
  return apiFetch<AdventureMapResponse>(`/adventures/${adventureId}/map`);
}
