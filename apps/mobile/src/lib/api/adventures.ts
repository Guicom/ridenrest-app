import { apiFetch } from '@/lib/api/api-client';
import type { AdventureResponse } from '@ridenrest/shared';

// Façade API typée des aventures (MOB-3.1 / AC1-4). Unique point d'accès HTTP au
// CRUD aventures — toujours via `apiFetch` (Bearer JWT + 401/refresh + déballage
// `{ data }`), jamais `fetch`/`axios` direct dans les hooks/écrans.
//
// ⚠️ Path SANS préfixe `/api` : `EXPO_PUBLIC_API_URL` pointe l'API NestJS
// directement (le contrôleur est `@Controller('adventures')`). Le web préfixe
// `/api` car il passe par un proxy Next — le mobile non.
//
// ⚠️ `apiFetch` déballe déjà l'enveloppe `{ data }` (api-client.ts) : ne PAS
// re-déballer. `GET /adventures` renvoie un array → `apiFetch<AdventureResponse[]>`
// retourne directement le tableau.

/** GET /adventures → liste des aventures de l'utilisateur courant. */
export function listAdventures(): Promise<AdventureResponse[]> {
  return apiFetch<AdventureResponse[]>('/adventures');
}

/** POST /adventures (body `{ name }`) → aventure créée (défauts serveur remplis). */
export function createAdventure(name: string): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>('/adventures', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/**
 * PATCH /adventures/:id (body `{ name }` UNIQUEMENT) → aventure mise à jour.
 * Le rename passe par le PATCH partiel (pas de RenameAdventureDto serveur) : on
 * n'envoie que `name` (startDate/avgSpeed/profil restent réservés à MOB-3.3).
 */
export function renameAdventure(
  id: string,
  name: string,
): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>(`/adventures/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

/** DELETE /adventures/:id → `{ deleted: true }` (cascade serveur : segments/GPX/caches). */
export function deleteAdventure(id: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/adventures/${id}`, {
    method: 'DELETE',
  });
}

/** GET /adventures/:id → détail (404 si non-owner). Utilisé par l'écran `[id]`. */
export function getAdventure(id: string): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>(`/adventures/${id}`);
}
