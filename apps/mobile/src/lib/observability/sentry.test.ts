import * as Sentry from '@sentry/react-native';
import type { ErrorEvent } from '@sentry/react-native';

import { initSentry, scrubGpsDeep, scrubGpsFromEvent } from './sentry';

// Tests Sentry (MOB-6.1 / T7, AC1 + AC3). `@sentry/react-native` est mocké globalement
// (`__mocks__/@sentry/react-native.js`). On pilote `EXPO_PUBLIC_SENTRY_DSN` au cas par cas.

const initMock = Sentry.init as unknown as jest.Mock;

describe('initSentry — key-gated (AC1)', () => {
  const original = process.env.EXPO_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    initMock.mockClear();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    else process.env.EXPO_PUBLIC_SENTRY_DSN = original;
  });

  it('no-op sans DSN → Sentry.init JAMAIS appelé (sûr dev/test/CI)', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    initSentry();
    expect(initMock).not.toHaveBeenCalled();
  });

  it('avec DSN → Sentry.init appelé une fois, beforeSend défini, sendDefaultPii=false', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://pub@o1.ingest.sentry.io/42';
    initSentry();
    expect(initMock).toHaveBeenCalledTimes(1);
    const opts = initMock.mock.calls[0][0];
    expect(opts.dsn).toContain('sentry.io');
    expect(typeof opts.beforeSend).toBe('function');
    expect(typeof opts.beforeBreadcrumb).toBe('function');
    expect(opts.sendDefaultPii).toBe(false);
  });
});

describe('scrub GPS (RGPD, AC3)', () => {
  it('supprime lat/lng/coords des extra / contexts / breadcrumbs', () => {
    const event = {
      extra: { latitude: 1, longitude: 2, foo: 'ok' },
      contexts: { device: { lat: 3, lng: 4, name: 'iPhone' } },
      breadcrumbs: [{ data: { coords: { lat: 5, lng: 6 }, msg: 'tap' } }],
    } as unknown as ErrorEvent;

    const out = scrubGpsFromEvent(event);

    expect(out.extra).toEqual({ foo: 'ok' });
    expect(out.contexts?.device).toEqual({ name: 'iPhone' });
    expect(out.breadcrumbs?.[0]?.data).toEqual({ msg: 'tap' });
  });

  it('scrubGpsDeep supprime récursivement et ignore les non-objets', () => {
    const obj = { a: { b: { longitude: 9, keep: 1 } }, position: { lat: 1 } };
    scrubGpsDeep(obj);
    expect(obj).toEqual({ a: { b: { keep: 1 } } });
    // Non-objets : pas de throw.
    expect(() => scrubGpsDeep(null)).not.toThrow();
    expect(() => scrubGpsDeep(42 as unknown)).not.toThrow();
  });
});
