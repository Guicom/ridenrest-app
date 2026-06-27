# Story MOB-5.4 : Panneau de recherche Live refondu & section « PROFIL » repliable

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cycliste utilisant le mode Live**,
I want **un panneau de recherche désencombré avec une section « PROFIL » repliable**,
So that **j'ai un panneau clair qui révèle le contexte d'élévation au bon moment**.

> **Dépend de MOB-5.3** (panneau Live fonctionnel `live-controls.tsx` : slider, −/+, RECHERCHER, allure/rayon). Cette story **re-design le layout** du panneau selon les maquettes (en-tête PROFIL + chevron, métriques `↑D+ · ↓D- · ~ETA` hiérarchisées sous le slider, RECHERCHER / RECHERCHER SUR) et ajoute la **section « PROFIL » repliable** (coquille animée). **Le CONTENU du profil d'élévation = MOB-5.5** (cette story expose un slot `profileContent`).
>
> **Frontend uniquement — aucun appel serveur (NFR-LP-005).** Parité directe avec le web `live-profile-1` (`done`).
>
> ⚠️ **Animation de hauteur** via `react-native-reanimated@4.3.1` (déjà installé) — pas de module natif neuf, **pas de prebuild**.

## Acceptance Criteria

1. **Given** le mode Live actif
   **When** le panneau s'affiche
   **Then** le layout suit les maquettes, dans cet ordre vertical : (a) en-tête **« PROFIL » + chevron** + séparateur ; (b) **section PROFIL repliable** ; (c) **« MON HÔTEL DANS {X} km »** + icône filtres ; (d) **slider avec −/+** ; (e) **ligne métriques `↑ D+ · ↓ D- · ~ ETA`** SOUS le slider ; (f) **RECHERCHER / RECHERCHER SUR** (FR-LP-001, UX-DR-LP-001)
   **And** toutes les cibles tactiles respectent **44×44 px** (NFR-LP-003)

2. **Given** le panneau au chargement **et** après une recherche
   **When** je n'ai pas touché le slider
   **Then** la section « PROFIL » est **repliée par défaut** (FR-LP-002)

3. **Given** la section « PROFIL » repliée
   **When** je touche le slider (premier contact) ou un bouton −/+
   **Then** elle **s'ouvre automatiquement** avec une **transition de hauteur fluide** (FR-LP-003, NFR-LP-004)

4. **Given** la section ouverte
   **When** je clique **« RECHERCHER »**
   **Then** elle se **referme** et la recherche POI part normalement (FR-LP-004)

5. **Given** la section (ouverte ou fermée)
   **When** je clique le **chevron**
   **Then** elle **bascule manuellement**, indépendamment du slider (FR-LP-005)
   **And** le chevron suit la convention `ouvert = ChevronDown`, `fermé = ChevronUp`

6. **Given** la nouvelle section en place
   **When** je suis en Live
   **Then** l'**ancien mini-bandeau d'élévation** n'est plus affiché en double (FR-LP-012) — le profil ne se rend QUE dans la section PROFIL

7. **Given** aucun contenu de profil disponible (`profileContent == null`, ex. pas de données d'élévation)
   **When** le panneau s'affiche
   **Then** l'en-tête PROFIL n'est **pas dépliable** (toggle désactivé, section reste `height 0`, `accessibilityElementsHidden` quand repliée) — pas de section vide cliquable

## Tasks / Subtasks

- [ ] **T1 — Re-structurer `components/live/live-controls.tsx`** (AC: 1)
  - [ ] Réordonner le contenu (MOB-5.3) selon les maquettes : en-tête PROFIL + chevron + séparateur → section PROFIL (slot) → « MON HÔTEL DANS {X} km » + icône filtres → slider −/+ → ligne métriques `↑D+ · ↓D- · ~ETA` → RECHERCHER / RECHERCHER SUR.
  - [ ] **Métriques** : `elevationText` = joindre **uniquement** les valeurs D+/D- présentes avec ` · ` (pas de séparateur orphelin si une valeur manque) ; `formatEtaSummary(distanceKm, speedKmh)`. (Le calcul D+/D- de la fenêtre `[currentKmOnRoute, currentKmOnRoute+targetAheadKm]` via `computeElevationGain/Loss` — porté ici ou fourni par 5.5 ; documenter la frontière.)
  - [ ] **RECHERCHER SUR** : réutiliser `search-on-dropdown.tsx` (Booking/Airbnb, déjà mobile MOB-4.5) — dropdown global hébergements.
  - [ ] **44×44 px** sur tous les éléments tactiles (NFR-LP-003 ; `Button size="lg"` / min-h).

- [ ] **T2 — Section PROFIL repliable (coquille animée)** (AC: 2, 3, 4, 5, 7)
  - [ ] État `profileOpen: boolean` **local** à l'écran Live (`useState`, **pas** dans le store — UI-only, parité web). Props vers `live-controls` : `profileOpen`, `onProfileToggle`, `onProfileAutoOpen`, `profileContent?: ReactNode`.
  - [ ] **Animation hauteur** via `react-native-reanimated` (`useSharedValue` + `withTiming`, ~200 ms) : `height 0 ↔ contentHeight` (mesurer via `onLayout`). NFR-LP-004 (fluide).
  - [ ] **Comportement** : replié par défaut (au mount + après recherche, AC2) ; **auto-open au 1er contact slider/±** (`onProfileAutoOpen`, AC3) ; **close on RECHERCHER** (`setProfileOpen(false)`, AC4) ; **chevron = toggle manuel** indépendant (AC5).
  - [ ] **Garde `hasProfile = profileContent != null`** (AC7) : si pas de contenu → toggle désactivé, `aria-expanded`/accessibilityState omis, section `height 0`, `accessibilityElementsHidden`/`importantForAccessibility='no-hide-descendants'` quand repliée.
  - [ ] Chevron : `profileOpen ? ChevronDown : ChevronUp` (`lucide-react-native`).

- [ ] **T3 — Câblage écran Live + suppression double affichage** (AC: 1, 4, 6)
  - [ ] Dans `(app)/live/[id].tsx` : porter `profileOpen` + handlers ; passer `profileContent` (le composant profil de **MOB-5.5** ; tant que 5.5 n'est pas là, slot `null` → section non dépliable, AC7). Sur RECHERCHER (`live-controls`) : `refetch()` (5.3) **et** `setProfileOpen(false)`.
  - [ ] **FR-LP-012** : s'assurer qu'aucun mini-bandeau d'élévation ne s'affiche ailleurs (le profil ne vit QUE dans la section PROFIL). (Pas de strip desktop sur mobile → simple.)

- [ ] **T4 — i18n + a11y** (AC: 1, 5, 7)
  - [ ] `live.panel.profileHeader` (« PROFIL »), `live.panel.targetTitle` (« Mon hôtel dans {{km}} km »), `live.panel.searchOn` (RECHERCHER SUR), `live.panel.dPlus/dMinus/eta`. a11y : chevron `accessibilityRole="button"` + label + `accessibilityState={{expanded}}`. FR/EN parité, zéro chaîne en dur.

- [ ] **T5 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5, 6, 7)
  - [ ] Ordre du layout (en-tête → section → titre → slider → métriques → boutons).
  - [ ] PROFIL replié par défaut ; 1er contact slider → `onProfileAutoOpen` appelé ; RECHERCHER → `setProfileOpen(false)` ; chevron → toggle manuel.
  - [ ] `hasProfile=false` (`profileContent=null`) → toggle désactivé, section `height 0`, a11y hidden.
  - [ ] `elevationText` : pas de séparateur orphelin quand une métrique manque ; `formatEtaSummary`.
  - [ ] Pas de double rendu du profil.
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` iOS OK.

- [ ] **T6 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5) — ⏳ build Dev Client
  - [ ] Panneau ouvert : ordre conforme maquettes, cibles ≥ 44px. PROFIL replié par défaut.
  - [ ] Toucher le slider → PROFIL s'ouvre en douceur. RECHERCHER → se referme. Chevron → bascule à la main.

## Dev Notes

### Référence web → mobile (frontend-only)

- `apps/web/.../live/[id]/_components/live-controls.tsx` (220 l) = le panneau redessiné. Ordre vertical (FR-LP-001, décision Guillaume) : (a) « PROFIL » header + chevron + `border-b` ; (b) section PROFIL repliable ; (c) « MON HÔTEL DANS {X} km » + icône filtres ; (d) slider + −/+ ; (e) métriques `↑D+ · ↓D- · ~ETA` SOUS le slider ; (f) RECHERCHER / SearchOnDropdown. [Source: apps/web/.../live-controls.tsx]
- État `profileOpen` **local** (page, pas store) ; props `profileOpen/onProfileToggle/onProfileAutoOpen/profileContent`. Collapsed par défaut ; **auto-open au 1er contact slider** (`onProfileAutoOpen`) ; **close on RECHERCHER** (`page.tsx:111` `setProfileOpen(false)`) ; chevron manuel. [Source: apps/web/.../live/[id]/page.tsx:58-62,110-117,424-451]
- `hasProfile` (= `profileContent != null`) : sinon toggle désactivé, `aria-expanded` omis, section `h-0`, `aria-hidden={!expanded}` (patches review live-profile-1). Chevron `profileOpen ? ChevronDown : ChevronUp` (ouvert=bas). [Source: live-profile-1-search-panel-redesign-collapsible-profile.md §Review]
- `formatEtaSummary` (`live-controls.tsx:213-219`) ; `elevationText` join sans orphelin (`:84-89`). [Source: apps/web/.../live-controls.tsx]
- Web `transition-all duration-200`, `h-0 ↔ h-[80px]` → RN reanimated height. [Source: live-profile-1-…md]

### Différences mobile

- Web a un **double affichage** (strip `ElevationProfile` desktop en bas, `page.tsx:524-539`) traité comme duplicata desktop-only. **Sur mobile, pas de strip desktop → ne rendre le profil QUE dans la section PROFIL** (FR-LP-012 trivial). [Source: rapport web §MOB-5.4]
- Animation : web CSS, mobile **reanimated** (`useSharedValue`/`withTiming` + `onLayout` pour mesurer la hauteur cible). NFR-LP-004.
- Touch target **44px** (HIG iOS, supersede le 48px web). [Source: epics-mobile.md NFR-LP-003 (l.183)]

### Réutilisation du code mobile existant

- **MOB-5.3** : `live-controls.tsx` (à re-structurer), `live-filters-drawer` (icône filtres), slider −/+, RECHERCHER (`refetch`).
- **MOB-4.5** : `search-on-dropdown.tsx` (RECHERCHER SUR Booking/Airbnb), `booking-links.tsx` (`page:'live'`).
- `react-native-reanimated@4.3.1` + `react-native-worklets@0.8.3` (animation hauteur — déjà installés). `lucide-react-native` (`ChevronUp`/`ChevronDown`, `SlidersHorizontal`, `Search`, `Minus`, `Plus`). `components/ui/button.tsx` (`size="lg"` 44px). `@ridenrest/gpx` (`computeElevationGain/Loss` pour D+/D-).

### Conventions & contraintes

- **Frontend-only**, aucun appel serveur. `profileOpen` local (pas store). Animation reanimated. 44px touch. i18n FR/EN. Tests hors `src/app/`. Icônes `lucide-react-native` (dépend `react-native-svg`, déjà lié — pas de prebuild). NativeWind v3.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/components/live/collapsible-profile-section.tsx  (coquille animée + chevron)
+ tests co-localisés (live-controls layout, collapsible-profile)
```
**Modifs** :
```
apps/mobile/src/components/live/live-controls.tsx   (re-structure layout + métriques + section)
apps/mobile/src/app/(app)/live/[id].tsx             (profileOpen local + handlers + slot)
apps/mobile/src/lib/i18n/locales/fr.json + en.json  (live.panel.*)
```
**Aucune** migration DB / modif serveur. **Aucun** module natif neuf → pas de prebuild.

### Frontière de story

- **Inclus** : re-design layout panneau (ordre maquettes, métriques `↑D+·↓D-·~ETA`, RECHERCHER SUR), section PROFIL repliable (animée, collapsed défaut, auto-open slider, close RECHERCHER, chevron, garde `hasProfile`), suppression double affichage, 44px. i18n, tests.
- **Exclu** : **contenu du profil d'élévation** (le graphe) → **MOB-5.5** (fournit `profileContent`) ; logique slider/recherche/filtres (MOB-5.3) ; météo (5.6).

### Open Questions

1. **Calcul D+/D- de la fenêtre** (métriques ligne) : porté ici via `computeElevationGain/Loss` sur `[currentKmOnRoute, +targetAheadKm]`, ou exposé par le hook profil de 5.5 ? _(Recommandation : exposer depuis le hook `useElevationProfile`/wrapper de 5.5 pour single-source ; si 5.4 livré avant 5.5, calcul local temporaire.)_

### References

- [Source: epics-mobile.md#Story MOB-5.4 (l.964-995)] — AC d'origine (FR-LP-001→005, FR-LP-012, NFR-LP-003/004)
- [Source: apps/web/.../live/[id]/_components/live-controls.tsx] — panneau redessiné (ordre, métriques, ETA)
- [Source: apps/web/.../live/[id]/page.tsx:58-62,110-117,424-451] — `profileOpen` + handlers
- [Source: live-profile-1-search-panel-redesign-collapsible-profile.md] — comportement + patches review (hasProfile, aria-hidden)
- [Source: MOB-5-3-live-poi-discovery.md] — `live-controls` fonctionnel (dépendance)
- [Source: _bmad-output/implementation-artifacts/MOB-4-5-booking-deeplinks-affiliate-tracking.md] — `search-on-dropdown` (RECHERCHER SUR)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.4 (ready-for-dev) — re-design panneau Live (ordre maquettes : en-tête PROFIL + chevron, métriques `↑D+ · ↓D- · ~ETA` sous slider, RECHERCHER / RECHERCHER SUR) + section PROFIL repliable (coquille reanimated, collapsed défaut, auto-open 1er contact slider, close on RECHERCHER, chevron manuel, garde `hasProfile`), 44px touch, suppression double affichage (FR-LP-012). Frontend-only, pas de prebuild. Slot `profileContent` rempli par 5.5. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
