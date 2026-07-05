---
baseline_commit: 2c91eb94889d090f1857afc96ce8c1c39598f34d
---

# Story MOB-3.2 : Upload GPX, ajout de segments & notification de parsing

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **ajouter un ou plusieurs fichiers GPX à une aventure**,
So that **ma trace est analysée et affichable**.

> **Dépend de MOB-3.1** (liste/création/renommage/suppression d'aventures). MOB-3.1 livre le hook `hooks/use-adventures.ts`, l'écran liste `app/(app)/adventures/index.tsx` (réel, plus le placeholder), l'écran détail `app/(app)/adventures/[id].tsx` et `components/adventure/adventure-card.tsx`. **Au moment d'écrire cette story, MOB-3.1 est en `backlog`** (cf. `sprint-status.yaml`) : si elle n'est pas encore livrée, le dev de MOB-3.2 doit d'abord vérifier la présence de `[id].tsx` + `use-adventures.ts` et, à défaut, créer le strict minimum d'écran détail nécessaire pour héberger l'uploader (sans empiéter sur le périmètre liste/CRUD de MOB-3.1). **Le backend epic 3 est 100 % livré** (stories web `3-1`/`3-2`, `done`) — endpoint multipart, processor BullMQ, enum `parse_status`, schemas/types partagés : **rien à recréer côté serveur**.
>
> Cette story ajoute, côté mobile : `hooks/use-segments.ts` (upload multipart + polling status + retry), `components/adventure/gpx-uploader.tsx` (`expo-document-picker` + indicateur de progression), `components/adventure/segment-status-badge.tsx` (badge `pending`/`processing`/`done`/`error`) et `components/adventure/segment-card.tsx` (carte segment 4 états). MOB-3.3 **étendra** `use-segments.ts` (réordre / remplacement / suppression / renommage / distances cumulées) — cette story se limite à l'upload + le polling + la notification de fin.

## Acceptance Criteria

1. **Given** une aventure (écran détail `app/(app)/adventures/[id].tsx`)
   **When** je sélectionne un fichier GPX via `expo-document-picker` (UIDocumentPicker iOS / SAF Android)
   **Then** le fichier est uploadé en `multipart/form-data` à `POST /adventures/:adventureId/segments` et un segment est créé en statut `parse_status === 'pending'` (FR-011), puis ajouté à la liste via invalidation de la query `['adventures', adventureId, 'segments']`
   **And** pendant l'upload, un **indicateur de progression** est affiché sur le bouton/zone d'upload (jamais un spinner global bloquant l'écran), et le double-déclenchement est impossible (bouton désactivé tant que l'upload est en cours)
   **And** une sélection annulée par l'utilisateur (`result.canceled === true`) ne déclenche aucun appel réseau et ne produit aucune erreur

2. **Given** au moins un segment en parsing (`parse_status === 'pending'` **ou** `'processing'`)
   **When** le job serveur progresse
   **Then** le statut est rafraîchi via polling TanStack Query — `refetchInterval` conditionnel **3000 ms** tant qu'un segment est `pending`/`processing`, `false` sinon (polling arrêté) — sur la query key **stricte** `['adventures', adventureId, 'segments']`
   **And** le polling est **mis en pause hors-foreground** (couplage `focusManager` via `use-app-state-refetch`, déjà en place MOB-2.1) et reprend au retour `active`
   **And** à la fin du parsing (transition `pending`/`processing` → `done`), l'utilisateur est **notifié** par un feedback **in-app** (la carte du segment passe de skeleton à l'affichage `distanceKm` + D+/D- + badge « Analysé », et un message de succès in-app — bandeau/inline — confirme « Segment analysé ») (FR-019). **Les push notifications natives sont hors MVP** (cf. architecture-mobile §Native Capabilities & Background — `Push notifications ❌ skip MVP`)

3. **Given** un parsing échoué (transition `pending`/`processing` → `error`)
   **When** l'erreur est reportée par le serveur (le segment passe `parse_status === 'error'`)
   **Then** les données d'aventure précédentes sont **conservées** (les segments déjà `done` restent intacts ; le total distance/D+ de l'aventure n'est pas écrasé) (NFR-033)
   **And** l'erreur est affichée **clairement** sur la carte du segment fautif via `<ErrorBanner />` (jamais `Alert.alert`), avec un libellé i18n explicite et un bouton **« Réessayer »** qui relance l'upload (ouvre à nouveau le `gpx-uploader`)

## Tasks / Subtasks

- [x] **T1 — Dépendances natives Expo** (AC: 1)
  - [x] Installer `expo-document-picker` (sélection de fichier) **et** `expo-file-system` (lecture du contenu pour construire le `Blob`/upload), via `npx expo install expo-document-picker expo-file-system` depuis `apps/mobile` (pin la version compatible SDK 56 — **ne pas** ajouter manuellement dans `package.json` sans `expo install`, cf. `AGENTS.md`) → installé `expo-document-picker ~56.0.4` + `expo-file-system` **épinglé exact `56.0.7`** (cf. note crash dyld ci-dessous : `expo install` avait tiré `56.0.8`, désapparié de `expo-modules-core 56.0.15`).
  - [x] **CRITIQUE build natif** : ces deux modules sont natifs → après `expo install`, si un `ios/`/`android/` existe déjà sur disque, **régénérer** le projet natif (`npx expo prebuild --clean -p ios` puis `npx expo run:ios`) sinon `Cannot find native module 'ExpoDocumentPicker'` au boot (vécu en MOB-2.1 avec secure-store). Une build EAS cloud refait toujours un prebuild propre. Documenter dans les Completion Notes que le build natif local exige Xcode 26.4. → **prebuild + run:ios = action T10 (user)** : la gate auto (test/typecheck/lint + `expo export`) n'exige pas de build natif. Documenté dans Completion Notes.
  - [x] Mock Jest natif : ajouter `__mocks__/expo-document-picker.js` (et au besoin `expo-file-system`) — factory **sans JSX RN** (le transform NativeWind injecte une variable hors-scope interdite par jest) → `jest.fn()` qui retourne un résultat de picker contrôlable par test → `__mocks__/expo-document-picker.js` + `__mocks__/expo-file-system.js` (stub `File.size`).

- [x] **T2 — Étendre `apiFetch` pour l'upload multipart** (AC: 1)
  - [x] **Vérifier d'abord** : `apiFetch` gère **déjà** `FormData` (cf. `src/lib/api/api-client.ts` l.121-122 — `isFormData = options?.body instanceof FormData`, et l.130-131 omet le `Content-Type` pour laisser RN poser le boundary). **Aucune extension nécessaire** : on passe simplement un `FormData` en `body`. → vérifié (api-client.ts l.127-128 + l.137), aucune modif d'`api-client.ts`.
  - [x] **Gotcha React Native** : `FormData.append('file', { uri, name, type })` est la forme RN attendue (objet `{ uri, name, type }`, **pas** un `File`/`Blob` web). Le `uri` provient de `DocumentPicker` (`result.assets[0].uri`). Construire l'objet fichier RN dans `use-segments.ts`, pas dans `api-client.ts` (qui reste agnostique). → objet RN construit dans `segments.ts` (`uploadSegment`).
  - [x] **Progression d'upload** : `fetch` RN n'expose pas de `onUploadProgress` natif. Au MVP, l'« indicateur de progression » = état **indéterminé** (bouton `loading` + `ActivityIndicator` via le `Button` MOB-1.3, qui expose déjà `accessibilityState.busy`) **pendant** la requête `POST`. Documenter ce choix (progression déterministe = amélioration ultérieure via `expo-file-system` `createUploadTask`/`uploadAsync` avec callback — **non** requis ici). **Ne PAS** utiliser un overlay plein-écran bloquant. → `Button loading` (indéterminé), pas d'overlay.

- [x] **T3 — Méthodes API segments dans le client** (AC: 1, 2)
  - [x] Centraliser les appels segments. Deux options : (a) fonctions dans `src/lib/api/segments.ts`, ou (b) inline dans le hook `use-segments.ts`. **Recommandé** : `src/lib/api/segments.ts` avec :
    - `listSegments(adventureId): Promise<AdventureSegmentResponse[]>` → `apiFetch('/adventures/${adventureId}/segments')`
    - `uploadSegment(adventureId, file: { uri; name; type }, name?): Promise<AdventureSegmentResponse>` → construit le `FormData` (`append('file', file)` + `append('name', name)` si fourni) → `apiFetch('/adventures/${adventureId}/segments', { method: 'POST', body: formData })`
    → **PATH SANS préfixe `/api`** : `apiFetch` l'ajoute déjà (`API_BASE`, AGENTS.md) — corrige l'exemple Dev Notes qui suggérait `/api/...`.
  - [x] Types **uniquement** depuis `@ridenrest/shared` (import **racine**, jamais `@ridenrest/shared/types` — règle confirmée stories web 3.1/3.2) : `AdventureSegmentResponse`, `ParseStatus`.

- [x] **T4 — Hook `hooks/use-segments.ts`** (AC: 1, 2, 3)
  - [x] `useSegments(adventureId)` → `useQuery({ queryKey: ['adventures', adventureId, 'segments'], queryFn: () => listSegments(adventureId), refetchInterval, staleTime: 0 })`
    - `refetchInterval: (query) => query.state.data?.some(s => s.parseStatus === 'pending' || s.parseStatus === 'processing') ? 3000 : false` (AC2 + arrêt auto AC2) → extrait en helper pur `segmentsPollInterval`.
    - `staleTime: 0` : force un refetch au montage pour éviter d'afficher un `pending` périmé au retour sur l'écran (parité web 3.2 AC5). **Override local** du défaut global `30_000` (cf. `query-client.ts`).
  - [x] `useUploadSegment(adventureId)` → `useMutation({ mutationFn: ({ file, name }) => uploadSegment(adventureId, file, name), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] }) })`. Exposer `isPending` (→ état loading de l'uploader) et `error`/`reset`.
  - [x] **Détection de transition (notification fin parsing, AC2/AC3)** : exposer un helper de détection OU le faire dans le composant détail via `useRef<AdventureSegmentResponse[]>` (pattern web 3.2). Choix recommandé : encapsuler dans le hook un callback `onParsed(segment)` / `onParseError(segment)` déclenché par un `useEffect` comparant le snapshot précédent (`useRef`) au courant. **Ne PAS** utiliser `useState` pour le snapshot précédent (rerenders inutiles — cf. anti-pattern web 3.2). Le composant fournit les callbacks qui poussent un message in-app (cf. T6). → helper pur `detectParseTransitions(prev, cur)` + `useRef` + `useEffect`.
  - [x] **NFR-033 (conservation des données)** : aucune logique mobile ne doit supprimer/écraser les segments `done` quand un autre segment passe `error`. La query renvoie l'état serveur tel quel ; la carte en erreur est isolée. Documenter que c'est garanti côté serveur (le processor n'écrit que le segment fautif, `updateParseError` — cf. `gpx-parse.processor.ts` l.114) et que le mobile se contente d'afficher. → le mobile n'écrit jamais le cache segments ; il affiche l'état serveur tel quel.

- [x] **T5 — Composant `components/adventure/gpx-uploader.tsx`** (AC: 1, 3)
  - [x] Bouton « Ajouter un segment GPX » (libellé i18n). Au press → `DocumentPicker.getDocumentAsync({ type: 'application/gpx+xml' / '*/*', copyToCacheDirectory: true, multiple: false })`.
    - **Gotcha type MIME** : iOS/Android ne déclarent pas tous le UTI `application/gpx+xml`. Utiliser un `type` permissif (`['application/gpx+xml', 'application/xml', 'application/octet-stream', '*/*']` ou `*/*`) puis **valider l'extension `.gpx`** côté client (sur `result.assets[0].name`). Refuser et afficher une erreur i18n si l'extension n'est pas `.gpx`. → type permissif + validation extension `.gpx`.
  - [x] **Validation taille client** (parité web AC7 — belt-and-suspenders, le serveur revalide via `MAX_GPX_FILE_SIZE_BYTES`) : récupérer la taille (`result.assets[0].size` si fourni, sinon `FileSystem.getInfoAsync(uri).size`) et refuser **avant** tout réseau si `> MAX_GPX_FILE_SIZE_BYTES` (10 Mo — importer la constante depuis `@ridenrest/shared`), message i18n « Fichier trop volumineux (max 10 Mo) ». → `asset.size ?? new File(uri).size` (API SDK 56), import racine de la constante.
  - [x] `result.canceled === true` → no-op silencieux (AC1).
  - [x] Construire l'objet fichier RN `{ uri, name, type: 'application/gpx+xml' }` et appeler `useUploadSegment().mutate({ file })`.
  - [x] Pendant l'upload : `Button loading` (désactivé + `ActivityIndicator`, déjà géré par le primitif). **Jamais** d'overlay plein écran.
  - [x] Erreur d'upload (réseau / `ApiError`) → `<ErrorBanner />` inline sous le bouton, message i18n générique (et mappé `tooManyRequests`/`serverError`/`network` si on veut, optionnel MVP). **Try/catch obligatoire** sur le press (un rejet `fetch` lève `ApiError` `NETWORK_ERROR` — cf. patch MOB-2.2 : un `onSubmit` sans try/catch laisse l'UI sans feedback). → try/catch + `ErrorBanner` générique.
  - [x] Prop `onUploaded?(segment)` optionnelle pour fermer un éventuel flux « Réessayer ». → + handle impératif `ref.pick()` pour le retry.

- [x] **T6 — Composants `segment-status-badge.tsx` + `segment-card.tsx`** (AC: 2, 3)
  - [x] `components/adventure/segment-status-badge.tsx` : petit badge mappant `parseStatus` → libellé i18n + couleur :
    - `pending` → « En attente » (muted)
    - `processing` → « Analyse en cours » (accent/primary)
    - `done` → « Analysé » (success → token `primary`, pas de token `success` dans le DS)
    - `error` → « Échec » (destructive)
    - A11y : `accessibilityRole` neutre + texte lisible (pas seulement couleur). Storybook `segment-status-badge.stories.tsx` (variantes des 4 états) — convention archi (`components/adventure/*` dans le scope Storybook). → fait.
  - [x] `components/adventure/segment-card.tsx` : carte 4 états (parité web 3.2 Task 3) :
    - `pending`/`processing` → `<Skeleton />` (nom + distance) + `<SegmentStatusBadge />` + libellé d'état. **Annonce a11y** : `accessibilityLiveRegion="polite"` (Android) / `accessibilityRole="status"` pour les transitions. → `accessibilityRole="summary"` + live region Android.
    - `done` → nom, `${distanceKm.toFixed(1)} km`, élévation (`elevationGainM != null ? Math.round(...)+'m D+' : 'N/A'`, idem D- `elevationLossM`), badge « Analysé ». (Bouton « Afficher sur la carte » = **MOB carte ultérieure** → ne pas l'ajouter ici, ou le laisser désactivé avec libellé « Bientôt » ; **hors périmètre** de cette story.) → bouton carte non ajouté (hors périmètre).
    - `error` → `<ErrorBanner message={t('adventures.segments.parseFailed')} />` + bouton **« Réessayer »** (`onRetry`).
  - [x] Défensif : `distanceKm`/`elevationGainM`/`elevationLossM` peuvent être `0`/`null` même en `done` (segment pending recompute = 0) → libellés robustes.

- [x] **T7 — Intégration dans l'écran détail `app/(app)/adventures/[id].tsx`** (AC: 1, 2, 3)
  - [x] **Si MOB-3.1 a livré `[id].tsx`** : y brancher `useSegments(id)`, rendre la liste de `<SegmentCard>` (skeleton si `isPending`), le `<GpxUploader adventureId={id} />`, et la détection de transition (notification in-app succès/erreur). → MOB-3.1 a livré `[id].tsx` ; branché segments + uploader + notification.
  - [x] **Si `[id].tsx` n'existe pas encore** (MOB-3.1 non livrée) : créer un écran détail minimal qui lit `id` via `useLocalSearchParams`, charge l'aventure (réutiliser `use-adventures` si présent, sinon `apiFetch('/adventures/${id}')`) et héberge segments + uploader. **Ne pas** dupliquer la logique liste/CRUD d'aventures (périmètre MOB-3.1). → N/A (écran déjà présent).
  - [x] **Notification fin de parsing (in-app)** : monter le `useRef` snapshot + `useEffect` de transition (success → message in-app de succès ; error → déjà géré par la carte). Le « message in-app » MVP : un bandeau de confirmation transitoire en haut de liste (réutiliser un composant simple ; **pas** de lib toast tierce imposée — un état local + `<View>` stylé NativeWind suffit, ou réutiliser `ErrorBanner` pour le cas erreur). Documenter que push = hors MVP. → bandeau succès local (`bg-primary/10`), erreur via carte. Push hors MVP documenté.
  - [x] **Flux retry (AC3)** : bouton « Réessayer » sur la carte `error` → ouvre/scrolle vers le `<GpxUploader>` (state `showUploader`/scroll-to). Le segment en erreur **reste** dans la liste (suppression = MOB-3.3) — comportement identique au web 3.2. → `onRetry` → `uploaderRef.current.pick()` (rouvre le picker). Segment error conservé.

- [x] **T8 — i18n (FR + EN)** (AC: 1, 2, 3)
  - [x] Ajouter un bloc `adventures.segments.*` dans `locales/fr.json` **et** `en.json` (parité de clés obligatoire — la gate i18n vérifie l'alignement) :
    - `adventures.segments.addButton` / `adventures.segments.picking` / `adventures.segments.uploading`
    - `adventures.segments.status.pending` / `status.processing` / `status.done` / `status.error`
    - `adventures.segments.parsedSuccess` (notification succès, ex. « Segment « {{name}} » analysé »)
    - `adventures.segments.parseFailed` (« Analyse échouée — vérifiez le format du fichier GPX »)
    - `adventures.segments.retry`
    - `adventures.segments.fileTooLarge` (« Fichier trop volumineux (max 10 Mo) »)
    - `adventures.segments.invalidExtension` (« Sélectionnez un fichier .gpx »)
    - `adventures.segments.uploadError` (générique réseau/serveur)
    - `adventures.segments.distanceKm` / `adventures.segments.elevationGain` / `adventures.segments.elevationNA` (« N/A »)
    → + `elevationLoss`, `title`, `empty`, `loadFailed`. Parité FR/EN vérifiée (gate `i18n.config.test` verte).
  - [x] **Zéro chaîne en dur** dans les composants (toutes via `t()`).

- [x] **T9 — Tests (Jest + RNTL, co-localisés)** (AC: tous)
  - [x] `src/components/adventure/__tests__/segment-card.test.tsx` (ou co-localisé) : rendu des 4 états (`pending`/`processing` → skeleton + libellé ; `done` → distance/élévation + badge ; `error` → ErrorBanner + bouton, `onRetry` appelé au press). `elevationGainM: null` → « N/A ».
  - [x] `segment-status-badge.test.tsx` : les 4 mappings statut → libellé i18n.
  - [x] `gpx-uploader.test.tsx` : mock `expo-document-picker` → (a) sélection valide `.gpx` < 10 Mo appelle `mutate` avec `{ file: { uri, name, type } }` ; (b) `canceled` → aucun appel ; (c) fichier > 10 Mo → `ErrorBanner` taille, aucun appel réseau ; (d) extension non-`.gpx` → erreur, aucun appel ; (e) rejet réseau (`mockRejectedValue`/`ApiError`) → `ErrorBanner` générique. Utiliser **`userEvent`** (pas `fireEvent`) pour awaiter les updates async (RNTL v14 + React 19 — gotcha MOB-2.2).
  - [x] `use-segments.test.tsx` (ou test de logique pur) : `refetchInterval` retourne `3000` si un segment `pending`/`processing`, `false` si tous `done`/`error` (extraire la fonction `shouldPoll`/`pollInterval` et la tester en pur, comme web 3.2). Détection de transition `pending→done` déclenche le callback succès ; `pending→error` déclenche le callback erreur ; aucun callback si pas de transition. → `use-segments.test.ts` (test pur sur `segmentsPollInterval` + `detectParseTransitions`).
  - [x] Mocks : `@/lib/api/segments` (ou `@/lib/api/api-client`) et `expo-document-picker` mockés (aucun réseau réel). Wrapper `QueryClientProvider` pour les hooks. **Tests de hook/composant co-localisés** ; **aucun test sous `src/app/`** (gotcha `require.context` — un `*.test.tsx` sous `src/app` casse `expo export`). Si un test doit importer la **route** `[id].tsx`, le placer sous `src/__tests__/`. → tous sous `src/components/adventure/__tests__/` + `src/hooks/__tests__/`.
  - [x] `pnpm --filter @ridenrest/mobile test|typecheck|lint` **verts** + `expo export` OK (bundle sans fichiers de test). → **105 tests / 20 suites verts**, typecheck 0 erreur, lint clean, `expo export --platform ios` OK.

- [ ] **T10 — Validation manuelle (device)** (AC: 1, 2, 3) — ⏳ **DIFFÉRÉE PAR L'UTILISATEUR (build iPhone physique)** : le build natif démarre désormais OK sur simulateur (crash dyld corrigé, cf. Completion Notes), mais le **simulateur iOS ne permet pas d'importer un vrai `.gpx`** via le document picker (pas d'accès Fichiers/iCloud). La validation fonctionnelle de l'upload (sélection GPX → `pending` → polling → `done`/`error` → retry) sera faite par {user_name} sur un **build device physique** (revalidation prévue ultérieurement, vraisemblablement autour de MOB-3.4). Le code, les gates (typecheck/lint/105 tests/`expo export`) et le lancement natif sont validés.
  - [ ] Sélection `.gpx` valide → segment `pending` apparaît immédiatement (skeleton + badge) ; bouton upload désactivé pendant l'upload, pas de spinner plein écran.
  - [ ] Après quelques secondes : transition `processing` → `done`, distance/élévation affichées, message in-app de succès, **polling stoppe** (vérifier l'absence de requêtes répétées via logs/Network).
  - [ ] App en background pendant le parsing puis retour foreground → le polling reprend, statut à jour, pas de skeleton infini.
  - [ ] `.gpx` malformé → segment `error`, `ErrorBanner` clair + bouton « Réessayer » ; les segments `done` précédents **restent intacts** (NFR-033).
  - [ ] Fichier > 10 Mo / extension non-`.gpx` / sélection annulée → comportements attendus (erreur taille, erreur extension, no-op).

## Review Findings (Code Review 2026-06-13)

> 3 couches adversariales (Blind Hunter, Edge Case Hunter, Acceptance Auditor), aucune en échec. Bilan : AC1/AC2/AC3 + NFR-033 satisfaits, frontière de story respectée, claims T1–T9 véridiques. 1 décision, 4 patches, 4 différés, 10 écartés (bruit/faux positifs).

### Decision needed
- [x] [Review][Decision] Feedback in-app de parsing — **RÉSOLU (2026-06-13)** : (a) bandeau succès → **auto-dismiss ~4s** (→ patch P5) ; (b) échec de parsing → **report par la carte fautive seule** (conforme AC3) : `onParseError` reste exposé mais non câblé, aucun changement. [src/app/(app)/adventures/[id].tsx:46-65,86-95 ; src/hooks/use-segments.ts:655,692]

### Patches
- [x] [Review][Patch] Garde de ré-entrance à l'ouverture du picker — `handlePress` est `async` ; `upload.isPending` ne passe `true` qu'après résolution du picker (double-press dans cet intervalle → 2 pickers) et `ref.pick()` du retry contourne le bouton désactivé (retry pendant un upload en cours → uploads concurrents). Fix : flag busy synchrone (`pickingRef`) + court-circuit si `upload.isPending` ; au passage, câbler la clé i18n `picking` inutilisée. [apps/mobile/src/components/adventure/gpx-uploader.tsx:300-341]
- [x] [Review][Patch] Transition « fast-parse » manquée → pas de bandeau succès si le parsing se termine avant que le segment soit observé en `pending` (`detectParseTransitions` ignore `if (!before)`). Régression de parité vs web 3.2 qui gère `!prevSeg` (« segment apparu déjà done/error, BullMQ rapide ») + garde `if (segments.length>0)` sur l'enregistrement du ref. [apps/mobile/src/hooks/use-segments.ts:630-649,691] — fix + 2 tests fast-parse (done/error)
- [x] [Review][Patch] `segment.distanceKm.toFixed(1)` non protégé contre `null` alors que le commentaire du composant ET la parité web (`?? 0`) traitent le champ comme potentiellement null (le dénivelé est gardé, pas la distance) [apps/mobile/src/components/adventure/segment-card.tsx:447]
- [x] [Review][Patch] Commentaire trompeur : `upload.mutate` (vs `mutateAsync`) ne rejette jamais — le try/catch ne capture PAS les erreurs réseau (portées par `upload.isError`, déjà affichées). Corriger le commentaire (pas de changement de comportement). [apps/mobile/src/components/adventure/gpx-uploader.tsx:303-305]
- [x] [Review][Patch] (issu de la décision) Auto-dismiss du bandeau de succès `parsedMessage` après ~4s (`setTimeout` nettoyé au démontage / à chaque nouveau message) au lieu de rester sticky jusqu'au prochain upload [apps/mobile/src/app/(app)/adventures/[id].tsx:46-65,86-95]

### Deferred
- [x] [Review][Defer] `id` de route non durci (undefined → skeleton infini + path `/adventures/undefined/segments`) [apps/mobile/src/app/(app)/adventures/[id].tsx:35] — deferred, gardé par la branche parent ; la route garantit `id` en pratique
- [x] [Review][Defer] `new File(uri).size` qui lève rejette un fichier valide en `uploadError` générique (uniquement si `asset.size` absent) [apps/mobile/src/components/adventure/gpx-uploader.tsx:325] — deferred, cas rare (fallback seulement)
- [x] [Review][Defer] Fichier 0 octet / taille négative passe la validation taille client (le serveur rejette → carte error) [apps/mobile/src/components/adventure/gpx-uploader.tsx:325-329] — deferred, revalidation serveur (belt-and-suspenders)
- [x] [Review][Defer] Erreurs serveur 413/415 réduites au message générique `uploadError` (mapping granulaire `tooManyRequests`/`serverError`) [apps/mobile/src/components/adventure/gpx-uploader.tsx:356-358] — deferred, mapping marqué optionnel MVP par la story (T5)

## Dev Notes

### Backend epic 3 DÉJÀ livré — NE PAS recréer (source : `apps/api`, stories web `3-1`/`3-2` `done`)

**Endpoint d'upload réel** (`apps/api/src/segments/segments.controller.ts` l.27-49) :

```
POST /adventures/:adventureId/segments
Content-Type: multipart/form-data
Auth: Bearer <JWT>   (JwtAuthGuard global)
Body (form fields):
  - file : binaire GPX (champ "file" — FileInterceptor('file'), memoryStorage → file.buffer)  [REQUIS]
  - name : string optionnel (1..100) ; à défaut, nom dérivé du nom de fichier (".gpx" retiré)
Réponse : { data: AdventureSegmentResponse }   (enveloppe ResponseInterceptor — apiFetch déballe `.data`)
```

> ⚠️ **Préfixe `/api`** : `apiFetch` appelle `${EXPO_PUBLIC_API_URL}${path}`. Le web préfixe ses chemins par `/api/...`. **Vérifier le préfixe réel** attendu par le serveur NestJS mobile (global prefix). Les chemins exacts utilisés par le mobile en MOB-2.1 (`/api/auth/token`) confirment le préfixe `/api`. → Utiliser **`/api/adventures/${adventureId}/segments`** côté mobile (aligner sur le pattern web `api-client.ts` et l'usage existant de `apiFetch`). Confirmer au moment du dev en lisant un appel `apiFetch` data déjà branché (sinon tester les deux).

**Comportement serveur à la création** (`segments.service.ts` `createSegment` l.47-106) :
1. Vérifie l'ownership de l'aventure (404 si pas le propriétaire).
2. Revalide la taille (`MAX_GPX_FILE_SIZE_BYTES` = 10 Mo → 400 « Fichier trop volumineux (max 10 MB) »).
3. Écrit le fichier sur volume Fly.io `/data/gpx/{segmentId}.gpx`.
4. Insère la ligne `adventure_segments` avec **`parseStatus: 'pending'`**, `orderIndex` = count (append en fin), `cumulativeStartKm: 0`, `distanceKm: 0`.
5. `recomputeCumulativeDistances` (tout à 0 jusqu'au parse).
6. Enqueue BullMQ `gpx-processing` → job `parse-segment` `{ segmentId, storageUrl }`.
7. Retourne `AdventureSegmentResponse` (statut `pending`).

**Endpoint liste (polling)** : `GET /adventures/:adventureId/segments` → `{ data: AdventureSegmentResponse[] }` triés par `orderIndex` (`segments.controller.ts` l.82-89). C'est **la** query pollée.

**Valeurs réelles de `parse_status`** (⚠️ la spec d'epic dit `pending`/`processing`/`completed`/`failed` — **FAUX**). L'enum réel est :

```
packages/database/src/schema/adventure-segments.ts l.5 :
  parseStatusEnum = pgEnum('parse_status', ['pending', 'processing', 'done', 'error'])
packages/shared/src/types/adventure.types.ts l.7 :
  type ParseStatus = 'pending' | 'processing' | 'done' | 'error'
```

→ **Utiliser `'done'` (PAS `'completed'`) et `'error'` (PAS `'failed'`) partout.** Machine d'état (processor `gpx-parse.processor.ts`) :

```
'pending'    ← createSegment()
   ↓ job pris par le worker → setProcessingStatus()
'processing'
   ↓ parse OK → updateAfterParse({ parseStatus: 'done', distanceKm, elevationGainM, elevationLossM, geom, waypoints, boundingBox })
'done'
   ↓ parse KO → updateParseError()  (n'écrit QUE ce segment ; les autres restent intacts → NFR-033)
'error'
```

**Type de réponse réel** (`packages/shared/src/types/adventure.types.ts` l.92-106) — **import racine `@ridenrest/shared`** :

```ts
interface AdventureSegmentResponse {
  id: string
  adventureId: string
  name: string                 // jamais null (dérivé du filename si absent)
  orderIndex: number
  cumulativeStartKm: number
  distanceKm: number           // 0 tant que pending/processing
  elevationGainM: number | null   // null si GPX sans <ele>  → "N/A"
  elevationLossM: number | null   // null si GPX sans <ele>  → "N/A"
  parseStatus: ParseStatus     // 'pending' | 'processing' | 'done' | 'error'
  source: string | null        // null = upload manuel ; 'strava' = MOB-3.4
  boundingBox: { minLat; maxLat; minLng; maxLng } | null
  createdAt: string            // ISO 8601
  updatedAt: string
}
```

### Upload multipart en React Native (source : `api-client.ts` + archi §API)

`apiFetch` **supporte déjà** `FormData` — aucune extension à écrire :
- `src/lib/api/api-client.ts` l.121-122 : `isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData`.
- l.130-131 : si `isFormData`, **n'injecte pas** `Content-Type` (RN pose le boundary multipart lui-même). Le `Authorization: Bearer <JWT>` est injecté normalement + gère `401 → refresh → 1 retry`.
- Erreur réseau → `ApiError(status:0, code:'NETWORK_ERROR')` (jamais un `TypeError` brut).

**Forme RN du fichier** (différente du web) : en RN, on `append` un **objet** `{ uri, name, type }`, pas un `File`/`Blob` :

```ts
// dans src/lib/api/segments.ts
export async function uploadSegment(
  adventureId: string,
  file: { uri: string; name: string; type: string },
  name?: string,
): Promise<AdventureSegmentResponse> {
  const form = new FormData()
  // RN : objet {uri,name,type} casté (typings DOM FormData ne le connaissent pas)
  form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob)
  if (name) form.append('name', name)
  return apiFetch<AdventureSegmentResponse>(
    `/api/adventures/${adventureId}/segments`,
    { method: 'POST', body: form },
  )
}
```

**Indicateur de progression** : `fetch` RN n'a pas de callback de progression d'upload. MVP = indicateur **indéterminé** (le `Button` MOB-1.3 `loading` → `ActivityIndicator` + `accessibilityState.busy`). **Jamais** d'overlay plein écran (archi §Loading states & errors : « jamais blocage UI total »). Amélioration future (hors story) : `expo-file-system` `createUploadTask` / `uploadAsync` (FileSystemUploadType.MULTIPART) qui expose un callback de progression déterministe — à envisager si les GPX volumineux donnent un ressenti d'attente.

### Pattern polling (source : archi §API l.388, §Data l.350, web 3.2 — pattern central)

Query key **stricte** `['adventures', adventureId, 'segments']` (cohérence web). `refetchInterval` conditionnel + `staleTime: 0` :

```ts
// hooks/use-segments.ts (pseudo-code)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { AdventureSegmentResponse } from '@ridenrest/shared'
import { listSegments, uploadSegment } from '@/lib/api/segments'

// Pur, testable isolément (parité web 3.2 `shouldPoll`)
export function isParsing(segments?: AdventureSegmentResponse[]): boolean {
  return !!segments?.some(s => s.parseStatus === 'pending' || s.parseStatus === 'processing')
}

export function useSegments(
  adventureId: string,
  opts?: {
    onParsed?: (s: AdventureSegmentResponse) => void
    onParseError?: (s: AdventureSegmentResponse) => void
  },
) {
  const query = useQuery({
    queryKey: ['adventures', adventureId, 'segments'],
    queryFn: () => listSegments(adventureId),
    refetchInterval: (q) => (isParsing(q.state.data) ? 3000 : false), // AC2 : 3s ou stop
    staleTime: 0, // AC2/5 : pas de pending périmé au retour sur l'écran
  })

  // Détection de transition → notification fin parsing (AC2/AC3).
  // useRef (PAS useState) → pas de rerender sur écriture du snapshot.
  const prevRef = useRef<AdventureSegmentResponse[] | undefined>(undefined)
  useEffect(() => {
    const cur = query.data
    const prev = prevRef.current
    if (cur && prev) {
      for (const seg of cur) {
        const before = prev.find(p => p.id === seg.id)
        if (!before) continue
        const wasParsing = before.parseStatus === 'pending' || before.parseStatus === 'processing'
        if (!wasParsing) continue
        if (seg.parseStatus === 'done') opts?.onParsed?.(seg)
        else if (seg.parseStatus === 'error') opts?.onParseError?.(seg)
      }
    }
    prevRef.current = cur
  }, [query.data, opts])

  return query
}

export function useUploadSegment(adventureId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { file: { uri: string; name: string; type: string }; name?: string }) =>
      uploadSegment(adventureId, vars.file, vars.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] }),
  })
}
```

**Pause hors-foreground (déjà câblé, ne rien réécrire)** : `use-app-state-refetch.ts` (monté **une seule fois** au root `_layout.tsx`, MOB-2.1) pilote `focusManager.setFocused(status === 'active')`. TanStack Query v5 **suspend `refetchInterval` quand la query n'est pas "focused"** → le polling se met en pause en background et reprend au retour `active`, **sans code supplémentaire** dans cette story. Ne PAS ajouter un second listener `AppState` (anti-pattern archi l.802-803 : un seul listener centralisé).

### Choix « notification fin de parsing » = feedback **in-app** (PAS push)

Source : `architecture-mobile.md` §Native Capabilities & Background l.422 (`Push notifications ❌ skip MVP`), l.681 (« Notifications : Pas demandées au MVP »), l.113/313/1234 (push = V2). FR-019 (« l'utilisateur est notifié ») est satisfait au MVP par un **feedback in-app** :
- **Succès** : la `SegmentCard` passe de skeleton → carte `done` (distance/D+/badge « Analysé ») **et** un message in-app transitoire de succès (bandeau en tête de liste). Pas de lib toast tierce imposée : un état local `{ message }` + `<View>` NativeWind, ou réutiliser un composant simple. (Le web utilise Sonner ; pas d'équivalent imposé mobile au MVP — garder simple.)
- **Échec** : `<ErrorBanner />` sur la carte du segment (déjà inline, conforme archi l.716 « jamais Alert.alert »).

Documenter explicitement : **push APNs/FCM volontairement hors périmètre** (cohérent avec l'absence de background geoloc).

### Réutilisation du code mobile existant (lis-les avant d'écrire)

- `src/lib/api/api-client.ts` — `apiFetch` (Bearer, `401→refresh→retry`, déballe `{data}`, gère **déjà** `FormData`, `ApiError`/`NETWORK_ERROR`). **Rien à modifier.**
- `src/lib/query/query-client.ts` — `QueryClient` global (`staleTime: 30_000`, `retry: 2`). On **override** `staleTime: 0` localement sur la query segments.
- `src/lib/query/use-app-state-refetch.ts` — pause/reprise polling via `focusManager` (déjà monté root). **Rien à câbler.**
- `src/components/ui/error-banner.tsx` — `<ErrorBanner message />` (`accessibilityRole="alert"`). Réutiliser pour erreur upload + erreur parse.
- `src/components/ui/skeleton.tsx` — `<Skeleton className />` (Animated RN, masqué a11y). Réutiliser pour `pending`/`processing`.
- `src/components/ui/button.tsx` — `<Button label loading variant size />` ; `loading` → `ActivityIndicator` + `accessibilityState.busy`. Réutiliser pour le bouton upload (état progression) et « Réessayer ».
- `src/components/ui/card.tsx` — `Card`/`CardHeader`/`CardTitle`/`CardContent`. Réutiliser pour `SegmentCard`.
- `src/lib/cn.ts` — `cn()` (twMerge + clsx). NativeWind `className` partout, **aucun** style inline (sauf couleur runtime — pas le cas ici).
- `src/lib/i18n` — `useTranslation()` / `t()`. Clés FR par défaut + EN squelette (parité obligatoire).
- `@ridenrest/shared` — `AdventureSegmentResponse`, `ParseStatus`, `MAX_GPX_FILE_SIZE_BYTES` (import **racine**).

### Standards de test (source : archi §Tests l.723-731, AGENTS.md)

- Jest + RNTL co-localisés (`*.test.tsx`). **`userEvent`** (pas `fireEvent`) pour awaiter les updates async (RNTL v14 + React 19 — sinon `act()` overlapping casse les renders suivants, vécu MOB-2.2).
- **Aucun `*.test.tsx` sous `src/app/`** (gotcha `require.context` → casse `expo export`). Tests de route → `src/__tests__/`.
- Mocks natifs dans `__mocks__/` (`expo-document-picker`), factory **sans JSX RN** (transform NativeWind injecte une variable hors-scope interdite par jest → `jest.fn()`).
- Hooks testés via wrapper `QueryClientProvider`. Réseau **toujours** mocké (`@/lib/api/segments` ou `@/lib/api/api-client`).
- Gate : `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts + `expo export` OK.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/hooks/use-segments.ts
apps/mobile/src/lib/api/segments.ts
apps/mobile/src/components/adventure/gpx-uploader.tsx
apps/mobile/src/components/adventure/segment-card.tsx
apps/mobile/src/components/adventure/segment-status-badge.tsx
apps/mobile/src/components/adventure/segment-status-badge.stories.tsx   (Storybook — convention archi)
apps/mobile/__mocks__/expo-document-picker.js
apps/mobile/src/components/adventure/__tests__/segment-card.test.tsx
apps/mobile/src/components/adventure/__tests__/segment-status-badge.test.tsx
apps/mobile/src/components/adventure/__tests__/gpx-uploader.test.tsx
apps/mobile/src/hooks/__tests__/use-segments.test.tsx   (ou test pur de isParsing/transition)
```
**Modifs** :
```
apps/mobile/src/app/(app)/adventures/[id].tsx   (branchement segments+uploader ; créé par MOB-3.1, sinon créé ici a minima)
apps/mobile/src/lib/i18n/locales/fr.json        (bloc adventures.segments.*)
apps/mobile/src/lib/i18n/locales/en.json        (bloc adventures.segments.* — parité)
apps/mobile/package.json                          (expo-document-picker, expo-file-system via expo install)
apps/mobile/app.config.ts                         (si les plugins le requièrent — vérifier la doc SDK 56)
```
**Aucune** migration DB / modif serveur. **Aucune** modif de `sprint-status.yaml` dans le cadre de la rédaction de cette story.

### Frontière de story

- **Inclus** : sélection `expo-document-picker` + validation (extension/taille) + upload multipart, création segment `pending`, polling conditionnel 3s (pause foreground), notification in-app de fin de parsing (succès/échec), carte segment 4 états + badge, conservation des données précédentes (NFR-033), retry d'upload, i18n FR/EN, a11y, tests RNTL.
- **Exclu** (autres stories) : réordre / suppression / remplacement / renommage de segments + distances cumulées affichées → **MOB-3.3** ; import d'activité Strava (`source: 'strava'`) → **MOB-3.4** ; cache GPX local offline (`FileSystem.copyAsync /cache/gpx`) → **MOB-3.5** ; affichage carte (« Afficher sur la carte ») → epic carte ultérieur ; push notifications natives → **V2** ; progression d'upload **déterministe** → amélioration ultérieure ; toute modif serveur.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-3.2 (l.614-635)] — AC d'origine (note : `completed`/`failed` de la spec sont erronés → enum réel `done`/`error`)
- [Source: apps/api/src/segments/segments.controller.ts (l.27-89)] — `POST /adventures/:adventureId/segments` multipart (`FileInterceptor('file')`), `GET .../segments`
- [Source: apps/api/src/segments/segments.service.ts (l.47-106)] — `createSegment` : ownership, taille, write volume, `parseStatus:'pending'`, enqueue BullMQ
- [Source: apps/api/src/segments/dto/create-segment.dto.ts] — champ `name` optionnel (1..100)
- [Source: apps/api/src/segments/jobs/gpx-parse.processor.ts (l.52-117)] — machine d'état `processing`→`done`/`error`, `updateParseError` isole le segment fautif (NFR-033)
- [Source: packages/database/src/schema/adventure-segments.ts (l.5)] — `parseStatusEnum: 'pending'|'processing'|'done'|'error'`
- [Source: packages/shared/src/types/adventure.types.ts (l.7, l.92-106)] — `ParseStatus`, `AdventureSegmentResponse`
- [Source: packages/shared/src/constants/gpx.constants.ts (l.17)] — `MAX_GPX_FILE_SIZE_BYTES` = 10 Mo
- [Source: _bmad-output/implementation-artifacts/3-1-create-adventure-upload-gpx-segment.md] — upload multipart + création segment `pending` + data flow (web)
- [Source: _bmad-output/implementation-artifacts/3-2-parse-status-polling-notification.md] — **pattern central** : `refetchInterval` conditionnel, `staleTime:0`, détection de transition `useRef`, carte 4 états, retry
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md §Native Capabilities (l.416-424)] — `expo-document-picker`, push `❌ skip MVP`
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md §API & Communication (l.382-392)] — `refetchInterval` conditionnel sur `parse_status`, fetch natif, error format
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md §Loading states & errors (l.711-719)] — Skeleton/ActivityIndicator, `ErrorBanner` inline jamais `Alert.alert`
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md §Data Architecture (l.337-356) + flow Upload GPX (l.914-926)] — `['adventures', id, 'segments']`, polling 3s, stop sur `done`
- [Source: apps/mobile/src/lib/api/api-client.ts (l.116-180)] — `apiFetch` gère déjà `FormData` (pas de `Content-Type`), Bearer, `401→refresh→retry`, `ApiError`
- [Source: apps/mobile/src/lib/query/use-app-state-refetch.ts] — `focusManager` pause/reprise polling (MOB-2.1)
- [Source: apps/mobile/AGENTS.md] — modules natifs → `expo prebuild --clean`, tests jamais sous `src/app/`, mocks sans JSX RN, `userEvent`
- [Source: _bmad-output/implementation-artifacts/MOB-2-2-email-signup-login-password-reset.md] — modèle de story mobile (RHF/Zod, ErrorBanner, gate, try/catch onSubmit)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code — skill bmad-dev-story)

### Debug Log References

- `pnpm --filter @ridenrest/mobile typecheck` → 0 erreur (après correction Storybook : `args` requis pour un composant à prop obligatoire).
- `pnpm --filter @ridenrest/mobile lint` → clean.
- `pnpm --filter @ridenrest/mobile test` → **20 suites / 105 tests verts** (88 existants + 17 nouveaux). 1ʳᵉ passe : `use-segments.test.ts` échouait au load (chaîne d'import `segments → api-client → @better-auth/expo/client` ESM non transpilé) → corrigé en mockant `@/lib/api/segments` (helpers testés purs).
- `npx expo export --platform ios` → bundle OK (gotcha `require.context` évité : tous les tests hors `src/app/`).

### Completion Notes List

- **Décision PATH `/api`** : l'exemple Dev Notes suggérait `/api/adventures/...`, mais l'`api-client.ts` actuel ajoute **déjà** le préfixe `/api` (`API_BASE = EXPO_PUBLIC_API_URL + /api`, cf. AGENTS.md + `adventures.ts`). → façade segments alignée sur chemin **propre** `/adventures/:id/segments`. (Le point « confirmer au dev » de la story est ainsi tranché.)
- **`apiFetch` inchangé** (T2) : `FormData` déjà géré (pas de `Content-Type` injecté → RN pose le boundary). Objet fichier RN `{ uri, name, type }` construit dans `segments.ts`.
- **Polling** : `refetchInterval` = `segmentsPollInterval(data)` (helper pur, 3000 ms si un segment `pending`/`processing`, sinon `false`). `staleTime: 0` (override local). Pause/reprise foreground = `focusManager` (use-app-state-refetch, MOB-2.1) — **rien à câbler**, aucun 2ᵉ listener AppState.
- **Notification fin parsing** : helper pur `detectParseTransitions(prev, cur)` + `useRef` (pas de `useState` → zéro rerender) dans `useSegments`. Succès → bandeau in-app local (`bg-primary/10`) ; échec → `ErrorBanner` sur la carte. **Push natif volontairement hors MVP** (archi §Native Capabilities).
- **NFR-033** : le mobile n'écrit jamais le cache segments — il affiche l'état serveur tel quel ; la carte `error` est isolée (conservation garantie serveur via `updateParseError`).
- **Token couleur** : pas de token `success` dans le design system → `primary` (vert de marque) pour l'état `done`.
- **Retry (AC3)** : `GpxUploader` expose un handle impératif `ref.pick()` (forwardRef) ; le bouton « Réessayer » de la carte `error` rouvre le picker. Le segment en erreur reste dans la liste (suppression = MOB-3.3).
- **Indicateur de progression** : indéterminé (`Button loading` + `ActivityIndicator`), jamais d'overlay plein écran. Progression déterministe (`expo-file-system` UploadTask) = amélioration ultérieure hors story.
- **⚠️ Build natif requis avant T10** : `expo-document-picker`/`expo-file-system` sont natifs → `npx expo prebuild --clean -p ios` puis `npx expo run:ios` (Xcode **26.4** requis, cf. AGENTS.md) sinon `Cannot find native module 'ExpoDocumentPicker'` au boot. Une build EAS cloud refait toujours un prebuild propre. `app.config.ts` **non modifié** (pas de plugin de config requis pour l'usage de base de ces deux modules).
- **🐛 Crash dyld au lancement (corrigé en post-build device)** : au 1er `expo run:ios`, l'app crashait au boot (`Symbol not found: ExpoModulesCore.Record.from(dictionary:appContext:)` référencé par `ExpoFileSystem`). Cause : `expo install` avait résolu `expo-file-system 56.0.8` (autorisé par la plage `~56.0.7` du `bundledNativeModules` de `expo@56.0.9`, donc non signalé par `expo install --check`), mais 56.0.8 est compilé contre `expo-modules-core 56.0.16` (ajoute `Record.from(dictionary:)`/`from(object:)`), absent de `modules-core 56.0.15` épinglé par le SDK. **Fix** : `expo-file-system` épinglé **exact `56.0.7`** (version appariée à `modules-core 56.0.15`) → `expo prebuild --clean -p ios` → `expo run:ios` : **app lancée sans crash** sur iPhone 17 Pro (simulateur). Gates re-vérifiées vertes après downgrade (typecheck 0, 105 tests). NB : nettoyage du cache CocoaPods `External` tenté d'abord mais inefficace (le précompilé `ExpoModulesCore 56.0.15` est re-téléchargé tel quel) — c'est bien un désappariement de versions, pas un cache périmé.
- **T10 (validation device)** : reste à dérouler les scénarios fonctionnels (sélection GPX, polling, retry…) — le build natif est désormais opérationnel.

### File List

**Ajouts**
- `apps/mobile/src/lib/api/segments.ts`
- `apps/mobile/src/hooks/use-segments.ts`
- `apps/mobile/src/components/adventure/gpx-uploader.tsx`
- `apps/mobile/src/components/adventure/segment-card.tsx`
- `apps/mobile/src/components/adventure/segment-status-badge.tsx`
- `apps/mobile/src/components/adventure/segment-status-badge.stories.tsx`
- `apps/mobile/__mocks__/expo-document-picker.js`
- `apps/mobile/__mocks__/expo-file-system.js`
- `apps/mobile/src/components/adventure/__tests__/segment-card.test.tsx`
- `apps/mobile/src/components/adventure/__tests__/segment-status-badge.test.tsx`
- `apps/mobile/src/components/adventure/__tests__/gpx-uploader.test.tsx`
- `apps/mobile/src/hooks/__tests__/use-segments.test.ts`

**Modifications**
- `apps/mobile/src/app/(app)/adventures/[id].tsx` (branchement segments + uploader + notification in-app)
- `apps/mobile/src/lib/i18n/locales/fr.json` (bloc `adventures.segments.*`)
- `apps/mobile/src/lib/i18n/locales/en.json` (bloc `adventures.segments.*` — parité)
- `apps/mobile/package.json` (+ `expo-document-picker`, `expo-file-system` via `expo install`)
- `pnpm-lock.yaml`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MOB-3-2 → in-progress → review)
- `_bmad-output/implementation-artifacts/MOB-3-2-gpx-upload-segments-parse-notification.md` (frontmatter `baseline_commit`, cases, Dev Agent Record, Change Log, Status)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-12 | 0.1 | Création story MOB-3.2 (ready-for-dev) — upload GPX `expo-document-picker` + multipart via `apiFetch` (FormData déjà supporté), création segment `pending`, polling `refetchInterval` 3s conditionnel sur query `['adventures', id, 'segments']` (pause foreground via `focusManager`), notification fin de parsing **in-app** (push hors MVP), carte segment 4 états + badge, conservation données NFR-033, retry, i18n FR/EN, tests RNTL. Enum réel `done`/`error` (spec `completed`/`failed` corrigée). Backend epic 3 réutilisé tel quel. | bmad-create-story (Story Context Engineer) |
| 2026-06-13 | 0.3 | Fix crash dyld au lancement device : `expo-file-system` épinglé **exact `56.0.7`** (au lieu de `56.0.8` tiré par `expo install`, désapparié de `expo-modules-core 56.0.15` → `Symbol not found: Record.from(dictionary:appContext:)`). `prebuild --clean` + `run:ios` → app lancée OK sur simulateur. Gates re-vérifiées (typecheck 0, 105 tests). | bmad-dev-story (Amelia) |
| 2026-06-13 | 0.2 | Implémentation T1-T9 (review). Façade `segments.ts` (chemin propre `/adventures/:id/segments`, `/api` ajouté par `apiFetch`), hook `use-segments.ts` (polling conditionnel 3s via helper pur `segmentsPollInterval` + `staleTime:0` + détection de transition pure `detectParseTransitions`/`useRef`), `gpx-uploader.tsx` (picker + validation extension/taille + upload indéterminé + `ref.pick()` retry), `segment-status-badge.tsx` + `segment-card.tsx` (4 états, a11y live region), intégration `[id].tsx` (segments + uploader + bandeau succès in-app), i18n FR/EN. Mocks Jest `expo-document-picker`/`expo-file-system`. **17 nouveaux tests, gates verts** (105 tests/20 suites, typecheck, lint, `expo export` iOS). T10 (validation device + build natif Xcode 26.4) laissée à l'utilisateur. | bmad-dev-story (Amelia) |
