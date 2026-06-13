import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdventureSegmentResponse } from '@ridenrest/shared';

import { ApiError, apiFetch } from '@/lib/api/api-client';

// Hooks data Strava (MOB-3.4 / AC1, AC2, AC5, AC6) — import d'ITINÉRAIRES (routes)
// Strava comme segment d'aventure. Server-state via TanStack Query v5.
//
// ⚠️ Routes ≠ Activités : le contrat NestJS livré (web 3.5 `done`) importe des
// routes (parcours planifiés, scope `read_all`), JAMAIS des activités
// (`activity:read_all`, hors ToS). On ne consomme que `/strava/routes`.
//
// `apiFetch` préfixe DÉJÀ le global prefix `/api` (api-client.ts) → chemins propres
// (`/strava/routes`, pas `/api/strava/routes`).

// `StravaRouteItem` n'est PAS (encore) exporté par `@ridenrest/shared` (vérifié :
// `grep StravaRouteItem packages/shared/src` → absent). On le déclare LOCALEMENT
// pour rester dans le périmètre mobile (pas de modif du package partagé). Si le web
// le promeut un jour dans shared, ce type sera remplacé par l'import.
//
// ⚠️ `id` est TOUJOURS une string : les IDs de route Strava dépassent
// `Number.MAX_SAFE_INTEGER` et le serveur les sérialise déjà en string. Ne JAMAIS
// `Number(id)`.
export interface StravaRouteItem {
  id: string;
  name: string;
  distanceKm: number;
  elevationGainM: number | null;
}

// Clés de traduction du namespace `strava.errors.*` (T5). `notConnected` n'est pas
// dans ce mapping : un 404 bascule l'UI sur l'état « non connecté » (pas un banner).
export type StravaErrorKey =
  | 'strava.errors.network'
  | 'strava.errors.rateLimit15'
  | 'strava.errors.rateLimitDaily'
  | 'strava.errors.stravaDown'
  | 'strava.errors.notConnected'
  | 'strava.errors.generic';

// Query key STRICTE de la liste de routes. Une page = une entrée de cache (pagination
// page-based, pas de curseur côté serveur). On NE l'invalide JAMAIS après un import
// (le cache route-list est indépendant des segments — anti-pattern documenté web 3.5).
export const stravaRoutesKey = (page: number) =>
  ['strava', 'routes', { page }] as const;

const STRAVA_ROUTES_STALE_TIME_MS = 1000 * 60 * 60; // 1h — miroir du TTL Redis serveur.

/**
 * Mappe une erreur (`ApiError` ou autre) vers une clé i18n affichable.
 *
 * - `status 0` / `NETWORK_ERROR` → clé réseau générique existante.
 * - `404` Strava/token absent → `notConnected` (l'appelant bascule sur l'état
 *   « non connecté »). Les autres 404 (aventure absente/non autorisée) restent
 *   génériques pour ne pas afficher un faux problème de compte Strava.
 * - `429` → discrimine via le message serveur (« demain » → quota journalier),
 *   sinon limite 15 min.
 * - `502` → Strava indisponible.
 * - autres → générique.
 */
export function mapStravaError(error: unknown): StravaErrorKey {
  if (error instanceof ApiError) {
    if (error.status === 0 || error.code === 'NETWORK_ERROR') {
      return 'strava.errors.network';
    }
    if (error.status === 404 && /strava|compte/i.test(error.message)) {
      return 'strava.errors.notConnected';
    }
    if (error.status === 429) {
      // Le serveur renvoie deux libellés distincts (15 min vs quota journalier).
      // On discrimine sur le message ; par défaut, limite 15 min.
      return /demain|aujourd|daily|today/i.test(error.message)
        ? 'strava.errors.rateLimitDaily'
        : 'strava.errors.rateLimit15';
    }
    if (error.status === 502) return 'strava.errors.stravaDown';
  }
  return 'strava.errors.generic';
}

/** `true` si l'erreur est un 404 (token Strava absent → état « non connecté »). */
export function isStravaNotConnectedError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    /strava|compte/i.test(error.message)
  );
}

export interface UseStravaRoutesOptions {
  /**
   * Lazy : la query ne se déclenche QUE quand l'appelant le demande
   * (`stravaConnected === true` ET sheet ouverte). Pas de prefetch au montage de
   * l'écran détail (économise le rate-limit Strava).
   */
  enabled: boolean;
}

/**
 * Liste paginée des itinéraires (routes) Strava de l'utilisateur (AC1).
 *
 * - queryKey stable `['strava','routes',{page}]` (page-based).
 * - `staleTime: 1h` (miroir du TTL Redis serveur — on NE réimplémente aucun cache).
 * - `retry: 1` (un `429` ne doit pas spammer Strava).
 */
export function useStravaRoutes(page: number, { enabled }: UseStravaRoutesOptions) {
  return useQuery({
    queryKey: stravaRoutesKey(page),
    queryFn: () => apiFetch<StravaRouteItem[]>(`/strava/routes?page=${page}`),
    enabled,
    staleTime: STRAVA_ROUTES_STALE_TIME_MS,
    retry: 1,
  });
}

/**
 * Importe une route Strava comme segment de l'aventure (AC2).
 *
 * - `POST /strava/routes/:id/import` body `{ adventureId }` → segment
 *   `parseStatus: 'pending'`, `source: 'strava'`, + enqueue parse GPX serveur.
 * - `onSuccess` invalide `['adventures', adventureId, 'segments']` → la liste de
 *   MOB-3.2 refetch le segment `pending` et le polling prend le relais.
 * - NE PAS invalider `['strava','routes',…]` (cache route-list indépendant).
 */
export function useImportStravaRoute(adventureId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stravaRouteId }: { stravaRouteId: string }) =>
      apiFetch<AdventureSegmentResponse>(
        `/strava/routes/${stravaRouteId}/import`,
        { method: 'POST', body: JSON.stringify({ adventureId }) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['adventures', adventureId, 'segments'],
      }),
  });
}
