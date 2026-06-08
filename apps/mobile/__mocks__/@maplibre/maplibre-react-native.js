// Placeholder de mock natif (MOB-1.4) — consommé par MOB-4 (carte native
// MapLibre). Composants no-op rendant leurs enfants pour les tests à venir.
const React = require('react');

const passthrough = (name) => {
  const Comp = ({ children }) => React.createElement(React.Fragment, null, children);
  Comp.displayName = name;
  return Comp;
};

module.exports = {
  MapView: passthrough('MapView'),
  Camera: passthrough('Camera'),
  ShapeSource: passthrough('ShapeSource'),
  LineLayer: passthrough('LineLayer'),
  SymbolLayer: passthrough('SymbolLayer'),
  PointAnnotation: passthrough('PointAnnotation'),
  setAccessToken: jest.fn(),
};
