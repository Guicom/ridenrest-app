---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scope', 'step-09-functional', 'step-10-nfr', 'step-11-polish', 'step-12-completion']
classification:
  projectType: web_app
  subtype: PWA mobile-first
  domain: traveltech_outdoor
  complexity: medium-high
  projectContext: greenfield
  complianceRequirements: RGPD
  keyComplexityDrivers:
    - Algorithmes géospatiaux (PostGIS, corridor search, snap-to-trace)
    - Multi-API intégrations (Overpass, WeatherAPI, Strava OAuth, affiliés)
    - Jobs asynchrones (analyse densité, parsing GPX)
    - Temps réel (Supabase Realtime)
    - Géolocalisation live (mode Aventure)
inputDocuments:
  - '_bmad-output/planning-artifacts/product-brief-ridenrest-app-2026-03-01.md'
  - '_bmad-output/planning-artifacts/research/technical-hotel-booking-apis-gpx-research-2026-01-24.md'
workflowType: 'prd'
briefCount: 1
researchCount: 1
brainstormingCount: 0
projectDocsCount: 0
---

# Product Requirements Document - ridenrest-app

**Author:** Guillaume
**Date:** 2026-03-01

## Success Criteria

### User Success

1. **Recherche on-bike < 3 minutes** — de l'ouverture de l'app à la
   redirection vers la plateforme de réservation, en conditions réelles
   de fatigue et de connectivité variable.

2. **Identification des zones critiques < 10 minutes** — de l'import GPX
   au premier aperçu de la trace colorisée par densité d'hébergements,
   en phase de planification.

3. **Adoption en mode Live** — au moins une connexion en mode Aventure
   (géolocalisation active) enregistrée par beta-user pendant l'événement
   Espagne (avril 2026).

4. **Zéro perte de contexte** — si l'application rencontre une erreur
   ou une perte de connexion pendant une recherche active, l'utilisateur
   reçoit un feedback clair (message d'erreur, indicateur de chargement)
   et peut reprendre sans perdre ses données d'aventure.

---

### Business Success

**Phase Beta (Avril 2026)**
- 16 beta-users actifs sur l'événement Espagne
- Clics affiliés Hotels.com / Expedia tracés et mesurés
- Retours qualitatifs collectés pour itération post-événement

**Phase Croissance (Avril → Fin 2026)**
- Nombre d'aventures créées en hausse constante semaine sur semaine
- Nombre de connexions en mode Live (proxy d'usage on-bike réel)
- Trafic et engagement suffisants pour re-candidature Booking.com Affiliate
- Mentions organiques dans la communauté ultra-distance (blogs, réseaux)

**Milestone stratégique**
> Acceptation du programme affilié Booking.com → débloque intégration
> API prix/dispo temps réel et ouverture du tier payant Pro.

---

### Technical Success

| Critère | Cible | Contexte |
|---|---|---|
| Chargement carte + trace GPX | < 3s sur mobile 4G | Après import d'un fichier GPX |
| Parsing GPX serveur | < 10s | Fichiers jusqu'à 50 000+ points |
| Analyse densité (async) | Pas de limite — notification obligatoire à la fin | Job en arrière-plan, Supabase Realtime |
| Disponibilité (uptime) | ≥ 99% (~7h arrêt/mois max) | Critique pendant les événements actifs |
| Latence mode Live (géoloc → POIs) | ≤ 2s avec indicateur de chargement visible | Acceptable si feedback UX présent |
| Gestion d'erreur en recherche active | 0 crash silencieux | Message d'erreur + récupération gracieuse |
| Score PWA Lighthouse | ≥ 85 (Performance mobile) | Test sur mobile 4G simulé |

---

### Measurable Outcomes

- **Taux de complétion on-bike** : % d'utilisateurs qui ouvrent une
  recherche en mode Live et cliquent sur un lien de réservation
  (objectif : > 60% des sessions live)
- **Temps moyen de recherche** : mesuré via analytics, cible < 3 min
- **Aventures actives** : ratio aventures avec au moins 1 session Live
  vs aventures créées uniquement en planning

---

## Product Scope

### MVP — Minimum Viable Product (Avril 2026)

1. Authentification (email + Google OAuth + Strava OAuth)
2. Aventures multi-segments GPX (ajout, réordonnancement, suppression,
   remplacement) + import Strava
3. Carte MapLibre (dark/light) avec affichage trace et calques POI toggleables
4. Recherche POIs par plage kilométrique — Mode Planification
   (🏨 Hébergements / 🍽️ Restauration / 🛒 Alimentation / 🚲 Vélo)
5. Mode Aventure / Live : géolocalisation → POIs sur les prochains Xkm
6. Analyse de densité asynchrone avec trace colorisée (vert/orange/rouge)
   + notification de fin
7. Météo le long de la trace : mode Planification (heure départ + allure)
   et mode Live (GPS + allure), données WeatherAPI.com

### Growth Features (Post-MVP, Été 2026)

- App mobile native Expo (partage logique métier via monorepo)
- Export GPX enrichi (POI + alertes zones critiques)
- Mode offline partiel (trace + POIs mis en cache)
- Analytics affiliés avancés (taux de clic par plateforme, par type POI)

> Note : Komoot ne dispose pas d'API publique. L'import depuis Komoot
> se fait via export GPX manuel (déjà supporté dans le MVP via upload fichier).

### Vision (2027+)

- Intégration API Booking.com (tier Pro payant, après acceptation affiliate)
- Aventures publiques et partage communautaire
- Données communautaires sur la qualité des hébergements pour cyclistes
- Partenariats organisateurs d'événements (Transcantabrique, etc.)

---

## User Journeys

### Journey 1 — Thomas, Coureur Ultra : Parcours Succès (Planning → Live)

**Persona :** Thomas, 38 ans, ingénieur. Participe à la Transcantabrique
2026, 700 km en autonomie totale à travers le nord de l'Espagne.

**Scène d'ouverture — J-10, chez lui, 22h**
Thomas a son fichier GPX. Il a déjà fait le tour de Komoot pour mémoriser
le terrain. Mais il sait qu'il ne connaît pas les zones où il risque de
se retrouver sans lit. Il ouvre Ride'n'Rest pour la première fois.
Il crée une aventure "Transcantabrique 2026", importe son GPX depuis Strava
en 2 clics. La trace apparaît sur la carte. Il lance l'analyse de densité
et ferme son ordi. Demain matin, une notification : "Analyse terminée."

**Action montante — J-9, analyse des gaps**
La trace est colorisée. Thomas voit immédiatement deux zones rouges :
km 180-230 et km 450-490. Il zoome sur la première, lance une recherche
hébergements km 170-240. Trois pins. Il note mentalement le Hostal Rural
Cantábrico à km 215. Pas de réservation — trop tôt. Mais il sait.
En 8 minutes, il a cartographié tous ses points de risque.

**Climax — J+3, 17h22, sur le vélo, km 134**
La journée a mal tourné. Crevaison le matin, vent de face toute la journée.
Thomas pensait atteindre km 165. Il n'en peut plus. Il ouvre Ride'n'Rest,
géolocalisation activée, allure 14 km/h saisie. La carte affiche les
hôtels dans les 40 prochains km. Deux pins. Le premier : "Hostal Rural •
km 148 • 1,2 km hors trace". Il tape Hotels.com. Chambre disponible,
62€. Réservation confirmée en 3 minutes. Il repart.

**Résolution**
Thomas ne passe plus 20 minutes à jongler entre Komoot et Booking.
Il sait toujours où il peut s'arrêter. L'incertitude — la vraie fatigue
mentale d'une course longue — a diminué d'un cran.

**Capabilities révélées :** Import Strava, analyse densité async + notif,
carte colorisée, recherche par plage km, mode Live géoloc, fiche POI,
lien affilié Hotels.com, PWA mobile rapide.

---

### Journey 2 — Thomas : Edge Case — Connexion perdue en plein chargement

**Scène d'ouverture — J+5, zone rurale espagnole, 18h45**
Thomas ouvre Ride'n'Rest. Le réseau est au minimum — une barre de 3G
dans les Picos de Europa. Il saisit sa position estimée, tape "Chercher".
La carte commence à charger les pins... puis se fige. Rien.

**Action montante — la frustration montante**
Il est épuisé. Son téléphone est à 18% de batterie. Il ne peut pas se
permettre de perdre du temps. Il voit l'indicateur de chargement tourner.
5 secondes. 10 secondes. Puis un message clair : "Connexion instable.
Données partiellement chargées. Les 2 hébergements trouvés sont affichés.
Réessayer ?"

**Climax — récupération gracieuse**
Deux pins sont visibles. Pas les 5 qu'il aurait eu avec une bonne connexion,
mais deux. Il tape sur le premier. La fiche s'affiche — elle était déjà
en mémoire. Site web + lien Hotels.com. Il clique. La page s'ouvre.
La réservation passe. L'app n'a pas planté. Les données partielles ont suffi.

**Résolution**
Thomas n'a pas perdu 10 minutes à relancer une recherche depuis zéro.
L'app a communiqué honnêtement sur son état et rendu service malgré
les conditions dégradées.

**Capabilities révélées :** Indicateur de chargement visible, gestion
d'erreur réseau gracieuse, affichage partiel des résultats disponibles,
message d'état clair, mise en cache légère des fiches POI déjà chargées.

---

### Journey 3 — Sophie, Bikepacker Autonome : Planification d'un voyage solo

**Scène d'ouverture — 3 semaines avant son départ, un samedi matin**
Sophie a planifié son itinéraire sur Komoot depuis des semaines. Elle
exporte ses 4 fichiers GPX (4 jours, 4 étapes) et les importe dans
Ride'n'Rest. Elle crée une aventure "Pyrénées Est-Ouest". Elle réordonne
les segments, renomme chacun : "Jour 1 - Perpignan → Foix",
"Jour 2 - Foix → Saint-Girons"...

**Action montante — exploration**
Sophie ne cherche pas juste des hôtels. Elle veut comprendre l'ambiance
de chaque étape. Sur le Jour 1, elle bascule les calques : hébergements,
restaurants, alimentation. La carte s'enrichit. Elle voit qu'entre km 40
et km 55, il y a un restaurant et un supermarché groupés — parfait pour
une pause déjeuner. À km 78, deux gîtes ruraux. Elle explore les fiches,
clique sur les sites directement. Pas de pression, pas de réservation
immédiate — elle compare.

**Climax — la découverte**
La trace du Jour 3 est entièrement orange. Sophie ne s'y attendait pas.
Elle zoome : seulement un camping à km 112, rien d'autre sur 60 km.
Elle décide de réduire le Jour 2 et d'allonger le Jour 3 pour arriver
au camping avant la nuit. Elle modifie son plan — une décision qu'elle
n'aurait pas pu prendre sans cette vue d'ensemble.

**Résolution**
Sophie part avec une carte mentale précise de chaque étape. Elle sait
où manger, où dormir, où recharger. Elle a construit son voyage avec
Ride'n'Rest comme tableau de bord logistique.

**Capabilities révélées :** Multi-segments ordonnés, renommage segments,
calques POI toggleables (hébergements + restauration + alimentation),
fiches POI avec site direct, carte densité pour décision, modification
d'aventure itérative.

---

### Journey 4 — Nouveau Utilisateur : Premier Contact et Onboarding

**Scène d'ouverture — un forum bikepacking, un soir**
Marc lit un compte-rendu de course d'un participant à la Transcantabrique.
À la fin : "J'ai utilisé Ride'n'Rest pour trouver mes hôtels — ça m'a
économisé une heure par soir." Marc clique sur le lien. Il atterrit
sur la page d'accueil.

**Action montante — la curiosité**
La page montre une carte sombre avec une trace colorisée. Pas besoin
d'explications : le vert et le rouge parlent d'eux-mêmes. Un bouton :
"Commencer — c'est gratuit". Marc clique. Connexion Google en 1 clic.
Un écran simple : "Créez votre première aventure". Il entre un nom.
Il importe un GPX qu'il avait déjà téléchargé pour un futur périple.
La trace apparaît sur la carte en moins de 3 secondes.

**Climax — le moment aha!**
Marc clique "Analyser". Une minute plus tard, notif : "Analyse terminée."
La trace se colorise. Il voit immédiatement une section rouge de 80 km.
Ce n'est pas une app de carte. C'est un outil de décision. Il comprend
en 30 secondes ce que l'app fait et pourquoi il en a besoin.

**Résolution**
Marc crée son aventure, explore 2 zones, clique sur un lien Hotels.com.
Pas de tutoriel. Pas de friction. L'app lui a livré sa valeur en moins
de 5 minutes depuis la création du compte.

**Capabilities révélées :** Onboarding frictionless (OAuth 1 clic),
création aventure guidée, import GPX intuitif, affichage immédiat,
analyse densité rapide, carte auto-explicative, progressive disclosure.

---

### Journey Requirements Summary

| Journey | Capabilities critiques révélées |
|---|---|
| Thomas — Succès | Import Strava, analyse densité + notif, carte colorisée, mode Live géoloc, fiches POI, liens affiliés, PWA rapide |
| Thomas — Edge Case | Gestion erreur réseau gracieuse, affichage partiel, indicateurs chargement, 0 crash silencieux |
| Sophie — Planning | Multi-segments ordonnés, calques POI toggleables, carte densité pour décision, modification itérative |
| Nouveau Utilisateur | OAuth 1 clic, onboarding < 5 min, carte auto-explicative, progressive disclosure |

---

## Domain-Specific Requirements

### Compliance & Réglementaire

**RGPD (obligatoire — utilisateurs européens)**
- La géolocalisation en mode Live = donnée personnelle sensible selon le RGPD
- Consentement explicite requis avant activation de la géolocalisation
- Politique de confidentialité obligatoire au lancement
- Données de localisation non persistées au-delà de la session (pas de tracking)
- Droit à l'effacement : suppression du compte = suppression de toutes les aventures

### Contraintes Techniques / Licences

**OpenStreetMap — Licence ODbL**
- Données Overpass API sous licence Open Database License (ODbL)
- Attribution obligatoire dans l'interface : "© OpenStreetMap contributors"
- Les données dérivées (cache hébergements) restent sous ODbL

**Strava API — Conditions d'utilisation**
- Ne pas stocker les données d'activité Strava au-delà du besoin immédiat
- Attribution "Powered by Strava" requise si les données sont affichées
- Rate limits : 100 req/15 min, 1 000 req/jour — à monitorer
- Usage commercial autorisé sous Strava API Agreement

**WeatherAPI.com — Conditions commerciales**
- Free tier autorisé pour usage commercial ✅
- Attribution recommandée (non obligatoire sur free tier)
- 1M calls/mois — monitorer la consommation

### Contraintes Intégration Affiliés

**Expedia Affiliate Network / Hotels.com**
- Liens affiliés doivent être identifiables comme tels (transparence)
- Interdiction de modifier les URLs affiliées
- Rapport mensuel de clics requis selon les CGU du programme

### Risques & Mitigations

| Risque | Mitigation |
|---|---|
| Dépassement rate limit Overpass API | Cache Redis 24h + requêtes par segment, pas sur trace entière |
| Dépassement rate limit Strava API | Cache local de la liste d'activités (TTL 1h), lazy loading |
| Violation RGPD géolocalisation | Permission browser explicite, pas de stockage côté serveur |
| OSM attribution manquante | Attribution visible sur la carte à tout moment |

---

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Corridor Search Paradigm — rupture avec la recherche géospatiale standard**

La recherche d'hébergements traditionnelle fonctionne autour d'un point :
"chercher à Paris", "chercher dans un rayon de 10 km de X". Ride'n'Rest
introduit un paradigme différent : **la recherche le long d'un corridor**.

L'espace de recherche est une bande de terrain autour d'une portion de
trace GPX (km A → km B), filtrée par distance perpendiculaire. Ce n'est
pas une recherche circulaire — c'est une recherche topologique calée sur
un itinéraire réel. Aucun concurrent ne propose ce paradigme avec
intégration de liens de réservation.

Implémentation technique : PostGIS ST_Buffer sur un LineString
+ filtrage par distance cumulée = corridor polygon dynamique.

**2. Densité d'hébergements comme métadonnée visuelle de la trace**

La trace GPX elle-même devient un vecteur d'information logistique :
sa couleur encode la densité d'hébergements par tronçon (vert / orange /
rouge). Ce n'est pas une couche de fond ou une heatmap séparée —
c'est la trace qui parle. Lecture instantanée sans interaction.

Aucun outil de planification cycliste n'encode ce type d'information
directement sur la trace de l'itinéraire.

**3. Météo calée sur le passage réel (temporal pace adjustment)**

La météo affichée n'est pas "météo à cet endroit maintenant" mais
"météo à cet endroit quand vous y serez selon votre allure".
Combine géolocalisation ou heure de départ + allure déclarée +
interpolation temporelle des prévisions horaires.

EpicRide Weather fait cela (référence payante) — l'innovation ici est
l'intégration native dans un outil de planification logistique complet,
accessible gratuitement.

---

### Market Context & Competitive Landscape

- **Komoot / RideWithGPS** : navigation-first, POIs statiques, pas de
  corridor search, pas de lien booking. Positionnement délibérément
  différent — le terrain est intentionnellement laissé vacant.
- **EpicRide Weather** : pace-adjusted weather (payant, standalone),
  pas d'hébergements. Partiellement concurrent sur la météo uniquement.
- **Booking.com / Hotels.com** : search by city/point. Aucune notion
  de trace GPX ou de distance kilométrique.
- **Opportunité** : aucun outil ne combine corridor search + densité
  visualisée + météo temporelle + redirection booking en une seule app.

---

### Validation Approach

- **Beta Espagne (Avril 2026)** : 16 coureurs ultra — mesurer si la
  recherche corridor est préférée à une recherche par nom de ville
- **Métrique clé** : % de sessions où l'utilisateur utilise les bornes
  km (corridor) vs tape directement sur la carte (point search)
- **Validation densité** : temps moyen entre arrivée sur la carte et
  premier clic sur un hébergement (carte auto-explicative ?)

### Risk Mitigation

| Risque Innovation | Fallback |
|---|---|
| Corridor search trop abstrait pour les utilisateurs | Mode simplifié : tap sur la carte → POIs autour du point tapé |
| Colorisation trace peu lisible (daltonisme, conditions lumière) | Légende + icône de sévérité textuelle en complément de la couleur |
| Météo temporelle trop complexe à configurer | Fallback : météo à l'heure actuelle si pas d'allure saisie |



---

## Web App (PWA) Specific Requirements

### Browser Matrix

| Navigateur | Version minimum | Priorité | Contexte |
|---|---|---|---|
| iOS Safari | 16+ | **Primaire** | Utilisateurs iPhone en mobilité — usage on-bike dominant |
| Chrome Android | 110+ | **Primaire** | Utilisateurs Android en mobilité |
| Chrome Desktop | 110+ | Secondaire | Phase de planification depuis un ordinateur |
| Firefox Desktop | 110+ | Secondaire | Phase de planification |
| Safari macOS | 16+ | Secondaire | Phase de planification |
| Samsung Internet | 20+ | Tertiaire | Couverture Android étendue |

> **Décision** : Internet Explorer et les navigateurs < 2022 sont explicitement hors périmètre.
> PWA install prompt supporté nativement sur Chrome Android — iOS Safari via "Ajouter à l'écran d'accueil".

---

### Responsive Design

- **Mobile-first** : conception et tests prioritaires sur 390px (iPhone 14), puis 414px (Android standard)
- **Breakpoints** : 320px (SE) → 390px (mobile standard) → 768px (tablette) → 1280px (desktop)
- **Touch targets** : minimum 48×48px pour tous les éléments interactifs (boutons, pins carte, toggles)
- **iOS Safe Areas** : support obligatoire de `env(safe-area-inset-*)` — notch, Dynamic Island, home indicator
- **Gestes** : aucune interaction réservée au survol (hover) — tout accessible au tap
- **Carte MapLibre** : pinch-to-zoom, pan, double-tap zoom — comportements natifs préservés

---

### SEO Strategy

**Pages publiques (marketing) — SSG via Next.js**
- Page d'accueil (`/`) : landing page statique, SSG, indexée
- Page `/about` et pages légales : SSG, indexées
- Core Web Vitals trackés via Google Search Console
- Open Graph + Twitter Card meta sur toutes les pages publiques
- Structured data JSON-LD sur la page d'accueil (SoftwareApplication schema)

**Pages applicatives (post-authentification)**
- Toutes les routes sous `/app/` : `<meta name="robots" content="noindex, nofollow">`
- Pas de SSR pour les données utilisateur — rendu client ou SSR avec session
- URLs non indexées : `/app/adventures/*`, `/app/map/*`, `/app/settings/*`

**Structure Next.js App Router**
```
app/
  (marketing)/          # Route group — SSG, public, SEO
    page.tsx            # Landing page
    about/page.tsx
    privacy/page.tsx
    terms/page.tsx
  (app)/                # Route group — auth-required, noindex
    app/
      adventures/
        page.tsx        # Liste des aventures
        [id]/page.tsx   # Détail aventure
      map/[id]/page.tsx # Carte avec trace
      settings/page.tsx
  api/                  # API Routes Next.js (webhooks, auth callbacks)
  layout.tsx            # Root layout
```

---

### Real-Time Architecture

**Supabase Realtime — Notifications d'état**
- Canal dédié par `adventure_id` pour les updates de parsing et densité
- Événement `density_completed` → trigger re-render de la trace colorisée
- Événement `parse_completed` → affichage confirmation et activation des fonctionnalités de carte
- Reconnexion automatique en cas de perte réseau (Supabase Realtime WebSocket)

**Geolocation API — Mode Live**
- `navigator.geolocation.watchPosition()` avec `enableHighAccuracy: true`
- Consentement explicite avant tout appel (prompt navigateur + explainer UI)
- Arrêt automatique du watching à la sortie du mode Live
- Données de position non transmises au serveur — utilisées côté client uniquement pour le filtrage

**Optimistic UI**
- Mutations sur les aventures (ajout segment, réordonnancement) : optimistic update immédiat,
  rollback en cas d'erreur serveur
- Pas d'optimistic update pour les opérations de parsing GPX (asynchrones, résultats non prédictibles)

---

### PWA Capabilities

**Web App Manifest**
- `display: standalone` — supprime les chrome navigateur
- `orientation: portrait` (prioritaire) + `any` (desktop)
- Icônes : 192×192 et 512×512 (maskable + standard)
- `theme_color` : couleur primaire dark (`#1a1a2e`)
- `background_color` : fond splash screen

**Service Worker**
- Implémentation via `next-pwa` ou service worker custom
- Cache statique : assets JS/CSS/fonts (cache-first)
- Cache réseau : tiles MapLibre (stale-while-revalidate, 7 jours)
- Cache partiel : dernière trace GPX chargée + dernier set de POIs (network-first avec fallback offline)

**Mode Offline Partiel (MVP)**
- Trace GPX dernièrement affichée : lisible offline
- Dernier set de POIs chargé : consultable offline (fiches en lecture seule)
- Actions nécessitant le réseau désactivées avec message explicite ("Fonctionnalité disponible en ligne")
- Pas de synchronisation différée (offline-first complet reporté en Growth)

**Push Notifications (opt-in)**
- Notification unique : analyse de densité terminée
- Permission demandée après la première analyse, pas à l'onboarding
- Fallback : notification in-app via Supabase Realtime si push refusé

---

### Performance Targets (Web-Specific)

| Métrique | Cible | Outil de mesure |
|---|---|---|
| First Contentful Paint (FCP) | < 1.5s | Lighthouse (mobile 4G simulé) |
| Largest Contentful Paint (LCP) | < 2.5s | Lighthouse |
| Cumulative Layout Shift (CLS) | < 0.1 | Lighthouse |
| Bundle JS initial (gzippé) | < 200 KB | next build + bundle analyzer |
| Temps chargement carte + trace | < 3s | Mesure réelle sur device |
| Score PWA Lighthouse | ≥ 85 | Lighthouse PWA audit |
| Latence Live (GPS → POIs) | ≤ 2s | Mesure réelle sur 4G |

**Stratégies d'optimisation**
- Code splitting par route (Next.js automatic)
- Lazy loading des composants carte (dynamic import avec loading fallback)
- Images et icônes : WebP, SVG sprites pour les icônes POI
- Tiles MapLibre : lazy loading + cache navigateur 7 jours

---

### Accessibility

**Thème et contraste**
- Deux thèmes : Dark (défaut, adapté à l'usage outdoor nocturne) et Light
- Sélection via préférence utilisateur dans les settings, avec détection `prefers-color-scheme`
- Contraste texte/fond ≥ 4.5:1 (WCAG AA) sur les deux thèmes
- Colorisation de trace (vert/orange/rouge) : légende textuelle systématique en complément
  des couleurs (accessibilité daltonisme)

**Pages publiques (marketing)**
- WCAG AA : obligation pour les pages marketing indexées
- Navigation clavier complète sur la landing page
- Attributs `alt` sur toutes les images

**Pages applicatives**
- Best-effort WCAG AA pour le MVP (pas de blocage produit)
- Éléments interactifs de la carte : hors périmètre WCAG (MapLibre, limitation technique)
- Fiches POI et formulaires : attributs ARIA, labels associés aux inputs

---

## Scope Summary

### MVP — Avril 2026 (périmètre validé)

Le MVP cible l'événement Transcantabrique Espagne avec 16 beta-users. Toutes les
fonctionnalités listées ci-dessous sont **requises** pour le lancement :

1. **Auth** — Email/password, Google OAuth, Strava OAuth
2. **Aventures multi-segments** — Création, import GPX, réordonnancement, suppression,
   remplacement, import depuis Strava
3. **Carte interactive** — MapLibre (dark/light), trace GPX, calques POI toggleables
4. **Mode Planification** — Recherche POIs par plage kilométrique (corridor search),
   4 catégories (🏨 🍽️ 🛒 🚲), fiches avec deep links booking
5. **Mode Live/Aventure** — Géolocalisation → POIs sur les prochains X km, allure configurable
6. **Analyse de densité** — Job asynchrone + notification, trace colorisée vert/orange/rouge
7. **Météo** — WeatherAPI.com, pace-adjusted en Planning et Live

### Growth — Été 2026 (post-MVP)

- App mobile native Expo (monorepo partagé)
- Export GPX enrichi (POIs + alertes zones critiques)
- Mode offline partiel avancé (synchronisation différée)
- Analytics affiliés avancés (taux de clic par plateforme, par type POI)
- Réapplication programme Booking.com Affiliate après établissement du trafic

### Vision — 2027+

- Intégration API Booking.com temps réel (tier Pro payant, post-acceptation affiliate)
- Aventures publiques et partage communautaire
- Données communautaires sur qualité hébergements pour cyclistes
- Partenariats organisateurs d'événements (Transcantabrique, etc.)

> **Hors périmètre MVP** : app mobile native, export GPX, social/sharing, API Booking.com,
> tour guide audio, notification tracking Strava en temps réel.

---

## Functional Requirements

### Auth & User Management

| ID | Exigence |
|---|---|
| FR-001 | L'utilisateur peut créer un compte avec email et mot de passe |
| FR-002 | L'utilisateur peut s'authentifier via Google OAuth (1 clic) |
| FR-003 | L'utilisateur peut connecter son compte Strava pour importer des activités GPX |
| FR-004 | L'utilisateur peut se déconnecter de l'application |
| FR-005 | L'utilisateur peut supprimer son compte — toutes ses données sont effacées (RGPD) |
| FR-006 | L'application maintient la session utilisateur entre les visites (persistent session) |
| FR-007 | L'utilisateur peut réinitialiser son mot de passe par email |

---

### Adventures & GPX Management

| ID | Exigence |
|---|---|
| FR-010 | L'utilisateur peut créer une aventure nommée |
| FR-011 | L'utilisateur peut ajouter un ou plusieurs fichiers GPX à une aventure sous forme de segments ordonnés |
| FR-012 | L'utilisateur peut réordonner les segments d'une aventure par glisser-déposer |
| FR-013 | L'utilisateur peut supprimer un segment d'une aventure |
| FR-014 | L'utilisateur peut remplacer un segment par un nouveau fichier GPX |
| FR-015 | L'application calcule et affiche la distance totale de l'aventure et les distances cumulatives par segment |
| FR-016 | L'utilisateur peut importer une activité directement depuis son compte Strava en tant que segment |
| FR-017 | L'utilisateur peut renommer une aventure ou un segment individuel |
| FR-018 | L'utilisateur peut supprimer une aventure entière avec confirmation |
| FR-019 | L'application informe l'utilisateur par notification quand le parsing d'un segment GPX est terminé |

---

### Map & Visualization

| ID | Exigence |
|---|---|
| FR-020 | L'application affiche la trace GPX sur une carte interactive (MapLibre GL JS) |
| FR-021 | L'utilisateur peut basculer entre le thème carte sombre et clair |
| FR-022 | Après analyse de densité, la trace est colorisée par tronçon (vert/orange/rouge) selon la disponibilité d'hébergements |
| FR-023 | L'utilisateur peut activer/désactiver chaque calque POI indépendamment (🏨 Hébergements / 🍽️ Restauration / 🛒 Alimentation / 🚲 Vélo) |
| FR-024 | Les POIs sont affichés sous forme de pins sur la carte dans le viewport courant |
| FR-025 | L'utilisateur peut taper sur un pin pour afficher la fiche détail du POI |
| FR-026 | L'application centre automatiquement la carte sur la trace de l'aventure sélectionnée |
| FR-027 | Une légende de la colorisation de trace est accessible depuis la carte |

---

### POI Search — Mode Planification

| ID | Exigence |
|---|---|
| FR-030 | L'utilisateur peut définir une plage kilométrique (km A → km B) pour rechercher des POIs |
| FR-031 | L'application retourne les POIs situés dans un corridor géospatial autour du segment sélectionné |
| FR-032 | Chaque fiche POI affiche : nom, type, distance depuis la trace (m), kilométrage sur la trace |
| FR-033 | Chaque fiche hébergement affiche un lien deep-link paramétré vers Hotels.com et/ou Booking.com |
| FR-034 | L'utilisateur peut filtrer les POIs affichés par catégorie directement sur la carte |
| FR-035 | L'utilisateur peut déclencher une analyse de densité asynchrone sur une aventure |
| FR-036 | L'application affiche l'attribution OpenStreetMap sur la carte à tout moment |

---

### POI Search — Mode Live / Aventure

| ID | Exigence |
|---|---|
| FR-040 | L'utilisateur peut activer le mode Live — un consentement explicite de géolocalisation est demandé avant activation |
| FR-041 | En mode Live, l'application détecte la position GPS de l'utilisateur en temps réel |
| FR-042 | L'utilisateur peut saisir son allure estimée (km/h) pour calibrer la fenêtre de recherche |
| FR-043 | En mode Live, les POIs affichés sont ceux situés sur les prochains X km calculés depuis la position GPS et l'allure |
| FR-044 | Les résultats se mettent à jour automatiquement à mesure que la position évolue |
| FR-045 | En cas de connexion instable, les POIs partiellement chargés sont affichés avec un message d'état clair |

---

### Weather Integration

| ID | Exigence |
|---|---|
| FR-050 | En mode Planification, l'utilisateur peut saisir une heure de départ et une allure estimée |
| FR-051 | L'application affiche les prévisions météo calées sur l'heure d'arrivée estimée à chaque point kilométrique (pace-adjusted) |
| FR-052 | En mode Live, la météo est calculée en fonction de la position GPS et de l'allure déclarée |
| FR-053 | Les données météo proviennent de WeatherAPI.com (température, vent, précipitations, icône météo) |
| FR-054 | Les prévisions météo sont automatiquement rafraîchies toutes les heures |
| FR-055 | Fallback : si aucune allure n'est saisie, la météo affichée correspond à l'heure actuelle au point |

---

### External Integrations / Affiliates

| ID | Exigence |
|---|---|
| FR-060 | Les liens de réservation sont des deep links paramétrés vers Hotels.com et Booking.com |
| FR-061 | Les liens affiliés sont identifiés visuellement comme tels dans l'interface (transparence utilisateur) |
| FR-062 | L'application trace les clics sur les liens de réservation à des fins d'analytics |
| FR-063 | L'attribution "Powered by Strava" est visible quand des données d'activité Strava sont affichées |

---

### PWA & Offline

| ID | Exigence |
|---|---|
| FR-070 | L'application peut être installée sur l'écran d'accueil via le mécanisme PWA natif |
| FR-071 | La trace GPX et les derniers POIs chargés restent consultables en mode offline partiel |
| FR-072 | L'application envoie une notification push (opt-in) quand une analyse de densité est terminée |
| FR-073 | Les fonctionnalités nécessitant le réseau sont désactivées offline avec un message explicite |

---

## Non-Functional Requirements

### Performance

| ID | Exigence | Cible | Contexte de mesure |
|---|---|---|---|
| NFR-001 | First Contentful Paint | < 1.5s | Lighthouse mobile, 4G simulé |
| NFR-002 | Largest Contentful Paint | < 2.5s | Lighthouse mobile, 4G simulé |
| NFR-003 | Cumulative Layout Shift | < 0.1 | Lighthouse, pages marketing |
| NFR-004 | Bundle JS initial (gzippé) | < 200 KB | next build + analyzer |
| NFR-005 | Parsing GPX serveur | < 10s | Fichiers jusqu'à 50 000 points |
| NFR-006 | Chargement carte + trace | < 3s | Mobile 4G, post-import GPX |
| NFR-007 | Latence mode Live (GPS → POIs) | ≤ 2s | Mesure réelle sur 4G, indicateur visible |
| NFR-008 | Score PWA Lighthouse | ≥ 85 | Audit Lighthouse (mobile) |

---

### Security

| ID | Exigence |
|---|---|
| NFR-010 | Toutes les communications HTTP sont sécurisées en HTTPS (TLS 1.3+) |
| NFR-011 | Les tokens d'authentification sont stockés de manière sécurisée (httpOnly cookies ou Supabase session management) |
| NFR-012 | Les données de géolocalisation de l'utilisateur ne sont pas persistées côté serveur (RGPD — usage session uniquement) |
| NFR-013 | Un consentement explicite est requis avant toute activation de la géolocalisation |
| NFR-014 | Les API keys et secrets sont stockés en variables d'environnement, jamais exposés côté client |
| NFR-015 | Rate limiting activé sur les endpoints API NestJS (protection contre abus et DDoS) |
| NFR-016 | Politique de confidentialité publiée et accessible avant le premier usage (RGPD) |

---

### Scalability

| ID | Exigence |
|---|---|
| NFR-020 | L'architecture API est stateless pour permettre le scaling horizontal (Fly.io) |
| NFR-021 | Les résultats Overpass API sont mis en cache (Redis Upstash, TTL 24h) pour réduire la charge externe |
| NFR-022 | Les jobs d'analyse de densité sont exécutés de manière asynchrone (file d'attente — pas de blocking request) |
| NFR-023 | L'application supporte des pics de trafic lors des événements ultra-distance (baseline MVP : 16-100 utilisateurs simultanés) |

---

### Reliability

| ID | Exigence |
|---|---|
| NFR-030 | Disponibilité cible ≥ 99% (~7h d'arrêt max par mois) — critique pendant les événements actifs |
| NFR-031 | Dégradation gracieuse : si Overpass API est indisponible, un message d'erreur clair est affiché et l'utilisateur peut réessayer |
| NFR-032 | Zéro crash silencieux en mode Live : toute erreur réseau produit un feedback utilisateur visible |
| NFR-033 | Les données d'aventure (GPX, segments, métadonnées) ne sont jamais perdues suite à une erreur de parsing — l'erreur est reportée, les données précédentes conservées |

---

### Integration Constraints

| ID | Exigence |
|---|---|
| NFR-040 | Respecter les rate limits Overpass API — throttling automatique côté serveur, requêtes par segment (pas sur trace complète) |
| NFR-041 | Respecter les rate limits Strava API (100 req/15 min, 1 000 req/jour) — alertes de monitoring si seuil d'alerte atteint (80%) |
| NFR-042 | Respecter les quotas WeatherAPI.com (1M calls/mois) — dashboard de consommation interne |
| NFR-043 | Respecter les Conditions d'utilisation Strava API : ne pas stocker les données d'activité au-delà du besoin immédiat d'import |
| NFR-044 | L'attribution OpenStreetMap ("© OpenStreetMap contributors") est visible dans l'interface carte à tout moment |
| NFR-045 | Les liens affiliés respectent les CGU des programmes partenaires (Expedia, Hotels.com) — format des URLs non modifié |
