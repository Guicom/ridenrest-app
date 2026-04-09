import { describe, it, expect, vi } from 'vitest'

vi.mock('../../CHANGELOG.md', () => ({ default: '' }))

import { parseChangelog } from './changelog'

const SAMPLE_CHANGELOG = `# Changelog

## 1.0.0 — 2026-04-09

### Nouveautés
- Système de notes de version avec popin au lancement
- Carte interactive avec recherche POI

### Améliorations
- Liens Booking.com enrichis

### Corrections
- Correction du mode live

## 0.1.0 — 2026-03-01

### Nouveautés
- Version initiale
`

describe('parseChangelog', () => {
  it('parses a valid changelog entry correctly', () => {
    const result = parseChangelog(SAMPLE_CHANGELOG, '1.0.0')

    expect(result).not.toBeNull()
    expect(result!.version).toBe('1.0.0')
    expect(result!.date).toBe('2026-04-09')
    expect(result!.sections).toHaveLength(3)
    expect(result!.sections[0].title).toBe('Nouveautés')
    expect(result!.sections[0].items).toEqual([
      'Système de notes de version avec popin au lancement',
      'Carte interactive avec recherche POI',
    ])
    expect(result!.sections[1].title).toBe('Améliorations')
    expect(result!.sections[1].items).toEqual(['Liens Booking.com enrichis'])
    expect(result!.sections[2].title).toBe('Corrections')
    expect(result!.sections[2].items).toEqual(['Correction du mode live'])
  })

  it('returns null if version does not exist in changelog', () => {
    const result = parseChangelog(SAMPLE_CHANGELOG, '2.0.0')
    expect(result).toBeNull()
  })

  it('filters out empty sections', () => {
    const changelogWithEmpty = `# Changelog

## 1.1.0 — 2026-05-01

### Nouveautés
- New feature

### Améliorations

### Corrections
- Bug fix
`
    const result = parseChangelog(changelogWithEmpty, '1.1.0')
    expect(result).not.toBeNull()
    expect(result!.sections).toHaveLength(2)
    expect(result!.sections[0].title).toBe('Nouveautés')
    expect(result!.sections[1].title).toBe('Corrections')
  })

  it('parses the correct version when multiple exist', () => {
    const result = parseChangelog(SAMPLE_CHANGELOG, '0.1.0')
    expect(result).not.toBeNull()
    expect(result!.version).toBe('0.1.0')
    expect(result!.date).toBe('2026-03-01')
    expect(result!.sections).toHaveLength(1)
    expect(result!.sections[0].items).toEqual(['Version initiale'])
  })
})
