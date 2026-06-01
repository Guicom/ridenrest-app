---
baseline_commit: ebb5dd0473fdc366c57dd2a0ccbe3fa0203d37e8
---

# Story live-profile.2: Profil d'élévation interactif contextualisé (position → zone → horizon 100 km, zoom piloté slider)

Status: done

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

- [x] **Task 1 — Étendre `ElevationProfile` (fenêtre X + marqueur position), rétro-compatible (AC: 1, 2, 4, 8)**
  - [x] Ajouter props optionnelles : `domainFromKm?: number`, `domainToKm?: number`, `currentKm?: number | null`.
  - [x] XAxis : si `domainFromKm`/`domainToKm` fournis → `domain={[domainFromKm, domainToKm]}` (sinon conserver `['dataMin','dataMax']` → planning inchangé). `allowDataOverflow` activé uniquement quand la fenêtre est définie (`hasWindow`).
  - [x] Ajouter une `ReferenceLine x={currentKm}` (vert `#16a34a`, `strokeWidth={2}`) rendue seulement si `currentKm != null`.
  - [x] Vérifier que `ReferenceArea` (search zone) fonctionne déjà via `searchFromKm`/`searchToKm`/`searchRangeActive` (existant) — réutilisé tel quel.
  - [x] Ne PAS toucher au comportement `onHoverKm` / `onClickKm` / `boundaries` / `stages` existant.
- [x] **Task 2 — Wrapper Live `live-elevation-profile.tsx` (AC: 2, 3, 4, 5, 6)**
  - [x] Créer `apps/web/src/app/(app)/live/[id]/_components/live-elevation-profile.tsx`.
  - [x] Props : `{ waypoints, segments, currentKmOnRoute, targetAheadKm, searchRadiusKm, totalDistKm? }` (`totalDistKm` dérivé des waypoints si absent).
  - [x] Calculer la fenêtre : `domainFromKm = max(0, currentKmOnRoute)` ; `domainToKm = min(totalDistKm, currentKmOnRoute + targetAheadKm + 100)` (constante `PROFILE_LOOKAHEAD_KM`).
  - [x] Calculer la zone : `target = currentKmOnRoute + targetAheadKm` ; zone clampée dans la fenêtre via `clamp(target ± searchRadiusKm, domainFromKm, domainToKm)` ; `searchRangeActive = true`.
  - [x] Passer `currentKm={currentKmOnRoute}` pour le marqueur.
  - [x] Déléguer le rendu à `ElevationProfile` avec `className="h-full w-full"` (le conteneur repliable de Story 1 fixe la hauteur `h-[130px]`).
  - [x] Gérer `currentKmOnRoute === null` (GPS pas encore snappé) : rend la trace complète (domain par défaut), sans marqueur ni zone — pas de crash.
- [x] **Task 3 — Brancher dans le panneau Live (AC: 1, 6)**
  - [x] Dans le conteneur « PROFIL » posé en Story 1 (`page.tsx`), remplacé le profil provisoire (`ElevationStrip`) par `LiveElevationProfile`.
  - [x] Passé `allCumulativeWaypoints`, `readySegments`, `currentKmOnRoute`, `targetAheadKm`, `liveSearchRadiusKm`. `ElevationStrip` (devenu orphelin) + son test supprimés.
  - [x] `searchRadiusKm` vient du store (`useLiveStore((s) => s.searchRadiusKm)`, déjà lu en `liveSearchRadiusKm`).
- [x] **Task 4 — Tests (AC: 5, 6, 8)**
  - [x] `live-elevation-profile.test.tsx` : fenêtre `[currentKm, currentKm+target+100]` bornée à `totalDistKm` ; zone `[target−r, target+r]` clampée ; recadrage quand `targetAheadKm` change ; `hasElevationData=false` → message ; `currentKmOnRoute=null` → pas de crash ; dérivation/override `totalDistKm`.
  - [x] `elevation-profile.test.tsx` : props sans `domain*`/`currentKm` → rendu planning inchangé (non-régression) ; avec `domain*` → axe X borné + `allowDataOverflow` ; `currentKm` → marqueur vert présent.
  - [x] `pnpm --filter web test` (1091/1091) + ESLint (0 erreur) verts. `tsc` app-code propre (erreurs résiduelles uniquement dans des fixtures de tests pré-existantes, ignorées par `next build`).

## Review Findings

_Code review 2026-06-01 (3 couches adversariales : Blind Hunter, Edge Case Hunter, Acceptance Auditor). Verdict : 8/8 AC satisfaits. Aucune anomalie Critical/High réelle ; 2 patchs défensifs, 3 reports._

- [x] [Review][Patch] Garde anti-inversion du domaine X — `domainToKm` n'est jamais borné `≥ domainFromKm`. Si `currentKmOnRoute > total` (overshoot flottant en fin de trace) ou `total` retombe à `0` (dernier waypoint sans `distKm`), le domaine `[from, to]` devient inversé/vide → graphe mirroré/blanc. Correctif sûr et additif : `domainToKm = Math.max(domainFromKm, Math.min(total, …))`. Flaggé indépendamment par Blind + Edge. **Corrigé (v1.7)** + test fin-de-trace (`currentKmOnRoute=305 > total 300` → domaine `[305,305]` non inversé). [live-elevation-profile.tsx:54]
- [ ] [Review][Patch] Doc-sync — la Task 2 indique encore que le conteneur « fixe la hauteur `h-[130px]` » alors que v1.5 + le code utilisent `h-[80px] mb-[5px]`. Note obsolète dans le corps de la story (le code et les tests sont cohérents). [live-profile-2-…md:42]
- [x] [Review][Defer] `searchZoneBottomPadding()` peut dépasser la hauteur de la carte sur petit viewport paysage — `top(60) + bottom(~356)` peut excéder un conteneur court → `fitBounds` MapLibre ignoré/averti, cercle non recadré. Padding désormais ~356 px (vs 240 fixe avant) ; risque accru par ce changement mais marginal (mobile portrait/desktop OK). Clamp robuste nécessite la hauteur carte au call-site (seuil ambigu). [live-map-canvas.tsx:25]
- [x] [Review][Defer] Heuristique de timing du `fitBounds` — debounce 220 ms ≈ animation 200 ms (best-effort, pas de `transitionend`/ResizeObserver) ; le 2ᵉ call-site mesure au montage panneau replié. Transitoire visuel mineur ; fix robuste hors périmètre. [live-map-canvas.tsx]
- [x] [Review][Defer] `distKm` non monotone / dupliqué (chevauchement de segments) → remplissage d'aire en zig-zag, exposé par le domaine numérique explicite mais **pré-existant** dans `use-elevation-profile.ts` (pas introduit par cette story). [use-elevation-profile.ts]

_Écartés comme bruit (6) : NaN `currentKmOnRoute` (snapToTrace ne le produit pas) ; identité du tableau `xDomain` à chaque render (primitives, sans impact, le NFR-LP-002 ne concerne que `points[]`) ; copie « Données d'élévation non disponibles » (intentionnel, cohérence planning↔live, AC6) ; suppression de la `ReferenceLine` cible blanche (intentionnel, la cible est le centre de la `ReferenceArea`, AC3) ; calcul fenêtre ignoré quand `hasElevationData=false` (early-return enfant, négligeable) ; prop `totalDistKm` morte au call-site prod (dérivation autorisée par la spec)._

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

claude-opus-4-8[1m] (Amelia — bmad-dev-story)

### Debug Log References

- Import relatif initial faux (`../../map/...` depuis `_components/`, un niveau trop haut) → corrigé en `../../../map/[id]/_components/elevation-profile`. Détecté par Vitest (résolution d'import) avant toute autre erreur.
- `tsc --noEmit` global remonte des erreurs **pré-existantes** dans des fixtures de tests (`search-range-control.test.tsx`, `sidebar-density-section.test.tsx`, `weather-layer.test.tsx`, `app-header.test.tsx`, `use-elevation-profile.test.ts`, `use-pois.test.ts` : `speedKmh`/`pauseHours`/`source`/`hasStravaSegment` manquants). Aucun fichier de cette story n'apparaît dans la sortie. Le gate réel du repo est ESLint + Vitest + `next build` (qui exclut les `.test.tsx`) ; pas de script `typecheck` dans `turbo.json`.

### Completion Notes List

**Approche** — Zoom = changement de `domain` XAxis, **pas** de re-slice des données (NFR-LP-002). `useElevationProfile(waypoints, segments)` reste mémoïsé ; seuls le `domain`, `allowDataOverflow` et les positions des références (`ReferenceLine` marqueur + `ReferenceArea` zone) changent au mouvement du slider. Aucune duplication du `AreaChart` : le wrapper Live délègue à `ElevationProfile` (FR-LP-006).

**Décisions**
- `ElevationProfile` étendu de façon **purement additive** : 3 props optionnelles (`domainFromKm`, `domainToKm`, `currentKm`). Sans elles, `domain={['dataMin','dataMax']}` et `allowDataOverflow=false` → planning **strictement inchangé** (AC8, test de non-régression ajouté). `allowDataOverflow` activé seulement quand la fenêtre est définie, pour clipper proprement hors fenêtre.
- Marqueur position = `ReferenceLine` verte `#16a34a` `strokeWidth={2}` (cohérent avec l'ancien `ElevationStrip`).
- Zone de recherche **clampée** dans la fenêtre via `clamp(target ± searchRadiusKm, domainFromKm, domainToKm)` pour éviter tout débordement hors axe (et garantir `x1 ≤ x2`).
- Constante nommée `PROFILE_LOOKAHEAD_KM = 100` (pas de magic number).
- `currentKmOnRoute === null` (GPS pas snappé) → trace complète, sans marqueur ni zone (dégradation gracieuse, pas de crash).
- **Cleanup** : `ElevationStrip` n'était plus utilisé que comme contenu provisoire du conteneur PROFIL (posé en Story 1). Remplacé par `LiveElevationProfile` ; `elevation-strip.tsx` + `elevation-strip.test.tsx` (orphelins, aucune autre référence) supprimés. Variables mortes `elevationCurrentDistKm`/`elevationTargetDistKm` retirées de `page.tsx`.

**Couverture AC** — AC1 (réutilisation `ElevationProfile`, pas de duplication) ✓ ; AC2 (bord gauche = `currentKmOnRoute` + marqueur vert) ✓ ; AC3 (`ReferenceArea` `#3498db`/0.2 centrée cible ±radius) ✓ ; AC4 (bord droit = cible+100 borné `totalDistKm`, gauche ≥0) ✓ ; AC5 (recadrage temps réel sans recalcul des `points[]`) ✓ ; AC6 (dégradation gracieuse, message « non disponibles ») ✓ ; AC7 (RGPD : aucun appel réseau ajouté, `currentKmOnRoute` client-side) ✓ ; AC8 (non-régression planning : props additives `domain*`/`currentKm`/`compact` + tests) ✓.

**Itérations post-implémentation (retours Guillaume, même session)** — voir Change Log v1.1→1.6 pour le détail :
- *UI panneau* (`live-controls.tsx`) : séparateur déplacé sous le graphique (au-dessus de « MON HÔTEL DANS », `m-0`) ; marges resserrées (`pt-2 pb-6`, en-tête `min-h-[36px] py-1`) ; chevron réduit (`h-6 w-6`) avec en-tête entièrement cliquable ; hauteur du conteneur profil `h-[130px]` → `h-[80px]` + `mb-[5px]`.
- *Espace sous l'axe de distance* (`elevation-profile.tsx`) : prop additive **`compact`** → `XAxis height={16}` + `margin.bottom: 2` (la bande X par défaut de Recharts, 30 px, était trop haute pour un libellé de 10 px). Planning inchangé. `LiveElevationProfile` passe `compact`.
- *Fausse piste assumée puis annulée* : un fenêtrage de l'axe **Y** (v1.3) avait été tenté pour « remplir » le graphique, mais Guillaume veut **garder le point le plus haut de la trace** comme échelle d'altitude (meilleure lecture du dénivelé) → entièrement **revert** (v1.4).
- *Fix carte* (`live-map-canvas.tsx`) : le cercle `searchRadiusKm` passait **sous le panneau** car le padding bas du `fitBounds` était codé en dur à 240 px alors que le panneau ouvert fait ~340 px (depuis l'ajout de la section PROFIL). Remplacé par `searchZoneBottomPadding()` qui **lit la hauteur réelle du panneau** (`[data-testid="live-controls"]` + 16 px ; fallback 240 px) → robuste aux futures retouches de hauteur. Appliqué à l'auto-zoom slider **et** à `fitToSearchZone` ; debounce slider 150→220 ms.

**Validations (état final)** — `pnpm --filter web test` : **1097/1097** verts (90 fichiers ; +16 tests nets vs baseline 1081 : fenêtrage Live, marqueur, `compact`, wrapper, `searchZoneBottomPadding`, ajustements `live-controls` ; −5 des tests `elevation-strip` supprimés). ESLint sur fichiers modifiés : **0 erreur** (2 warnings pré-existants dans `page.tsx` : `@next/next/no-img-element` sur le logo Strava, `react-hooks/exhaustive-deps` sur l'auto-zoom — non touchés). App-code `tsc` propre (erreurs résiduelles uniquement dans des fixtures de tests pré-existantes, ignorées par `next build`).

### File List

- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` (modifié — props `domainFromKm`/`domainToKm`/`currentKm`, XAxis domain paramétrable + `allowDataOverflow`, marqueur position vert)
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx` (modifié — mock XAxis expose le domain ; tests fenêtrage Live + non-régression + marqueur)
- `apps/web/src/app/(app)/live/[id]/_components/live-elevation-profile.tsx` (nouveau — wrapper Live : calcul fenêtre/zone/marqueur, délègue à `ElevationProfile`)
- `apps/web/src/app/(app)/live/[id]/_components/live-elevation-profile.test.tsx` (nouveau — fenêtre/zone/recadrage/null/no-elevation/dérivation totalDistKm)
- `apps/web/src/app/(app)/live/[id]/page.tsx` (modifié — `ElevationStrip` → `LiveElevationProfile` dans le conteneur PROFIL ; import + variables mortes retirés)
- `apps/web/src/app/(app)/live/[id]/_components/elevation-strip.tsx` (supprimé — orphelin)
- `apps/web/src/app/(app)/live/[id]/_components/elevation-strip.test.tsx` (supprimé — orphelin)
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` (modifié — séparateur déplacé sous le graphique ; marges resserrées ; chevron réduit ; hauteur profil `h-[80px]` + `mb-[5px]`)
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` (modifié — assertions séparateur + hauteur `h-[80px]`)
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` (modifié — padding bas du `fitBounds` (auto-zoom slider + `fitToSearchZone`) lit la hauteur réelle du panneau `live-controls` via `searchZoneBottomPadding()` au lieu d'un 240px codé en dur → le cercle de la zone de recherche n'est plus masqué par le panneau ; debounce 150→220 ms)
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx` (modifié — 3 tests `searchZoneBottomPadding` : fallback 240 / hauteur panneau + 16 / hauteur nulle)

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-06-01 | 1.0 | Implémentation Story live-profile.2 : profil d'élévation interactif contextualisé en mode Live (fenêtre position→cible+100 km, marqueur position, surlignage zone, zoom piloté slider via `domain` XAxis sans recalcul des données). `ElevationProfile` étendu rétro-compatible, wrapper `LiveElevationProfile`, branchement `page.tsx`, suppression `ElevationStrip` orphelin. 1091/1091 tests verts, ESLint clean. Status → review. |
| 2026-06-01 | 1.1 | Ajustement UI (retour Guillaume) : séparateur déplacé sous le graphique d'élévation (au-dessus de « MON HÔTEL DANS ») au lieu de sous l'en-tête « PROFIL ». `live-controls.tsx` : retrait `border-b` du bouton en-tête, ajout `border-t` au bloc MON HÔTEL. Test mis à jour. 1091/1091 verts. |
| 2026-06-01 | 1.2 | Ajustement UI (retour Guillaume) : marges de la zone profil resserrées (`pt-2 pb-6` root, en-tête `min-h-[36px] py-1`, bloc MON HÔTEL `mt-2 mb-4 pt-3`) et chevron réduit (cercle `h-6 w-6`, icône `h-3.5`). Tout l'en-tête PROFIL reste cliquable pour ouvrir/fermer (bouton pleine largeur déjà en place). 1091/1091 verts. |
| 2026-06-01 | 1.2.1 | Séparateur : `margin: 0` (`m-0`) sur le bloc `profile-separator`. |
| 2026-06-01 | 1.3 | Fenêtrage **axe Y** (retour Guillaume — « énormément d'espace en dessous du graphique ») : l'axe Y était mis à l'échelle sur toute la trace (sommet lointain → courbe écrasée en bas, ~80 % vide). Ajout props additives `yDomainFromM`/`yDomainToM` + `allowDataOverflow` Y sur `ElevationProfile` (planning inchangé, défaut `['auto','auto']`). `LiveElevationProfile` calcule min/max des élévations **dans la fenêtre X visible** (boucle, pas de spread → pas de stack overflow), padding ~15 % (min 10 m), et borne l'axe Y → la courbe remplit la hauteur. Padding bas du bloc distance réduit `pt-2`. +4 tests (Y-window + non-régression Y auto). 1095/1095 verts, ESLint clean. |
| 2026-06-01 | 1.4 | **Annulation du fenêtrage Y de la v1.3** (clarification Guillaume) : on garde le point le plus haut de la trace comme échelle d'altitude (meilleure lecture du dénivelé). Props `yDomain*` retirées. Le vrai problème = l'**espace sous l'axe de distance** : la bande X par défaut de Recharts fait 30 px, trop pour un libellé de 10 px. Ajout prop additive `compact` sur `ElevationProfile` → `XAxis height={16}` + `margin.bottom: 2` (planning inchangé, défaut 30/16). `LiveElevationProfile` passe `compact`. Tests Y-window remplacés par tests `compact` (bande X resserrée / non-régression). 1094/1094 verts, ESLint clean. |
| 2026-06-01 | 1.5 | Ajustement UI (retour Guillaume) : hauteur du conteneur profil `h-[130px]` → `h-[80px]` + `mb-[5px]` (5 px sous le graphique, à l'état ouvert uniquement). Tests `live-controls` mis à jour (`h-[80px]`). 1094/1094 verts. |
| 2026-06-01 | 1.7 | **Code review (patch P1)** : garde anti-inversion du domaine X dans `live-elevation-profile.tsx` — `domainToKm = Math.max(domainFromKm, Math.min(total, …))` pour ne jamais passer un domaine inversé/vide à Recharts si la position GPS dépasse la fin de trace (flottant) ou si `total` est indéterminé. +1 test (`currentKmOnRoute=305 > total 300` → `[305,305]`). 1098/1098 verts, ESLint clean. (Findings P2 doc + 3 reports : voir section Review Findings.) |
| 2026-06-01 | 1.6 | **Fix carte** (retour Guillaume — « le cercle de la zone de recherche passe sous le panneau ») : depuis l'ajout de la section PROFIL, le panneau ouvert (~340 px) dépassait le padding bas `fitBounds` codé en dur à 240 px → le cercle `searchRadiusKm` était masqué. Remplacement par `searchZoneBottomPadding()` qui **lit la hauteur réelle du panneau** `[data-testid="live-controls"]` (+16 px de marge ; fallback 240 px si non monté) — robuste aux futures retouches de hauteur. Appliqué à l'auto-zoom slider ET à `fitToSearchZone`. Debounce slider 150→220 ms (laisse la section finir son expansion 200 ms avant la mesure). +3 tests. 1097/1097 verts, ESLint clean. |
