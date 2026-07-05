---
baseline_commit: f0349415d9fe5b1fb173cf42d84072799e96cdf7
---

# Story MOB-6.4 : Conformité stores & liens légaux

Status: ready-for-dev

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

- [ ] **T0 — Créer les pages légales web `/privacy` + `/terms`** (AC: 3) — **décidé 2026-07-04 (web scope)**
  - [ ] `apps/web/src/app/(marketing)/privacy/page.tsx` : politique de confidentialité — extraire/réutiliser §6 (Données personnelles), §7 (Cookies), §8 (Strava) de `mentions-legales/page.tsx`. Page SSG indexable (route group `(marketing)`), même layout/design que les autres pages marketing.
  - [ ] `apps/web/src/app/(marketing)/terms/page.tsx` : **CGU (contenu nouveau à rédiger)** — usage de l'app, compte utilisateur, propriété intellectuelle, limitation de responsabilité (s'appuyer sur la structure de `mentions-legales`). ⚠️ Contenu juridique → **valider avec Guillaume**.
  - [ ] Vérifier `/privacy` et `/terms` → HTTP 200 (`pnpm --filter @ridenrest/web build` / dev). Optionnel : ajouter les liens au footer marketing (`marketing-footer.tsx`) pour cohérence web ; garder `/mentions-legales` (référencé ailleurs).
  - [ ] **Doc Sync** : `epics-mobile.md` (l.26/259/1133) + `architecture-mobile.md` (l.71/1031) référencent déjà ces URLs → confirmer cohérence (pas de changement d'AC).

- [ ] **T1 — Section « Légal » dans les paramètres mobile** (AC: 3)
  - [ ] Ajouter une nouvelle section dans `src/app/(app)/settings.tsx` (nouvelle `<Card>` juste avant/après `<AccountSection />`), pattern existant : `<View className="gap-3">` + titre `<Text>` uppercase muted (`t('settings.legalSection')`) + `<Card>` avec 2 rangées `Pressable`/`Button variant="outline" size="lg"`.
  - [ ] Chaque rangée appelle **`openExternalUrl(url)`** (`src/lib/external-links.ts` — try/catch, jamais de throw, renvoie `{ ok }`). Gérer `{ ok: false }` par un feedback non bloquant.
  - [ ] Icônes `lucide-react-native` (ex. `Shield`, `FileText`, `ExternalLink`) cohérentes avec le reste des settings.

- [ ] **T2 — Clés i18n légal (FR + EN)** (AC: 3)
  - [ ] Ajouter `settings.legalSection`, `settings.legal.privacyPolicy`, `settings.legal.terms` dans `src/lib/i18n/locales/fr.json` **et** `en.json` (invariant parité — coordonner avec MOB-6.3 si les deux stories se croisent).

- [ ] **T3 — Vérifs conformité iOS (privacy manifest + labels)** (AC: 1)
  - [ ] Après `expo prebuild -p ios`, vérifier la présence de `PrivacyInfo.xcprivacy` dans `ios/` (généré par Expo SDK 56 + SDK tiers Sentry/PostHog/MapLibre). Si absent → l'ajouter via config plugin ou manuellement, sinon rejet Apple.
  - [ ] (Optionnel) Déclarer `ios.infoPlist.NSPrivacyAccessedAPICategoryReasons` si un SDK l'exige. Confirmer que `ITSAppUsesNonExemptEncryption: false` (déjà présent, `app.config.ts:23`) reste correct.
  - [ ] Rédiger la **checklist Nutrition Labels** (dans ce fichier) à recopier dans App Store Connect à partir du tableau §5.

- [ ] **T4 — Checklist Data Safety Android + age rating** (AC: 2)
  - [ ] Rédiger la **checklist Data Safety** (dans ce fichier) à recopier dans Play Console à partir du tableau §5 (localisation on-device, email/compte, analytics, crash — tous EU, aucun tracking publicitaire).
  - [ ] Documenter la réponse au questionnaire IARC (age/content rating).

- [ ] **T5 — Doc Sync + gate** (règle CRITIQUE project-context)
  - [ ] `apps/mobile/README.md` : documenter la checklist de conformité store (labels/Data Safety) + les URLs légales retenues.
  - [ ] `sprint-status.yaml` : MOB-6-4 → `in-progress` puis `review`.
  - [ ] **Gate verte** : `jest` (tests settings/legal) · `tsc` 0 · `eslint` 0. `pnpm sim` (iOS) pour vérifier l'ouverture des liens + `PrivacyInfo.xcprivacy` après prebuild.
  - [ ] Test co-localisé : la section légale rend 2 liens et appelle `openExternalUrl` avec les bonnes URLs (mock `external-links`).

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

_(à remplir par le dev agent)_

### Debug Log References

### Completion Notes List

### File List
