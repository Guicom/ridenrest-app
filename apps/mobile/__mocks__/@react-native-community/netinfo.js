// Mock `@react-native-community/netinfo` (MOB-3.5). Pilotable par test :
//   - `fetch()` résout l'état courant (`__setState` le configure) → seed boot.
//   - `addEventListener(cb)` enregistre `cb` ; `__emit(state)` le déclenche.
//   - `__reset()` réinitialise état + listeners (à appeler en `beforeEach`).
// Factory CommonJS sans JSX (contrainte jest/NativeWind — cf. AGENTS.md).

let currentState = { isConnected: true, isInternetReachable: true };
const listeners = new Set();

function fetch() {
  return Promise.resolve(currentState);
}

function addEventListener(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useNetInfo() {
  return currentState;
}

// --- Helpers de test ---
function __setState(state) {
  currentState = { ...currentState, ...state };
}

function __emit(state) {
  currentState = { ...currentState, ...state };
  for (const listener of [...listeners]) listener(currentState);
}

function __reset() {
  currentState = { isConnected: true, isInternetReachable: true };
  listeners.clear();
}

module.exports = {
  __esModule: true,
  default: { fetch, addEventListener, useNetInfo },
  fetch,
  addEventListener,
  useNetInfo,
  __setState,
  __emit,
  __reset,
};
