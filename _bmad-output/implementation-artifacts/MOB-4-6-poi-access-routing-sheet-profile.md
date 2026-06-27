---
baseline_commit: d6f610deee0e7ae3ecd305692e60ecc0b4a8f706
---

# Story MOB-4.6 : POI Access Routing — fiche d'accès & sélection de variante

Status: done

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

- [x] **T1 — Façade `lib/api/poi-access.ts` + parsing partagé** (AC: 1, 2, 3)
  - [x] `computeAccess(poiId, origin = { type: 'nearest-trace' }): Promise<AccessResponse>` → `apiFetch('/pois/${poiId}/access', { method: 'POST', body: { origin } })`. **Toujours `nearest-trace`** (ne jamais envoyer `stage`, ni `profileOverride`, ni GPS). `apiFetch` déballe `.data`. → `DEFAULT_ACCESS_ORIGIN` exportée + `body: JSON.stringify({ origin })` (apiFetch ne sérialise pas).
  - [x] **Réutiliser les schémas/types `@ridenrest/shared`** (import racine) : `AccessResponse`, `AccessRequest`, `AccessVariant`, `AccessOrigin`, `AccessResponseSchema`. Parser la réponse avec `AccessResponseSchema` (Zod) pour robustesse.
  - [x] Discriminer `status` : `ok` (distanceM/elevationGainM/elevationLossM/geometry/variants/source) | `fallback` (fallbackReason/fallbackDistanceM/source) | `error` (message — défensif, rarement émis).

- [x] **T2 — Hook `hooks/use-access.ts`** (AC: 1, 2)
  - [x] `useAccess(poiId, origin)` → `useQuery({ queryKey: ['poi-access', poiId, origin], queryFn, staleTime: 5*60_000, gcTime: 15*60_000, enabled: !!poiId })` (parité web). **Lazy** : ne fetch que quand la fiche est montée sur un hébergement.
  - [x] Exposer `data` (AccessResponse), `isLoading`, `isError`. Conserver les données valides en cache si un refetch d'arrière-plan échoue (parité web — le composant ne bascule sur l'erreur que faute de donnée exploitable).

- [x] **T3 — Label d'accès contextualisé `lib/poi-labels.ts`** (AC: 4)
  - [x] Porter `getAccessLabel(category)` (web `apps/web/src/lib/poi-labels.ts`, **non partagé → reproduire**), **via i18n** côté mobile → `getAccessLabelKey(category)` **pur** (renvoie la clé i18n, testable sans i18n) ; le composant fait `t(getAccessLabelKey(category))`.
    - hotel → « Itinéraire vers l'hôtel », hostel → « …vers l'auberge », camp_site → « …vers le camping », shelter → « …vers le refuge », guesthouse → « …vers la chambre d'hôte », fallback → « Itinéraire d'accès ».
  - [x] Clés i18n `pois.access.label.<category>` + `pois.access.label.fallback`.

- [x] **T4 — Composant `components/poi-access/access-metrics.tsx`** (AC: 1, 2, 3, 4, 5)
  - [x] États (parité web `AccessMetrics`, variante `full`) :
    - **loading** → `access-metrics-skeleton.tsx` **dédié** (formes label/distance/D+/D-), **pas** un `<ActivityIndicator>` générique (FR-PA-018).
    - **ok** → label contextualisé (T3) + **distance** (« X m » / « X,X km », virgule FR) + **D+** + **D-** (entiers « X m ») + `VariantSelector` (T5). Helpers portés (`format.ts` : `<1000 → "X m"`, sinon « X,X km » ; élévation entière ; arrondi sur `Math.round(distanceM)`).
    - **fallback** → `access-fallback.tsx` : `fallbackDistanceM` (vol d'oiseau) + **badge « ≈ approximatif »** + texte « BRouter indisponible — distance à vol d'oiseau » (style muted).
    - **error / pas de données utilisables** → texte muted « Itinéraire d'accès indisponible » (ou « …hors-ligne » si offline, AC6).
  - [x] Coords géométrie = GeoJSON `[lon, lat]` (utile MOB-4.7 ; ici les métriques suffisent).

- [x] **T5 — Sélecteur de variantes + avertissement route nationale `variant-selector.tsx`** (AC: 5)
  - [x] Chips (une par variante) : `distance` + `ETA` (`etaS` BRouter via `formatAccessEta`). Affiché **seulement** si `variants.length > 1 && onSelect`. `accessibilityRole="radiogroup"`/`"radio"`, label a11y par chip, accent variante sélectionnée (magenta `#e6007e` inline, cohérent avec la polyline MOB-4.7).
  - [x] **Avertissement route nationale** : si la variante **affichée** a `usesMainRoad`, montrer ⚠️ « Route nationale » (rouge) — **même avec une seule variante**. `TriangleAlert` ajouté à `icon.tsx` (`cssInterop`).
  - [x] `selectedVariantIndex` (défaut 0) + `onSelectVariant` **liftés à l'écran carte** (`map/[id].tsx`, MOB-4.7 a besoin du même index pour la polyline) — reset au changement de POI (pattern « ajuster l'état au rendu »).

- [x] **T6 — Intégration dans `poi-popup.tsx`** (AC: 1, 6) — _Doc Sync : la fiche mobile est `poi-popup.tsx` (popin « liquid glass » MOB-4.2), pas `poi-detail-sheet.tsx`. Le slot accès est le `children` de `PoiCard`._
  - [x] Monter `<AccessMetrics>` dans le **slot accès** (`children` de `PoiCard`), **uniquement** si `poi.category ∈ LAYER_CATEGORIES.accommodations`. Passer `origin={DEFAULT_ACCESS_ORIGIN}`, `category`, `selectedVariantIndex` + `onSelectVariant` (liftés à `map/[id].tsx`).
  - [x] **Offline (AC6)** : si `!isOnline` et pas de donnée exploitable, afficher « Itinéraire d'accès indisponible hors-ligne » (non bloquant). Le reste de la fiche (nom/type/distance/km + booking MOB-4.5) reste fonctionnel.

- [x] **T7 — i18n (FR + EN)** (AC: 2, 3, 4, 5, 6)
  - [x] Bloc `pois.access.*` (parité) :
    - `pois.access.label.<hotel|hostel|camp_site|shelter|guesthouse>` + `pois.access.label.fallback`
    - `pois.access.fallbackBadge` (« ≈ approximatif ») / `pois.access.fallbackHint` (« BRouter indisponible — distance à vol d'oiseau »)
    - `pois.access.unavailable` (« Itinéraire d'accès indisponible ») / `pois.access.offline`
    - `pois.access.mainRoadWarning` (« Route nationale ») / `pois.access.variants` / `pois.access.variantGroupA11y` / `pois.access.variantA11y`
    - _Note : `distance/gain/loss/eta` ne sont **pas** des clés i18n — formatage pur (`format.ts`) ; les suffixes « D+ »/« D- » sont inline._
  - [x] **Zéro chaîne en dur**.

- [x] **T8 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5, 6)
  - [x] `poi-access` façade/parse : envoie `nearest-trace`, jamais de profileOverride ; parse `ok`/`fallback`/`error` (Zod). 403/404/429 propagés sans crash.
  - [x] `getAccessLabelKey` (pur) : chaque catégorie → bonne clé i18n ; fallback.
  - [x] `format.ts` : distance `<1000 → "X m"`, sinon « X,X km » (virgule) ; élévation entière ; eta (`etaS`).
  - [x] `access-metrics` : skeleton dédié pendant loading (pas spinner générique) ; ok → label/distance/D+/D- ; fallback → badge approximatif ; error → muted ; offline → message dédié.
  - [x] `variant-selector` : chips si `variants>1` ; sélection change l'index (callback) ; avertissement route nationale si `usesMainRoad` (même 1 variante).
  - [x] Gate : `test` (421 verts) | `typecheck` (0) | `lint` (0) | `expo export` iOS OK.

- [ ] **T9 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5, 6) — ⏳ **build Dev Client requis (action Guillaume)** — non automatisable dans l'environnement agent
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
apps/mobile/src/components/map/poi-popup.tsx           (slot accès, accommodations only — la fiche est `poi-popup.tsx`, pas `poi-detail-sheet.tsx`)
apps/mobile/src/app/(app)/map/[id].tsx                 (lift selectedVariantIndex + reset au changement de POI ; passé à PoiPopup)
apps/mobile/src/components/ui/icon.tsx                 (TriangleAlert)
apps/mobile/src/lib/i18n/locales/fr.json + en.json     (bloc pois.access.*)
apps/mobile/src/components/map/poi-popup.test.tsx      (stub AccessMetrics — pas de QueryClientProvider dans ce test)
```
**Aucune** migration DB / modif serveur.

> **Doc Sync** : la story planifiait `poi-detail-sheet.tsx` (slot accès), mais la fiche détail
> mobile livrée en MOB-4.2 est `poi-popup.tsx` (popin « liquid glass », divergence validée
> par Guillaume le 2026-06-14). Le slot accès = le `children` de `PoiCard`. La sélection de
> variante est liftée à l'écran carte (`map/[id].tsx`) comme prévu par les Dev Notes — ce
> fichier s'ajoute donc aux Modifs (MOB-4.7 réutilisera le même `selectedVariantIndex`).

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

claude-opus-4-8 (1M context) — bmad-dev-story

### Debug Log References

- `npx jest` (apps/mobile) → **421 tests verts** (dont 34 nouveaux pour MOB-4.6 : façade, labels, format, access-metrics, variant-selector ; + poi-popup 15 verts après stub `AccessMetrics`).
- `npx tsc --noEmit` → **0 erreur**.
- `npx eslint` (fichiers touchés) → **0 issue**.
- `npx expo export --platform ios` → **OK** (bundle iOS produit, aucune régression `require.context`).

### Completion Notes List

- **Divergence epic confirmée (Open Question 1)** : aucun sélecteur de profil de routage. Livré le **sélecteur de variantes** (`variant-selector.tsx`) + avertissement ⚠️ « Route nationale » (`usesMainRoad`), conforme au backend actuel (profil `trekking` fixe). Aligné sur la recommandation de la story.
- **Fiche = `poi-popup.tsx`** (et non `poi-detail-sheet.tsx`) : la refonte « liquid glass » MOB-4.2 a remplacé le bottom-sheet. Le bloc accès est monté dans le `children` de `PoiCard`, **hébergements uniquement** (gate `LAYER_CATEGORIES.accommodations`). Doc Sync appliqué (Tasks T6 + Project Structure Notes).
- **Sélection de variante liftée à `map/[id].tsx`** (pattern « ajuster l'état au rendu », reset à 0 au changement de POI) — prête pour la polyline MOB-4.7 qui réutilisera le même `selectedVariantIndex`.
- **Offline (AC6)** géré dans `AccessMetrics` : hors-ligne sans donnée exploitable → message « Itinéraire d'accès indisponible hors-ligne » (non bloquant). Le reste de la fiche reste fonctionnel. Pas de skeleton infini : `useQuery` `paused` → `isLoading` false → branche message.
- **ETA des variantes** : affichée depuis `etaS` (BRouter, secondes) via `formatAccessEta` — pas de dérivation par vitesse (pas de `speedKmh` côté mobile, contrairement à la variante `stats` du web).
- **`format.ts`** porté du web (virgule FR, parité tests). `getAccessLabelKey` rendu **pur** (renvoie une clé i18n) pour testabilité.
- **T9 (validation manuelle Dev Client)** : **non automatisable** dans l'environnement agent (requiert un build Dev Client iOS + interactions). Reste à exécuter par Guillaume — checklist conservée non cochée.

### File List

**Ajouts** :
- `apps/mobile/src/lib/api/poi-access.ts`
- `apps/mobile/src/lib/api/poi-access.test.ts`
- `apps/mobile/src/hooks/use-access.ts`
- `apps/mobile/src/lib/poi-labels.ts`
- `apps/mobile/src/lib/poi-labels.test.ts`
- `apps/mobile/src/components/poi-access/format.ts`
- `apps/mobile/src/components/poi-access/format.test.ts`
- `apps/mobile/src/components/poi-access/access-metrics.tsx`
- `apps/mobile/src/components/poi-access/access-metrics.test.tsx`
- `apps/mobile/src/components/poi-access/access-metrics-skeleton.tsx`
- `apps/mobile/src/components/poi-access/access-fallback.tsx`
- `apps/mobile/src/components/poi-access/variant-selector.tsx`
- `apps/mobile/src/components/poi-access/variant-selector.test.tsx`

**Modifs** :
- `apps/mobile/src/components/map/poi-popup.tsx` (slot accès, props `selectedVariantIndex`/`onSelectVariant`)
- `apps/mobile/src/components/map/poi-popup.test.tsx` (stub `AccessMetrics`)
- `apps/mobile/src/app/(app)/map/[id].tsx` (lift `selectedVariantIndex` + reset au changement de POI)
- `apps/mobile/src/components/ui/icon.tsx` (`TriangleAlertIcon`)
- `apps/mobile/src/lib/i18n/locales/fr.json` (bloc `pois.access.*`)
- `apps/mobile/src/lib/i18n/locales/en.json` (bloc `pois.access.*`)
- `_bmad-output/implementation-artifacts/MOB-4-6-poi-access-routing-sheet-profile.md` (frontmatter, tasks, dev record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut → in-progress → review)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 1.0 | **dev-story MOB-4.6 — implémentation T1-T8.** Façade `poi-access.ts` (`nearest-trace` only, parse Zod), hook `use-access` (`['poi-access',poiId,origin]`), `AccessMetrics` (skeleton dédié / ok / fallback vol-d'oiseau / error / offline AC6), `variant-selector` (chips + ⚠️ route nationale même 1 variante, sélection liftée à `map/[id].tsx`), label contextualisé i18n (`getAccessLabelKey` pur), `format.ts` (virgule FR + eta `etaS`), `TriangleAlertIcon`, i18n FR/EN `pois.access.*`. **Doc Sync** : fiche = `poi-popup.tsx` (pas `poi-detail-sheet.tsx`), `map/[id].tsx` ajouté aux Modifs. Gate : 421 tests / tsc 0 / lint 0 / expo export iOS OK. T9 (Dev Client) en attente. Status → review. | bmad-dev-story (Amelia) |
| 2026-06-13 | 0.1 | Création story MOB-4.6 (ready-for-dev) — fiche d'accès POI : `POST /pois/:id/access` (`nearest-trace` only), `use-access` (`['poi-access',poiId,origin]`), `AccessMetrics` (skeleton **dédié**/ok/fallback vol-d'oiseau/error), **sélecteur de variantes** + avertissement ⚠️ route nationale (`usesMainRoad`), label contextualisé par catégorie (i18n), gate accommodations, offline. **DIVERGENCE documentée : profil de routage supprimé côté backend → pas de sélecteur de profil**, variantes à la place. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |

### Review Findings

**Code review — 2026-06-27 (claude-sonnet-4-6, 3 couches adversariales : Blind Hunter · Edge Case Hunter · Acceptance Auditor)**

- [x] [Review][Patch] **isLoading infini hors-ligne (paused non vérifié)** — `useAccess` renvoie `isLoading` brut sans vérifier `fetchStatus !== 'paused'`. Hors-ligne sans cache, `isLoading = true` indéfiniment → skeleton permanent (viole AC6 + règle AGENTS.md §Data mobile). Fix : exposer `fetchStatus` depuis `useAccess`, appliquer la garde `isLoading && fetchStatus !== 'paused'` dans `AccessMetrics`. [`use-access.ts:26-33` / `access-metrics.tsx:48`]
- [x] [Review][Patch] **Crash `variants` vide — `active` undefined** — Si `variants.length === 0`, `sel = Math.min(0, -1) = -1` → `variants[-1] = undefined` → `active.distanceM` lève une exception en runtime. Même si le schéma Zod devrait garantir `variants ≥ 1` pour `status: ok`, le guard défensif est absent. Fix : `if (!variants.length) return null` avant le calcul de `sel`. [`access-metrics.tsx:73-75`]
- [x] [Review][Patch] **`AccessMetrics` manque `key={poi.id}` dans `poi-popup.tsx`** — `<BookingLinks key={poi.id}>` (ligne 304) est correctement keyé ; `<AccessMetrics>` (lignes 297–303) ne l'est pas. Sans `key`, React réutilise l'instance et peut flasher l'état loading/error de l'ancien POI le temps que la nouvelle query démarre. Fix : ajouter `key={poi.id}` sur `<AccessMetrics>`. [`poi-popup.tsx:297-303`]
- [x] [Review][Patch] **Fixture test manque `usesMainRoad: true` dans `okResponse`** — `poi-access.test.ts` vérifie uniquement le défaut Zod (`usesMainRoad: false`). Le round-trip d'une réponse serveur portant `usesMainRoad: true` n'est pas testé. Ajouter un cas de test explicite avec ce champ à `true`. [`poi-access.test.ts:25-41`]
- [x] [Review][Defer] **`useAccess` sans test unitaire co-localisé** [`apps/mobile/src/hooks/use-access.ts`] — Le hook n'a pas de fichier `.test.ts` co-localisé. Comportement couvert indirectement par `access-metrics.test.tsx`. — deferred, couverture indirecte suffisante MVP
- [x] [Review][Defer] **`reprojectPopup` — ref stable manquante (`onCloseRef` pattern)** [`apps/mobile/src/app/(app)/map/[id].tsx`] — `useCallback` avec dep `selectedPoi` crée une nouvelle référence fonction à chaque changement de POI → `onRegionIsChanging` reçoit un handler différent à chaque render. Pattern connu (cf. `onCloseRef` dans `poi-popup.tsx`). — deferred, non bloquant MVP
- [x] [Review][Defer] **`formatAccessDistance/Elevation` sans garde NaN/Infinity** [`apps/mobile/src/components/poi-access/format.ts`] — Contrairement à `formatAccessEta`, ces helpers ne filtrent pas `NaN`/`Infinity` (→ "NaN m" visible en UI). Zod est la barrière à l'entrée. — deferred, Zod boundary suffisant
- [x] [Review][Defer] **`VariantSelector` utilise l'index tableau comme `key` React** [`apps/mobile/src/components/poi-access/variant-selector.tsx`] — `key={i}` est fragile si l'ordre des variantes change entre refetch. En pratique données stables par `(poiId, origin)`. — deferred, données stables par query
- [x] [Review][Defer] **Couleurs `ACCENT`/`WARN` hardcodées — dark mode concern** [`apps/mobile/src/components/poi-access/variant-selector.tsx`] — `#e5e7eb` (bordure chip inactive) non surchargée en dark. `#e6007e` suit le pattern web établi (poi-access-2-7). — deferred, passe dark-mode mobile future
- [x] [Review][Defer] **Triangle popup non inclus dans le BlurView** [`apps/mobile/src/components/map/poi-popup.tsx`] — Le triangle pointeur est un `View` plat (pas composited avec BlurView) → couleur plate sur fonds complexes. — deferred, cosmétique hors scope MOB-4.6
