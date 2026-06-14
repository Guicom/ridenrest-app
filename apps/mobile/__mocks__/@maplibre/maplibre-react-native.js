// Mock natif `@maplibre/maplibre-react-native` v11 (MOB-1.4 → câblé MOB-4.1).
// MapLibre Native ne tourne pas hors device → on stube l'API JS pour les tests
// Jest (RNTL). Factory CommonJS SANS JSX (contrainte jest/NativeWind, AGENTS.md) :
// `React.createElement` uniquement.
//
// ⚠️ API **v11** : `Map`/`GeoJSONSource`/`Layer` (renommés depuis les v10
// `MapView`/`ShapeSource`/`LineLayer`). On ne transmet à la `View` hôte que
// `testID` (dérivé de `id`) + `children` — jamais les props natives (mapStyle,
// paint, onDidFinishLoadingStyle…) qui déclencheraient des warnings sur View.
//
// `testID = props.testID ?? props.id ?? <displayName>` → un test peut cibler la
// source/le calque de trace via `getByTestId('trace')` / `getByTestId('trace-line')`.
const React = require('react');
const { View } = require('react-native');

/** Composant passe-plat : rend une View identifiable + ses enfants. */
const passthrough = (name) => {
  const Comp = (props) =>
    React.createElement(
      View,
      { testID: props.testID ?? props.id ?? name },
      props.children ?? null,
    );
  Comp.displayName = name;
  return Comp;
};

/** Variante forwardRef avec handle impératif stubé (Camera/Map exposent une ref). */
const passthroughWithRef = (name, methods) => {
  const Comp = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => {
      const handle = {};
      for (const m of methods) handle[m] = jest.fn();
      return handle;
    }, []);
    return React.createElement(
      View,
      { testID: props.testID ?? props.id ?? name },
      props.children ?? null,
    );
  });
  Comp.displayName = name;
  return Comp;
};

module.exports = {
  __esModule: true,
  Map: passthroughWithRef('Map', [
    'getCenter',
    'getZoom',
    'getBounds',
    'getViewState',
    'queryRenderedFeatures',
    'showAttribution',
  ]),
  Camera: passthroughWithRef('Camera', [
    'fitBounds',
    'flyTo',
    'easeTo',
    'jumpTo',
    'zoomTo',
    'setStop',
  ]),
  GeoJSONSource: passthrough('GeoJSONSource'),
  Layer: passthrough('Layer'),
  Marker: passthrough('Marker'),
  ViewAnnotation: passthrough('ViewAnnotation'),
  Callout: passthrough('Callout'),
  UserLocation: passthrough('UserLocation'),
  RasterSource: passthrough('RasterSource'),
  VectorSource: passthrough('VectorSource'),
  Images: passthrough('Images'),
};
