---
baseline_commit: 14f829ef20d864fe69e69147724adbc2e083ba7f
---

# Story posthog-1 : SDK PostHog web, consentement RGPD & coexistence Plausible

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product owner**,
I want **PostHog initialisé sur le web avec un consentement RGPD conforme**,
So that **la collecte produit démarre sans exposer le projet à un risque cookies/RGPD**.

> Première story de l'epic-posthog (migration analytics Plausible → PostHog Cloud EU, actée via `sprint-change-proposal-2026-06-07.md`). **Cette story ne migre PAS les events custom** (`trackBookingClick`…) — c'est posthog-2. Plausible reste fonctionnel en parallèle jusqu'à la fin de l'epic. **Prérequis Guillaume** : compte PostHog Cloud EU créé + clé projet disponible.

## Acceptance Criteria

1. **Given** un compte PostHog Cloud EU et sa clé projet
   **When** j'intègre `posthog-js` dans `apps/web`
   **Then** PostHog est initialisé via `instrumentation-client.ts` avec `api_host` pointant sur le reverse proxy local et `ui_host`/cloud **EU** (`https://eu.i.posthog.com`)
   **And** les pageviews remontent dans le projet PostHog après consentement
   **And** aucune collecte ne démarre avant consentement (`opt_out_capturing_by_default: true`)

2. **Given** un visiteur sans choix de consentement enregistré
   **When** il arrive sur le site (marketing ou app)
   **Then** une bannière de consentement s'affiche (Accepter / Refuser), accessible clavier
   **And** son choix est persisté et la bannière ne réapparaît plus

3. **Given** un refus de consentement
   **When** je navigue sur le site
   **Then** aucun cookie ni entrée localStorage PostHog n'est déposé (`opt_out_capturing()` respecté)
   **And** la navigation et toutes les features fonctionnent normalement

4. **Given** un utilisateur connecté
   **When** j'ouvre la page paramètres
   **Then** une section « Confidentialité » permet de modifier le choix de consentement à tout moment (opt-in ↔ opt-out effectif immédiatement)

5. **Given** les requêtes PostHog depuis le navigateur
   **When** un adblocker standard est actif
   **Then** les events passent via le reverse proxy Next.js (rewrites vers `eu.i.posthog.com` + `eu-assets.i.posthog.com`, chemin non évident type `/phrelay/`)

6. **Given** la coexistence avec Plausible
   **When** la story se termine
   **Then** la décision est documentée dans ce fichier (section Dev Agent Record → Completion Notes) : Plausible CE conservé (pages publiques cookieless) **ou** décommission programmée — avec justification (valeur vs ~RAM ClickHouse sur le VPS KVM 2)

## Tasks / Subtasks

- [x] **T1 — Installer et initialiser posthog-js** (AC: 1)
  - [x] `pnpm add posthog-js --filter @ridenrest/web`
  - [x] Créer `apps/web/instrumentation-client.ts` (pattern Next.js 15) : `posthog.init(NEXT_PUBLIC_POSTHOG_KEY, { api_host: '/phrelay', ui_host: 'https://eu.posthog.com', defaults: '2026-01-30', opt_out_capturing_by_default: true, capture_pageview: true })`
  - [x] **Ne pas** toucher au `PlausibleProvider` de `apps/web/src/app/layout.tsx` (coexistence durant l'epic)
- [x] **T2 — Reverse proxy anti-adblock** (AC: 5)
  - [x] Ajouter dans `apps/web/next.config.ts` : `skipTrailingSlashRedirect: true` + `rewrites()` → `/phrelay/static/:path*` → `https://eu-assets.i.posthog.com/static/:path*` ; `/phrelay/:path*` → `https://eu.i.posthog.com/:path*`
  - [x] Vérifier la non-collision avec la config PWA existante (`urlPattern /api/event` NetworkOnly, next.config.ts ~l.49) et le proxy next-plausible
  - [x] Vérifier que les rewrites fonctionnent en build `standalone` (mode de déploiement VPS/PM2)
- [x] **T3 — Env vars** (AC: 1)
  - [x] Déclarer `NEXT_PUBLIC_POSTHOG_KEY` (+ `NEXT_PUBLIC_POSTHOG_HOST` si paramétré) dans `turbo.json#tasks.build.env` — ⚠️ gotcha prod : sans ça le cache turbo ignore les changements de valeur
  - [x] Ajouter sur le VPS dans `.env` (⚠️ gotchas : valeurs en double quotes, pas de commentaire inline) — `deploy.sh` fait `source .env` avant `turbo build` *(action manuelle Guillaume — ligne exacte fournie en Completion Notes ; l'agent n'a pas accès au VPS ni aux fichiers `.env`)*
- [x] **T4 — Bannière de consentement** (AC: 2, 3)
  - [x] Créer `apps/web/src/components/shared/consent-banner.tsx` (client component, monté dans `layout.tsx` root)
  - [x] État : choix persisté (`localStorage` clé `rnr_analytics_consent`: `'granted' | 'denied'`) ; pas de choix → bannière visible
  - [x] Accepter → `posthog.opt_in_capturing()` ; Refuser → `posthog.opt_out_capturing()` (et PostHog reste opt-out par défaut tant qu'aucun choix)
  - [x] UI : composants existants (`Button` custom — `size="lg"` pour les CTA, cf. règles projet), wording FR, lien vers `/mentions-legales`
  - [x] Ne pas utiliser `has_opted_in_capturing()` pour décider l'affichage de la bannière (piège connu PostHog) — se baser sur la clé localStorage
- [x] **T5 — Toggle paramètres** (AC: 4)
  - [x] Ajouter une `Card` « Confidentialité » dans `apps/web/src/app/(app)/settings/page.tsx` (pattern existant : sections Card, cf. `OverpassToggle`)
  - [x] Toggle lit/écrit le même état que la bannière, applique opt_in/opt_out immédiatement
- [x] **T6 — Décision coexistence Plausible** (AC: 6)
  - [x] Documenter la décision avec Guillaume dans Completion Notes : conserver Plausible CE (`stats.ridenrest.app`, Docker : Plausible CE + ClickHouse + plausible-db sur le VPS) ou planifier le décommissionnement (libère ~1-2 Go RAM ClickHouse sur le KVM 2) — l'exécution du décommissionnement éventuel se fait en posthog-2 (retrait `next-plausible`) + tâche infra hors story
- [x] **T7 — Tests** (AC: 1, 2, 3)
  - [x] `consent-banner.test.tsx` (Vitest + RTL, co-localisé) : affichage sans choix, persistance, appels opt_in/opt_out (mock `posthog-js`)
  - [x] Adapter `apps/web/src/app/layout.test.ts` si le layout change (montage bannière)
  - [x] `pnpm lint` + `pnpm test` verts à la racine (turbo)

## Dev Notes

### État réel vérifié (2026-06-07)

- **Plausible actuel** : `next-plausible@4.0.0`, `PlausibleProvider` dans `apps/web/src/app/layout.tsx:31-35` (script proxifié `/js/script.outbound-links.pageview-props.tagged-events.js`, endpoint `/api/event`), self-hosted `stats.ridenrest.app` (Docker VPS). **Ne pas retirer dans cette story.**
- **Aucun composant consentement/cookie n'existe** dans apps/web — tout est à créer.
- **Settings** : `apps/web/src/app/(app)/settings/page.tsx` — sections en `Card` (`@/components/ui/card`), pattern à imiter pour « Confidentialité ».
- **Mentions légales** : `apps/web/src/app/(marketing)/mentions-legales/page.tsx` (sections 6 Données personnelles / 7 Cookies) — la mise à jour de fond est en **posthog-3** ; ici seulement le lien depuis la bannière.
- **Pas de `.env.example`** dans le repo — la doc des env vars passe par turbo.json + VPS `.env`.

### Points de vigilance

1. **`opt_out_capturing_by_default: true` est non négociable** — RGPD : zéro cookie/storage avant opt-in explicite. Tester en navigation privée : Application → Storage doit rester vide de clés `ph_*` avant consentement et après refus.
2. **Route groups** : la bannière doit couvrir `(marketing)` (SSG) ET `(app)` (CSR) → la monter dans le root layout, en client component léger (pas de `'use client'` sur le layout lui-même — wrapper séparé).
3. **`defaults: '2026-01-30'`** (ou plus récent) dans l'init — active les comportements récents recommandés par PostHog.
4. **Session replay : NE PAS l'activer ici** — c'est posthog-3 (masquage carte obligatoire avant toute activation). Si l'option apparaît, `disable_session_recording: true` explicite.
5. **Identify : pas ici** — l'`identify(user.id)` arrive en posthog-2 avec la façade.

### Frontière de story (ce qui n'est PAS dans posthog-1)

- ❌ Migration des helpers `trackBooking…`/call sites → posthog-2
- ❌ `packages/analytics` → posthog-2
- ❌ Session replay + masquage + mentions légales → posthog-3
- ❌ MCP, dashboards, feature flags → posthog-4
- ❌ Retrait de next-plausible / décommission Plausible CE → exécution posthog-2 + infra (seule la **décision** est ici)

### Testing standards

Vitest + jsdom + RTL (`apps/web/vitest.config.ts`, setup `src/test-setup.ts`), tests co-localisés `.test.tsx`. Mock `posthog-js` via `vi.mock`. Commande : `pnpm test` (turbo).

### Project Structure Notes

- `instrumentation-client.ts` à la **racine de apps/web** (convention Next.js 15, pas dans src/ si `srcDir` — vérifier : le projet utilise `src/`, donc `apps/web/src/instrumentation-client.ts` si Next 15.3+ le résout là, sinon racine ; suivre la doc Next de la version installée).
- Composants partagés : `apps/web/src/components/shared/` (kebab-case).
- Respecter `output: 'standalone'` (déploiement PM2) — tester les rewrites en local avec `next start` après build.

### References

- [Source: _bmad-output/planning-artifacts/epics-posthog.md#Story posthog-1]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-07.md §3-4]
- [Source: _bmad-output/planning-artifacts/architecture.md#Amendement 2026-06-07]
- [Source: _bmad-output/project-context.md — règles Next.js App Router, gotchas VPS/.env/turbo, Button sizes]
- [Source: posthog.com/docs/libraries/next-js, /docs/privacy/gdpr-compliance, /docs/advanced/proxy/nextjs — vérifié 2026-06-07]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8[1m]) — Claude Code

### Debug Log References

- `localStorage.clear is not a function` en Vitest : jsdom du projet ne fournit pas localStorage — pattern projet appliqué (mock local `localStorageMock` + `Object.defineProperty`, cf. `pwa-install-banner.test.tsx`)
- Doubles éléments RTL entre tests : `cleanup()` explicite requis en `beforeEach` (pas de `globals: true` dans vitest.config.ts)
- Build standalone vérifié : rewrites `/phrelay/*` présents dans `.next/routes-manifest.json` (afterFiles, ordre static → catch-all préservé)

### Completion Notes List

- **Implementation Plan** : init via `apps/web/src/instrumentation-client.ts` (Next 15.5 résout `instrumentation-client.ts` dans `src/` quand le projet utilise `srcDir`) ; consentement factorisé dans `src/lib/analytics-consent.ts` (clé localStorage `rnr_analytics_consent`, source de vérité unique partagée bannière ↔ toggle settings, sync inter-composants via CustomEvent `rnr-analytics-consent-change`).
- **AC1** : `posthog.init` gated sur présence de `NEXT_PUBLIC_POSTHOG_KEY` ; `api_host: '/phrelay'`, `ui_host: 'https://eu.posthog.com'` (Cloud EU), `defaults: '2026-01-30'`, `opt_out_capturing_by_default: true`, `capture_pageview: true`, `disable_session_recording: true` explicite (replay = posthog-3).
- **AC5** : rewrites `/phrelay/static/:path*` → `eu-assets.i.posthog.com` puis `/phrelay/:path*` → `eu.i.posthog.com` + `skipTrailingSlashRedirect: true`. Non-collision PWA vérifiée + règle **ajoutée** : `urlPattern /\/phrelay\//` → NetworkOnly placée AVANT la règle CacheFirst `\.js$` (sinon le script PostHog serait caché 30 j par le service worker). Proxy next-plausible (`/js/script…`, `/api/event`) intact.
- **AC2/AC3** : `ConsentBanner` monté dans le root layout (couvre `(marketing)` + `(app)`), `role="dialog"`, boutons `Button size="lg"`, lien `/mentions-legales`. Affichage décidé UNIQUEMENT sur la clé localStorage (jamais `has_opted_in_capturing()`). Refus → `opt_out_capturing()` ; aucune collecte avant opt-in (opt-out par défaut).
- **AC4** : section « Confidentialité » (Card) dans Paramètres avec `PrivacyToggle` (switch accessible `role="switch"`), même état que la bannière, opt-in/opt-out PostHog immédiat.
- **AC6 — Décision coexistence Plausible (Guillaume, 2026-06-07)** : **Plausible CE est CONSERVÉ** (`stats.ridenrest.app` — Docker Plausible CE + ClickHouse + plausible-db sur le VPS KVM 2). Justification : stats publiques **cookieless** sur les pages marketing (mesure sans consentement, complémentaire de PostHog qui est opt-in) ; le coût RAM ClickHouse (~1-2 Go) est accepté. Conséquence posthog-2 : `next-plausible` et le `PlausibleProvider` ne seront PAS retirés ; les helpers custom migrent vers PostHog mais les pageviews Plausible continuent.
- **⚠️ Actions manuelles restantes (Guillaume)** : (1) ajouter dans `apps/web/.env` local ET dans `.env` du VPS : `NEXT_PUBLIC_POSTHOG_KEY="phc_…"` (double quotes, pas de commentaire inline) — l'agent n'a pas accès aux fichiers `.env` ; (2) après déploiement avec la clé : vérifier en navigation privée que les pageviews remontent dans PostHog après « Accepter », et que Application → Storage reste vide de clés `ph_*` avant consentement / après refus (AC1/AC3 — vérification visuelle).
- **Tests** : 21 nouveaux tests (consent-banner 7, privacy-toggle 4, instrumentation-client 2, layout 8 dont 5 pré-existants adaptés). Suite web complète : **1113/1113 verts**. ESLint : 0 erreur. Build standalone : OK.

### File List

- `apps/web/package.json` (M — ajout `posthog-js@^1.382.0`)
- `pnpm-lock.yaml` (M)
- `apps/web/src/instrumentation-client.ts` (A — init PostHog)
- `apps/web/src/instrumentation-client.test.ts` (A)
- `apps/web/next.config.ts` (M — skipTrailingSlashRedirect + rewrites /phrelay + règle PWA NetworkOnly)
- `turbo.json` (M — NEXT_PUBLIC_POSTHOG_KEY dans tasks.build.env)
- `apps/web/src/lib/analytics-consent.ts` (A — état consentement partagé)
- `apps/web/src/components/shared/consent-banner.tsx` (A)
- `apps/web/src/components/shared/consent-banner.test.tsx` (A)
- `apps/web/src/app/layout.tsx` (M — montage ConsentBanner)
- `apps/web/src/app/layout.test.ts` (M — tests bannière + coexistence Plausible)
- `apps/web/src/app/(app)/settings/page.tsx` (M — section Confidentialité)
- `apps/web/src/app/(app)/settings/_components/privacy-toggle.tsx` (A)
- `apps/web/src/app/(app)/settings/_components/privacy-toggle.test.tsx` (A)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M)
- `_bmad-output/implementation-artifacts/posthog-1-sdk-web-consentement-coexistence-plausible.md` (M)

## Change Log

- 2026-06-07 — Implémentation complète posthog-1 (T1→T7) : posthog-js + instrumentation-client (opt-out par défaut, Cloud EU), reverse proxy /phrelay (+ règle PWA NetworkOnly), env var turbo.json, bannière de consentement RGPD, toggle Confidentialité settings, décision AC6 = Plausible CE conservé (cookieless marketing). 1113 tests verts, lint 0 erreur, build standalone validé. Status → review.
