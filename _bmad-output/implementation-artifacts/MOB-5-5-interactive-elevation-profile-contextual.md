# Story MOB-5.5 : Profil d'élévation interactif contextualisé

Status: ready-for-dev

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

- [ ] **T1 — `hooks/use-elevation-profile.ts` (porté verbatim, pur)** (AC: 1)
  - [ ] Porter `apps/web/src/hooks/use-elevation-profile.ts` (72 l) **tel quel** (pur, memoïsé, zéro DOM → 100% portable). Entrées : `waypoints` (cumulés), `segments`. Sortie : `{ points, boundaries, hasElevationData, totalDPlus, totalDMinus }` — filtre les waypoints à `ele` valide, calcule par point `cumulativeDPlus`/`cumulativeDMinus`/`slope%`, `boundaries` = débuts de segment (sauf 1er).
  - [ ] **Memoïsation stricte** : `points[]` ne dépend QUE de `waypoints`/`segments` (pas du slider) → stable sur déplacement du slider (NFR-LP-002).

- [ ] **T2 — Rendu RN `components/live/elevation-chart.tsx` (`react-native-svg`)** (AC: 1, 2, 3)
  - [ ] **Construire** le graphe en `react-native-svg` (web Recharts non portable). Un seul `<Path>` d'aire **memoïsé** (`useMemo` sur `points` + dimensions, **pas** sur le domaine). Échelles x/y calculées depuis le **domaine visible** (props), pas re-tranchage des points.
  - [ ] **Marqueur position** : ligne verticale verte `#16a34a` (strokeWidth 2) à `currentKmOnRoute` (FR-LP-007).
  - [ ] **Zone recherchée** : rectangle bleu `#3498db` opacité 0.2 sur `[searchFromKm, searchToKm]` (FR-LP-008).
  - [ ] **Zoom = domaine X** : les props `domainFromKm`/`domainToKm` pilotent les échelles ; le `<Path>` est clippé au domaine (équivalent `allowDataOverflow` Recharts) — **ne recompute jamais `points[]`** (FR-LP-010). Y reste sur le **domaine plein** (le windowing Y a été tenté puis **REVERTÉ** côté web, v1.4 — ne PAS le refaire).
  - [ ] Transition fluide du domaine via `react-native-reanimated` (optionnel, NFR-LP-004 partagé avec 5.4).

- [ ] **T3 — Wrapper Live `components/live/live-elevation-profile.tsx` (windowing)** (AC: 1, 2, 3, 4)
  - [ ] **Porter** la math web `live-elevation-profile.tsx` (80 l, pure) : `PROFILE_LOOKAHEAD_KM = 100` (constante nommée) ; `domainFromKm = max(0, currentKmOnRoute)` ; `domainToKm = max(domainFromKm, min(total, currentKmOnRoute + targetAheadKm + 100))` (**garde anti-inversion** `max(domainFromKm, …)` — patch review web P1, évite l'axe qui s'effondre/inverse en fin de trace) ; zone `searchFromKm/ToKm = clamp(target ± searchRadiusKm, domainFromKm, domainToKm)` (zone bornée DANS la fenêtre).
  - [ ] **`currentKmOnRoute === null`** → rendre la **trace pleine**, pas de marqueur, pas de zone.
  - [ ] **`hasElevationData === false`** (AC4) → **ne rien rendre** (retourner `null`) → côté MOB-5.4 `profileContent = null` → section non dépliable + message discret. **Pas de graphe vide.**

- [ ] **T4 — Branchement comme `profileContent` (MOB-5.4)** (AC: 1, 4, 5)
  - [ ] Dans `(app)/live/[id].tsx` : `profileContent = hasElevationData ? <LiveElevationProfile waypoints segments currentKmOnRoute={...} targetAheadKm searchRadiusKm /> : null` (passé à la section PROFIL de 5.4). `currentKmOnRoute` vient de `useLiveStore` (projeté `snapToTrace` en MOB-5.1, **client-side**).
  - [ ] D+/D- de la fenêtre (métriques 5.4) : exposer depuis le wrapper (`computeElevationGain/Loss` sur `[currentKmOnRoute, +targetAheadKm]`) → single-source pour la ligne métriques de 5.4 (résout l'Open Question 5.4).

- [ ] **T5 — i18n + a11y** (AC: 4)
  - [ ] `live.profile.noElevation` (message discret AC4), `live.profile.a11yLabel` (description du graphe pour lecteur d'écran : D+/D- de la fenêtre, position). FR/EN parité, zéro chaîne en dur.

- [ ] **T6 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5)
  - [ ] `use-elevation-profile` (pur) : `points`/`boundaries`/`hasElevationData`/D+/D- ; filtre `ele` invalide ; `points` stable (référence) quand seules les props de domaine changent (NFR-LP-002).
  - [ ] windowing (`live-elevation-profile`) : `domainToKm >= domainFromKm` (anti-inversion), `PROFILE_LOOKAHEAD_KM=100`, zone clampée DANS la fenêtre, `currentKmOnRoute=null` → trace pleine sans marqueur.
  - [ ] `hasElevationData=false` → `null` (pas de graphe vide).
  - [ ] `elevation-chart` (mock svg) : `<Path>` memoïsé (pas recomputé sur changement de domaine), marqueur vert à `currentKmOnRoute`, zone bleue sur le rayon.
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` iOS OK.

- [ ] **T7 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4) — ⏳ build Dev Client
  - [ ] Ouvrir PROFIL → graphe commence à ma position (marqueur), zone bleue centrée sur la cible (largeur = rayon), bord droit ~100 km après.
  - [ ] Bouger le slider → la fenêtre zoome en temps réel, marqueur/zone suivent, pas de saccade (points stables).
  - [ ] Aventure sans élévation → pas de graphe vide (message/section non dépliable).

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.5 (ready-for-dev) — profil d'élévation interactif Live : `useElevationProfile` (port verbatim, pur, memo stable), rendu **`react-native-svg`** (Path memoïsé — Recharts web non portable), marqueur position (`currentKmOnRoute`), zone recherchée (`target±radius`), windowing (gauche=position, droite=+100km, garde anti-inversion), **zoom = domaine X sans re-slice** (NFR-LP-002), `hasElevationData=false` → pas de graphe vide (FR-LP-011), branchement `profileContent` (5.4) + D+/D- fenêtre. RGPD client-side (`snapToTrace`). react-native-svg déjà lié → pas de prebuild. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
