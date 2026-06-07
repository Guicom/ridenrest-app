---
baseline_commit: 9d75ce0
---

# Story posthog-3 : Session replay web & masquage RGPD

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product owner**,
I want **le session replay activé avec un masquage strict**,
So that **j'analyse les parcours réels sans jamais enregistrer la position de l'utilisateur ni de PII**.

> Dépend de **posthog-1** (consentement) et **posthog-2** (init/transport stabilisés). ⚠️ **Story à enjeu RGPD maximal** : le replay enregistre l'écran, et l'écran Live affiche la carte avec la position GPS de l'utilisateur. La règle projet « la position GPS ne quitte JAMAIS le device » s'étend ici à l'écran enregistré — **le masquage carte n'est pas une option, c'est le cœur de la story**. Les patterns de masquage validés ici servent de référence au replay mobile (MOB-6.1 beta, MOB-6.6 prod).

## Acceptance Criteria

1. **Given** le session replay PostHog
   **When** je l'active sur le web
   **Then** il n'enregistre que les sessions des utilisateurs ayant explicitement consenti (réutilise le consentement posthog-1 — aucun enregistrement en opt-out ni avant choix)

2. **Given** la règle RGPD « GPS jamais hors device »
   **When** un replay couvre une page carte (planning `/map/[id]` ou live `/live/[id]`)
   **Then** les conteneurs carte MapLibre sont masqués dans l'enregistrement (`ph-no-capture`) — la position, la trace et la zone de recherche n'apparaissent dans **aucun** replay
   **And** les inputs sont masqués globalement (`maskAllInputs: true`)

3. **Given** les éléments affichant des données personnelles hors carte
   **When** un replay est enregistré
   **Then** l'email utilisateur (settings, header/menu compte) est masqué
   **And** les requêtes réseau capturées ne contiennent ni token ni header d'auth (config `session_recording` réseau par défaut conservée ou durcie)

4. **Given** un replay enregistré en conditions réelles
   **When** je le relis dans PostHog
   **Then** une vérification manuelle documentée confirme : zone carte vide/bloquée sur les pages map et live, inputs masqués, métriques distance/ETA du panneau Live visibles (elles ne révèlent pas la position absolue) — captures ou notes en Completion Notes

5. **Given** la politique de confidentialité (`/mentions-legales`)
   **When** la story se termine
   **Then** elle documente : PostHog Cloud EU (sous-traitant, données à Francfort), finalité du replay, masquage carte/PII, durée de rétention, liste des cookies/storage PostHog, droit de retrait via la bannière/le toggle paramètres (NFR-016)

6. **Given** la suite de tests
   **When** je lance `pnpm test`
   **Then** des tests de régression garantissent la présence de `ph-no-capture` sur les deux conteneurs carte (planning + live)

## Tasks / Subtasks

- [x] **T1 — Activer le replay, gated par consentement** (AC: 1)
  - [x] Dans l'init PostHog (`instrumentation-client.ts`) : `disable_session_recording: true` par défaut
  - [x] Démarrer explicitement : si consentement `granted` → `posthog.startSessionRecording()` (au boot et au moment d'un opt-in via bannière/toggle) ; à l'opt-out → `posthog.stopSessionRecording()`
  - [x] Config `session_recording`: `{ maskAllInputs: true }` (+ `maskTextSelector` ciblé si besoin identifié en T3)
- [x] **T2 — Masquage carte (cœur RGPD)** (AC: 2)
  - [x] `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` : ajouter `ph-no-capture` sur le `<div ref={mapContainerRef}>` (~l.76)
  - [x] `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` : idem (~l.60)
  - [x] Auditer les surfaces annexes révélant la position : `TraceClickCta` (km cliqué — position relative, OK), mini-profil d'élévation Live (position relative sur la trace, OK), `PoiPopup` (POI publics, OK) — masquer en plus **tout élément affichant des coordonnées absolues** s'il en existe
- [x] **T3 — Masquage PII hors carte** (AC: 3)
  - [x] Settings : masquer l'email affiché (classe `ph-no-capture` ou `maskTextSelector`)
  - [x] Vérifier le header/menu compte (email/nom affiché ?) et les pages auth (`maskAllInputs` couvre les forms)
  - [x] Réseau : conserver les défauts PostHog (pas de capture des bodies) ; vérifier qu'aucun header Authorization n'apparaît dans les recordings réseau
- [ ] **T4 — Vérification manuelle en conditions réelles** (AC: 4) — ⚠️ **EN ATTENTE GUILLAUME** (nécessite la clé PostHog dans `.env` + un replay réel ; protocole détaillé en Completion Notes)
  - [ ] Build prod local (`next build` + `next start`), session consentie : parcourir adventures → map (recherche POI) → live (mode Live activé, fake GPS via devtools)
  - [ ] Relire le replay dans PostHog EU : confirmer carte bloquée sur les deux pages, inputs masqués ; documenter (notes/captures) en Completion Notes
- [x] **T5 — Politique de confidentialité** (AC: 5)
  - [x] Mettre à jour `apps/web/src/app/(marketing)/mentions-legales/page.tsx` : section 6 (Données personnelles — PostHog Cloud EU sous-traitant, replay, finalités, retrait) + section 7 (Cookies — liste `ph_*`, localStorage, durées)
  - [x] Mentionner explicitement : « les vues cartographiques sont exclues des enregistrements » (transparence + engagement vérifiable)
- [x] **T6 — Tests de régression masquage** (AC: 6)
  - [x] Dans les tests existants de `map-canvas` et `live-map-canvas` (ou nouveaux tests co-localisés) : assertion `expect(container.querySelector('.ph-no-capture')).toBeTruthy()` sur le conteneur carte
  - [x] Commentaire dans le test expliquant POURQUOI (règle RGPD) — pour qu'un futur refactor ne le supprime pas « parce que le test gêne »

## Dev Notes

### État réel vérifié (2026-06-07)

- **Conteneurs carte** : `map-canvas.tsx` (composant forwardRef ~900 lignes, root `<div ref={mapContainerRef}>` l.76) et `live-map-canvas.tsx` (~500 lignes, root l.60). Le masquage PostHog par classe fonctionne sur le conteneur — le canvas WebGL enfant est couvert.
- **Pages d'authentification** : Better Auth (email/password + OAuth) — `maskAllInputs: true` couvre les champs ; les pages OAuth externes (Google/Strava) sont hors du domaine, non enregistrées.
- **mentions-legales** : section 7 actuelle = texte générique cookies « configurer navigateur » — insuffisant post-PostHog, à réécrire.

### Points de vigilance

1. **`ph-no-capture` bloque l'élément entier** (remplacé par un bloc vide dans le replay) — c'est voulu pour la carte. Ne PAS utiliser un simple masquage texte sur la carte.
2. **Replays = données personnelles** : rétention PostHog par défaut (vérifier dans le projet EU — la régler au minimum utile, ex. 30 jours) et le documenter dans mentions-légales.
3. **Le panneau LiveControls reste visible volontairement** (métriques D+/D-/ETA/distances relatives) — il ne révèle pas la position absolue. Si un doute apparaît sur un élément pendant l'implémentation, le masquer et le noter (principe de précaution + Doc Sync Rule).
4. **Ne pas activer `capture_performance`/network bodies** — surface de risque inutile.
5. **Coût bande passante** : recordings = 1-5 Mo/session via le reverse proxy `/phrelay/` sur le VPS (Caddy) — surveiller après mise en prod (Uptime Kuma ne mesure pas ça ; noter dans Completion Notes si un suivi s'impose).
6. **Story bloquante pour le mobile** : les sélecteurs/patterns de masquage décidés ici sont la référence de MOB-6.1 (replay beta mobile) et MOB-6.6 (prod). Les documenter proprement dans le README de `packages/analytics` (section « Session replay & masquage »).

### Intelligence stories précédentes

- posthog-1 : clé localStorage `rnr_analytics_consent`, bannière + toggle — le replay se branche sur CES mécanismes, ne pas créer un second consentement.
- posthog-2 : `packages/analytics` existe — le README est le bon endroit pour documenter les patterns de masquage partagés web/mobile.

### Frontière de story

- ❌ Replay mobile (beta ou prod) → MOB-6.1 / MOB-6.6
- ❌ Dashboards/funnels exploitant les replays → posthog-4
- ❌ Refonte complète des mentions légales — seulement les sections 6/7 impactées

### Testing standards

Vitest + RTL co-localisés. Les tests carte existants mockent MapLibre — l'assertion `ph-no-capture` se fait sur le DOM du conteneur, pas besoin de WebGL.

### Project Structure Notes

Aucun nouveau fichier structurel — modifications ciblées de composants existants + page marketing. Respecter le pattern `_components/` privés par segment de route.

### References

- [Source: _bmad-output/planning-artifacts/epics-posthog.md#Story posthog-3]
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Amendement 2026-06-07 — règle masquage étendue]
- [Source: _bmad-output/project-context.md — RGPD Geolocation Rule (CRITICAL), Doc Sync Rule]
- [Source: posthog.com/docs/session-replay/privacy — maskAllInputs, ph-no-capture, blockSelector — vérifié 2026-06-07]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8[1m]) — Claude Code

### Debug Log References

- RAS — implémentation directe. Suite web complète 1109/1109 verte, lint 0 erreur, build standalone OK.

### Completion Notes List

- **AC1** : replay gated consentement — `disable_session_recording: true` à l'init (inchangé depuis posthog-1) ; `startSessionRecording()` appelé (1) au boot dans `instrumentation-client.ts` si la clé localStorage `rnr_analytics_consent` vaut `granted`, (2) dans `setConsent('granted')` (`lib/analytics-consent.ts`) — couvre bannière ET toggle settings. `stopSessionRecording()` dans `setConsent('denied')` avant l'opt-out. Aucun second mécanisme de consentement créé.
- **AC2** : `ph-no-capture` sur les DEUX conteneurs MapLibre (`map-canvas.tsx` l.485, `live-map-canvas.tsx` l.458) avec commentaire RGPD « NE PAS retirer ». Le conteneur couvre le canvas WebGL enfant. `maskAllInputs: true` dans `session_recording`. Audit surfaces annexes : `TraceClickCta` (km relatif — OK visible), mini-profil élévation Live (position relative sur trace — OK), `PoiPopup`/`LiveControls` (POI publics, métriques relatives D+/ETA — OK) ; **aucun élément affichant des coordonnées absolues (lat/lng) trouvé dans l'UI** (`grep` sur les renders : les lat/lng ne sont jamais affichés, seulement utilisés en interne).
- **AC3** : email masqué dans Settings (Card Session, `page.tsx`) et dans `delete-account-dialog.tsx` (seuls endroits où l'email est affiché en texte — le header n'affiche PAS l'email : il ne le passe qu'à `FeedbackModal` comme valeur d'input, couvert par `maskAllInputs`). Pages auth : forms couverts par `maskAllInputs` ; OAuth Google/Strava hors domaine. Réseau : défauts PostHog conservés (pas de bodies, pas de headers auth), `capture_performance` non activé.
- **AC4 — ⚠️ VÉRIFICATION MANUELLE EN ATTENTE (Guillaume)** : nécessite la clé PostHog (cf. posthog-1) + un replay réel. Protocole : (1) ajouter la clé dans `apps/web/.env`, `pnpm build && pnpm start` ; (2) navigation privée → Accepter le consentement → se connecter → adventures → map (lancer une recherche POI) → live (activer le mode Live, fake GPS via devtools Sensors) ; (3) dans PostHog EU → Session replay : vérifier zone carte VIDE/bloquée sur `/map/[id]` ET `/live/[id]`, inputs masqués, email masqué dans Settings, métriques LiveControls visibles ; (4) coller les notes/captures ici. **Régler aussi la rétention replay à 30 jours dans le projet PostHog EU** (annoncé dans les mentions légales).
- **AC5** : mentions légales réécrites — section 6 : PostHog Cloud EU sous-traitant (Francfort), finalité replay, masquage (« les vues cartographiques sont exclues des enregistrements » — engagement vérifiable), rétention 30 j, droit de retrait via bannière/toggle ; section 7 (renommée « Cookies et stockage local ») : stockage fonctionnel exempté (session auth, `rnr_analytics_consent`), cookies/storage `ph_*` soumis à consentement (durée ≤ 12 mois), Plausible cookieless mentionné. « Dernière mise à jour » → juin 2026.
- **AC6** : 2 tests de régression `ph-no-capture` (un par canvas) avec commentaire expliquant la règle RGPD et l'interdiction de supprimer le test. + 4 tests `instrumentation-client` (replay non démarré sans choix/refus, démarré si granted, maskAllInputs) + assertions start/stop dans les tests bannière et toggle.
- **Référence mobile** : section « Session replay & masquage » ajoutée au README de `packages/analytics` (tableau règle → web → mobile, pour MOB-6.1/MOB-6.6).
- **Note coût** : recordings ≈ 1-5 Mo/session via `/phrelay/` (Caddy/VPS) — à surveiller après mise en prod (pas couvert par Uptime Kuma) ; si le trafic replay pèse, envisager un monitor bande passante.

### File List

- `apps/web/src/instrumentation-client.ts` (M — session_recording maskAllInputs + start au boot si consentement)
- `apps/web/src/instrumentation-client.test.ts` (M — 4 tests replay)
- `apps/web/src/lib/analytics-consent.ts` (M — start/stopSessionRecording dans setConsent)
- `apps/web/src/components/shared/consent-banner.test.tsx` (M — mock + assertions replay)
- `apps/web/src/app/(app)/settings/_components/privacy-toggle.test.tsx` (M — mock + assertions replay)
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` (M — ph-no-capture + commentaire RGPD)
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` (M — test régression)
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` (M — ph-no-capture + commentaire RGPD)
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx` (M — test régression)
- `apps/web/src/app/(app)/settings/page.tsx` (M — email masqué)
- `apps/web/src/app/(app)/settings/_components/delete-account-dialog.tsx` (M — email masqué)
- `apps/web/src/app/(marketing)/mentions-legales/page.tsx` (M — sections 6/7 réécrites)
- `packages/analytics/README.md` (M — section Session replay & masquage)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M)
- `_bmad-output/implementation-artifacts/posthog-3-session-replay-web-masquage-rgpd.md` (M)

## Change Log

- 2026-06-07 — Implémentation posthog-3 (T1-T3, T5-T6) : replay gated consentement (start au boot + opt-in, stop à l'opt-out), maskAllInputs, ph-no-capture sur les 2 conteneurs carte (+ commentaires et tests de régression RGPD), email masqué (settings + dialog suppression), mentions légales sections 6/7 réécrites (PostHog Cloud EU, rétention 30 j, exclusion des vues carte), README analytics enrichi (référence masquage mobile). 1109 tests verts, lint 0 erreur, build OK. **T4 (vérification replay réel) en attente Guillaume — protocole documenté.** Status → review.
