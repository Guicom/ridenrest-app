---
baseline_commit: efdf894
---

# Story posthog-4 : MCP PostHog, dashboards & feature flags

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product owner outillé par Claude Code**,
I want **interroger PostHog depuis Claude Code et disposer de dashboards funnels**,
So that **la boucle analyse → amélioration UX/UI fonctionne de bout en bout**.

> Dernière story de l'epic. Dépend de **posthog-2** (events qui coulent) et bénéficie de **posthog-3** (replays disponibles). Story majoritairement **configuration/outillage** (PostHog UI + config locale Claude Code) avec une petite part de code (lecture d'un feature flag côté web). C'est la story qui concrétise la motivation n°1 du switch : la boucle MCP.

## Acceptance Criteria

1. **Given** le serveur MCP PostHog
   **When** je le configure dans Claude Code
   **Then** la connexion utilise le serveur officiel distant (`https://mcp.posthog.com/mcp`) avec une clé API personnelle à scope minimal, configurée au **niveau utilisateur** (`-s user`) — jamais commitée dans le repo
   **And** depuis une session Claude Code je peux interroger insights, funnels et métadonnées de replays en langage naturel (requête de validation documentée en Completion Notes)

2. **Given** les events de posthog-2
   **When** je crée les dashboards initiaux dans PostHog
   **Then** au moins deux funnels existent :
   - « Planning → réservation » : `gpx_uploaded` → `poi_search_triggered` (mode=planning) → `booking_click`
   - « Live → réservation » : `live_mode_activated` → `poi_search_triggered` (mode=live) → `booking_click`
   **And** un dashboard « RideNRest — Produit » regroupe ces funnels + pageviews + compteur d'events clés

3. **Given** le besoin de rollout progressif mobile à venir
   **When** la story se termine
   **Then** un feature flag de démonstration existe dans PostHog et est lu côté web via le pattern recommandé (`onFeatureFlags` callback / `isFeatureEnabled`)
   **And** le pattern de consommation (web + mobile à venir) est documenté dans `packages/analytics/README.md`

4. **Given** l'équipe (Guillaume + agents)
   **When** je consulte la documentation projet
   **Then** un guide court existe : comment poser une question produit via MCP, où vivent les dashboards, comment créer/lire un flag (section README `packages/analytics` ou doc projet)

## Tasks / Subtasks

- [ ] **T1 — Configurer le MCP PostHog dans Claude Code** (AC: 1) — ⚠️ **ACTION GUILLAUME** (clé API personnelle, hors repo ; commandes exactes en Completion Notes)
  - [ ] Créer une **clé API personnelle** dans PostHog EU (scope minimal : lecture insights/recordings/flags ; écriture flags si souhaité pour T3)
  - [ ] `claude mcp add --transport http posthog https://mcp.posthog.com/mcp -s user` (config user-level : la clé ne touche jamais le repo)
  - [ ] Vérifier l'auth région EU (le routing US/EU suit le compte)
  - [ ] Validation : depuis Claude Code, demander par ex. « combien de `booking_click` cette semaine ? » et « liste les replays de plus de 2 min » — consigner les requêtes/réponses en Completion Notes
  - [x] ⚠️ Sécurité : revoir les tool calls MCP avant exécution (risque prompt injection via données analytics) — noter cette règle dans le guide T4
- [ ] **T2 — Dashboards & funnels** (AC: 2) — ⚠️ **ACTION GUILLAUME** (PostHog UI ou via MCP une fois T1 fait ; specs exactes prêtes dans le README analytics)
  - [ ] Dans PostHog UI : funnel « Planning → réservation » (`gpx_uploaded` → `poi_search_triggered` filtré `mode=planning` → `booking_click`)
  - [ ] Funnel « Live → réservation » (`live_mode_activated` → `poi_search_triggered` filtré `mode=live` → `booking_click`)
  - [ ] Dashboard « RideNRest — Produit » : les 2 funnels + tendance pageviews + events clés (`booking_click` par `source`, `poi_detail_opened` par `poi_type`)
  - [ ] Si le volume de données est encore trop faible pour valider visuellement, générer quelques events de test (environnement local pointé sur le projet EU, à marquer/filtrer) — noter la méthode en Completion Notes
- [ ] **T3 — Feature flag de démonstration** (AC: 3) — code + doc faits ; création du flag = **ACTION GUILLAUME**
  - [ ] Créer le flag `demo-rollout` dans PostHog (rollout 100%, désactivable)
  - [x] Côté web : lecture via `posthog.onFeatureFlags(() => posthog.isFeatureEnabled('demo-rollout'))` — usage anodin et visible en dev uniquement (ex. log/badge dev), pas d'impact produit
  - [x] Documenter dans `packages/analytics/README.md` le pattern : web (`posthog-js`), mobile à venir (`posthog-react-native` — même API), bonnes pratiques (timeout flags, valeur par défaut sûre, kill-switch)
- [x] **T4 — Guide d'usage** (AC: 4)
  - [x] Section « Boucle produit » dans `packages/analytics/README.md` : 1) poser une question via MCP, 2) lire un funnel/replay, 3) en tirer une story d'amélioration (renvoyer vers le flux BMad correct-course/create-story), 4) règle de prudence MCP (review des tool calls)
  - [x] Lister les noms exacts des dashboards/funnels créés (pour les retrouver via MCP)

## Dev Notes

### État réel vérifié (2026-06-07)

- **Aucune config MCP n'existe dans le repo** (pas de `.mcp.json`) — et c'est voulu : la clé API PostHog est personnelle, la config se fait en scope user (`-s user`), hors repo. Ne PAS créer de `.mcp.json` projet contenant un secret.
- **Events disponibles après posthog-2** : `booking_click` (props `source`, `poi_type`, `page`, `user_tier`), `gpx_uploaded` (`segment_count`, `total_km`), `map_opened` (`adventure_id_hash`), `poi_search_triggered` (`mode`, `poi_categories`, `result_count`), `poi_detail_opened` (`poi_type`, `source`), `live_mode_activated` (`adventure_id_hash`).
- Le funnel Live exploite le prop `mode` de `poi_search_triggered` — déjà émis avec `mode: 'live'` depuis `live/[id]/page.tsx`.

### Points de vigilance

1. **Secrets** : clé API PostHog personnelle = niveau user uniquement. Si un jour une config projet partagée est souhaitée, passer par une env var référencée, jamais la valeur en clair.
2. **MCP & prompt injection** : les données analytics (noms d'events, propriétés, URLs de replays) sont des données non fiables qui transitent vers le contexte de l'agent — toujours relire les tool calls. Règle à inscrire dans le guide T4.
3. **Funnels** : la fenêtre de conversion par défaut (14 jours) est adaptée au cycle « planification d'aventure » — la conserver, l'ajuster seulement avec des données réelles.
4. **Peu de code dans cette story** — le risque n'est pas technique mais « configuration non documentée ». Tout ce qui est créé dans PostHog UI doit être nommé/listé dans le README (sinon irretrouvable via MCP et non reproductible).
5. **Doc Sync Rule** : si la taxonomie s'avère insuffisante pour les funnels (prop manquant), l'ajout passe par `packages/analytics` + mise à jour `epics-posthog.md` — pas de hack one-shot dans PostHog.

### Intelligence stories précédentes

- posthog-2 : taxonomie + README du package — cette story l'enrichit (flags, replay patterns, guide boucle produit) au lieu de créer un doc séparé.
- posthog-3 : rétention des replays réglée — les requêtes MCP sur les replays respectent cette fenêtre.

### Frontière de story

- ❌ Flags consommés en production pour de vraies features → futures stories (pattern seulement)
- ❌ Replay mobile / flags mobile → MOB-6.1, MOB-6.6
- ❌ A/B tests / experiments → post-epic, quand le trafic le justifiera

### Testing standards

Code minimal (lecture flag) : test Vitest co-localisé si un composant/hook est créé ; sinon vérification manuelle documentée (Completion Notes). Pas de test d'intégration contre l'API PostHog réelle.

### Project Structure Notes

Livrables principalement hors code : config MCP user-level, objets PostHog UI, documentation dans `packages/analytics/README.md`.

### References

- [Source: _bmad-output/planning-artifacts/epics-posthog.md#Story posthog-4]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-07.md §1 — motivation MCP]
- [Source: posthog.com/docs/model-context-protocol/claude-code — `claude mcp add --transport http posthog https://mcp.posthog.com/mcp` — vérifié 2026-06-07]
- [Source: posthog.com/docs/api/feature-flags — isFeatureEnabled/onFeatureFlags]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8[1m]) — Claude Code

### Debug Log References

- RAS — partie code minimale (lecture flag) + documentation. 1112 tests web verts, lint 0 erreur, build OK.

### Completion Notes List

- **Livré (code)** : lecture du flag `demo-rollout` dans `instrumentation-client.ts` via le pattern recommandé `posthog.onFeatureFlags(() => posthog.isFeatureEnabled('demo-rollout'))` — log `console.info` en dev uniquement, aucun impact produit. 3 tests co-localisés (callback enregistré, lecture du flag en dev, silence hors dev).
- **Livré (doc, `packages/analytics/README.md`)** : section « Feature flags » (pattern web + mobile, valeur par défaut sûre quand les flags n'ont pas chargé, kill-switch, interdiction de gater une feature sécurité/RGPD) ; section « Boucle produit » (4 étapes : question MCP → lecture funnel/replay → story via correct-course/create-story → règle de prudence prompt-injection MCP) ; inventaire des objets PostHog (noms exacts dashboard/funnels/flag, à garder à jour).
- **⚠️ Actions manuelles restantes (Guillaume — config personnelle/PostHog UI, hors repo par design)** :
  1. **MCP (T1)** : créer une clé API personnelle dans PostHog EU (Settings → Personal API keys, scope minimal lecture insights/recordings/flags + écriture flags si souhaité), puis : `claude mcp add --transport http posthog https://mcp.posthog.com/mcp -s user` (l'auth se fait au premier usage ; la clé ne touche JAMAIS le repo — pas de `.mcp.json` projet). Valider avec : « combien de booking_click cette semaine ? » et « liste les replays de plus de 2 min » ; coller les requêtes/réponses ici.
  2. **Dashboards (T2)** : créer les 2 funnels + le dashboard « RideNRest — Produit » (specs exactes : README analytics §Inventaire ; fenêtre de conversion 14 j par défaut, conserver). Une fois le MCP configuré, possible en langage naturel depuis Claude Code (« crée un funnel… »). Si volume trop faible : générer des events de test en local (`pnpm dev` avec la clé du projet EU dans `.env`) et noter la méthode ici.
  3. **Flag (T3)** : créer `demo-rollout` dans PostHog UI (rollout 100 %, désactivable) — le code web le loggue en dev dès qu'il existe.
- **Sécurité MCP** : règle de prudence inscrite au guide (README §Boucle produit, point 4) — les données analytics sont non fiables, relire les tool calls MCP avant exécution.
- **Story frontière** : aucun flag consommé en prod pour de vraies features (pattern seulement) ; A/B tests post-epic.

### File List

- `apps/web/src/instrumentation-client.ts` (M — lecture flag demo-rollout via onFeatureFlags, dev only)
- `apps/web/src/instrumentation-client.test.ts` (M — 3 tests flags)
- `packages/analytics/README.md` (M — sections Feature flags + Boucle produit + Inventaire PostHog)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M)
- `_bmad-output/implementation-artifacts/posthog-4-mcp-dashboards-feature-flags.md` (M)

## Change Log

- 2026-06-07 — Implémentation posthog-4 (partie code + doc) : lecture flag `demo-rollout` (pattern onFeatureFlags/isFeatureEnabled, dev only, 3 tests), README analytics enrichi (flags web/mobile, guide boucle produit MCP, inventaire des objets PostHog). 1112 tests verts, lint 0 erreur, build OK. **T1 (MCP user-level), T2 (funnels/dashboard) et création du flag (T3) = actions manuelles Guillaume — commandes et specs documentées.** Status → review.
