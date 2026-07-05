---
date: '2026-06-07'
workflowType: 'correct-course'
status: 'approved'
author: 'Guillaume (via correct-course)'
changeScope: 'moderate'
relatedDocuments:
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/architecture-mobile.md'
  - '_bmad-output/planning-artifacts/epics-mobile.md'
  - '_bmad-output/implementation-artifacts/sprint-status.yaml'
---

# Sprint Change Proposal — Migration analytics Plausible → PostHog

## 1. Résumé du problème

**Déclencheur** : décision stratégique d'outillage (catégorie : nouvelle exigence / pivot d'outillage), actée lors de la revue de la release mobile (discussion 2026-06-05 → 2026-06-07). Pas de story déclenchante — le besoin a émergé en préparant l'epic MOB-6 (observabilité).

**Problème** : Plausible (self-hosted, `stats.ridenrest.app`) couvre l'analytics agrégé cookieless mais ne fournira jamais :
- **Session Replay** (web + mobile) — besoin central pour itérer l'UX/UI sur la base de sessions réelles ;
- **Analytics produit** : funnels, rétention par cohorte, feature flags (utiles au rollout mobile) ;
- **Serveur MCP** — interrogation des insights/replays directement depuis Claude Code (boucle analyse → amélioration UX).

**Preuves / état des lieux** :
- Web en prod : `next-plausible` proxifié dans `apps/web/src/app/layout.tsx` + helpers typés `apps/web/src/lib/analytics.ts` (`trackBookingClick`, `trackGpxUploaded`, `trackMapOpened`, `trackPoiSearchTriggered`, `trackPoiDetailOpened` — story 15.3) + endpoint NestJS `/analytics/click` (FR-062 — ⚠️ correctif post-approbation 2026-06-07 : vérification code, cet endpoint n'a jamais été implémenté ; FR-062 est couvert client-side par `booking_click`).
- Release mobile planifiée sur Plausible : `architecture-mobile.md` (~10 références), `epics-mobile.md` (FR-MOB-020, story MOB-6.1), `sprint-status.yaml` (`MOB-6-1-sentry-crash-plausible-analytics`).
- Contrainte RGPD structurante du projet : « la position GPS ne quitte jamais le device » — or le session replay enregistre l'écran, qui affiche la carte avec la position en mode Live → **masquage obligatoire**.

## 2. Analyse d'impact

### Epics

| Epic | Impact |
|---|---|
| **Nouveau : `epic-posthog`** (web, 4 stories) | À créer — release outillage web **avant** la release mobile. Fournit `packages/analytics` (taxonomie partagée monorepo) dont les epics mobiles héritent. |
| MOB-1 → MOB-3 | Aucun impact (aucune story analytics). MOB-1 démarre en parallèle, sans dépendance sur epic-posthog. |
| MOB-4 | MOB-4.5 (clics affiliés) : AC mentionne « (FR-062, Plausible) » → consomme `packages/analytics`. **Dépendance souple** : epic-posthog livré avant MOB-4.5 (large marge, MOB-1 vient de démarrer). |
| MOB-5 | Events Live (activation, recherche) passeront par `packages/analytics` — pas de changement de story, la façade absorbe tout. |
| MOB-6 | **MOB-6.1 réécrite** : « Sentry + Plausible » → « Sentry + branchement PostHog mobile ». MOB-6.4 (Privacy Labels) inchangée sur le fond — la déclaration « analytics » reste, le replay beta n'impacte pas la soumission prod. **Nouvelle story MOB-6.6** (post-v1) : session replay mobile en production. |
| Epics web terminés | Aucun rollback. Plausible web reste en service pendant la transition (coexistence tranchée en posthog-1). |

### Artefacts

| Artefact | Impact |
|---|---|
| **prd.md** | ✅ Aucun changement — FR-062 est agnostique de l'outil (« trace les clics… à des fins d'analytics »). MVP non affecté. |
| **architecture.md** (web) | Mineur — le doc ne mentionne pas Plausible (intégré post-rédaction via story 15.3). Ajout d'une note d'amendement « Analytics 2026-06 : PostHog » en fin de document. |
| **architecture-mobile.md** | ~10 références Plausible à remplacer (lignes 121, 291, 432, 476, 591, 824, 836, 1087, 1258, 1331) + note d'amendement replay/consentement/masquage. |
| **epics-mobile.md** | FR-062 (l.124), FR-MOB-020 (l.248), FR Coverage Map (l.294), AC MOB-4.5 (l.780), story MOB-6.1 (réécriture), ajout MOB-6.6. |
| **ux-design-specification.md** | N/A — l'UI du consentement web (bannière/toggle) est conçue dans posthog-1. |
| **sprint-status.yaml** | Ajout bloc `epic-posthog` (4 stories) + renommage clé `MOB-6-1-…-plausible-…` → `…-posthog-…` + ajout `MOB-6-6`. |
| Secondaires | Env vars (`NEXT_PUBLIC_POSTHOG_KEY`, host EU), politique de confidentialité (posthog-3), config MCP Claude Code (posthog-4). |

### Technique

- **PostHog Cloud EU** (pas de self-host : ClickHouse/Kafka trop lourds pour le VPS Hostinger).
- Mobile : `posthog-react-native` — zéro cookie (distinct_id en AsyncStorage). Web : cookies → consentement requis.
- Replay mobile = module natif → nouveau binaire store (pas OTA) → justifie la release post-v1 (MOB-6.6).
- Helpers existants `lib/analytics.ts` (signatures typées) = base directe de la taxonomie `packages/analytics` — les call sites web gardent les mêmes noms de fonctions, seul le transport change.

## 3. Approche recommandée

**Option retenue : Ajustement direct (Option 1)** — effort **Moyen**, risque **Faible**.

- Ajout d'un epic web + modification ciblée de 2 documents et 1 story backlog. Aucun code mobile analytics n'existe encore → fenêtre idéale, zéro rework.
- Rollback (Option 2) : N/A — rien à annuler, Plausible web reste actif pendant la transition.
- Révision MVP (Option 3) : N/A — MVP web livré, scope MVP mobile inchangé.

**Séquencement** : epic-posthog exécutable immédiatement, en parallèle de MOB-1 (aucune dépendance croisée). Seule contrainte : posthog-2 (`packages/analytics`) livré avant MOB-4.5.

## 4. Propositions de modification détaillées

### 4.1 Nouvel epic : `epics-posthog.md` (web)

**Goal** : Remplacer Plausible par PostHog (Cloud EU) sur le web pour débloquer session replay, analytics produit, feature flags et la boucle MCP d'analyse UX — en produisant la façade `packages/analytics` que le mobile consommera.

| Story | Titre | Contenu |
|---|---|---|
| posthog-1 | SDK web + consentement + coexistence Plausible | PostHog Cloud EU, `posthog-js` dans `apps/web`, UI de consentement (bannière publique / toggle connectés), décision documentée : Plausible conservé pages publiques ou décommissionné |
| posthog-2 | `packages/analytics` — taxonomie typée + instrumentation | Package monorepo, migration des 5 helpers de `lib/analytics.ts` (signatures conservées), call sites web migrés, identify utilisateurs connectés |
| posthog-3 | Session replay web + masquage RGPD | Replay activé avec masquage carte (`ph-no-capture` sur les canvas MapLibre) + PII, gated par consentement, politique de confidentialité mise à jour |
| posthog-4 | MCP PostHog + dashboards | Serveur MCP dans Claude Code, dashboards funnels clés (upload GPX → recherche POI → clic réservation ; activation Live), feature flags prêts à l'emploi |

### 4.2 `epics-mobile.md`

**(a) Ligne 124 — tableau FR hérités :**
```
OLD : | FR-062 | Tracking des clics réservation (analytics) | Plausible Events API (`POST /api/event`) |
NEW : | FR-062 | Tracking des clics réservation (analytics) | `packages/analytics` (PostHog, partagé web ↔ mobile) |
```

**(b) Ligne 248 — FR-MOB-020 :**
```
OLD : analytics via **Plausible Events API** (`POST /api/event` → `stats.ridenrest.app`, dashboard unifié web + mobile).
NEW : analytics via **`packages/analytics` → PostHog Cloud EU** (`posthog-react-native`, zéro cookie mobile — distinct_id AsyncStorage, dashboard unifié web + mobile). Session replay : builds beta uniquement (EAS development/preview ou feature flag) ; activation production = release dédiée post-v1 (MOB-6.6, nouveau binaire natif requis).
```

**(c) Ligne 294 — FR Coverage Map :** `Sentry + Plausible Events` → `Sentry + PostHog (packages/analytics)` ; ajout ligne MOB-6.6.

**(d) Ligne 780 — AC MOB-4.5 :** `(FR-062, Plausible)` → `(FR-062, packages/analytics → PostHog)`.

**(e) Story MOB-6.1 réécrite** — titre : « Crash reporting (Sentry) & analytics (PostHog) » ; AC Plausible remplacé par : branchement `posthog-react-native` sur `packages/analytics` existant, events visibles dans le dashboard PostHog unifié, zéro cookie, AC RGPD inchangé (aucune donnée GPS transmise), replay activé **uniquement** sur builds beta.

**(f) Nouvelle story MOB-6.6 (post-v1)** — « Session replay mobile en production » : module natif replay, masquage carte/PII validé en beta, consentement in-app, mise à jour Privacy Nutrition Labels + Data Safety, nouveau binaire soumis.

### 4.3 `architecture-mobile.md`

Remplacement des ~10 références Plausible (l.121, 291, 432, 476, 591, 824, 836, 1087, 1258, 1331) : `Plausible Events API` → `packages/analytics (PostHog Cloud EU)` ; `lib/analytics/plausible.ts` → `lib/analytics/posthog.ts (consomme packages/analytics)`. Ajout d'une note d'amendement datée 2026-06-07 (rationale replay/MCP, règle masquage carte, replay beta-only, MOB-6.6).

### 4.4 `architecture.md` (web)

Ajout d'une courte section « Amendement 2026-06-07 — Analytics » en fin de document : Plausible (intégré story 15.3) remplacé par PostHog Cloud EU via `packages/analytics` (cf. epic-posthog) ; consentement cookies web ; replay masqué. (Correctif 2026-06-07 : l'endpoint `/analytics/click` n'existe pas dans `apps/api` — rien à conserver.)

### 4.5 `sprint-status.yaml`

- Ajout bloc `epic-posthog: backlog` + 4 stories `posthog-1-…` → `posthog-4-…` (après `epic-live-profile`, avant le bloc MOB).
- Renommage `MOB-6-1-sentry-crash-plausible-analytics` → `MOB-6-1-sentry-crash-posthog-analytics`.
- Ajout `MOB-6-6-session-replay-mobile-production: backlog` (annoté post-v1).

## 5. Plan de mise en œuvre et handoff

**Classification : Moderate** (réorganisation backlog + mise à jour artefacts de planification — pas de replan fondamental : PRD et MVP intacts).

| Responsable | Tâches |
|---|---|
| PO/Dev (exécution déléguée à l'agent, session courante) | Appliquer les éditions 4.2 → 4.5, créer `epics-posthog.md` (4.1), mettre à jour `sprint-status.yaml` |
| Dev (sessions futures) | `/bmad-create-story posthog-1` → cycle CS/DS/CR habituel ; MOB-6.1 suivra le flux normal du train mobile |
| Guillaume | Créer le compte PostHog Cloud EU + récupérer la clé projet (prérequis posthog-1) ; trancher la coexistence Plausible dans posthog-1 |

**Critères de succès** :
- Plus aucune référence Plausible dans les artefacts du train mobile ;
- `epics-posthog.md` créé, 4 stories prêtes pour `create-story` ;
- `sprint-status.yaml` cohérent (epic-posthog + clés MOB renommées) ;
- La règle RGPD « GPS jamais hors device » explicitement étendue au replay (masquage carte) dans les deux architectures.
