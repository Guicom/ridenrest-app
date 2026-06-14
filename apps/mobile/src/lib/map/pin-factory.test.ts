import { POI_CATEGORY_COLORS } from '@ridenrest/shared';
import type { PoiCategory } from '@ridenrest/shared';

import {
  buildCategoryColorExpression,
  buildCategoryIconExpression,
  CATEGORY_PIN_FILE,
  PIN_IMAGE_SOURCES,
  poiPinColor,
  poiPinImageKey,
} from '@/lib/map/pin-factory';

// pin-factory (MOB-4.2 / AC2, T5) — module PUR. La couleur d'un pin DOIT venir du
// canon `POI_CATEGORY_COLORS` (`@ridenrest/shared`), jamais d'un hex hardcodé.

const ALL_CATEGORIES = Object.keys(POI_CATEGORY_COLORS) as PoiCategory[];

describe('poiPinColor (T5 — couleur canon)', () => {
  it.each(ALL_CATEGORIES)('%s → POI_CATEGORY_COLORS[%s]', (category) => {
    expect(poiPinColor(category)).toBe(POI_CATEGORY_COLORS[category]);
  });
});

describe('buildCategoryColorExpression (T5 — expression CircleLayer)', () => {
  it('démarre par un match sur la propriété `category`', () => {
    const expr = buildCategoryColorExpression();
    expect(expr[0]).toBe('match');
    expect(expr[1]).toEqual(['get', 'category']);
  });

  it('mappe chaque catégorie vers sa couleur canon', () => {
    const expr = buildCategoryColorExpression();
    for (const category of ALL_CATEGORIES) {
      const idx = expr.indexOf(category);
      expect(idx).toBeGreaterThan(0);
      expect(expr[idx + 1]).toBe(POI_CATEGORY_COLORS[category]);
    }
  });

  it('se termine par une couleur de repli (default match)', () => {
    const expr = buildCategoryColorExpression();
    expect(expr[expr.length - 1]).toBe(POI_CATEGORY_COLORS.hotel);
  });
});

describe('gouttes — mapping & images (parité web)', () => {
  it('CATEGORY_PIN_FILE couvre toutes les catégories', () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_PIN_FILE[category]).toBeTruthy();
    }
  });

  it('chaque fichier goutte a une source image enregistrée (require)', () => {
    const uniqueFiles = [...new Set(Object.values(CATEGORY_PIN_FILE))];
    for (const file of uniqueFiles) {
      expect(PIN_IMAGE_SOURCES[poiPinImageKey(file)]).toBeDefined();
    }
  });

  it('aucune clé d’image orpheline (toutes référencées par une catégorie)', () => {
    const referenced = new Set(
      Object.values(CATEGORY_PIN_FILE).map((file) => poiPinImageKey(file)),
    );
    for (const key of Object.keys(PIN_IMAGE_SOURCES)) {
      expect(referenced.has(key)).toBe(true);
    }
  });
});

describe('buildCategoryIconExpression (gouttes — expression SymbolLayer)', () => {
  it('démarre par un match sur la propriété `category`', () => {
    const expr = buildCategoryIconExpression();
    expect(expr[0]).toBe('match');
    expect(expr[1]).toEqual(['get', 'category']);
  });

  it('mappe chaque catégorie vers la clé d’image de sa goutte', () => {
    const expr = buildCategoryIconExpression();
    for (const category of ALL_CATEGORIES) {
      const idx = expr.indexOf(category);
      expect(idx).toBeGreaterThan(0);
      expect(expr[idx + 1]).toBe(poiPinImageKey(CATEGORY_PIN_FILE[category]));
    }
  });

  it('se termine par une chaîne vide (fallback invisible, parité web)', () => {
    const expr = buildCategoryIconExpression();
    expect(expr[expr.length - 1]).toBe('');
  });
});
