// Mock natif `@sentry/react-native` (MOB-6.1). Le module natif est absent hors
// device → mock manuel global. Activé via `jest.mock('@sentry/react-native')` dans
// `jest.setup.ts`. Factory CommonJS **sans JSX** (contrainte transform NativeWind —
// cf. AGENTS.md). `wrap` renvoie le composant tel quel (HOC identité) pour ne pas
// casser le rendu du root layout dans les tests de route.
module.exports = {
  init: jest.fn(),
  wrap: jest.fn((component) => component),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  withScope: jest.fn((cb) =>
    cb({ setTag: jest.fn(), setContext: jest.fn(), setExtra: jest.fn() }),
  ),
  setUser: jest.fn(),
  flush: jest.fn(async () => true),
  close: jest.fn(async () => {}),
  nativeCrash: jest.fn(),
};
