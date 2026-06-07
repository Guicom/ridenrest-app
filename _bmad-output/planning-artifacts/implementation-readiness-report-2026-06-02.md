---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage-validation', 'step-04-ux-alignment', 'step-05-epic-quality-review', 'step-06-final-assessment']
readinessStatus: 'READY (avec 1 ajustement à faire avant Epic MOB-5)'
assessmentScope: mobile-native (Expo/React Native — iOS + Android)
documentsIncluded:
  - epics-mobile.md
  - architecture-mobile.md
  - prd.md (référence — FRs hérités web)
documentsExcluded:
  - epics.md (scope web)
  - epics-poi-access-routing.md (feature web)
  - epics-live-profile.md (feature web)
  - architecture.md (scope web)
  - architecture-poi-access-routing.md (feature web)
  - ux-design-specification.md (référence web — mobile en design-deferred)
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-02
**Project:** ridenrest-app
**Scope:** Application mobile native (Expo / React Native — iOS + Android)

## Étape 1 — Inventaire documentaire

### Documents trouvés (planning_artifacts)

| Document | Taille | Modifié | Type | Inclus dans l'évaluation |
|---|---|---|---|---|
| epics-mobile.md | 58.9K | 2026-06-02 18:06 | Epics & Stories | ✅ Cible |
| architecture-mobile.md | 66.1K | 2026-05-05 23:14 | Architecture | ✅ Oui |
| prd.md | 35.1K | 2026-04-07 18:43 | PRD (web hérité) | ✅ Référence FRs |
| epics.md | 181.2K | 2026-06-01 21:06 | Epics web | ❌ Scope web |
| epics-poi-access-routing.md | 72.5K | 2026-05-31 09:51 | Epics feature web | ❌ Hors scope |
| epics-live-profile.md | 16.4K | 2026-06-01 15:38 | Epics feature web | ❌ Hors scope |
| architecture.md | 55.3K | 2026-03-26 19:25 | Architecture web | ❌ Scope web |
| architecture-poi-access-routing.md | 90.3K | 2026-05-31 09:51 | Architecture feature web | ❌ Hors scope |
| ux-design-specification.md | 67.8K | 2026-03-26 19:25 | UX (web) | ⚠️ Référence — mobile en design-deferred |
| product-brief-ridenrest-app-2026-03-01.md | 17.8K | 2026-03-01 17:37 | Product brief | ℹ️ Contexte produit |

### Format
- **Aucun document _sharded_** : tous les artefacts sont des fichiers entiers. Aucun conflit « whole + sharded » à résoudre.

### Note de cadrage (duplicats apparents = scopes distincts)
Les multiples fichiers `epics-*` et `architecture-*` ne sont **pas** des doublons d'une même spec : ils représentent des périmètres distincts (web global, features web POI/Live-Profile, et mobile-natif). L'évaluation est **scopée mobile** : on retient `epics-mobile.md` + `architecture-mobile.md`, avec `prd.md` comme source des FRs hérités.

### Clarification design (résolue avec Guillaume avant Étape 2)
Intention confirmée : **« reprendre le design web déjà en place »**. Le doc `epics-mobile.md` a été précisé en conséquence :
- **`UX-DR-MOB-001`** : source canonique = tokens web existants (`apps/web/src/app/globals.css` `@theme`, vocabulaire shadcn, Montserrat, dark/light) + `poi-colors.ts` ; tokens mobiles = **extraction/miroir**, pas redéfinition.
- **Story MOB-1.3 (AC)** : ajout d'un AC explicite « extraction/miroir des valeurs web canoniques — zéro dérive visuelle ».
Constat technique : `packages/design-tokens/` n'existe pas encore (à créer), `packages/ui` est vide → « reprendre le design » = réutiliser le **langage visuel/tokens**, recréer les composants en natif.

---

## Étape 2 — Analyse du PRD

> **Source** : `prd.md` (PRD web, scope « PWA mobile-first », classification `web_app`). C'est le **catalogue d'exigences hérité** que `epics-mobile.md` réinterprète pour le natif (mêmes IDs `FR-0xx` / `NFR-0xx`). Les exigences purement mobiles (`FR-MOB-xxx`, `NFR-MOB-xxx`) et les features récentes (`FR-PA-xxx`, `FR-LP-xxx`) **ne figurent pas dans ce PRD** — elles sont nées après et sont portées par le Requirements Inventory d'`epics-mobile.md` (extraites à l'Étape 3).

### Functional Requirements (52 extraites)

**Auth & User Management**
- FR-001 : Créer un compte avec email et mot de passe
- FR-002 : S'authentifier via Google OAuth (1 clic)
- FR-003 : Connecter son compte Strava pour importer des activités GPX
- FR-004 : Se déconnecter de l'application
- FR-005 : Supprimer son compte — toutes les données effacées (RGPD)
- FR-006 : Maintenir la session entre les visites (persistent session)
- FR-007 : Réinitialiser son mot de passe par email

**Adventures & GPX Management**
- FR-010 : Créer une aventure nommée
- FR-011 : Ajouter un/plusieurs GPX comme segments ordonnés
- FR-012 : Réordonner les segments par glisser-déposer
- FR-013 : Supprimer un segment
- FR-014 : Remplacer un segment par un nouveau GPX
- FR-015 : Calculer/afficher distance totale + distances cumulatives par segment
- FR-016 : Importer une activité depuis Strava comme segment
- FR-017 : Renommer une aventure ou un segment
- FR-018 : Supprimer une aventure entière avec confirmation
- FR-019 : Notifier la fin du parsing d'un segment GPX

**Map & Visualization**
- FR-020 : Afficher la trace GPX sur carte interactive (MapLibre GL JS)
- FR-021 : Basculer thème carte sombre/clair
- FR-022 : Trace colorisée par tronçon (vert/orange/rouge) après analyse densité
- FR-023 : Activer/désactiver chaque calque POI (🏨/🍽️/🛒/🚲)
- FR-024 : Afficher les POIs en pins dans le viewport courant
- FR-025 : Taper un pin pour afficher la fiche détail POI
- FR-026 : Centrer auto la carte sur la trace sélectionnée
- FR-027 : Légende de colorisation accessible depuis la carte

**POI Search — Planification**
- FR-030 : Définir une plage kilométrique (km A → km B) pour rechercher
- FR-031 : Retourner les POIs dans un corridor géospatial autour du segment
- FR-032 : Fiche POI : nom, type, distance trace (m), kilométrage
- FR-033 : Fiche hébergement : deep-link paramétré Hotels.com / Booking.com
- FR-034 : Filtrer les POIs par catégorie sur la carte
- FR-035 : Déclencher une analyse de densité asynchrone
- FR-036 : Afficher l'attribution OpenStreetMap en permanence

**POI Search — Live / Aventure**
- FR-040 : Activer le mode Live — consentement géoloc explicite avant activation
- FR-041 : Détecter la position GPS en temps réel
- FR-042 : Saisir l'allure estimée (km/h) pour calibrer la fenêtre
- FR-043 : Afficher les POIs des prochains X km (position GPS + allure)
- FR-044 : Mise à jour auto des résultats à mesure que la position évolue
- FR-045 : Connexion instable → POIs partiels affichés + message d'état clair

**Weather Integration**
- FR-050 : Saisir heure de départ + allure en Planification
- FR-051 : Prévisions météo pace-adjusted à chaque point kilométrique
- FR-052 : Météo Live calculée selon position GPS + allure
- FR-053 : Données WeatherAPI.com (température, vent, précipitations, icône)
- FR-054 : Rafraîchissement auto des prévisions toutes les heures
- FR-055 : Fallback — sans allure, météo = heure actuelle au point

**External Integrations / Affiliates**
- FR-060 : Deep links paramétrés Hotels.com / Booking.com
- FR-061 : Liens affiliés identifiés visuellement (transparence)
- FR-062 : Tracer les clics sur les liens de réservation (analytics)
- FR-063 : Attribution "Powered by Strava" visible si données Strava affichées

**PWA & Offline** (web-spécifiques — réinterprétés natif)
- FR-070 : Installation sur écran d'accueil via mécanisme PWA → *natif = installation store*
- FR-071 : Trace + derniers POIs consultables offline partiel
- FR-072 : Notification push (opt-in) à la fin d'une analyse de densité
- FR-073 : Fonctionnalités réseau désactivées offline avec message explicite

**Total FRs (PRD) : 52**

### Non-Functional Requirements (29 extraites)

**Performance** — NFR-001 FCP <1.5s · NFR-002 LCP <2.5s · NFR-003 CLS <0.1 · NFR-004 bundle JS <200KB · NFR-005 parsing GPX serveur <10s · NFR-006 carte+trace <3s · NFR-007 latence Live ≤2s · NFR-008 score PWA Lighthouse ≥85
*(NFR-001→004 et 008 sont web/Lighthouse-spécifiques — non transposables tels quels en natif ; à requalifier côté mobile, cf. NFR-MOB-PERF).* 

**Security** — NFR-010 HTTPS TLS1.3+ · NFR-011 tokens stockés sécurisé · NFR-012 géoloc non persistée serveur (RGPD) · NFR-013 consentement géoloc explicite · NFR-014 secrets en env, jamais côté client · NFR-015 rate limiting API NestJS · NFR-016 politique de confidentialité publiée avant 1er usage

**Scalability** — NFR-020 API stateless (scaling horizontal) · NFR-021 cache Redis Overpass TTL 24h · NFR-022 jobs densité async (file d'attente) · NFR-023 supporte pics événements (16-100 users simultanés)

**Reliability** — NFR-030 uptime ≥99% · NFR-031 dégradation gracieuse Overpass indispo · NFR-032 zéro crash silencieux Live (feedback visible) · NFR-033 données aventure jamais perdues sur erreur parsing

**Integration Constraints** — NFR-040 rate limits Overpass (throttling/segment) · NFR-041 rate limits Strava (100/15min, 1000/j, alerte 80%) · NFR-042 quotas WeatherAPI (1M/mois) · NFR-043 CGU Strava (pas de stockage au-delà import) · NFR-044 attribution OSM permanente · NFR-045 CGU affiliés (URLs non modifiées)

**Total NFRs (PRD) : 29**

### Additional Requirements & Contraintes (PRD)
- **Compliance RGPD** : consentement géoloc, confidentialité au lancement, géoloc non persistée, droit à l'effacement (suppression compte = suppression aventures).
- **Licences** : OSM ODbL (attribution obligatoire), Strava (attribution + rate limits), WeatherAPI (free tier commercial OK), affiliés Expedia/Hotels.com (URLs non modifiées, rapport clics).
- **Innovation patterns** : Corridor Search (PostGIS ST_Buffer), densité visuelle sur la trace, météo pace-adjusted.
- **Périmètre** : MVP web avril 2026 ; app mobile native explicitement classée **Growth (post-MVP, été 2026)** dans ce PRD → le scope mobile actuel **réalise** cette ligne Growth.

### PRD Completeness Assessment
- ✅ **Structuré et complet** côté web : 52 FRs + 29 NFRs numérotés, success criteria mesurables, 4 user journeys, contraintes compliance/licences explicites.
- ⚠️ **PRD = web uniquement** : les NFRs `NFR-001→004, 008` (Lighthouse/CLS/bundle PWA) sont **web-spécifiques** et ne s'appliquent pas tels quels au natif → doivent être **requalifiés** en cibles mobiles (cold start, FPS scroll/carte, battery Live). À vérifier que `epics-mobile.md` couvre ce transfert (NFR-MOB-PERF).
- ⚠️ **Pas de PRD mobile dédié** : les exigences natives (capacités OS, conformité stores, OAuth deep-link, géoloc background, MapLibre Native, charting RN) n'existent **que** dans `epics-mobile.md`. La traçabilité Étape 3 devra donc valider la couverture sur **deux ensembles** : (a) FR/NFR hérités du PRD ci-dessus + (b) FR-MOB/NFR-MOB/FR-PA/FR-LP du Requirements Inventory d'`epics-mobile.md`.
- ℹ️ **Features récentes** (POI Access Routing `FR-PA`, Live-Profile `FR-LP`) postérieures au PRD → leur autorité documentaire est `epics-poi-access-routing.md` / `epics-live-profile.md` (web) + le Requirements Inventory mobile.

---

## Étape 3 — Validation de couverture des Epics

> Croisement des **52 FRs du PRD** + exigences mobiles (`FR-MOB`, `FR-PA`, `FR-LP`) contre les **6 epics / 33 stories** d'`epics-mobile.md` (FR Coverage Map + ACs des stories).

### Matrice de couverture — FRs hérités du PRD

| FR | Exigence (résumé) | Couverture epic/story | Statut |
|---|---|---|---|
| FR-001 | Signup email/mdp | MOB-2.2 | ✓ |
| FR-002 | Google OAuth | MOB-2.3 | ✓ |
| FR-003 | Strava OAuth | MOB-2.4 | ✓ |
| FR-004 | Déconnexion | MOB-2.5 | ✓ |
| FR-005 | Suppression compte (RGPD) | MOB-2.5 | ✓ |
| FR-006 | Session persistante | MOB-2.1 | ✓ |
| FR-007 | Reset mot de passe | MOB-2.2 | ✓ |
| FR-010 | Créer aventure | MOB-3.1 | ✓ |
| FR-011 | Ajouter GPX segments | MOB-3.2 | ✓ |
| FR-012 | Réordonner segments | MOB-3.3 | ✓ |
| FR-013 | Supprimer segment | MOB-3.3 | ✓ |
| FR-014 | Remplacer segment | MOB-3.3 | ✓ |
| FR-015 | Distances cumulées | MOB-3.3 | ✓ |
| FR-016 | Import Strava | MOB-3.4 | ✓ |
| FR-017 | Renommer aventure/segment | MOB-3.1 / 3.3 | ✓ |
| FR-018 | Supprimer aventure | MOB-3.1 | ✓ |
| FR-019 | Notif fin parsing | MOB-3.2 | ✓ |
| FR-020 | Trace sur carte | MOB-4.1 | ✓ |
| FR-021 | Thème carte dark/light | MOB-4.1 | ✓ |
| FR-022 | Trace colorisée densité | MOB-4.4 | ✓ |
| FR-023 | Calques POI toggle | MOB-4.2 | ✓ |
| FR-024 | Pins viewport | MOB-4.2 | ✓ |
| FR-025 | Tap pin → fiche | MOB-4.2 | ✓ |
| FR-026 | Centrage auto trace | MOB-4.1 | ✓ |
| FR-027 | Légende colorisation | MOB-4.4 | ✓ |
| FR-030 | Plage km | MOB-4.3 | ✓ |
| FR-031 | Corridor géospatial | MOB-4.3 | ✓ |
| FR-032 | Fiche POI (nom/type/dist/km) | MOB-4.2 | ✓ |
| FR-033 | Deep links Hotels/Booking | MOB-4.5 | ✓ |
| FR-034 | Filtre catégorie carte | MOB-4.2 | ✓ |
| FR-035 | Analyse densité async | MOB-4.4 | ✓ |
| FR-036 | Attribution OSM | MOB-4.1 | ✓ |
| FR-040 | Activer Live + consentement | MOB-5.1 | ✓ |
| FR-041 | GPS temps réel | MOB-5.2 | ✓ |
| FR-042 | Allure (km/h) | MOB-5.3 | ✓ |
| FR-043 | POI prochains X km | MOB-5.3 | ✓ |
| FR-044 | Maj auto résultats | MOB-5.3 | ✓ |
| FR-045 | POI partiels + message | MOB-5.3 | ✓ |
| FR-050 | Heure départ + allure | MOB-4.8 | ✓ |
| FR-051 | Météo pace-adjusted | MOB-4.8 | ✓ |
| FR-052 | Météo Live | MOB-5.6 | ✓ |
| FR-053 | Données WeatherAPI | MOB-4.8 | ✓ |
| FR-054 | Refresh horaire | MOB-4.8 | ✓ |
| FR-055 | Fallback heure actuelle | MOB-4.8 / 5.6 | ✓ |
| FR-060 | Deep links booking | MOB-4.5 | ✓ |
| FR-061 | Transparence affiliés | MOB-4.5 | ✓ |
| FR-062 | Tracking clics | MOB-4.5 | ✓ |
| FR-063 | "Powered by Strava" | MOB-3.4 | ✓ |
| FR-070 | Install PWA | — | ⛔ **Hors périmètre (décision)** → remplacé par install stores |
| FR-071 | Offline partiel PWA | MOB-3.5 (équiv. natif) | ⛔→✓ requalifié natif (`expo-file-system`) |
| FR-072 | Push densité (web) | MOB-6.2 (équiv. natif) | ⛔→✓ requalifié APNs/FCM |
| FR-073 | Désactivation offline | MOB-3.5 (équiv. natif) | ⛔→✓ requalifié natif |

### Matrice de couverture — exigences mobiles / features récentes

| Famille | IDs | Couverture | Statut |
|---|---|---|---|
| Capacités & fondation `FR-MOB` | 001,002,003,010,011,012,013,014,015,020,021,030,031,040,041 (**15**) | MOB-1/2/5/6 (mappés 1:1) | ✓ Tous couverts |
| POI Access Routing `FR-PA` (actifs) | 001,004,005,006,007,008,009,014,015,016,017,018,019,020 (**14**) | MOB-4.6 / MOB-4.7 | ✓ Tous couverts |
| Live Panel & Profil `FR-LP` | 001→012 (**12**) | MOB-5.4 / MOB-5.5 | ✓ Tous couverts |

### Couverture inverse (FRs dans les epics absents du PRD)
Attendu et sain : `FR-MOB-*` (capacités natives), `FR-PA-*` (feature POI Access postérieure), `FR-LP-*` (feature Live-Profile postérieure) n'existent pas dans le PRD web — ils proviennent de l'architecture mobile et des epics de features récentes. **Aucun FR orphelin/non traçable.**

### Couverture NFR (synthèse)
- NFRs PRD **transposés** : NFR-005/006/007 (perf), NFR-010/012/013/014/015/016 (sécu/RGPD), NFR-020→023 (scalabilité, inchangés backend), NFR-030→033 (fiabilité), NFR-040→045 (intégrations) — tous repris dans le Requirements Inventory mobile + ACs (ex. NFR-006 dans MOB-4.1, NFR-007/032 dans MOB-5.3, NFR-013 dans MOB-5.1, NFR-033 dans MOB-3.2).
- NFRs **non applicables** (assumé) : NFR-001→004, NFR-008 (FCP/LCP/CLS/bundle/Lighthouse PWA) — remplacés par NFR-MOB-PERF-01/02 (cold start, fps).
- NFRs **natifs ajoutés** : NFR-MOB-PERF-01/02/03, NFR-MOB-SEC-01, NFR-MOB-REL-01, NFR-MOB-INT-01/02/03, NFR-PA-001/009, NFR-LP-001/002.

### Statistiques de couverture
- **FRs PRD in-scope couverts : 48 / 48 = 100 %** (FR-001→063 hors PWA).
- **FRs PWA (FR-070→073)** : 4 — 1 abandonné pur (FR-070), 3 requalifiés en équivalents natifs (FR-071/072/073). Décision projet documentée.
- **FRs mobiles/features couverts : 41 / 41 = 100 %** (15 FR-MOB + 14 FR-PA + 12 FR-LP).
- **Total FRs tracés vers une story : 89.**
- **Aucun FR manquant (gap critique) — couverture complète.**

### ⚠️ Écarts mineurs détectés (traçabilité, non bloquants)
1. **Miscount dans le footer du doc** (ligne finale `epics-mobile.md`) : « 13 FR-MOB + 16 FR-PA actifs ». Décompte réel = **15 FR-MOB** et **14 FR-PA actifs**. Cosmétique — n'affecte pas la couverture (tous mappés). → corriger le total.
2. **NFR-LP-003 (cibles tactiles 44×44) et NFR-LP-004 (transition)** sont référencés dans les ACs (MOB-5.4) mais **absents du tableau NFR** du Requirements Inventory mobile (définis dans `epics-live-profile.md`). Ajouter une ligne de renvoi pour traçabilité.
3. **NFR-MOB-PERF-03 (battery drain Live)** = « À mesurer puis fixer cible » — NFR sans valeur cible. Acceptable en pré-implémentation, mais à transformer en cible mesurable avant la release (Epic MOB-6).

---

## Étape 4 — Alignement UX

### Statut du document UX
- **Pas de spec UX mobile dédiée** — pattern **design-deferred** assumé (décision `UX-DR-MOB-001`, clarifiée avec Guillaume : *reprendre le design web existant*).
- **`ux-design-specification.md` (web)** existe mais **exclu du scope mobile** (référence uniquement).
- **Exigences UX présentes inline** dans `epics-mobile.md` : `UX-DR-LP-001`, `UX-DR-LP-002`, `UX-DR-PA-001`, `UX-DR-MOB-001` + maquettes Claude Design pour la feature Live-Profile.

### UX ↔ PRD — alignement
- ✅ Thème dark/light : PRD §Accessibility ↔ MOB-1.3 / MOB-4.1.
- ✅ Légende textuelle colorisation (daltonisme) : PRD ↔ FR-027 / MOB-4.4.
- ✅ Cibles tactiles : PRD demande **48×48 px** ; epics/archi mobile retiennent **44×44 px** (Button `lg`, NFR-LP-003). Les deux respectent le minimum WCAG (44px) → **léger écart de valeur à harmoniser** (48 vs 44).
- ✅ Feedback réseau / 0 crash silencieux : PRD journeys ↔ MOB-3.2 / MOB-5.3.

### UX ↔ Architecture — alignement (architecture-mobile.md)
| Besoin UX | Brique architecture | Statut |
|---|---|---|
| Design system / tokens dark-light | NativeWind v4 + `packages/design-tokens/` | ✅ Décidé |
| Doc visuelle composants | Storybook RN web v8 | ✅ Décidé |
| Carte interactive (trace, pins, calques) | MapLibre RN v11 (New Arch) | ✅ Décidé + matrice compat validée |
| Fiche POI / bottom sheet | `@gorhom/bottom-sheet` v5 | ✅ Décidé |
| Transition « PROFIL » repliable | `react-native-reanimated` | ✅ Décidé |
| **Profil d'élévation interactif** (FR-LP-006→010) | **Lib charting RN — NON décidée** | ❌ **Gap** |

### ⚠️ Avertissements
1. **🔴 Gap architecture — lib de charting du profil d'élévation non tranchée.** Le profil d'élévation interactif Live (FR-LP-006→010, Story MOB-5.5) est une **fonctionnalité différenciante**, mais ni `architecture-mobile.md` ni `epics-mobile.md` ne sélectionnent la techno de rendu (`victory-native` / `skia` / `react-native-svg` restent « équivalent natif » à choisir). Recharts (web) n'est pas dispo en RN → re-implémentation requise. **Recommandation : décider avant d'attaquer MOB-5.5** (impacte perf NFR-LP-002, le marqueur de position, le zoom slider temps réel). Spike technique conseillé.
2. **🟠 Design-deferred = risque assumé mais à tracer.** Seule la feature Live-Profile dispose de maquettes ; **tous les autres écrans** (auth, aventures, carte, fiches) s'appuient sur l'app web live + les tokens comme référence visuelle, sans maquette mobile. Les *stories d'ajustement UI* réservées en fin de parcours (§ dédiée d'`epics-mobile.md`) sont le filet de sécurité — OK tant que cette dette est explicite.
3. **🟡 Incohérences de nommage des tokens dans l'architecture.** `architecture-mobile.md` mentionne à la fois `packages/design-tokens/` (l.296/322) et `packages/shared/design-tokens.ts` (l.629), et qualifie les tokens d'« alignés sur le design system Claude Design » (l.322) — alors que la décision clarifiée fixe la **source canonique = tokens web `globals.css`**. → Réconcilier le chemin du package et la formulation de la source canonique entre archi et epics (cohérence avec `UX-DR-MOB-001` / Story MOB-1.3 mis à jour).

### Verdict UX
**Alignement globalement solide** : besoins UX tracés et majoritairement supportés par l'architecture. **1 gap technique réel** (charting profil élévation) + **2 incohérences mineures** (cibles tactiles 48/44, nommage tokens). Aucun de ces points n'est bloquant pour démarrer Epic MOB-1, mais le gap charting doit être résolu avant Epic MOB-5.

---

## Étape 5 — Revue qualité des Epics & Stories

> Standards appliqués : valeur utilisateur, indépendance des epics, absence de dépendances *avant* (forward), sizing des stories, format BDD, traçabilité FR, timing création entités, exigence starter template (greenfield).

### Structure des epics — valeur utilisateur & indépendance

| Epic | Valeur utilisateur | Indépendance | Verdict |
|---|---|---|---|
| MOB-1 Fondation | ⚠️ Epic technique (init monorepo, EAS, tokens, i18n, tests) — **pas de valeur utilisateur directe** | Autonome (socle) | 🟡 Toléré (voir note) |
| MOB-2 Auth & Onboarding | ✅ L'utilisateur crée un compte / se connecte / gère son compte | Dépend de MOB-1 (backward) | ✅ |
| MOB-3 Aventures & GPX | ✅ Créer/gérer ses aventures | MOB-1 + MOB-2 (backward) | ✅ |
| MOB-4 Carte & Planif POI | ✅ Visualiser, chercher, planifier | MOB-3 (backward) | ✅ |
| MOB-5 Mode Live ⭐ | ✅ Expérience on-bike différenciante | MOB-4 (backward) | ✅ |
| MOB-6 Observabilité/Conformité/Release | ⚠️ Mixte : push = valeur user ; crash/analytics/release = ops/technique | Dernier, ne bloque rien | 🟡 Toléré (epic de release) |

**Ordonnancement** : MOB-1 → 2 → 3 → 4 → 5 → 6, dépendances **strictement backward**. ✅ **Aucune dépendance avant entre epics.**

### Conformité starter template (greenfield)
- ✅ **Architecture impose un starter** (`FR-MOB-001` : `pnpm create expo-app … --template with-router`). La règle BMAD exige alors que la 1ʳᵉ story de l'Epic 1 soit l'init depuis le starter → **Story MOB-1.1 fait exactement cela**. Conforme.
- ✅ Indicateurs greenfield présents : setup projet (MOB-1.1), env dev (MOB-1.1/1.4), pipeline de distribution tôt (MOB-1.2 EAS).

### Qualité des stories
- ✅ **Format BDD systématique** : les 33 stories ont `As a / I want / So that` + ACs `Given/When/Then`. Cohérence exemplaire.
- ✅ **Testabilité** : ACs spécifiques et mesurables (ex. « JWT via `expo-secure-store`, jamais AsyncStorage en clair », « latence GPS→POIs ≤ 2s », « cibles tactiles 44×44 px », « overlay scopé à la carte »).
- ✅ **Chemins d'erreur couverts** : OAuth annulé/échoué (MOB-2.3/2.4), parsing échoué + conservation données (MOB-3.2), consentement refusé (MOB-5.1), connexion instable/partielle (MOB-5.3), zéro résultat (MOB-4.3), pas de données d'élévation (MOB-5.5), push refusé → fallback (MOB-6.2). Solide.
- ✅ **Traçabilité FR** : chaque AC cite ses IDs FR. Excellent.
- ✅ **Timing entités** : backend partagé **inchangé** → l'app mobile ne crée aucune table ; aucun risque de « toutes les tables en amont ».
- ✅ **Indépendance intra-epic** : au sein de chaque epic, l'ordre des stories est backward (ex. MOB-2.1 session avant 2.2-2.5 ; MOB-4.1 carte avant 4.2-4.8).

### Constats par sévérité

#### 🔴 Critique
**Aucun.** Pas d'epic technique non justifié, pas de dépendance avant entre epics, pas de story non complétable.

#### 🟠 Majeur
1. **Dépendance inter-epics potentielle — `AppState` (FR-MOB-014).** La story **MOB-3.5** (cache offline) repose dans ses ACs sur la gestion `AppState`/NetInfo (« le réseau revient → données rafraîchies »), or la FR Coverage Map situe FR-MOB-014 « **MOB-5 (primaire)** / MOB-3 ». Si l'implémentation `AppState` n'est posée qu'en MOB-5, MOB-3.5 dépend d'un epic **postérieur** (forward dependency). → **Recommandation** : acter que la gestion `AppState` de base est **introduite là où elle est d'abord nécessaire (MOB-3.5)**, MOB-5 ne faisant que l'étendre au polling Live. Reformuler la coverage map en conséquence (« MOB-3 primaire / MOB-5 extension »).

#### 🟡 Mineur
2. **MOB-1 = epic technique sans valeur utilisateur directe.** Sanctionné par la règle starter-template (greenfield) → toléré. Une lecture BMAD stricte préférerait fondre une partie du socle dans le premier epic de valeur. Acceptable ici car socle natif incompressible (monorepo, Dev Client, EAS).
3. **MOB-1.2 mêle approvisionnement externe et code.** Provisionnement comptes Apple/Google (`FR-MOB-002`, achat + validation) = tâche non-code à **délai externe** → à **démarrer en amont** comme prérequis, indépendamment du code (même si validation Apple individuelle « quasi-immédiate »).
4. **Pas de story CI dédiée (tests automatisés en intégration continue).** Le pipeline couvre EAS Build (cloud) + Maestro smoke, mais aucune story ne pose un gate CI (lint + Jest + RNTL) sur PR. → Envisager un AC dans MOB-1.4 ou une story CI.
5. **Miscount du footer** (déjà noté Étape 3) : « 13 FR-MOB + 16 FR-PA » → réels **15** et **14**.
6. **Section « Stories d'ajustement UI (réservées) »** : placeholder non détaillé — acceptable car explicitement réservé en fin de parcours (cohérent avec design-deferred).

### Checklist conformité (synthèse)
- [x] Epics de valeur (MOB-2→5) centrés utilisateur — MOB-1/6 enablers tolérés
- [x] Indépendance epics (backward only)
- [x] Stories correctement dimensionnées
- [~] Pas de dépendance avant — **1 cas à clarifier (AppState MOB-3.5↔MOB-5)**
- [x] Entités créées au besoin (N/A — backend inchangé)
- [x] ACs clairs, testables, avec cas d'erreur
- [x] Traçabilité FR maintenue

---

## Synthèse & Recommandations

### Statut global de préparation
## ✅ PRÊT POUR L'IMPLÉMENTATION — avec 1 ajustement à faire avant Epic MOB-5

La planification mobile est **mûre et de haute qualité** : couverture FR complète, traçabilité exemplaire, stories BDD testables avec chemins d'erreur, architecture de support décidée et matrice de compatibilité validée. **Epic MOB-1 peut démarrer immédiatement.** Aucun défaut critique. Un seul point d'architecture (lib de charting) doit être tranché avant d'attaquer Epic MOB-5.

### Tableau de bord
| Dimension | Résultat |
|---|---|
| Documents | ✅ Cohérents, scope mobile clair, aucun doublon réel |
| Couverture FR PRD (in-scope) | ✅ **48/48 = 100 %** |
| Couverture FR mobiles/features | ✅ **41/41 = 100 %** (15 FR-MOB + 14 FR-PA + 12 FR-LP) |
| FR PWA | ⛔→✅ 1 abandonné, 3 requalifiés natif (décision documentée) |
| Alignement UX↔Archi | ✅ Solide — **1 gap** (charting profil élévation) |
| Qualité epics/stories | ✅ 0 critique · 1 majeur · 5 mineurs |
| Format BDD & testabilité | ✅ Exemplaire (33/33 stories) |

### Problèmes nécessitant une action

**🔴 Critique** : aucun.

**🟠 À traiter avant l'epic concerné :**
1. **[Avant MOB-5] Choisir la lib de charting du profil d'élévation interactif** (`victory-native` vs `@shopify/react-native-skia` vs `react-native-svg`). Ni l'archi ni les epics ne tranchent. Impacte FR-LP-006→010 + NFR-LP-002 (perf sous maj GPS fréquentes). → **Spike technique** recommandé. *Skia conseillé pour perf 60fps sous re-render fréquent, mais à valider.*
2. **[Avant MOB-3] Clarifier la propriété de `AppState` (FR-MOB-014)** : la poser « introduite au besoin en MOB-3.5, étendue en MOB-5 » pour lever la dépendance avant apparente.

**🟡 Corrections de traçabilité (rapides, non bloquantes) :**
3. Corriger le total en pied d'`epics-mobile.md` : **15 FR-MOB + 14 FR-PA actifs** (au lieu de 13 / 16).
4. Réconcilier le nommage du package tokens dans `architecture-mobile.md` (`packages/design-tokens/` vs `packages/shared/design-tokens.ts`) et la source canonique (« design system Claude Design » → préciser « tokens web `globals.css` canoniques », cohérent avec `UX-DR-MOB-001`/MOB-1.3 mis à jour).
5. Harmoniser la cible de cibles tactiles (PRD **48px** vs mobile **44px** ; les deux ≥ WCAG — figer une valeur).
6. Ajouter NFR-LP-003/004 (référencés en ACs MOB-5.4) au tableau NFR du Requirements Inventory mobile (renvoi vers `epics-live-profile.md`).
7. Envisager une story / un AC **CI** (lint + Jest + RNTL sur PR) en complément d'EAS Build + Maestro.
8. Transformer **NFR-MOB-PERF-03** (battery drain Live « à mesurer ») en cible chiffrée avant la release (Epic MOB-6).

### Prochaines étapes recommandées
1. **Démarrer Epic MOB-1** (Stories MOB-1.1 → 1.4) — rien ne bloque le socle. ⚠️ Lancer **en parallèle** le provisionnement comptes Apple/Google (délai externe).
2. Appliquer les corrections de traçabilité 🟡 (3→6) — édition rapide d'`epics-mobile.md` / `architecture-mobile.md`.
3. Planifier le **spike charting** pendant MOB-1/MOB-4 pour être prêt avant MOB-5.
4. Créer les fichiers de stories détaillées (`bmad-create-story`) au fil de l'eau, epic par epic, à partir de ce backlog validé.

### Note finale
Cette évaluation a identifié **0 problème critique, 1 problème majeur (charting), 1 dépendance à clarifier et 6 points mineurs**, répartis sur 5 dimensions. **Aucun n'empêche de commencer l'implémentation** : le seul point structurant (lib charting) n'intervient qu'à l'Epic MOB-5. La planification mobile est validée comme **prête**.

---
*Évaluation : Implementation Readiness (BMM v6.8.0) · Assesseur : Claude (PM) · Date : 2026-06-02 · Scope : mobile-native iOS+Android · Statut : PRÊT.*

---

## Addendum — Corrections appliquées (2026-06-02, post-évaluation)

Suite à validation par Guillaume, les points suivants ont été **résolus dans les docs** :

| # | Point | Sévérité initiale | Résolution |
|---|---|---|---|
| 1 | Lib charting profil d'élévation | 🟠 | **Décidé : `react-native-svg`** (un seul `<Path>` memoïsé, zoom = `viewBox`/`transform` animé via `react-native-reanimated` ; fallback Skia si jank). Acté dans `architecture-mobile.md` (tableau libs), `epics-mobile.md` (FR-LP-006 + AC Story MOB-5.5). |
| 2 | Dépendance avant `AppState` (FR-MOB-014) | 🟠 | FR Coverage Map reformulée : **introduit au besoin en MOB-3.5, étendu en MOB-5** → plus de forward dependency. |
| 3 | Miscount footer | 🟡 | Corrigé : **15 FR-MOB + 14 FR-PA actifs**. |
| 4 | Nommage/source tokens (archi) | 🟡 | `architecture-mobile.md` : chemin unifié `packages/design-tokens/`, source canonique = tokens web `globals.css` + `poi-colors.ts` (cohérent `UX-DR-MOB-001`). |
| 5 | Cibles tactiles 48 vs 44 | 🟡 | Tranché : **≥ 44×44 px** (HIG iOS, ≥ WCAG) retenu comme standard natif, supersède le 48px web → formalisé en **NFR-LP-003**. |
| 6 | NFR-LP-003/004 absents du tableau | 🟡 | Ajoutés au Requirements Inventory mobile (renvoi `epics-live-profile.md`). |
| 7 | CI (gate tests sur PR) | 🟡 | **Résolu.** AC ajouté à Story MOB-1.4 : `apps/mobile` déclare les tâches turbo `lint`/`test`/`typecheck` → exécutées auto sur chaque PR via le `--filter='*'` du CI existant (`.github/workflows/ci.yml`). Garde explicite : **aucun build natif Metro/EAS en GitHub Actions** (build = EAS cloud) ; Maestro E2E = pré-release. Titre Story MOB-1.4 mis à jour. |
| 8 | NFR-MOB-PERF-03 battery | 🟡 | **Résolu.** Cible initiale chiffrée : **≤ 10 %/h** (GPS background, écran éteint) — mesure sprint 0, figée après beta Espagne (avril 2026). AC mesurable ajouté à Story MOB-5.2 + leviers (intervalle GPS adaptatif, `distanceFilter`, pause `AppState`). |

**Tous les points (1→8) sont désormais traités. Aucun point ouvert.**

**Statut final : 🟢 PRÊT — backlog mobile validé et prêt à l'implémentation.**
