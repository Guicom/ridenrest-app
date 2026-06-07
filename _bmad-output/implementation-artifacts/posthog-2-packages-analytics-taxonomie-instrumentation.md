---
baseline_commit: 0400c13
---

# Story posthog-2 : `packages/analytics` — taxonomie typée & instrumentation

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **développeur (web puis mobile)**,
I want **une façade analytics typée partagée dans le monorepo**,
So that **web et mobile émettent les mêmes events sans dépendre directement du vendor**.

> Dépend de **posthog-1** (SDK initialisé + consentement). Ce package est le livrable structurant de l'epic : la release mobile (MOB-6.1) le consommera tel quel via `posthog-react-native`. **Contrainte aval : cette story doit être livrée avant MOB-4.5** (clics affiliés mobile).

## Acceptance Criteria

1. **Given** les 5 helpers existants de `apps/web/src/lib/analytics.ts`
   **When** je crée `packages/analytics` (`@ridenrest/analytics`)
   **Then** les signatures publiques sont conservées : `trackBookingClick`, `trackGpxUploaded`, `trackMapOpened`, `trackPoiSearchTriggered`, `trackPoiDetailOpened`, `hashAdventureId`
   **And** le package n'importe **aucun SDK vendor** — le transport est injecté (`setAnalyticsClient(client)`, interface `AnalyticsClient { capture(event, properties) }`)
   **And** la taxonomie (noms d'events, types des props) est typée et documentée dans le package

2. **Given** un nouveau flux clé identifié par l'epic
   **When** la taxonomie est finalisée
   **Then** elle inclut un nouvel event `live_mode_activated` (helper `trackLiveModeActivated`) émis à l'activation du mode Live, **sans aucune coordonnée GPS dans les props**

3. **Given** les call sites web existants
   **When** je migre l'instrumentation
   **Then** les 5 fichiers consommateurs importent depuis `@ridenrest/analytics` et plus aucun `window.plausible` ne subsiste dans `apps/web/src`
   **And** `apps/web/src/lib/analytics.ts` est supprimé
   **And** le transport web branché est `posthog-js` (events visibles dans PostHog après consentement)

4. **Given** un utilisateur connecté ayant consenti
   **When** sa session démarre
   **Then** `posthog.identify(user.id)` est appelé (jamais d'email ni de PII dans les props)
   **And** au logout, `posthog.reset()` est appelé

5. **Given** la décision de coexistence prise en posthog-1
   **When** la migration des call sites est terminée
   **Then** elle est appliquée : si décommission → `PlausibleProvider` + dépendance `next-plausible` retirés de `apps/web` (et `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` retiré de turbo.json) ; si conservation → périmètre Plausible restant documenté

6. **Given** la suite de tests
   **When** je lance `pnpm test` et `pnpm lint` à la racine
   **Then** tout est vert : tests du package (logique + types), tests web adaptés (mock du client injecté au lieu de `window.plausible`), `layout.test.ts` mis à jour selon AC 5

## Tasks / Subtasks

- [x] **T1 — Créer le package** (AC: 1)
  - [x] `packages/analytics/` sur le modèle de `@ridenrest/shared` : `package.json` (`"name": "@ridenrest/analytics"`, `"main": "./src/index.ts"`, `"exports": { ".": "./src/index.ts" }`, scripts `build: tsc --noEmit`, `test: vitest run`), `tsconfig.json` (`extends: @ridenrest/typescript-config/base`)
  - [x] `src/types.ts` : interface `AnalyticsClient { capture(event: AnalyticsEvent, properties?: Record<string, string>): void }` + union `AnalyticsEvent` des noms d'events
  - [x] `src/client.ts` : `setAnalyticsClient()` / no-op par défaut (comportement actuel : no-op en dev sans script)
  - [x] `src/events.ts` : helpers migrés depuis `apps/web/src/lib/analytics.ts` (mêmes signatures, mêmes props stringifiées) + `trackLiveModeActivated`
- [x] **T2 — Taxonomie & doc** (AC: 1, 2)
  - [x] Conserver les noms d'events existants : `booking_click`, `gpx_uploaded`, `map_opened`, `poi_search_triggered`, `poi_detail_opened` ; ajouter `live_mode_activated`
  - [x] `packages/analytics/README.md` : tableau events × props × écrans émetteurs (web/mobile), règle « jamais de GPS ni PII dans les props », pattern d'injection pour web (`posthog-js`) et mobile (`posthog-react-native`, à venir MOB-6.1)
- [x] **T3 — Brancher le transport web** (AC: 3)
  - [x] Dans `instrumentation-client.ts` (créé en posthog-1) : `setAnalyticsClient({ capture: (e, p) => posthog.capture(e, p) })`
  - [x] `pnpm add @ridenrest/analytics --filter @ridenrest/web` (`workspace:*`)
- [x] **T4 — Migrer les call sites** (AC: 3) — 5 fichiers, imports `@/lib/analytics` → `@ridenrest/analytics` :
  - [x] `apps/web/src/components/shared/search-on-dropdown.tsx` (l.102, 117 — `trackBookingClick`)
  - [x] `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` (l.54, 238, 258 — `trackGpxUploaded`)
  - [x] `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` (l.38, 131, 286 — `trackMapOpened`, `trackPoiSearchTriggered`)
  - [x] `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` (l.17, 216 — `trackPoiDetailOpened`)
  - [x] `apps/web/src/app/(app)/live/[id]/page.tsx` (l.41, 266 — `trackPoiSearchTriggered`)
  - [x] Supprimer `apps/web/src/lib/analytics.ts` ; vérifier `grep -r "window.plausible\|lib/analytics" apps/web/src` → 0 résultat
- [x] **T5 — Instrumenter l'activation Live** (AC: 2)
  - [x] Émettre `trackLiveModeActivated` au point d'activation du mode Live (`live/[id]/page.tsx` — après acceptation du `<GeolocationConsent />`) ; props autorisées : `adventure_id_hash` (via `hashAdventureId`) uniquement
- [x] **T6 — Identify / reset** (AC: 4)
  - [x] Au montage de session authentifiée (client Better Auth, `lib/auth/client.ts`) et si consentement accordé : `posthog.identify(session.user.id)` ; au logout : `posthog.reset()`
  - [x] Garde : ne jamais identifier si opt-out
- [x] **T7 — Appliquer la décision Plausible** (AC: 5)
  - [x] Si décommission actée en posthog-1 : retirer `PlausibleProvider` de `layout.tsx`, `next-plausible` du package.json, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` de turbo.json ; adapter `layout.test.ts` (suppression des tests next-plausible). L'arrêt des conteneurs Docker (Plausible CE/ClickHouse) est **hors story** (tâche infra VPS) *(décision posthog-1 = CONSERVATION → aucun retrait ; périmètre Plausible restant documenté en Completion Notes)*
- [x] **T8 — Tests** (AC: 6)
  - [x] `packages/analytics/src/events.test.ts` : porter la logique de `analytics.test.ts` (235 lignes) — mock du client injecté, no-op sans client, stringification des props
  - [x] Adapter les tests des composants migrés (mocker `@ridenrest/analytics` au lieu de `window.plausible`)
  - [x] Déclarer le package dans la CI turbo (tasks `build`/`test`/`lint` héritées — vérifier `turbo run test --filter=@ridenrest/analytics`)

## Dev Notes

### État réel vérifié (2026-06-07)

- **Helpers source** : `apps/web/src/lib/analytics.ts` (68 lignes) — props **toujours stringifiées** (`String(...)`), pattern no-op `window.plausible?.()`. Conserver ces deux comportements (stringification : compat PostHog OK, et le typage des props reste `Record<string, string>`).
- **Pattern package** : `@ridenrest/shared` exporte **la source TS directement** (`main: ./src/index.ts`, pas de dist) — build = `tsc --noEmit`. Reproduire à l'identique : compatible bundling Next **et** Metro (mobile), aucune étape de transpilation.
- **`hashAdventureId`** : utilisé par `trackMapOpened` et le futur `trackLiveModeActivated` — c'est l'anonymisation des ids d'aventure, le déplacer dans le package.
- **Better Auth client** : `apps/web/src/lib/auth/client.ts` (browser). L'identify doit être réactif au consentement (un opt-in tardif via settings doit déclencher l'identify à la prochaine session/navigation — pas besoin de le faire rétroactivement dans la même page).

### Points de vigilance

1. **Le package ne doit JAMAIS importer `posthog-js`** — c'est LA contrainte d'architecture (réutilisation mobile RN où `posthog-js` ne tourne pas). Toute fuite vendor dans `packages/analytics` sera un blocker en code review.
2. **Règle RGPD projet** : aucune coordonnée GPS, email, ou PII dans les props d'events. `live_mode_activated` se limite à `adventure_id_hash`.
3. **Règle d'import monorepo** (project-context) : jamais de duplication locale — après cette story, tout nouveau tracking passe par `@ridenrest/analytics`.
4. **Doc Sync Rule** : si la taxonomie évolue en cours d'implémentation (noms/props), mettre à jour `epics-posthog.md` + ce fichier immédiatement.
5. Si T7 retire next-plausible : vérifier qu'aucun artefact proxy ne reste dans `next.config.ts` (rewrites next-plausible éventuels) et que la config PWA `urlPattern /api/event` est nettoyée.

### Intelligence story précédente (posthog-1)

Lire les Completion Notes de `posthog-1-sdk-web-consentement-coexistence-plausible.md` avant de démarrer : décision coexistence Plausible (pilote T7), emplacement exact de `instrumentation-client.ts`, clé localStorage de consentement (`rnr_analytics_consent`).

### Frontière de story

- ❌ Session replay / masquage → posthog-3
- ❌ Dashboards, funnels, flags, MCP → posthog-4
- ❌ Transport mobile `posthog-react-native` → MOB-6.1
- ❌ Arrêt des conteneurs Plausible CE sur le VPS → tâche infra hors epic

### Testing standards

Vitest pour `packages/*` ET `apps/web` (project-context). Tests co-localisés. Le package suit `@ridenrest/shared` : `vitest run` sans config jsdom (logique pure — pas de DOM nécessaire grâce à l'injection).

### Project Structure Notes

- `packages/analytics/src/{index,types,client,events}.ts` + `events.test.ts` co-localisé.
- Naming : kebab-case fichiers, camelCase fonctions, types PascalCase (`AnalyticsClient`, `BookingClickProps` — réutiliser les types existants dont `UserTier`).

### References

- [Source: _bmad-output/planning-artifacts/epics-posthog.md#Story posthog-2]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-07.md §4.1]
- [Source: apps/web/src/lib/analytics.ts + analytics.test.ts — implémentation à migrer]
- [Source: packages/shared/package.json — pattern package à reproduire]
- [Source: _bmad-output/project-context.md — Package Import Rules, RGPD rule, Testing Rules, Doc Sync Rule]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8[1m]) — Claude Code

### Debug Log References

- Build web cassé après branchement du package dans `instrumentation-client.ts` : `Module parse failed` sur `packages/analytics/src/index.ts` — l'entrée `instrumentation-client` (chargée via `require-instrumentation-client.js`) n'est pas couverte par la transpilation auto des packages workspace. Fix : `transpilePackages: ['@ridenrest/analytics']` dans `next.config.ts`. Build standalone re-validé OK.

### Completion Notes List

- **AC1** : `@ridenrest/analytics` créé sur le modèle exact de `@ridenrest/shared` (source TS exportée directement, `build: tsc --noEmit`, pas de dist — compatible bundling Next ET Metro). Signatures publiques conservées à l'identique (`trackBookingClick`, `trackGpxUploaded`, `trackMapOpened`, `trackPoiSearchTriggered`, `trackPoiDetailOpened`, `hashAdventureId`). **Zéro import vendor** — transport injecté via `setAnalyticsClient(client)` / interface `AnalyticsClient`. Taxonomie typée (`AnalyticsEvent` union + interfaces de props par event, `UserTier` réexporté).
- **AC2** : event `live_mode_activated` ajouté (helper `trackLiveModeActivated`), props limitées par le type à `adventure_id_hash` — test garde-fou vérifiant qu'AUCUNE autre prop n'est émise (zéro GPS).
- **AC3** : 5 call sites migrés (`search-on-dropdown`, `adventure-detail`, `map-view`, `poi-popup`, `live/[id]/page`) ; `apps/web/src/lib/analytics.ts` + son test supprimés ; `grep window.plausible|@/lib/analytics' → 0` (les matches `lib/analytics-consent` sont le module consentement de posthog-1, hors périmètre). Transport web branché dans `instrumentation-client.ts` (uniquement si clé présente → sans clé, helpers no-ops).
- **AC4** : `AnalyticsIdentity` (client component monté dans `(app)/layout.tsx`) — `posthog.identify(user.id)` SEULEMENT si session Better Auth + consentement `granted` ; réactif à l'opt-in tardif via l'event `rnr-analytics-consent-change` (posthog-1) ; jamais d'email/PII. `posthog.reset()` au logout dans `sign-out-button.tsx` (après `signOut()`).
- **AC5 — Application décision Plausible (= conservation, posthog-1)** : `PlausibleProvider`, `next-plausible` et `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` **conservés**. Périmètre Plausible restant : **pageviews automatiques uniquement** (stats publiques cookieless, `stats.ridenrest.app`) — les events custom (`booking_click`, funnel 15.3…) ne sont désormais émis QUE vers PostHog via la façade ; les goals custom Plausible historiques cessent d'être alimentés (attendu — la mesure produit migre vers PostHog, Plausible garde l'audience).
- **AC6** : package 18 tests verts (`turbo run test --filter=@ridenrest/analytics` — tasks build/test/lint héritées OK) ; web 94 fichiers / 1104 tests verts (−26 tests de l'ancien `analytics.test.ts` portés dans le package, +8 nouveaux identify/reset) ; lint 0 erreur ; build standalone OK.
- **Nouveaux tests** : `events.test.ts` (18 — portage complet + live_mode_activated + remplacement de client), `analytics-identity.test.tsx` (6 — gating consentement/session, opt-in tardif), `sign-out-button.test.tsx` (2 — reset après signOut, ordre des appels).
- **Note mobile (MOB-6.1 / MOB-4.5)** : pattern d'injection documenté dans le README du package — `posthog-react-native` branchera le même `setAnalyticsClient`.

### File List

- `packages/analytics/package.json` (A)
- `packages/analytics/tsconfig.json` (A)
- `packages/analytics/eslint.config.mjs` (A)
- `packages/analytics/vitest.config.ts` (A)
- `packages/analytics/README.md` (A — taxonomie events × props × écrans)
- `packages/analytics/src/index.ts` (A)
- `packages/analytics/src/types.ts` (A)
- `packages/analytics/src/client.ts` (A)
- `packages/analytics/src/events.ts` (A)
- `packages/analytics/src/events.test.ts` (A)
- `pnpm-lock.yaml` (M)
- `apps/web/package.json` (M — dep `@ridenrest/analytics` workspace:*)
- `apps/web/next.config.ts` (M — `transpilePackages: ['@ridenrest/analytics']`)
- `apps/web/src/instrumentation-client.ts` (M — `setAnalyticsClient` branché sur posthog.capture)
- `apps/web/src/lib/analytics.ts` (D)
- `apps/web/src/lib/analytics.test.ts` (D)
- `apps/web/src/components/shared/search-on-dropdown.tsx` (M — import migré)
- `apps/web/src/components/shared/search-on-dropdown.test.tsx` (M — mock migré)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` (M — import migré)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` (M — import migré)
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` (M — import migré)
- `apps/web/src/app/(app)/live/[id]/page.tsx` (M — import migré + trackLiveModeActivated dans handleConsent)
- `apps/web/src/components/providers/analytics-identity.tsx` (A)
- `apps/web/src/components/providers/analytics-identity.test.tsx` (A)
- `apps/web/src/app/(app)/layout.tsx` (M — montage AnalyticsIdentity)
- `apps/web/src/app/(app)/settings/_components/sign-out-button.tsx` (M — posthog.reset au logout)
- `apps/web/src/app/(app)/settings/_components/sign-out-button.test.tsx` (A)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M)
- `_bmad-output/implementation-artifacts/posthog-2-packages-analytics-taxonomie-instrumentation.md` (M)

## Change Log

- 2026-06-07 — Implémentation complète posthog-2 (T1→T8) : package `@ridenrest/analytics` vendor-agnostic (transport injecté), taxonomie 6 events typée + README, migration des 5 call sites web (+ suppression `lib/analytics.ts`), `live_mode_activated` à l'activation Live, identify/reset gated consentement, décision Plausible appliquée (conservation — périmètre documenté). Package 18 tests + web 1104 tests verts, lint 0 erreur, build standalone OK (fix `transpilePackages`). Status → review.
