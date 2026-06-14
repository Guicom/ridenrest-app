# Story MOB-4.4 : Analyse de densité & trace colorisée

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur planifiant**,
I want **lancer une analyse de densité et voir ma trace colorisée**,
So that **j'identifie d'un coup d'œil les zones à risque d'hébergement**.

> **Dépend de MOB-4.1** (carte + trace LineString). Cette story ajoute : le **déclenchement** de l'analyse de densité (job async + polling), le **rendu de la trace colorisée par tronçon** (vert/orange/rouge) en remplacement/superposition de la trace uniforme, et une **légende textuelle accessible** (daltonisme).
>
> **Backend densité livré (web `done`)** : `POST /density/analyze` (202, enqueue BullMQ) + `GET /density/:adventureId/status` (polling). **Rien à recréer serveur.** La logique de **buckets** (0/1/≥2 hébergements par tronçon 10 km) et les **couleurs** sont canon — mirror, ne pas redéfinir.

## Acceptance Criteria

1. **Given** une aventure (≥ 1 segment parsé)
   **When** je déclenche l'analyse de densité (en choisissant ≥ 1 catégorie d'hébergement)
   **Then** un **job asynchrone** est lancé via `POST /density/analyze` (202) et le **statut est suivi par polling** sur `GET /density/:adventureId/status` (`refetchInterval` 3000 ms tant que `pending`/`processing`, `false` sinon) (FR-035)
   **And** une analyse **déjà en cours** (409) est gérée par un message « Analyse déjà en cours » (pas d'erreur bloquante)
   **And** la **progression** (`densityProgress` 0-100) est indiquée (skeleton/indicateur scopé, jamais blocage UI)

2. **Given** une analyse **terminée** (`densityStatus === 'success'`)
   **When** la carte se rafraîchit
   **Then** la **trace est colorisée par tronçon** (10 km) : **vert** (≥ 2 hébergements / 10 km), **orange** (1 / 10 km), **rouge** (0 / 10 km), selon `coverageGaps` (FR-022)
   **And** la colorisation est **activable/désactivable** (toggle `densityColorEnabled`) — désactivée, la trace revient à la couleur uniforme `#2D6A4A` (MOB-4.1)

3. **Given** la trace colorisée
   **When** je consulte la carte
   **Then** une **légende textuelle** de la colorisation est **accessible** (libellés explicites « Bonne disponibilité / Disponibilité limitée / Zone critique » — pas seulement la couleur, **accessibilité daltonisme**) (FR-027)

4. **Given** une analyse en **erreur** (`densityStatus === 'error'`) ou des données périmées (`densityStale`)
   **When** l'écran l'affiche
   **Then** un `<ErrorBanner />` (erreur) ou un indicateur « résultats périmés — relancer » (stale) est affiché (jamais `Alert.alert`), avec relance possible

5. **Given** la carte hors-ligne
   **When** une colorisation avait déjà été calculée et est en cache (query persist N1)
   **Then** la dernière trace colorisée connue reste affichable ; le **déclenchement** d'une nouvelle analyse est désactivé offline (message « hors-ligne »)

## Tasks / Subtasks

- [ ] **T1 — Façade `lib/api/density.ts`** (AC: 1, 2, 4)
  - [ ] `triggerDensity(adventureId, categories): Promise<{ message: string }>` → `apiFetch('/density/analyze', { method: 'POST', body: { adventureId, categories } })`. **Pas de job id** — `adventureId` est la clé de polling.
  - [ ] `getDensityStatus(adventureId): Promise<DensityStatusResponse>` → `apiFetch('/density/${adventureId}/status')`.
  - [ ] Types **`DensityStatusResponse` / `DensityStatus` / `CoverageGapSummary` / `DENSITY_ACCOMMODATION_CATEGORIES`** importés racine de `@ridenrest/shared` (jamais redéfinis).

- [ ] **T2 — Hook `hooks/use-density.ts`** (AC: 1, 2, 4)
  - [ ] `useDensityStatus(adventureId)` → `useQuery({ queryKey: ['density', adventureId], queryFn: getDensityStatus, refetchInterval: q => ['pending','processing'].includes(q.state.data?.densityStatus) ? 3000 : false })`. Parité web. (Réutiliser la forme du helper polling.)
  - [ ] `useTriggerDensity(adventureId)` → `useMutation({ mutationFn: triggerDensity, onSuccess: invalidate ['density', adventureId] })`. Gérer **409** (déjà en cours) → message dédié (ne pas traiter comme une erreur fatale ; mapper le code).
  - [ ] Exposer : `status` (`idle|pending|processing|success|error`), `progress`, `coverageGaps`, `stale`, `isPending` (trigger), flags message 409.

- [ ] **T3 — Colorisation de la trace `lib/map/density-layer.ts`** (AC: 2)
  - [ ] Porter `buildDensityColoredFeatures(segments, coverageGaps)` (web) : découpe chaque segment en **tronçons de 10 km**, associe chaque tronçon à un gap (epsilon `< 0.01 km`), défaut `'none'` (vert) si pas de gap. Renvoie un `FeatureCollection` de `LineString` avec `properties.severity` (`'critical'|'medium'|'none'`).
  - [ ] **Couleurs** (mirror, **ne pas redéfinir**) : `critical = #dc2626` (rouge), `medium = #d97706` (orange), `none = #16a34a` (vert) — utiliser les tokens densité (`density-low/medium/high` du design-tokens, ou les constantes web `DENSITY_COLORS`). Couleur appliquée via expression MapLibre `match`/`get` sur `severity` (ou inline par feature).
  - [ ] Réutiliser les waypoints + `cumulativeStartKm` de `AdventureMapResponse`.

- [ ] **T4 — `components/map/density-overlay.tsx`** (AC: 2, 3)
  - [ ] `ShapeSource` + `LineLayer` rendant le `FeatureCollection` colorisé **au-dessus** de la trace uniforme (ou en remplacement quand `densityColorEnabled`). Largeur ≥ trace pour bien couvrir.
  - [ ] Toggle `densityColorEnabled` (état route map) : ON → trace colorisée ; OFF → trace uniforme `#2D6A4A` (MOB-4.1). Ne rendre la colorisation que si `densityStatus==='success' && coverageGaps`.
  - [ ] Pas de stories (composant natif). [archi L1049]

- [ ] **T5 — Légende `components/map/density-legend.tsx`** (AC: 3)
  - [ ] 3 lignes : pastille couleur (**inline**) + **libellé texte explicite** :
    - vert : « Bonne disponibilité — 2+ hébergements / 10 km »
    - orange : « Disponibilité limitée — 1 hébergement / 10 km »
    - rouge : « Zone critique — aucun hébergement / 10 km »
  - [ ] **A11y daltonisme** : le sens passe par le **texte** (pas que la couleur). `accessibilityRole` adéquat, contraste light/dark. Légende repliable/accessible depuis la carte.

- [ ] **T6 — Déclenchement (sélection catégories) + intégration route map** (AC: 1, 2, 3, 4, 5)
  - [ ] Panneau/section densité : sélection des **catégories d'hébergement** (`DENSITY_ACCOMMODATION_CATEGORIES`, ≥ 1 requise) + bouton « Analyser la densité » (`Button loading` pendant trigger). Réutiliser un sélecteur multi (chips/toggles, cf. `layer-toggles` style).
  - [ ] Brancher `use-density` : progression (indicateur scopé), message 409, ErrorBanner (error), indicateur stale + relance.
  - [ ] Toggle « Trace colorisée » (densityColorEnabled) visible quand `success`.
  - [ ] **Offline (AC5)** : trigger désactivé `!isOnline` (message) ; dernière colorisation en cache reste affichée (le statut `['density', id]` est en query persist N1 si whitelisté — sinon, accepter que la colorisation se recharge en ligne).

- [ ] **T7 — i18n (FR + EN)** (AC: 1, 2, 3, 4, 5)
  - [ ] Bloc `density.*` (parité) :
    - `density.analyzeButton` / `density.analyzing` (« Analyse… {{progress}}% ») / `density.inProgress` (409)
    - `density.colorToggle` (« Trace colorisée »)
    - `density.legend.high` / `.medium` / `.low` (libellés ci-dessus)
    - `density.categoryLabel.*` (catégories hébergement)
    - `density.error` / `density.stale` (« Résultats périmés — relancer ») / `density.offline`
  - [ ] **Zéro chaîne en dur**.

- [ ] **T8 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4)
  - [ ] `use-density` : `refetchInterval` 3000 si `pending`/`processing`, `false` sinon ; 409 mappé en message (pas erreur fatale) ; query keys.
  - [ ] `density-layer` (pur) : `buildDensityColoredFeatures` — tronçons 10 km, severity correcte (0→critical, 1→medium, ≥2→none), epsilon matching, défaut none.
  - [ ] `density-legend` : 3 libellés texte présents (a11y), couleurs inline.
  - [ ] Déclenchement : sélection ≥1 catégorie requise ; bouton désactivé offline ; toggle colorisation ON/OFF.
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` OK.

- [ ] **T9 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5) — ⏳ build Dev Client
  - [ ] Sélectionner catégories + Analyser → progression, puis trace colorisée vert/orange/rouge cohérente. 2ᵉ déclenchement immédiat → message « déjà en cours ».
  - [ ] Toggle colorisation OFF → trace verte uniforme ; ON → colorisée. Légende lisible.
  - [ ] Forcer erreur / stale → ErrorBanner / indicateur relance. Offline → trigger désactivé, dernière colorisation visible.

## Dev Notes

### Backend densité — réutilisé tel quel (web `done`)

- **`POST /density/analyze`** (HTTP **202**) — body `{ adventureId: uuid, categories: string[] }` (≥1, chaque ∈ `DENSITY_ACCOMMODATION_CATEGORIES`). Réponse `{ data: { message } }` — **pas de job id**. Enqueue BullMQ `density-analysis`/`analyze-density`. Erreurs : 404, **409 (déjà pending/processing)**, 400 (aucun segment parsé). [Source: apps/api/src/density/density.controller.ts:15-24 ; dto/trigger-density.dto.ts:4-13]
- **`GET /density/:adventureId/status`** → `DensityStatusResponse` :
  ```ts
  { densityStatus: 'idle'|'pending'|'processing'|'success'|'error';
    densityProgress: number;          // 0-100
    coverageGaps: CoverageGapSummary[];
    densityCategories: string[];
    densityStale: boolean }
  ```
  [Source: apps/api/src/density/density.controller.ts:26-33 ; packages/shared/src/types/adventure.types.ts:8,58-71]
- **Buckets (source de vérité serveur, par tronçon 10 km)** : `count===0 → critical` (rouge), `count===1 → medium` (orange), `count>=2 → none` (vert). [Source: apps/api/src/density/jobs/density-analyze.processor.ts:85-90,127]
- **Polling web** : `useQuery(['density', adventureId])`, `refetchInterval = q => ['pending','processing'].includes(status) ? 3000 : false` ; trigger invalide `['density', id]` ; 409 → toast « Analyse déjà en cours ». [Source: apps/web/src/hooks/use-density.ts:15-23]

### Colorisation (référence web → MapLibre Native)

- `buildDensityColoredFeatures(segments, coverageGaps)` : tronçons 10 km, match gap par segment (epsilon `<0.01 km`), défaut `'none'`. [Source: apps/web/src/lib/density-layer.ts:17,27,39-44]
- **Couleurs** `DENSITY_COLORS = { critical:'#dc2626', medium:'#d97706', none:'#16a34a' }`. Mirror — ne pas redéfinir. Côté mobile, équivalents design-tokens : `density-low/medium/high` (palette.json). [Source: apps/web/src/lib/density-layer.ts:4-8 ; packages/design-tokens/src/palette.json]
- **Légende (libellés FR)** : « Bonne disponibilité — 2+ hébergements / 10 km », « Disponibilité limitée — 1 hébergement / 10 km », « Zone critique — Aucun hébergement / 10 km ». [Source: apps/web/.../density-legend.tsx:9-13 ; sidebar-density-section.tsx:137-139]

### Réutilisation du code mobile existant

- **MOB-4.1** : carte + trace + waypoints/`cumulativeStartKm` + caméra. La densité **remplace/superpose** la trace uniforme.
- `src/lib/api/api-client.ts` (`apiFetch`), `src/components/ui/{button,error-banner,skeleton,card}.tsx`, `src/lib/cn.ts`, `src/lib/i18n`.
- `src/hooks/use-network-status.ts` (offline AC5).
- Tokens densité **design-tokens** (`density-high/medium/low`) déjà disponibles (light+dark).
- Pattern polling : réutiliser la forme `refetchInterval` conditionnel des hooks existants (`use-segments`/`use-adventure-map`).

### Conventions

- Couleur de tronçon dynamique → **inline / expression MapLibre** (pas Tailwind JIT). [archi L632,#L770-773]
- Loading/erreurs : indicateur scopé + ErrorBanner, jamais `Alert.alert` ni blocage. Tests hors `src/app/`, `userEvent`, mocks sans JSX. i18n FR/EN parité.
- **Pas de cache fichier densité** (seuls gpx/pois/weather sont fichiers) — la densité passe par TanStack Query. [rapport archi §3]

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/lib/api/density.ts
apps/mobile/src/hooks/use-density.ts
apps/mobile/src/lib/map/density-layer.ts
apps/mobile/src/components/map/density-overlay.tsx
apps/mobile/src/components/map/density-legend.tsx
+ tests co-localisés (use-density, density-layer, density-legend, trigger)
```
**Modifs** :
```
apps/mobile/src/app/(app)/map/[id].tsx           (panneau densité + toggle colorisation + overlay/légende)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (bloc density.*)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : trigger densité (sélection catégories, 202, 409), polling status, colorisation trace par tronçon 10 km (vert/orange/rouge), toggle densityColorEnabled, légende textuelle accessible, états erreur/stale/offline, i18n, tests.
- **Exclu** : carte/trace de base (MOB-4.1) ; POI/pins/recherche (MOB-4.2/4.3) ; booking/accès/météo (MOB-4.5→4.8). Pas de cache fichier densité.

### References

- [Source: epics-mobile.md#Story MOB-4.4 (l.772-790)] — AC d'origine (FR-035, FR-022, FR-027)
- [Source: apps/api/src/density/density.controller.ts:15-33 ; dto/trigger-density.dto.ts:4-13] — `POST /density/analyze`, `GET /density/:id/status`
- [Source: apps/api/src/density/jobs/density-analyze.processor.ts:85-90,127] — buckets 0/1/≥2 par 10 km
- [Source: packages/shared/src/types/adventure.types.ts:8,58-71] — `DensityStatus`, `CoverageGapSummary`, `DensityStatusResponse`, `DENSITY_ACCOMMODATION_CATEGORIES`
- [Source: apps/web/src/hooks/use-density.ts:15-23] — polling + 409
- [Source: apps/web/src/lib/density-layer.ts:4-8,17,27,39-44] — couleurs + `buildDensityColoredFeatures`
- [Source: apps/web/.../density-legend.tsx:9-13] — libellés légende
- [Source: architecture-mobile.md#L824(density-overlay),#L388,#L1049,#L1065,#L326] — `density-overlay`, polling `density_status`, `use-density`, couleurs canon
- [Source: _bmad-output/implementation-artifacts/MOB-4-1-maplibre-native-trace-themes-attribution.md] — carte/trace (dépendance)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.4 (ready-for-dev) — trigger densité (`POST /density/analyze` 202 + sélection catégories + 409), polling `GET /density/:id/status` (3s), colorisation trace par tronçon 10 km (vert ≥2 / orange 1 / rouge 0) via `density-layer` (couleurs canon mirror), toggle densityColorEnabled, légende textuelle accessible daltonisme, états erreur/stale/offline. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
