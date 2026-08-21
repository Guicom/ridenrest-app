# MOB-7.1 — Sliders inutilisables : le ScrollView parent vole le geste

**Statut** : review — 2026-08-21
**Origine** : retour utilisateur Guillaume, 2026-08-21 — « beaucoup de soucis avec les
différents sliders, quasi inutilisables : très rapidement en glissant sur le slider, il n'y a
plus d'action sur le slider mais sur le volet latéral. »

---

## Diagnostic

Les deux primitives (`Slider`, `RangeSlider`) reposent sur `PanResponder`, et vivent toutes
deux dans un `ScrollView` :

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

## Correctif — deux niveaux, parce qu'un seul ne suffit pas

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
- [ ] T6 — **validation simulateur** : glisser franchement en diagonale sur le slider de la
      carte Recherche ; la poignée doit suivre et le panneau ne doit pas défiler.

## Vérifications

- mobile `jest` : **674 / 674**, 97 suites (669 avant, +5)
- `tsc` mobile : 0 erreur
- `eslint` mobile : 0 erreur (2 warnings `exhaustive-deps` préexistants)

## Note de méthode

`PanResponder` a été retenu à l'origine (MOB-4.3) parce que Reanimated casse le build
Storybook. Ce choix reste valable — le problème n'était pas la technologie mais deux
callbacks de négociation manquants. Migrer vers `react-native-gesture-handler` aurait été
disproportionné, et aurait coûté les `slider.stories.tsx`.
