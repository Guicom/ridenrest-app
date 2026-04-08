---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
---

# ridenrest-app - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for ridenrest-app, decomposing the requirements from the PRD and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-001: L'utilisateur peut créer un compte avec email et mot de passe
FR-002: L'utilisateur peut s'authentifier via Google OAuth (1 clic)
FR-003: L'utilisateur peut connecter son compte Strava pour importer des activités GPX
FR-004: L'utilisateur peut se déconnecter de l'application
FR-005: L'utilisateur peut supprimer son compte — toutes ses données sont effacées (RGPD)
FR-006: L'application maintient la session utilisateur entre les visites (persistent session)
FR-007: L'utilisateur peut réinitialiser son mot de passe par email
FR-010: L'utilisateur peut créer une aventure nommée
FR-011: L'utilisateur peut ajouter un ou plusieurs fichiers GPX à une aventure sous forme de segments ordonnés
FR-012: L'utilisateur peut réordonner les segments d'une aventure par glisser-déposer
FR-013: L'utilisateur peut supprimer un segment d'une aventure
FR-014: L'utilisateur peut remplacer un segment par un nouveau fichier GPX
FR-015: L'application calcule et affiche la distance totale de l'aventure et les distances cumulatives par segment
FR-016: L'utilisateur peut importer une activité directement depuis son compte Strava en tant que segment
FR-017: L'utilisateur peut renommer une aventure ou un segment individuel
FR-018: L'utilisateur peut supprimer une aventure entière avec confirmation
FR-019: L'application informe l'utilisateur par notification quand le parsing d'un segment GPX est terminé
FR-020: L'application affiche la trace GPX sur une carte interactive (MapLibre GL JS)
FR-021: L'utilisateur peut basculer entre le thème carte sombre et clair
FR-022: Après analyse de densité, la trace est colorisée par tronçon (vert/orange/rouge) selon la disponibilité d'hébergements
FR-023: L'utilisateur peut activer/désactiver chaque calque POI indépendamment (🏨 Hébergements / 🍽️ Restauration / 🛒 Alimentation / 🚲 Vélo)
FR-024: Les POIs sont affichés sous forme de pins sur la carte dans le viewport courant
FR-025: L'utilisateur peut taper sur un pin pour afficher la fiche détail du POI
FR-026: L'application centre automatiquement la carte sur la trace de l'aventure sélectionnée
FR-027: Une légende de la colorisation de trace est accessible depuis la carte
FR-030: L'utilisateur peut définir une plage kilométrique (km A → km B) pour rechercher des POIs — amplitude maximale de 30 km pour limiter les appels Overpass API
FR-031: L'application retourne les POIs situés dans un corridor géospatial autour du segment sélectionné (ST_Buffer sur le segment limité)
FR-032: Chaque fiche POI affiche : nom, type, distance depuis la trace (m), kilométrage sur la trace
FR-033: Chaque fiche hébergement affiche un lien deep-link paramétré vers Hotels.com et/ou Booking.com
FR-034: L'utilisateur peut filtrer les POIs affichés par catégorie directement sur la carte
FR-035: L'utilisateur peut déclencher une analyse de densité asynchrone sur une aventure
FR-036: L'application affiche l'attribution OpenStreetMap sur la carte à tout moment
FR-040: L'utilisateur peut activer le mode Live — un consentement explicite de géolocalisation est demandé avant activation
FR-041: En mode Live, l'application détecte la position GPS de l'utilisateur en temps réel
FR-042: En mode Live, l'utilisateur choisit via un slider une distance cible (ex. 30 km) — les POIs affichés sont ceux situés autour du point projeté à `currentKm + distance_cible` sur la trace
FR-043: En mode Live, l'utilisateur configure un rayon de recherche autour du point cible (0 à 5 km, max 10 km) — seuls les POIs dans ce rayon sont affichés
FR-044: Les résultats se mettent à jour automatiquement à mesure que la position GPS évolue (nouveau `currentKm` recalculé)
FR-045: En cas de connexion instable, les POIs partiellement chargés sont affichés avec un message d'état clair
FR-050: En mode Planification, l'utilisateur peut saisir une heure de départ et une allure estimée
FR-051: L'application affiche les prévisions météo calées sur l'heure d'arrivée estimée à chaque point kilométrique (pace-adjusted)
FR-052: En mode Live, la météo est calculée en fonction de la position GPS et de l'allure déclarée
FR-053: Les données météo proviennent de WeatherAPI.com (température, vent, précipitations, icône météo)
FR-054: Les prévisions météo sont automatiquement rafraîchies toutes les heures
FR-055: Fallback : si aucune allure n'est saisie, la météo affichée correspond à l'heure actuelle au point
FR-060: Les liens de réservation sont des deep links paramétrés vers Hotels.com et Booking.com
FR-061: Les liens affiliés sont identifiés visuellement comme tels dans l'interface (transparence utilisateur)
FR-062: L'application trace les clics sur les liens de réservation à des fins d'analytics
FR-063: L'attribution "Powered by Strava" est visible quand des données d'activité Strava sont affichées
FR-070: L'application peut être installée sur l'écran d'accueil via le mécanisme PWA natif
FR-071: La trace GPX et les derniers POIs chargés restent consultables en mode offline partiel
FR-072: L'application envoie une notification push (opt-in) quand une analyse de densité est terminée
FR-073: Les fonctionnalités nécessitant le réseau sont désactivées offline avec un message explicite
FR-080: En mode Planification, chaque fiche POI affiche le dénivelé positif cumulé (D+) entre le fromKm courant et la position du POI sur la trace
FR-081: En mode Planification, chaque fiche POI affiche le temps estimé pour atteindre le POI depuis le fromKm, calculé selon l'allure saisie (fallback : 15 km/h si non saisie)
FR-082: En mode Live, chaque POI dans la liste affiche le D+ et le temps estimé depuis la position GPS courante jusqu'au point cible sur la trace
FR-083: Le mode Planning est optimisé pour desktop (≥ 1024px) — sur mobile un toast/popup informe l'utilisateur que l'expérience est meilleure sur desktop, sans bloquer l'accès
FR-084: En mode Planning, un profil d'élévation interactif est affiché — au survol du graphique la position correspondante sur la trace est mise en évidence ; les étapes (Epic 11) y sont matérialisées
FR-085: En mode Live, le rayon de recherche autour du point cible est configurable via un stepper (— / +) dans le drawer Filtres — pas via un slider sur la carte
FR-086: Le drawer Filtres (Planning : panneau latéral desktop / drawer mobile ; Live : drawer "FILTERS") expose les calques à afficher : Hébergements, Restauration, Vélo, Densité, Météo — plus les sous-types d'hébergement (Overpass + Google Places)
FR-087: En mode Live, la trace s'affiche en gris/noir foncé par défaut ; le segment entre la position GPS courante et le point de recherche s'affiche en vert dynamiquement à mesure que le slider change
FR-088: Post-MVP — Le drawer Filtres expose : dates d'arrivée/sortie, nombre de personnes, nombre de chambres, types de lits, options (annulation sans frais, logement avec cuisine) — paramètres passés dans les deep links Booking.com

### NonFunctional Requirements

NFR-001: First Contentful Paint < 1.5s (Lighthouse mobile, 4G simulé)
NFR-002: Largest Contentful Paint < 2.5s (Lighthouse mobile, 4G simulé)
NFR-003: Cumulative Layout Shift < 0.1 (Lighthouse, pages marketing)
NFR-004: Bundle JS initial (gzippé) < 200 KB (next build + analyzer)
NFR-005: Parsing GPX serveur < 10s pour fichiers jusqu'à 50 000 points
NFR-006: Chargement carte + trace < 3s (mobile 4G, post-import GPX)
NFR-007: Latence mode Live (GPS → POIs) ≤ 2s avec indicateur visible
NFR-008: Score PWA Lighthouse ≥ 85 (audit mobile)
NFR-010: Toutes les communications HTTP sécurisées en HTTPS (TLS 1.3+)
NFR-011: Tokens d'authentification stockés de manière sécurisée (httpOnly cookies Better Auth)
NFR-012: Données de géolocalisation non persistées côté serveur (RGPD — usage session uniquement)
NFR-013: Consentement explicite requis avant toute activation de la géolocalisation
NFR-014: API keys et secrets en variables d'environnement, jamais exposés côté client
NFR-015: Rate limiting activé sur les endpoints API NestJS (protection contre abus et DDoS)
NFR-016: Politique de confidentialité publiée et accessible avant le premier usage (RGPD)
NFR-020: Architecture API stateless pour permettre le scaling horizontal (Fly.io)
NFR-021: Résultats Overpass API mis en cache (Redis Upstash, TTL 24h)
NFR-022: Jobs d'analyse de densité exécutés de manière asynchrone (file d'attente BullMQ)
NFR-023: L'application supporte des pics de trafic lors des événements ultra-distance (16-100 utilisateurs simultanés MVP)
NFR-030: Disponibilité cible ≥ 99% (~7h d'arrêt max par mois) — critique pendant les événements actifs
NFR-031: Dégradation gracieuse : si Overpass API est indisponible, message clair + possibilité de réessayer
NFR-032: Zéro crash silencieux en mode Live : toute erreur réseau produit un feedback utilisateur visible
NFR-033: Données d'aventure non perdues suite à une erreur de parsing — erreur reportée, données précédentes conservées
NFR-040: Respecter les rate limits Overpass API — throttling automatique, requêtes par segment
NFR-041: Respecter les rate limits Strava API (100 req/15 min, 1 000 req/jour) — alertes à 80%
NFR-042: Respecter les quotas WeatherAPI.com (1M calls/mois) — dashboard de consommation interne
NFR-043: Respecter les Conditions d'utilisation Strava API : ne pas stocker les données d'activité au-delà de l'import
NFR-044: Attribution OpenStreetMap ("© OpenStreetMap contributors") visible dans l'interface carte à tout moment
NFR-045: Liens affiliés respectent les CGU des programmes partenaires (Expedia, Hotels.com) — format URLs non modifié

### Additional Requirements

**Architecture — Starter & Infrastructure Setup:**
- Starter template: `pnpm create turbo@latest ridenrest-app --package-manager pnpm` → forme la base d'Epic 1, Story 1.1
- Monorepo Turborepo 2.6.1 avec apps/web (Next.js 15), apps/api (NestJS 11), packages/database, packages/gpx, packages/shared, packages/ui
- GitHub Actions CI/CD pipeline: pnpm install → turbo lint → turbo build (cache) → deploy Vercel (web) + Fly.io (api)

**Architecture — Data Layer:**
- Drizzle ORM (schémas dans packages/database/) avec drizzle-kit pour migrations
- Tables cibles: profiles, adventures, adventure_segments, accommodations_cache, weather_cache, coverage_gaps
- Upstash Redis dual-role: cache API externe + backend BullMQ jobs

**Architecture — Authentication:**
- Better Auth (email/password + Google OAuth + Strava OAuth), open source, sessions stockées dans PostgreSQL (Aiven)
- Better Auth middleware pour session Next.js App Router (`lib/auth/auth.ts`, `lib/auth/client.ts`, `lib/auth/server.ts`)
- JwtAuthGuard NestJS custom: vérifier JWT Better Auth sur chaque endpoint protégé (`BETTER_AUTH_SECRET`)

**Architecture — API Patterns:**
- NestJS feature modules (adventures, segments, pois, density, weather, strava, common)
- Repository pattern: toutes les queries Drizzle dans {feature}.repository.ts
- ResponseInterceptor global: jamais de JSON brut depuis un controller
- HttpExceptionFilter global: pas de try/catch dans les controllers
- ValidationPipe global + class-validator pour les DTOs

**Architecture — Frontend Patterns:**
- TanStack Query v5 pour le server state (query keys: ['resource', id?, 'sub?'])
- Zustand v5 pour le client state (useMapStore, useLiveStore, useUIStore)
- shadcn/ui + Tailwind CSS v4 pour les composants UI
- Vercel deploy: Node.js full runtime, SSG pour `(marketing)/`, CSR pour `(app)/` — aucun adapter Edge requis

**Architecture — Real-time & Async:**
- BullMQ v5 queues: 'gpx-processing' + 'density-analysis'
- Job status: TanStack Query polling (`refetchInterval` conditionnel sur `parse_status` / `density_status`)
- GPS/geolocation: client-side uniquement via watchPosition() — RGPD compliance

**Architecture — Packages GPX:**
- packages/gpx: Haversine (distances), RDP simplification (50k→2k points), corridor search algorithm
- packages/shared: Zod schemas partagés, types Adventure/Segment/POI, constantes

### FR Coverage Map

FR-001: Epic 2 — Email/password account creation
FR-002: Epic 2 — Google OAuth sign-in
FR-003: Epic 2 — Strava OAuth connection for GPX import
FR-004: Epic 2 — Sign out
FR-005: Epic 2 — Account deletion with full data cascade (RGPD)
FR-006: Epic 2 — Persistent session between visits
FR-007: Epic 2 — Password reset by email
FR-010: Epic 3 — Create named adventure
FR-011: Epic 3 — Add ordered GPX segments to adventure
FR-012: Epic 3 — Drag-and-drop segment reordering
FR-013: Epic 3 — Delete a segment
FR-014: Epic 3 — Replace a segment with new GPX file
FR-015: Epic 3 — Compute and display total + cumulative distances
FR-016: Epic 3 — Import Strava activity as segment
FR-017: Epic 3 — Rename adventure or segment
FR-018: Epic 3 — Delete entire adventure with confirmation
FR-019: Epic 3 — Notify user when GPX segment parsing completes
FR-020: Epic 4 — Display GPX trace on interactive map (MapLibre)
FR-021: Epic 4 — Toggle dark/light map theme
FR-022: Epic 5 — Colorize trace by density tronçon (green/orange/red)
FR-023: Epic 4 — Toggle each POI layer independently (🏨🍽️🛒🚲)
FR-024: Epic 4 — Display POI pins on map in current viewport
FR-025: Epic 4 — Tap pin to show POI detail sheet
FR-026: Epic 4 — Auto-center map on adventure trace
FR-027: Epic 5 — Legend for density colorization accessible from map
FR-030: Epic 4 — Define km range (A→B) for POI corridor search
FR-031: Epic 4 — Return POIs within geospatial corridor (PostGIS ST_Buffer)
FR-032: Epic 4 — POI card: name, type, distance from trace (m), km on trace
FR-033: Epic 4 — Accommodation card: deep link to Hotels.com + Booking.com
FR-034: Epic 4 — Filter displayed POIs by category on map
FR-035: Epic 5 — Trigger async density analysis on adventure
FR-036: Epic 4 — OSM attribution always visible on map
FR-040: Epic 7 — Activate Live mode with explicit geolocation consent
FR-041: Epic 7 — Detect real-time GPS position in Live mode
FR-042: Epic 7 — Slider sets target distance ahead (e.g. 30 km) — POIs shown around that projected point on trace
FR-043: Epic 7 — Configurable search radius around target point (0–5 km, max 10 km)
FR-044: Epic 7 — Auto-update results as GPS position evolves (new currentKm)
FR-045: Epic 7 — Show partial POIs with status message on unstable connection
FR-050: Epic 6 — Enter departure time and speed in Planning mode
FR-051: Epic 6 — Show pace-adjusted weather forecast at each km marker
FR-052: Epic 6 — Live mode weather based on GPS position and speed
FR-053: Epic 6 — Weather data from WeatherAPI.com (temp, wind, rain, icon)
FR-054: Epic 6 — Auto-refresh weather forecasts every hour
FR-055: Epic 6 — Fallback: show current-time weather if no speed entered
FR-060: Epic 4 — Booking deep links to Hotels.com and Booking.com
FR-061: Epic 4 — Affiliate links visually identified in UI (transparency)
FR-062: Epic 15 — Track booking link clicks for analytics (enriched, replaces basic Epic 4 implementation)
FR-063: Epic 4 — "Powered by Strava" attribution when Strava data is shown
FR-070: Epic 8 — PWA install via native mechanism (Add to Home Screen)
FR-071: Epic 8 — Last loaded GPX trace + POIs readable offline
FR-072: Epic 8 — Push notification (opt-in) when density analysis completes
FR-073: Epic 8 — Network-required features disabled offline with explicit message
FR-080: Epic 4 — POI card shows D+ from fromKm to POI position (Planning mode)
FR-081: Epic 4 — POI card shows ETA from fromKm to POI based on entered speed (Planning mode)
FR-082: Epic 7 — Live mode POI list shows D+ and ETA from current GPS position to POI

## Epic List

### Epic 1: Foundation & Developer Environment
Établir le monorepo Turborepo, les packages partagés, la base de données PostgreSQL (Aiven), et le pipeline CI/CD. Aucune feature utilisateur directe — mais tout le reste en dépend.
**FRs couverts :** Aucun FR direct (Architecture requirements)
**NFRs couverts :** NFR-010, NFR-014, NFR-015, NFR-020

### Epic 2: User Authentication & Account Management
Un utilisateur peut créer un compte (email ou Google OAuth), connecter Strava, maintenir sa session, réinitialiser son mot de passe et supprimer son compte avec effacement complet de ses données (RGPD).
**FRs couverts :** FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007
**NFRs couverts :** NFR-011, NFR-016

### Epic 3: Adventures & GPX Management
Un utilisateur peut créer une aventure multi-segments GPX, réordonner les segments par drag-and-drop, importer depuis Strava, renommer, supprimer, et être notifié par polling TanStack Query quand le parsing asynchrone est terminé.
**FRs couverts :** FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019
**NFRs couverts :** NFR-005, NFR-033

### Epic 4: Interactive Map & POI Planning Mode
Un utilisateur peut visualiser sa trace GPX sur une carte MapLibre (dark/light), définir une plage kilométrique, déclencher une recherche corridor PostGIS, consulter les fiches POI avec leur distance, D+ et temps estimé depuis la trace, et cliquer vers Hotels.com / Booking.com.
**FRs couverts :** FR-020, FR-021, FR-023, FR-024, FR-025, FR-026, FR-036, FR-030, FR-031, FR-032, FR-033, FR-034, FR-060, FR-061, FR-062, FR-063, FR-080, FR-081
**NFRs couverts :** NFR-006, NFR-021, NFR-040, NFR-041, NFR-044, NFR-045

### Epic 5: Density Analysis & Visual Intelligence
Un utilisateur peut déclencher une analyse de densité asynchrone (BullMQ) et voir sa trace colorisée par tronçon (vert/orange/rouge) pour identifier immédiatement les zones critiques sans hébergements.
**FRs couverts :** FR-022, FR-027, FR-035
**NFRs couverts :** NFR-022, NFR-023

### Epic 6: Weather Integration
Un utilisateur peut consulter les prévisions météo calées sur son heure de passage estimée à chaque point kilométrique de la trace (pace-adjusted), en mode Planification (heure départ + allure) et en mode Live.
**FRs couverts :** FR-050, FR-051, FR-052, FR-053, FR-054, FR-055
**NFRs couverts :** NFR-042

### Epic 7: Live / Adventure Mode
Un utilisateur en mobilité peut activer le mode Live (consentement géolocalisation RGPD), saisir son allure, et voir en temps réel les POIs sur les prochains X km avec leur D+ et temps estimé — mise à jour automatique et gestion gracieuse des connexions instables.
**FRs couverts :** FR-040, FR-041, FR-042, FR-043, FR-044, FR-045, FR-082
**NFRs couverts :** NFR-007, NFR-012, NFR-013, NFR-032

### Epic 8: PWA & Offline Capability
Un utilisateur peut installer l'app sur son écran d'accueil, consulter sa dernière trace + POIs en mode offline partiel, et recevoir une notification push (opt-in) quand une analyse de densité est terminée.
**FRs couverts :** FR-070, FR-071, FR-072, FR-073
**NFRs couverts :** NFR-001, NFR-002, NFR-003, NFR-004, NFR-008

### Epic 14: VPS Hostinger Migration & Local Docker Environment
Migration du stack multi-plateforme (Vercel + Fly.io + Aiven + Upstash) vers un VPS Hostinger unique. Approche hybride : Docker pour infra (PostgreSQL+PostGIS, Redis, Caddy, Uptime Kuma), Node.js natif pour apps (Next.js, NestJS) via `turbo build` + `pm2`. Inclut l'environnement local unifié, backups PostgreSQL, CI/CD GitHub Actions via SSH.
**FRs couverts :** Aucun FR direct (Infrastructure)
**NFRs couverts :** NFR-010, NFR-014, NFR-015, NFR-020

---

## Epic 1: Foundation & Developer Environment

Infrastructure monorepo, packages partagés, CI/CD — aucune feature utilisateur directe mais tout en dépend.

### Story 1.1: Monorepo Setup & Developer Environment

As a **developer**,
I want the monorepo initialized with Turborepo, apps/web (Next.js 15), apps/api (NestJS 11), and shared packages scaffolded,
So that all development can happen in a unified environment with a single `turbo dev` command.

**Acceptance Criteria:**

**Given** the repo is cloned and `pnpm install` runs from the root,
**When** installation completes,
**Then** all workspace packages resolve via `workspace:*` protocol without errors.

**Given** `turbo dev` is run,
**When** both apps start,
**Then** apps/web is accessible on localhost:3000 and apps/api on localhost:3001 without errors.

**Given** packages/typescript-config exists with strict mode enabled,
**When** any app extends it in its tsconfig.json,
**Then** TypeScript strict checks are enforced across all workspaces.

**Given** packages/eslint-config is configured,
**When** `turbo lint` runs,
**Then** ESLint passes with zero errors across all apps and packages.

---

### Story 1.2: Database Schema & Aiven Configuration

As a **developer**,
I want Drizzle ORM schemas defined in packages/database and migrations applied to Aiven PostgreSQL,
So that the database schema is the single source of truth shared across both apps.

**Acceptance Criteria:**

**Given** packages/database is set up with Drizzle schemas (including Better Auth tables),
**When** `pnpm db:migrate` runs,
**Then** tables `profiles`, `adventures`, `adventure_segments`, `accommodations_cache`, `weather_cache`, `coverage_gaps` (+ Better Auth tables `user`, `session`, `account`, `verification`) are created in Aiven without errors.

**Given** PostGIS is enabled in Aiven PostgreSQL,
**When** adventure_segments is created,
**Then** the `geom` column accepts LINESTRING geometries (ST_Buffer, ST_DWithin queries pass).

**Given** packages/database exports inferred types,
**When** apps/api imports `Adventure` from `@ridenrest/database`,
**Then** TypeScript compiles without `any` types — all column types are correctly inferred.

**Given** Upstash Redis credentials are configured in apps/api/.env,
**When** the Redis provider starts,
**Then** a test ping returns PONG without errors.

---

### Story 1.3: Shared Business Logic Packages

As a **developer**,
I want packages/gpx (Haversine, RDP, corridor) and packages/shared (types, Zod schemas, constants) ready,
So that GPX computation and shared types are available to both apps without duplication.

**Acceptance Criteria:**

**Given** packages/gpx is set up,
**When** `haversine(pointA, pointB)` is called with two lat/lng objects,
**Then** it returns the correct distance in km (±0.1% of expected value).

**Given** packages/gpx is set up,
**When** `rdpSimplify(points, 0.0001)` is called on a 50k-point array,
**Then** it returns ≤ 2000 points preserving the overall shape.

**Given** packages/shared exports an `Adventure` type and Zod schemas,
**When** both apps/web and apps/api import from `@ridenrest/shared`,
**Then** TypeScript compiles without errors and Zod validation works correctly.

**Given** packages/shared/constants exports `MAX_GPX_POINTS` and `CORRIDOR_WIDTH_M`,
**When** either app imports these constants,
**Then** they are correctly typed as `number` and hold the expected values.

---

### Story 1.4: NestJS API Foundation

As a **developer**,
I want the NestJS API configured with the common module (JwtAuthGuard, ResponseInterceptor, HttpExceptionFilter, ValidationPipe), BullMQ, and Swagger,
So that all future feature modules follow consistent, enforced patterns from day one.

**Acceptance Criteria:**

**Given** the API is running,
**When** any controller returns raw data (e.g., `return adventure`),
**Then** ResponseInterceptor wraps it as `{ "data": { ... } }` automatically.

**Given** a request reaches a protected endpoint without a valid Bearer token,
**When** JwtAuthGuard evaluates the request,
**Then** it returns HTTP 401 with `{ "error": { "code": "UNAUTHORIZED", "message": "..." } }`.

**Given** a service throws `NotFoundException`,
**When** HttpExceptionFilter catches it,
**Then** the response is `{ "error": { "code": "NOT_FOUND", "message": "..." } }` with HTTP 404.

**Given** `@nestjs/bullmq` is configured with Upstash Redis,
**When** a job is enqueued in the `gpx-processing` queue,
**Then** it is persisted and a BullMQ processor can consume it.

**Given** Swagger is configured with `@nestjs/swagger`,
**When** `GET /api` is visited,
**Then** the OpenAPI documentation page loads listing all available endpoints.

**Given** the NestJS API is deployed on Fly.io,
**When** the `fly.toml` is configured,
**Then** the VM uses `memory = '512mb'`, `cpu_kind = 'shared'`, `cpus = 1` — the free tier 256MB MUST NOT be used (OOM risk with NestJS + BullMQ at ~230MB idle).

**Given** Upstash Redis is connected,
**When** daily command usage reaches 7500 cmds/day (75% of 10k quota),
**Then** an email alert is triggered via Upstash dashboard configuration — the team is notified before quota exhaustion.

---

### Story 1.5: Next.js Web Foundation

As a **developer**,
I want the Next.js app configured with Better Auth, TanStack Query, Zustand stores, and shadcn/ui,
So that all future feature pages can follow consistent patterns from day one.

**Acceptance Criteria:**

**Given** the web app is running,
**When** a visitor requests the landing page (`/`),
**Then** the `(marketing)/` route group renders a static HTML page (SSG) without auth requirement.

**Given** Better Auth middleware is configured in `middleware.ts`,
**When** an unauthenticated user attempts to access an `(app)/` route,
**Then** they are redirected to the login page.

**Given** TanStack Query QueryClientProvider wraps the `(app)/` layout,
**When** a `useQuery` hook is used in any child component,
**Then** it correctly fetches, caches, and returns data without additional setup.

**Given** Zustand stores are set up (useMapStore, useLiveStore, useUIStore),
**When** `useMapStore.getState().setActiveLayer('accommodations')` is called,
**Then** the store state updates and subscribed components re-render.

**Given** shadcn/ui components are copied into `src/components/ui/` and Tailwind CSS v4 is configured,
**When** a `<Button>` component renders in dark mode,
**Then** it applies the correct dark theme classes without manual style overrides.

---

### Story 1.6: CI/CD Pipeline

As a **developer**,
I want GitHub Actions configured to lint, build, and deploy both apps automatically,
So that every push to main is validated and deployed without manual steps.

**Acceptance Criteria:**

**Given** a commit is pushed to the `main` branch,
**When** the CI pipeline triggers,
**Then** `turbo lint` and `turbo build` complete successfully using Turborepo's build cache.

**Given** the build succeeds,
**When** Vercel receives the Next.js build output,
**Then** the web app is deployed and the landing page returns HTTP 200.

**Given** the build succeeds,
**When** Fly.io receives the NestJS Docker build,
**Then** the API is deployed and `GET /health` returns HTTP 200.

**Given** secrets are stored as GitHub Secrets (AIVEN_DATABASE_URL, BETTER_AUTH_SECRET, UPSTASH_REDIS_URL, etc.),
**When** the pipeline runs,
**Then** no secret values appear in pipeline logs.

---

## Epic 2: User Authentication & Account Management

Un utilisateur peut créer un compte, se connecter (email, Google OAuth, Strava OAuth), maintenir sa session, et supprimer son compte avec effacement complet (RGPD).

### Story 2.1: Email/Password Registration & Login

As a **new user**,
I want to create an account with my email and password and stay logged in between visits,
So that I can access my adventures on any device without re-authenticating each time.

**Acceptance Criteria:**

**Given** a user submits a valid email and password on the registration form,
**When** the Better Auth registration call completes,
**Then** the account is created, a session is established, and the user is redirected to `(app)/adventures`.

**Given** a user submits an email that is already registered,
**When** registration is attempted,
**Then** an error message "Un compte existe déjà avec cet email" is displayed without clearing the form.

**Given** a registered user submits correct credentials on the login form,
**When** authentication succeeds,
**Then** a persistent session is stored (via Better Auth session cookie) and the user is redirected to `(app)/adventures`.

**Given** a logged-in user closes and reopens the browser,
**When** they navigate to the app,
**Then** they remain authenticated without being prompted to log in again (FR-006).

**Given** a user submits incorrect credentials,
**When** the login attempt fails,
**Then** an error "Email ou mot de passe incorrect" is displayed and no session is created.

---

### Story 2.2: Google OAuth Sign-In

As a **user**,
I want to sign in with my Google account in one click,
So that I can access the app without creating a separate password.

**Acceptance Criteria:**

**Given** a user clicks "Continuer avec Google" on the login/register page,
**When** they complete the Google OAuth flow,
**Then** they are redirected back to the app with a valid session and land on `(app)/adventures`.

**Given** a user signs in with Google for the first time,
**When** the OAuth callback completes,
**Then** a `profiles` record is created with their Google display name and email.

**Given** a user who previously registered with email signs in with Google using the same email,
**When** the OAuth flow completes,
**Then** their existing account is linked and they access the same data (no duplicate account).

**Given** a user cancels the Google OAuth popup,
**When** they return to the app,
**Then** they remain on the login page with no error state and no session is created.

---

### Story 2.3: Strava OAuth Connection

As a **cyclist user**,
I want to connect my Strava account,
So that I can import my Strava activities as GPX segments in my adventures.

**Acceptance Criteria:**

**Given** a logged-in user visits Settings and clicks "Connecter Strava",
**When** they complete the Strava OAuth flow,
**Then** their Strava access token is stored securely server-side and the Settings page shows "Strava connecté".

**Given** a user has Strava connected,
**When** they click "Déconnecter Strava" in Settings,
**Then** the stored Strava tokens are deleted and the UI shows "Strava non connecté".

**Given** a user without Strava connected attempts to access the Strava import feature,
**When** they reach the import flow,
**Then** they are prompted to connect Strava first with a direct link to the OAuth flow.

**Given** the Strava OAuth callback is received,
**When** it is processed by the API auth callback route,
**Then** the `profiles` record is updated with `strava_connected: true` and the token is stored securely.

---

### Story 2.4: Password Reset & Account Management

As a **user**,
I want to reset my password by email, sign out, and delete my account if needed,
So that I have full control over my credentials and data (RGPD compliance).

**Acceptance Criteria:**

**Given** a user clicks "Mot de passe oublié" and submits their email,
**When** the request is sent to Better Auth,
**Then** a password reset email is sent via **Resend** (`noreply@ridenrest.app`) et une confirmation est affichée (FR-007).

**Given** a user clicks the reset link in the email,
**When** they submit a new valid password,
**Then** their password is updated and they are redirected to the login page with a success message.

**Given** a logged-in user clicks "Se déconnecter",
**When** the sign-out action completes,
**Then** the session is cleared, all cookies removed, and the user is redirected to the landing page (FR-004).

**Given** a user clicks "Supprimer mon compte" in Settings and confirms,
**When** the deletion request is processed,
**Then** all their data is deleted in cascade (adventures, segments, accommodations_cache, profiles) and they are redirected to the landing page (FR-005).

**Given** a user attempts to delete their account,
**When** the confirmation dialog is shown,
**Then** they must type their email to confirm — the delete button remains disabled until the email matches.

---

## Epic 3: Adventures & GPX Management

Un utilisateur peut créer une aventure multi-segments GPX, réordonner, importer depuis Strava, et être notifié quand le parsing async est terminé.

### Story 3.1: Create Adventure & Upload First GPX Segment

As a **cyclist user**,
I want to create a named adventure and upload a GPX file as my first segment,
So that my route appears in the app and I can start planning around it.

**Acceptance Criteria:**

**Given** a logged-in user submits a name on the "Nouvelle aventure" form,
**When** the creation request completes,
**Then** an adventure record is created in DB, the user is redirected to the adventure detail page, and the adventure appears in their list (FR-010).

**Given** a user uploads a valid GPX file on the adventure detail page,
**When** the file is received by `POST /segments` (multipart) and saved on Fly.io volume (`/data/gpx/{segmentId}.gpx`),
**Then** a segment record is created with `parse_status: 'pending'` et un job `parse-segment` BullMQ est enqueued avec `{ segmentId, filePath }` (FR-011).

**Given** the BullMQ processor parses the GPX file successfully (≤ 50 000 points, < 10s),
**When** parsing completes,
**Then** the segment's `geom` (LINESTRING), `waypoints` (JSONB), `distance_km`, and `parse_status: 'success'` are saved — and the original GPX file remains on Fly.io volume (NFR-005, NFR-033).

**Given** the GPX file is malformed or unparseable,
**When** the processor fails,
**Then** `parse_status: 'error'` and an `error_message` are saved — the adventure record and any previous valid segments are untouched (NFR-033).

**Given** the GPX file contains `<ele>` elevation tags on trackpoints,
**When** the processor parses the file,
**Then** each waypoint in the `waypoints` JSONB is stored as `{ dist_km, lat, lng, ele }` — enabling D+ computation on any sub-segment without re-parsing.

**Given** the GPX file has no `<ele>` tags,
**When** the processor completes,
**Then** waypoints are stored without `ele` field and D+ displays as "N/A" in the POI cards — no error thrown.

**Given** a user uploads a GPX file larger than the accepted limit (50 MB),
**When** the upload is attempted,
**Then** an error "Fichier trop volumineux (max 50 MB)" is displayed before upload starts.

---

### Story 3.2: Parse Status Polling & Notification

As a **cyclist user**,
I want to be notified when my GPX segment finishes parsing,
So that I know when the map and distance calculations are ready without refreshing the page.

**Acceptance Criteria:**

**Given** a segment is in `parse_status: 'pending'` and the user is on the adventure detail page,
**When** TanStack Query polls every 3s (`refetchInterval: 3000` activé si au moins un segment est `'pending'`),
**Then** dès que le BullMQ processor met `parse_status: 'success'` en DB, la prochaine requête de polling retourne le statut mis à jour — sans rechargement de page (FR-019).

**Given** TanStack Query polls and detects `parse_status: 'success'`,
**When** the updated data arrives,
**Then** the segment card updates from a loading skeleton to show distance_km and an "Afficher sur la carte" button — without page reload.

**Given** TanStack Query polls and detects `parse_status: 'error'`,
**When** the updated data arrives,
**Then** the segment card shows an error state with message "Parsing échoué — vérifiez le format du fichier GPX" and a retry upload button.

**Given** all segments have `parse_status` of `'success'` or `'error'` (none are `'pending'`),
**When** TanStack Query receives the updated data,
**Then** `refetchInterval` returns `false` — le polling s'arrête, aucune requête supplémentaire n'est émise.

**Given** the user navigates away during parsing and returns later,
**When** the adventure detail page loads,
**Then** the current `parse_status` from DB is correctly reflected (no infinite loading state).

---

### Story 3.3: Multi-Segment Management (Reorder, Delete, Replace)

As a **cyclist user**,
I want to reorder, delete, and replace GPX segments in my adventure,
So that I can adjust my route incrementally as my plans evolve.

**Acceptance Criteria:**

**Given** an adventure has multiple segments and a user drags a segment to a new position,
**When** the reorder mutation completes,
**Then** `order_index` values are updated for all affected segments, `cumulative_start_km` is recomputed for the full adventure, and the new order is reflected in the UI (FR-012, FR-015).

**Given** a user clicks "Supprimer" on a segment and confirms,
**When** the delete request completes,
**Then** the segment record and its associated GPX file on Fly.io volume are deleted, cumulative distances are recomputed, and the segment disappears from the list (FR-013, FR-015).

**Given** a user clicks "Remplacer" on a segment and uploads a new GPX file,
**When** the new file is uploaded,
**Then** the old GPX file is deleted from Fly.io volume, the new segment job is enqueued with `parse_status: 'pending'`, and the UI shows a loading state for that segment (FR-014).

**Given** a user deletes the last segment of an adventure,
**When** deletion completes,
**Then** the adventure record remains (total_distance_km: 0) and an "Ajouter un segment" prompt is shown.

**Given** the reorder operation encounters a network error,
**When** the mutation fails,
**Then** the optimistic UI update is rolled back and the original order is restored with an error toast.

---

### Story 3.4: Adventure & Segment Rename and Delete

As a **cyclist user**,
I want to rename my adventure and individual segments, and delete an entire adventure,
So that I can keep my adventures organized and remove ones I no longer need.

**Acceptance Criteria:**

**Given** a user taps the adventure title and submits a new name,
**When** the update request completes,
**Then** the adventure name is updated in DB and reflected in the UI immediately (FR-017).

**Given** a user taps a segment name and submits a new name,
**When** the update request completes,
**Then** the segment name is updated in DB and reflected in the segment card (FR-017).

**Given** a user clicks "Supprimer l'aventure" and confirms by typing the adventure name,
**When** the deletion request completes,
**Then** the adventure, all its segments, associated GPX files on Fly.io volume, and cached POI/weather data are deleted — the user is redirected to the adventures list (FR-018).

**Given** a user attempts to delete an adventure without confirming,
**When** the delete button is clicked,
**Then** the confirmation dialog appears requiring the adventure name to be typed before proceeding.

---

### Story 3.5: Strava Activity Import as Segment

As a **cyclist user with Strava connected**,
I want to import a Strava activity directly as a GPX segment,
So that I can use my existing Strava routes without manually exporting and re-uploading GPX files.

**Acceptance Criteria:**

**Given** a user with Strava connected clicks "Importer depuis Strava",
**When** the Strava activities list loads,
**Then** their recent activities are listed (name, date, distance) — fetched via Strava API and cached for 1h to respect rate limits (NFR-041).

**Given** a user selects a Strava activity to import,
**When** the API fetches the activity's GPX stream from Strava,
**Then** the GPX data is converted to a file, saved on Fly.io volume (`/data/gpx/{segmentId}.gpx`) via `POST /segments` multipart, and a `parse-segment` BullMQ job is enqueued — the Strava activity data is not persisted beyond this import (NFR-043).

**Given** the import and parsing succeed,
**When** the segment is ready,
**Then** the segment card shows the Strava activity name and distance, and a "Powered by Strava" attribution is visible (FR-063).

**Given** the Strava API rate limit is near (80% of 100 req/15 min),
**When** the next import is requested,
**Then** a throttle guard delays the request and logs a warning — no 429 error is returned to the user (NFR-041).

**Given** the Strava daily limit is near (800 of 1000 req/day, 80%),
**When** an import is attempted,
**Then** the API returns HTTP 429 with a user-friendly message ("Limite Strava atteinte pour aujourd'hui, réessaie demain") and logs a warning.

**Given** a user without Strava connected attempts to access this feature,
**When** they click "Importer depuis Strava",
**Then** they are redirected to the Strava OAuth flow (Story 2.3).

---

## Epic 4: Interactive Map & POI Planning Mode

Visualiser la trace GPX sur une carte, rechercher des POIs par corridor kilométrique, consulter les fiches POI et cliquer vers les plateformes de réservation.

### Story 4.1: GPX Trace Display on Interactive Map

As a **cyclist user**,
I want to see my adventure's GPX trace on an interactive map,
So that I have a visual overview of my entire route before starting to plan POIs.

**Acceptance Criteria:**

**Given** a user navigates to `(app)/map/[adventureId]`,
**When** the page loads,
**Then** the MapLibre GL JS map renders with the adventure's trace as a polyline, centered and fitted to the trace bounds — in under 3s on mobile 4G (FR-020, FR-026, NFR-006).

**Given** the map is rendered,
**When** it is visible,
**Then** the OSM attribution "© OpenStreetMap contributors" is always visible in the map corner — non-dismissable (FR-036, NFR-044).

**Given** a user taps the dark/light toggle,
**When** the theme switches,
**Then** the MapLibre style updates to the corresponding OpenFreeMap tile set without reloading the page (FR-021).

**Given** an adventure has multiple segments,
**When** the map loads,
**Then** all segments are rendered as a continuous trace with a visual distinction at segment joins.

**Given** a segment has `parse_status: 'pending'` or `'error'`,
**When** the map page loads,
**Then** only successfully parsed segments are displayed — a banner indicates "X segment(s) en cours de traitement".

---

### Story 4.2: POI Layer Toggles & Pin Display

As a **cyclist user**,
I want to toggle POI categories on and off on the map,
So that I can focus on the type of amenity I'm looking for without visual clutter.

**Acceptance Criteria:**

**Given** the map is displayed,
**When** a user taps a category toggle (🏨 Hébergements / 🍽️ Restauration / 🛒 Alimentation / 🚲 Vélo),
**Then** the corresponding POI pins appear on or disappear from the map within the current viewport (FR-023).

**Given** a category is toggled on and POIs exist in the viewport,
**When** the pins render,
**Then** each pin displays the correct category icon and is tappable with a minimum touch target of 48×48px (FR-024).

**Given** multiple categories are toggled on simultaneously,
**When** pins overlap at the current zoom level,
**Then** a cluster indicator shows the count — tapping it zooms in to separate the pins.

**Given** no POIs have been loaded yet for a toggled-on category,
**When** the toggle is activated,
**Then** a `<Skeleton />` loading state appears in the POI panel while the corridor search is triggered.

---

### Story 4.3: Corridor Search — POI Discovery by km Range

As a **cyclist user**,
I want to define a km range along my route and find all POIs within a corridor around that segment,
So that I can discover accommodations and amenities specifically relevant to that stretch of my adventure.

**Acceptance Criteria:**

**Given** a user adjusts the km range slider (fromKm → toKm) on the map,
**When** they release the slider,
**Then** the selected segment of the trace is highlighted on the map and a `GET /pois?segmentId=&fromKm=&toKm=` request is triggered (FR-030).

**Given** the user attempts to set a range exceeding 30 km (toKm - fromKm > 30),
**When** the slider is adjusted,
**Then** the range is capped at 30 km maximum — the UI shows a tooltip "Plage maximale : 30 km" and the toKm is auto-adjusted to `fromKm + 30` (FR-030).

**Given** the API receives the request,
**When** processing the corridor search,
**Then** PostGIS `ST_Buffer` generates a corridor polygon and `ST_DWithin` queries `accommodations_cache` — returning POIs within the corridor (FR-031).

**Given** the Overpass API is called to populate `accommodations_cache` for the corridor,
**When** results are returned,
**Then** they are cached in Upstash Redis with TTL 24h — identical corridor requests within 24h serve from cache without calling Overpass again (NFR-021, NFR-040).

**Given** the corridor search returns results,
**When** results render,
**Then** POI pins appear on the map within the highlighted corridor and a scrollable list shows the POIs sorted by distance from trace (FR-031).

**Given** Overpass API is unavailable,
**When** the corridor search is attempted,
**Then** a `<StatusBanner message="Recherche indisponible — réessayer dans quelques instants" />` is shown and the user can retry — no crash (NFR-031).

---

### Story 4.4: POI Detail Sheet & Booking Deep Links

As a **cyclist user**,
I want to tap a POI pin and see its details with a direct booking link,
So that I can evaluate an accommodation and open it in Hotels.com or Booking.com in one tap.

**Acceptance Criteria:**

**Given** a user taps a POI pin on the map,
**When** the detail sheet opens,
**Then** it displays: name, type, distance from trace (m), kilométrage on the trace, D+ from fromKm to POI (m), estimated time from fromKm to POI, and OSM tags (phone, website if available) (FR-032, FR-080, FR-081).

**Given** the POI is an accommodation (hotel, hostel, camping, refuge),
**When** the detail sheet renders,
**Then** it shows a "Rechercher sur Hotels.com" button and a "Rechercher sur Booking.com" button — both are deep-link URLs parameterized with the POI name and coordinates (FR-033, FR-060).

**Given** a user taps a booking deep link,
**When** the link is opened,
**Then** it opens in a new browser tab with the correct search pre-filled — and the click is tracked for analytics (FR-062).

**Given** the affiliate links are displayed,
**When** they render in the UI,
**Then** a small label "Lien partenaire" is visible next to each booking button (FR-061, NFR-045).

**Given** a user taps the booking link,
**When** the URL is constructed,
**Then** the affiliate URL format is not modified — query params match the program requirements exactly (NFR-045).

**Given** the POI card renders with elevation data available,
**When** the D+ and ETA are computed,
**Then** D+ is calculated via `computeElevationGain(waypoints, fromKm, poi.km_on_trace)` from packages/gpx, and ETA uses `(poi.km_on_trace - fromKm) / speed * 60` (minutes) — displayed as "↑ 320 m · ~42 min" (FR-080, FR-081).

**Given** the user has not entered a speed,
**When** the ETA renders,
**Then** it is computed with a fallback of 15 km/h and displayed with an italicized "~" prefix to signal estimation.

---

### Story 4.5: POI Category Filter on Map

As a **cyclist user**,
I want to filter the displayed POIs by category directly from the map view,
So that I can switch focus between accommodations, food, supplies, and bike shops without re-running a search.

**Acceptance Criteria:**

**Given** POIs from multiple categories are loaded in the corridor,
**When** a user taps a category filter chip on the map overlay,
**Then** only POIs of the selected category are shown — other category pins are hidden instantly without an API call (FR-034).

**Given** a user selects "Hébergements only" filter,
**When** the filter applies,
**Then** the POI list panel scrolls to top and shows only accommodation POIs, sorted by distance from trace.

**Given** a user removes all category filters,
**When** no filter is active,
**Then** all loaded POI categories are visible simultaneously on the map.

**Given** a user switches between filter states rapidly,
**When** filters change,
**Then** the map updates are debounced (100ms) to avoid rendering flicker.

---

## Epic 5: Density Analysis & Visual Intelligence

Un utilisateur peut déclencher une analyse de densité asynchrone et voir sa trace colorisée (vert/orange/rouge) pour identifier immédiatement les zones critiques.

### Story 5.1: Trigger Density Analysis & Async Job Processing

As a **cyclist user**,
I want to trigger a density analysis on my adventure,
So that the system computes accommodation availability along my entire route without blocking my session.

**Acceptance Criteria:**

**Given** a user clicks "Analyser la densité" on the adventure detail or map page,
**When** the request is sent to the API,
**Then** an `analyze-density` BullMQ job is enqueued with `{ adventureId, segmentIds[] }` and the button changes to "Analyse en cours…" (FR-035, NFR-022).

**Given** the density job is processing,
**When** the user navigates away or closes the tab,
**Then** the job continues processing server-side — the result will be available when they return.

**Given** the `analyze-density` processor runs,
**When** it processes each segment,
**Then** it queries Overpass API per corridor segment (not the full trace at once), caches results in Redis (TTL 24h), and computes a density score (green/orange/red) per 10km tronçon (NFR-040).

**Given** the density job completes for all segments,
**When** results are saved to `coverage_gaps`,
**Then** `density_status: 'success'` est mis à jour sur l'adventure en DB — TanStack Query polling (refetchInterval 3s sur `density_status`) le détecte côté client.

**Given** the density job fails (e.g., Overpass unavailable),
**When** the processor catches the error,
**Then** BullMQ retries up to 3 times with exponential backoff — after 3 failures, `density_status: 'error'` est mis en DB and the adventure remains usable without density data.

---

### Story 5.2: Colorized Trace & Density Legend

As a **cyclist user**,
I want to see my trace colorized by accommodation density after analysis completes,
So that I can immediately identify critical zones (red) and plan around them without further interaction.

**Acceptance Criteria:**

**Given** TanStack Query polling détecte `density_status: 'success'` sur l'adventure,
**When** the map is open,
**Then** the trace re-renders with color segments: green (≥2 accommodations/10km), orange (1), red (0) — without page reload (FR-022).

**Given** the user is not on the map page when the event arrives,
**When** they navigate to the map,
**Then** the colorized trace loads from `coverage_gaps` in DB — the Realtime event is not required to see the colors.

**Given** the colorized trace is displayed,
**When** a user taps the legend icon on the map,
**Then** a panel opens showing: 🟢 Bonne disponibilité / 🟠 Disponibilité limitée / 🔴 Zone critique — with the color-to-density mapping explained (FR-027).

**Given** the colorized trace is displayed,
**When** a user taps a red tronçon on the map,
**Then** the km range slider auto-sets to that tronçon's fromKm/toKm and a corridor search is triggered automatically.

**Given** a user's device has a color accessibility constraint (e.g., daltonism),
**When** the density legend opens,
**Then** it includes a textual severity label alongside each color: "Critique (0 hébergement)", "Limité (1)", "Bon (2+)".

---

## Epic 6: Weather Integration

Un utilisateur peut consulter les prévisions météo calées sur son heure de passage estimée à chaque point kilométrique (pace-adjusted), en mode Planification et Live.

### Story 6.1: Pace-Adjusted Weather Forecast (Planning Mode)

As a **cyclist user**,
I want to enter my departure time and estimated speed to see weather forecasts adjusted to when I'll actually be at each point on my route,
So that I know what conditions to expect at each km marker based on my real pace — not the current weather.

**Acceptance Criteria:**

**Given** a user opens the weather panel on the map page,
**When** they enter a departure time (time picker) and an estimated speed in km/h,
**Then** the API computes the estimated arrival time at each waypoint using `departure_time + (cumulative_km / speed)` and fetches the corresponding hourly forecast from WeatherAPI.com (FR-050, FR-051).

**Given** the API requests weather data for each km waypoint,
**When** WeatherAPI.com returns forecasts,
**Then** results are cached in Upstash Redis keyed by `{lat}:{lng}:{date}:{hour}` with TTL 1h — subsequent requests for the same waypoint/hour serve from cache (NFR-042).

**Given** weather data is returned for the route,
**When** the weather strip renders on the map,
**Then** it displays at regular km intervals: temperature (°C), wind speed (km/h), precipitation probability (%), and a weather icon — all corresponding to the estimated arrival time (FR-053).

**Given** a user changes their departure time or speed,
**When** they submit the new values,
**Then** the arrival time estimates are recomputed and the weather strip updates — cache hit rate is maintained (same waypoint data reused if the hour is the same).

**Given** the route exceeds WeatherAPI.com's forecast horizon (typically 14 days),
**When** waypoints beyond the horizon are requested,
**Then** those waypoints display "Prévisions non disponibles" — the visible waypoints still show correct data.

---

### Story 6.2: Weather Fallback & Auto-Refresh

As a **cyclist user**,
I want weather data to refresh automatically and fall back gracefully when no pace is configured,
So that the weather strip always shows the most relevant available data without manual intervention.

**Acceptance Criteria:**

**Given** a user has not entered a departure time or speed,
**When** the weather strip renders,
**Then** it displays the current-time forecast at each km waypoint — no empty state, no blocking error (FR-055).

**Given** weather data is currently cached,
**When** the cache TTL expires (1h),
**Then** the next request for that waypoint automatically fetches fresh data from WeatherAPI.com and updates the cache (FR-054).

**Given** the user has the map page open,
**When** 1 hour elapses since last weather fetch,
**Then** weather data auto-refreshes in the background via TanStack Query's `refetchInterval: 3600000` — a subtle loading indicator shows during the refresh without clearing existing data.

**Given** WeatherAPI.com is unavailable,
**When** the weather fetch fails,
**Then** the previously cached data remains displayed with a "Données météo mises à jour il y a Xh" label — no crash, no empty state.

**Given** monthly WeatherAPI.com usage reaches 80% of the 1M call quota,
**When** the monitoring check runs,
**Then** an internal alert is logged (console warning + DB log entry) — no user-facing impact (NFR-042).

---

### Story 6.3: Live Mode Weather (GPS-Based)

As a **cyclist user in Live mode**,
I want to see weather forecasts based on my current GPS position and pace,
So that I know what conditions are ahead of me right now on the road.

**Acceptance Criteria:**

**Given** a user has activated Live mode (GPS active) and entered their speed,
**When** the weather panel is opened in Live mode,
**Then** weather is fetched for waypoints ahead of the current GPS position, using pace-adjusted computation (FR-052).

**Given** the GPS position updates as the user moves,
**When** the position crosses a km waypoint threshold,
**Then** the weather strip shifts forward — past waypoints are dropped, upcoming waypoints are fetched if not already cached.

**Given** a user in Live mode has not entered a speed,
**When** the weather panel renders,
**Then** current-time weather at the nearest upcoming waypoints is displayed — the same fallback as Planning mode (FR-055).

**Given** GPS is unavailable in Live mode (signal lost),
**When** the weather panel is open,
**Then** the last known position is used for weather display with a "Position GPS indisponible" status indicator.

---

## Epic 7: Live / Adventure Mode

Un utilisateur en mobilité peut activer le mode Live (consentement RGPD), saisir son allure, et voir en temps réel les POIs sur les prochains X km, avec mise à jour automatique et gestion gracieuse des connexions instables.

### Story 7.1: Geolocation Consent & Live Mode Activation

As a **cyclist user on the road**,
I want to activate Live mode with an explicit consent step,
So that I understand what GPS data is used for before sharing my location — and the app complies with RGPD.

**Acceptance Criteria:**

**Given** a user navigates to `(app)/live/[adventureId]` for the first time,
**When** the page loads,
**Then** a `<GeolocationConsent />` modal appears explaining that GPS data is used locally only, never stored server-side — with "Activer" and "Annuler" buttons (FR-040, NFR-013).

**Given** the user taps "Activer",
**When** the browser permission prompt appears,
**Then** `navigator.geolocation.watchPosition({ enableHighAccuracy: true })` is called and the Live map view activates (FR-040, FR-041).

**Given** the user denies browser geolocation permission,
**When** the denial is detected,
**Then** a message "Géolocalisation refusée — activez-la dans les paramètres de votre navigateur" is shown and the Live mode remains inactive — no crash (NFR-032).

**Given** Live mode is active,
**When** the user navigates away from the Live page,
**Then** `watchPosition` is stopped immediately via `clearWatch()` — no background GPS tracking continues (NFR-012).

**Given** a returning user who previously granted permission visits the Live page,
**When** the page loads,
**Then** the consent modal does not re-appear — Live mode activates directly with the stored consent flag.

---

### Story 7.2: Real-Time POI Discovery by Target Distance & Configurable Radius

As a **cyclist user in Live mode**,
I want to set a target distance ahead (e.g. "dans 30 km") and a search radius, so the app shows me accommodations available at that specific stopping point — not everything along the way,
So that I can quickly find where to sleep tonight without being overwhelmed by results spread over dozens of kilometres.

**Acceptance Criteria:**

**Given** Live mode is active and a GPS position is acquired,
**When** the user adjusts the "distance cible" slider (e.g. 30 km),
**Then** the app computes `targetKm = currentKm + 30`, projects that point on the trace, and a `GET /pois?segmentId=&targetKm=30&radius=3` request is triggered — GPS coordinates are NOT sent to the server (FR-042, NFR-012).

**Given** the API receives the request with `targetKm` and `radius`,
**When** processing the search,
**Then** it projects the point at `targetKm` on the trace LINESTRING, runs `ST_DWithin(geom, target_point, radius_m)` on `accommodations_cache` — returning only POIs within the radius around that specific point (FR-042, FR-043).

**Given** a user adjusts the "rayon" slider (0 to 5 km, hard cap 10 km),
**When** the value changes,
**Then** `useLiveStore.setRadius(value)` updates the Zustand store and a new POI search is triggered with the updated radius — limiting Overpass API surface area (FR-043).

**Given** the GPS position updates as the user moves,
**When** the new `currentKm` changes by ≥ 500m from the last trigger,
**Then** a new POI search fires automatically with the same slider values — `targetKm` recomputes as `newCurrentKm + distance_cible` (FR-044).

**Given** a POI search returns results,
**When** the response arrives,
**Then** results display within ≤ 2s, with a visible loading indicator during fetch — showing only POIs near the target point, not along the entire preceding corridor (NFR-007).

**Given** a user enters their speed (km/h) in the speed input field (shared with the weather panel, Story 6.3),
**When** the value is set,
**Then** `useLiveStore.setSpeed(value)` updates the Zustand store and all ETA calculations update immediately.

**Given** Live mode POI results are displayed,
**When** the POI list renders,
**Then** each item shows: name, distance from target point (m), D+ from `currentKm` to `targetKm`, and ETA at current speed — formatted as "↑ 420 m D+ · ~2h10" (FR-082).

**Given** the GPS position updates and `currentKm` changes,
**When** the POI list refreshes,
**Then** D+ and ETA values recalculate client-side from the updated `currentKm` using already-loaded waypoints JSONB — no additional API call needed.

---

### Story 7.3: Graceful Degradation on Unstable Connection

As a **cyclist user in Live mode on a poor mobile connection**,
I want partial results and clear status feedback when the network is degraded,
So that I can still find a place to stop even when the app can't load everything perfectly.

**Acceptance Criteria:**

**Given** a POI search request times out or returns a network error in Live mode,
**When** the error is caught by TanStack Query,
**Then** any POIs already loaded remain visible on the map — no results are cleared on error (FR-045, NFR-032).

**Given** a network error occurs during a Live mode POI search,
**When** the error state is active,
**Then** a `<StatusBanner message="Connexion instable. X hébergements trouvés." />` is displayed — the count reflects the last successful result (FR-045).

**Given** a POI search partially succeeds (some categories loaded, others failed),
**When** the partial response is received,
**Then** the successfully loaded POIs are displayed with a "Résultats partiels" indicator — the user can manually retry the failed categories.

**Given** the connection is restored after a network outage,
**When** TanStack Query detects connectivity,
**Then** a fresh POI search is automatically retried — the `<StatusBanner />` disappears on success.

**Given** the app is in Live mode and the device goes completely offline,
**When** offline state is detected,
**Then** the last GPS position is shown on the map and a "Mode hors ligne — données non disponibles" banner is displayed — no crash occurs (NFR-032).

---

## Epic 8: App Shell & Navigation

> **Ajouté 2026-03-18** — Suite aux décisions UX : implémentation du design system light mode vert sauge, navigation Planning/Live, et panneau filtres POI. Fondation visuelle et structurelle de l'application.

L'utilisateur dispose d'une application visuellement cohérente avec un design system défini, une navigation claire entre ses aventures et les deux modes (Planning/Live), et un panneau de filtres permettant de sélectionner les types de POI qu'il souhaite afficher sur la carte.

### Story 8.1: Design System Tokens

As a **developer building the Ride'n'Rest UI**,
I want a complete, consistent design token system configured in Tailwind and shadcn/ui,
So that every component in the app uses the same colors, typography, and spacing — eliminating visual inconsistencies.

**Acceptance Criteria:**

**Given** the Tailwind config and global CSS are updated,
**When** the app is rendered,
**Then** all CSS custom properties are defined: `--primary: #2D6A4A`, `--primary-hover: #245740`, `--primary-light: #EBF5EE`, `--background: #FFFFFF`, `--background-page: #F5F7F5`, `--surface: #F8FAF9`, `--surface-raised: #EFF5F1`, `--border: #D4E0DA`, `--text-primary: #1A2D22`, `--text-secondary: #4D6E5A`, `--text-muted: #8EA899`.

**Given** the density trace colors are defined,
**When** referenced in components,
**Then** `--density-high: #16a34a`, `--density-medium: #d97706`, `--density-low: #dc2626` are available as CSS vars — distinct from `--primary`.

**Given** the shadcn/ui theme is configured,
**When** shadcn components render,
**Then** `--primary`, `--primary-foreground: #FFFFFF`, `--muted`, `--muted-foreground`, `--card`, `--border`, `--ring` all map to the corresponding design tokens above.

**Given** the typography system is configured,
**When** text renders,
**Then** Geist Sans is the default font for all UI text; Geist Mono is used exclusively for numeric values (km, D+, ETA) — configured via `font-mono` Tailwind class.

**Given** the design tokens are applied,
**When** WCAG contrast is checked,
**Then** all text/background combinations meet AA minimum: `text-primary`/`background` ≥ 16:1, `text-secondary`/`background` ≥ 5.5:1, `primary`/`background` ≥ 5.4:1.

---

### Story 8.2: Adventures List Page

As a **cyclist user**,
I want a clean, well-structured list of my adventures with clear entry points to Planning and Live modes,
So that I can quickly find my adventure and choose the right mode for my current context.

**Acceptance Criteria:**

**Given** a user navigates to `/adventures`,
**When** the page renders,
**Then** the page background is `--background-page` (`#F5F7F5`) and adventure cards are white (`--surface`) with `rounded-xl border border-[--border]`.

**Given** an adventure is selected on mobile (< 1024px),
**When** the action buttons render,
**Then** a full-width primary button "🔴 Démarrer en Live" and a `⚙️` gear icon with dropdown are visible; the dropdown contains "Mode Planning" and "Voir les détails".

**Given** an adventure is selected on desktop (≥ 1024px),
**When** the action row renders,
**Then** three explicit buttons display: `[🔴 Live]` (primary), `[📋 Planning]` (secondary), `[✏️ Modifier]` (ghost).

**Given** the adventures list is empty,
**When** the page renders,
**Then** an empty state shows a bicycle icon, "Aucune aventure" title, and a primary CTA "Créer une aventure".

---

### Story 8.3: App Shell & Routing

As a **developer building the app navigation**,
I want a consistent app shell with proper routing between Planning and Live modes,
So that users always know where they are and how to get back.

**Acceptance Criteria:**

**Given** a user enters Planning mode on mobile (< 1024px),
**When** navigated to `/map/[id]`,
**Then** a non-blocking toast/banner appears: "Mode Planning optimisé pour desktop — certaines fonctionnalités sont réduites sur mobile" — the map still loads but the sidebar is hidden and replaced by the "FILTERS" bottom drawer pattern.

**Given** a user enters Planning mode on desktop (≥ 1024px),
**When** navigated to `/map/[id]`,
**Then** the map renders full-bleed (`100dvh`) with a "← Aventures" back button (top-left, `z-40`) and the sidebar visible.

**Given** the desktop Planning sidebar,
**When** rendered,
**Then** it is 360px wide with a `◀`/`▶` collapse toggle — collapsed state hides the sidebar and gives full width to the map; the sidebar contains: fromKm/toKm slider, layer toggles (Hébergements / Restauration / Vélo / Densité / Météo), accommodation sub-type chips, and (Epic 11) stages list.

**Given** a user enters Live mode at `/live/[id]`,
**When** it's their first access,
**Then** `GeolocationConsent` dialog appears; subsequent accesses skip it if consent was granted.

**Given** the user is in Live mode,
**When** the map renders,
**Then** only a "⏹ Quitter le live" button is visible for navigation — all other nav intentionally hidden.

**Given** a user clicks "Quitter le live",
**When** confirmed,
**Then** `clearWatch()` is called and the user is redirected to `/adventures`.

---

### Story 8.4: Filter Panel — POI Selector

As a **cyclist user**,
I want to filter which types of places are shown on my map and configure search parameters,
So that I can focus on what I need without visual clutter.

> **Décisions UX 2026-03-20 :**
> - Planning (desktop) : filtres dans le panneau latéral — pas de drawer séparé
> - Live (mobile) : bouton "FILTERS" ouvre un Vaul Drawer
> - Rayon = stepper (— / +) dans le drawer Live, pas un slider sur la carte
> - Post-MVP uniquement : dates, personnes, chambres, types de lits, options Booking

**Acceptance Criteria:**

**[Planning Mode — Panneau latéral desktop]**

**Given** the Planning sidebar is visible,
**When** the filter section renders,
**Then** it shows inline (no separate drawer): layer toggles (🏨 Hébergements, 🍽️ Restauration, 🛒 Alimentation, 🚲 Vélo, 🌤️ Météo, 📊 Densité) as toggle chips — multi-selection, active = `--primary` bg + white text.

**Given** 🏨 Hébergements is active in Planning sidebar,
**When** the accommodation sub-section renders,
**Then** sub-type chips appear for all Overpass + Google Places categories (Hôtel, Camping, Refuge, Hostel, Maison d'hôte…) — all active by default, individually toggleable.

**[Live Mode — Drawer Filtres]**

**Given** a user taps the "FILTERS" button in Live mode,
**When** the drawer opens,
**Then** it opens as a Vaul Drawer from bottom (`z-50`).

**Given** the Live filters drawer is open,
**When** rendered,
**Then** it shows: (1) Distance de la trace — stepper `— 5 km +` (0.5–30 km, default 5 km); (2) Calques — toggle chips: 🏨 Hébergements, 🍽️ Restauration, 🛒 Alimentation, 🚲 Vélo, 🌤️ Météo, 📊 Densité; (3) Sub-types hébergement (si 🏨 actif).

**Given** the "Appliquer les filtres" button is tapped (Live drawer),
**When** applied,
**Then** the map updates immediately; drawer closes; active filter count badge appears on the "FILTERS" button.

**Given** no POI type is selected,
**When** the user tries to apply,
**Then** a validation message appears and the apply button stays disabled.

**[Post-MVP — not in this story]**
> Dates arrivée/sortie, nombre de personnes, nombre de chambres, types de lits, options (annulation sans frais, logement avec cuisine) — à implémenter après MVP uniquement.

---

### Story 8.5: Density Layer Toggle

As a **cyclist user viewing the map**,
I want to toggle the density colorization on/off independently from other layers,
So that I can switch between a clean trace view and the density-colored view depending on my focus.

**Acceptance Criteria:**

**Given** the density analysis has been run on an adventure,
**When** the density layer toggle is active (default),
**Then** the GPX trace is rendered with the tricolor density colorization (green/orange/red per tronçon).

**Given** the user toggles density off,
**When** the toggle is inactive,
**Then** the trace renders in a neutral color (`--text-secondary` or `#94A3B8`) — uniform, no density colors.

**Given** the density toggle is in the Planning sidebar (desktop) or Live Filters drawer,
**When** rendered,
**Then** it appears as a chip `📊 Densité` consistent with other layer toggles.

---

### Story 8.6: Accommodation Type Display Filters

As a **cyclist user**,
I want to filter which accommodation sub-types are shown on the map,
So that I can hide shelter/refuge pins if I only care about hotels, for example.

**Acceptance Criteria:**

**Given** the 🏨 Hébergements layer is active,
**When** the sub-type filter section renders,
**Then** chips are displayed for all available categories from Overpass + Google Places: Hôtel, Camping, Refuge/Shelter, Hostel, Maison d'hôte, Gîte — all active by default.

**Given** the user deactivates a sub-type chip (e.g. Refuge),
**When** applied,
**Then** refuge/shelter pins disappear from the map immediately; other accommodation pins remain.

**Given** a sub-type has no results in the current corridor,
**When** the chip renders,
**Then** it is displayed greyed-out with a `(0)` count badge — still tappable to pre-select for future searches.

---

### Story 8.7: Density Analysis Category Selection

As a **cyclist user triggering a density analysis**,
I want to choose which accommodation categories are included in the analysis,
So that the density colorization reflects only the types I plan to use (e.g. no camping if I always sleep in hotels).

**Acceptance Criteria:**

**Given** a user triggers density analysis (from Epic 5 flow),
**When** the analysis is requested,
**Then** a pre-analysis modal appears with category chips: Hôtel, Camping, Refuge, Hostel, Maison d'hôte — all selected by default.

**Given** the user deselects one or more categories,
**When** they confirm and launch the analysis,
**Then** the density job runs with only the selected categories; the selection is stored in `adventure.density_categories` for reference.

**Given** the density analysis was run with a specific category selection,
**When** the map displays the colorized trace,
**Then** a small label near the density legend shows the active categories (e.g. "Hôtels + Campings").

---

### Story 8.8: Interactive Elevation Profile

As a **cyclist planning a multi-day route**,
I want an interactive elevation profile below the map,
So that I can visualize the terrain, understand cumulative D+, and identify where steep sections align with accommodation scarcity.

> **Note:** This story is a prerequisite for Epic 11 (Stage Planning) — stages are created by clicking on the elevation profile.

**Acceptance Criteria:**

**Given** a user is in Planning mode on desktop,
**When** the map view renders,
**Then** an elevation profile chart (Recharts or Victory) appears below the map or in the sidebar — height ~120px, displaying elevation (m) on Y-axis and distance (km) on X-axis.

**Given** the user hovers over the elevation profile,
**When** the cursor moves,
**Then** a vertical tooltip shows: elevation at that point, cumulative distance (km), cumulative D+ from start — and a crosshair marker appears on the corresponding position on the GPX trace on the map.

**Given** the adventure has multiple segments,
**When** the profile renders,
**Then** segment boundaries are marked with a vertical dashed line and segment name label.

**Given** the user is in Live mode,
**When** the bottom sheet is visible,
**Then** a compact elevation strip (height ~60px, no hover interaction) shows the elevation profile with: current GPS position marked (green dot), target search point marked (white dot).

**Given** the adventure has no elevation data in waypoints (missing `ele` values),
**When** the profile would render,
**Then** a graceful fallback message "Données d'élévation non disponibles pour cette trace" appears in the profile area — no crash.

---

### Story 8.9: App Header — Global Navigation Bar

As a **cyclist user navigating the app**,
I want a persistent header bar with the logo, the current adventure name, and quick links to my adventures and account settings,
So that I always know which adventure I'm viewing and can navigate anywhere in one tap.

**Acceptance Criteria:**

**Given** the user is on any `(app)` page,
**When** the header renders,
**Then** a fixed-height header (`h-14`) is visible at the top with `bg-background border-b border-[--border]` and `z-50`.

**Given** the header renders,
**When** looking at the left section,
**Then** the Ride'n'Rest `<Logo iconOnly />` is displayed (mobile) or full `<Logo />` (desktop ≥ 640px), clickable link to `/adventures`.

**Given** the user is on an adventure map page (`/map/[id]` or `/live/[id]`),
**When** the header renders,
**Then** the center section displays the adventure name (`text-sm font-semibold truncate`).

**Given** the user is NOT on an adventure page,
**When** the header renders,
**Then** the center section is empty.

**Given** the header renders,
**When** looking at the right section,
**Then** two navigation items are visible: "Mes aventures" (→ `/adventures`) and "Mon compte" (→ `/settings` — Strava connection config).

**Given** the user is in **Live mode** (`/live/[id]`),
**When** the header renders,
**Then** the header is **hidden** — Live mode is full-screen immersive (per Story 8.3).

**Given** the viewport is mobile (< 640px),
**When** the header renders,
**Then** logo is icon-only, adventure name truncates, and nav links collapse into a hamburger `<DropdownMenu>`.

---

## Epic 9: Redesign & Landing Site

> **Ajouté 2026-03-18** — Refonte visuelle complète avec le design system light mode vert sauge, et création de la landing page marketing.

L'utilisateur arrive sur une landing page qui communique clairement la valeur du produit, et navigue dans une application visuellement soignée et cohérente du premier au dernier écran.

### Story 9.1: Landing Page

As a **potential cyclist user discovering Ride'n'Rest**,
I want a compelling landing page that shows me what the app does immediately,
So that I understand the value in seconds and feel motivated to sign up.

**Acceptance Criteria:**

**Given** a visitor arrives at `/`,
**When** the hero renders,
**Then** it shows a full-bleed cycling landscape photo, headline "TROUVE OÙ DORMIR LE LONG DE TA TRACE" (large white bold), subtitle, and a primary CTA "Essayer gratuitement".

**Given** the "Étape 01 — Crée ton aventure" section renders,
**When** displayed,
**Then** it shows a phone mockup (GPX import screen) and step content on white background with "Compatible Strava" and "Analyse de relief instantanée" checkmarks.

**Given** the "Étape 02 — Décide en roulant" section renders,
**When** displayed,
**Then** it shows the step text and map mockup on `--primary-light` (`#EBF5EE`) section background.

**Given** the manifesto section renders,
**When** displayed,
**Then** italic centered manifesto text inside a white card, "LA COMMUNAUTÉ" overline in `--primary` uppercase.

**Given** the page renders on mobile,
**When** étape sections display,
**Then** two-column layout stacks vertically — no horizontal scroll.

---

### Story 9.2: Auth Pages Polish

As a **new or returning user**,
I want auth pages cohesive with the app's identity,
So that my first interaction is reassuring and polished.

**Acceptance Criteria:**

**Given** a user visits any auth page (`/login`, `/register`, `/forgot-password`, `/reset-password`),
**When** the page renders,
**Then** background is a full-bleed cycling landscape photo; a white card is centered on it (`max-w-sm mx-auto`, `rounded-2xl shadow-sm`); no logo inside the card (the global header handles branding).

**Given** a user visits `/register`,
**When** the card renders,
**Then** a short pitch text is displayed at the top of the card, above the form fields, listing 3 key benefits of creating an account (e.g. GPX import, accommodations along the route, pace-adjusted weather).

**Given** a user visits `/login`,
**When** the card renders,
**Then** a short returning-user message is displayed at the top of the card, above the form fields (e.g. "Reprends là où tu t'es arrêté").

**Given** the `/register` form renders,
**When** the user types in the password field,
**Then** an eye icon is visible at the end of the field; clicking it toggles between `type="password"` and `type="text"`.

**Given** the auth form renders,
**When** displayed,
**Then** primary CTA uses `--primary` bg + white text; inputs have `border-[--border]` with `focus:ring-[--primary]`.

**Given** a form validation error,
**When** displayed,
**Then** error text in `--density-low` (`#dc2626`) below the field, `text-sm`.

---

### Story 9.3: Map View — Light Mode Polish

As a **cyclist planning a route**,
I want the map view to feel clean and visually consistent,
So that the map is the star without visual noise from UI chrome.

**Acceptance Criteria:**

**Given** the map renders in Planning mode,
**When** displayed,
**Then** OpenFreeMap light tiles are used as the default base layer.

**Given** POI pins render,
**When** displayed,
**Then** all pins use `--poi-pin` (`#1A2D22`) fill with white inner category icon; selected pin scales to 1.2× with `--primary` ring.

**Given** the `<LayerToggleGroup>` renders,
**When** displayed,
**Then** each 40×40px toggle: inactive = white bg + `--border` border; active = `--primary` bg + white icon.

**Given** the corridor slider overlay renders (mobile bottom),
**When** displayed,
**Then** white panel `--surface`, `rounded-t-2xl shadow-lg`; km value in `font-mono text-2xl font-bold`.

**Given** the GPS indicator renders in Live mode,
**When** displayed,
**Then** it is a `--primary` pulsing circle (CSS keyframe) — distinct from POI pins.

---

### Story 9.4: POI Card & Bottom Sheet

As a **cyclist browsing accommodation options**,
I want a clear POI detail card with key info and a direct booking link,
So that I can decide quickly without leaving the map.

**Acceptance Criteria:**

**Given** a user taps a POI pin,
**When** the Vaul Drawer opens,
**Then** it snaps to 40% height (name, type, distance, CTA) and 85% on pull-up (full details); dismisses via swipe down or tap backdrop.

**Given** the POI card renders for an accommodation,
**When** displayed,
**Then** shows: name (`text-lg font-semibold`), type badge (`--primary-light` chip), distance from trace (`text-sm text-[--text-secondary]`), km on route (`font-mono text-sm`).

**Given** the Booking.com CTA renders,
**When** displayed,
**Then** full-width primary button "Recherche sur Booking" with external link icon; `target="_blank" rel="noopener noreferrer"`; explicit `aria-label`.

**Given** a Google Places website URL is available for an accommodation,
**When** the card displays,
**Then** a secondary ghost button "Site officiel" is shown below the Booking CTA, linking to the establishment's website; `target="_blank" rel="noopener noreferrer"`.

**Given** a non-accommodation POI (restau, vélo) renders,
**When** the card displays,
**Then** no CTA is shown.

---

### Story 9.5: Adventure Detail Page Design

As a **cyclist managing their adventure**,
I want the adventure detail page to be well-designed,
So that managing GPX segments feels as polished as the map experience.

**Acceptance Criteria:**

**Given** a user navigates to `/adventures/:id`,
**When** the page renders,
**Then** background is `--background-page`; content centered `max-w-3xl mx-auto`; adventure name `text-2xl font-bold text-[--text-primary]`.

**Given** the segment list renders,
**When** displayed,
**Then** each segment is a white card (`--surface`, `rounded-xl`, `border border-[--border]`) showing: drag handle, name, distance (`font-mono`), parse status badge, and actions menu.

**Given** `parse_status: 'pending'`,
**When** badge renders,
**Then** amber pulsing "En cours..." badge (`--density-medium`, `animate-pulse`).

**Given** `parse_status: 'done'`,
**When** badge renders,
**Then** green "Prêt" badge (`--density-high`, static).

**Given** `parse_status: 'error'`,
**When** badge renders,
**Then** red "Erreur" badge (`--density-low`) with "Réessayer" ghost button.

**Given** the "Analyser la densité" CTA,
**When** all segments are `done`,
**Then** it appears as a secondary button — disabled with tooltip if any segment is pending.

---

## Epic 10: Cache Optimization & Redis VPS

> **Note 2026-03-18 : renommé depuis Epic 9** — numérotation mise à jour suite à l'insertion des épics 8 (App Shell) et 9 (Redesign).
> **Note 2026-03-27 : renommé** — "Upstash Budget Management" retiré du titre (Upstash décommissionné en Epic 14, Redis self-hosted VPS). Story 10.4 déplacée en 15.5. Story 10.5 supprimée (obsolète).

Optimiser la stratégie de cache Redis pour maximiser les performances, partager les données entre utilisateurs (Overpass API + Google Places API), et donner un levier d'invalidation admin en cas de mise à jour OSM.

### Story 10.1: Geographic Cache Key — Cross-User POI Sharing

As a **backend system**,
I want POI query results to be cached by geographic corridor rather than by user session,
So that two users querying the same zone benefit from the same cached data — reducing Overpass API calls and Upstash command consumption.

**Acceptance Criteria:**

**Given** two users query POIs for the same `(segmentId, fromKm, toKm, categories)` combination,
**When** the second query arrives within the TTL window,
**Then** only 1 Overpass API call is made (not 2) — the second user is served from Redis cache.

**Given** the current cache key is `pois:{segmentId}:{fromKm}:{toKm}:{categories}` (segment-scoped),
**When** a geographic key migration is implemented,
**Then** the new key uses the geographic corridor bbox: `pois:bbox:{minLat}:{minLng}:{maxLat}:{maxLng}:{categories}` (rounded to 3 decimal places ~111m precision) — decoupled from segment identity.

**Given** the new geographic key is active,
**When** a user with a different segment that overlaps the same geographic zone queries POIs,
**Then** the cached result from the first segment's corridor is reused if the bboxes match within rounding — no new Overpass call.

**Given** the geographic cache is active,
**When** monitoring Upstash dashboard,
**Then** the daily command count should decrease by an estimated 30-50% for popular bikepacking corridors.

---

### Story 10.2: Adaptive TTL — Density (7-30 days) vs POIs (24h) vs Weather (1h)

As a **backend system**,
I want different cache TTLs per data type based on OSM data volatility,
So that stable data stays cached much longer — reducing redundant Upstash commands while keeping time-sensitive data fresh.

**Acceptance Criteria:**

**Given** the density tronçon cache currently uses 24h TTL,
**When** the adaptive TTL is implemented,
**Then** density tronçon counts use `TTL_DENSITY_TRONCON = 7 days` (604800s).

**Given** POI search results (`pois:bbox:*`) currently use 24h TTL,
**When** the adaptive TTL is reviewed,
**Then** POI bbox results keep `TTL_POI_BBOX = 24h` (86400s).

**Given** weather cache uses 1h TTL,
**When** no change is needed,
**Then** weather TTL stays at 1h — documented in `packages/shared/src/constants/api.constants.ts` as `CACHE_TTL_WEATHER_S = 3600`.

**Given** all TTL constants are defined,
**When** the codebase is audited,
**Then** ALL cache TTL values are sourced from `packages/shared/src/constants/api.constants.ts` — no magic numbers in service files.

---

### Story 10.3: POI Query Cache by BBox + Category (Map Layer Requests)

As a **cyclist user browsing the map**,
I want POI layer data to be served from cache when I toggle a layer on a corridor I already searched,
So that repeated layer toggles and re-visits to the same area are instantaneous — no redundant Overpass calls.

**Acceptance Criteria:**

**Given** a user has already searched accommodations on a corridor,
**When** they toggle the accommodation layer off and back on,
**Then** the second `GET /pois` request is served from Redis cache in <200ms — no Overpass API call made.

**Given** the geographic key migration (Story 10.1) is applied to `GET /pois`,
**When** the POI cache key is constructed,
**Then** the key is `pois:bbox:{rounded_bbox}:{sorted_categories}` — segment-agnostic, reusable across users and adventures.

**Given** lat/lng values are used to compute the cache key,
**When** the bbox is computed,
**Then** values are rounded to 3 decimal places (`Math.round(val * 1000) / 1000`) — prevents cache fragmentation from floating-point precision differences.

---

<!--
Story 10.4 déplacée → Story 15.5 (2026-03-27)
Story 10.5 supprimée (2026-03-27) — Upstash décommissionné en Epic 14, Redis self-hosted VPS, aucun quota
-->


## Epic 11: Stage Planning (Étapes de planification)

> **Ajouté 2026-03-20** — Fonctionnalité MVP permettant de définir des étapes jour par jour sur l'aventure. Dépend de Story 8.8 (Profil d'élévation). Les étapes sont créées depuis la carte et/ou le profil d'élévation, chaque étape a une couleur, un nom, un D+ calculé et une distance inter-étapes.

L'utilisateur peut découper son aventure en étapes journalières, les visualiser sur la trace et le profil d'élévation, et organiser sa planification jour par jour avec D+ et distance par étape.

### Story 11.1: Stage CRUD — Création, Renommage, Suppression

As a **cyclist planning a multi-day adventure**,
I want to create, name, and delete planning stages on my route,
So that I can organize my adventure day by day with clear endpoints.

**Acceptance Criteria:**

**Given** a user clicks "Créer une étape" in Planning mode,
**When** they click on a point on the trace or elevation profile,
**Then** a stage endpoint marker is placed at that km position; if it's the first stage, the start is km 0; otherwise the start is the end of the previous stage.

**Given** a stage endpoint is placed,
**When** the user confirms,
**Then** a naming dialog appears (default: "Étape 1", "Étape 2"…); the stage is saved with `start_km`, `end_km`, `name`, `color` (auto-assigned from a palette, user-changeable).

**Given** stages exist in the sidebar stages list,
**When** rendered,
**Then** each stage shows: color swatch, name, distance (km), D+ cumulative, ETA (based on default 15 km/h if no pace set).

**Given** a user wants to edit a stage,
**When** they click the edit icon,
**Then** they can rename it and change its color — endpoint km is not editable directly (drag on map instead, Epic 11.2).

**Given** a user deletes a stage,
**When** confirmed,
**Then** the stage is removed; subsequent stages' start_km values are recalculated automatically.

---

### Story 11.2: Stage Interactive Map & Profile Placement

As a **cyclist creating stages**,
I want to place and adjust stage endpoints directly on the map or elevation profile,
So that I can visually fine-tune where each day ends based on terrain.

**Acceptance Criteria:**

**Given** the user is in "Créer une étape" mode,
**When** they hover over the map trace or the elevation profile,
**Then** a preview shows the distance and D+ from the last stage endpoint to the cursor position in real time.

**Given** a stage endpoint marker exists on the map,
**When** the user drags it to a new position on the trace,
**Then** the marker snaps to the nearest GPX point; `end_km` is updated and D+/distance recalculated.

**Given** stages are defined,
**When** the elevation profile renders (Story 8.8),
**Then** each stage boundary appears as a colored vertical line on the profile, with the stage name as a label.

**Given** the user toggles "Afficher les étapes" off,
**When** the map renders,
**Then** all stage markers and colored trace segments disappear; the density colorization (if active) takes precedence.

---

### Story 11.3: Stage D+ & Distance Computation

As a **backend system**,
I want to accurately compute D+ and distance for each stage,
So that cyclists get reliable day-by-day effort estimates.

**Acceptance Criteria:**

**Given** a stage has `start_km` and `end_km` defined,
**When** the stage is saved,
**Then** the API computes: `distance_km = end_km - start_km`, `elevation_gain_m = sum of positive ele differences between waypoints in [start_km, end_km]`.

**Given** waypoints have `ele` values,
**When** D+ is computed,
**Then** only positive elevation deltas are summed (gains only, not losses) — standard cycling D+ definition.

**Given** waypoints have missing or null `ele` values,
**When** D+ is requested,
**Then** `elevation_gain_m` is returned as `null` with a `elevation_data_available: false` flag — no crash, graceful UI fallback.

**Given** the pace is set on the adventure,
**When** ETA is computed per stage,
**Then** `eta_minutes = (distance_km / pace_kmh) * 60 + (elevation_gain_m / 100) * 6` (Naismith's rule approximation).

---

### Story 11.4: Stage-Scoped POI Search

As a **cyclist with defined stages**,
I want to search for POIs scoped to the end of each stage,
So that I find accommodation at exactly my planned overnight stop.

**Acceptance Criteria:**

**Given** stages are defined and a stage is selected in the "À partir :" dropdown,
**When** the stage is first selected,
**Then** the corridor search starts from `stage.endKm` (slider at far left = 0 km from stage). The km display shows 0 km, D+ shows 0 m, and slider is at the far left. As the user moves the slider right, km and D+ increment relative to the stage endpoint. POI pins show the stage color accent.

**Given** a stage is selected and the user moves the slider,
**When** the slider is dragged,
**Then** km display shows distance from stage endpoint, D+ shows elevation gain from stage endpoint to current position, search range moves forward from stage endpoint. Stage selection is **preserved** in the dropdown (select still shows stage name, POI pins keep stage color). Only selecting "Début" or using the range stepper clears the stage selection.

**Given** a stage is selected and POI pins render,
**When** results are shown on the map,
**Then** POI pin stroke color matches the selected stage color.

---

### Story 11.5: Stage-Scoped Weather

As a **cyclist planning stages**,
I want weather forecasts aligned with my expected arrival time at each stage endpoint,
So that I know what conditions to expect at my overnight stop.

**Acceptance Criteria:**

**Given** stages are defined with a departure time set on the adventure,
**When** weather is requested for a stage,
**Then** `eta_datetime = departure_datetime + sum of ETAs of preceding stages + this stage ETA`; weather forecast is fetched at `end_km` for `eta_datetime`.

**Given** no departure time is set,
**When** weather for a stage is requested,
**Then** weather is shown for the current time at `end_km` — same fallback as Epic 6.

---

## Epic 16: User Acceptance Feedback — UX Polish & Quality Sprint

> **Ajouté 2026-03-30** — Epic consolidant l'ensemble des retours utilisateur (user-acceptance-feedback.md) recueillis lors de la recette de Guillaume. **Priorité d'exécution : immédiatement après Epic 11.** Inclut bugs bloquants (🔴), améliorations UX (🟡), et nouvelles fonctionnalités demandées.

Transformer tous les feedbacks de recette en stories implémentables, ordonnées par sévérité et logique fonctionnelle.

### Story 16.1: Critical Bug Fixes

As a **user on mobile or desktop**,
I want all critical UI bugs fixed,
So that the core workflow functions correctly without workarounds.

**Acceptance Criteria:**

**Given** the user views the adventures list on mobile,
**When** the page renders,
**Then** all action buttons (edit, delete, open map) are visible without requiring any tap or hover interaction first.

**Given** the user is on the Planning map page,
**When** the page loads or the km range changes,
**Then** the hotel/POI search does NOT trigger automatically; search only launches when the user explicitly clicks the search button.

**Given** weather data with wind information is displayed on the map,
**When** wind arrows are rendered,
**Then** their size is 2× to 3× larger than the current implementation, making them clearly visible at typical zoom levels.

---

### Story 16.2: Adventures List & Timeline UX

As a **cyclist managing multiple adventures**,
I want richer information on my adventures list and better chronological management,
So that I can quickly identify upcoming trips and archive past ones.

**Acceptance Criteria:**

**Given** the adventures list renders,
**When** an adventure card is displayed,
**Then** the D+ (elevation gain in meters) is shown below the total distance in the card (format: "↑ 4 200 m").

**Given** an adventure,
**When** the user accesses the adventure detail or edit form,
**Then** a start date field is available (date picker — ISO 8601, stored as `start_date` on the adventure).

**Given** adventures have a start date,
**When** the list renders,
**Then** adventures are sorted: upcoming (by ascending start date) first, then undated, then past. Past adventures are hidden in a collapsible "Aventures passées" section at the bottom of the list.

**Given** an adventure's start date has passed AND the adventure status is not `active`,
**When** displayed,
**Then** it appears in the "Aventures passées" section; if `status = active`, it stays in the main list regardless of start date.

---

### Story 16.3: Map Interaction UX

As a **cyclist using the planning map**,
I want more intuitive map interactions,
So that I can navigate search results and control the viewport efficiently.

**Acceptance Criteria:**

**Given** a POI search completes,
**When** results are returned,
**Then** the map auto-zooms to fit the search corridor (the km range segment + ~10% padding around the bounding box).

**Given** the user has panned or zoomed the map manually,
**When** they click a "Reset zoom" button (persistent in the map controls, e.g., bottom-right corner),
**Then** the map recenters and zooms to fit the full adventure trace.

**Given** the user clicks on a point on the GPX trace,
**When** the click is on or within 10px of the trace line,
**Then** a "Rechercher ici" CTA appears (tooltip or floating button) that sets `fromKm` to the clicked km position and opens the search panel.

**Given** a POI search is in progress,
**When** results are loading,
**Then** a centered loading overlay (spinner + "Recherche en cours…") is displayed over the map. Any previous inline "Recherche en cours" text style is removed. The overlay disappears as soon as results are rendered.

---

### Story 16.4: Density Analysis UX

As a **cyclist using density analysis**,
I want clearer state feedback on the analysis button and an informed consent popup,
So that I know whether analysis is current and understand what the calculation represents.

**Acceptance Criteria:**

**Given** no density analysis has been run on an adventure,
**When** the Planning sidebar renders,
**Then** a CTA "Lancer l'analyse de densité" is visible in the sidebar (below the stages section), in addition to the button in the map controls area.

**Given** a density analysis has been completed and no segment has been modified/added/deleted since,
**When** the density trigger button renders,
**Then** the button appears in a "done" state (distinct color — e.g., green tint — checkmark icon, label: "Densité analysée") and is disabled.

**Given** a segment is added, modified, or deleted after a density analysis was run,
**When** the button renders next time,
**Then** the button reverts to its "launch" state (re-enabled), prompting the user to re-run analysis.

**Given** the user clicks the density analysis trigger (in any state that allows triggering),
**When** the click is registered,
**Then** an explanatory modal appears before launching with the text: "L'analyse se base sur la présence d'hébergements et non leur disponibilité réelle. L'application peut rester ouverte ou être fermée pendant le calcul." — with a "Lancer l'analyse" CTA and a "Annuler" button.

---

### Story 16.5: Strava Import Enhancements

As a **cyclist importing activities from Strava**,
I want a richer import experience,
So that I can select multiple activities and browse beyond the first page of results.

**Acceptance Criteria:**

**Given** the Strava activity import dialog is open,
**When** the activity list renders,
**Then** a "Charger plus" button (or infinite scroll trigger) loads the next page of Strava activities (Strava API `per_page=30`, incrementing `page` parameter on each load).

**Given** the Strava activity list is displayed,
**When** the user browses activities,
**Then** each activity row has a checkbox for multi-selection; a "Importer X segment(s)" CTA at the bottom is enabled when ≥ 1 activity is checked and shows the count.

**Given** the user confirms multi-import,
**When** import is triggered,
**Then** all selected activities are imported as individual segments, each going through the same BullMQ `parse-segment` pipeline as a single import; segments are added in the order they were selected.

---

### Story 16.6: UI Polish — Modals, Settings & Contextual Tooltips

As a **user of the application**,
I want a more polished and informative UI,
So that interactions feel comfortable on mobile and the interface communicates its mode clearly.

**Acceptance Criteria:**

**Given** any modal/dialog in the app (create adventure, rename, delete confirm, import Strava, etc.),
**When** it renders on mobile or desktop,
**Then** the modal is larger (min-width: 360px on mobile, 480px on desktop) and all CTA buttons have min-height: 44px (WCAG touch target compliance).

**Given** the Settings page,
**When** rendered,
**Then** the layout uses the same card-list design language as the adventures list page (shadcn `Card` components, section headers with labels, consistent padding and spacing).

**Given** the Planning mode sidebar section headers (e.g., "Recherche de POIs", "Étapes", "Météo", "Analyse de densité"),
**When** the user hovers (desktop) or long-presses (mobile) on a section header,
**Then** a tooltip appears with a 1–2 sentence explanation of the section's purpose and how to use it.

**Given** the Planning or Live map header area,
**When** rendered,
**Then** the current mode is displayed as a small badge next to or below the adventure name (e.g., "Planning" in blue, "Live" in green).

---

### Story 16.7: Help & In-App Feedback System

As a **new or returning user**,
I want a help page and an easy way to submit feedback,
So that I can discover features and report issues without leaving the app.

**Acceptance Criteria:**

**Given** the left navigation menu (app shell),
**When** rendered,
**Then** an "Aide" link is present (between the adventures list and the account section).

**Given** the user clicks "Aide",
**When** the page loads (`/help`),
**Then** a structured help page is displayed covering all major features: Auth, Adventures & GPX import, Planning mode, Density analysis, Weather, Live mode, Stages — each section with a brief description and optional screenshots.

**Given** the landing page (`/`),
**When** rendered,
**Then** a visible link to `/help` is accessible from the main navigation or footer.

**Given** an authenticated user is on any app page,
**When** they open a "Feedback" entry (floating button or menu item in the nav),
**Then** a form modal appears with: category selector (Bug / Amélioration / Idée), screen/feature field (text), description textarea (required), email pre-filled from profile (read-only). On submit, feedback is persisted in a `feedbacks` DB table (NestJS endpoint `POST /feedbacks`) and triggers a Resend notification email to the admin address.

---

### Story 16.8: Advanced Stage Management & Global Average Speed

As a **cyclist doing detailed stage planning**,
I want more control over stage positioning and a global speed setting,
So that my ETAs, weather forecasts, and elevation estimates are as accurate as possible.

**Acceptance Criteria:**

**Given** stages exist and the user creates a new stage with an `end_km` value falling inside an existing stage's `[start_km, end_km]`,
**When** the new stage is saved,
**Then** the existing stage is split at the new `end_km`: the original stage keeps `[original_start_km, new_end_km]`, and a new remainder stage covers `[new_end_km, original_end_km]`. All subsequent stages' `start_km` values are recalculated automatically.

**Given** the elevation profile is displayed (Story 8.8) and the user is in "Créer une étape" mode,
**When** the user clicks a point on the elevation profile,
**Then** a stage endpoint is placed at the corresponding km on the trace (same behavior as clicking the map trace).

**Given** the adventure settings or profile page,
**When** the user sets a "Vitesse moyenne" field (km/h, numeric input, default: 15, range: 5–50),
**Then** this value is stored as `avg_speed_kmh` on the `adventures` table and used globally for: stage ETA calculations, weather `eta_datetime` forecasts (Epic 11.5), and pace-adjusted weather (Epic 6).

**Given** the user updates `avg_speed_kmh`,
**When** the value is saved,
**Then** all stage ETAs and weather forecasts are re-queried and the UI re-renders the updated values without a full page reload (TanStack Query invalidation on `['adventures', id]` and `['weather', *]`).

---

### Story 16.9: Live Mode Stage Layer

As a **cyclist in Live mode**,
I want to see my planning stages on the map and update them dynamically as I ride,
So that I can track progress against my planned day stages in real time.

**Acceptance Criteria:**

**Given** stages have been defined in Planning mode and the user activates Live mode,
**When** the Live map renders,
**Then** an "Étapes" toggle is available in the Filters panel (`<FilterPanel />`); when active, stage endpoint markers appear on the map with their assigned color and name label.

**Given** the stages layer is active in Live mode,
**When** the user's GPS `currentKm` passes a stage `end_km`,
**Then** that stage is visually marked as "passed" (muted/desaturated color, checkmark overlay icon on the marker).

**Given** the user wants to update a stage endpoint to their current GPS position,
**When** they long-press a stage marker in Live mode and select "Mettre à jour avec ma position" from a context menu,
**Then** a confirmation modal appears ("Mettre à jour la fin de l'Étape X à votre position actuelle ?") — on confirm, `end_km` is updated to the current `currentKm`; all subsequent stages are recalculated (same algorithm as map drag in Story 11.2).

---

### Story 16.10: Observability — Structured Logging & Uptime Kuma Alerts

As a **developer maintaining the production system**,
I want structured logs and proactive monitoring alerts,
So that I can debug issues quickly and be notified before users report them.

**Acceptance Criteria:**

**Given** any NestJS service, controller, or processor,
**When** a significant event occurs (request in/out, BullMQ job start/complete/fail, cache hit/miss, unhandled error),
**Then** it is logged via a structured logger (e.g., `nestjs-pino` with JSON output) with at minimum: `level`, `timestamp`, `context` (module name), `message`, and `traceId` (correlation UUID propagated from request headers or auto-generated).

**Given** structured logging is in place,
**When** logs are written on the VPS,
**Then** they are accessible via `pm2 logs api` in JSON format; no external logging service is required for MVP.

**Given** Uptime Kuma is running on the VPS (Epic 14 done),
**When** alerts are configured,
**Then** monitors exist for: `https://api.ridenrest.app/health` (HTTP 200), `https://ridenrest.app` (HTTP 200), PostgreSQL TCP check (localhost:5432), Redis TCP check (localhost:6379) — with email or Telegram notification on status change to "down".

---

### Story 16.11: POI Visual Identity — Colored Pins par Catégorie et Sous-type

> **Ajouté 2026-04-02** — Issue de retour utilisateur Guillaume : refonte visuelle des pins POI pour différencier les types à la carte et dans les filtres UI.

As a **cyclist planning a long-distance route**,
I want each type of POI (hôtel, camping, refuge, restauration, vélo...) to display a distinct colored pin on the map,
So that I can instantly identify the nature of a POI at a glance, and so the filter buttons in the sidebar and live mode match those same colors.

**Acceptance Criteria:**

**Given** la layer `accommodations` est visible,
**When** les pins sont rendus (mode planning + live),
**Then** chaque pin affiche la couleur de son sous-type : hôtel → orange `#F97316`, camping → bleu ciel `#38BDF8`, refuge → vert lime `#84CC16`, chambre d'hôte → rose `#EC4899`, auberge → violet `#8B5CF6`.

**Given** des POIs non-hébergement sont affichés,
**When** les pins sont rendus,
**Then** : restauration → rouge `#EF4444`, alimentation → violet `#A855F7`, vélo → teal `#14B8A6`.

**Given** plusieurs POIs forment un cluster,
**When** le cluster est rendu,
**Then** la couleur du cluster correspond à son layer : accommodations → orange, restaurants → rouge, supplies → violet, bike → teal.

**Given** les boutons de filtre "Je cherche" dans la sidebar (ou live mode drawer),
**When** un layer est actif,
**Then** le bouton actif utilise la couleur du layer (style inline, pas classe Tailwind dynamique) avec icône blanche.

**Given** les chips de sous-type hébergement,
**When** une chip est active,
**Then** son fond utilise la couleur du sous-type correspondant.
**When** une chip est inactive,
**Then** un dot coloré est affiché à gauche pour permettre l'identification visuelle.

---

### Story 16.12: Interactive States — Cursor, Hover & Click Feedback

> **Ajouté 2026-04-02** — Issue de retour utilisateur Guillaume : standardiser les états interactifs (cursor, hover, active) sur tous les éléments cliquables de l'app.

As a **user navigating the Ride'n'Rest app**,
I want every interactive element to respond visually when I hover or click it,
So that the UI feels responsive and polished, and I always know what's clickable.

**Acceptance Criteria:**

**Given** un élément `<div>` ou `<span>` avec `onClick`,
**When** l'utilisateur survole l'élément sur desktop,
**Then** le curseur devient `pointer`.

**Given** n'importe quel élément interactif sans état actif (fond neutre),
**When** l'utilisateur survole l'élément sur desktop,
**Then** le fond change légèrement (plus sombre en mode clair, plus clair en mode sombre).

**Given** un élément avec fond dynamique inline (ex : bouton layer actif, chip active),
**When** l'utilisateur survole l'élément,
**Then** l'élément s'assombrit légèrement (`hover:brightness-90`).

**Given** n'importe quel élément interactif (bouton, card, chip, lien CTA),
**When** l'utilisateur clique (desktop) ou tape (mobile),
**Then** un feedback visuel immédiat est visible : légère compression (`active:scale-[0.97]`) ou assombrissement.

**Given** un élément avec `disabled` ou `aria-disabled`,
**When** l'utilisateur interagit,
**Then** aucun hover ni active feedback n'est visible.

---

### Story 16.13: POI Popup — Redesign Layout

> **Ajouté 2026-04-03** — Unification du layout des fiches POI (hébergement et non-hébergement) avec badge catégorie coloré, stats avec icônes, CTAs côte à côte et icône téléphone inline.

As a **cyclist consulting a POI on the map**,
I want the POI popup to have a clean, unified layout regardless of POI type,
So that I can quickly read the essential information and take action.

**Acceptance Criteria:**

**Given** n'importe quel POI ouvert en popup,
**When** la fiche s'affiche,
**Then** un badge coloré (`POI_CATEGORY_COLORS[poi.category]`) apparaît **au-dessus** du nom avec le label uppercase de la catégorie.

**Given** un POI avec numéro de téléphone,
**When** la fiche s'affiche,
**Then** une icône Lucide `Phone` cliquable (`tel:`) apparaît inline à droite du nom — sans afficher le numéro en texte.

**Given** un POI ouvert,
**When** les stats sont affichées,
**Then** chaque stat (km, D+, ETA) a une icône Lucide au-dessus de sa valeur (layout en colonnes).

**Given** un POI hébergement avec site web,
**When** les CTAs s'affichent,
**Then** "Site officiel" et "Booking" sont côte à côte en `flex-1` — plus empilés.

**Given** un POI non-hébergement avec site web,
**When** les CTAs s'affichent,
**Then** un bouton "Site officiel" pleine largeur (plus de lien URL brut).

---

### Story 16.14: Global Accommodation Search CTA (Booking + Airbnb)

> **Ajouté 2026-04-03** — Composant `SearchOnDropdown` partagé : dropdown "Rechercher sur" (Booking.com + Airbnb) intégré dans le sidebar planning, les contrôles live, et la fiche POI hébergement.

As a **cyclist using the planning or live mode**,
I want a "Rechercher sur" dropdown CTA available across the app,
So that I can instantly open Booking.com or Airbnb centered on the right location — from the map sidebar, the live controls, or a specific POI popup.

**Acceptance Criteria:**

**Given** une recherche hébergements est committée et terminée en mode planning,
**When** `searchCommitted && !isPoisPending && visibleLayers.has('accommodations')`,
**Then** un dropdown "Rechercher sur" s'affiche sous le bouton "Rechercher" (Booking + Airbnb, centré sur `midKm`).

**Given** le mode live est actif et `targetKm` est connu (slider positionné),
**When** `LiveControls` s'affiche,
**Then** `SearchOnDropdown` est actif dans l'action row — pas besoin d'avoir lancé une recherche POI.

**Given** une fiche POI hébergement est ouverte,
**When** les CTAs s'affichent,
**Then** `SearchOnDropdown` pleine largeur centré sur les coords du POI, "Site officiel" en dessous si disponible.

**Given** l'utilisateur ouvre le dropdown,
**When** il clique "Rechercher sur Booking.com" ou "Rechercher sur Airbnb",
**Then** le lien s'ouvre dans un nouvel onglet (Booking : `latitude/longitude` ; Airbnb : bbox ±0.2°).

---

### Story 16.15: Map Auto-Zoom to Search Zone

> **Ajouté 2026-04-03** — Fix régression : auto-zoom planning mode ne fire pas sur cache chaud. New feature : auto-zoom live mode sur la zone de recherche.

As a **cyclist searching for POIs in planning or live mode**,
I want the map to automatically zoom to display the searched zone after each search completes,
So that I can immediately see the results without having to manually navigate to the right area.

**Acceptance Criteria:**

**Given** the user commits a POI search in planning mode (clicks "Rechercher"),
**When** the search completes — whether from network (cold cache) or Redis cache (warm cache, `isPending` never goes `true`),
**Then** the map auto-zooms to fit the search corridor (`fitToCorridorRange(fromKm, toKm, segments)`) with ~10% padding.

**Given** the user commits a POI search in planning mode and the search returns no results,
**When** the empty result is returned,
**Then** the map still auto-zooms to the corridor zone (same behavior as non-empty results).

**Given** live mode is active and the user triggers a POI search (`refetchPois()`),
**When** the fetch completes (`poisFetching: true → false`, `poisHasFetched: true`),
**Then** the map viewport adapts to show the search zone: fit waypoints in range `[currentKm, targetKm + searchRadiusKm]` with 10% padding.

**Given** live mode is active and the map auto-zooms after a search,
**When** the zoom fires,
**Then** GPS auto-tracking is paused (same `userInteractedRef` mechanism as a manual pan/zoom) — the user must tap "Centre sur ma position" to resume tracking.

**Given** live mode is active but no search has been triggered yet (`!poisHasFetched`),
**When** the user moves the target slider,
**Then** no auto-zoom fires (zoom only triggers after an explicit search, not on slider move).

---

### Story 16.16: City-Based Booking Search URLs

> **Ajouté 2026-04-03** — Amélioration de la pertinence des liens Booking : utilisation du nom de ville au lieu des coordonnées GPS brutes, pour une meilleure compatibilité avec l'app Booking mobile.

As a **cyclist using the app**,
I want Booking.com search links to use a relevant city name instead of raw GPS coordinates,
So that search results are more accurate and the Booking mobile app opens correctly to a recognizable location.

**Acceptance Criteria:**

**Given** a POI accommodation has OSM rawData with `addr:city`, `addr:town`, or `addr:village`,
**When** the POI popup opens,
**Then** the Booking.com search URL uses `?ss={city_name}` instead of `?latitude=&longitude=`.

**Given** a POI accommodation has no city in rawData but Google Places `formattedAddress` is available,
**When** the POI popup opens,
**Then** the city is extracted from `formattedAddress` (strip postal code prefix) and used as `?ss={city}`.

**Given** no city is extractable (rawData empty, formattedAddress absent or unrecognizable),
**When** the POI popup opens,
**Then** the Booking URL falls back to the existing `?latitude={lat}&longitude={lng}&dest_type=latlong` format.

**Given** the user has committed a POI search in planning or live mode,
**When** the center coordinates are known,
**Then** a `GET /geo/reverse-city?lat=&lng=` call is made to the NestJS backend to resolve the city via Geoapify, cached 7 days in Redis.
**And** if a city is resolved, the Booking URL uses `?ss={city_name}`.
**And** if reverse geocoding fails, the URL falls back to coordinates (silent degradation).

---

### Story 16.17: Smart No-Results Message for Filtered Accommodation Search

> **Ajouté 2026-04-05** — Issue de retour utilisateur Guillaume : quand le filtre sous-type hébergement exclut tous les résultats (ex. "Hôtel" sélectionné mais seuls des campings existent), aucun message ne s'affiche. L'utilisateur voit une carte vide sans explication.

As a **cyclist searching for accommodations on the planning or live map**,
I want a contextual message when my sub-type filter yields no visible results but other accommodation types exist,
So that I know results are available if I broaden my filter — instead of seeing an empty map with no explanation.

**Acceptance Criteria:**

**Given** une recherche commitée avec la couche "Hébergements" active,
**When** `poisByLayer.accommodations` contient des résultats MAIS aucun ne correspond aux `activeAccommodationTypes` sélectionnés,
**Then** un banner info s'affiche : "Aucun {types_actifs} — {N} {types_disponibles} disponible(s)".

**Given** le banner contextuel est affiché,
**When** l'utilisateur clique dessus,
**Then** tous les sous-types hébergement sont réactivés et le banner disparaît.

**Given** au moins 1 POI correspond à un `activeAccommodationType` sélectionné,
**When** la carte affiche les pins,
**Then** aucun banner contextuel n'est affiché.

**Given** `allPois.length === 0` (aucun résultat toutes couches confondues),
**When** la recherche est terminée,
**Then** le banner orange existant "Aucun résultat dans cette zone" s'affiche normalement (pas de régression).

---

### Story 16.18: PWA Scope — Limiter à la Partie Connectée

> **Ajouté 2026-04-05** — Retour utilisateur Guillaume : la PWA installée sur l'écran d'accueil affiche la landing page au lancement. Les pages publiques (landing, login, mentions légales, contact) n'ont pas vocation à être dans l'expérience PWA standalone. Seule la partie connectée (`/adventures`, `/map`, `/live`, `/settings`, `/help`) doit être englobée.

As a **cyclist who installed Ride'n'Rest as a PWA on my home screen**,
I want the app to open directly on my adventures dashboard (not the landing page),
So that the PWA experience feels like a native app — no marketing pages, straight to my content.

**Acceptance Criteria:**

**Given** the Web App Manifest is configured,
**When** the manifest is served,
**Then** `start_url` is set to `/adventures` and `scope` is set to `/` (navigation vers login autorisée mais l'app démarre sur le dashboard).

**Given** the user launches the PWA from the home screen,
**When** the app opens,
**Then** they land on `/adventures` (redirigé vers `/login` par auth middleware si non connecté, puis retour sur `/adventures` après connexion).

**Given** the user is in the PWA and navigates to a public page (landing, mentions légales, contact),
**When** the navigation occurs,
**Then** the link opens in the browser externe (pas dans le standalone shell), car ces pages sont hors du scope PWA fonctionnel.

**Given** the Service Worker (next-pwa) is configured,
**When** it pre-caches routes,
**Then** seules les routes `(app)/*` sont incluses dans la stratégie cache-first ; les routes `(marketing)/*` ne sont pas pré-cachées.

**Note technique :** Le `scope` du manifest reste `/` (pas `/adventures`) pour que le flow auth (`/login` → `/adventures`) fonctionne à l'intérieur du shell standalone. La distinction se fait via : (1) `start_url: "/adventures"` — point d'entrée PWA, (2) Config service worker — exclusion des routes `(marketing)` du precache, (3) Les liens vers pages publiques depuis l'app utilisent `target="_blank"` ou `window.open()` pour sortir du shell.

---

### Story 16.19: Bug Fix — Live Mode POI Search Skips Google Places (Primary Source) When Overpass Disabled

> **Ajouté 2026-04-05** — Bug critique : en live mode avec `overpassEnabled=false`, `findLiveModePois` retourne directement le cache DB sans jamais appeler Google Places (source primaire). En prod, la DB est vide → zéro résultat. Rappel archi : Google Places = API de base, Overpass/OSM = complément optionnel.

As a **cyclist using Live mode with overpassEnabled=false**,
I want the POI search to call Google Places (the primary data source) when the local DB cache is empty,
So that I see nearby accommodations and POIs — Google Places being the base API, Overpass/OSM being the optional complement.

**Acceptance Criteria:**

**Given** `overpassEnabled=false` en live mode,
**When** le cache DB pour la zone cible est vide,
**Then** `prefetchAndInsertGooglePois` (source primaire) est appelé avec la bbox calculée, puis `findPoisNearPoint` retourne les résultats fraîchement insérés.

**Given** `overpassEnabled=false` en live mode,
**When** le cache DB pour la zone cible contient déjà des POIs,
**Then** aucun appel Google Places n'est fait — les résultats en cache sont retournés directement.

**Given** `overpassEnabled=false` ET `googlePlacesProvider.isConfigured()` retourne `false`,
**When** la recherche live mode s'exécute,
**Then** le cache DB est retourné tel quel (même comportement qu'actuellement — pas d'erreur, résultats potentiellement vides).

---

### Story 16.20: Live Mode Slider — Dynamic Max Based on Remaining Distance

> **Ajouté 2026-04-05** — Le slider "Mon hôtel dans X km" est hardcodé à max 100 km. Sur une aventure de 300 km, l'utilisateur ne peut pas chercher au-delà de 100 km devant lui. Le max devrait être la distance restante sur la trace.

As a **cyclist in Live mode**,
I want the "Mon hôtel dans X km" slider to go up to the remaining distance of my adventure (not a fixed 100 km),
So that I can search for accommodations along the entire remaining route, not just the next 100 km.

**Acceptance Criteria:**

**Given** l'utilisateur est au km X sur une trace de distance totale D,
**When** le slider s'affiche,
**Then** `max` vaut `Math.ceil(D - X)` arrondi au multiple de 5 inférieur.

**Given** le slider max diminue (l'utilisateur avance sur la trace),
**When** `targetAheadKm > newMax`,
**Then** `targetAheadKm` est automatiquement réduit au nouveau max.

**Given** `currentKmOnRoute` est null (GPS pas encore snappé) ou la distance totale est inconnue,
**When** le slider s'affiche,
**Then** `max` par défaut vaut 100 (comportement actuel préservé).

---

### Story 16.21: Booking URL — Ajouter le Code Postal au Paramètre de Recherche

> **Ajouté 2026-04-05** — Amélioration pertinence Booking : inclure le code postal dans le `?ss=` pour désambiguïser les homonymes de villes (ex. "Saint-Jean-de-Luz 64500" plutôt que "Saint-Jean-de-Luz" seul).

As a **cyclist using Booking.com deep links from the app**,
I want the Booking search URL to include the postal code alongside the city name,
So that search results target the correct location — especially for common city names that exist in multiple regions.

**Postal code priority chain:** Google Places `addressComponents[postal_code]` (PRIMARY) → OSM `addr:postcode` (complément) → Geoapify `postcode` (fallback zone sans POI).

**Acceptance Criteria:**

**Given** un POI hébergement avec Google Places details chargés,
**When** `getPlaceDetails()` retourne les `addressComponents`,
**Then** le `postal_code` est extrait (type `postal_code`) et exposé dans `GooglePlaceDetails.postalCode`.

**Given** un POI hébergement avec `details.postalCode` disponible (Google Places = source primaire),
**When** l'URL Booking est construite,
**Then** le paramètre `?ss=` vaut `{ville} {codepostal}` (ex: `?ss=Saint-Jean-de-Luz%2064500`).

**Given** un POI Overpass (opt-in) sans détails Google mais avec `addr:postcode` dans rawData,
**When** l'URL Booking est construite,
**Then** le `addr:postcode` OSM est utilisé comme fallback.

**Given** le `SearchOnDropdown` global (sidebar ou live — pas de POI spécifique),
**When** `useReverseCity` résout la zone via Geoapify,
**Then** le `postcode` Geoapify est aussi retourné et inclus dans `?ss=`.

**Given** une ville disponible MAIS code postal absent (aucune source),
**When** l'URL Booking est construite,
**Then** le `?ss=` utilise la ville seule (pas de régression).

**Given** ni ville ni code postal disponibles,
**When** l'URL Booking est construite,
**Then** fallback coordonnées GPS `?latitude=&longitude=&dest_type=latlong` (pas de régression).

---

### Story 16.22: Landing Page — Dynamic Auth CTA (Se connecter / Mes aventures)

> **Ajouté 2026-04-06** — Retour utilisateur Guillaume : le bouton "Se connecter" dans le header de la landing page reste affiché même lorsque l'utilisateur est déjà authentifié. Le label devrait changer en "Accéder à mes aventures" pour les utilisateurs connectés.

As a **cyclist who is already logged in**,
I want the landing page header CTA to show "Mes aventures" instead of "Se connecter",
So that I can go straight to my dashboard without being presented with a login prompt I don't need.

**Acceptance Criteria:**

**Given** the user is NOT authenticated (no active session),
**When** the landing page (`/`) renders (header desktop + mobile menu),
**Then** the CTA button displays "Se connecter" and links to `/adventures` (existing behavior preserved — auth middleware redirects to `/login`).

**Given** the user IS authenticated (active Better Auth session via `useSession()`),
**When** the landing page header renders,
**Then** the CTA button label changes to "Mes aventures" and links to `/adventures`.

**Given** the session is loading (`useSession()` returns `isPending: true`),
**When** the header renders,
**Then** the CTA button renders in a neutral/skeleton state (no label flash from "Se connecter" to "Mes aventures") — e.g., a shimmer placeholder or the button is hidden until session status resolves.

**Given** the `MarketingHeader` component is a client component (`'use client'`),
**When** `useSession()` is called,
**Then** the session check is performed client-side only — no SSR session fetch needed (landing page remains fully cacheable/static).

**Technical notes:**
- Component: `apps/web/src/app/(marketing)/_components/marketing-header.tsx`
- Auth hook: `useSession` from `@/lib/auth/client`
- Both desktop nav (line ~32) and mobile menu (line ~73) must be updated
- No new API endpoint needed — `useSession()` already handles session detection via Better Auth cookie

---

### Story 16.23: Mobile Sidebar Toggle — Responsive Planning Mode

> **Ajouté 2026-04-06** — Retour utilisateur Guillaume : sur mobile/tablette, la sidebar planning disparaît complètement (hidden lg:flex). Aucun moyen d'accéder aux outils de planification (recherche, météo, densité, étapes) sans écran desktop.

As a **cyclist using the planning map on mobile or tablet**,
I want a visible toggle button on the left edge of the screen to open/close the sidebar,
So that I can access all planning tools (search, weather, density, stages) without needing a desktop screen.

**Acceptance Criteria:**

**Given** the user is on the planning map page on a viewport < `lg` breakpoint (< 1024px),
**When** the page renders,
**Then** a floating CTA button is visible on the left edge of the screen (vertically centered, z-index above map), with a `ChevronRight` icon indicating the sidebar can be opened.

**Given** the mobile toggle button is visible,
**When** the user taps the button,
**Then** the sidebar slides in from the left as a full-height overlay panel (width: 85vw, max 360px) over the map, with a semi-transparent backdrop. The toggle icon switches to `ChevronLeft`.

**Given** the sidebar overlay is open on mobile,
**When** the user taps the backdrop area, taps the toggle button again, OR taps the close chevron inside the sidebar,
**Then** the sidebar slides closed and the map is fully visible again.

**Given** the mobile sidebar overlay is open,
**When** rendered,
**Then** it contains all the same sections as the desktop sidebar: vitesse moyenne, search range, météo, densité, étapes, density CTA — in the same order, fully scrollable.

**Given** the user is on a viewport ≥ `lg` breakpoint,
**When** the page renders,
**Then** the existing desktop sidebar behavior (inline, collapse/expand toggle on map edge) remains unchanged.

**Given** the mobile sidebar is open and the user triggers a POI search,
**When** the search is committed,
**Then** the sidebar auto-closes so the user can see the map results.

**Technical notes:**
- Component: `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
- Le `<aside>` actuel `hidden lg:flex` → refactorer : sur mobile, overlay `fixed`/`absolute` avec `transition-transform duration-300`
- Nouveau state `mobileOpen` (distinct de `collapsed` qui reste pour desktop)
- Backdrop: `<div>` avec `bg-black/30` et `onClick` pour fermer
- Bouton toggle mobile: `lg:hidden`, bouton desktop toggle: `hidden lg:flex` (inchangé)
- Auto-close sur `searchCommitted` change (useEffect)

---

### Story 16.24: Live Mode Slider — Boutons − / + pour Ajustement Précis

> **Ajouté 2026-04-06** — Retour utilisateur Guillaume : en mode Live, le slider seul est difficile à manipuler précisément sur mobile (doigt sur petit thumb). Des boutons − / + permettraient un ajustement par pas discrets.

As a **cyclist in Live mode on mobile**,
I want − and + buttons on either side of the distance slider,
So that I can precisely adjust the "Mon hôtel dans X km" value without struggling with the slider thumb on a small screen.

**Acceptance Criteria:**

**Given** l'utilisateur est en mode Live et le panneau de contrôle s'affiche,
**When** le composant `LiveControls` est rendu,
**Then** un bouton `−` est visible à gauche du slider et un bouton `+` à droite, alignés verticalement au centre du slider.

**Given** le slider affiche une valeur de `targetAheadKm` supérieure au minimum (5 km),
**When** l'utilisateur tape le bouton `−`,
**Then** `targetAheadKm` diminue de `SLIDER_STEP` (5 km), et la valeur affichée ainsi que la position du thumb se mettent à jour immédiatement.

**Given** le slider affiche une valeur de `targetAheadKm` inférieure à `effectiveMax`,
**When** l'utilisateur tape le bouton `+`,
**Then** `targetAheadKm` augmente de `SLIDER_STEP` (5 km), et la valeur affichée ainsi que la position du thumb se mettent à jour immédiatement.

**Given** `targetAheadKm` est déjà au minimum (5 km),
**When** l'utilisateur tape `−`,
**Then** le bouton est visuellement désactivé (`opacity-50`, `cursor-not-allowed`) et aucune action ne se produit.

**Given** `targetAheadKm` est déjà à `effectiveMax`,
**When** l'utilisateur tape `+`,
**Then** le bouton est visuellement désactivé (`opacity-50`, `cursor-not-allowed`) et aucune action ne se produit.

**Technical notes:**
- Composant : `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx`
- Layout : `<div className="flex items-center gap-2 mb-8">` wrappant `bouton −` + `<Slider>` + `bouton +`
- Boutons : `h-8 w-8 rounded-full border border-primary text-primary` avec icônes `Minus` / `Plus` de lucide-react
- Step identique au slider : `SLIDER_STEP = 5`
- Clamp via `Math.max(5, targetAheadKm - SLIDER_STEP)` et `Math.min(effectiveMax, targetAheadKm + SLIDER_STEP)`

---

### Story 16.26: Live Mode — Auto-Zoom Slider + Cercle de Rayon de Recherche

> **Ajouté 2026-04-06** — Retour utilisateur Guillaume : en mode Live, le zoom par défaut est trop serré, le point cible "Mon hôtel dans X km" sort du viewport. Le cercle de recherche (`searchRadiusKm`) n'est pas matérialisé visuellement sur la carte.

As a **cyclist in Live mode**,
I want the map to auto-adjust its zoom when I change the distance slider, and to see a geographic circle showing the search radius around the target point,
So that I always see both my GPS position and the target point, and I can visualize the search area before launching a search.

**Acceptance Criteria:**

**Given** l'utilisateur est en mode Live avec GPS actif et `targetAheadKm` change (slider ou boutons − / +),
**When** la valeur de `targetAheadKm` se met à jour dans le store,
**Then** la carte ajuste automatiquement son zoom pour montrer à la fois la position GPS actuelle et le point cible, avec un padding suffisant pour que le cercle de rayon de recherche soit entièrement visible.

**Given** la carte s'auto-zoom après un changement de slider,
**When** l'ajustement est terminé,
**Then** l'animation est fluide (`easeTo` ~400ms), le panneau LiveControls en bas n'occulte pas le point cible (padding bottom ~240px).

**Given** un cercle géographique est rendu autour du target point,
**When** `targetKm` et `searchRadiusKm` sont définis,
**Then** un polygone circulaire semi-transparent (fill vert brand 8%, stroke vert brand 30%) est affiché, centré sur le target point, avec un rayon correspondant à `searchRadiusKm` en km réels.

**Given** le cercle de rayon est affiché,
**When** `searchRadiusKm` change (via le drawer filtres),
**Then** le cercle se met à jour immédiatement.

**Given** l'utilisateur pan ou zoom manuellement la carte,
**When** il interagit avec la carte (drag, pinch, scroll),
**Then** l'auto-zoom du slider est inhibé tant que l'utilisateur n'a pas cliqué "Recentrer GPS".

**Given** le slider est manipulé rapidement (plusieurs changements en <300ms),
**When** les valeurs changent en cascade,
**Then** seul le dernier changement déclenche un ajustement de zoom (debounce).

**Technical notes:**
- Composant principal : `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx`
- Cercle : polygone GeoJSON 64 segments (Haversine inverse), source `search-radius`, layers `search-radius-fill` + `search-radius-stroke`
- Auto-zoom : `fitBounds` avec bounds GPS→target expandés du `searchRadiusKm`, debounce 150ms
- Ordre layers : trace → cercle rayon → target dot → POIs → GPS dot

---

### Story 16.27: GPX Upload dans une Dialog (Popin)

> **Ajouté 2026-04-06** — Retour utilisateur Guillaume : le formulaire d'upload GPX s'affiche inline dans la page détail, ce qui casse le flow visuel. Il doit s'ouvrir dans une dialog (popin), cohérent avec le pattern de l'import Strava.

As a **cyclist on the adventure detail page**,
I want the GPX upload form to open in a dialog instead of appearing inline,
So that the upload flow is cleaner and consistent with the Strava import modal pattern.

**Acceptance Criteria:**

**Given** l'utilisateur est sur la page détail d'une aventure sans segments,
**When** la page s'affiche,
**Then** un bouton "Ajouter un segment GPX" est visible (remplace le formulaire inline) et ouvre une dialog au clic.

**Given** l'aventure a déjà des segments,
**When** l'utilisateur clique sur le bouton "+ Ajouter un segment",
**Then** une dialog s'ouvre avec le formulaire d'upload GPX.

**Given** la dialog d'upload est ouverte,
**When** l'utilisateur sélectionne un fichier .gpx et clique "Uploader le segment",
**Then** l'upload se lance, et à la réussite la dialog se ferme automatiquement.

**Given** la dialog d'upload est ouverte et un upload est en cours,
**When** l'utilisateur tente de fermer la dialog,
**Then** la dialog reste ouverte tant que l'upload n'est pas terminé.

**Technical notes:**
- Utiliser `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogFooter` de `@/components/ui/dialog`
- Pattern identique à `strava-import-modal.tsx`
- Bouton dans `DialogFooter` en `size="lg"` (convention WCAG)
- Retirer le wrapper `div.border.rounded-lg.p-4` de `GpxUploadForm` (le style vient de `DialogContent`)

---

### Story 16.28: Heure de Départ par Étape + Météo Ajustée

> **Ajouté 2026-04-06** — Retour utilisateur Guillaume : la météo des étapes utilise un seul horaire de départ global. Pour un voyage multi-jours, chaque étape a sa propre heure de départ (ex: 7h jour 1, 8h jour 2). La météo doit refléter ces horaires individuels.

As a **cyclist planning a multi-day adventure**,
I want to set a departure time for each stage,
So that the weather forecast shows the conditions I'll actually encounter when I ride each stage.

**Acceptance Criteria:**

**Given** l'utilisateur est sur la page planning avec des étapes définies,
**When** il consulte une étape dans la sidebar,
**Then** un champ "Départ" est visible sur chaque étape, affichant l'heure de départ configurée ou un placeholder "Définir" si non définie.

**Given** l'utilisateur saisit une date/heure de départ pour une étape,
**When** la valeur est soumise,
**Then** elle est sauvegardée via `PATCH /adventures/:adventureId/stages/:stageId` avec le champ `departureTime`.

**Given** une étape a une `departureTime` définie,
**When** la météo de cette étape est demandée,
**Then** l'API utilise la `departureTime` de l'étape pour calculer l'ETA au `endKm` : `stage.departureTime + (stage.distanceKm / speedKmh) × 3600000ms`.

**Given** une étape n'a PAS de `departureTime` définie,
**When** la météo est demandée,
**Then** le `departureTime` global (localStorage) est utilisé en fallback, ou l'heure actuelle si aucun n'est défini.

**Given** l'utilisateur modifie ou supprime la `departureTime` d'une étape,
**When** la valeur change,
**Then** le `StageWeatherBadge` se rafraîchit automatiquement.

**Technical notes:**
- Nouvelle colonne DB : `departure_time timestamp` nullable dans `adventure_stages`
- Migration via `drizzle-kit generate` obligatoire
- Priorité météo : `stage.departureTime` > `dto.departureTime` (global) > heure actuelle
- Calcul ETA stage : basé sur `stage.distanceKm` (longueur de l'étape), pas `stage.endKm` (km absolu)
- UI : `<input type="datetime-local">` ou bouton "Définir le départ" dans la sidebar étapes

---

### Story 16.31: Booking URL — Ajouter Région/Province et Pays au Paramètre de Recherche

> **Ajouté 2026-04-08** — Suite de 16.16 (city-based) et 16.21 (postal code). Enrichit le `?ss=` Booking avec région/province (`administrative_area_level_1`) et pays (`country`) pour éliminer les ambiguïtés géographiques restantes. Zéro coût API additionnel.

As a **cyclist using Booking.com deep links from the app**,
I want the Booking search URL to include the region/province and country alongside city and postal code,
So that search results always target the correct geographic location — even for ambiguous city names across countries.

**Format final :** `?ss={ville} {codepostal}, {région}, {pays}` — composants manquants omis (dégradation gracieuse).

**Acceptance Criteria:**

**Given** un POI hébergement avec Google Places details chargés,
**When** `getPlaceDetails()` retourne les `addressComponents`,
**Then** le `administrative_area_level_1` est extrait en `GooglePlaceDetails.adminArea` et le `country` en `GooglePlaceDetails.country`.

**Given** un POI hébergement avec `details.adminArea` et `details.country` disponibles (Google Places = source primaire),
**When** l'URL Booking est construite,
**Then** le `?ss=` vaut `{ville} {codepostal}, {région}, {pays}` (ex: `?ss=Valencia%2046001%2C%20Comunidad%20Valenciana%2C%20Spain`).

**Given** le `SearchOnDropdown` global (sidebar ou live — pas de POI spécifique),
**When** `useReverseCity` résout la zone via Geoapify,
**Then** le `state` et `country` Geoapify sont aussi retournés et inclus dans `?ss=`.

**Given** une ville disponible MAIS région ou pays absent (partiel),
**When** l'URL Booking est construite,
**Then** seuls les composants disponibles sont inclus (pas de virgules vides, pas de régression).

**Given** le cache Redis `geo:cityv2:`,
**When** le service est déployé,
**Then** la clé cache passe à `geo:cityv3:` avec `{ city, postcode, state, country }`. Anciennes entrées expirent en 7j.

**Technical notes:**
- Google Places : `addressComponents` déjà dans le fieldMask — extraction identique à `locality` / `postal_code`
- Geoapify : `state` et `country` déjà dans `results[0]` — ignorés jusqu'ici
- Chaîne priorité : Google Places (primary) → Geoapify reverse (fallback)
- Pas de fallback OSM pour region/country (`addr:state`/`addr:country` rarement renseignés)

---

## Epic 12: PWA & Offline Capability

> **Note 2026-03-18 : renommé depuis Epic 8 / Epic 11** — numérotation mise à jour suite à l'insertion des épics 8, 9 (App Shell, Redesign) et 11 (Stage Planning). Contenu inchangé.

Un utilisateur peut installer l'app sur son écran d'accueil, consulter sa dernière trace + POIs en mode offline partiel, et recevoir une notification push quand une analyse de densité est terminée.

### Story 11.1: PWA Manifest & App Install

As a **cyclist user on mobile**,
I want to install Ride'n'Rest on my home screen like a native app,
So that I can launch it instantly without going through the browser — especially useful on the road.

**Acceptance Criteria:**

**Given** a user visits the app on Chrome Android,
**When** the browser detects the Web App Manifest and Service Worker are present,
**Then** an "Ajouter à l'écran d'accueil" install prompt is shown by the browser (FR-070).

**Given** a user visits the app on iOS Safari,
**When** they use "Partager → Ajouter à l'écran d'accueil",
**Then** the app launches in `display: standalone` mode — browser chrome is hidden and `env(safe-area-inset-*)` safe areas are correctly applied.

**Given** the Web App Manifest is configured,
**When** it is validated by Lighthouse,
**Then** it includes: `display: standalone`, `theme_color: #2D6A4A` (brand primary green), `background_color: #FFFFFF`, maskable icon 512×512, standard icon 192×192, and `orientation: portrait`.

**Given** the app is installed and launched from the home screen,
**When** it opens,
**Then** the landing page loads and the PWA Lighthouse score is ≥ 85 on mobile (NFR-008).

**Given** the app is audited with Lighthouse on mobile 4G simulated,
**When** the audit runs,
**Then** FCP < 1.5s, LCP < 2.5s, CLS < 0.1, and initial JS bundle (gzipped) < 200 KB (NFR-001→004).

---

### Story 11.2: Service Worker & Partial Offline Support

As a **cyclist user with intermittent connectivity**,
I want my last loaded trace and POIs to remain accessible when I lose signal,
So that I can still consult the map and POI cards I already loaded — even without network.

**Acceptance Criteria:**

**Given** the Service Worker is registered (via `next-pwa` or custom SW),
**When** static assets (JS, CSS, fonts) are requested,
**Then** they are served from cache-first — no network request needed after initial load.

**Given** MapLibre tiles were previously loaded,
**When** the user goes offline and pans to an already-visited area,
**Then** tiles are served from the Service Worker cache (stale-while-revalidate, 7-day TTL) — the map remains navigable (FR-071).

**Given** a user previously loaded a trace and POIs for an adventure,
**When** they open that adventure's map page offline,
**Then** the GPX trace and last-loaded POI set are served from the Service Worker cache (network-first with offline fallback) — the map is readable (FR-071).

**Given** a user attempts an action requiring network (trigger density analysis, load new POIs) while offline,
**When** the action is requested,
**Then** the feature is visually disabled with a tooltip "Fonctionnalité disponible en ligne" — no error thrown (FR-073).

**Given** the app transitions from offline to online,
**When** connectivity is restored,
**Then** previously disabled features re-enable automatically and stale cached data is refreshed in the background.

---

### Story 11.3: Push Notifications for Density Analysis

As a **cyclist user**,
I want to receive a push notification when my density analysis is complete,
So that I can trigger the analysis, close the app, and be notified when the colorized map is ready — without keeping the tab open.

**Acceptance Criteria:**

**Given** a user triggers their first density analysis,
**When** the analysis job is enqueued,
**Then** a push notification permission prompt appears after the analysis starts — not at onboarding (FR-072).

**Given** the user grants push notification permission,
**When** le BullMQ job complète et `density_status: 'success'` est sauvegardé en DB,
**Then** a push notification is sent with title "Analyse terminée 🗺️" and body "Votre trace [adventure name] est prête — zones critiques identifiées."

**Given** the user denies push notification permission,
**When** the analysis completes,
**Then** an in-app notification is shown via TanStack Query polling (au prochain rechargement du composant) — no silent failure (FR-072).

**Given** the user receives the push notification while the app is in background,
**When** they tap the notification,
**Then** the app opens directly on the map page of the relevant adventure with the colorized trace already visible.

**Given** push notifications are not supported by the browser (e.g., iOS Safari < 16.4),
**When** the analysis completes,
**Then** the in-app notification (via polling au prochain focus de l'app) is the only channel used — no error is thrown for missing push support.

---

### Story 12.4: PWA Install Prompt — Mobile Banner

> **Ajouté 2026-04-06** — Bannière custom d'aide à l'installation PWA, visible uniquement sur mobile navigateur.

As a **cyclist user browsing on mobile**,
I want to see a discreet banner explaining how to install the app on my home screen,
So that I can quickly install Ride'n'Rest and use it like a native app — without guessing the browser-specific steps.

**Acceptance Criteria:**

**Given** a user visits the app on a mobile browser (Chrome Android, Safari iOS, Firefox Mobile),
**When** the page loads,
**Then** a collapsed banner appears at the bottom of the screen with "Pour une meilleure experience, installez Ride'n'Rest", a chevron to expand, and a close button (FR-070).

**Given** the collapsed banner is visible,
**When** the user taps the chevron,
**Then** the banner expands to show step-by-step install instructions for both iPhone/iPad (Safari) and Android (Chrome). A second tap collapses it.

**Given** a user has already installed the app and opens it in standalone mode (PWA),
**When** the app loads,
**Then** the banner is NOT shown — detected via `display-mode: standalone` media query or `navigator.standalone`.

**Given** the user taps the close button on the banner,
**When** it is dismissed,
**Then** it is NOT shown again for this browser (persisted in `localStorage`).

**Given** the user is on desktop (viewport >= 1024px),
**When** the page loads,
**Then** the banner is NOT shown.

---

## Epic 13: Marketing Assets & Production Polish

> **Ajouté 2026-03-18** — À réaliser après Epic 12 (PWA). L'app est installable et stable : on capture les vrais écrans pour remplacer les assets marketing basés sur les mockups AI (Desertus Bikus).

L'utilisateur qui découvre Ride'n'Rest voit la vraie application dans les vidéos et screenshots de la landing page — pas des mockups générés avec le mauvais nom d'app.

### Story 13.1: Capture des vrais assets app

As a **product owner**,
I want real screenshots and screen recordings of the finished app,
So that the marketing site shows the actual product experience — not AI-generated mockups.

**Acceptance Criteria:**

**Given** the app is in its final PWA state (Epic 12 complete),
**When** asset capture is performed,
**Then** screenshots are taken on iPhone (Safari) and Android (Chrome) for these key screens: liste aventures, carte avec POIs visibles, fiche hébergement ouverte, panneau filtres, mode Live avec GPS actif.

**Given** screenshots are captured,
**When** exported,
**Then** they are exported at 2× resolution minimum, in WebP format, stored in `apps/web/public/images/app-screens/`.

**Given** screen recordings are captured,
**When** exported,
**Then** key flows are recorded: onboarding GPX → première carte colorisée, recherche hébergement → tap pin → Booking deep link.

---

### Story 13.2: Mise à jour landing page avec vrais assets

As a **potential user discovering Ride'n'Rest**,
I want to see the real app in action on the landing page,
So that what I see matches exactly what I'll use after signing up.

**Acceptance Criteria:**

**Given** real app assets are captured (Story 13.1),
**When** the landing page is updated,
**Then** all GIFs/vidéos basés sur les mockups Desertus Bikus sont remplacés par les captures réelles — aucune référence à "Desertus Bikus" comme nom d'app ne subsiste.

**Given** `FeatureStepOne` and `FeatureStepTwo` are updated,
**When** rendered,
**Then** `feature-step-one-phone.svg` and `step2.gif` are replaced by real app screenshots/recordings — même layout, nouveaux assets.

**Given** any animation shows the app header,
**When** displayed,
**Then** the header shows "Ride'n'Rest" and the adventure name in the correct position.

---

### Story 13.3: Polish final landing + SEO de base

As a **user discovering Ride'n'Rest via search or social share**,
I want the landing page to be findable and share correctly,
So that links shared on Strava, Instagram, or WhatsApp show a preview that makes people want to click.

**Acceptance Criteria:**

**Given** the landing page is finalized,
**When** `<head>` metadata is reviewed,
**Then** the following are set: `<title>Ride'n'Rest — Trouve où dormir le long de ta trace</title>`, `<meta name="description">` (150 chars max), `og:title`, `og:description`, `og:image` (1200×630px), `og:url`, `twitter:card: summary_large_image`.

**Given** the `og:image` is set,
**When** a link is shared on WhatsApp, Strava, or Twitter/X,
**Then** a preview card appears with a real app screenshot — not a blank preview.

**Given** landing page copy is reviewed with real product in hand,
**When** any copy feels inaccurate vs. the real experience,
**Then** it is updated to reflect what the app actually does.

---

## Epic 14: VPS Hostinger Migration & Local Docker Environment

> **Ajouté 2026-03-21** — Migration du stack multi-plateforme (Vercel + Fly.io + Aiven + Upstash) vers un VPS Hostinger unique. Approche **hybride** : Docker pour les services infra (PostgreSQL+PostGIS, Redis, Caddy), Node.js natif pour les apps (Next.js, NestJS) via `turbo build` + `pm2` — même workflow qu'en local. Élimine la latence inter-services (3 datacenter hops → localhost), réduit les coûts (~$8/mois vs $20+), et supprime les limites free tier.

L'architecture VPS repose sur deux couches :
- **Docker Compose** pour les services infra : PostgreSQL+PostGIS, Redis, Caddy (reverse proxy + SSL auto), Uptime Kuma (monitoring)
- **Node.js natif** pour les apps : `pnpm install && turbo build && pm2 start` — identique au workflow de développement local

### Story 14.1: Docker Compose — Services infra (PostgreSQL, Redis, Caddy)

As a **developer**,
I want a `docker-compose.yml` that runs PostgreSQL+PostGIS, Redis, and Caddy,
So that the infrastructure services are easy to manage both locally and on the VPS, without manual installation of PostGIS or Redis.

**Acceptance Criteria:**

**Given** `docker compose up -d` is run (locally or on VPS),
**When** all services start,
**Then** PostgreSQL 16 + PostGIS 3.4 is accessible on `localhost:5432`, Redis 7 on `localhost:6379`, and Caddy on ports 80/443.

**Given** the `docker-compose.yml` is configured,
**When** inspecting service definitions,
**Then** PostgreSQL and Redis use named volumes (`pgdata`, `redisdata`) for data persistence across container restarts.

**Given** Caddy is configured via `Caddyfile`,
**When** running on the VPS,
**Then** `ridenrest.app` proxies to Next.js (`localhost:3011`), `api.ridenrest.app` proxies to NestJS (`localhost:3010`), with automatic HTTPS via Let's Encrypt.

**Given** Caddy is running locally,
**When** in development mode,
**Then** Caddy is either skipped (`docker compose up db redis` only) or configured for `localhost` without SSL.

**Given** environment variables are needed,
**When** `.env.example` is copied to `.env`,
**Then** all required variables are documented with sensible local defaults (`POSTGRES_USER=ridenrest`, `POSTGRES_PASSWORD=ridenrest`, `POSTGRES_DB=ridenrest`).

---

### Story 14.2: Configuration Node.js natif & PM2 — Apps en production

As a **developer deploying to the VPS**,
I want Next.js and NestJS to run as native Node.js processes managed by PM2,
So that the deployment workflow is identical to local development (`turbo build` + `pm2 start`) — no Dockerfiles needed for the apps.

**Acceptance Criteria:**

**Given** Node.js 22 LTS and pnpm are installed on the VPS,
**When** `pnpm install && turbo build` is run from the repo root,
**Then** both `apps/web` and `apps/api` build successfully — same as on the developer's Mac.

**Given** `next.config.ts` has `output: 'standalone'` configured,
**When** `turbo build` completes for `apps/web`,
**Then** the standalone output in `apps/web/.next/standalone/` can be started with `node apps/web/.next/standalone/server.js`.

**Given** a `ecosystem.config.js` (PM2 config) exists at the repo root,
**When** `pm2 start ecosystem.config.js` is run,
**Then** two processes are managed: `ridenrest-web` (Next.js standalone, port 3011) and `ridenrest-api` (NestJS `dist/main.js`, port 3010), both with `restart: always` and log rotation.

**Given** a Node.js process crashes,
**When** PM2 detects the crash,
**Then** the process is automatically restarted within 5 seconds, and the crash is logged.

**Given** the VPS reboots,
**When** the system starts,
**Then** PM2 is configured as a systemd service (`pm2 startup`) so both apps restart automatically.

---

### Story 14.3: Environnement de développement local unifié

As a **developer**,
I want to start the full stack locally with two commands: `docker compose up -d db redis` + `turbo dev`,
So that local development uses a real PostgreSQL+PostGIS and Redis instead of external services (Aiven, Upstash).

**Acceptance Criteria:**

**Given** `docker compose up -d db redis` is run,
**When** containers start,
**Then** PostgreSQL+PostGIS is accessible on `localhost:5432` and Redis on `localhost:6379` with the credentials from `.env`.

**Given** `turbo dev` is run after infra services are up,
**When** Next.js and NestJS start in dev mode,
**Then** `DATABASE_URL` points to the local PostgreSQL (`postgresql://ridenrest:ridenrest@localhost:5432/ridenrest`) and `REDIS_URL` to local Redis (`redis://localhost:6379`).

**Given** the developer modifies source code in `apps/api/` or `apps/web/`,
**When** the file is saved,
**Then** hot-reload works exactly as before (NestJS watch, Next.js Fast Refresh) — no Docker rebuild needed for app code.

**Given** `docker compose down -v` is run,
**When** volumes are destroyed,
**Then** all data is wiped; `drizzle-kit migrate` re-creates the schema on next `turbo dev`.

---

### Story 14.4: Backups PostgreSQL automatisés

As a **developer managing production data**,
I want automated daily PostgreSQL backups stored locally and optionally externally,
So that I can restore data in case of VPS failure or corruption.

**Acceptance Criteria:**

**Given** a cron job is configured on the VPS,
**When** the schedule triggers (daily at 03:00 UTC),
**Then** `docker exec ridenrest-db pg_dump --format=custom -U ridenrest ridenrest` creates a backup stored in `/opt/ridenrest/backups/` with the naming convention `ridenrest_YYYY-MM-DD_HH-MM.dump`.

**Given** backups accumulate,
**When** the retention script runs,
**Then** backups older than 14 days are automatically deleted to prevent disk exhaustion.

**Given** a backup exists,
**When** `pg_restore` is run against the PostgreSQL container,
**Then** the database is fully restored including PostGIS extensions, all tables, indexes, and data.

**Given** external backup is configured (optional),
**When** a backup is created,
**Then** it is uploaded via `rclone` to a free-tier cloud storage (Backblaze B2 10GB free or Cloudflare R2 10GB free).

---

### Story 14.5: CI/CD — Déploiement automatisé via GitHub Actions

As a **developer pushing to the main branch**,
I want an automated deployment pipeline that builds and deploys to the VPS via SSH,
So that production is updated without manual intervention.

**Acceptance Criteria:**

**Given** a push to `main` branch triggers the GitHub Actions workflow,
**When** the CI job passes (lint, build, test),
**Then** the deploy job connects to the VPS via SSH and runs: `cd /opt/ridenrest && git pull && pnpm install --frozen-lockfile && turbo build && pnpm drizzle-kit migrate && pm2 restart all`.

**Given** the deployment completes,
**When** PM2 process status is checked,
**Then** both `ridenrest-web` and `ridenrest-api` are in `online` status with uptime > 0.

**Given** the deployment fails (build error),
**When** the error is detected,
**Then** the workflow exits with failure status — PM2 keeps the previous running processes untouched.

**Given** GitHub Secrets are configured,
**When** the deploy job runs,
**Then** it uses: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` — no Vercel or Fly.io tokens needed.

---

### Story 14.6: Monitoring — Uptime Kuma

As a **developer managing a production VPS**,
I want basic monitoring and alerting via Uptime Kuma,
So that I know immediately if the app goes down or the VPS runs out of resources.

**Acceptance Criteria:**

**Given** Uptime Kuma is added to `docker-compose.yml`,
**When** the container starts,
**Then** its dashboard is accessible on a non-public port (e.g., `localhost:3001`) — exposed via Caddy on a subdomain (`status.ridenrest.app`) with basic auth.

**Given** monitors are configured,
**When** checking status,
**Then** Uptime Kuma monitors: HTTPS `ridenrest.app` (web), HTTPS `api.ridenrest.app/health` (API), PostgreSQL TCP `localhost:5432`, Redis TCP `localhost:6379`.

**Given** a monitored service goes down,
**When** 2 consecutive checks fail (60s interval),
**Then** a notification is sent (email or Telegram — at least one channel configured).

**Given** the VPS is running,
**When** disk usage exceeds 80% or RAM exceeds 90%,
**Then** an alert is triggered.

---

### Story 14.7: Migration des données & Décommissionnement des anciens services

As a **developer completing the VPS migration**,
I want to migrate existing data from Aiven/Fly.io to the VPS and decommission old services,
So that there is a single source of truth and no orphaned cloud resources generating future costs.

**Acceptance Criteria:**

**Given** PostgreSQL data exists on Aiven,
**When** migration is performed,
**Then** `pg_dump` from Aiven is restored on the VPS PostgreSQL container with all PostGIS extensions, tables, indexes, and data intact.

**Given** GPX files exist on Fly.io volumes,
**When** migration is performed,
**Then** all GPX files are transferred to the VPS `/data/gpx/` directory via `scp` or `rsync`, and file paths in the database remain valid.

**Given** the VPS is serving production traffic correctly,
**When** all smoke tests pass (auth, GPX upload, corridor search, POI display),
**Then** Vercel project is deleted (or downgraded), Fly.io app is destroyed, Aiven database is deleted, and Upstash instance is deleted.

**Given** DNS is updated,
**When** `ridenrest.app` resolves,
**Then** it points to the VPS IP (A record) — no CNAME to Vercel or Fly.io.

**Given** the existing `apps/api/Dockerfile` and `apps/api/fly.toml` are no longer needed,
**When** migration is complete,
**Then** they are removed from the repo (or moved to a `_deprecated/` folder for reference).

---

## Epic 15: Analytics & Affiliate Partnership Readiness

> **Ajouté 2026-03-23** — Epic transversal visant à accumuler dès le lancement les données nécessaires pour re-candidater au programme affilié Booking.com (refusé en early stage, voir mémoire projet) et piloter le produit par les données. Stack : **Plausible CE (Community Edition)** auto-hébergé sur VPS Hostinger (Docker), accessible sur `stats.ridenrest.app` via Caddy. Tracking actif dès le go-live — chaque semaine sans données = informations perdues pour la candidature Booking.com.

### Story 15.1: Plausible CE — Setup VPS & Intégration Next.js

As a **developer wanting to track app usage from day one**,
I want Plausible Community Edition running on the VPS with automatic pageview tracking in Next.js,
So that traffic data starts accumulating immediately at launch and can be used for Booking.com affiliate application.

**Acceptance Criteria:**

**Given** the `docker-compose.yml` is extended with Plausible CE services,
**When** `docker compose up -d plausible` is run on the VPS,
**Then** Plausible CE is running with its required ClickHouse and PostgreSQL dependencies, and accessible on `localhost:8000`.

**Given** Caddy is configured with a `stats.ridenrest.app` block,
**When** Plausible is running,
**Then** `https://stats.ridenrest.app` proxies to `localhost:8000` with automatic HTTPS via Let's Encrypt — protected by Plausible's built-in auth (admin account).

**Given** the `<PlausibleProvider>` component is added to `apps/web/src/app/layout.tsx`,
**When** any page is visited,
**Then** a pageview is automatically recorded in Plausible for that route — no manual instrumentation needed per page.

**Given** the Plausible script is loaded,
**When** inspected in browser DevTools,
**Then** the script is served from `stats.ridenrest.app/js/script.js` (self-hosted, not `plausible.io`) — ensuring no CORS issues and full data ownership.

**Given** the site domain is configured as `ridenrest.app` in Plausible,
**When** a user visits any page,
**Then** the visit is attributed to the correct domain with country, device, browser, and OS metadata.

---

### Story 15.2: Click Tracking Enrichi — Booking Deep Links (FR-062)

As a **developer building the Booking.com affiliate application**,
I want enriched custom event tracking on every booking link click,
So that I have granular data on which accommodations, POI types, and user segments generate the most booking intent.

**Acceptance Criteria:**

**Given** a user clicks a "Voir sur Booking.com" or "Voir sur Hotels.com" CTA in the POI detail sheet,
**When** the click event fires,
**Then** a Plausible custom event `booking_click` is sent with the following props: `{ source: 'booking.com' | 'hotels.com', poi_id: string, poi_name: string, poi_type: 'hotel' | 'hostel' | 'camp_site' | 'shelter', page: 'map' | 'live', user_tier: 'free' | 'pro' | 'team' | 'anonymous' }`.

**Given** the existing FR-062 implementation in Story 4.4 (basic click tracking),
**When** Story 15.2 is implemented,
**Then** the basic tracking from 4.4 is replaced by this enriched event — no duplicate events fired.

**Given** a `booking_click` event is fired,
**When** checking Plausible dashboard under "Custom Events",
**Then** the event appears with filterable props (source, poi_type, page, user_tier) — enabling segmentation for the Booking.com application report.

**Given** Plausible custom events are used,
**When** the implementation is reviewed,
**Then** no PII (Personally Identifiable Information) is sent in event props — only anonymized metadata — compliant with GDPR (NFR-016).

---

### Story 15.3: Funnel Tracking Complet — Parcours Utilisateur

As a **product owner wanting to understand user behavior**,
I want the full user journey tracked from GPX upload to booking click,
So that I can identify drop-off points and report a credible conversion funnel to Booking.com.

**Acceptance Criteria:**

**Given** a user uploads a GPX file successfully,
**When** the segment parse completes,
**Then** a Plausible custom event `gpx_uploaded` is sent with props: `{ segment_count: number, total_km: number }`.

**Given** a user opens the map view for an adventure,
**When** the map page loads with the trace displayed,
**Then** a custom event `map_opened` is sent with props: `{ adventure_id_hash: string }` (hashed, not raw ID — no PII).

**Given** a user triggers a POI search (changes km range or activates a layer),
**When** results are returned,
**Then** a custom event `poi_search_triggered` is sent with props: `{ mode: 'planning' | 'live', poi_categories: string[], result_count: number }`.

**Given** a user taps a POI pin and the detail sheet opens,
**When** the sheet is displayed,
**Then** a custom event `poi_detail_opened` is sent with props: `{ poi_type: string, source: 'overpass' | 'google' }`.

**Given** all funnel events are tracked,
**When** viewing Plausible's "Funnels" feature,
**Then** a configured funnel `gpx_uploaded → map_opened → poi_search_triggered → poi_detail_opened → booking_click` shows step-by-step conversion rates.

---

### Story 15.4: Dashboard Admin `/admin/analytics`

As **Guillaume (admin)**,
I want a protected `/admin/analytics` page in the app that surfaces key metrics for the Booking.com affiliate application,
So that I can quickly generate a snapshot report without navigating Plausible's full interface.

**Acceptance Criteria:**

**Given** a user navigates to `/admin/analytics`,
**When** their session is checked,
**Then** access is restricted to users with email `guillaume@ridenrest.app` (or a configurable `ADMIN_EMAILS` env var) — non-admin users receive a 403.

**Given** the page loads for an admin user,
**When** the dashboard renders,
**Then** the following metrics are displayed for the current month and the previous month (for comparison):
- Total unique visitors
- Total sessions
- Total `booking_click` events
- Booking click rate (booking_clicks / poi_detail_opened × 100%)
- Top 5 POI types by booking clicks
- Breakdown by source (booking.com vs hotels.com)

**Given** the metrics are displayed,
**When** inspecting the data source,
**Then** metrics are fetched from Plausible's Stats API (`/api/v1/stats/*`) using a `PLAUSIBLE_API_KEY` server-side environment variable — key never exposed to the browser.

**Given** an admin wants to export data for the Booking.com application,
**When** they click "Exporter CSV",
**Then** a CSV file is downloaded containing monthly aggregates: month, unique_visitors, sessions, booking_clicks, booking_click_rate — covering all available months since launch.

---

### Story 15.5: Admin Cache Invalidation by Geographic Zone

> **Déplacé depuis Story 10.4** (2026-03-27) — mieux regroupé avec les outils admin de l'Epic 15.

As a **system administrator**,
I want to purge the Redis cache for a specific geographic zone (bbox),
So that when a significant OSM data update occurs in a region, the stale POI and density cache can be invalidated without restarting the server.

**Acceptance Criteria:**

**Given** an admin needs to invalidate cache for a specific bbox,
**When** they call `DELETE /admin/cache/zone?minLat=42.0&minLng=-2.0&maxLat=43.5&maxLng=3.0`,
**Then** all Redis keys matching `pois:bbox:{keys within bbox}` and `density:troncon:{keys within bbox}` are deleted — response includes count of deleted keys.

**Given** the admin endpoint is created,
**When** accessed,
**Then** it is protected by a static `ADMIN_SECRET` header — not exposed in Swagger, not subject to `JwtAuthGuard`.

**Given** the zone invalidation runs on a large bbox,
**When** many keys match,
**Then** deletion is batched in groups of 100 using Redis `SCAN` + `DEL` pipeline — never uses `FLUSHDB`.
