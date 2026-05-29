/**
 * Tests unitaires de `MeService` (Story 3.2, AC #2/#3/#6).
 * Repository + EventEmitter2 mockés — aucune DB réelle (tourne en CI `pnpm test`).
 */
import { MeService, PROFILE_LIVE_CONSENT_REVOKED_EVENT } from './me.service.js'
import type { MeRepository } from './me.repository.js'
import type { EventEmitter2 } from '@nestjs/event-emitter'

const USER_ID = '00000000-0000-0000-0000-000000000001'

describe('MeService', () => {
  let service: MeService
  let repo: jest.Mocked<Pick<MeRepository, 'getSettings' | 'setLiveAccessConsent'>>
  let emitter: jest.Mocked<Pick<EventEmitter2, 'emit'>>

  beforeEach(() => {
    repo = {
      getSettings: jest.fn(),
      setLiveAccessConsent: jest.fn().mockResolvedValue(undefined),
    }
    emitter = { emit: jest.fn() }
    service = new MeService(repo as unknown as MeRepository, emitter as unknown as EventEmitter2)
  })

  describe('getSettings', () => {
    it.each([
      ['consent true', { liveAccessConsent: true, overpassEnabled: false }, true],
      ['consent false', { liveAccessConsent: false, overpassEnabled: true }, false],
      ['consent null (jamais demandé)', { liveAccessConsent: null, overpassEnabled: false }, null],
    ])('renvoie l\'état actuel — %s', async (_label, row, expected) => {
      repo.getSettings.mockResolvedValue(row as never)
      const res = await service.getSettings(USER_ID)
      expect(res.liveAccessConsent).toBe(expected)
    })

    it('défauts si profil absent (null consent, overpass false)', async () => {
      repo.getSettings.mockResolvedValue(null)
      const res = await service.getSettings(USER_ID)
      expect(res).toEqual({ liveAccessConsent: null, overpassEnabled: false })
    })

    it('inclut overpassEnabled (Discovery #2 — cohérence settings)', async () => {
      repo.getSettings.mockResolvedValue({ liveAccessConsent: true, overpassEnabled: true } as never)
      const res = await service.getSettings(USER_ID)
      expect(res.overpassEnabled).toBe(true)
    })
  })

  describe('updateSettings — persistance + event', () => {
    it('null → true : persiste, renvoie l\'état, PAS d\'event (pas une révocation)', async () => {
      repo.getSettings
        .mockResolvedValueOnce({ liveAccessConsent: null, overpassEnabled: false } as never) // lecture previous
        .mockResolvedValueOnce({ liveAccessConsent: true, overpassEnabled: false } as never) // re-lecture finale
      const res = await service.updateSettings(USER_ID, { liveAccessConsent: true })
      expect(repo.setLiveAccessConsent).toHaveBeenCalledWith(USER_ID, true)
      expect(res.liveAccessConsent).toBe(true)
      expect(emitter.emit).not.toHaveBeenCalled()
    })

    it('true → false : persiste ET émet profile.live-consent-revoked avec userId (AC #3)', async () => {
      repo.getSettings
        .mockResolvedValueOnce({ liveAccessConsent: true, overpassEnabled: false } as never)
        .mockResolvedValueOnce({ liveAccessConsent: false, overpassEnabled: false } as never)
      const res = await service.updateSettings(USER_ID, { liveAccessConsent: false })
      expect(repo.setLiveAccessConsent).toHaveBeenCalledWith(USER_ID, false)
      expect(emitter.emit).toHaveBeenCalledWith(PROFILE_LIVE_CONSENT_REVOKED_EVENT, { userId: USER_ID })
      expect(res.liveAccessConsent).toBe(false)
    })

    it('true → true (idempotent) : UPDATE exécuté quand même, PAS d\'event (AC #6)', async () => {
      repo.getSettings
        .mockResolvedValueOnce({ liveAccessConsent: true, overpassEnabled: false } as never)
        .mockResolvedValueOnce({ liveAccessConsent: true, overpassEnabled: false } as never)
      await service.updateSettings(USER_ID, { liveAccessConsent: true })
      expect(repo.setLiveAccessConsent).toHaveBeenCalledWith(USER_ID, true)
      expect(emitter.emit).not.toHaveBeenCalled()
    })

    it('false → false : pas d\'event (pas de transition true→false)', async () => {
      repo.getSettings
        .mockResolvedValueOnce({ liveAccessConsent: false, overpassEnabled: false } as never)
        .mockResolvedValueOnce({ liveAccessConsent: false, overpassEnabled: false } as never)
      await service.updateSettings(USER_ID, { liveAccessConsent: false })
      expect(emitter.emit).not.toHaveBeenCalled()
    })

    it('null → false : pas d\'event (jamais consenti, donc pas une révocation)', async () => {
      repo.getSettings
        .mockResolvedValueOnce({ liveAccessConsent: null, overpassEnabled: false } as never)
        .mockResolvedValueOnce({ liveAccessConsent: false, overpassEnabled: false } as never)
      await service.updateSettings(USER_ID, { liveAccessConsent: false })
      expect(emitter.emit).not.toHaveBeenCalled()
    })

    it('atomicité : si le UPDATE DB échoue, aucun event n\'est émis (AC #3)', async () => {
      repo.getSettings.mockResolvedValueOnce({ liveAccessConsent: true, overpassEnabled: false } as never)
      repo.setLiveAccessConsent.mockRejectedValueOnce(new Error('db down'))
      await expect(service.updateSettings(USER_ID, { liveAccessConsent: false })).rejects.toThrow('db down')
      expect(emitter.emit).not.toHaveBeenCalled()
    })
  })
})
