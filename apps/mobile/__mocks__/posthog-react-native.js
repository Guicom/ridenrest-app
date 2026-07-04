// Mock natif `posthog-react-native` (MOB-6.1). Le module natif est absent hors
// device → mock manuel global. Activé via `jest.mock('posthog-react-native')` dans
// `jest.setup.ts`. Factory CommonJS **sans JSX** (contrainte transform NativeWind —
// cf. AGENTS.md) : `PostHogProvider`/`PostHogMaskView` = `jest.fn(() => null)`.
//
// `default` = la classe `PostHog` (parité `new PostHog(key, options)`). Chaque
// instance porte des `jest.fn()` pour `capture`/`identify`/`reset`/… → les tests
// vérifient les appels via `__getInstances()`. `__reset()` vide la liste (beforeEach).

const instances = [];

class PostHog {
  constructor(apiKey, options) {
    this.apiKey = apiKey;
    this.options = options;
    this.capture = jest.fn();
    this.identify = jest.fn();
    this.reset = jest.fn();
    this.optIn = jest.fn(async () => {});
    this.optOut = jest.fn(async () => {});
    this.isFeatureEnabled = jest.fn(() => undefined);
    this.register = jest.fn();
    instances.push(this);
  }
}

module.exports = {
  __esModule: true,
  default: PostHog,
  PostHog,
  PostHogProvider: jest.fn(() => null),
  PostHogMaskView: jest.fn(() => null),
  usePostHog: jest.fn(() => null),
  useFeatureFlag: jest.fn(() => undefined),
  // Helpers de test (absents de l'API réelle) :
  __getInstances: () => instances,
  __reset: () => {
    instances.length = 0;
  },
};
