import { apiFetch } from '@/lib/api/api-client';
import type { WeatherForecast } from '@ridenrest/shared';

// Façade API météo — port iso du web. ⚠️ Path SANS `/api` (ajouté par `apiFetch`).
// Contrôleur serveur `@Controller('weather')` → `GET /weather`. Prévisions calées sur
// l'allure (departureTime + speedKmh) OU des départs par étape (`stageDepartures` JSON).
// RGPD : `segmentId` + km uniquement, jamais de GPS utilisateur (mode planning).

export interface GetWeatherParams {
  segmentId: string;
  departureTime?: string;
  speedKmh?: number;
  fromKm?: number;
  stageDepartures?: string;
}

export function getWeatherForecast(
  params: GetWeatherParams,
): Promise<WeatherForecast> {
  const search = new URLSearchParams({ segmentId: params.segmentId });
  if (params.departureTime) search.set('departureTime', params.departureTime);
  if (params.speedKmh != null) search.set('speedKmh', String(params.speedKmh));
  if (params.fromKm != null) search.set('fromKm', String(params.fromKm));
  if (params.stageDepartures)
    search.set('stageDepartures', params.stageDepartures);
  return apiFetch<WeatherForecast>(`/weather?${search.toString()}`);
}
