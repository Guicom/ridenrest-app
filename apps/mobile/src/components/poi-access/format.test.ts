import {
  formatAccessDistance,
  formatAccessElevation,
  formatAccessEta,
} from '@/components/poi-access/format';

// MOB-4.6 / T4, T8 + MOB-6.3 / T2 — helpers de format purs. Séparateur décimal
// localisé (`Intl` + `locale`, défaut `'fr'`) : virgule FR / point EN, plus de
// `.replace('.', ',')` figé.

describe('formatAccessDistance', () => {
  it('< 1000 m → "X m" (entier arrondi)', () => {
    expect(formatAccessDistance(740)).toBe('740 m');
    expect(formatAccessDistance(0)).toBe('0 m');
    expect(formatAccessDistance(999.4)).toBe('999 m');
  });

  it('≥ 1000 m → "X,X km" (virgule FR, 1 décimale)', () => {
    expect(formatAccessDistance(1500)).toBe('1,5 km');
    expect(formatAccessDistance(12340)).toBe('12,3 km');
  });

  it('arrondi à 1000 m → bascule en km (999,6 m → "1,0 km")', () => {
    expect(formatAccessDistance(999.6)).toBe('1,0 km');
  });

  it('locale EN → point décimal, 1 décimale conservée ("1.4 km", "2.0 km")', () => {
    expect(formatAccessDistance(1400, 'en')).toBe('1.4 km');
    expect(formatAccessDistance(2000, 'en')).toBe('2.0 km');
    expect(formatAccessDistance(740, 'en')).toBe('740 m');
  });
});

describe('formatAccessElevation', () => {
  it('entier en mètres', () => {
    expect(formatAccessElevation(40.7)).toBe('41 m');
    expect(formatAccessElevation(0)).toBe('0 m');
  });

  it('séparateur de milliers EN (virgule pour les milliers, pas le décimal)', () => {
    expect(formatAccessElevation(1234, 'en')).toBe('1,234 m');
  });

  it('séparateur de milliers FR (espace fine insécable pour les milliers)', () => {
    expect(formatAccessElevation(1234)).toBe('1 234 m');
  });
});

describe('formatAccessEta', () => {
  it('secondes BRouter → "~X min" sous l’heure', () => {
    expect(formatAccessEta(360)).toBe('~6 min');
  });

  it('"~XhMM" au-delà d’une heure', () => {
    expect(formatAccessEta(3900)).toBe('~1h05');
  });

  it('"<1 min" pour une durée positive arrondissant à 0', () => {
    expect(formatAccessEta(20)).toBe('<1 min');
  });

  it('"—" si vide / non exploitable', () => {
    expect(formatAccessEta(0)).toBe('—');
    expect(formatAccessEta(-5)).toBe('—');
    expect(formatAccessEta(NaN)).toBe('—');
  });
});
