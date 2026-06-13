---
baseline_commit: 07faf46900c6a9326eedb110ac5cb9dda2e48408
---

# Story 3.1: Liste, création, renommage & suppression d'aventures

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur connecté de Ride'n'Rest (cycliste)**,
I want **créer, lister, renommer et supprimer mes aventures depuis l'app mobile**,
So that **je peux organiser mes voyages à vélo directement depuis mon téléphone**.

> **Dépend de MOB-2.1 / MOB-2.2** (client Better Auth, `apiFetch`, secure-store, groupes `(auth)`/`(app)` + guard centralisé, `QueryClient`, primitifs UI `Button`/`Input`/`TextField`/`ErrorBanner`/`Card`/`Skeleton`, i18n FR/EN). **Le backend epic 3 est DÉJÀ livré** (stories web 3.1 → 3.4, `done`) : les endpoints `GET/POST/PATCH/DELETE /adventures` existent et sont stables. Côté mobile, cette story = **client uniquement** : aucune modif serveur, aucune migration DB.
>
> **Frontière** : cette story livre le CRUD « nom » des aventures (liste, créer, renommer, supprimer) + un écran détail **squelette** (nom + actions). Elle **POSE les fondations** réutilisées par MOB-3.2 (upload GPX / segments) et MOB-3.3 (dates, vitesse, profil de routage) : le hook `hooks/use-adventures.ts`, l'écran liste, l'écran détail `[id].tsx`, l'écran `new.tsx`, et le composant `adventure-card.tsx`. **NE PAS** implémenter ici : upload GPX, segments, dates/vitesse/profil, carte, mode live, suppression de compte.

## Acceptance Criteria

1. **Given** l'écran `adventures` (`(app)/adventures/index.tsx`)
   **When** la liste charge ses données
   **Then** un `<Skeleton />` est affiché pendant `isPending` (TanStack Query, query key `['adventures']`), jamais de blocage UI total
   **And** au succès, mes aventures s'affichent dans une liste (nom + distance), chaque carte navigable vers son détail (FR-010)

2. **Given** l'écran `adventures`
   **When** je crée une aventure en saisissant un nom valide (1–100 caractères, non vide après trim)
   **Then** l'aventure est persistée via `POST /adventures` et apparaît dans la liste après invalidation de `['adventures']` (FR-010)
   **And** pendant la requête, le bouton de soumission est en état chargement (désactivé + indicateur), double-submit impossible
   **And** une erreur réseau/serveur s'affiche inline via `<ErrorBanner />` (jamais `Alert.alert`)

3. **Given** une aventure existante
   **When** je la renomme avec un nouveau nom valide
   **Then** le nouveau nom est persisté via `PATCH /adventures/:id` (corps `{ name }`) et affiché immédiatement dans la liste et le détail (FR-017)
   **And** l'update est optimiste : le nom change avant la réponse serveur ; en cas d'erreur, **rollback** vers le nom précédent + `<ErrorBanner />`

4. **Given** une aventure existante
   **When** je déclenche la suppression
   **Then** une **confirmation** est demandée (dialog de confirmation — `Alert.alert` RN à 2 boutons Annuler/Supprimer, **autorisé** ici car c'est une confirmation d'action destructive, **pas** une erreur réseau)
   **And** après confirmation, l'aventure est supprimée via `DELETE /adventures/:id` et retirée de la liste (FR-018)
   **And** l'update est optimiste : la carte disparaît immédiatement ; en cas d'erreur, **rollback** (la carte réapparaît) + `<ErrorBanner />`

5. **Given** aucune aventure (liste vide au succès du fetch)
   **When** j'arrive sur l'écran `adventures`
   **Then** un **état vide explicite** s'affiche (icône/illustration + titre + sous-texte) qui invite à créer la première aventure, avec un CTA « Créer une aventure »

6. **Given** l'échec du fetch de la liste (`isError`)
   **When** l'écran rend
   **Then** un `<ErrorBanner />` est affiché (et **non** l'état vide — distinguer « 0 aventure » de « erreur réseau »), avec possibilité de réessayer (`refetch`)

7. **Given** n'importe quel écran/composant de cette story
   **When** une chaîne est affichée
   **Then** elle est résolue via i18n (`t()`), aucune chaîne en dur (FR + EN)

## Tasks / Subtasks

- [x] **T1 — Fonctions API client adventures** (AC: 1, 2, 3, 4)
  - [x] Créer `apps/mobile/src/lib/api/adventures.ts` (façade typée au-dessus de `apiFetch`, pas d'accès `fetch` direct). Types importés depuis `@ridenrest/shared` (`AdventureResponse`), input depuis `@ridenrest/shared` (`CreateAdventureInput`/`UpdateAdventureInput`) — **jamais** redéfinir localement.
    ```ts
    import { apiFetch } from '@/lib/api/api-client';
    import type { AdventureResponse } from '@ridenrest/shared';

    // GET /adventures → AdventureResponse[] (apiFetch déballe déjà l'enveloppe { data })
    export function listAdventures(): Promise<AdventureResponse[]> {
      return apiFetch<AdventureResponse[]>('/adventures');
    }
    // POST /adventures  body { name }  → AdventureResponse
    export function createAdventure(name: string): Promise<AdventureResponse> {
      return apiFetch<AdventureResponse>('/adventures', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    }
    // PATCH /adventures/:id  body { name }  → AdventureResponse (rename = UpdateAdventureDto.name)
    export function renameAdventure(id: string, name: string): Promise<AdventureResponse> {
      return apiFetch<AdventureResponse>(`/adventures/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    }
    // DELETE /adventures/:id → { deleted: true } (corps non utilisé côté UI)
    export function deleteAdventure(id: string): Promise<{ deleted: boolean }> {
      return apiFetch<{ deleted: boolean }>(`/adventures/${id}`, { method: 'DELETE' });
    }
    // (optionnel, utile pour [id].tsx) GET /adventures/:id → AdventureResponse
    export function getAdventure(id: string): Promise<AdventureResponse> {
      return apiFetch<AdventureResponse>(`/adventures/${id}`);
    }
    ```
    - ⚠️ **Path SANS préfixe `/api`** : `API_URL = EXPO_PUBLIC_API_URL` pointe sur l'API NestJS directement (`http://localhost:3010`), le contrôleur est `@Controller('adventures')` → l'URL est `/adventures`. (Le web préfixe `/api` parce qu'il passe par un proxy Next ; le mobile **non**.)
    - ⚠️ `apiFetch` **déballe déjà** `{ data }` (cf. api-client.ts l.178) : ne PAS re-déballer. Pour `GET /adventures`, le contrôleur renvoie un **array** → `apiFetch<AdventureResponse[]>` retourne directement le tableau.

- [x] **T2 — Hook `use-adventures.ts` (list/create/rename/delete)** (AC: 1, 2, 3, 4)
  - [x] Créer `apps/mobile/src/hooks/use-adventures.ts` exposant les hooks consommés par les écrans. Query keys **STRICTES** : `['adventures']` (liste), `['adventures', id]` (item). **JAMAIS** `['getAdventure']` ou variantes.
  - [x] `useAdventures()` → `useQuery({ queryKey: ['adventures'], queryFn: listAdventures })`. Retourne `{ data, isPending, isError, refetch }`.
  - [x] `useCreateAdventure()` → `useMutation({ mutationFn: (name: string) => createAdventure(name), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adventures'] }) })`. (Création = pas d'optimistic ici : on attend l'`id` serveur ; invalidation suffit. Optionnel : `onSuccess` peut `router.push` vers le détail — laisser ce choix à l'écran.)
  - [x] `useRenameAdventure()` → `useMutation` avec **optimistic update + rollback** (AC3) :
    ```ts
    export function useRenameAdventure() {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => renameAdventure(id, name),
        onMutate: async ({ id, name }) => {
          await qc.cancelQueries({ queryKey: ['adventures'] });
          const prevList = qc.getQueryData<AdventureResponse[]>(['adventures']);
          const prevItem = qc.getQueryData<AdventureResponse>(['adventures', id]);
          qc.setQueryData<AdventureResponse[]>(['adventures'], (old) =>
            old?.map((a) => (a.id === id ? { ...a, name } : a)),
          );
          qc.setQueryData<AdventureResponse>(['adventures', id], (old) =>
            old ? { ...old, name } : old,
          );
          return { prevList, prevItem };
        },
        onError: (_err, { id }, ctx) => {
          if (ctx?.prevList) qc.setQueryData(['adventures'], ctx.prevList);
          if (ctx?.prevItem) qc.setQueryData(['adventures', id], ctx.prevItem);
        },
        onSettled: (_d, _e, { id }) => {
          qc.invalidateQueries({ queryKey: ['adventures'] });
          qc.invalidateQueries({ queryKey: ['adventures', id] });
        },
      });
    }
    ```
  - [x] `useDeleteAdventure()` → `useMutation` avec **optimistic remove + rollback** (AC4) : même pattern `onMutate` (snapshot `['adventures']`, filtrer la carte hors de la liste), `onError` restaure le snapshot, `onSettled` invalide `['adventures']` + `queryClient.removeQueries({ queryKey: ['adventures', id] })` pour purger le détail supprimé.
  - [x] Toutes les mutations exposent `isPending` / `isError` / `error` (consommées par les écrans pour loading + `<ErrorBanner />`).

- [x] **T3 — Composant `adventure-card.tsx`** (AC: 1, 3, 4)
  - [x] Créer `apps/mobile/src/components/adventure/adventure-card.tsx`. Carte tactile (`Pressable`) basée sur `components/ui/card.tsx`. Props :
    ```ts
    interface AdventureCardProps {
      adventure: AdventureResponse;        // type @ridenrest/shared
      onPress: (id: string) => void;       // navigation vers détail
      onRename: (id: string, currentName: string) => void; // ouvre l'UI de renommage (gérée par l'écran)
      onDelete: (id: string) => void;      // déclenche la confirmation (gérée par l'écran)
    }
    ```
  - [x] Contenu : nom (`text-text-primary font-montserrat-semibold`), distance (`adventure.totalDistanceKm > 0 ? \`${totalDistanceKm.toFixed(1)} km\` : '—'`, en `text-text-muted`). Date optionnelle (`startDate`) formatée FR si présente — sinon masquée (les dates arrivent vraiment en MOB-3.3, ne pas bloquer dessus).
  - [x] Actions par carte : un accès « renommer » et « supprimer » (boutons `ghost`/`icon` ou un petit menu d'actions inline — **pas** de DropdownMenu Radix qui n'existe pas en RN). Approche simple recommandée : deux `Button size="icon" variant="ghost"` (crayon = renommer, corbeille = supprimer) alignés à droite du nom, chacun avec `accessibilityLabel` i18n. Le tap sur le **corps** de la carte = `onPress(id)` → navigue vers `[id]`.
  - [x] Styling NativeWind (`className=`) + `cn()`. Aucun style inline (pas de couleur runtime ici). `accessibilityRole="button"` sur la zone pressable.
  - [x] Créer `adventure-card.stories.tsx` co-localisé (convention Storybook archi §Storybook stories) : variantes `Default`, `NoDistance`, `LongName`.

- [x] **T4 — Écran liste `(app)/adventures/index.tsx`** (AC: 1, 2, 3, 4, 5, 6, 7)
  - [x] **Remplacer** le placeholder actuel. Consommer `useAdventures()`.
  - [x] `isPending` → rendre une liste de `<Skeleton />` (3–5 cartes squelettes `h-20 rounded-xl`). **Jamais** d'écran blanc bloquant.
  - [x] `isError` → `<ErrorBanner message={t('adventures.errors.loadFailed')} />` + bouton « Réessayer » (`refetch`). Ne PAS afficher l'état vide.
  - [x] `data.length === 0` → **état vide** : `<View>` centré avec icône (réutiliser une icône déjà dispo dans le projet, ou un `<Text>` emoji vélo si aucune lib d'icônes RN n'est installée — vérifier `lucide-react-native`/`@expo/vector-icons` avant d'en importer une), titre `t('adventures.empty.title')`, sous-texte `t('adventures.empty.subtitle')`, CTA `<Button label={t('adventures.empty.cta')} onPress={() => router.push('/(app)/adventures/new')} />`.
  - [x] `data.length > 0` → `<FlatList>` (ou `.map` dans un `ScrollView` si la liste reste courte — préférer `FlatList` pour la perf) de `<AdventureCard>`. Header avec titre `t('adventures.title')` + bouton « + Nouvelle aventure » → `router.push('/(app)/adventures/new')`.
  - [x] **Renommage inline** : au tap « renommer » sur une carte, l'écran ouvre une UI de saisie (option simple : `Alert.prompt` iOS **non portable Android** → préférer un **modal RN** `<Modal>` avec un `<TextField>` + boutons, OU naviguer vers un sous-écran. Recommandé : petit `<Modal>` contrôlé dans l'écran liste avec `useRenameAdventure().mutate({ id, name })`). Valider non-vide + trim côté client (aligné `createAdventureSchema`: 1–100). Pendant `isPending`, bouton « Renommer » en loading.
  - [x] **Suppression** : au tap « supprimer », `Alert.alert(t('adventures.delete.confirmTitle', { name }), t('adventures.delete.confirmMessage'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('adventures.delete.confirm'), style: 'destructive', onPress: () => deleteMutation.mutate(id) }])`. Sur erreur de la mutation → `<ErrorBanner />` global de l'écran (rollback automatique via le hook).
  - [x] Conteneur `bg-background-page`, `SafeAreaView`/padding cohérents avec les autres écrans `(app)`.

- [x] **T5 — Écran création `(app)/adventures/new.tsx`** (AC: 2, 7)
  - [x] Créer l'écran. Form RHF + `zodResolver(createAdventureSchema)` (schéma **partagé** `@ridenrest/shared` — `createAdventureSchema` : `name` 1–100). **Ne PAS** dupliquer la validation.
  - [x] Champ unique `<TextField label={t('adventures.new.nameLabel')} ... />` via `<Controller>`. `maxLength={100}`, `autoFocus`, `returnKeyType="done"`.
  - [x] Submit → `useCreateAdventure().mutate(name, { onSuccess: (created) => router.replace(\`/(app)/adventures/${created.id}\`) })` (ou retour liste — décider et documenter ; recommandé : aller au détail de l'aventure fraîchement créée, comme le web). Bouton submit `loading={isPending}` (anti-double-submit via `Button` qui désactive sur `loading`).
  - [x] Erreur réseau/serveur → `<ErrorBanner />` inline (mapping `ApiError.code`/`status` → clé i18n : `NETWORK_ERROR`/`status 0` → `auth.errors.network` réutilisable ou nouvelle `adventures.errors.createFailed` ; 5xx → `serverError`). **Jamais** `Alert.alert` pour une erreur réseau.
  - [x] `<KeyboardAvoidingView>` (cohérent avec les écrans auth MOB-2.2).

- [x] **T6 — Écran détail squelette `(app)/adventures/[id].tsx`** (AC: 1, 3, 4, 7)
  - [x] Créer l'écran (squelette pour MOB-3.2/3.3). `const { id } = useLocalSearchParams<{ id: string }>()`.
  - [x] Charger l'aventure : `useQuery({ queryKey: ['adventures', id], queryFn: () => getAdventure(id) })` (ou lire d'abord depuis le cache liste si présent — `initialData` optionnel). `isPending` → `<Skeleton />` ; `isError` → `<ErrorBanner />`.
  - [x] Afficher **au moins** le nom de l'aventure (titre). Boutons « Renommer » (réutilise `useRenameAdventure` — optimistic, met à jour `['adventures', id]` ET `['adventures']`) et « Supprimer » (confirmation `Alert.alert` → `useDeleteAdventure` → `router.replace('/(app)/adventures')` au succès).
  - [x] **Placeholder explicite** indiquant que segments/dates/carte arrivent en MOB-3.2/3.3 (chaîne i18n `adventures.detail.comingSoon`). Documenter que cet écran sera **étendu** par les stories suivantes — ne pas sur-construire.

- [x] **T7 — i18n (FR source + EN)** (AC: 7)
  - [x] Ajouter au namespace racine **`adventures`** dans `fr.json` **et** `en.json` les clés listées en Dev Notes §i18n. Ajouter aussi `common.cancel`/`common.retry` si absents (vérifier — actuellement il n'y a pas de namespace `common` racine). **Zéro** chaîne en dur.
  - [x] ⚠️ Le placeholder actuel `auth.adventures.title` / `auth.adventures.placeholder` (utilisé par l'ancien écran) devient **mort** une fois l'écran remplacé : le retirer de `fr.json`/`en.json` OU le laisser (inoffensif) — **décider et documenter**. Recommandé : migrer vers le nouveau namespace `adventures.*` et retirer `auth.adventures.*`.

- [x] **T8 — Tests (Jest + RNTL)** (AC: tous)
  - [x] `src/__tests__/adventures-list.test.tsx` (sous `src/__tests__/` car il importe une route `@/app/(app)/adventures/index` — **JAMAIS** sous `src/app/`, cf. AGENTS.md `require.context`) :
    - rend `<Skeleton />` quand `isPending`
    - rend l'état vide (titre + CTA) quand `data === []`
    - rend `<ErrorBanner />` (pas l'état vide) quand `isError`
    - rend les cartes (nom + distance) quand `data` peuplé
    - tap sur le CTA vide → `router.push('/(app)/adventures/new')`
    - tap « supprimer » → `Alert.alert` appelé (mock `Alert.alert`) ; confirmation → `deleteAdventure` appelé
  - [x] `src/__tests__/adventures-new.test.tsx` : validation inline (nom vide), submit appelle `createAdventure` (mocké), état loading + anti-double-submit, erreur réseau (`mockRejectedValue`) → `<ErrorBanner />`.
  - [x] `src/components/adventure/adventure-card.test.tsx` (co-localisé — pas une route, OK) : rend nom/distance, tap corps → `onPress(id)`, tap crayon → `onRename`, tap corbeille → `onDelete`.
  - [x] Optionnel mais recommandé : `src/hooks/use-adventures.test.ts` (rollback optimiste rename/delete via un wrapper `QueryClientProvider`).
  - [x] **Mocks** : mocker la façade `@/lib/api/adventures` (pas `apiFetch` directement), `expo-router` (`router.push/replace`), et `react-native` `Alert` (`jest.spyOn(Alert, 'alert')`). Utiliser **`userEvent`** (pas `fireEvent`) pour awaiter les updates async RHF/RNTL (gotcha MOB-2.2 : `fireEvent` corrompt les renders suivants). Dans une factory `jest.mock`, **pas** de JSX RN (transform NativeWind injecte une var hors-scope interdite par Jest) → `jest.fn(() => null)`.
  - [x] `pnpm --filter @ridenrest/mobile test|typecheck|lint` **verts**, zéro régression sur les 39 tests existants.

- [x] **T9 — Validation manuelle (device/simulateur)** (AC: 1, 2, 3, 4, 5) — _à exécuter par Guillaume_
  - [x] Connexion → écran `adventures` : skeleton puis liste (ou état vide si compte neuf).
  - [x] Créer une aventure « Test » → apparaît dans la liste, navigation au détail OK.
  - [x] Renommer « Test » → « Test 2 » : nom mis à jour immédiatement (optimistic), persiste après kill/relaunch.
  - [x] Supprimer « Test 2 » → `Alert` de confirmation → disparaît de la liste.
  - [x] Couper le réseau et tenter une création → `<ErrorBanner />` (pas de crash, pas d'`Alert`).

## Dev Notes

### Contrats API réels (backend epic 3 — DÉJÀ livré, ne rien inventer)

Source : `apps/api/src/adventures/adventures.controller.ts` + `adventures.service.ts` (lus, à jour).

| Verbe & path | Body (DTO) | Réponse (déballée par `apiFetch`) | Usage mobile |
|---|---|---|---|
| `POST /adventures` | `CreateAdventureDto { name: string }` (1–100) | `AdventureResponse` | créer |
| `GET /adventures` | — | `AdventureResponse[]` | liste |
| `GET /adventures/:id` | — | `AdventureResponse` (404 si pas owner) | détail |
| `PATCH /adventures/:id` | `UpdateAdventureDto { name?, startDate?, endDate?, avgSpeedKmh?, routingProfile? }` | `AdventureResponse` | **renommer** → envoyer **uniquement** `{ name }` |
| `DELETE /adventures/:id` | — | `{ deleted: true }` | supprimer (cascade serveur : segments + fichiers GPX + caches) |

> **Renommage** : il n'existe **pas** de `RenameAdventureDto` dédié côté serveur. Le rename passe par `PATCH /adventures/:id` avec **le seul champ** `{ name }` (le service ne met à jour que les champs fournis — cf. `updateAdventure`, `dto.name !== undefined`). Ne PAS envoyer `startDate`/`avgSpeedKmh`/etc. dans cette story (réservés MOB-3.3).

**Validation serveur** (`CreateAdventureDto` : `@MinLength(1) @MaxLength(100)` ; `UpdateAdventureDto.name` : `@IsOptional @Transform(trim) @IsNotEmpty @MaxLength(100)`). Aligner la validation client sur **1–100, non vide après trim** (= `createAdventureSchema` partagé). Un nom whitespace-only doit être rejeté côté client (le serveur trim + `@IsNotEmpty` le rejette aussi → 400).

**Forme de l'enveloppe** (ResponseInterceptor NestJS) : succès `{ data: ... }` / `{ data: [...], meta }`, erreur `{ error: { code, message, details } }`. **`apiFetch` déballe `{ data }`** automatiquement (api-client.ts l.178) et lève `ApiError(message, status, code, details)` sur non-2xx (`status: 0` / `code: 'NETWORK_ERROR'` si fetch rejeté). Dates **ISO 8601**, JSON **camelCase**.

**`AdventureResponse`** (champs réels — source `packages/shared/src/types/adventure.types.ts` l.39-56) :
```ts
interface AdventureResponse {
  id: string
  userId: string
  name: string
  totalDistanceKm: number
  totalElevationGainM?: number | null
  totalElevationLossM?: number | null
  startDate?: string | null   // 'YYYY-MM-DD' (date), null tant que MOB-3.3 absent
  endDate?: string | null
  status: 'planning' | 'active' | 'completed'
  densityStatus: 'idle' | 'pending' | 'processing' | 'success' | 'error'
  densityProgress: number
  avgSpeedKmh: number
  routingProfile: 'road' | 'gravel' | 'bikepacking'
  hasStravaSegment: boolean
  createdAt: string  // ISO 8601
  updatedAt: string
}
```
Pour la liste mobile (cette story), seuls `id`, `name`, `totalDistanceKm`, (optionnellement `startDate`) sont affichés. Les autres champs existent mais sont consommés par MOB-3.2/3.3.

**Schéma DB réel** (`packages/database/src/schema/adventures.ts`) : `name` notNull ; `totalDistanceKm` default 0 (une aventure neuve a `0 km` → carte affiche `—`) ; `startDate`/`endDate` nullable (`date`) ; `status` default `planning` ; `routingProfile` default `gravel` ; `avgSpeedKmh` default 15. Une création n'envoie **que** `name` ; le serveur remplit les défauts.

### Règles projet CRITIQUES (rappel — voir aussi `architecture-mobile.md`)

- **TanStack Query v5**. Query keys **STRICTES** : `['adventures']` (liste), `['adventures', id]` (item). **JAMAIS** `['getAdventure']`. (Conventions web partagées — `query-client.ts` l.4-5, `architecture-mobile.md` l.513.)
- **HTTP** : `apiFetch()` de `@/lib/api/api-client` **uniquement**. Pas d'axios/ky, pas de `fetch` direct dans les écrans/hooks. `apiFetch` gère Bearer JWT + `401 → refresh → 1 retry` + déballage `{ data }`.
- **Types depuis `packages/shared`** (`AdventureResponse`, `CreateAdventureInput`…), **jamais** redéfinis localement (`architecture-mobile.md` l.515, 670).
- **Validation** : Zod `packages/shared/schemas/` (`createAdventureSchema`, `updateAdventureSchema`) via RHF resolver — **jamais** dupliquer (l.514, 671).
- **Logique métier** dans `packages/shared`/`packages/gpx` — jamais dans un écran. Ici la logique est triviale (CRUD nom) ; pas de calcul métier à externaliser.
- **Styling NativeWind** (`className=`) + `cn()`. Style inline **uniquement** pour couleurs runtime (pas le cas ici). Tokens identiques au web (`bg-background-page`, `text-text-primary`, `text-text-muted`, `border-border`, `bg-card`…).
- **Loading** = `<Skeleton />` / `isPending`, jamais blocage UI total (l.715). **Erreurs réseau** = `<ErrorBanner />` inline, **jamais** `Alert.alert` (l.716). **Exception** : la **confirmation de suppression** = `Alert.alert` à 2 boutons est **acceptable** (c'est une confirmation d'action utilisateur, pas une erreur réseau). Choix retenu pour cette story : `Alert.alert` natif (zéro dépendance, comportement OS familier) plutôt qu'un `<Modal>` custom.
- **Mutations** : optimistic update + rollback (`onMutate`/`onError`/`onSettled`) pour **rename** et **delete** (AC3/AC4). Création = invalidation simple (besoin de l'`id` serveur).
- **i18n** : toutes les strings via `t()` (`@/lib/i18n`), FR source + EN. `kebab-case.tsx`, hooks `use-*.ts`, layout `src/`. Tests co-localisés `*.test.tsx` sauf imports de routes → `src/__tests__/`.

### Réutilisation du code existant (ne rien recréer)

| Asset | Chemin | Réutilisation |
|---|---|---|
| `apiFetch` / `ApiError` | `src/lib/api/api-client.ts` | seul point HTTP ; déballe `{ data }`, gère 401/refresh |
| `QueryClient` | `src/lib/query/query-client.ts` | `staleTime 30s`, `retry 2` (déjà monté en provider root MOB-2.1) |
| `Skeleton` | `src/components/ui/skeleton.tsx` | états loading (liste + détail) |
| `ErrorBanner` | `src/components/ui/error-banner.tsx` | erreurs fetch/mutation inline |
| `Button` | `src/components/ui/button.tsx` | CTA, submit (`loading` → indicateur + `disabled` + `busy`), variants `default/ghost/destructive/icon` |
| `Input` / `TextField` | `src/components/ui/{input,text-field}.tsx` | champ nom (création + renommage) via `<Controller>` |
| `Card` & sous-composants | `src/components/ui/card.tsx` | base de `adventure-card.tsx` |
| `useTranslation` | `src/lib/i18n` | i18n |
| Guard auth | `src/app/(app)/_layout.tsx` | déjà en place — les écrans `(app)/adventures/*` sont protégés, **rien à ajouter** |

Dépendances déjà présentes (MOB-2.2) : `react-hook-form`, `@hookform/resolvers`, `zod`, `@tanstack/react-query`. **Vérifier** la présence d'une lib d'icônes RN (`@expo/vector-icons` est généralement fourni par Expo) avant d'importer une icône ; sinon, fallback emoji/texte. Ne PAS ajouter de nouvelle dépendance sans nécessité.

### i18n — clés à ajouter (FR `fr.json` + EN `en.json`)

Nouveau namespace racine **`adventures`** (+ `common` si absent). Valeurs FR ci-dessous ; fournir l'équivalent EN.

```jsonc
{
  "common": {
    "cancel": "Annuler",
    "retry": "Réessayer",
    "delete": "Supprimer",
    "rename": "Renommer",
    "save": "Enregistrer"
  },
  "adventures": {
    "title": "Mes aventures",
    "newButton": "Nouvelle aventure",
    "card": {
      "renameA11y": "Renommer l'aventure",
      "deleteA11y": "Supprimer l'aventure",
      "openA11y": "Ouvrir l'aventure"
    },
    "empty": {
      "title": "Aucune aventure",
      "subtitle": "Créez votre première aventure pour commencer à planifier vos voyages à vélo.",
      "cta": "Créer une aventure"
    },
    "new": {
      "title": "Nouvelle aventure",
      "nameLabel": "Nom de l'aventure",
      "namePlaceholder": "Ex. Tour du Mont-Blanc",
      "submit": "Créer l'aventure",
      "submitting": "Création…"
    },
    "rename": {
      "title": "Renommer l'aventure",
      "nameLabel": "Nouveau nom",
      "submit": "Renommer",
      "submitting": "Renommage…"
    },
    "delete": {
      "confirmTitle": "Supprimer « {{name}} » ?",
      "confirmMessage": "Cette action est irréversible. Tous les segments et données associées seront supprimés.",
      "confirm": "Supprimer"
    },
    "detail": {
      "comingSoon": "Les segments GPX, dates et la carte arrivent prochainement (MOB-3.2 / MOB-3.3)."
    },
    "errors": {
      "loadFailed": "Impossible de charger vos aventures.",
      "createFailed": "La création a échoué. Réessayez.",
      "renameFailed": "Le renommage a échoué.",
      "deleteFailed": "La suppression a échoué.",
      "nameRequired": "Le nom est requis.",
      "nameTooLong": "Le nom ne peut pas dépasser 100 caractères."
    }
  }
}
```

> ⚠️ Interpolation i18next : `t('adventures.delete.confirmTitle', { name })` → la clé contient `{{name}}` (double accolade i18next).
>
> ⚠️ Réutilisation possible pour les erreurs réseau génériques : `auth.errors.network` / `auth.errors.serverError` / `auth.errors.generic` existent déjà (mapper `ApiError.code === 'NETWORK_ERROR'` / `status >= 500` / défaut). Décider : soit réutiliser `auth.errors.*`, soit utiliser `adventures.errors.*`. **Recommandé** : `adventures.errors.{create,rename,delete}Failed` comme message principal, et garder `auth.errors.network`/`serverError` pour le détail. Documenter le choix dans le File List.
>
> ⚠️ `auth.adventures.title`/`auth.adventures.placeholder` (placeholder MOB-2.1/2.2) deviennent obsolètes — migrer vers `adventures.title` et **retirer** `auth.adventures.*` (ou les laisser, inoffensifs). Documenter.

### Pattern écran (squelette de référence)

```tsx
// (app)/adventures/index.tsx (forme cible)
export default function AdventuresScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useAdventures();
  const deleteMutation = useDeleteAdventure();

  if (isPending) return <AdventuresListSkeleton />;
  if (isError) return <ErrorState onRetry={refetch} />;        // ErrorBanner + bouton
  if (!data || data.length === 0) return <AdventuresEmptyState />; // icône + CTA → /new

  return (
    <View className="flex-1 bg-background-page">
      {/* header titre + bouton Nouvelle aventure */}
      <FlatList
        data={data}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => (
          <AdventureCard
            adventure={item}
            onPress={(id) => router.push(`/(app)/adventures/${id}`)}
            onRename={(id, name) => openRenameModal(id, name)}
            onDelete={(id) => confirmDelete(item)}
          />
        )}
      />
      {deleteMutation.isError && <ErrorBanner message={t('adventures.errors.deleteFailed')} />}
    </View>
  );
}
```
La confirmation de suppression :
```tsx
function confirmDelete(a: AdventureResponse) {
  Alert.alert(
    t('adventures.delete.confirmTitle', { name: a.name }),
    t('adventures.delete.confirmMessage'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('adventures.delete.confirm'), style: 'destructive',
        onPress: () => deleteMutation.mutate(a.id) },
    ],
  );
}
```

### Dépendances intra-epic (artefacts posés ici, réutilisés ensuite)

- `hooks/use-adventures.ts` — **étendu** par MOB-3.2 (ajout `useAdventureSegments`/upload) et MOB-3.3 (mutations dates/vitesse/profil via le même `PATCH /adventures/:id`). **Garder la query key `['adventures', id]` stable.**
- `app/(app)/adventures/index.tsx` — liste, point d'entrée. MOB-3.x pourra enrichir la carte (statut densité, badge GPX).
- `app/(app)/adventures/[id].tsx` — **squelette** (nom + actions). MOB-3.2 y greffe segments/upload, MOB-3.3 les dates/profil. Ne pas verrouiller la structure.
- `app/(app)/adventures/new.tsx` — création.
- `components/adventure/adventure-card.tsx` — carte réutilisable.

### Standards de test (résumé)

- **Jest + React Native Testing Library** (preset jest-expo, mocks natifs MOB-1.4). **`userEvent`** (pas `fireEvent`) pour les updates async RHF/RNTL (gotcha overlapping-act MOB-2.2).
- Tests important une **route** (`@/app/(app)/adventures/...`) → **sous `src/__tests__/`** (jamais `src/app/`, sinon `expo export` casse via `require.context` — AGENTS.md). Tests de composants/hooks → co-localisés.
- Mocker la **façade** `@/lib/api/adventures` (pas `apiFetch`), `expo-router`, et `Alert` (`jest.spyOn(Alert, 'alert')`). Dans `jest.mock` factory : **pas** de JSX RN.
- Couvrir : skeleton/`isPending`, état vide, `isError` (≠ vide), rendu cartes, navigation CTA, confirmation+suppression, validation création, loading+anti-double-submit, chemin d'échec réseau (`mockRejectedValue`).
- Gates : `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts, zéro régression.

### Project Structure Notes

**Créés**
```
apps/mobile/src/lib/api/adventures.ts
apps/mobile/src/hooks/use-adventures.ts
apps/mobile/src/components/adventure/adventure-card.tsx
apps/mobile/src/components/adventure/adventure-card.stories.tsx
apps/mobile/src/components/adventure/adventure-card.test.tsx
apps/mobile/src/app/(app)/adventures/new.tsx
apps/mobile/src/app/(app)/adventures/[id].tsx
apps/mobile/src/__tests__/adventures-list.test.tsx
apps/mobile/src/__tests__/adventures-new.test.tsx
apps/mobile/src/hooks/use-adventures.test.ts            (optionnel mais recommandé)
```
**Modifiés**
```
apps/mobile/src/app/(app)/adventures/index.tsx          (placeholder → liste réelle)
apps/mobile/src/lib/i18n/locales/fr.json                (+ namespace adventures, common)
apps/mobile/src/lib/i18n/locales/en.json                (idem)
```
Aucune modif serveur, aucune migration DB, aucun nouveau module NestJS. Le guard `(app)/_layout.tsx` couvre déjà ces écrans. ⚠️ **Typed routes Expo Router** (`typedRoutes: true`) : l'ajout de `new.tsx` / `[id].tsx` impose de régénérer `.expo/types/router.d.ts` (lancer brièvement `expo start` en arrière-plan — `expo export` ne le régénère pas) sinon le typecheck échoue sur `router.push('/(app)/adventures/new')` (gotcha vécu MOB-2.2).

### Frontière de story

- **Inclus** : liste (skeleton/empty/error), création (form RHF + Zod partagé), renommage (optimistic+rollback, via `PATCH {name}`), suppression (confirmation `Alert` + optimistic+rollback), détail **squelette** (nom + actions), i18n FR/EN, tests RNTL.
- **Exclu** : upload GPX / segments (MOB-3.2) ; dates / vitesse / profil de routage (MOB-3.3) ; carte (MOB-4.x) ; mode live ; suppression de compte / RGPD (MOB-2.5) ; toute modif serveur ; pull-to-refresh avancé (un `refetch` simple suffit).

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-3.1] — AC d'origine, FR-010/FR-017/FR-018
- [Source: apps/api/src/adventures/adventures.controller.ts] — endpoints réels `POST/GET/GET :id/PATCH :id/DELETE :id`, `@CurrentUser`
- [Source: apps/api/src/adventures/adventures.service.ts] — `createAdventure(userId,name)`, `listAdventures`, `getAdventure`, `updateAdventure` (PATCH partiel `dto.name`), `deleteAdventure` (cascade), `toResponse`
- [Source: apps/api/src/adventures/dto/create-adventure.dto.ts] — `name` 1–100
- [Source: apps/api/src/adventures/dto/update-adventure.dto.ts] — `name?` trim+1–100 (pas de RenameAdventureDto séparé)
- [Source: packages/shared/src/types/adventure.types.ts#AdventureResponse] — forme de réponse (l.39-56)
- [Source: packages/shared/src/schemas/adventure.schema.ts] — `createAdventureSchema`/`updateAdventureSchema` (Zod partagé)
- [Source: packages/database/src/schema/adventures.ts] — champs réels (totalDistanceKm default 0, startDate/endDate nullable, défauts)
- [Source: _bmad-output/implementation-artifacts/8-2-adventures-list-page.md] — UX liste web (empty state, isError ≠ empty, query key `['adventures']`, card name+distance)
- [Source: _bmad-output/implementation-artifacts/3-1-create-adventure-upload-gpx-segment.md] — création web (redirect vers détail au succès)
- [Source: _bmad-output/implementation-artifacts/3-4-adventure-segment-rename-and-delete.md] — rename (`PATCH {name}`, optimistic/revert), delete (confirmation + cascade serveur + redirect), query invalidation `['adventures']`+`['adventures',id]`
- [Source: _bmad-output/implementation-artifacts/MOB-2-2-email-signup-login-password-reset.md] — modèle de structure/détail, RHF+Zod, `<ErrorBanner>`, `userEvent` (gotcha act), i18n FR/EN, tests sous `src/__tests__/`
- [Source: _bmad-output/implementation-artifacts/MOB-2-1-better-auth-client-secure-store-session.md] — `apiFetch`, guard `(app)`, QueryClient provider
- [Source: apps/mobile/src/lib/api/api-client.ts] — `apiFetch`/`ApiError`, déballage `{ data }`, 401/refresh, `NETWORK_ERROR`
- [Source: apps/mobile/src/lib/query/query-client.ts] — `staleTime`/`retry`, conventions query keys
- [Source: apps/mobile/src/components/ui/{skeleton,error-banner,button,input,text-field,card}.tsx] — primitifs UI réutilisés
- [Source: apps/mobile/src/app/(app)/_layout.tsx] — guard auth centralisé (écrans déjà protégés)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md] — §Structure Patterns (l.541), §Naming (l.524), §API & Communication (l.663), §Loading states & errors (l.711), §Data/conventions (l.510-520), §Storybook (l.733)
- [Source: apps/mobile/AGENTS.md] — gotcha tests de routes sous `src/__tests__/`, typed routes Expo Router, mocks Jest auth/NativeWind

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia — bmad-dev-story)

### Debug Log References

- **Lib d'icônes** : le projet mobile n'avait aucune lib d'icônes (`@expo/vector-icons`/`lucide-react-native` absents). Sur demande utilisateur, reprise de la **même lib que le web** (`lucide-react`) → installation de `lucide-react-native ^1.18.0` + peer `react-native-svg 15.15.4` via `npx expo install` (versions compatibles Expo SDK 56). Wrapper `cssInterop` (`components/ui/icon.tsx`) pour styler les icônes par `className`/token (parité web, zéro hex runtime).
- **Jest / transpile** : ajout de `react-native-svg` + `lucide-react-native` à la whitelist `transformIgnorePatterns` (ship du JSX/ESM non compilé). Icônes confirmées rendables sous jest-expo.
- **RNTL v14 — skeleton masqué** : le `<Skeleton>` est `accessibilityElementsHidden` → exclu par défaut des requêtes RNTL. Test liste : `getAllByTestId('adventure-skeleton', { includeHiddenElements: true })` + `testID` ajouté aux skeletons de la liste.
- **RNTL v14 — `renderHook` asynchrone** : `renderHook` pose `result.current` dans un `useEffect` qui ne commit pas de façon fiable pour le 2ᵉ render d'un même fichier (React 19). Contourné dans `use-adventures.test.ts` par un **composant-sonde** capturant le hook dans son corps de rendu (synchrone) + mutationFn à rejet contrôlé pour observer optimistic puis rollback.
- **Typed routes Expo Router** : `new.tsx` / `[id].tsx` régénérés dans `.expo/types/router.d.ts` par le Metro déjà en cours → typecheck vert sans intervention.
- **`react-native-svg` = module NATIF → rebuild dev client obligatoire (T9)** : sur device, icônes lucide + wordmark Strava affichaient des boîtes roses *« Unimplemented component: RNSVG… »* — le dev client iOS avait été compilé **avant** l'ajout de `react-native-svg` (absent de `ios/Podfile.lock`). Fix conforme à `AGENTS.md` : `npx expo prebuild --clean -p ios` (relink `RNSVG 15.15.4` + pods, régénère `ios/` depuis `app.config.ts`) puis `npx expo run:ios` (Build Succeeded, Xcode 26.5 ≥ 26.4). Après réinstallation, SVG OK et carte iso.
- **i18n Fast Refresh stale** : ajouter des clés dans `fr.json`/`en.json` n'apparaît PAS via Fast Refresh (i18next = singleton initialisé une fois) → clés affichées en brut sur device jusqu'à un **reload complet** (Metro `r`). Aucun bug code (clés correctes, tests verts).

### Completion Notes List

- **Décisions documentées** :
  - **Navigation post-création** : `router.replace` vers le détail de l'aventure créée (parité web).
  - **i18n** : migration `auth.adventures.*` → namespace racine **`adventures.*`** + nouveau **`common.*`** ; l'ancien `auth.adventures.*` (placeholder mort) a été **retiré** de `fr.json`/`en.json`.
  - **Erreurs** : messages principaux via `adventures.errors.{load,create,rename,delete}Failed` (inline `<ErrorBanner>`), `Alert.alert` réservé à la **confirmation** de suppression.
  - **Accès Paramètres préservé** : l'ancien placeholder portait le seul lien vers `(app)/settings` (Strava/compte). Pour éviter une régression, un bouton icône `Settings` a été ajouté à l'en-tête de la liste (clé `adventures.settingsA11y`).
  - **Refactor** : le modal de renommage a été extrait en composant partagé `rename-adventure-modal.tsx`, réutilisé par la liste **et** le détail (DRY).
- **Gates verts** : `pnpm --filter @ridenrest/mobile test|typecheck|lint` → **84/84 tests (16 suites)**, tsc 0 erreur, ESLint clean. Zéro régression sur les suites existantes (MOB-1/MOB-2).
- **T9 (validation device)** : **validée par Guillaume (2026-06-13)** — liste/skeleton/état vide, création, renommage (détail, optimistic), suppression (confirmation Alert), offline → `<ErrorBanner>`, et rendu carte iso web confirmé après rebuild natif. ✅

### File List

**Créés**
- `apps/mobile/src/lib/api/adventures.ts`
- `apps/mobile/src/hooks/use-adventures.ts`
- `apps/mobile/src/hooks/use-adventures.test.ts`
- `apps/mobile/src/components/ui/icon.tsx`
- `apps/mobile/src/components/adventure/adventure-card.tsx`
- `apps/mobile/src/components/adventure/adventure-card.stories.tsx`
- `apps/mobile/src/components/adventure/adventure-card.test.tsx`
- `apps/mobile/src/components/adventure/rename-adventure-modal.tsx`
- `apps/mobile/src/components/shared/powered-by-strava.tsx` (wordmark Strava RN via SvgXml)
- `apps/mobile/src/components/shared/powered-by-strava-assets.ts` (SVG officiels inlinés)
- `apps/mobile/src/app/(app)/adventures/new.tsx`
- `apps/mobile/src/app/(app)/adventures/[id].tsx`
- `apps/mobile/src/__tests__/adventures-list.test.tsx`
- `apps/mobile/src/__tests__/adventures-new.test.tsx`

**Modifiés**
- `apps/mobile/src/app/(app)/adventures/index.tsx` (placeholder → liste réelle)
- `apps/mobile/src/lib/i18n/locales/fr.json` (+ `adventures`, `common` ; − `auth.adventures`)
- `apps/mobile/src/lib/i18n/locales/en.json` (idem)
- `apps/mobile/jest.config.js` (whitelist `react-native-svg`, `lucide-react-native`)
- `apps/mobile/jest.setup.ts` (mock global AsyncStorage)
- `apps/mobile/package.json` (+ `lucide-react-native`, `react-native-svg`)
- `apps/mobile/src/lib/api/api-client.ts` (**fix T9** : préfixe global `/api` du NestJS — `API_BASE`)
- `apps/mobile/AGENTS.md` (gotchas : préfixe `/api` NestJS + roue dentée = overlay simulateur)
- `apps/mobile/ios/**` (régénéré via `expo prebuild --clean` — `react-native-svg`/`RNSVG` désormais linké dans `Podfile.lock`)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Implémentation MOB-3.1 (T1–T8) : façade API + hooks (optimistic/rollback), `adventure-card` + stories, écrans liste/création/détail squelette, modal renommage partagé, i18n FR/EN (migration vers `adventures.*`), lib d'icônes lucide-react-native, tests RNTL (84/84). Gates verts. Statut → review. T9 (device) en attente de Guillaume. | Amelia (claude-opus-4-8) |
| 2026-06-13 | 0.2 | **T9 validation device** : bug bloquant corrigé — l'API NestJS sert tout sous le préfixe global `/api` (`apiFetch` le préfixe désormais via `API_BASE`) ; le CRUD partait en 404. Création/liste validées par Guillaume. | Amelia (claude-opus-4-8) |
| 2026-06-13 | 0.3 | **Refonte design carte aventure** (retour Guillaume) : alignement fidèle sur la carte web (UX-DR-MOB-001) — en-tête nom + colonne métriques (distance, dénivelé ↑/↓), ligne date (plage/start/createdAt), rangée d'actions Renommer/Supprimer en bas. Gates verts (15/15 affectés). | Amelia (claude-opus-4-8) |
| 2026-06-13 | 0.7 | **T9 validée par Guillaume** : tous les flux device OK (liste/skeleton/vide, création, renommage, suppression, offline) + carte iso confirmée. Toutes tâches T1–T9 cochées. Story prête pour code review. | Amelia (claude-opus-4-8) |
| 2026-06-13 | 0.6 | **Rebuild dev client natif (T9)** : `react-native-svg` (module natif requis par lucide + wordmark Strava) absent du build → boîtes *« Unimplemented component »*. `expo prebuild --clean -p ios` (relink RNSVG dans `Podfile.lock`, régénère `ios/`) + `expo run:ios` (Build Succeeded). Icônes + SVG OK, carte iso confirmée sur device. | Amelia (claude-opus-4-8) |
| 2026-06-13 | 0.5 | **Portage prod fidèle de la liste** (retour Guillaume) : header « Mes aventures » + pill « Nouvelle aventure » (`bg-primary/10 text-primary`, ≠ bouton vert plein), bandeau intro Planning/Live (`bg-background-intro`), **tri à venir (actives d'abord) + section repliable « Aventures passées (N) »** (logique miroir web). Carte réécrite en `Pressable` explicites (classes web exactes : Live `bg-text-primary`/blanc, Planning `bg-surface-raised`, Modifier bordure) pour couleurs exactes. Clés i18n `card.{live,planning,edit}` + `intro.*` + `pastSection` (FR/EN). NB : afficher des clés i18n brutes sur device = Fast Refresh stale → **reload complet** requis. Gates verts (84/84). | Amelia (claude-opus-4-8) |
| 2026-06-13 | 0.4 | **Carte ISO web** (retour Guillaume) : reprise exacte de la carte web mobile — métriques + wordmark « Powered by Strava » (`PoweredByStrava` RN via SvgXml, asset officiel light/dark), actions « Démarrer en Live » + « Planning » (désactivées, MOB-4/5 non livrés) + « Modifier » (→ détail). **Renommage/suppression migrés sur l'écran détail** (parité web ; la liste = navigation seule). Mock global AsyncStorage ajouté (`jest.setup.ts`). Gates verts (84/84, tsc 0, lint clean). | Amelia (claude-opus-4-8) |
| 2026-06-13 | 1.0 | **Code review adversariale (3 couches)** : 1 decision résolue (whitespace-only → `.trim()` schéma partagé) + 3 patchs appliqués (schéma `createAdventureSchema` trim + 2 tests ; modal renommage refacto `key={target.id}` ≠ `onShow` Android ; garde anti double-submit clavier création) ; 6 defer → `deferred-work.md` ; 11 dismissed. Gates re-vérifiés : mobile 84/84 + tsc 0 + lint clean, shared 41/41. Statut → **done**. | Code Review (claude-opus-4-8) |

## Review Findings

_Revue de code adversariale (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 2026-06-13, baseline `07faf46`, fichiers non commités. 1 decision-needed (résolue → patch), 3 patch, 6 defer, 11 dismissed._

### Patch (correctifs sans ambiguïté)

- [x] **[Review][Patch] Nom whitespace-only non rejeté côté client à la création (AC2)** [`packages/shared/src/schemas/adventure.schema.ts:4`] — `createAdventureSchema` était `z.string().min(1).max(100)` **sans `.trim()`**. Un nom `"   "` passait `min(1)`, l'app POSTait un `name` **vide** → 400 serveur, **pas** de message inline `nameRequired`. **Corrigé** (décision Guillaume, schéma partagé) : `z.string().trim().min(1).max(100)` → corrige web **et** mobile, validation non dupliquée. Mapping RHF `too_small → nameRequired` vérifié. +2 tests `adventure.schema.test.ts` (rejet whitespace-only + trim des espaces).
- [x] **[Review][Patch] Le modal de renommage initialise le champ via `Modal.onShow` — non fiable sous Android** [`rename-adventure-modal.tsx`] — **Corrigé** : refacto en composant interne `RenameForm` monté avec `key={target.id}` → l'initialiseur `useState(initialName)` seede le champ de façon fiable cross-plateforme, sans `onShow` ni `setState`-in-effect (conforme à la règle ESLint `react-hooks/set-state-in-effect`).
- [x] **[Review][Patch] Double-submit clavier non gardé à la création** [`new.tsx:51`] — **Corrigé** : garde `if (createMutation.isPending) return;` en tête de `onSubmit` (le bouton était déjà désactivé via `loading`, mais pas la touche clavier « done » `onSubmitEditing`).

### Reportés (réels, faible priorité — non bloquants)

- [x] **[Review][Defer] Skeleton infini sur le détail si `id` falsy** [`[id].tsx:29-31` / `use-adventures.ts:37`] — déféré, faible déclenchabilité (la route `[id]` garantit un segment).
- [x] **[Review][Defer] Race rename+delete concurrents sur le snapshot `['adventures']` partagé** [`use-adventures.ts:66-115`] — déféré, se résorbe au prochain refetch (`onSettled`), pas de garde UI.
- [x] **[Review][Defer] Détail 404 (supprimé / non-owner) affiche le copy pluriel `loadFailed`** [`[id].tsx:80-81`] — déféré, ajouter un message `notFound` dédié.
- [x] **[Review][Defer] Annuler une création en vol → `onSuccess` `router.replace` éjecte quand même vers le détail** [`new.tsx:54-55`] — déféré, nécessite une garde monté/annulé.
- [x] **[Review][Defer] Bannières d'erreur du détail (rename/delete) jamais auto-réinitialisées** [`[id].tsx:120-125`] — déféré, deux échecs peuvent s'empiler ; ajouter un `reset()` à l'ouverture/fermeture.
- [x] **[Review][Defer] Renommer avec un nom inchangé déclenche quand même un PATCH** [`rename-adventure-modal.tsx:49-53`] — déféré, ajouter une garde « pas de changement → close ».
