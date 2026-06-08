import { authClient } from '@/lib/auth/client';

import { apiFetch, invalidateAuthTokenCache } from './api-client';

// Isole l'api-client de la stack native : on mocke le wrapper `@/lib/auth/client`
// (qui importe @better-auth/expo + expo-secure-store) et on contrôle `getCookie`.
// `signOut` est mocké pour vérifier le bridge « 401 terminal → signOut » (review opt.1).
// `jest.mock` est hoisté au-dessus des imports → `authClient` est déjà la version mockée.
jest.mock('@/lib/auth/client', () => ({
  authClient: {
    getCookie: jest.fn(() => 'ridenrest.session_token=abc'),
    signOut: jest.fn(async () => ({ data: null })),
  },
}));

const mockSignOut = authClient.signOut as unknown as jest.Mock;

const TOKEN_URL = '/api/auth/token';

// JWT non signé minimal { exp } — suffisant pour exercer le cache (signature ignorée).
function makeJwt(expEpochSec: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64');
  return `${b64({ alg: 'none' })}.${b64({ exp: expEpochSec })}.sig`;
}
const futureExp = () => Math.floor(Date.now() / 1000) + 900; // +15 min

describe('apiFetch (MOB-2.1 / AC1 — client API NestJS authentifié)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    invalidateAuthTokenCache();
    mockSignOut.mockClear();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('injecte le Bearer JWT et met le token en cache (1 seul fetch token pour 2 appels)', async () => {
    const token = makeJwt(futureExp());
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes(TOKEN_URL)) {
        return { ok: true, status: 200, json: async () => ({ token }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: { ok: true } }) };
    });

    const r1 = await apiFetch<{ ok: boolean }>('/api/ping');
    const r2 = await apiFetch<{ ok: boolean }>('/api/ping');

    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });

    const tokenCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes(TOKEN_URL),
    );
    expect(tokenCalls).toHaveLength(1); // token mis en cache → un seul fetch

    const apiCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/api/ping'),
    );
    expect((apiCall![1] as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${token}`,
    });
  });

  it('401 → vide le cache, refresh le token, puis 1 seul retry réussi', async () => {
    const token = makeJwt(futureExp());
    let apiCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes(TOKEN_URL)) {
        return { ok: true, status: 200, json: async () => ({ token }) };
      }
      apiCalls += 1;
      if (apiCalls === 1) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'no' } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ data: { ok: true } }) };
    });

    const r = await apiFetch<{ ok: boolean }>('/api/ping');

    expect(r).toEqual({ ok: true });
    expect(apiCalls).toBe(2); // appel initial + 1 retry
    const tokenCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes(TOKEN_URL),
    );
    expect(tokenCalls).toHaveLength(2); // initial + refresh forcé sur retry
  });

  it('401 persistant → 1 seul retry puis lève ApiError(status=401), pas de boucle', async () => {
    const token = makeJwt(futureExp());
    let apiCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes(TOKEN_URL)) {
        return { ok: true, status: 200, json: async () => ({ token }) };
      }
      apiCalls += 1;
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'denied' } }),
      };
    });

    await expect(apiFetch('/api/ping')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(apiCalls).toBe(2); // initial + 1 retry uniquement
    // 401 terminal → bridge vers signOut (review opt.1) : invalide la session locale
    // pour que le guard `(app)/_layout` redirige vers login (pas d'état « zombie »).
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('réponse 2xx sans corps (204) → résout sans throw (ex. logout/delete)', async () => {
    const token = makeJwt(futureExp());
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes(TOKEN_URL)) {
        return { ok: true, status: 200, json: async () => ({ token }) };
      }
      // 204 : pas de corps → `res.json()` lèverait ; apiFetch doit court-circuiter.
      return {
        ok: true,
        status: 204,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      };
    });

    await expect(apiFetch('/api/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('erreur réseau (fetch rejeté) → ApiError typée (status 0, NETWORK_ERROR)', async () => {
    const token = makeJwt(futureExp());
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes(TOKEN_URL)) {
        return { ok: true, status: 200, json: async () => ({ token }) };
      }
      throw new TypeError('Network request failed');
    });

    await expect(apiFetch('/api/ping')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('propage l’erreur API typée { error: { code, message } } sur 4xx non-401', async () => {
    const token = makeJwt(futureExp());
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes(TOKEN_URL)) {
        return { ok: true, status: 200, json: async () => ({ token }) };
      }
      return {
        ok: false,
        status: 422,
        json: async () => ({ error: { code: 'VALIDATION', message: 'invalide' } }),
      };
    });

    await expect(apiFetch('/api/ping')).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION',
      message: 'invalide',
    });
  });
});
