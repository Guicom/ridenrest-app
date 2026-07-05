---
baseline_commit: 1f1aa10c1f7907ea57bc352c9fd74196767edc79
---

# Story MOB-5.5 : Profil d'élévation interactif contextualisé

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cycliste utilisant le mode Live**,
I want **un profil d'élévation qui commence à ma position, surligne la zone recherchée et se termine ~100 km plus loin, avec zoom piloté par le slider**,
So that **je lis le terrain entre moi et mon prochain arrêt**.

> **Dépend de MOB-5.4** (section PROFIL repliable — cette story fournit le `profileContent`) **et MOB-5.1** (`currentKmOnRoute`, `useLiveStore`). Cette story porte la **donnée** du profil (`useElevationProfile`, **pur, porté verbatim du web**) et **construit le rendu RN** (web utilise Recharts/DOM → **non portable** → rendu via **`react-native-svg`**).
>
> **Frontend uniquement — aucun appel serveur (NFR-LP-005).** Parité comportementale avec le web `live-profile-2` (`done`).
>
> ⚠️ **`react-native-svg@15.15.4` déjà installé** (pins POI, wordmark Strava) → **pas de module natif neuf, pas de prebuild**. `react-native-reanimated@4.3.1` disponible pour le zoom fluide.
>
> ⚠️ **Plus gros net-new build de l'epic** : aucune base de graphe d'élévation n'existe sur mobile. Le **zoom = changer le domaine X visible**, PAS re-trancher les `points[]` (NFR-LP-002).

## Acceptance Criteria

1. **Given** une aventure avec données d'élévation et le Live actif
   **When** la section « PROFIL » est ouverte
   **Then** un profil d'élévation est rendu via **`react-native-svg`** (un seul `<Path>` **memoïsé**, logique `useElevationProfile` réutilisée) (FR-LP-006)
   **And** le **bord gauche** correspond à ma **position GPS projetée** (`currentKmOnRoute`) avec un **marqueur** (FR-LP-007)

2. **Given** la section ouverte
   **When** je regarde le profil
   **Then** une **zone surlignée** indique la zone recherchée, **centrée sur la cible** avec la **largeur du rayon** (`target ± searchRadiusKm`) (FR-LP-008)
   **And** le **bord droit** se termine **≈ 100 km au-delà de la cible**, borné par la **fin de trace** (FR-LP-009)

3. **Given** la section ouverte
   **When** je **déplace le slider**
   **Then** la **fenêtre visible s'étend/réduit en temps réel**, marqueur et zone **repositionnés**, **sans recalcul des `points[]`** (zoom = domaine X) (FR-LP-010, NFR-LP-002)

4. **Given** une aventure **sans données d'élévation** (`hasElevationData === false`)
   **When** j'ouvre la section
   **Then** **aucun graphe vide** n'est affiché : message discret ou section non dépliable, **sans erreur** (FR-LP-011) — coordonné avec la garde `hasProfile` de MOB-5.4 (`profileContent = null`)

5. **Given** le calcul de position
   **When** le profil démarre à ma position
   **Then** **aucune coordonnée GPS n'est envoyée au serveur** (`snapToTrace` / `currentKmOnRoute` **client-side**) (NFR-LP-001)

## Tasks / Subtasks

- [x] **T1 — `hooks/use-elevation-profile.ts` (porté verbatim, pur)** (AC: 1)
  - [x] Porter `apps/web/src/hooks/use-elevation-profile.ts` (72 l) **tel quel** (pur, memoïsé, zéro DOM → 100% portable). Entrées : `waypoints` (cumulés), `segments`. Sortie : `{ points, boundaries, hasElevationData, totalDPlus, totalDMinus }` — filtre les waypoints à `ele` valide, calcule par point `cumulativeDPlus`/`cumulativeDMinus`/`slope%`, `boundaries` = débuts de segment (sauf 1er).
  - [x] **Memoïsation stricte** : `points[]` ne dépend QUE de `waypoints`/`segments` (pas du slider) → stable sur déplacement du slider (NFR-LP-002). _(Test : référence `points` stable au rerender.)_

- [x] **T2 — Rendu RN `components/live/elevation-chart.tsx` (`react-native-svg`)** (AC: 1, 2, 3)
  - [x] **Construire** le graphe en `react-native-svg` (web Recharts non portable). Un seul `<Path>` d'aire **memoïsé** (`useMemo` sur `points` + `height`, **pas** sur le domaine — `buildAreaPathD` pur, x = km BRUT). Le domaine visible pilote le `<G transform>` (zoom), pas le `d` du path.
  - [x] **Marqueur position** : ligne verticale verte `#16a34a` (strokeWidth 2) à `currentKmOnRoute` (FR-LP-007).
  - [x] **Zone recherchée** : rectangle bleu `#3498db` opacité 0.2 sur `[searchFromKm, searchToKm]` (FR-LP-008).
  - [x] **Zoom = domaine X** : `domainFromKm`/`domainToKm` pilotent le transform (`translate`+`scale x`) + `clipPath` (équivalent `allowDataOverflow` Recharts) — **ne recompute jamais `points[]` ni le `d`** (FR-LP-010). Y reste sur le **domaine plein** (windowing Y reverté web v1.4 — non refait). `vectorEffect="non-scaling-stroke"` → crête à épaisseur constante malgré le scale x.
  - [~] Transition fluide via `react-native-reanimated` (optionnel NFR-LP-004) : **non implémenté** — la coquille repliable (MOB-5.4) anime déjà l'ouverture (Animated) ; le zoom domaine est instantané par re-render (pas de saccade vu la stabilité des `points`). Reanimated différé (pas requis par les AC).

- [x] **T3 — Wrapper Live `components/live/live-elevation-profile.tsx` (windowing)** (AC: 1, 2, 3, 4)
  - [x] **Porter** la math web (pure, `computeProfileWindow`) : `PROFILE_LOOKAHEAD_KM = 100` (constante nommée) ; `domainFromKm = max(0, currentKmOnRoute)` ; `domainToKm = max(domainFromKm, min(dataMaxKm, currentKmOnRoute + targetAheadKm + 100))` (**garde anti-inversion** `max(domainFromKm, …)`) ; zone `searchFromKm/ToKm = clamp(target ± searchRadiusKm, domainFromKm, domainToKm)` (bornée DANS la fenêtre).
  - [x] **`currentKmOnRoute === null`** → **trace pleine** (domaine [dataMinKm, dataMaxKm]), pas de marqueur, pas de zone.
  - [x] **`hasElevationData === false`** (ou < 2 points) (AC4) → **retourner `null`** → côté MOB-5.4 `profileContent` `null`/`undefined` → section non dépliable. **Pas de graphe vide.**

- [x] **T4 — Branchement comme `profileContent` (MOB-5.4)** (AC: 1, 4, 5)
  - [x] Dans `(app)/live/[id].tsx` : `profileContent = showProfile ? <LiveElevationProfile waypoints segments currentKmOnRoute targetAheadKm searchRadiusKm accessibilityLabel /> : undefined`. `showProfile` = ≥ 2 waypoints à `ele` valide (gate AC4). `currentKmOnRoute` vient de `useLiveStore` (`snapToTrace`, **client-side** — RGPD).
  - [x] D+/D- de la fenêtre (métriques 5.4) : **exposé depuis le wrapper** (`computeWindowElevation` sur `[currentKmOnRoute, +targetAheadKm]`) → single-source pour la ligne métriques de 5.4 (l'ancien calcul local de `[id].tsx` est remplacé — résout l'Open Question 5.4).

- [x] **T5 — i18n + a11y** (AC: 4)
  - [x] `live.profile.noElevation` (repli graphe, AC4), `live.profile.a11yLabel` (description graphe pour lecteur d'écran : D+/D- fenêtre `{{dPlus}}`/`{{dMinus}}`). FR/EN parité, zéro chaîne en dur (chart `accessibilityLabel`).

- [x] **T6 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5)
  - [x] `use-elevation-profile` (pur) : `points`/`boundaries`/`hasElevationData`/D+/D- ; filtre `ele` invalide ; `points` stable (référence) au rerender (NFR-LP-002).
  - [x] windowing (`computeProfileWindow`) : `domainToKm >= domainFromKm` (anti-inversion, overshoot fin de trace), `PROFILE_LOOKAHEAD_KM=100`, zone clampée DANS la fenêtre, `currentKmOnRoute=null` → trace pleine sans marqueur. + `computeWindowElevation` (single source D+/D-).
  - [x] `hasElevationData=false` → wrapper rend `null` (`ElevationChart` jamais appelé — pas de graphe vide).
  - [x] `elevation-chart` (helpers purs) : `buildAreaPathD` invariant au domaine (NFR-LP-002, x = km brut), `projectX` (marqueur/zone repositionnés selon domaine), couleurs marqueur `#16a34a`/zone `#3498db`. _(Le rendu SVG natif n'est pas introspectable sous jest-expo → couvert par Maestro T7.)_
  - [x] Gate : `test` (576 verts) `typecheck` 0 `lint` 0 + `expo export` iOS OK.

- [x] **T7 — Validation device (Maestro, runner fail-closed)** (AC: 1, 2, 3, 4)
  - [x] `BUILD=1 pnpm test:device live-poi.yaml live-profile.yaml` → **iOS ✓** (smoke + live-poi + live-profile verts, **0 crash**). `live-profile` ouvre la section PROFIL → graphe monté (`id: elevation-chart` visible). Variante `android/live-profile.yaml` créée (cible le label a11y `Dénivelé sur la fenêtre`) — **Android non testé** (émulateur non booté ce run). Reporting honnête : iOS ✓ / Android non testé.
  - [x] Revue visuelle screenshot `live-profile-expanded` : ✅ aire d'élévation verte rendue (`react-native-svg`), marqueur position au **bord gauche** (= position GPS), **zone bleue** sur la cible, silhouette terrain jusqu'au bord droit. Pas de graphe vide / pas de canvas blanc.
  - [x] **🐛 Bug latent MOB-5.4 corrigé** (révélé par T7) : la `CollapsibleProfileSection` ne s'ouvrait JAMAIS avec un contenu réel — l'enfant mesuré était clampé à la hauteur 0 (animée) du parent → `onLayout` reportait 0 → `contentHeight` restait 0 → la garde `expanded && contentHeight===0` bloquait l'expansion à jamais. Jamais déclenché tant que le slot profil était vide (MOB-5.4). Fix : contenu mesuré en `position:'absolute'` (pattern react-native-collapsible) → mesure non clampée. Isolé via un box debug (le box plain ne s'ouvrait pas non plus → bug collapsible, pas chart), puis re-validé device (graphe visible).

## Dev Notes

### Données = porté verbatim ; rendu = ré-implémenté RN

- `apps/web/src/hooks/use-elevation-profile.ts` (72 l) : **pur, memoïsé, zéro DOM → porter tel quel**. `{points, boundaries, hasElevationData, totalDPlus, totalDMinus}`. [Source: apps/web/src/hooks/use-elevation-profile.ts:25-72]
- `apps/web/.../live-elevation-profile.tsx` (80 l, **pur windowing**) : `PROFILE_LOOKAHEAD_KM=100` ; `domainFromKm=max(0,currentKm)` ; `domainToKm=max(domainFromKm, min(total, currentKm+targetAhead+100))` (**garde anti-inversion** review P1 v1.7) ; zone `clamp(target±radius, domainFrom, domainTo)`. `currentKm===null` → trace pleine. [Source: apps/web/.../live-elevation-profile.tsx:44-64]
- `apps/web/.../map/[id]/_components/elevation-profile.tsx` (195 l) = base **Recharts** (`AreaChart`/`Area`/`XAxis`/`ReferenceLine`/`ReferenceArea`) — **NON portable RN** (DOM/SVG web). **Re-rendre en `react-native-svg`** : un `<Path>` aire memoïsé, échelles depuis le domaine, `allowDataOverflow` → clip au domaine. Marqueur vert `#16a34a` sw2 (`:166-172`), zone bleue `#3498db` op0.2 (`:157-165`). [Source: apps/web/.../elevation-profile.tsx]

### Contraintes critiques (review live-profile-2)

- **Zoom = domaine X, PAS re-slice** (NFR-LP-002) — garde le memo `points[]` stable sur slider. [Source: live-profile-2-interactive-elevation-profile.md §Review]
- **Anti-inversion domaine** : `domainToKm` planché à `domainFromKm` (axe ne s'effondre/inverse pas en fin de ride / trace dégénérée). [Source: live-profile-2-…md P1 v1.7]
- **Y plein** : windowing Y tenté v1.3 → **reverté v1.4** (Guillaume). Garder Y full domain. [Source: live-profile-2-…md]
- `PROFILE_LOOKAHEAD_KM=100` = constante nommée (pas de magic number). Zone clampée DANS la fenêtre (ReferenceArea ne déborde pas l'axe).

### RGPD / projection (client-side)

- `currentKmOnRoute` provient de `snapToTrace` (MOB-5.1, **client-side**) — le serveur ne voit jamais la position, même pour le profil (NFR-LP-001). [Source: packages/gpx/src/snap-to-trace.ts ; MOB-5-1-…md]

### Réutilisation du code mobile existant

- **MOB-5.4** : section PROFIL (consomme `profileContent`), garde `hasProfile`.
- **MOB-5.1** : `useLiveStore.currentKmOnRoute`/`targetAheadKm`/`searchRadiusKm`, `useAdventureWaypoints` (cumulés + `isValidLngLat`).
- `react-native-svg@15.15.4` (déjà lié — pas de prebuild), `react-native-reanimated@4.3.1`, `@ridenrest/gpx` (`computeElevationGain/Loss`), `MapSegmentData.elevationGainM/elevationLossM`.

### Conventions & contraintes

- **Frontend-only**, aucun appel serveur (NFR-LP-005). `points[]` stable (memo). Y plein, X windowé. `hasElevationData=false` → `null` (pas de graphe vide). Couleurs : marqueur vert `#16a34a`, zone bleue `#3498db` (parité web ; idéalement via tokens si dispo, sinon inline svg). i18n FR/EN. Tests hors `src/app/`. `react-native-svg` lié (pas de prebuild).

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/hooks/use-elevation-profile.ts            (port verbatim, pur)
apps/mobile/src/components/live/elevation-chart.tsx        (rendu react-native-svg)
apps/mobile/src/components/live/live-elevation-profile.tsx (wrapper windowing)
+ tests co-localisés
```
**Modifs** :
```
apps/mobile/src/app/(app)/live/[id].tsx            (profileContent + D+/D- fenêtre)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (live.profile.*)
```
**Aucune** migration DB / modif serveur. **Aucun** module natif neuf → pas de prebuild.

### Frontière de story

- **Inclus** : `useElevationProfile` (port verbatim), rendu `react-native-svg` (Path memoïsé, marqueur position, zone recherchée), windowing (gauche=position, droite=+100km, zoom domaine X sans re-slice, anti-inversion), `hasElevationData=false` → pas de graphe vide, branchement `profileContent` + D+/D- fenêtre. i18n, tests.
- **Exclu** : coquille repliable / chevron (MOB-5.4) ; slider/recherche (MOB-5.3) ; météo (5.6). **Profil planning** (carte planning) hors scope ici (le composant est conçu réutilisable mais MOB-5 = Live).

### Open Questions

1. **Lib de graphe** : `react-native-svg` direct (recommandé, déjà lié, contrôle total du windowing) vs `victory-native`/`react-native-gifted-charts` (non installés → nouveaux modules + prebuild + moins de contrôle sur le domaine). _(Recommandation : `react-native-svg` direct.)_
2. **Couleurs** marqueur/zone : tokens design-system si équivalents existent (`@ridenrest/design-tokens`), sinon inline svg `#16a34a`/`#3498db` (parité web). _(Vérifier les tokens.)_

### References

- [Source: epics-mobile.md#Story MOB-5.5 (l.997-1025)] — AC d'origine (FR-LP-006→011, NFR-LP-001/002)
- [Source: apps/web/src/hooks/use-elevation-profile.ts] — hook pur à porter verbatim
- [Source: apps/web/.../live/[id]/_components/live-elevation-profile.tsx] — windowing (lookahead 100, anti-inversion, zone clamp)
- [Source: apps/web/.../map/[id]/_components/elevation-profile.tsx] — base Recharts (à re-rendre en react-native-svg)
- [Source: live-profile-2-interactive-elevation-profile.md] — comportement + patches review (zoom=domaine, Y reverté, anti-inversion)
- [Source: MOB-5-4-live-search-panel-collapsible-profile.md] — section PROFIL (consomme profileContent)
- [Source: MOB-5-1-live-activation-consent-permissions.md] — `currentKmOnRoute` (snapToTrace client-side)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, dev-story workflow)

### Debug Log References

- Tests RNTL : `renderHook` jugé peu fiable (leçon MOB-3.1) → composant-sonde + `await render` pour le hook pur.
- `react-native-svg` non rendable sous jest-expo (les primitives ne produisent pas de nœuds hôtes introspectables) ET une factory `jest.mock('react-native-svg', …)` déclenche le guard NativeWind `_ReactNativeCSSInterop` (interdit par babel-jest-hoist). → Géométrie du chart extraite en helpers **purs** (`buildAreaPathD`, `projectX`) testés directement ; rendu SVG (couleurs/transform/clip) couvert par Maestro (T7).

### Completion Notes List

- **T1** `use-elevation-profile.ts` porté verbatim du web (pur, memoïsé `[waypoints, segments]`, zéro DOM). Référence `points` stable au rerender → NFR-LP-002.
- **T2** `elevation-chart.tsx` (react-native-svg) : un seul `<Path>` d'aire dont le `d` est construit par `buildAreaPathD(points, height)` (x = km **brut**, y = pixels échelle Y figée = domaine plein) → **memoïsé sur `[points, height]`, jamais sur le domaine**. Le zoom est appliqué par un `<G transform="translate(tx) scale(sx 1)">` + `clipPath` (équivalent `allowDataOverflow`) — `points[]`/`d` jamais recomputés (NFR-LP-002). Marqueur position vert `#16a34a`, zone recherchée bleue `#3498db`, bornes pointillées. `vectorEffect=non-scaling-stroke`.
- **T3** `live-elevation-profile.tsx` : `computeProfileWindow` (pur) — gauche = position (≥0), droite = cible + `PROFILE_LOOKAHEAD_KM` (100) borné par `dataMaxKm`, **garde anti-inversion** `domainToKm = max(domainFromKm, …)`, zone clampée DANS la fenêtre. `currentKmOnRoute=null` → trace pleine. `!hasElevationData || points<2` → `null` (AC4, pas de graphe vide).
- **T4** Branchement `(app)/live/[id].tsx` : `profileContent = showProfile ? <LiveElevationProfile …/> : undefined` (`showProfile` = ≥2 waypoints à `ele` valide). Le calcul D+/D- local de `[id].tsx` est **remplacé** par `computeWindowElevation` (exporté du wrapper) → single source partagée écran↔profil (résout l'Open Question 5.4). RGPD : `currentKmOnRoute` client-side (`snapToTrace`), aucune coordonnée serveur.
- **T5** i18n `live.profile.noElevation` + `live.profile.a11yLabel` (FR/EN) ; le chart porte un `accessibilityLabel` décrivant le D+/D- de la fenêtre.
- **T6** 23 tests neufs (hook, windowing/window-elevation, helpers chart). Suite mobile : **576 verts**. `typecheck` 0, `lint` 0, `check:native-config` OK, `expo export` iOS OK.
- **T7** Validation device **iOS ✓** (`BUILD=1 pnpm test:device live-poi live-profile`, 0 crash) : graphe d'élévation monté + visible (`id: elevation-chart`) après ouverture de la section ; screenshot confirme l'aire verte + marqueur position (bord gauche) + zone bleue. **Android non testé** (émulateur non booté) — variante `android/live-profile.yaml` prête.
- **🐛 Fix cross-story MOB-5.4** (`collapsible-profile-section.tsx`) : la section PROFIL ne s'ouvrait jamais avec un contenu réel (enfant mesuré clampé à la hauteur 0 du parent animé → `onLayout`=0 → garde bloquante). Contenu désormais mesuré en `position:'absolute'` (mesure naturelle non clampée, pattern react-native-collapsible). Bug latent invisible en MOB-5.4 (slot vide), révélé par MOB-5.5 (1er contenu réel) → corrigé ici. 28 tests collapsible/live-controls toujours verts.
- **Hors-scope confirmé** : aucun module natif neuf (`react-native-svg` déjà lié) → **pas de prebuild** ; frontend-only, aucun appel serveur.

### File List

**Ajouts :**
- `apps/mobile/src/hooks/use-elevation-profile.ts` (port verbatim, pur)
- `apps/mobile/src/hooks/use-elevation-profile.test.ts`
- `apps/mobile/src/components/live/elevation-chart.tsx` (rendu react-native-svg + helpers purs)
- `apps/mobile/src/components/live/elevation-chart.test.tsx`
- `apps/mobile/src/components/live/live-elevation-profile.tsx` (wrapper windowing + `computeWindowElevation`)
- `apps/mobile/src/components/live/live-elevation-profile.test.tsx`
- `apps/mobile/.maestro/live-profile.yaml`
- `apps/mobile/.maestro/android/live-profile.yaml`

**Modifs :**
- `apps/mobile/src/app/(app)/live/[id].tsx` (profileContent + D+/D- via `computeWindowElevation` single source + `showProfile`)
- `apps/mobile/src/components/live/collapsible-profile-section.tsx` (**🐛 fix MOB-5.4** : mesure du contenu en `position:'absolute'` → la section s'ouvre réellement)
- `apps/mobile/src/lib/i18n/locales/fr.json` (`live.profile.*`)
- `apps/mobile/src/lib/i18n/locales/en.json` (`live.profile.*`)

**Docs :**
- `_bmad-output/implementation-artifacts/MOB-5-5-interactive-elevation-profile-contextual.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Review Findings (code review 2026-06-28)

### Patches appliqués

- [x] **P-A (P2)** — `overflow:'hidden'` ajouté sur la View interne `position:'absolute'` dans `CollapsibleProfileSection`. Sur Android, `overflow:'hidden'` sur `Animated.View` ne clippe pas les enfants absolus → le graphe débordait visuellement pendant l'animation de fermeture. Fix: `style={{ …, overflow: 'hidden' }}` sur la View interne. `apps/mobile/src/components/live/collapsible-profile-section.tsx`.
- [x] **P-B (P2)** — `profileContent` extrait en `useMemo` dans `[id].tsx`. En mode Live, `LiveScreen` re-rend à ~1 Hz (ticks GPS). Sans mémo, une nouvelle référence JSX était créée à chaque render → `LiveControls` re-rendait systématiquement et `ElevationChart` recomputait `sx`/`tx` inutilement. `apps/mobile/src/app/(app)/live/[id].tsx`.
- [x] **P-C (P3)** — `ClipPath id` remplacé par `useId()` dans `ElevationChart`. Sur iOS le scoping est par `<Svg>` instance (sûr), mais sur Android le `RNSVGRenderableManager` enregistre les IDs globalement → deux instances simultanées collisionneraient. `apps/mobile/src/components/live/elevation-chart.tsx`.

### Acceptances vérifiées

- ✅ AC1, AC2, AC3, AC4, AC5 — tous PASS
- ✅ NFR-LP-001 (GPS client-side), NFR-LP-002 (zoom = domaine X, pathD invariant), NFR-LP-005 (frontend-only)

### Déférés → `deferred-work.md`

4 items documentés (D-1 à D-4) : divergence algo D+/D-, dead fields totalDPlus/totalDMinus, edge case currentKmOnRoute<0, fallback noElevation dead code.

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.5 (ready-for-dev) — profil d'élévation interactif Live : `useElevationProfile` (port verbatim, pur, memo stable), rendu **`react-native-svg`** (Path memoïsé — Recharts web non portable), marqueur position (`currentKmOnRoute`), zone recherchée (`target±radius`), windowing (gauche=position, droite=+100km, garde anti-inversion), **zoom = domaine X sans re-slice** (NFR-LP-002), `hasElevationData=false` → pas de graphe vide (FR-LP-011), branchement `profileContent` (5.4) + D+/D- fenêtre. RGPD client-side (`snapToTrace`). react-native-svg déjà lié → pas de prebuild. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
| 2026-06-28 | 0.2 | Implémentation MOB-5.5 (dev-story) — T1→T6 livrés : `useElevationProfile` (port verbatim pur), `ElevationChart` (react-native-svg ; `<Path>` aire memoïsé `buildAreaPathD` invariant au domaine, zoom = `<G transform>`+clip, Y plein, marqueur vert `#16a34a`, zone bleue `#3498db`), `LiveElevationProfile` (`computeProfileWindow` lookahead 100 + anti-inversion + zone clampée, `null` si pas d'élévation/<2 pts), branchement `profileContent` (`showProfile`) + **single source D+/D-** `computeWindowElevation` (remplace le calcul local de `[id].tsx`, résout Open Question 5.4), i18n `live.profile.*` FR/EN. 23 tests neufs ; gate vert : **jest 576 · tsc 0 · lint 0 · check:native-config OK · expo export iOS OK**. Aucun module natif neuf → pas de prebuild. T7 : flows Maestro `live-profile.yaml` (iOS) + `android/live-profile.yaml` créés, validation device en cours. | bmad-dev-story (Amelia) |
| 2026-06-28 | 0.3 | Validation device **iOS ✓** (`BUILD=1 pnpm test:device live-poi live-profile`, 0 crash) — graphe d'élévation visible après ouverture de la section ; screenshot confirme aire verte + marqueur position (bord gauche) + zone bleue. **🐛 Fix cross-story MOB-5.4** : `collapsible-profile-section.tsx` ne s'ouvrait jamais avec un contenu réel (enfant clampé à la hauteur 0 animée du parent → `onLayout`=0 → garde bloquante) ; contenu mesuré en `position:'absolute'` (pattern react-native-collapsible). Bug latent invisible tant que le slot profil était vide, révélé par MOB-5.5. Isolé via box debug puis re-validé device. **Android non testé** (émulateur non booté ; variante `android/live-profile.yaml` prête). Gate re-vert : jest 576 · tsc 0 · lint 0 · expo export iOS OK. | bmad-dev-story (Amelia) |
