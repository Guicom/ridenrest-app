---
baseline_commit: 9284f923e5636140f8110fd0a4a33798964fb298
---

# Story POI-Access 3.3 : `AccessConsentDialog` popin RGPD + Section Privacy Settings + helper `roundCoordinate`

Status: superseded
<!-- 2026-05-30 : flow de consentement Live RETIRÉ. Décision produit : le mode Live utilise l'origine
     `nearest-trace` (comme Planning), sans GPS ni consentement RGPD. AccessConsentDialog, useLiveAccess,
     LiveAccessSection, la section Privacy, roundCoordinate et la query me-settings sont supprimés.
     Cf. Change Log + Completion Notes. -->


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

- [x] **Task 1** — Créer `privacy.ts` helper (AC: 1, ⚠️Discovery #4)
  - [x] Function `roundCoordinate(n) => Math.round(n * 10_000) / 10_000`
  - [x] Test unitaire 5+ cas (8 cas : positif, négatif, arrondi, 0, ±90, ±180, half-up, garantie ≤4 déc.)

- [x] **Task 2** — Créer `AccessConsentDialog.tsx` (AC: 2, ⚠️Discovery #1, #2)
  - [x] Dialog shadcn avec props open + onChoose
  - [x] Boutons size lg
  - [x] Décision : **NON dismissable** (AC #2 l'exige explicitement — pattern `GeolocationConsent` : `open` contrôlé + `onOpenChange` no-op + `showCloseButton={false}`)
  - [x] Test : click chaque bouton → onChoose appelé (+ render open/closed)

- [x] **Task 3** — Créer hooks `useMeSettings` + `useUpdateMeSettings` (AC: 6)
  - [x] `apps/web/src/lib/queries/me-settings.ts`
  - [x] Query : `['me', 'settings']`, fetch `/api/me/settings` (préfixe global `api`)
  - [x] Mutation : PATCH, invalide `['me', 'settings']` + `['poi-access']`
  - [x] Tests

- [x] **Task 4** — Étendre `useLiveStore` (AC: 7) — *Doc Sync : store réel = `useLiveStore`/`live.store.ts`, pas `useLiveModeStore`/`live-mode-store.ts`*
  - [x] Ajout `accessConsentChecked` + 2 actions (`markAccessConsentChecked`, `resetAccessConsentChecked`)

- [x] **Task 5** — Créer hook Live pour le flow consent (AC: 3, 4, ⚠️Discovery #4)
  - [x] Décision : **nouveau `useLiveAccess` dédié** (sépare le flow consent de `useAccess` planning)
  - [x] Logique :
    1. consent === true → origine gps arrondie exposée → `AccessMetrics` fetch
    2. consent === false → `declined` → fallback vol d'oiseau (aucun fetch)
    3. consent === null → `needsConsent` → popin (dérivé, pas de `setShowConsentDialog` au store — AC #7 ne liste que `accessConsentChecked`)
  - [x] `roundCoordinate` appliqué dans le hook AVANT que l'origine n'atteigne la `queryFn` (RGPD — position brute jamais envoyée)

- [x] **Task 6** — Intégrer popin dans le POI UI Live (AC: 3, 8) — *Doc Sync : `poi-live-sheet.tsx` inexistant → intégration dans `poi-popup.tsx` (UI POI partagée planning/live) + reset dans `live/[id]/page.tsx`*
  - [x] Composant `LiveAccessSection` : lit `accessConsentChecked` + consent (`useLiveAccess`)
  - [x] Render `<AccessConsentDialog open={shouldShow} onChoose={handle} />`
  - [x] `handle` : `updateMeSettings.mutate({ liveAccessConsent: choice })` ; `markAccessConsentChecked()` au déclenchement de la popin
  - [x] Reset `accessConsentChecked` au mount du mode Live (Discovery #3)

- [x] **Task 7** — Créer `PrivacySection.tsx` (AC: 5, 6)
  - [x] Switch (coché ssi consent === true) — Card fournie par la page (pattern `OverpassToggle`)
  - [x] Mutation au changement de switch
  - [x] Toast success/error

- [x] **Task 8** — Intégrer dans page Settings (AC: 5, ⚠️Discovery #5)
  - [x] `settings/page.tsx` existe → section "Confidentialité" ajoutée (Card cohérente avec les autres sections)

- [x] **Task 9** — Tests (AC: 9)
  - [x] Vitest + RTL pour tous les composants/hooks (32 tests / 6 fichiers)
  - [x] Coverage : outillage `@vitest/coverage-v8` non installé dans le projet (pas de dépendance ajoutée sans accord). Couverture qualitative : chaque fichier source a un test co-localisé couvrant toutes ses branches (consent true/false/null, loading, disabled, no-GPS ; render open/closed + 2 callbacks ; query enabled/disabled + double invalidation ; switch 3 états + toasts ; flow popin complet)

- [x] **Task 10** — ~~Validation manuelle UI du flow de consentement (AC: 8)~~ — **N/A (SUPERSEDED 2026-05-30)** : le flow de consentement Live a été retiré (origine `nearest-trace`, sans GPS). Plus rien à valider sur ce flow. La validation manuelle Planning (qui a révélé les 7 bugfixes) a bien eu lieu. ⤵ détails d'origine conservés pour l'historique :
  - [ ] Reset DB consent à null pour user de test
  - [ ] Dérouler tout le flow (popin → Autoriser/Refuser → toast → métriques/fallback ; persistance ; toggle Settings)
  - [ ] Vérifier toast, popin, switch behavior
  - *Note : suit le pattern 3.1/3.2 (smoke test manuel différé jusqu'à la livraison de l'UI). C'est maintenant le moment du test end-to-end complet.*
  - *MAJ 2026-05-30 : validation manuelle menée en **mode Planning** → a révélé et fait corriger 7 bugs/refinements de la chaîne d'accès (cf. Completion Notes « Session 2026-05-30 »). Le **flow de consentement Live** (popin → Autoriser/Refuser → DB → cache → toggle Settings) **reste à valider** — d'où Task 10 toujours décochée.*

- [x] **Task 11** — Doc Sync + commit (AC: 10)
  - [x] Doc Sync effectué (déviations documentées ci-dessous : noms store/fichiers, hook, polyline Live différée)
  - [ ] Commit `feat(web): AccessConsentDialog + PrivacySection + roundCoordinate + live consent flow — story poi-access-3.3` — **laissé à Guillaume** (comme 3.1/3.2, commit manuel)

---

### Review Findings (2026-05-30 — bmad-code-review, baseline `9284f92` vs working tree)

> Review adversariale 3 couches (Blind Hunter / Edge Case Hunter / Acceptance Auditor) sur le refactor « superseded » (retrait flow GPS/consentement → origine `nearest-trace`). RGPD : **renforcé** (origine `gps` retirée du schéma Zod partagé → le serveur ne peut plus recevoir de GPS ; `GeolocationConsent` live-mode intact). Aucune déviation non documentée. Bilan : 3 décisions, 7 patchs, 1 différé, 13 écartés (bruit/false positives/confirmations positives).

**Décisions requises (résolues 2026-05-30) :**

- [x] [Review][Decision] **Collision de cache `nearest-trace` ⇄ `adventure-start`** (HIGH) — `access-calculator.service.ts:95,102`. → **RÉSOLU : supprimer `adventure-start`** (le frontend n'envoie plus que `nearest-trace`). Élimine la collision à la racine. ⇒ devient patch P8.
- [x] [Review][Decision] **Profil BRouter `gravel` non vérifié dans le build** (MEDIUM) — `PROFILE_MAP : gravel → 'gravel'`. → **RÉSOLU : confirmation manuelle (Guillaume)** que `gravel.brf` ships dans BRouter 1.7.9. Aucun changement de code → dismissed.
- [x] [Review][Decision] **Colonne orpheline `profiles.live_access_consent`** (LOW) — supersede. → **RÉSOLU : migration drizzle de drop.** ⇒ devient patch P9.

**Patchs — appliqués 2026-05-30 (option « Appliquer tous les patchs ») :**

- [x] [Review][Patch] **(P3)** POI sur / dans le buffer trace (`nearest-trace` ≈ POI) → BRouter `from≈to` dégénéré → guard court-circuit « POI sur la trace » (accès ~0, sans routage) ajouté dans `computeFresh` + test [apps/api/src/pois/access-calculator/access-calculator.service.ts:135].
- [x] [Review][Patch] **(P4)** `formatAccessEta` : plancher `<1 min` pour une distance positive arrondissant à 0 + tests dédiés [apps/web/src/components/poi-access/format.ts:29, format.test.ts].
- [x] [Review][Patch] **(P5)** Doc-sync epics : encart supersede en tête de `epics-poi-access-routing.md` + tags `[SUPERSEDED 2026-05-30]` inline sur FR-PA-002/003/010/011/012/013, NFR-PA-004/006, FR-PA-020 (source `redis-cache`), note FR Coverage Map + bandeau Epic 3.
- [x] [Review][Patch] **(P7)** Task 10 annotée « N/A (superseded) » (ci-dessus).
- [x] [Review][Patch] **(P8, ex-D1)** Type d'origine `adventure-start` supprimé (schéma Zod `AccessOriginSchema` + barrel `index.ts`, type `AccessOrigin` api, branche `resolveOrigin`, specs api/web) — collision de cache éliminée. tsc api/shared 0, suites vertes.
- [x] [Review][Patch] **(P9, ex-D3)** Migration drizzle `0016_rapid_dracula.sql` générée (`ALTER TABLE profiles DROP COLUMN live_access_consent`) via `drizzle-kit generate` (journal auto-mis à jour) + colonne retirée du schéma. **À committer + déployer** (le `migrate` tourne dans `deploy.sh`).
- [ ] [Review][Patch] **(P6) BLOQUÉ — nettoyage manuel Guillaume** : retirer la ligne `ACCESS_CACHE_TTL_LIVE_SECONDS=900` dans `apps/api/.env.example` — fichier dans un répertoire protégé par permissions (écriture refusée à l'agent, comme noté en 3.1).

**Findings écartés après vérification code (faux positifs / négligeables) :**

- [x] [Review][Dismiss] **(P1)** `ST_EndPoint(r.g)` NULL sur MultiLineString — **faux positif** : `BrouterRoute.geometry` est typé `{ type: 'LineString' }` (routing.types.ts:23) et `computeDivergentSegment` reçoit `GeoJSONLineString`. L'entrée de `ST_EndPoint` est toujours un LineString. SQL correct, non modifié.
- [x] [Review][Defer] **(P2)** Frontière géométrie ≠ frontière élévation (final approach) — **négligeable** : la composante contenant le POI a toujours `ST_Distance(part, poi) = 0` → toujours sélectionnée, ce qui correspond au run contigu du walk JS ; seule subsiste une différence de précision sub-sommet (< buffer 10 m). Différé (documenté), pas de churn du SQL correct.

**Différés :**

- [x] [Review][Defer] `fitToCorridorRange` spread d'un tableau de POI dans `Math.min/Math.max` [apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx:2740] — deferred, pré-existant : le pattern spread s'applique déjà aux waypoints de trace (potentiellement plus nombreux) ; nombre de POI corridor (≤30 km) très en deçà de la limite d'arguments moteur. Risque réel négligeable.

**Validation post-patchs (2026-05-30) :** API **346/346**, web **1055/1055**, shared **29/29** ; tsc api **0** / shared **0** / web **59** (= baseline, 0 nouvelle) ; ESLint **0 erreur**.

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
claude-opus-4-8 (1M context) — bmad-dev-story

### Completion Notes List

> **⚠️ SUPERSEDED — 2026-05-30.** Le flow de consentement Live (cœur de cette story) a été **retiré**.
> Décision produit (Guillaume) : en mode Live, l'itinéraire d'accès vers un hébergement utilise la même
> origine `nearest-trace` que le Planning (détour final depuis la trace), donc **aucune position GPS
> n'est transmise** → plus besoin de consentement RGPD. Supprimés côté web le 2026-05-30 :
> `AccessConsentDialog`, `useLiveAccess`, `LiveAccessSection`, `lib/privacy.ts` (`roundCoordinate`),
> `lib/queries/me-settings.ts`, `settings/_components/privacy-section.tsx` (+ leurs tests) ; champs
> `accessConsentChecked`/`mark`/`reset` retirés de `live.store.ts` ; section « Confidentialité » retirée
> de la page Settings. `LiveAccessPolyline` **conservé mais simplifié** en `nearest-trace` (tracé
> d'accès toujours affiché sur la carte Live, sans GPS). Le popup hébergement rend désormais le même
> `AccessMetrics variant="stats"` (origine `nearest-trace`) en Planning comme en Live.
> Côté backend, les Stories 3.1 (endpoint Live GPS) et 3.2 (`/me/settings`) sont également superseded.
> Validation post-retrait : web 1050/1050, API 346/346, shared 29/29 ; tsc web 59 (baseline) / api 0 ;
> ESLint clean. La note d'implémentation d'origine est conservée ci-dessous pour l'historique.

**Décisions (dictées par les ACs + Discovery notes) :**
- Dialog dismissable : ☑ **Non** (décision explicite requise — AC #2). Pattern : `open` contrôlé + `onOpenChange` no-op + `showCloseButton={false}` (identique à `GeolocationConsent`).
- Hook Live : ☑ **nouveau `useLiveAccess`** (sépare le flow consent du `useAccess` planning).
- Page Settings existante : ☑ **Oui (étendue)** — section "Confidentialité" ajoutée.
- Wording UX : ☑ **Reporté à workflow UX** (UX-DR-PA-001). Textes architecture implémentés avec `// TODO: revisit wording with UX workflow` au-dessus de chaque string (popin + Privacy section).
- Coverage tests : outillage non installé (cf. Task 9) — couverture qualitative complète par branches.

**Validation :**
- Suite Web complète : **1076/1076 tests verts** (32 nouveaux / 6 fichiers).
- ESLint : **0 erreur** sur tous les fichiers touchés (source + tests).
- tsc : 59 erreurs **pré-existantes** (identique au baseline `9284f92` — dérive de fixtures de test sans rapport : `MapSegmentData.source`, `AdventureStageResponse.speedKmh/pauseHours`), **0 introduite**. `tsc` n'est pas un gate du projet (scripts = `lint` + `test`).

**Doc Sync — écarts story → implémentation (réalité du code) :**
1. **Store** : la story cite `useLiveModeStore`/`live-mode-store.ts` → le store réel est **`useLiveStore`/`stores/live.store.ts`** (étendu).
2. **Intégration popin** : la story cite `poi-live-sheet.tsx` (inexistant) → l'UI POI réelle en Live est **`map/[id]/_components/poi-popup.tsx`** (partagée planning/live). La logique consent est encapsulée dans un nouveau composant **`LiveAccessSection`** monté en Live + hébergement ; le reset `accessConsentChecked` est dans **`live/[id]/page.tsx`**.
3. **`setShowConsentDialog`** : Task 5 suggérait un state store dédié → non créé. L'affichage de la popin est **dérivé** (`needsConsent && !accessConsentChecked` + state local `dialogOpen`), conforme à AC #7 qui ne liste que `accessConsentChecked` + 2 actions.
4. **Profile vs me-settings** : le consent est lu via `useMeSettings()` (`['me','settings']`), pas via `useProfile()`.

**Amendement de scope — polyline d'accès en mode Live (validé Guillaume 2026-05-29) :**
- AC #8 mentionne « polyline + métriques affichées » en Live. À l'origine, le tracé sur carte (FR-PA-007/008/009) était rattaché à **Epic 2 (Planning)** uniquement (Story 2.5 `AccessMapLayer`), et l'architecture scopait le Live à « Dialog + Metrics » (epic lignes 137/1621/1732). **Décision Guillaume : afficher aussi le tracé en Live quand le consentement est accordé.** Aucun risque RGPD nouveau (le consentement couvre déjà l'envoi de la position ; afficher sa propre route sur son écran n'est pas une fuite).
- **Implémenté** : nouveau composant `LiveAccessPolyline` (réutilise `useLiveAccess` + `useAccess` → même queryKey que les métriques, dédup TanStack), rendu dans `live/[id]/page.tsx` à côté du `PoiPopup`. `AccessMapLayer` étendu : (a) prise en charge des layer-ids Live (`live-pois-*-points`) pour l'insertion z sous les pins ; (b) prop `fitOnShow` (Live = `false`) pour ne pas entrer en conflit avec le recentrage GPS permanent. La polyline s'affiche uniquement si `consent === true` ; elle disparaît à la fermeture du POI (queryKey désactivée → géométrie nulle → cleanup `AccessMapLayer`). **AC #8 désormais entièrement couvert.**
- Note Doc Sync correspondante ajoutée à l'epic (Story 3.3) et à la matrice de traçabilité (FR-PA-007/008/009 désormais Planning **+** Live).

---

**Session 2026-05-30 — validation manuelle (Task 10) + bugfixes & refinements de la chaîne d'accès POI :**

La validation manuelle (Task 10) a été menée en **mode Planning** et a révélé 7 problèmes sur la chaîne d'accès POI, tous corrigés. ⚠️ **Périmètre** : les points 1-4 sont des **bugfixes backend territoire Epic 2** (calcul d'accès, pré-existants à la 3.3) ; les points 5-7 sont des **refinements UX frontend**. Ils sont consignés ici car issus de cette session, mais **méritent des commits séparés de la story 3.3** (cf. découpage à valider avec Guillaume). La validation manuelle du **flow de consentement Live** (cœur de la 3.3, AC #8) **reste à faire**.

1. **Fix profils BRouter** (Epic 2) — `bikepacking → safety`, or `safety.brf` n'existe PAS dans le build BRouter v1.7.9 → HTTP 500 → fallback vol d'oiseau systématique pour toute aventure bikepacking (et circuit-breaker ouvert impactant aussi `road`). Nouveau mapping validé Guillaume : `road→fastbike`, `gravel→gravel` (profil natif, plus précis), `bikepacking→trekking`. Type `BrouterProfile` (api) + `BrouterProfileSchema` (shared) : `safety` retiré, `gravel` ajouté. `ACCESS_ENGINE_VERSION` → `brouter-1.7.9+profiles-v2` (invalide les accès gravel en cache).

2. **Fix origine d'accès** (Epic 2) — l'origine `adventure-start` (km 0 de la trace) produisait un « accès vélo » de **192 km** pour un POI proche de la fin du parcours. Nouvelle origine **`nearest-trace`** = point de la trace le plus proche du POI (`ST_ClosestPoint`). Ajoutée à `AccessOriginSchema` (shared) + `AccessOrigin` (api) ; `resolveOrigin` reçoit les coords du POI ; le frontend planning (`poi-popup`, `poi-detail-sheet`, `map-view`) envoie `nearest-trace`. L'accès = vrai détour court depuis l'endroit où l'on quitte la trace.

3. **Fix simplification géométrie** (Epic 2) — `ST_SimplifyPreserveTopology(geom, 5)` : la géométrie est en EPSG:4326 → `5` = **5 degrés ≈ 550 km**, ce qui écrasait la route (313 → 6 points) en lignes droites (« vol d'oiseau » alors que BRouter renvoie bien 320 points routiers). Corrigé en `5.0 / 111320.0` (~5 m). Aux 2 endroits (`computeDivergentSegment` + `updateCache`).

4. **Fix « approche finale »** (Epic 2) — `ST_ClosestPoint` donne le point géométriquement le plus proche, d'où BRouter fait un **demi-tour** (~900 m) pour repartir vers le POI. Désormais on ne garde QUE la composante de `ST_Difference` qui touche le POI (= approche finale, du POI au 1er contact avec la trace) ; l'élévation D+/D- est scopée sur ce run terminal. Résultat : 14,5 km (avec demi-tour) → **11,8 km** propre, tracé routier sans aller-retour.

5. **Redesign popup hébergement** (UX frontend) — pour les hébergements : suppression de « X km de la trace », de la rangée stats-aventure (222 km / D+ / D- / 14h50) et du label « Accès vélo ». La rangée d'accès devient la rangée principale : **distance · D+ · D- · temps estimé** (icônes au-dessus des valeurs). Nouvelle variante `stats` d'`AccessMetrics` + helper `formatAccessEta` + skeleton dédié. Les non-hébergements (restaurants…) restent inchangés.

6. **Fix zoom popup** (UX frontend) — la polyline d'accès planning déclenchait un `fitBounds` qui plaçait le pin en haut et masquait le popup (rendu au-dessus du pin). `fitOnShow={false}` sur l'`AccessMapLayer` planning (cohérent avec le Live).

7. **Fix auto-zoom recherche** (UX frontend) — `fitToCorridorRange` ne cadrait que sur la trace → les POI éloignés (jusqu'au rayon de recherche) tombaient hors écran. Le cadrage inclut désormais les **POI trouvés** dans la bounding box (zoom moins serré, tous les POI visibles).

**Validation finale (2026-05-30) :** Web **1083/1083**, API **390/390**, shared **32/32**, ESLint clean. (tsc toujours 59 erreurs pré-existantes hors périmètre, 0 introduite.)

### File List

**Nouveaux fichiers :**
- `apps/web/src/lib/privacy.ts` + `privacy.test.ts`
- `apps/web/src/lib/queries/me-settings.ts` + `me-settings.test.ts`
- `apps/web/src/components/poi-access/AccessConsentDialog.tsx` + `AccessConsentDialog.test.tsx`
- `apps/web/src/components/poi-access/useLiveAccess.ts` + `useLiveAccess.test.ts`
- `apps/web/src/components/poi-access/LiveAccessSection.tsx` + `LiveAccessSection.test.tsx`
- `apps/web/src/components/poi-access/LiveAccessPolyline.tsx` + `LiveAccessPolyline.test.tsx` *(amendement polyline Live)*
- `apps/web/src/app/(app)/settings/_components/privacy-section.tsx` + `privacy-section.test.tsx`

**Fichiers modifiés :**
- `apps/web/src/stores/live.store.ts` (ajout `accessConsentChecked` + 2 actions)
- `apps/web/src/components/poi-access/AccessMapLayer.tsx` + `AccessMapLayer.test.tsx` (layer-ids Live + prop `fitOnShow`)
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` (branche Live → `LiveAccessSection`)
- `apps/web/src/app/(app)/live/[id]/page.tsx` (reset `accessConsentChecked` au mount + `LiveAccessPolyline`)
- `apps/web/src/app/(app)/settings/page.tsx` (section "Confidentialité" → `PrivacySection`)
- `apps/web/src/app/(app)/live/[id]/page.test.tsx` (mock store : 3 nouveaux membres + mock `LiveAccessPolyline`)

**Session 2026-05-30 — bugfixes/refinements (à committer séparément de la 3.3) :**

_Backend (Epic 2 — calcul d'accès) :_
- `packages/shared/src/schemas/poi-access.ts` + `poi-access.test.ts` (`BrouterProfileSchema` safety→gravel ; origine `nearest-trace`)
- `apps/api/src/pois/access-calculator/access-calculator.service.ts` (`PROFILE_MAP` ; resolveOrigin reçoit coords POI ; tolérance simplification 5→5/111320)
- `apps/api/src/pois/access-calculator/strategies/resolve-origin.ts` + `.spec.ts` (`nearest-trace` via `ST_ClosestPoint`)
- `apps/api/src/pois/access-calculator/strategies/compute-divergent-segment.ts` + `.spec.ts` (tolérance simplification ; « approche finale » = composante touchant le POI ; élévation scopée)
- `apps/api/src/pois/access-calculator/types/access-result.types.ts` (`AccessOrigin` + `nearest-trace`)
- `apps/api/src/routing/routing.types.ts` (`BrouterProfile` safety→gravel)
- `apps/api/src/config/access.config.ts` (`ACCESS_ENGINE_VERSION` → `brouter-1.7.9+profiles-v2`)
- `apps/api/.env.example` (idem ACCESS_ENGINE_VERSION)
- `apps/api/src/pois/access-calculator/access-calculator.service.spec.ts`, `strategies/redis-cache.spec.ts` (gravel/safety)

_Frontend (UX accès) :_
- `apps/web/src/components/poi-access/AccessMetrics.tsx` + `.test.tsx` (variante `stats` distance/D+/D-/ETA)
- `apps/web/src/components/poi-access/AccessMetricsSkeleton.tsx` (variante `stats`)
- `apps/web/src/components/poi-access/format.ts` (`formatAccessEta`)
- `apps/web/src/components/poi-access/LiveAccessSection.tsx` + `.test.tsx` (variante `stats` + `speedKmh`)
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` + `.test.tsx` (redesign hébergement ; origine `nearest-trace`)
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` (origine `nearest-trace`)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` (origine `nearest-trace` ; `fitOnShow={false}` accès ; POI inclus dans `fitToCorridorRange`)
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` (`fitToCorridorRange` inclut les POI)

### Change Log
- 2026-05-29 — Implémentation Story POI-Access 3.3 : helper `roundCoordinate` (RGPD), popin `AccessConsentDialog` non dismissable, hook `useLiveAccess` (flow consent + arrondi GPS), `LiveAccessSection` intégrée dans `poi-popup.tsx` (mode Live), hooks TanStack `useMeSettings`/`useUpdateMeSettings`, `PrivacySection` dans les Settings, extension `useLiveStore`. 32 tests ajoutés, ESLint clean. Status → review.
- 2026-05-29 — **Amendement (validé Guillaume) : tracé d'accès affiché en mode Live** quand consentement accordé. Nouveau `LiveAccessPolyline` + extension `AccessMapLayer` (layer-ids Live + `fitOnShow`). AC #8 désormais entièrement couvert. +6 tests → suite **1082/1082** verte, ESLint clean. Validation manuelle UI (Task 10/AC #8) et commit laissés à Guillaume.
- 2026-05-30 — **Validation manuelle Planning (Task 10) → 7 bugfixes/refinements de la chaîne d'accès POI** (cf. Completion Notes « Session 2026-05-30 ») : (1) mapping profils BRouter `bikepacking→safety` cassé → `fastbike/gravel/trekking` + bump engineVersion ; (2) origine d'accès `adventure-start` (192 km) → `nearest-trace` ; (3) tolérance de simplification `5°`→`5 m` (corrige le « vol d'oiseau ») ; (4) « approche finale » (suppression du demi-tour, 14,5→11,8 km) ; (5) redesign popup hébergement (distance/D+/D-/ETA) ; (6) `fitOnShow=false` accès planning (popup visible) ; (7) auto-zoom recherche inclut les POI. Web **1083/1083**, API **390/390**, shared **32/32**, ESLint clean. ⚠️ Points 1-4 = bugfixes Epic 2 → **commits séparés** ; validation manuelle du **flow consentement Live** (AC #8) **encore à faire**.
- 2026-05-30 — **Bugfix `AccessMapLayer` (consigné dans la Story 2.5)** : crash `getLayer` undefined au démontage de la carte (navigation hors carte avec polyline d'accès affichée). `removeAccessLayer` protégé par try/catch + test de régression. Web 1051/1051. Cf. Change Log de `poi-access-2-5-access-map-layer.md`.
- 2026-05-30 — **SUPERSEDED — retrait du flow de consentement Live.** Décision produit (Guillaume) : le mode Live passe à l'origine `nearest-trace` (comme Planning), sans GPS ni consentement RGPD. Web : suppression de `AccessConsentDialog`, `useLiveAccess`, `LiveAccessSection`, `lib/privacy.ts`, `lib/queries/me-settings.ts`, `settings/_components/privacy-section.tsx` (+ tests) ; champs consent retirés de `live.store.ts` ; section « Confidentialité » retirée des Settings ; `LiveAccessPolyline` simplifié en `nearest-trace` ; popup hébergement unifié sur `AccessMetrics variant="stats"` Planning+Live. Backend : Stories 3.1 et 3.2 superseded en parallèle (cf. leurs Change Logs). Validation : web **1050/1050**, API **346/346**, shared **29/29** ; tsc web 59 (baseline)/api 0 ; ESLint clean. À nettoyer manuellement : ligne orpheline `ACCESS_CACHE_TTL_LIVE_SECONDS` dans `apps/api/.env.example` (écriture refusée par permissions) ; drop migration éventuel de `profiles.live_access_consent` à décider.
