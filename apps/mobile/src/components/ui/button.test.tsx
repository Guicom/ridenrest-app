import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Button } from './button';

// RNTL v14 : `render` est asynchrone (rendu concurrent React 19) → toujours `await`.
describe('Button (primitif MOB-1.3 — test exemple Jest/RNTL MOB-1.4)', () => {
  it('rend le label et expose le rôle « button »', async () => {
    await render(<Button label="Valider" />);

    expect(screen.getByText('Valider')).toBeTruthy();
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('déclenche onPress au tap', async () => {
    const onPress = jest.fn();
    await render(<Button label="Tap" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('rend des children custom à la place du label', async () => {
    await render(
      <Button label="ignoré">
        <Text>custom</Text>
      </Button>,
    );

    expect(screen.getByText('custom')).toBeTruthy();
    expect(screen.queryByText('ignoré')).toBeNull();
  });
});
