---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/product-brief-ridenrest-app-2026-03-01.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - '_bmad-output/project-context.md'
lastStep: 8
status: 'complete'
completedAt: '2026-05-05'
workflowType: 'architecture'
scope: 'mobile-native'
project_name: 'ridenrest-app'
user_name: 'Guillaume'
date: '2026-05-05'
extends: '_bmad-output/planning-artifacts/architecture.md'
---

# Architecture Decision Document — Mobile Native (iOS + Android)

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

_**Scope** : transformation native iOS + Android via Expo / React Native, en complément de l'architecture web existante (`architecture.md`). Le backend (NestJS + PostgreSQL/PostGIS + Redis sur VPS Hostinger) reste inchangé et partagé entre web et mobile._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

73 FRs hérités du PRD web — réinterprétation mobile :

| Domaine | FRs | Statut port natif |
|---|---|---|
| Auth & User Management | FR-001→007 | ✅ Portable — OAuth flows adaptés (deep links `ridenrest://`, ASWebAuthenticationSession iOS / Custom Tabs Android), Better Auth JWT inchangé |
| Adventures & GPX Management | FR-010→019 | ✅ Portable — upload via UIDocumentPicker iOS / SAF Android, parsing async côté serveur identique |
| Map & Visualization | FR-020→027 | ⚠️ Adaptation MapLibre Native (APIs distinctes de GL JS) |
| POI Search — Planning | FR-030→036 | ✅ Réutilise endpoints NestJS sans modification |
| POI Search — Live | FR-040→045 | ⭐ Vraie valeur native — background location, Live Activities iOS, foreground service Android |
| Weather Integration | FR-050→055 | ✅ Portable — cache Redis serveur identique |
| External Integrations | FR-060→063 | ✅ Deep links externes natifs |
| ~~PWA & Offline~~ | ~~FR-070→073~~ | ❌ **Retirés du périmètre** — décision projet de suppression totale |

**Décision projet — Suppression totale du PWA :**

L'app mobile native iOS + Android rend le PWA obsolète. Conséquences actées :

- **Mobile** : aucun port des FRs PWA — capacités natives à la place (push APNs/FCM, install via stores, offline `expo-file-system`)
- **Web** : retrait complet du PWA web programmé (Service Worker, `manifest.webmanifest`, lib `next-pwa`, code lié) — séquencement post-launch mobile pour migrer en douceur les utilisateurs PWA actuels
- FRs à archiver dans le PRD : FR-070, FR-071, FR-072, FR-073
- Epic 12 (PWA & Offline) à clore comme "abandoned" dans `epics.md`

**Décision projet — Scope app mobile = partie connectée uniquement :**

Le périmètre fonctionnel de l'app mobile native est **strictement la partie auth-gated** du produit. Pas de landing page, pas de pages marketing, pas de pages légales en natif.

| Concern | Web | Mobile |
|---|---|---|
| Landing / acquisition | `apps/web/(marketing)/` (SEO, SSG, indexable) | ❌ Pas de duplication |
| Pages légales (privacy, terms) | `apps/web/(marketing)/privacy/`, `/terms/` | ❌ Pas de duplication — liens externes via `Linking.openURL` |
| Acquisition / découverte | `ridenrest.app/` + SEO | Fiche stores (App Store / Google Play) |
| Auth (login, signup, reset) | `apps/web/(auth)/` | `apps/mobile/app/(auth)/` |
| Application (adventures, map, live, settings) | `apps/web/(app)/` | `apps/mobile/app/(app)/` |

**Au lancement de l'app mobile :**
- User non connecté → redirection directe vers `app/(auth)/login.tsx`
- User connecté → redirection directe vers `app/(app)/adventures`

**Conformité stores — privacy & CGU :**
Apple App Store et Google Play imposent que l'app expose dans son interface des liens vers la Politique de confidentialité et les CGU. Pattern adopté : **liens externes** depuis `settings.tsx` via `Linking.openURL('https://ridenrest.app/privacy')` et `Linking.openURL('https://ridenrest.app/terms')`. Aucune duplication de contenu, ouverture dans le navigateur système.

**Non-Functional Requirements:**

NFRs réinterprétés pour le contexte natif :

- **Performance** : Cold start <2s (target), warm <1s, frame rate 60fps min (120 sur ProMotion), battery drain Live Mode à mesurer puis fixer cible
- **Security** : Better Auth JWT inchangé, mais stockage tokens via Keychain (iOS) / Keystore (Android) — `expo-secure-store`, jamais AsyncStorage en clair
- **Scalability** : Inchangé — le backend NestJS supporte déjà le scaling, l'app mobile = 1 client de plus
- **Reliability** : Offline-first plus strict qu'en PWA — cache local GPX + POIs aventures actives, gestion `AppState` React Native pour pauses polling
- **Integration constraints** : Inchangées côté API (rate limits Overpass/Strava/Weather identiques), mais NOUVEAU : conformité App Store guideline 4.2 (vraie app native), Privacy Nutrition Labels (Apple), Data Safety form (Google)

**Scale & Complexity:**

- Primary domain: Mobile cross-platform native (iOS + Android) via Expo + React Native
- Complexity level: **Medium** (UI à recréer, métier 100% partagé via monorepo, infra inchangée)
- Estimated architectural components: ~6-8 (apps/mobile + modules navigation/screens/services/stores/hooks/i18n)
- Reuse leverage: élevé (`packages/shared`, `packages/gpx`, `packages/database` types, API REST, schémas Zod)
- Pas un greenfield : extension cliente d'une architecture web mature et stable

### Technical Constraints & Dependencies

| Contrainte | Origine | Impact |
|---|---|---|
| Apple Developer Program ($99/an) + validation D-U-N-S | Apple Inc. | Délai 1-2 sem possible, à provisionner tôt dans le plan |
| Google Play Console ($25 one-shot) | Google LLC | Quasi-instant |
| App Store guideline 4.2 — apps wrap webview rejetées | Apple ToS | Confirme l'exclusion de Capacitor, valide Expo + RN |
| Permission `Always` location iOS pour Live Mode | iOS Privacy | Demande explicite avec justification claire dans `Info.plist` |
| Strava OAuth redirect URIs custom | Strava ToS | Whitelist `ridenrest://oauth-strava` côté Strava + adaptation côté Better Auth |
| Google OAuth sur mobile | Google ToS | SDK natif (`@react-native-google-signin/google-signin`) ou flow PKCE `expo-auth-session` |
| Privacy Nutrition Labels + Data Safety | Apple / Google | Déclaration géoloc, comptes, analytics au moment de la soumission |
| ATT iOS | iOS 14+ | Pas de tracking cross-app — IDFA non requis (simplifie) |
| MapLibre Native APIs ≠ MapLibre GL JS | Stack différent côté natif | Layers, pins SVG, clusters, click handlers à adapter |
| Pipeline EAS Build + TestFlight + Internal Testing Google | Expo / stores | À mettre en place avant la phase beta mobile |
| RGPD géoloc — règle existante | RGPD | Préservée : position GPS jamais envoyée au serveur (filtrage client-side, bbox anonymisée si nécessaire) |
| Better Auth JWT existant — `BETTER_AUTH_SECRET` partagé | Archi web | Mobile obtient les mêmes JWTs via `@better-auth/expo` ou flow custom — sécurise les appels API NestJS |
| Suppression PWA web programmée | Décision projet | Retrait Service Worker, manifest, `next-pwa` — post-launch mobile pour migrer utilisateurs en douceur |

### Cross-Cutting Concerns Identified

1. **Authentication & deep linking** — OAuth Google/Strava/Email via `expo-auth-session`, scheme URL custom `ridenrest://`, callback post-SSO ramène l'utilisateur dans l'app
2. **Background geolocation** — Live Mode efficace écran éteint (essentiel sur le vélo), permission `Always` iOS, foreground service Android, gestion batterie
3. **Push notifications natives** — APNs (iOS) + FCM (Android) via `expo-notifications`, remplacement web push (analyse densité terminée, alertes futures)
4. **Stockage sécurisé** — `expo-secure-store` pour JWT (Keychain/Keystore), `AsyncStorage` pour préférences, `expo-file-system` pour cache GPX local
5. **Cartographie native** — `@maplibre/maplibre-react-native` (Metal iOS, OpenGL Android), layers/pins/clusters portés depuis l'implémentation web, attribution OSM permanente
6. **Offline mode** — cache GPX + POIs des aventures actives, sync différée à reconnexion (scope MVP mobile à définir en Step 4)
7. **App lifecycle** — foreground/background/killed states, gestion `AppState` pour pause/reprise polling TanStack Query, reconnexion réseau
8. **Permissions runtime** — géoloc, notifications, accès fichiers, prompts iOS/Android avec rationale
9. **Distribution & releases** — pipeline EAS Build → TestFlight + Internal Testing → stores production, OTA updates pour patches JS sans soumission
10. **Conformité stores** — App Store 4.2, Privacy Nutrition Labels, Data Safety, age rating, content rating
11. **Crash & analytics** — Sentry mobile (JS + crashes natifs avec source maps Metro), analytics via **Plausible Events API** (`POST /api/event` vers `stats.ridenrest.app` — réutilise l'infra existante, un seul dashboard web + mobile)
12. **Internationalisation** — actuellement FR uniquement, mobile devra prévoir architecture i18n (`expo-localization` + `i18next`) pour distribution stores
13. **Tests** — Jest + React Native Testing Library (unit), Maestro (E2E smoke pré-release)

> **Universal Links / App Links** — explicitement **hors périmètre**. Pas de partage d'aventures prévu. À reconsidérer uniquement si une feature de partage social arrive en V3+.

## Starter Template Evaluation

### Primary Technology Domain

Mobile cross-platform native (iOS + Android) — Expo + React Native + Expo Router, intégré dans le monorepo Turborepo existant. Backend NestJS + DB inchangés.

### Versions cibles (mai 2026)

| Lib | Version | Note |
|---|---|---|
| Expo SDK | 55.x | RN 0.83, React 19.2, New Architecture par défaut |
| MapLibre React Native | 11.x | Requiert New Architecture, APIs alignées sur GL JS |
| Expo Router | latest aligné SDK 55 | File-based routing, similaire Next.js App Router |
| TypeScript | strict (config monorepo partagée) | Réutilise `packages/typescript-config` |

> SDK 56 prévu Q2 2026 (mai/juin) — décision : démarrer sur SDK 55 (stable depuis février 2026), upgrade vers 56 quand sortie stable.
>
> **Impl réelle (MOB-1.1, 2026-06-07)** : le template `create-expo-app` a livré directement **SDK 56 / RN 0.85.3 / React 19.2.3** (supérieur à la cible, non downgradé conformément à la consigne « ne pas downgrader »). Les versions cibles ci-dessus sont un plancher.

### Starter Options Considered

| Option | Description | Verdict |
|---|---|---|
| `create-expo-app --template default` | Officiel Expo, minimaliste, TypeScript, sans router | ⚠️ Manque Expo Router |
| `create-expo-app --template with-router` | Officiel + Expo Router pré-configuré | ✅ **Sélectionné** |
| Ignite by Infinite Red | CLI opinionatée (MobX-State-Tree, RN Navigation, Reactotron) | ❌ Incompatible (Zustand déjà choisi) |
| Solito (Next.js + RN partage UI) | Partage écrans web↔mobile via React Navigation | ❌ Sur-ingénierie — UI mobile distincte voulue |
| Setup manuel pur | From scratch RN CLI + Metro + Expo modules | ❌ Trop long, sans gain |

### Selected Starter: `create-expo-app --template with-router`

**Rationale :**

- Officiel Expo, maintenu et aligné sur la roadmap
- Expo Router (file-based routing) similaire à Next.js App Router → courbe d'apprentissage faible
- Compatible monorepo Turborepo + pnpm (avec `.npmrc node-linker=hoisted`)
- TypeScript strict par défaut
- New Architecture activée par défaut → compatible MapLibre RN v11 (requis)

**Initialization Commands :**

```bash
# 1. Créer apps/mobile à la racine du monorepo existant
cd /opt/ridenrest # ou root local
pnpm create expo-app@latest apps/mobile --template with-router --no-install

# 2. Configuration monorepo critique (Metro ne suit pas les symlinks pnpm)
echo "node-linker=hoisted" >> .npmrc

# 3. Installer les deps depuis la racine
pnpm install

# 4. Configurer metro.config.js pour le monorepo (watchFolders sur packages/)

# 5. Ajouter pipeline Turborepo (dev:mobile, build:mobile, lint:mobile, test:mobile)

# 6. Premier lancement
cd apps/mobile && pnpm exec expo start
```

**Structure cible après init :**

```
ridenrest-app/
  apps/
    web/               (existant)
    api/               (existant)
    mobile/            ← NOUVEAU
      app/             ← Expo Router (file-based routing)
        (auth)/
          login.tsx
          signup.tsx
        (app)/
          adventures/
            index.tsx
            [id].tsx
          map/[id].tsx
          live/[id].tsx
          settings.tsx
        _layout.tsx    ← Root layout
      components/
      hooks/
      stores/
      lib/
      assets/
      app.config.ts    ← Config Expo (icônes, splash, schemes, plugins)
      eas.json         ← EAS Build profiles (dev, preview, production)
      metro.config.js  ← Adapté monorepo (watchFolders packages/)
      tsconfig.json    ← Étend packages/typescript-config
      package.json
  packages/
    shared/            (existant — réutilisé)
    gpx/               (existant — réutilisé)
    database/          (existant — types réutilisés)
    typescript-config/ (existant — étendre pour mobile)
```

### Architectural Decisions Provided by Starter

**Language & Runtime :**

- TypeScript strict via `packages/typescript-config` (config monorepo partagée)
- React 19.2 + RN 0.83 (Expo SDK 55)
- New Architecture (Fabric + TurboModules) activée par défaut

**Routing :**

- Expo Router — file-based routing, conventions identiques à Next.js App Router (route groups `(app)/`, `_layout.tsx`, `[id].tsx` dynamic routes)

**Build Tooling :**

- Metro bundler (configuré pour monorepo : `watchFolders = [racine du monorepo]`, `nodeModulesPaths` projet puis racine. ⚠️ `disableHierarchicalLookup` doit rester à **`false`** (défaut) sur SDK 56 : l'Expo Autolinking module resolution gère le monorepo nativement et le forcer à `true` casse le runtime Expo Go — vérifié MOB-1.1, confirmé par `expo doctor`)
- EAS Build pour les binaires production (alternative locale via `expo run:ios` / `expo run:android` en dev)

**Testing Framework :**

- Jest (préconfiguré par Expo)
- React Native Testing Library à ajouter
- Maestro pour E2E smoke tests pré-release

**Code Organization :**

- Convention `app/` pour les routes (Expo Router)
- `_layout.tsx` pour les layouts imbriqués (Auth gating, providers TanStack Query/Zustand, theme)
- `(group)/` pour les groupes de routes (similaire Next.js App Router)
- Co-localisation des tests `*.test.ts` (alignement avec convention web/api existante)

**Development Experience :**

- Hot reloading via Metro
- Expo Go pour développement rapide (limité dès qu'on ajoute MapLibre Native ou expo-secure-store → switch vers Dev Client requis)
- Expo Dev Client (build custom) requis dès qu'on ajoute MapLibre RN ou plugins natifs
- TypeScript types pour Expo Router générés automatiquement

**Configuration monorepo Turborepo (`turbo.json`) :**

```json
{
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    }
  }
}
```

**Correction (code review MOB-1.1, 2026-06-07) :** ne **pas** mettre `.expo/**` dans les `outputs` de `build` — `expo export` écrit le bundle dans `apps/mobile/dist/` (déjà couvert par `dist/**`) ; `.expo/` est un cache local machine non déterministe (devices.json, caches Metro) qui polluerait le cache Turbo.

**Note :** L'initialisation via cette commande sera la première story d'implémentation de l'Epic mobile (probablement Epic 18 dans `epics.md`). Les stories suivantes : config Better Auth client mobile, intégration MapLibre RN, écrans Auth, écrans Adventures, etc.

## Core Architectural Decisions

### Decision Priority Analysis

**Décisions héritées (déjà prises côté web archi et starter mobile) :**

- Backend NestJS + PostgreSQL/PostGIS + Redis + BullMQ — inchangé, partagé web/mobile
- Better Auth JWT (`BETTER_AUTH_SECRET` partagé)
- Monorepo Turborepo + pnpm + TypeScript strict
- Expo SDK 55 + Expo Router (file-based routing)
- TanStack Query v5 (server state) + Zustand v5 (client state)
- React Hook Form + Zod (forms) depuis `packages/shared`
- MapLibre RN v11 (carto native)
- Plausible Events API (analytics)

**Décisions critiques (bloquent l'implémentation mobile) :**

- UI lib : NativeWind v4 (stable)
- Design system : `packages/design-tokens/` (à créer) — single source of truth couleurs/spacings/typography pour web (Tailwind) ET mobile (NativeWind)
- Documentation visuelle : Storybook RN web (`@storybook/react-native-web` v8) — composants primitifs + partagés storybook-ifiés dès MVP
- Auth client : `@better-auth/expo` v1.6+
- OAuth : `expo-auth-session` (PKCE) — Google + Strava
- Storage : `expo-secure-store` + `async-storage` + `expo-file-system`
- Geolocation Live : foreground + `expo-keep-awake`
- Build : EAS Build + EAS Update
- Offline scope MVP : N1 (listing) + N2 (trace GPX) + N3 (POIs + météo par aventure)

**Décisions différées (post-MVP) :**

- Biometric Auth (`expo-local-authentication`)
- Background geolocation (permission `Always` iOS)
- Push notifications (réintroduire si pertinent post-MVP)
- Live Activities iOS (`expo-widgets`)
- 1-tap Google natif (`@react-native-google-signin`) — si l'UX gêne
- NativeWind v5 (upgrade quand stable)
- N4 offline (création/édition aventure offline + sync différée)

---

### UI / Styling

| Décision | Choix | Version | Rationale |
|---|---|---|---|
| UI styling | NativeWind | v4 (stable) | Partage conventions Tailwind avec web, courbe d'apprentissage faible. Upgrade v5 quand stable |
| Design tokens | `packages/design-tokens/` (nouveau package) | — | Single source of truth couleurs/spacings/typography, importé par `apps/web` (Tailwind config) ET `apps/mobile` (NativeWind config). Aligné sur le design system Claude Design |
| Storybook (doc vivante) | `@storybook/react-native-web` | v8 | Catalog des composants primitifs et partagés, validation isolée, hot reload en browser |
| Icons | `lucide-react-native` | latest | Équivalent mobile de `lucide-react` web — cohérence visuelle |
| Theming | preference système + override user | — | Light/Dark, aligné sur l'archi web |
| Animations | `react-native-reanimated` | latest (Expo SDK 55) | Inclus dans Expo SDK |
| Gestures | `react-native-gesture-handler` | latest (Expo SDK 55) | Inclus dans Expo SDK |
| Bottom sheets | `@gorhom/bottom-sheet` | v5 (New Arch) | Pour les fiches POI mobile (alignement web) |

---

### Data Architecture (mobile-side)

| Type de donnée | Storage | Lib | Rationale |
|---|---|---|---|
| JWT tokens (sécurisés) | Keychain iOS / Keystore Android | `expo-secure-store` | RGPD + recommandation Better Auth |
| Préférences user (theme, langue, allure défaut) | AsyncStorage | `@react-native-async-storage/async-storage` | Léger, suffisant. MMKV en option si problèmes perf |
| Cache GPX local (N2) | Filesystem `/cache/gpx/{segmentId}.gpx` | `expo-file-system` | Trace consultable hors ligne |
| Cache POIs par aventure (N3) | Filesystem `/cache/pois/{adventureId}.json` | `expo-file-system` | Résultats API NestJS sérialisés (Google Places primaire + Overpass complément selon flag user) |
| Cache météo par aventure (N3) | Filesystem `/cache/weather/{adventureId}.json` | `expo-file-system` | Prévisions par waypoint |
| Liste aventures (N1) | TanStack Query persist | `@tanstack/react-query-persist-client` + `async-storage` | Listing offline natif |

**Politique de purge cache offline :**

Logique appliquée au démarrage de l'app (`AppState` → `active`) :

1. Si `adventure.end_date` renseignée et `now() - end_date > 10 jours` → purge des fichiers cache
2. Sinon si `adventure.start_date` renseignée et `now() - start_date > 20 jours` → purge (fallback : on suppose que l'aventure n'excède pas 20 jours sans date de fin)
3. Sinon → pas de purge automatique, fallback manuel via bouton "Vider le cache de cette aventure" dans settings

Cette logique se base uniquement sur les champs `start_date` et `end_date` existants — **pas de dépendance backend ni de migration nécessaire**.

---

### Authentication & Security

| Décision | Choix | Version | Rationale |
|---|---|---|---|
| Auth client mobile | `@better-auth/expo` | v1.6+ | Officiel Better Auth, intégration `expo-secure-store`, sortie 2026-05 |
| OAuth Google | `expo-auth-session` (PKCE) | latest | Setup léger, scheme `ridenrest://oauth-google`, migrable vers SDK natif post-MVP si UX gêne |
| OAuth Strava | `expo-auth-session` (PKCE) | latest | Pas de SDK Strava RN, scheme `ridenrest://oauth-strava` |
| Email/password | `@better-auth/expo` natif | — | Inclus, lien avec endpoints Better Auth existants |
| Biometric Auth | ❌ skip MVP | — | Ajout post-MVP via `expo-local-authentication` si demande user |
| Refresh token | Interceptor `fetch` custom | — | Si 401 → refresh → retry, pattern identique web |

**Variable d'environnement partagée :**

`BETTER_AUTH_SECRET` reste identique entre `apps/web/.env.local`, `apps/api/.env`, et le serveur. Côté mobile : aucune exposition du secret (les tokens transitent par les flows Better Auth uniquement). Variables exposées au client mobile via `EXPO_PUBLIC_*` uniquement non sensibles (URL API, clés OAuth client public).

**OAuth setup côté Better Auth (rappel pour mobile) :**

- Whitelist du scheme `ridenrest://` dans la configuration Better Auth (mobile callbacks)
- Adaptation du flow Strava : Strava OAuth nécessite un redirect URI déclaré côté Strava — ajouter `ridenrest://oauth-strava` dans la configuration de l'app Strava (à coordonner avec story dédiée)

---

### API & Communication

| Décision | Choix | Rationale |
|---|---|---|
| HTTP client | `fetch` natif + interceptor custom | Pas d'axios, léger, supporte refresh token via Better Auth |
| Server state | TanStack Query v5 | Identique web — query keys cohérentes |
| Polling jobs (BullMQ) | `refetchInterval` conditionnel sur `parse_status`/`density_status` | Pattern identique web |
| Network detection | `@react-native-community/netinfo` | Detect online/offline transitions, déclenche purges/syncs cache |
| Retry strategy | TanStack Query default + exponential backoff | OK pour MVP |
| Error format | `{ error: { code, message, details } }` | Identique web (ResponseInterceptor NestJS) |
| Types partagés | `packages/shared/` | Réutilisation 100% des Zod schemas et types |

---

### Frontend Architecture (mobile-specific)

| Décision | Choix | Version | Rationale |
|---|---|---|---|
| Routing | Expo Router | aligné SDK 55 | File-based routing, similaire Next.js App Router |
| Server state | TanStack Query | v5 | Identique web |
| Client state | Zustand | v5 | Identique web — stores `useMapStore`, `useLiveStore`, `useUIStore` |
| Forms | React Hook Form + Zod resolver | RHF v7 | Identique web, schemas depuis `packages/shared` |
| Map | MapLibre RN | v11 | New Architecture requise (Expo SDK 55 OK) |
| i18n | `expo-localization` + `i18next` | latest | Architecture posée, FR-only au MVP, EN squelette pour l'avenir |

**Stores Zustand mobile (à structurer en step 6) :**

- `useMapStore` — viewport carte, calques actifs, trace courante
- `useLiveStore` — mode Live, position GPS courante, allure, fenêtre km
- `useUIStore` — modales, sheets, états UI globaux
- `useAuthStore` (potentiellement) — utilisateur courant, tokens (sinon directement via `@better-auth/expo`)

---

### Native Capabilities & Background

| Décision | Choix | Lib | Rationale |
|---|---|---|---|
| Geolocation Live (foreground) | Foreground + screen-on | `expo-location` (`watchPositionAsync`) + `expo-keep-awake` | Permission `When in use`, simplifie sortie store, l'écran sur le guidon reste allumé |
| Background geolocation | ❌ skip MVP | — | Ajout post-MVP si demande users (long brevets sans toucher au tel) |
| Push notifications | ❌ skip MVP | — | Cohérent avec absence geoloc background — pas d'usage clair sans suivi continu |
| App lifecycle | React Native `AppState` API | — | Pause/reprise polling TanStack Query, déclencheur purge cache offline |
| Permissions runtime | géoloc + accès fichiers | `expo-location`, `expo-document-picker` | Prompts iOS/Android avec rationale clair |

---

### Infrastructure & Deployment

| Décision | Choix | Rationale |
|---|---|---|
| Build pipeline | EAS Build (free tier 30 builds/mois) | Cloud, intégré Expo, suffit MVP |
| OTA Updates | EAS Update (gratuit) | Push patches JS sans soumission store |
| CI/CD | GitHub Actions → trigger EAS Build sur push tag `v*` | Aligné avec workflow existant web |
| Crash reporting | Sentry React Native (free 5k events/mois) | JS errors + native crashes via source maps Metro |
| Analytics | Plausible Events API (`POST /api/event` vers `stats.ridenrest.app`) | Réutilise l'infra existante, un seul dashboard web + mobile |
| Tests unit | Jest + React Native Testing Library | Préconfigurés via Expo |
| Tests E2E | Maestro | Plus simple que Detox, smoke pré-release |
| Distribution | TestFlight (iOS) + Internal Testing (Google) → Production stores | Pipeline standard |

---

### Decision Impact Analysis

**Implementation Sequence (séquence recommandée) :**

1. **Setup mobile foundation**
   - `apps/mobile/` via `create-expo-app --template with-router`
   - Configuration monorepo (`.npmrc node-linker=hoisted`, `metro.config.js` avec `watchFolders`)
   - Pipeline Turborepo (`dev:mobile`, `build:mobile`)
   - Provision Apple Developer Program ($99/an, validation D-U-N-S → démarrer tôt) + Google Play Console ($25)

2. **Auth foundation**
   - `@better-auth/expo` + `expo-secure-store`
   - OAuth `expo-auth-session` Google + Strava (whitelist schemes côté Better Auth + Strava)
   - Écrans login / signup / reset password

3. **Adventures + GPX (réutilisation API)**
   - Listing aventures (TanStack Query persist N1)
   - Upload GPX (`expo-document-picker`)
   - Cache GPX local (N2 — `expo-file-system`)

4. **Map + POIs**
   - Intégration MapLibre RN v11 (Dev Client requis dès cette étape)
   - Recherche corridor (réutilise endpoint NestJS — Google Places primaire + Overpass complément selon flag user)
   - Cache POIs par aventure (N3)
   - Pins SVG + clusters portés depuis web

5. **Live Mode**
   - `expo-location` foreground + `expo-keep-awake`
   - Géoloc + filtrage POIs prochains km
   - Réutilise endpoints NestJS (RGPD : position GPS jamais transmise au serveur, filtrage client-side ou bbox anonymisée)

6. **Météo + cache offline**
   - Réutilise endpoint météo
   - Cache météo par aventure (N3)

7. **Polish & sortie store**
   - i18n setup (`expo-localization` + `i18next` FR)
   - Plausible Events integration
   - Sentry RN
   - Maestro E2E smoke
   - Privacy Nutrition Labels + Data Safety
   - Submission TestFlight + Internal Testing → stores

**Cross-Component Dependencies :**

- `BETTER_AUTH_SECRET` partagé entre apps/web et apps/api ; mobile consomme via flows Better Auth (pas d'exposition du secret)
- `packages/shared` (types + schemas Zod) consommé par les 3 apps (web, api, mobile)
- `packages/gpx` (parsing, distances) consommé par api + mobile
- `packages/database` (types Drizzle inférés) consommé par api + mobile (types uniquement)
- Whitelist schemes `ridenrest://oauth-*` à ajouter dans config Better Auth + Strava OAuth app
- Pas de migration backend nécessaire pour le scope MVP mobile (réutilise `start_date` / `end_date` existants pour la logique purge cache)

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** ~10 zones où plusieurs agents (humains ou IA) pourraient diverger : nommage fichiers Expo Router, structure dossiers, configuration Expo, styling NativeWind, stores Zustand, deep links OAuth, gestion permissions, lifecycle, cache offline, tests.

### Patterns hérités de l'archi web

Tous les patterns suivants sont **déjà documentés dans `architecture.md` web** et restent valides côté mobile :

| Domaine | Convention héritée |
|---|---|
| Database | Tables `snake_case` plurielles, colonnes `snake_case`, FK `{singular}_id` |
| Endpoints REST | Plural kebab-case, query params `camelCase`, max 1 niveau nesting |
| API JSON fields | `camelCase` (sérialisation Drizzle) |
| Dates | ISO 8601 toujours (jamais Unix timestamps) |
| Coordonnées | `{ lat, lng }` toujours (jamais arrays) |
| Booléens | `true/false` (jamais 1/0) |
| Query keys TanStack | `['adventures']`, `['adventures', id]`, `['adventures', id, 'segments']`, `['pois', { segmentId, fromKm, toKm, layer }]` |
| Validation | Zod schemas depuis `packages/shared/schemas/` — jamais dupliquer |
| Types DB | Depuis `packages/database` — jamais redéfinir |
| Erreur API | `{ error: { code, message, details } }` |
| Error handling | Pas de `try/catch` sauf aux frontières (boundary) |
| RGPD géoloc | Position GPS jamais transmise au serveur — filtrage client-side ou bbox anonymisée |

**Règle générale :** si une convention existe déjà côté web, le mobile l'applique à l'identique. Aucune divergence sans raison documentée.

---

### Naming Patterns (mobile-spécifiques)

**Nommage fichiers `apps/mobile/` :**

| Type | Convention | Exemple |
|---|---|---|
| Routes Expo Router | `kebab-case.tsx` (idem web) | `app/(app)/adventures/[id].tsx` |
| Layouts Expo Router | `_layout.tsx` (convention Expo) | `app/(app)/_layout.tsx` |
| Route groups | `(name)/` | `app/(auth)/login.tsx`, `app/(app)/adventures/...` |
| Composants | `kebab-case.tsx` (alignement web) | `components/adventure-card.tsx` |
| Hooks | `use-*.ts` | `hooks/use-adventures.ts` |
| Stores Zustand | `*.store.ts` | `stores/map.store.ts` |
| Lib utilitaires | `kebab-case.ts` | `lib/api-client.ts`, `lib/cache-manager.ts` |
| Tests co-localisés | `*.test.ts` / `*.test.tsx` | `lib/api-client.test.ts` |

---

### Structure Patterns

**Structure `apps/mobile/` :**

```
apps/mobile/
  app/                          ← Expo Router (file-based)
    _layout.tsx                 ← Root layout (providers TanStack/Zustand/Theme)
    (auth)/
      _layout.tsx               ← Layout auth (redirect si déjà authentifié)
      login.tsx
      signup.tsx
      reset-password.tsx
    (app)/
      _layout.tsx               ← Layout app (auth guard + tabs/drawer si nécessaire)
      adventures/
        index.tsx               ← Liste
        [id].tsx                ← Détail
        new.tsx                 ← Création
      map/[id].tsx
      live/[id].tsx
      settings.tsx
  components/
    ui/                         ← Composants primitifs réutilisables (Button, Input, ...)
    shared/                     ← Composants partagés cross-features
    adventure/
      adventure-card.tsx
      ...
  hooks/
    use-adventures.ts
    use-pois.ts
    use-live-mode.ts
    use-network-status.ts
    use-cache-purge.ts
  stores/
    map.store.ts
    live.store.ts
    ui.store.ts
  lib/
    auth/                       ← @better-auth/expo client + helpers
      client.ts
      oauth-google.ts
      oauth-strava.ts
    api/
      api-client.ts             ← fetch + interceptor refresh token
    cache/
      cache-manager.ts          ← logique purge (start_date / end_date)
      gpx-cache.ts              ← /cache/gpx/
      poi-cache.ts              ← /cache/pois/
      weather-cache.ts          ← /cache/weather/
    map/
      maplibre-config.ts
      pin-factory.ts
    analytics/
      plausible.ts              ← POST /api/event vers stats.ridenrest.app
    i18n/
      i18n.config.ts
      locales/
        fr.json
        en.json                 ← squelette
  assets/
    images/
    icons/
  app.config.ts                 ← Config Expo (schemes, plugins, permissions)
  metro.config.js               ← Adapté monorepo (watchFolders packages/)
  babel.config.js
  tsconfig.json                 ← Étend packages/typescript-config
  eas.json                      ← Profils EAS Build
  package.json
```

---

### Configuration & environnement

| Convention | Règle |
|---|---|
| Config Expo | `app.config.ts` (TypeScript) — **jamais** `app.json` (TS plus puissant, conditionnels) |
| Variables d'env publiques | `EXPO_PUBLIC_*` (exposées au bundle JS) — exemples : `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` |
| Secrets | **Jamais** dans le bundle JS — toujours côté serveur |
| Path aliases | `@/*` → `./src/*` (layout `src/` du template SDK 56, identique à `apps/web`) — config dans `tsconfig.json` + `babel.config.js` *(amendé MOB-1.1 : initialement « racine `apps/mobile/` »)* |
| Plugins Expo | Déclarés dans `app.config.ts` (`plugins: [...]`) — chaque lib native (`@maplibre/maplibre-react-native`, `expo-location`, etc.) ajoute son entrée |

---

### Styling — NativeWind

| Convention | Règle |
|---|---|
| Application classes | `className="..."` sur les composants RN (`<View>`, `<Text>`) — **jamais** styles inline RN si NativeWind est applicable |
| Combinaisons conditionnelles | Helper `cn()` (utilisant `clsx` + `tailwind-merge`) — alignement avec web |
| Couleurs dynamiques (POI) | **Style inline obligatoire** (héritage web) — Tailwind JIT ne peut pas générer `bg-[${color}]` au runtime |
| Theming light/dark | Variables CSS via `nativewind` config + `useColorScheme()` hook |
| Reuse de conventions design | Tokens identiques au web (espacements, couleurs primary/secondary, typography) — partagés via `packages/shared/design-tokens.ts` (à créer) |

---

### State Management

| Store | Convention identique web | Spécificités mobile |
|---|---|---|
| `useMapStore` | Idem web | Adapter aux APIs MapLibre RN (méthodes `cameraRef`, `mapRef`) |
| `useLiveStore` | Idem web | Ajouter `isScreenOn: boolean` (état `expo-keep-awake`) |
| `useUIStore` | Idem web | Ajouter `currentRoute` (Expo Router) si nécessaire |

**Règle :** la logique métier reste dans `packages/shared` et `packages/gpx`. Les stores Zustand mobile = uniquement UI state, pas de business logic.

---

### Routing & deep links

| Convention | Règle |
|---|---|
| Scheme custom app | `ridenrest://` (déclaré dans `app.config.ts`) |
| Deep links OAuth | `ridenrest://oauth-google`, `ridenrest://oauth-strava` |
| Auth gating | `_layout.tsx` du groupe `(app)/` vérifie session via `@better-auth/expo` → redirect `(auth)/login` si non connecté |
| Navigation programmatique | `useRouter()` from `expo-router` — `router.push('/adventures/123')` |
| Params dynamiques | `useLocalSearchParams<{ id: string }>()` — typed |
| Loading transitions | `<Stack.Screen options={{ animation: 'slide_from_right' }} />` ou défaut iOS/Android |

---

### API & Communication Patterns

| Pattern | Règle |
|---|---|
| HTTP client | `lib/api/api-client.ts` exporte `apiFetch()` — wrapper `fetch` + Bearer JWT auto-injecté + interceptor 401 → refresh token |
| Aucun `axios`, `ky`, etc. | `fetch` natif uniquement |
| Endpoints API | Constantes dans `packages/shared/constants/api.constants.ts` (alignement web) |
| Types DTOs | Importés depuis `packages/shared/types/` |
| Validation entrées | Zod schemas depuis `packages/shared/schemas/` — RHF resolver |

---

### Native capabilities & permissions

| Permission | Convention |
|---|---|
| Géoloc | Demande explicite avec rationale dialog AVANT le prompt iOS/Android. Composant réutilisable `<GeolocationConsent />` |
| Document picker | Demande lors du tap sur le bouton upload (pas en pré-fetch) |
| Notifications | Pas demandées au MVP |

| Lifecycle | Convention |
|---|---|
| `AppState` listener | **Un seul** listener centralisé dans `app/_layout.tsx` — déclenche : check cache purge, refetch queries critiques, log analytics session |
| `expo-keep-awake` | Activé **uniquement** dans le layout `live/[id]` — désactivé à la sortie du mode |

---

### Cache offline (logique stricte)

```typescript
// lib/cache/cache-manager.ts — pseudo-code consigne
async function shouldPurgeAdventure(adventure: Adventure): Promise<boolean> {
  const now = Date.now()
  const TEN_DAYS = 10 * 24 * 60 * 60 * 1000
  const TWENTY_DAYS = 20 * 24 * 60 * 60 * 1000

  if (adventure.endDate) {
    return now - new Date(adventure.endDate).getTime() > TEN_DAYS
  }
  if (adventure.startDate) {
    return now - new Date(adventure.startDate).getTime() > TWENTY_DAYS
  }
  return false  // Ni start ni end : pas de purge auto, fallback manuel
}
```

---

### Loading states & errors

| Pattern | Règle |
|---|---|
| Loading | `isPending` from TanStack Query → toujours `<Skeleton />` ou `<ActivityIndicator />` (jamais blocage UI total) |
| Error UI | Inline `<ErrorBanner />` dans le composant (jamais Alert.alert pour erreurs réseau) |
| Network offline | `<StatusBanner message="Mode hors ligne" />` global (déclenché par `useNetworkStatus`) |
| Permission refusée | Dialog explicatif + lien settings iOS/Android (`Linking.openSettings()`) |
| Deep link callback | `app/oauth-callback.tsx` (route dédiée) → traitement → `router.replace('/adventures')` |

---

### Tests

| Type | Convention |
|---|---|
| Unit | Co-localisés `*.test.ts` (alignement web/api) |
| Composants | React Native Testing Library + `render` |
| Hooks | `@testing-library/react-hooks` (compatible RN) |
| E2E | Maestro (`.maestro/*.yaml`) — un flow par feature critique (login, create adventure, live mode) |
| Mocks | `__mocks__/` pour libs natives (`expo-location`, `expo-secure-store`, MapLibre RN) |

### Storybook stories

| Convention | Règle |
|---|---|
| Naming fichier | `*.stories.tsx` co-localisés avec le composant (`button.tsx` ↔ `button.stories.tsx`) |
| Scope | Composants UI primitifs (`components/ui/*`) + composants partagés (`components/shared/*`) + composants adventure/live légers |
| Hors scope | Écrans complets (`app/`), composants natifs lourds (MapLibre, geoloc) |
| Structure story | Default export `meta` + named exports `Default`, `WithError`, `Loading`, `Dark`, etc. (variantes) |
| Decorators globaux | Theme provider (light/dark toggle), font provider, NativeWind preset |
| Dossier config | `.storybook/` à la racine de `apps/mobile/` (`main.ts`, `preview.tsx`) |
| Lancement | `pnpm storybook:mobile` → ouvre Storybook web (port dédié) avec hot reload |

---

### Enforcement Guidelines

**Tout agent (humain ou IA) DOIT :**

- Réutiliser les conventions web (DB, API, query keys, dates, coordonnées) — aucune divergence sans raison documentée
- Structurer `apps/mobile/` selon l'arborescence ci-dessus
- Utiliser NativeWind pour le styling (`className=`), style inline uniquement pour les couleurs runtime
- Importer depuis `packages/shared`, `packages/gpx`, `packages/database` — jamais redéfinir localement
- Stocker les tokens dans `expo-secure-store`, jamais dans `AsyncStorage` en clair
- Centraliser les listeners `AppState` dans `app/_layout.tsx`
- Activer `expo-keep-awake` uniquement dans le layout Live Mode
- Respecter la règle RGPD : position GPS jamais transmise au serveur

---

### Anti-patterns interdits

```typescript
// ❌ Style inline RN quand NativeWind suffit
<View style={{ padding: 16, backgroundColor: '#fff' }} />
// ✅ NativeWind
<View className="p-4 bg-white" />

// ❌ Couleur dynamique en Tailwind JIT (échec silencieux)
<View className={`bg-[${poiColor}]`} />
// ✅ Style inline pour les couleurs runtime
<View style={{ backgroundColor: poiColor }} />

// ❌ Axios ou autre client HTTP
import axios from 'axios'
// ✅ fetch natif via apiClient
import { apiFetch } from '@/lib/api/api-client'

// ❌ Logique métier dans un screen
function AdventureScreen() {
  const distance = haversine(...)  // ne pas calculer ici
}
// ✅ Importer depuis packages/gpx
import { haversine } from '@ridenrest/gpx'

// ❌ AsyncStorage pour les tokens
AsyncStorage.setItem('jwt', token)  // pas chiffré, accessible
// ✅ SecureStore pour tout secret
SecureStore.setItemAsync('jwt', token)

// ❌ Position GPS envoyée au serveur (RGPD violation)
fetch('/pois', { body: JSON.stringify({ lat, lng }) })
// ✅ Filtrage client-side ou bbox anonymisée
const pois = await apiFetch('/pois?segmentId=x&fromKm=10&toKm=50')

// ❌ app.json (perte de la flexibilité TS)
// ✅ app.config.ts avec types
import type { ExpoConfig } from 'expo/config'
export default ({ config }): ExpoConfig => ({ ... })

// ❌ Plusieurs AppState listeners éparpillés
useEffect(() => { AppState.addEventListener(...) }, [])  // dans plusieurs composants
// ✅ Un seul listener centralisé dans app/_layout.tsx

// ❌ Composant qui appelle fetch directement
function PoiList() {
  const data = await fetch('/pois')  // pas de cache, pas de retry
}
// ✅ TanStack Query hook
const { data } = useQuery({ queryKey: ['pois', ...], queryFn: () => apiFetch('/pois') })
```

## Project Structure & Boundaries

### Requirements to Structure Mapping

**FR Domain → fichiers mobile :**

| Domaine FR | Stories backend réutilisées | Fichiers mobile principaux |
|---|---|---|
| Auth (FR-001→007) | Epic 2 backend déjà shippé | `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`, `app/(auth)/reset-password.tsx`, `app/oauth-callback.tsx`, `lib/auth/client.ts`, `lib/auth/oauth-google.ts`, `lib/auth/oauth-strava.ts`, auth guard dans `app/(app)/_layout.tsx`, suppression compte dans `app/(app)/settings.tsx` |
| Adventures/GPX (FR-010→019) | Epic 3 backend déjà shippé | `app/(app)/adventures/index.tsx`, `app/(app)/adventures/[id].tsx`, `app/(app)/adventures/new.tsx`, `components/adventure/adventure-card.tsx`, `components/adventure/segment-list.tsx`, `components/adventure/gpx-uploader.tsx` (expo-document-picker), `hooks/use-adventures.ts`, `hooks/use-segments.ts`, `lib/cache/gpx-cache.ts` |
| Map & Viz (FR-020→027) | Epic 4 backend déjà shippé | `app/(app)/map/[id].tsx`, `components/map/map-canvas.tsx` (MapLibre RN), `components/map/density-overlay.tsx`, `components/map/poi-layer.tsx`, `components/map/layer-toggles.tsx`, `components/map/poi-detail-sheet.tsx` (@gorhom/bottom-sheet), `components/shared/osm-attribution.tsx`, `lib/map/pin-factory.ts`, `lib/map/maplibre-config.ts` |
| POI Planning (FR-030→036) | Epic 4+5 backend shippés | `components/map/search-range-slider.tsx`, `components/shared/poi-card.tsx`, `hooks/use-pois.ts`, `lib/cache/poi-cache.ts`, `lib/external-links.ts` (Linking.openURL pour Booking/Hotels.com/Airbnb) |
| POI Live (FR-040→045) | Epic 7 backend shippé | `app/(app)/live/[id].tsx`, `components/live/live-map-canvas.tsx`, `components/live/geolocation-consent.tsx`, `components/live/speed-input.tsx`, `components/live/live-poi-list.tsx`, `hooks/use-live-mode.ts`, activation `expo-keep-awake` dans `app/(app)/live/_layout.tsx` |
| Weather (FR-050→055) | Epic 6 backend shippé | `components/map/weather-strip.tsx`, `components/live/live-weather.tsx` (si réintroduit), `hooks/use-weather.ts`, `lib/cache/weather-cache.ts` |
| External (FR-060→063) | — | `components/shared/poi-card.tsx` (deep links), `lib/external-links.ts`, `lib/analytics/plausible.ts` (event tracking clics) |
| ~~PWA (FR-070→073)~~ | — | ❌ Hors périmètre — capacités natives à la place |

**Cross-cutting concerns → fichiers mobile :**

| Concern | Localisation |
|---|---|
| Auth gating | `app/(app)/_layout.tsx` — vérifie session, redirect login |
| AppState lifecycle | `app/_layout.tsx` — listener centralisé (purge cache, refetch, log session) |
| Network detection | `hooks/use-network-status.ts` + bannière `components/shared/status-banner.tsx` |
| Cache purge | `lib/cache/cache-manager.ts` — déclenché au foreground app via AppState |
| i18n | `lib/i18n/i18n.config.ts`, `lib/i18n/locales/{fr,en}.json` |
| Analytics | `lib/analytics/plausible.ts` — events vers `stats.ridenrest.app/api/event` |
| Crash reporting | Sentry init dans `app/_layout.tsx` (avant tout autre code) |

---

### Architectural Boundaries

**Frontière API ↔ Mobile :**

```
Public (no auth)  : aucun (toute l'app est auth-gated, sauf landing web)
Protected (JWT)   : tous les endpoints — Bearer JWT auto-injecté via apiFetch()
Rate-limited      : @nestjs/throttler global (déjà actif côté backend)
Mobile → API      : apps/mobile/lib/api/api-client.ts (fetch + interceptor refresh)
Refresh token     : interceptor 401 → POST /api/auth/refresh → retry
```

**Frontière données :**

```
packages/database  → apps/mobile (types Drizzle inférés uniquement, pas de queries)
packages/shared    → apps/mobile (Zod schemas, types DTOs, constantes)
packages/gpx       → apps/mobile (Haversine, RDP, distances cumulatives — partagé api+mobile)
expo-file-system   → /cache/gpx/, /cache/pois/, /cache/weather/ — stockage local sandboxé
expo-secure-store  → JWT tokens, refresh tokens (Keychain/Keystore)
GPS (geolocation)  → JAMAIS sortir du device (RGPD strict, identique web)
```

**Frontière native ↔ JS (plugins Expo requis) :**

| Plugin natif | Justification |
|---|---|
| `@maplibre/maplibre-react-native` | Carto native (Metal/OpenGL) |
| `expo-location` | Géoloc Live Mode |
| `expo-secure-store` | Keychain/Keystore tokens |
| `expo-file-system` | Cache GPX + POIs + météo |
| `expo-document-picker` | Upload GPX |
| `expo-keep-awake` | Écran allumé en Live Mode |
| `expo-localization` | Détection locale système (i18n) |
| `expo-auth-session` | OAuth PKCE flows |
| `expo-linking` | Deep links `ridenrest://` |
| `expo-updates` | OTA Updates (EAS Update) |
| `@sentry/react-native` | Crash reporting (JS + natif) |

> **Note** : Tous ces plugins nécessitent **Expo Dev Client** (Expo Go ne supporte pas les plugins natifs custom). Build initial via EAS Build.

**Frontière permissions iOS / Android :**

| Permission | iOS (`Info.plist`) | Android (`AndroidManifest.xml`) |
|---|---|---|
| Géoloc foreground | `NSLocationWhenInUseUsageDescription` | `ACCESS_FINE_LOCATION` |
| Document picker | (aucune — built-in) | (aucune — SAF) |
| Notifications (V2) | `NSUserNotificationsUsageDescription` | `POST_NOTIFICATIONS` |

Toutes les justifications déclarées dans `app.config.ts` apparaîtront dans Privacy Nutrition Labels (Apple) + Data Safety form (Google).

---

### Data Flow Patterns

**1. Authentification OAuth (Google / Strava)**

```
User tap "Continuer avec Google"
  → expo-auth-session ouvre browser (ASWebAuthenticationSession iOS / Custom Tabs Android)
  → User valide compte Google
  → Redirect vers ridenrest://oauth-google?code=xxx
  → app/oauth-callback.tsx capture le code via expo-linking
  → POST /api/auth/sign-in/social/google { code } via apiFetch()
  → Backend Better Auth valide + émet { accessToken, refreshToken }
  → expo-secure-store stocke les tokens
  → router.replace('/adventures')
```

**2. Upload GPX**

```
User tap "Ajouter un segment"
  → expo-document-picker ouvre le file picker natif
  → User sélectionne un .gpx
  → apps/mobile lit le fichier via FileSystem.readAsStringAsync()
  → POST /api/segments (multipart) via apiFetch()
  → Backend stocke /data/gpx/{segmentId}.gpx + BullMQ 'parse-segment'
  → TanStack Query polling refetchInterval 3s sur ['adventures', id, 'segments']
  → Quand parseStatus === 'done' → polling stop
  → Cache local : FileSystem.copyAsync vers /cache/gpx/{segmentId}.gpx (lazy, première consultation map)
```

**3. Recherche POIs (Planning)**

```
User ajuste range slider (fromKm, toKm) → tap "Rechercher"
  → useMapStore.setSearchCommitted(true)
  → use-pois.ts → useQuery({ queryKey: ['pois', { segmentId, fromKm, toKm, layer }] })
  → apiFetch('/pois?segmentId=X&fromKm=10&toKm=50&overpassEnabled=false')
  → Backend Redis check → Google Places (primaire) + Overpass (selon flag user) → Response
  → TQ cache + render pins MapLibre RN
  → Cache local : /cache/pois/{adventureId}.json mis à jour
```

**4. Mode Live (geoloc + POIs)**

```
User entre en mode Live → GeolocationConsent affiché
  → User accepte → expo-location requestForegroundPermissionsAsync
  → expo-keep-awake activate (écran allumé)
  → expo-location.watchPositionAsync onUpdate → useLiveStore.setPosition({lat, lng})
  → use-live-mode.ts calcule prochains 20km (filtrage client-side)
  → apiFetch('/pois?segmentId=X&fromKm=Y&toKm=Y+20') (pas de lat/lng dans la requête, RGPD)
  → Filtrage final côté client par distance perpendiculaire
  → Render pins + polygone corridor
  → Position GPS jamais loggée serveur
```

**5. Météo (pace-adjusted)**

```
User ouvre map d'une aventure
  → use-weather.ts → useQuery({ queryKey: ['weather', segmentId, departureTime, speed] })
  → apiFetch('/weather?segmentId=X&departureTime=T&speedKmh=15')
  → Backend Redis check → WeatherAPI.com → interpolation temporelle → Response
  → Cache local : /cache/weather/{adventureId}.json mis à jour
```

**6. Cache offline + purge**

```
App passe foreground (AppState change → 'active')
  → app/_layout.tsx listener déclenche cacheManager.checkPurge()
  → cacheManager parcourt aventures persistées (TanStack Query persist)
  → Pour chaque adventure :
      - Si end_date renseignée et now() - end_date > 10j → purge fichiers
      - Sinon si start_date renseignée et now() - start_date > 20j → purge fichiers
      - Sinon → garde
  → Suppression : FileSystem.deleteAsync /cache/gpx/{segmentId}.gpx + /cache/pois/{adventureId}.json + /cache/weather/{adventureId}.json
```

**7. OTA Updates (post-deploy)**

```
Push patch JS → eas update --branch production
  → Au lancement app suivant : expo-updates check + download + apply
  → User redémarre l'app → nouvelle version active sans soumission store
  → Limites : seules les modifs JS/assets, pas les changements natifs
```

---

### Détail fichiers complémentaires

```
apps/mobile/
  __mocks__/                    ← mocks pour libs natives en tests
    expo-location.ts
    expo-secure-store.ts
    @maplibre__maplibre-react-native.ts
  .maestro/                     ← E2E flows
    login.yaml
    create-adventure.yaml
    live-mode.yaml
  .storybook/                   ← Config Storybook RN web
    main.ts                     ← stories patterns, addons
    preview.tsx                 ← decorators (theme provider, font, NativeWind preset)
  .easignore                    ← exclude files from EAS Build
  .gitignore
  app.config.ts
  babel.config.js
  metro.config.js
  tsconfig.json
  eas.json
  package.json
  app/
    _layout.tsx                 ← Root: providers + AppState listener + Sentry init
    +not-found.tsx              ← 404 fallback Expo Router
    oauth-callback.tsx          ← Capture deep link OAuth
    (auth)/
      _layout.tsx               ← Redirect si déjà authentifié
      login.tsx
      signup.tsx
      reset-password.tsx
    (app)/
      _layout.tsx               ← Auth guard + tab/drawer si pertinent
      adventures/
        index.tsx               ← Liste FR-010, FR-018
        [id].tsx                ← Détail FR-015, FR-017
        new.tsx                 ← Création FR-010, FR-011
      map/[id].tsx              ← FR-020→036
      live/
        _layout.tsx             ← expo-keep-awake activation
        [id].tsx                ← FR-040→045
      settings.tsx              ← FR-005, FR-021, theme, langue, overpass toggle, vidage cache manuel, liens externes Privacy + CGU (Linking.openURL vers ridenrest.app/privacy et /terms)
  components/
    ui/                                ← + *.stories.tsx co-localisés
      button.tsx + button.stories.tsx
      input.tsx + input.stories.tsx
      sheet.tsx + sheet.stories.tsx    ← @gorhom/bottom-sheet wrapper
      skeleton.tsx + skeleton.stories.tsx
      slider.tsx + slider.stories.tsx
    shared/                            ← + *.stories.tsx co-localisés
      error-banner.tsx + error-banner.stories.tsx
      status-banner.tsx + status-banner.stories.tsx
      osm-attribution.tsx
      poi-card.tsx + poi-card.stories.tsx
    adventure/                         ← + *.stories.tsx co-localisés
      adventure-card.tsx + adventure-card.stories.tsx
      segment-list.tsx + segment-list.stories.tsx
      gpx-uploader.tsx
    map/                               ← Pas de stories (composants natifs lourds)
      map-canvas.tsx
      density-overlay.tsx
      poi-layer.tsx
      layer-toggles.tsx
      poi-detail-sheet.tsx
      search-range-slider.tsx + search-range-slider.stories.tsx
      weather-strip.tsx + weather-strip.stories.tsx
    live/                              ← Stories légères uniquement
      live-map-canvas.tsx
      geolocation-consent.tsx + geolocation-consent.stories.tsx
      speed-input.tsx + speed-input.stories.tsx
      live-poi-list.tsx
  hooks/
    use-adventures.ts
    use-segments.ts
    use-pois.ts
    use-weather.ts
    use-density.ts
    use-live-mode.ts
    use-network-status.ts
    use-cache-purge.ts
    use-color-scheme.ts
  stores/
    map.store.ts
    live.store.ts
    ui.store.ts
  lib/
    auth/
      client.ts
      oauth-google.ts
      oauth-strava.ts
    api/
      api-client.ts
      api-endpoints.ts          ← imports packages/shared/constants/api.constants.ts
    cache/
      cache-manager.ts
      gpx-cache.ts
      poi-cache.ts
      weather-cache.ts
    map/
      maplibre-config.ts
      pin-factory.ts
    analytics/
      plausible.ts
    i18n/
      i18n.config.ts
      locales/
        fr.json
        en.json                 ← squelette
    external-links.ts           ← Booking/Hotels.com/Airbnb deep links
    cn.ts                       ← clsx + twMerge helper
  assets/
    images/
    icons/
      poi/                      ← SVGs pins partagés avec web
        accommodation.svg
        food.svg
        ...
```

---

### File Organization Patterns

| Type | Convention |
|---|---|
| Configuration | Racine `apps/mobile/` (`app.config.ts`, `metro.config.js`, `babel.config.js`, `tsconfig.json`, `eas.json`) |
| Source | `app/` (routes), `components/`, `hooks/`, `stores/`, `lib/`, `assets/` |
| Tests unit | Co-localisés `*.test.ts` à côté du fichier testé |
| Tests E2E | `.maestro/*.yaml` à la racine de `apps/mobile/` |
| Mocks | `__mocks__/` à la racine de `apps/mobile/` |
| Static assets | `assets/` (images, icônes) — référencés via `require()` ou `import` |

---

### Development Workflow Integration

| Phase | Commande | Output |
|---|---|---|
| Dev local | `pnpm dev:mobile` (ou `pnpm exec expo start --dev-client`) | Metro bundler + Dev Client |
| Build dev (Dev Client) | `eas build --profile development --platform ios` | IPA dev signé pour TestFlight interne |
| Build preview | `eas build --profile preview` | APK / IPA pour internal testing |
| Build production | `eas build --profile production` | App Store / Google Play binaire |
| OTA update | `eas update --branch production` | Patch JS pushé aux clients |
| Submit | `eas submit --platform ios` (ou `android`) | Soumission TestFlight / Internal Testing |
| Tests unit | `pnpm test:mobile` | Jest + RNTL |
| Tests E2E | `maestro test .maestro/login.yaml` | Maestro CLI |
| Storybook | `pnpm storybook:mobile` | Storybook web (browser) avec hot reload |

## Architecture Validation Results

### Coherence Validation ✅

**Compatibilité versions :**

| Stack | Compatibilité | Note |
|---|---|---|
| Expo SDK 55 + React 19.2 + RN 0.83 | ✅ | Sortie Feb 2026, stable |
| Expo Router (file-based) + Expo SDK 55 | ✅ | First-class support |
| MapLibre RN v11 + New Architecture | ✅ | Expo SDK 55 = New Arch par défaut |
| `@better-auth/expo` v1.6+ + Better Auth backend | ✅ | Officiel Better Auth, lib publiée 2026-05 |
| NativeWind v4 + Expo SDK 55 | ✅ | Stable, alignement Tailwind v4 web |
| Storybook RN web v8 + NativeWind v4 | ✅ | Setup standard, hot reload browser |
| TanStack Query v5 + React 19 | ✅ | Compatible |
| Zustand v5 + React 19 | ✅ | Compatible |
| @gorhom/bottom-sheet v5 + RN + New Arch | ✅ | Support v5 New Arch |
| `expo-secure-store` + Better Auth | ✅ | Recommandation officielle |
| `expo-location` + iOS 16+ / Android 24+ | ✅ | Cible plateforme alignée web (PRD) |
| `expo-auth-session` + PKCE | ✅ | Standard OAuth mobile |
| Sentry RN + Expo SDK 55 | ✅ | Plugin officiel |

**Pattern Consistency :**

- Nommage aligné web (kebab-case fichiers, snake_case DB, camelCase API JSON) ✅
- Stores Zustand cohérents avec conventions web (`use{Domain}Store`) ✅
- Query keys TanStack identiques web (`['adventures', id, 'segments']`) ✅
- `ResponseInterceptor` backend = même format mobile (zéro divergence) ✅
- Règle RGPD respectée : position GPS jamais transmise au serveur ✅
- Heritage des packages (`shared`, `gpx`, `database`) — aucune duplication ✅
- Stories `*.stories.tsx` co-localisées avec les composants (alignement convention test) ✅

**Structure Alignment :**

- `apps/mobile/` s'intègre dans le monorepo Turborepo + pnpm existant ✅
- Réutilise `packages/typescript-config`, `packages/shared`, `packages/gpx`, `packages/database` ✅
- Nouveau `packages/design-tokens/` créé pour single source of truth web ↔ mobile ✅
- `.npmrc node-linker=hoisted` documenté (Metro / pnpm symlinks) ✅
- Frontières GPS / serveur / fichiers locaux clairement délimitées ✅

---

### Requirements Coverage Validation ✅

**Functional Requirements — 48/52 FRs couverts ; 4 FRs PWA intentionnellement exclus :**

| Domaine | FRs | Couverture |
|---|---|---|
| Auth (FR-001→007) | 7 | ✅ `@better-auth/expo`, `expo-auth-session`, écrans login/signup/reset |
| Adventures/GPX (FR-010→019) | 10 | ✅ API NestJS + `expo-document-picker` + cache local |
| Map/Viz (FR-020→027) | 8 | ✅ MapLibre RN v11 + `density-overlay` + `osm-attribution` |
| POI Planning (FR-030→036) | 7 | ✅ Range slider + corridor backend + deep links + density |
| POI Live (FR-040→045) | 6 | ✅ `expo-location` foreground + filtrage client-side + status banner |
| Météo (FR-050→055) | 6 | ✅ Weather endpoint backend + cache local par aventure |
| Affiliés (FR-060→063) | 4 | ✅ Deep links Linking.openURL + Plausible Events |
| ~~PWA (FR-070→073)~~ | ~~4~~ | ❌ Hors périmètre — décision projet |

**Non-Functional Requirements :**

| Catégorie | Couverture | Statut |
|---|---|---|
| Performance | Cold start <2s, 60fps, battery drain Live Mode | ⚠️ Cibles à valider en testing terrain |
| Security | JWT via `expo-secure-store`, HTTPS backend, pas de geoloc serveur | ✅ |
| Reliability | Offline N1+N2+N3, gestion `AppState`, `netinfo` | ✅ |
| Integration | Rate limits backend inchangés, conformité App Store 4.2 / Privacy Labels | ✅ |
| Stockage | RGPD respecté (Keychain/Keystore + sandboxed FS) | ✅ |

---

### Implementation Readiness ✅

| Aspect | Niveau |
|---|---|
| Décisions documentées avec versions | ✅ Élevé — toutes versions vérifiées web mai 2026 |
| Patterns d'implémentation | ✅ Élevé — anti-patterns inclus, exemples concrets |
| Structure complète | ✅ Élevé — fichier par fichier mapped (FR → fichier) |
| Frontières clairement définies | ✅ Élevé — API, données, native↔JS, permissions |
| Examples (code snippets) | ✅ Bon — pseudo-code purge, anti-patterns Tailwind, stories |

---

### Gap Analysis Results

**Critical (à adresser avant implémentation) :** Aucun gap critique identifié. Le scope MVP est implémentable tel quel.

**Important (à clarifier dès le début de l'implémentation) :**

1. **Cibles NFR Performance pas mesurables avant testing** (cold start, battery drain) — à mesurer en sprint 0 + ajuster les cibles dans la doc une fois mesures réelles disponibles.
2. ~~**`packages/design-tokens.ts`** : mentionné mais pas créé~~ → **Résolu** par la décision Storybook MVP : story dédiée création `packages/design-tokens/` insérée dans la séquence.
3. **Refresh token offline** : si le refresh échoue parce que l'user est offline → garder la session active pour les opérations offline (consultation GPX/POIs cachés), bloquer les actions write (upload, modif) avec message clair.
4. **Migration SVGs pins du web** : règle d'organisation à acter — recommandation : créer un sous-package `packages/poi-icons/` ou copier dans `apps/mobile/assets/icons/poi/`. À trancher en story dédiée.
5. **Behavior si user déconnecte Strava** : pas spécifique mobile mais touche le flow — les segments importés depuis Strava restent dans la base utilisateur (déjà géré côté backend).

**Nice-to-have (post-MVP) :**

1. ~~Storybook RN pour composants UI partagés~~ → **Promu en MVP** (décision actée)
2. Tests Maestro pour interactions MapLibre (clusters, pins) — souvent trop bas niveau pour Maestro
3. Push notifications (V2 quand background geoloc activé)
4. Background geolocation (V2 sur demande users)
5. Live Activities iOS via `expo-widgets` (V2 — Dynamic Island affichant prochain POI)
6. SDK natif Google Sign-In si UX 1-tap devient un manque

---

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Contexte projet analysé (73 FRs, 36 NFRs, 8 domaines, dont 4 FRs PWA exclus)
- [x] Complexité évaluée (Medium)
- [x] Contraintes techniques identifiées (App Store 4.2, RGPD, OAuth schemes, etc.)
- [x] Cross-cutting concerns mappés (13 concerns mobile-spécifiques)

**✅ Architectural Decisions**

- [x] Décisions critiques documentées avec versions vérifiées web (mai 2026)
- [x] Stack complète spécifiée (Expo SDK 55, RN 0.83, React 19.2, MapLibre v11, NativeWind v4, Storybook RN web v8, etc.)
- [x] Patterns d'intégration définis (REST + JWT, polling, deep links OAuth)
- [x] Considérations performance adressées (cibles cold start, frame rate, battery)
- [x] Design system formalisé (`packages/design-tokens/` + Storybook)

**✅ Implementation Patterns**

- [x] Conventions de nommage établies (héritage web + spécifiques mobile)
- [x] Patterns de structure définis (Expo Router, layouts, route groups)
- [x] Patterns de communication spécifiés (Plausible, Better Auth, MapLibre RN)
- [x] Patterns de process documentés (error handling, loading, permissions, lifecycle)
- [x] Patterns Storybook stories définis (co-localisation, scope, decorators)

**✅ Project Structure**

- [x] Structure complète définie (`apps/mobile/` avec ~70 fichiers anticipés + stories)
- [x] Frontières composants établies (API, données, native↔JS, permissions)
- [x] Points d'intégration mappés (7 data flows documentés)
- [x] Requirements → structure mapping complet

---

### Architecture Readiness Assessment

**Statut global : PRÊT POUR L'IMPLÉMENTATION**

**Niveau de confiance : ÉLEVÉ**

**Points forts :**

- 🔥 Réutilisation maximale du backend existant — zéro divergence d'API, économie d'effort énorme
- 🔥 Packages monorepo réutilisés — `shared`, `gpx`, `database` types : 100% partagés avec web
- 🔥 Versions vérifiées et compatibles — toutes lib dans leur version stable mai 2026
- 🔥 RGPD préservé nativement — règle GPS-jamais-serveur transposée mobile sans compromis
- 🔥 Scope offline pragmatique — N1+N2+N3 sans tomber dans la complexité offline-first complète
- 🔥 Conformité stores anticipée — App Store 4.2 + Privacy Labels + Data Safety dès le design
- 🔥 OTA Updates dispo — flexibilité de patcher rapidement post-launch sans soumission
- 🔥 Design system formalisé — `packages/design-tokens/` + Storybook RN web pour cohérence design ↔ code dès J1

**Axes d'amélioration post-MVP :**

- Background geolocation (permission Always iOS) si demande users
- Push notifications natives (réintroduire avec un usage clair, ex. alertes météo)
- Live Activities iOS (Dynamic Island)
- SDK natif Google Sign-In si UX 1-tap devient un manque
- NativeWind v5 (upgrade quand stable)
- N4 offline (création/édition aventure offline + sync différée)

---

### Implementation Handoff

**AI Agent / Dev Guidelines :**

- Suivre les décisions architecturales exactement comme documentées
- Utiliser les patterns d'implémentation de manière cohérente (anti-patterns interdits)
- Respecter la structure et les frontières du projet
- Consulter ce document (`architecture-mobile.md`) pour toute question architecturale
- En cas de divergence avec l'archi web (`architecture.md`) : la doc mobile prime pour le scope mobile

**Première priorité d'implémentation :**

```bash
# Story 1 : initialisation apps/mobile/
pnpm create expo-app@latest apps/mobile --template with-router --no-install
echo "node-linker=hoisted" >> .npmrc
pnpm install
# + configuration metro.config.js monorepo
# + ajout pipeline Turborepo (dev:mobile, build:mobile, storybook:mobile)
# + provision Apple Developer Program ($99/an, validation D-U-N-S à démarrer immédiatement)
# + provision Google Play Console ($25 one-shot)
```

**Séquence recommandée des stories** (à formaliser dans `epics.md` Epic 18 — Mobile Native) :

1. Setup mobile foundation (Story 18.1) — `apps/mobile/`, monorepo, EAS, Apple/Google Dev accounts
2. Design tokens + Storybook (Story 18.2) — `packages/design-tokens/`, Storybook RN web, premiers composants UI primitifs storybook-ifiés
3. Auth + OAuth (Story 18.3) — `@better-auth/expo`, Google + Strava OAuth, écrans login/signup/reset
4. Adventures + GPX (Story 18.4) — listing, création, upload GPX, cache N1+N2
5. Map + POIs (Story 18.5) — MapLibre RN intégration (Dev Client requis), recherche corridor, cache N3
6. Live Mode (Story 18.6) — `expo-location` foreground + `expo-keep-awake` + filtrage client-side
7. Météo + cache offline (Story 18.7) — réutilise backend, cache N3 météo
8. i18n + Plausible + Sentry (Story 18.8) — finition observabilité et localisation
9. Polish + soumission stores (Story 18.9) — Privacy Labels, Data Safety, TestFlight, Internal Testing

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow (mobile native) :** COMPLETED ✅
**Total Steps Completed :** 8
**Date Completed :** 2026-05-05
**Document Location :** `_bmad-output/planning-artifacts/architecture-mobile.md`
**Extends :** `_bmad-output/planning-artifacts/architecture.md` (archi web inchangée)

### Final Architecture Deliverables

- **~25 décisions architecturales** documentées avec versions vérifiées (mai 2026)
- **13 patterns d'implémentation** + anti-patterns explicités
- **~70 fichiers** anticipés dans la structure `apps/mobile/`
- **9 stories** anticipées dans l'Epic 18 mobile
- **48/52 FRs couverts** (4 FRs PWA intentionnellement exclus — décision projet)
- **7 data flows** documentés (auth OAuth, GPX, POIs, live mode, météo, cache offline, OTA)

### Quality Assurance Checklist

**Cohérence Architecture**

- [x] Toutes les décisions fonctionnent ensemble sans conflits
- [x] Versions technologiques compatibles et vérifiées web
- [x] Patterns supportent les décisions architecturales
- [x] Structure s'aligne avec tous les choix

**Couverture Requirements**

- [x] FRs mobile couverts (48/52, exclusion PWA assumée)
- [x] NFRs adressés (5/5 catégories)
- [x] Cross-cutting concerns gérés (13 concerns mobile-spécifiques)
- [x] Points d'intégration définis (7 data flows)

**Readiness Implémentation**

- [x] Décisions spécifiques et actionnables avec versions
- [x] Patterns préviennent les conflits entre agents
- [x] Structure complète et non-ambiguë
- [x] Exemples fournis pour les patterns clés

---

**Architecture Status : READY FOR IMPLEMENTATION ✅**

**Prochaine phase :** Création de l'Epic 18 — Mobile Native dans `epics.md`, suivi de la première story `18.1 — Setup mobile foundation`.

**Maintenance du document :** Mettre à jour ce document quand des décisions techniques majeures sont prises pendant l'implémentation mobile (déviations, choix de libs supplémentaires, retours terrain).
