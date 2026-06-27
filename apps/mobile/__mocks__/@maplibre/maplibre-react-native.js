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

// `Map` : comme `passthroughWithRef`, mais **simule le chargement du style** en appelant
// `onDidFinishLoadingStyle` au montage. Sans ça, `styleLoaded` resterait `false` côté
// `MapCanvas` (qui ne monte les `<GeoJSONSource>` qu'après le style chargé — fix anti-SIGABRT
// 2026-06-27) → la trace/les calques ne seraient jamais rendus en test.
const MAP_METHODS = [
  'getCenter',
  'getZoom',
  'getBounds',
  'getViewState',
  'queryRenderedFeatures',
  'showAttribution',
  'project',
  'unproject',
];
const MapMock = React.forwardRef((props, ref) => {
  React.useImperativeHandle(ref, () => {
    const handle = {};
    for (const m of MAP_METHODS) handle[m] = jest.fn();
    return handle;
  }, []);
  React.useEffect(() => {
    props.onDidFinishLoadingStyle?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return React.createElement(
    View,
    { testID: props.testID ?? props.id ?? 'Map' },
    props.children ?? null,
  );
});
MapMock.displayName = 'Map';

module.exports = {
  __esModule: true,
  Map: MapMock,
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
