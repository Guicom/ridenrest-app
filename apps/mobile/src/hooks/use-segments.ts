import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { AdventureSegmentResponse } from '@ridenrest/shared';

import {
  deleteSegment,
  listSegments,
  renameSegment,
  reorderSegments,
  uploadSegment,
  type RnFile,
} from '@/lib/api/segments';
import { ACCESS_QUERY_PREFIX } from '@/hooks/use-access';

// Query key STRICTE partagée par toute la feature segments (MOB-3.2 + 3.3). Une
// SEULE clé — réutilisée par `useSegments` (lecture/polling) et les mutations
// reorder/rename/delete (3.3). Ne JAMAIS en créer une seconde.
const segmentsKey = (adventureId: string) =>
  ['adventures', adventureId, 'segments'] as const;

// Hooks data des segments d'une aventure (MOB-3.2 / AC1-3). Server-state =
// TanStack Query v5.
//
// Query key STRICTE `['adventures', adventureId, 'segments']` (cohérence web 3.2 —
// c'est LA query pollée). Étendue par MOB-3.3 (réordre/remplacement/suppression).
//
// Pause hors-foreground : pilotée par `focusManager` (use-app-state-refetch, monté
// au root MOB-2.1). TanStack Query v5 suspend `refetchInterval` quand la query
// n'est pas « focused » → polling en pause en background, reprise au retour
// `active`, SANS code supplémentaire ici.

const SEGMENTS_POLL_INTERVAL_MS = 3000;

/**
 * Vrai si au moins un segment est en cours de parsing (`pending`/`processing`).
 * Pur et testable isolément (parité web 3.2 `shouldPoll`).
 */
export function isParsing(segments?: AdventureSegmentResponse[]): boolean {
  return !!segments?.some(
    (s) => s.parseStatus === 'pending' || s.parseStatus === 'processing',
  );
}

/**
 * Intervalle de polling : 3000 ms tant qu'un segment parse, `false` sinon
 * (arrêt auto — AC2). Pur, branché sur `refetchInterval`.
 */
export function segmentsPollInterval(
  segments?: AdventureSegmentResponse[],
): number | false {
  return isParsing(segments) ? SEGMENTS_POLL_INTERVAL_MS : false;
}

/**
 * Détecte les segments ayant transité (`pending`/`processing`) → `done`/`error`
 * entre deux snapshots. Pur (parité web 3.2) → testable isolément, hors React.
 */
export function detectParseTransitions(
  prev: AdventureSegmentResponse[] | undefined,
  cur: AdventureSegmentResponse[] | undefined,
): { parsed: AdventureSegmentResponse[]; errored: AdventureSegmentResponse[] } {
  const parsed: AdventureSegmentResponse[] = [];
  const errored: AdventureSegmentResponse[] = [];
  if (cur && prev) {
    for (const seg of cur) {
      const before = prev.find((p) => p.id === seg.id);
      if (!before) {
        // Segment apparu entre deux snapshots (`prev` est défini → pas le 1er
        // fetch) ET déjà terminé : le worker BullMQ a fini le parsing avant qu'on
        // l'observe en `pending`/`processing` (fast-parse). Sans ce cas, le bandeau
        // de fin n'apparaîtrait jamais pour les GPX rapides à parser. Parité web 3.2
        // (`!prevSeg` → notif). Un segment encore `pending`/`processing` n'est PAS
        // notifié ici (il le sera à sa transition au prochain poll).
        if (seg.parseStatus === 'done') parsed.push(seg);
        else if (seg.parseStatus === 'error') errored.push(seg);
        continue;
      }
      const wasParsing =
        before.parseStatus === 'pending' ||
        before.parseStatus === 'processing';
      if (!wasParsing) continue;
      if (seg.parseStatus === 'done') parsed.push(seg);
      else if (seg.parseStatus === 'error') errored.push(seg);
    }
  }
  return { parsed, errored };
}

export interface UseSegmentsOptions {
  /** Appelé quand un segment passe (`pending`/`processing`) → `done`. */
  onParsed?: (segment: AdventureSegmentResponse) => void;
  /** Appelé quand un segment passe (`pending`/`processing`) → `error`. */
  onParseError?: (segment: AdventureSegmentResponse) => void;
}

/**
 * Liste des segments + polling conditionnel + détection de fin de parsing.
 *
 * - `refetchInterval` : 3000 ms tant qu'un segment parse, `false` sinon (arrêt
 *   auto du polling — AC2).
 * - `staleTime: 0` : force un refetch au montage pour éviter un `pending` périmé
 *   au retour sur l'écran (parité web 3.2 AC5). Override local du défaut global
 *   `30_000` (query-client.ts).
 * - Détection de transition via `useRef` (PAS `useState` → aucun rerender sur
 *   écriture du snapshot, anti-pattern web 3.2) : déclenche `onParsed` /
 *   `onParseError` que le composant utilise pour le feedback in-app (AC2/AC3).
 */
export function useSegments(adventureId: string, opts?: UseSegmentsOptions) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: segmentsKey(adventureId),
    queryFn: () => listSegments(adventureId),
    enabled: Boolean(adventureId),
    refetchInterval: (q) => segmentsPollInterval(q.state.data),
    staleTime: 0,
  });

  // Snapshot précédent en ref (pas d'état → pas de rerender à l'écriture).
  const prevRef = useRef<AdventureSegmentResponse[] | undefined>(undefined);
  const onParsed = opts?.onParsed;
  const onParseError = opts?.onParseError;

  useEffect(() => {
    const { parsed, errored } = detectParseTransitions(
      prevRef.current,
      query.data,
    );
    parsed.forEach((s) => onParsed?.(s));
    errored.forEach((s) => onParseError?.(s));
    if (parsed.length > 0 || errored.length > 0) {
      void qc.invalidateQueries({ queryKey: ['adventures', adventureId] });
    }
    // Ne pas baseliner sur une liste vide/indéfinie : un `[]` transitoire comme
    // snapshot précédent ferait passer un segment pré-existant `done` pour un
    // fast-parse au prochain poll (faux positif). Parité web 3.2 (`length > 0`).
    if (query.data && query.data.length > 0) prevRef.current = query.data;
  }, [adventureId, qc, query.data, onParsed, onParseError]);

  return query;
}

/**
 * Upload d'un segment GPX (multipart). Au succès, invalide la query segments
 * (le nouveau segment `pending` apparaît, puis le polling prend le relais).
 * Expose `isPending` (→ état loading de l'uploader), `error`, `reset`.
 */
export function useUploadSegment(adventureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { file: RnFile; name?: string }) =>
      uploadSegment(adventureId, vars.file, vars.name),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: segmentsKey(adventureId),
      });
      qc.invalidateQueries({ queryKey: ['adventures', adventureId] });
      // Trace modifiée (segment ajouté) → accès POI périmés (MOB-4.7 / T4, AC4).
      qc.invalidateQueries({ queryKey: ACCESS_QUERY_PREFIX });
    },
  });
}

/**
 * Réordre OPTIMISTE des segments (MOB-3.3 / AC1). Le drag termine en produisant
 * `orderedIds` → on réordonne le cache localement AVANT la réponse (UX instantanée),
 * snapshot conservé pour rollback `onError`, et invalidation `onSettled` pour
 * resynchroniser sur la liste recalculée par le serveur (cumuls/total).
 *
 * ⚠️ On n'écrit PAS de `cumulativeStartKm` optimiste (ce serait recalculer une
 * distance côté UI — anti-pattern proscrit) : seul l'ORDRE est optimiste, plus un
 * `orderIndex` local cohérent. Les distances vraies arrivent à l'invalidation.
 */
export function useReorderSegments(adventureId: string) {
  const qc = useQueryClient();
  const key = segmentsKey(adventureId);

  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderSegments(adventureId, orderedIds),

    onMutate: async (orderedIds) => {
      // Évite qu'un refetch en vol écrase l'update optimiste.
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AdventureSegmentResponse[]>(key);
      if (previous) {
        const byId = new Map(previous.map((s) => [s.id, s]));
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((s): s is AdventureSegmentResponse => Boolean(s))
          .map((s, i) => ({ ...s, orderIndex: i }));
        qc.setQueryData(key, reordered);
      }
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      // Rollback vers le snapshot pré-mutation. L'écran affiche l'erreur
      // (ErrorBanner i18n) en lisant `isError` — jamais d'Alert.alert ici.
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },

    onSettled: () => {
      // Resynchronise sur le serveur (cumuls/total recalculés côté API).
      qc.invalidateQueries({ queryKey: key });
      // Trace fusionnée réordonnée → accès POI périmés (MOB-4.7 / T4, AC4).
      qc.invalidateQueries({ queryKey: ACCESS_QUERY_PREFIX });
    },
  });
}

/**
 * Renomme un segment (MOB-3.3 / AC3). Invalidation simple au succès (le nom ne
 * touche pas les distances) — l'optimisme n'est pas requis ici. `onError` → l'écran
 * affiche un `ErrorBanner` i18n.
 */
export function useRenameSegment(adventureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { segmentId: string; name: string }) =>
      renameSegment(adventureId, vars.segmentId, vars.name),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: segmentsKey(adventureId) }),
  });
}

/**
 * Supprime un segment (MOB-3.3 / AC2). Invalide DEUX clés : la liste des segments
 * ET `['adventures', adventureId]` — car la suppression déclenche un recompute
 * serveur (`totalDistanceKm` de l'aventure change). `onError` → `ErrorBanner` i18n.
 */
export function useDeleteSegment(adventureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (segmentId: string) => deleteSegment(adventureId, segmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: segmentsKey(adventureId) });
      qc.invalidateQueries({ queryKey: ['adventures', adventureId] });
      // Trace modifiée (segment supprimé) → accès POI périmés (MOB-4.7 / T4, AC4).
      qc.invalidateQueries({ queryKey: ACCESS_QUERY_PREFIX });
    },
  });
}
