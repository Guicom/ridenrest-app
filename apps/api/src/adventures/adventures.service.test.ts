import { AdventuresService } from './adventures.service.js'
import type { AdventuresRepository } from './adventures.repository.js'
import { NotFoundException } from '@nestjs/common'
import * as fsPromises from 'node:fs/promises'

jest.mock('node:fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}))

const mockRepo = {
  create: jest.fn(),
  findAllByUserId: jest.fn(),
  findByIdAndUserId: jest.fn(),
  updateTotalDistance: jest.fn(),
  updateName: jest.fn(),
  deleteById: jest.fn(),
  findSegmentStorageUrlsByAdventureId: jest.fn(),
}

const service = new AdventuresService(mockRepo as unknown as AdventuresRepository)

const makeAdventure = (overrides = {}) => ({
  id: 'adv-1',
  userId: 'user-1',
  name: 'Test',
  totalDistanceKm: 0,
  status: 'planning' as const,
  createdAt: new Date('2026-03-15T00:00:00Z'),
  updatedAt: new Date('2026-03-15T00:00:00Z'),
  ...overrides,
})

beforeEach(() => jest.clearAllMocks())

describe('createAdventure', () => {
  it('creates and returns an adventure response', async () => {
    mockRepo.create.mockResolvedValue(makeAdventure())
    const result = await service.createAdventure('user-1', 'Test')
    expect(result.id).toBe('adv-1')
    expect(result.createdAt).toBe('2026-03-15T00:00:00.000Z')
    expect(mockRepo.create).toHaveBeenCalledWith({ userId: 'user-1', name: 'Test' })
  })
})

describe('getAdventure', () => {
  it('throws NotFoundException when adventure not found', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(null)
    await expect(service.getAdventure('not-found', 'user-1')).rejects.toThrow(NotFoundException)
  })

  it('returns adventure when found', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    const result = await service.getAdventure('adv-1', 'user-1')
    expect(result.id).toBe('adv-1')
  })
})

describe('verifyOwnership', () => {
  it('throws NotFoundException when adventure does not belong to user', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(null)
    await expect(service.verifyOwnership('adv-1', 'other-user')).rejects.toThrow(NotFoundException)
  })

  it('resolves when adventure belongs to user', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    await expect(service.verifyOwnership('adv-1', 'user-1')).resolves.toBeUndefined()
  })
})

describe('listAdventures', () => {
  it('returns mapped adventure responses', async () => {
    mockRepo.findAllByUserId.mockResolvedValue([makeAdventure(), makeAdventure({ id: 'adv-2', name: 'Test 2' })])
    const result = await service.listAdventures('user-1')
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('adv-1')
    expect(result[1].id).toBe('adv-2')
  })
})

describe('renameAdventure', () => {
  it('calls verifyOwnership and updateName, returns updated AdventureResponse', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    mockRepo.updateName.mockResolvedValue(makeAdventure({ name: 'Renamed' }))

    const result = await service.renameAdventure('adv-1', 'user-1', 'Renamed')

    expect(mockRepo.findByIdAndUserId).toHaveBeenCalledWith('adv-1', 'user-1')
    expect(mockRepo.updateName).toHaveBeenCalledWith('adv-1', 'Renamed')
    expect(result.name).toBe('Renamed')
  })

  it('throws NotFoundException when ownership fails', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(null)

    await expect(service.renameAdventure('adv-1', 'user-1', 'Renamed')).rejects.toThrow(NotFoundException)
    expect(mockRepo.updateName).not.toHaveBeenCalled()
  })
})

describe('deleteAdventure', () => {
  it('calls findSegmentStorageUrlsByAdventureId + deleteById + fs.unlink for each URL', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    mockRepo.findSegmentStorageUrlsByAdventureId.mockResolvedValue(['/data/gpx/s1.gpx', '/data/gpx/s2.gpx'])
    mockRepo.deleteById.mockResolvedValue(undefined)

    const result = await service.deleteAdventure('adv-1', 'user-1')

    expect(mockRepo.findSegmentStorageUrlsByAdventureId).toHaveBeenCalledWith('adv-1')
    expect(mockRepo.deleteById).toHaveBeenCalledWith('adv-1')
    expect(fsPromises.unlink).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ deleted: true })
  })

  it('still succeeds when storageUrls is empty (no segments)', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    mockRepo.findSegmentStorageUrlsByAdventureId.mockResolvedValue([])
    mockRepo.deleteById.mockResolvedValue(undefined)

    const result = await service.deleteAdventure('adv-1', 'user-1')

    expect(mockRepo.deleteById).toHaveBeenCalledWith('adv-1')
    expect(fsPromises.unlink).not.toHaveBeenCalled()
    expect(result).toEqual({ deleted: true })
  })

  it('returns { deleted: true } even when fs.unlink fails (Promise.allSettled)', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    mockRepo.findSegmentStorageUrlsByAdventureId.mockResolvedValue(['/data/gpx/s1.gpx'])
    mockRepo.deleteById.mockResolvedValue(undefined)
    ;(fsPromises.unlink as jest.Mock).mockRejectedValue(new Error('ENOENT'))

    const result = await service.deleteAdventure('adv-1', 'user-1')

    expect(result).toEqual({ deleted: true })
  })
})
