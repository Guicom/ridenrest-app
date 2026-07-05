import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import {
  LegalSection,
  PRIVACY_URL,
  TERMS_URL,
} from '@/components/shared/legal-section';
import { openExternalUrl } from '@/lib/external-links';
import { i18n } from '@/lib/i18n';

// MOB-6.4 / T1+T5 (AC3) — la section "Légal" rend 2 liens et ouvre les bonnes URLs
// via `openExternalUrl` (mocké — pas de `Linking` réel). i18n réel (FR par défaut).

jest.mock('@/lib/external-links', () => ({
  openExternalUrl: jest.fn(),
}));

const mockOpen = openExternalUrl as jest.Mock;
const t = (k: string) => i18n.t(k);

beforeEach(() => {
  jest.clearAllMocks();
  mockOpen.mockResolvedValue({ ok: true });
});

describe('LegalSection', () => {
  it('rend 2 liens legaux (confidentialite + CGU)', async () => {
    await render(<LegalSection />);
    expect(screen.getByTestId('legal-privacy')).toBeOnTheScreen();
    expect(screen.getByTestId('legal-terms')).toBeOnTheScreen();
    expect(screen.getByText(t('settings.legal.privacyPolicy'))).toBeOnTheScreen();
    expect(screen.getByText(t('settings.legal.terms'))).toBeOnTheScreen();
  });

  it("ouvre l'URL de confidentialite via openExternalUrl", async () => {
    await render(<LegalSection />);
    fireEvent.press(screen.getByTestId('legal-privacy'));
    expect(mockOpen).toHaveBeenCalledWith(PRIVACY_URL);
    expect(PRIVACY_URL).toBe('https://ridenrest.app/privacy');
  });

  it("ouvre l'URL des CGU via openExternalUrl", async () => {
    await render(<LegalSection />);
    fireEvent.press(screen.getByTestId('legal-terms'));
    expect(mockOpen).toHaveBeenCalledWith(TERMS_URL);
    expect(TERMS_URL).toBe('https://ridenrest.app/terms');
  });

  it("affiche un feedback non bloquant si l'ouverture echoue", async () => {
    mockOpen.mockResolvedValue({ ok: false, error: new Error('no browser') });
    await render(<LegalSection />);
    fireEvent.press(screen.getByTestId('legal-privacy'));
    await waitFor(() =>
      expect(screen.getByText(t('settings.legal.openError'))).toBeOnTheScreen(),
    );
  });

  it('le bouton est desactive pendant un appel en vol (protection double-tap)', async () => {
    let resolveFirst!: (v: { ok: boolean }) => void;
    mockOpen.mockImplementationOnce(
      () => new Promise((r) => { resolveFirst = r; }),
    );
    await render(<LegalSection />);
    fireEvent.press(screen.getByTestId('legal-privacy'));
    await waitFor(() => expect(screen.getByTestId('legal-privacy')).toBeDisabled());
    expect(mockOpen).toHaveBeenCalledTimes(1);
    resolveFirst({ ok: true });
    await waitFor(() => expect(screen.getByTestId('legal-privacy')).not.toBeDisabled());
  });

  it("efface l'erreur lors d'un retry reussi", async () => {
    mockOpen
      .mockResolvedValueOnce({ ok: false, error: new Error('first') })
      .mockResolvedValue({ ok: true });
    await render(<LegalSection />);
    fireEvent.press(screen.getByTestId('legal-privacy'));
    await waitFor(() =>
      expect(screen.getByText(t('settings.legal.openError'))).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByTestId('legal-privacy'));
    await waitFor(() =>
      expect(screen.queryByText(t('settings.legal.openError'))).toBeNull(),
    );
  });
});
