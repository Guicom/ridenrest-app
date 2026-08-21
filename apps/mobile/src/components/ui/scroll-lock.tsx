import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Verrou de défilement pour les conteneurs scrollables qui hébergent un slider.
 *
 * Pourquoi : un `PanResponder` horizontal dans un `ScrollView` perd le geste dès que le
 * doigt dérive verticalement — le panneau se met à défiler et la poignée se fige (bug
 * remonté le 2026-08-21 : « très rapidement en glissant sur le slider, il n'y a plus
 * d'action sur le slider mais sur le volet latéral »).
 *
 * `onPanResponderTerminationRequest: () => false` règle la négociation **JS**, mais sur iOS
 * le `UIScrollView` natif peut préempter hors de cette négociation. Couper `scrollEnabled`
 * le temps du drag est la seule garantie côté natif.
 *
 * Sans provider, `useScrollLock()` renvoie un no-op : la primitive reste utilisable hors
 * conteneur scrollable (Storybook, écrans simples) sans condition.
 */
/**
 * Exporté : un conteneur qui pilote DÉJÀ un verrou (parce que son propre geste doit couper
 * le défilement, cf. `live-filters-drawer`) fournit sa valeur directement, plutôt que
 * d'empiler un second mécanisme au-dessus de `ScrollLockProvider`.
 */
export const ScrollLockContext = createContext<(locked: boolean) => void>(() => {});

export function useScrollLock(): (locked: boolean) => void {
  return useContext(ScrollLockContext);
}

export interface ScrollLockProviderProps {
  children: (scrollEnabled: boolean) => ReactNode;
}

/**
 * Fournit le verrou et expose `scrollEnabled` au conteneur via une render prop — le
 * conteneur reste maître de son `ScrollView`.
 */
export function ScrollLockProvider({ children }: ScrollLockProviderProps) {
  const [locked, setLocked] = useState(false);
  const value = useMemo(() => setLocked, []);
  return (
    <ScrollLockContext.Provider value={value}>
      {children(!locked)}
    </ScrollLockContext.Provider>
  );
}
