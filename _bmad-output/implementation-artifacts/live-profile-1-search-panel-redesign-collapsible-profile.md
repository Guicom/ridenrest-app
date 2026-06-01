---
baseline_commit: 749420b1f0cd590c3f597643738725542c304a82
---

# Story live-profile.1: Refonte du panneau de recherche Live & conteneur « PROFIL » repliable

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist using Live mode**,
I want the Live search panel to be decluttered and to carry a collapsible "PROFIL" section that opens when I touch the slider and closes when I search,
so that I get a clean, focused control panel that reveals elevation context exactly when I'm adjusting my next stop and gets out of the way once I've searched.

## Acceptance Criteria

1. **Layout refondu (FR-LP-001, UX-DR-LP-001)** — Le panneau (`live-controls.tsx`) correspond aux maquettes, dans cet ordre vertical : (a) en-tête « PROFIL » + chevron, **suivi d'une ligne de séparation** (`border-b`) qui détache le profil du reste du bloc ; (b) le conteneur « PROFIL » repliable ; (c) le bloc « MON HÔTEL DANS {X} km » + bouton filtres ; (d) le slider encadré des boutons − / + ; (e) la ligne de métriques hiérarchisée `↑ {D+} m · ↓ {D-} m · ~ {ETA}` placée **sous le slider** ; (f) les boutons « RECHERCHER » / « RECHERCHER SUR » en pied. La présentation dense actuelle des métriques (deux lignes empilées D+/D- et ETA collées à droite avec icônes `MountainSnow`/`Clock`) est remplacée par la ligne unique propre des maquettes. ⚠️ **Décision Guillaume (2026-06-01)** : la ligne de métriques est positionnée **sous le slider** (et non au-dessus du bloc « MON HÔTEL DANS »), et une **séparation visuelle** est ajoutée sous l'en-tête « PROFIL ».
2. **Replié par défaut (FR-LP-002)** — Au montage du mode Live et après chaque recherche committée, la section « PROFIL » est repliée : seul l'en-tête « PROFIL » + chevron est visible.
3. **Ouverture au slider (FR-LP-003)** — Le premier `onValueChange` du slider (ou clic sur − / +) depuis l'état replié ouvre automatiquement la section « PROFIL ».
4. **Fermeture à la recherche (FR-LP-004)** — Un clic sur « RECHERCHER » referme la section « PROFIL ». Le comportement de recherche existant (`handleSearch` → `refetchPois`) est strictement inchangé.
5. **Chevron manuel (FR-LP-005)** — Le chevron de l'en-tête bascule manuellement ouvert ↔ fermé, indépendamment du slider, avec un `aria-label` adapté à l'état.
6. **Fusion de l'ElevationStrip (FR-LP-012)** — L'ancien `ElevationStrip` 60 px **mobile-only** (`lg:hidden`, rendu séparément dans `page.tsx` au-dessus du panneau) n'apparaît plus en double : son rendu est déplacé dans / remplacé par la section « PROFIL » du panneau (le contenu détaillé du profil est livré en Story 2 — ici on évite le double affichage et on pose le conteneur). ⚠️ La section « PROFIL » du panneau est visible **mobile ET desktop** (le panneau est `lg:w-[360px]`) — ne PAS reconduire le `lg:hidden` ; les maquettes montrent le profil dans le panneau sur tous les écrans.
7. **Transition fluide & cibles tactiles (NFR-LP-004, NFR-LP-003)** — L'ouverture/fermeture utilise une transition de hauteur fluide (`h-0` ↔ `h-[Npx]`, `transition-all duration-200`, pattern `map-view.tsx`). Les boutons − / +, RECHERCHER et le chevron restent des cibles tactiles ≥ 44 px (ou ≥ existant pour − / + qui sont `h-8` aujourd'hui — voir note).
8. **Frontend pur (NFR-LP-005)** — Aucune migration DB, aucun nouvel endpoint, aucun changement de `packages/shared`. Tests web verts (Vitest), tsc + ESLint clean.

## Tasks / Subtasks

- [x] **Task 1 — État de repliage + flag « slider touché » (AC: 2, 3, 4, 5)**
  - [x] Décider du porteur d'état : `useState` local dans `page.tsx` (recommandé — état purement UI, pas de partage cross-composant nécessaire) OU champ dans `live.store.ts` si Story 2 en a besoin globalement. **Choix : `useState` local + props vers `LiveControls`.**
  - [x] Ajouter `profileOpen: boolean` (défaut `false`) et `setProfileOpen` (`page.tsx:60`).
  - [x] Ouvrir sur première interaction slider : wrapper `changeTarget` côté `LiveControls` appelle `onProfileAutoOpen()` puis `setTargetAheadKm` au `onValueChange` / clic − / + (prop `onProfileAutoOpen` = `() => setProfileOpen(true)`).
  - [x] Refermer dans `handleSearch` (`page.tsx`) : `setProfileOpen(false)` au début du handler.
  - [x] Re-replier au (re)montage du mode Live (état initial `false` suffit).
- [x] **Task 2 — Refonte layout `live-controls.tsx` (AC: 1, 7)**
  - [x] Ajouter l'en-tête « PROFIL » + chevron (`ChevronUp`/`ChevronDown` lucide, pattern `map-view.tsx:684-691`) — bouton `min-h-[44px]`.
  - [x] Restructurer la ligne de métriques en une ligne unique `↑ {D+} m · ↓ {D-} m · ~ {ETA}` (data-testid `elevation-gain-display` / `eta-display` conservés).
  - [x] Conserver le bloc « MON HÔTEL DANS {targetAheadKm} km », le slider + − / +, et la rangée d'action RECHERCHER / `SearchOnDropdown`.
  - [x] Conserver le bouton filtres + badge `activeFilterCount`.
  - [x] Hauteur panneau : `pt-3` (au lieu de `pt-5`) pour absorber l'en-tête PROFIL ; section ouverte = +130 px, pas de débordement (panneau ancré `bottom-0` / `lg:bottom-4`).
- [x] **Task 3 — Conteneur « PROFIL » repliable (AC: 2, 6, 7)**
  - [x] Conteneur à hauteur animée (`profileOpen ? 'h-[130px]' : 'h-0'`, `overflow-hidden`, `transition-all duration-200`) sous l'en-tête.
  - [x] Profil rendu via prop `profileContent` (ReactNode injecté depuis `page.tsx` = `ElevationStrip`) ; bloc `lg:hidden ... ElevationStrip` séparé supprimé de `page.tsx` (évite le double affichage mobile, AC 6). Section visible mobile ET desktop (pas de `lg:hidden`).
  - [x] Hauteur de contenu = 130 px (dans la fourchette 120-140 px).
- [x] **Task 4 — Tests (AC: 8)**
  - [x] `live-controls.test.tsx` mis à jour : +11 tests (replié par défaut `h-0`, expansion `h-[130px]`, transition fluide, `profileContent` rendu, toggle chevron → `onProfileToggle`, `onProfileAutoOpen` sur slider / + / −, aria-label selon état, métriques `↑/↓`). Format métriques migré `D+ → ↑`.
  - [x] Non-régression : suite web complète verte (1074 tests / 90 fichiers).
  - [x] `pnpm --filter web test` ✅ (1074 pass) + `lint` ✅ (0 erreur) + `tsc` : fichiers de la story clean, **0 nouvelle erreur** introduite (59 erreurs pré-existantes dans des test files non liés — drift de types partagés, hors périmètre, et `tsc` n'est pas dans le pipeline CI : `build`/`lint`/`test`).

## Review Findings (Code Review 2026-06-01)

Revue adversariale — 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor). **Acceptance Auditor : 8/8 AC vérifiés.** Bilan triage : 1 decision-needed, 4 patch, 2 defer, 6 dismiss.

### Decision needed

- [x] [Review][Decision] ~~Auto-réouverture du PROFIL après fermeture manuelle~~ — **Résolu (Guillaume, 2026-06-01) → dismiss** : comportement conforme à AC3 conservé (toute interaction slider/+/− rouvre la section). [live-controls.tsx:71-74, page.tsx:434]

### Patch — appliqués (2026-06-01, +4 tests)

- [x] [Review][Patch] Panneau PROFIL vide + `aria-expanded` trompeur quand aucun waypoint — **Corrigé** : `hasProfile = profileContent != null`, le toggle est `disabled`/`opacity-60` et la section reste `h-0` quand il n'y a pas de contenu ; `aria-expanded` n'est émis que si une région est réellement déployable. [live-controls.tsx]
- [x] [Review][Patch] Contenu du profil reste dans l'arbre a11y une fois replié — **Corrigé** : `aria-hidden={!profileExpanded}` sur la section repliable (l'`ElevationStrip` est un SVG Recharts non focalisable → `aria-hidden` suffit, pas d'`inert`). [live-controls.tsx]
- [x] [Review][Patch] Séparateur `·` orphelin quand D+/D- nuls mais ETA présent — **Corrigé** : métriques recomposées en joignant uniquement les valeurs présentes (`elevationText`) ; le préfixe `·` de l'ETA n'est ajouté que si une donnée d'élévation existe (`hasElevation`). [live-controls.tsx]
- [x] [Review][Patch] Affordance clavier manquante sur le toggle — **Corrigé** : ajout de `group-focus-visible:bg-primary/15` sur le cercle du chevron. [live-controls.tsx]

### Deferred

- [x] [Review][Defer] Double affichage du profil sur desktop [page.tsx:519-534 + live-controls.tsx:96-101] — le bloc bas `hidden lg:block ... h-[180px]` (ElevationProfile) subsiste ; combiné à la section PROFIL (visible desktop), le profil peut apparaître à deux endroits. Deferred — documenté comme report explicite en Story 2 (Completion Notes), confirmé par l'Acceptance Auditor.
- [x] [Review][Defer] `ElevationStrip` monté en permanence même replié [page.tsx:435-444] — rendu/effects exécutés à `h-0` (perf mineure vs montage conditionnel précédent). Deferred — optimisation hors périmètre Story 1.

### Dismissed (faux positifs / bruit)

- Chevron « inversé » (Blind, High) — FAUX POSITIF : `profileOpen ? ChevronDown : ChevronUp` (ouvert=bas) correspond à la convention `map-view.tsx:691` / `page.tsx:527`.
- Perte du garde `isLiveModeActive` (Blind) — FAUX POSITIF : `LiveControls` est déjà rendu sous `{isLiveModeActive && (...)}`.
- Imports `MountainSnow`/`Clock` orphelins (Blind) — vérifié propre (lint + tsc verts).
- `cursor-pointer` redondant / cercle visuel < 44px (Blind) — zone de clic = rangée `min-h-[44px]`, acceptable.
- `onProfileAutoOpen` à chaque tick du slider (Blind+Edge) — `setState` idempotent, React court-circuite ; l'aspect UX user-facing est couvert par le point Decision ci-dessus.
- Décalage du compteur de tests (47 documentés vs 50 réels) — staleness doc, pas un défaut de code.

## Dev Notes

### Contexte & comportement actuels (lu dans le code, 2026-06-01)

- **`apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx`** (composant cible principal) :
  - Props actuelles : `{ onFiltersOpen, onSearch, activeFilterCount, elevationGain, elevationLoss, center, city?, maxAheadKm? }`.
  - Lit le store : `targetAheadKm`, `speedKmh`, `setTargetAheadKm` (`live.store.ts`).
  - `SLIDER_STEP = 5`, `DEFAULT_MAX = 100`. `effectiveMax = max(5, roundDownToStep(maxAheadKm ?? 100, 5))`. `useEffect` clamp `targetAheadKm` si `> effectiveMax`.
  - **Métriques actuelles (à désencombrer)** : deux lignes empilées à droite — `D+ {x}m · D- {y}m` + icône `MountainSnow`, puis `~ETA` + icône `Clock` (`live-controls.tsx:61-72`). `formatEtaSummary` produit `~{h}h{mm}` / `~{m}min`.
  - Bouton RECHERCHER = `TooltipTrigger` gardé par `useOfflineGate` (`isOnline`) → appelle `onSearch` (`:137-143`). Conserver tel quel.
  - `SearchOnDropdown` = bouton « RECHERCHER SUR » (Booking/Airbnb), props `center`/`city`/`page="live"`.
  - `data-testid` à préserver : `live-controls`, `elevation-gain-display`, `eta-display`, `btn-filters`, `btn-minus`, `btn-plus`, `slider-target`, `btn-search`.
- **`apps/web/src/app/(app)/live/[id]/page.tsx`** (câblage) :
  - `handleSearch` défini `:107` (useCallback) → c'est là qu'il faut `setProfileOpen(false)`.
  - `currentKmOnRoute` (store) `:198` ; `elevationCurrentDistKm = currentKmOnRoute` `:203` ; `elevationTargetDistKm = currentKmOnRoute + targetAheadKm` `:204`.
  - `maxAheadKm` calculé `:206-211` = `totalDistKm - currentKmOnRoute` (mémoïsé).
  - `elevationGain`/`elevationLoss` `:213-225` via `computeElevationGain/Loss` sur slice `[currentKmOnRoute, currentKmOnRoute + targetAheadKm]`.
  - **`ElevationStrip` rendu séparément** `:419-428` dans un bloc `lg:hidden absolute bottom-[88px] ... h-[60px]` — c'est ce bloc à retirer/déplacer (AC 6).
  - `LiveControls` rendu `:430-441` avec les props ci-dessus.
- **Pattern de repli à réutiliser** — `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:684-691` :
  - `const [elevationCollapsed, setElevationCollapsed] = useState(false)` (`:55`).
  - Conteneur `transition-all duration-200 ${elevationCollapsed ? 'h-0' : 'h-[180px]'}`.
  - Chevron `absolute -top-3 left-1/2 -translate-x-1/2 z-10 ... rounded-full ...` avec `ChevronUp`/`ChevronDown` et `aria-label` dépendant de l'état.
  - ⚠️ Ici la sémantique est inversée par rapport à `map-view` : le state porteur est `profileOpen` (ouvert), pas `collapsed` — choisir un nom cohérent et ne pas mélanger.
- **`elevation-strip.tsx`** : `useElevationProfile(waypoints, segments)` → `{ points, hasElevationData }`. Si `!hasElevationData` → rend « Élévation non disponible ». `ResponsiveContainer` 100% — il lui faut un parent de hauteur définie (le conteneur repliable doit donc avoir une hauteur explicite quand ouvert).

### Contraintes projet (project-context.md)

- **Zustand** : `useLiveStore`, fichier `stores/live.store.ts`, structure plate, actions verbes impératifs. Si on ajoute un état d'ouverture au store (option B), suivre la convention (`profileSectionOpen` + `setProfileSectionOpen`). **Préférer le `useState` local** sauf besoin avéré en Story 2.
- **RGPD** : aucune coordonnée GPS envoyée au serveur — ne rien introduire qui sérialise `currentPosition`/`currentKmOnRoute` côté API. Cette story est UI pure.
- **Button / cibles tactiles** : CTA principaux en `size="lg"` (h-11 / 44 px). Les − / + actuels sont `h-8 w-8` (28-32 px) — acceptable car pré-existant, mais ne pas les rapetisser. RECHERCHER est déjà `h-11`.
- **Tests co-localisés** : `*.test.tsx` même dossier (Vitest pour `apps/web`).
- **Doc Sync (CRITIQUE)** : si l'implémentation dévie de cette story / de `epics-live-profile.md`, mettre à jour `epics-live-profile.md`, ce fichier, et `sprint-status.yaml` AVANT/juste après — le code review s'appuie sur ces docs comme source de vérité.

### Périmètre Story 1 vs Story 2

- **Story 1 (cette story)** = coquille : layout maquettes + conteneur repliable + comportement (replié défaut / ouverture slider / fermeture recherche / chevron) + fin du double affichage du profil. Le contenu rendu dans le conteneur peut rester le profil existant (`ElevationStrip` / profil simple) tel quel.
- **Story 2** = contenu interactif : fenêtre `[currentKmOnRoute, currentKmOnRoute + targetAheadKm + 100]`, surlignage zone recherchée (`ReferenceArea`), marqueur position, zoom dynamique piloté slider, dégradation gracieuse. **Ne pas implémenter ici** — juste laisser le conteneur prêt à recevoir un composant de profil plus riche.

### Project Structure Notes

- Tous les fichiers touchés sont sous `apps/web/src/app/(app)/live/[id]/` + `stores/live.store.ts`. Aucun fichier API / DB / shared.
- Naming Next.js : composants `kebab-case.tsx`. Si Story 2 introduit `live-elevation-profile.tsx`, l'anticiper mais ne pas le créer ici.

### References

- [Source: _bmad-output/planning-artifacts/epics-live-profile.md#Story live-profile-1] — AC & scope
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx] — composant cible (lignes citées ci-dessus)
- [Source: apps/web/src/app/(app)/live/[id]/page.tsx:107,198-225,419-441] — câblage handleSearch / métriques / ElevationStrip / LiveControls
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:55,684-691] — pattern collapse + chevron à réutiliser
- [Source: apps/web/src/app/(app)/live/[id]/_components/elevation-strip.tsx] — profil Live actuel (à déplacer dans le conteneur)
- [Source: apps/web/src/stores/live.store.ts] — store Live (targetAheadKm, currentKmOnRoute, searchRadiusKm)
- [Source: _bmad-output/project-context.md#Button / #Zustand / #RGPD / #Doc Sync] — contraintes

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — workflow `bmad-dev-story`.

### Debug Log References

- `pnpm --filter web exec vitest run live-controls` → 47 tests verts (36 existants + 11 nouveaux).
- `pnpm --filter web test` (suite complète) → 1074 tests / 90 fichiers verts (non-régression).
- `pnpm --filter web lint` → 0 erreur (warnings pré-existants uniquement).
- `tsc --noEmit` : 59 erreurs identiques baseline vs working tree (vérifié par stash) → **0 nouvelle erreur**, aucune dans les fichiers de la story.

### Completion Notes List

- **État** : `useState` local `profileOpen` dans `page.tsx` (Option A recommandée — UI pure, RGPD préservé, rien ajouté au store). Si Story 2 a besoin d'un accès global, migrer vers `live.store.ts` (`profileSectionOpen` + `setProfileSectionOpen`).
- **Comportement** : replié par défaut (AC2) ; `onProfileAutoOpen` ouvre sur slider / +/− (AC3) ; `handleSearch` referme (AC4) ; chevron `onProfileToggle` bascule manuellement avec `aria-label`/`aria-expanded` dynamiques (AC5). `setProfileOpen(true)` étant idempotent, le wrapper `changeTarget` peut l'appeler à chaque interaction sans effet de bord.
- **Layout (AC1)** : ligne de métriques dense (2 lignes empilées + icônes `MountainSnow`/`Clock`) remplacée par la ligne unique `↑ {D+} m · ↓ {D-} m · ~ {ETA}`. Icônes `MountainSnow`/`Clock` retirées des imports. data-testid `elevation-gain-display` / `eta-display` conservés.
- **Ajustement layout (revue Guillaume, 2026-06-01)** : (1) **séparation `border-b`** ajoutée sous l'en-tête « PROFIL » (détache le profil du reste du bloc) ; (2) la ligne de métriques `↑/↓/~` a été **déplacée sous le slider** (au-dessus des boutons RECHERCHER), au lieu de sa position initiale au-dessus de « MON HÔTEL DANS ». AC1 + maquettes epics mis à jour (Doc Sync). 2 tests ajoutés (présence séparateur, ordre DOM métriques après slider).
- **Fusion ElevationStrip (AC6)** : le bloc mobile-only `lg:hidden ... h-[60px]` de `page.tsx` est supprimé ; `ElevationStrip` est désormais injecté en `profileContent` dans le conteneur repliable du panneau, **visible mobile ET desktop** (pas de `lg:hidden`).
- **⚠️ Point de revue / Story 2** : le profil d'élévation **desktop bas de carte** (`page.tsx`, bloc `hidden lg:block ... h-[180px]` avec `ElevationProfile`) est **hors périmètre de cette story** et reste inchangé. Conséquence : sur desktop, le profil peut apparaître à deux endroits (section PROFIL du panneau quand ouverte + bande basse). C'est conforme au scope (la story ne demande de retirer que l'`ElevationStrip` mobile 60 px) et à la note AC6 (« profil dans le panneau sur tous les écrans »). À réconcilier en Story 2 si souhaité.
- **Cibles tactiles (AC7)** : chevron `min-h-[44px]`, RECHERCHER `h-11`, −/+ conservés `h-8` (pré-existant, non rapetissés). Transition `h-0 ↔ h-[130px] transition-all duration-200` (pattern `map-view.tsx`).
- **Frontend pur (AC8)** : aucun changement DB / endpoint / `packages/shared`. `handleSearch` → `refetchPois` inchangé.

### File List

- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` (modifié) — en-tête PROFIL + chevron, conteneur repliable `profileContent`, ligne métriques `↑/↓/~`, props `profileOpen`/`onProfileToggle`/`onProfileAutoOpen`/`profileContent`, wrapper `changeTarget`.
- `apps/web/src/app/(app)/live/[id]/page.tsx` (modifié) — `useState profileOpen`, `setProfileOpen(false)` dans `handleSearch`, suppression du bloc `lg:hidden ElevationStrip`, passage de `profileContent` + callbacks à `LiveControls`.
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` (modifié) — `defaultProps` étendu, assertions format métriques `↑`, +11 tests section PROFIL.
- `_bmad-output/implementation-artifacts/live-profile-1-search-panel-redesign-collapsible-profile.md` (modifié) — frontmatter `baseline_commit`, tasks cochées, Dev Agent Record, Status.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié) — `live-profile-1` : `ready-for-dev` → `in-progress` → `review`.
- `_bmad-output/planning-artifacts/epics-live-profile.md` (modifié) — maquettes de référence mises à jour (séparateur + métriques sous le slider, Doc Sync).

## Change Log

| Date | Version | Description |
|---|---|---|
| 2026-06-01 | 1.0 | Implémentation Story live-profile.1 : refonte layout panneau Live (maquettes) + conteneur PROFIL repliable (replié défaut / ouverture slider / fermeture recherche / chevron manuel) + fusion de l'`ElevationStrip` mobile dans le panneau (visible mobile+desktop). Frontend pur, 1074 tests verts, lint clean. |
| 2026-06-01 | 1.1 | Ajustement layout suite revue Guillaume : séparation `border-b` sous l'en-tête « PROFIL » + déplacement de la ligne de métriques `↑/↓/~` sous le slider. AC1 + maquettes epics synchronisés. 1076 tests verts, lint clean. |
| 2026-06-01 | 1.2 | Polish maquette : chevron du toggle « PROFIL » encerclé d'un fond vert clair (`rounded-full bg-primary/10 text-primary`). Test ajouté. Lint clean. |
| 2026-06-01 | 1.3 | Code review (3 couches, 8/8 AC OK) : 1 decision dismissée (auto-open conforme AC3), 4 patchs appliqués — toggle désactivé + section `h-0` quand pas de contenu (P1), `aria-hidden` sur section repliée (P2), métriques sans séparateur `·` orphelin (P3), `group-focus-visible` sur le chevron (P4). 2 items différés en Story 2 (double affichage desktop, montage permanent de l'`ElevationStrip`). +4 tests (54 live-controls, 1081 suite web), lint clean. Statut → done. |
