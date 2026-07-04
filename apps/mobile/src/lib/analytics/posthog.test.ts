/* eslint-disable @typescript-eslint/no-require-imports -- `jest.resetModules()` impose un
   `require()` dynamique post-reset (le singleton + le client de la façade sont ré-évalués
   ensemble) ; un import statique serait hoisté avant le reset et capturerait l'ancien module. */
// Tests bootstrap PostHog (MOB-6.1 / T7, AC2 + AC4). `posthog-react-native` est mocké
// globalement (`__mocks__/posthog-react-native.js`, expose `__getInstances`). On pilote les
// env vars + `jest.resetModules()` pour réinitialiser le singleton ET le client de la façade
// entre chaque cas (les deux modules sont ré-évalués ensemble après reset → même registre).

describe('bootstrapAnalytics — key-gated (AC2)', () => {
  const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  const ENV = process.env.EXPO_PUBLIC_APP_ENV;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    delete process.env.EXPO_PUBLIC_APP_ENV;
  });

  afterAll(() => {
    if (KEY === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    else process.env.EXPO_PUBLIC_POSTHOG_KEY = KEY;
    if (ENV === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = ENV;
  });

  it('clé absente → pas d’instanciation, client null, helpers no-op', () => {
    const { bootstrapAnalytics, getPostHog } = require('./posthog');
    const ph = require('posthog-react-native');
    const { trackMapOpened } = require('@ridenrest/analytics');

    bootstrapAnalytics();

    expect(getPostHog()).toBeNull();
    expect(ph.__getInstances()).toHaveLength(0);
    // Helper no-op (client jamais injecté) — ne doit pas crasher.
    expect(() => trackMapOpened({ adventure_id_hash: 'abc' })).not.toThrow();
  });

  it('clé présente → transport injecté, capture délègue au SDK (EU host)', () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';
    const { bootstrapAnalytics, getPostHog } = require('./posthog');
    const ph = require('posthog-react-native');
    const { trackMapOpened } = require('@ridenrest/analytics');

    bootstrapAnalytics();

    const instances = ph.__getInstances();
    expect(instances).toHaveLength(1);
    expect(getPostHog()).toBe(instances[0]);
    expect(instances[0].options.host).toBe('https://eu.i.posthog.com');
    expect(instances[0].options.defaultOptIn).toBe(true);
    expect(instances[0].options.captureAppLifecycleEvents).toBe(false);

    // Le transport délègue bien à posthog.capture (façade → SDK).
    trackMapOpened({ adventure_id_hash: 'abc' });
    expect(instances[0].capture).toHaveBeenCalledWith('map_opened', {
      adventure_id_hash: 'abc',
    });
  });

  it('idempotent : un 2e bootstrap n’instancie pas un 2e client', () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    const { bootstrapAnalytics } = require('./posthog');
    const ph = require('posthog-react-native');
    bootstrapAnalytics();
    bootstrapAnalytics();
    expect(ph.__getInstances()).toHaveLength(1);
  });
});

describe('session replay — beta-only (AC4)', () => {
  const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  const ENV = process.env.EXPO_PUBLIC_APP_ENV;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test_key';
  });

  afterAll(() => {
    if (KEY === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    else process.env.EXPO_PUBLIC_POSTHOG_KEY = KEY;
    if (ENV === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = ENV;
  });

  it('production → replay DÉSACTIVÉ (jamais en prod)', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    const { bootstrapAnalytics, isReplayEnabled } = require('./posthog');
    const ph = require('posthog-react-native');
    bootstrapAnalytics();
    expect(isReplayEnabled()).toBe(false);
    expect(ph.__getInstances()[0].options.enableSessionReplay).toBe(false);
  });

  it('preview → replay ACTIVÉ + masquage inputs', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';
    const { bootstrapAnalytics, isReplayEnabled } = require('./posthog');
    const ph = require('posthog-react-native');
    bootstrapAnalytics();
    expect(isReplayEnabled()).toBe(true);
    const opts = ph.__getInstances()[0].options;
    expect(opts.enableSessionReplay).toBe(true);
    expect(opts.sessionReplayConfig.maskAllTextInputs).toBe(true);
  });
});
