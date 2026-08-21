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
- [x] T7 — **validé sur simulateur** (iPhone 17 Pro, iOS 26.5, build Release, 2026-08-21) :

      | cas | résultat |
      |---|---|
      | diagonale vers la **droite** depuis 0 | 0 → 172 km, stats suivies (1955 m D+ · 1241 m D−) |
      | diagonale vers la **gauche** | 172 → 20 km, stats suivies (89 m D+ · 45 m D−) |
      | gauche **finissant à 7 pt du bord** (dans la bande de retour) | 20 → 0 km, pas de dépilage |
      | glissement **vertical** (contre-épreuve) | le panneau défile normalement, verrou non coincé |

      Dans les quatre cas : écran non dépilé, volet non défilé.

      Le troisième cas est celui qui justifie de garder les **deux** correctifs : le geste de
      retour s'amorce sur le point de **départ**, mais c'est le refus de terminaison
      (`onPanResponderTerminationRequest`) qui empêche un concurrent de préempter en cours de
      glissement une fois le doigt entré dans la bande de bord.

## Audit de couverture (2026-08-21, agent dédié — demande Guillaume)

Le correctif ayant été posé sur la primitive partagée, restait à vérifier qu'aucun geste ne
lui échappait. Cinq lacunes trouvées, **toutes corrigées** :

1. **`live-filters-drawer.tsx` avait son propre `PanResponder`** (glisser-fermer vertical)
   sans aucune des trois protections, en concurrence directe avec son `ScrollView` interne —
   et sans `onPanResponderTerminate`, donc un geste interrompu laissait le tiroir figé à
   mi-hauteur. Même bug que celui remonté, sur un autre composant. Corrigé, avec snap-back
   sur terminaison.
2. **`RangeSlider` recréait son responder en plein glissement** : les deps du `useMemo`
   incluaient `low`/`high`/`onChange`, donc l'identité changeait à chaque valeur et React
   Native pouvait re-négocier le responder au milieu du geste. Basculé sur le même pattern
   « latest ref » que `Slider`. Latent (composant monté nulle part) mais c'était un piège
   pour le premier écran qui l'utiliserait.
3. **Verrou mal placé** : le provider était sur le tiroir Live (qui ne contient aucun
   slider) alors que le tiroir en avait besoin **pour son propre geste**. `ScrollLockContext`
   est désormais exporté et le tiroir fournit sa propre valeur — un seul mécanisme, utilisé
   à la fois par son geste de fermeture et par tout slider qu'on y ajouterait.
4. **Stacks racine et `(auth)` non bornés** — aucun écran à slider en dessous aujourd'hui,
   mais laisser un navigateur non borné, c'est laisser le piège se refermer sur le prochain
   écran. Bornés à l'identique.
5. **Aucun test ne verrouillait les conteneurs** : `slider.test.tsx` monte son provider à la
   main, donc on pouvait débrancher celui de `planning-sidebar.tsx` sans faire échouer un
   seul test. Ajout de `planning-sidebar.test.tsx`, qui vérifie que `scrollEnabled` est
   explicitement piloté.

Périmètre confirmé par l'audit : **deux** points d'appel de slider dans tout le code
applicatif (`search-range-control.tsx:383`, `live-controls.tsx:222`), aucun slider tiers,
aucun `Gesture.Pan`/`Swipeable`/carrousel, et `@gorhom/bottom-sheet` explicitement écarté
partout.

## Vérifications

- mobile `jest` : **676 / 676**, 98 suites (669 avant, +7)
- validation simulateur iPhone 17 Pro (iOS 26.5, build Release standalone)
- `tsc` mobile : 0 erreur
- `eslint` mobile : 0 erreur (2 warnings `exhaustive-deps` préexistants)

## Note de méthode

`PanResponder` a été retenu à l'origine (MOB-4.3) parce que Reanimated casse le build
Storybook. Ce choix reste valable — le problème n'était pas la technologie mais deux
callbacks de négociation manquants. Migrer vers `react-native-gesture-handler` aurait été
disproportionné, et aurait coûté les `slider.stories.tsx`.
