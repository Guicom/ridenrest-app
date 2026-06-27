import { Linking } from 'react-native';

// MOB-4.5 — Liens externes (réservation hébergement + ouverture système).
//
// Façade de la fiche détail POI (`booking-links.tsx`). Les **builders** Booking.com /
// Airbnb sont réutilisés tels quels depuis `./booking-url` (déjà portés en MOB-4.3 pour
// le dropdown « Rechercher sur » du corridor) — pas de duplication (règle project-context).
//
// ⚠️ Parité web (`apps/web/src/lib/booking-url.ts`) : ce sont des liens de **recherche
// PUBLICS**. Aucun identifiant affilié (`aid`/`label`/env var) n'est ajouté.

export {
  buildAirbnbSearchUrl,
  buildBookingCoordUrl,
  buildBookingSearchUrl,
} from './booking-url';

/**
 * Extrait la ville des tags OSM `rawData` d'un POI (parité web `extractCityFromOsmRawData`).
 * Priorité : `addr:city` > `addr:town` > `addr:village`. Renvoie aussi le code postal
 * (non utilisé par le builder Booking aujourd'hui — parité de signature web).
 */
export function extractCityFromOsmRawData(
  rawData?: Record<string, unknown>,
): { city: string | null; postcode: string | null } {
  if (!rawData) return { city: null, postcode: null };
  const city =
    (typeof rawData['addr:city'] === 'string' ? rawData['addr:city'] : undefined) ??
    (typeof rawData['addr:town'] === 'string' ? rawData['addr:town'] : undefined) ??
    (typeof rawData['addr:village'] === 'string' ? rawData['addr:village'] : undefined) ??
    null;
  const postcode = typeof rawData['addr:postcode'] === 'string' ? rawData['addr:postcode'] : null;
  return { city, postcode };
}

/** Résultat d'une tentative d'ouverture — jamais d'exception propagée à l'UI. */
export interface OpenExternalUrlResult {
  ok: boolean;
  error?: unknown;
}

/**
 * Ouvre une URL externe via `Linking.openURL` (app native si installée, sinon
 * navigateur système — AC2/AC5). Tout échec (`openURL` rejette) est **capturé** et
 * renvoyé en `{ ok: false }` exploitable par l'UI : **jamais** de throw non géré.
 *
 * Note : pas de garde `canOpenURL` ici — pour des schémas `http(s)` il est toujours
 * `true` (et sur Android exige des `<queries>` dans le manifeste pour les schémas
 * custom). Le `try/catch` autour de `openURL` est le chemin robuste et suffisant.
 */
export async function openExternalUrl(
  url: string,
): Promise<OpenExternalUrlResult> {
  try {
    await Linking.openURL(url);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
