// Mock `expo-blur` (MOB-4.2 fiche « liquid glass »). Le `BlurView` réel est un module
// natif (flou de fond) absent hors device → passe-plat View identifiable. Factory
// CommonJS SANS JSX (contrainte jest/NativeWind, AGENTS.md) : `React.createElement`.
//
// On transmet `testID`/`style`/`children` (assertions de contenu) mais pas les props
// natives (`intensity`/`tint`/`experimentalBlurMethod`) qui warneraient sur View.
const React = require('react');
const { View } = require('react-native');

const BlurView = (props) =>
  React.createElement(
    View,
    { testID: props.testID ?? 'blur-view', style: props.style },
    props.children ?? null,
  );
BlurView.displayName = 'BlurView';

module.exports = { __esModule: true, BlurView };
