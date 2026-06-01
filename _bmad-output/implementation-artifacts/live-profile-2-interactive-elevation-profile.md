# Story live-profile.2: Profil d'élévation interactif contextualisé (position → zone → horizon 100 km, zoom piloté slider)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist using Live mode**,
I want the elevation profile in the panel to start at my current position, highlight the zone I'm searching, end ~100 km further, and zoom in/out as I move the slider,
so that I can instantly read the terrain between me and my next stop and judge the effort before committing to a search.

## Acceptance Criteria

1. **Profil interactif rendu (FR-LP-006)** — Quand la section « PROFIL » (posée en Story 1) est ouverte sur une aventure avec élévation, un profil d'élévation est rendu en réutilisant `ElevationProfile` + `useElevationProfile` (Recharts `AreaChart`). Pas de duplication du chart.
2. **Début = position GPS + marqueur (FR-LP-007)** — Le bord gauche de la fenêtre du profil correspond à `currentKmOnRoute` (position GPS projetée sur la trace). Une ligne de référence verticale (marqueur position, vert `#16a34a` comme l'ancien `ElevationStrip`) indique cette position.
3. **Surlignage zone recherchée (FR-LP-008, UX-DR-LP-002)** — Une `ReferenceArea` (même rendu bleu qu'en planning : `fill="#3498db"`, `fillOpacity={0.2}`) surligne la zone recherchée, centrée sur la cible `currentKmOnRoute + targetAheadKm`, de largeur `± searchRadiusKm` → `[cible − searchRadiusKm, cible + searchRadiusKm]`.
4. **Fin ~100 km après la cible (FR-LP-009)** — Le bord droit de la fenêtre = `currentKmOnRoute + targetAheadKm + 100`, **borné** par la fin réelle de la trace (`totalDistKm`) — jamais au-delà. Le bord gauche est borné à `≥ 0` (et `≥ currentKmOnRoute`).
5. **Zoom/dézoom piloté slider (FR-LP-010, NFR-LP-002)** — Quand `targetAheadKm` change (slider / − / +), la fenêtre X du profil se recadre en temps réel (le bord droit suit la cible + 100 km), produisant un effet zoom/dézoom. Le marqueur de position et la `ReferenceArea` se repositionnent. Les données (`points[]` de `useElevationProfile`) **ne sont pas recalculées** (mémoïsation `[waypoints, segments]` préservée — seul le `domain` de l'axe X et les positions des références changent).
6. **Dégradation gracieuse (FR-LP-011)** — Si `hasElevationData === false`, aucun graphe vide : `ElevationProfile` rend déjà « Données d'élévation non disponibles » ; en Live, la section « PROFIL » affiche ce message discret (ou reste repliée avec chevron désactivé), sans erreur ni layout cassé.
7. **RGPD (NFR-LP-001)** — La position utilisée pour le marqueur provient de `currentKmOnRoute` calculé client-side (`snapToTrace`). Aucune coordonnée GPS n'est envoyée au serveur du fait de cette story.
8. **Non-régression planning (NFR-LP-005)** — L'extension de `ElevationProfile` reste **rétro-compatible** : le mode Planning (`map-view.tsx`) qui n'utilise pas les nouvelles props continue de rendre la trace complète exactement comme avant. Tests web verts (Vitest), tsc + ESLint clean, aucune migration DB / endpoint / `packages/shared`.

## Tasks / Subtasks

- [ ] **Task 1 — Étendre `ElevationProfile` (fenêtre X + marqueur position), rétro-compatible (AC: 1, 2, 4, 8)**
  - [ ] Ajouter props optionnelles : `domainFromKm?: number`, `domainToKm?: number`, `currentKm?: number | null`.
  - [ ] XAxis : si `domainFromKm`/`domainToKm` fournis → `domain={[domainFromKm, domainToKm]}` (sinon conserver `['dataMin','dataMax']` → planning inchangé). `allowDataOverflow` à activer si nécessaire pour clipper proprement hors fenêtre.
  - [ ] Ajouter une `ReferenceLine x={currentKm}` (vert `#16a34a`, `strokeWidth={2}`) rendue seulement si `currentKm != null`.
  - [ ] Vérifier que `ReferenceArea` (search zone) fonctionne déjà via `searchFromKm`/`searchToKm`/`searchRangeActive` (existant `:136-144`) — réutiliser tel quel.
  - [ ] Ne PAS toucher au comportement `onHoverKm` / `onClickKm` / `boundaries` / `stages` existant.
- [ ] **Task 2 — Wrapper Live `live-elevation-profile.tsx` (AC: 2, 3, 4, 5, 6)**
  - [ ] Créer `apps/web/src/app/(app)/live/[id]/_components/live-elevation-profile.tsx`.
  - [ ] Props : `{ waypoints, segments, currentKmOnRoute, targetAheadKm, searchRadiusKm, totalDistKm }` (ou dériver `totalDistKm` des waypoints).
  - [ ] Calculer la fenêtre : `domainFromKm = max(0, currentKmOnRoute ?? 0)` ; `domainToKm = min(totalDistKm, (currentKmOnRoute ?? 0) + targetAheadKm + 100)`.
  - [ ] Calculer la zone : `target = (currentKmOnRoute ?? 0) + targetAheadKm` ; `searchFromKm = max(domainFromKm, target − searchRadiusKm)` ; `searchToKm = min(domainToKm, target + searchRadiusKm)` ; `searchRangeActive = true`.
  - [ ] Passer `currentKm={currentKmOnRoute}` pour le marqueur.
  - [ ] Déléguer le rendu à `ElevationProfile` avec une `className` de hauteur (le conteneur repliable de Story 1 fixe la hauteur — le wrapper occupe `h-full w-full`).
  - [ ] Gérer `currentKmOnRoute === null` (GPS pas encore snappé) : afficher tout de même la trace (domain par défaut) ou un état neutre — ne pas crasher.
- [ ] **Task 3 — Brancher dans le panneau Live (AC: 1, 6)**
  - [ ] Dans le conteneur « PROFIL » posé en Story 1 (`live-controls.tsx` / `page.tsx`), remplacer le profil provisoire de Story 1 par `LiveElevationProfile`.
  - [ ] Lui passer `allCumulativeWaypoints`, `readySegments`, `currentKmOnRoute`, `targetAheadKm`, `searchRadiusKm` (tous déjà disponibles dans `page.tsx`).
  - [ ] `searchRadiusKm` vient du store (`useLiveStore((s) => s.searchRadiusKm)`).
- [ ] **Task 4 — Tests (AC: 5, 6, 8)**
  - [ ] `live-elevation-profile.test.tsx` : fenêtre `[currentKm, currentKm+target+100]` bornée à `totalDistKm` ; zone `[target−r, target+r]` ; recadrage quand `targetAheadKm` change ; `hasElevationData=false` → message ; `currentKmOnRoute=null` → pas de crash.
  - [ ] `elevation-profile.test.tsx` : props sans `domain*`/`currentKm` → rendu planning inchangé (non-régression) ; avec `domain*` → axe X borné ; `currentKm` → marqueur présent.
  - [ ] `pnpm --filter web test` + `turbo lint` + `tsc` verts.

## Dev Notes

### Continuité depuis Story 1 (prérequis)

Cette story consomme **le conteneur « PROFIL » repliable** posé en Story 1 (`live-profile-1`). Story 1 a :
- refondu `live-controls.tsx` (en-tête « PROFIL » + chevron, métriques `↑/↓/~`, slider, boutons),
- ajouté l'état d'ouverture (`profileOpen`, défaut `false`, ouverture au slider, fermeture à Rechercher, toggle chevron),
- supprimé le bloc `ElevationStrip` séparé (`page.tsx:419-428`) et posé un conteneur à hauteur animée prêt à recevoir un profil **mobile ET desktop** (pas de `lg:hidden`).

➡️ **Vérifier l'état réel du code après merge de Story 1** avant de commencer (le nom exact de l'état d'ouverture / la prop du conteneur peut différer ; lire `live-controls.tsx` + `page.tsx` à jour). Si Story 1 a laissé `ElevationStrip` dans le conteneur, le remplacer ici par `LiveElevationProfile`.

### `ElevationProfile` — état actuel (lu 2026-06-01)

`apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` :
- Props actuelles : `{ waypoints, segments, onHoverKm?, className?, stages?, stagesVisible?, isClickModeActive?, onClickKm?, searchFromKm?, searchToKm?, searchRangeActive? }`.
- `useElevationProfile(waypoints, segments)` → `{ points, boundaries, hasElevationData }`. `points: ElevationPoint[]` = `{ distKm, ele, cumulativeDPlus, cumulativeDMinus, slope }`.
- **Taille** : `ResizeObserver` mesure le conteneur (bypass `ResponsiveContainer` qui crée un wrapper 0×0) → `<AreaChart width={size.width} height={size.height} ...>`. **Le parent DOIT avoir une hauteur définie** (le conteneur repliable de Story 1 la fournit).
- **XAxis actuel** : `dataKey="distKm" type="number" domain={['dataMin','dataMax']}` (`:111-119`) → **toute la trace**. C'est ce `domain` qu'on rend paramétrable (Task 1) pour la fenêtre Live.
- **ReferenceArea zone de recherche** (`:136-144`) : `searchRangeActive && searchFromKm/searchToKm` → `fill="#3498db" fillOpacity={0.2}`. **Déjà exactement le rendu voulu** (story 17-3, cohérence planning ↔ live). À réutiliser tel quel.
- **Pas de marqueur position** actuellement → à ajouter (Task 1), couleur `#16a34a` (cohérent avec l'ancien `ElevationStrip:42-46`).
- `onHoverKm` est appelé depuis `ElevationTooltip` via `useEffect` (Concurrent-safe) ; ne pas casser.

### Données & calculs disponibles dans `page.tsx` (lu 2026-06-01)

`apps/web/src/app/(app)/live/[id]/page.tsx` :
- `currentKmOnRoute` = `useLiveStore((s) => s.currentKmOnRoute)` (`:198`), null tant que GPS pas snappé.
- `elevationTargetDistKm = currentKmOnRoute + targetAheadKm` (`:204`) — réutilisable pour la cible.
- `maxAheadKm` (`:206-211`) calcule `totalDistKm = allCumulativeWaypoints[last].distKm` puis `totalDistKm - currentKmOnRoute`. ➡️ `totalDistKm` = `allCumulativeWaypoints.at(-1)?.distKm` ; le wrapper peut le dériver des waypoints.
- `allCumulativeWaypoints` (`MapWaypoint[]`) + `readySegments` (`MapSegmentData[]`) déjà calculés et passés à `ElevationStrip` aujourd'hui — mêmes données pour `LiveElevationProfile`.
- `targetAheadKm` = `useLiveStore((s) => s.targetAheadKm)` ; `searchRadiusKm` = `useLiveStore((s) => s.searchRadiusKm)` (défaut `5`, `live.store.ts:38`).
- `snapToTrace` (`@ridenrest/gpx`) produit `currentKmOnRoute` côté client (`:233-243`) — RGPD : aucune position GPS envoyée au serveur.

### Détails d'implémentation clés

- **Zoom = changement de `domain` XAxis, pas de re-slice des données.** Garder `data={points}` complet et borner l'affichage via `domain={[domainFromKm, domainToKm]}` + `allowDataOverflow` (Recharts clippe hors domaine). Cela préserve la mémoïsation `useElevationProfile` (NFR-LP-002) et évite de recréer un tableau à chaque mouvement de slider. Ne PAS re-trancher `points` à chaque render.
- **Bornage** : `domainToKm = min(totalDistKm, currentKm + targetAheadKm + 100)`. Si `currentKm + targetAheadKm` est déjà proche de la fin de trace, la fenêtre se réduit naturellement (effet zoom). `domainFromKm = max(0, currentKm)`.
- **Zone vs fenêtre** : clamper la `ReferenceArea` dans la fenêtre (`searchFromKm = max(domainFromKm, target − r)`, `searchToKm = min(domainToKm, target + r)`) pour éviter un débordement visuel hors axe.
- **Constante 100 km** : la définir en constante locale nommée (ex. `PROFILE_LOOKAHEAD_KM = 100`) plutôt qu'un magic number — wording « ~100 km » de la spec produit.

### Project Structure Notes

- Nouveaux fichiers sous `apps/web/src/app/(app)/live/[id]/_components/` (`live-elevation-profile.tsx` + `.test.tsx`). Composant `kebab-case.tsx`.
- Modif de `elevation-profile.tsx` (planning) : **purement additive et rétro-compatible** — props optionnelles, defaults qui préservent le comportement planning.
- Aucun fichier API / DB / `packages/shared`. Frontend pur.

### Anti-patterns à éviter (project-context.md + bon sens)

- ❌ Dupliquer le `AreaChart` dans un nouveau composant Live (réinvention) → ✅ étendre/réutiliser `ElevationProfile`.
- ❌ Re-trancher `points` à chaque mouvement de slider (perf) → ✅ jouer sur le `domain` XAxis.
- ❌ Reconduire `lg:hidden` (le profil doit être mobile ET desktop, cf. Story 1 AC 6).
- ❌ Hardcoder une couleur en classe Tailwind dynamique → couleurs de référence en littéral (`#16a34a`, `#3498db`) cohérentes avec l'existant.
- ❌ Envoyer la position GPS au serveur (RGPD).

### Doc Sync (CRITIQUE)

Si l'implémentation dévie de cette story / `epics-live-profile.md` (ex. fenêtre calculée autrement, profil rendu via wrapper vs props directes), mettre à jour `epics-live-profile.md`, ce fichier, et `sprint-status.yaml` AVANT/juste après — le code review s'appuie dessus comme source de vérité.

### References

- [Source: _bmad-output/planning-artifacts/epics-live-profile.md#Story live-profile-2] — AC & scope
- [Source: _bmad-output/implementation-artifacts/live-profile-1-search-panel-redesign-collapsible-profile.md] — story précédente (conteneur « PROFIL », comportement repliage)
- [Source: apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx:52,111-119,136-144] — composant à étendre (XAxis domain, ReferenceArea zone)
- [Source: apps/web/src/hooks/use-elevation-profile.ts] — `points[]` / `hasElevationData` (mémoïsé)
- [Source: apps/web/src/app/(app)/live/[id]/page.tsx:198-225] — `currentKmOnRoute`, `targetAheadKm`, `maxAheadKm`/`totalDistKm`, waypoints/segments
- [Source: apps/web/src/app/(app)/live/[id]/_components/elevation-strip.tsx:41-55] — marqueur position vert `#16a34a` + cible (référence visuelle)
- [Source: apps/web/src/stores/live.store.ts:37-38,53-54] — `targetAheadKm` (30), `searchRadiusKm` (5)
- [Source: _bmad-output/project-context.md#RGPD / #Doc Sync / #POI Color System] — contraintes

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
