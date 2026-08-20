import { render, screen, waitFor } from '@testing-library/react-native';

import { ExtendedSearchStatus } from '@/components/map/extended-search-status';
import { i18n } from '@/lib/i18n';

// Statut de la recherche étendue (parité web `extended-search-status.test.tsx`). Composant
// présentiel pur, piloté par deux flags. RNTL v14 → `await render`.

describe('ExtendedSearchStatus', () => {
  it('n’affiche rien quand la recherche étendue n’est ni en cours ni en erreur', async () => {
    const { toJSON } = await render(
      <ExtendedSearchStatus pending={false} error={false} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('annonce la recherche en cours', async () => {
    await render(<ExtendedSearchStatus pending error={false} />);
    expect(screen.getByText(i18n.t('pois.search.extendedPending'))).toBeOnTheScreen();
  });

  it('passe au message « plus longue que prévu » au-delà du seuil', async () => {
    await render(<ExtendedSearchStatus pending error={false} slowThresholdMs={10} />);
    expect(screen.getByText(i18n.t('pois.search.extendedPending'))).toBeOnTheScreen();

    await waitFor(() =>
      expect(screen.getByText(i18n.t('pois.search.extendedSlow'))).toBeOnTheScreen(),
    );
  });

  it('affiche « résultats partiels » en cas d’échec', async () => {
    await render(<ExtendedSearchStatus pending={false} error />);
    expect(screen.getByText(i18n.t('pois.search.extendedError'))).toBeOnTheScreen();
  });

  it('donne la priorité à l’erreur si les deux sont vrais', async () => {
    await render(<ExtendedSearchStatus pending error />);
    expect(screen.getByText(i18n.t('pois.search.extendedError'))).toBeOnTheScreen();
    expect(screen.queryByText(i18n.t('pois.search.extendedPending'))).toBeNull();
  });

  it('remet le compteur de lenteur à zéro entre deux recherches', async () => {
    const { rerender } = await render(
      <ExtendedSearchStatus pending error={false} slowThresholdMs={10} />,
    );
    await waitFor(() =>
      expect(screen.getByText(i18n.t('pois.search.extendedSlow'))).toBeOnTheScreen(),
    );

    // Recherche terminée, puis nouvelle recherche : on repart sur le message normal.
    // `rerender` est asynchrone en RNTL v14 : sans `await`, l'effet qui remet `isSlow` à
    // false n'est pas vidé et l'assertion suivante lit l'ancien message.
    await rerender(<ExtendedSearchStatus pending={false} error={false} slowThresholdMs={10} />);
    await rerender(<ExtendedSearchStatus pending error={false} slowThresholdMs={99_000} />);

    expect(screen.getByText(i18n.t('pois.search.extendedPending'))).toBeOnTheScreen();
  });

  it('ne bloque jamais l’interaction — l’utilisateur roule pendant la recherche', async () => {
    const { toJSON } = await render(<ExtendedSearchStatus pending error={false} />);
    const root = toJSON() as { props: Record<string, unknown> };
    expect(root.props.pointerEvents).toBe('none');
  });
});
