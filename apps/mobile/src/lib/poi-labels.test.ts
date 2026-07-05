import type { PoiCategory } from '@ridenrest/shared';

import { getAccessLabelKey } from '@/lib/poi-labels';

// MOB-4.6 / T3, T8 — libellé d'accès contextualisé (pur, renvoie une clé i18n).

describe('getAccessLabelKey', () => {
  it.each<[PoiCategory, string]>([
    ['hotel', 'pois.access.label.hotel'],
    ['hostel', 'pois.access.label.hostel'],
    ['camp_site', 'pois.access.label.camp_site'],
    ['shelter', 'pois.access.label.shelter'],
    ['guesthouse', 'pois.access.label.guesthouse'],
  ])('catégorie %s → clé %s', (category, key) => {
    expect(getAccessLabelKey(category)).toBe(key);
  });

  it('catégorie non-hébergement → fallback', () => {
    expect(getAccessLabelKey('restaurant')).toBe('pois.access.label.fallback');
    expect(getAccessLabelKey('bike_shop')).toBe('pois.access.label.fallback');
  });

  it('null/undefined → fallback', () => {
    expect(getAccessLabelKey(null)).toBe('pois.access.label.fallback');
    expect(getAccessLabelKey(undefined)).toBe('pois.access.label.fallback');
  });
});
