import { formatEta, formatStageDeparture } from '@/lib/format/stage';

describe('formatEta', () => {
  it('minutes seules', () => {
    expect(formatEta(45)).toBe('45 min');
    expect(formatEta(0)).toBe('0 min');
  });
  it('heures pleines', () => {
    expect(formatEta(120)).toBe('2h');
  });
  it('heures + minutes (zéro-paddé)', () => {
    expect(formatEta(90)).toBe('1h30');
    expect(formatEta(125)).toBe('2h05');
  });
});

describe('formatStageDeparture', () => {
  it('null → chaîne vide', () => {
    expect(formatStageDeparture(null)).toBe('');
    expect(formatStageDeparture('not-a-date')).toBe('');
  });
  it('iso valide → contient le séparateur date · heure', () => {
    const out = formatStageDeparture('2026-06-15T07:30:00.000Z', 'fr');
    expect(out).toContain('·');
    expect(out.length).toBeGreaterThan(5);
  });
});
