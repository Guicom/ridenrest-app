# MOB-7.1 — Sliders inutilisables : le ScrollView parent vole le geste

**Statut** : done — 2026-08-21 (validé simulateur)
**Origine** : retour utilisateur Guillaume, 2026-08-21 — « beaucoup de soucis avec les
différents sliders, quasi inutilisables : très rapidement en glissant sur le slider, il n'y a
plus d'action sur le slider mais sur le volet latéral. »

---

## Diagnostic — deux concurrents, pas un

⚠️ **Le premier diagnostic était incomplet.** Il désignait le `ScrollView` parent, ce qui est un
conflit réel mais **pas celui que Guillaume subissait**. Reproduit sur simulateur le 2026-08-21
(iPhone 17 Pro, build Release) : un glissement horizontal sur la poignée **dépilait l'écran** au
lieu de déplacer le slider — y compris en glissement strictement horizontal, loin de tout bord.
Guillaume a confirmé : « le problème que tu rencontres est celui dont je te parle ».

### Concurrent 1 (le vrai) — le geste de retour de la pile de navigation

Le retour par glissement couvre **toute la largeur** de l'écran par défaut. Or les écrans carte
et live sont bâtis autour de gestes horizontaux, et **le geste de retour a exactement la même
direction que le geste utile**. Pire : le slider de position est au repos tout à gauche, là où
le retour est le plus sensible. L'utilisateur ne pouvait quasiment pas bouger une poignée sans
quitter l'écran — deux tentatives sur trois dépilaient l'écran avant que la poignée ne bouge.

Vu de l'utilisateur, le panneau glisse hors de l'écran : d'où la formulation « il n'y a plus
d'action sur le slider mais sur le volet latéral ».

**Correctif** (`(app)/_layout.tsx`) :

```ts
fullScreenGestureEnabled: false,
gestureResponseDistance: { start: 20 },   // bande de 20 pt au bord gauche
```

L'affordance iOS de retour au bord est conservée ; le reste de l'écran redevient disponible pour
les gestes de l'app. Ne pas relâcher cette borne sans revalider les sliders sur device.

### Concurrent 2 (réel, latent) — le `ScrollView` parent

Indépendamment du précédent, les deux primitives (`Slider`, `RangeSlider`) reposent sur
`PanResponder` et vivent dans un `ScrollView` :

| slider | conteneur |
|---|---|
| `search-range-control.tsx` (planning) | `PlanningSidebar` → `ScrollView` |
| `live-controls.tsx` (live) | panneau live |
| drawer de filtres live | `live-filters-drawer.tsx` → `ScrollView` (`maxHeight: 420`) |

Aucun des deux `PanResponder.create` ne déclarait `onPanResponderTerminationRequest` ni
`onShouldBlockNativeResponder`. **`PanResponder` accorde la terminaison par défaut** : dès que
le doigt dérive verticalement de quelques pixels, le `ScrollView` réclame le responder et
l'obtient. Le drag bascule sur le panneau, la poignée se fige. Le symptôme est d'autant plus
marqué que le geste utile est horizontal et le geste concurrent vertical — impossible de
glisser parfaitement droit au doigt.

#### Correctif du concurrent 2 — deux niveaux, parce qu'un seul ne suffit pas

**1. Négociation JS** (`slider.tsx`, les deux primitives) :

```ts
onPanResponderTerminationRequest: () => false,   // on refuse de rendre le responder
onShouldBlockNativeResponder: () => true,        // Android : pas de préemption native
```

**2. Verrou de défilement natif** (`scroll-lock.tsx`, nouveau) : sur iOS, le `UIScrollView`
natif peut préempter **hors** de la négociation JS. Couper `scrollEnabled` le temps du drag est
la seule garantie côté natif.

- `ScrollLockProvider` : render prop `(scrollEnabled) => ReactNode`, le conteneur reste maître
  de son `ScrollView`.
- `useScrollLock()` : no-op sans provider → la primitive reste utilisable hors conteneur
  scrollable (Storybook, écrans simples) sans condition.
- Verrou posé sur `onPanResponderGrant`, levé sur `onPanResponderRelease` **et**
  `onPanResponderTerminate`. Oublier la terminaison laisserait le panneau non défilable après
  un geste interrompu (appel entrant, multi-touch) — panneau figé sans moyen de le débloquer.

Appliqué à `PlanningSidebar` et `live-filters-drawer`.

## Tâches

- [x] T1 — `onPanResponderTerminationRequest` / `onShouldBlockNativeResponder` sur les deux primitives
- [x] T2 — `ScrollLockProvider` / `useScrollLock`, no-op sans provider
- [x] T3 — verrou posé/levé, terminaison incluse
- [x] T4 — câblage `PlanningSidebar` + `live-filters-drawer`
- [x] T5 — 5 tests de non-régression (`slider.test.tsx`) : refus de terminaison, blocage natif,
      présence de `release` ET `terminate`, cycle verrou/déverrou observé via le provider
- [x] T6 — reproduction simulateur : le geste de retour était le vrai coupable (diagnostic
      initial corrigé), borne au bord posée, 1 test de non-régression
- [x] T7 — **validé sur simulateur** (iPhone 17 Pro, build Release, 2026-08-21) : glissement
      franchement diagonal sur la poignée → passe de 0 à 172 km, stats suivies
      (1955 m D+ · 1241 m D−), **écran non dépilé**, **volet non défilé**. Contre-épreuve : un
      glissement vertical fait bien défiler le panneau (verrou non coincé).

## Vérifications

- mobile `jest` : **675 / 675**, 97 suites (669 avant, +6)
- validation simulateur iPhone 17 Pro (iOS 26.5, build Release standalone)
- `tsc` mobile : 0 erreur
- `eslint` mobile : 0 erreur (2 warnings `exhaustive-deps` préexistants)

## Note de méthode

`PanResponder` a été retenu à l'origine (MOB-4.3) parce que Reanimated casse le build
Storybook. Ce choix reste valable — le problème n'était pas la technologie mais deux
callbacks de négociation manquants. Migrer vers `react-native-gesture-handler` aurait été
disproportionné, et aurait coûté les `slider.stories.tsx`.
