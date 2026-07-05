---
baseline_commit: d868d2ea3622216002ae3ff030a4aaaf13d9d456
---

# Story MOB-6.1 : Crash reporting (Sentry) & analytics (PostHog)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product owner**,
I want **suivre les crashs et l'usage de l'app mobile**,
So that **je détecte les problèmes et mesure l'engagement dans un dashboard PostHog unifié (web + mobile)**.

> **Première story de l'epic MOB-6** (Observabilité, Conformité Stores & Release). Branche deux SDK vendor sur des fondations **déjà livrées** :
> 1. **Sentry** (`@sentry/react-native`) — crash reporting JS + natif avec source maps Metro. **Greenfield mobile** (aucun code Sentry mobile aujourd'hui).
> 2. **PostHog** (`posthog-react-native`) — analytics produit, **branché sur la façade `packages/analytics` qui existe déjà** (livrée par l'epic web `epic-posthog`, story posthog-2). **NE PAS recréer la taxonomie ni le package.**
>
> 🔴 **DÉCISION AUTORITAIRE — PAS DE BANDEAU DE CONSENTEMENT SUR MOBILE.** L'architecture mobile (amendement 2026-06-07, `architecture-mobile.md:1397-1398`) + le `sprint-change-proposal-2026-06-07.md` (§2, §4.2e) tranchent : **mobile = zéro cookie → `distinct_id` en AsyncStorage → pas de consentement requis** (asymétrie assumée vs web, où les cookies imposent un bandeau). L'AC de l'epic le confirme explicitement : « sans cookie (distinct_id AsyncStorage) ». **NE PAS porter `apps/web/src/lib/analytics-consent.ts`, `consent-banner.tsx`, `privacy-toggle.tsx`, ni `opt_out_capturing_by_default`.** Le web-wiring sert de référence pour l'injection du transport et `identify`/`reset` — **mais son modèle de consentement ne s'applique pas au mobile.**
>
> 🟢 **RGPD garanti par construction** : pas de GPS (la façade ne laisse passer que `adventure_id_hash`), pas de PII (jamais d'email — `identify` n'utilise que `user.id`), pas de tracking cross-app, **IDFA non requis → pas de prompt ATT** (`architecture-mobile.md:102`). Sentry scrub défensif via `beforeSend`.
>
> ⚠️ **Deux modules natifs neufs → `expo prebuild --clean` OBLIGATOIRE (iOS ET Android) avant `run:ios`/`pnpm sim`**, sinon `Cannot find native module` au boot. Le SDK Sentry ajoute aussi les phases de build d'upload de source maps.

## Acceptance Criteria

1. **Given** l'app mobile
   **When** Sentry est intégré
   **Then** les erreurs JS **et** les crashes natifs sont remontés à Sentry avec **source maps Metro** (symbolication lisible des stack traces) (FR-MOB-020)
   **And** `Sentry.init()` s'exécute **en tout premier** dans `app/_layout.tsx` (avant tout autre code — `architecture-mobile.md:842`)
   **And** l'absence de DSN (`EXPO_PUBLIC_SENTRY_DSN` non défini) **n'initialise pas** Sentry (sûr en dev/test/CI)

2. **Given** un événement produit (clic réservation, activation du mode Live…)
   **When** il se produit
   **Then** il est envoyé via **`posthog-react-native` branché sur la façade `packages/analytics`** — transport injecté une fois via `setAnalyticsClient({ capture: (event, properties) => posthog.capture(event, properties) })` au bootstrap
   **And** il apparaît dans le **dashboard PostHog unifié web + mobile** (Cloud EU), **sans cookie** — `distinct_id` persisté en **AsyncStorage**
   **And** les **call sites déjà branchés** (`booking-links.tsx`, no-op aujourd'hui) émettent réellement dès l'injection ; les call sites manquants sont branchés pour la parité funnel (T6)
   **And** l'utilisateur authentifié est rattaché via `posthog.identify(user.id)` (`user.id` **uniquement**, jamais d'email/PII), et `posthog.reset()` est appelé à la déconnexion

3. **Given** la collecte d'analytics active
   **When** un événement est émis
   **Then** **aucune donnée GPS ni donnée personnelle sensible** n'est transmise (NFR-MOB-SEC, FR-MOB-020) — garanti par les types de la façade (`LiveModeActivatedProps`/`MapOpenedProps` n'autorisent que `adventure_id_hash` via `hashAdventureId()`) et par l'absence d'autocapture vendor + le scrub `beforeSend` côté Sentry

4. **Given** le session replay PostHog
   **When** l'app tourne en **build production**
   **Then** le replay est **désactivé** — actif **uniquement** sur builds beta (EAS profil `development`/`preview` **ou** feature flag PostHog)
   **And** là où le replay tourne (beta), les **vues carte MapLibre sont masquées** (la règle « GPS jamais hors device » s'étend à l'écran enregistré — `architecture-mobile.md:1398`), les champs texte sont masqués (`maskAllTextInputs`), et l'email est masqué sur les écrans compte
   **And** l'activation en **production** relève de **MOB-6.6** (nouveau binaire natif + consentement in-app + mise à jour Privacy Labels / Data Safety — hors scope ici)

## Tasks / Subtasks

- [x] **T1 — Dépendances + configuration native** (AC: 1, 2, 4)
  - [x] `expo install @sentry/react-native posthog-react-native` → `@sentry/react-native ~7.11.0` + `posthog-react-native ^4.53.0` (peers SDK-56 résolus).
  - [x] `app.config.ts` → `plugins` : ajout `['@sentry/react-native/expo', { url, organization: env SENTRY_ORG ?? 'ridenrest', project: env SENTRY_PROJECT ?? 'ridenrest-mobile' }]`. PostHog = aucun plugin (JS-level). ✓ vérifié au prebuild iOS (RNSentry + Sentry/HybridSDK 8.58.0 dans Podfile.lock).
  - [x] `eas.json` → bloc `env` par profil. **Déviation assumée** : seuls `EXPO_PUBLIC_APP_ENV` + `EXPO_PUBLIC_POSTHOG_HOST` (non-secrets) sont commités ; `EXPO_PUBLIC_POSTHOG_KEY` + `EXPO_PUBLIC_SENTRY_DSN` viennent des EAS Environment Variables / `.env.local` (clés que l'agent ne possède pas — key-gated → absence sûre). `SENTRY_AUTH_TOKEN` = secret CI/`.env.local`. Documenté README.
  - [x] `scripts/check-native-config.mjs` : invariant « plugin `@sentry/react-native/expo` présent » ajouté (4 invariants, vert).
  - [x] **`expo prebuild` iOS ✓** (ENOTEMPTY → workaround « déplacer ios/ » AGENTS.md ; CocoaPods OK, RNSentry pod lié). **Android : prebuild NON exécuté** (SDK Android absent de l'environnement agent — à faire par Guillaume avant test device Android).

- [x] **T2 — Initialisation Sentry (en premier dans le root layout)** (AC: 1, 3)
  - [x] `src/lib/observability/sentry.ts` : `initSentry()` key-gated (early-return sans DSN), `enabled: !__DEV__`, `environment` dérivé `EXPO_PUBLIC_APP_ENV`.
  - [x] **`beforeSend` + `beforeBreadcrumb` (RGPD)** : `scrubGpsFromEvent`/`scrubGpsDeep` suppriment récursivement `latitude/longitude/lat/lng/lon/coords/coordinate/coordinates/position` des `contexts`/`extra`/breadcrumbs. `sendDefaultPii: false`.
  - [x] `tracesSampleRate` : `__DEV__ ? 1.0 : 0.2`.
  - [x] `app/_layout.tsx` : `initSentry()` appelé **en 1er** via `import '@/lib/observability/boot'` (1ère ligne d'effet, AVANT `@/lib/live/location-task` — l'ordre des imports ESM garantit l'exécution) ; export wrappé `Sentry.wrap(RootLayout)`.
  - [~] Source maps : upload géré par le plugin (build phase présente dans `project.pbxproj`) + Metro `getSentryExpoConfig` (debug IDs). Symbolication réelle = T9 (build avec `SENTRY_AUTH_TOKEN`, Guillaume).

- [x] **T3 — Bootstrap PostHog + injection du transport sur la façade** (AC: 2, 3)
  - [x] `src/lib/analytics/posthog.ts` : singleton `new PostHog(KEY, { host: EU })`, **pas de proxy `/phrelay`**.
  - [x] **Key-gated** : sans `EXPO_PUBLIC_POSTHOG_KEY` → pas d'instanciation, pas de `setAnalyticsClient` (client `null`, helpers no-op).
  - [x] **Injection unique** : `setAnalyticsClient({ capture: (e, p) => posthog.capture(e, p) })`. Façade **non étendue**.
  - [x] Config : pas d'autocapture (`captureAppLifecycleEvents: false` + singleton sans `<PostHogProvider>`), `defaultOptIn: true` (pas de gate consentement), `distinct_id` AsyncStorage (défaut SDK). Pas d'IDFA/cross-app.
  - [x] Bootstrap au boot via `@/lib/observability/boot` (après `initSentry()`). Pas de `<PostHogProvider>` (singleton, parité `instrumentation-client.ts`).

- [x] **T4 — `identify` / `reset` (gated session, jamais PII)** (AC: 2)
  - [x] `src/components/providers/analytics-identity.tsx` : effet `identifyUser(session.user.id)` dès session — **`user.id` uniquement**, pas de consentement (mobile).
  - [x] Monté sous le guard `src/app/(app)/_layout.tsx` (session garantie), jamais par écran.
  - [x] `resetAnalytics()` (= `posthog.reset()`) appelé dans **`src/hooks/use-account.ts`** (`finishSession`, après `signOut`) → couvre déconnexion ET suppression de compte. *(Déviation nom : le hook réel est `use-account.ts`, pas `use-account-actions.ts`.)*

- [x] **T5 — Session replay : beta-only + masquage RGPD** (AC: 4)
  - [x] Replay **OFF en production** ; actif si `EXPO_PUBLIC_APP_ENV !== 'production'` (`isReplayEnabled()` → `enableSessionReplay`). *(Déviation : le SDK RN configure le replay à la construction → le chemin « OU feature flag `mobile-replay-beta` » n'est PAS câblé pour démarrer le replay dynamiquement ; le gate env satisfait « beta-only » et la règle dure « JAMAIS en prod ». Le flag reste un kill-switch futur.)*
  - [x] Masquage : `sessionReplayConfig: { maskAllTextInputs: true, maskAllImages: false }` ; **carte MapLibre masquée** via `accessibilityLabel="ph-no-capture"` sur le conteneur de `map-canvas.tsx` (primitive officielle posthog-react-native vérifiée dans les docs). *(Déviation : le mobile a UN SEUL `map-canvas.tsx` partagé planning+live, pas de `live-map-canvas.tsx` séparé → un seul point de masquage couvre les deux.)*
  - [x] Email écrans compte : **aucun email affiché** dans `settings`/`AccountSection` sur mobile → rien à masquer explicitement (`maskAllTextInputs` couvre les inputs). Documenté.
  - [x] `LiveControls` (D+/D-/ETA relatifs) reste visible — non masqué (ne révèle aucune position absolue).
  - [x] Test de régression RGPD : `map-canvas.test.tsx` asserte `ph-no-capture` (commentaire « ne pas retirer — RGPD ») ; `posthog.test.ts` asserte replay OFF en prod / ON en preview.

- [x] **T6 — Brancher les call sites d'events manquants (parité funnel)** (AC: 2)
  - [x] `booking_click` : déjà branché (`booking-links.tsx`) — vérifié, émet réellement dès l'injection.
  - [x] `poi_detail_opened` → `src/components/map/poi-popup.tsx` (effet par POI ouvert ; `source: poi.source === 'overpass' ? 'overpass' : 'google'`). Couvre planning ET live (popup partagé).
  - [x] `map_opened` → `src/app/(app)/map/[id].tsx` (une fois, trace prête ; `hashAdventureId(id)`).
  - [x] `poi_search_triggered` → planning (`map/[id].tsx`, à la résolution de recherche) **et** live (`live/[id].tsx`, à la résolution).
  - [x] `gpx_uploaded` → `src/app/(app)/adventures/[id].tsx` (`onParsed`, segments `done` + km cumulé, parité web `adventure-detail.tsx`).
  - [x] `live_mode_activated` → `src/hooks/use-live-mode.ts` (param `adventureId` ajouté ; émis une fois à l'activation — consentement OU auto-start ; `hashAdventureId`).
  - [x] **HORS SCOPE** : events d'acquisition `landing_cta_clicked`/`signup_*`/`login_completed` + `PostAuthTracker` — non portés.
  - [x] Aucun helper redéfini — tous importés de `@ridenrest/analytics`.

- [x] **T7 — Tests** (AC: 1, 2, 3, 4)
  - [x] Mocks natifs `__mocks__/@sentry/react-native.js` + `__mocks__/posthog-react-native.js` (CommonJS, sans JSX ; `wrap` HOC identité, `PostHogProvider`/`PostHogMaskView` = `jest.fn(() => null)`) + `jest.mock(...)` dans `jest.setup.ts`. Mocks analytics partiels des tests de route étendus (map-screen/live-screen/poi-popup).
  - [x] `src/lib/analytics/posthog.test.ts` : clé absente → client null/no-op ; clé présente → transport injecté + `capture` délègue ; idempotence ; replay beta/prod.
  - [x] `src/lib/observability/sentry.test.ts` : DSN absent → init no-op ; `beforeSend` scrub GPS.
  - [x] `src/components/providers/analytics-identity.test.tsx` : `identify(user.id)` avec session, jamais d'email ; pas d'identify sans session. `reset` → `account-section.test.tsx` (logout + delete).
  - [x] Masquage replay : `map-canvas.test.tsx` (ph-no-capture) ; replay prod OFF (`posthog.test.ts`).
  - [x] Placement : tests important une route déjà sous `src/__tests__/` ; lib/composant co-localisés.
  - [x] **Gate verte** : `jest` 605/605 · `tsc` 0 · `eslint` 0 · `check:native-config` OK · `expo export` iOS OK.

- [x] **T8 — Doc Sync** (règle CRITIQUE project-context)
  - [x] Déviations documentées dans ce fichier (Completion Notes) — ACs satisfaits, pas de changement d'AC dans `epics-mobile.md`.
  - [x] `apps/mobile/AGENTS.md` : section « Observabilité : Sentry + PostHog » ajoutée ; commentaire obsolète `src/lib/booking-url.ts:5` corrigé.
  - [x] `apps/mobile/README.md` : table des 4 `EXPO_PUBLIC_*` + note `SENTRY_AUTH_TOKEN` (secret CI).
  - [x] `packages/analytics/README.md` : colonne « Écrans émetteurs (mobile) » cochée pour les 6 call sites livrés.
  - [x] `sprint-status.yaml` : MOB-6-1 → `review` en fin d'impl.

- [x] **T9 — Validation device** (AC: 1, 2, 3, 4) — **iOS validé**, Android + upload symbolisé pending
  - [x] `pnpm sim` **iOS** : prebuild ✓ + **build Release SUCCÈS (0 erreur)** + app **installée & lancée** sur simulateur (iPhone 17 Pro). **Boot sans crash natif** vérifié : process vivant (pid), **0 crash `.ips`**, aucune erreur native (« Cannot find native module » / dyld / abort) dans les logs → les 2 modules natifs neufs (Sentry + PostHog) chargent proprement.
  - [x] **PostHog runtime OK** : logs device confirment la connexion à **`eu.i.posthog.com`** (`/config` + `/flags/`) avec la clé `EXPO_PUBLIC_POSTHOG_KEY` (phc_…, EU) → transport analytics fonctionnel sur device. Vérif des events dans le **dashboard EU unifié** = à confirmer par Guillaume en naviguant l'app (le SDK est initialisé).
  - [x] **Sentry runtime** : build Release (`__DEV__=false`) → `enabled`, DSN embarqué, init sans crash. (Pas de trafic ingest tant qu'aucune erreur n'est déclenchée — normal.)
  - [~] **Source maps symbolisées** : phase « Upload Debug Symbols to Sentry » **désactivée en build local** (`SENTRY_DISABLE_AUTO_UPLOAD=true` dans `sim-build.sh`) car le `SENTRY_AUTH_TOKEN` fourni renvoie **401 Invalid token** (probable mismatch de **région EU/US** + org/projet mal nommés : `react-native` = slug projet, `4511643853717584` = ID projet, l'org slug réel manque). Upload réel = release/EAS une fois le token + org/projet + région corrigés (action Guillaume).
  - [x] **Android ✅** : prebuild ✓ (sentry.properties EU, `RECEIVE_BOOT_COMPLETED` préservé) + `expo run:android --variant release` **BUILD SUCCESSFUL** + APK installé sur `ridenrest_pixel`. **Boot sans crash natif** vérifié via `am start` : process **stable et vivant**, **0 crash buffer**, `ReactNativeJS: Running "main"` (bundle embarqué chargé), libs natives OK (hermes/maplibre/reanimated/worklets/expo-modules-core/rnscreens), **Sentry natif intégré** (`RNSentryReplayMaskManager` présent ; `io.sentry.auto-init=false` → init piloté par notre JS). PostHog = même JS qu'iOS (transport identique). *(NB : `expo run:android` ouvre par défaut le deep-link dev-launcher → lancer l'activité directement `am start -n app.ridenrest/.MainActivity` pour charger le bundle embarqué.)*
  - [ ] **Replay beta carte masquée sur device** : à valider sur un build avec `EXPO_PUBLIC_APP_ENV` non-production (profil EAS dev/preview) — pending.

## Dev Notes

### Architecture & contraintes (à respecter à la lettre)

- **Façade `packages/analytics` — réutilisation verbatim, zéro extension.**
  - API publique : `setAnalyticsClient(client | null)`, les helpers `track*`, `hashAdventureId(id)`. `capture()` est **interne** (non exporté) — ne jamais l'appeler directement.
  - Interface transport : `interface AnalyticsClient { capture(event: AnalyticsEvent, properties?: Record<string, string>): void }`. **Une seule méthode.** L'adaptateur mobile = `{ capture: (e, p) => posthog.capture(e, p) }`.
  - Le package **n'importe AUCUN SDK vendor** (un import vendor dans `packages/analytics` est un blocage de code-review). Le SDK vit côté app.
  - Le package est exporté en **TS source brut** (pas de build/dist) → Metro le consomme nativement (`.npmrc` `node-linker=hoisted`). **Pas** de `transpilePackages` (ça, c'est web-only).
  - Snippet d'injection canonique déjà documenté dans `packages/analytics/README.md`.
- **Taxonomie (6 events core, déjà typés)** : `booking_click`, `gpx_uploaded`, `map_opened`, `poi_search_triggered`, `poi_detail_opened`, `live_mode_activated`. Props toujours `Record<string, string>` (les helpers stringifient). `adventure_id_hash` via `hashAdventureId()` → **jamais d'UUID brut, jamais de GPS**. Les 4 events d'acquisition (`landing_cta_clicked`, `signup_*`, `login_completed`) sont **web-only** → hors scope.
- **Sentry first** : `Sentry.init()` avant tout autre code dans `app/_layout.tsx` (`architecture-mobile.md:842`). DSN public via `EXPO_PUBLIC_SENTRY_DSN`. Source maps Metro via le plugin expo. `SENTRY_AUTH_TOKEN` = secret CI uniquement. Sampling sous le quota free 5k/mois. `beforeSend` scrub GPS (décision de la story — non spécifié par les docs).
- **PostHog** : Cloud **EU** (`https://eu.i.posthog.com`), **pas** de self-host (ClickHouse/Kafka trop lourds pour le VPS — `architecture-mobile.md:1395`). `distinct_id` AsyncStorage, **zéro cookie**, **pas d'IDFA / pas de cross-app → pas d'ATT**. Pas d'autocapture (taxonomie explicite seulement).
- 🔴 **Asymétrie consentement web↔mobile** : web a des cookies → bandeau de consentement (`epic-posthog`/posthog-1). **Mobile n'a PAS de cookie → PAS de bandeau, PAS d'opt-out-par-défaut.** Le `sprint-change-proposal-2026-06-07.md:51` est explicite : « l'UI du consentement web … N/A pour le mobile ». **Ne pas porter le modèle de consentement web.**
- **Replay** = module natif → **nouveau binaire store, pas livrable en OTA** → prod = story dédiée **MOB-6.6**. En v1, replay **beta-only** (profil EAS dev/preview ou feature flag). Masquage carte/PII **obligatoire** là où il tourne (`architecture-mobile.md:1398-1399`).
- **Privacy Labels / Data Safety (MOB-6.4)** inchangées par cette story : la déclaration « analytics » reste, le replay **beta** n'impacte pas la soumission **prod** (`proposal:40`). L'activation replay **prod** (MOB-6.6) déclenchera la mise à jour des labels.

### Source tree — fichiers à toucher

| Action | Fichier | Note |
|---|---|---|
| NEW | `src/lib/observability/sentry.ts` | `initSentry()` + `beforeSend` scrub GPS |
| NEW | `src/lib/analytics/posthog.ts` | singleton PostHog + `setAnalyticsClient` (chemin imposé archi) |
| NEW | `src/components/providers/analytics-identity.tsx` | `identify(user.id)` gated session |
| UPDATE | `src/app/_layout.tsx` | `initSentry()` **en 1er** + bootstrap PostHog + `Sentry.wrap()` |
| UPDATE | `src/app/(app)/_layout.tsx` | monter `<AnalyticsIdentity>` sous le guard |
| UPDATE | `src/hooks/use-account-actions.ts` | `posthog.reset()` après signOut/delete (MOB-2.5) |
| UPDATE | `src/components/map/poi-popup.tsx` | `trackPoiDetailOpened` |
| UPDATE | `src/app/(app)/map/[id].tsx` | `trackMapOpened` + `trackPoiSearchTriggered` (planning) |
| UPDATE | `src/app/(app)/live/[id].tsx` | `trackPoiSearchTriggered` (live) |
| UPDATE | `src/hooks/use-live-mode.ts` | `trackLiveModeActivated` (après consentement géoloc) |
| UPDATE | flux upload GPX (MOB-3.2) | `trackGpxUploaded` |
| UPDATE | `src/components/map/map-canvas.tsx` + `live-map-canvas.tsx` | masque replay (vue carte) |
| UPDATE | `app.config.ts` | plugin Sentry |
| UPDATE | `eas.json` | bloc `env` par profil |
| UPDATE | `scripts/check-native-config.mjs` | invariant plugin Sentry |
| UPDATE | `jest.setup.ts` + `__mocks__/` | mocks Sentry + PostHog |
| VERIFY (no-op) | `src/components/shared/booking-links.tsx` | `trackBookingClick` déjà branché |

### Provider tree (root `_layout.tsx`, actuel)

```
[initSentry() ← AJOUT, tout en haut]
[bootstrap PostHog ← AJOUT]
GestureHandlerRootView
  └ SafeAreaProvider
     └ QueryProvider            (PersistQueryClientProvider — persiste UNIQUEMENT ['adventures'])
        └ I18nextProvider
           ├ <Stack ... />       (← (app)/_layout monte <AnalyticsIdentity>)
           └ <StatusBanner />
export default Sentry.wrap(RootLayout)   (← AJOUT)
```

### Testing

- **Runner** : Jest + jest-expo + `@testing-library/react-native`. Setup global `jest.setup.ts`.
- **Mocks natifs** : fichier par module dans `__mocks__/` + `jest.mock('<module>')` dans `jest.setup.ts`. **Aucun JSX dans une factory** ; provider → `jest.fn(() => null)`.
- **Placement** : tests important une route → `src/__tests__/` (jamais sous `src/app/`).
- **Façade** : tests unitaires existants `packages/analytics/src/events.test.ts` (Vitest) — incluent une garde « `live_mode_activated` n'émet aucune autre prop que `adventure_id_hash` ». Ne pas casser.

### Project Structure Notes

- Module natif neuf → `expo prebuild --clean -p ios` **ET** `-p android`, build Dev Client / `pnpm sim`. Reporter **par plateforme** (pas de « ✓ » global — règle anti-arrondi AGENTS.md).
- `EXPO_PUBLIC_*` = embarqué dans le bundle (clés publiques OK : DSN Sentry, clé projet PostHog). Secrets (`SENTRY_AUTH_TOKEN`) **jamais** dans le bundle, **jamais** `EXPO_PUBLIC_*`, CI/`.env.local` only.
- Config Expo dans `app.config.ts` (TS), **jamais `app.json`**.
- **Prérequis externes (Guillaume)** :
  - **PostHog** : ✅ **déjà disponible** — compte Cloud EU + clé projet existants (PostHog est déjà en prod côté web). Réutiliser la même clé projet pour le mobile (dashboard unifié web + mobile). Rien à créer.
  - **Sentry** : à provisionner — org + projet Sentry, **DSN** (`EXPO_PUBLIC_SENTRY_DSN`, public) et **`SENTRY_AUTH_TOKEN`** (secret CI/`.env.local`, upload source maps).
  - Sans DSN/clé, l'app fonctionne (init no-op) mais n'émet rien — comportement attendu en dev/CI.
- **Doc vs réalité** : `architecture-mobile.md` cible SDK 55 / RN 0.83 ; réel = **SDK 56 / RN 0.85.3 / React 19.2.3**. Traiter les versions doc comme un plancher.

### Décisions non spécifiées par les docs (tranchées par cette story)

- `tracesSampleRate` Sentry (`__DEV__ ? 1.0 : 0.2`) ; `beforeSend` scrub GPS ; tag `environment` dérivé de `EXPO_PUBLIC_APP_ENV` / profil EAS.
- Noms exacts des env vars : `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_APP_ENV`.
- Gate replay beta : `APP_ENV !== 'production'` OU feature flag `mobile-replay-beta` (défaut OFF si non chargé). **Jamais** gater un comportement RGPD-critique derrière un flag distant (le masquage est toujours actif quand le replay tourne).

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story-MOB-6.1] — ACs, FR-MOB-020
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Amendement-2026-06-07] (l.1391-1399) — PostHog Cloud EU, façade `packages/analytics`, distinct_id AsyncStorage, replay beta-only, masquage carte RGPD
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md] l.435-436 (Sentry/PostHog décisions), l.842/1013 (Sentry init first), l.102 (ATT non requis), l.596/1091 (`lib/analytics/posthog.ts`), l.883/885 (plugins natifs), l.619-622 (env vars)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-07.md] §2/§3/§4.2e/§4.2f/§5 — réécriture MOB-6.1, dépendance posthog-2, asymétrie consentement, prérequis clés
- [Source: packages/analytics/src/{client,events,types,index}.ts + README.md] — contrat façade + snippet injection mobile
- [Source: apps/web/src/instrumentation-client.ts] — init posthog-js + injection transport (référence ; **ignorer le modèle de consentement web**)
- [Source: apps/web/src/components/providers/analytics-identity.tsx + .../sign-out-button.tsx] — `identify(user.id)` / `reset()`
- [Source: apps/web/src/.../map-canvas.tsx:486 + live-map-canvas.tsx:460] — masquage carte `ph-no-capture` RGPD (équivalent natif à implémenter)
- [Source: apps/mobile/src/components/shared/booking-links.tsx] — `trackBookingClick` déjà branché (no-op jusqu'à l'injection)
- [Source: apps/mobile/AGENTS.md] — prebuild après module natif, mocks Jest sans JSX, placement tests, `pnpm sim`
- [Source: _bmad-output/project-context.md#Mobile] — règles MapLibre `isValidLngLat`, secure-store=auth only, AsyncStorage, i18n

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8) — `/bmad-dev-story`.

### Debug Log References

- Versions installées : `@sentry/react-native ~7.11.0` (pod RNSentry 7.11.0 + Sentry/HybridSDK 8.58.0) ; `posthog-react-native ^4.53.0` (core pur JS, pas de pod).
- API vérifiée dans les docs versionnées + types installés : PostHog `new PostHog(key, { host, defaultOptIn, captureAppLifecycleEvents, enableSessionReplay, sessionReplayConfig })`, `distinct_id` AsyncStorage par défaut, masquage replay d'une vue = `accessibilityLabel="ph-no-capture"` (ou `<PostHogMaskView>`). Sentry plugin = `@sentry/react-native/expo`, metro = `getSentryExpoConfig`.
- ENOTEMPTY au prebuild iOS (`ios/Pods/...React.xcframework`) → workaround AGENTS.md : déplacer `ios/` puis `expo prebuild -p ios` → OK.

### Completion Notes List

**Implémentation (T1–T8) — gate déterministe VERTE :** `jest` **605/605** (91 suites, +12 vs 593) · `tsc --noEmit` **0** · `eslint` **0** · `check:native-config` **OK (4 invariants)** · `expo export -p ios` **OK** (bundle 10 MB — valide la compo Metro `getSentryExpoConfig` + NativeWind + monorepo).

**Architecture clé :**
- **Sentry-first (AC1)** : `src/lib/observability/boot.ts` (import à effet de bord) appelle `initSentry()` puis `bootstrapAnalytics()`, importé en **1ère ligne** de `app/_layout.tsx` AVANT `@/lib/live/location-task`. Choix dicté par l'ESM (les `import` sont hoistés au-dessus des appels → un module-boot importé en 1er est le seul moyen de garantir l'ordre face à `location-task`). Export `Sentry.wrap(RootLayout)`.
- **Façade réutilisée, zéro extension** : transport injecté via `setAnalyticsClient({ capture })`. `identify`/`reset` appelés directement sur le singleton (`identifyUser`/`resetAnalytics` dans `posthog.ts`).
- **RGPD** : Sentry `beforeSend`/`beforeBreadcrumb` scrub GPS récursif + `sendDefaultPii:false` ; PostHog pas d'autocapture, `defaultOptIn:true` (pas de bandeau), `distinct_id` AsyncStorage ; `identify(user.id)` only ; replay beta-only + carte masquée `ph-no-capture`.

**Déviations assumées (vs énoncé story) — toutes documentées :**
1. **`use-account.ts`** (pas `use-account-actions.ts`) : c'est le nom réel du hook `useAccountActions` sur mobile. `resetAnalytics()` placé dans `finishSession()` (couvre logout ET delete).
2. **Un seul `map-canvas.tsx`** (planning + live) : le mobile n'a PAS de `live-map-canvas.tsx` séparé → masquage `ph-no-capture` posé une fois, couvre les deux modes.
3. **Session replay : gate ENV uniquement** (`APP_ENV !== 'production'`). Le chemin « OU feature flag `mobile-replay-beta` » n'est PAS câblé : le SDK RN fige `enableSessionReplay` à la construction (pas d'API stop/start dynamique simple), et le gate env satisfait « beta-only » + la règle dure « JAMAIS en prod ». Le flag reste un kill-switch futur (lisible via `isFeatureEnabled`).
4. **`eas.json`** : seuls `EXPO_PUBLIC_APP_ENV` + `EXPO_PUBLIC_POSTHOG_HOST` (non-secrets) commités ; `EXPO_PUBLIC_POSTHOG_KEY` + `EXPO_PUBLIC_SENTRY_DSN` viennent des EAS Environment Variables / `.env.local` (l'agent ne possède pas ces valeurs ; key-gated → absence sûre). Documenté README.
5. **`live_mode_activated`** émis depuis `use-live-mode.ts` (param `adventureId` ajouté) à la transition d'activation → couvre consentement ET auto-start (returning user), plus complet que « après consentement » seul. `hashAdventureId` (RGPD).
6. **Mail écrans compte** : le mobile n'affiche aucun email dans `settings`/`AccountSection` → aucun masquage explicite requis (`maskAllTextInputs` couvre les inputs).
7. **Drive-by (hors scope, pré-existant)** : `use-live-weather.ts:78` (MOB-5.6, statut `review`) avait une erreur lint `react-hooks/set-state-in-effect` **présente à HEAD** (fichier non modifié par ailleurs, plugin inchangé) qui rendait `expo lint` rouge. Corrigée avec la convention équipe (`eslint-disable-next-line` + rationale — sync légitime depuis le store Live) pour garder le gate partagé vert. Signalé pour suivi MOB-5.6.

**Métro source maps** : `metro.config.js` enveloppé par `getSentryExpoConfig` (debug IDs) ; phase d'upload Sentry présente dans `project.pbxproj`. Symbolication réelle = validation device (T9, nécessite `SENTRY_AUTH_TOKEN`).

**T9 — validation device — état réel par plateforme (anti-arrondi) :**
- **iOS ✅** : prebuild ✓ ; **build Release SUCCÈS (0 erreur)** ; app installée + lancée (iPhone 17 Pro) ; **boot SANS crash natif** (process vivant, 0 `.ips`, aucune erreur « Cannot find native module »/dyld/abort) → les 2 SDK natifs neufs chargent proprement. **PostHog runtime confirmé** : connexion device → `eu.i.posthog.com` (`/config` + `/flags/`) avec la clé EU embarquée. **Sentry** : enabled en Release + DSN embarqué, init sans crash.
- **Source maps Sentry** : upload **désactivé en build LOCAL** (`sim-build.sh` → `SENTRY_DISABLE_AUTO_UPLOAD=true`) car le `SENTRY_AUTH_TOKEN` renvoie **401 Invalid token** (diagnostic via `sentry-cli organizations list` : token rejeté). Cause probable : **région EU/US** (sentry-cli tape `sentry.io` US par défaut) + org/projet mal nommés (`SENTRY_ORG=react-native` est en fait le slug projet ; `SENTRY_PROJECT=4511643853717584` est l'ID, pas le slug ; l'org slug réel manque). Le crash reporting **runtime** marche déjà (DSN), seul l'upload symbolisé attend la correction. Upload réel = release/EAS — **action Guillaume** (corriger token + région + slugs).
- **Android ✅** : (émulateur `ridenrest_pixel` booté + SDK dispo en 2e temps) build `--variant release` **succès**, APK installé, **boot SANS crash natif** (process stable, 0 crash buffer, `Running "main"`, libs natives chargées dont Sentry `RNSentryReplayMaskManager`). Les 2 SDK natifs neufs chargent proprement sur les DEUX plateformes (validation clé « rebuild des 2 plateformes » de la règle anti-crash MOB-5.2).
- **Vérifs dashboard** : events mobiles dans PostHog EU (PostHog confirmé connecté côté iOS ; à constater en naviguant) + erreur de test symbolisée dans Sentry (après fix token) : **à confirmer par Guillaume**. (Un event de test a déjà été envoyé au DSN → visible dans Sentry Issues.)

**Fix tooling (MOB-6.1) :** `sim-build.sh` exporte `SENTRY_DISABLE_AUTO_UPLOAD=true` par défaut → les builds simulateur ne cassent plus sur l'upload Sentry (sujet release/CI). Surcharge : `SENTRY_DISABLE_AUTO_UPLOAD=false pnpm sim`.

### File List

**Nouveaux fichiers (apps/mobile) :**
- `src/lib/observability/sentry.ts` — `initSentry()` + scrub GPS (`beforeSend`)
- `src/lib/observability/boot.ts` — boot ordonné (Sentry → PostHog), importé 1er dans le root layout
- `src/lib/analytics/posthog.ts` — singleton PostHog + `setAnalyticsClient` + `identifyUser`/`resetAnalytics`/`isReplayEnabled`
- `src/components/providers/analytics-identity.tsx` — `identify(user.id)` gated session
- `__mocks__/@sentry/react-native.js` — mock Jest
- `__mocks__/posthog-react-native.js` — mock Jest
- `src/lib/observability/sentry.test.ts`, `src/lib/analytics/posthog.test.ts`, `src/components/providers/analytics-identity.test.tsx` — tests

**Modifiés (apps/mobile) :**
- `package.json` — deps `@sentry/react-native` + `posthog-react-native`
- `app.config.ts` — plugin Sentry
- `eas.json` — blocs `env` par profil
- `metro.config.js` — `getSentryExpoConfig`
- `scripts/check-native-config.mjs` — invariant plugin Sentry
- `scripts/sim-build.sh` — `SENTRY_DISABLE_AUTO_UPLOAD=true` par défaut (builds locaux n'uploadent pas les source maps)
- `jest.setup.ts` — `jest.mock` Sentry + PostHog
- `src/app/_layout.tsx` — import boot (1er) + `Sentry.wrap()`
- `src/app/(app)/_layout.tsx` — montage `<AnalyticsIdentity>`
- `src/hooks/use-account.ts` — `resetAnalytics()` dans `finishSession`
- `src/hooks/use-live-mode.ts` — param `adventureId` + `live_mode_activated`
- `src/components/map/map-canvas.tsx` — `accessibilityLabel="ph-no-capture"` (masque replay RGPD)
- `src/components/map/poi-popup.tsx` — `trackPoiDetailOpened`
- `src/app/(app)/map/[id].tsx` — `trackMapOpened` + `trackPoiSearchTriggered` (planning)
- `src/app/(app)/live/[id].tsx` — `trackPoiSearchTriggered` (live) + `useLiveMode(waypoints, id)`
- `src/app/(app)/adventures/[id].tsx` — `trackGpxUploaded` (onParsed)
- `src/lib/booking-url.ts` — commentaire doc-sync (analytics mobile désormais branché)
- `src/hooks/use-live-weather.ts` — fix lint pré-existant (drive-by, eslint-disable + rationale)
- `AGENTS.md` — section Observabilité Sentry/PostHog
- `README.md` — table env vars analytics/observabilité
- Tests étendus : `src/components/shared/account-section.test.tsx`, `src/components/map/__tests__/map-canvas.test.tsx`, `src/components/map/poi-popup.test.tsx`, `src/__tests__/map-screen.test.tsx`, `src/__tests__/live-screen.test.tsx`

**Modifiés (hors apps/mobile) :**
- `packages/analytics/README.md` — colonne émetteurs mobile cochée
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MOB-6-1 → `in-progress` → `review`
- `pnpm-lock.yaml` — résolution des 2 SDK

### Review Findings

- [x] [Review][Decision] `poi_search_triggered` sémantique cache-warm — décision : aligner Planning sur Live (option b) — `justCommitted` pattern ajouté, parité web map-view.tsx [map/[id].tsx]
- [x] [Review][Patch] Sentry plugin — fallbacks `organization`/`project` corrigés en `''` (chaîne vide) — sentry-cli refuse un slug `'react-native'` ou un ID numérique [app.config.ts]
- [x] [Review][Patch] `visibleLayers`/`poisByLayer`/`allPois` retirés des deps de l'effet analytics — snapshot au moment de la transition, pas de ré-emit au changement de filtre [map/[id].tsx, live/[id].tsx]
- [x] [Review][Patch] Re-identify après logout/re-login même compte — `sessionId = session?.session?.id` ajouté en dep de `useEffect` [analytics-identity.tsx]
- [x] [Review][Patch] Tests `trackLiveModeActivated` ajoutés (2 cas : avec/sans `adventureId`) — `Probe` enrichi du prop `adventureId`, mock `@ridenrest/analytics` inline [use-live-mode.test.tsx]
- [x] [Review][Patch] `scrubGpsFromEvent` étendu : scrub `event.user` + `event.request` en défense-en-profondeur [sentry.ts]
- [x] [Review][Patch] Doc Sync — `project-context.md` ligne analytics mise à jour : note l'exception mobile (pas de bandeau, décision MOB-6.1) [_bmad-output/project-context.md]
- [x] [Review][Defer] Ordre de boot `boot.ts` avant `location-task` imposé par convention de commentaire uniquement, aucune règle lint — pré-existant, tooling gap [apps/mobile/src/app/_layout.tsx] — deferred, pre-existing

### Change Log

| Date | Version | Description |
|---|---|---|
| 2026-06-28 | 0.1 | Impl MOB-6.1 : Sentry (init-first key-gated, scrub GPS, source maps) + PostHog (façade existante, EU, distinct_id AsyncStorage, no-consent) + identify/reset + session replay beta-only (carte masquée ph-no-capture) + 6 call sites funnel branchés + tests. Gate vert (jest 605, tsc 0, eslint 0, check:native-config OK, expo export iOS OK). iOS prebuild OK. T9 device : iOS build standalone lancé, Android + dashboards/Sentry pending Guillaume. |
| 2026-06-28 | 0.2 | Provisioning Sentry par Guillaume : `.env` (gitignored, non tracké — vérifié) renseigne `EXPO_PUBLIC_SENTRY_DSN` + `SENTRY_ORG=react-native` + `SENTRY_PROJECT=4511643853717584` + `SENTRY_AUTH_TOKEN`. Défauts org/projet figés dans `app.config.ts` (publics, surchargeables) ; re-prebuild iOS → `ios/sentry.properties`. PostHog : clé `EXPO_PUBLIC_POSTHOG_KEY` (phc_…, EU) ajoutée par Guillaume. |
| 2026-06-28 | 0.3 | **Validation device iOS ✅** : build Release succès (0 erreur), app lancée sur simulateur, **boot sans crash natif** (0 `.ips`, process vivant) → Sentry+PostHog natifs OK. **PostHog runtime confirmé** (device → `eu.i.posthog.com` config+flags). Sentry runtime enabled+DSN, init OK. **`SENTRY_AUTH_TOKEN` = 401 Invalid token** (diagnostic `sentry-cli` : région EU/US + org/projet à corriger) → upload source maps désactivé en local (`sim-build.sh` `SENTRY_DISABLE_AUTO_UPLOAD=true`), à finaliser en release par Guillaume. |
| 2026-07-04 | 0.4 | **Code review BMAD — 7 patches appliqués** : (1) fallbacks Sentry org/projet corrigés en `''` [app.config.ts] ; (2) `justCommitted` pattern ajouté en planning pour les cache-warm (parité web) [map/[id].tsx] ; (3) `visibleLayers`/`poisByLayer`/`allPois` retirés des deps analytics [map/[id].tsx, live/[id].tsx] ; (4) `sessionId` dep dans `AnalyticsIdentity` pour re-identify au re-login [analytics-identity.tsx] ; (5) 2 tests `trackLiveModeActivated` avec/sans adventureId [use-live-mode.test.tsx] ; (6) `scrubGpsFromEvent` étendu à `event.user`/`event.request` [sentry.ts] ; (7) Doc Sync `project-context.md` note l'exception consentement mobile. Gate vert (jest 607, 0 fail). |
| 2026-06-28 | 0.4 | **Validation device Android ✅** (émulateur `ridenrest_pixel` dispo en 2e temps) : prebuild Android (sentry.properties EU + `RECEIVE_BOOT_COMPLETED`) + `expo run:android --variant release` **BUILD SUCCESSFUL** + APK installé. **Boot sans crash natif** (`am start` : process stable, 0 crash buffer, `ReactNativeJS: Running "main"`, libs natives OK, Sentry natif `RNSentryReplayMaskManager` + auto-init=false). Région Sentry **EU** confirmée (DSN `ingest.de.sentry.io`) → `url: https://de.sentry.io/` dans le plugin. **Event de test Sentry envoyé via DSN** (id `42a57829…`) → ingestion runtime OK. Les 2 plateformes bootent proprement. Reste : token Sentry valide (EU) + slugs corrects pour l'upload symbolisé (release/EAS, Guillaume) ; replay beta sur device. |
