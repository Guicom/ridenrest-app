import { apiFetch } from '@/lib/api/api-client';
import type { DensityStatusResponse } from '@ridenrest/shared';

// Façade API densité d'hébergements — port iso du web. ⚠️ Paths SANS `/api` (ajouté
// par `apiFetch`). Contrôleur serveur `@Controller('density')`.

/** POST /density/analyze → lance l'analyse (HTTP 202, fire-and-forget + polling). */
export function triggerDensityAnalysis(
  adventureId: string,
  categories: string[],
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/density/analyze', {
    method: 'POST',
    body: JSON.stringify({ adventureId, categories }),
  });
}

/** GET /density/:adventureId/status → statut + progression + coverage gaps. */
export function getDensityStatus(
  adventureId: string,
): Promise<DensityStatusResponse> {
  return apiFetch<DensityStatusResponse>(`/density/${adventureId}/status`);
}
