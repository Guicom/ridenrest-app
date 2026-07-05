// Mock `@gorhom/bottom-sheet` v5 (MOB-4.2). Le sheet réel s'appuie sur
// gesture-handler/reanimated (gestes natifs) → hors device on stube l'API JS pour
// les tests Jest (RNTL). Factory CommonJS SANS JSX (contrainte jest/NativeWind,
// AGENTS.md) : `React.createElement` uniquement.
//
// Choix de rendu :
//   - `BottomSheet` (forwardRef) rend TOUJOURS ses enfants dans une View
//     identifiable (`testID="bottom-sheet"`) → le contenu de la fiche est
//     assertable même si, en vrai, l'animation gère la visibilité. La ref expose
//     les méthodes impératives stubées (`snapToIndex`/`expand`/`close`…).
//   - Il invoque le `backdropComponent` fourni (props `{ onPress }`), pour que le
//     test puisse simuler un tap backdrop → `onChange(-1)` → désélection.
//   - `BottomSheetView`/`BottomSheetScrollView` : passe-plats View.
//   - `BottomSheetBackdrop` : Pressable identifiable (`testID="bottom-sheet-backdrop"`).
const React = require('react');
const { View, Pressable } = require('react-native');

const passthrough = (name) => {
  const Comp = (props) =>
    React.createElement(
      View,
      { testID: props.testID ?? name },
      props.children ?? null,
    );
  Comp.displayName = name;
  return Comp;
};

const BottomSheet = React.forwardRef((props, ref) => {
  React.useImperativeHandle(
    ref,
    () => ({
      snapToIndex: jest.fn(),
      snapToPosition: jest.fn(),
      expand: jest.fn(),
      collapse: jest.fn(),
      close: jest.fn(),
      forceClose: jest.fn(),
    }),
    [],
  );

  // Backdrop : rend le composant fourni avec un `onPress` qui ferme (parité réelle).
  const backdrop =
    typeof props.backdropComponent === 'function'
      ? React.createElement(props.backdropComponent, {
          onPress: () => props.onChange?.(-1),
          animatedIndex: { value: props.index ?? -1 },
          animatedPosition: { value: 0 },
          style: undefined,
        })
      : null;

  return React.createElement(
    View,
    { testID: props.testID ?? 'bottom-sheet' },
    backdrop,
    props.children ?? null,
  );
});
BottomSheet.displayName = 'BottomSheet';

const BottomSheetBackdrop = (props) =>
  React.createElement(Pressable, {
    testID: 'bottom-sheet-backdrop',
    accessibilityRole: 'button',
    onPress: props.onPress,
  });
BottomSheetBackdrop.displayName = 'BottomSheetBackdrop';

module.exports = {
  __esModule: true,
  default: BottomSheet,
  BottomSheetView: passthrough('BottomSheetView'),
  BottomSheetScrollView: passthrough('BottomSheetScrollView'),
  BottomSheetBackdrop,
  BottomSheetModal: BottomSheet,
  BottomSheetModalProvider: passthrough('BottomSheetModalProvider'),
};
