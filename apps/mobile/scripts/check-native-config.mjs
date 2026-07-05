#!/usr/bin/env node
// Vérif STATIQUE des invariants de config native Expo (déterministe, 0 device, CI-friendly).
//
// Raison d'être : certaines features natives exigent une permission / clé de manifest que
// le plugin Expo n'ajoute PAS tout seul. L'oubli ne crashe qu'au RUNTIME, sur le device,
// parfois seulement quand un chemin précis est exercé (ex. MOB-5.2/5.3 : la tâche de
// localisation BACKGROUND crashe au 1er fix GPS car `RECEIVE_BOOT_COMPLETED` manquait —
// `IllegalArgumentException: Requested job cannot be persisted…`). Ce script encode ces
// leçons en règles qui ÉCHOUENT (exit 1) avant même de builder.
//
// Source de vérité : `expo config --json` (config résolue, plugins + props + android.permissions)
// + le manifest mergé si `android/` a déjà été prebuild (belt-and-suspenders).
//
// Ajouter une règle = pousser un objet dans RULES. Garder le message ACTIONNABLE.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Config Expo résolue (plugins normalisés, android.permissions, ios.infoPlist…). */
function loadExpoConfig() {
  let raw;
  try {
    raw = execSync('npx --no-install expo config --json --type public', {
      cwd: mobileRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    console.error('❌ check-native-config : `expo config --json` a échoué.');
    console.error(String(err.stderr || err.message || err));
    process.exit(2);
  }
  const parsed = JSON.parse(raw);
  return parsed.expo ?? parsed;
}

/** Props d'un plugin (`"name"` → {}, `["name", props]` → props). */
function pluginProps(config, name) {
  const entry = (config.plugins ?? []).find((p) =>
    Array.isArray(p) ? p[0] === name : p === name,
  );
  if (!entry) return null; // plugin absent
  return Array.isArray(entry) ? (entry[1] ?? {}) : {};
}

/** Permissions Android déclarées dans le manifest mergé (si déjà prebuild), sinon null. */
function mergedAndroidManifestPermissions() {
  const manifest = join(
    mobileRoot,
    'android/app/src/main/AndroidManifest.xml',
  );
  if (!existsSync(manifest)) return null;
  const xml = readFileSync(manifest, 'utf8');
  const perms = new Set();
  for (const m of xml.matchAll(/android:name="([^"]+)"/g)) {
    if (m[1].startsWith('android.permission.')) perms.add(m[1]);
  }
  return perms;
}

// ── RÈGLES ───────────────────────────────────────────────────────────────────
// Chaque règle : { name, check(config) -> string[] (violations) }.
const RULES = [
  {
    name: 'expo-location background → RECEIVE_BOOT_COMPLETED',
    check(config) {
      const loc = pluginProps(config, 'expo-location');
      if (!loc?.isAndroidBackgroundLocationEnabled) return [];
      const declared = new Set(config.android?.permissions ?? []);
      const PERM = 'android.permission.RECEIVE_BOOT_COMPLETED';
      if (declared.has(PERM)) return [];
      return [
        `expo-location a \`isAndroidBackgroundLocationEnabled: true\` mais \`android.permissions\` ne déclare PAS ${PERM}.\n` +
          `   → La tâche de localisation background planifie un JobScheduler job PERSISTÉ qui exige cette permission ;\n` +
          `     sinon CRASH (\`Requested job cannot be persisted…\`) au 1er fix GPS background.\n` +
          `   → Ajoute-la dans app.config.ts : android.permissions: ['${PERM}'] puis \`expo prebuild -p android\`.`,
      ];
    },
  },
  {
    name: 'expo-location background → manifest mergé contient RECEIVE_BOOT_COMPLETED',
    check(config) {
      const loc = pluginProps(config, 'expo-location');
      if (!loc?.isAndroidBackgroundLocationEnabled) return [];
      const merged = mergedAndroidManifestPermissions();
      if (merged === null) return []; // pas encore prebuild → règle config-level suffit
      if (merged.has('android.permission.RECEIVE_BOOT_COMPLETED')) return [];
      return [
        `Le manifest Android mergé (android/) ne contient PAS RECEIVE_BOOT_COMPLETED alors que le background-location est actif.\n` +
          `   → Le prebuild Android est probablement périmé. Relance \`expo prebuild -p android\`.`,
      ];
    },
  },
  {
    name: 'Sentry (MOB-6.1) → plugin @sentry/react-native/expo présent',
    check(config) {
      // Le SDK natif Sentry + l'upload des source maps Metro sont branchés par le plugin
      // config `@sentry/react-native/expo`. Sans lui, le module natif manque au runtime
      // (crash/erreur) et les stack traces ne sont pas symbolisées (AC1). Le plugin doit
      // donc TOUJOURS être déclaré dans app.config.ts dès lors que `@sentry/react-native`
      // est une dépendance (MOB-6.1).
      const present = pluginProps(config, '@sentry/react-native/expo') !== null;
      if (present) return [];
      return [
        `Le plugin \`@sentry/react-native/expo\` est ABSENT de app.config.ts alors que\n` +
          `   @sentry/react-native est une dépendance (MOB-6.1).\n` +
          `   → Sans ce plugin : module natif manquant au runtime + pas de source maps\n` +
          `     (stack traces non symbolisées). Ajoute-le dans app.config.ts → plugins\n` +
          `     puis \`expo prebuild --clean -p ios\` ET \`-p android\`.`,
      ];
    },
  },
  {
    name: 'Push (MOB-6.2) → plugin expo-notifications présent',
    check(config) {
      // Le module natif `expo-notifications` (permission + réception + token APNs/FCM) est
      // branché par le plugin config `expo-notifications`. Sans lui : module natif manquant
      // au runtime (« Cannot find native module ») + permission Android `POST_NOTIFICATIONS`
      // absente. Le plugin doit TOUJOURS être déclaré dès lors qu'`expo-notifications` est
      // une dépendance (MOB-6.2).
      const present = pluginProps(config, 'expo-notifications') !== null
      if (present) return []
      return [
        `Le plugin \`expo-notifications\` est ABSENT de app.config.ts alors qu'expo-notifications\n` +
          `   est une dépendance (MOB-6.2).\n` +
          `   → Sans ce plugin : module natif manquant au runtime + POST_NOTIFICATIONS (Android 13+)\n` +
          `     absente. Ajoute-le dans app.config.ts → plugins puis \`expo prebuild --clean -p ios\`\n` +
          `     ET \`-p android\`.`,
      ]
    },
  },
  {
    name: 'expo-location background iOS → UIBackgroundModes contient "location"',
    check(config) {
      const loc = pluginProps(config, 'expo-location');
      if (!loc?.isIosBackgroundLocationEnabled) return [];
      const modes = config.ios?.infoPlist?.UIBackgroundModes ?? [];
      if (Array.isArray(modes) && modes.includes('location')) return [];
      // Si le prebuild a déjà tourné, vérifier le Info.plist mergé.
      const infoPlist = join(mobileRoot, 'ios', 'RidenRest', 'Info.plist');
      if (!existsSync(infoPlist)) return []; // pas encore prebuild → le plugin l'ajoutera
      const plistContent = readFileSync(infoPlist, 'utf8');
      if (plistContent.includes('<string>location</string>')) return [];
      return [
        `Le Info.plist iOS (ios/RidenRest/Info.plist) ne contient PAS UIBackgroundModes > location\n` +
          `   alors que le background-location est actif.\n` +
          `   → La tâche de localisation background ne fonctionnera pas en arrière-plan.\n` +
          `   → Relance \`expo prebuild -p ios\` pour corriger.`,
      ];
    },
  },
];

const config = loadExpoConfig();
const violations = RULES.flatMap((rule) =>
  rule.check(config).map((msg) => `• [${rule.name}]\n   ${msg}`),
);

if (violations.length > 0) {
  console.error('❌ Invariants de config native VIOLÉS :\n');
  console.error(violations.join('\n\n'));
  console.error(
    `\n${violations.length} violation(s). Corrige app.config.ts (et prebuild si besoin) avant de clore.`,
  );
  process.exit(1);
}

console.log(
  `✓ check-native-config : ${RULES.length} invariant(s) natif(s) OK (aucune violation).`,
);
