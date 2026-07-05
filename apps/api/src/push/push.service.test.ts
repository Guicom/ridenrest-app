import { PushService } from './push.service.js'
import type { PushRepository } from './push.repository.js'

// Mock Expo Push SDK — pas de réseau en test. Les méthodes d'instance sont des jest.fn
// PARTAGÉES (mêmes références pour toute instance `new Expo()`), donc récupérables côté test
// via une instance jetable. `chunkPushMessages` renvoie un seul chunk (identité).
jest.mock('expo-server-sdk', () => {
  const sendPushNotificationsAsync = jest.fn()
  const chunkPushNotifications = jest.fn((messages: unknown[]) => [messages])
  class Expo {
    chunkPushNotifications = chunkPushNotifications
    sendPushNotificationsAsync = sendPushNotificationsAsync
    static isExpoPushToken = jest.fn(
      (t: unknown) => typeof t === 'string' && t.startsWith('ExponentPushToken'),
    )
  }
  return { Expo }
})

import { Expo } from 'expo-server-sdk'

interface ExpoInstanceMock {
  chunkPushNotifications: jest.Mock
  sendPushNotificationsAsync: jest.Mock
}
// Instance jetable → les mêmes jest.fn partagées que celles utilisées par le service.
const expoMock = new (Expo as unknown as new () => ExpoInstanceMock)()
const isExpoPushToken = (Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken

interface SentMessage {
  to: string
  data?: { adventureId?: string }
}
/** Messages passés au 1er appel de `sendPushNotificationsAsync` (typé, pas d'`any`). */
function firstSentMessages(): SentMessage[] {
  const calls = expoMock.sendPushNotificationsAsync.mock.calls as unknown[][]
  return (calls[0]?.[0] ?? []) as SentMessage[]
}

const mockRepo = {
  upsertToken: jest.fn().mockResolvedValue({ id: 'p1', token: 't', platform: 'ios' }),
  deleteByUserAndToken: jest.fn().mockResolvedValue(undefined),
  deleteByToken: jest.fn().mockResolvedValue(undefined),
  findTokensByUserId: jest.fn(),
  findAdventureOwnerId: jest.fn(),
}

const service = new PushService(mockRepo as unknown as PushRepository)

beforeEach(() => {
  jest.clearAllMocks()
  expoMock.chunkPushNotifications.mockImplementation((messages: unknown[]) => [messages])
  isExpoPushToken.mockImplementation(
    (t: unknown) => typeof t === 'string' && t.startsWith('ExponentPushToken'),
  )
})

describe('PushService — token registration', () => {
  it('registerToken upserts via repository', async () => {
    await service.registerToken('user-1', 'ExponentPushToken[abc]', 'ios')
    expect(mockRepo.upsertToken).toHaveBeenCalledWith('user-1', 'ExponentPushToken[abc]', 'ios')
  })

  it('removeToken deletes scoped to the user (AC4)', async () => {
    await service.removeToken('user-1', 'ExponentPushToken[abc]')
    expect(mockRepo.deleteByUserAndToken).toHaveBeenCalledWith('user-1', 'ExponentPushToken[abc]')
  })
})

describe('PushService.notifyDensityComplete', () => {
  it('sends a push to every token of the adventure owner with adventureId in data', async () => {
    mockRepo.findAdventureOwnerId.mockResolvedValue('user-1')
    mockRepo.findTokensByUserId.mockResolvedValue([
      'ExponentPushToken[aaa]',
      'ExponentPushToken[bbb]',
    ])
    expoMock.sendPushNotificationsAsync.mockResolvedValue([
      { status: 'ok', id: 'r1' },
      { status: 'ok', id: 'r2' },
    ])

    await service.notifyDensityComplete('adv-1')

    expect(expoMock.sendPushNotificationsAsync).toHaveBeenCalledTimes(1)
    const sentMessages = firstSentMessages()
    expect(sentMessages).toHaveLength(2)
    expect(sentMessages[0]).toMatchObject({
      to: 'ExponentPushToken[aaa]',
      data: { adventureId: 'adv-1' },
    })
    expect(mockRepo.deleteByUserAndToken).not.toHaveBeenCalled()
  })

  it('purges a token that returns DeviceNotRegistered (AC2)', async () => {
    mockRepo.findAdventureOwnerId.mockResolvedValue('user-1')
    mockRepo.findTokensByUserId.mockResolvedValue([
      'ExponentPushToken[good]',
      'ExponentPushToken[dead]',
    ])
    expoMock.sendPushNotificationsAsync.mockResolvedValue([
      { status: 'ok', id: 'r1' },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    ])

    await service.notifyDensityComplete('adv-1')

    // Le purge est désormais scopé à l'utilisateur (P8 — défense en profondeur).
    expect(mockRepo.deleteByUserAndToken).toHaveBeenCalledTimes(1)
    expect(mockRepo.deleteByUserAndToken).toHaveBeenCalledWith('user-1', 'ExponentPushToken[dead]')
  })

  it('is a no-op when the owner has no tokens', async () => {
    mockRepo.findAdventureOwnerId.mockResolvedValue('user-1')
    mockRepo.findTokensByUserId.mockResolvedValue([])

    await service.notifyDensityComplete('adv-1')

    expect(expoMock.sendPushNotificationsAsync).not.toHaveBeenCalled()
  })

  it('is a no-op when the adventure owner cannot be resolved', async () => {
    mockRepo.findAdventureOwnerId.mockResolvedValue(null)

    await service.notifyDensityComplete('adv-unknown')

    expect(mockRepo.findTokensByUserId).not.toHaveBeenCalled()
    expect(expoMock.sendPushNotificationsAsync).not.toHaveBeenCalled()
  })

  it('filters out non-Expo tokens before sending', async () => {
    mockRepo.findAdventureOwnerId.mockResolvedValue('user-1')
    mockRepo.findTokensByUserId.mockResolvedValue(['ExponentPushToken[ok]', 'garbage-token'])
    expoMock.sendPushNotificationsAsync.mockResolvedValue([{ status: 'ok', id: 'r1' }])

    await service.notifyDensityComplete('adv-1')

    const sentMessages = firstSentMessages()
    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0].to).toBe('ExponentPushToken[ok]')
  })

  it('never throws when the send fails (best-effort — job must not fail)', async () => {
    mockRepo.findAdventureOwnerId.mockResolvedValue('user-1')
    mockRepo.findTokensByUserId.mockResolvedValue(['ExponentPushToken[ok]'])
    expoMock.sendPushNotificationsAsync.mockRejectedValue(new Error('network down'))

    await expect(service.notifyDensityComplete('adv-1')).resolves.toBeUndefined()
    expect(mockRepo.deleteByUserAndToken).not.toHaveBeenCalled()
  })

  it('handleDensityCompleted delegates to notifyDensityComplete', async () => {
    mockRepo.findAdventureOwnerId.mockResolvedValue(null)

    await service.handleDensityCompleted({ adventureId: 'adv-9' })

    expect(mockRepo.findAdventureOwnerId).toHaveBeenCalledWith('adv-9')
  })
})
