import { computeAccess, DEFAULT_ACCESS_ORIGIN } from '@/lib/api/poi-access';
import { apiFetch } from '@/lib/api/api-client';

// MOB-4.6 / T1, T8 — façade `POST /pois/:id/access`. On mocke `api-client` (sinon la
// stack auth native `@/lib/auth/client` casse le load Jest) et on vérifie : envoi
// `nearest-trace` only (jamais de `profileOverride`/GPS), parse Zod ok/fallback/error,
// et propagation propre des erreurs HTTP (403/404/429).

jest.mock('@/lib/api/api-client', () => ({ apiFetch: jest.fn() }));

const mockApiFetch = apiFetch as jest.Mock;

const okResponse = {
  status: 'ok',
  distanceM: 1500,
  elevationGainM: 40,
  elevationLossM: 10,
  geometry: {
    type: 'LineString',
    coordinates: [
      [6, 45],
      [6.1, 45.1],
    ],
  },
  variants: [
    {
      entryPoint: [6, 45],
      distanceM: 1500,
      elevationGainM: 40,
      elevationLossM: 10,
      etaS: 360,
      geometry: {
        type: 'LineString',
        coordinates: [
          [6, 45],
          [6.1, 45.1],
        ],
      },
    },
  ],
  engineVersion: 'brouter-1.7.9',
  computedAt: '2026-06-27T10:00:00.000Z',
  source: 'db-cache',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('computeAccess', () => {
  it('POST /pois/:id/access avec origin nearest-trace, jamais de profileOverride', async () => {
    mockApiFetch.mockResolvedValue(okResponse);

    await computeAccess('poi-1');

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [path, options] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/pois/poi-1/access');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body).toEqual({ origin: { type: 'nearest-trace' } });
    expect(body.profileOverride).toBeUndefined();
    expect(body.origin.type).not.toBe('stage');
  });

  it('origine par défaut = nearest-trace (constante exportée)', () => {
    expect(DEFAULT_ACCESS_ORIGIN).toEqual({ type: 'nearest-trace' });
  });

  it('parse une réponse ok (Zod) — variants ≥ 1, usesMainRoad défaut false', async () => {
    mockApiFetch.mockResolvedValue(okResponse);

    const res = await computeAccess('poi-1');

    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.variants).toHaveLength(1);
      expect(res.variants[0].usesMainRoad).toBe(false);
      expect(res.variants[0].mainRoadDistanceM).toBe(0);
      expect(res.distanceM).toBe(1500);
    }
  });

  it('parse une réponse ok avec usesMainRoad: true et mainRoadDistanceM explicites', async () => {
    mockApiFetch.mockResolvedValue({
      ...okResponse,
      variants: [
        {
          ...okResponse.variants[0],
          usesMainRoad: true,
          mainRoadDistanceM: 620,
        },
      ],
    });

    const res = await computeAccess('poi-1');

    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.variants[0].usesMainRoad).toBe(true);
      expect(res.variants[0].mainRoadDistanceM).toBe(620);
    }
  });

  it('parse une réponse fallback (vol d’oiseau)', async () => {
    mockApiFetch.mockResolvedValue({
      status: 'fallback',
      fallbackReason: 'routing_failed',
      fallbackDistanceM: 800,
      source: 'computed-fresh',
    });

    const res = await computeAccess('poi-1');

    expect(res.status).toBe('fallback');
    if (res.status === 'fallback') {
      expect(res.fallbackDistanceM).toBe(800);
    }
  });

  it('parse une réponse error (défensive)', async () => {
    mockApiFetch.mockResolvedValue({ status: 'error', message: 'boom' });

    const res = await computeAccess('poi-1');

    expect(res.status).toBe('error');
    if (res.status === 'error') {
      expect(res.message).toBe('boom');
    }
  });

  it('rejette (sans crash) si l’API échoue — 403/404/429 propagés', async () => {
    mockApiFetch.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 }),
    );

    await expect(computeAccess('poi-1')).rejects.toMatchObject({ status: 403 });
  });

  it('rejette si la réponse est invalide (parse Zod)', async () => {
    mockApiFetch.mockResolvedValue({ status: 'ok' }); // champs requis manquants
    await expect(computeAccess('poi-1')).rejects.toBeDefined();
  });
});
