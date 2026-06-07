// Metro config monorepo (pattern Expo officiel) — cf. architecture-mobile.md
// - watchFolders sur la racine : Metro suit les changements de packages/*
// - nodeModulesPaths projet PUIS racine : résolution hoistée (.npmrc node-linker=hoisted)
// ⚠️ disableHierarchicalLookup volontairement laissé à false (défaut) : sur SDK 56,
//   l'« Expo Autolinking module resolution » gère le monorepo nativement et le forcer
//   à true casse le runtime Expo Go ([runtime not ready] TypeError au boot) — confirmé
//   par `expo doctor` (« Expected false, got: true »).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
