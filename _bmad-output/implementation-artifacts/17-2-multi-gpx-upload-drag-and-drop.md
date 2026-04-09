# Story 17.2: Upload multi-GPX & drag'n'drop de fichiers

Status: ready-for-dev

> **Ajouté 2026-04-09** — Deuxième story de l'Epic 17 (Quality of Life). Objectif : permettre l'upload de plusieurs fichiers GPX en une seule opération, avec une zone de drag & drop dans le dialog existant. L'API backend n'est PAS modifiée — le frontend boucle séquentiellement sur `POST /adventures/:id/segments` pour chaque fichier.

## Story

As a **cyclist preparing a multi-day adventure**,
I want to upload multiple GPX files at once via file picker or drag & drop,
So that I can quickly add all my daily segments without repeating the upload process for each file.

## Acceptance Criteria

### A — Zone de drop & sélection multi-fichiers

1. **Given** l'utilisateur ouvre le dialog d'upload GPX (`showUploadForm = true`),
   **When** le dialog s'affiche,
   **Then** une zone de drop est visible avec bordure tiretée, une icône d'upload, et le texte "Glissez vos fichiers GPX ici ou cliquez pour sélectionner".

2. **Given** l'utilisateur clique sur la zone de drop,
   **When** le file picker natif s'ouvre,
   **Then** l'attribut `multiple` est activé sur l'`<input type="file">` — l'utilisateur peut sélectionner plusieurs fichiers `.gpx` simultanément.

3. **Given** l'utilisateur drag & drop un ou plusieurs fichiers `.gpx` sur la zone,
   **When** les fichiers sont déposés,
   **Then** les fichiers sont ajoutés à une liste d'attente affichée sous la zone de drop, chaque fichier montrant : nom, taille (en Mo), et un bouton de suppression (✕).

4. **Given** l'utilisateur drag & drop des fichiers non-GPX (`.pdf`, `.jpg`, etc.),
   **When** le drop event se déclenche,
   **Then** seuls les fichiers `.gpx` sont acceptés — les autres sont rejetés avec un warning visible (toast ou inline).

### B — Validation client-side

5. **Given** un fichier ajouté dépasse 10 Mo (`MAX_GPX_FILE_SIZE_BYTES`),
   **When** le fichier est ajouté à la liste,
   **Then** le fichier est immédiatement marqué en erreur ("Fichier trop volumineux (max 10 Mo)") et exclu du batch d'upload — les autres fichiers valides ne sont pas affectés.

6. **Given** un fichier n'a pas l'extension `.gpx`,
   **When** l'utilisateur tente de l'ajouter (via input ou drop),
   **Then** le fichier est rejeté avec un message d'erreur — seuls les `.gpx` sont ajoutés à la liste.

### C — Upload séquentiel avec progression

7. **Given** des fichiers valides sont dans la liste d'attente,
   **When** l'utilisateur clique "Envoyer",
   **Then** les fichiers sont uploadés **séquentiellement** (un appel API par fichier à `POST /adventures/:id/segments`), avec :
   - Un indicateur d'état par fichier (en attente → en cours → succes / erreur)
   - La progression globale ("2 / 5 fichiers envoyés")

8. **Given** une erreur API survient pendant l'upload séquentiel (ex : erreur réseau sur le fichier 3/5),
   **When** l'erreur est interceptée,
   **Then** le fichier en erreur affiche un état d'erreur avec un bouton "Réessayer" — les fichiers déjà uploadés gardent leur état de succes — les fichiers restants sont en pause, l'utilisateur peut reprendre ou annuler.

### D — Complétion & invalidation cache

9. **Given** tous les fichiers du batch sont uploadés avec succes,
   **When** le dernier upload se termine,
   **Then** le dialog se ferme automatiquement, la liste des segments est rafraîchie (invalidation TanStack Query sur `['adventures', adventureId, 'segments']` + `['adventures', adventureId]`), et un toast de succes s'affiche ("X segments ajoutés").

10. **Given** l'upload est en cours,
    **When** l'utilisateur tente de fermer le dialog (clic overlay, Escape),
    **Then** la fermeture est bloquée tant que l'upload est en cours (même pattern que l'actuel `uploadPending`).

### E — Rétrocompatibilité

11. **Given** le workflow d'upload single-file existant,
    **When** cette story est implémentée,
    **Then** l'endpoint API `POST /adventures/:id/segments` n'est PAS modifié — le frontend gère le multi-fichier en bouclant séquentiellement.

## Tasks / Subtasks

### Volet A — Refonte du composant GpxUploadForm

- [ ] Task 1 — Refactorer `gpx-upload-form.tsx` pour supporter multi-fichiers (AC: #1, #2, #3)
  - [ ] 1.1 — Remplacer le state `selectedFile: File | null` par `pendingFiles: PendingFile[]` (avec type `{ id: string, file: File, status: 'pending' | 'uploading' | 'success' | 'error', error?: string }`)
  - [ ] 1.2 — Ajouter l'attribut `multiple` sur l'input file
  - [ ] 1.3 — Remplacer le `<input>` seul par une zone de drop visuelle (bordure tiretée, icône Upload, texte indicatif)
  - [ ] 1.4 — Afficher la liste des fichiers en attente sous la zone de drop (nom, taille, bouton ✕ pour retirer, indicateur d'état)

### Volet B — Drag & drop natif HTML5

- [ ] Task 2 — Implémenter le drag & drop sur la zone de drop (AC: #3, #4)
  - [ ] 2.1 — Gérer `onDragOver` (preventDefault + visual feedback: bordure highlight)
  - [ ] 2.2 — Gérer `onDragLeave` (retour au style normal)
  - [ ] 2.3 — Gérer `onDrop` : extraire les fichiers, filtrer `.gpx`, ajouter à `pendingFiles`
  - [ ] 2.4 — Afficher un warning inline si des fichiers non-GPX sont rejetés au drop

### Volet C — Validation client-side

- [ ] Task 3 — Valider chaque fichier à l'ajout (AC: #5, #6)
  - [ ] 3.1 — Vérifier l'extension `.gpx` (case-insensitive)
  - [ ] 3.2 — Vérifier la taille (`MAX_GPX_FILE_SIZE_BYTES` importé depuis `@ridenrest/shared`)
  - [ ] 3.3 — Marquer les fichiers invalides en erreur dans la liste (sans bloquer les valides)
  - [ ] 3.4 — Empêcher les doublons (même nom de fichier déjà dans la liste)

### Volet D — Upload séquentiel

- [ ] Task 4 — Implémenter la boucle d'upload séquentiel (AC: #7, #8, #9, #10)
  - [ ] 4.1 — Boucle `for...of` avec `await createSegment(adventureId, file)` par fichier (PAS `Promise.all`)
  - [ ] 4.2 — Mettre à jour le statut de chaque `PendingFile` au fur et à mesure (pending → uploading → success/error)
  - [ ] 4.3 — Afficher la progression globale ("X / Y fichiers envoyés")
  - [ ] 4.4 — En cas d'erreur : pauser la boucle, afficher "Réessayer" sur le fichier en erreur, permettre de reprendre ou annuler
  - [ ] 4.5 — Appeler `trackGpxUploaded()` (analytics) pour chaque fichier uploadé avec succes
  - [ ] 4.6 — Quand tous les fichiers sont en succes : fermer le dialog, invalider `['adventures', adventureId, 'segments']` + `['adventures', adventureId]`, toast "X segments ajoutés"

### Volet E — Intégration dans adventure-detail.tsx

- [ ] Task 5 — Adapter le dialog dans `adventure-detail.tsx` (AC: #10)
  - [ ] 5.1 — Le dialog existant (`showUploadForm`) reste le conteneur
  - [ ] 5.2 — `DialogDescription` mis à jour : "Glissez vos fichiers GPX ou sélectionnez-les depuis votre appareil."
  - [ ] 5.3 — `onPendingChange` continue de bloquer la fermeture du dialog pendant l'upload

### Tests

- [ ] Task 6 — Tests unitaires du composant refactoré
  - [ ] 6.1 — Test : ajout de fichiers via input → apparaissent dans la liste
  - [ ] 6.2 — Test : rejet des fichiers non-GPX
  - [ ] 6.3 — Test : rejet des fichiers > 10 Mo
  - [ ] 6.4 — Test : suppression d'un fichier de la liste (bouton ✕)
  - [ ] 6.5 — Test : upload séquentiel → progression affichée
  - [ ] 6.6 — Test : erreur sur un fichier → état erreur + bouton Réessayer visible
  - [ ] 6.7 — Test : tous succes → `onSuccess` appelé

## Dev Notes

### Architecture de la solution

```
apps/web/src/app/(app)/adventures/[id]/_components/
├── gpx-upload-form.tsx             ← REFACTORER — passer de single-file à multi-file avec DnD
├── adventure-detail.tsx            ← MODIFIER LÉGER — mettre à jour DialogDescription
├── adventure-detail.test.tsx       ← MODIFIER — adapter le mock GpxUploadForm si nécessaire
```

### Composant actuel à refactorer

Le fichier `gpx-upload-form.tsx` (104 lignes) gère actuellement :
- Un `<input type="file" accept=".gpx">` single-file
- Un `useMutation` pour `createSegment(adventureId, file)`
- Validation client-side (extension + taille)
- `onSuccess` callback pour fermer le dialog
- `onPendingChange` callback pour bloquer la fermeture

Ce composant sera refactoré en place (PAS de nouveau fichier) pour supporter multi-fichiers + drag & drop. L'interface `Props` reste identique (`adventureId`, `onSuccess`, `onPendingChange`).

### Type PendingFile

```ts
interface PendingFile {
  id: string          // crypto.randomUUID() pour key React
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}
```

### Zone de drop — Pattern HTML5 natif

Utiliser les événements HTML5 natifs (`onDragOver`, `onDragLeave`, `onDrop`) sur un `<div>` wrapper. PAS de librairie tierce (react-dropzone) — le HTML5 DnD API est suffisant pour ce cas.

```tsx
const [isDragOver, setIsDragOver] = useState(false)

<div
  className={cn(
    "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
    isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
  )}
  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
  onDragLeave={() => setIsDragOver(false)}
  onDrop={handleDrop}
  onClick={() => inputRef.current?.click()}
>
  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
  <p className="text-sm text-muted-foreground">
    Glissez vos fichiers GPX ici ou cliquez pour sélectionner
  </p>
  <input ref={inputRef} type="file" accept=".gpx" multiple className="hidden" onChange={handleFileChange} />
</div>
```

### Upload séquentiel — PAS useMutation

Ne PAS utiliser `useMutation` de TanStack Query pour la boucle multi-fichier — `useMutation` gère un seul appel à la fois. Utiliser un state local + `for...of` loop dans une fonction async :

```ts
const [isUploading, setIsUploading] = useState(false)

async function handleUploadAll() {
  setIsUploading(true)
  let successCount = 0
  
  for (const pending of pendingFiles) {
    if (pending.status === 'success') { successCount++; continue } // skip déjà uploadés
    
    updateFileStatus(pending.id, 'uploading')
    try {
      await createSegment(adventureId, pending.file)
      updateFileStatus(pending.id, 'success')
      successCount++
      trackGpxUploaded()
    } catch {
      updateFileStatus(pending.id, 'error', 'Échec de l\'upload')
      break // pause la boucle, l'utilisateur décide
    }
  }
  
  const allDone = pendingFiles.every(f => f.status === 'success')
  if (allDone) {
    queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })
    queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
    toast.success(`${successCount} segment${successCount > 1 ? 's' : ''} ajouté${successCount > 1 ? 's' : ''}`)
    onSuccess?.()
  }
  setIsUploading(false)
}
```

**Important** : `onPendingChange(isUploading)` doit être appelé via `useEffect` pour garder le dialog bloqué pendant l'upload (même pattern qu'actuellement).

### `trackGpxUploaded()` — Analytics

L'import `trackGpxUploaded` existe déjà dans `adventure-detail.tsx` mais PAS dans `gpx-upload-form.tsx`. Il faudra l'importer depuis `@/lib/analytics` dans le composant refactoré. Appeler une fois par fichier uploadé avec succes.

### Imports existants à réutiliser

- `createSegment` depuis `@/lib/api-client` — endpoint `POST /adventures/:id/segments` (FormData)
- `MAX_GPX_FILE_SIZE_BYTES` depuis `@ridenrest/shared` — 10 Mo
- `Button` depuis `@/components/ui/button` — boutons "Envoyer" (size="lg") et "Annuler"
- `DialogFooter` depuis `@/components/ui/dialog` — footer du dialog existant
- `Upload` icon depuis `lucide-react` — icône dans la zone de drop

### DialogFooter — Boutons

Le footer doit contenir :
- **"Envoyer"** (`size="lg"`) — disabled si aucun fichier valide en attente ou si upload en cours
- Le label change dynamiquement : "Envoyer" → "Upload en cours... (X/Y)" pendant l'upload
- Pas de bouton Annuler explicite — la croix du dialog et l'overlay gèrent la fermeture (bloquée pendant upload)

### Pattern button sizes (rappel project-context)

- Tous les boutons dans `DialogFooter` → `size="lg"` (44px WCAG touch target)
- `DialogFooter` a `[&_button]:min-h-[44px]` comme filet de sécurité

### Attention

- **PAS de librairie tierce** (react-dropzone, etc.) — HTML5 DnD API natif suffit
- **PAS de `Promise.all`** — upload séquentiel pour ne pas surcharger BullMQ
- **PAS de modification backend** — l'endpoint `POST /adventures/:id/segments` reste inchangé
- **PAS de `useMutation`** pour le batch — gérer l'état manuellement (le `useMutation` actuel sera remplacé)
- **Dédoublonnage** : si un fichier avec le même nom est déjà dans la liste, ne pas l'ajouter une seconde fois
- **Reset de l'input** : après chaque sélection via l'input, reset `inputRef.current.value = ''` pour permettre de re-sélectionner les mêmes fichiers
- **Le composant reste `'use client'`** — il utilise useState, useRef, useEffect

### Test patterns — Story 17.1

Story 17.1 a établi les patterns de test avec Vitest + @testing-library/react + mock de modules. Suivre les mêmes patterns :
- Mock `createSegment` via `vi.mock('@/lib/api-client')`
- Mock `@tanstack/react-query` si nécessaire (ou wrapper avec `QueryClientProvider` dans le test)
- `vi.mock('@/lib/analytics')` pour vérifier les appels `trackGpxUploaded`

### References

- [Source: apps/web/src/app/(app)/adventures/[id]/_components/gpx-upload-form.tsx] — composant actuel à refactorer (104 lignes)
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx:510-525] — dialog existant qui contient le form
- [Source: apps/web/src/lib/api-client.ts:89-103] — `createSegment()` endpoint
- [Source: packages/shared/src/constants/gpx.constants.ts:17] — `MAX_GPX_FILE_SIZE_BYTES = 10 * 1024 * 1024`
- [Source: apps/web/src/lib/analytics.ts] — `trackGpxUploaded()` analytics
- [Source: _bmad-output/planning-artifacts/epics.md:3304-3356] — AC et technical notes de l'epic
- [Source: _bmad-output/implementation-artifacts/17-1-versioning-app-release-notes-popup.md] — patterns tests Vitest de la story précédente

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
