---
baseline_commit: f0349415d9fe5b1fb173cf42d84072799e96cdf7
---

# Story MOB-6.6 : Session replay mobile en production (post-v1)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product owner**,
I want **activer le session replay PostHog en production mobile**,
So that **j'analyse les parcours réels des utilisateurs (boucle MCP → améliorations UX) sans compromettre la confidentialité**.

> **6ᵉ story de l'epic MOB-6 — RELEASE DÉDIÉE POST-V1.** ⚠️ **NE PAS planifier en sprint v1.** Requiert un **nouveau binaire natif** (module replay compilé → **non livrable en OTA**) donc bump de version + resoumission stores. Ajoutée par `sprint-change-proposal-2026-06-07.md`.
>
> **Prérequis (epics-mobile.md:1156)** : masquage validé en beta (**MOB-6.1**, `done`) + patterns de masquage web (**posthog-3**, `review`). Cette story **lève le gate beta-only de MOB-6.1** et l'entoure d'un **consentement in-app explicite** (gate NOUVEAU et distinct de l'analytics events).
>
> 🔴 **CONTRAINTE SDK STRUCTURANTE** : `posthog-react-native` **fige `enableSessionReplay` à la construction du singleton** — **pas d'API `startSessionRecording()`/`stop` dynamique** comme sur le web. Conséquence : le consentement prod ne peut PAS juste « démarrer » le replay au clic. Il faut **lire le flag de consentement AVANT `new PostHog(...)`** et construire le singleton conditionnellement (ou re-bootstrapper après opt-in). C'est le cœur du design de cette story (voir Dev Notes).
>
> 🟢 **RGPD étendu à l'écran enregistré** : « GPS jamais hors device » s'applique au replay → la carte MapLibre et toute PII sont masquées. Le masquage carte (`ph-no-capture`) existe déjà (MOB-6.1) ; cette story le **re-audite/durcit** pour de vrais utilisateurs.

## Acceptance Criteria

1. **Given** le module natif de session replay PostHog
   **When** je l'active en production
   **Then** un **consentement in-app explicite** est requis **avant tout enregistrement** (opt-out par défaut : aucun replay tant que l'utilisateur n'a pas accepté)
   **And** les vues carte (MapLibre) **et toute PII** sont masquées — la règle « GPS jamais hors device » s'applique à l'écran enregistré (`ph-no-capture` sur `map-canvas.tsx` + `maskAllTextInputs`, re-audité pour la prod)

2. **Given** la soumission du binaire
   **When** je mets à jour les métadonnées stores
   **Then** **Privacy Nutrition Labels (iOS)** et **Data Safety (Android)** déclarent la **collecte liée au replay** (enregistrement d'écran / interaction) (FR-MOB-040)

3. **Given** un utilisateur ayant **refusé** le consentement replay
   **When** il utilise l'app
   **Then** **aucun enregistrement** n'est effectué
   **And** l'**analytics d'events standard continue de fonctionner** normalement (les 6 events core ne dépendent pas du replay)

## Tasks / Subtasks

- [ ] **T1 — Consentement replay : stockage + UI** (AC: 1, 3)
  - [ ] `src/lib/analytics/replay-consent.ts` — flag AsyncStorage (nouvelle clé, ex. `'ridenrest:replay-consent'`), `getReplayConsent()`/`setReplayConsent()` best-effort (jamais de throw). **Modèle exact : `src/lib/live/consent-storage.ts`** (MOB-5.1). AsyncStorage, **jamais `expo-secure-store`** (flag UI non sensible ≠ token auth). Défaut = non consenti (opt-out).
  - [ ] Overlay/dialog de consentement replay — **modèle `src/components/live/geolocation-consent.tsx`** : `<View>` absolu (PAS un RN `<Modal>` — gotcha iOS/Maestro), texte 100 % i18n (FR+EN), boutons `size="lg"` « Autoriser » / « Refuser ». Présenté au bon moment (à trancher : au 1er lancement prod ? depuis une section « Confidentialité » des paramètres ?).

- [ ] **T2 — Activation conditionnelle du replay (contrainte SDK)** (AC: 1, 3)
  - [ ] Modifier `src/lib/analytics/posthog.ts` : remplacer le gate `isReplayEnabled()` (`APP_ENV !== 'production'`, l.34-39) par une logique **prod = consentement**. Comme `enableSessionReplay` est figé à la construction, **lire `getReplayConsent()` AVANT `new PostHog(...)`** (l.51-63) → `enableSessionReplay: consent === true` en prod (beta : conserver le comportement actuel ou aligner).
  - [ ] Le bootstrap (`src/lib/observability/boot.ts`) devient potentiellement **async** (lire le flag AsyncStorage avant d'instancier) OU re-bootstrapper après opt-in. **Trancher et documenter** (le flag distant `mobile-replay-beta` via `isFeatureEnabled` reste un kill-switch, non câblé).
  - [ ] **AC3** : quel que soit le consentement replay, `capture()`/`identify()`/les 6 events core **continuent** (le replay est un sous-système indépendant — `defaultOptIn: true` inchangé pour les events).

- [ ] **T3 — Re-audit / durcissement du masquage pour la prod** (AC: 1)
  - [ ] Vérifier `ph-no-capture` sur `map-canvas.tsx:330-333` (couvre planning + live — un seul canvas) + `maskAllTextInputs: true` (`posthog.ts:60`). **Ne pas retirer** (commentaire RGPD + test régression `map-canvas.test.tsx:66-69`).
  - [ ] Re-auditer TOUTE surface PII/coordonnées **hors carte** pour un replay réel : mini-profil élévation Live, `poi-popup.tsx`, `LiveControls`, écrans compte/settings, feedback modal. Aligner sur l'audit web posthog-3 (surfaces à position **relative** = OK sans masquage ; **absolue/PII** = masquer).
  - [ ] Décider : masquage par `accessibilityLabel="ph-no-capture"` (actuel) **vs** `<PostHogMaskView>` (composant natif, plus robuste). Documenter.
  - [ ] Aligner la **rétention** (30 j côté projet PostHog EU, comme web posthog-3) + mentions légales.

- [ ] **T4 — Rebuild natif 2 plateformes + déclarations stores** (AC: 2)
  - [ ] Vérifier si la version de `posthog-react-native` (`^4.53.0`, `package.json:47`) exige une **dépendance native replay séparée**. Si oui : l'installer (pin `bundledNativeModules.json`) → confirme la contrainte « nouveau binaire ».
  - [ ] `expo prebuild --clean -p ios` **ET** `-p android` (module natif → rebuild des DEUX plateformes, sinon crash au boot — règle MOB-5.2). `pnpm sim` (iOS) / `run:android`.
  - [ ] **Mettre à jour Privacy Nutrition Labels (iOS) + Data Safety (Android)** pour déclarer la collecte replay (enregistrement d'écran / interaction) — MOB-6.1 les avait laissés inchangés (replay beta n'impacte pas la soumission prod) ; **c'est cette story qui déclenche la mise à jour**. Coordonner avec les checklists MOB-6.4.
  - [ ] Bump `version` (`app.config.ts`) + resoumission (pas d'OTA).

- [ ] **T5 — Tests** (AC: 1, 3)
  - [ ] **Mettre à jour** `src/lib/analytics/posthog.test.ts` : les assertions actuelles (`enableSessionReplay === false` en prod l.89-94 ; `true` en preview l.98-105) **doivent changer** → prod : `false` sans consentement, `true` avec consentement ; events core actifs dans les deux cas (AC3).
  - [ ] Test consentement : opt-out → pas de replay + events OK ; opt-in → replay activé. Placement hors `src/app/`.
  - [ ] Ne pas casser `map-canvas.test.tsx:66-69` (`ph-no-capture`).
  - [ ] Mock `posthog-react-native.js` (`PostHogMaskView` = `jest.fn(() => null)`) déjà présent.

- [ ] **T6 — Doc Sync + gate** (règle CRITIQUE project-context)
  - [ ] `packages/analytics/README.md` (section « Session replay & masquage » partagée web/mobile) + `apps/mobile/AGENTS.md` (§Observabilité) : documenter l'activation prod + consentement.
  - [ ] `epics-mobile.md` / ce fichier : refléter toute déviation. `sprint-status.yaml` : MOB-6-6 → `in-progress` puis `review`.
  - [ ] **Gate** : `jest` (assertions replay mises à jour) · `tsc` 0 · `eslint` 0 · `check:native-config` OK · validation replay réel sur device (parité vérif manuelle web posthog-3 T4, en attente).

## Dev Notes

### Architecture & contraintes (à respecter à la lettre)

- **POST-V1, release dédiée** : nouveau binaire natif, pas d'OTA. Bump version + resoumission. Sources : `MOB-6-1:135`, `sprint-change-proposal-2026-06-07.md:59`, `architecture-mobile.md:1399`.
- **Point unique à modifier** : `src/lib/analytics/posthog.ts`. Gate actuel `isReplayEnabled()` (l.34-39) = `APP_ENV !== 'production'` (beta-only). Config à la construction (l.51-63) : `enableSessionReplay: isReplayEnabled()`, `sessionReplayConfig: { maskAllTextInputs: true, maskAllImages: false }`. Bootstrap side-effect `src/lib/observability/boot.ts:16-18` (key-gated : sans `EXPO_PUBLIC_POSTHOG_KEY` → façade null, helpers no-op).
- **Contrainte SDK (structurante)** : `posthog-react-native` fige `enableSessionReplay` à la construction — **pas de start/stop dynamique** (déviation #3 assumée MOB-6.1). ⇒ Le consentement prod se traduit par une **construction conditionnelle du singleton** (lire le flag AVANT `new PostHog`), PAS par un `startSessionRecording()` (pattern web non transposable tel quel). Le bootstrap peut devenir async ou re-bootstrapper après opt-in.
- **Gate consentement NOUVEAU et distinct** : l'analytics **events** mobile n'a **pas** de bandeau (`defaultOptIn: true`, décision MOB-6.1). Le consentement **replay** s'ajoute par-dessus, spécifique à l'enregistrement d'écran. Opt-out ⇒ pas de replay mais events core intacts (AC3).
- **Masquage (RGPD, à durcir)** : `ph-no-capture` sur `map-canvas.tsx:330-333` (un seul canvas planning+live), `maskAllTextInputs: true`. Test régression `map-canvas.test.tsx:66-69` (« NE PAS RETIRER »). Le mobile n'affiche pas d'email en settings → couvert par `maskAllTextInputs`. Re-audit prod = parité posthog-3.
- **Persistance consentement = AsyncStorage client-only** (modèle `consent-storage.ts`), cohérent avec l'archi mobile « zéro cookie / distinct_id local ». **NE PAS** repartir sur un consentement serveur type `profile.liveAccessConsent` (le flow poi-access-3-3 a été **retiré le 2026-05-30** — ne pas le ressusciter).

### État actuel (recherche 2026-07-04)

- `src/lib/analytics/posthog.ts:34-39` (`isReplayEnabled`), `:51-63` (`new PostHog` + `sessionReplayConfig`), `:21-24` (commentaire cadrage → MOB-6.6), `:48-49` (key-gated null).
- `src/lib/observability/boot.ts:16-18` — `initSentry()` puis `bootstrapAnalytics()`, importé 1er dans `src/app/_layout.tsx`.
- `src/lib/analytics/posthog.test.ts:89-94` (replay false en prod), `:98-105` (true en preview + `maskAllTextInputs`) — **à mettre à jour**.
- `src/components/map/map-canvas.tsx:322-333` — `ph-no-capture` + commentaire RGPD ; `__tests__/map-canvas.test.tsx:66-69` — régression.
- `posthog-react-native ^4.53.0` (`package.json:47`), pur JS côté pod aujourd'hui (à re-vérifier pour le replay natif prod).
- Consentement (modèles) : `src/components/live/geolocation-consent.tsx` (overlay `<View>` absolu, non-dismissible, i18n, `size="lg"`), `src/lib/live/consent-storage.ts` (AsyncStorage best-effort).
- Mock : `__mocks__/posthog-react-native.js` (`PostHogMaskView` = `jest.fn(() => null)`).

### Masquage web (posthog-3) — cible d'alignement

- Web : `disable_session_recording: true` par défaut ; `startSessionRecording()` seulement si consentement `granted` (localStorage `rnr_analytics_consent`) ; `stopSessionRecording()` à l'opt-out. **Mobile n'a pas ce start/stop** → construction conditionnelle (cf. contrainte SDK).
- Carte masquée sur les 2 conteneurs web (`map-canvas.tsx:485`, `live-map-canvas.tsx:458`) — bloc entier, pas juste texte. `maskAllInputs: true`. Réseau : défauts PostHog (pas de bodies, pas de header Authorization) ; `capture_performance` NON activé.
- Surfaces OK sans masquage (position relative) : `TraceClickCta`, mini-profil élévation, `PoiPopup`, `LiveControls`. Rétention replay = **30 j** (projet PostHog EU) + mentions légales.
- Vérif manuelle web (posthog-3 T4) **en attente** → MOB-6.6 aura un besoin équivalent de validation replay réel sur device.

### Source tree — fichiers à toucher

| Action | Fichier | Note |
|---|---|---|
| UPDATE | `src/lib/analytics/posthog.ts` | gate prod = consentement (lire flag avant `new PostHog`) |
| UPDATE | `src/lib/observability/boot.ts` | bootstrap async / re-bootstrap post-opt-in |
| NEW | `src/lib/analytics/replay-consent.ts` | flag AsyncStorage (modèle `consent-storage.ts`) |
| NEW | `src/components/analytics/replay-consent-dialog.tsx` (ou similaire) | overlay `<View>` (modèle `geolocation-consent.tsx`) |
| UPDATE | `src/lib/i18n/locales/{fr,en}.json` | clés consentement replay (FR+EN) |
| UPDATE | `src/lib/analytics/posthog.test.ts` | assertions replay prod (consent on/off) |
| VERIFY | `src/components/map/map-canvas.tsx` + `__tests__/map-canvas.test.tsx` | `ph-no-capture` conservé |
| UPDATE | `app.config.ts` | bump `version` (resoumission) ; dép native replay si requise |
| UPDATE | `packages/analytics/README.md` + `apps/mobile/AGENTS.md` | doc activation prod |

### Testing

- Jest + jest-expo. Assertions `posthog.test.ts` **à réécrire** (prod : replay off sans consentement / on avec ; events actifs des deux côtés). Placement hors `src/app/`.
- Validation replay réel = device (parité posthog-3 T4). Reporting par plateforme (iOS/Android), pas de « ✓ » global.

### Project Structure Notes

- Module natif replay (si dép séparée) → prebuild `--clean` iOS **ET** Android + rebuild 2 plateformes (crash au boot sinon).
- Consentement replay = AsyncStorage (non sensible), jamais SecureStore.
- Config Expo dans `app.config.ts`, jamais `app.json`.

### Décisions à trancher (documenter dans Completion Notes)

- **Timing du consentement** : au 1er lancement prod (overlay) ? section « Confidentialité » des paramètres (opt-in explicite) ? Recommandation : opt-in depuis les paramètres (moins intrusif ; replay off par défaut).
- **Bootstrap async vs re-bootstrap** après opt-in (contrainte SDK). Recommandation : lire le flag au boot (async) → construction conditionnelle ; opt-in ultérieur = effectif au prochain lancement (documenter la latence à l'utilisateur).
- **`ph-no-capture` vs `PostHogMaskView`** pour la carte en prod.
- **Dépendance native replay** : intégrée au SDK ou package séparé (confirme la contrainte binaire).

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story-MOB-6.6] (l.1154-1176) — ACs, FR-MOB-040, prérequis, post-v1
- [Source: apps/mobile/src/lib/analytics/posthog.ts:34-39/51-63] — gate replay + config (point à modifier)
- [Source: apps/mobile/src/lib/observability/boot.ts:16-18] — bootstrap
- [Source: apps/mobile/src/lib/analytics/posthog.test.ts:89-105] — assertions replay à mettre à jour
- [Source: apps/mobile/src/components/map/map-canvas.tsx:322-333 + __tests__/map-canvas.test.tsx:66-69] — masquage carte `ph-no-capture`
- [Source: apps/mobile/src/components/live/geolocation-consent.tsx + src/lib/live/consent-storage.ts] — modèles consentement (overlay + AsyncStorage)
- [Source: _bmad-output/implementation-artifacts/posthog-3-session-replay-web-masquage-rgpd.md] — masquage web, rétention 30j, gating consentement
- [Source: _bmad-output/implementation-artifacts/MOB-6-1-sentry-crash-posthog-analytics.md:135-136/236] — replay beta-only, contrainte SDK (pas de start/stop), labels inchangés jusqu'à 6.6
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md:1399] — replay natif, nouveau binaire, MOB-6.6
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-07.md:59] — justification release post-v1
- [Source: _bmad-output/implementation-artifacts/poi-access-3-3-consent-dialog-and-privacy-section.md] — flow consentement serveur RETIRÉ 2026-05-30 (NE PAS ressusciter)
- [Source: apps/mobile/AGENTS.md] — module natif = rebuild 2 plateformes, mocks Jest, placement tests

## Dev Agent Record

### Agent Model Used

_(à remplir par le dev agent)_

### Debug Log References

### Completion Notes List

### File List
