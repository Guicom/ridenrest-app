import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdventureSegmentResponse } from '@ridenrest/shared';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { createElement, type ReactNode } from 'react';

import { GpxUploader } from '@/components/adventure/gpx-uploader';
import * as segmentsApi from '@/lib/api/segments';
import { i18n } from '@/lib/i18n';

// Uploader GPX (MOB-3.2 / AC1, AC3). Réseau mocké (façade segments) + picker mocké
// (expo-document-picker, manuel `__mocks__`). `userEvent` (RNTL v14 + React 19).

jest.mock('@/lib/api/segments', () => ({
  listSegments: jest.fn(),
  uploadSegment: jest.fn(),
}));

const mockGetDocument = DocumentPicker.getDocumentAsync as jest.Mock;
const mockUpload = segmentsApi.uploadSegment as jest.Mock;
const t = (k: string) => i18n.t(k);

const FAKE_SEGMENT: AdventureSegmentResponse = {
  id: 'seg-1',
  adventureId: 'adv-1',
  name: 'trace',
  orderIndex: 0,
  cumulativeStartKm: 0,
  distanceKm: 0,
  elevationGainM: null,
  elevationLossM: null,
  parseStatus: 'pending',
  source: null,
  boundingBox: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

function renderUploader() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = (children: ReactNode) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return render(wrapper(createElement(GpxUploader, { adventureId: 'adv-1' })));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GpxUploader (MOB-3.2 / AC1)', () => {
  it('sélection .gpx valide < 10 Mo → upload avec { uri, name, type }', async () => {
    mockGetDocument.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'trace.gpx', uri: 'file:///trace.gpx', size: 1000 }],
    });
    mockUpload.mockResolvedValueOnce(FAKE_SEGMENT);

    const user = userEvent.setup();
    await renderUploader();
    await user.press(screen.getByRole('button'));

    await waitFor(() =>
      expect(mockUpload).toHaveBeenCalledWith(
        'adv-1',
        { uri: 'file:///trace.gpx', name: 'trace.gpx', type: 'application/gpx+xml' },
        undefined,
      ),
    );
  });

  it('sélection annulée → aucun appel réseau', async () => {
    mockGetDocument.mockResolvedValueOnce({ canceled: true, assets: null });

    const user = userEvent.setup();
    await renderUploader();
    await user.press(screen.getByRole('button'));

    await waitFor(() => expect(mockGetDocument).toHaveBeenCalled());
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('fichier > 10 Mo → ErrorBanner taille, aucun appel réseau', async () => {
    mockGetDocument.mockResolvedValueOnce({
      canceled: false,
      assets: [
        { name: 'big.gpx', uri: 'file:///big.gpx', size: 11 * 1024 * 1024 },
      ],
    });

    const user = userEvent.setup();
    await renderUploader();
    await user.press(screen.getByRole('button'));

    expect(
      await screen.findByText(t('adventures.segments.fileTooLarge')),
    ).toBeTruthy();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('extension non .gpx → ErrorBanner extension, aucun appel réseau', async () => {
    mockGetDocument.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'photo.png', uri: 'file:///photo.png', size: 100 }],
    });

    const user = userEvent.setup();
    await renderUploader();
    await user.press(screen.getByRole('button'));

    expect(
      await screen.findByText(t('adventures.segments.invalidExtension')),
    ).toBeTruthy();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejet réseau → ErrorBanner générique', async () => {
    mockGetDocument.mockResolvedValueOnce({
      canceled: false,
      assets: [{ name: 'trace.gpx', uri: 'file:///trace.gpx', size: 1000 }],
    });
    mockUpload.mockRejectedValueOnce(new Error('network'));

    const user = userEvent.setup();
    await renderUploader();
    await user.press(screen.getByRole('button'));

    expect(
      await screen.findByText(t('adventures.segments.uploadError')),
    ).toBeTruthy();
  });
});
