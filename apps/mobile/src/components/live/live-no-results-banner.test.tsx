import { render } from '@testing-library/react-native';

import { LiveNoResultsBanner } from '@/components/live/live-no-results-banner';
import { i18n } from '@/lib/i18n';

// LiveNoResultsBanner (MOB-5.3 / T8, T10). `useSafeAreaInsets` mocké (pattern repo).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('LiveNoResultsBanner (AC5)', () => {
  it('masqué quand visible=false', async () => {
    const { queryByText } = await render(<LiveNoResultsBanner visible={false} />);
    expect(queryByText(i18n.t('live.search.noResults'))).toBeNull();
  });

  it('affiché quand visible=true', async () => {
    const { getByText } = await render(<LiveNoResultsBanner visible />);
    expect(getByText(i18n.t('live.search.noResults'))).toBeTruthy();
  });
});
