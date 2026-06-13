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
