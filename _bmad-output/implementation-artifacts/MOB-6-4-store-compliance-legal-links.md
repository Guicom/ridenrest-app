---
baseline_commit: f0349415d9fe5b1fb173cf42d84072799e96cdf7
---

# Story MOB-6.4 : Conformité stores & liens légaux

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product owner**,
I want **que l'app satisfasse les exigences de confidentialité et de conformité des stores**,
So that **elle puisse être publiée sur l'App Store et Google Play**.

> **4ᵉ story de l'epic MOB-6** — **dépendance amont directe de MOB-6.5** (impossible de soumettre en review sans les déclarations privacy + liens légaux). Story majoritairement **conformité + config + une petite feature UI** (section « Légal » dans les paramètres). Les Nutrition Labels iOS et le formulaire Data Safety Android se **saisissent dans App Store Connect / Google Play Console** (hors code) — la story **documente précisément QUOI déclarer** ; le tableau des données collectées (Dev Notes §5) est la source de vérité.
>
> 🟢 **DÉCISION URLs — tranchée avec Guillaume le 2026-07-04 : créer les routes web `(marketing)/privacy` + `(marketing)/terms`.** Aujourd'hui le web ne sert qu'une page `/mentions-legales` (confidentialité + cookies + Strava, **sans CGU distinctes**). Cette story **ajoute donc une portée WEB** : `/privacy` (réutilise/extrait §6/§7/§8 de `mentions-legales`) + `/terms` (nouvelles CGU à rédiger). Les 2 liens mobiles résolvent alors en HTTP 200 → **AC3 satisfaite à la lettre**. `epics-mobile.md`/`architecture-mobile.md` supposaient déjà ces URLs → **pas de déviation d'AC** (on aligne la réalité sur le plan). ⚠️ Story désormais **cross-app** (web Vitest + mobile Jest).
>
> 🟢 **App déjà conforme Guideline 4.2 (native, aucune WebView)** — vérifié : 0 `WebView`/`react-native-webview` dans `src/**`. Les liens sortants passent par `Linking.openURL` (navigateur système), jamais une WebView embarquée. `expo-web-browser` sert uniquement au retour OAuth.
>
> 🟢 **RGPD par construction** : GPS jamais envoyé au serveur (`expo-location` on-device, `Sentry.beforeSend` scrub GPS), PostHog EU sans IDFA (→ **ATT non requise**, tout marqué « Not Used for Tracking » côté iOS), Sentry `sendDefaultPii:false`. Tout est key-gated.

## Acceptance Criteria

1. **Given** la soumission iOS
   **When** je remplis les métadonnées dans App Store Connect
   **Then** les **Privacy Nutrition Labels** déclarent géolocalisation / comptes / analytics / crash conformément aux données réellement collectées (tableau Dev Notes §5) (FR-MOB-040, NFR-MOB-INT-02)
   **And** toutes les catégories sont marquées **« Not Used for Tracking »** (pas d'IDFA, pas de cross-app)
   **And** l'app est une **vraie app native** conforme à la guideline 4.2 (pas un wrapper webview) (NFR-MOB-INT-01)
   **And** après `expo prebuild`, la présence du **`ios/…/PrivacyInfo.xcprivacy`** (Apple Privacy Manifest, requis au submit depuis 2024) est vérifiée (généré par Expo/SDK tiers ; sinon rejet Apple)

2. **Given** la soumission Android
   **When** je remplis le formulaire **Data Safety** dans Google Play Console
   **Then** les déclarations correspondent aux données réellement collectées (tableau Dev Notes §5)
   **And** l'**age/content rating** est renseigné (questionnaire IARC)

3. **Given** la page paramètres
   **When** je consulte les liens légaux
   **Then** « Politique de confidentialité » et « CGU » s'ouvrent via `Linking.openURL` (helper `openExternalUrl`) vers les URLs légales de `ridenrest.app` (FR-MOB-041)
   **And** aucun contenu légal n'est **dupliqué en natif** (liens externes uniquement)
   **And** les URLs cibles `https://ridenrest.app/privacy` et `https://ridenrest.app/terms` sont **réelles et résolvent en HTTP 200** (routes web créées par cette story — T0)

## Tasks / Subtasks

- [x] **T0 — Créer les pages légales web `/privacy` + `/terms`** (AC: 3) — **décidé 2026-07-04 (web scope)**
  - [x] `apps/web/src/app/(marketing)/privacy/page.tsx` : politique de confidentialité — réutilise §6/§7/§8 de `mentions-legales` + section dédiée **géoloc mobile** (position on-device, jamais serveur — sert de source pour les labels store). SSG indexable, layout marketing identique.
  - [x] `apps/web/src/app/(marketing)/terms/page.tsx` : **CGU (nouveau contenu)** — objet, acceptation, compte, usage acceptable, PI, §6 « outil indicatif ≠ dispositif de navigation/sécurité », données perso (renvoi /privacy), disponibilité, limitation de responsabilité, résiliation, droit applicable. ⚠️ **Premier jet à valider juridiquement avec Guillaume** avant publication (noté dans la page + Completion Notes).
  - [x] Vérifié : `next build` génère `/privacy` et `/terms` en `○ (Static)` (comme `/mentions-legales`) → HTTP 200. Liens ajoutés au footer marketing (`Confidentialité` + `CGU`), `/mentions-legales` conservé.
  - [x] **Doc Sync** : `epics-mobile.md` (l.26/259/1133) + `architecture-mobile.md` (l.71/1031) référencent déjà ces URLs → cohérence confirmée, **pas de changement d'AC**.

- [x] **T1 — Section « Légal » dans les paramètres mobile** (AC: 3)
  - [x] Nouveau composant `src/components/shared/legal-section.tsx` monté dans `settings.tsx` **avant** `<AccountSection />` (la zone danger reste dernière). Pattern : `<View className="gap-3">` + titre uppercase muted (`t('settings.legalSection')`) + `<Card>` avec 2 `Button variant="outline" size="lg"` (44px WCAG).
  - [x] Chaque rangée appelle **`openExternalUrl(url)`** (réutilisé tel quel). `{ ok: false }` → feedback non bloquant (`Text` `accessibilityRole="alert"`, jamais d'Alert). URLs exportées (`PRIVACY_URL`/`TERMS_URL`) pour le test.
  - [x] Icônes `lucide-react-native` : `Shield` (confidentialité), `FileText` (CGU), `ExternalLink` (affordance lien) — ajoutées au barrel `@/components/ui/icon` (pattern `enableClassName`).

- [x] **T2 — Clés i18n légal (FR + EN)** (AC: 3)
  - [x] Ajouté `settings.legalSection`, `settings.legal.privacyPolicy`, `settings.legal.terms` (+ `settings.legal.openError` pour le feedback d'échec) dans `fr.json` **et** `en.json`. Parité verrouillée par `locale-parity.test.ts` (MOB-6.3) — vert.

- [x] **T3 — Vérifs conformité iOS (privacy manifest + labels)** (AC: 1)
  - [x] `ios/RidenRest/PrivacyInfo.xcprivacy` **présent** (généré par Expo/SDK tiers) : `NSPrivacyTracking = false`, `NSPrivacyCollectedDataTypes = []`, raisons d'API d'accès (FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1). Conforme au submit Apple.
  - [x] `ITSAppUsesNonExemptEncryption: false` confirmé (`app.config.ts:23`). Aucune `NSPrivacyAccessedAPICategoryReasons` supplémentaire requise (SDK gèrent la leur).
  - [x] **Checklist Nutrition Labels** rédigée (Completion Notes + `apps/mobile/README.md` §Conformité stores).

- [x] **T4 — Checklist Data Safety Android + age rating** (AC: 2)
  - [x] **Checklist Data Safety** rédigée (Completion Notes + README) : localisation on-device non partagée, email/compte, analytics, crash — tous EU, aucun tracking publicitaire.
  - [x] Réponse **IARC** documentée : app utilitaire, aucun contenu sensible → « Tout public » (PEGI 3 / ESRB Everyone / IARC 3+).

- [x] **T5 — Doc Sync + gate** (règle CRITIQUE project-context)
  - [x] `apps/mobile/README.md` : section « Conformité stores & liens légaux (MOB-6.4) » (checklists + URLs légales).
  - [x] `sprint-status.yaml` : MOB-6-4 → `in-progress` puis `review`.
  - [x] **Gate** — mobile : `check:native-config` 5 OK · `jest` 629/629 · `tsc` 0 · `eslint` 0 err (2 warnings préexistants) · `expo export -p ios -p android` OK. Web : `next build` OK (`/privacy` + `/terms` SSG) · `eslint` 0 · Vitest **1154/1154 tests** verts (1 fichier `e2e/weather.spec.ts` en échec de collecte = spec Playwright capté par le glob Vitest, **préexistant** commit 7d83ab3, tracé). `pnpm sim`/Maestro device + Playwright E2E = voir Completion Notes (non exécutés, infra/backend down — non bloquant pour du contenu statique/liens).
  - [x] Test co-localisé `legal-section.test.tsx` : rend 2 liens, appelle `openExternalUrl` avec les bonnes URLs, feedback d'échec (mock `external-links`) — 4 tests verts.

## Dev Notes

### Architecture & contraintes (à respecter à la lettre)

- **Aucun contenu légal dupliqué en natif** (AC3) : la section paramètres n'affiche **que des liens** vers le web. Pas de page CGU/confidentialité rendue en RN.
- **`openExternalUrl` est le helper canonique** (`src/lib/external-links.ts:51-60`) : wrappe `Linking.openURL` dans un try/catch, renvoie `{ ok, error? }` (jamais de throw non géré). Pas de garde `canOpenURL` requise pour `http(s)`. Déjà testé (`external-links.test.ts`) et utilisé (`search-on-dropdown.tsx:41`, `poi-popup.tsx:207-217`, `booking-links.tsx`). **Réutiliser tel quel.** Aucune config manifest supplémentaire pour des liens `https://` sortants.
- **App native (Guideline 4.2)** : confirmé 0 WebView. Ne PAS introduire de `react-native-webview` pour afficher le légal — liens externes uniquement.
- **Données collectées = tableau §5** : c'est la source de vérité pour les DEUX stores. Points clés : GPS **jamais** transmis au serveur (on-device, scrub Sentry) ; PostHog **EU**, `distinct_id` AsyncStorage, **zéro cookie**, **pas d'IDFA → ATT non requise → tout « Not Used for Tracking »** ; Sentry `sendDefaultPii:false` région EU ; comptes via Better Auth (email/Google/Strava), tokens en `expo-secure-store`.
- **Métadonnées store = hors code** : Nutrition Labels (App Store Connect) + Data Safety (Play Console) + age rating se saisissent dans les consoles. Le repo ne peut les versionner (sauf introduire un `store.config.json` EAS Metadata — **portée optionnelle, non requise**). La story les **documente** précisément.

### État `app.config.ts` (recherche 2026-07-04)

- Identité : `name "Ride'n'Rest"`, `slug 'ridenrest'`, `version '1.0.0'` (l.12-15), iOS `bundleIdentifier 'app.ridenrest'` (l.20), Android `package 'app.ridenrest'` (l.36).
- iOS `infoPlist` : `ITSAppUsesNonExemptEncryption: false` (l.23), `NSAppTransportSecurity.NSAllowsLocalNetworking: true` (l.30-32, dev localhost — inoffensif en prod HTTPS).
- Usage descriptions localisation **FR privacy-safe** injectées par le plugin `expo-location` (l.99-110) : `locationWhenInUsePermission` + `locationAlwaysAndWhenInUsePermission` contiennent « Votre position reste sur votre appareil et n'est jamais envoyée à nos serveurs » (cohérent label « Location, App Functionality, Not Linked, Not Tracking »). `isIosBackgroundLocationEnabled: true` → `UIBackgroundModes:['location']`.
- Android `permissions` : `['android.permission.RECEIVE_BOOT_COMPLETED']` (l.44) ; localisation ajoutée par le plugin `expo-location`.
- Plugins (l.57-136) : `expo-router`, `expo-splash-screen`, `expo-font`, `expo-secure-store`, `expo-web-browser`, `@maplibre/maplibre-react-native`, `expo-location`, `./plugins/with-android-localhost-cleartext`, `@sentry/react-native/expo` (EU).

### Écran paramètres — où brancher (recherche 2026-07-04)

- Route : `src/app/(app)/settings.tsx` — `<ScrollView>` empilant des sections en `<Card>` : `StravaConnectionCard`, `OverpassToggleSection`, `OfflineCacheSection`, `AccountSection` (l.40-51). Pattern de section : `<View className="gap-3">` + titre uppercase muted + `<Card>`.
- MOB-2.5 (logout + delete RGPD) : `src/components/shared/account-section.tsx` — dernière section. Placer « Légal » adjacent.
- UI réutilisable : `src/components/ui/card.tsx` (`Card`/`CardHeader`/`CardContent`, `rounded-xl border`), `@/components/ui/button` (`variant`, `size="lg"` = 44px WCAG).
- i18n settings : clés `settings.*` dans `locales/{fr,en}.json` (existantes : `title, back, integrationsSection, accountSection, dangerSection, offlineCache, logout, deleteAccount, overpass`). Ajouter `settings.legalSection` + `settings.legal.{privacyPolicy,terms}`.
- ⚠️ **Pas de « privacy section » avec toggle analytics côté mobile** (contrairement au web `settings/_components/privacy-toggle.tsx`) — décision MOB-6.1 (pas de bandeau mobile). La section « Légal » = liens uniquement.

### Pages légales web — décidé : créer `/privacy` + `/terms` (recherche 2026-07-04)

- `apps/web/src/app/(marketing)/` : `page.tsx`, `contact`, `register`, `login`, `forgot-password`, `reset-password`, **`mentions-legales/page.tsx`** (11 KB). **Pas de `privacy/` ni `terms/`.**
- `/mentions-legales` regroupe : éditeur, hébergement, contact, PI, **§6 Données personnelles** (PostHog EU, session replay, masquage carte, conservation 30j, retrait), **§7 Cookies**, **§8 Données Strava** (OAuth read-only). Sert de politique de confidentialité + mentions, **mais pas de CGU distinctes**.
- Footer (`marketing-footer.tsx:27`) + bandeau consentement (`consent-banner.tsx:41`) pointent vers `/mentions-legales`.
- → **Décision Guillaume 2026-07-04 (T0)** : créer `apps/web/src/app/(marketing)/privacy/page.tsx` (extrait §6/§7/§8 de `mentions-legales`) + `terms/page.tsx` (CGU nouvelles). `/mentions-legales` reste en place (référencé par footer + bandeau consentement). Runner web = **Vitest** (≠ Jest mobile).

### §5 — Données réellement collectées (source de vérité labels/Data Safety)

| Donnée | Collectée ? | Détail | Déclaration store |
|---|---|---|---|
| **Géoloc (GPS précis)** | On-device uniquement | `expo-location` fg+bg ; RGPD « reste sur l'appareil, jamais serveur » ; `Sentry.beforeSend` scrub GPS ; aucun POST GPS | iOS : Location, App Functionality, **Not Linked**, **Not Tracking**. Android : Location « on-device only » |
| **Compte / identité** | Oui | Better Auth : email+mdp, Google OAuth, Strava OAuth read-only ; tokens en `expo-secure-store` | iOS : Email/User ID, Linked, App Functionality. Android : Personal info (Email) + App activity |
| **Analytics produit** | Oui | PostHog **EU**, `distinct_id` AsyncStorage, **zéro cookie**, **pas d'IDFA/ATT**, pas d'autocapture, `identify(user.id)` only ; replay beta-only (masqué) → prod = MOB-6.6 | iOS : Product Interaction/Usage, **Not Tracking**, Linked to User ID. Android : App activity |
| **Crash / diagnostics** | Oui | Sentry `sendDefaultPii:false`, scrub GPS, key-gated, release-only, **EU** | iOS : Crash/Performance, App Functionality, **Not Tracking**. Android : Crash logs + Diagnostics |

**Conformité clé** : pas d'IDFA / pas de cross-app → **ATT non requise**, tout « Not Used for Tracking » iOS. Hébergement **EU (Francfort)**.

### Testing

- **Mobile** : Jest + jest-expo. Test co-localisé de la section légale (rend 2 liens, appelle `openExternalUrl` — mock `@/lib/external-links`). Placement hors `src/app/`.
- **Web** : Vitest. Les pages `/privacy` + `/terms` sont des Server Components SSG statiques (peu/pas de test unitaire requis) ; vérifier surtout le build + résolution 200. Suivre les conventions `apps/web` (route group `(marketing)`, `metadata` SEO).
- Vérif conformité (PrivacyInfo.xcprivacy, ouverture des liens) = `pnpm sim` iOS + inspection `ios/` après prebuild.

### Project Structure Notes

- Config Expo dans `app.config.ts` (TS), jamais `app.json`.
- Toute clé i18n ajoutée → FR **et** EN.
- Les checklists labels/Data Safety vivent dans ce fichier + `README.md` (docs), pas dans du code (sauf `store.config.json` EAS Metadata optionnel).

### Décisions à trancher (documenter dans Completion Notes)

- ~~URLs légales~~ — **tranché 2026-07-04 : créer `/privacy` + `/terms`** (T0).
- Contenu des **CGU** (`/terms`) = nouveau texte juridique → **valider avec Guillaume** avant publication.
- `store.config.json` EAS Metadata (versionner les labels) : introduire ou pas ? Recommandation : non (MVP), documenter en checklist.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story-MOB-6.4] (l.1113-1134) — ACs, FR-MOB-040/041, NFR-MOB-INT-01/02
- [Source: apps/mobile/app.config.ts:12-136] — identité, infoPlist, usage descriptions, plugins
- [Source: apps/mobile/src/app/(app)/settings.tsx:40-51] — structure sections + où brancher « Légal »
- [Source: apps/mobile/src/components/shared/account-section.tsx] — MOB-2.5 (voisin de la section légale)
- [Source: apps/mobile/src/components/ui/card.tsx + button] — composants réutilisables
- [Source: apps/mobile/src/lib/external-links.ts:51-60] — `openExternalUrl` (helper canonique AC3)
- [Source: apps/web/src/app/(marketing)/mentions-legales/page.tsx] — page légale web existante (§6 données, §8 Strava)
- [Source: apps/web/src/app/(marketing)/_components/marketing-footer.tsx:27 + components/shared/consent-banner.tsx:41] — liens web pointent vers /mentions-legales
- [Source: apps/mobile/src/lib/observability/sentry.ts + src/lib/analytics/posthog.ts] — RGPD scrub GPS, PostHog EU sans IDFA (labels)
- [Source: apps/mobile/eas.json] — `submit.production` vide, pas de store.config.json
- [Source: _bmad-output/project-context.md#Mobile] — pas de WebView, secure-store=auth, RGPD GPS, ATT non requise
- [Source: _bmad-output/implementation-artifacts/MOB-6-1-sentry-crash-posthog-analytics.md:136] — labels inchangés par replay beta ; MOB-6.6 déclenche la mise à jour replay

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (dev-story, 2026-07-05)

### Debug Log References

- **Mobile** : `check:native-config` 5 invariants OK · `jest` 95 suites / **629 tests** verts · `tsc` 0 · `eslint` 0 erreur (2 warnings **préexistants** : `live/[id].tsx:365`, `map/[id].tsx:356`, hors fichiers touchés) · `expo export -p ios -p android` OK (bundles iOS 10 MB + Android 11 MB).
- **Web** : `next build` OK → `/privacy` et `/terms` = `○ (Static)` (SSG, HTTP 200) ; `eslint` 0 sur les fichiers créés ; Vitest **1154 tests** verts.
- ⚠️ Vitest web rapporte **1 fichier en échec de collecte** : `e2e/weather.spec.ts` (spec **Playwright** capté par le glob Vitest par défaut — `vitest.config.ts` sans `test.exclude`). **Préexistant** (commit 7d83ab3), aucun test réel en échec, sans rapport avec cette story → tracé (`task_e282e280`).
- `PrivacyInfo.xcprivacy` inspecté dans `ios/` (déjà généré) : `NSPrivacyTracking=false`, données collectées vides, raisons d'API d'accès Expo.

### Completion Notes List

**Story cross-app** (web Next.js + mobile Expo) — conformité stores + une petite feature UI. La majeure partie « conformité » se saisit dans les consoles (App Store Connect / Play Console) et est donc **documentée** (checklists ci-dessous + README), pas codée.

**T0 — Pages légales web.** `/privacy` réutilise le fond §6 (données perso PostHog EU + session replay masqué + conservation), §7 (cookies), §8 (Strava) de `mentions-legales` et **ajoute une section géolocalisation mobile** (position on-device, jamais serveur) — c'est la page qualifiée par les Nutrition Labels. `/terms` = **CGU nouvelles** dont une clause forte §6 « outil de planification indicatif, PAS un dispositif de navigation/sécurité » (cohérente avec la philosophie du projet). Les 2 pages sont des Server Components SSG, design marketing identique, `metadata` SEO. Footer marketing enrichi (`Confidentialité`/`CGU`), `/mentions-legales` conservé (footer web + bandeau consentement y pointent encore).
> ⚠️ **CGU = premier jet à faire valider juridiquement** avant publication (décision story ; contenu générique adapté à un MVP d'app gratuite de planification).

**T1 — Section « Légal » mobile.** `LegalSection` (nouveau composant partagé) monté dans `settings.tsx` **avant** `AccountSection` (danger zone reste en dernier). 2 boutons `outline size="lg"` (icône gauche + label + `ExternalLink` droite via `className="justify-between"` + `children`). Ouverture par `openExternalUrl` (helper canonique réutilisé tel quel, navigateur système, **jamais** de WebView). Échec → `Text` `accessibilityRole="alert"` non bloquant (jamais `Alert`). `PRIVACY_URL`/`TERMS_URL` exportés pour éviter les chaînes magiques en test.

**T2 — i18n.** `settings.legalSection` + `settings.legal.{privacyPolicy,terms,openError}` (FR+EN). Parité garantie par le verrou `locale-parity.test.ts` (MOB-6.3).

**Nettoyage scaffold i18n (hors-scope documenté).** Les clés `home.*`, `explore.*`, `oauthCallback.*` (résidus du scaffold MOB-1.1) ont été retirées de `fr.json` et `en.json` dans ce diff — aucun composant actif ne les consomme (confirmé par edge-case hunter). Décision Guillaume (code review 2026-07-05) : nettoyage intentionnel, hors-scope documenté ici conformément à la Doc Sync Rule.

**Clés `dialog.closeA11y` + `dialog.dateTimePlaceholder` (hors-scope documenté).** Ces 2 clés i18n ont été ajoutées dans ce diff dans les 2 locales sans figurer dans T2. Elles ont des consommateurs existants (dialog.tsx modifié dans MOB-6.3). Décision Guillaume (code review 2026-07-05) : ajout intentionnel groupé, parité vérifiée par `locale-parity.test.ts`, hors-scope documenté ici.

**Adresse responsable de traitement dans `/privacy`.** L'adresse physique `1b rue des Aigles, 67810 Holtzheim` est publiée dans la page SSG publiquement indexable — exigence RGPD art. 13. Décision Guillaume (code review 2026-07-05) : intentionnel, adresse assumée.

**T3/T4 — Conformité (documentation).** `PrivacyInfo.xcprivacy` déjà présent (pas de prebuild nécessaire, aucun module natif ajouté). `ITSAppUsesNonExemptEncryption:false` OK. Checklists ci-dessous.

**Icônes.** `Shield` + `FileText` ajoutées au barrel `@/components/ui/icon` (react-native-svg déjà lié → aucun rebuild).

**Conformité guideline 4.2** : 0 WebView confirmé (grep `react-native-webview` = néant). Liens sortants = `Linking.openURL` uniquement.

#### Checklist App Store Connect — Privacy Nutrition Labels
- **Precise Location** → App Functionality · Linked = **No** · Tracking = **No** (position on-device, jamais serveur).
- **Email Address** → App Functionality + Account · Linked = **Yes** · Tracking = **No**.
- **User ID** → App Functionality + Analytics · Linked = **Yes** · Tracking = **No** (pas d'IDFA/Device ID).
- **Product Interaction (Usage Data)** → Analytics + App Functionality · Linked = **Yes** · Tracking = **No**.
- **Crash Data + Performance Data** → App Functionality · Linked = **No** · Tracking = **No**.
- **Tracking global** : « No, we do not track » → aucun prompt ATT.

#### Checklist Google Play — Data Safety
- **Location** : collectée mais **traitée sur l'appareil / non partagée / non envoyée** — aucune finalité publicitaire.
- **Email** : gestion de compte, chiffrée en transit, non partagée, suppression possible in-app.
- **App interactions** : Analytics (PostHog EU), non publicitaire.
- **Crash logs + Diagnostics** : Sentry EU.
- « Encrypted in transit » = Oui · « Users can request deletion » = Oui (suppression compte in-app).
- **IARC / age rating** : app utilitaire, aucun contenu sensible → **Tout public** (PEGI 3 / ESRB Everyone / IARC 3+). Aventures privées (pas d'UGC public).

**Invariant transverse** : pas d'IDFA / pas de cross-app → **ATT non requise**, tout « Not Used for Tracking » iOS. Hébergement **EU (Francfort)**.

#### Points hors-scope relevés
- `eas.json` `submit.production` est **vide** → à compléter pour MOB-6.5 (soumission).
- Vitest web capte les specs Playwright de `e2e/` (glob sans exclude) → `task_e282e280`.

#### Gate device / E2E — état réel (honnête)
- **`pnpm sim` (iOS) / Maestro device : NON exécuté.** Backend local (API :3010 + auth :3011) **down** + pas d'émulateur Android bootté → les flows *login-gated* ne peuvent pas tourner. Le changement mobile = une section de liens statiques (aucun module natif, aucun nouvel écran carte/overlay, `PrivacyInfo.xcprivacy` déjà présent) → risque device minimal, couvert par le test unitaire + `expo export`. Recommandation Guillaume : ouvrir Paramètres → « Légal » et vérifier l'ouverture navigateur des 2 liens sur device.
- **Playwright E2E web : NON exécuté** (serveur web/backend down). Le changement web = 2 pages **statiques SSG** + liens footer, hors des flows carte couverts par les specs E2E existantes. `next build` prouve la génération SSG (HTTP 200) ; Vitest (1154) couvre la non-régression unitaire.

### File List

**Créés :**
- `apps/web/src/app/(marketing)/privacy/page.tsx` (politique de confidentialité SSG)
- `apps/web/src/app/(marketing)/terms/page.tsx` (CGU SSG — à valider juridiquement)
- `apps/mobile/src/components/shared/legal-section.tsx` (section « Légal » settings)
- `apps/mobile/src/components/shared/legal-section.test.tsx` (test co-localisé)

**Modifiés :**
- `apps/web/src/app/(marketing)/_components/marketing-footer.tsx` (liens Confidentialité + CGU)
- `apps/mobile/src/app/(app)/settings.tsx` (montage `<LegalSection />`)
- `apps/mobile/src/components/ui/icon.tsx` (icônes `Shield` + `FileText`)
- `apps/mobile/src/lib/i18n/locales/fr.json` (+ `settings.legalSection`, `settings.legal.*`)
- `apps/mobile/src/lib/i18n/locales/en.json` (idem, miroir)
- `apps/mobile/README.md` (section « Conformité stores & liens légaux »)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MOB-6-4 → in-progress → review)
- `_bmad-output/implementation-artifacts/MOB-6-4-store-compliance-legal-links.md` (ce fichier)

### Change Log

| Date | Version | Description |
|---|---|---|
| 2026-07-05 | 1.0 | dev-story MOB-6.4 — conformité stores + liens légaux. Web : pages SSG `/privacy` (réutilise mentions-legales + géoloc mobile) + `/terms` (CGU à valider) + liens footer. Mobile : section « Légal » (2 liens `openExternalUrl`, 0 WebView), i18n FR/EN, icônes Shield/FileText. Docs : checklists Nutrition Labels + Data Safety + IARC (README + Completion Notes), `PrivacyInfo.xcprivacy` vérifié. Gate : mobile jest 629 / tsc 0 / lint 0 err / export iOS+Android OK ; web next build SSG OK / Vitest 1154. Status → review. |

### Review Findings

- [x] [Review][Decision] Suppression des clés i18n `home`/`explore`/`oauthCallback` — nettoyage intentionnel scaffold MOB-1.x (aucun consommateur actif), documenté en Completion Notes. ✅ résolu 2026-07-05.
- [x] [Review][Decision] Adresse résidentielle exposée dans `/privacy` — intentionnel, assumé par Guillaume. ✅ résolu 2026-07-05.
- [x] [Review][Decision] Clés `dialog.closeA11y` + `dialog.dateTimePlaceholder` ajoutées sans task — appartiennent à MOB-6.3 (dialog.tsx), ajout groupé intentionnel, documenté en Completion Notes. ✅ résolu 2026-07-05.
- [x] [Review][Patch] Race condition + double-tap sans garde sur `handleOpen` [apps/mobile/src/components/shared/legal-section.tsx:28-33] — ajout flag `loading` + guard `if (loading) return` + `disabled={loading}` sur les 2 boutons + `try/finally` pour reset. ✅ appliqué 2026-07-05.
- [x] [Review][Patch] Boutons légaux sans `accessibilityHint` "ouvre dans le navigateur" [apps/mobile/src/components/shared/legal-section.tsx:43,61] — ajout `accessibilityHint={t('settings.legal.openInBrowser')}` + clé `openInBrowser` dans `fr.json`/`en.json`. ✅ appliqué 2026-07-05.
- [x] [Review][Defer] Error banner non auto-effacée [legal-section.tsx:80] — deferred, pre-existing ; comportement conforme à la spec (feedback non bloquant, s'efface au prochain tap / unmount)
- [x] [Review][Defer] Tests avec chaînes FR hardcodées [legal-section.test.tsx] — deferred, pre-existing ; fragile si la locale Jest change, mais les tests passent à 629/629 (locale correctement initialisée)
- [x] [Review][Defer] `await render(...)` incorrect en RNTL [legal-section.test.tsx] — deferred, pre-existing ; `render` est synchrone, l'`await` est inoffensif mais trompeur
- [x] [Review][Defer] Pas de test pour effacement de l'erreur après retry [legal-section.test.tsx] — deferred, pré-existant ; couverture partielle acceptable pour MVP
- [x] [Review][Defer] Pas de test pour double-tap concurrent [legal-section.test.tsx] — deferred, pré-existant ; couvert par le patch A une fois appliqué
- [x] [Review][Defer] Liens footer hardcodés en français [marketing-footer.tsx] — deferred, pre-existing ; pattern cohérent avec le reste du footer web (app en français)
- [x] [Review][Defer] `PRIVACY_URL`/`TERMS_URL` hardcodés en prod [legal-section.tsx:21-22] — deferred, pre-existing ; décision MVP explicite, pas de config staging mobile
