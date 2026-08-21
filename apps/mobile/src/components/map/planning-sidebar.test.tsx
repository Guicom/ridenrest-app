import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PlanningSidebar } from './planning-sidebar';

// Verrou de conteneur (MOB-7.1). Le test de `slider.test.tsx` monte un `ScrollLockProvider`
// a la main : rien n'empechait donc de retirer le provider du sidebar sans faire echouer
// un seul test, alors que c'est LUI qui coupe le defilement pendant un drag de slider.
// Ce test verrouille le cablage cote conteneur.
describe('PlanningSidebar — verrou de defilement', () => {
  it('rend son ScrollView avec `scrollEnabled` pilote (defilable au repos)', async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
      >
        <PlanningSidebar open onOpenChange={() => {}}>
          <Text>contenu</Text>
        </PlanningSidebar>
      </SafeAreaProvider>,
    );

    // `scrollEnabled` doit etre EXPLICITEMENT fourni : `undefined` signifierait que le
    // provider a ete debranche et que le drag de slider fera defiler le panneau.
    expect(screen.getByTestId('planning-sidebar-scroll').props.scrollEnabled).toBe(true);
  });
});
