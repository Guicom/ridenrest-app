// Mock natif expo-document-picker (MOB-3.2) — auto-appliqué par Jest (adjacent à
// node_modules, comme expo-secure-store/expo-web-browser). Factory SANS JSX RN :
// le transform NativeWind injecte une variable hors-scope interdite par jest.
//
// Par défaut : sélection annulée (no-op). Les tests pilotent le résultat via
// `getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [...] })`.
module.exports = {
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
};
