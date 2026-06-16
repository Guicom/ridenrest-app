import { apiFetch } from '@/lib/api/api-client';

// Façade profil utilisateur — port iso du web. ⚠️ Path SANS `/api` (ajouté par
// `apiFetch`). Contrôleur serveur `@Controller('profile')`. Le flag `overpassEnabled`
// (opt-in, défaut false en base) conditionne la recherche POI (Overpass complète Google).

export interface ProfileResponse {
  overpassEnabled: boolean;
  tier: 'free' | 'pro' | 'team';
}

/** GET /profile → préférences (dont `overpassEnabled`). */
export function getProfile(): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>('/profile');
}

/** PATCH /profile (body `{ overpassEnabled }`) → profil mis à jour. */
export function updateOverpassEnabled(
  overpassEnabled: boolean,
): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>('/profile', {
    method: 'PATCH',
    body: JSON.stringify({ overpassEnabled }),
  });
}
