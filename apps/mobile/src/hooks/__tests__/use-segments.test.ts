import type { AdventureSegmentResponse } from '@ridenrest/shared';

import {
  detectParseTransitions,
  isParsing,
  segmentsPollInterval,
} from '@/hooks/use-segments';

// Tests PURS (parité web 3.2) : pas de React, pas de réseau. On vérifie l'arrêt
// conditionnel du polling (AC2) et la détection de transition de parsing (AC2/AC3).
//
// On mocke la façade API pour COUPER la chaîne d'import transitive vers
// `api-client` → `@better-auth/expo/client` (ESM non transpilé par jest-expo, casse
// au require). Les helpers testés ici sont purs et n'appellent jamais l'API.
jest.mock('@/lib/api/segments', () => ({
  listSegments: jest.fn(),
  uploadSegment: jest.fn(),
}));

function seg(
  id: string,
  parseStatus: AdventureSegmentResponse['parseStatus'],
): AdventureSegmentResponse {
  return {
    id,
    adventureId: 'adv-1',
    name: `Segment ${id}`,
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 0,
    elevationGainM: null,
    elevationLossM: null,
    parseStatus,
    source: null,
    boundingBox: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
  };
}

describe('isParsing / segmentsPollInterval (AC2 — polling conditionnel)', () => {
  it('poll (3000 ms) tant qu’un segment est pending ou processing', () => {
    expect(isParsing([seg('a', 'done'), seg('b', 'pending')])).toBe(true);
    expect(segmentsPollInterval([seg('a', 'done'), seg('b', 'processing')])).toBe(
      3000,
    );
  });

  it('arrête le polling (false) quand tous les segments sont done/error', () => {
    expect(isParsing([seg('a', 'done'), seg('b', 'error')])).toBe(false);
    expect(segmentsPollInterval([seg('a', 'done'), seg('b', 'error')])).toBe(
      false,
    );
  });

  it('pas de poll sur liste vide ou indéfinie', () => {
    expect(segmentsPollInterval([])).toBe(false);
    expect(segmentsPollInterval(undefined)).toBe(false);
  });
});

describe('detectParseTransitions (AC2/AC3 — notification fin parsing)', () => {
  it('pending → done déclenche le callback succès', () => {
    const prev = [seg('a', 'pending')];
    const cur = [seg('a', 'done')];
    const { parsed, errored } = detectParseTransitions(prev, cur);
    expect(parsed.map((s) => s.id)).toEqual(['a']);
    expect(errored).toHaveLength(0);
  });

  it('processing → error déclenche le callback erreur', () => {
    const prev = [seg('a', 'processing')];
    const cur = [seg('a', 'error')];
    const { parsed, errored } = detectParseTransitions(prev, cur);
    expect(errored.map((s) => s.id)).toEqual(['a']);
    expect(parsed).toHaveLength(0);
  });

  it('aucune transition si le statut ne change pas (done → done)', () => {
    const prev = [seg('a', 'done')];
    const cur = [seg('a', 'done')];
    const { parsed, errored } = detectParseTransitions(prev, cur);
    expect(parsed).toHaveLength(0);
    expect(errored).toHaveLength(0);
  });

  it('un nouveau segment apparu encore en cours (pending) ne déclenche rien', () => {
    const prev = [seg('a', 'done')];
    const cur = [seg('a', 'done'), seg('b', 'pending')];
    const { parsed, errored } = detectParseTransitions(prev, cur);
    expect(parsed).toHaveLength(0);
    expect(errored).toHaveLength(0);
  });

  it('fast-parse : nouveau segment apparu déjà done (prev défini) déclenche le succès', () => {
    const prev = [seg('a', 'done')];
    const cur = [seg('a', 'done'), seg('b', 'done')];
    const { parsed, errored } = detectParseTransitions(prev, cur);
    expect(parsed.map((s) => s.id)).toEqual(['b']);
    expect(errored).toHaveLength(0);
  });

  it('fast-parse : nouveau segment apparu déjà error (prev défini) déclenche l’erreur', () => {
    const prev = [seg('a', 'done')];
    const cur = [seg('a', 'done'), seg('b', 'error')];
    const { parsed, errored } = detectParseTransitions(prev, cur);
    expect(errored.map((s) => s.id)).toEqual(['b']);
    expect(parsed).toHaveLength(0);
  });

  it('snapshot précédent indéfini (1er fetch) ne déclenche rien', () => {
    const { parsed, errored } = detectParseTransitions(undefined, [
      seg('a', 'done'),
    ]);
    expect(parsed).toHaveLength(0);
    expect(errored).toHaveLength(0);
  });
});
