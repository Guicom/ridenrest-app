import { densityPollInterval } from '@/hooks/use-density';

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
