import { getLiveAccessConsent } from './profile-lookup.js'
import type { SqlExecutor } from './types/access-result.types.js'

function fakeDb(rows: Record<string, unknown>[]): SqlExecutor & { execute: jest.Mock } {
  return { execute: jest.fn().mockResolvedValue({ rows }) }
}

describe('getLiveAccessConsent', () => {
  it('renvoie true quand le consentement est explicite', async () => {
    const db = fakeDb([{ live_access_consent: true }])
    await expect(getLiveAccessConsent(db, 'user-1')).resolves.toBe(true)
  })

  it('renvoie false quand le refus est explicite', async () => {
    const db = fakeDb([{ live_access_consent: false }])
    await expect(getLiveAccessConsent(db, 'user-1')).resolves.toBe(false)
  })

  it('renvoie null quand jamais demandé (colonne NULL)', async () => {
    const db = fakeDb([{ live_access_consent: null }])
    await expect(getLiveAccessConsent(db, 'user-1')).resolves.toBeNull()
  })

  it("renvoie null quand le profil n'existe pas (aucune ligne)", async () => {
    const db = fakeDb([])
    await expect(getLiveAccessConsent(db, 'ghost')).resolves.toBeNull()
  })

  it('interroge profiles par id (PK)', async () => {
    const db = fakeDb([{ live_access_consent: true }])
    await getLiveAccessConsent(db, 'user-42')
    expect(db.execute).toHaveBeenCalledTimes(1)
  })
})
