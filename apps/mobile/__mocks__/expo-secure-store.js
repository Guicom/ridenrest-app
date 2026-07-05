// Mock natif expo-secure-store (MOB-1.4, enrichi MOB-2.1). Store en mémoire.
// Le client `@better-auth/expo` utilise les variantes **synchrones** `setItem`/
// `getItem` (SDK 52+) ; on expose aussi les variantes `*Async` historiques.
const store = new Map();

module.exports = {
  // Variantes synchrones (utilisées par expoClient storage)
  setItem: jest.fn((key, value) => {
    store.set(key, value);
  }),
  getItem: jest.fn((key) => (store.has(key) ? store.get(key) : null)),
  // Variantes asynchrones (API historique)
  setItemAsync: jest.fn(async (key, value) => {
    store.set(key, value);
  }),
  getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  deleteItemAsync: jest.fn(async (key) => {
    store.delete(key);
  }),
  __reset: () => store.clear(),
};
