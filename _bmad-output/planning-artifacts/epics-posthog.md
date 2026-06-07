---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories']
status: 'draft'
completedAt: '2026-06-07'
inputDocuments:
  - '_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-07.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/architecture-mobile.md'
  - 'apps/web/src/lib/analytics.ts'
  - 'apps/web/src/app/layout.tsx'
scope: 'feature-posthog'
project_name: 'ridenrest-app'
user_name: 'Guillaume'
date: '2026-06-07'
---

# ridenrest-app — Epic Breakdown : Migration analytics Plausible → PostHog

## Overview

Ce document décompose la feature **`epic-posthog`** : migration de l'analytics web de Plausible (self-hosted, `stats.ridenrest.app`) vers **PostHog Cloud EU**, et production de la façade **`packages/analytics`** que la release mobile (epics MOB-1→6) consommera.

**Contexte / problème** : Plausible couvre l'analytics agrégé cookieless mais ne fournira jamais le **session replay**, les **funnels/rétention**, les **feature flags** ni de **serveur MCP**. Or la boucle d'amélioration UX/UI visée (analyser les sessions réelles depuis Claude Code via MCP → corriger → mesurer) repose précisément sur ces capacités. Décision actée via `sprint-change-proposal-2026-06-07.md` (correct-course).

**Objectif** : PostHog opérationnel sur le web (events + replay masqué + consentement RGPD + MCP), avec une taxonomie d'events typée partagée monorepo, **avant** que le train mobile n'atteigne ses stories analytics (MOB-4.5 au plus tôt).

**Existant à migrer** (story 15.3 web) :
- `next-plausible` proxifié dans `apps/web/src/app/layout.tsx` (`/js/script…` + endpoint `/api/event`) ;
- 5 helpers typés dans `apps/web/src/lib/analytics.ts` : `trackBookingClick`, `trackGpxUploaded`, `trackMapOpened`, `trackPoiSearchTriggered`, `trackPoiDetailOpened` (+ `hashAdventureId`) — **les signatures sont conservées**, seul le transport change ;
- ~~endpoint NestJS `/analytics/click`~~ — **n'existe pas en réalité** (vérifié code 2026-06-07) : FR-062 est couvert côté client par l'event `booking_click` ; rien à conserver côté API.

**Contraintes structurantes :**
- **RGPD « GPS jamais hors device »** étendue au replay : l'écran Live affiche la carte avec la position → masquage obligatoire des canvas MapLibre (`ph-no-capture`) et de toute PII.
- **Cookies web** : PostHog n'est pas cookieless → consentement requis (bannière publique / toggle utilisateurs connectés).
- **PostHog Cloud EU** (résidence des données UE) — pas de self-host (ClickHouse/Kafka incompatibles avec le VPS Hostinger).
- **Prérequis Guillaume** : compte PostHog Cloud EU créé + clé projet disponible (`NEXT_PUBLIC_POSTHOG_KEY`, host `https://eu.i.posthog.com`).

**Séquencement** : exécutable immédiatement, en parallèle de MOB-1 (aucune dépendance croisée). Seule contrainte aval : **posthog-2 livré avant MOB-4.5**.

## FR / NFR Coverage

| ID | Exigence | Couverture |
|---|---|---|
| FR-062 | Tracking des clics réservation à des fins d'analytics | posthog-2 (taxonomie + `trackBookingClick` migré) |
| NFR-012 | Données de géolocalisation jamais persistées côté serveur | posthog-3 (masquage carte/PII dans les replays — extension de la règle à l'écran enregistré) |
| NFR-013 | Consentement explicite avant collecte | posthog-1 (UI consentement web), posthog-3 (replay gated par consentement) |
| NFR-016 | Politique de confidentialité publiée et à jour | posthog-3 (mise à jour replay + cookies) |

---

## Epic posthog : Migration analytics PostHog (web)

**Goal** : Remplacer Plausible par PostHog Cloud EU sur le web pour débloquer session replay, analytics produit, feature flags et la boucle MCP d'analyse UX — en produisant la façade `packages/analytics` que le mobile consommera.

### Story posthog-1 : SDK web, consentement & coexistence Plausible

As a **product owner**,
I want **PostHog initialisé sur le web avec un consentement RGPD conforme**,
So that **la collecte produit démarre sans exposer le projet à un risque cookies/RGPD**.

**Acceptance Criteria :**

**Given** un compte PostHog Cloud EU et sa clé projet (prérequis Guillaume)
**When** j'intègre `posthog-js` dans `apps/web`
**Then** PostHog est initialisé avec host EU (`https://eu.i.posthog.com`) et les events de base (pageviews) remontent
**And** aucune collecte ne démarre avant consentement (init en `opt_out` par défaut)

**Given** un visiteur sans consentement enregistré
**When** il arrive sur le site
**Then** une UI de consentement est proposée (bannière sur pages publiques, toggle paramètres pour les connectés)
**And** le refus est respecté : zéro cookie PostHog déposé, navigation intacte

**Given** la coexistence avec Plausible
**When** la story se termine
**Then** la décision est documentée dans la story (Plausible conservé pour les pages publiques cookieless **ou** décommissionné) avec sa justification

### Story posthog-2 : `packages/analytics` — taxonomie typée & instrumentation

As a **développeur (web puis mobile)**,
I want **une façade analytics typée partagée dans le monorepo**,
So that **web et mobile émettent les mêmes events sans dépendre directement du vendor**.

**Acceptance Criteria :**

**Given** les 5 helpers existants de `apps/web/src/lib/analytics.ts`
**When** je crée `packages/analytics`
**Then** les signatures sont conservées (`trackBookingClick`, `trackGpxUploaded`, `trackMapOpened`, `trackPoiSearchTriggered`, `trackPoiDetailOpened`, `hashAdventureId`) avec un transport PostHog injectable (web : `posthog-js` ; mobile plus tard : `posthog-react-native`)
**And** la taxonomie (noms d'events, props) est typée et documentée dans le package

**Given** les call sites web existants
**When** je migre l'instrumentation
**Then** tous les appels passent par `packages/analytics` (plus aucun `window.plausible` dans `apps/web/src`)
**And** les tests existants (`analytics.test.ts`, `layout.test.ts`) sont adaptés et verts

**Given** un utilisateur connecté ayant consenti
**When** une session démarre
**Then** `identify` est appelé avec l'id utilisateur (jamais d'email en clair dans les props)

### Story posthog-3 : Session replay web & masquage RGPD

As a **product owner**,
I want **le session replay activé avec un masquage strict**,
So that **j'analyse les parcours réels sans jamais enregistrer la position de l'utilisateur ni de PII**.

**Acceptance Criteria :**

**Given** le session replay PostHog
**When** je l'active sur le web
**Then** il n'enregistre que les sessions des utilisateurs ayant explicitement consenti (consentement posthog-1)

**Given** la règle RGPD « GPS jamais hors device »
**When** un replay couvre une page carte (map ou Live)
**Then** les canvas MapLibre sont masqués (`ph-no-capture`) — la position de l'utilisateur n'apparaît dans aucun enregistrement
**And** les champs PII (email, identifiants) sont masqués par défaut

**Given** la politique de confidentialité
**When** la story se termine
**Then** elle documente le replay (finalité, masquage, consentement, durée de rétention) et les cookies PostHog (NFR-016)

### Story posthog-4 : MCP PostHog, dashboards & feature flags

As a **product owner outillé par Claude Code**,
I want **interroger PostHog depuis Claude Code et disposer de dashboards funnels**,
So that **la boucle analyse → amélioration UX/UI fonctionne de bout en bout**.

**Acceptance Criteria :**

**Given** le serveur MCP PostHog
**When** je le configure dans Claude Code (clé API personnelle, scope projet)
**Then** je peux interroger insights, funnels et métadonnées de replays en langage naturel depuis une session Claude Code

**Given** les events de posthog-2
**When** je crée les dashboards initiaux
**Then** au moins deux funnels existent : « upload GPX → recherche POI → clic réservation » et « activation Live → recherche Live → clic réservation »

**Given** le besoin de rollout progressif mobile à venir
**When** la story se termine
**Then** un feature flag de démonstration est créé et lu côté web (pattern documenté pour le mobile)

---

**Total** : 1 epic, 4 stories. Aval : MOB-6.1 (branchement mobile), MOB-6.6 (replay mobile production, post-v1). Référence : `sprint-change-proposal-2026-06-07.md`.

---

## Amendement 2026-06-07 — Extension taxonomie : funnel d'acquisition (post-epic)

Demande Guillaume après la livraison des 4 stories : tracker la landing, le clic « Se connecter » et le parcours de création de compte. Ajout via `@ridenrest/analytics` (règle projet — pas de hack one-shot PostHog) :

| Event | Props | Émetteurs |
|---|---|---|
| `landing_cta_clicked` | `placement` (header / feature_step_one/two/three), `authenticated` | CTA « Se connecter / Mes aventures » (marketing-header + 3 feature steps) |
| `signup_started` | `method` (email / google) | register-form (submit valide), google-sign-in-button (flow=register, avant redirect OAuth) |
| `signup_completed` | `method` | register-form (succès email). ⚠️ google non émis web (redirect hors domaine) — complétion via persons PostHog |
| `login_completed` | `method` | login-form (succès email). ⚠️ même limitation google |

Funnel : `$pageview` (landing) → `landing_cta_clicked` → `signup_started` → `signup_completed`. L'audience exhaustive de la landing reste Plausible (cookieless) ; PostHog = visiteurs consentants. Détail : `packages/analytics/README.md`.
