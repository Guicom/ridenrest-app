import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { cn } from '@/lib/cn';
import { useScrollLock } from './scroll-lock';

// Primitives slider (simple + double poignée) — MOB-4.3 / T1, AC1.
//
// **Choix d'implémentation (documenté)** : `PanResponder` (cœur RN), PAS
// `react-native-gesture-handler` + `react-native-reanimated` (Reanimated casse le build
// **Storybook**, cf. `skeleton.tsx`), donc la primitive garde ses `slider.stories.tsx`.
//
// **Gesture = `pageX` (X ABSOLU écran, repère stable) − `trackLeft` (bord gauche de la
// piste mesuré via `measureInWindow`)**. Ni `moveX` (sautait : piste pas en x=0 —
// drawer/marges), ni `locationX` (erratique : change de repère selon l'enfant survolé —
// poignée vs piste). `pageX − trackLeft` est insensible au hit-test des enfants et aux
// re-rendus (repère écran constant). La ref de piste n'est lue qu'en callback `onLayout`
// (jamais en rendu → règle `react-hooks/refs` respectée).
//
// Clamp en fonctions **pures** (`clampRange`/`clampValue`) testables hors React.
// A11y : poignées `accessibilityRole="adjustable"` + actions increment/decrement.

export interface RangeValue {
  low: number;
  high: number;
}

export interface ClampRangeArgs {
  /** Poignée déplacée. */
  handle: 'low' | 'high';
  /** Valeur proposée pour la poignée déplacée (avant clamp). */
  value: number;
  /** Position courante de la poignée basse. */
  low: number;
  /** Position courante de la poignée haute. */
  high: number;
  min: number;
  max: number;
  /** Pas de quantification (défaut 1). */
  step?: number;
  /** Cap sur l'étendue `(high - low)` (défaut `Infinity`). */
  maxRange?: number;
  /** Écart minimal `(high - low)` (défaut `step`). */
  minGap?: number;
}

/** Quantifie `v` au pas `step` puis le borne à `[min, max]`. Pur. */
function snap(v: number, step: number, min: number, max: number): number {
  const snapped = Math.round(v / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

/**
 * Borne une plage `(low, high)` proposée dans `[min, max]` en respectant le pas,
 * l'écart minimal et le **cap d'étendue** `maxRange`. Pure → testable (T7).
 *
 * - poignée `low` : `low' ∈ [max(min, high - maxRange), high - minGap]`
 * - poignée `high` : `high' ∈ [low + minGap, min(max, low + maxRange)]`
 */
export function clampRange({
  handle,
  value,
  low,
  high,
  min,
  max,
  step = 1,
  maxRange = Infinity,
  minGap = step,
}: ClampRangeArgs): RangeValue {
  const v = snap(value, step, min, max);
  if (handle === 'low') {
    const lowerBound = Math.max(min, high - maxRange);
    const upperBound = high - minGap;
    const nextLow = Math.min(Math.max(v, lowerBound), upperBound);
    return { low: nextLow, high };
  }
  const lowerBound = low + minGap;
  const upperBound = Math.min(max, low + maxRange);
  const nextHigh = Math.min(Math.max(v, lowerBound), upperBound);
  return { low, high: nextHigh };
}

/** Borne `v` au pas `step` dans `[min, max]`. Pur → testable. */
export function clampValue(
  value: number,
  min: number,
  max: number,
  step = 1,
): number {
  return snap(value, step, min, max);
}

const HANDLE_SIZE = 28;

/** Convertit une valeur en pourcentage [0,1] de la piste. */
function valueToFraction(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** X absolu écran (`pageX`) → valeur dans `[min, max]`, via le bord/largeur de piste. */
function pageXToValue(
  pageX: number,
  trackLeft: number,
  trackWidth: number,
  min: number,
  max: number,
): number {
  const usable = Math.max(1, trackWidth - HANDLE_SIZE);
  const x = pageX - trackLeft - HANDLE_SIZE / 2;
  const fraction = Math.min(1, Math.max(0, x / usable));
  return min + fraction * (max - min);
}

export interface RangeSliderProps {
  min: number;
  max: number;
  low: number;
  high: number;
  step?: number;
  maxRange?: number;
  minGap?: number;
  onChange: (value: RangeValue) => void;
  /** Appelé au début d'une interaction (poignée saisie) — alimente `searchRangeInteracted`. */
  onInteractStart?: () => void;
  lowLabel?: string;
  highLabel?: string;
  className?: string;
}

export function RangeSlider({
  min,
  max,
  low,
  high,
  step = 1,
  maxRange = Infinity,
  minGap = step,
  onChange,
  onInteractStart,
  lowLabel,
  highLabel,
  className,
}: RangeSliderProps) {
  const trackRef = useRef<View>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [trackLeft, setTrackLeft] = useState(0);
  // Coupe le défilement du conteneur pendant le drag (no-op hors conteneur scrollable).
  const setScrollLocked = useScrollLock();

  // Mesure du bord gauche écran + largeur (callback, jamais en rendu → lint OK).
  const onTrackLayout = useCallback((_e: LayoutChangeEvent) => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      setTrackLeft(x);
      setTrackWidth(width);
    });
  }, []);

  // `PanResponder` créé UNE SEULE FOIS (init paresseuse `useState`), callbacks lisant
  // `latest.current`. Avec un `useMemo` sur [low, high, onChange…], son identité changeait
  // à CHAQUE `onChange` : React Native re-négociait le responder en plein glissement, et
  // `onGrant` se re-déclenchait — exactement le défaut que `Slider` évite plus bas. Latent
  // tant que `RangeSlider` n'est monté nulle part, mais c'est un piège pour le premier
  // écran qui l'utilisera.
  //
  // Geste = `pageX` (X ABSOLU écran) − `trackLeft` (bord gauche mesuré via
  // `measureInWindow`). Ni `moveX` (saute quand la piste n'est pas en x=0), ni `locationX`
  // (repère variable selon l'enfant survolé). La poignée déplacée est la plus proche du
  // toucher.
  /* eslint-disable react-hooks/refs -- refs lues/écrites hors rendu (effet + callbacks de
     geste), pattern « latest ref » pour un PanResponder stable. */
  const latest = useRef({ low, high, trackLeft, trackWidth, min, max, step, maxRange, minGap, onChange, onInteractStart, setScrollLocked });
  useEffect(() => {
    latest.current = { low, high, trackLeft, trackWidth, min, max, step, maxRange, minGap, onChange, onInteractStart, setScrollLocked };
  });

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Cf. le commentaire équivalent sur `Slider` : le ScrollView parent réclame sinon le
      // responder à la moindre dérive verticale et l'obtient.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        latest.current.setScrollLocked(true);
        latest.current.onInteractStart?.();
      },
      onPanResponderRelease: () => latest.current.setScrollLocked(false),
      onPanResponderTerminate: () => latest.current.setScrollLocked(false),
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const l = latest.current;
        if (l.trackWidth <= 0) return;
        const value = pageXToValue(evt.nativeEvent.pageX, l.trackLeft, l.trackWidth, l.min, l.max);
        const handle = Math.abs(value - l.low) <= Math.abs(value - l.high) ? 'low' : 'high';
        l.onChange(
          clampRange({
            handle,
            value,
            low: l.low,
            high: l.high,
            min: l.min,
            max: l.max,
            step: l.step,
            maxRange: l.maxRange,
            minGap: l.minGap,
          }),
        );
      },
    }),
  );
  /* eslint-enable react-hooks/refs */

  const adjust = useCallback(
    (handle: 'low' | 'high', delta: number) => {
      onInteractStart?.();
      const base = handle === 'low' ? low : high;
      onChange(
        clampRange({
          handle,
          value: base + delta,
          low,
          high,
          min,
          max,
          step,
          maxRange,
          minGap,
        }),
      );
    },
    [low, high, min, max, step, maxRange, minGap, onChange, onInteractStart],
  );

  const lowFraction = valueToFraction(low, min, max);
  const highFraction = valueToFraction(high, min, max);
  const usable = Math.max(0, trackWidth - HANDLE_SIZE);

  return (
    <View
      ref={trackRef}
      {...responder.panHandlers}
      onLayout={onTrackLayout}
      className={cn('justify-center', className)}
      style={{ height: HANDLE_SIZE }}
    >
      {/* Piste */}
      <View pointerEvents="none" className="h-1.5 w-full rounded-full bg-muted" />
      {/* Plage active (entre les deux poignées) */}
      {trackWidth > 0 ? (
        <View
          pointerEvents="none"
          className="absolute h-1.5 rounded-full bg-primary"
          style={{
            left: lowFraction * usable + HANDLE_SIZE / 2,
            width: Math.max(0, (highFraction - lowFraction) * usable),
          }}
        />
      ) : null}
      {/* Poignée basse (visuel + a11y) */}
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={lowLabel}
        accessibilityValue={{ min, max, now: low }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          adjust('low', e.nativeEvent.actionName === 'increment' ? step : -step)
        }
        testID="range-slider-low"
        className="absolute h-7 w-7 rounded-full border-2 border-primary bg-background"
        style={{ left: lowFraction * usable }}
      />
      {/* Poignée haute (visuel + a11y) */}
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={highLabel}
        accessibilityValue={{ min, max, now: high }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          adjust('high', e.nativeEvent.actionName === 'increment' ? step : -step)
        }
        testID="range-slider-high"
        className="absolute h-7 w-7 rounded-full border-2 border-primary bg-background"
        style={{ left: highFraction * usable }}
      />
    </View>
  );
}

export interface SliderProps {
  min: number;
  max: number;
  value: number;
  step?: number;
  onChange: (value: number) => void;
  /** Appelé au début d'une interaction (poignée saisie). */
  onInteractStart?: () => void;
  label?: string;
  testID?: string;
  className?: string;
}

/**
 * Slider **à poignée unique** (position) — port iso de l'`<input type="range">` web
 * (carte Recherche). A11y `adjustable` + actions increment/decrement.
 *
 * **Gesture = delta cumulé `gesture.dx`** depuis la valeur capturée au début du geste
 * (`startValueRef`), PAS de position absolue. Ni `moveX`/`pageX` (faux quand la piste
 * n'est pas en x=0 — drawer), ni `locationX` (erratique : repère change selon l'enfant),
 * ni `measureInWindow` (périmé : le drawer s'ouvre par `transform`, sans re-layout → la
 * mesure restait celle de l'état fermé hors-écran). `dx` est un déplacement écran relatif,
 * insensible aux offsets ET aux transforms. La largeur (`trackWidth`) vient du layout
 * (indépendante de la position). Le ref n'est lu QUE dans les callbacks de geste.
 */
export function Slider({
  min,
  max,
  value,
  step = 1,
  onChange,
  onInteractStart,
  label,
  testID = 'slider',
  className,
}: SliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  // Coupe le défilement du conteneur pendant le drag (no-op hors conteneur scrollable).
  const setScrollLocked = useScrollLock();

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  // « latest » : props/état courants lus par le geste. Mis à jour en effet (jamais en
  // rendu). Le `PanResponder` est créé **une seule fois** (deps `[]`) → son identité ne
  // change pas → RN ne ré-négocie PAS le responder en plein drag (sinon `onGrant` se
  // re-déclenchait à chaque `onChange`/re-rendu, remettant `dx`≈0 → la poignée rampait).
  /* eslint-disable react-hooks/refs -- refs lues/écrites uniquement hors rendu (effet +
     callbacks de geste), pattern « latest ref » pour un PanResponder stable. */
  const latest = useRef({ value, trackWidth, min, max, step, onChange, onInteractStart, setScrollLocked });
  useEffect(() => {
    latest.current = { value, trackWidth, min, max, step, onChange, onInteractStart, setScrollLocked };
  });
  const startValueRef = useRef(0);

  // Init paresseuse `useState` = créé **une seule fois**, identité stable (pas `useMemo([])`
  // → règle `preserve-manual-memoization`). Les callbacks lisent `latest.current`.
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
        // Le slider vit dans un ScrollView (PlanningSidebar, drawer de filtres live).
      // Sans ces deux lignes, le ScrollView RÉCLAME le responder dès la moindre dérive
      // verticale du doigt et l'OBTIENT : le drag bascule sur le panneau après quelques
      // pixels, et la poignée se fige. `PanResponder` accorde la terminaison par défaut.
      //   - `onPanResponderTerminationRequest: false` → on refuse de rendre le responder
      //     une fois le geste engagé (négociation JS, iOS + Android).
      //   - `onShouldBlockNativeResponder: true` → on empêche le ScrollView natif Android
      //     de préempter le geste hors de cette négociation.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        startValueRef.current = latest.current.value; // valeur au début du geste
        latest.current.setScrollLocked(true);
        latest.current.onInteractStart?.();
      },
      onPanResponderRelease: () => latest.current.setScrollLocked(false),
      onPanResponderTerminate: () => latest.current.setScrollLocked(false),
      onPanResponderMove: (_evt, gesture) => {
        const l = latest.current;
        const usable = Math.max(1, l.trackWidth - HANDLE_SIZE);
        const next =
          startValueRef.current + (gesture.dx / usable) * (l.max - l.min);
        l.onChange(clampValue(next, l.min, l.max, l.step));
      },
    }),
  );
  /* eslint-enable react-hooks/refs */

  const adjust = useCallback(
    (delta: number) => {
      onInteractStart?.();
      onChange(clampValue(value + delta, min, max, step));
    },
    [value, min, max, step, onChange, onInteractStart],
  );

  const fraction = valueToFraction(value, min, max);
  const usable = Math.max(0, trackWidth - HANDLE_SIZE);

  return (
    <View
      {...responder.panHandlers}
      onLayout={onTrackLayout}
      className={cn('justify-center', className)}
      style={{ height: HANDLE_SIZE }}
    >
      <View pointerEvents="none" className="h-1.5 w-full rounded-full bg-muted" />
      {trackWidth > 0 ? (
        <View
          pointerEvents="none"
          className="absolute h-1.5 rounded-full bg-primary"
          style={{ left: HANDLE_SIZE / 2, width: Math.max(0, fraction * usable) }}
        />
      ) : null}
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          adjust(e.nativeEvent.actionName === 'increment' ? step : -step)
        }
        testID={testID}
        className="absolute h-7 w-7 rounded-full border-2 border-primary bg-background"
        style={{ left: fraction * usable }}
      />
    </View>
  );
}
