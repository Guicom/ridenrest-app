import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common'
import { DensityService } from './density.service.js'
import type { DensityRepository } from './density.repository.js'
import type { Queue } from 'bullmq'

const makeAdventure = (densityStatus = 'idle') => ({
  id: 'adv-1',
  userId: 'user-1',
  name: 'Test',
  totalDistanceKm: 0,
  status: 'planning' as const,
  densityStatus: densityStatus as 'idle' | 'pending' | 'processing' | 'success' | 'error',
  densityProgress: 0,
  createdAt: new Date('2026-03-15T00:00:00Z'),
  updatedAt: new Date('2026-03-15T00:00:00Z'),
})

const mockRepo: jest.Mocked<DensityRepository> = {
  findByAdventureId: jest.fn(),
  setDensityStatus: jest.fn().mockResolvedValue(undefined),
  setDensityProgress: jest.fn().mockResolvedValue(undefined),
  deleteGapsByAdventureId: jest.fn().mockResolvedValue(undefined),
  findParsedSegmentIds: jest.fn(),
  findSegmentsForAnalysis: jest.fn(),
  insertGaps: jest.fn().mockResolvedValue(undefined),
  findGapsBySegmentIds: jest.fn(),
} as unknown as jest.Mocked<DensityRepository>

const mockQueue = {
  add: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<Queue>

const service = new DensityService(mockRepo, mockQueue)

beforeEach(() => {
  jest.clearAllMocks()
  mockRepo.setDensityStatus.mockResolvedValue(undefined)
  mockRepo.setDensityProgress.mockResolvedValue(undefined)
  mockRepo.deleteGapsByAdventureId.mockResolvedValue(undefined)
  mockRepo.insertGaps.mockResolvedValue(undefined)
  mockQueue.add.mockResolvedValue(undefined)
})

describe('DensityService.triggerAnalysis', () => {
  it('enqueues job and sets pending for idle adventure', async () => {
    mockRepo.findByAdventureId.mockResolvedValue(makeAdventure('idle'))
    mockRepo.findParsedSegmentIds.mockResolvedValue(['seg-1', 'seg-2'])

    const result = await service.triggerAnalysis('adv-1', 'user-1')

    expect(result).toEqual({ message: 'Density analysis started' })
    expect(mockRepo.setDensityStatus).toHaveBeenCalledWith('adv-1', 'pending')
    expect(mockQueue.add).toHaveBeenCalledWith('analyze-density', {
      adventureId: 'adv-1',
      segmentIds: ['seg-1', 'seg-2'],
    })
    expect(mockRepo.deleteGapsByAdventureId).not.toHaveBeenCalled()
  })

  it('throws 409 Conflict when density_status is pending', async () => {
    mockRepo.findByAdventureId.mockResolvedValue(makeAdventure('pending'))

    await expect(service.triggerAnalysis('adv-1', 'user-1')).rejects.toThrow(ConflictException)
    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('throws 409 Conflict when density_status is processing', async () => {
    mockRepo.findByAdventureId.mockResolvedValue(makeAdventure('processing'))

    await expect(service.triggerAnalysis('adv-1', 'user-1')).rejects.toThrow(ConflictException)
  })

  it('deletes old gaps and re-enqueues after success', async () => {
    mockRepo.findByAdventureId.mockResolvedValue(makeAdventure('success'))
    mockRepo.findParsedSegmentIds.mockResolvedValue(['seg-1'])

    await service.triggerAnalysis('adv-1', 'user-1')

    expect(mockRepo.deleteGapsByAdventureId).toHaveBeenCalledWith('adv-1')
    expect(mockQueue.add).toHaveBeenCalled()
  })

  it('deletes old gaps and re-enqueues after error', async () => {
    mockRepo.findByAdventureId.mockResolvedValue(makeAdventure('error'))
    mockRepo.findParsedSegmentIds.mockResolvedValue(['seg-1'])

    await service.triggerAnalysis('adv-1', 'user-1')

    expect(mockRepo.deleteGapsByAdventureId).toHaveBeenCalledWith('adv-1')
    expect(mockQueue.add).toHaveBeenCalled()
  })

  it('throws 400 BadRequest when no parsed segments available', async () => {
    mockRepo.findByAdventureId.mockResolvedValue(makeAdventure('idle'))
    mockRepo.findParsedSegmentIds.mockResolvedValue([])

    await expect(service.triggerAnalysis('adv-1', 'user-1')).rejects.toThrow(BadRequestException)
    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('throws 404 NotFoundException when adventure not found', async () => {
    mockRepo.findByAdventureId.mockResolvedValue(null)

    await expect(service.triggerAnalysis('adv-1', 'user-1')).rejects.toThrow(NotFoundException)
  })
})

describe('DensityService.getStatus', () => {
  it('returns density status and coverage gaps', async () => {
    mockRepo.findByAdventureId.mockResolvedValue(makeAdventure('success'))
    mockRepo.findParsedSegmentIds.mockResolvedValue(['seg-1'])
    mockRepo.findGapsBySegmentIds.mockResolvedValue([
      { segmentId: 'seg-1', fromKm: 0, toKm: 10, severity: 'critical' },
    ])

    const result = await service.getStatus('adv-1', 'user-1')

    expect(result.densityStatus).toBe('success')
    expect(result.coverageGaps).toHaveLength(1)
    expect(result.coverageGaps[0].severity).toBe('critical')
  })

  it('throws 404 when adventure not found', async () => {
    mockRepo.findByAdventureId.mockResolvedValue(null)

    await expect(service.getStatus('adv-1', 'user-1')).rejects.toThrow(NotFoundException)
  })
})
