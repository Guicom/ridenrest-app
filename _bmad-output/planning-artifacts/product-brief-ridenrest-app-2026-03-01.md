---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - '_bmad-output/planning-artifacts/research/technical-hotel-booking-apis-gpx-research-2026-01-24.md'
date: '2026-03-01'
author: 'Guillaume'
project_name: 'ridenrest-app'
---

# Product Brief: ridenrest-app

## Executive Summary

Ride'n'Rest est l'outil manquant entre Komoot et Booking.com pour les
cyclistes ultra-distance. Là où les outils existants obligent à jongler
manuellement entre navigation et recherche d'hébergement — souvent épuisé,
téléphone à plat, dans un pays étranger — Ride'n'Rest affiche directement
les hébergements à proximité de la trace GPX et offre en un clic un accès
aux plateformes de réservation préférées de l'utilisateur.

---

## Core Vision

### Problem Statement

Les cyclistes longue distance (bikepacking, ultra-distance, courses
multi-jours) n'ont aucun outil intégré pour trouver des hébergements
sur leur trace GPX. Le workflow actuel les oblige à alterner entre une app
de navigation (Komoot) pour identifier des villes-étapes, et Booking.com
ou Airbnb pour y chercher un hébergement — un processus manuel et répétitif,
doublement pénible en cours de route où fatigue, batterie faible et noms
de villes étrangers s'accumulent.

### Problem Impact

**En planification :**
- Temps considérable perdu à croiser manuellement deux outils
- Risque de ne pas identifier les zones sans hébergement (gaps critiques
  sur des courses de plusieurs jours)
- Impossible de visualiser en un coup d'œil la logistique hébergement
  sur l'ensemble d'une aventure multi-étapes

**Sur le vélo :**
- Stress et friction cognitive au moment où les ressources mentales sont
  au plus bas
- UX mobile inadaptée : outils conçus pour desktop ou usage détendu
- Risque concret de se retrouver sans hébergement après une longue étape

### Why Existing Solutions Fall Short

- **Komoot** : navigation-first par positionnement délibéré. Les POIs
  d'hébergement sont statiques, non filtrables par distance, sans accès
  aux plateformes de réservation. Ne comblera pas ce manque — hors scope.
- **RideWithGPS** : même positionnement.
- **Booking.com / Airbnb** : recherche par ville uniquement, aucune notion
  de trace GPX ou de position kilométrique.
- **EpicRide Weather** : couvre la météo sur trace GPX (référence du marché)
  mais est payant, complexe, et ne traite pas la logistique hébergement.
- **Lacune commune** : aucun outil ne traite une course multi-jours comme
  une entité cohérente associant logistique GPX, hébergements et météo.

### Proposed Solution

Ride'n'Rest est une application web mobile-first (et mobile native en V2)
permettant aux cyclistes ultra-distance de :

1. Créer des **Aventures** composées d'une ou plusieurs traces GPX ordonnées
   (avec gestion complète : ajout, réordonnancement, remplacement, suppression)
2. **Analyser en amont** la densité d'hébergements sur l'ensemble d'une
   aventure (job asynchrone) avec carte colorisée par densité (vert / orange
   / rouge) — lecture logistique instantanée
3. Trouver des hébergements par **plage kilométrique** sur la trace, affichés
   sous forme de pins sur la carte avec :
   - Lien direct vers le site de l'établissement (si disponible)
   - Bouton **"Rechercher sur Booking.com"** (recherche directe)
   - Bouton **"Rechercher sur Hotels.com"** (lien affilié)
   - Bouton **"Rechercher sur Expedia"** (lien affilié)
4. Visualiser la **météo et le vent** le long du parcours avec prévisions
   calées sur l'heure estimée de passage, selon deux modes :
   - **Mode Planification** : heure de départ + allure moyenne (km/h) →
     prévisions calculées pour chaque waypoint selon l'heure d'arrivée estimée
   - **Mode Live** : géolocalisation active → détection de la position sur
     la trace et projection météo sur les waypoints restants selon l'allure

   Dans les deux cas : vent (direction + intensité), température, précipitations.

Ride'n'Rest ne gère ni la réservation ni le paiement : il met l'utilisateur
en contact avec les plateformes de son choix.

### Key Differentiators

1. **Recherche par distance sur trace** — "hébergements entre km 40 et 60"
   — élimine le context switch Komoot → Booking. Aucun concurrent ne propose
   cette approche avec redirection vers les plateformes de réservation.

2. **Carte de densité d'hébergements** — trace colorisée selon la densité
   (vert / orange / rouge) après analyse asynchrone. Lecture de la logistique
   en un coup d'œil, unique sur le marché.

3. **Météo calée sur le passage réel** — deux modes : heure de départ
   planifiée ou géolocalisation live, combinés à une allure moyenne déclarée.
   UX plus simple qu'EpicRide Weather (payant), native dans l'outil de
   planification.

4. **UX on-bike first** — conçue pour la fatigue, la batterie faible, les
   écrans en plein soleil. Thème d'interface (dark/light) et thème de carte
   configurables indépendamment.

5. **Aventures multi-segments** — gestion complète de plusieurs GPX liés
   là où Komoot propose des Collections sans gestion fine.

---

## Target Users

### Primary Users

#### Persona 1 — Le Coureur Ultra-Distance (cœur de cible)

**Profil type :** Thomas, 38 ans, ingénieur. Pratique le bikepacking
compétitif depuis 4 ans. Participe à 2-3 événements par an (Transcantabrique,
courses gravel longue distance). Roule seul ou en autonomie totale.
Utilise Komoot au quotidien, à l'aise avec les apps mais intransigeant
sur la simplicité mobile.

**En phase de planification (J-7 à J-1) :**
- Importe ses fichiers GPX (souvent plusieurs pour un événement multi-jours)
- Veut identifier en un coup d'œil les "zones blanches" — sections de
  100+ km sans hébergement qui nécessitent une stratégie particulière
- Repère 2-3 options d'hébergement par zone critique, sans réserver
  (trop de variables : il ne sait pas où il sera à J+3)
- Consulte les prévisions météo pour chaque étape

**En cours d'événement (usage on-bike) :**
- Improvise quotidiennement selon dénivelé réel, météo, fatigue, pannes
- À 17h, épuisé, il sait qu'il peut pousser encore 20-30 km ou s'arrêter
- Ouvre l'app, cherche ce qui existe dans cette fourchette sur la trace
- Clique sur Hotels.com ou Expedia, réserve en 3 minutes, repart
- Batterie souvent faible, connexion parfois limitée, noms de villes
  étrangers qu'il ne saurait pas orthographier dans un moteur de recherche

**Frustrations actuelles :**
- Jongle entre Komoot (villes) et Booking (hébergements) — deux apps,
  double friction, saisie manuelle de noms de villes
- Komoot ne montre pas la densité d'hébergements — il découvre les zones
  vides trop tard
- Booking/Airbnb ne comprennent pas sa logique "km sur trace" — il cherche
  par ville, pas par distance parcourue

**Moment "aha!" :** La première fois qu'il voit sa trace colorisée en rouge
entre km 180 et km 240 — avant même de partir, il sait qu'il doit anticiper
cette section. Ce que Komoot ne lui a jamais montré.

**Critères de succès :**
- Trouver et confirmer un hébergement en moins de 3 minutes sur le vélo
- Avoir identifié toutes les zones sans hébergement avant le départ
- Ne jamais avoir à saisir un nom de ville dans une app de réservation

---

#### Persona 2 — Le Bikepacker Autonome (segment secondaire immédiat)

**Profil type :** Sophie, 31 ans, graphiste. Fait 1 grand voyage
bikepacking par an (10-15 jours), auto-organisé, pas de course.
Planning plus serein, mais même complexité logistique. Apprécie l'aspect
découverte — veut des options, pas juste l'hébergement le moins cher.

**Usage dominant :** Planification. Crée son aventure semaines à l'avance,
explore les options, affine l'itinéraire en fonction des hébergements
disponibles. Utilise aussi l'app sur le vélo mais avec moins de pression.

**Valeur principale :** Visualiser les hébergements sur la trace pour
*construire* son itinéraire, pas juste le suivre.

---

#### Persona 3 — Le Cyclo-Touriste Ambitieux (segment tertiaire, V2)

**Profil type :** Marc, 52 ans, médecin. Fait 2-3 séjours vélo de 4-5
jours par an (70-100 km/j). Moins d'improvisation, plus de confort. Arrive
à Ride'n'Rest par recommandation d'un cycliste plus engagé.

**Usage dominant :** Planification uniquement. Réserve à l'avance, suit
son plan. Valeur : simplicité du workflow GPX → carte → hébergement.

---

### Secondary Users

Aucun utilisateur secondaire identifié pour le MVP. Les organisateurs
d'événements sont une piste V2 potentielle (recommander des hébergements
aux participants sur le parcours officiel), mais hors scope initial.

---

### User Journey — Thomas, Coureur Ultra (parcours principal)

**Phase 1 — Découverte**
Canal : bouche-à-oreille dans la communauté bikepacking, groupes Facebook
d'ultra-distance, forums spécialisés. Thomas entend parler de l'app par
un autre coureur avant un événement.

**Phase 2 — Onboarding**
Crée un compte (Google OAuth, 30 secondes). Crée son Aventure "Transcantabrique
2026". Importe 3 fichiers GPX (étapes J1, J2, J3). L'app les affiche
séquentiellement sur la carte.

**Phase 3 — Analyse pré-événement**
Lance l'analyse de densité. Attend 2-3 minutes (job async). La trace
s'affiche colorisée. Il voit immédiatement le rouge entre km 180 et km 240.
Il zoome sur cette zone, active la recherche d'hébergements, note les
2 options disponibles à km 185 et km 238. Il sait où il devra forcer ou
lever le pied ce jour-là.

**Phase 4 — Moment "aha!"**
La trace colorisée lui donne en 10 secondes ce que 45 minutes sur Komoot
+ Booking ne lui donnaient pas clairement. Il comprend immédiatement la
valeur du produit.

**Phase 5 — Usage on-bike (J+2 de l'événement)**
17h20. Thomas est à km 134, épuisé, 30 km plus tôt que prévu (pépins
mécaniques le matin). Ouvre Ride'n'Rest. Géolocalisation activée, allure
15 km/h saisie. Il voit la météo des 2 prochaines heures et les hôtels
entre km 140 et 165. Deux pins sur la carte. Il tape sur le premier,
voit "Hostal Rural • 2,3 km hors trace • site web + Hotels.com". Clique
Hotels.com. Réserve en 3 minutes. Repart.

**Phase 6 — Fidélisation**
Thomas utilise l'app pour son événement suivant. Il la recommande dans
son compte-rendu de course publié sur son blog. Devient vecteur de
croissance organique dans la communauté ultra.

---

## Success Metrics

### User Success Metrics

**Critères de succès utilisateur (Persona Thomas — Coureur Ultra) :**

1. **Recherche on-bike < 3 minutes** — de l'ouverture de l'app à la
   redirection vers Hotels.com/Expedia. Indicateur de fluidité UX dans
   les conditions de fatigue réelle.

2. **Identification des zones critiques < 10 minutes** — de l'import GPX
   au premier aperçu de la carte colorisée par densité. Indicateur de
   valeur immédiate en phase de planification.

3. **Connexions pendant les aventures actives** — l'utilisateur ouvre
   l'app alors qu'il est en cours d'événement (géolocalisation active ou
   usage en mode live). Indicateur de valeur réelle vs. usage planification
   uniquement.

---

### Business Objectives

**Phase 0 — Beta (Avril 2026, événement Espagne)**
- Valider les deux cas d'usage (planification pré-course + improvisation
  on-bike) avec le groupe de 16 coureurs
- Collecter des retours qualitatifs sur les frictions UX
- Générer les premiers clics affiliés Hotels.com / Expedia (traçabilité)

**Phase 1 — Construction de trafic (Avril → Octobre 2026)**
- Objectif stratégique prioritaire : accumuler du trafic qualifié et des
  données d'usage pour re-soumettre la candidature au programme affilié
  Booking.com
- Croissance organique via la communauté ultra-distance (comptes-rendus
  de course, groupes Facebook, forums bikepacking)
- Aucune monétisation forcée — maximiser l'adoption

**Phase 2 — Activation Booking.com (dès acceptation affiliate)**
- Intégration de l'API Booking.com (prix en temps réel, disponibilité)
- Lancement du tier payant : Free = données OSM + affiliés existants /
  Pro = API Booking.com complète
- Revenus : commissions sur réservations générées + abonnements Pro

---

### Key Performance Indicators

**Adoption & Engagement (indicateurs principaux)**

| KPI | Pourquoi ça compte |
|---|---|
| Nombre d'aventures créées (cumulé + hebdo) | Mesure l'adoption réelle du concept core |
| Connexions pendant aventures actives | Distingue planificateurs et utilisateurs on-bike |
| Clics sur liens affiliés Hotels.com / Expedia | Valide l'intention de réservation + génère du revenu |
| Taux de retour par aventure | Un utilisateur qui revient plusieurs fois planifie sérieusement |

**Croissance (indicateurs de trajectoire)**

| KPI | Pourquoi ça compte |
|---|---|
| Utilisateurs actifs mensuels (croissance semaine / semaine) | Santé de l'adoption |
| Mentions sur réseaux sociaux / forums / blogs | Signal de croissance organique dans la communauté |
| Traffic par source | Identifier les canaux communautaires les plus efficaces |

**Milestone stratégique clé**

> Dossier de re-candidature Booking.com Affiliate soumis avec données
> de trafic suffisantes pour acceptation. Ce milestone débloque le tier
> payant et la principale source de revenus.

---

## MVP Scope

### Core Features (IN)

**1. Authentification**
- Création de compte email + Google OAuth
- Connexion Strava (OAuth) — accès aux routes et activités enregistrées
- Profil utilisateur minimal (nom, préférence km/mi)

**2. Aventures & Gestion GPX**
- Création d'une aventure (nom, dates optionnelles)
- Import de fichier GPX local (upload)
- Import depuis Strava : parcourir routes et activités → sélection → import comme segment
- Affichage de tous les segments simultanément sur la carte
- Réordonnancement (drag & drop), suppression, remplacement de segment
- Distances cumulées recalculées automatiquement

**3. Carte & Affichage**
- MapLibre GL JS + tuiles OpenFreeMap
- Thème carte : dark / light (toggle indépendant de l'interface)
- Thème interface : dark / light (suit préférence système)
- Affichage trace GPX simplifiée (Ramer-Douglas-Peucker)
- Calques POI toggleables pour éviter la surcharge visuelle

**4. Recherche & Affichage de POIs — deux modes distincts**

Toutes les catégories utilisent Overpass API (OSM). Affichage par
calques toggleables sur la carte.

Catégories disponibles :
- 🏨 Hébergements (hôtel, hostel, camping, gîte)
- 🍽️ Restauration (restaurant, fast-food, café)
- 🛒 Alimentation (supermarché, épicerie, magasin alimentaire)
- 🚲 Vélo (magasin vélo, réparateur, station réparation)

**Mode Planification (web + mobile, avant l'aventure)**
- Saisie : km de départ / km de fin / distance max hors-trace
- Sélection des calques à afficher
- Pins catégorisés sur la carte + fiche POI (nom, type, site si dispo)
- Hébergements : boutons Booking.com (deep link) / Hotels.com (affilié) / Expedia (affilié)

**Mode Aventure / Live (mobile, pendant l'événement)**
- Géolocalisation GPS → détection de position sur la trace
- Fenêtre : prochains X km depuis la position actuelle (défaut 40km)
- Calques sélectionnables selon le besoin du moment
- UX ultra-simplifiée : grands éléments tactiles, lecture rapide

**5. Analyse de densité — trace colorisée**
- Bouton "Analyser l'aventure" → job asynchrone
- Trace colorisée : vert / orange / rouge par tronçon de 20km (hébergements)
- Résultats persistés (pas de recalcul à chaque visite)
- Notification quand l'analyse est terminée (Supabase Realtime)

**6. Météo le long de la trace**
- Mode Planification : météo pour le segment sélectionné uniquement
  → heure de départ + allure (km/h) → météo estimée à l'heure de passage
- Mode Live : météo pour les X prochains km depuis la position GPS
  (défaut 80km, configurable) + allure → projection horaire
- Données : WeatherAPI.com (vent direction + intensité, température, précipitations)
- Affichage tous les 25km sur la portion concernée

---

### Out of Scope pour le MVP

| Feature | Raison | Horizon |
|---|---|---|
| App mobile native (Expo) | Web first — Mode Live fonctionne en PWA | V2 |
| API Booking.com (prix + dispo) | En attente acceptation affilié | Dès acceptation |
| Freemium / paiement Stripe | Dépend de Booking.com affilié | V2 |
| Aventures publiques / partage | Hors scope (décision explicite) | V2 |
| Offline / cache local | Complexité, non critique pour l'événement | V2 |
| Bike-friendly filter | Pas de source de données fiable | Dépend APIs |
| Export GPX enrichi | Utile mais non critique pour l'événement | V1.1 |
| Import Komoot direct | Export GPX manuel suffisant | V1.1 |

---

### MVP Success Criteria

✅ **Go** si :
- Les 16 beta-users ont créé leur aventure et utilisé la recherche on-bike (Mode Live)
- Au moins 1 connexion en mode Aventure enregistrée par utilisateur
- Clics affiliés Hotels.com / Expedia tracés
- Temps de recherche on-bike < 3 minutes validé sur le terrain

⛔ **No-Go** (itérer avant de scaler) si :
- Mode Live trop lent ou imprécis (géolocalisation / snap-to-trace)
- Données OSM insuffisantes sur les zones de l'événement Espagne
- Friction à l'onboarding > 5 minutes (import GPX ou Strava)

---

### Future Vision

**V2 — Post-événement (Été 2026)**
- App mobile native Expo (code logique partagé via monorepo)
- Export GPX enrichi (POI hébergements + alertes zones critiques)
- Mode offline partiel (trace + POIs mis en cache)
- Import Komoot direct

**V3 — Après acceptation Booking.com affiliate**
- API Booking.com (prix temps réel, disponibilité)
- Tier payant : Free (OSM) / Pro (Booking.com)
- Aventures publiques et partage communautaire
- Partenariats organisateurs d'événements

**Vision long terme**
- Référence logistique de la communauté bikepacking ultra-distance Europe
- Données communautaires sur la qualité des hébergements pour cyclistes
- Intégration d'autres plateformes de planification (Komoot, RideWithGPS)



