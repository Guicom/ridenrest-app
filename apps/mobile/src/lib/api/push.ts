import { apiFetch } from '@/lib/api/api-client';

// Façade tokens push (MOB-6.2 / T5). ⚠️ Chemins SANS `/api` (ajouté par `apiFetch`).
// Contrôleur serveur `@Controller('push-tokens')`. RGPD : le token n'est pas une donnée de
// position — aucune coordonnée n'est envoyée.

export interface RegisterPushTokenBody {
  token: string;
  platform: 'ios' | 'android';
}

/** POST /push-tokens → enregistre (upsert) le token du device pour l'utilisateur courant. */
export function registerPushToken(body: RegisterPushTokenBody): Promise<unknown> {
  return apiFetch('/push-tokens', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * DELETE /push-tokens/:token → désinscrit le token (déconnexion, AC4). Le token contient
 * des caractères réservés (`[`/`]`) → `encodeURIComponent` avant de l'insérer dans l'URL.
 */
export function unregisterPushToken(token: string): Promise<unknown> {
  return apiFetch(`/push-tokens/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
}
