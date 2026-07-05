import { apiFetch } from '@/lib/api/api-client';

// Façade API géo (reverse-geocoding) — port iso du web. ⚠️ Path SANS `/api` (ajouté
// par `apiFetch`). Le contrôleur serveur est `@Controller('geo')` → `GET /geo/reverse-city`.
// RGPD : ce sont des coordonnées de **corridor** (centre de plage de recherche), jamais
// la position GPS de l'utilisateur (mode planning).

export interface ReverseCityResult {
  city: string | null;
  postcode: string | null;
  state: string | null;
  country: string | null;
}

/** GET /geo/reverse-city?lat&lng → ville approximative (cache serveur Geoapify 7j). */
export function getReverseCity(
  lat: number,
  lng: number,
): Promise<ReverseCityResult> {
  const search = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  return apiFetch<ReverseCityResult>(`/geo/reverse-city?${search.toString()}`);
}
