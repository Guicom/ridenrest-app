---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories']
status: 'draft'
completedAt: '2026-06-01'
inputDocuments:
  - '_bmad-output/project-context.md'
  - 'apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx'
  - 'apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx'
scope: 'feature-live-profile'
project_name: 'ridenrest-app'
user_name: 'Guillaume'
date: '2026-06-01'
---

# ridenrest-app — Epic Breakdown : Mode Live — Panneau de recherche & Profil d'élévation interactif

## Overview

Ce document décompose la feature **`epic-live-profile`** : la **refonte du panneau de recherche du mode Live** (« MON HÔTEL DANS X km ») et l'intégration d'un **profil d'élévation interactif repliable** à l'intérieur de ce panneau.

**Contexte / problème** : le panneau de recherche Live actuel (`live-controls.tsx`) est **visuellement encombré** (ligne D+/D-/ETA dense, métriques peu hiérarchisées) et il **manque l'information de profil d'élévation** directement dans la zone d'action. En planning, l'utilisateur dispose d'un profil d'élévation interactif riche (`elevation-profile.tsx`, Recharts, surlignage de la zone de recherche) ; en Live il n'a qu'un mini-bandeau (`elevation-strip.tsx`, 60 px mobile) déconnecté du panneau.

**Objectif** : aligner le panneau Live sur les maquettes Claude Design fournies — désencombrer le layout et ajouter une section **« PROFIL »** repliable contenant un profil d'élévation contextualisé sur la **position GPS de l'utilisateur** (début), la **zone recherchée** (surlignage, comme en planning) et un **horizon ~100 km** au-delà de la cible. La section s'**ouvre dès qu'on touche le slider**, **zoome/dézoome** selon la distance cible, et se **referme au clic sur « Rechercher »**.

**Maquettes de référence** (fournies par Guillaume, 2026-06-01) :
- _Maquette 1 (état replié)_ : en-tête « PROFIL » + chevron vers le haut, **séparation (`border-b`) sous l'en-tête**, bloc « MON HÔTEL DANS », slider −/+, métriques propres `↑107 m · ↓59 m · ~2h00` **sous le slider**, boutons RECHERCHER / RECHERCHER SUR.
- _Maquette 2 (état ouvert)_ : même panneau avec le graphe de profil d'élévation (et un marqueur de position) déployé dans le conteneur repliable, sous l'en-tête « PROFIL ».
- ⚠️ _Ajustement layout (Guillaume, 2026-06-01, en cours de Story 1)_ : la ligne de métriques `↑/↓/~` est placée **sous le slider** (pas au-dessus de « MON HÔTEL DANS »), et une **séparation visuelle** est ajoutée sous l'en-tête « PROFIL ». Voir Story live-profile.1 AC1.

**In scope** :
- Refonte du layout du panneau Live (decluttering selon maquettes).
- Conteneur « PROFIL » repliable + comportement piloté par l'interaction (replié par défaut, ouverture au slider, fermeture à la recherche, chevron manuel).
- Profil d'élévation interactif dans le panneau : début = position GPS, surlignage zone recherchée, fin ~100 km après la cible, zoom dynamique piloté par le slider.
- Fusion / remplacement de l'`ElevationStrip` mobile par la nouvelle section.

**Out of scope** :
- Toute modification du calcul d'accès POI / BRouter (cf. `epic-poi-access`).
- Toute modification du contrat API ou du store côté données POI.
- Le profil d'élévation du mode **Planning** (`elevation-profile.tsx`) reste tel quel ; il est **réutilisé**, pas refondu.
- L'arrière-plan carte, le suivi GPS et l'auto-zoom carte (`fitToSearchZone`) — inchangés (la section profil ne pilote pas la caméra carte).

---

## Requirements Inventory

### Functional Requirements

FR-LP-001 : Le panneau de recherche Live est refondu pour correspondre aux maquettes : métriques hiérarchisées `↑D+ · ↓D- · ~ETA` lisibles, en-tête « PROFIL » avec chevron, slider entouré des boutons −/+, et boutons « RECHERCHER » / « RECHERCHER SUR » en pied. L'encombrement visuel actuel (ligne D+/D-/ETA dense) est supprimé.

FR-LP-002 : Au chargement du mode Live et après chaque recherche, la section « PROFIL » est **repliée par défaut** (seul l'en-tête « PROFIL » + chevron est visible).

FR-LP-003 : Dès que l'utilisateur **touche le slider** (première modification de `targetAheadKm` depuis l'état replié), la section « PROFIL » s'**ouvre automatiquement**.

FR-LP-004 : Lorsque l'utilisateur clique sur « RECHERCHER », la section « PROFIL » se **referme**.

FR-LP-005 : L'utilisateur peut **ouvrir/fermer manuellement** la section « PROFIL » via le chevron de l'en-tête, indépendamment du slider.

FR-LP-006 : La section « PROFIL », lorsqu'elle est ouverte, affiche un **profil d'élévation interactif** rendu à partir des données de la trace fusionnée de l'aventure (réutilise le composant `ElevationProfile` du mode planning et le hook `useElevationProfile`).

FR-LP-007 : Le **début** (bord gauche) du profil correspond à la **position GPS actuelle** de l'utilisateur projetée sur la trace (`currentKmOnRoute`). Un marqueur (ligne de référence) indique cette position.

FR-LP-008 : Une **zone surlignée** (`ReferenceArea`, même rendu qu'en planning) indique la **zone recherchée** sur le profil — centrée sur la cible (`currentKmOnRoute + targetAheadKm`) avec la largeur du rayon de recherche (`searchRadiusKm`).

FR-LP-009 : La **fin** (bord droit) du profil correspond à environ **100 km au-delà de la cible** de recherche (fenêtre X ≈ `[currentKmOnRoute, currentKmOnRoute + targetAheadKm + 100]`, bornée par la fin de la trace).

FR-LP-010 : Lorsque l'utilisateur **joue avec le slider**, la fenêtre visible du profil s'**étend ou se réduit** (dézoom / zoom) en suivant `targetAheadKm` — le profil se recadre en temps réel sans recalcul des données.

FR-LP-011 : Si l'aventure ne dispose **d'aucune donnée d'élévation** (`hasElevationData === false`), la section « PROFIL » n'affiche pas de graphe vide : elle reste repliée (chevron désactivé) ou affiche un message discret « Profil d'élévation indisponible », sans erreur.

FR-LP-012 : Le mini-bandeau d'élévation Live existant (`elevation-strip.tsx`, mobile 60 px) est **fusionné/remplacé** par la nouvelle section « PROFIL » — pas de double affichage du profil en Live.

### NonFunctional Requirements

NFR-LP-001 : Aucune coordonnée GPS n'est envoyée au serveur du fait de cette feature. `currentKmOnRoute` est calculé **client-side** (`snapToTrace`) — conformément à la règle RGPD géolocalisation (`project-context.md`).

NFR-LP-002 : Le rendu du profil reste **performant sous mises à jour GPS fréquentes** : les données (`points[]`) sont mémoïsées sur `[waypoints, segments]` ; seuls le marqueur de position et la fenêtre X se recalculent au fil du slider / GPS, jamais les points.

NFR-LP-003 : Les cibles tactiles (boutons −/+, RECHERCHER, chevron) respectent **WCAG 44×44 px** (`size="lg"` / `min-h-[44px]`, cf. `project-context.md §Button`).

NFR-LP-004 : L'ouverture/fermeture de la section « PROFIL » utilise une **transition de hauteur fluide** (pattern existant `map-view.tsx` : `h-0` ↔ `h-[Npx]`), sans saut de layout brutal du panneau.

NFR-LP-005 : La feature est **purement frontend** (aucune migration DB, aucun nouvel endpoint, aucun changement de contrat partagé `packages/shared`).

### UX Design Requirements

UX-DR-LP-001 : Le rendu suit les maquettes Claude Design fournies (en-tête « PROFIL » + chevron, hiérarchie typographique des métriques `↑/↓/~`, cohérence couleurs brand vert/magenta avec le reste de l'app).

UX-DR-LP-002 : La zone surlignée et le marqueur de position réutilisent le **langage visuel du profil planning** (cohérence cross-mode).

---

## FR Coverage Map

| FR | Story | Note |
|---|---|---|
| FR-LP-001 | Story 1 | Refonte layout panneau (decluttering maquettes) |
| FR-LP-002 | Story 1 | Replié par défaut |
| FR-LP-003 | Story 1 | Ouverture au slider |
| FR-LP-004 | Story 1 | Fermeture à « Rechercher » |
| FR-LP-005 | Story 1 | Chevron manuel |
| FR-LP-006 | Story 2 | Profil interactif (réutilise `ElevationProfile`) |
| FR-LP-007 | Story 2 | Début = position GPS + marqueur |
| FR-LP-008 | Story 2 | Surlignage zone recherchée |
| FR-LP-009 | Story 2 | Fin ~100 km après la cible |
| FR-LP-010 | Story 2 | Zoom/dézoom piloté par le slider |
| FR-LP-011 | Story 2 | Dégradation gracieuse (pas de données ele) |
| FR-LP-012 | Story 1 + 2 | Fusion/remplacement de `ElevationStrip` |

## NFR Coverage Map

| NFR | Story | Note |
|---|---|---|
| NFR-LP-001 | Story 2 | GPS jamais envoyé (calcul client) |
| NFR-LP-002 | Story 2 | Mémoïsation `points[]` |
| NFR-LP-003 | Story 1 | Cibles tactiles 44 px |
| NFR-LP-004 | Story 1 | Transition de hauteur fluide |
| NFR-LP-005 | Story 1 + 2 | Frontend pur, pas de DB/API |

---

## Epic List

### Epic Live-Profile — Mode Live : Panneau de recherche & Profil d'élévation interactif

**Goal** : Désencombrer le panneau de recherche du mode Live et y intégrer une section « PROFIL » repliable contenant un profil d'élévation interactif contextualisé (position GPS → zone recherchée → horizon ~100 km), avec ouverture/fermeture et zoom pilotés par le slider. Aligner le rendu sur les maquettes Claude Design.

**FRs couverts** : FR-LP-001 → FR-LP-012
**NFRs couverts** : NFR-LP-001 → NFR-LP-005
**UX couverts** : UX-DR-LP-001, UX-DR-LP-002

**Découpe** :
- **Story 1** — la **coquille** : refonte du layout (decluttering maquettes) + conteneur « PROFIL » repliable + comportement d'interaction (replié par défaut, ouverture au slider, fermeture à la recherche, chevron manuel). Livrable et testable seule (le contenu profil peut d'abord réutiliser le profil existant tel quel dans le conteneur).
- **Story 2** — le **contenu interactif** : profil d'élévation contextualisé (début = position GPS, surlignage zone recherchée, fin ~100 km), zoom dynamique piloté par le slider, marqueur de position, dégradation gracieuse.

**Dépendance** : Story 2 dépend de Story 1 (le conteneur repliable et le câblage du panneau sont posés en Story 1).

**MVP** : Story 1 + Story 2 = feature complète. Story 1 seule livre déjà le decluttering + le repliage.

---

## Epic Live-Profile : Stories

### Story live-profile-1 : Refonte du panneau de recherche Live & conteneur « PROFIL » repliable

As a **cyclist using Live mode**,
I want the Live search panel to be decluttered and to carry a collapsible "PROFIL" section that opens when I touch the slider and closes when I search,
So that I get a clean, focused control panel that reveals elevation context exactly when I'm adjusting my next stop and gets out of the way once I've searched.

**Fichiers concernés (source hints)** :
- MODIFY `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — refonte layout (en-tête PROFIL + chevron, hiérarchie métriques `↑D+ · ↓D- · ~ETA`, slider −/+, RECHERCHER / RECHERCHER SUR).
- MODIFY `apps/web/src/app/(app)/live/[id]/page.tsx` — état de repliage + câblage `onSearch`/slider ; injection du conteneur profil.
- MODIFY `apps/web/src/stores/live.store.ts` — si l'état d'ouverture / le flag « slider touché » doit être partagé (sinon `useState` local dans `page.tsx`).
- REUSE pattern collapse de `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` (`elevationCollapsed`, chevron `-top-3`, transition `h-0` ↔ `h-[Npx]`).
- REFERENCE `apps/web/src/app/(app)/live/[id]/_components/elevation-strip.tsx` — à remplacer/fusionner (FR-LP-012).

**Acceptance Criteria :**

**Given** le mode Live actif sur une aventure
**When** le panneau de recherche s'affiche
**Then** le layout correspond aux maquettes : en-tête « PROFIL » + chevron, ligne de métriques `↑ {D+} m · ↓ {D-} m · ~ {ETA}` lisible et hiérarchisée
**And** le slider est encadré des boutons − / + (pas tactiles ≥ 44 px)
**And** les boutons « RECHERCHER » et « RECHERCHER SUR » sont en pied de panneau
**And** la ligne dense D+/D-/ETA actuelle (encombrée) n'est plus présente

**Given** le panneau de recherche Live au chargement
**When** je n'ai pas encore touché le slider
**Then** la section « PROFIL » est repliée (seul l'en-tête + chevron visible)

**Given** la section « PROFIL » repliée
**When** je modifie la valeur du slider (premier contact)
**Then** la section « PROFIL » s'ouvre automatiquement avec une transition de hauteur fluide

**Given** la section « PROFIL » ouverte
**When** je clique sur « RECHERCHER »
**Then** la section « PROFIL » se referme
**And** la recherche POI part normalement (comportement `onSearch`/`refetch` inchangé)

**Given** la section « PROFIL » (ouverte ou fermée)
**When** je clique sur le chevron de l'en-tête
**Then** la section bascule manuellement ouvert ↔ fermé, indépendamment du slider

**Given** la nouvelle section « PROFIL » en place
**When** je suis en mode Live mobile
**Then** l'ancien `ElevationStrip` 60 px n'est plus affiché en double (fusionné/remplacé)

_Note : en Story 1, le contenu de la section « PROFIL » peut réutiliser le profil d'élévation existant tel quel ; la contextualisation fine (position GPS, surlignage zone, horizon 100 km, zoom slider) est livrée en Story 2._

---

### Story live-profile-2 : Profil d'élévation interactif contextualisé (position → zone → horizon 100 km, zoom piloté slider)

As a **cyclist using Live mode**,
I want the elevation profile in the panel to start at my current position, highlight the zone I'm searching, end ~100 km further, and zoom in/out as I move the slider,
So that I can instantly read the terrain between me and my next stop and judge the effort before committing to a search.

**Fichiers concernés (source hints)** :
- REUSE `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` — props `searchFromKm` / `searchToKm` / `searchRangeActive` (ReferenceArea), `onHoverKm`, et lignes de référence ; passer une fenêtre X bornée. _Si une variante Live compacte est nécessaire, créer un wrapper plutôt que dupliquer._
- POSSIBLE CREATE `apps/web/src/app/(app)/live/[id]/_components/live-elevation-profile.tsx` (+ `.test.tsx`) — wrapper compact qui calcule la fenêtre `[currentKmOnRoute, currentKmOnRoute + targetAheadKm + 100]`, le marqueur position et la zone surlignée, et délègue le rendu à `ElevationProfile`.
- REUSE `apps/web/src/hooks/use-elevation-profile.ts` — `points[]` (distKm/ele/D+/D-), `hasElevationData`.
- READ `apps/web/src/app/(app)/live/[id]/page.tsx` — `currentKmOnRoute` (via `snapToTrace`), `targetAheadKm`, `searchRadiusKm`, `maxAheadKm`, waypoints/segments fusionnés.
- MODIFY `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` / `page.tsx` — brancher le profil contextualisé dans le conteneur posé en Story 1.

**Acceptance Criteria :**

**Given** une aventure avec données d'élévation et le mode Live actif
**When** la section « PROFIL » est ouverte
**Then** un profil d'élévation est rendu (réutilise `ElevationProfile` / `useElevationProfile`)
**And** le bord gauche du profil correspond à ma position GPS actuelle (`currentKmOnRoute`)
**And** un marqueur (ligne de référence) indique cette position

**Given** la section « PROFIL » ouverte
**When** je regarde le profil
**Then** une zone surlignée (`ReferenceArea`, même rendu qu'en planning) indique la zone recherchée
**And** cette zone est centrée sur la cible (`currentKmOnRoute + targetAheadKm`) avec la largeur du rayon (`searchRadiusKm`)

**Given** la section « PROFIL » ouverte
**When** je regarde le bord droit du profil
**Then** la fenêtre se termine à environ 100 km au-delà de la cible (`≈ currentKmOnRoute + targetAheadKm + 100`)
**And** la fenêtre est bornée par la fin réelle de la trace (jamais au-delà)

**Given** la section « PROFIL » ouverte
**When** je déplace le slider (`targetAheadKm` change)
**Then** la fenêtre visible du profil s'étend (dézoom) ou se réduit (zoom) en temps réel
**And** la zone surlignée et le marqueur de position se repositionnent en conséquence
**And** les données (`points[]`) ne sont pas recalculées (mémoïsation préservée)

**Given** une aventure sans aucune donnée d'élévation (`hasElevationData === false`)
**When** j'ouvre la section « PROFIL »
**Then** aucun graphe vide n'est affiché
**And** un message discret « Profil d'élévation indisponible » est montré (ou la section reste repliée, chevron désactivé), sans erreur

**Given** le mode Live
**When** ma position GPS est utilisée pour positionner le début du profil
**Then** aucune coordonnée GPS n'est envoyée au serveur (calcul `snapToTrace` client-side, RGPD)

---

**Total** : 1 epic (`epic-live-profile`), 2 stories, 12 FR-LP + 5 NFR-LP + 2 UX-DR-LP couverts.
