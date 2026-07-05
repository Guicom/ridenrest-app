import { render, screen } from '@testing-library/react-native';

import { SegmentStatusBadge } from '@/components/adventure/segment-status-badge';
import { i18n } from '@/lib/i18n';

// Mapping statut → libellé i18n (MOB-3.2 / AC2-3). i18n réel (fr en test).
const t = (k: string) => i18n.t(k);

describe('SegmentStatusBadge (MOB-3.2 — 4 mappings statut)', () => {
  it.each([
    ['pending', 'adventures.segments.status.pending'],
    ['processing', 'adventures.segments.status.processing'],
    ['done', 'adventures.segments.status.done'],
    ['error', 'adventures.segments.status.error'],
  ] as const)('statut %s → libellé i18n', async (status, key) => {
    await render(<SegmentStatusBadge status={status} />);
    expect(screen.getByText(t(key))).toBeTruthy();
  });
});
