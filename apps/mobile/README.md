# @ridenrest/mobile

Application mobile native Ride'n'Rest (iOS + Android) — [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/) + expo-router, intégrée au monorepo Turborepo/pnpm.

## Démarrage (développement local)

```bash
pnpm install                       # à la racine du monorepo
pnpm --dir apps/mobile dev         # démarre le serveur Expo (Metro)
# puis : i (simulateur iOS) / a (émulateur Android)
```

> ⚠️ Depuis MOB-1.2, le projet utilise un **Dev Client** (`expo-dev-client`) : les libs natives à venir (MapLibre RN, expo-secure-store…) ne fonctionnent pas dans Expo Go. Installer le build `development` (voir ci-dessous) sur le simulateur/émulateur, puis `pnpm --dir apps/mobile dev`.

## Identité de l'app

| Élément | Valeur |
|---|---|
| Bundle ID iOS / Package Android | `app.ridenrest` |
| Projet EAS | [`@ridenrest/ridenrest`](https://expo.dev/accounts/ridenrest/projects/ridenrest) |
| `projectId` EAS | `4548dbd0-ee0d-4ba7-8acb-e42469ec1ec3` (dans `app.json` → `extra.eas`) |

> 📝 La migration `app.json` → `app.config.ts` et le scheme `ridenrest://` sont le périmètre de **MOB-1.4**. Lors de la migration, **ne pas perdre** le `projectId` ni la config `updates`.

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

## Scripts

| Script | Action |
|---|---|
| `pnpm dev` / `pnpm start` | Serveur Expo (Metro) |
| `pnpm ios` / `pnpm android` | Serveur Expo + ouverture simulateur/émulateur |
| `pnpm build` | `expo export` (bundle JS, utilisé par Turbo) |
| `pnpm lint` | ESLint (config Expo flat) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Placeholder — framework Jest/RNTL en MOB-1.4 |
