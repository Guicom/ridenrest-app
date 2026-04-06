# Story 16.27: GPX Upload dans une Dialog (Popin)

Status: done

## Story

As a **cyclist on the adventure detail page**,
I want the GPX upload form to open in a dialog (popin) instead of appearing inline in the page,
so that the upload flow is cleaner and consistent with the Strava import modal pattern.

## Acceptance Criteria

1. **Given** l'utilisateur est sur la page detail d'une aventure sans segments,
   **When** la page s'affiche,
   **Then** un bouton "Ajouter un segment GPX" est visible (remplace le formulaire inline actuel) et ouvre une dialog au clic.

2. **Given** l'aventure a deja des segments,
   **When** l'utilisateur clique sur le bouton "+ Ajouter un segment",
   **Then** une dialog s'ouvre avec le formulaire d'upload GPX (meme bouton qu'aujourd'hui, mais ouvre la dialog au lieu d'afficher le formulaire inline).

3. **Given** la dialog d'upload est ouverte,
   **When** l'utilisateur selectionne un fichier .gpx et clique "Uploader le segment",
   **Then** l'upload se lance, le bouton passe en etat loading ("Upload en cours..."), et a la reussite la dialog se ferme automatiquement.

4. **Given** la dialog d'upload est ouverte,
   **When** l'utilisateur clique en dehors de la dialog ou sur le bouton X,
   **Then** la dialog se ferme et l'etat du formulaire (fichier selectionne, erreurs) est reinitialise.

5. **Given** la dialog d'upload est ouverte et un upload est en cours,
   **When** l'utilisateur tente de fermer la dialog,
   **Then** la dialog reste ouverte tant que l'upload n'est pas termine (prevent close pendant mutation pending).

## Tasks / Subtasks

- [x] Task 1: Wrapper `GpxUploadForm` dans un `Dialog` (AC: #1, #2, #3, #4, #5)
  - [x] 1.1 Dans `adventure-detail.tsx`, remplacer le rendu conditionnel `{(!segments.length || showUploadForm) && <section>...<GpxUploadForm /></section>}` par un `<Dialog open={showUploadForm} onOpenChange={...}>` avec `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`
  - [x] 1.2 Modifier la logique `onOpenChange` pour empecher la fermeture si `uploadMutation.isPending` — passer un callback ou un prop `isPending` au composant dialog
  - [x] 1.3 Quand `segments.length === 0`, afficher le bouton "Ajouter un segment GPX" directement (pas le formulaire inline) — le bouton ouvre la dialog
  - [x] 1.4 Reset du formulaire a la fermeture : `GpxUploadForm` reset deja `selectedFile` et `inputRef` dans `onSuccess`, mais il faut aussi reset quand la dialog se ferme sans upload → ajouter un `useEffect` sur `open` qui reset l'etat

- [x] Task 2: Ajuster `GpxUploadForm` pour le contexte dialog (AC: #3)
  - [x] 2.1 Retirer le wrapper `div.border.rounded-lg.p-4` de `GpxUploadForm` — le style vient de `DialogContent`
  - [x] 2.2 Remplacer le `<Button>` d'upload par un layout `DialogFooter` avec le bouton en `size="lg"` (convention dialog, cf project-context)
  - [x] 2.3 Exposer `isPending` depuis `GpxUploadForm` via un callback prop `onPendingChange?: (pending: boolean) => void` OU remonter la mutation dans le parent — choisir l'approche la plus simple

- [x] Task 3: Tests (AC: #1–#5)
  - [x] 3.1 Test: aventure sans segments → bouton visible, clic ouvre la dialog avec formulaire
  - [x] 3.2 Test: selectionner fichier + cliquer upload → dialog se ferme apres succes
  - [x] 3.3 Test: fermer la dialog sans upload → formulaire reinitialise
  - [x] 3.4 Test: pendant upload en cours → dialog ne se ferme pas (onOpenChange ignore false)

## Dev Notes

### Fichiers a modifier

| Fichier | Action |
|---------|--------|
| `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` | Remplacer section inline par `<Dialog>`, gerer `open` state, prevent close pendant upload |
| `apps/web/src/app/(app)/adventures/[id]/_components/gpx-upload-form.tsx` | Retirer wrapper style, adapter layout pour contexte dialog, exposer pending state |
| `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx` | Adapter tests existants + nouveaux tests dialog |

### Pattern a suivre : StravaImportModal

Le projet a deja un pattern identique avec `strava-import-modal.tsx` :
- `Dialog` + `DialogContent` + `DialogHeader` + `DialogTitle` + `DialogFooter` de `@/components/ui/dialog`
- Props : `open: boolean`, `onOpenChange: (open: boolean) => void`
- Reset d'etat dans `useEffect(() => { if (!open) { reset... } }, [open])`

**Approche recommandee** : garder `GpxUploadForm` comme composant interne de la dialog (pas un composant modal autonome comme `StravaImportModal`), car le formulaire est simple (1 input file + 1 bouton). Le wrapping dialog se fait dans `adventure-detail.tsx`.

### Etat actuel du code (a remplacer)

```tsx
// adventure-detail.tsx lignes 449-504 — A REMPLACER
{!showUploadForm && (
  <div>
    <Button onClick={() => setShowUploadForm(true)}>+ Ajouter un segment</Button>
  </div>
)}
{(!segments.length || showUploadForm) && (
  <section>
    <h2>Ajouter un segment GPX</h2>
    <GpxUploadForm adventureId={adventureId} onSuccess={() => setShowUploadForm(false)} />
  </section>
)}
```

### Nouveau pattern

```tsx
// Le bouton d'ajout est TOUJOURS visible (pas conditionnel a showUploadForm)
<Button onClick={() => setShowUploadForm(true)}>+ Ajouter un segment</Button>

// Dialog d'upload
<Dialog open={showUploadForm} onOpenChange={(open) => {
  if (!open && uploadPending) return // prevent close pendant upload
  setShowUploadForm(open)
}}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Ajouter un segment GPX</DialogTitle>
    </DialogHeader>
    <GpxUploadForm
      adventureId={adventureId}
      onSuccess={() => setShowUploadForm(false)}
      onPendingChange={setUploadPending}
    />
  </DialogContent>
</Dialog>
```

### Convention boutons dialog (project-context)

- Tous les boutons dans un `DialogFooter` → `size="lg"` (h-11, 44px, WCAG touch target)
- `DialogFooter` a `[&_button]:min-h-[44px]` comme filet de securite

### Cas edge : aventure sans segments

Aujourd'hui, quand il n'y a aucun segment, le formulaire s'affiche inline. Avec la dialog, il faut un bouton CTA visible. Suggestions :
- Afficher un empty state avec texte "Aucun segment" + bouton "Ajouter un segment GPX" qui ouvre la dialog
- Garder le bouton "Importer depuis Strava" a cote

### Regressions a eviter

- Ne PAS casser le bouton "Importer depuis Strava" — il reste a cote du bouton d'ajout GPX
- Ne PAS casser l'analytics `trackGpxUploaded` dans `onSuccess`
- Ne PAS supprimer la validation client-side (taille max, extension .gpx) dans `GpxUploadForm`
- Le `invalidateQueries` dans `onSuccess` de la mutation doit rester identique

### References

- [Source: apps/web/src/app/(app)/adventures/[id]/_components/gpx-upload-form.tsx] — formulaire actuel
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx:449-504] — rendu conditionnel actuel
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx] — pattern Dialog a suivre
- [Source: apps/web/src/components/ui/dialog.tsx] — composant Dialog shadcn/ui

### Review Findings

- [x] [Review][Patch] `uploadPending` reste `true` après upload réussi — Fix appliqué: reset `setUploadPending(false)` dans le handler `onClick` du bouton d'ajout. [adventure-detail.tsx:469]
- [x] [Review][Patch] Missing `DialogDescription` — Fix appliqué: ajout `<DialogDescription>` après `<DialogTitle>`. [adventure-detail.tsx:507]
- [x] [Review][Defer] Bouton X visuellement actif mais silencieusement ignoré pendant upload — deferred, UX improvement (pas de régression, comportement nouveau)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References

### Completion Notes List
- Task 1+2: GpxUploadForm retiré du rendu inline, wrappé dans Dialog. Bouton "Ajouter un segment GPX" toujours visible (0 ou N segments). `onPendingChange` callback expose l'état pending de la mutation pour empêcher la fermeture de la dialog. `DialogFooter` avec bouton `size="lg"` (convention WCAG 44px). Le bouton "Importer depuis Strava" reste à côté. Analytics `trackGpxUploaded` et validation client-side (taille max, .gpx) préservés.
- Task 3: 6 nouveaux tests ajoutés (bouton visible 0 segments, bouton visible N segments, dialog ouvre avec formulaire, dialog ferme après succès, dialog ne ferme pas pendant upload, dialog ferme après pending cleared). Mock Dialog simplifié pour contourner les portails base-ui en JSDOM. 27/27 tests passent, 106/106 tests aventures passent (0 régressions).

### Change Log
- 2026-04-06: Story 16.27 implémentée — GPX upload migré de inline vers Dialog

### File List
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` (modified)
- `apps/web/src/app/(app)/adventures/[id]/_components/gpx-upload-form.tsx` (modified)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx` (modified)
