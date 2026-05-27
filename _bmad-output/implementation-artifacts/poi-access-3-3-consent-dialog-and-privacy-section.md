# Story POI-Access 3.3 : `AccessConsentDialog` popin RGPD + Section Privacy Settings + helper `roundCoordinate`

Status: ready-for-dev

<!-- Dépend de : 3.2 (MeController endpoints), 3.1 (endpoint Live), 2.4 (useAccess pattern). -->

## Story

As a **end user using Live mode for the first time**,
I want to be asked for explicit consent before my GPS position is sent for access route calculation, and to be able to revoke that consent later from my settings,
So that I keep control over my privacy data per RGPD principles.

## Acceptance Criteria

1. **Given** le helper `apps/web/src/lib/privacy.ts`, **When** je le crée, **Then** :
   - Export `roundCoordinate(coord: number): number` qui retourne `Math.round(coord * 10_000) / 10_000` (4 décimales = ~11m)
   - Test unitaire couvre : positif standard, négatif standard, déjà arrondi, 0, valeurs extrêmes (±90, ±180)
   - Aucune dépendance externe (function pure)

2. **Given** le composant `apps/web/src/components/poi-access/AccessConsentDialog.tsx`, **When** je l'implémente, **Then** :
   - Props : `{ open: boolean; onChoose: (consent: boolean) => void }`
   - Utilise `<Dialog>` shadcn/ui avec :
     - Title : `"🛰️ Calcul d'itinéraire d'accès précis"`
     - Description : `"Pour calculer la distance cyclable réelle vers ce point depuis votre position actuelle, votre position (arrondie à ~10 m) sera envoyée à notre serveur de routage. Aucune donnée GPS n'est conservée."`
     - Italique en bas : `"Modifiable à tout moment dans Paramètres > Confidentialité"`
     - Footer : 2 boutons taille `lg` (cf. project-context §Button Component : `lg = h-11` pour WCAG touch target dialog)
       - `[Refuser]` (variant outline) → `onChoose(false)`
       - `[Autoriser]` (variant default) → `onChoose(true)`
   - Non dismissable autrement (pas de clic outside, pas de Escape) — c'est une décision explicite requise

3. **Given** un user en mode Live clique sur un POI pour la première fois, **When** le frontend détecte `profile.liveAccessConsent === null`, **Then** :
   - La popin `AccessConsentDialog` s'affiche (`open: true`)
   - Le store `useLiveModeStore.accessConsentChecked` passe à `true` (évite la re-demande dans la session courante même si user ferme sans choisir)
   - Sur "Autoriser" → `PATCH /me/settings { liveAccessConsent: true }` (Story 3.2 endpoint) puis déclenchement du calcul itinéraire (refetch `useAccess`)
   - Sur "Refuser" → `PATCH /me/settings { liveAccessConsent: false }` puis fallback vol d'oiseau immédiat (pas d'appel calcul access)

4. **Given** le composant frontend qui envoie la position GPS au backend (via `useAccess` en mode Live), **When** il prépare le body de la requête, **Then** :
   - Il applique `roundCoordinate(gps.lat)` et `roundCoordinate(gps.lng)` AVANT envoi
   - La position non-arrondie ne quitte JAMAIS le client (vérifié en review code + test)
   - L'origin envoyée est `{ type: 'gps', lat: roundedLat, lng: roundedLng }`

5. **Given** la section `apps/web/src/app/(app)/settings/_components/privacy-section.tsx`, **When** je la crée, **Then** :
   - Composant `<PrivacySection>` à intégrer dans la page Settings existante
   - Card shadcn/ui avec title "Confidentialité"
   - Contenu : `<Switch>` shadcn/ui avec label "Calcul d'itinéraire d'accès précis en mode Live"
   - Description explicative : `"Envoie votre position GPS arrondie (~10 m) à notre serveur pour calculer les itinéraires d'accès cyclables réels. Aucune donnée n'est conservée."`
   - Le switch est `checked` uniquement si `liveAccessConsent === true` (ni `false`, ni `null` ne coche)
   - Changer le switch → `PATCH /me/settings { liveAccessConsent: <newValue> }` via `useUpdateMeSettings()` mutation
   - Toast success/error (réutiliser pattern Story 2.6)

6. **Given** les hooks TanStack Query, **When** je les crée :
   - `apps/web/src/lib/queries/me-settings.ts` exporte `useMeSettings()` (GET) et `useUpdateMeSettings()` (PATCH)
   - Query key : `['me', 'settings']` (cf. project-context §TanStack Query convention)
   - Mutation invalide la query après success
   - Mutation déclenche `queryClient.invalidateQueries({ queryKey: ['poi-access'] })` après succès (force refetch des access avec nouveau consent)

7. **Given** le store `useLiveModeStore` existant, **When** je l'étends, **Then** :
   - Ajout `accessConsentChecked: boolean` (default `false` — reset à chaque mount du mode Live)
   - Action `markAccessConsentChecked: () => void`
   - Action `resetAccessConsentChecked: () => void` (appelée au unmount du mode Live)

8. **Given** le flow complet test manuel, **When** je le déroule, **Then** :
   - User new (consent null) entre en Live → clique POI → popin s'affiche
   - Choisit "Autoriser" → PATCH OK → toast → calcul access lancé → polyline + métriques affichées
   - User revient en Live plus tard → clique POI → PAS de popin (consent true persistant en DB)
   - User va Settings > Confidentialité → toggle off → toast → DB updated → event backend → ses calcul access ne se font plus précis
   - User refait Live + POI → fallback vol d'oiseau directement (pas de popin re-demandée car consent=false ≠ null)

9. **Given** les tests, **When** je les écris :
   - `privacy.test.ts` : tests unitaires `roundCoordinate`
   - `AccessConsentDialog.test.tsx` : render open, click refuser/autoriser → onChoose callé avec bonne valeur
   - `PrivacySection.test.tsx` : render avec consent true/false/null, click switch → mutation
   - `useMeSettings.test.ts` : query key, mutation invalide query, invalide poi-access
   - Coverage ≥ 80%

10. **Given** la story terminée, **When** je commit :
    - `apps/web/src/lib/privacy.ts` + `.test.ts`
    - `apps/web/src/components/poi-access/AccessConsentDialog.tsx` + `.test.tsx`
    - `apps/web/src/app/(app)/settings/_components/privacy-section.tsx` + `.test.tsx`
    - `apps/web/src/app/(app)/settings/page.tsx` (modifié — intégration `<PrivacySection>`)
    - `apps/web/src/lib/queries/me-settings.ts`
    - `apps/web/src/stores/live-mode-store.ts` (modifié)
    - `apps/web/src/components/poi-access/useAccess.ts` (modifié si Live mode logic ajoutée ici) OU nouveau hook `useLiveAccess.ts` qui wrap consent flow
    - `apps/web/src/app/(app)/live/[id]/_components/poi-live-sheet.tsx` (modifié — intégration popin)
    - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. Wording UX — à valider en workflow UX dédié (UX-DR-PA-001)

Les textes proposés dans cette story (popin + Privacy section) sont **issus de l'architecture** et n'ont PAS été validés par un workflow UX dédié. Avant merge final, recommandation :
- Faire valider par Guillaume au minimum
- Idéalement, lancer un workflow `bmad-create-ux-design` ciblé sur ces 2 surfaces pour affinage

Pour l'instant : implémenter avec les textes architecture, marquer en commentaire `// TODO: revisit wording with UX workflow` au-dessus de chaque string.

### 2. Pattern Dialog non-dismissable

shadcn `<Dialog>` est dismissable par défaut (Escape + clic outside). Pour empêcher :
```tsx
<Dialog open={open} onOpenChange={() => {}}>  // no-op onOpenChange
  <DialogContent
    onEscapeKeyDown={(e) => e.preventDefault()}
    onPointerDownOutside={(e) => e.preventDefault()}
    onInteractOutside={(e) => e.preventDefault()}
  >
```

→ Confirmer le pattern souhaité avec Guillaume. Alternative : dismissable mais traité comme "Refuser" implicite.

### 3. Mode Live first-mount detection

La détection "user vient d'entrer en Live mode" pour reset `accessConsentChecked` :
```tsx
useEffect(() => {
  // au mount du composant Live :
  resetAccessConsentChecked()
  return () => { /* cleanup éventuel au unmount */ }
}, [])
```

À placer dans le composant racine de la page Live (`apps/web/src/app/(app)/live/[id]/page.tsx` ou layout).

### 4. roundCoordinate — application stricte

Le helper doit être appelé **AVANT** toute requête réseau. Stratégie de défense :
- Le hook `useLiveAccess` (ou extension de `useAccess`) applique `roundCoordinate` dans son `queryFn`
- Le composant qui consomme le hook reçoit les coords brutes — pas son problème
- Code review check : grep `lat:|lng:` dans les fichiers API frontend → toujours via `roundCoordinate`

### 5. PrivacySection — page Settings existante ?

Vérifier l'existence de la page Settings :
```bash
ls apps/web/src/app/\(app\)/settings/
```
Si elle n'existe pas → la créer (out of scope strict mais nécessaire). Si elle existe → étendre avec la nouvelle section.

---

## Tasks / Subtasks

- [ ] **Task 1** — Créer `privacy.ts` helper (AC: 1, ⚠️Discovery #4)
  - [ ] Function `roundCoordinate(n) => Math.round(n * 10_000) / 10_000`
  - [ ] Test unitaire 5+ cas

- [ ] **Task 2** — Créer `AccessConsentDialog.tsx` (AC: 2, ⚠️Discovery #1, #2)
  - [ ] Dialog shadcn avec props open + onChoose
  - [ ] Boutons size lg
  - [ ] Décision avec Guillaume : dismissable ou non
  - [ ] Test : click chaque bouton → onChoose appelé

- [ ] **Task 3** — Créer hooks `useMeSettings` + `useUpdateMeSettings` (AC: 6)
  - [ ] `apps/web/src/lib/queries/me-settings.ts`
  - [ ] Query : `['me', 'settings']`, fetch `/me/settings`
  - [ ] Mutation : PATCH, invalide `['me', 'settings']` + `['poi-access']`
  - [ ] Tests

- [ ] **Task 4** — Étendre `useLiveModeStore` (AC: 7)
  - [ ] Ajout `accessConsentChecked` + 2 actions

- [ ] **Task 5** — Étendre/créer hook Live pour le flow consent (AC: 3, 4, ⚠️Discovery #4)
  - [ ] Décision : étendre `useAccess` avec branche mode 'live', OU créer `useLiveAccess` dédié
  - [ ] Logique :
    1. Si profile.liveAccessConsent === true → fetch direct (origin gps avec lat/lng arrondis)
    2. Si === false → return fallback immédiat (skip fetch)
    3. Si === null → trigger popin via `useLiveModeStore.setShowConsentDialog(true)` (state à ajouter au store)
  - [ ] `roundCoordinate` appliqué dans `queryFn`

- [ ] **Task 6** — Intégrer popin dans `poi-live-sheet.tsx` (AC: 3, 8)
  - [ ] Lire `accessConsentChecked` du store
  - [ ] Lire `profile.liveAccessConsent` (via `useMeSettings`)
  - [ ] Render `<AccessConsentDialog open={shouldShow} onChoose={handle} />`
  - [ ] `handle` : appelle `updateMeSettings.mutate({ liveAccessConsent: choice })` + `markAccessConsentChecked()`

- [ ] **Task 7** — Créer `PrivacySection.tsx` (AC: 5, 6)
  - [ ] Card shadcn avec Switch
  - [ ] Mutation au changement de switch
  - [ ] Toast

- [ ] **Task 8** — Intégrer dans page Settings (AC: 5, ⚠️Discovery #5)
  - [ ] Identifier `settings/page.tsx`
  - [ ] Ajouter `<PrivacySection />` (cohérent visuellement avec autres sections existantes)

- [ ] **Task 9** — Tests (AC: 9)
  - [ ] Vitest + RTL pour tous les composants/hooks
  - [ ] Coverage ≥ 80%

- [ ] **Task 10** — Validation manuelle UI (AC: 8)
  - [ ] Reset DB consent à null pour user de test
  - [ ] Dérouler tout le flow
  - [ ] Vérifier toast, popin, switch behavior

- [ ] **Task 11** — Doc Sync + commit (AC: 10)
  - [ ] Commit : `feat(web): AccessConsentDialog + PrivacySection + roundCoordinate + live consent flow — story poi-access-3.3`

---

## Dev Notes

### Pattern projet — Button size lg

Cf. project-context §Button Component :
- `lg = h-11 (44px)` — pour dialogs (WCAG touch target)
- DialogFooter a `[&_button]:min-h-[44px]` automatique

### Pattern projet — Toast

Réutiliser pattern Story 2.6 (à identifier — probablement `sonner`).

### Pattern projet — Card

Cf. project-context §UI Components — Card :
> Cards en sections settings, listes
> Composants internes ne doivent PAS avoir leur propre rounded-lg border wrapper si wrappés dans une Card

### Pattern projet — i18n

Le projet est en français (cf. config). Tous les wordings UI en français. Pas de i18n multi-lang pour MVP.

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-3.3]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#RGPD-Position-GPS-en-mode-Live]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Frontend-Architecture]
- [Source: _bmad-output/project-context.md#Button-Component]
- [Source: _bmad-output/project-context.md#UI-Components-Card]
- [Source: _bmad-output/implementation-artifacts/poi-access-3-1-...md] — endpoint Live (consume by useLiveAccess)
- [Source: _bmad-output/implementation-artifacts/poi-access-3-2-...md] — endpoint settings (consume by hooks)
- [Source: _bmad-output/implementation-artifacts/poi-access-2-4-...md] — useAccess pattern

---

## Dev Agent Record

### Agent Model Used
_(À renseigner)_

### Completion Notes List
- Dialog dismissable : ☐ Oui (Refuser implicite) / ☐ Non (décision explicite requise)
- Hook Live : ☐ extension useAccess / ☐ nouveau useLiveAccess
- Page Settings existante : ☐ Oui (étendue) / ☐ Non (créée)
- Wording UX validé par Guillaume : ☐ Oui / ☐ Reporté à workflow UX
- Coverage tests : `___%`

### File List
- [ ] `apps/web/src/lib/privacy.ts` + `.test.ts`
- [ ] `apps/web/src/components/poi-access/AccessConsentDialog.tsx` + `.test.tsx`
- [ ] `apps/web/src/app/(app)/settings/_components/privacy-section.tsx` + `.test.tsx`
- [ ] `apps/web/src/app/(app)/settings/page.tsx` (modifié ou créé)
- [ ] `apps/web/src/lib/queries/me-settings.ts` + `.test.ts`
- [ ] `apps/web/src/stores/live-mode-store.ts` (modifié)
- [ ] `apps/web/src/components/poi-access/useAccess.ts` (modifié) OU `useLiveAccess.ts` (nouveau)
- [ ] `apps/web/src/app/(app)/live/[id]/_components/poi-live-sheet.tsx` (modifié)
