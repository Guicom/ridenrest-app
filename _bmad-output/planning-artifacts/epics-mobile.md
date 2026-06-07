---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
completedAt: '2026-06-02'
inputDocuments:
  - '_bmad-output/planning-artifacts/architecture-mobile.md'
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/architecture-poi-access-routing.md'
  - '_bmad-output/planning-artifacts/epics-live-profile.md'
scope: 'mobile-native'
project_name: 'ridenrest-app'
user_name: 'Guillaume'
date: '2026-06-02'
status: 'complete'
extends: '_bmad-output/planning-artifacts/epics.md'
---

# ridenrest-app — Epic Breakdown : Application Mobile Native (iOS + Android)

## Overview

Ce document décompose le **périmètre mobile-natif** de Ride'n'Rest (Expo / React Native, iOS + Android) en epics et user stories implémentables, à partir de l'architecture mobile (`architecture-mobile.md`) et des exigences héritées du PRD web, réinterprétées pour le contexte natif.

**Principe directeur** : le backend (NestJS + PostgreSQL/PostGIS + Redis + BRouter sur VPS Hostinger) **reste inchangé et partagé** entre web et mobile. L'app mobile est un **client de plus** ; la logique métier est mutualisée via le monorepo (`packages/shared`, `packages/gpx`, `packages/database` types, schémas Zod). Le travail mobile = **recréer l'UI native** + adapter les capacités natives (deep links OAuth, géolocalisation background, stockage sécurisé, MapLibre Native, push, i18n, conformité stores).

**Périmètre fonctionnel** : strictement la **partie connectée (auth-gated)** du produit. Pas de landing page, pas de pages marketing, pas de pages légales dupliquées en natif (liens externes via `Linking.openURL` vers `ridenrest.app/privacy` et `/terms`).

**Décisions projet actées** (cf. `architecture-mobile.md`) :
- **Suppression totale du PWA** : aucun port des FRs PWA (FR-070 → FR-073) sur mobile — capacités natives à la place (push APNs/FCM, install via stores, offline `expo-file-system`). Epic 12 (PWA & Offline) à clore comme *abandoned* dans `epics.md`.
- **Universal Links / App Links** : hors périmètre (pas de partage d'aventures prévu).

**Évolutions intégrées (postérieures à l'archi mobile du 2026-05-05)** — incluses à la demande de Guillaume pour que les epics mobile reflètent l'état réel du produit web :
- **POI Access Routing (BRouter)** — itinéraire d'accès cyclable réel vers les POI hébergement (`architecture-poi-access-routing.md`, `epics-poi-access-routing.md`). Backend déjà shippé côté web ; le mobile **consomme l'endpoint `POST /pois/:id/access`** et affiche la polyline + métriques d'accès.
- **Mode Live — Panneau & Profil d'élévation interactif** (`epics-live-profile.md`) — refonte du panneau de recherche Live + section « PROFIL » repliable avec profil d'élévation contextualisé. À porter en natif.

---

## Requirements Inventory

> **Convention de traçabilité** : les FRs/NFRs hérités conservent leurs IDs d'origine (`FR-0xx`, `NFR-0xx`) ; leur colonne « Adaptation native » documente la réinterprétation mobile. Les features récentes conservent leurs IDs (`FR-PA-xxx`, `FR-LP-xxx`). Les exigences purement natives (capacités, conformité stores) sont listées dans **Additional Requirements** (préfixe `FR-MOB-xxx` / `NFR-MOB-xxx`).

### Functional Requirements

#### Auth & User Management (hérités — adaptation OAuth native)

| ID | Exigence | Adaptation native |
|---|---|---|
| FR-001 | Création de compte email + mot de passe | Écran `app/(auth)/signup.tsx`, Better Auth client mobile (`@better-auth/expo`) |
| FR-002 | Authentification Google OAuth (1 clic) | `expo-auth-session` PKCE ou `@react-native-google-signin`, deep link `ridenrest://oauth-callback` |
| FR-003 | Connexion compte Strava pour import GPX | OAuth Strava via `expo-auth-session`, redirect URI custom `ridenrest://oauth-strava` whitelisté |
| FR-004 | Déconnexion | Purge token `expo-secure-store` |
| FR-005 | Suppression de compte — effacement total des données (RGPD) | Action dans `app/(app)/settings.tsx` |
| FR-006 | Session persistante entre les visites | JWT stocké en Keychain (iOS) / Keystore (Android) via `expo-secure-store`, jamais AsyncStorage en clair |
| FR-007 | Réinitialisation mot de passe par email | Écran `app/(auth)/reset-password.tsx`, mail Resend (backend inchangé) |

#### Adventures & GPX Management (hérités)

| ID | Exigence | Adaptation native |
|---|---|---|
| FR-010 | Créer une aventure nommée | `app/(app)/adventures/new.tsx` |
| FR-011 | Ajouter un/plusieurs GPX comme segments ordonnés | Upload via `expo-document-picker` (UIDocumentPicker iOS / SAF Android), parsing async serveur identique |
| FR-012 | Réordonner les segments par glisser-déposer | Drag natif (`react-native-reanimated` / lib DnD RN) |
| FR-013 | Supprimer un segment | — |
| FR-014 | Remplacer un segment par un nouveau GPX | — |
| FR-015 | Calcul + affichage distance totale et cumulatives | Réutilise calculs serveur / `packages/gpx` |
| FR-016 | Import d'activité depuis Strava comme segment | Backend inchangé |
| FR-017 | Renommer aventure ou segment | — |
| FR-018 | Supprimer une aventure entière avec confirmation | Dialog natif |
| FR-019 | Notification quand le parsing d'un segment GPX est terminé | Polling TanStack Query + gestion `AppState` (pause/reprise) ; option push native ultérieure |

#### Map & Visualization (hérités — adaptation MapLibre Native)

| ID | Exigence | Adaptation native |
|---|---|---|
| FR-020 | Affichage trace GPX sur carte interactive | `@maplibre/maplibre-react-native` (Metal iOS, OpenGL Android) — APIs distinctes de GL JS, Dev Client requis |
| FR-021 | Bascule thème carte sombre/clair | Styles MapLibre adaptés |
| FR-022 | Trace colorisée par densité (vert/orange/rouge) après analyse | Port logique de colorisation de segments |
| FR-023 | Activer/désactiver chaque calque POI (🏨 🍽️ 🛒 🚲) | `components/map/layer-toggles.tsx` |
| FR-024 | POIs en pins dans le viewport | Pins SVG via API native MapLibre, clusters portés |
| FR-025 | Tap sur un pin → fiche détail POI | `components/map/poi-detail-sheet.tsx` (`@gorhom/bottom-sheet`) |
| FR-026 | Centrage auto sur la trace de l'aventure | `fitBounds` natif |
| FR-027 | Légende de colorisation accessible depuis la carte | — |

#### POI Search — Mode Planification (hérités — endpoints réutilisés)

| ID | Exigence | Adaptation native |
|---|---|---|
| FR-030 | Définir une plage kilométrique (km A → km B) | `components/map/search-range-slider.tsx`, endpoints NestJS inchangés |
| FR-031 | Retour des POIs dans un corridor géospatial autour du segment | Backend PostGIS inchangé |
| FR-032 | Fiche POI : nom, type, distance trace (m), kilométrage | `components/shared/poi-card.tsx` |
| FR-033 | Fiche hébergement : deep links Hotels.com / Booking.com | `lib/external-links.ts` via `Linking.openURL` |
| FR-034 | Filtrer les POIs par catégorie sur la carte | — |
| FR-035 | Déclencher une analyse de densité asynchrone | Polling statut |
| FR-036 | Attribution OpenStreetMap visible en permanence | `components/shared/osm-attribution.tsx` |

#### POI Search — Mode Live / Aventure (hérités — ⭐ vraie valeur native)

| ID | Exigence | Adaptation native |
|---|---|---|
| FR-040 | Activer mode Live avec consentement géoloc explicite | `components/live/geolocation-consent.tsx` + permission runtime |
| FR-041 | Détection position GPS temps réel | `expo-location` (foreground), background location (permission `Always` iOS / foreground service Android) |
| FR-042 | Saisir l'allure estimée (km/h) | `components/live/speed-input.tsx` |
| FR-043 | POIs sur les prochains X km selon GPS + allure | Filtrage **client-side** (RGPD — GPS jamais envoyé serveur) |
| FR-044 | Mise à jour automatique des résultats au fil de la position | `expo-keep-awake` actif en Live |
| FR-045 | Connexion instable : POIs partiels + message d'état clair | Dégradation gracieuse, gestion `AppState` |

#### Weather Integration (hérités)

| ID | Exigence | Adaptation native |
|---|---|---|
| FR-050 | Saisie heure de départ + allure en Planification | — |
| FR-051 | Météo pace-adjusted à chaque point km | Cache Redis serveur inchangé |
| FR-052 | Météo Live selon GPS + allure | Calcul client-side |
| FR-053 | Données WeatherAPI.com (temp, vent, précip, icône) | Backend inchangé |
| FR-054 | Rafraîchissement météo horaire | — |
| FR-055 | Fallback météo heure actuelle si pas d'allure | — |

#### External Integrations / Affiliates (hérités)

| ID | Exigence | Adaptation native |
|---|---|---|
| FR-060 | Deep links paramétrés Hotels.com / Booking.com | `Linking.openURL` (navigateur système / app si installée) |
| FR-061 | Liens affiliés identifiés visuellement comme tels | — |
| FR-062 | Tracking des clics réservation (analytics) | `packages/analytics` → PostHog (partagé web ↔ mobile) |
| FR-063 | Attribution "Powered by Strava" quand données Strava affichées | — |

#### ❌ PWA & Offline (FR-070 → FR-073) — HORS PÉRIMÈTRE MOBILE

> Décision projet : non portés. Remplacés par capacités natives (cf. `FR-MOB-*` ci-dessous). Epic 12 web à clore *abandoned*.

#### POI Access Routing — BRouter (évolution — backend shippé, client mobile à porter)

> Les FRs marqués `[SUPERSEDED]` dans `epics-poi-access-routing.md` ne sont **pas portés** (chemin GPS Live + consentement supprimés ; l'accès Live utilise l'origine `nearest-trace` comme en Planning, sans GPS).

| ID | Exigence (active) | Adaptation native |
|---|---|---|
| FR-PA-001 | Fiche POI hébergement (Planning) : itinéraire d'accès cyclable réel (distance m + D+ + D-) | Consomme `POST /pois/:id/access` ; rendu dans `poi-detail-sheet.tsx` |
| FR-PA-004 | Étape en cours : accès calculé depuis le début de l'étape sélectionnée | — |
| FR-PA-005 | BRouter indisponible/échec → fallback distance à vol d'oiseau + badge "approximatif" | — |
| FR-PA-006 | Profil de routage cyclable par aventure (Route / Gravel / Bikepacking) | Sélecteur dans l'écran aventure |
| FR-PA-007 | Clic POI → polyline d'accès sur la carte (amber pointillés) au-dessus de la trace | Layer MapLibre Native |
| FR-PA-008 | Une seule polyline visible à la fois (remplacement / masquage au clic extérieur) | — |
| FR-PA-009 | Auto-zoom sur le bbox englobant accès + portion de trace | `fitBounds` natif |
| FR-PA-014 | Pré-calcul async (BullMQ) des accès POI < 1500 m de la trace à la création/import | Backend inchangé — mobile déclenche via création aventure |
| FR-PA-015 | Modif trace d'un segment → invalidation + recalcul des accès rattachés | Backend inchangé |
| FR-PA-016 | Changement profil routage → invalidation + recalcul de tous les accès | — |
| FR-PA-017 | Modif d'une étape (start_km/end_km) → invalidation des accès rattachés | Backend inchangé |
| FR-PA-018 | Fiche POI : statut de calcul (en cours / ok / fallback) avec skeleton dédié (jamais spinner générique) | Skeleton natif |
| FR-PA-019 | Label d'accès contextualisé par sous-catégorie ("vers l'hôtel/le camping/le refuge…") + fallback "Itinéraire d'accès" | — |
| FR-PA-020 | Réponse `POST /pois/:id/access` : champ `status` (`ok`/`fallback`/`error`) + source (`db-cache`/`computed-fresh`) | Typage partagé `packages/shared` |

#### Mode Live — Panneau & Profil d'élévation interactif (évolution — à porter en natif)

| ID | Exigence | Adaptation native |
|---|---|---|
| FR-LP-001 | Panneau de recherche Live refondu : métriques `↑D+ · ↓D- · ~ETA` hiérarchisées, en-tête « PROFIL » + chevron, slider −/+, boutons RECHERCHER / RECHERCHER SUR | Recréation UI native (pas de portage CSS) |
| FR-LP-002 | Section « PROFIL » repliée par défaut au chargement et après recherche | — |
| FR-LP-003 | Ouverture auto de « PROFIL » au premier contact du slider | — |
| FR-LP-004 | Fermeture de « PROFIL » au clic « RECHERCHER » | — |
| FR-LP-005 | Ouverture/fermeture manuelle via chevron, indépendante du slider | — |
| FR-LP-006 | Profil d'élévation interactif (réutilise logique `useElevationProfile`) | **`react-native-svg`** (décision 2026-06-02 ; Recharts non dispo en RN). Profil = un seul `<Path>` memoïsé, zoom = `viewBox`/`transform` animé via `react-native-reanimated`. Fallback `skia` si jank 60fps |
| FR-LP-007 | Bord gauche = position GPS projetée sur la trace (`currentKmOnRoute`) + marqueur | `snapToTrace` client-side |
| FR-LP-008 | Zone surlignée (zone recherchée) centrée sur la cible, largeur = rayon de recherche | — |
| FR-LP-009 | Bord droit ≈ 100 km au-delà de la cible (borné par la fin de trace) | — |
| FR-LP-010 | Zoom/dézoom de la fenêtre profil piloté par le slider, en temps réel, sans recalcul des données | Mémoïsation |
| FR-LP-011 | Aucune donnée d'élévation → pas de graphe vide (message discret / section repliée), sans erreur | Dégradation gracieuse |
| FR-LP-012 | Fusion/remplacement du mini-bandeau d'élévation Live (pas de double affichage) | — |

### NonFunctional Requirements

#### Performance (réinterprétée natif)

| ID | Exigence | Cible native |
|---|---|---|
| NFR-MOB-PERF-01 | Cold start | < 2s (target), warm < 1s |
| NFR-MOB-PERF-02 | Frame rate | 60 fps min (120 sur ProMotion) |
| NFR-MOB-PERF-03 | Battery drain Live Mode | **Cible initiale : ≤ 10 %/h** (GPS background actif, écran éteint, polling Live) — à **mesurer en sprint 0** puis **figer après la beta Espagne (avril 2026)**. Leviers : intervalle GPS adaptatif, pause polling via `AppState`, `distanceFilter` natif |
| NFR-005 | Parsing GPX serveur | < 10s (inchangé) |
| NFR-006 | Chargement carte + trace | < 3s |
| NFR-007 | Latence mode Live (GPS → POIs) | ≤ 2s avec indicateur visible |
| NFR-PA-001 | Latence `POST /pois/:id/access` | < 200 ms (cache hit DB) / < 500 ms (calcul lazy) p95 |
| NFR-LP-002 | Profil performant sous mises à jour GPS fréquentes | mémoïsation `points[]`, recalcul uniquement marqueur + fenêtre X |
| NFR-LP-003 | Cibles tactiles du panneau Live | **≥ 44×44 px** (HIG iOS, ≥ WCAG ; **standard natif retenu — supersède le 48px web du PRD**). Cf. `epics-live-profile.md` |
| NFR-LP-004 | Transition d'ouverture/fermeture « PROFIL » fluide | animation de hauteur via `react-native-reanimated`. Cf. `epics-live-profile.md` |

> NFR-001→004, NFR-008 (FCP/LCP/CLS/bundle/Lighthouse PWA) — **non applicables** (métriques web/PWA).

#### Security (réinterprétée natif)

| ID | Exigence | Adaptation native |
|---|---|---|
| NFR-010 | HTTPS / TLS 1.3+ pour toutes les communications | Inchangé |
| NFR-MOB-SEC-01 | Stockage tokens JWT sécurisé | Keychain (iOS) / Keystore (Android) via `expo-secure-store` — jamais AsyncStorage en clair (remplace NFR-011) |
| NFR-012 | Géolocalisation jamais persistée côté serveur (RGPD — usage session) | Filtrage client-side, bbox anonymisée si nécessaire |
| NFR-013 | Consentement explicite avant activation géolocalisation | Permission runtime iOS/Android avec rationale |
| NFR-014 | API keys/secrets jamais exposés côté client | Env EAS / `expo-constants` |
| NFR-015 | Rate limiting endpoints NestJS | Inchangé (backend) |
| NFR-016 | Politique de confidentialité accessible avant premier usage | Lien externe `Linking.openURL` |
| NFR-PA-009 | GPS Live jamais stocké durablement côté serveur | Inchangé |
| NFR-LP-001 | Aucune coordonnée GPS envoyée au serveur (calcul `snapToTrace` client) | Inchangé |

#### Scalability

| ID | Exigence | Note |
|---|---|---|
| NFR-020→023 | Architecture stateless, cache Overpass Redis, jobs async, pics de trafic | **Inchangés** — backend partagé, l'app mobile = 1 client de plus |

#### Reliability (réinterprétée natif)

| ID | Exigence | Adaptation native |
|---|---|---|
| NFR-030 | Disponibilité ≥ 99% | Inchangé |
| NFR-031 | Dégradation gracieuse si Overpass/BRouter indisponible | Message + retry |
| NFR-032 | Zéro crash silencieux en Live : feedback visible sur erreur réseau | Sentry mobile (JS + crashes natifs) |
| NFR-033 | Données d'aventure jamais perdues sur erreur de parsing | Inchangé |
| NFR-MOB-REL-01 | Offline-first plus strict qu'en PWA | Cache local GPX + POIs aventures actives (`expo-file-system`), gestion `AppState` pour pauses polling |

#### Integration Constraints

| ID | Exigence | Note |
|---|---|---|
| NFR-040→045 | Rate limits Overpass/Strava/Weather, attribution OSM, format liens affiliés | **Inchangés** (backend) |
| NFR-MOB-INT-01 | Conformité App Store guideline 4.2 (vraie app native, pas un wrapper webview) | Valide Expo + RN, exclut Capacitor |
| NFR-MOB-INT-02 | Privacy Nutrition Labels (Apple) + Data Safety form (Google) | Déclaration géoloc/comptes/analytics à la soumission |
| NFR-MOB-INT-03 | ATT iOS — pas de tracking cross-app, IDFA non requis | Simplifie la conformité |

### Additional Requirements

> Exigences purement natives issues de l'architecture mobile (capacités, infrastructure, conformité). Non présentes dans le PRD web.

#### Starter Template & Fondation (impacte Epic 1, Story 1)

- **`FR-MOB-001`** — **Starter** : initialisation `apps/mobile/` via `pnpm create expo-app@latest apps/mobile --template with-router --no-install`, `node-linker=hoisted` dans `.npmrc`, config `metro.config.js` monorepo, pipeline Turborepo (`dev:mobile`, `build:mobile`, `storybook:mobile`).
- **`FR-MOB-002`** — Provisionnement **Apple Developer Program — compte individuel** ($99/an, Apple ID + CB, validation quasi-immédiate, **pas de D-U-N-S** requis — décision Guillaume 2026-06-02) + **Google Play Console** ($25 one-shot).
- **`FR-MOB-003`** — Pipeline **EAS Build** → TestFlight (iOS) + Internal Testing (Android), **OTA updates** pour patches JS sans soumission store.

#### Capacités Natives

- **`FR-MOB-010`** — **Deep linking** : scheme URL custom `ridenrest://`, callback post-SSO (`oauth-callback`) ramène l'utilisateur dans l'app.
- **`FR-MOB-011`** — **Background geolocation** : Live Mode efficace écran éteint (essentiel à vélo) — permission `Always` iOS + justification `Info.plist`, foreground service Android, gestion batterie.
- **`FR-MOB-012`** — **Push notifications** natives : APNs (iOS) + FCM (Android) via `expo-notifications` (remplacement web push — analyse densité terminée, alertes futures).
- **`FR-MOB-013`** — **Stockage** : `expo-secure-store` (JWT), `AsyncStorage` (préférences), `expo-file-system` (cache GPX local).
- **`FR-MOB-014`** — **App lifecycle** : gestion `AppState` (foreground/background/killed) pour pause/reprise polling TanStack Query + reconnexion réseau.
- **`FR-MOB-015`** — **Permissions runtime** : géoloc, notifications, accès fichiers — prompts iOS/Android avec rationale.

#### Observabilité & i18n

- **`FR-MOB-020`** — **Crash & analytics** : Sentry mobile (JS + crashes natifs avec source maps Metro) ; analytics via **`packages/analytics` → PostHog Cloud EU** (`posthog-react-native`, zéro cookie mobile — distinct_id AsyncStorage, dashboard unifié web + mobile). Session replay : builds **beta uniquement** (EAS development/preview ou feature flag) ; activation production = release dédiée post-v1 (MOB-6.6, nouveau binaire natif).
- **`FR-MOB-021`** — **Internationalisation** : architecture i18n (`expo-localization` + `i18next`) pour distribution stores (FR uniquement au lancement, structure prête).

#### Design System & Tests

- **`FR-MOB-030`** — **Design tokens + Storybook** : `packages/design-tokens/`, Storybook RN web, composants UI primitifs storybook-ifiés, styling **NativeWind**.
- **`FR-MOB-031`** — **Tests** : Jest + React Native Testing Library (unit), Maestro (E2E smoke pré-release).

#### Conformité Stores (impacte la dernière story / soumission)

- **`FR-MOB-040`** — Conformité App Store 4.2, Privacy Nutrition Labels, Data Safety, age rating, content rating.
- **`FR-MOB-041`** — Liens externes obligatoires (Politique de confidentialité + CGU) exposés dans `settings.tsx` via `Linking.openURL('https://ridenrest.app/privacy' | '/terms')` — aucune duplication de contenu.

### UX Design Requirements

> Aucune spec UX mobile dédiée n'existe encore (`ux-design-specification.md` couvre le web et n'a pas été inclus). L'UI native est à **recréer**, pas à porter pixel-perfect. Les exigences UX ci-dessous proviennent de la feature Live-Profile (maquettes Claude Design fournies) et restent valides cross-mode.

- **`UX-DR-LP-001`** — Rendu Live conforme aux maquettes Claude Design (en-tête « PROFIL » + chevron, hiérarchie typographique des métriques `↑/↓/~`, cohérence couleurs brand vert/magenta).
- **`UX-DR-LP-002`** — Zone surlignée + marqueur de position réutilisent le langage visuel du profil planning (cohérence cross-mode).
- **`UX-DR-PA-001`** — Wording des labels d'accès POI à valider (popin RGPD / Confidentialité **devenus sans objet** côté mobile — accès Live sans GPS ni consentement).
- **`UX-DR-MOB-001`** — **Décision Guillaume (2026-06-02)** : l'UI native **reprend le design web déjà en place** (on ne crée pas de nouvelle identité). **Source canonique = les tokens web existants** : variables `@theme` de `apps/web/src/app/globals.css` (vocabulaire sémantique shadcn — `primary`/`secondary`/`card`/`popover`/`muted`/`accent`/`destructive`/`border`/`ring`/`chart-1→5`, échelle `--radius-*`, police **Montserrat**, dark/light) **+** `packages/shared/src/constants/poi-colors.ts`. Les design-tokens mobiles (`packages/design-tokens/`) sont une **extraction / miroir** de ces valeurs — **pas une redéfinition** — consommés via NativeWind. L'UI native est **recréée fidèlement** à cette identité (RN ≠ portage pixel-perfect web). **Pas de spec UX mobile bloquante en amont** ; des **stories d'ajustement UI** seront prévues **en fin d'epic** si besoin. **MàJ 2026-06-07** : la palette **dark « Charbon »** est livrée (handoff Claude Design `docs/design/dark-mode-charbon/` — `charbon-dark-tokens.css`, mêmes noms de tokens que `globals.css`, high-fidelity) ; elle est **back-portée au web** via la **story MOB-1.2b** afin que la source canonique contienne light + dark **avant** l'extraction mobile (MOB-1.3).

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR-001→007 | MOB-2 | Auth email/Google/Strava, session, suppression compte |
| FR-010→019 | MOB-3 | CRUD aventures, segments GPX, import Strava, notif parsing |
| FR-020→027 | MOB-4 | Carte MapLibre Native, trace, thèmes, calques, pins, densité, légende |
| FR-030→036 | MOB-4 | Corridor search, fiche POI, filtres, analyse densité, attribution OSM |
| FR-040→045 | MOB-5 | Mode Live : géoloc, allure, POI prochains X km, dégradation gracieuse |
| FR-050, FR-051 | MOB-4 | Météo Planning (heure départ + allure, pace-adjusted) |
| FR-052 | MOB-5 | Météo Live (GPS + allure) |
| FR-053, FR-054, FR-055 | MOB-4 | Données WeatherAPI, refresh horaire, fallback heure actuelle |
| FR-060, FR-061, FR-062 | MOB-4 | Deep links booking, transparence affiliés, tracking clics |
| FR-063 | MOB-3 | Attribution "Powered by Strava" |
| ~~FR-070→073~~ | — | ❌ PWA — hors périmètre (non mappés) |
| FR-PA-001, 004→009, 014→020 | MOB-4 | POI Access Routing (BRouter) : itinéraire d'accès, polyline, profil routage, pré-calcul |
| FR-LP-001→012 | MOB-5 | Panneau Live refondu + profil d'élévation interactif contextualisé |
| FR-MOB-001, 002, 003 | MOB-1 | Starter Expo, comptes Apple/Google, EAS + OTA |
| FR-MOB-010 | MOB-1 (scheme) / MOB-2 (callback) | Deep linking `ridenrest://` |
| FR-MOB-011 | MOB-5 | Background geolocation |
| FR-MOB-012 | MOB-6 | Push notifications APNs/FCM |
| FR-MOB-013 | MOB-2 | Stockage sécurisé JWT (secure-store) |
| FR-MOB-014 | MOB-3 (introduit au besoin — MOB-3.5 offline/NetInfo) / MOB-5 (extension polling Live) | Gestion `AppState` : posée là où d'abord nécessaire (MOB-3.5), étendue au polling Live en MOB-5 — **pas de dépendance avant** |
| FR-MOB-015 | MOB-5 (géoloc) / MOB-6 (notifs) | Permissions runtime |
| FR-MOB-020 | MOB-6 | Sentry + PostHog (`packages/analytics`) — replay prod : MOB-6.6 post-v1 |
| FR-MOB-021 | MOB-1 (scaffold) / MOB-6 (finition) | i18n |
| FR-MOB-030, 031 | MOB-1 | Design tokens + Storybook + NativeWind ; framework de tests |
| FR-MOB-040, 041 | MOB-6 | Conformité stores, liens légaux externes |

> **NFRs** : transverses, adressés dans les stories de chaque epic concerné (perf → MOB-4/5, sécurité/RGPD → MOB-2/5, conformité → MOB-6, reliability/offline → MOB-3/4/5).

## Epic List

### Epic MOB-1 : Fondation & coquille applicative
L'app se lance sur iOS + Android, navigue (Expo Router), et expose une coquille avec le design system en place — la base technique sur laquelle tous les epics suivants s'appuient. Inclut l'initialisation monorepo, le pipeline de distribution (EAS + OTA), les comptes développeurs, le back-port web de la palette dark « Charbon » (prérequis tokens), le design system (tokens + Storybook + NativeWind), le scaffold i18n et le framework de tests.
**FRs couverts :** FR-MOB-001, FR-MOB-002, FR-MOB-003, FR-MOB-030, FR-MOB-031, FR-MOB-021 (scaffold), FR-MOB-010 (scheme)

### Epic MOB-2 : Authentification & Onboarding
L'utilisateur crée un compte ou se connecte (email/mot de passe, Google OAuth, Strava OAuth), reste connecté entre les sessions, réinitialise son mot de passe et peut supprimer son compte (RGPD). Tokens stockés de manière sécurisée (Keychain/Keystore).
**FRs couverts :** FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-MOB-010 (callback OAuth), FR-MOB-013

### Epic MOB-3 : Aventures & Gestion GPX
L'utilisateur crée et gère ses aventures multi-segments : ajout/réordonnancement/suppression/remplacement de segments GPX, import depuis Strava, distances cumulées, notification de fin de parsing. Cache GPX local pour consultation offline.
**FRs couverts :** FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-063

### Epic MOB-4 : Carte & Planification POI
L'utilisateur visualise sa trace sur une carte interactive native (MapLibre RN), bascule les calques POI, explore les POI par corridor kilométrique, consulte les fiches détaillées (deep links booking + itinéraire d'accès cyclable réel BRouter avec polyline), lance l'analyse de densité (trace colorisée) et consulte la météo planifiée le long de la trace.
**FRs couverts :** FR-020→027, FR-030→036, FR-050, FR-051, FR-053, FR-054, FR-055, FR-060, FR-061, FR-062, FR-PA-001, FR-PA-004→009, FR-PA-014→020

### Epic MOB-5 : Mode Live / Aventure ⭐
L'utilisateur roule : l'app le géolocalise en continu (efficace écran éteint), affiche les POI sur les prochains X km calculés selon GPS + allure, avec un panneau de recherche refondu intégrant un profil d'élévation interactif contextualisé (position → zone recherchée → horizon 100 km) et la météo Live. Filtrage 100% client-side (RGPD).
**FRs couverts :** FR-040→045, FR-052, FR-LP-001→012, FR-MOB-011, FR-MOB-014, FR-MOB-015 (géoloc)

### Epic MOB-6 : Observabilité, Conformité Stores & Release
L'app est instrumentée (crashs + analytics), reçoit des notifications push, est conforme aux exigences des stores (Privacy Labels, Data Safety, ratings, liens légaux) et est distribuée en beta (TestFlight + Internal Testing) puis soumise en production.
**FRs couverts :** FR-MOB-012, FR-MOB-020, FR-MOB-040, FR-MOB-041, FR-MOB-015 (notifications), FR-MOB-021 (finition)

---

## Epic MOB-1 : Fondation & coquille applicative

**Goal** : Mettre en place `apps/mobile/` dans le monorepo, le pipeline de distribution (EAS + OTA), le design system natif et la configuration transverse, afin que l'app se lance sur iOS + Android, navigue, et offre une base stable et outillée pour tous les epics suivants.

### Story MOB-1.1 : Initialisation de `apps/mobile/` et intégration monorepo

As a **développeur**,
I want **une app Expo Router initialisée dans `apps/mobile/` et intégrée au monorepo Turborepo/pnpm**,
So that **l'app se lance sur simulateur iOS et émulateur Android et peut consommer les packages partagés (`packages/shared`, `packages/gpx`)**.

**Acceptance Criteria :**

**Given** le monorepo ridenrest-app
**When** j'initialise l'app via `pnpm create expo-app@latest apps/mobile --template with-router --no-install`
**Then** `apps/mobile/` contient une app Expo Router fonctionnelle
**And** `.npmrc` contient `node-linker=hoisted`
**And** `pnpm install` résout les dépendances sans erreur de hoisting

**Given** `apps/mobile/` initialisée
**When** je configure `metro.config.js` pour le monorepo
**Then** Metro résout les imports depuis `packages/shared` et `packages/gpx` sans duplication de modules

**Given** le pipeline Turborepo
**When** je lance `turbo dev --filter=mobile`
**Then** l'app démarre et s'affiche sur le simulateur iOS et l'émulateur Android (écran d'accueil par défaut)
**And** les tâches `dev:mobile` / `build:mobile` sont déclarées dans `turbo.json`

**Given** l'app lancée
**When** elle démarre sans session
**Then** la navigation Expo Router est opérationnelle (au moins une route placeholder accessible)

### Story MOB-1.2 : Comptes développeurs & pipeline de distribution (EAS + OTA)

As a **product owner**,
I want **les comptes développeurs Apple (individuel) et Google provisionnés et un pipeline EAS Build + OTA configuré**,
So that **l'app peut être buildée en cloud, distribuée en beta et patchée en OTA sans soumission store à chaque correctif JS**.

**Acceptance Criteria :**

**Given** le besoin de distribution
**When** je provisionne les comptes
**Then** un compte **Apple Developer individuel** est actif ($99/an, Apple ID + CB, **sans D-U-N-S**)
**And** un compte **Google Play Console** est actif ($25 one-shot)

**Given** `apps/mobile/` initialisée
**When** je configure EAS (`eas.json`)
**Then** les profils `development`, `preview` et `production` sont définis
**And** un build EAS `development` (Dev Client) réussit pour iOS et Android

**Given** EAS configuré
**When** j'active `expo-updates` (OTA)
**Then** un canal OTA est rattaché aux profils de build
**And** un patch JS peut être publié sur le canal `preview` et appliqué au prochain lancement de l'app

### Story MOB-1.2b : Dark mode web « Charbon » (back-port de la palette dans la source canonique)

> Story insérée le **2026-06-07** suite à la livraison du handoff Claude Design `docs/design/dark-mode-charbon/`. **Prérequis de MOB-1.3** : les tokens mobiles étant un miroir de la source web canonique (`UX-DR-MOB-001`), la palette dark doit exister dans `globals.css` **avant** extraction.

As a **utilisateur de la webapp**,
I want **basculer la webapp en thème sombre « Charbon »**,
So that **l'app est lisible en faible luminosité et la palette dark devient une valeur canonique que le design system mobile pourra mirrorer sans invention**.

**Acceptance Criteria :**

**Given** le handoff `docs/design/dark-mode-charbon/charbon-dark-tokens.css`
**When** j'intègre le bloc `.dark {}` dans `apps/web/src/app/globals.css`
**Then** les tokens dark reprennent **exactement** les valeurs du handoff (high-fidelity, zéro invention)
**And** les `--shadow-*` (base noire) sont intégrés
**And** le `:root` clair reste strictement inchangé (zéro régression light)
**And** une seule approche de bascule est conservée (classe `.dark` — pas de `@media prefers-color-scheme` concurrent)

**Given** la palette intégrée
**When** je branche le toggle via `next-themes` (`attribute="class"`, `defaultTheme="system"`)
**Then** le défaut suit la préférence OS et le choix utilisateur persiste
**And** la bascule est accessible depuis l'UI (réglages)

**Given** le thème dark actif
**When** je parcours les écrans clés (liste d'aventures, détail/segments, carte, Live)
**Then** les règles composants du README handoff sont appliquées : pastilles de statut en **teinte** (`color-mix(in srgb, var(--density-*) 15%, transparent)` + point 6px), hover `--surface-raised`, sélection `box-shadow 0 0 0 2px var(--primary) inset`, pas de gradient
**And** le wordmark « Powered by Strava » utilise la **variante blanche** sur surfaces sombres (marque orange `#FC5200` inchangée — asset tiers)
**And** vert marque (`--primary`) et vert densité (`--density-high`) restent visuellement distincts

### Story MOB-1.3 : Design system mobile (tokens, NativeWind, Storybook)

As a **développeur frontend**,
I want **un design system mobile basé sur des design tokens partagés, NativeWind et Storybook RN**,
So that **les écrans natifs sont construits avec des composants cohérents et conformes à l'identité de l'app (dark/light)**.

**Acceptance Criteria :**

**Given** le besoin d'un design cohérent **reprenant le design web déjà en place**
**When** je crée `packages/design-tokens/`
**Then** les tokens (couleurs brand vert/magenta, espacements, échelle `--radius-*`, typographie **Montserrat**, dark/light) sont exposés et consommables par l'app mobile
**And** ces tokens sont une **extraction / miroir des valeurs web canoniques** — variables `@theme` de `apps/web/src/app/globals.css` (vocabulaire sémantique shadcn : `primary`/`secondary`/`card`/`popover`/`muted`/`accent`/`destructive`/`border`/`ring`/`chart-1→5`), **y compris le bloc `.dark` « Charbon » back-porté par MOB-1.2b** — **pas des valeurs redéfinies/approximées** (zéro dérive visuelle vs web)
**And** la source de vérité couleurs POI reste `packages/shared/src/constants/poi-colors.ts` (jamais hardcodé)

**Given** l'app mobile
**When** je configure NativeWind
**Then** les composants peuvent être stylés via classes utilitaires alimentées par les tokens
**And** le thème dark/light bascule via préférence + `prefers-color-scheme`

**Given** le design system
**When** je mets en place Storybook RN (web)
**Then** au moins les composants primitifs (Button taille `lg` 44px WCAG, Card, Skeleton) ont une story
**And** `storybook:mobile` est déclaré dans `turbo.json`

### Story MOB-1.4 : Configuration transverse (i18n, tests, CI, deep link scheme)

As a **développeur**,
I want **un scaffold i18n, un framework de tests intégré au CI existant et le scheme deep link configurés**,
So that **l'app est prête pour la localisation, testée automatiquement sur chaque PR, et capable de recevoir des callbacks `ridenrest://`**.

**Acceptance Criteria :**

**Given** la distribution stores future
**When** je configure `expo-localization` + `i18next`
**Then** une architecture i18n est en place avec le français comme locale par défaut
**And** au moins une chaîne d'UI est résolue via le système i18n (preuve de câblage)

**Given** le besoin de qualité
**When** je configure le framework de tests
**Then** Jest + React Native Testing Library exécutent un test unitaire d'exemple qui passe
**And** Maestro est installé avec un smoke test E2E d'exemple (lancement app)

**Given** le pipeline CI existant (`.github/workflows/ci.yml`, GitHub Actions, `pnpm turbo run lint|test --filter='*'` sur chaque PR vers `main`)
**When** `apps/mobile` déclare ses tâches turbo `lint`, `test` et `typecheck` (dans `turbo.json` + `package.json`)
**Then** le lint + les tests unitaires (Jest/RNTL) de `apps/mobile` sont **exécutés automatiquement sur chaque PR** via le `--filter='*'` existant (gate bloquant le merge en cas d'échec)
**And** **aucun build natif Metro/EAS n'est lancé dans GitHub Actions** : la tâche `build:mobile` est soit exclue du job `build` GH Actions, soit un `expo export`/`typecheck` léger — le build natif reste exclusivement sur **EAS Build (cloud)** (FR-MOB-003)
**And** le smoke test **Maestro E2E** est cadencé **en pré-release** (avant soumission), pas sur chaque PR

**Given** le besoin de deep linking
**When** je déclare le scheme `ridenrest://` dans `app.json`/`app.config.ts`
**Then** un lien `ridenrest://test` ouvre l'app et est routé par Expo Router
**And** la configuration iOS (`CFBundleURLTypes`) et Android (intent filter) est générée

---

## Epic MOB-2 : Authentification & Onboarding

**Goal** : Permettre à l'utilisateur de créer un compte / se connecter (email, Google, Strava), de rester connecté en sécurité entre les sessions, de réinitialiser son mot de passe et de supprimer son compte — avec stockage sécurisé des tokens (Keychain/Keystore) et redirection auth-gated.

### Story MOB-2.1 : Client Better Auth, stockage sécurisé & session persistante

As a **utilisateur**,
I want **rester connecté entre les lancements de l'app de manière sécurisée**,
So that **je n'ai pas à me ré-authentifier à chaque ouverture et que mon token est protégé**.

**Acceptance Criteria :**

**Given** l'app mobile
**When** je configure le client Better Auth mobile (`@better-auth/expo`)
**Then** les appels API NestJS sont authentifiés via le JWT Better Auth (secret partagé inchangé côté serveur)

**Given** une session établie
**When** le JWT est persisté
**Then** il est stocké via `expo-secure-store` (Keychain iOS / Keystore Android)
**And** il n'est **jamais** écrit en clair dans AsyncStorage

**Given** un utilisateur connecté
**When** il relance l'app
**Then** la session est restaurée automatiquement sans nouvelle saisie (FR-006)

**Given** la structure de routes
**When** un utilisateur non connecté ouvre l'app
**Then** il est redirigé vers `app/(auth)/login.tsx`
**And** un utilisateur connecté est redirigé vers `app/(app)/adventures` (guard dans `app/(app)/_layout.tsx`)

### Story MOB-2.2 : Inscription / connexion email & réinitialisation du mot de passe

As a **nouvel utilisateur**,
I want **créer un compte avec email/mot de passe, me connecter et réinitialiser mon mot de passe**,
So that **je peux accéder à l'application sans dépendre d'un fournisseur OAuth**.

**Acceptance Criteria :**

**Given** l'écran d'inscription
**When** je saisis un email et un mot de passe valides
**Then** un compte est créé et je suis connecté (FR-001)
**And** les erreurs de validation (email invalide, mot de passe faible) sont affichées clairement

**Given** l'écran de connexion
**When** je saisis des identifiants valides
**Then** je suis authentifié et redirigé vers `adventures`
**And** des identifiants invalides produisent un message d'erreur explicite

**Given** l'écran de réinitialisation
**When** je demande un reset avec mon email
**Then** un email de réinitialisation est envoyé (Resend, backend inchangé) (FR-007)
**And** un message confirme l'envoi sans révéler si l'email existe

### Story MOB-2.3 : Authentification Google OAuth (deep link)

As a **utilisateur**,
I want **me connecter via Google en un geste**,
So that **l'onboarding est sans friction**.

**Acceptance Criteria :**

**Given** l'écran de connexion
**When** je tape « Continuer avec Google »
**Then** le flow OAuth s'ouvre (`expo-auth-session` PKCE ou SDK natif Google)
**And** après autorisation, le callback `ridenrest://oauth-callback` ramène l'utilisateur dans l'app (FR-002, FR-MOB-010)

**Given** un retour de callback OAuth réussi
**When** le token est reçu
**Then** la session est établie et persistée (secure-store)
**And** l'utilisateur est redirigé vers `adventures`

**Given** un flow OAuth annulé ou échoué
**When** l'utilisateur revient dans l'app
**Then** un message d'erreur clair est affiché et aucun état partiel n'est laissé

### Story MOB-2.4 : Authentification Strava OAuth (deep link)

As a **utilisateur cycliste**,
I want **connecter mon compte Strava**,
So that **je pourrai importer mes activités GPX comme segments d'aventure**.

**Acceptance Criteria :**

**Given** l'écran de connexion ou les paramètres
**When** je tape « Connecter Strava »
**Then** le flow OAuth Strava s'ouvre avec le redirect URI custom `ridenrest://oauth-strava` (whitelisté côté Strava)
**And** après autorisation, le callback ramène l'utilisateur dans l'app (FR-003)

**Given** un retour de callback Strava réussi
**When** le token Strava est reçu
**Then** la connexion Strava est enregistrée côté backend (inchangé)
**And** l'état « Strava connecté » est visible dans l'UI

**Given** un flow Strava annulé/échoué
**When** l'utilisateur revient dans l'app
**Then** un message d'erreur clair est affiché et l'état Strava reste « non connecté »

### Story MOB-2.5 : Déconnexion & suppression de compte (RGPD)

As a **utilisateur**,
I want **me déconnecter et pouvoir supprimer définitivement mon compte**,
So that **je contrôle mes données conformément au RGPD**.

**Acceptance Criteria :**

**Given** un utilisateur connecté
**When** il se déconnecte
**Then** le JWT est purgé de `expo-secure-store` (FR-004)
**And** il est redirigé vers `login`

**Given** la page paramètres
**When** l'utilisateur demande la suppression de son compte
**Then** une confirmation explicite est requise
**And** après confirmation, le compte et toutes ses aventures sont effacés (FR-005)
**And** l'utilisateur est déconnecté et renvoyé vers `login`

---

## Epic MOB-3 : Aventures & Gestion GPX

**Goal** : Permettre à l'utilisateur de créer et gérer ses aventures multi-segments : création/renommage/suppression, ajout et manipulation de segments GPX, import Strava, distances cumulées, notification de parsing, et consultation offline via cache local.

### Story MOB-3.1 : Liste, création, renommage & suppression d'aventures

As a **utilisateur**,
I want **créer, lister, renommer et supprimer mes aventures**,
So that **j'organise mes voyages à vélo**.

**Acceptance Criteria :**

**Given** l'écran `adventures`
**When** je crée une aventure nommée
**Then** elle apparaît dans la liste (FR-010)
**And** la liste affiche un `<Skeleton />` pendant le chargement (TanStack Query `isPending`)

**Given** une aventure existante
**When** je la renomme
**Then** le nouveau nom est persisté et affiché (FR-017)

**Given** une aventure existante
**When** je la supprime
**Then** une confirmation est demandée
**And** après confirmation, l'aventure est supprimée de la liste (FR-018)

**Given** aucune aventure
**When** j'arrive sur l'écran
**Then** un état vide explicite invite à créer la première aventure

### Story MOB-3.2 : Upload GPX, ajout de segments & notification de parsing

As a **utilisateur**,
I want **ajouter un ou plusieurs fichiers GPX à une aventure**,
So that **ma trace est analysée et affichable**.

**Acceptance Criteria :**

**Given** une aventure
**When** je sélectionne un fichier GPX via `expo-document-picker` (UIDocumentPicker iOS / SAF Android)
**Then** le fichier est uploadé et un segment est créé en statut `pending` (FR-011)
**And** l'upload long affiche un indicateur de progression (jamais un spinner global bloquant)

**Given** un segment en parsing (`parse_status === 'pending'`)
**When** le job serveur progresse
**Then** le statut est mis à jour via polling TanStack Query (`refetchInterval` 3s conditionnel)
**And** à la fin du parsing, l'utilisateur est notifié (FR-019)

**Given** un parsing échoué
**When** l'erreur est reportée
**Then** les données d'aventure précédentes sont conservées (NFR-033) et l'erreur est affichée clairement

### Story MOB-3.3 : Gestion des segments (réordre, suppression, remplacement, renommage, distances)

As a **utilisateur**,
I want **réordonner, renommer, remplacer et supprimer les segments d'une aventure et voir les distances**,
So that **je structure mon itinéraire en étapes ordonnées**.

**Acceptance Criteria :**

**Given** une aventure multi-segments
**When** je réordonne les segments par glisser-déposer
**Then** le nouvel ordre est persisté (optimistic update + rollback en cas d'erreur) (FR-012)

**Given** un segment
**When** je le supprime ou le remplace par un nouveau GPX
**Then** l'action est appliquée et la liste/trace est mise à jour (FR-013, FR-014)

**Given** un segment
**When** je le renomme
**Then** le nouveau nom est persisté (FR-017)

**Given** une aventure avec segments parsés
**When** je consulte le détail
**Then** la distance totale et les distances cumulatives par segment sont affichées (FR-015)

### Story MOB-3.4 : Import d'activité Strava

As a **utilisateur ayant connecté Strava**,
I want **importer une activité Strava comme segment**,
So that **je n'ai pas à exporter/importer manuellement un GPX**.

**Acceptance Criteria :**

**Given** un compte Strava connecté
**When** j'ouvre l'import Strava
**Then** mes activités récentes sont listées (lazy loading, cache liste TTL 1h côté serveur)

**Given** la liste d'activités
**When** je sélectionne une activité
**Then** elle est importée comme segment de l'aventure (FR-016)

**Given** des données d'activité Strava affichées
**When** elles sont visibles
**Then** l'attribution « Powered by Strava » est affichée (FR-063)

### Story MOB-3.5 : Cache GPX local pour consultation offline

As a **cycliste en zone sans réseau**,
I want **consulter la trace et les derniers POIs de mes aventures actives hors ligne**,
So that **l'app reste utile en autonomie**.

**Acceptance Criteria :**

**Given** une aventure ouverte avec réseau
**When** la trace GPX et les POIs sont chargés
**Then** ils sont mis en cache localement via `expo-file-system` (NFR-MOB-REL-01)

**Given** l'app hors ligne
**When** j'ouvre une aventure précédemment chargée
**Then** la trace et les derniers POIs cachés sont consultables (lecture seule)
**And** les actions nécessitant le réseau sont désactivées avec un message explicite

**Given** l'app hors ligne puis reconnectée
**When** le réseau revient (`AppState` / NetInfo)
**Then** les données se rafraîchissent normalement sans perte de contexte

---

## Epic MOB-4 : Carte & Planification POI

**Goal** : Offrir l'expérience de planification complète sur carte native : affichage de la trace, calques POI, recherche par corridor kilométrique, fiches détaillées (deep links booking + itinéraire d'accès BRouter), analyse de densité colorisée et météo planifiée le long de la trace.

### Story MOB-4.1 : Carte MapLibre Native (trace, thèmes, centrage, attribution OSM)

As a **utilisateur**,
I want **voir ma trace sur une carte interactive native avec thème clair/sombre**,
So that **je visualise mon itinéraire**.

**Acceptance Criteria :**

**Given** une aventure avec trace parsée
**When** j'ouvre la carte (`@maplibre/maplibre-react-native`, Dev Client requis)
**Then** la trace GPX s'affiche sur la carte (FR-020)
**And** la carte se centre automatiquement sur la trace (FR-026)

**Given** la carte affichée
**When** je bascule le thème
**Then** la carte passe en style sombre ou clair (FR-021)

**Given** n'importe quelle vue carte
**When** elle est affichée
**Then** l'attribution OpenStreetMap est visible en permanence (FR-036, NFR-044)
**And** le chargement carte + trace s'effectue en < 3s (NFR-006)

### Story MOB-4.2 : Calques POI, pins, clusters & fiche détail

As a **utilisateur**,
I want **afficher des calques POI et consulter le détail d'un POI**,
So that **j'explore les services le long de ma trace**.

**Acceptance Criteria :**

**Given** la carte
**When** j'active/désactive un calque POI (🏨 🍽️ 🛒 🚲)
**Then** les pins correspondants apparaissent/disparaissent indépendamment (FR-023, FR-034)

**Given** des POIs dans le viewport
**When** la carte est affichée
**Then** les POIs sont rendus en pins SVG (couleurs depuis `poi-colors.ts`), regroupés en clusters au-delà d'un seuil (FR-024)

**Given** un pin POI
**When** je tape dessus
**Then** une fiche détail s'ouvre en bottom sheet (`@gorhom/bottom-sheet`) (FR-025)
**And** elle affiche nom, type, distance depuis la trace (m) et kilométrage (FR-032)
**And** le pin est recentré (offset vertical) pour laisser la place au sheet

### Story MOB-4.3 : Recherche par corridor kilométrique

As a **utilisateur planifiant**,
I want **définir une plage kilométrique et chercher les POIs dans le corridor**,
So that **je trouve des services autour d'une portion précise de ma trace**.

**Acceptance Criteria :**

**Given** la carte d'une aventure
**When** je définis une plage km A → km B via le slider (cap 30 km max)
**Then** la recherche n'est déclenchée qu'au clic explicite sur « Rechercher » (gate `searchCommitted`) (FR-030)

**Given** une recherche déclenchée
**When** les résultats reviennent
**Then** les POIs situés dans le corridor géospatial autour du segment sont affichés (FR-031)
**And** un overlay de chargement scopé à la carte est visible pendant la requête

**Given** une recherche retournant zéro POI
**When** elle est terminée
**Then** une bannière « Aucun résultat » explicite est affichée

### Story MOB-4.4 : Analyse de densité & trace colorisée

As a **utilisateur planifiant**,
I want **lancer une analyse de densité et voir ma trace colorisée**,
So that **j'identifie d'un coup d'œil les zones à risque d'hébergement**.

**Acceptance Criteria :**

**Given** une aventure
**When** je déclenche l'analyse de densité
**Then** un job asynchrone est lancé et le statut est suivi par polling (FR-035)

**Given** une analyse terminée
**When** la carte se rafraîchit
**Then** la trace est colorisée par tronçon (vert/orange/rouge) selon la disponibilité d'hébergements (FR-022)

**Given** la trace colorisée
**When** je consulte la carte
**Then** une légende textuelle de la colorisation est accessible (FR-027, accessibilité daltonisme)

### Story MOB-4.5 : Deep links de réservation, transparence affiliés & tracking

As a **utilisateur**,
I want **ouvrir un lien de réservation depuis une fiche hébergement**,
So that **je réserve rapidement, en sachant qu'il s'agit d'un lien affilié**.

**Acceptance Criteria :**

**Given** une fiche hébergement
**When** je consulte ses liens
**Then** des deep links paramétrés vers Hotels.com et/ou Booking.com sont présents (FR-033, FR-060)
**And** ils sont identifiés visuellement comme liens affiliés (FR-061)

**Given** un lien de réservation
**When** je tape dessus
**Then** il s'ouvre via `Linking.openURL` (app native si installée, sinon navigateur système)
**And** le clic est tracé pour analytics (FR-062, `packages/analytics` → PostHog)

### Story MOB-4.6 : POI Access Routing — fiche d'accès & profil de routage

As a **utilisateur planifiant**,
I want **voir l'itinéraire d'accès cyclable réel vers un hébergement et choisir mon profil de routage**,
So that **j'évalue le coût additionnel (distance, D+/D-) pour rejoindre un POI**.

**Acceptance Criteria :**

**Given** une fiche POI hébergement en Planning
**When** je l'ouvre
**Then** l'application appelle `POST /pois/:id/access` et affiche l'itinéraire d'accès (distance m + D+ + D-) (FR-PA-001)
**And** l'origine est le début de l'étape en cours, ou `nearest-trace` si aucune étape (FR-PA-004)

**Given** le calcul d'accès en cours
**When** la fiche est affichée
**Then** un skeleton dédié indique le statut (en cours / ok / fallback), jamais un spinner générique (FR-PA-018)
**And** la réponse expose `status` (`ok`/`fallback`/`error`) + source (`db-cache`/`computed-fresh`) (FR-PA-020)

**Given** BRouter indisponible ou en échec
**When** la réponse revient
**Then** le fallback « distance à vol d'oiseau » est affiché avec un badge « approximatif » (FR-PA-005)

**Given** une fiche POI selon sa sous-catégorie
**When** le label d'accès est affiché
**Then** il est contextualisé (« vers l'hôtel / le camping / le refuge… ») avec fallback « Itinéraire d'accès » (FR-PA-019)

**Given** une aventure
**When** je choisis un profil de routage (Route / Gravel / Bikepacking)
**Then** il est persisté par aventure et détermine les itinéraires d'accès calculés (FR-PA-006)

### Story MOB-4.7 : POI Access Routing — polyline carte, auto-zoom & invalidation

As a **utilisateur planifiant**,
I want **voir l'itinéraire d'accès tracé sur la carte et qu'il reste à jour**,
So that **je visualise concrètement le détour vers un hébergement**.

**Acceptance Criteria :**

**Given** un POI dont l'itinéraire d'accès est disponible
**When** je tape dessus
**Then** la polyline d'accès s'affiche (amber pointillés) au-dessus de la trace principale (FR-PA-007)
**And** la carte effectue un auto-zoom sur le bbox englobant accès + portion de trace pertinente (FR-PA-009)

**Given** une polyline d'accès affichée
**When** je tape sur un autre POI ou en dehors
**Then** une seule polyline est visible à la fois ; un autre POI la remplace, un clic extérieur la masque (FR-PA-008)

**Given** la création/import d'une aventure
**When** des POIs hébergement sont à < 1500 m vol d'oiseau de la trace
**Then** leurs itinéraires d'accès sont pré-calculés en arrière-plan (BullMQ, backend) (FR-PA-014)

**Given** une modification de trace, de profil de routage ou d'étape
**When** elle est appliquée
**Then** les itinéraires d'accès rattachés sont invalidés et recalculés en arrière-plan (FR-PA-015, FR-PA-016, FR-PA-017)

### Story MOB-4.8 : Météo planifiée le long de la trace (pace-adjusted)

As a **utilisateur planifiant**,
I want **voir la météo prévue à chaque point selon mon heure de départ et mon allure**,
So that **j'anticipe les conditions de mon étape**.

**Acceptance Criteria :**

**Given** le mode Planification
**When** je saisis une heure de départ et une allure
**Then** la météo affichée est calée sur l'heure d'arrivée estimée à chaque point km (pace-adjusted) (FR-050, FR-051)
**And** les données proviennent de WeatherAPI.com (température, vent, précipitations, icône) (FR-053)

**Given** la météo affichée
**When** une heure s'écoule
**Then** les prévisions sont automatiquement rafraîchies (FR-054)

**Given** aucune allure saisie
**When** la météo est demandée
**Then** elle correspond à l'heure actuelle au point (fallback) (FR-055)

---

## Epic MOB-5 : Mode Live / Aventure ⭐

**Goal** : Offrir l'expérience on-bike différenciante : géolocalisation continue (écran éteint), affichage des POIs sur les prochains X km selon GPS + allure, panneau de recherche refondu avec profil d'élévation interactif contextualisé, et météo Live — le tout en filtrage 100% client-side (RGPD).

### Story MOB-5.1 : Activation du mode Live, consentement & permissions

As a **cycliste**,
I want **activer le mode Live après avoir donné mon consentement de géolocalisation**,
So that **l'app me localise pendant que je roule, en respectant ma vie privée**.

**Acceptance Criteria :**

**Given** une aventure
**When** je tente d'activer le mode Live
**Then** un consentement explicite de géolocalisation est demandé avant toute activation (FR-040, NFR-013)
**And** la permission runtime iOS/Android est demandée avec une justification (rationale)

**Given** le consentement accordé
**When** le mode Live démarre
**Then** `expo-keep-awake` empêche l'écran de s'éteindre pendant la session Live (FR-044 support)

**Given** le consentement refusé
**When** je reste sur l'écran
**Then** le mode Live n'est pas activé et un message explique pourquoi la géoloc est nécessaire

### Story MOB-5.2 : Géolocalisation temps réel & background

As a **cycliste**,
I want **que ma position soit suivie même écran éteint**,
So that **l'app continue de calculer les POIs à venir pendant que je roule**.

**Acceptance Criteria :**

**Given** le mode Live actif
**When** je me déplace
**Then** la position GPS est détectée en temps réel via `expo-location` (FR-041)

**Given** l'app passe en arrière-plan / écran éteint
**When** je continue de rouler
**Then** le suivi se poursuit (permission `Always` iOS / foreground service Android avec notification persistante)

**Given** l'app bascule background/foreground/killed
**When** l'état change (`AppState`)
**Then** le polling TanStack Query est mis en pause/repris en conséquence (FR-MOB-014)
**And** aucune coordonnée GPS n'est envoyée au serveur (calcul client-side, RGPD) (NFR-012)

**Given** une session Live prolongée (GPS background, écran éteint)
**When** je mesure la consommation batterie en sprint 0
**Then** la consommation vise **≤ 10 %/h** (cible initiale NFR-MOB-PERF-03), avec intervalle GPS adaptatif / `distanceFilter` et pause polling via `AppState`
**And** la cible est figée après mesures réelles de la beta Espagne (avril 2026)

### Story MOB-5.3 : Découverte de POIs en mode Live

As a **cycliste fatigué**,
I want **voir les hébergements sur mes prochains X km selon mon allure**,
So that **je décide rapidement où m'arrêter**.

**Acceptance Criteria :**

**Given** le mode Live actif
**When** je saisis mon allure estimée (km/h)
**Then** la fenêtre de recherche des prochains X km est calibrée (FR-042)

**Given** ma position et mon allure
**When** les POIs sont calculés
**Then** seuls ceux situés sur les prochains X km depuis ma position sont affichés (filtrage client-side) (FR-043)
**And** la latence GPS → POIs est ≤ 2s avec indicateur de chargement visible (NFR-007)

**Given** ma position évolue
**When** j'avance
**Then** les résultats se mettent à jour automatiquement (FR-044)

**Given** une connexion instable
**When** le chargement est partiel
**Then** les POIs partiellement chargés sont affichés avec un message d'état clair, sans crash silencieux (FR-045, NFR-032)

### Story MOB-5.4 : Panneau de recherche Live refondu & section « PROFIL » repliable

As a **cycliste utilisant le mode Live**,
I want **un panneau de recherche désencombré avec une section « PROFIL » repliable**,
So that **j'ai un panneau clair qui révèle le contexte d'élévation au bon moment**.

**Acceptance Criteria :**

**Given** le mode Live actif
**When** le panneau s'affiche
**Then** le layout suit les maquettes : en-tête « PROFIL » + chevron, métriques `↑D+ · ↓D- · ~ETA` hiérarchisées, slider −/+, boutons RECHERCHER / RECHERCHER SUR (FR-LP-001, UX-DR-LP-001)
**And** les cibles tactiles respectent 44×44 px (NFR-LP-003)

**Given** le panneau au chargement et après recherche
**When** je n'ai pas touché le slider
**Then** la section « PROFIL » est repliée par défaut (FR-LP-002)

**Given** la section « PROFIL » repliée
**When** je touche le slider (premier contact)
**Then** elle s'ouvre automatiquement avec une transition de hauteur fluide (FR-LP-003, NFR-LP-004)

**Given** la section ouverte
**When** je clique « RECHERCHER »
**Then** elle se referme et la recherche POI part normalement (FR-LP-004)

**Given** la section (ouverte ou fermée)
**When** je clique le chevron
**Then** elle bascule manuellement, indépendamment du slider (FR-LP-005)

**Given** la nouvelle section en place
**When** je suis en Live
**Then** l'ancien mini-bandeau d'élévation n'est plus affiché en double (FR-LP-012)

### Story MOB-5.5 : Profil d'élévation interactif contextualisé

As a **cycliste utilisant le mode Live**,
I want **un profil d'élévation qui commence à ma position, surligne la zone recherchée et se termine ~100 km plus loin, avec zoom piloté par le slider**,
So that **je lis le terrain entre moi et mon prochain arrêt**.

**Acceptance Criteria :**

**Given** une aventure avec données d'élévation et le Live actif
**When** la section « PROFIL » est ouverte
**Then** un profil d'élévation est rendu via `react-native-svg` (un seul `<Path>` memoïsé, logique `useElevationProfile` réutilisée) (FR-LP-006)
**And** le bord gauche correspond à ma position GPS projetée (`currentKmOnRoute`) avec un marqueur (FR-LP-007)

**Given** la section ouverte
**When** je regarde le profil
**Then** une zone surlignée indique la zone recherchée, centrée sur la cible avec la largeur du rayon (FR-LP-008)
**And** le bord droit se termine ≈ 100 km au-delà de la cible, borné par la fin de trace (FR-LP-009)

**Given** la section ouverte
**When** je déplace le slider
**Then** la fenêtre visible s'étend/réduit en temps réel, marqueur et zone repositionnés, sans recalcul des `points[]` (FR-LP-010, NFR-LP-002)

**Given** une aventure sans données d'élévation (`hasElevationData === false`)
**When** j'ouvre la section
**Then** aucun graphe vide n'est affiché ; message discret ou section repliée, sans erreur (FR-LP-011)

**Given** le calcul de position
**When** le profil démarre à ma position
**Then** aucune coordonnée GPS n'est envoyée au serveur (`snapToTrace` client-side) (NFR-LP-001)

### Story MOB-5.6 : Météo en mode Live

As a **cycliste en mouvement**,
I want **voir la météo à venir selon ma position GPS et mon allure**,
So that **j'anticipe les conditions sur les prochains kilomètres**.

**Acceptance Criteria :**

**Given** le mode Live actif avec allure saisie
**When** la météo est demandée
**Then** elle est calculée selon ma position GPS et mon allure déclarée (FR-052)
**And** le calcul est effectué client-side (aucune position envoyée au serveur)

**Given** aucune allure saisie en Live
**When** la météo est affichée
**Then** elle correspond à l'heure actuelle au point (fallback, FR-055)

---

## Epic MOB-6 : Observabilité, Conformité Stores & Release

**Goal** : Instrumenter l'app (crashs + analytics), activer les notifications push, finaliser la localisation, assurer la conformité aux exigences des stores et distribuer l'app en beta puis en production.

### Story MOB-6.1 : Crash reporting (Sentry) & analytics (PostHog)

As a **product owner**,
I want **suivre les crashs et l'usage de l'app**,
So that **je détecte les problèmes et mesure l'engagement (dashboard unifié web + mobile)**.

**Acceptance Criteria :**

**Given** l'app mobile
**When** j'intègre Sentry
**Then** les erreurs JS et les crashes natifs sont remontés avec source maps Metro (FR-MOB-020)

**Given** un événement produit (clic réservation, session Live…)
**When** il se produit
**Then** il est envoyé via `posthog-react-native` branché sur la façade `packages/analytics` existante (taxonomie typée livrée par epic-posthog)
**And** il apparaît dans le dashboard PostHog unifié (web + mobile), sans cookie (distinct_id AsyncStorage)

**Given** la collecte d'analytics
**When** elle est active
**Then** aucune donnée GPS ni donnée personnelle sensible n'est transmise

**Given** le session replay PostHog
**When** l'app tourne en build production
**Then** le replay est désactivé — actif uniquement sur builds beta (EAS development/preview ou feature flag) ; l'activation production relève de MOB-6.6

### Story MOB-6.2 : Notifications push (APNs / FCM)

As a **utilisateur**,
I want **recevoir une notification push quand mon analyse de densité est terminée**,
So that **je n'ai pas à garder l'app ouverte**.

**Acceptance Criteria :**

**Given** l'app mobile
**When** je configure `expo-notifications`
**Then** les tokens push APNs (iOS) et FCM (Android) sont enregistrés (FR-MOB-012)
**And** la permission notifications est demandée au bon moment (après la première analyse, pas à l'onboarding) (FR-MOB-015)

**Given** une analyse de densité terminée côté serveur
**When** l'événement se produit
**Then** une notification push est délivrée à l'utilisateur

**Given** la permission push refusée
**When** une analyse se termine
**Then** un fallback in-app (via polling) informe l'utilisateur, sans erreur

### Story MOB-6.3 : Finition de l'internationalisation

As a **utilisateur**,
I want **une app entièrement localisée (français au lancement)**,
So that **l'expérience est cohérente et prête pour de futures langues**.

**Acceptance Criteria :**

**Given** le scaffold i18n (MOB-1.4)
**When** je finalise la localisation
**Then** toutes les chaînes d'UI visibles sont externalisées via i18next (FR-MOB-021)
**And** aucune chaîne en dur ne subsiste dans les écrans principaux

**Given** la locale de l'appareil
**When** l'app démarre
**Then** le français est servi par défaut et l'architecture permet l'ajout d'une langue sans refonte

### Story MOB-6.4 : Conformité stores & liens légaux

As a **product owner**,
I want **que l'app satisfasse les exigences de confidentialité et de conformité des stores**,
So that **elle puisse être publiée sur l'App Store et Google Play**.

**Acceptance Criteria :**

**Given** la soumission iOS
**When** je remplis les métadonnées
**Then** les Privacy Nutrition Labels déclarent géoloc / comptes / analytics (FR-MOB-040, NFR-MOB-INT-02)
**And** l'app est une vraie app native conforme à la guideline 4.2 (pas un wrapper webview) (NFR-MOB-INT-01)

**Given** la soumission Android
**When** je remplis le formulaire Data Safety
**Then** les déclarations correspondent aux données réellement collectées
**And** l'age/content rating est renseigné

**Given** la page paramètres
**When** je consulte les liens légaux
**Then** Politique de confidentialité et CGU s'ouvrent via `Linking.openURL` vers `ridenrest.app/privacy` et `/terms` (FR-MOB-041)
**And** aucun contenu légal n'est dupliqué en natif

### Story MOB-6.5 : Distribution beta & soumission production

As a **product owner**,
I want **distribuer l'app en beta puis la soumettre en production**,
So that **les beta-users (événement Espagne) puis le public puissent l'utiliser**.

**Acceptance Criteria :**

**Given** un build EAS `production`
**When** je le distribue en beta
**Then** il est disponible via TestFlight (iOS) et Internal Testing (Google Play)
**And** les beta-users peuvent l'installer et l'utiliser

**Given** la beta validée
**When** je soumets en production
**Then** l'app est soumise à la review Apple et Google
**And** un patch JS critique peut être livré en OTA sans nouvelle soumission (FR-MOB-003)

### Story MOB-6.6 : Session replay mobile en production (post-v1)

> **Release dédiée post-v1** — requiert un nouveau binaire (module natif replay, non livrable en OTA). Prérequis : masquage validé en beta (MOB-6.1) + patterns de masquage web (posthog-3). Ajoutée par `sprint-change-proposal-2026-06-07.md`.

As a **product owner**,
I want **activer le session replay PostHog en production mobile**,
So that **j'analyse les parcours réels des utilisateurs (boucle MCP → améliorations UX) sans compromettre la confidentialité**.

**Acceptance Criteria :**

**Given** le module natif de session replay PostHog
**When** je l'active en production
**Then** un consentement in-app explicite est requis avant tout enregistrement
**And** les vues carte (MapLibre) et toute PII sont masquées — la règle « GPS jamais hors device » s'applique à l'écran enregistré

**Given** la soumission du binaire
**When** je mets à jour les métadonnées stores
**Then** Privacy Nutrition Labels (iOS) et Data Safety (Android) déclarent la collecte liée au replay (FR-MOB-040)

**Given** un utilisateur ayant refusé le consentement replay
**When** il utilise l'app
**Then** aucun enregistrement n'est effectué et l'analytics d'events standard continue de fonctionner

---

## Stories d'ajustement UI (réservées)

> Conformément à la décision de Guillaume (2026-06-02) : des **stories d'ajustement UI** pourront être ajoutées ici en fin de parcours, sur base du **design dédié** (design system + maquettes), une fois les écrans natifs assemblés. Non détaillées à ce stade.

---

**Total** : 6 epics, 34 stories (dont MOB-6.6 post-v1 — amendement 2026-06-07). Couverture : 48 FRs hérités portables + 15 FR-MOB + 14 FR-PA actifs + 12 FR-LP + NFRs transverses. FRs PWA (FR-070→073) exclus par décision projet.
