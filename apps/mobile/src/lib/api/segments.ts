import { apiFetch } from '@/lib/api/api-client';
import type { AdventureSegmentResponse } from '@ridenrest/shared';

// Façade API typée des segments (MOB-3.2 / AC1-2). Unique point d'accès HTTP au
// listing + upload de segments GPX — toujours via `apiFetch` (Bearer JWT +
// 401/refresh + déballage `{ data }`), jamais `fetch`/`axios` direct dans les hooks.
//
// ⚠️ Path SANS préfixe `/api` : `apiFetch` l'ajoute déjà (API_BASE =
// EXPO_PUBLIC_API_URL + /api ; api-client.ts). Aligné sur `adventures.ts`. Le
// contrôleur serveur est `@Controller('adventures/:adventureId/segments')`.
//
// ⚠️ `apiFetch` déballe déjà l'enveloppe `{ data }` : ne PAS re-déballer.

/** GET /adventures/:adventureId/segments → segments triés par `orderIndex`. */
export function listSegments(
  adventureId: string,
): Promise<AdventureSegmentResponse[]> {
  return apiFetch<AdventureSegmentResponse[]>(
    `/adventures/${adventureId}/segments`,
  );
}

/** Forme RN d'un fichier pour `FormData` — objet `{ uri, name, type }`, PAS un `File`/`Blob` web. */
export interface RnFile {
  uri: string;
  name: string;
  type: string;
}

/**
 * POST /adventures/:adventureId/segments (multipart/form-data) → segment créé
 * (`parseStatus: 'pending'`). En React Native, on `append` un **objet**
 * `{ uri, name, type }` (typings DOM `FormData` ne le connaissent pas → cast).
 * `apiFetch` détecte le `FormData` et n'injecte PAS de `Content-Type` (RN pose
 * lui-même le boundary multipart).
 */
export function uploadSegment(
  adventureId: string,
  file: RnFile,
  name?: string,
): Promise<AdventureSegmentResponse> {
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  if (name) form.append('name', name);
  return apiFetch<AdventureSegmentResponse>(
    `/adventures/${adventureId}/segments`,
    { method: 'POST', body: form },
  );
}

// --- MOB-3.3 : réordre / renommage / suppression ---
//
// ⚠️ Contrat reorder : le DTO serveur réel (`ReorderSegmentsDto`) attend
// **`orderedIds`** (pas `segmentIds`). Le `reorderSegmentsSchema` de
// `@ridenrest/shared` diverge (`{ segmentIds }`) — NE PAS s'en servir pour ce
// payload ; la source de vérité est le controller/DTO.

/**
 * PATCH /adventures/:adventureId/segments/reorder — payload `{ orderedIds }`.
 * `orderedIds` doit contenir EXACTEMENT tous les ids de segments de l'aventure
 * (même cardinalité, sans doublon ni inconnu), sinon 400. Le serveur réassigne
 * `orderIndex` puis recalcule les distances cumulées → renvoie la liste complète
 * triée et à jour.
 */
export function reorderSegments(
  adventureId: string,
  orderedIds: string[],
): Promise<AdventureSegmentResponse[]> {
  return apiFetch<AdventureSegmentResponse[]>(
    `/adventures/${adventureId}/segments/reorder`,
    { method: 'PATCH', body: JSON.stringify({ orderedIds }) },
  );
}

/**
 * PATCH /adventures/:adventureId/segments/:segmentId — payload `{ name }`.
 * Le serveur trim le nom (≤ 100). Renvoie le segment à jour.
 */
export function renameSegment(
  adventureId: string,
  segmentId: string,
  name: string,
): Promise<AdventureSegmentResponse> {
  return apiFetch<AdventureSegmentResponse>(
    `/adventures/${adventureId}/segments/${segmentId}`,
    { method: 'PATCH', body: JSON.stringify({ name }) },
  );
}

/**
 * DELETE /adventures/:adventureId/segments/:segmentId → `{ deleted: true }`.
 * Le serveur supprime la ligne + le fichier GPX puis recalcule les distances de
 * l'aventure (totalDistanceKm change) → l'écran invalide aussi `['adventures', id]`.
 */
export function deleteSegment(
  adventureId: string,
  segmentId: string,
): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(
    `/adventures/${adventureId}/segments/${segmentId}`,
    { method: 'DELETE' },
  );
}
