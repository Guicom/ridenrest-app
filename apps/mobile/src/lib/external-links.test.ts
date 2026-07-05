import { Linking } from 'react-native';

import {
  buildAirbnbSearchUrl,
  buildBookingCoordUrl,
  buildBookingSearchUrl,
  extractCityFromOsmRawData,
  openExternalUrl,
} from '@/lib/external-links';

// MOB-4.5 / T6 — builders externes (parité web `apps/web/src/lib/booking-url.ts`) +
// `openExternalUrl`. Les builders sont des liens de **recherche publics** : AUCUN
// paramètre affilié (`aid`/`label`/env) — le web n'en a pas non plus.

describe('buildBookingSearchUrl', () => {
  it('URL ville (?ss=&dest_type=city), ville encodée', () => {
    const url = buildBookingSearchUrl('Aix-en-Provence');
    expect(url).toBe(
      'https://www.booking.com/searchresults.html?ss=Aix-en-Provence&dest_type=city',
    );
  });

  it('encode les espaces et caractères spéciaux de la ville', () => {
    const url = buildBookingSearchUrl('La Roche-sur-Yon');
    expect(url).toContain('ss=La%20Roche-sur-Yon');
  });

  it('ajoute latitude/longitude si un centre est fourni (biais géographique)', () => {
    const url = buildBookingSearchUrl('Chamonix', { lat: 45.9, lng: 6.8 });
    expect(url).toBe(
      'https://www.booking.com/searchresults.html?ss=Chamonix&dest_type=city&latitude=45.9&longitude=6.8',
    );
  });

  it("n'ajoute AUCUN paramètre affilié (aid/label)", () => {
    const url = buildBookingSearchUrl('Chamonix', { lat: 45.9, lng: 6.8 });
    expect(url).not.toContain('aid=');
    expect(url).not.toContain('label=');
  });
});

describe('buildBookingCoordUrl (fallback sans ville)', () => {
  it('URL coordonnées (latitude/longitude&dest_type=latlong)', () => {
    const url = buildBookingCoordUrl({ lat: 45.9, lng: 6.8 });
    expect(url).toBe(
      'https://www.booking.com/searchresults.html?latitude=45.9&longitude=6.8&dest_type=latlong',
    );
  });
});

describe('buildAirbnbSearchUrl (bbox ±0.2°)', () => {
  it('bbox ±0.2° autour du centre', () => {
    const url = buildAirbnbSearchUrl({ lat: 45.0, lng: 6.0 });
    expect(url).toBe(
      'https://www.airbnb.com/s/homes?ne_lat=45.2&ne_lng=6.2&sw_lat=44.8&sw_lng=5.8',
    );
  });

  it("n'ajoute AUCUN paramètre affilié", () => {
    const url = buildAirbnbSearchUrl({ lat: 45.0, lng: 6.0 });
    expect(url).not.toContain('aid=');
    expect(url).not.toContain('label=');
  });
});

describe('extractCityFromOsmRawData (addr:city > town > village)', () => {
  it('rawData absent → null', () => {
    expect(extractCityFromOsmRawData(undefined).city).toBeNull();
  });

  it('priorité addr:city', () => {
    const { city } = extractCityFromOsmRawData({
      'addr:city': 'Annecy',
      'addr:town': 'Faux',
      'addr:village': 'Faux',
    });
    expect(city).toBe('Annecy');
  });

  it('fallback addr:town puis addr:village', () => {
    expect(
      extractCityFromOsmRawData({ 'addr:town': 'Sallanches' }).city,
    ).toBe('Sallanches');
    expect(
      extractCityFromOsmRawData({ 'addr:village': 'Argentière' }).city,
    ).toBe('Argentière');
  });

  it('aucune clé ville → null', () => {
    expect(extractCityFromOsmRawData({ 'addr:postcode': '74400' }).city).toBeNull();
  });
});

describe('openExternalUrl', () => {
  afterEach(() => jest.restoreAllMocks());

  it('appelle Linking.openURL et renvoie { ok: true } au succès', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const res = await openExternalUrl('https://www.booking.com/x');
    expect(spy).toHaveBeenCalledWith('https://www.booking.com/x');
    expect(res.ok).toBe(true);
  });

  it('un rejet de openURL est capturé → { ok: false } (jamais de throw)', async () => {
    jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValue(new Error('no handler'));
    await expect(openExternalUrl('weird://x')).resolves.toMatchObject({
      ok: false,
    });
  });
});
