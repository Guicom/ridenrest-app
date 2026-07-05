import { apiFetch } from '@/lib/api/api-client';
import type { AdventureStageResponse } from '@ridenrest/shared';

// Façade API étapes (stages) — port iso du web. ⚠️ Paths SANS `/api` (ajouté par
// `apiFetch`). Contrôleur serveur monté sous `/adventures/:adventureId/stages`.
// Phase 1 : seul `getStages` est consommé (dropdown « À partir » de la carte Recherche).
// Le CRUD complet (create/update/delete) est livré pour la carte Étapes (Phase 2).

export interface CreateStageInput {
  name: string;
  endKm: number;
  color: string;
  departureTime?: string | null;
  speedKmh?: number | null;
  pauseHours?: number | null;
}

export type UpdateStageInput = Partial<
  Omit<CreateStageInput, 'name' | 'endKm' | 'color'>
> & {
  name?: string;
  endKm?: number;
  color?: string;
};

/** GET /adventures/:id/stages → étapes ordonnées de l'aventure. */
export function getStages(
  adventureId: string,
): Promise<AdventureStageResponse[]> {
  return apiFetch<AdventureStageResponse[]>(
    `/adventures/${adventureId}/stages`,
  );
}

/** POST /adventures/:id/stages → étape créée. */
export function createStage(
  adventureId: string,
  data: CreateStageInput,
): Promise<AdventureStageResponse> {
  return apiFetch<AdventureStageResponse>(`/adventures/${adventureId}/stages`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** PATCH /adventures/:id/stages/:stageId → étape mise à jour. */
export function updateStage(
  adventureId: string,
  stageId: string,
  data: UpdateStageInput,
): Promise<AdventureStageResponse> {
  return apiFetch<AdventureStageResponse>(
    `/adventures/${adventureId}/stages/${stageId}`,
    { method: 'PATCH', body: JSON.stringify(data) },
  );
}

/** DELETE /adventures/:id/stages/:stageId. */
export function deleteStage(
  adventureId: string,
  stageId: string,
): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(
    `/adventures/${adventureId}/stages/${stageId}`,
    { method: 'DELETE' },
  );
}
