import { densityPollInterval } from '@/hooks/use-density';

// `use-density` importe la façade `@/lib/api/density` → `api-client` → `@/lib/auth/client`
// (@better-auth/expo, non transformable par Jest). On mocke la façade pour charger le
// helper pur `densityPollInterval` sans la stack native (sinon la suite ne *load* pas —
// défaut pré-existant du commit pivot MOB-4.3). `jest.mock` est hoisté au-dessus de l'import.
jest.mock('@/lib/api/density', () => ({
  getDensityStatus: jest.fn(),
  triggerDensityAnalysis: jest.fn(),
}));

// Polling densité (pur) : 3 s tant que pending/processing, arrêt sinon.

describe('densityPollInterval', () => {
  it('poll 3 s pendant pending/processing', () => {
    expect(densityPollInterval('pending')).toBe(3000);
    expect(densityPollInterval('processing')).toBe(3000);
  });
  it('arrêt (false) sinon', () => {
    expect(densityPollInterval('idle')).toBe(false);
    expect(densityPollInterval('success')).toBe(false);
    expect(densityPollInterval('error')).toBe(false);
    expect(densityPollInterval(undefined)).toBe(false);
  });
});
