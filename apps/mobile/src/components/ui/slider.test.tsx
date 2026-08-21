import { PanResponder } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { RangeSlider, Slider, clampRange, clampValue } from './slider';
import { ScrollLockProvider } from './scroll-lock';

// Slider double poignée (MOB-4.3 / T1, T7). On teste la logique de clamp **pure**
// (cap 30 km, écart min, bornes) + le point d'entrée a11y increment/decrement
// (PanResponder n'est pas simulable en RNTL, mais les actions a11y le sont).

describe('clampRange (pur)', () => {
  it('respecte le cap d’étendue maxRange (poignée haute)', () => {
    // high proposé à 60 mais low=10 + cap 30 → high plafonné à 40.
    expect(
      clampRange({ handle: 'high', value: 60, low: 10, high: 30, min: 0, max: 100, maxRange: 30 }),
    ).toEqual({ low: 10, high: 40 });
  });

  it('respecte le cap d’étendue maxRange (poignée basse)', () => {
    // low proposé à 0 mais high=40 + cap 30 → low ne peut descendre sous 10.
    expect(
      clampRange({ handle: 'low', value: 0, low: 20, high: 40, min: 0, max: 100, maxRange: 30 }),
    ).toEqual({ low: 10, high: 40 });
  });

  it('garantit high > low via minGap (poignée haute)', () => {
    expect(
      clampRange({ handle: 'high', value: 5, low: 10, high: 30, min: 0, max: 100, step: 1 }),
    ).toEqual({ low: 10, high: 11 });
  });

  it('garantit low < high via minGap (poignée basse)', () => {
    expect(
      clampRange({ handle: 'low', value: 50, low: 10, high: 30, min: 0, max: 100, step: 1 }),
    ).toEqual({ low: 29, high: 30 });
  });

  it('borne aux extrémités [min, max] et quantifie au pas', () => {
    expect(
      clampRange({ handle: 'low', value: -7, low: 10, high: 30, min: 0, max: 100 }),
    ).toEqual({ low: 0, high: 30 });
    expect(
      clampRange({ handle: 'high', value: 153, low: 10, high: 30, min: 0, max: 100, maxRange: 100 }),
    ).toEqual({ low: 10, high: 100 });
  });
});

describe('clampValue (pur, slider simple)', () => {
  it('borne à [min, max] et quantifie au pas', () => {
    expect(clampValue(-5, 0, 100)).toBe(0);
    expect(clampValue(153, 0, 100)).toBe(100);
    expect(clampValue(42.4, 0, 100, 1)).toBe(42);
  });
});

describe('Slider simple (a11y)', () => {
  it('incrément / décrément a11y → onChange clampé + onInteractStart', async () => {
    const onChange = jest.fn();
    const onInteractStart = jest.fn();
    await render(
      <Slider
        min={0}
        max={100}
        value={10}
        step={1}
        onChange={onChange}
        onInteractStart={onInteractStart}
      />,
    );
    fireEvent(screen.getByTestId('slider'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).toHaveBeenCalledWith(11);
    expect(onInteractStart).toHaveBeenCalled();
  });
});

describe('RangeSlider (a11y)', () => {
  it('incrément a11y de la poignée basse → onChange clampé', async () => {
    const onChange = jest.fn();
    await render(
      <RangeSlider min={0} max={100} low={10} high={30} step={1} onChange={onChange} />,
    );
    fireEvent(screen.getByTestId('range-slider-low'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).toHaveBeenCalledWith({ low: 11, high: 30 });
  });

  it('décrément a11y de la poignée haute → onChange + onInteractStart', async () => {
    const onChange = jest.fn();
    const onInteractStart = jest.fn();
    await render(
      <RangeSlider
        min={0}
        max={100}
        low={10}
        high={30}
        step={1}
        onChange={onChange}
        onInteractStart={onInteractStart}
      />,
    );
    fireEvent(screen.getByTestId('range-slider-high'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onChange).toHaveBeenCalledWith({ low: 10, high: 29 });
    expect(onInteractStart).toHaveBeenCalled();
  });
});


// Conflit de gestes avec le ScrollView parent — bug remonté le 2026-08-21 : « très
// rapidement en glissant sur le slider, il n'y a plus d'action sur le slider mais sur le
// volet latéral ». Les deux sliders vivent dans un ScrollView (PlanningSidebar, drawer de
// filtres live) qui réclamait et obtenait le responder à la moindre dérive verticale.
describe('rétention du geste face au ScrollView parent', () => {
  async function configsFrom(mount: () => Promise<unknown>) {
    const spy = jest.spyOn(PanResponder, 'create');
    spy.mockClear();
    await mount();
    const configs = spy.mock.calls.map((c) => c[0]);
    spy.mockRestore();
    return configs;
  }

  it.each([
    ['Slider', () => render(<Slider min={0} max={100} value={50} onChange={() => {}} />)],
    ['RangeSlider', () => render(<RangeSlider min={0} max={100} low={10} high={40} onChange={() => {}} />)],
  ])('%s refuse de rendre le responder et bloque le scroll natif', async (_name, mount) => {
    const [config] = await configsFrom(mount);

    // Sans ça, PanResponder ACCORDE la terminaison par défaut : le ScrollView prend la main.
    expect(config?.onPanResponderTerminationRequest?.({} as never, {} as never)).toBe(false);
    // Android : empêche le ScrollView natif de préempter hors de la négociation JS.
    expect(config?.onShouldBlockNativeResponder?.({} as never, {} as never)).toBe(true);
  });

  it.each([
    ['Slider', () => render(<Slider min={0} max={100} value={50} onChange={() => {}} />)],
    ['RangeSlider', () => render(<RangeSlider min={0} max={100} low={10} high={40} onChange={() => {}} />)],
  ])('%s libère le verrou de scroll au relâchement ET à la terminaison', async (_name, mount) => {
    const [config] = await configsFrom(mount);

    // Oublier `onPanResponderTerminate` laisserait le panneau non défilable après un geste
    // interrompu (appel entrant, multi-touch) — panneau figé, sans moyen de le débloquer.
    expect(typeof config?.onPanResponderRelease).toBe('function');
    expect(typeof config?.onPanResponderTerminate).toBe('function');
  });

  it('verrouille puis déverrouille le scroll du conteneur autour du geste', async () => {
    const seen: boolean[] = [];
    const spy = jest.spyOn(PanResponder, 'create');
    await render(
      <ScrollLockProvider>
        {(scrollEnabled) => {
          seen.push(scrollEnabled);
          return <Slider min={0} max={100} value={50} onChange={() => {}} />;
        }}
      </ScrollLockProvider>,
    );
    const config = spy.mock.calls.at(-1)?.[0];
    spy.mockRestore();

    expect(seen.at(-1)).toBe(true);            // au repos, le panneau défile
    await act(async () => { config?.onPanResponderGrant?.({} as never, {} as never); });
    expect(seen.at(-1)).toBe(false);           // pendant le drag, il ne défile plus
    await act(async () => { config?.onPanResponderRelease?.({} as never, {} as never); });
    expect(seen.at(-1)).toBe(true);            // et il redéfile après
  });
});
