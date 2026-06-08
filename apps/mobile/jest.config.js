// Jest — preset `jest-expo` (MOB-1.4 / AC2). Transpile RN/Expo + NativeWind.
//
// `transformIgnorePatterns` : jest-expo ignore `node_modules` sauf une liste
// blanche. On l'étend pour transpiler ce qui ship du TS/Flow/JSX non compilé :
//   - nativewind / react-native-css-interop : runtime `className`
//   - @ridenrest/* : packages workspace exportés en **source TS** (./src/index.ts)
//   - @expo-google-fonts/* : modules de police
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?(?:jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-clone-referenced-element|@react-native-community|expo-router|@react-navigation/.*|nativewind|react-native-css-interop|@ridenrest/.*)',
  ],
};
