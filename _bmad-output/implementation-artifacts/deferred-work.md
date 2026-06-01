# Deferred Work

## Deferred from: poi-access-4-3 re-cadrage observabilité (2026-05-31)

- **infra-install-sentry** — Sentry n'est installé nulle part dans le projet (api/web/root). La Story 4.3 a été re-cadrée (scope minimal, décision Guillaume) : le filtre `beforeSend` (AC3) est **documenté** dans `docs/ops/brouter-runbook.md` §(m) mais **non implémenté**. Follow-up : installer `@sentry/nestjs`, init dans `main.ts` (DSN env), câbler le `beforeSend` qui filtre toute `BrouterUnavailableException` (volume attendu : `timeout|network|http_error|parse_error|circuit_open`) et laisse remonter les erreurs DB/inattendues. Tags souhaités : `engine_version`, `profile`, `origin_type` (valeurs `stage`/`nearest-trace`), `traceId`, `service`. Note : `routing_failed` n'est PAS un `reason` d'exception (statut de fallback d'`AccessCalculatorService`) → ne pas filtrer dessus. Ajouter alors le smoke test E2E (mock Sentry SDK) prévu par AC7.
- **infra-prometheus-metrics** — Métriques applicatives Prometheus (AC8) différées : pas de Grafana/Prometheus déployé sur le VPS → endpoint `/metrics` sans consommateur. Follow-up si le volume le justifie : `prom-client` + endpoint `/metrics` protégé + `access_compute_total{status,source}` (counter), `access_compute_duration_seconds` (histogram), `access_brouter_failures_total{reason}` (counter). Documenté dans `docs/ops/brouter-runbook.md` §(m).
- **NOTE env** — `apps/api/.env.example` n'a pas pu être modifié (protection `.env*`). Guillaume doit y ajouter manuellement `HEALTH_ENDPOINT_TOKEN` (obligatoire, fail-closed), `BULL_BOARD_ENABLED` (défaut false), `BULL_BOARD_USER`, `BULL_BOARD_PASSWORD` — valeurs documentées dans le runbook §(m).

## Deferred from: code review of poi-access-4-2 (2026-05-31)

- **W1** — `findEagerPois` filtre sur `dist_from_trace_m < eagerThresholdM`, mais cette colonne (a) n'est **jamais recalculée** sur un changement de trace (calculée une seule fois à l'insertion du POI, `pois.repository.ts updatePoiDistances` avec garde `dist_from_trace_m = 0`, aucun appelant hors flux d'insert), et (b) est **segment-locale** (`ST_Distance(point, seg.geom)` du segment propre du POI), donc ne reflète pas la prémisse « trace fusionnée » sur laquelle repose toute la feature. Conséquence : après un add/remove/re-parse de segment, le **set candidat eager** est calculé sur des distances périmées → un POI passé sous le seuil n'est pas pré-calculé (reste NULL jusqu'à la lecture lazy), un POI sorti du seuil est recalculé inutilement. **Correctness utilisateur préservée** : le lazy `POST /pois/:id/access` recalcule l'origine sur la trace fusionnée courante. Gap = complétude/latence du pré-calcul eager, pas de la donnée servie. Cause-racine = maintenance de colonne héritée du flux d'insert POI (hors diff 4.2), exposée par le flux trace-updated. Fix = recalculer `dist_from_trace_m` (vs trace fusionnée) dans le chemin d'invalidation, ou exclure cette colonne de l'éligibilité eager. `access-worker.repository.ts` (findEagerPois) + `pois.repository.ts` (updatePoiDistances). [Convergence Blind Hunter #7 + Edge Case Hunter #1/#2]
- **W2** — `GpxParseProcessor` émet `adventure.trace-updated{changeType:'segment-added'}` à **chaque** exécution réussie de `process()`, y compris les **retries BullMQ** (attempts=3) et les re-parses d'un segment existant. Chaque émission déclenche un reset + re-enqueue **au scope aventure entière**. Idempotent côté handler (reset complet) donc **pas de bug de correctness**, mais : (a) tempête de recompute aventure-wide sur un retry transitoire de parse, (b) le label `'segment-added'` est factuellement faux sur un re-parse (le segment existait déjà). Fix = ne pas re-émettre si la géométrie n'a pas réellement changé, ou distinguer add/replace. `apps/api/src/segments/jobs/gpx-parse.processor.ts`. [Blind Hunter #3]
- **W3** — Le câblage event producteur→consommateur n'est prouvé par **aucun test d'intégration** : les tests producteurs (`segments.service.test.ts`, `gpx-parse.processor.test.ts`) mockent entièrement `EventEmitter2` (ils n'assertent qu'un nom de constante + une shape de payload) ; l'e2e (`access-worker.e2e-spec.ts`) câble `AccessWorkerService` dans son propre `EventEmitterModule.forRoot()` et **émet manuellement**, sans importer les vrais `SegmentsService`/`GpxParseProcessor`. Câblage **vérifié correct manuellement** (`EventEmitterModule.forRoot()` dans `app.module.ts:33`, `AccessWorkerModule` importé via `PoisModule`), donc risque réel faible — mais une régression de registration de module passerait tous les tests au vert tout en n'invalidant jamais en prod. Fix = un test d'intégration qui appelle un vrai producteur et vérifie que le consommateur reçoit l'event via le même emitter app-wide. `apps/api/test/access-worker.e2e-spec.ts`. [Blind Hunter #9]

## Deferred from: code review of poi-access-4-1 (2026-05-30)

- **W1** — Clé de cache d'accès omet le profil de routage. Le gate de cache-hit de `AccessCalculatorService.compute()` ne keye que sur `engineVersion` + `access_origin_stage_id` (pas de colonne profil dans `accommodations_cache`). Un appel lazy `POST /pois/:id/access` avec un `profileOverride` différent reçoit donc la géométrie pré-calculée eager (profil par défaut de l'aventure), l'override étant silencieusement ignoré sur un hit. Cause-racine = design cache Story 2.2, hors diff 4.1. Fix = ajouter le profil à la clé/colonne de cache. `apps/api/src/pois/access-calculator/access-calculator.service.ts`.
- **W2** — Collision sur la ligne de cache unique entre origines. `accommodations_cache` a un seul jeu de colonnes `access_*` par POI. Eager écrit `nearest-trace` (`access_origin_stage_id = null`) ; un appel lazy `origin: { type: 'stage' }` ne hit pas (stageId ≠ null), recalcule et ÉCRASE la géométrie eager → thrashing entre origines. Probablement sans objet post-pivot `nearest-trace`-only (l'UI ne requête que nearest-trace), mais le chemin `origin: stage` existe toujours dans le DTO/service. À clarifier/retirer si le mode stage est définitivement abandonné. `apps/api/src/pois/access-calculator/access-calculator.service.ts`.
- **W3** — POI sur la trace (`dist_from_trace_m ≈ 0`, ≤ `traceBufferM` ~10 m) éligible au pré-calcul (`< 1500`). `compute()` renvoie un résultat court-circuit ~0 m NON persisté → `access_computed_at` reste NULL → le POI est ré-sélectionné par `findEagerPois` et ré-enfilé à CHAQUE émission de `corridor-ready`. Gaspillage latent (la source d'event n'existe pas encore). Fix = persister le résultat ~0 m OU exclure ces POI du lookup. `apps/api/src/pois/access-worker/access-worker.repository.ts:439` + short-circuit calculator.
- **W4** — Le chemin de lecture lazy n'honore pas `access_failed`. `markAccessFailed` (ce worker) pose `access_failed=true` + `access_computed_at=NOW()` ; mais le gate de cache-hit de `compute()` ne vérifie que `access_computed_at` + métriques non-nulles (jamais `access_failed`). Comme les lignes en échec ont des métriques NULL, le hit échoue → recompute à CHAQUE requête lazy, annulant le bénéfice du flag côté lecture (le flag ne protège que le lookup eager). Fix = court-circuiter la lecture lazy sur `access_failed = true`. `apps/api/src/pois/access-calculator/access-calculator.service.ts`.

## Deferred from: code review of poi-access-3-3 (2026-05-30)

- **W1** — `fitToCorridorRange` spread d'un tableau de POI dans `Math.min(...lats)`/`Math.max(...lngs)` (`apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx:2740`). Pré-existant : le même pattern spread s'applique déjà aux waypoints de trace (potentiellement plus nombreux qu'une liste de POI). Le nombre de POI d'un corridor (≤ 30 km) reste très en deçà de la limite d'arguments du moteur JS → risque de `RangeError` négligeable. Durcissement (réduction via `reduce` au lieu de spread) optionnel, non causé par ce changement.

## Deferred from: code review of poi-access-2-5-access-map-layer.md (2026-05-29)

- **W1** — `POI_POINT_LAYER_IDS` (copie en dur des ids `use-poi-layers.ts`) → drift du `beforeId` z-order si un layer de pins est renommé/ajouté → ligne d'accès au sommet au lieu de sous les pins. Pas un bug runtime. Fix = constante partagée (touche `use-poi-layers.ts`, hors périmètre 2.5). `AccessMapLayer.tsx:34-39`.
- **W2** — Couverture AC#7 « ≥ 75% » + impact bundle (kB) non mesurés mécaniquement (`@vitest/coverage-v8` absent). Import maplibre type-only confirmé. Même classe d'outillage que le defer AC8 de la 2.4. `poi-access-2-5 / AC#7`.
- **W3** — `computeBounds`/`fitBounds` sans garde bbox dégénérée (point unique → zoom max) ni non-finie. Non atteignable (route origine→POI = ≥2 coords finies distinctes ; `z.number()` rejette `NaN`). Défense en profondeur optionnelle. `AccessMapLayer.tsx:57-73`.

## Deferred from: code review of poi-access-2-4-access-metrics-ui-planning.md (2026-05-29, passe 2)

- **W1** — Durcissement optionnel `AccessResponseSchema` : champs numériques (`distanceM`, `elevationGainM`, `elevationLossM`, `fallbackDistanceM`) en `z.number()` nu → acceptent `±Infinity` et négatifs. Non atteignable (backend renvoie du fini ≥ 0 ; D- en magnitude positive via `Math.abs`, `stages.service.ts:35`). `.finite().nonnegative()` = défense en profondeur. Hors périmètre 2.4 (fichier schéma 2.3). `packages/shared/src/schemas/poi-access.ts:73-84`.
- **W2** — Câblage polyline Story 2.5 dans `poi-popup.tsx` (`setVisibleAccessPoiId`) à reviewer en 2.5 : (a) deps de l'effet omettent `selectedStageId`/origin → polyline potentiellement périmée au changement d'étape popup ouvert ; (b) cleanup `setVisibleAccessPoiId(null)` sans garde d'ownership (pertinent si deux `PoiPopup` coexistent). Probablement mitigé par le re-fetch origin-aware de `map-view`. `poi-popup.tsx:124-128`.

## Deferred from: code review of poi-access-2-2-access-calculator-service.md (2026-05-29)

- **W1** — `Number(lat/lng)` sans garde finiteness (`access-calculator.service.ts:192-193`) — `lat`/`lng` sont `NOT NULL` dans le schéma DB ; corruption de données hors périmètre de ce service.
- **W2** — Deux requêtes DB sans transaction dans `computeDivergentSegment` (`compute-divergent-segment.ts:36,72`) — Documenté en Discovery #3 (concurrency MVP non-critique). Mitigation future : `SELECT FOR UPDATE` ou advisory lock.
- **W3** — Coordonnées GPS `NaN`/`Infinity` non validées dans `resolveOrigin` (`resolve-origin.ts:20`) — Validation des inputs à la frontière API (Story 2.3 / controller). Mauvaise couche pour valider.
- **W4** — Cast `as string` sur colonnes JOIN potentiellement nullables (`access-calculator.service.ts:200-202`) — `adventure_segments.adventure_id` et `adventures.routing_profile` sont `NOT NULL` dans le schéma ; cast safe.
- **W5** — `as unknown as RoutePointRow[]` désactive les checks de type (`compute-divergent-segment.ts:97`) — SQL contrôlé ; garde `typeof row.ele === 'number'` compense. Refactor opportuniste.

## Deferred from: code review of poi-access-2-1-routing-service-brouter-wrapper.md (2026-05-28)

- **D3** — `onSuccess()` remet à zéro toute la fenêtre d'échecs (`routing.service.ts` ~L131) — comportement `forgive-on-success` conservé intentionnellement. BRouter flapping rare ; alternance partielle préférable au mode dégradé forcé.
- **D2** — Half-open sans verrou de sonde unique (`routing.service.ts` ~L117) — Option 1 (sonde unique) pénaliserait les users concurrents à la recovery. Option 2 (actuel) est meilleure pour l'UX. BRouter est loopback → pas de risque de surcharge upstream.
- **R1** — `profile` non URL-encodé dans `buildUrl` (`routing.service.ts` ~L83) — union type `BrouterProfile` = valeurs URL-safe uniquement ; pas de risque d'injection en pratique
- **R2** — `brouterTimeoutMs` sans borne max dans le schéma Zod (`access.config.ts`) — concern config/ops, hors périmètre story
- **R3** — Coordonnées `NaN`/`Infinity` produiraient une URL invalide (`routing.service.ts` ~L80–84) — coordonnées toujours issues du GPS, pas d'input utilisateur

## Deferred from: code review of 17-1-versioning-app-release-notes-popup.md (2026-04-09)

- Règle webpack `CHANGELOG.md asset/source` non portée vers Turbopack — import cassé en mode dev Turbopack (`next.config.ts:12-18`)
- Labels français codés en dur dans les composants release notes — non actionnable sans i18n (`release-notes-dialog.tsx`, `about-section.tsx`)
- Comportement multi-onglets : `localStorage` mis à jour dans un onglet mais autre onglet garde `showReleaseNotes=true` — hors périmètre story (`use-release-notes.ts`)

## Deferred from: code review of story 16-31-booking-url-region-country-enrichment.md (2026-04-08)

- Champs `GooglePlaceDetails.adminArea`/`country` extraits côté API mais non utilisés pour l’URL Booking web : aligné avec le choix Geoapify pour des noms compatibles Booking ; réutilisation future possible.

## Deferred from: code review of story 16-24 (2026-04-06)

- First-render visual inconsistency: header shows raw `targetAheadKm` before `useEffect` clamp fires (pre-existing from story 16.20, `live-controls.tsx:58`)
- Negative `maxAheadKm` possible from `page.tsx` when GPS overshoots trace end — already guarded by `Math.max(SLIDER_STEP, ...)` but semantically misleading (pre-existing, `page.tsx:198`)
- One-frame window where store `targetAheadKm` exceeds `effectiveMax` after max shrinks — if search triggered during that frame, corridor extends past route end (pre-existing from story 16.20, `live-controls.tsx:44-48`)

## Deferred from: code review of story 16-25 (2026-04-06)

- `toBeDefined()` pattern on `getByText` results — should be `toBeInTheDocument()` for meaningful assertions. Pre-existing pattern across all test files, not specific to story 16.25.
- `defaultSpeedKmh` prop silently overwrites `speedKmh` in store on first drawer close without modification. `localSpeed` is initialized from `defaultSpeedKmh ?? speedKmh`, so closing the drawer writes the adventure default rather than the user's stored preference. Pre-existing from `handleApply`, extended to `handleClose` by story 16.25.

## Deferred from: code review of story 16-27 (2026-04-06)

- Bouton X (close) visuellement actif mais silencieusement ignoré pendant un upload en cours — pas de feedback visuel pour l'utilisateur. Amélioration UX à considérer : soit désactiver visuellement le X, soit afficher un tooltip/toast expliquant que l'upload est en cours.

## Deferred from: code review of story 16-29 (2026-04-06)

- Planning `map-canvas.tsx` duplique `addDensityLayer`/`removeDensityLayer`/`DENSITY_COLORS` localement (~85 lignes) au lieu d'utiliser `density-layer.ts` partagé — les deux copies vont diverger.
- `buildDensityColoredFeatures` : le dernier chunk d'un segment peut être skip si `tronconWaypoints.length < 2`, et le matching par epsilon (`< 0.01`) entre chunks client et gaps serveur est fragile.
- Logique dérivée (needsCalculation/isAnalyzing/isDone + useMutation pattern) dupliquée identiquement dans `SidebarDensitySection` et `LiveFiltersDrawer` — candidat pour extraction dans un hook partagé `useDensityTrigger`.

## Deferred from: code review of story 16-30 (2026-04-08)

- `shelter: ['lodging']` dans `GOOGLE_PLACE_TYPES` — entry morte, `mapGoogleTypesToCategory` ne retourne jamais `'shelter'`. Google Places n'a pas de type shelter — c'est OSM/Overpass only.
- 16 requêtes parallèles par recherche accommodations — risque QPS théorique. Prévu par la spec ($0 IDs Only tier), à monitorer si throttling observé.
- Test dedup mock seulement 2/16 fetches — les 14 autres reject silencieusement via `Promise.allSettled`. Coverage partielle mais fonctionnelle.
- `GOOGLE_PLACE_TYPES` et `mapGoogleTypesToCategory` — deux sources de vérité dupliquées pour le même mapping, risque de drift. Refacto candidat.
- `food` type dans `GOOGLE_PLACE_TYPES.restaurant` mais absent de `LAYER_GOOGLE_TYPES.restaurants` — places typées `food` jamais fetchées.
- `GOOGLE_PLACE_TYPES` exporté mais inutilisé en runtime — dead code à usage documentaire.

## Deferred from: code review of 17-4-elevation-loss-d-minus-everywhere (2026-04-09)

- W1 — Backfill `backfill-elevation-loss.service.ts` sans pagination : charge N segments en mémoire sans limite. Acceptable pour backfill one-shot ; à adresser si dataset devient très large.
- W2 — `totalElevationLossM` requis dans `AdventureMapResponse` mais optionnel dans `AdventureResponse` : asymétrie héritée du pattern `totalElevationGainM` existant. À uniformiser lors d'une refonte des types partagés.
- W3 — `use-elevation-profile.ts` : cas `deltaM = 0` avec `deltaEle ≠ 0` (waypoints superposés horizontalement) non géré. Pre-existing edge case présent aussi pour D+.

## Deferred from: code review of 17-6-live-filter-stage-badges.md (2026-04-09)

- Scroll redéclenché à chaque tick GPS si accordéon ouvert — `useEffect([stagesExpanded, currentKmOnRoute])` appelle `scrollIntoView` à chaque update GPS ; pattern hérité de la spec, peut être agaçant en navigation active (`live-filters-drawer.tsx`, `live-stages-section.tsx`).
- ETA NaN avec données corrompues — `etaFromCurrentMinutes` peut être NaN si `endKm < currentKmOnRoute` pour une étape non-passée ; `NaN != null` vrai en JS, `formatEta(NaN)` affiche `—` avec ligne ETA visible (`stage-card.tsx`).
- `currentKmOnRoute` hors plage sans clamp dans le store — ETA aberrante possible pour valeur négative ou > longueur trace. Pré-existant (`live.store.ts`).
- Boutons edit/delete sans `type="button"` dans `StageCard` — soumission form involontaire si rendu dans un `<form>`. Pré-existant (`stage-card.tsx`).
- `Switch` dans un `button` — accessibilité clavier/SR complexe, pattern hérité du design du drawer (`live-filters-drawer.tsx`).

## Deferred from: code review of 17-5-stage-cartouche-redesign-planning-live (2026-04-09)

- Boutons edit/delete dans `StageCard` visibles même sans callbacks `onEdit`/`onDelete` (actions sans effet) — pré-existant, design pattern du composant, non critique.
- Libellés `fr-FR` en dur dans `formatStageDeparture` et `formatEta` — incohérent si l'app devient multilingue, mais hors scope story 17.5.
- Badge météo sur cartouches étapes désactivé (D1) — décision produit : le layer météo carte est suffisant, pas de météo sur les cartouches.
- Badge météo absent en live mode (D3) — décision produit : voulu, le layer météo carte suffit en live.

## Deferred from: code review of 17-7-stage-per-stage-speed-pause-eta (2026-04-12)

- `recomputeAllEtasForAdventure` préserve les speedKmh per-stage sans documentation explicite dans le JSDoc — comportement intentionnel mais surprise pour un lecteur. Ajouter un commentaire de fonction expliquant le fallback par étape.
- Égalité flottante `speed !== defaultSpeedKmh` sans epsilon dans `handleNamingConfirm` — peut créer des overrides parasites selon arrondis JS/locale. Impact UX mineur, refactor UX séparé recommandé.

## Deferred from: code review of 17-9-booking-redirect-proxy-mobile-deep-link-fix (2026-04-15)

- ~~Rate limiting absent sur l'endpoint public `/api/go/booking`~~ — **RÉSOLU** : endpoint supprimé dans story 17.10 (module `go/` entièrement supprimé).

## Deferred from: code review of 17-10-booking-url-mobile-compat-city-coords (2026-04-15)

- `useReverseCity` hook retourne encore `postcode`, `state`, `country` depuis l'API Geoapify mais aucun consumer ne les utilise après suppression dans story 17.10. Dead data — nettoyage futur possible pour réduire le payload API/Redis.
- `extractCityFromOsmRawData` retourne un champ `postcode` jamais lu en production — dead field, nettoyage cosmétique.

## Deferred from: code review of poi-access-1-3-migrate-db-poi-access-schema.md (2026-05-27)

- `lineString` customType sans `fromDriver`/`toDriver` — retourne du WKB hex brut au lieu de GeoJSON. Pattern pré-existant, refactor opportun quand le routing service consommera les géométries. → Story 2.1+
- `access_computed_at` sans timezone (`timestamp` vs `timestamptz`) — convention projet actuelle, toutes les colonnes timestamp sans tz. À migrer globalement si besoin. → Refacto globale
- Précision `real` (float4) pour `access_distance_m` et colonnes d'élévation — ~7 chiffres significatifs, suffisant pour l'usage actuel. → Monitoring
- FK cross-aventure sans garde-fou — `access_origin_stage_id` peut pointer vers un stage d'une autre aventure. Validation applicative nécessaire dans le routing service. → Story 2.x
- `access_geometry` orpheline après suppression stage — données de route obsolètes quand `access_origin_stage_id` passe à NULL via `ON DELETE SET NULL`. Logique d'invalidation/recalcul à implémenter. → Story 2.x
- Race condition worker pending — deux workers concurrents peuvent claim les mêmes rows via l'index partiel `access_pending`. Pattern recommandé : `SELECT FOR UPDATE SKIP LOCKED`. → Story 2.x (routing worker)
- Changement `routing_profile` sur une adventure n'invalide pas les routes d'accès déjà calculées. Les `access_geometry` restent calculées avec l'ancien profil. → Story 2.x (routing service)

## Deferred from: code review of poi-access-1-4-audit-prereqs-and-resolve-gaps.md (2026-05-27)

- Ordering guards : ThrottlerGuard enregistré après JwtAuthGuard — requêtes non-auth consomment du CPU JWT avant d'être throttled. Inversion de l'ordre APP_GUARD recommandée (`app.module.ts:75-77`).
- Test manquant : `check()` qui throw une exception dans OwnerOnlyGuard — pas de try/catch, erreur DB = 500 non contrôlé (`owner-only.guard.test.ts`).
- ThrottlerGuard bypassable derrière reverse proxy — default tracker key sur IP. Derrière un LB/CDN, tous clients partagent une IP. Configurer `getTracker` custom pour la prod (`app.module.ts:30`).

## Deferred from: code review of poi-access-1-1-provision-brouter-docker-service.md (2026-05-27)

- Build reproducibility — tag Git `v1.7.9` mutable (force-push possible), pas de SHA commit pinné ni Dockerfile local. Mitigation : `image: brouter:1.7.9` empêche les rebuilds accidentels. → Story 1.5
- Healthcheck rapporte `healthy` malgré routing non-fonctionnel (pas de segments /segments4). Le check valide uniquement la réponse HTTP, pas le routing réel. → Story 1.2
- deploy.sh ne gère pas `docker compose build/up brouter` — changements Docker non auto-déployés. → Story 1.5
- Healthcheck bash `/dev/tcp` dépend de bash dans l'image `openjdk:17.0.1-jdk-slim` (Debian). Si upstream passe à Alpine/distroless, le healthcheck casse silencieusement. → Monitoring
- Flags JVM `-Xmn8M` et `-DuseRFCMimeType=false` omis dans le `command` override vs `server.sh` original. Impact potentiel sur Content-Type réponses. → Story 2.1
- `start_period: 5m` potentiellement insuffisant pour cold start avec chargement segments (NFR-PA-014 : jusqu'à 15 min). → Story 1.2

## Deferred from: code review of poi-access-2-3-endpoint-post-pois-access-planning (2026-05-29)

- Le test d'intégration `pois.controller.access.spec.ts` ne reconstitue pas l'enregistrement `APP_GUARD` global du `JwtAuthGuard` (contourné via override + mock `jose` pour cause d'ESM/ts-jest). Conséquence : l'ordre des guards tel qu'il tourne en prod (JwtAuthGuard puis ThrottlerGuard, déclarés en `APP_GUARD` dans `app.module.ts`) n'est pas exercé — une régression de type « 429 renvoyé avant 401 » ne serait pas détectée par ce test. Tradeoff documenté (Doc Sync #4). → revoir si une stratégie E2E DB-backed est mise en place (CI avec Postgres/Redis).

## Deferred from: code review of poi-access-2-4-access-metrics-ui-planning (2026-05-29)

- Seuil de couverture AC8 « ≥ 80% » non mesuré mécaniquement — `@vitest/coverage-v8` n'est pas installé (l'ajouter = nouvelle dépendance, HALT volontairement non déclenché). Couverture évaluée manuellement à ~100% sur le dossier `poi-access/` (Completion Notes). → Installer l'outillage de couverture comme décision outillage séparée si un seuil mesuré devient requis en CI.

## Deferred from: code review of poi-access-2-6-routing-profile-selector-ui (2026-05-29)

- `updateRoutingProfile` (repo) filtre par `id` seul (pas `userId`) et renvoie `row as Adventure` sans null-check — pattern partagé par toutes les méthodes `updateX` du repo `adventures`. IDOR latent mais inatteignable car `updateAdventure` appelle `verifyOwnership` en amont (`adventures.service.ts:62`). → durcissement repo global (ajouter scope `userId` aux méthodes de mutation) si une refonte sécurité du repo est entreprise.
- PATCH multi-champs non-atomique — `name/startDate/endDate/avgSpeedKmh/routingProfile` sont des UPDATE séparés sans transaction dans `updateAdventure` (`adventures.service.ts:65-92`). Un échec sur un champ laisse une mise à jour partielle ; l'event `adventure.profile-changed` ne serait pas émis. Le client n'envoie qu'un seul champ par appel aujourd'hui. → envelopper `updateAdventure` dans une transaction Drizzle si le PATCH multi-champs devient un cas d'usage réel.

## Deferred from: code review of poi-access-3-1 (2026-05-29)

- Compteur de throttle partagé Planning(60)/Live(120) sur la même clé route+tracker — trafic mixte gps/stage accumule sur un seul bucket → throttling précoce du trafic légitime ; limites non indépendantes (bornées <120). [common/guards/access-throttler.guard.ts] — tradeoff option B documenté et accepté.
- Consent gate non appliqué pour une origine `live` non-gps (garde imbriquée dans `if origin.type==='gps'`) — non atteignable aujourd'hui (couplage mode⇔origin uniquement dans le controller). [access-calculator.service.ts computeLive] — ajouter une assertion si un futur appelant introduit une origine live non-gps.

## Deferred from: code review of poi-access-3-2 (2026-05-29)

- Read-modify-write non transactionnel dans `MeService.updateSettings` — la lecture de `previous` et l'`UPDATE` sont deux round-trips séparés sans transaction/lock. Deux `PATCH {liveAccessConsent:false}` concurrents lisent tous deux `previous=true` → event `profile.live-consent-revoked` émis deux fois (consumer Story 4.2 = purge Redis idempotente best-effort, donc bénin) ; un `PATCH {true}` qui s'intercale peut faire diverger l'état DB de l'event émis. [apps/api/src/me/me.service.ts:48-55] — durcissement transactionnel transverse (même nature que le point différé de 3.1) ; à traiter si une passe de hardening transactionnel Drizzle est entreprise.
- `ValidationPipe` global sans `forbidNonWhitelisted` — les clés inconnues d'un body PATCH sont silencieusement strippées (`{ liveAccessConsent: true, foo: "x" }` → 200) plutôt que rejetées en 400. Config globale pré-existante non introduite par cette story. [apps/api/src/main.ts:20] — à décider comme durcissement de contrat API global (impacte tous les endpoints).

## Deferred from: code review of live-profile-1 (2026-06-01)

- Double affichage du profil d'élévation sur desktop — le bloc bas `hidden lg:block ... h-[180px]` (`ElevationProfile`) de `page.tsx:519-534` subsiste et, combiné à la nouvelle section « PROFIL » du panneau (visible mobile ET desktop, `live-controls.tsx:96-101`), affiche le profil à deux endroits sur desktop lorsque la section est ouverte. Documenté comme report explicite en Story 2 dans les Completion Notes de la story ; confirmé conforme par l'Acceptance Auditor. À réconcilier en Story 2 (contenu interactif du profil).
- `ElevationStrip` monté en permanence même quand la section est repliée — le conteneur repliable utilise `overflow-hidden h-0` mais `{profileContent}` reste monté (`page.tsx:435-444`), donc `ElevationStrip` exécute son rendu/ses effects même à `h-0`. Perf mineure vs l'ancien montage conditionnel. Optimisation hors périmètre Story 1 (à revoir si le contenu du profil devient coûteux en Story 2).
