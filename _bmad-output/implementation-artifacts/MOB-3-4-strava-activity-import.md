---
baseline_commit: d37e04047f1f48daa5bbee92f089478c8aeaa2ce
---

# Story 3.4 : Import d'activité Strava (mobile)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Dépend de MOB-3.1** (CRUD aventures + écran détail `(app)/adventures/[id]`), **MOB-3.2** (`hooks/use-segments.ts` : liste segments + **polling parse status** + `segment-status-badge`) et — pré-requis **fonctionnel** — **MOB-2.4** (Strava OAuth account-linking : c'est lui qui crée la ligne `account` provider `strava` et permet de détecter « Strava connecté »). Cette story **n'ajoute aucun code serveur** : le contrat NestJS Strava est **déjà livré** (story web 3.5, `done`) et identique pour le mobile (`GET /strava/routes`, `POST /strava/routes/:id/import`). Côté mobile on consomme via `apiFetch` (MOB-2.1) + TanStack Query (MOB-2.1).
>
> ⚠️ **« Routes », PAS « activités » (contrat réel).** L'epic dit « import d'activité Strava » mais l'architecture **et l'API livrée** importent **des routes Strava** (itinéraires **planifiés** par l'utilisateur), **pas des activités** (les activités exigeraient le scope `activity:read_all`, non demandé, restreint par les ToS Strava). Le scope OAuth en place est `['read', 'read_all']` → **routes uniquement**. L'UI mobile parle d'« itinéraires Strava » à l'utilisateur, jamais d'« activités ». Voir Dev Notes §« Routes ≠ Activités ».

## Story

As a **utilisateur ayant connecté Strava**,
I want **importer un itinéraire (route) Strava directement comme segment de mon aventure**,
So that **je n'ai pas à exporter/importer manuellement un fichier GPX**.

## Acceptance Criteria

1. **Given** un compte Strava connecté (ligne `account` provider `strava`)
   **When** j'ouvre l'import Strava depuis l'écran détail d'une aventure
   **Then** mes itinéraires (routes) Strava récents sont listés (nom + distance + D+) — chargés en **lazy** (`useQuery`, déclenché à l'ouverture seulement), avec **pagination** par page, le **cache liste TTL 1h étant côté serveur** (Redis, NFR-041 — **ne pas le réimplémenter**, juste le consommer + miroir `staleTime: 1h` côté client). (FR-016)

2. **Given** la liste d'itinéraires affichée
   **When** je sélectionne un itinéraire à importer
   **Then** il est importé **comme segment de l'aventure** : l'API crée le segment avec `parseStatus: 'pending'` + enqueue le parse GPX ; côté mobile la mutation **invalide** `['adventures', adventureId, 'segments']`, la sheet se ferme, un toast/feedback « Import en cours — analyse du tracé » s'affiche, et le **polling de parse status (MOB-3.2)** prend le relais (badge `pending → processing → done/error`). (FR-016)

3. **Given** des données d'itinéraire Strava affichées (liste d'import **et** segment importé `source === 'strava'`)
   **When** elles sont visibles
   **Then** l'attribution **« Powered by Strava »** (logo officiel + texte intégré, orange `#FC5200`, **variante claire/blanche sur surface sombre** via le thème) est affichée. (FR-063)

4. **Given** un utilisateur **sans** compte Strava connecté
   **When** il ouvre l'import Strava
   **Then** aucun appel `listStravaRoutes` n'est déclenché ; un état explicite **« Connecte ton compte Strava dans les paramètres »** est affiché avec un CTA qui renvoie vers le flow de connexion (settings / MOB-2.4). Aucune liste, aucun token partiel.

5. **Given** une erreur API à l'import ou au listing (réseau, `429` rate-limit Strava, `502` Strava down, `404` token absent)
   **When** elle survient
   **Then** un `<ErrorBanner />` i18n est affiché (jamais `Alert.alert`), l'état reste cohérent (pas de segment fantôme), et le message **429** affiche le libellé serveur « réessaie dans quelques minutes / demain » mappé en i18n.

6. **Given** un formulaire/liste d'import en cours de requête
   **When** une mutation d'import est `pending`
   **Then** le bouton « Importer » de la ligne concernée est désactivé + indicateur (double-submit impossible), et **toutes** les chaînes passent par `t()` (zéro chaîne en dur).

## Tasks / Subtasks

- [x] **T1 — Hook `use-strava.ts` (liste routes + import)** (AC: 1, 2, 5, 6)
  - [x] Créer `apps/mobile/src/hooks/use-strava.ts` exposant :
    - `useStravaRoutes(page = 1, { enabled })` → `useQuery`
      - **queryKey stable** : `['strava', 'routes', { page }]`
      - `queryFn` : `apiFetch<StravaRouteItem[]>(\`/strava/routes?page=${page}\`)`
      - `enabled` : passé par l'appelant = `stravaConnected === true` **ET** sheet ouverte (lazy — pas de fetch tant que la sheet est fermée / pas connecté)
      - `staleTime: 1000 * 60 * 60` (**1h — miroir du TTL Redis serveur**, AC1), `retry: 1` (un rate-limit `429` ne doit pas spammer Strava)
    - `useImportStravaRoute(adventureId)` → `useMutation`
      - `mutationFn: ({ stravaRouteId }) => apiFetch<AdventureSegmentResponse>(\`/strava/routes/${stravaRouteId}/import\`, { method: 'POST', body: JSON.stringify({ adventureId }) })`
      - `onSuccess` : `queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })` → le polling MOB-3.2 prend le segment `pending` au prochain refetch
      - **NE PAS** invalider `['strava', 'routes', …]` (le cache route-list est indépendant des segments — anti-pattern documenté web 3.5)
  - [x] Définir/importer le type `StravaRouteItem` : `{ id: string; name: string; distanceKm: number; elevationGainM: number | null }`. **Préférer** l'ajouter à `packages/shared` (`src/types/strava.types.ts` + export `src/index.ts`) s'il n'y est pas déjà (le web l'avait défini en local dans `api-client.ts` — le mobile peut le partager). Sinon le déclarer localement dans `use-strava.ts`. ⚠️ `id` est **toujours une string** (les IDs de route Strava dépassent `Number.MAX_SAFE_INTEGER` — le serveur les sérialise déjà en string, ne jamais les caster en `number`).
  - [x] Mapper proprement les erreurs `ApiError` (status `0/NETWORK_ERROR`, `404`, `429`, `502`) vers des clés i18n (voir T5 + Dev Notes §Erreurs).

- [x] **T2 — Sheet / écran d'import `strava-import-sheet.tsx`** (AC: 1, 2, 4, 5, 6)
  - [x] Créer `apps/mobile/src/components/adventure/strava-import-sheet.tsx` (modal/bottom-sheet ; à défaut de lib de sheet, un `<Modal>` RN plein écran ou une route `(app)/adventures/[id]/strava-import.tsx` — **choisir une approche, documenter**). Props :
    ```ts
    interface StravaImportSheetProps {
      adventureId: string
      open: boolean
      onClose: () => void
      stravaConnected: boolean   // dérivé de l'état Strava (voir T4 / Dev Notes §Détection)
    }
    ```
  - [x] **Si `!stravaConnected`** : afficher l'état « non connecté » (texte i18n `strava.import.notConnected.*`) + `<Button>` CTA « Connecter Strava » qui navigue vers le flow de connexion (`router.push('/(app)/settings')` — écran settings de MOB-2.4 ; si l'écran settings n'existe pas encore, router vers la route de settings prévue et **documenter la dépendance**). **NE PAS** monter `useStravaRoutes` (ou le monter avec `enabled: false`).
  - [x] **Si `stravaConnected`** : monter `useStravaRoutes(page, { enabled: open })`.
    - **Loading** : 3 `<Skeleton>` (composant `components/ui/skeleton.tsx`, MOB-1.3) — pattern « Loading states » archi.
    - **Liste** : une ligne par route via `<StravaActivityRow>` (T3). Lazy/pagination : bouton « Charger plus » qui incrémente `page` (l'API renvoie ≤ 30 routes/page ; si la page renvoie < 30 → plus de pages, masquer le bouton). **Concaténer** les pages côté composant (ou utiliser `useInfiniteQuery` — voir Dev Notes §Pagination : l'API supporte `?page=N` mais **pas** de curseur, donc page-based).
    - **Vide** : message i18n « Aucun itinéraire Strava trouvé ».
    - **Erreur** : `<ErrorBanner message={…} />` (jamais `Alert.alert`).
  - [x] **Attribution** : afficher `<StravaAttribution />` (T6) **en bas de la sheet** dès que des données Strava sont visibles (liste affichée) — AC3 / FR-063.
  - [x] `onClose` après import réussi (la mutation `onSuccess` ferme la sheet + déclenche le feedback).

- [x] **T3 — Ligne d'itinéraire `strava-activity-row.tsx`** (AC: 2, 6)
  - [x] Créer `apps/mobile/src/components/adventure/strava-activity-row.tsx`. Props : `{ route: StravaRouteItem; onImport: () => void; importing: boolean; disabled: boolean }`.
  - [x] Affiche : `route.name`, distance (`route.distanceKm` → `XX,X km`, formatter i18n FR virgule décimale), D+ si `elevationGainM != null` (`+NNN m`).
  - [x] `<Button size="sm">` « Importer » → `onImport()`. Quand `importing` (cette ligne) : `loading`/désactivé + `ActivityIndicator` (AC6) ; quand `disabled` (autre import en cours) : grisé.
  - [x] `accessibilityRole`/`accessibilityLabel` (nom + distance) ; cible tactile ≥ 44px.

- [x] **T4 — Détection « Strava connecté » + intégration écran détail aventure** (AC: 1, 4)
  - [x] Détecter l'état connecté **sans** appel Strava (économise le rate-limit). Ordre de préférence :
    1. **Réutiliser** la query d'état Strava de **MOB-2.4** (ex. `hooks/use-strava-connection.ts` → `['strava', 'connection']` ou `['me']`/`['profile']` exposant `stravaConnected`/`stravaAthleteId`). **Si MOB-2.4 a livré ce hook → l'importer, ne pas dupliquer.**
    2. À défaut : `authClient.listAccounts()` (Better Auth) filtré sur `providerId === 'strava'`.
    3. Fallback **dégradé** : ouvrir la sheet en `stravaConnected = true` optimiste, et si `listStravaRoutes` renvoie `404` (`ApiError.status === 404`, message « Compte Strava non connecté »), basculer sur l'état « non connecté » (l'API **throw** `NotFoundException` quand aucun token — voir Dev Notes). **Documenter** l'approche retenue.
  - [x] Dans l'écran détail aventure (`(app)/adventures/[id].tsx` de **MOB-3.1**, à côté du bouton « Ajouter un segment » de MOB-3.2) : ajouter un bouton « Importer depuis Strava » (i18n) qui ouvre la sheet (`open` state local). Passer `adventureId` + `stravaConnected` à `<StravaImportSheet>`.
  - [x] ⚠️ Si MOB-3.1/3.2 ne sont **pas encore mergés** au moment du dev : créer le hook + la sheet + la row + l'attribution de façon **autonome et testée en isolation** ; le **point d'accroche** (bouton dans l'écran détail) est ajouté quand l'écran existe — documenter cette dépendance dans les Completion Notes.

- [x] **T5 — i18n** (AC: 1–6)
  - [x] Ajouter le namespace `strava.*` dans `locales/fr.json` **et** `en.json` (zéro chaîne en dur). Clés (voir Dev Notes §Clés i18n) :
    `strava.import.openButton`, `strava.import.title`, `strava.import.loadMore`, `strava.import.empty`, `strava.import.importButton`, `strava.import.importing`, `strava.import.successToast`, `strava.import.notConnected.title`, `strava.import.notConnected.message`, `strava.import.notConnected.cta`, `strava.attribution.poweredBy`, `strava.errors.rateLimit15`, `strava.errors.rateLimitDaily`, `strava.errors.stravaDown`, `strava.errors.notConnected`, `strava.errors.generic`.
  - [x] Réutiliser les clés d'erreur génériques existantes (`*.errors.network`, `*.errors.serverError`) où pertinent ; ne dupliquer que le spécifique Strava.

- [x] **T6 — Composant attribution `strava-attribution.tsx`** (AC: 3 / FR-063)
  - [x] Créer `apps/mobile/src/components/shared/strava-attribution.tsx` (réutilisable : sheet d'import **et** segment importé). Rend le badge officiel **« Powered by Strava »** (logo + texte).
  - [x] **Conformité Brand Guidelines** (cf. story web 16-32) : logo officiel, **marque orange `#FC5200` inchangée**, **variante claire/blanche sur surface sombre** (piloter via `useColorScheme`/thème — `components/hooks/use-color-scheme.ts` existe). Hauteur ~16–20px (parité `h-4`/`h-5` web). **Ne pas** réécrire le texte à la main si on embarque l'asset SVG officiel intégré ; si rendu RN « maison » (View+Text) faute d'asset SVG natif sans prebuild — comme `GoogleMark` —, respecter texte « Powered by Strava » + couleur `#FC5200` (style **inline** autorisé : couleur de marque runtime, exception NativeWind documentée archi).
  - [x] Prop `variant?: 'light' | 'dark' | 'auto'` (auto = via thème). `accessibilityRole="image"` + `accessibilityLabel="Powered by Strava"`.
  - [x] **Brancher** le badge sur le segment card de MOB-3.2 quand `segment.source === 'strava'` (parité web 3.5 Task 6 / 16-32 AC5). Si le segment card MOB-3.2 n'est pas dispo → documenter le point d'accroche et le déférer dans les Completion Notes.

- [x] **T7 — Tests (RNTL + Jest, co-localisés)** (AC: tous)
  - [x] `components/adventure/strava-import-sheet.test.tsx` :
    - `stravaConnected = false` → affiche l'état « non connecté » + CTA, **n'appelle pas** `apiFetch('/strava/routes…')`.
    - `stravaConnected = true` + loading → skeletons.
    - routes chargées → rend N lignes + boutons « Importer » + `<StravaAttribution>` visible.
    - clic « Importer » → appelle `POST /strava/routes/:id/import` avec `{ adventureId }` (mock `apiFetch`), ferme la sheet, déclenche le feedback succès.
    - erreur `429` → `<ErrorBanner>` avec le message rate-limit i18n ; état non connecté préservé sur `404`.
    - bouton « Importer » désactivé pendant `pending` (anti-double-submit, AC6).
  - [x] `components/adventure/strava-activity-row.test.tsx` : rendu nom/distance/D+, `importing` → loading, `disabled` → grisé.
  - [x] `components/shared/strava-attribution.test.tsx` : rendu texte « Powered by Strava », variante claire vs sombre (mock `useColorScheme`).
  - [x] `hooks/use-strava.test.tsx` (optionnel mais recommandé) : queryKey `['strava','routes',{page}]`, `enabled` lazy, mutation `onSuccess` invalide `['adventures', id, 'segments']` et **pas** `['strava','routes']`.
  - [x] Mock `@/lib/api/api-client` (`apiFetch`), `@/lib/auth/client` (si `listAccounts`), `expo-router`. **`userEvent`** (pas `fireEvent`) pour awaiter les updates async (gotcha RNTL v14 + React 19, cf. MOB-2.2). Tests **co-localisés** (jamais sous `src/app/` — gotcha `require.context`, cf. AGENTS.md).
  - [x] `pnpm --filter @ridenrest/mobile test|typecheck|lint` **verts**.

- [ ] **T8 — Validation manuelle device** (AC: tous) **[MANUEL — Guillaume]**
  - [ ] Strava connecté (MOB-2.4) → écran détail aventure → « Importer depuis Strava » → liste des routes → « Importer » → sheet se ferme, segment apparaît `pending` puis `done` (polling MOB-3.2), badge « Powered by Strava » sur le segment.
  - [ ] Strava **non** connecté → état « connecte ton compte » + CTA vers settings.
  - [ ] Couper le réseau / forcer un `429` → `<ErrorBanner>` clair, pas de segment fantôme.

### Review Findings

- [x] [Review][Patch] Empêcher la fermeture/reset pendant un import Strava en cours [apps/mobile/src/components/adventure/strava-import-sheet.tsx:89]
- [x] [Review][Patch] Afficher le feedback `strava.import.successToast` après import réussi [apps/mobile/src/components/adventure/strava-import-sheet.tsx:107]
- [x] [Review][Patch] Afficher l'attribution Strava dans le rendu réellement utilisé des segments [apps/mobile/src/components/adventure/segment-list.tsx:196]
- [x] [Review][Patch] Garder un chemin retry/chargement visible quand une page Strava suivante échoue [apps/mobile/src/components/adventure/strava-import-sheet.tsx:122]
- [x] [Review][Patch] Distinguer les 404 d'import aventure des 404 Strava non connecté [apps/mobile/src/hooks/use-strava.ts:64]
- [x] [Review][Patch] Rendre les boutons d'import distinguables au lecteur d'écran [apps/mobile/src/components/adventure/strava-activity-row.tsx:70]

## Dev Notes

### 🚨 Routes ≠ Activités (contrat réel livré — ne pas dévier)

| | Strava **Routes** ✅ (cette story) | Strava **Activités** ❌ |
|---|---|---|
| ToS Strava | Autorisé | Restreint |
| Scope OAuth | `read_all` (déjà en place, MOB-2.4) | `activity:read_all` (**non** demandé) |
| Endpoint liste | `GET /api/v3/athletes/{id}/routes` | `GET /api/v3/athlete/activities` |
| Export GPX | `GET /api/v3/routes/{id}/export_gpx` | conversion de stream manuelle |

Les **routes** sont des itinéraires **planifiés** par l'utilisateur sur Strava (typiquement un parcours bikepacking/ultra). C'est précisément le cas d'usage. **Ne jamais** demander `activity:read_all`. L'UI mobile dit « itinéraires Strava » à l'utilisateur (les noms de fichiers `strava-activity-row` restent par cohérence avec l'intitulé de l'epic, mais le **libellé affiché** parle d'itinéraires).

### Contrats API Strava RÉELS (NestJS — déjà livré, story web 3.5 `done`)

Source vérifiée : `apps/api/src/strava/strava.controller.ts`, `strava.service.ts`, `dto/import-route.dto.ts`. **Le `JwtAuthGuard` global protège ces routes** → `apiFetch` injecte déjà le Bearer JWT (MOB-2.1).

**1) Lister les routes Strava (cache serveur 1h)**
```
GET /strava/routes?page=1
Auth: Bearer <JWT app>     (via apiFetch)
→ 200  { data: StravaRouteItem[] }     (enveloppe ResponseInterceptor déballée par apiFetch)
        StravaRouteItem = { id: string, name: string, distanceKm: number, elevationGainM: number | null }
→ 404  { error: { message: "Compte Strava non connecté. Va dans les paramètres pour connecter Strava." } }  (aucun token Strava)
→ 429  { error: { message: "Réessaie dans quelques minutes (limite Strava 15min atteinte)" } }  (≥100 req/15min)
→ 429  { error: { message: "Limite Strava atteinte pour aujourd'hui, réessaie demain" } }  (≥1000 req/jour)
→ 502  { error: { message: "Erreur Strava API" } }  (Strava down)
```
- **Pagination** : query param `page` (entier ≥ 1, défaut 1). Le serveur appelle Strava avec `per_page=30&page=N` → **≤ 30 routes par page**, page-based (**pas** de curseur). Si une page renvoie < 30 items → dernière page.
- **Cache** : Redis `strava:routes:v2:{userId}:page:{N}`, **TTL 3600s (1h)**, **côté serveur uniquement** (NFR-041, rate-limit Strava). Le mobile **miroir** ce TTL avec `staleTime: 1h` (évite des refetch inutiles), mais **ne réimplémente aucun cache** — TanStack Query suffit.
- ⚠️ `id` est une **string** (route IDs Strava > `MAX_SAFE_INTEGER` ; le serveur fait un remplacement regex `"id":<num>` → `"id":"<num>"` avant `JSON.parse`). Côté mobile : **toujours** typer `id: string`, jamais `Number(id)`.

**2) Importer une route comme segment**
```
POST /strava/routes/:stravaRouteId/import
Auth: Bearer <JWT app>
Body: { "adventureId": "<uuid v4>" }        (ImportRouteDto — @IsUUID('4'))
→ 200  { data: AdventureSegmentResponse }
        avec parseStatus: 'pending', source: 'strava'
→ 404  adventure non possédée (verifyOwnership) / token Strava absent
→ 429  rate-limit (mêmes libellés que ci-dessus)
→ 502  "Erreur récupération GPX Strava (<status>)"
```
- Le serveur : `verifyOwnership(adventureId, userId)` → fetch `GET /routes/{id}/export_gpx` → buffer GPX → **réutilise `SegmentsService.createSegment(adventureId, userId, fakeFile, routeName, 'strava')`** → segment `parseStatus: 'pending'` + job BullMQ `parse-segment` enqueue. **Aucune donnée Strava persistée** au-delà du GPX + record segment (NFR-043).
- Le nom du segment = nom de la route Strava (lu depuis le cache `page:1`, fallback `Route Strava {id}`).
- **Le refresh du token Strava est géré par NestJS** (`account.refreshToken`), le mobile n'y touche jamais.

> **Le contrat est identique à celui consommé par le web 3.5** — seul le préfixe diffère : web `apiFetch('/api/strava/routes')` (rewrite Next) vs mobile `apiFetch('/strava/routes')` (l'`api-client` mobile pointe `EXPO_PUBLIC_API_URL` **sans** préfixe `/api`). **Vérifier** le préfixe réel attendu : l'`apiFetch` mobile fait `\`${API_URL}${path}\`` — passer `path = '/strava/routes'` (l'API NestJS expose `@Controller('strava')`, donc `/strava/...` sans `/api` si pas de `setGlobalPrefix('api')`). ⚠️ **Confirmer le global prefix de l'API** (regarder `apps/api/src/main.ts` : `app.setGlobalPrefix('api')` ?) et aligner le `path` en conséquence — c'est le **piège n°1**.

### Détection « Strava connecté » (comment l'app le sait)

Le token Strava vit dans la table `account` (Better Auth) : `providerId = 'strava'`, `accountId = athleteId`, `accessToken/refreshToken/accessTokenExpiresAt`. **Le mobile n'accède pas directement à la DB** — il détecte la connexion via :
- **(préféré)** le hook/query d'état Strava livré par **MOB-2.4** (`use-strava-connection.ts` ou équivalent lisant `stravaConnected`/`stravaAthleteId` via `apiFetch` sur l'endpoint « me »/profil, ou `authClient.listAccounts()`). **Réutiliser, ne pas dupliquer.**
- **(fallback)** `authClient.listAccounts()` filtré `providerId === 'strava'`.
- **(dégradé)** laisser l'API trancher : `GET /strava/routes` renvoie **`404`** (`NotFoundException` « Compte Strava non connecté ») si aucun token → on bascule la sheet sur l'état « non connecté ». Robuste mais **consomme une requête** (acceptable car le 404 court-circuite avant l'appel Strava réel, donc pas d'impact rate-limit).

> ⚠️ MOB-2.4 est encore `ready-for-dev` (non `done`) au moment d'écrire cette story. **Vérifier au dev** ce que MOB-2.4 a réellement exposé (nom du hook, query key, écran settings) et s'y brancher ; à défaut, partir sur le fallback `listAccounts()` + dégradé `404`. **Documenter le choix.**

### Pagination / lazy loading (AC1)

- L'API est **page-based** (`?page=N`, 30 max/page), **pas** curseur → deux options mobiles :
  1. **`useQuery` + state `page`** : un bouton « Charger plus » incrémente `page`, le composant **concatène** les résultats (simple, suffisant pour le MVP — peu de routes en général).
  2. **`useInfiniteQuery`** : `getNextPageParam: (last, all) => last.length === 30 ? all.length + 1 : undefined`. Plus idiomatique pour la pagination infinie. queryKey `['strava','routes']` avec pages internes.
- **Lazy** = la query ne se déclenche **qu'à l'ouverture** de la sheet et **uniquement si connecté** (`enabled: open && stravaConnected`). Pas de prefetch au montage de l'écran détail.
- queryKey **stable** proposée : `['strava', 'routes', { page }]` (option 1) ou `['strava', 'routes']` (option 2 infinite). Cohérent avec les conventions web (`['strava','routes']`) et mobile (`['adventures', id, 'segments']`).

### Réutilisation du polling parse (MOB-3.2)

L'import **ne fait pas** de polling propre. Il **délègue** :
1. `onSuccess` de la mutation → `invalidateQueries(['adventures', adventureId, 'segments'])`.
2. Le hook `use-segments` (MOB-3.2) refetch la liste → le nouveau segment apparaît `parseStatus: 'pending'`.
3. Le **polling de MOB-3.2** (refetch tant qu'un segment est `pending`/`processing`) fait évoluer le badge `pending → processing → done | error`.
→ **Ne pas** créer de second mécanisme de polling. Si MOB-3.2 n'est pas mergé, l'invalidation reste correcte ; le polling sera branché par MOB-3.2.

### Attribution « Powered by Strava » (FR-063 — cf. story web 16-32, `review`)

- **Asset/branding** : logo officiel + texte « Powered by Strava » (le SVG officiel web `powered-by-strava.svg` **contient déjà le texte** — ne pas ré-ajouter de texte si on embarque ce SVG). Marque **orange `#FC5200`** (et **non** l'ancien `#FC4C02` du logo maison supprimé). **Variante claire/blanche sur surface sombre** (16-32 : variante blanche requise sur fonds sombres) → piloter via thème (`use-color-scheme`).
- **RN sans prebuild** : si on ne veut pas ajouter de dépendance SVG native (`react-native-svg` → prebuild), rendre le badge en `View`+`Text` (style **inline** pour `#FC5200`, exception « couleur runtime » tolérée par l'archi, comme `GoogleMark`). Sinon embarquer le SVG officiel via un loader RN. **Documenter le choix.**
- **Où l'afficher** (AC3) : (a) **bas de la sheet d'import** dès que la liste Strava est visible ; (b) **segment card** (MOB-3.2) quand `segment.source === 'strava'`. Si aucune donnée Strava visible → **aucun** badge (16-32 AC4).

### Détection connexion — résumé décisionnel

| Source | Coût | Quand l'utiliser |
|---|---|---|
| Hook MOB-2.4 (`stravaConnected`) | 0 (déjà chargé) | **Par défaut si livré** |
| `authClient.listAccounts()` | 1 appel auth | Si MOB-2.4 n'expose pas de hook |
| `404` sur `/strava/routes` | 1 appel API (court-circuité serveur) | Fallback dégradé / robustesse |

### Standards mobile (rappels)

- `apiFetch` **natif** (jamais `axios`/`ky`) ; format `{ data }` déballé, `{ error }` typé via `ApiError` ; `status: 0` + `code: 'NETWORK_ERROR'` = réseau coupé. Dates ISO, **camelCase**. (`lib/api/api-client.ts`, MOB-2.1)
- Types partagés depuis `@ridenrest/shared` (jamais sous-chemin `/types`). `AdventureSegmentResponse` y est déjà (avec `parseStatus`, `source`).
- **NativeWind** (`className`), `cn()` pour les conditionnels ; style inline **uniquement** pour couleur de marque runtime (`#FC5200`). Primitifs `components/ui/*` (Button avec `loading`, Skeleton, ErrorBanner — MOB-1.3/2.2).
- Erreurs réseau → `<ErrorBanner />` inline, **jamais** `Alert.alert` (archi « Loading states & errors »).
- i18n **externalisé** (`t()`), FR défaut + EN ; tests **co-localisés** Jest + RNTL (jamais sous `src/app/` — `require.context`), `userEvent` pour l'async.
- `staleTime` par défaut du `queryClient` = 30s ; **surcharger** à 1h pour la liste Strava (miroir TTL serveur).

### Clés i18n (proposition — à ajouter `fr.json` + `en.json`)

```jsonc
"strava": {
  "import": {
    "openButton": "Importer depuis Strava",          // EN: "Import from Strava"
    "title": "Itinéraires Strava",                   // EN: "Strava routes"
    "loadMore": "Charger plus",                       // EN: "Load more"
    "empty": "Aucun itinéraire Strava trouvé.",       // EN: "No Strava routes found."
    "importButton": "Importer",                       // EN: "Import"
    "importing": "Import…",                            // EN: "Importing…"
    "successToast": "Import en cours — analyse du tracé", // EN: "Import started — analysing route"
    "notConnected": {
      "title": "Strava non connecté",
      "message": "Connecte ton compte Strava dans les paramètres pour importer tes itinéraires.",
      "cta": "Connecter Strava"
    }
  },
  "attribution": { "poweredBy": "Powered by Strava" },  // ne PAS traduire la marque
  "errors": {
    "rateLimit15": "Réessaie dans quelques minutes (limite Strava atteinte).",
    "rateLimitDaily": "Limite Strava atteinte pour aujourd'hui, réessaie demain.",
    "stravaDown": "Strava est momentanément indisponible. Réessaie.",
    "notConnected": "Compte Strava non connecté.",
    "generic": "L'import Strava a échoué. Réessaie."
  }
}
```
Mapping `ApiError → clé` : `429` → discriminer via le message serveur (« demain » → `rateLimitDaily`, sinon `rateLimit15`) ou par défaut `rateLimit15` ; `404` → `notConnected` (bascule état) ; `502` → `stravaDown` ; `status 0/NETWORK_ERROR` → clé réseau générique existante ; autres → `generic`.

### Fichiers à créer / toucher

**Créés**
```
apps/mobile/src/hooks/use-strava.ts
apps/mobile/src/hooks/use-strava.test.tsx                      (optionnel mais recommandé)
apps/mobile/src/components/adventure/strava-import-sheet.tsx
apps/mobile/src/components/adventure/strava-import-sheet.test.tsx
apps/mobile/src/components/adventure/strava-activity-row.tsx
apps/mobile/src/components/adventure/strava-activity-row.test.tsx
apps/mobile/src/components/shared/strava-attribution.tsx
apps/mobile/src/components/shared/strava-attribution.test.tsx
packages/shared/src/types/strava.types.ts                     (si StravaRouteItem pas déjà partagé)
```
**Modifiés**
```
apps/mobile/src/app/(app)/adventures/[id].tsx                 (bouton « Importer depuis Strava » + sheet — dépend MOB-3.1/3.2)
apps/mobile/src/components/adventure/segment-card.tsx (MOB-3.2) (badge <StravaAttribution> si source==='strava')
apps/mobile/src/lib/i18n/locales/fr.json                      (namespace strava.*)
apps/mobile/src/lib/i18n/locales/en.json                      (namespace strava.*)
packages/shared/src/index.ts                                  (export strava.types si créé)
_bmad-output/implementation-artifacts/sprint-status.yaml      (statut MOB-3-4 — par le workflow dev, PAS dans cette story de contexte)
```
**NON touchés (déjà livrés)** : tout `apps/api/src/strava/*`, `apps/api/src/segments/*`, schéma `adventure_segments` (`source` déjà en place), `packages/shared/src/types/adventure.types.ts` (`source`/`parseStatus` déjà présents).

### Anti-patterns à éviter

```ts
// ❌ Importer « les activités » Strava / demander activity:read_all
apiFetch('/strava/activities')                       // n'existe pas
// ✅ Routes uniquement
apiFetch('/strava/routes?page=1')

// ❌ Caster l'id Strava en number (overflow > MAX_SAFE_INTEGER)
const id = Number(route.id)
// ✅ string partout
const id: string = route.id

// ❌ Réimplémenter un cache 1h côté mobile
// (le TTL 1h est serveur/Redis) ✅ staleTime: 1h sur le useQuery suffit

// ❌ Invalider la liste de routes après import
queryClient.invalidateQueries({ queryKey: ['strava','routes'] })
// ✅ Invalider les segments de l'aventure (le polling MOB-3.2 prend le relais)
queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })

// ❌ Alert.alert sur erreur
Alert.alert('Erreur', '...')
// ✅ <ErrorBanner message={t('strava.errors.*')} />

// ❌ Fetch des routes au montage de l'écran détail (gaspille le rate-limit)
useStravaRoutes()                                    // toujours enabled
// ✅ Lazy : enabled seulement quand la sheet est ouverte ET connecté
useStravaRoutes(page, { enabled: open && stravaConnected })

// ❌ Re-créer un polling de parse status
// ✅ Déléguer à use-segments (MOB-3.2) via invalidation

// ❌ Texte « Powered by Strava » traduit / couleur #FC4C02
// ✅ Marque inchangée, #FC5200, variante claire sur fond sombre
```

### Project Structure Notes

- `apps/mobile/src/` : layout Expo Router. Routes sous `src/app/(app)/...` (protégées par le guard `(app)/_layout.tsx`, MOB-2.1). Hooks sous `src/hooks/`, composants métier sous `src/components/adventure/`, partagés sous `src/components/shared/`, primitifs sous `src/components/ui/`.
- **Tests co-localisés** sauf ceux qui **importent une route** (`src/app/**`) → ceux-là vont sous `src/__tests__/` (gotcha `require.context`, AGENTS.md). Les composants/hook de cette story ne sont **pas** des routes → tests co-localisés à côté du fichier.
- Aucune migration DB. Aucun code serveur. Le `source: text('source')` sur `adventure_segments` et `StravaRouteItem`/contrats API sont **déjà** livrés (web 3.5 `done`).
- **Dépendances de séquencement** : si MOB-3.1/3.2 ne sont pas mergés, livrer hook + sheet + row + attribution **isolés et testés** ; brancher le bouton dans l'écran détail + le badge dans le segment card dès que ces écrans existent (documenter dans Completion Notes).

### Frontière de story

- **Inclus** : hook `use-strava` (liste routes paginée/lazy + import), sheet/écran d'import, ligne d'itinéraire, attribution « Powered by Strava », détection connexion + état « non connecté » + CTA, gestion erreurs/rate-limit i18n, invalidation segments (délègue le polling à MOB-3.2), i18n FR/EN, tests RNTL.
- **Exclu** : connexion/déconnexion Strava OAuth → **MOB-2.4** ; CRUD aventures → **MOB-3.1** ; liste segments + polling parse + segment-status badge → **MOB-3.2** ; tout code serveur (déjà livré web 3.5) ; refresh token Strava (NestJS) ; import d'**activités** (hors scope ToS) ; feature flag `STRAVA_ENABLED` (web 16-32/17-11 — non requis par les AC mobiles, à confirmer si un grisage mobile est attendu).

### Testing standards

- RNTL + Jest, **co-localisés**, `userEvent` (async RHF/Query, gotcha RNTL v14 + React 19, cf. MOB-2.2 Debug Log). Mock `@/lib/api/api-client` (`apiFetch`), `@/lib/auth/client` (si `listAccounts`), `expo-router`. **Aucun réseau réel.** Dans une factory `jest.mock`, **pas** de JSX RN (transform NativeWind injecte une variable hors-scope — cf. AGENTS.md) → `jest.fn(() => null)` + assertions sur appels/props.
- Couvrir : non connecté (pas d'appel routes) · loading skeletons · liste + attribution · import OK (invalide segments, ferme sheet) · `429`/`404`/`502`/réseau → ErrorBanner i18n · anti-double-submit.
- `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts (+ `expo export` iOS si touche aux routes — gotcha bundling tests).
- Validation manuelle device (T8) : flow complet connecté + non connecté + erreur réseau.

### References

- [Source: apps/api/src/strava/strava.controller.ts] — `GET /strava/routes?page`, `POST /strava/routes/:stravaRouteId/import` (body `{ adventureId }`), JwtAuthGuard global
- [Source: apps/api/src/strava/strava.service.ts:31-117] — `listRoutes` (cache Redis 1h `strava:routes:v2:{userId}:page:{N}`, `per_page=30`, id string), `importRoute` (verifyOwnership → export_gpx → `createSegment(..., 'strava')` → `parseStatus: 'pending'`), rate-limit 100/15min + 1000/jour, libellés FR
- [Source: apps/api/src/strava/dto/import-route.dto.ts] — `ImportRouteDto { adventureId: @IsUUID('4') }`
- [Source: apps/api/src/segments/segments.controller.ts] — `@Controller('adventures/:adventureId/segments')` (liste segments pour le polling MOB-3.2)
- [Source: packages/shared/src/types/adventure.types.ts:7,92-106] — `ParseStatus`, `AdventureSegmentResponse` (`parseStatus`, `source`)
- [Source: _bmad-output/implementation-artifacts/3-5-strava-activity-import-as-segment.md] — story web équivalente (`done`) : liste routes + import + lazy + cache + `StravaRouteItem`, « Routes NOT Activities », queryKey `['strava','routes']`, invalidation `['adventures', id, 'segments']`, anti-patterns
- [Source: _bmad-output/implementation-artifacts/16-32-strava-attribution-badge.md] — règles attribution « Powered by Strava » : assets officiels, marque `#FC5200`, variante blanche sur fond sombre, badge sur segment card (`source==='strava'`), aucun badge si pas de donnée Strava
- [Source: _bmad-output/implementation-artifacts/MOB-2-4-strava-oauth-deeplink.md] — Strava connecté = ligne `account` provider `strava` ; détection via query « me »/`listAccounts` ; écran settings ; account-linking ≠ sign-in
- [Source: _bmad-output/implementation-artifacts/MOB-2-2-email-signup-login-password-reset.md] — modèle de format story mobile ; gotchas tests (`userEvent`, co-localisation, `typedRoutes`) ; primitifs `Button`/`ErrorBanner`/`Skeleton`
- [Source: apps/mobile/src/lib/api/api-client.ts] — `apiFetch`, `ApiError` (`status`/`code`/`NETWORK_ERROR`), déballage `{ data }`, 401→refresh→retry
- [Source: apps/mobile/src/lib/query/query-client.ts] — `staleTime` 30s défaut, `retry: 2` ; conventions query keys
- [Source: apps/mobile/src/components/shared/google-sign-in-button.tsx] — pattern bouton tiers RN (loading, ErrorBanner, marque décorative inline, a11y)
- [Source: apps/mobile/AGENTS.md] — tests jamais sous `src/app/` (`require.context`), mocks Jest sans JSX, prebuild si module natif
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md] — API & Communication (~l.382), Loading states & errors (~l.711), Auth & Security / Strava OAuth (~l.360), attribution FR-063 (`#FC5200`, variante blanche)

## Dev Agent Record

### Agent Model Used

Opus 4.8 (claude-opus-4-8) — subagent dev-story.

### Debug Log References

- **`StravaRouteItem` non partagé** : `grep -r StravaRouteItem packages/shared/src` → absent. Déclaré **localement** dans `use-strava.ts` (périmètre mobile, pas de modif de `@ridenrest/shared`), conformément à l'option de repli de la story (T1). `id: string` partout, jamais `Number(id)`.
- **Tests `use-strava.test.tsx`** : `renderHook` (RNTL v14 + React 19) pose `result.current` de façon non fiable au 2ᵉ render → adoption du **composant-sonde** `mountHook` (pattern `use-adventures.test.ts`).
- **Sheet test — `useSafeAreaInsets`** : sans `<SafeAreaProvider>` la sheet throw « No safe area value » → wrap avec `SafeAreaProvider initialMetrics`. **`<Modal>`** : `presentationStyle="pageSheet"` cassait le rendu sous jest-expo → retiré (Modal `animationType="slide"` simple, parité `RenameSegmentModal`). **`await render`** obligatoire (flush async query/i18n) sinon `screen` vide (« render function has not been called »). **`retry: 1`** du hook + backoff → erreurs hors timeout `findBy` → `retryDelay: 0` sur le QueryClient de test.
- **`PoweredByStrava` en test** : lit `useColorScheme` (wrapper) dont l'effet appelle `setColorScheme` NativeWind → throw sans `darkMode: class`. Mock du **wrapper** `@/hooks/use-color-scheme` (valeur statique) → le vrai badge officiel (SvgXml + `accessibilityLabel="Powered by Strava"`) est exercé. Factory sans JSX/RN (gotcha AGENTS.md).
- **Régression test existant** `src/__tests__/adventure-detail.test.tsx` : l'ajout de `useStravaConnection` dans `[id].tsx` tire `@/lib/auth/client` → `@better-auth/expo` (ESM non transpilé) → suite cassée. Corrigé en mockant `@/hooks/use-strava-connection` + `@/lib/api/api-client` dans ce test.
- **Lint `set-state-in-effect`** : la concaténation des pages via `useEffect`+`setState` était flaguée → refactor en **dérivation pure** (`useMemo` relisant les pages 1..N du cache TanStack via `queryClient.getQueryData(stravaRoutesKey(p))`), zéro setState hors handlers.

### Completion Notes List

- **Réutilisation (pas de duplication)** :
  - **Détection « Strava connecté »** → hook existant `useStravaConnection()` (MOB-2.4, query key `['strava-connection']`, via `authClient.listAccounts()`). `isConnected` pilote la sheet. Aucune détection nouvelle (option 1 préférée de T4).
  - **Attribution** → composant existant `PoweredByStrava` (`components/shared/powered-by-strava.tsx`, SvgXml officiel, variante noire/blanche auto via `useColorScheme`, `accessibilityLabel="Powered by Strava"`). **T6 considéré satisfait** par ce composant ; `strava-attribution.tsx` **non créé** (et `strava-attribution.test.tsx` non créé — le badge est déjà couvert par MOB-3.1). Branché dans `segment-card` quand `source==='strava'` (AC3/FR-063) **et** en bas de la sheet dès que la liste est visible.
  - **`formatKm`** (`lib/format/distance.ts`, MOB-3.3) réutilisé pour la distance FR (virgule).
- **Chemin CTA settings** : `router.push('/(app)/settings')` — écran `src/app/(app)/settings.tsx` (MOB-2.4) hébergeant `StravaConnectionCard`. Vérifié existant.
- **Type `StravaRouteItem`** déclaré **localement** dans `use-strava.ts` (voir Debug Log) — `packages/shared` non modifié.
- **Pagination** : option 1 (state `page` + « Charger plus »), pages concaténées par **dérivation** depuis le cache (pas `useInfiniteQuery`). Bouton masqué si la page renvoie < 30 items.
- **Polling** : aucun mécanisme propre — l'import invalide `['adventures', id, 'segments']`, le polling MOB-3.2 prend le relais (badge `pending → done/error`).
- **Erreurs** : `mapStravaError` mappe `0/NETWORK_ERROR → strava.errors.network`, `404 → notConnected` (la sheet bascule sur l'état « non connecté », pas de banner), `429 → rateLimit15 | rateLimitDaily` (discriminé sur le message serveur « demain/aujourd'hui »), `502 → stravaDown`, autres → `generic`. Clé réseau placée sous `strava.errors.network` (pas de `common.errors.*` préexistant — ajout minimal hors périmètre évité).
- **i18n** : namespace `strava.*` ajouté FR + EN, **parité vérifiée** (script de diff de clés → 0 écart, 19 clés). Zéro chaîne en dur.
- **T8** (validation device) : **non cochée** — laissée à Guillaume (manuelle).
- **Non touchés** : `app.config.ts`, `babel.config.js`, backend, `packages/shared`.

### File List

**Créés**
- `apps/mobile/src/hooks/use-strava.ts`
- `apps/mobile/src/hooks/use-strava.test.tsx`
- `apps/mobile/src/components/adventure/strava-import-sheet.tsx`
- `apps/mobile/src/components/adventure/strava-import-sheet.test.tsx`
- `apps/mobile/src/components/adventure/strava-activity-row.tsx`
- `apps/mobile/src/components/adventure/strava-activity-row.test.tsx`

**Modifiés**
- `apps/mobile/src/app/(app)/adventures/[id].tsx` (bouton « Importer depuis Strava » + `<StravaImportSheet>` + `useStravaConnection`)
- `apps/mobile/src/components/adventure/segment-card.tsx` (badge `<PoweredByStrava>` si `source==='strava'`)
- `apps/mobile/src/__tests__/adventure-detail.test.tsx` (mocks `use-strava-connection` + `api-client` — régression de l'ajout d'import)
- `apps/mobile/src/lib/i18n/locales/fr.json` (namespace `strava.*`)
- `apps/mobile/src/lib/i18n/locales/en.json` (namespace `strava.*`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MOB-3-4 → review)

**Non créés (déviation documentée)** : `apps/mobile/src/components/shared/strava-attribution.tsx` + test (T6 satisfait par `PoweredByStrava` existant) ; `packages/shared/src/types/strava.types.ts` (`StravaRouteItem` déclaré localement).

### Gates

- `pnpm --filter @ridenrest/mobile typecheck` → vert.
- `pnpm --filter @ridenrest/mobile lint` → vert (0 erreur, 0 warning).
- `pnpm --filter @ridenrest/mobile test` → vert : **27 suites, 153 tests** (dont 27 nouveaux MOB-3.4 : `use-strava` 10, `strava-activity-row` 5, `strava-import-sheet` 12 ; aucun `*.test.tsx` sous `src/app/`).

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-12 | 0.1 | Création story MOB-3.4 (ready-for-dev) — import d'itinéraires (routes) Strava comme segment depuis l'écran détail aventure : hook `use-strava` (liste paginée/lazy + mutation import), sheet d'import, ligne d'itinéraire, attribution « Powered by Strava » (FR-063, variante claire sur fond sombre), détection connexion + état non connecté/CTA, erreurs/rate-limit i18n, délégation du polling parse à MOB-3.2. Contrats API NestJS Strava (web 3.5 `done`) réutilisés tels quels ; aucun code serveur. | bmad-create-story |
| 2026-06-13 | 0.2 | Implémentation T1–T7 (TDD). Hook `use-strava` (routes lazy page-based, `staleTime` 1h, `retry` 1 ; import → invalide segments uniquement ; `mapStravaError`). `StravaImportSheet` (Modal, états non-connecté/loading/liste/vide/erreur, pagination dérivée du cache, attribution). `StravaActivityRow`. Branchement écran détail via `useStravaConnection` (réutilisé MOB-2.4) + badge `PoweredByStrava` (réutilisé) sur `segment-card`. i18n `strava.*` FR/EN parité. 27 tests RNTL/Jest. `StravaRouteItem` local. Gates verts (typecheck/lint/153 tests). T6 satisfait par `PoweredByStrava` existant ; T8 device = manuel. | Opus 4.8 (dev-story) |
