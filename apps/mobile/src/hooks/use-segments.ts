import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { AdventureSegmentResponse } from '@ridenrest/shared';

import { listSegments, uploadSegment, type RnFile } from '@/lib/api/segments';

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
  const query = useQuery({
    queryKey: ['adventures', adventureId, 'segments'],
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
    // Ne pas baseliner sur une liste vide/indéfinie : un `[]` transitoire comme
    // snapshot précédent ferait passer un segment pré-existant `done` pour un
    // fast-parse au prochain poll (faux positif). Parité web 3.2 (`length > 0`).
    if (query.data && query.data.length > 0) prevRef.current = query.data;
  }, [query.data, onParsed, onParseError]);

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
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ['adventures', adventureId, 'segments'],
      }),
  });
}
