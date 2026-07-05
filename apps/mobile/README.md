# @ridenrest/mobile

Application mobile native Ride'n'Rest (iOS + Android) — [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/) + expo-router, intégrée au monorepo Turborepo/pnpm.

## Démarrage (développement local)

```bash
pnpm install                       # à la racine du monorepo
pnpm --dir apps/mobile dev         # démarre le serveur Expo (Metro)
# puis : i (simulateur iOS) / a (émulateur Android)
```

> ⚠️ Depuis MOB-1.2, le projet utilise un **Dev Client** (`expo-dev-client`) : les libs natives à venir (MapLibre RN, expo-secure-store…) ne fonctionnent pas dans Expo Go. Installer le build `development` (voir ci-dessous) sur le simulateur/émulateur, puis `pnpm --dir apps/mobile dev`.

### ⚠️ Prérequis pour un build natif **en local** (`expo run:ios` / `run:android`)

**Expo SDK 56 exige Xcode 26.4** (iOS deployment target **16.4**). Avec un Xcode plus ancien (ex. 26.1), `expo run:ios` **échoue à la compilation** (erreur Swift `'weak' must be a mutable variable` dans `expo-modules-jsi`, `xcodebuild error code 65`). Vérifier : `xcodebuild -version` → `Xcode 26.4`. Mettre à jour via l'App Store, puis `sudo xcodebuild -runFirstLaunch`.

> 💡 **Pourquoi ça « marchait avant » sans Xcode 26.4 ?** Parce que les builds natifs du projet passent normalement par **EAS Build (cloud)**, dont les serveurs ont la bonne toolchain — la compilation **locale** n'est jamais sollicitée. Un `expo start` ne compile pas non plus (il sert juste le JS). Le besoin de Xcode 26.4 **en local** n'apparaît qu'au premier `expo run:ios` (utile p.ex. pour tester un **deep link `ridenrest://`** sans attendre un build cloud).

> 🛠️ Gotcha runtime simulateur : si `xcodebuild -showdestinations` ne liste aucun simulateur (« iOS 26.1 is not installed » alors que `simctl` boote bien un sim), installer le **runtime de build** : `xcodebuild -downloadPlatform iOS`. Un runtime peut suffire à *lancer* un sim sans suffire à *compiler* vers lui.

## Identité de l'app

| Élément | Valeur |
|---|---|
| Bundle ID iOS / Package Android | `app.ridenrest` |
| Projet EAS | [`@ridenrest/ridenrest`](https://expo.dev/accounts/ridenrest/projects/ridenrest) |
| `projectId` EAS | `4548dbd0-ee0d-4ba7-8acb-e42469ec1ec3` (dans `app.config.ts` → `extra.eas`) |
| Scheme deep link | `ridenrest://` (`app.config.ts` → `scheme`) |

> 📝 Depuis **MOB-1.4** : la config Expo est en **`app.config.ts`** (TypeScript ; plus de `app.json`), `projectId` EAS + config `updates` (OTA) préservés. Le scheme `ridenrest://` génère au prebuild les `CFBundleURLTypes` (iOS) et l'intent filter (Android) — prérequis des callbacks OAuth `ridenrest://oauth-*` (MOB-2.3/2.4).

## Builds (EAS Build — cloud)

3 profils dans `eas.json`, chacun rattaché à un canal OTA du même nom :

| Profil | Usage | Distribution | Canal OTA | Notes |
|---|---|---|---|---|
| `development` | Dev Client (iOS : simulateur **uniquement** ; Android : émulateur/device) | `internal` | `development` | `developmentClient: true`, `ios.simulator: true` — un device iOS physique exigerait un build sans `simulator: true` + provisioning |
| `preview` | QA installable hors store | `internal` | `preview` | APK Android / ad-hoc iOS |
| `production` | Binaire de soumission store | `store` | `production` | `autoIncrement`, versions gérées côté EAS (`appVersionSource: remote`) |

```bash
# Builds development (Dev Client)
pnpm --dir apps/mobile exec eas build --profile development --platform ios
pnpm --dir apps/mobile exec eas build --profile development --platform android

# Suivi
pnpm --dir apps/mobile exec eas build:list --limit 5
```

**Credentials** : gérés automatiquement par EAS (signing iOS via le compte Apple Developer, keystore Android généré et stocké sur les serveurs Expo). Rien à stocker dans le repo.

**Free tier EAS ≈ 30 builds/mois** → économiser les builds natifs : tout changement **JS/assets pur** passe par OTA (voir ci-dessous), un build natif n'est nécessaire que pour un changement natif.

## OTA (EAS Update)

- `runtimeVersion` : policy **`appVersion`** — un build ne reçoit que les updates publiées avec la même version d'app (`1.0.0`). Un mismatch de `runtimeVersion` est la cause n°1 d'une OTA « qui ne s'applique pas ».
- Publier un patch JS :

```bash
pnpm --dir apps/mobile exec eas update --channel preview --message "fix: …"
```

- ⚠️ **Toujours passer `--channel`** : sans lui, l'update part sur une branche par défaut qu'aucun build ne consomme (OTA invisible). En `--non-interactive` (CI), eas-cli 20.x exige aussi `--environment`.
- L'update est récupérée **au prochain lancement** d'un build du canal ciblé (2 lancements pour la voir : fetch en arrière-plan puis application).

### ⚠️ Règle OTA (à respecter sur tous les epics)

Une OTA ne peut livrer **que du JS et des assets**. Tout changement **natif** (nouveau plugin/config natif, lib native, bump SDK Expo) impose un **nouveau build EAS** + (en production) une soumission store. En cas de doute : si `pnpm exec expo install <lib>` ajoute du code natif → build requis.

## CI/CD → EAS Build (pattern cible — implémentation gate CI en MOB-1.4)

**Principe** : GitHub Actions ne compile **jamais** de natif. Il ne fait qu'**appeler** EAS Build/Submit — la compilation s'exécute sur le cloud EAS.

- **Déclencheur** : push d'un tag `v*` (ex. `v1.1.0`) → job GitHub Actions dédié mobile.
  (Le workflow web actuel `.github/workflows/ci.yml` se déclenche sur push `main` → deploy VPS ; le déclenchement mobile par tag s'y ajoutera sans le modifier.)
- **Auth CI** : créer un access token sur [expo.dev → Access tokens](https://expo.dev/settings/access-tokens) et le stocker en secret GitHub `EXPO_TOKEN` (jamais dans le repo).

```yaml
# Squelette cible (à implémenter en MOB-1.4 avec la gate lint/test/typecheck)
on:
  push:
    tags: ['v*']

jobs:
  eas-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: '10.32.1' }
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      # Pas de compilation native ici — EAS Build s'en charge en cloud :
      - run: pnpm --dir apps/mobile exec eas build --profile production --platform all --non-interactive --no-wait
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
      # eas submit (stores) → MOB-6.5
```

**Hors scope ici** (volontairement) : job CI lint/test/typecheck mobile → **MOB-1.4** ; distribution TestFlight/Internal Testing + `eas submit` → **MOB-6.5**.

## Variables d'environnement

- Variables publiques embarquées dans le bundle : préfixe **`EXPO_PUBLIC_*`** uniquement (via `eas.json` → `env` par profil, ou EAS Environment Variables).
- **Aucun secret dans le bundle JS** (NFR-014). `BETTER_AUTH_SECRET` & co. restent côté serveur, toujours.

### Auth — `EXPO_PUBLIC_*` (MOB-2.1)

Copier `.env.example` → `.env` et renseigner :

| Variable | Rôle | Dev (simulateur iOS) |
|---|---|---|
| `EXPO_PUBLIC_BETTER_AUTH_URL` | Serveur **Better Auth** (`apps/web`) — sign-in, session, endpoint token JWT | `http://localhost:3011` |
| `EXPO_PUBLIC_API_URL` | API **NestJS** (données) — appelée par `apiFetch` avec `Authorization: Bearer` | `http://localhost:3010` |

> ⚠️ **Gotcha device physique / émulateur Android** : `localhost` pointe sur le **device lui-même**, pas sur la machine de dev. Utiliser l'**IP LAN** de la machine (ex. `http://192.168.1.42:3011` / `:3010`). La trouver via `ipconfig getifaddr en0` (macOS). Le simulateur iOS, lui, partage `localhost` avec l'hôte.

### Observabilité — Sentry & PostHog (MOB-6.1)

Crash reporting (Sentry) + analytics produit (PostHog, façade `@ridenrest/analytics`). **Tout est key-gated** : sans clé/DSN, l'app fonctionne (init no-op) mais n'émet rien — comportement attendu en dev/CI. Les valeurs `APP_ENV` + `POSTHOG_HOST` sont déjà déclarées par profil dans `eas.json`. Les **clés** (publiques par design : embarquées dans le bundle) viennent des **EAS Environment Variables** (dashboard) pour les builds cloud, ou de `.env.local` pour les builds locaux.

| Variable | Rôle | Secret ? |
|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | `development` \| `preview` \| `production` — pilote l'`environment` Sentry **et** le gate du session replay (replay **beta-only** : actif si `!== 'production'`) | non (eas.json) |
| `EXPO_PUBLIC_POSTHOG_KEY` | Clé projet PostHog (même projet que le web → dashboard unifié). Absente → analytics no-op | non (publique, bundle) |
| `EXPO_PUBLIC_POSTHOG_HOST` | Endpoint PostHog Cloud **EU** (`https://eu.i.posthog.com`) | non (eas.json) |
| `EXPO_PUBLIC_SENTRY_DSN` | DSN Sentry (public par design). Absent → Sentry non initialisé | non (publique, bundle) |
| `SENTRY_AUTH_TOKEN` | **Upload des source maps** au build (symbolication). **SECRET CI / `.env.local` uniquement** — JAMAIS `EXPO_PUBLIC_*`, JAMAIS commité | **OUI** |

> RGPD : **aucun bandeau de consentement sur mobile** (zéro cookie → `distinct_id` en AsyncStorage). Pas d'IDFA / pas de tracking cross-app → **pas de prompt ATT**. Jamais de GPS ni de PII (façade typée + scrub `beforeSend` Sentry). Le session replay (beta) **masque la carte MapLibre** (`ph-no-capture`) + les champs texte.

### Notifications push — APNs / FCM (MOB-6.2)

Notification « analyse de densité terminée » (`expo-notifications` + `expo-device`). La permission OS est demandée **après la 1re analyse de densité** (`sidebar-density-section.tsx`), jamais au boot — la garde one-shot vit dans `push-storage` (AsyncStorage, **jamais** SecureStore : un flag/token push n'est pas un secret d'auth). L'envoi serveur passe par l'**Expo Push API** (`expo-server-sdk`, un endpoint route APNs **et** FCM) : `PushModule` NestJS écoute `density.completed` (EventEmitter) et notifie tous les tokens du propriétaire, **best-effort** (une erreur d'envoi ne fait jamais échouer le job densité ; un `DeviceNotRegistered` purge le token). RGPD : le payload ne transporte que `{ adventureId }` (deep-link `map/[id]`), **zéro coordonnée GPS**.

⚠️ **Module natif neuf** → `expo prebuild --clean -p ios` **ET** `-p android` avant `pnpm sim` / `run:android`, sinon « Cannot find native module ». Pin **exact** de `expo-notifications` / `expo-device` (`bundledNativeModules.json`, sans `~` — gotcha dyld « Symbol not found »). Le push réel **n'arrive PAS sur simulateur iOS** (`Device.isDevice === false` → flux permission/registration en no-op sûr) ; tester l'envoi réel sur **device physique**.

**Prérequis credentials (hors-code, à provisionner avant l'envoi réel — voir §T8 de la story) :**

| Élément | Où | Rôle |
|---|---|---|
| Clé APNs `.p8` | EAS credentials (`eas credentials`, iOS) | Signe les pushes APNs. Sans elle, `getExpoPushTokenAsync` échoue sur device iOS |
| `google-services.json` + clé de service **FCM V1** (`.json`) | EAS credentials (Android) + config projet Firebase | Route les pushes FCM (Android). Référencé via `android.googleServicesFile` si fourni |
| `EXPO_ACCESS_TOKEN` (optionnel) | **`.env` VPS (API NestJS)**, secret — jamais dans le bundle | Durcit la sécurité de l'envoi via l'Expo Push API. Absent → envoi non authentifié (OK MVP) |

> Sans ces credentials, l'app **boote normalement** et tout le flux push est **no-op sûr** (aucune erreur). Le secret d'envoi (`EXPO_ACCESS_TOKEN`) vit **uniquement** côté API NestJS (`.env` VPS), **jamais** en `EXPO_PUBLIC_*`.

## Auth & session (MOB-2.1)

Fondation auth posée par MOB-2.1 (aucun écran de login fonctionnel ici — il arrive en MOB-2.2).

- **Client** : `src/lib/auth/client.ts` — `@better-auth/expo` (`expoClient`) configuré sur le scheme `ridenrest` + stockage **`expo-secure-store`** (Keychain iOS / Keystore Android). **Jamais** `AsyncStorage` pour l'auth. Persistance + restauration de session au cold start **automatiques**.
- **Versions** : `better-auth` **1.5.5** + `@better-auth/expo` **1.5.5** côté mobile, **alignées exactement** sur le serveur Better Auth (`apps/web`, `better-auth@1.5.5`). Pin exact (pas de `^`) — le plugin a un peer `better-auth: 1.5.5` strict, et monter le serveur en 1.6.x casserait les sessions web en prod.
- **Serveur** (`apps/web/src/lib/auth/auth.ts`) : ajout **additif** du plugin `expo()` + `trustedOrigins: ['ridenrest://', 'ridenrest://*']` (autorise le retour deep-link OAuth). Le web continue d'utiliser les cookies de session — comportement inchangé.
- **Client API** : `src/lib/api/api-client.ts` — `apiFetch()` (wrapper `fetch`, jamais axios/ky) injecte `Authorization: Bearer <JWT>`, cache le JWT (~13 min, buffer 2 min) et gère `401 → refresh → 1 retry`. Le JWT vient de `GET {BETTER_AUTH_URL}/api/auth/token` (cookie de session via `authClient.getCookie()`).
- **Routes & guard** : groupes `(auth)` / `(app)` ; le **guard centralisé** vit dans `src/app/(app)/_layout.tsx` (un seul point, jamais par écran) — non connecté → `(auth)/login`, connecté → enfants, session non résolue → loader (pas de flash). Guard inverse dans `(auth)/_layout.tsx`.
- **Socle data** : `QueryClientProvider` (TanStack Query v5) + un **unique** listener `AppState`/netinfo (`src/lib/query/use-app-state-refetch.ts`) monté au root — refocus/refetch de la session au retour foreground.

> 🔐 **Secret partagé** : `BETTER_AUTH_SECRET` **identique** entre `apps/web`, `apps/api` et le serveur — **ne jamais régénérer** (casserait toutes les sessions web existantes). Jamais exposé au client mobile.

## Scripts

| Script | Action |
|---|---|
| `pnpm dev` / `pnpm start` | Serveur Expo (Metro) |
| `pnpm ios` / `pnpm android` | Serveur Expo + ouverture simulateur/émulateur |
| `pnpm build` | `expo export` (bundle JS, utilisé par Turbo) |
| `pnpm lint` | ESLint (config Expo flat) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Jest + React Native Testing Library (preset `jest-expo`) |

## Tests (MOB-1.4)

### Unitaires — Jest + RNTL

- Preset **`jest-expo`** (`jest.config.js`), setup global `jest.setup.ts`. Tests **co-localisés** `*.test.ts(x)` à côté du code.
- Mocks des libs natives dans **`__mocks__/`** (racine `apps/mobile/`) : `expo-localization`, `expo-location`, `expo-secure-store` (variantes sync `setItem`/`getItem` pour le client Better Auth), `expo-web-browser`, `@maplibre/maplibre-react-native` — placeholders étoffés au fil des epics MOB-2+.

> ⚠️ **Tests de routes : jamais sous `src/app/`.** Expo Router bundle via `require.context` **tout** `.tsx` sous `src/app` (y compris les `*.test.tsx`) → `expo export` casserait sur l'import de `@testing-library/react-native`. Les tests qui doivent importer un fichier de route vivent sous **`src/__tests__/`** (ex. `app-group-guard.test.tsx`) ; les tests de logique/composants restent co-localisés ailleurs (`src/lib/**`, `src/components/**`).

```bash
pnpm --dir apps/mobile test          # suite Jest/RNTL
```

### E2E — Maestro (smoke, **pré-release uniquement**)

- Flow : `.maestro/launch.yaml` — « l'app se lance et affiche l'écran d'accueil ».
- ⚠️ **Cadence pré-release** (avant soumission stores), **jamais** sur les PR CI : émulateur lent/coûteux + flakiness E2E. Volontairement absent du job GitHub Actions.
- Maestro est un **CLI système** (hors `package.json`) : `curl -fsSL https://get.maestro.mobile.dev | bash`. Nécessite un simulateur/émulateur avec l'app installée (`npx expo run:ios` / `run:android`, ou un build dev-client EAS).

```bash
maestro test apps/mobile/.maestro/launch.yaml
```

## Gate CI (MOB-1.4)

`apps/mobile` expose les tâches turbo `lint` / `test` / `typecheck`, **captées automatiquement** par le `--filter='*'` existant de `.github/workflows/ci.yml` — aucune modification du YAML. Le lint + les tests unitaires mobile tournent donc sur **chaque PR vers `main`** et **bloquent** le merge en cas d'échec.

> 🚫 **Aucun build natif en GitHub Actions** : la tâche `build` mobile = `expo export` (bundle JS, léger). La compilation native iOS/Android reste **exclusivement sur EAS Build (cloud)** — cf. section CI/CD → EAS ci-dessus (FR-MOB-003).

## i18n (MOB-1.4)

Scaffold `i18next` + `react-i18next` + `expo-localization` dans `src/lib/i18n/` :

- `i18n.config.ts` : init, détection de la locale device, **locale par défaut + fallback = `fr`** (jamais `en`).
- `locales/{fr,en}.json` ; provider `I18nextProvider` monté au root (`app/_layout.tsx`).
- Toutes les chaînes des écrans placeholder sont résolues via `t('…')` (preuve de câblage). L'externalisation **complète** des chaînes est déférée à **MOB-6.3**.

### Vérifier le deep link `ridenrest://` (manuel, simulateur)

```bash
npx uri-scheme open ridenrest://oauth-callback --ios       # ou --android
# → ouvre l'app sur l'écran oauth-callback (routé par Expo Router)
```
