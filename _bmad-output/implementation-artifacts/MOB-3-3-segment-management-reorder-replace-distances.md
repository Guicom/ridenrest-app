---
baseline_commit: 35e5cc4
---

# Story MOB-3.3 : Gestion des segments (réordre, suppression, remplacement, renommage, distances)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **réordonner, renommer, remplacer et supprimer les segments d'une aventure et voir les distances**,
So that **je structure mon itinéraire en étapes ordonnées**.

> **Dépend de MOB-3.1** (écran liste/détail d'aventures, `hooks/use-adventures.ts`, mutation rename/delete d'aventure, query key `['adventures', id]`) **et de MOB-3.2** (`hooks/use-segments.ts` avec `useSegments(adventureId)` + polling `parseStatus`, composant `gpx-uploader.tsx` via `expo-document-picker`, affichage d'un segment par statut `pending/processing/done/error`). Cette story **étend** `use-segments.ts` (mutations `reorder` / `rename` / `delete`) et **ajoute** `components/adventure/segment-list.tsx` (liste **draggable** + distances cumulées), puis **enrichit** `app/(app)/adventures/[id].tsx`. **Le backend Epic 3 (web) est livré et inchangé** — les endpoints `PATCH …/segments/reorder`, `PATCH …/segments/:id`, `DELETE …/segments/:id`, `POST …/segments` existent déjà (voir Dev Notes → contrats réels). **Aucune modif serveur.**

> ⚠️ **État réel du code mobile au moment de cette story** : MOB-3.1 et MOB-3.2 **ne sont pas encore livrés** (vérifié : pas de `hooks/use-segments.ts`, pas de `components/adventure/`, pas de route `app/(app)/adventures/[id].tsx` ; seul `app/(app)/adventures/index.tsx` existe comme **placeholder** MOB-2.1). Cette story **présuppose** que MOB-3.1 + MOB-3.2 sont implémentés avant. Si l'agent dev exécute MOB-3.3 alors que 3.1/3.2 manquent, il **ne doit pas les réimplémenter** : il signale le blocage. Les contrats d'extension (`use-segments.ts`, `gpx-uploader.tsx`, route `[id].tsx`) sont décrits ci-dessous pour cadrer l'intégration.

## Acceptance Criteria

1. **Given** une aventure multi-segments
   **When** je réordonne les segments par glisser-déposer
   **Then** le nouvel ordre est persisté (**optimistic update** TanStack Query + **rollback** en cas d'erreur) (FR-012)
   **And** la query key utilisée est **exactement** `['adventures', adventureId, 'segments']`, invalidée en `onSettled`

2. **Given** un segment
   **When** je le supprime (après confirmation) **ou** je le remplace par un nouveau GPX
   **Then** l'action est appliquée et la liste/trace est mise à jour (FR-013, FR-014)
   **And** la suppression demande une **confirmation** ; le remplacement réutilise le `gpx-uploader` (MOB-3.2) → **delete + ré-upload** (nouveau parse `pending`)

3. **Given** un segment
   **When** je le renomme
   **Then** le nouveau nom est persisté et reflété dans la carte du segment (FR-017)

4. **Given** une aventure avec segments parsés
   **When** je consulte le détail
   **Then** la **distance totale** et les **distances cumulatives par segment** sont affichées, **formatées en km** (FR-015)
   **And** ces distances proviennent du **serveur** (`cumulativeStartKm` / `distanceKm` du `AdventureSegmentResponse`, `totalDistanceKm` de l'`AdventureResponse`) — **jamais** recalculées dans l'écran (anti-pattern interdit)

5. **Given** un formulaire/une action en cours (reorder, delete, rename, replace)
   **When** la requête est en vol
   **Then** les états de chargement sont visibles et le double-déclenchement est empêché ; les erreurs réseau s'affichent via `<ErrorBanner />` inline (**jamais** `Alert.alert` pour une erreur), **toutes** les chaînes via i18n `t()`

## Tasks / Subtasks

- [x] **T1 — Lib drag-and-drop : installation + plugin Expo** (AC: 1)
  - [x] **Choix de lib** : `react-native-reanimated-dnd` (v2.x). Justification dans Dev Notes (§DnD). Les prérequis natifs sont **déjà installés** (`react-native-reanimated@4.3.1`, `react-native-gesture-handler@2.31.1`, `react-native-worklets@0.8.3`).
  - [x] `pnpm --filter @ridenrest/mobile add react-native-reanimated-dnd` (vérifier la version résolue ≥ 2.0.0 ; peer `react-native-reanimated >= 4.2.0` → satisfait par 4.3.1)
  - [x] **app.config.ts** : **aucun plugin Expo additionnel requis** pour cette lib (pas de config plugin). **NE PAS** ajouter `react-native-worklets/plugin` à `babel.config.js` à la main : `babel-preset-expo` (SDK 56) **l'auto-inclut** quand `react-native-worklets` est présent (le retirer/ajouter manuellement casserait le pipeline). Documenter ce point (cf. Dev Notes §DnD → « Babel »).
  - [x] **`GestureHandlerRootView`** : la DnD via `react-native-gesture-handler` exige que l'arbre soit enveloppé par `<GestureHandlerRootView style={{ flex: 1 }}>`. Le root `app/_layout.tsx` **n'en a pas** actuellement (vérifié). **Ajouter** `import { GestureHandlerRootView } from 'react-native-gesture-handler'` et envelopper le contenu **au-dessus** de `<QueryProvider>` (ou directement autour du `<Stack>`), sans casser les providers existants (TanStack Query / i18n).
  - [x] **Dev build obligatoire** : ces modules natifs ne tournent **pas** sous Expo Go. Rappeler dans Dev Notes : `expo prebuild --clean -p ios` puis `expo run:ios` (cf. `apps/mobile/AGENTS.md` → « Après ajout d'un module NATIF »). La validation visuelle du drag (T7) nécessite un dev-build device/simulateur.

- [x] **T2 — API client : fonctions segments (reorder / rename / delete / replace)** (AC: 1, 2, 3)
  - [x] Dans `apps/mobile/src/lib/api/adventures.ts` (créé en MOB-3.1 ; **sinon** `lib/api/segments.ts`), ajouter — **réutiliser `apiFetch`** (`@/lib/api/api-client`), jamais `fetch` brut :
    ```ts
    import { apiFetch } from '@/lib/api/api-client';
    import type { AdventureSegmentResponse } from '@ridenrest/shared';

    // PATCH /adventures/:adventureId/segments/reorder  — payload { orderedIds }
    export function reorderSegments(adventureId: string, orderedIds: string[]) {
      return apiFetch<AdventureSegmentResponse[]>(
        `/adventures/${adventureId}/segments/reorder`,
        { method: 'PATCH', body: JSON.stringify({ orderedIds }) },
      );
    }

    // PATCH /adventures/:adventureId/segments/:segmentId  — payload { name }
    export function renameSegment(adventureId: string, segmentId: string, name: string) {
      return apiFetch<AdventureSegmentResponse>(
        `/adventures/${adventureId}/segments/${segmentId}`,
        { method: 'PATCH', body: JSON.stringify({ name }) },
      );
    }

    // DELETE /adventures/:adventureId/segments/:segmentId  — réponse { deleted: true }
    export function deleteSegment(adventureId: string, segmentId: string) {
      return apiFetch<{ deleted: boolean }>(
        `/adventures/${adventureId}/segments/${segmentId}`,
        { method: 'DELETE' },
      );
    }
    ```
  - [x] **Le « remplacement » n'a PAS d'endpoint dédié** : c'est `deleteSegment(...)` **puis** un upload via le `gpx-uploader` (MOB-3.2, `POST /adventures/:id/segments` multipart). Ne **pas** créer de fonction `replaceSegment`.
  - [x] ⚠️ **Contrat reorder** : le champ est **`orderedIds`** (DTO API réel `ReorderSegmentsDto`), **pas** `segmentIds`. Le schéma `reorderSegmentsSchema` de `@ridenrest/shared` (`{ segmentIds }`) **ne correspond pas** au DTO du controller — **ne pas s'en servir** pour le payload ; suivre le DTO. (Voir Dev Notes §Contrats → ⚠️ divergence.)

- [x] **T3 — Étendre `hooks/use-segments.ts` : mutations reorder / rename / delete** (AC: 1, 2, 3, 5)
  - [x] **Query key stricte** partagée : `const segmentsKey = (adventureId: string) => ['adventures', adventureId, 'segments'] as const`. Réutiliser celle déjà définie par `useSegments` en MOB-3.2 — **ne pas en créer une seconde**.
  - [x] `useReorderSegments(adventureId)` — `useMutation` **optimiste** (snapshot + rollback `onError`, invalidation `onSettled`). Pseudo-code complet en Dev Notes §Optimistic.
  - [x] `useRenameSegment(adventureId)` — `mutationFn: ({ segmentId, name }) => renameSegment(...)`. `onSuccess` : invalider `segmentsKey(adventureId)`. `onError` : `ErrorBanner`/erreur i18n. (Optionnel : optimiste sur le nom — non requis ; invalidation suffit.)
  - [x] `useDeleteSegment(adventureId)` — `mutationFn: (segmentId) => deleteSegment(...)`. `onSuccess` : invalider `segmentsKey(adventureId)` **ET** `['adventures', adventureId]` (la **distance totale** de l'aventure change → recomputée serveur). `onError` : message i18n.
  - [x] Toutes les mutations exposent `isPending` (consommé par l'UI pour désactiver actions / éviter le double-submit — AC5).
  - [x] **Pas** de `Alert.alert` pour les erreurs ; on remonte l'`ApiError` à l'écran qui affiche `<ErrorBanner />`. (La confirmation de **suppression** peut, elle, utiliser un dialogue — cf. T5.)

- [x] **T4 — Composant `components/adventure/segment-list.tsx` : liste draggable + distances** (AC: 1, 4)
  - [x] Nouveau fichier `apps/mobile/src/components/adventure/segment-list.tsx`. Props : `{ adventureId: string; segments: AdventureSegmentResponse[]; totalDistanceKm: number; onReorder, onRename, onDelete, onReplace, isReordering? }`.
  - [x] Liste **triable** via `react-native-reanimated-dnd` (`Sortable` / `SortableItem`, ou l'API documentée de la lib — voir Dev Notes §DnD). Chaque item = une **carte de segment** (réutiliser le composant de MOB-3.2 s'il existe — ex. `segment-card.tsx` — sinon une `Card` `components/ui/card`).
  - [x] **Drag handle** explicite (icône poignée) avec `accessibilityLabel={t('adventures.segments.reorderA11y')}`. Le segment reste **draggable quel que soit `parseStatus`** (pending/processing inclus) — le réordre est indépendant du parse.
  - [x] À la fin du drag (`onReorderComplete` / équivalent), calculer le nouvel ordre des **ids** et appeler `onReorder(orderedIds)` (→ mutation optimiste T3). Les items **doivent** être keyés par `segment.id` (string) — exigence de la lib.
  - [x] **Distances** (AC4) :
    - **Par segment** : afficher la **distance cumulée de début** (`cumulativeStartKm`) et la **longueur** (`distanceKm`) du segment, via un helper de **formatage** `formatKm(km)` (cf. T6). Ex. `"PK 0 → 42,3 km"` (cumulé départ + longueur) ou « 42,3 km · cumul 0 km ». Format à figer en i18n (clés `adventures.segments.distance*`).
    - **Total** : afficher `totalDistanceKm` (de l'`AdventureResponse`) en en-tête de liste, ex. « Distance totale : 128,6 km ».
    - ⚠️ **Anti-pattern interdit** : **NE PAS** importer un GPX ni recalculer une distance dans l'écran. Les valeurs `cumulativeStartKm`/`distanceKm`/`totalDistanceKm` sont **déjà calculées serveur** (`SegmentsService.recomputeCumulativeDistances`, via `@ridenrest/gpx`) et renvoyées par l'API. Le seul rôle mobile = **formater** (cf. §Distances).
  - [x] Segments en cours de parse (`distanceKm === 0`, `parseStatus !== 'done'`) : afficher un libellé d'attente (« Analyse en cours… ») au lieu d'une fausse distance 0 km.

- [x] **T5 — Enrichir `app/(app)/adventures/[id].tsx` : actions rename / delete (confirm) / replace** (AC: 2, 3, 5)
  - [x] Brancher `<SegmentList>` dans l'écran détail (créé en MOB-3.1/3.2). Passer `adventureId`, `segments` (de `useSegments`), `totalDistanceKm` (de l'aventure), et les handlers branchés sur les mutations T3.
  - [x] **Renommer** : entrée inline (toggle `Input` `components/ui/input`) ou petit modal ; submit → `useRenameSegment`. `Escape`/blur ferme ; nom vide → ignore. Anti double-submit via `isPending`.
  - [x] **Supprimer** : **confirmation requise** avant `useDeleteSegment`. Utiliser un dialogue de confirmation natif **acceptable ici** (`Alert.alert` est toléré pour une **confirmation d'action destructive**, à distinguer d'un *affichage d'erreur* — interdit, lui, via Alert) **ou** un composant modal de confirmation maison si MOB-3.1 en a introduit un (réutiliser en priorité). Libellés via i18n. Au succès, la liste se met à jour (invalidation).
  - [x] **Remplacer** : flux **delete + ré-upload**. Au tap « Remplacer », ouvrir le `gpx-uploader` (MOB-3.2) ciblant ce segment : (a) `useDeleteSegment(segmentId)` puis (b) déclencher l'upload du nouveau GPX (`POST …/segments`, nouveau segment `pending`). Réutiliser la mécanique d'upload existante — **ne pas** dupliquer la sélection de fichier `expo-document-picker`. Documenter l'ordre (delete d'abord, upload ensuite) ; en cas d'échec d'upload après delete, surfacer l'erreur (`ErrorBanner`) — le segment a été retiré, l'utilisateur peut ré-essayer l'ajout.
  - [x] États de chargement (AC5) : pendant reorder/rename/delete/replace, désactiver les actions concernées + indicateur ; erreurs → `<ErrorBanner />` inline.

- [x] **T6 — Formatage des distances (helper) + i18n** (AC: 4, 5)
  - [x] Helper `formatKm(km: number, locale?: string): string` dans `apps/mobile/src/lib/format/distance.ts` (créer le dossier si absent). Formate un nombre de km avec **1 décimale**, séparateur **localisé** (`,` en FR), suffixe « km ». Implémentation via `Intl.NumberFormat` (dispo Hermes) — ex. `new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(km)`. **Ne PAS** recalculer une distance ici — ce helper **formate** une valeur déjà fournie par l'API.
  - [x] Test unitaire co-localisé `distance.test.ts` (FR : `42.34 → "42,3"` ; `0 → "0"`).
  - [x] **i18n** : ajouter sous une **nouvelle** racine `adventures.segments.*` (et compléter `adventures.*` si MOB-3.1 a déjà amorcé une racine `adventures` distincte de `auth.adventures`) dans `locales/fr.json` **et** `en.json` :
    - `adventures.segments.totalDistance` (« Distance totale : {{km}} »)
    - `adventures.segments.cumulative` / `adventures.segments.length` (libellés cumul / longueur)
    - `adventures.segments.parsing` (« Analyse en cours… »)
    - `adventures.segments.reorderA11y` (label a11y du drag handle)
    - `adventures.segments.rename`, `adventures.segments.delete`, `adventures.segments.replace`
    - `adventures.segments.deleteConfirmTitle`, `adventures.segments.deleteConfirmBody` (« Supprimer « {{name}} » ? Cette action est irréversible. »), `common.cancel`, `common.delete`
    - `adventures.segments.errors.reorder`, `.rename`, `.delete`, `.replace` (messages génériques i18n)
    - ⚠️ **Parité FR/EN obligatoire** (la story MOB-2.2 a vérifié la parité — gate). **Zéro** chaîne en dur.

- [x] **T7 — Tests (Jest + RNTL, co-localisés)** (AC: tous — en particulier optimistic + rollback)
  - [x] **Emplacement** : tests qui **importent une route** (`app/(app)/adventures/[id].tsx`) → sous `src/__tests__/` (gotcha `require.context` Expo Router, cf. AGENTS.md). Tests de **hook**/composant/**helper** → co-localisés (`lib/**`, `components/**`).
  - [x] `use-segments.test.tsx` (ou extension de l'existant MOB-3.2) :
    - **reorder optimiste** : `mockResolvedValue` → le cache `['adventures', id, 'segments']` reflète le nouvel ordre **avant** résolution (assert via `queryClient.getQueryData`) ; invalidation en `onSettled`.
    - **reorder rollback** : `mockRejectedValue` (ApiError réseau) → le cache **revient** au snapshot initial ; pas de crash ; erreur exposée.
    - **delete** : invalide `segmentsKey` **et** `['adventures', id]`.
    - **rename** : appelle `renameSegment` avec `{ name }`, invalide la query.
  - [x] `segment-list.test.tsx` : rendu de la liste, **distances formatées** affichées (total + cumul/longueur via `formatKm`), libellé « Analyse en cours… » pour un segment non `done`, présence du drag handle (a11y label), appel `onReorder(orderedIds)` au reorder (mock de l'API de la lib DnD — voir §Tests). Mock de `react-native-reanimated-dnd` (cf. AGENTS.md : pas de JSX RN dans une factory `jest.mock` ; mock minimal qui rend les children et expose un déclencheur de reorder).
  - [x] `distance.test.ts` : formatage (T6).
  - [x] (Optionnel) test d'écran `src/__tests__/adventure-detail.test.tsx` : confirmation de suppression appelle la mutation après confirmation ; remplacement déclenche delete puis upload.
  - [x] Mocks : `@/lib/api/*` (réseau), `react-native-reanimated-dnd`, `expo-router`. **`userEvent`** (pas `fireEvent`) pour awaiter les updates async (RNTL v14 + React 19 — gotcha MOB-2.2).
  - [x] **Gate** : `pnpm --filter @ridenrest/mobile test|typecheck|lint` **verts** (+ `expo export` ne casse pas — aucun `*.test.tsx` sous `src/app/`).

- [ ] **T8 — Validation manuelle (device / dev-build)** (AC: 1, 2, 4) — laissée à l'utilisateur
  - [ ] Réordre par drag → ordre persiste après refetch ; couper le réseau pendant un reorder → **rollback** visible + message.
  - [ ] Supprimer (avec confirm) ; remplacer un segment (delete + nouvel upload `pending` → `done`).
  - [ ] Renommer un segment → nom persiste.
  - [ ] Distances : total + cumul par segment affichés et cohérents après reorder/delete (recompute serveur).

## Dev Notes

### Contrats API réels (Epic 3 web livré — INCHANGÉ)

Source vérifiée : `apps/api/src/segments/segments.controller.ts` + `segments.service.ts` + DTOs. Base path du controller : `@Controller('adventures/:adventureId/segments')`. **Auth** : `JwtAuthGuard` global (`apiFetch` injecte déjà le Bearer JWT). **Enveloppe** : `ResponseInterceptor` wrappe `{ data }` côté serveur ; `apiFetch` la **déballe** déjà → tes fonctions reçoivent le payload nu. Dates **ISO 8601**, **camelCase**.

**1) Réordre** — `PATCH /adventures/:adventureId/segments/reorder`
- **Body** : `{ "orderedIds": string[] }` (DTO `ReorderSegmentsDto` → `@IsArray() @ArrayNotEmpty() @IsUUID('4', { each: true })`).
- **Validation serveur** : `orderedIds` doit contenir **exactement** tous les ids de segments de l'aventure (même cardinalité, pas de doublon, pas d'inconnu) sinon **400 BadRequest** (`'orderedIds must match exactly all segment IDs for this adventure'`).
- **Effet** : réassigne `orderIndex` (0,1,2…) **puis** `recomputeCumulativeDistances` (recalcule `cumulativeStartKm` de chaque segment + `totalDistanceKm`/D+/D− de l'aventure).
- **Réponse** : `AdventureSegmentResponse[]` (liste **complète à jour**, triée par ordre).
- ⚠️ **Route order NestJS** : `PATCH …/reorder` est déclaré **avant** `PATCH …/:segmentId` côté serveur — non pertinent côté client, mais explique pourquoi `'reorder'` n'est pas pris pour un `:segmentId`.

**2) Renommer** — `PATCH /adventures/:adventureId/segments/:segmentId`
- **Body** : `{ "name": string }` (DTO `RenameSegmentDto` → `@Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)`). Le **trim** est fait serveur ; trimmer aussi côté client est un plus (cohérence autofill).
- **Erreurs** : **404** si segment introuvable / non possédé ; **400** si `segment.adventureId !== adventureId`.
- **Réponse** : `AdventureSegmentResponse` (segment à jour).

**3) Supprimer** — `DELETE /adventures/:adventureId/segments/:segmentId`
- **Body** : aucun. **Réponse** : `{ "deleted": true }`.
- **Effet** : supprime la ligne + le fichier GPX sur volume Fly.io (`fs.unlink` best-effort) + `recomputeCumulativeDistances` (gère **0 segment** → `totalDistanceKm = 0`). Émet un event `adventure.trace-updated` (invalidation cache POI Epic 4 — transparent côté mobile).
- **Erreur** : **404** si introuvable / non possédé.

**4) Remplacer** = **pas d'endpoint dédié** → **DELETE (3)** puis **POST** (création) :
`POST /adventures/:adventureId/segments` (multipart `file` + champ optionnel `name`, DTO `CreateSegmentDto`). Crée un segment `parseStatus: 'pending'`, `orderIndex = count` (append en fin), enqueue le job de parse BullMQ. **C'est le même endpoint que le `gpx-uploader` de MOB-3.2** → réutiliser ce composant, ne rien réécrire.

> ⚠️ **Divergence de schéma à connaître** : `@ridenrest/shared` exporte un `reorderSegmentsSchema = z.object({ segmentIds: z.array(z.string().uuid()).min(1) })`. **Ce schéma ne reflète PAS le contrat réel** du controller, qui attend **`orderedIds`** (DTO `ReorderSegmentsDto`). **Source de vérité = le DTO/controller**. → Ton payload doit être `{ orderedIds }`. (Ne pas « corriger » le schéma shared dans cette story — hors périmètre ; juste ne pas l'utiliser pour ce payload.)

### Type partagé (source de vérité des distances)

`AdventureSegmentResponse` (de `@ridenrest/shared`, **import racine uniquement** — jamais `@ridenrest/shared/types`) :
```ts
interface AdventureSegmentResponse {
  id: string; adventureId: string; name: string;
  orderIndex: number;
  cumulativeStartKm: number;   // ← distance cumulée au DÉBUT du segment (AC4)
  distanceKm: number;          // ← longueur du segment (AC4) ; 0 tant que non parsé
  elevationGainM: number | null; elevationLossM: number | null;
  parseStatus: 'pending' | 'processing' | 'done' | 'error';
  source: string | null;       // null = upload manuel, 'strava' = import Strava
  boundingBox: { minLat; maxLat; minLng; maxLng } | null;
  createdAt: string; updatedAt: string;  // ISO
}
```
`AdventureResponse.totalDistanceKm: number` → **distance totale** de l'aventure (AC4).

### Distances : formater, NE PAS recalculer (anti-pattern interdit)

L'architecture mobile interdit de calculer une distance dans l'écran (importer un GPX, faire de la haversine côté UI). Le calcul **vit côté serveur** : `SegmentsService.recomputeCumulativeDistances()` parcourt les segments triés, accumule `cumulativeStartKm`, et persiste `distanceKm` (rempli par le worker de parse via **`@ridenrest/gpx`** — `computeCumulativeDistances` / `totalDistance` / `haversine`). Le mobile **consomme** `cumulativeStartKm`, `distanceKm`, `totalDistanceKm` et se contente de **formater**.

→ **Le package `@ridenrest/gpx` n'est PAS importé par cet écran.** (Il est déjà en dépendance de `apps/mobile` pour d'autres usages futurs — carte/élévation —, mais cette story n'en importe rien : recalculer une distance ici serait l'anti-pattern explicitement proscrit.) Le seul code « distance » mobile de cette story = le helper de **formatage** `formatKm` (T6).

Affichage (proposition, à figer en i18n) :
- En-tête liste : `t('adventures.segments.totalDistance', { km: formatKm(totalDistanceKm) })`
- Carte segment `done` : cumul `formatKm(cumulativeStartKm)` + longueur `formatKm(distanceKm)`
- Carte segment non `done` : `t('adventures.segments.parsing')`

### DnD : choix de lib, justification, intégration

**Choix : `react-native-reanimated-dnd` (v2.x, ≥ 2.0.0).** Justification :
- La stack mobile est **Reanimated 4.3.1 + New Architecture (Fabric)** (pinné). C'est le critère discriminant.
- ❌ **`react-native-draggable-flatlist` (computerjazz, v4.0.3, dernier release mai 2025)** : peer `react-native-reanimated >= 2.8.0` **mais** breakages **confirmés** sur Reanimated 3/4 + Fabric (erreurs worklet « Tried to synchronously call a non-worklet function on the UI thread », drag multi-colonnes/web cassés) ; maintenance ralentie, **aucun** travail de compat Reanimated 4. → **rejeté** malgré sa popularité.
- ❌ **`react-native-reorderable-list` (omahili, v0.18.0)** : verrouillé sur **Reanimated 3** (≥ 3.12.0, déprécié), pas de support New Arch documenté, API pré-1.0 instable. → rejeté.
- ✅ **`react-native-reanimated-dnd` (v2.0.0, mars 2026)** : conçu **pour Reanimated 4 + New Architecture** (peer `react-native-reanimated >= 4.2.0`, `react-native-worklets >= 0.7.0` — satisfaits), Expo SDK 55+, TS complet, listes/grilles triables, 60fps. **Exige un dev-build** (pas Expo Go) — déjà le cas du projet (`expo-dev-client` présent).

**Babel / worklets** : `babel-preset-expo` (SDK 56) **auto-inclut** `react-native-worklets/plugin` dès que `react-native-worklets` est installé (cas présent). → **Ne RIEN ajouter** à `babel.config.js` (l'ajout manuel d'un double plugin worklets/reanimated casserait le build). Le `babel.config.js` actuel (preset `babel-preset-expo` + `nativewind/babel`) reste **inchangé**.

**`GestureHandlerRootView`** : requis par gesture-handler. **Manquant** dans `app/_layout.tsx` aujourd'hui → **l'ajouter** (envelopper l'arbre, p.ex. autour des providers). Sans lui, le drag ne déclenche pas les gestes.

**API de la lib (indicatif — vérifier la doc de la version résolue)** : composant conteneur `Sortable` + `SortableItem` (ou `useSortable`), keyé par `id` string, callback de fin de réordre exposant l'ordre final → en extraire `orderedIds`. **Ne pas se fier aveuglément** à ces noms : lire le README de la version installée et adapter. Le contrat **stable** côté story = « à la fin du drag, produire `orderedIds: string[]` et appeler `onReorder` ».

**Dev-build** (rappel `apps/mobile/AGENTS.md`) : après `pnpm add` du module natif + (le cas échéant) modif `app.config.ts`, faire `npx expo prebuild --clean -p ios` puis `npx expo run:ios` (Xcode 26.4). Un build **EAS cloud** prebuild proprement. Expo Go ne convient pas.

### Optimistic update + rollback (TanStack Query v5) — pseudo-code

Query key **stricte** : `['adventures', adventureId, 'segments']` (réutiliser celle de `useSegments`).

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reorderSegments } from '@/lib/api/adventures';
import type { AdventureSegmentResponse } from '@ridenrest/shared';

export function useReorderSegments(adventureId: string) {
  const qc = useQueryClient();
  const key = ['adventures', adventureId, 'segments'] as const;

  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderSegments(adventureId, orderedIds),

    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: key });               // évite l'écrasement par un refetch en vol
      const previous = qc.getQueryData<AdventureSegmentResponse[]>(key);
      if (previous) {
        const byId = new Map(previous.map((s) => [s.id, s]));
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((s): s is AdventureSegmentResponse => Boolean(s))
          .map((s, i) => ({ ...s, orderIndex: i }));            // optimisme cohérent (orderIndex local)
        qc.setQueryData(key, reordered);
      }
      return { previous };                                     // contexte de rollback
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);   // ROLLBACK
      // surface l'erreur i18n -> <ErrorBanner /> (t('adventures.segments.errors.reorder'))
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });                 // resynchronise sur le serveur (cumul recalculés)
    },
  });
}
```
> Le serveur **renvoie la liste recalculée** (cumuls/total) ; l'invalidation `onSettled` garantit que les `cumulativeStartKm` optimistes (qu'on ne tente pas de recalculer) sont remplacés par les valeurs serveur. **On n'écrit pas** de `cumulativeStartKm` optimiste — seul l'**ordre** est optimiste.

Delete (invalide **deux** clés car la distance totale de l'aventure bouge) :
```ts
onSuccess: () => {
  qc.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] });
  qc.invalidateQueries({ queryKey: ['adventures', adventureId] }); // totalDistanceKm recomputé serveur
}
```

### Fichiers à toucher

**Créer**
- `apps/mobile/src/components/adventure/segment-list.tsx` (liste draggable + distances)
- `apps/mobile/src/components/adventure/segment-list.test.tsx`
- `apps/mobile/src/lib/format/distance.ts` (helper `formatKm`)
- `apps/mobile/src/lib/format/distance.test.ts`
- (selon découpage MOB-3.2) éventuellement `apps/mobile/src/lib/api/segments.ts` si les fonctions ne logent pas dans `lib/api/adventures.ts`

**Modifier**
- `apps/mobile/src/lib/api/adventures.ts` (ou `segments.ts`) — `reorderSegments` / `renameSegment` / `deleteSegment` (T2)
- `apps/mobile/src/lib/hooks/use-segments.ts` — `useReorderSegments` / `useRenameSegment` / `useDeleteSegment` (T3) *(chemin réel à confirmer selon MOB-3.2 : `lib/hooks/` vs `hooks/`)*
- `apps/mobile/src/app/(app)/adventures/[id].tsx` — branchement `<SegmentList>` + actions rename/delete(confirm)/replace (T5)
- `apps/mobile/src/app/_layout.tsx` — wrapper `GestureHandlerRootView` (T1)
- `apps/mobile/src/lib/i18n/locales/fr.json` + `en.json` — clés `adventures.segments.*` (T6)
- `apps/mobile/package.json` — dépendance `react-native-reanimated-dnd` (T1)
- (tests) `apps/mobile/src/lib/hooks/use-segments.test.tsx`, `apps/mobile/src/__tests__/adventure-detail.test.tsx` (si test d'écran)

**Ne PAS modifier** : `babel.config.js` (worklets auto-inclus), backend (`apps/api/**`), `packages/shared` (divergence `reorderSegmentsSchema` documentée mais hors périmètre), `sprint-status.yaml` (géré hors story).

### Clés i18n (FR/EN — parité obligatoire)

Racine `adventures.segments.*` (+ `common.cancel` / `common.delete` si absents) :
`totalDistance`, `cumulative`, `length`, `parsing`, `reorderA11y`, `rename`, `delete`, `replace`, `deleteConfirmTitle`, `deleteConfirmBody`, `errors.reorder`, `errors.rename`, `errors.delete`, `errors.replace`. Aucune chaîne en dur ; tout via `t()`. Vérifier la **parité** FR↔EN (gate, comme MOB-2.2).

### Testing standards

- **Jest + RNTL** co-localisés ; tests important une **route** → `src/__tests__/` (gotcha `require.context`, AGENTS.md).
- **`userEvent`** (pas `fireEvent`) pour awaiter les updates async RHF/TanStack (RNTL v14 + React 19) — sinon `act()` qui fuit (vécu MOB-2.2).
- **Optimistic + rollback** explicitement testés (mock `mockResolvedValue` / `mockRejectedValue` sur l'API ; assertions sur `queryClient.getQueryData(['adventures', id, 'segments'])` avant/après).
- **Mock `react-native-reanimated-dnd`** dans une factory **sans JSX RN** (le transform NativeWind injecte une variable hors-scope interdite par jest) : exporter des composants qui rendent leurs `children` et un moyen de déclencher le callback de reorder (ex. via une prop appelée dans un `useEffect`, ou un mock qui rend un bouton de test programmatique). S'inspirer du mock `DndContext`/`simulate-drag-end` de la story web 3.3.
- Mocks réseau : `@/lib/api/*`. Mock `expo-router`.
- **Gate** : `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts + `expo export` OK.

### Project Structure Notes

- **Composants d'aventure** sous `src/components/adventure/` (nouveau dossier de domaine ; `src/components/ui/` reste réservé aux primitifs design-system, `src/components/shared/` aux composants transverses type `google-sign-in-button`).
- **Helpers** sous `src/lib/format/` (formatage pur, testable). **API** sous `src/lib/api/`. **Hooks** sous `src/lib/hooks/` (ou `src/hooks/` — **confirmer** le choix fait en MOB-3.2 et s'y aligner ; ne pas créer un second emplacement).
- **Routes** : `src/app/(app)/adventures/[id].tsx` (détail) — créée en MOB-3.1/3.2 ; cette story l'enrichit. **Aucun** `*.test.tsx` sous `src/app/`.
- NativeWind (`className`) partout ; style inline **uniquement** pour une couleur runtime (pas le cas ici). Réutiliser `Card`, `Button`, `Input`, `ErrorBanner`, `Skeleton` (`components/ui/*`).
- `GestureHandlerRootView` ajouté **une seule fois** dans le root layout (jamais par écran).

### Frontière de story

- **Inclus** : réordre DnD (optimistic + rollback), suppression (confirm), remplacement (delete + ré-upload via gpx-uploader 3.2), renommage segment, affichage distances (total + cumul par segment, formatées), i18n FR/EN, états loading, tests (dont optimistic/rollback).
- **Exclu** : création initiale d'aventure / liste (MOB-3.1) ; upload GPX initial / polling parse / picker fichier (MOB-3.2 — **réutilisés**, pas réécrits) ; import Strava (MOB-3.4) ; cache offline (MOB-3.5) ; carte/trace visuelle (MOB-4) ; toute modif serveur ; « correction » du `reorderSegmentsSchema` shared.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-3.3 — AC d'origine (l.636-658), FR-012/013/014/015/017]
- [Source: apps/api/src/segments/segments.controller.ts — endpoints réels : `@Patch('reorder')` (l.51), `@Patch(':segmentId')` (l.61), `@Delete(':segmentId')` (l.72), `@Post()` (l.27)]
- [Source: apps/api/src/segments/segments.service.ts — reorderSegments (l.114), deleteSegment (l.139), renameSegment (l.163), recomputeCumulativeDistances (l.175), toResponse (l.200)]
- [Source: apps/api/src/segments/dto/reorder-segments.dto.ts — `{ orderedIds: string[] }` (@IsUUID v4)]
- [Source: apps/api/src/segments/dto/rename-segment.dto.ts — `{ name }` (@Transform trim, @MaxLength 100)]
- [Source: apps/api/src/segments/dto/create-segment.dto.ts — `{ name? }` (multipart, upload géré séparément)]
- [Source: packages/shared/src/types/adventure.types.ts — AdventureSegmentResponse (l.92), AdventureResponse.totalDistanceKm (l.43)]
- [Source: packages/shared/src/schemas/segment.schema.ts — createSegmentSchema/replaceSegmentSchema]
- [Source: packages/shared/src/schemas/adventure.schema.ts — ⚠️ reorderSegmentsSchema `{ segmentIds }` ≠ DTO `{ orderedIds }`]
- [Source: packages/database/src/schema/adventure-segments.ts — orderIndex, cumulativeStartKm, distanceKm, parseStatus, source (champs réels)]
- [Source: packages/gpx/src/cumulative-distances.ts + haversine.ts + index.ts — calcul distances **serveur/worker** (NE PAS importer dans l'écran)]
- [Source: _bmad-output/implementation-artifacts/3-3-multi-segment-management-reorder-delete-replace.md — réordre DnD, optimistic+rollback, delete+replace, query key, anti-patterns (web)]
- [Source: _bmad-output/implementation-artifacts/3-4-adventure-segment-rename-and-delete.md — rename segment (mutation, route order), patterns]
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md — API & Communication (~l.663), Loading states & errors (~l.711), State Management (~l.638), Structure Patterns (~l.541), Anti-patterns (~l.762)]
- [Source: _bmad-output/implementation-artifacts/MOB-2-2-email-signup-login-password-reset.md — modèle de story mobile, gotchas RNTL (userEvent), i18n FR/EN, ErrorBanner, gate test/typecheck/lint]
- [Source: apps/mobile/src/lib/api/api-client.ts — `apiFetch` (Bearer, 401→refresh→retry, déballe `{ data }`, `ApiError`/`NETWORK_ERROR`)]
- [Source: apps/mobile/src/lib/query/query-client.ts — QueryClient (staleTime 30s, retry 2), conventions query keys]
- [Source: apps/mobile/src/components/ui/{button,card,error-banner,input,skeleton}.tsx — primitifs réutilisés]
- [Source: apps/mobile/app.config.ts + babel.config.js — plugins Expo, NativeWind ; worklets auto-inclus par babel-preset-expo SDK 56]
- [Source: apps/mobile/AGENTS.md — module natif → prebuild --clean ; tests jamais sous src/app/ ; mocks sans JSX RN]
- [Web research 2026-06 — compat libs DnD : draggable-flatlist v4.0.3 breakages Reanimated 4/Fabric ; reorderable-list v0.18 = Reanimated 3 ; react-native-reanimated-dnd v2.0.0 = Reanimated 4 + New Arch ; worklets plugin auto-inclus SDK 56]

## Dev Agent Record

### Agent Model Used

Opus 4.8 (claude-opus-4-8) via subagent BMAD dev-story.

### Debug Log References

- Gotcha NativeWind dans la factory `jest.mock('react-native-reanimated-dnd')` : `require('react-native')` OU `React.createElement` y déclenchent le transform NativeWind (`_ReactNativeCSSInterop`, variable hors-scope interdite par jest → `ReferenceError`). Résolu en retournant des `children` nus (les composants mockés ne rendent QUE `props.children`, aucun composant RN/`createElement`). Variable de capture du `onDrop` préfixée `mock*` (escape hatch documenté de babel-plugin-jest-hoist).
- Test d'écran : `mutate(...)` dans le `onPress` de confirmation `Alert` est asynchrone (microtask) → assertions enveloppées dans `waitFor` (sinon 0 appel observé).

### Completion Notes List

- **T1–T7 implémentés** ; **T8 (validation manuelle device/dev-build) déférée à l'utilisateur** (non cochée). Un dev-build est requis : la lib DnD + gesture-handler ne tournent pas sous Expo Go (`expo prebuild --clean -p ios` puis `expo run:ios`, cf. AGENTS.md). `babel.config.js` NON modifié (worklets auto-inclus par babel-preset-expo SDK 56). `app.config.ts` non modifié (pas de plugin Expo pour cette lib).
- **Lib DnD** : `react-native-reanimated-dnd@2.0.0` résolu (peer `react-native-reanimated >= 4.2.0` satisfait par 4.3.1). API utilisée : `Sortable` (data + renderItem) + `SortableItem` (keyé par `id`, `onDrop(id, position, allPositions)`) + `SortableItem.Handle` pour le drag handle a11y. `orderedIds` reconstruit en triant la map `allPositions` (id→position) à la fin du drag.
- **`GestureHandlerRootView`** ajouté une seule fois au root (`app/_layout.tsx`), au-dessus de `SafeAreaProvider`/`QueryProvider`.
- **T3 mutations** : `useReorderSegments` optimiste (snapshot + rollback `onError` + invalidation `onSettled`, seul l'ordre + `orderIndex` local sont optimistes — PAS les `cumulativeStartKm`, recalculés serveur à l'invalidation) ; `useRenameSegment` ({ segmentId, name }, invalide segments) ; `useDeleteSegment` (invalide segments ET `['adventures', id]`). Query key unique partagée `segmentsKey()` réutilisée par `useSegments`/`useUploadSegment`. Aucune `Alert.alert` pour les erreurs.
- **T4 `SegmentList`** : liste draggable + distances 100 % serveur (`cumulativeStartKm`/`distanceKm`/`totalDistanceKm`), aucune recompute UI. Segment non `done` → « Analyse en cours… ». Drag handle a11y. Actions rename/replace/delete désactivées pendant reorder/delete (`isReordering`).
- **T5 `[id].tsx`** : `<SegmentList>` branché ; rename via `RenameSegmentModal` (nouveau, calqué sur `RenameAdventureModal`) ; delete via confirmation `Alert` (tolérée pour action destructive) ; replace = delete confirmé PUIS `gpxUploader.pick()` au succès (ré-upload, pas d'endpoint dédié) ; erreurs de mutation inline via `<ErrorBanner />`.
- **T6** : helper pur `formatKm` (`Intl.NumberFormat`, 1 décimale, séparateur localisé, défensif sur valeurs non finies → `0`). i18n sous `adventures.segments.*` (FR + EN), parité globale vérifiée (155↔155 clés).
- **T7 tests** : `formatKm` (5), `use-segments` mutations dont optimistic+rollback explicites (4), `segment-list` (7), `adventure-detail` route sous `src/__tests__/` (3). `userEvent` (pas `fireEvent`). Aucun `*.test.*` sous `src/app/`.
- **Gates verts** : `typecheck` OK, `lint` OK (1 erreur `react/display-name` corrigée sur le mock GpxUploader), `test` 126/126 suites vertes (dont 19 tests MOB-3.3 nouveaux + existants).
- **Déviation mineure** : `RnFile`/upload réutilisés tels quels ; aucune fonction `replaceSegment` créée (conforme). Le `reorderSegmentsSchema` de `@ridenrest/shared` (`{ segmentIds }`) volontairement NON utilisé — payload `{ orderedIds }` aligné sur le DTO controller (divergence documentée, hors périmètre).

### File List

**Créés**
- `apps/mobile/src/components/adventure/segment-list.tsx`
- `apps/mobile/src/components/adventure/segment-list.test.tsx`
- `apps/mobile/src/components/adventure/rename-segment-modal.tsx`
- `apps/mobile/src/lib/format/distance.ts`
- `apps/mobile/src/lib/format/distance.test.ts`
- `apps/mobile/src/hooks/use-segments.test.tsx`
- `apps/mobile/src/__tests__/adventure-detail.test.tsx`

**Modifiés**
- `apps/mobile/src/lib/api/segments.ts` (reorderSegments / renameSegment / deleteSegment)
- `apps/mobile/src/hooks/use-segments.ts` (segmentsKey partagée + useReorderSegments / useRenameSegment / useDeleteSegment)
- `apps/mobile/src/app/(app)/adventures/[id].tsx` (branchement SegmentList + actions rename/delete/replace + ErrorBanner mutations)
- `apps/mobile/src/app/_layout.tsx` (GestureHandlerRootView au root)
- `apps/mobile/src/components/ui/icon.tsx` (GripVerticalIcon + RefreshCwIcon)
- `apps/mobile/src/lib/i18n/locales/fr.json` (clés adventures.segments.*)
- `apps/mobile/src/lib/i18n/locales/en.json` (clés adventures.segments.*)
- `apps/mobile/package.json` (dépendance react-native-reanimated-dnd@^2.0.0)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MOB-3-3 → review + last_updated)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-12 | 0.1 | Création story MOB-3.3 (ready-for-dev) — réordre DnD optimiste+rollback, suppression (confirm), remplacement (delete+ré-upload), renommage segment, distances (total+cumul formatées, source serveur), i18n FR/EN, tests. Contrats API réels (orderedIds), lib DnD `react-native-reanimated-dnd` (Reanimated 4 + New Arch). | bmad-create-story |
| 2026-06-13 | 1.0 | Implémentation T1–T7 (T8 device déférée user) : `react-native-reanimated-dnd@2.0.0` + `GestureHandlerRootView` ; API segments reorder/rename/delete ; mutations optimistes (reorder) + invalidations ; `SegmentList` draggable + distances serveur ; `formatKm` ; `RenameSegmentModal` ; i18n FR/EN parité ; 19 tests MOB-3.3 (optimistic+rollback explicites). Gates typecheck/lint/test verts (126 suites). Status → review. | Opus 4.8 (dev-story) |
