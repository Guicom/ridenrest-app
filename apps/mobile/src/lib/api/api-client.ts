import { authClient } from '@/lib/auth/client';

// Client API NestJS authentifié (MOB-2.1 / AC1). Wrapper `fetch` natif (jamais
// `axios`/`ky`) qui injecte `Authorization: Bearer <JWT>`. Pattern miroir du web
// (`apps/web/src/lib/api-client.ts`) : cache JWT en mémoire + `401 → refresh → 1 retry`.
//
// Deux base URLs distinctes :
//   - `EXPO_PUBLIC_API_URL`         → API NestJS (données)
//   - `EXPO_PUBLIC_BETTER_AUTH_URL` → serveur Better Auth (`apps/web`, endpoint token)
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010';
const BETTER_AUTH_URL =
  process.env.EXPO_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3011';

// JWT valide 15 min côté serveur. On met en cache avec un buffer de sécurité de
// 2 min (~13 min effectifs) pour éviter un round-trip token avant chaque appel.
const TOKEN_SAFETY_MARGIN_MS = 2 * 60 * 1000;
const TOKEN_MAX_CACHE_MS = 13 * 60 * 1000;

// Format d'erreur API : `{ error: { code, message, details } }` (ResponseInterceptor
// NestJS, identique web). `status: 0` + `code: 'NETWORK_ERROR'` = échec réseau (fetch rejeté).
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let cachedToken: string | null = null;
let cachedTokenExp = 0;
// Promesse de refresh **en vol**, partagée par les appels concurrents : évite N
// `GET /api/auth/token` simultanés au cold start (thundering herd) — review patch.
let inflightToken: Promise<string | null> | null = null;

/** Vide le cache JWT (appelé sur 401 ou logout). */
export function invalidateAuthTokenCache(): void {
  cachedToken = null;
  cachedTokenExp = 0;
}

/** Lit le claim `exp` (ms epoch) d'un JWT sans vérifier la signature. 0 si illisible. */
function parseJwtExp(token: string): number {
  try {
    const segment = token.split('.')[1] ?? '';
    // Les segments JWT sont en **base64url** (`-`/`_`, sans padding) : normaliser
    // avant décodage, sinon `atob` échoue sur des tokens valides → review patch.
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    );
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : // Fallback runtime sans `atob` (certains environnements Hermes).
          Buffer.from(padded, 'base64').toString('binary');
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Récupère un JWT frais depuis le serveur Better Auth (`GET /api/auth/token`),
 * authentifié par le cookie de session stocké (`authClient.getCookie()`).
 * En better-auth 1.5.5, on interroge l'endpoint token directement (pattern web 2.1).
 * Retourne `null` sur échec réseau ou réponse non-OK (jamais un throw).
 */
async function fetchFreshToken(): Promise<string | null> {
  const cookie = authClient.getCookie();
  let res: Response;
  try {
    res = await fetch(`${BETTER_AUTH_URL}/api/auth/token`, {
      headers: { ...(cookie ? { Cookie: cookie } : {}) },
    });
  } catch {
    // Réseau coupé : pas de token, sans propager le TypeError brut.
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { token?: string } | null;
  return data?.token ?? null;
}

/** Retourne un JWT (cache si valide). `forceRefresh` ignore le cache (retry 401). */
async function getAuthToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedToken && cachedTokenExp > Date.now()) {
    return cachedToken;
  }
  // Un seul refresh en vol, partagé par les appels concurrents (dedup).
  if (inflightToken) return inflightToken;
  inflightToken = (async () => {
    const token = await fetchFreshToken();
    if (token) {
      cachedToken = token;
      const exp = parseJwtExp(token);
      const cap = Date.now() + TOKEN_MAX_CACHE_MS;
      cachedTokenExp = exp > 0 ? Math.min(exp - TOKEN_SAFETY_MARGIN_MS, cap) : cap;
    } else {
      invalidateAuthTokenCache();
    }
    return token;
  })();
  try {
    return await inflightToken;
  } finally {
    inflightToken = null;
  }
}

async function requestWithAuth<T>(
  path: string,
  options: RequestInit | undefined,
  isRetry: boolean,
): Promise<T> {
  const isFormData =
    typeof FormData !== 'undefined' && options?.body instanceof FormData;
  // Sur retry, on force un refresh (le cache a été invalidé par le 401 précédent).
  const token = await getAuthToken(isRetry);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
  } catch (e) {
    // `fetch` rejette (réseau coupé/DNS) → contrat d'erreur typé, jamais un TypeError brut.
    throw new ApiError(
      e instanceof Error ? e.message : 'Network request failed',
      0,
      'NETWORK_ERROR',
    );
  }

  // 401 → vide le cache, refresh le token, **un** seul retry (pas de boucle).
  if (res.status === 401 && !isRetry) {
    invalidateAuthTokenCache();
    return requestWithAuth<T>(path, options, true);
  }

  // 401 **terminal** (après retry) : la session est morte côté serveur. On l'invalide
  // localement (`signOut`) pour que le guard `(app)/_layout` redirige vers login, au lieu
  // de laisser un état « zombie » (UI connectée, API 401). Décision review opt.1.
  if (res.status === 401 && isRetry) {
    invalidateAuthTokenCache();
    if (typeof authClient.signOut === 'function') {
      void authClient.signOut().catch(() => {});
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    throw new ApiError(
      body?.error?.message ?? `HTTP ${res.status}`,
      res.status,
      body?.error?.code,
      body?.error?.details,
    );
  }

  // 204 / corps vide (ex. logout, delete MOB-2.5) → pas de JSON à parser.
  if (res.status === 204) return undefined as T;

  // Déballe l'enveloppe ResponseInterceptor `{ data: ... }` (identique web). Corps vide
  // ou non-JSON sur un 2xx → `null`/payload brut plutôt qu'un throw non typé.
  const raw = (await res.json().catch(() => null)) as { data?: T } | null;
  return (raw && 'data' in raw ? raw.data : raw) as T;
}

/**
 * Appel authentifié à l'API NestJS. Injecte le Bearer JWT, gère `401 → refresh →
 * 1 retry` (puis `signOut` sur 401 terminal), et déballe `{ data }`. Lève `ApiError`
 * sur échec (y compris `status: 0` / `NETWORK_ERROR` si le réseau est coupé).
 */
export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return requestWithAuth<T>(path, options, false);
}
