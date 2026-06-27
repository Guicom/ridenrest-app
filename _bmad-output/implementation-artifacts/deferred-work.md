# Deferred Work

## Deferred from: code review of MOB-4-8-planning-weather-pace-adjusted (2026-06-27)

- **`cached` stale pendant la transition `adventureId`** — si le composant restait monté (non-applicable avec le routing expo-router actuel), les forecasts du précédent adventureId seraient utilisés avec les segments du nouveau adventureId le temps que `getCachedWeather` résolve. Non-triggerable en l'état ; à adresser si le routing change. [`apps/mobile/src/hooks/use-weather.ts`]
- **`setCachedWeather` sans try/catch** — une erreur disque (full, permissions) génère une promise rejection non rattrapée depuis le `void setCachedWeather(...)` du `useEffect`. Pré-existant dans le squelette weather-cache (MOB-3.5) ; à corriger en même temps que le durcissement général du cache. [`apps/mobile/src/lib/cache/weather-cache.ts`]
- **`weatherPoints` offset=0 pour `segmentId` inconnu** — si le serveur renvoie une prévision pour un segment absent de `segments` locaux, l'offset `offsetById.get(segmentId) ?? 0` positionne les points météo en km relatif au lieu de cumulé (mauvaise position sur la carte). Cas défensif : inconsistance backend. [`apps/mobile/src/hooks/use-weather.ts`]

## Deferred from: code review of MOB-4-5-booking-deeplinks-affiliate-tracking (2026-06-27, round 2)

- **Dropdown sans tap-outside-to-close** — appuyer dans la fiche mais hors de la dropdown (hors pin) ne la ferme pas ; `setOpen(false)` ne se déclenche qu'au re-press du CTA ou au tap d'une entrée. Acceptable MVP ; à confirmer lors de T7 (validation device). [`apps/mobile/src/components/shared/booking-links.tsx`]

## Deferred from: code review of MOB-4-5-booking-deeplinks-affiliate-tracking (2026-06-16)

- **`CloudRainIcon` câblé sur `Copy`** — `icon.tsx` exporte `CloudRainIcon = enableClassName(Copy)` au lieu de `CloudRain`. Toute icône météo affiche une icône presse-papiers. Bug pré-existant, non introduit par MOB-4.5. [`apps/mobile/src/components/ui/icon.tsx`]
- **Race double-pression sur lien booking** — `handlePress` sans garde in-flight ; deux taps rapides lancent deux `Linking.openURL` en parallèle (bénin iOS, deux onglets possibles Android). Defer MVP — ajouter un `pendingRef` si constaté en validation device T7. [`apps/mobile/src/components/shared/booking-links.tsx`]
- **`setOpenFailed` setState après démontage** — la closure `.then` garde une ref sur `setOpenFailed` ; si l'utilisateur ferme le popup pendant que `openURL` est en vol, la mise à jour d'état est appelée sur un composant démonté. No-op safe React 19 / RN 0.85. [`apps/mobile/src/components/shared/booking-links.tsx`]
- **`poi.lat/lng` NaN dans URL builders** — si un POI reçoit des coordonnées non finies, `buildAirbnbSearchUrl` produit `ne_lat=NaN`. Validé en amont par `isValidLngLat` (garde GeoJSON MOB-4.4) ; aucun POI corrompu ne devrait atteindre `BookingLinks`. [`apps/mobile/src/components/shared/booking-links.tsx`]
- **Dropdown `position:absolute` potentiellement clippée `overflow:hidden` iOS** — le menu de réservation est positionné `absolute` au-dessus du CTA ; si `PoiCard` ou `BlurView` a `overflow:hidden` (border-radius iOS), le menu sera clippé. Approche validée par Guillaume en revue v1.2 ; à confirmer en validation device T7. [`apps/mobile/src/components/shared/booking-links.tsx`]
- **Pas de test offline explicite pour AC5** — le comportement hors-ligne est couvert by design (`openURL` toujours tenté, tracking try/catch no-op), mais aucun test ne simule explicitement l'absence de réseau. [`apps/mobile/src/components/shared/booking-links.test.tsx`]
- **Double rendu `useProfile` pendant hydratation session** — entre la résolution de `session` (truthy) et le retour de `useProfile`, `userTier` vaut `'free'` par défaut. Analytics potentiellement incorrectes sur un tap très rapide post-login. Documenté spec T4, acceptable MVP. [`apps/mobile/src/components/map/poi-popup.tsx`]

## Deferred from: code review of MOB-4-4-density-analysis-colorized-trace (2026-06-16)

- **Divergences clés i18n spec vs impl** : `map.density.stale` → `staleHint`, `map.density.analyzeButton` → `calculate` dans les locales. Divergences pré-existantes du pivot MOB-4.3, non documentées dans T7.
- **Tests hook-level 409/error dans use-density.test.ts** : T8 exige des tests sur `use-density` pour les cas 409 et erreur non-fatale ; couverts en pratique au niveau composant (`sidebar-density-section.test.tsx`), mais pas directement sur le hook.
- **Epsilon-matching test manquant dans density-features** : `EPSILON_KM = 0.01` utilisé dans `buildDensityColoredFeatures` mais aucun test de frontière sub-epsilon. Pré-existant MOB-4.3.
- **Stale branch non testée dans sidebar-density-section** : `densityStatus === 'success'` + `densityStale: true` → hint stale + CTA Réessayer. Code présent, aucun test.
- **Offline cache read path non testé** : AC5 exige que la dernière colorisation reste affichable hors-ligne via TanStack Query persist. Non testable unitairement.
- **Edge case slider km si GPX commence par des points corrompus** : Si les N premiers waypoints sont invalides (filtrés), le premier waypoint valide peut avoir `distKm > 0` → corridor `[0, X km]` retourne vide. Dégradation gracieuse, cas hypothétique.

## Deferred from: code review of MOB-4-3-corridor-km-search (2026-06-16)

- **`RangeSlider` PanResponder recréé mid-drag via `useMemo`** : même bug que `Slider` v2.4 (fix documenté changelog) — `useMemo([low, high, …])` recrée le responder en cours de geste. Dormant : RangeSlider non utilisé en UX live (remplacé par Slider+stepper). À corriger avant toute réutilisation via `useState(() => PanResponder.create(…))` + latest-ref pattern. [apps/mobile/src/components/ui/slider.tsx]
- **Auto-zoom null no-op silencieux** : quand `computeCorridorBounds` ET `computeTraceBounds` retournent tous deux `null`, `fitToBounds(null)` est appelé sans feedback utilisateur. Cas extrême (trace vide ou segment 0 waypoints). [apps/mobile/src/app/(app)/map/[id].tsx:~215]
- **`PlanningSidebar` animation dégradée sur rotation** : `Animated.Value` initialisé avec la largeur du montage initial ; rotation en état fermé → position off-screen légèrement décalée. Cosmétique. [apps/mobile/src/components/map/planning-sidebar.tsx:~1960]
- **`useWeather` stale closure** : `readySegments[idx]` dans le callback `combine` peut référencer le mauvais segment pendant la transition segment pending→ready. Race fringe, impact 1-2 frames max. [apps/mobile/src/hooks/use-weather.ts:~5667]
- **`hasNearbyPoi` timezone SQL** : raw `sql` tag utilise `new Date()` (JS UTC) ; cohérent si colonne `timestamptz`, risque latent si `timestamp` sans TZ. [apps/api/src/pois/pois.repository.ts:~217]
- **`StageDialog` speed null quand égal au défaut** : si l'utilisateur saisit exactement `defaultSpeedKmh`, valeur envoyée comme `null`. Parité web intentionnelle, mais contre-intuitif. [apps/mobile/src/components/map/stage-dialog.tsx:~3729]
- **`Slider` latest ref useLayoutEffect** : `useEffect` sans dépendances pour la latest ref est asynchrone (après paint) → fenêtre théorique de stale ref. `useLayoutEffect` éliminerait ce risque. [apps/mobile/src/components/ui/slider.tsx:~5898]
- **Clés i18n `fromHandleA11y`/`toHandleA11y` mortes** : définies pour `RangeSlider` (non utilisé en UX), non consommées par `SearchRangeControl`. À supprimer ou réutiliser si `RangeSlider` revient. [fr.json, en.json]
- **Dédup multi-segments boundary POIs** : `dedupePois` via `poi.id ?? poi.externalId` — deux queries sur segments adjacents peuvent éjecter un POI de frontière avec le même `externalId`. Parité web, fréquence légèrement accrue avec `resolveSegmentRanges`. [apps/mobile/src/hooks/use-pois.ts:~112]
- **`computeCorridorBounds` segment dégénéré** : 1 seul waypoint dans la plage → `null`, fallback trace complète. Comportement acceptable, même classe que `computeTraceBounds` déjà différé en MOB-4.1. [apps/mobile/src/lib/map/maplibre-config.ts]

## Deferred from: code review of MOB-4-2 (2026-06-14)

- **`RECENTER_OFFSET_Y = 150` vs. spec web `offset: [0, 100]`** : valeur intentionnellement tunable pour la validation device (T10). Ajuster si la popin masque trop/pas assez le pin sur device réel. [`poi-popup.tsx:41`]
- **Granularité skeleton AC4** : un seul flag `enrichmentPending` combiné Google+ville au lieu d'un skeleton par slot. AC4 satisfait au niveau global (fiche jamais bloquée entière). Affiner si le test utilisateur montre un effet de clignotement indésirable.
- **`<Images>` style-load timing** : `<Images>` monté inconditionnellement dans `PoiLayer`, potentiellement avant que le style MapLibre soit chargé (switch de thème). MapLibre RN `<Images>` devrait gérer cela via son contexte interne — à confirmer en validation device ; si des pins invisibles apparaissent après changement de thème, ajouter un gate `styleLoaded`. [`poi-layer.tsx:181`]
- **`dedupePois` avec POIs sans `id`** : le dedup via `seen.has(undefined)` drop silencieusement des POIs si `id` et `externalId` sont tous deux absents. `Poi.id` est non-optionnel dans le type partagé → ne peut survenir qu'avec données serveur corrompues. Pré-existant. [`use-pois.ts:63-65`]

## Deferred from: code review of MOB-3-2 (2026-06-13)

- **route-id-not-hardened** — `apps/mobile/src/app/(app)/adventures/[id].tsx:35` : `id` lu via `useLocalSearchParams` n'est pas durci ; si le param manque, `useSegments(id)` reste idle (`enabled: Boolean(id)`) mais une query désactivée a `isPending: true` en TanStack v5 → skeleton segments infini, et `<GpxUploader adventureId={id} />` bâtirait un path `/adventures/undefined/segments` si pressé. Atténué : gardé par la branche parent (erreur/chargement de l'aventure) et la route garantit `id` en pratique. Follow-up = guard explicite sur `id` manquant. [Edge Case Hunter]
- **file-size-getter-throw** — `apps/mobile/src/components/adventure/gpx-uploader.tsx:325` : le fallback `new File(asset.uri).size` est dans le try global ; s'il lève (URI inaccessible / module natif capricieux), un fichier valide est rejeté en `uploadError` générique au lieu de poursuivre. N'arrive que si `asset.size` est absent (le picker le fournit le plus souvent). Follow-up = isoler le fallback taille dans son propre try et traiter l'échec comme « taille inconnue → laisser le serveur valider ». [Blind Hunter]
- **zero-byte-file-passes** — `apps/mobile/src/components/adventure/gpx-uploader.tsx:325-329` : un `.gpx` de 0 octet (ou taille négative malformée) passe la validation taille client (`size > MAX` faux) et part au serveur qui le rejette → carte `error`. Posture belt-and-suspenders acceptable. Follow-up optionnel = guard taille minimale / fichier vide côté client. [Edge Case Hunter]
- **server-error-code-mapping** — `apps/mobile/src/components/adventure/gpx-uploader.tsx:356-358` : toute `upload.isError` affiche le message générique `uploadError` (« vérifiez votre réseau »). Les `ApiError` 413 (taille) / 415 (format) sont donc trompeusement présentées comme une erreur réseau ; les libellés dédiés existent mais ne sont pas mappés sur les codes serveur. Marqué **optionnel MVP** par la story (T5). Follow-up = mapper `status`/`code` → libellés (`fileTooLarge`/`parseFailed`/`tooManyRequests`). [Edge Case Hunter]

## Deferred from: code review of MOB-2-5 (2026-06-12)

- **delete-securestore-purge-best-effort** — `apps/mobile/src/hooks/use-account.ts` (deleteAccount mutationFn) : sur le chemin de suppression, la purge du secure-store repose sur `await signOut().catch(() => {})`. Si ce `signOut` post-`deleteUser` échoue (drop réseau dans la fenêtre entre les deux appels), la session `@better-auth/expo` peut subsister dans le Keychain/Keystore — `invalidateAuthTokenCache()` (cache JWT mémoire) et `queryClient.clear()` (server-state) ne touchent PAS le secure-store. Atténué : le compte étant supprimé server-side, la session résiduelle est inerte (le serveur 401 au prochain boot) et une re-connexion sur le même appareil l'écrase ; tradeoff explicitement documenté dans les Completion Notes (l.147). Follow-up = exposer une purge secure-store dédiée indépendante du succès de `signOut`, pour ne pas faire reposer le purge sécurité-critique du chemin delete sur un appel `.catch(()=>{})`. [Edge Case Hunter + Acceptance Auditor]
- **delete-no-client-timeout** — `apps/mobile/src/hooks/use-account.ts` : `authClient.deleteUser()` n'a aucun timeout/abort côté client (le `fetch` better-auth n'en pose pas, `api-client.ts` non plus). Pendant `isDeleting`, le bouton Annuler est `disabled` et le backdrop/back-Android early-return (`if (isDeleting) return`) → si la requête se bloque (réseau lent / pas de réponse), l'utilisateur est piégé dans la modal avec un spinner et aucune sortie hors kill-app. Follow-up = ajouter un `AbortSignal.timeout` (cohérent avec le pattern serveur introduit en MOB-2.4) ou garder Annuler interactif pour annuler l'UI locale pendant que l'op serveur se résout. [Edge Case Hunter]
- **delete-nav-throw-misreported** — `apps/mobile/src/hooks/use-account.ts` (`finishSession`, appelée depuis `onSuccess`) : si `router.replace('/(auth)/login')` lève après un `deleteUser()` réussi (router pas prêt / race nav), le `mutateAsync` rejette → le `catch` du composant affiche `settings.deleteAccount.error` (« Votre compte est intact »), message **factuellement faux** car le compte est déjà supprimé et les caches déjà vidés. Faible probabilité (expo-router `replace` ne lève pas en pratique). Follow-up = exécuter cache-purge + navigation hors du chemin throwable de la mutation, pour qu'un échec de nav post-succès ne soit pas reclassé en échec de suppression. [Edge Case Hunter]

## Deferred from: code review of MOB-2-3 (2026-06-12)

- **oauth-callback-coldstart-cookie-race** — `apps/mobile/src/app/oauth-callback.tsx:27` : l'écran filet-de-sécurité lit `authClient.getCookie()` de façon synchrone au mount. Au **cold-start**, si l'effet s'exécute avant l'hydratation du miroir SecureStore du plugin `@better-auth/expo`, une session valide peut être renvoyée vers `/(auth)/login`. Mitigé : pire cas = rebond vers login (aucun état partiel, **AC3 respectée**) et le guard `(app)/_layout` ré-admet à la session suivante ; écran rarement monté en flow nominal (le retour est capté dans `openAuthSessionAsync`). Follow-up optionnel = durcir via polling court ou `useSession()`/listener de session avant de décider la route. [Blind Hunter + Edge Case Hunter]
- **oauth-failure-no-telemetry** — `apps/mobile/src/components/shared/google-sign-in-button.tsx:56` : `catch {}` nu — message utilisateur générique correct, mais aucun log/telemetry → débogage terrain des échecs OAuth réels impossible. Cohérent avec le reste du code auth (aucun logger établi dans le projet mobile à ce stade — même classe que le defer `fontError avalé` de MOB-1.3). Follow-up = câbler un `console.warn`/signal quand une stratégie d'observabilité mobile sera décidée. [Blind Hunter]
- **i18n-orContinueWith-namespace** — `apps/mobile/src/app/(auth)/signup.tsx` consomme `t('auth.login.orContinueWith')` : la clé séparateur vit sous le namespace `auth.login.*` mais est désormais réutilisée par l'écran signup (smell de nommage). Valeur rendue correctement dans `fr.json` ET `en.json`. Follow-up housekeeping = déplacer vers `auth.common.orContinueWith` (ou `auth.oauth.*`) et mettre à jour les deux call-sites. [Edge Case Hunter]

## Deferred from: code review of MOB-2-2 (2026-06-12)

- **reset-redirectto-localhost-fallback** — `reset-password.tsx` : `const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? process.env.EXPO_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3011'` puis `redirectTo: ${WEB_URL}/reset-password`. Si un build de prod ne reçoit aucune de ces deux vars `EXPO_PUBLIC_*` (inlinées au build), chaque email de reset pointe vers `http://localhost:3011/reset-password` (lien mort, non-TLS) → l'utilisateur ne peut jamais terminer le reset. Même classe que le defer **`better-auth-url-https-guard`** de MOB-2.1 (le client auth `client.ts` partage le même défaut localhost) → à traiter dans la même passe de durcissement config/ops (forcer/vérifier HTTPS + présence de la var pour la valeur de prod). [Blind Hunter #3 + Edge Case Hunter]
- **signup-name-derivation-sanitize** — `signup.tsx` : `const derivedName = values.email.split('@')[0] || values.email` envoie à `signUp.email({ name })` un `name` non borné/non assaini : `first.last@b.com` → `"first.last"`, `a+tag@b.com` → `"a+tag"`, unicode (`café`), local-part 64 car. → `name` 64 car. Pas de crash (Better Auth accepte la string ; le `||` couvre le local-part vide), mais qualité de donnée dégradée. Follow-up = capper la longueur / assainir, ou demander un vrai champ `name` si l'affichage du nom devient visible produit. [Blind Hunter #16 + Edge Case Hunter]

## Deferred from: code review of MOB-2-1 (2026-06-08)

- **oauth-deeplink-hardening** — `trustedOrigins: ['ridenrest://', 'ridenrest://*']` (`apps/web/src/lib/auth/auth.ts:27`) autorise tout host/path sous le scheme custom. Les schemes custom mobiles ne sont pas exclusifs (collision possible avec une app tierce) → risque d'interception du callback OAuth. Follow-up = durcir au moment où le flux OAuth est réellement implémenté (**MOB-2.3** Google / **MOB-2.4** Strava) : confirmer PKCE actif côté `@better-auth/expo`, restreindre à un path de callback précis, envisager App/Universal Links. Ici = uniquement le prérequis de redirection. [Blind Hunter #14]
- **better-auth-url-https-guard** — `apiFetch`/`fetchFreshToken` envoient le cookie de session Better Auth en header `Cookie` vers `EXPO_PUBLIC_BETTER_AUTH_URL` (`apps/mobile/src/lib/api/api-client.ts:58`). Aucune validation que l'URL est HTTPS. Défaut dev `http://localhost:3011`. Follow-up = garde-fou config/ops : forcer/vérifier HTTPS pour la valeur de prod (le cookie de session est plus sensible qu'un JWT 15 min). Hygiène d'environnement, pas un bug de code. [Blind Hunter #3]
- **online-state-seed** — `useAppStateRefetch` (`apps/mobile/src/lib/query/use-app-state-refetch.ts:31-38`) câble `onlineManager` sur NetInfo mais ne seed pas l'état initial (`NetInfo.fetch()`) et lit `isConnected` (vrai sur portail captif) au lieu d'`isInternetReachable`. Au boot hors-ligne, TanStack Query se croit en ligne → requêtes vouées à échouer consommant `retry: 2`. Follow-up = seed initial + `isInternetReachable`, à affiner avec le cache offline **MOB-3.5** (les points d'extension sont déjà posés). [Blind Hunter #10/#11 + Edge Case Hunter]

## Deferred from: code review of MOB-1-4 (2026-06-08)

- **oauth-callback-param-validation** — `apps/mobile/src/app/oauth-callback.tsx:22` rend brutalement `JSON.stringify(useLocalSearchParams())` sans aucune validation. Boundaries non gérées (volontairement, c'est un placeholder MOB-1.4) : params dupliqués `?code=a&code=b` → tableau, params absents → `{}`, valeurs encodées/malformées passent telles quelles, pas de gestion d'`error=access_denied`. Follow-up = le vrai flow OAuth (échange de code, session, parsing robuste de `code`/`error`/state) est à implémenter en **MOB-2.3** (Google) / **MOB-2.4** (Strava). Ici = uniquement la preuve de routage du scheme `ridenrest://`. [Edge Case Hunter]

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

## Deferred from: code review of live-profile-2 (2026-06-01)

- `searchZoneBottomPadding()` peut dépasser la hauteur de la carte sur petit viewport paysage — `top(60) + bottom(~356)` peut excéder un conteneur court, faisant ignorer/avertir `fitBounds` (MapLibre) → cercle de zone non recadré. Le padding bas est passé d'un 240 px fixe à une lecture live (~356 px panneau ouvert), donc ce changement accroît le risque, mais il reste marginal (mobile portrait & desktop OK). Un clamp robuste nécessite la hauteur réelle de la carte au call-site et un seuil de surface minimale (ambigu). `live-map-canvas.tsx:25`.
- Heuristique de timing du `fitBounds` — le debounce 220 ms approxime la fin de l'animation 200 ms de la section PROFIL (best-effort, sans `transitionend`/ResizeObserver) ; le 2ᵉ call-site mesure au montage alors que le panneau peut être replié. Transitoire visuel mineur ; un fix robuste (écoute de fin de transition) est hors périmètre. `live-map-canvas.tsx`.
- `distKm` non monotone / dupliqué en cas de chevauchement de segments → remplissage d'aire en zig-zag. Nouvellement exposé par le domaine X numérique explicite mais **pré-existant** dans `use-elevation-profile.ts` (non introduit par cette story ; à traiter à la source si rencontré).

## Deferred from: code review of MOB-1-1-init-apps-mobile-monorepo-integration (2026-06-07)

- Pas de `pnpm.overrides` verrouillant React à une version unique dans le monorepo — l'alignement web/mobile `react@19.2.3` est fragile sous `node-linker=hoisted` : toute divergence future de version React entre workspaces fera coexister deux copies hoistées et cassera React Native (erreurs de hooks). Durcissement préventif : ajouter `pnpm.overrides` (ou un check CI) quand le sujet se représentera. `package.json` racine.
- `expo-env.d.ts` est gitignored (`apps/mobile/.gitignore`) mais référencé dans `tsconfig.json#include` — sur un clone frais, `pnpm --filter @ridenrest/mobile typecheck` avant tout `expo start`/`expo export` s'exécute sans les types générés (typed routes absents) et peut différer du résultat local. Pattern Expo standard ; à régler dans MOB-1.4 (gate CI : générer les types avant typecheck). `apps/mobile/tsconfig.json:18`.

## Deferred from: code review of MOB-1-2-dev-accounts-eas-ota-pipeline (2026-06-07)

- `experiments.reactCompiler: true` sans `babel-plugin-react-compiler` déclaré dans `apps/mobile/package.json` — dépendance fantôme résolue par hoisting pnpm (copie issue de l'arbre Next.js web). Préexistant (MOB-1.1, baseline) ; les builds EAS cloud et `expo export` passent malgré tout. À régler en MOB-1.4 : déclarer explicitement la dep dans le workspace mobile ou désactiver l'experiment. `apps/mobile/app.json:46`.
- Squelette CI documenté (README mobile) : `eas build --no-wait` rend le job GitHub Actions vert quel que soit le résultat du build EAS cloud (aucune gate d'échec) ; `eas-cli` est devDep du workspace mobile (non hissée racine) — l'invocation CI doit passer par `pnpm --dir apps/mobile exec`. Doc-only ici ; à traiter lors de l'implémentation réelle du job en MOB-1.4. `apps/mobile/README.md` §CI/CD.

## Deferred from: code review of MOB-1-2b-dark-mode-web-charbon-backport (2026-06-07)

- Pastille « En cours… » blanc-sur-ambre (`--density-medium #d97706` ≈ 2.5:1) échoue WCAG AA en mode **light** — pré-existant, mais les spans concernés ont été touchés par cette story (ajout de la branche dark). À reprendre lors d'une passe contraste light. `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx`.
- Pas de fallback `@supports (background: color-mix(...))` pour les pastilles de statut en dark — sur navigateurs sans `color-mix()` (< 2023), le `background` est droppé → pastille sans chip mais texte densité encore lisible. Dégradation gracieuse, navigateurs cibles OK. `segment-card.tsx:336-352`.
- Wordmark Live : le wrapper applique `dark:bg-black/60` seul (pas de `bg-white/80` comme `map-canvas`) → en light, wordmark noir sur tuiles carte sans chip de contraste garanti. Incohérence mineure avec le pattern d'attribution planning. `apps/web/src/app/(app)/live/[id]/page.tsx:596`.
- `ThemeToggle` pré-mount : la garde `mounted` met `active=false` sur les 3 radios au 1er paint → radiogroup ARIA transitoirement sans option cochée (SSR / hydratation lente). Tradeoff anti-mismatch d'hydratation assumé ; envisager `aria-busy` ou un skeleton si l'a11y stricte le requiert. `theme-toggle.tsx:791`.
- Couverture de test `theme-toggle` : ni l'état pré-mount (`mounted=false`), ni l'actif « Système » résolu ne sont assertés → la garde d'hydratation passe « à vide » dans les tests. Ajouter un cas qui rend la frame pré-mount et un cas `theme==='system'`. `theme-toggle.test.tsx:870`.
- Pas de `@media print` pour le wordmark blanc : à l'impression d'une page en dark (fond forcé blanc par le navigateur), la variante blanche devient invisible. Cas limite. `powered-by-strava.tsx`.
- `globals-dark-tokens.test.ts` : (a) lit le handoff via un chemin relatif hors-arbre en dur (`../../../../docs/design/...`) → ENOENT si le doc bouge / absent du checkout CI ; (b) regex `extractBlock` s'arrête au 1er `\n}` → un `}` imbriqué futur dans `globals.css` tronquerait silencieusement le bloc et les assertions de parité passeraient sur un set partiel. Robustesse de test. `apps/web/src/app/globals-dark-tokens.test.ts:894,910`.

## Deferred from: code review of MOB-1.3 (2026-06-07)

- **FOUC d'hydratation du thème** : `useColorScheme().hydrated` est exposé mais aucun consommateur ne gate le rendu dessus. Au boot, si l'utilisateur a une préférence explicite (`light`/`dark`) différente du système, un flash de la palette système est possible avant la résolution AsyncStorage. À gater (`if (!hydrated) return <Splash/>`) quand une UI de thème consommera le hook (MOB-1.4+). `apps/mobile/src/hooks/use-color-scheme.ts`.
- **`font-sans` → Regular uniquement** : sur RN le poids est porté par le nom de famille (`Montserrat_700Bold`), pas par `font-weight`. `className="font-bold"` sur du texte `font-sans` ne produit donc PAS un Montserrat gras. Les primitifs utilisent `font-montserrat-bold` explicite (OK), mais c'est un piège DS à documenter pour les epics UI suivants. `packages/design-tokens/nativewind-preset.js:41`.
- **`fontError` avalé silencieusement** : en cas d'échec de chargement Montserrat, `_layout.tsx` poursuit le rendu avec la police système sans aucun log/telemetry → régression de design invisible. Ajouter un `console.warn`/signal. `apps/mobile/src/app/_layout.tsx`.

## Deferred from: code review of MOB-2-4-strava-oauth-deeplink (2026-06-12)

- Reset `profiles.stravaAthleteId` exécuté dans `account.delete.before` (pas `after`) : si la suppression de la ligne `account` échoue/rollback après le hook, le profil est vidé alors que la ligne `account` subsiste → état incohérent (`fetchStravaConnected` lirait « connecté » mais athleteId perdu). Le `before` reste nécessaire pour le deauthorize (accessToken requis avant suppression). Risque faible, T7-validé ; à reconsidérer si better-auth expose un `delete.after` portant l'accessToken. `apps/web/src/lib/auth/auth.ts:196`.
- Réponse du `POST /oauth/deauthorize` Strava jamais vérifiée (`fetch` ne rejette pas sur 401/403) : un token expiré donne une révocation silencieusement non effective alors que le commentaire annonce « token révoqué ». Best-effort par design ; ajouter un `res.ok` + log si on veut garantir l'invariant. `apps/web/src/lib/auth/auth.ts:186-190`.
- `authClient.unlinkAccount({ providerId:'strava' })` sans `accountId` + lecture d'état via `.some(providerId==='strava')` : collapse plusieurs lignes `strava` éventuelles ; en cas de doublon (anomalie data) une ligne pourrait subsister → « connecté » résiduel au refetch. `stravaAthleteId` unique rend le cas improbable. `apps/mobile/src/hooks/use-strava-connection.ts:58,141`.
- `WebBrowser.openAuthSessionAsync` : `result.type !== 'success'` regroupe `dismiss`, `cancel` ET `locked` (Android, session d'auth concurrente) dans `StravaLinkCancelledError` → bannière « annulé » potentiellement trompeuse selon le cas réel. UX mineure. `apps/mobile/src/hooks/use-strava-connection.ts:127`.
- Cookie `oauth_state` absent (getCookie vide / regex non matchée) → le proxy est ouvert sans `&oauthState=`, le callback échoue sur `state_mismatch`, et le flow le classe « annulé » au lieu de « échec ». Cookie posé juste avant par `oauth2.link` → rare ; envisager de remonter un message d'échec dédié si l'état est introuvable. `apps/mobile/src/hooks/use-strava-connection.ts:114-118`.
- Test positif `connect` : `listAccounts` mocké renvoie « connecté » sur tous les appels post-initiaux → le test passerait même si la re-lecture serveur post-link (`fetchStravaConnected`) était retirée (le refetch `onSuccess` flippe l'UI). La garde anti-état-partiel (AC3) n'est figée que par les cas négatifs. Ajouter une assertion sur l'appel de vérification post-link. `apps/mobile/src/components/shared/strava-connection-card.test.tsx`.

## Deferred from: code review of MOB-3-1-adventures-list-create-rename-delete (2026-06-13)

- **Skeleton infini sur le détail si `id` falsy** : `useAdventure(id)` pose `enabled: Boolean(id)` ; en TanStack Query v5 une query désactivée reste `status: 'pending'` → `isPending` true → l'écran détail rend le `<Skeleton>` indéfiniment, jamais la branche `isError`. Faible déclenchabilité (la route `[id]` garantit un segment non vide), mais un deep link malformé n'aurait aucune issue. Ajouter un fallback not-found. `apps/mobile/src/app/(app)/adventures/[id].tsx:29-31` / `apps/mobile/src/hooks/use-adventures.ts:37`.
- **Race rename + delete concurrents sur le snapshot `['adventures']` partagé** : les deux mutations `cancelQueries` puis snapshot la même clé dans `onMutate`, sans coordination. Si un rename est en vol (cache = nouveau nom, snapshot = ancien) et qu'un delete du même item est déclenché, des échecs entrelacés peuvent laisser la liste dans un état ne correspondant ni au serveur ni au pré-mutation, jusqu'au prochain refetch (`onSettled` invalide → se résorbe). Aucune garde UI n'empêche delete pendant rename pending. `apps/mobile/src/hooks/use-adventures.ts:66-115`.
- **Détail 404 affiche le copy pluriel `loadFailed`** : un `getAdventure(id)` qui 404 (supprimé / non-owner / lien partagé périmé) rend `t('adventures.errors.loadFailed')` (« Impossible de charger vos aventures » — pluriel), sans message not-found dédié. `apiFetch` ne distingue pas 404 / 5xx / NETWORK_ERROR. Ajouter une clé `notFound`. `apps/mobile/src/app/(app)/adventures/[id].tsx:80-81`.
- **Annuler une création en vol éjecte vers le détail** : « Annuler » appelle `router.back()` immédiatement mais la mutation `createAdventure` en vol n'est pas abortée ; à la résolution, `onSuccess` exécute `router.replace('/(app)/adventures/${created.id}')` et tire l'utilisateur vers un écran détail non demandé. Ajouter une garde monté/annulé (ou `AbortController`). `apps/mobile/src/app/(app)/adventures/new.tsx:54-55`.
- **Bannières d'erreur du détail jamais auto-réinitialisées** : `renameMutation.isError` / `deleteMutation.isError` restent vrais jusqu'au prochain `mutate` ; deux échecs de mutations distinctes peuvent empiler deux bannières persistantes. Appeler `reset()` à l'ouverture/fermeture du modal ou au changement d'écran. `apps/mobile/src/app/(app)/adventures/[id].tsx:120-125`.
- **Renommer avec un nom inchangé déclenche un PATCH inutile** : `handleSubmit` ne bloque que sur `error || !target` ; soumettre le nom courant inchangé émet un vrai `renameAdventure` PATCH + un optimistic write identique + cascade d'invalidation `onSettled`. Inoffensif pour la donnée, round-trip gâché. Ajouter une garde « pas de changement → close ». `apps/mobile/src/components/adventure/rename-adventure-modal.tsx:49-53`.

## Deferred from: code review of MOB-3-5-local-gpx-cache-offline (2026-06-13)

- **Purge auto GPX (N2) jamais effective** [`apps/mobile/src/lib/query/use-app-state-refetch.ts:45`] — `purgeStaleCache` appelle `runCachePurge(adventures)` sans `getSegmentIds` resolver → `runCachePurge` ne purge que pois/weather (N3, squelettes jamais alimentés) ; les fichiers `/cache/gpx/{segmentId}.gpx` (seul cache câblé en write-through) ne sont jamais purgés automatiquement (AC4). **Décision Guillaume (2026-06-13) : accepter + consigner.** Impact réel nul aujourd'hui (`loadSegmentGpx` dormant, aucun GPX écrit) ; le câblage du `SegmentIdsResolver` dans le listener arrivera avec l'epic loader-trace, en même temps que l'écriture GPX réelle (consommateur de `loadSegmentGpx`).
- **`hasCache` périmé si le cache est alimenté après le montage des Paramètres** [`apps/mobile/src/hooks/use-offline-cache.ts:23`] — `hasCache` est lu une seule fois via l'initialiseur `useState`, relu seulement après une purge manuelle. Si un write-through alimente le cache après le montage, la section « Cache hors ligne » reste masquée jusqu'au remontage de l'écran. SDK 56 n'expose pas de FS-watcher ; un re-check au focus d'écran (`useFocusEffect`) serait le correctif. UX mineure — l'écran Paramètres est normalement monté à froid.
- **Tempête de refetch sur réseau instable** [`apps/mobile/src/lib/query/use-app-state-refetch.ts:100-102`] — chaque transition offline→online invalide le préfixe `['adventures']` (liste + chaque détail + chaque segments), sans debounce/throttle. Sur une connexion qui clignote, chaque front montant déclenche une invalidation complète. TanStack Query déduplique les refetch en vol, donc impact borné — ajout d'un debounce = amélioration, pas correctif.

## Deferred from: code review of MOB-4-1 (2026-06-14)

- **AC5/AC2 sans test automatisé** : la trace offline-depuis-cache (AC5) et le swap de thème clair/sombre (AC2) ne sont vérifiés par aucun test ; couverts uniquement par la validation manuelle device T9 (Dev Client requis, MapLibre ne tourne pas en Expo Go). À confirmer lors de T9.
- **`computeTraceBounds` bbox dégénéré** : un segment à point unique (via `collectTraceWaypoints` qui n'applique pas le filtre `>=2`) ou une trace traversant l'antiméridien produit un bbox dégénéré/global → `fitBounds` à un zoom extrême. Comportement pré-existant de `@ridenrest/gpx` (`computeBoundingBox`, buffer ≥1 km atténue le cas point unique). Non causé par MOB-4.1 ; à traiter si un cas réel apparaît. [apps/mobile/src/lib/map/maplibre-config.ts:53]

## Deferred from: code review of MOB-4-6-poi-access-routing-sheet-profile (2026-06-27)

- **`useAccess` sans test unitaire co-localisé** : le hook n'a pas de `.test.ts` co-localisé. Comportement couvert indirectement par `access-metrics.test.tsx` (mock du hook). À compléter par `use-access.test.ts` (staleTime/gcTime/enabled gate/offline-paused). `apps/mobile/src/hooks/use-access.ts`.
- **`reprojectPopup` ref stable manquante** : `useCallback` avec dep `selectedPoi` crée une nouvelle référence à chaque changement de POI → `onRegionIsChanging` reçoit un handler différent à chaque render. Appliquer le pattern `onCloseRef` (ref mise à jour chaque render) pour une référence stable. `apps/mobile/src/app/(app)/map/[id].tsx`.
- **`formatAccessDistance`/`formatAccessElevation` sans garde NaN/Infinity** : contrairement à `formatAccessEta`, ces helpers ne filtrent pas les entrées invalides (NaN → "NaN m"). Zod reste la barrière principale ; ajouter des guards si d'autres appelants non-Zod sont introduits. `apps/mobile/src/components/poi-access/format.ts`.
- **`VariantSelector` utilise l'index tableau comme `key` React** : `key={i}` est fragile si l'ordre des variantes change entre refetch. En pratique stables par `(poiId, origin)`. Migrer vers clé déterministe (ex: `${v.distanceM}-${v.etaS}`) si stabilité non garantie. `apps/mobile/src/components/poi-access/variant-selector.tsx`.
- **Couleurs `ACCENT`/`WARN` hardcodées — dark mode** : `#e5e7eb` (bordure chip inactive) non surchargée en mode sombre. `#e6007e` suit le pattern web établi (poi-access-2-7). Migrer vers tokens dark-aware lors de la passe dark-mode mobile (MOB-6.x). `apps/mobile/src/components/poi-access/variant-selector.tsx`.
- **Triangle popup non inclus dans le BlurView** : triangle pointeur = `View` plat, non composited avec BlurView → couleur plate sur fonds complexes (satellite, clusters). Cosmétique. `apps/mobile/src/components/map/poi-popup.tsx`.

## Deferred from: code review of MOB-4-7-poi-access-polyline-autozoom-invalidation (2026-06-27)
- **`lastZoomedAccessRef` re-zoom sur background refetch** : après invalidation via useUploadSegment/useDeleteSegment/useReorderSegments, TanStack retourne un nouvel objet même si les données d'accès sont identiques → identité référentielle brisée → re-zoom non souhaité si l'utilisateur avait pané. Parité comportement web (même pattern `lastZoomedRef`), trade-off accepté. `apps/mobile/src/app/(app)/map/[id].tsx:323-335`.

## Deferred from: code review of MOB-5-1-live-activation-consent-permissions (2026-06-27)

- **RGPD Art. 7 — révocation du consentement** : une fois le consentement géolocalisation accordé (flag `ridenrest:geoloc-consent` en AsyncStorage), l'utilisateur n'a aucun moyen dans l'app de le retirer. Art. 7 RGPD exige le retrait à tout moment. À implémenter dans une story Settings (toggle dans les préférences → `setConsent(false)` + `deactivateLiveMode()`). `apps/mobile/src/lib/live/consent-storage.ts`
- **Pas de retry automatique après retour des Réglages** : si la permission foreground est refusée (panel `permissionDenied` affiché), que l'utilisateur ouvre les Réglages iOS/Android et l'active, l'écran Live ne relance pas automatiquement le GPS à son retour (pas d'`AppState` listener). L'utilisateur doit naviguer hors de l'écran et re-taper « Démarrer en Live ». Gestion AppState + `startWatching()` au foreground = MOB-5.2 (background GPS). `apps/mobile/src/hooks/use-live-mode.ts`, `apps/mobile/src/app/(app)/live/[id].tsx`

## Deferred from: code review of MOB-5-2-realtime-background-geolocation (2026-06-27)

- **`hasInitialZoomedRef` re-zoom après perte GPS + pan + recentrer** : après une perte de signal GPS quand le suivi est en pause (pan manuel), si le signal revient et l'utilisateur tape « Recentrer », le `flyTo zoom:14` se déclenche (re-zoom forcé) plutôt qu'un `easeTo` doux — car `hasInitialZoomedRef` est réinitialisé quand `currentPosition` passe à null. Comportement discutable mais acceptable après une perte de signal. `apps/mobile/src/components/map/map-canvas.tsx`
- **Position GPS froide (OS cold-start) en store sans session Live active** : quand l'OS relance l'app (cold-start) pour livrer des positions background (écran éteint, app précédemment tuée), `location-task.ts` écrit dans le store alors qu'aucun écran Live n'est monté et `deactivateLiveMode()` ne s'exécute jamais. Au prochain montage du `MapCanvas` Planning, `currentPosition` pourrait être non-null. Cas très rare en pratique ; `isLiveModeActive=false` limite l'impact direct. `apps/mobile/src/lib/live/location-task.ts`
