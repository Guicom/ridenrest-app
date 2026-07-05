import en from './locales/en.json';
import fr from './locales/fr.json';

// MOB-6.3 / T4 — VERROU de parité de clés FR↔EN (AC2). Garde anti-régression pour tous
// les ajouts futurs : toute clé ajoutée dans une seule locale casse ce test. Les deux
// arbres (`fr.json`, `en.json`) DOIVENT être des miroirs stricts (même ensemble de clés).
//
// Placement volontaire hors `src/app/` : un `*.test.ts` sous `src/app` serait bundlé par
// `require.context` d'expo-router et casserait `expo export` (cf. AGENTS.md).

/** Aplatit un arbre de traduction en chemins pointés triés (`auth.login.title`, …). */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj)
    .flatMap(([key, value]) =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? flattenKeys(value as Record<string, unknown>, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    )
    .sort();
}

describe('parité des clés i18n FR↔EN (MOB-6.3 / T4, AC2)', () => {
  const frKeys = flattenKeys(fr as Record<string, unknown>);
  const enKeys = flattenKeys(en as Record<string, unknown>);

  it('aucune clé orpheline présente dans une seule locale', () => {
    const onlyInFr = frKeys.filter((k) => !enKeys.includes(k));
    const onlyInEn = enKeys.filter((k) => !frKeys.includes(k));
    expect(onlyInFr).toEqual([]);
    expect(onlyInEn).toEqual([]);
  });

  it('fr et en exposent exactement le même ensemble de clés', () => {
    expect(frKeys).toEqual(enKeys);
    expect(frKeys.length).toBeGreaterThan(0);
  });
});
