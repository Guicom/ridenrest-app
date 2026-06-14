# Story MOB-4.6 : POI Access Routing — fiche d'accès & sélection de variante

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur planifiant**,
I want **voir l'itinéraire d'accès cyclable réel vers un hébergement et choisir parmi les variantes proposées**,
So that **j'évalue le coût additionnel (distance, D+/D-) pour rejoindre un POI**.

> **Dépend de MOB-4.2** (fiche détail POI `poi-detail-sheet.tsx` avec **slot accès** prévu). Cette story remplit ce slot : un hook `use-access`, un composant `AccessMetrics` RN (états skeleton/ok/fallback), un **sélecteur de variantes** (chips), un **avertissement « route nationale »**, et un **label d'accès contextualisé** par catégorie.
>
> ⚠️ **DIVERGENCE MAJEURE avec l'AC d'epic — le sélecteur de profil de routage N'EXISTE PLUS** :
> - L'epic dit « je choisis un **profil de routage (Route / Gravel / Bikepacking)** … persisté par aventure ». Le backend a **SUPPRIMÉ ce choix** (poi-access story 2.7, 2026-05-31) : l'accès utilise **toujours** un profil BRouter unique câblé (`trekking`). La colonne `adventures.routing_profile`, l'endpoint PATCH et le sélecteur web sont **du code mort en attente de suppression**.
> - À la place, le backend renvoie **plusieurs variantes** (`variants: AccessVariant[]`, triées meilleure-d'abord) ; l'utilisateur **choisit une variante**, et l'avertissement **« route nationale »** (`usesMainRoad`) remplace le choix de profil comme mécanisme « le cycliste arbitre le risque ».
> - → **NE PAS construire de sélecteur de profil.** Construire le **sélecteur de variantes** + l'avertissement route nationale. (Voir Open Questions.)
>
> **Backend `POST /pois/:id/access` livré** — **rien à recréer**. MOB-4.7 ajoutera la **polyline carte** + auto-zoom + invalidation (cette story reste **dans la fiche**).

## Acceptance Criteria

1. **Given** une fiche POI **hébergement** en mode Planning
   **When** je l'ouvre
   **Then** l'app appelle **`POST /pois/:id/access`** avec `{ origin: { type: 'nearest-trace' } }` et affiche l'itinéraire d'accès : **distance (m) + D+ + D-** (FR-PA-001)
   **And** l'origine est résolue **serveur** (`nearest-trace` = point le plus pertinent sur la trace fusionnée — le client n'envoie **jamais** de stage ni de GPS) (FR-PA-004, adapté : pas de GPS)

2. **Given** le calcul d'accès en cours
   **When** la fiche est affichée
   **Then** un **skeleton dédié** indique le statut (en cours / ok / fallback) — **jamais un spinner générique** (FR-PA-018)
   **And** la réponse expose `status` (`ok`/`fallback`/`error`) + `source` (`db-cache`/`computed-fresh`) ; un premier calcul `computed-fresh` peut être lent → le skeleton doit tenir (FR-PA-020)

3. **Given** BRouter indisponible ou en échec
   **When** la réponse revient
   **Then** le **fallback « distance à vol d'oiseau »** (`fallbackDistanceM`) est affiché avec un **badge « ≈ approximatif »** + explication (FR-PA-005)

4. **Given** une fiche POI selon sa catégorie
   **When** le label d'accès est affiché
   **Then** il est **contextualisé** (« Itinéraire vers l'hôtel / le camping / l'auberge / le refuge / la chambre d'hôte… ») avec **fallback « Itinéraire d'accès »** (FR-PA-019)

5. **Given** une réponse avec **plusieurs variantes** (`variants.length > 1`)
   **When** la fiche est affichée
   **Then** un **sélecteur de variantes** (chips : distance + ETA par variante) permet d'en choisir une ; la variante sélectionnée (`selectedVariantIndex`, **liftée à l'écran carte**) pilote les métriques affichées (et la polyline en MOB-4.7)
   **And** si la variante affichée **emprunte une route nationale** (`usesMainRoad`), un **avertissement** (⚠️ « Route nationale ») est montré — **même avec une seule variante** (FR-PA-006 réinterprété : arbitrage du risque via variantes, pas via profil)

6. **Given** la fiche ouverte hors-ligne **ou** un POI non-hébergement
   **When** elle s'affiche
   **Then** le bloc accès **n'est rendu que pour les hébergements** ; hors-ligne, si pas de cache, afficher un état « indisponible hors-ligne » non bloquant (le reste de la fiche fonctionne)

## Tasks / Subtasks

- [ ] **T1 — Façade `lib/api/poi-access.ts` + parsing partagé** (AC: 1, 2, 3)
  - [ ] `computeAccess(poiId, origin = { type: 'nearest-trace' }): Promise<AccessResponse>` → `apiFetch('/pois/${poiId}/access', { method: 'POST', body: { origin } })`. **Toujours `nearest-trace`** (ne jamais envoyer `stage`, ni `profileOverride`, ni GPS). `apiFetch` déballe `.data`.
  - [ ] **Réutiliser les schémas/types `@ridenrest/shared`** (import racine) : `AccessResponse`, `AccessRequest`, `AccessVariant`, `AccessOrigin`, `AccessResponseSchema`. Parser la réponse avec `AccessResponseSchema` (Zod) pour robustesse.
  - [ ] Discriminer `status` : `ok` (distanceM/elevationGainM/elevationLossM/geometry/variants/source) | `fallback` (fallbackReason/fallbackDistanceM/source) | `error` (message — défensif, rarement émis).

- [ ] **T2 — Hook `hooks/use-access.ts`** (AC: 1, 2)
  - [ ] `useAccess(poiId, origin)` → `useQuery({ queryKey: ['poi-access', poiId, origin], queryFn, staleTime: 5*60_000, gcTime: 15*60_000, enabled: !!poiId })` (parité web). **Lazy** : ne fetch que quand la fiche est montée sur un hébergement.
  - [ ] Exposer `data` (AccessResponse), `isLoading`, `isError`. Conserver les données valides en cache si un refetch d'arrière-plan échoue (parité web).

- [ ] **T3 — Label d'accès contextualisé `lib/poi-labels.ts`** (AC: 4)
  - [ ] Porter `getAccessLabel(category)` (web `apps/web/src/lib/poi-labels.ts`, **non partagé → reproduire**), mais **via i18n** côté mobile :
    - hotel → « Itinéraire vers l'hôtel », hostel → « …vers l'auberge », camp_site → « …vers le camping », shelter → « …vers le refuge », guesthouse → « …vers la chambre d'hôte », fallback → « Itinéraire d'accès ».
  - [ ] Clés i18n `pois.access.label.<category>` + `pois.access.label.fallback`.

- [ ] **T4 — Composant `components/poi-access/access-metrics.tsx`** (AC: 1, 2, 3, 4, 5)
  - [ ] États (parité web `AccessMetrics`) :
    - **loading** → `access-metrics-skeleton.tsx` **dédié** (formes distance/D+/D-), **pas** un `<ActivityIndicator>` générique (FR-PA-018).
    - **ok** → label contextualisé (T3) + **distance** (« X m » / « X,X km », virgule FR) + **D+** + **D-** (entiers « X m ») + `VariantSelector` (T5). Helpers de format à porter (`format.ts` web : `<1000 → "X m"`, sinon « X,X km » ; élévation entière ; arrondi sur `Math.round(distanceM)`).
    - **fallback** → `access-fallback.tsx` : `fallbackDistanceM` (vol d'oiseau) + **badge « ≈ approximatif »** + tooltip/texte « BRouter indisponible — distance à vol d'oiseau » (style muted).
    - **error / pas de données utilisables** → texte muted `text-destructive` « Itinéraire d'accès indisponible ».
  - [ ] Coords géométrie = GeoJSON `[lon, lat]` (utile MOB-4.7 ; ici les métriques suffisent).

- [ ] **T5 — Sélecteur de variantes + avertissement route nationale `variant-selector.tsx`** (AC: 5)
  - [ ] Chips (une par variante) : `distance compacte` + `ETA compacte` (`etaS` BRouter). Affiché **seulement** si `variants.length > 1 && onSelect`. `role="radiogroup"`, label a11y par chip, accent variante sélectionnée (magenta `#e6007e`, cohérent avec la polyline MOB-4.7).
  - [ ] **Avertissement route nationale** : si la variante **affichée** a `usesMainRoad`, montrer ⚠️ « Route nationale » (rouge) — **même avec une seule variante**. (Ajouter l'icône `TriangleAlert` à `icon.tsx` via `cssInterop`.)
  - [ ] `selectedVariantIndex` (défaut 0) + `onSelectVariant` **liftés à l'écran carte** (MOB-4.7 a besoin du même index pour la polyline) — reset au changement de POI. Pattern web « la page possède la sélection ».

- [ ] **T6 — Intégration dans `poi-detail-sheet.tsx`** (AC: 1, 6)
  - [ ] Monter `<AccessMetrics>` dans le **slot accès** (MOB-4.2), **uniquement** si `poi.category ∈ LAYER_CATEGORIES.accommodations`. Passer `origin={{ type: 'nearest-trace' }}`, `category`, `selectedVariantIndex` + `onSelectVariant` (liftés écran).
  - [ ] **Offline (AC6)** : si `!isOnline` et pas de cache `['poi-access', …]`, afficher « Itinéraire d'accès indisponible hors-ligne » (non bloquant). Le reste de la fiche (nom/type/distance/km + booking MOB-4.5) reste fonctionnel.

- [ ] **T7 — i18n (FR + EN)** (AC: 2, 3, 4, 5, 6)
  - [ ] Bloc `pois.access.*` (parité) :
    - `pois.access.label.<hotel|hostel|camp_site|shelter|guesthouse>` + `pois.access.label.fallback`
    - `pois.access.distance` / `pois.access.gain` / `pois.access.loss` (formats) / `pois.access.eta`
    - `pois.access.fallbackBadge` (« ≈ approximatif ») / `pois.access.fallbackHint` (« BRouter indisponible — distance à vol d'oiseau »)
    - `pois.access.unavailable` (« Itinéraire d'accès indisponible ») / `pois.access.offline`
    - `pois.access.mainRoadWarning` (« Route nationale ») / `pois.access.variantA11y`
  - [ ] **Zéro chaîne en dur**.

- [ ] **T8 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5, 6)
  - [ ] `poi-access` façade/parse : envoie `nearest-trace`, jamais de profileOverride ; parse `ok`/`fallback`/`error` (Zod). 403/404/429 gérés (mappés sans crash).
  - [ ] `getAccessLabel` (pur) : chaque catégorie → bonne clé i18n ; fallback.
  - [ ] `format.ts` : distance `<1000 → "X m"`, sinon « X,X km » (virgule) ; élévation entière.
  - [ ] `access-metrics` : skeleton dédié pendant loading (pas spinner générique) ; ok → distance/D+/D- ; fallback → badge approximatif ; error → muted. Rendu **accommodations only**.
  - [ ] `variant-selector` : chips si `variants>1` ; sélection change l'index (callback) ; avertissement route nationale si `usesMainRoad` (même 1 variante). (`userEvent`)
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` OK.

- [ ] **T9 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5, 6) — ⏳ build Dev Client
  - [ ] Fiche hôtel → calcul accès (skeleton dédié), puis distance + D+ + D-, label « Itinéraire vers l'hôtel ». Camping → « …vers le camping ».
  - [ ] BRouter KO (ou POI lointain) → fallback « ≈ approximatif » (vol d'oiseau).
  - [ ] Plusieurs variantes → chips, sélection change les métriques ; variante route nationale → ⚠️. Non-hébergement → pas de bloc accès. Offline sans cache → message indisponible.

## Dev Notes

### Backend `POST /pois/:id/access` — réutilisé tel quel (CONTRAT À JOUR)

- `:id` = `accommodations_cache.id`. `@HttpCode(200)`, `JwtAuthGuard + OwnerOnlyGuard`, throttle **60/min**. Body **Zod `AccessRequest`** : `{ origin: {type:'nearest-trace'} | {type:'stage', stageId}; profileOverride? }`. **Le client envoie TOUJOURS `{ origin: { type: 'nearest-trace' } }`** (jamais stage, jamais profileOverride, jamais GPS). Réponse **enveloppée `{ data: AccessResponse }`** → déballer `.data`. [Source: apps/api/src/pois/pois.controller.ts:55-71 ; packages/shared/src/schemas/poi-access.ts]
- **`AccessResponse`** (discriminé `status`) :
  ```ts
  // ok
  { status:'ok', distanceM, elevationGainM, elevationLossM, geometry,
    variants: AccessVariant[] /* ≥1, best-first */, engineVersion, computedAt,
    source: 'db-cache' | 'computed-fresh' }
  // fallback
  { status:'fallback', fallbackReason:'routing_failed'|'unreachable', fallbackDistanceM, source:'computed-fresh' }
  // error (défensif)
  { status:'error', message }
  ```
  `AccessVariant = { entryPoint:[lon,lat], distanceM, elevationGainM, elevationLossM, etaS, usesMainRoad?, mainRoadDistanceM?, geometry }`. `geometry` = GeoJSON `LineString|MultiLineString`, coords `[lon,lat]`. [Source: packages/shared/src/schemas/poi-access.ts:55-120 ; apps/api/.../access-result.types.ts:61-96]
- **`source: 'computed-fresh'`** = premier calcul (lent, croît avec la distance) ; ensuite `db-cache`. Le **precompute eager** (`<1500 m`) existe mais son émetteur d'event n'est pas branché → premier accès souvent `computed-fresh`. Skeleton doit tenir. [Source: rapport agent §8]
- **Origine** résolue serveur (candidats sur la trace fusionnée, classés par coût réel). Short-circuit si POI ~sur la trace. [Source: apps/api/.../resolve-origin.ts ; access-calculator.service.ts:143-169]

### DIVERGENCE — profil de routage supprimé (NE PAS construire de sélecteur)

- poi-access story 2.7 (PR#5, 2026-05-31) a **retiré** le choix de profil par aventure. `resolveProfile()` ignore `adventures.routing_profile` et renvoie `ACCESS_ROUTING_PROFILE` (`trekking`). La colonne + PATCH + `routing-profile-selector.tsx` web = **code mort à supprimer**. [Source: apps/api/.../access-calculator.service.ts:399-401 ; config/access.config.ts:22 ; rapport agent §2]
- Le **modèle réel** = **variantes multiples** + avertissement `usesMainRoad`. C'est le mécanisme « le cycliste arbitre le risque ». [Source: poi-access-2-7 ; rapport agent §6-7]

### UI accès (référence web → RN)

- `AccessMetrics.tsx` (états loading→`AccessMetricsSkeleton` / ok / fallback→`AccessFallback` / error muted) ; `VariantSelector` (chips, accent magenta `#e6007e`, ⚠️ route nationale même 1 variante, `role=radiogroup`) ; `format.ts` (distance/élévation/eta). [Source: apps/web/src/components/poi-access/AccessMetrics.tsx:52,63-65,160-251 ; format.ts]
- `useAccess(poiId, origin)` : `queryKey ['poi-access', poiId, origin]`, `staleTime 5min`, `gcTime 15min`, `enabled:!!poiId`, parse `AccessResponseSchema`. [Source: apps/web/src/components/poi-access/useAccess.ts]
- **Sélection liftée à la page** (web `map-view.tsx`) → reproduire : `selectedVariantIndex` au niveau écran carte, partagé fiche ↔ polyline (MOB-4.7).
- `getAccessLabel(category)` (subcategory→label, web-only) → reproduire **via i18n**. [Source: apps/web/src/lib/poi-labels.ts]

### Réutilisation du code mobile existant

- **MOB-4.2** : `poi-detail-sheet.tsx` (slot accès), type `Poi`, `LAYER_CATEGORIES.accommodations` (gate). **MOB-4.1** : carte (la géométrie servira MOB-4.7).
- `@ridenrest/shared` : `AccessResponse/Request/Variant/Origin` + `AccessResponseSchema` (Zod) — **réutiliser directement**.
- `src/lib/api/api-client.ts` (`apiFetch`), `src/components/ui/{skeleton,card,button,error-banner}.tsx`, `src/components/ui/icon.tsx` (ajouter `TriangleAlert`), `src/lib/cn.ts`, `src/lib/i18n`, `src/lib/format/distance`.
- `src/hooks/use-network-status.ts` (offline AC6).

### Conventions

- Couleurs (accent magenta, ⚠️ rouge) = inline. Skeleton **dédié** (jamais spinner générique, FR-PA-018). Erreurs inline, jamais `Alert.alert`. Tests hors `src/app/`, `userEvent`, mocks sans JSX. i18n FR/EN parité.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/lib/api/poi-access.ts
apps/mobile/src/hooks/use-access.ts
apps/mobile/src/lib/poi-labels.ts
apps/mobile/src/components/poi-access/access-metrics.tsx
apps/mobile/src/components/poi-access/access-metrics-skeleton.tsx
apps/mobile/src/components/poi-access/access-fallback.tsx
apps/mobile/src/components/poi-access/variant-selector.tsx
apps/mobile/src/components/poi-access/format.ts
+ tests co-localisés
```
**Modifs** :
```
apps/mobile/src/components/map/poi-detail-sheet.tsx   (slot accès, accommodations only ; lift selectedVariantIndex)
apps/mobile/src/components/ui/icon.tsx                 (TriangleAlert)
apps/mobile/src/lib/i18n/locales/fr.json + en.json     (bloc pois.access.*)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : `use-access`, `AccessMetrics` (skeleton dédié/ok/fallback/error), sélecteur de variantes + avertissement route nationale, label contextualisé, `nearest-trace` only, gate accommodations, offline, i18n, tests. Tout **dans la fiche**.
- **Exclu** : **polyline carte + auto-zoom + invalidation** → **MOB-4.7** ; **sélecteur de profil de routage** (obsolète, ne pas construire) ; precompute/invalidation backend (déjà côté serveur) ; fiche de base (MOB-4.2) ; booking (MOB-4.5).

### Open Questions (divergence epic)

1. **Profil de routage (AC epic « Route/Gravel/Bikepacking »)** : supprimé côté backend (accès = `trekking` fixe). → Confirmer qu'on **ne** construit **pas** de sélecteur de profil et qu'on livre à la place le **sélecteur de variantes** + ⚠️ route nationale. _(Recommandation : oui — aligné sur le backend actuel.)_

### References

- [Source: epics-mobile.md#Story MOB-4.6 (l.810-838)] — AC d'origine (FR-PA-001/004/005/006/018/019/020) — **profil de routage = divergence**
- [Source: apps/api/src/pois/pois.controller.ts:55-71] — `POST /pois/:id/access`
- [Source: packages/shared/src/schemas/poi-access.ts:26-120] — `AccessRequest/Response/Variant/Origin` + schémas Zod
- [Source: apps/api/.../access-calculator.service.ts:143-169,399-401 ; config/access.config.ts:22] — origine, profil fixe trekking
- [Source: apps/web/src/components/poi-access/AccessMetrics.tsx, useAccess.ts, format.ts] — UI/hook/format à porter
- [Source: apps/web/src/lib/poi-labels.ts] — `getAccessLabel` (→ i18n)
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md] — architecture (note : §profil partiellement obsolète)
- [Source: _bmad-output/implementation-artifacts/MOB-4-2-poi-layers-pins-clusters-detail-sheet.md] — fiche + slot accès (dépendance)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.6 (ready-for-dev) — fiche d'accès POI : `POST /pois/:id/access` (`nearest-trace` only), `use-access` (`['poi-access',poiId,origin]`), `AccessMetrics` (skeleton **dédié**/ok/fallback vol-d'oiseau/error), **sélecteur de variantes** + avertissement ⚠️ route nationale (`usesMainRoad`), label contextualisé par catégorie (i18n), gate accommodations, offline. **DIVERGENCE documentée : profil de routage supprimé côté backend → pas de sélecteur de profil**, variantes à la place. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
