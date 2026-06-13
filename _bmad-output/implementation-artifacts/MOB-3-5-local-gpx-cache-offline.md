---
baseline_commit: 4dee3b163c1b51a6b675238cb8a9072e045bf861
---

# Story 3.5 : Cache GPX local pour consultation offline

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cycliste en zone sans réseau**,
I want **consulter la trace et les derniers POIs de mes aventures actives hors ligne**,
So that **l'app reste utile en autonomie, loin de toute couverture cellulaire**.

> **Story d'infrastructure cache + offline UX** de l'Epic MOB-3. Elle pose la couche cache fichiers (`expo-file-system`) aux chemins canoniques de l'archi (N2 GPX, N3 POIs/météo en **squelette**), branche la **persistance TanStack Query** (liste aventures N1, offline natif), introduit le hook `useNetworkStatus` + le `<StatusBanner>` global « Mode hors ligne », et **enrichit le listener `AppState`/NetInfo centralisé déjà posé** (MOB-2.1) avec : seed de l'état online au boot, refetch des queries critiques au retour réseau, et déclenchement de la purge cache. **Aucune modification backend** (la logique de purge se base uniquement sur `startDate`/`endDate` existants).
>
> **Dépend de** : **MOB-2.1** (`QueryProvider`, `useAppStateRefetch`, `apiFetch`, bridge `onlineManager`/NetInfo — points d'extension posés, purge **explicitement déférée ici**) ; **MOB-3.1** (liste/détail aventures, query keys `['adventures']`/`['adventures', id]`) ; **MOB-3.2** (trace GPX chargée, segments). **Câble réellement** : trace GPX (N2) + liste aventures (N1). Les caches **POI (N3)** et **météo (N3)** sont **posés en squelette** (API stable, fichiers créés, non alimentés) et remplis aux epics suivants (POIs → MOB-4, météo → MOB-5/6).

## Acceptance Criteria

1. **Given** une aventure ouverte **avec** réseau
   **When** la trace GPX et les POIs sont chargés depuis l'API
   **Then** ils sont mis en cache localement via `expo-file-system` aux chemins canoniques (`/cache/gpx/{segmentId}.gpx`, `/cache/pois/{adventureId}.json`) (FR-MOB-OFFLINE / **NFR-MOB-REL-01**)
   **And** la liste des aventures (N1) est persistée via TanStack Query (`persistQueryClient` + async-storage) pour un listing offline natif

2. **Given** l'app **hors ligne**
   **When** j'ouvre une aventure **précédemment chargée** (cache présent)
   **Then** la trace et les **derniers** POIs cachés sont consultables **en lecture seule**
   **And** les actions nécessitant le réseau (upload GPX, renommer, supprimer, import, recherche POI live) sont **désactivées** avec un message explicite
   **And** un `<StatusBanner message="Mode hors ligne">` global est affiché (déclenché par `useNetworkStatus`)

3. **Given** l'app hors ligne **puis reconnectée**
   **When** le réseau revient (`AppState` → `active` **et/ou** NetInfo `isConnected`)
   **Then** les données se rafraîchissent normalement (invalidation/refetch des queries critiques) **sans perte de contexte** (l'écran courant est préservé, pas de re-navigation)
   **And** le `<StatusBanner>` disparaît

4. **Given** une aventure dont l'`endDate` est dépassée de **> 10 jours** (ou `startDate` > 20 j sans `endDate`)
   **When** l'app passe au premier-plan (`AppState` → `active`)
   **Then** les fichiers cache de cette aventure sont **purgés automatiquement** selon `shouldPurgeAdventure`
   **And** un bouton manuel « Vider le cache de cette aventure » reste disponible dans les settings (fallback, notamment pour les aventures sans `startDate`/`endDate`)

## Tasks / Subtasks

- [x] **T1 — Dépendances cache & persistance** (AC: 1, 2, 3)
  - [x] `expo-file-system@56.0.7` **déjà présent** (ajouté MOB-3.2, déjà lié natif → pas de réinstall, cf. État réel)
  - [x] `pnpm --filter @ridenrest/mobile add @tanstack/react-query-persist-client @tanstack/query-async-storage-persister` (JS pur, pas de prebuild) — installés
  - [x] Vérifié **présents** (non réinstallés) : `@react-native-community/netinfo@12.0.1`, `@react-native-async-storage/async-storage@2.2.0`, `@tanstack/react-query@^5.90.21`
  - [x] `app.config.ts` : plugin `expo-file-system` **NON requis** — le config-plugin n'ajoute que des permissions Android external-storage + Info.plist document-sharing, inutiles pour un cache interne `Paths.cache`. Autolinking suffit. app.config.ts laissé inchangé.

- [x] **T2 — `lib/cache/cache-manager.ts` (orchestrateur + purge)** (AC: 1, 4)
  - [x] Constantes chemins : `CACHE_ROOT` = `Paths.cache.uri`, sous-dossiers `GPX_DIR`/`POIS_DIR`/`WEATHER_DIR`. Helper `ensureDir(path)` idempotent (`Directory.create({ intermediates: true })` si `!exists`)
  - [x] **Recopie fidèle** `shouldPurgeAdventure(adventure, now?)` (endDate>10j → true ; sinon startDate>20j → true ; sinon false) — camelCase ISO ; `now` injectable (tests déterministes)
  - [x] `purgeAdventureCache(adventureId, segmentIds[])` : supprime gpx de tous segments + pois + weather (idempotent, ignore les absents)
  - [x] `runCachePurge(adventures[], getSegmentIds?, now?)` : itère la liste N1, applique `shouldPurgeAdventure`, purge les éligibles. Appelé au foreground via le listener centralisé (T6) — jamais un listener séparé. `SegmentIdsResolver` optionnel (la liste N1 ne porte pas les segments)
  - [x] `clearAdventureCache(adventureId, segmentIds[])` : version manuelle (bouton T7) sans condition de date

- [x] **T3 — `lib/cache/gpx-cache.ts` (N2 — câblé)** (AC: 1, 2)
  - [x] `getCachedGpx` (lit `/cache/gpx/{segmentId}.gpx` UTF-8, `null` si absent/illisible) / `setCachedGpx` (`ensureDir` + write-through) / `hasCachedGpx`
  - [x] **Câblage** write-through/read-through via `loadSegmentGpx(segmentId, fetcher, isOnline)` : online→fetch+setCachedGpx (fallback cache si fetch échoue), offline→getCachedGpx. **Note câblage** : MOB-3.2 ne charge QUE les métadonnées de segment (pas le texte GPX brut côté mobile — pas de loader trace existant à refactorer). `loadSegmentGpx` EST le point de câblage N2, documenté en JSDoc, à consommer par le futur loader trace (visualisation carte, epic ultérieur). Aucun refactor 3.2 au-delà de ce branchement.

- [x] **T4 — `lib/cache/poi-cache.ts` (N3 — squelette)** (AC: 1, prépare MOB-4)
  - [x] `getCachedPois(adventureId): Promise<Poi[] | null>` / `setCachedPois(adventureId, pois)` (JSON, `/cache/pois/{adventureId}.json`)
  - [x] Squelette : API stable + tests read/write/miss, non branché. Type `Poi` importé de `@ridenrest/shared` (existe). Commentaire « Alimenté en MOB-4 ».

- [x] **T5 — `lib/cache/weather-cache.ts` (N3 — squelette)** (AC: 1, prépare MOB-5/6)
  - [x] `getCachedWeather` / `setCachedWeather`, `/cache/weather/{adventureId}.json`. Payload `unknown` + `// TODO MOB-5/6`. Tests read/write/miss. Commentaire « Alimenté en MOB-5/6 ».

- [x] **T6 — `hooks/use-network-status.ts` + intégration listener centralisé** (AC: 2, 3)
  - [x] `useNetworkStatus(): { isOnline, isInternetReachable }` (abonnement NetInfo + seed `NetInfo.fetch()` au montage). `deriveIsOnline` : offline si `isInternetReachable === false` même si `isConnected` (corrige dette MOB-2.1)
  - [x] **Enrichi** `lib/query/use-app-state-refetch.ts` (listener unique, PAS de 2nd) : seed `onlineManager` au boot via `NetInfo.fetch()` ; bridge prend en compte `isInternetReachable` ; transition offline→online OU foreground+online → `invalidateQueries({ queryKey: ['adventures'] })` (préfixe couvrant détail + segments, refetch en place, AC3) ; foreground → `runCachePurge` sur la liste N1 lue via `getQueryData(['adventures'])`. `.catch(()=>{})` sur tout await réseau.
  - [x] `hooks/use-cache-purge.ts` : `{ clear, isPurging }` — fine façade sur `clearAdventureCache`

- [x] **T7 — `<StatusBanner>` global + désactivation actions offline** (AC: 2, 3)
  - [x] `components/shared/status-banner.tsx` : bandeau global non bloquant, distinct d'`ErrorBanner`, monté au root au-dessus du `<Stack>` (sous I18nextProvider), visible UNIQUEMENT offline, NativeWind, `accessible`+`accessibilityRole="alert"`+`accessibilityLiveRegion="polite"`. (+ `.stories.tsx`)
  - [x] Actions réseau désactivées offline dans le détail aventure : renommer/supprimer `disabled={!isOnline}` + `accessibilityHint` i18n ; upload GPX / import Strava masqués offline. Message `offline.readOnly` affiché. Lecture seule sinon.

- [x] **T8 — Persistance TanStack Query (N1) + i18n** (AC: 1, 2)
  - [x] `query-provider.tsx` → `PersistQueryClientProvider` + `createAsyncStoragePersister({ storage: AsyncStorage })`, `maxAge` 24 h, `buster` = `Constants.expoConfig?.version`, `shouldDehydrateQuery` whiteliste `['adventures']` (préfixe) et EXCLUT `['session']` + tout le reste (secrets → secure-store uniquement). `query-client.ts` : `gcTime` 24 h explicite (couvre `maxAge`).
  - [x] Clés i18n FR+EN (parité vérifiée) : `offline.{banner,readOnly,actionUnavailable,cacheCleared}`, `settings.clearCache.{label,confirm,done}`. Zéro chaîne en dur.
  - [x] `<ClearAdventureCacheButton adventureId segmentIds>` (confirmation Alert destructive + message i18n) câblé dans le détail aventure (settings global ne porte pas d'adventureId — purge par-aventure).

- [x] **T9 — Build natif & prebuild** (AC: 1) — _SATISFAIT sans action native nouvelle_
  - [x] `expo-file-system` **déjà lié natif** (prebuild fait en MOB-3.2 lors de son ajout) → **pas de re-prebuild**. Les 2 paquets persist sont **JS pur** (pas de natif). app.config.ts inchangé (plugin non requis, cf. T1). `expo export` iOS OK (bundle généré sans fichiers de test).

- [x] **T10 — Tests** (AC: tous)
  - [x] **Mock `expo-file-system`** (`__mocks__/expo-file-system.js`) : FS **en mémoire** selon l'**API NOUVELLE** retenue (`File`/`Directory`/`Paths`) + rétro-compat `File.__size` (MOB-3.2) + helpers `__resetFs`/`__files`/`__dirs`. **Mock `@react-native-community/netinfo`** (`fetch`+`addEventListener`+`__emit`/`__setState`/`__reset` pilotables), enregistré globalement dans `jest.setup.ts`.
  - [x] `lib/cache/cache-manager.test.ts` : `shouldPurgeAdventure` (bornes exactes >10j/>20j, priorité endDate, ni l'un ni l'autre) ; `purgeAdventureCache` (3 familles, n'affecte pas une autre aventure) ; idempotence ; `runCachePurge` (éligibles seulement, vide/undefined no-op) ; `clearAdventureCache`.
  - [x] `gpx-cache.test.ts` (round-trip, miss→null, ensureDir, loadSegmentGpx online/offline/fallback) + `poi-cache.test.ts` + `weather-cache.test.ts` (round-trip, miss, ensureDir, JSON corrompu→null).
  - [x] `hooks/use-network-status.test.tsx` (co-localisé — pas d'import de route) : seed via `NetInfo.fetch`, transitions online↔offline (sonde de rendu, pas `renderHook` — leçon repo).
  - [x] `components/shared/status-banner.test.tsx` : visible offline / masqué online, message i18n, rôle alert, forceVisible.
  - [x] `lib/query/use-app-state-refetch.test.tsx` : seed online boot + transition offline→online → `invalidateQueries({ queryKey: ['adventures'] })` (pas de navigation = pas d'import/spy router).
  - [x] Gates **verts** : `typecheck` (0 err), `lint` (0), `test` (195 tests / 34 suites) + `expo export` iOS OK (bundle sans fichiers de test).

- [ ] **T11 — Validation manuelle** (AC: 2, 3, 4) — _DÉFÉRÉE à l'utilisateur (device requis)_
  - [ ] Charger une aventure online (trace + liste) → mode avion → rouvrir : trace + POIs consultables, actions réseau grisées, `<StatusBanner>` visible
  - [ ] Réactiver le réseau → données rafraîchies, banner disparaît, **écran courant préservé**
  - [ ] Aventure `endDate` > 10 j → relancer (foreground) → cache purgé ; bouton « Vider le cache » → cache vidé + confirmation

### Review Findings

> Code review du 2026-06-13 (périmètre MOB-3.5 strict, 27 fichiers, baseline `4dee3b1`→`522fe5f`). 3 couches adversariales (Blind Hunter, Edge Case Hunter, Acceptance Auditor). `adventures/[id].tsx` exclu du périmètre → désactivation des actions offline (T7) et câblage par-aventure (AC4) **non vérifiables dans ce diff**.

**Décision résolue (2026-06-13)** — acceptée + consignée comme différé (cf. ci-dessous).

**Patches**

- [x] [Review][Patch] Rejet non géré à la purge manuelle (red-box + `done` jamais positionné) [`apps/mobile/src/lib/cache/cache-manager.ts:62,143-149`, `apps/mobile/src/hooks/use-offline-cache.ts:26-34`, `apps/mobile/src/components/shared/offline-cache-section.tsx:33`] — `deleteIfExists`/`clearAllCache`/`ensureDir` peuvent jeter (race `exists`→`delete/create`, FS verrouillé) ; `clearAll` n'a pas de `catch` et `void clearAll().then(() => setDone(true))` non plus → rejet non géré (red-box RN) + `done` jamais à `true`. Incohérent avec la règle `.catch` appliquée partout ailleurs dans ce diff. Fix : try/catch défensif sur les ops FS (idempotent) + `.catch` côté UI.
- [x] [Review][Patch] `hasCachedData()` peut jeter dans l'initialiseur `useState` [`apps/mobile/src/lib/cache/cache-manager.ts:129-135`] — `dir.exists && dir.list()` est un TOCTOU ; si l'OS purge le dossier cache entre les deux appels, `dir.list()` jette de façon synchrone dans `useState(() => hasCachedData())` (`use-offline-cache.ts:23`) → crash au render de l'écran Paramètres. Fix : try/catch par dossier → `false`.
- [x] [Review][Patch] Date ISO malformée jamais purgée [`apps/mobile/src/lib/cache/cache-manager.ts:53,56`] — `new Date(isoCorrompu).getTime()` → `NaN` ; `now - NaN > TEN_DAYS` est toujours `false` → l'aventure n'est jamais purgée auto (fuite cache silencieuse). Source serveur ISO (peu probable) mais garde `Number.isNaN` triviale et correcte.
- [x] [Review][Patch] Clé i18n morte `offline.cacheCleared` [`apps/mobile/src/lib/i18n/locales/fr.json:192`, `en.json:192`] — définie FR+EN mais référencée nulle part (reliquat du flux v1.0 par-aventure, remplacé par `settings.offlineCache.done`). Fix : retirer des deux locales (parité préservée).
- [x] [Review][Patch] `loadSegmentGpx` jette/perd le texte fraîchement fetché si l'écriture cache échoue [`apps/mobile/src/lib/cache/gpx-cache.ts:66-73`] — un throw de `setCachedGpx` retombe dans le `catch` et renvoie le cache (périmé/`null`) en jetant le texte tout juste téléchargé. Fix : isoler l'écriture dans son propre try pour renvoyer quand même le texte fetché. (Code dormant, fix non ambigu.)

**Différés**

- [x] [Review][Defer] Purge auto GPX (N2) jamais effective — `purgeStaleCache` appelle `runCachePurge(adventures)` **sans `getSegmentIds` resolver** [`apps/mobile/src/lib/query/use-app-state-refetch.ts:45`] → seuls pois/weather (N3 squelettes) seraient purgés, jamais `/cache/gpx/{segmentId}.gpx`. **Différé** (décision Guillaume) : impact nul aujourd'hui (`loadSegmentGpx` dormant, aucun GPX écrit) ; le câblage du resolver de purge arrivera avec l'epic loader-trace, en même temps que l'écriture GPX réelle.
- [x] [Review][Defer] `hasCache` périmé si le cache est alimenté après le montage des Paramètres [`apps/mobile/src/hooks/use-offline-cache.ts:23`] — lu une seule fois au mount, relu seulement après une purge manuelle. SDK 56 n'a pas de FS-watcher ; re-check au focus d'écran serait le fix. Différé — UX mineure, l'écran Paramètres est normalement monté à froid.
- [x] [Review][Defer] Tempête de refetch sur réseau instable [`apps/mobile/src/lib/query/use-app-state-refetch.ts:100-102`] — chaque front offline→online invalide le préfixe `['adventures']` (liste + détails + segments), sans debounce. Différé — TanStack déduplique les refetch en vol ; ajouter un debounce est une amélioration, pas un correctif.

## Dev Notes

### Logique cache N1/N2/N3 (source : architecture-mobile.md §Data Architecture, l.337-356)

| Niveau | Donnée | Storage | Lib | Chemin / mécanisme | Statut cette story |
|---|---|---|---|---|---|
| **N1** | Liste aventures | TanStack Query persist | `@tanstack/react-query-persist-client` + async-storage | dehydrate/persist `['adventures']` | **Câblé** (T8) |
| **N2** | Trace GPX | Filesystem | `expo-file-system` | `/cache/gpx/{segmentId}.gpx` | **Câblé** (T3, write-through online / read-through offline) |
| **N3** | POIs par aventure | Filesystem | `expo-file-system` | `/cache/pois/{adventureId}.json` | **Squelette** (T4 — alimenté MOB-4) |
| **N3** | Météo par aventure | Filesystem | `expo-file-system` | `/cache/weather/{adventureId}.json` | **Squelette** (T5 — alimenté MOB-5/6) |

> **Données non sensibles** → **PAS de chiffrement** (ni file-system, ni AsyncStorage). Les **secrets** (JWT/refresh) restent **exclusivement** en `expo-secure-store` (MOB-2.1) — ne **jamais** persister `['session']` ni de token via TanStack Query persist (`shouldDehydrateQuery` doit les exclure). Voir `apps/mobile/AGENTS.md` §Auth.

### Politique de purge — pseudo-code consigne (RECOPIE FIDÈLE — archi l.690-707)

```typescript
// lib/cache/cache-manager.ts — pseudo-code consigne
async function shouldPurgeAdventure(adventure: Adventure): Promise<boolean> {
  const now = Date.now()
  const TEN_DAYS = 10 * 24 * 60 * 60 * 1000
  const TWENTY_DAYS = 20 * 24 * 60 * 60 * 1000

  if (adventure.endDate) {
    return now - new Date(adventure.endDate).getTime() > TEN_DAYS
  }
  if (adventure.startDate) {
    return now - new Date(adventure.startDate).getTime() > TWENTY_DAYS
  }
  return false  // Ni start ni end : pas de purge auto, fallback manuel
}
```

- Logique **uniquement** basée sur `startDate`/`endDate` **existants** → **aucune migration backend, aucune dépendance serveur** (archi l.356, l.493).
- Champs en **camelCase** (`endDate`/`startDate`) — sérialisation Drizzle/API (archi §Patterns hérités, l.509). Dates **ISO 8601** → `new Date(iso)`.
- Déclenchement : **au démarrage** / passage premier-plan (`AppState` → `active`), via le listener **unique** (T6). Fallback manuel : bouton settings (AC4) — indispensable pour les aventures **sans** `startDate`/`endDate` (jamais purgées auto).

### Listener AppState / NetInfo centralisé (source : archi §Native Capabilities l.416-424, §Lifecycle l.683-687 + MOB-2.1)

**UN SEUL** listener `AppState`, déjà monté au root via `useAppStateRefetch()` (`src/lib/query/use-app-state-refetch.ts`, appelé dans `src/app/_layout.tsx`). Cette story l'**enrichit** — interdiction formelle d'ajouter un second listener `AppState` ou un second abonnement NetInfo global.

État actuel du hook (MOB-2.1, à étendre) :
- `AppState change` → `focusManager.setFocused(status === 'active')` + `authClient.getSession().catch(...)` au retour foreground.
- `onlineManager.setEventListener(... NetInfo.addEventListener ...)` avec `setOnline(state.isConnected ?? true)`.

Extensions MOB-3.5 (dans **ce même** hook) :
1. **Seed online au boot** : `NetInfo.fetch()` au montage → `onlineManager.setOnline(...)` (corrige la dette différée MOB-2.1 : « État online initial non seedé + `isInternetReachable` ignoré », cf. MOB-2.1 Review/Defer l.109). Prendre en compte `isInternetReachable === false` → considérer offline même si `isConnected`.
2. **Retour réseau** → `queryClient.invalidateQueries()` ciblé sur les query keys critiques (`['adventures']`, `['adventures', id]`, `['adventures', id, 'segments']`). **Sans perte de contexte** : on invalide/refetch en place, on ne **re-navigue pas** (AC3).
3. **Foreground** → `runCachePurge(listeN1)` (la liste N1 vient du cache TanStack Query persisté, lue via `queryClient.getQueryData(['adventures'])`).

`useNetworkStatus` (T6) est le **hook de lecture UI** (pour `<StatusBanner>` + désactivation actions) — il s'abonne à NetInfo **pour l'affichage** ; il ne **duplique pas** la logique de refetch (qui reste dans le listener centralisé). Seed initial via `NetInfo.fetch()` pour éviter un faux « online » au boot.

### Intégration persist TanStack Query (source : archi l.346, MOB-2.1 socle)

- `query-provider.tsx` actuel monte `<QueryClientProvider client={queryClient}>`. Le remplacer par `<PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge, buster, dehydrateOptions: { shouldDehydrateQuery } }}>`.
- `persister = createAsyncStoragePersister({ storage: AsyncStorage })` (depuis `@tanstack/query-async-storage-persister`).
- `shouldDehydrateQuery` : **whitelister** `['adventures']` (préfixe), **exclure** `['session']` et toute query contenant un secret. Par défaut, ne persister que ce qui est nécessaire au listing offline.
- Conserver `queryClient` de `query-client.ts` (mêmes `defaultOptions`). `gcTime` doit être ≥ `maxAge` pour que les queries persistées survivent à l'hydratation (sinon GC immédiat). Fixer un `gcTime` explicite (ex. 24 h) côté `query-client.ts` ou dans les hooks de liste.

### API `expo-file-system` SDK 56 (vérifier la doc versionnée AVANT de coder)

> `apps/mobile/AGENTS.md` : **lire** https://docs.expo.dev/versions/v56.0.0/ avant d'écrire du code Expo. SDK 56 expose la **nouvelle API** `expo-file-system` (classes `File`/`Directory`/`Paths`) ; l'API legacy (`readAsStringAsync`/`writeAsStringAsync`/`getInfoAsync`/`makeDirectoryAsync`/`deleteAsync`, `cacheDirectory`) reste disponible via `expo-file-system/legacy`. **Choisir une seule API** et la mocker en conséquence (T10). Le cache va sous le **répertoire cache** (`Paths.cache` / `cacheDirectory`) — purgeable par l'OS, cohérent avec un cache offline non critique.

### Dépendances à installer (vérifié dans `apps/mobile/package.json`)

| Paquet | Présent ? | Action |
|---|---|---|
| `@react-native-community/netinfo` | ✅ `12.0.1` | réutiliser (lié natif MOB-2.1) |
| `@react-native-async-storage/async-storage` | ✅ `2.2.0` | réutiliser (lié natif MOB-2.1) |
| `@tanstack/react-query` | ✅ `^5.90.21` | réutiliser |
| `expo-file-system` | ❌ **absent** | `npx expo install expo-file-system` (**natif → prebuild T9**) |
| `@tanstack/react-query-persist-client` | ❌ **absent** | `pnpm --filter @ridenrest/mobile add ...` |
| `@tanstack/query-async-storage-persister` | ❌ **absent** | `pnpm --filter @ridenrest/mobile add ...` |

### Anti-patterns interdits (rappel — archi l.762-789)

- ❌ Second listener `AppState` / second abonnement NetInfo global → **un seul** dans `use-app-state-refetch.ts`.
- ❌ Chiffrer le cache file-system / persister des tokens via TanStack Query → secrets = `expo-secure-store` uniquement.
- ❌ `Alert.alert` pour l'état offline → `<StatusBanner>` global (et `<ErrorBanner>` inline pour les erreurs form).
- ❌ Re-navigation au retour réseau → invalider/refetch **en place** (préserver l'écran courant).
- ❌ Styles inline RN quand NativeWind suffit ; chaînes en dur (tout via `t()`).
- ❌ Redéfinir le type `Poi`/`Adventure` localement → importer depuis `packages/shared`.

### Loading states & errors (source : archi l.711-719)

- `<StatusBanner message="Mode hors ligne">` **global** déclenché par `useNetworkStatus` (≠ `<ErrorBanner>` inline form de MOB-2.2).
- Lecture seule offline : trace + POIs cachés consultables ; actions réseau `disabled` + message explicite.

### Fichiers à toucher

**Créés**
- `apps/mobile/src/lib/cache/cache-manager.ts` (+ `.test.ts`)
- `apps/mobile/src/lib/cache/gpx-cache.ts` (+ `.test.ts`)
- `apps/mobile/src/lib/cache/poi-cache.ts` (+ `.test.ts`) — squelette
- `apps/mobile/src/lib/cache/weather-cache.ts` (+ `.test.ts`) — squelette
- `apps/mobile/src/hooks/use-network-status.ts`
- `apps/mobile/src/hooks/use-cache-purge.ts`
- `apps/mobile/src/components/shared/status-banner.tsx` (+ `.test.tsx`, + `.stories.tsx`)
- `apps/mobile/src/components/shared/clear-adventure-cache-button.tsx` (bouton settings/détail, si settings absent)
- `apps/mobile/__mocks__/expo-file-system.js`
- `apps/mobile/src/__tests__/use-network-status.test.tsx` (si import de route, sinon co-localisé)

**Modifiés**
- `apps/mobile/src/lib/query/use-app-state-refetch.ts` (seed online boot + invalidate critiques + `runCachePurge`)
- `apps/mobile/src/lib/query/query-provider.tsx` (`PersistQueryClientProvider`)
- `apps/mobile/src/lib/query/query-client.ts` (`gcTime` explicite ≥ `maxAge`)
- `apps/mobile/src/app/_layout.tsx` (monter `<StatusBanner>` global au-dessus du `<Stack>`)
- `apps/mobile/src/app/(app)/adventures/[id].tsx` (branchement read/write-through GPX + désactivation actions offline) — _dépend de MOB-3.1/3.2_
- `apps/mobile/src/lib/i18n/locales/fr.json` + `en.json` (clés `offline.*`, `settings.clearCache.*`)
- `apps/mobile/app.config.ts` (plugin `expo-file-system` si requis)
- `apps/mobile/package.json` (3 deps)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut MOB-3-5) — **par l'agent dev, pas la story-creation**

### Clés i18n (FR + EN, namespace `offline.*` / `settings.clearCache.*`)

| Clé | FR (exemple) |
|---|---|
| `offline.banner` | « Mode hors ligne » |
| `offline.readOnly` | « Consultation hors ligne (lecture seule) » |
| `offline.actionUnavailable` | « Action indisponible hors ligne » |
| `offline.cacheCleared` | « Cache de l'aventure vidé » |
| `settings.clearCache.label` | « Vider le cache de cette aventure » |
| `settings.clearCache.confirm` | « Supprimer la trace et les POIs cachés de cette aventure ? » |
| `settings.clearCache.done` | « Cache vidé » |

> Le fichier `fr.json` actuel a déjà les namespaces `home`/`explore`/`oauthCallback`/`auth`. Ajouter `offline` et `settings` au même niveau racine. Parité **FR ↔ EN** obligatoire (gate i18n MOB-1.4).

### Testing standards (source : archi l.723-731, AGENTS.md)

- Jest + RNTL, tests co-localisés `*.test.ts(x)` — **sauf** ceux qui **importent un fichier de route** (`src/app/**`) → sous `src/__tests__/` (gotcha `require.context`, cf. AGENTS.md). Les tests cache/lib restent co-localisés sous `src/lib/cache/`.
- **Mocks natifs** : `__mocks__/expo-file-system.js` (FS en mémoire), `@react-native-community/netinfo` (`fetch` + `addEventListener` pilotables). Pas de JSX RN dans une factory `jest.mock` (transform NativeWind injecte une variable hors-scope — cf. AGENTS.md) → `jest.fn(() => null)`.
- `userEvent` (pas `fireEvent`) pour les interactions async (RNTL v14 + React 19 — leçon MOB-2.2 : `fireEvent` laisse un `act()` ouvert qui corrompt les renders suivants).
- Gate : `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts + `expo export` iOS OK.

### Previous story intelligence

- **MOB-2.1** : `QueryProvider`, `queryClient` (`['adventures']`, `['adventures', id]`, `['pois', {...}]`), `useAppStateRefetch` (**un seul** listener AppState + bridge `onlineManager`/NetInfo — **purge offline explicitement déférée ici**), `apiFetch`. **Dette différée → cette story** : « État online initial non seedé + `isInternetReachable` ignoré (boot hors-ligne) » (MOB-2.1 Review/Defer) ET « `<StatusBanner>` + `useNetworkStatus` complet » (MOB-2.1 §Offline). On les **résout** ici (T6).
- **MOB-2.2** : `ErrorBanner` (inline form, à **ne pas** confondre avec `StatusBanner` global), pattern i18n FR/EN, `userEvent`, lib `cn`.
- **MOB-3.1** (dépendance) : liste/détail aventures + query keys `['adventures']`/`['adventures', id]` (cible de la persistance N1 + de l'invalidation critique).
- **MOB-3.2** (dépendance) : chargement trace GPX (segments) — point de câblage du write-through/read-through N2.

### Git intelligence

- `use-app-state-refetch.ts` documente déjà en commentaire « La purge du cache offline arrive en MOB-3.5 ; ici on ne câble que les points d'extension (focus + online) » → cette story **comble** ce point.
- Réutiliser le `.catch(() => {})` pattern sur tout `await` réseau au retour offline (red-box RN si rejet non géré — leçon MOB-2.1).

### Latest tech information

- `expo-file-system` SDK 56 : **nouvelle API** (`File`/`Directory`/`Paths`) + `expo-file-system/legacy` pour l'ancienne. Le répertoire **cache** (`Paths.cache` / `cacheDirectory`) convient (OS peut purger — acceptable pour un cache offline non critique). **Lire la doc versionnée v56** avant de coder.
- `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` : `PersistQueryClientProvider` + `createAsyncStoragePersister`. `gcTime` doit couvrir `maxAge` pour survivre à l'hydratation.

### Project Structure Notes

- **Conforme** à l'arborescence archi (l.541-610) : `lib/cache/{cache-manager,gpx-cache,poi-cache,weather-cache}.ts`, `hooks/{use-network-status,use-cache-purge}.ts`, `components/shared/status-banner.tsx`. Le dossier `components/shared/` existe déjà (`google-sign-in-button.tsx` de MOB-2.3). `lib/cache/` est **nouveau**.
- Nommage : lib `kebab-case.ts`, hooks `use-*.ts`, composants `kebab-case.tsx`, tests `*.test.ts(x)` co-localisés (sauf routes → `src/__tests__/`).
- Aucune migration DB / modif serveur. Aucune divergence de convention vs web sans raison documentée.

### Frontière de story

- **Inclus** : infra cache file-system (N2 câblé, N3 squelette), persistance TanStack Query N1, `useNetworkStatus` + `<StatusBanner>` global, désactivation actions réseau offline, purge auto (`shouldPurgeAdventure`) au foreground + bouton manuel settings, enrichissement du listener centralisé (seed online boot + invalidate critiques + purge), seed de la dette online MOB-2.1.
- **Exclu** : alimentation **réelle** des caches POI (N3 → MOB-4) et météo (N3 → MOB-5/6) — ici **squelette** ; durcissement HTTPS/env (différé MOB-2.1) ; toute modif backend ; sync write offline (lecture seule au MVP) ; MMKV (option perf future, archi l.342).

### References

- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Data Architecture (mobile-side)] — table cache N1/N2/N3, chemins `/cache/gpx|pois|weather`, persist TanStack Query (l.337-346)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Politique de purge cache offline] — logique end_date>10j / start_date>20j / manuel, pas de migration backend (l.348-356)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Cache offline (logique stricte)] — pseudo-code `shouldPurgeAdventure` (l.690-707)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Native Capabilities & Background] — `AppState` un seul listener, NetInfo (l.416-424)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Routing & deep links / Lifecycle] — listener centralisé `app/_layout.tsx` (l.683-687)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Loading states & errors] — `<StatusBanner>` global via `useNetworkStatus` (l.711-719)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Structure Patterns] — `lib/cache/*`, `hooks/use-network-status`, `hooks/use-cache-purge` (l.541-610)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Enforcement Guidelines / Anti-patterns] — secrets secure-store, un seul AppState, NativeWind, fetch natif (l.747-789)
- [Source: _bmad-output/implementation-artifacts/MOB-2-1-better-auth-client-secure-store-session.md] — `QueryProvider`/`useAppStateRefetch`/bridge online, purge déférée MOB-3.5, dette online non seedé + `isInternetReachable` (l.75, 109, 169, 205, 250)
- [Source: apps/mobile/src/lib/query/use-app-state-refetch.ts] — listener centralisé à enrichir
- [Source: apps/mobile/src/lib/query/query-provider.tsx + query-client.ts] — provider/client à passer en persist
- [Source: apps/mobile/src/app/_layout.tsx] — montage `<StatusBanner>` global
- [Source: apps/mobile/AGENTS.md] — doc Expo v56, prebuild après module natif, tests routes sous `src/__tests__/`, mocks natifs sans JSX
- [Source: apps/mobile/src/lib/i18n/locales/fr.json + en.json] — structure i18n à étendre (`offline.*`, `settings.*`)

## Dev Agent Record

### Agent Model Used

Opus 4.8 (claude-opus-4-8) — subagent BMAD dev-story.

### Debug Log References

- Choix API `expo-file-system` : **NOUVELLE API** (`File`/`Directory`/`Paths`, SDK 56). Méthodes utilisées : `new Directory(uri).exists`/`.create({ intermediates })`, `new File(uri).exists`/`.text()` (async)/`.write(string)`/`.delete()`, `Paths.cache.uri`. Le mock FS en mémoire reflète exactement cette surface.
- Régression initiale tests render : `renderHook` (`result.current`) peu fiable sous RNTL v14 + React 19 (leçon déjà documentée dans `use-adventures.test.ts`) → réécrits avec **sonde de rendu** (composant qui rend la valeur du hook) + `await render(...)` (le `render` du setup repo est asynchrone).
- Régression typecheck : les helpers de mock (`__files`/`__dirs`/`__resetFs`) ne sont pas typés par le vrai module `expo-file-system` → import namespace `import * as ExpoFs from 'expo-file-system'` + cast (MÊME instance que l'auto-mock côté prod, contrairement à `jest.requireMock` qui clonait l'instance et cassait l'état partagé).
- `getByRole('alert')` sur une `View` RN exige `accessible` (sinon le rôle n'est pas exposé sur iOS) → ajouté au `StatusBanner` (a11y-correct : regroupe le bandeau en un élément annoncé).
- `app.config.ts` : plugin `expo-file-system` non ajouté — le config-plugin n'ajoute que des permissions Android external-storage + Info.plist document-sharing, hors-scope d'un cache interne `Paths.cache` ; autolinking suffit (module déjà lié MOB-3.2).

### Completion Notes List

- **API expo-file-system retenue** : nouvelle (`File`/`Directory`/`Paths`), pas la legacy. Cache sous `Paths.cache` (purgeable OS — acceptable pour un cache offline non critique).
- **Câblage N2 GPX** : `loadSegmentGpx(segmentId, fetcher, isOnline)` = point d'intégration write-through (online : fetch → `setCachedGpx` → renvoie ; fallback cache si fetch rejette) / read-through (offline : `getCachedGpx`). MOB-3.2 ne charge que les métadonnées de segment (aucun loader de trace GPX brute côté mobile à ce jour), donc rien à refactorer : `loadSegmentGpx` est la façade documentée que consommera le futur loader de trace (visualisation carte, epic ultérieur).
- **Persist N1** : `PersistQueryClientProvider` + `createAsyncStoragePersister(AsyncStorage)`, `maxAge`/`gcTime` 24 h, `buster` = version app, `shouldDehydrateQuery` whiteliste strictement `['adventures']` (exclut `['session']` + tout secret — secrets en secure-store uniquement).
- **Listener centralisé enrichi** (un seul) : seed online boot via `NetInfo.fetch()` (corrige dette MOB-2.1 : online non seedé + `isInternetReachable` ignoré) ; bridge online prend `isInternetReachable` en compte ; transition offline→online OU foreground+online → `invalidateQueries(['adventures'])` (préfixe couvrant `['adventures', id]` et `['adventures', id, 'segments']`) en place, sans re-navigation (AC3) ; foreground → `runCachePurge` sur la liste N1 persistée.
- **N3 POIs/météo** : squelettes (API stable + tests), non branchés. `Poi` importé de `@ridenrest/shared` ; météo `unknown` + TODO MOB-5/6.
- **Gates** : `typecheck` 0 erreur ; `lint` 0 ; `jest` 195 tests / 34 suites verts (10 nouveaux fichiers de tests + suites existantes intactes) ; `expo export` iOS OK (bundle généré, aucun `*.test.*` sous `src/app/`).
- **T9** satisfait sans action native nouvelle (module déjà lié MOB-3.2, paquets persist en JS pur). **T11** validation device déférée à l'utilisateur.
- **Aucune** modif backend ni `packages/shared` (imports de types existants seulement).

### File List

**Créés**
- `apps/mobile/src/lib/cache/cache-manager.ts` (+ `.test.ts`)
- `apps/mobile/src/lib/cache/gpx-cache.ts` (+ `.test.ts`)
- `apps/mobile/src/lib/cache/poi-cache.ts` (+ `.test.ts`) — squelette N3
- `apps/mobile/src/lib/cache/weather-cache.ts` (+ `.test.ts`) — squelette N3
- `apps/mobile/src/hooks/use-network-status.ts` (+ `.test.tsx`)
- `apps/mobile/src/hooks/use-cache-purge.ts`
- `apps/mobile/src/components/shared/status-banner.tsx` (+ `.test.tsx` + `.stories.tsx`)
- `apps/mobile/src/components/shared/clear-adventure-cache-button.tsx`
- `apps/mobile/src/lib/query/use-app-state-refetch.test.tsx`
- `apps/mobile/__mocks__/@react-native-community/netinfo.js`

**Modifiés**
- `apps/mobile/__mocks__/expo-file-system.js` (étendu : FS en mémoire `File`/`Directory`/`Paths`, rétro-compat `File.__size`)
- `apps/mobile/jest.setup.ts` (mock global netinfo)
- `apps/mobile/src/lib/query/use-app-state-refetch.ts` (seed online boot + invalidate critiques + `runCachePurge`)
- `apps/mobile/src/lib/query/query-provider.tsx` (`PersistQueryClientProvider`)
- `apps/mobile/src/lib/query/query-client.ts` (`gcTime` 24 h explicite + `CACHE_MAX_AGE_MS`)
- `apps/mobile/src/app/_layout.tsx` (montage `<StatusBanner>` global)
- `apps/mobile/src/app/(app)/adventures/[id].tsx` (désactivation actions offline + `<ClearAdventureCacheButton>`)
- `apps/mobile/src/lib/i18n/locales/fr.json` + `en.json` (`offline.*`, `settings.clearCache.*`)
- `apps/mobile/package.json` (+ `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MOB-3-5 → review)

**Correctifs post-review (purge manuelle relocalisée dans les Paramètres)**
- Créés : `apps/mobile/src/hooks/use-offline-cache.ts`, `apps/mobile/src/components/shared/offline-cache-section.tsx`
- Supprimés : `apps/mobile/src/hooks/use-cache-purge.ts`, `apps/mobile/src/components/shared/clear-adventure-cache-button.tsx`
- `apps/mobile/src/lib/cache/cache-manager.ts` — `hasCachedData()` + `clearAllCache()` (purge GLOBALE)
- `apps/mobile/src/lib/cache/cache-manager.test.ts` — tests `hasCachedData`/`clearAllCache`
- `apps/mobile/__mocks__/expo-file-system.js` — ajout `Directory.list()`
- `apps/mobile/src/app/(app)/settings.tsx` — montage `<OfflineCacheSection>` (affichée seulement si du cache existe)
- `apps/mobile/src/app/(app)/adventures/[id].tsx` — retrait du bouton clear-cache par-aventure
- `apps/mobile/src/lib/i18n/locales/{fr,en}.json` — `settings.clearCache.*` → `settings.offlineCache.*` (+ texte explicatif)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-12 | 0.1 | Création story MOB-3.5 (ready-for-dev) — infra cache offline : N2 GPX câblé + N1 persist TanStack Query + N3 POIs/météo squelette ; `useNetworkStatus` + `<StatusBanner>` global ; purge `shouldPurgeAdventure` au foreground + bouton manuel settings ; enrichissement du listener AppState/NetInfo centralisé (seed online boot, invalidate critiques, purge) + résolution de la dette online différée MOB-2.1. Aucune modif backend. | bmad-create-story |
| 2026-06-13 | 1.0 | Implémentation T1-T8 + T10 (dev-story, TDD). lib/cache (cache-manager + gpx-cache câblé N2 via `loadSegmentGpx` + poi/weather squelettes N3) ; persist TanStack Query N1 (`PersistQueryClientProvider` + AsyncStorage, gcTime/maxAge 24 h, dehydrate `['adventures']` only) ; `useNetworkStatus` + `<StatusBanner>` global a11y ; listener AppState/NetInfo enrichi (seed online boot, invalidate critiques en place, `runCachePurge` foreground) + dette MOB-2.1 résolue ; actions réseau désactivées offline + `<ClearAdventureCacheButton>` ; i18n FR/EN `offline.*`/`settings.clearCache.*` ; mocks `expo-file-system` (API NOUVELLE File/Directory/Paths, FS mémoire) + netinfo pilotable. Gates verts : typecheck 0 / lint 0 / 195 tests (34 suites) + `expo export` iOS OK. T9 satisfait sans action native nouvelle (module déjà lié MOB-3.2 + paquets persist JS pur), T11 device déféré. Status → review. | Amelia (dev, Opus 4.8) |
| 2026-06-13 | 1.1 | Correctif post-review (décision UX) : la purge manuelle passe d'un bouton **par-aventure** (écran détail) à une section **« Cache hors ligne » GLOBALE** dans les Paramètres, avec texte explicatif, affichée uniquement si du cache existe. Ajout `hasCachedData()`/`clearAllCache()` au cache-manager + `Directory.list()` au mock ; nouveau hook `use-offline-cache` + composant `offline-cache-section` (remplacent `use-cache-purge`/`clear-adventure-cache-button`) ; i18n `settings.offlineCache.*`. Purge auto (`shouldPurgeAdventure`/`runCachePurge`) inchangée. Gates verts (200 tests). | Opus 4.8 |
