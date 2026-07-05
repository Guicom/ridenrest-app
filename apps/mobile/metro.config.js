// Metro config monorepo (pattern Expo officiel) — cf. architecture-mobile.md
// - watchFolders sur la racine : Metro suit les changements de packages/*
// - nodeModulesPaths projet PUIS racine : résolution hoistée (.npmrc node-linker=hoisted)
// ⚠️ disableHierarchicalLookup volontairement laissé à false (défaut) : sur SDK 56,
//   l'« Expo Autolinking module resolution » gère le monorepo nativement et le forcer
//   à true casse le runtime Expo Go ([runtime not ready] TypeError au boot) — confirmé
//   par `expo doctor` (« Expected false, got: true »).
// MOB-6.1 : `getSentryExpoConfig` enveloppe `getDefaultConfig` (Expo) en ajoutant le
// sérialiseur de debug IDs requis pour des **source maps Metro** symbolisables côté Sentry
// (AC1). Drop-in : même forme de config retournée → on conserve ensuite la config monorepo
// (watchFolders / nodeModulesPaths) PUIS NativeWind, exactement comme avant.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getSentryExpoConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// NativeWind v4 (MOB-1.3) : compile src/global.css en styles RN. Enveloppe
// APRÈS la config monorepo pour préserver watchFolders / nodeModulesPaths.
module.exports = withNativeWind(config, { input: './src/global.css' });
