import { fireEvent, render, screen } from '@testing-library/react-native';

import { MapSearchFeedback } from '@/components/map/map-search-feedback';
import { i18n } from '@/lib/i18n';

// map-search-feedback (MOB-4.3 / T4, T7, AC2-4). Composant présentiel pur : on vérifie
// la présence de chaque retour selon les flags + la précédence (overlay > erreur > vide).

describe('MapSearchFeedback', () => {
  it('isFetching → overlay de chargement (AC2)', async () => {
    await render(
      <MapSearchFeedback isFetching isEmpty={false} isError={false} />,
    );
    expect(screen.getByText(i18n.t('pois.search.loading'))).toBeOnTheScreen();
  });

  it('isEmpty → bannière « Aucun résultat » (AC3)', async () => {
    await render(
      <MapSearchFeedback isFetching={false} isEmpty isError={false} />,
    );
    expect(screen.getByText(i18n.t('pois.search.noResults'))).toBeOnTheScreen();
  });

  it('isError → ErrorBanner + relance (AC4)', async () => {
    const onRetry = jest.fn();
    await render(
      <MapSearchFeedback
        isFetching={false}
        isEmpty={false}
        isError
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(i18n.t('pois.search.error'))).toBeOnTheScreen();
    fireEvent.press(
      screen.getByRole('button', { name: i18n.t('pois.search.button') }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('précédence : isFetching masque erreur et « aucun résultat »', async () => {
    await render(<MapSearchFeedback isFetching isEmpty isError />);
    expect(screen.getByText(i18n.t('pois.search.loading'))).toBeOnTheScreen();
    expect(screen.queryByText(i18n.t('pois.search.error'))).toBeNull();
    expect(screen.queryByText(i18n.t('pois.search.noResults'))).toBeNull();
  });

  it('aucun flag → rien (pas de bannière fantôme)', async () => {
    await render(
      <MapSearchFeedback isFetching={false} isEmpty={false} isError={false} />,
    );
    expect(screen.queryByText(i18n.t('pois.search.noResults'))).toBeNull();
    expect(screen.queryByText(i18n.t('pois.search.error'))).toBeNull();
    expect(screen.queryByText(i18n.t('pois.search.loading'))).toBeNull();
  });
});
