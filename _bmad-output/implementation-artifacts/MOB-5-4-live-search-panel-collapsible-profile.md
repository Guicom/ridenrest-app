---
baseline_commit: 33c05a6f2b81a0cad5756dafc567638ddee2be4b
---

# Story MOB-5.4 : Panneau de recherche Live refondu & section « PROFIL » repliable

Status: done

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

- [x] **T1 — Re-structurer `components/live/live-controls.tsx`** (AC: 1)
  - [x] Réordonner le contenu (MOB-5.3) selon les maquettes : en-tête PROFIL + chevron + séparateur → section PROFIL (slot) → « MON HÔTEL DANS {X} km » + icône filtres → slider −/+ → ligne métriques `↑D+ · ↓D- · ~ETA` → RECHERCHER / RECHERCHER SUR.
  - [x] **Métriques** : `elevationText` = joindre **uniquement** les valeurs D+/D- présentes avec ` · ` (pas de séparateur orphelin si une valeur manque) ; `formatEtaSummary(distanceKm, speedKmh)`. **Frontière** : D+/D- calculés LOCALEMENT dans `[id].tsx` via `computeElevationGain/Loss` sur la fenêtre `[currentKmOnRoute, +targetAheadKm]` (port web `page.tsx:215-226`) → quand MOB-5.5 livre `useElevationProfile`, exposer le D+/D- depuis ce hook (single-source) et retirer ce calcul local.
  - [x] **RECHERCHER SUR** : réutilise `search-on-dropdown.tsx` (Booking/Airbnb, MOB-4.5). **Déviation** : `searchCenter` (= `getCorridorCenter`, client-side) passé ; `city` (reverse-geocode = appel serveur) NON câblé pour respecter NFR-LP-005 (frontend-only) → repli URL Booking par coordonnées (`SearchOnDropdown` gère `city` absent).
  - [x] **44×44 px** sur tous les éléments tactiles (NFR-LP-003 ; `Button size="lg"` / `h-11` filtres / en-tête PROFIL `min-h-[44px]`).

- [x] **T2 — Section PROFIL repliable (coquille animée)** (AC: 2, 3, 4, 5, 7)
  - [x] État `profileOpen: boolean` **local** à l'écran Live (`useState`, **pas** dans le store — UI-only, parité web). Props vers `live-controls` : `profileOpen`, `onProfileToggle`, `onProfileAutoOpen`, `profileContent?: ReactNode`.
  - [x] **Animation hauteur** : `height 0 ↔ contentHeight` mesurée via `onLayout`, ~200 ms. **Déviation documentée** : `Animated` (cœur RN), **PAS** `react-native-reanimated` — aucun plugin babel worklets configuré (reanimated 4.x inutilisable sans), reanimated casse le build Storybook (cf. `slider.tsx`), et `live-filters-drawer.tsx` (MOB-5.3, même convention Live) utilise déjà `Animated`. NFR-LP-004 satisfait à l'identique, aucun module natif neuf → pas de prebuild.
  - [x] **Comportement** : replié par défaut (au mount + après recherche, AC2) ; **auto-open au 1er contact slider/±** (`onProfileAutoOpen`, AC3) ; **close on RECHERCHER** (`setProfileOpen(false)`, AC4) ; **chevron = toggle manuel** indépendant (AC5).
  - [x] **Garde `hasProfile = profileContent != null`** (AC7) : si pas de contenu → toggle désactivé, `accessibilityState.expanded` omis (`{disabled:true}`), section `height 0`, `accessibilityElementsHidden`/`importantForAccessibility='no-hide-descendants'` quand repliée.
  - [x] Chevron : `profileOpen ? ChevronDown : ChevronUp` (`lucide-react-native`).

- [x] **T3 — Câblage écran Live + suppression double affichage** (AC: 1, 4, 6)
  - [x] Dans `(app)/live/[id].tsx` : `profileOpen` local + handlers (`onProfileToggle`, `onProfileAutoOpen`) ; `profileContent={undefined}` (slot rempli par **MOB-5.5** → section non dépliable, AC7). Sur RECHERCHER (`handleSearch`) : `refetch()` (5.3) **et** `setProfileOpen(false)`.
  - [x] **FR-LP-012** : aucun mini-bandeau d'élévation ailleurs (pas de strip desktop sur mobile ; le profil ne vivra QUE dans la section PROFIL via le slot). Trivialement satisfait.

- [x] **T4 — i18n + a11y** (AC: 1, 5, 7)
  - [x] Clés `live.panel.*` ajoutées (FR/EN parité) : `profileHeader` (« PROFIL »), `profileShow`/`profileHide` (a11y label chevron, basé sur l'état), `dPlus`/`dMinus`/`eta` (a11y ligne métriques). **Reconcil. doc** : `targetTitle` non créé (le visuel réutilise `live.search.targetLabel` existant + grand nombre km) ; `searchOn` non créé (`SearchOnDropdown` porte déjà son i18n `pois.search.searchOn`). a11y chevron : `accessibilityRole="button"` + label + `accessibilityState={{expanded}}`. Zéro chaîne en dur.

- [x] **T5 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5, 6, 7)
  - [x] Ordre du layout (en-tête → séparateur → slider → métriques → boutons) via DFS `toJSON()`.
  - [x] PROFIL replié par défaut (open=false → a11y hidden) ; 1er contact slider/± → `onProfileAutoOpen` appelé ; chevron → `onToggle`. (AC4 `setProfileOpen(false)` = état écran : `handleSearch` non observable tant que `profileContent` undefined ; validé par le gate device + couvert dès MOB-5.5.)
  - [x] `hasProfile=false` (`profileContent` absent) → toggle désactivé, section masquée a11y (exclue des requêtes RNTL par défaut → preuve du masquage).
  - [x] `elevationText` : pas de séparateur orphelin (D+ seul / D- seul / aucun → « — ») ; `formatEtaSummary` ; préfixe « · » ETA conditionnel.
  - [x] Pas de double rendu du profil (structurel : un seul slot, pas de strip mobile).
  - [x] Gate : `test` (553/553) + `typecheck` (0) + `lint` (0) verts ; `expo export` iOS → voir T6/Completion.

- [x] **T6 — Validation device (Maestro, iOS + Android)** (AC: 1, 2, 3, 4, 5)
  - [x] Flow `live-poi.yaml` (iOS) + `android/live-poi.yaml` étendus : assert en-tête **« PROFIL »** + screenshot du panneau refondu. **iOS ✓ ET Android ✓** (`pnpm test:device live-poi.yaml`, fixed runner) : smoke + live-poi verts sur les 2, **0 crash natif**.
  - [x] Screenshots vérifiés (`.maestro/screenshots/live-poi-panel.png` + `android-live-poi-panel.png`) : ordre conforme maquettes (PROFIL + chevron → séparateur → « MON HÔTEL DANS 30 km » + filtres → slider −/+ → métriques `↑ 228 m · ↓ 479 m · ~2h00` → RECHERCHER / RECHERCHER SUR), PROFIL replié par défaut (chevron haut), cibles ≥ 44px. Parité visuelle iOS/Android.
  - [x] **Fix infra gate** (`scripts/device-test.sh`, hors feature — bugs introduits par le durcissement du gate ce matin) : (1) `JAVA_HOME` fallback → JDK 17 (`openjdk@17`), sinon Android Gradle échoue (`JvmVendorSpec IBM_SEMERU`) ; (2) scan crash `crash="$(… || true)"` — sous `set -e`, `find -newermt @epoch` (BSD/macOS) renvoyait ≠ 0 → le runner mourait après le 1er flow (smoke) sans jamais lancer les suivants. (Note : la phase `BUILD=1` Android via `expo run:android` ne se détache pas du tail des logs ; Android buildé séparément puis flows lancés sans `BUILD`.)
  - **Note auto-open/close (AC2-5 interactifs)** : couverts par les tests unitaires (`profileContent` injecté) ; côté device, `profileContent` est `undefined` (slot MOB-5.5) → section non dépliable (AC7), donc le device valide l'ordre/présence/PROFIL replié, et les transitions seront re-validées device dès MOB-5.5.

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

claude-opus-4-8 (Claude Code — bmad-dev-story)

### Debug Log References

- **Lint `react-hooks/refs`** : `useRef(new Animated.Value(0)).current` viole la règle (lecture de ref en rendu) → remplacé par `useState(() => new Animated.Value(0))` (pattern `live-filters-drawer.tsx`). Faux positif **pré-existant** sur `live-filters-drawer.tsx:181` (`PanResponder.create` lisant `handleCloseRef.current` dans un handler de geste, jamais en rendu) → `eslint-disable-next-line` justifié pour garder `pnpm lint` vert.
- **RNTL & a11y hidden** : `getByTestId` exclut par défaut les éléments masqués a11y (`accessibilityElementsHidden`) → la section repliée n'est trouvée qu'avec `{ includeHiddenElements: true }`. C'est la **preuve** que le masquage AC7 fonctionne (test ajusté en conséquence).
- **lucide icons + testID** : les icônes `lucide-react-native` ne propagent pas `testID` à un nœud interrogeable → testID porté par la `<View>` cercle parente du chevron.

### Completion Notes List

Implémentation **MOB-5.4** (frontend-only, aucun appel serveur, aucun module natif neuf → **pas de prebuild**) :

- **T1** Re-structure `live-controls.tsx` selon les maquettes (FR-LP-001) : en-tête PROFIL + chevron → section repliable → séparateur + « MON HÔTEL DANS {X} km » + filtres → slider −/+ → ligne métriques `↑D+ · ↓D- · ~ETA` → RECHERCHER / RECHERCHER SUR (`SearchOnDropdown`). 44 px sur toutes les cibles (NFR-LP-003).
- **T2** Nouveau composant `collapsible-profile-section.tsx` (coquille animée + en-tête + chevron). **Déviation documentée** : animation hauteur via **`Animated` (cœur RN)** et non `react-native-reanimated` — aucun plugin babel worklets configuré (reanimated 4.x inutilisable sans), reanimated casse le build Storybook (`slider.tsx`), et `live-filters-drawer.tsx` (MOB-5.3) suit déjà cette convention. NFR-LP-004 satisfait. Garde `hasProfile` (AC7) : sans contenu → toggle désactivé + section `height 0` + a11y masquée.
- **T3** Câblage `(app)/live/[id].tsx` : `profileOpen` local (`useState`, pas le store), `onProfileToggle`/`onProfileAutoOpen`, `setProfileOpen(false)` dans `handleSearch` (AC4). D+/D- calculés localement (`computeElevationGain/Loss` sur `[currentKm, +targetAheadKm]`, frontière documentée → MOB-5.5 single-source). `searchCenter` via `getCorridorCenter` (RGPD : centre corridor, pas GPS). `profileContent={undefined}` (slot 5.5) → AC7 + FR-LP-012 (pas de double affichage, pas de strip desktop sur mobile).
- **T4** i18n `live.panel.*` (FR/EN) : `profileHeader`, `profileShow`/`profileHide`, `dPlus`/`dMinus`/`eta`. `targetTitle`/`searchOn` non créés (réutilisation de `live.search.targetLabel` + i18n propre de `SearchOnDropdown`).
- **Déviation RECHERCHER SUR** : `city` (reverse-geocode = appel serveur) non câblé pour respecter NFR-LP-005 → `SearchOnDropdown` retombe sur l'URL Booking par coordonnées.

**Gate (au 2026-06-28)** : jest **553/553** (83 suites), `tsc` **0**, `lint` **0**, `check:native-config` **OK**, `expo export` iOS **OK**. **Validation device Maestro : iOS ✓ ET Android ✓** (`pnpm test:device live-poi.yaml` → `✅ Validation device OK, 0 crash`) — smoke + live-poi verts sur les 2 plateformes, en-tête « PROFIL » asserté, screenshots vérifiés (layout conforme maquettes, métriques `↑ 228 m · ↓ 479 m · ~2h00`). A nécessité 2 correctifs infra du runner `device-test.sh` (JDK 17 fallback + garde `set -e` du scan crash) — voir T6.

### File List

**Nouveaux :**
- `apps/mobile/src/components/live/collapsible-profile-section.tsx`
- `apps/mobile/src/components/live/collapsible-profile-section.test.tsx`

**Modifiés :**
- `apps/mobile/src/components/live/live-controls.tsx`
- `apps/mobile/src/components/live/live-controls.test.tsx`
- `apps/mobile/src/app/(app)/live/[id].tsx`
- `apps/mobile/src/lib/i18n/locales/fr.json`
- `apps/mobile/src/lib/i18n/locales/en.json`
- `apps/mobile/src/components/live/live-filters-drawer.tsx` (suppression d'un faux positif lint `react-hooks/refs` pré-existant — hors feature)
- `apps/mobile/.maestro/live-poi.yaml` (assert en-tête « PROFIL »)
- `apps/mobile/.maestro/android/live-poi.yaml` (assert en-tête « PROFIL »)
- `apps/mobile/scripts/device-test.sh` (2 fix infra gate : JDK 17 fallback + garde `set -e` scan crash — hors feature)

### Review Findings

Code review du 2026-06-28 — 4 patch, 7 defer, 4 dismissed.

- [x] [Review][Patch] Boutons −/+ non conformes NFR-LP-003 : `h-8 w-8` = 32×32 px < 44 px minimum — `hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}` ajouté sur btn-minus et btn-plus (32+12=44 px effectif) [`apps/mobile/src/components/live/live-controls.tsx`]
- [x] [Review][Patch] Animation hauteur 0→0 au premier `expand` — guard `if (expanded && contentHeight === 0) return` ajouté dans le `useEffect` [`apps/mobile/src/components/live/collapsible-profile-section.tsx:54-60`]
- [x] [Review][Patch] GPX sans données d'élévation : `computeElevationGain/Loss` retourne `0` (pas `null`) quand tous les `elevM` sont `undefined` → le panneau affichait `↑ 0 m · ↓ 0 m` au lieu de `—` — garde `!gpxPoints.some(p => p.elevM !== undefined)` ajoutée [`apps/mobile/src/app/(app)/live/[id].tsx:252-268`]
- [x] [Review][Patch] `|| true` dans le scan crash — analyse : `|| true` est le fix correct (comportement identique à `|| echo ""` pour l'assignation ; `set -e` BSD `find` justifie la garde ; commentaire déjà documenté). Accepté tel-quel. [`apps/mobile/scripts/device-test.sh:90-91`]
- [x] [Review][Defer] `handleContentLayout` potentiellement en closure périmée sur `contentHeight` — risque futur si `content` change de hauteur dynamiquement (MOB-5.5). Statique pour l'instant. [`apps/mobile/src/components/live/collapsible-profile-section.tsx:62-65`] — deferred, risque futur contenu dynamique MOB-5.5
- [x] [Review][Defer] `setSelectedPoiId(null)` appelé pendant le rendu (setState in render) — violation React 19 concurrent mode ; à convertir en `useEffect` [`apps/mobile/src/app/(app)/live/[id].tsx:163-165`] — deferred, pre-existing avant MOB-5.4
- [x] [Review][Defer] `activeFilterCount` : condition inversée pour `accommodations` (`!has` vs `has` pour les autres couches) — badge potentiellement incorrect [`apps/mobile/src/app/(app)/live/[id].tsx:273-280`] — deferred, pre-existing MOB-5.3
- [x] [Review][Defer] `getCorridorCenter` reçoit des waypoints sans garde `isValidLngLat` — impact limité à l'URL Booking (pas une `GeoJSONSource`), pas de crash MapLibre [`apps/mobile/src/app/(app)/live/[id].tsx:245`] — deferred, URL uniquement, pas MapLibre
- [x] [Review][Defer] `elevation` memo peut recalculer à chaque tick GPS si `useAdventureWaypoints` retourne une nouvelle référence tableau — vérifier la stabilité du hook en mode Live haute fréquence [`apps/mobile/src/app/(app)/live/[id].tsx:252`] — deferred, vérifier stabilité `useAdventureWaypoints` (MOB-5.5)
- [x] [Review][Defer] `profileOpen` non remis à `false` quand `isLiveModeActive` passe à `false` — sans impact tant que `profileContent=undefined` (hasProfile=false garde la section fermée) ; deviendra visible en MOB-5.5 [`apps/mobile/src/app/(app)/live/[id].tsx:107`] — deferred, gardé par hasProfile=false jusqu'à MOB-5.5
- [x] [Review][Defer] Chemin `slider onChange → changeTarget → onProfileAutoOpen` non couvert par les tests (seuls −/+ testés) — code correct, gap de couverture [`apps/mobile/src/components/live/live-controls.test.tsx`] — deferred, gap couverture, à compléter en MOB-5.5

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.4 (ready-for-dev) — re-design panneau Live (ordre maquettes : en-tête PROFIL + chevron, métriques `↑D+ · ↓D- · ~ETA` sous slider, RECHERCHER / RECHERCHER SUR) + section PROFIL repliable (coquille reanimated, collapsed défaut, auto-open 1er contact slider, close on RECHERCHER, chevron manuel, garde `hasProfile`), 44px touch, suppression double affichage (FR-LP-012). Frontend-only, pas de prebuild. Slot `profileContent` rempli par 5.5. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
| 2026-06-28 | 1.0 | Implémentation MOB-5.4 (T1-T5). Re-design `live-controls.tsx` + nouveau `collapsible-profile-section.tsx` (animation `Animated` cœur RN — **déviation** vs reanimated, documentée), câblage `[id].tsx` (`profileOpen` local, D+/D- local, `searchCenter`, close-on-search), i18n `live.panel.*` FR/EN, tests (collapsible 9 + live-controls 23). **Déviations** : animation `Animated` (pas reanimated) ; `city` reverse-geocode non câblé (NFR-LP-005) ; clés i18n `targetTitle`/`searchOn` réconciliées. Fix lint faux positif pré-existant `live-filters-drawer.tsx`. Gate : jest 553/553, tsc 0, lint 0, check:native-config OK, expo export iOS OK. **Validation device Maestro iOS ✓ + Android ✓ (0 crash)** — flows `live-poi` (assert PROFIL) + screenshots vérifiés. Fix infra runner `device-test.sh` (JDK 17 fallback + garde `set -e` du scan crash — bugs gate introduits ce matin, hors feature). | bmad-dev-story (Amelia / claude-opus-4-8) |
| 2026-06-28 | 1.1 | 🐛 **Fix bug latent corrigé en MOB-5.5** (cross-ref) : `collapsible-profile-section.tsx` ne s'ouvrait JAMAIS avec un contenu réel — l'enfant mesuré était clampé à la hauteur 0 (animée) du parent → `onLayout`=0 → `contentHeight` restait 0 → la garde `expanded && contentHeight===0` bloquait l'expansion. Invisible en MOB-5.4 car le slot `profileContent` était toujours vide (`undefined`) ; révélé dès que MOB-5.5 a fourni le profil d'élévation. Fix : contenu mesuré en `position:'absolute'` (pattern react-native-collapsible) → mesure naturelle non clampée. Validé device iOS (graphe visible). Détails complets dans la story MOB-5.5. | bmad-dev-story (MOB-5.5) |
