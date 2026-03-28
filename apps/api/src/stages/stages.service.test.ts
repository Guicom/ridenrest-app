import { NotFoundException, BadRequestException } from '@nestjs/common'
import { StagesService } from './stages.service.js'
import type { StagesRepository } from './stages.repository.js'
import type { AdventuresService } from '../adventures/adventures.service.js'
import type { AdventureStage } from '@ridenrest/database'

const makeStage = (id: string, orderIndex: number, startKm: number, endKm: number): AdventureStage => ({
  id,
  adventureId: 'adv-1',
  name: `Stage ${orderIndex + 1}`,
  color: '#f97316',
  orderIndex,
  startKm,
  endKm,
  distanceKm: endKm - startKm,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const mockStagesRepo = {
  findByAdventureId: jest.fn(),
  findByIdAndAdventureId: jest.fn(),
  findLastByAdventureId: jest.fn(),
  countByAdventureId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  updateMany: jest.fn(),
  findSubsequent: jest.fn(),
}

const mockAdventuresService = {
  verifyOwnership: jest.fn(),
}

const service = new StagesService(
  mockStagesRepo as unknown as StagesRepository,
  mockAdventuresService as unknown as AdventuresService,
)

beforeEach(() => jest.clearAllMocks())

describe('createStage', () => {
  it('sets startKm=0 when no previous stages', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(undefined)
    mockStagesRepo.countByAdventureId.mockResolvedValue(0)
    const created = makeStage('s1', 0, 0, 50)
    mockStagesRepo.create.mockResolvedValue(created)

    const result = await service.createStage('adv-1', 'user-1', {
      name: 'Stage 1',
      endKm: 50,
      color: '#f97316',
    })

    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ startKm: 0, endKm: 50, distanceKm: 50, orderIndex: 0 }),
    )
    expect(result.startKm).toBe(0)
  })

  it('sets startKm = last stage endKm', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(makeStage('s1', 0, 0, 50))
    mockStagesRepo.countByAdventureId.mockResolvedValue(1)
    const created = makeStage('s2', 1, 50, 100)
    mockStagesRepo.create.mockResolvedValue(created)

    const result = await service.createStage('adv-1', 'user-1', {
      name: 'Stage 2',
      endKm: 100,
      color: '#3b82f6',
    })

    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ startKm: 50, endKm: 100, distanceKm: 50, orderIndex: 1 }),
    )
    expect(result.startKm).toBe(50)
  })

  it('throws BadRequestException when endKm <= previous stage endKm', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(makeStage('s1', 0, 0, 100))
    mockStagesRepo.countByAdventureId.mockResolvedValue(1)

    await expect(
      service.createStage('adv-1', 'user-1', {
        name: 'Bad Stage',
        endKm: 80, // < last stage endKm of 100
        color: '#f97316',
      }),
    ).rejects.toThrow(BadRequestException)
    expect(mockStagesRepo.create).not.toHaveBeenCalled()
  })
})

describe('updateStage', () => {
  it('only updates name and color, not start/end km', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    const stage = makeStage('s1', 0, 0, 50)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage)
    mockStagesRepo.update.mockResolvedValue({ ...stage, name: 'New Name', color: '#22c55e' })

    const result = await service.updateStage('adv-1', 's1', 'user-1', {
      name: 'New Name',
      color: '#22c55e',
    })

    expect(mockStagesRepo.update).toHaveBeenCalledWith('s1', { name: 'New Name', color: '#22c55e' })
    expect(result.name).toBe('New Name')
    expect(result.startKm).toBe(0)
    expect(result.endKm).toBe(50)
  })

  it('throws NotFoundException when stage not found', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(undefined)

    await expect(
      service.updateStage('adv-1', 's-unknown', 'user-1', { name: 'X' }),
    ).rejects.toThrow(NotFoundException)
    expect(mockStagesRepo.update).not.toHaveBeenCalled()
  })

  it('updateStage with endKm updates distanceKm correctly', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    const stage = makeStage('s1', 0, 0, 50)
    const updated = makeStage('s1', 0, 0, 60)
    mockStagesRepo.findByIdAndAdventureId
      .mockResolvedValueOnce(stage)    // first call: find stage to update
      .mockResolvedValueOnce(updated)  // second call: return updated stage
    mockStagesRepo.findSubsequent.mockResolvedValue([])  // no subsequent → validation passes
    mockStagesRepo.update.mockResolvedValue(updated)

    const result = await service.updateStage('adv-1', 's1', 'user-1', { endKm: 60 })

    expect(mockStagesRepo.update).toHaveBeenCalledWith('s1', expect.objectContaining({
      endKm: 60,
      distanceKm: 60,  // 60 - 0
    }))
    expect(result.endKm).toBe(60)
    expect(result.distanceKm).toBe(60)
  })

  it('updateStage with endKm cascades startKm to subsequent stages', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    const stage1 = makeStage('s1', 0, 0, 50)
    const stage2 = makeStage('s2', 1, 50, 100)
    const stage3 = makeStage('s3', 2, 100, 150)
    const updatedStage1 = makeStage('s1', 0, 0, 60)
    mockStagesRepo.findByIdAndAdventureId
      .mockResolvedValueOnce(stage1)     // first call: find stage to update
      .mockResolvedValueOnce(updatedStage1)  // second call: return updated stage
    mockStagesRepo.update.mockResolvedValue(updatedStage1)
    mockStagesRepo.findSubsequent.mockResolvedValue([stage2, stage3])
    mockStagesRepo.updateMany.mockResolvedValue(undefined)

    await service.updateStage('adv-1', 's1', 'user-1', { endKm: 60 })

    // stage2: startKm=60, distanceKm=100-60=40, orderIndex unchanged
    // stage3: startKm=100, distanceKm=150-100=50, orderIndex unchanged
    expect(mockStagesRepo.updateMany).toHaveBeenCalledWith([
      { id: 's2', startKm: 60, distanceKm: 40, orderIndex: 1 },
      { id: 's3', startKm: 100, distanceKm: 50, orderIndex: 2 },
    ])
  })

  it('updateStage throws BadRequestException if endKm <= stage.startKm', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    const stage = makeStage('s1', 0, 20, 50)  // startKm=20
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage)
    mockStagesRepo.findSubsequent.mockResolvedValue([])

    await expect(
      service.updateStage('adv-1', 's1', 'user-1', { endKm: 10 }),  // 10 <= 20
    ).rejects.toThrow(BadRequestException)
    expect(mockStagesRepo.update).not.toHaveBeenCalled()
  })

  it('updateStage throws BadRequestException if endKm >= next stage endKm', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    const stage1 = makeStage('s1', 0, 0, 50)
    const stage2 = makeStage('s2', 1, 50, 100)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage1)
    mockStagesRepo.findSubsequent.mockResolvedValue([stage2])  // stage2.endKm=100

    await expect(
      service.updateStage('adv-1', 's1', 'user-1', { endKm: 100 }),  // 100 >= stage2.endKm=100
    ).rejects.toThrow(BadRequestException)
    expect(mockStagesRepo.update).not.toHaveBeenCalled()
  })
})

describe('deleteStage', () => {
  it('recalculates startKm for subsequent stages', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    const stage1 = makeStage('s1', 0, 0, 50)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage1)
    mockStagesRepo.delete.mockResolvedValue(undefined)
    // After deleting s1, s2 and s3 remain
    const stage2 = makeStage('s2', 1, 50, 100)
    const stage3 = makeStage('s3', 2, 100, 150)
    mockStagesRepo.findByAdventureId.mockResolvedValue([stage2, stage3])
    mockStagesRepo.updateMany.mockResolvedValue(undefined)

    await service.deleteStage('adv-1', 's1', 'user-1')

    expect(mockStagesRepo.delete).toHaveBeenCalledWith('s1')
    expect(mockStagesRepo.updateMany).toHaveBeenCalledWith([
      { id: 's2', startKm: 0, distanceKm: 100, orderIndex: 0 },  // endKm=100, prevEnd=0 → dist=100, normalized to 0
      { id: 's3', startKm: 100, distanceKm: 50, orderIndex: 1 }, // endKm=150, prevEnd=100 → dist=50, normalized to 1
    ])
  })

  it('throws NotFoundException when stage not found', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(undefined)

    await expect(
      service.deleteStage('adv-1', 's-unknown', 'user-1'),
    ).rejects.toThrow(NotFoundException)
    expect(mockStagesRepo.delete).not.toHaveBeenCalled()
  })

  it('throws NotFoundException when adventure not owned by user', async () => {
    mockAdventuresService.verifyOwnership.mockRejectedValue(new NotFoundException('Adventure not found'))

    await expect(
      service.deleteStage('adv-1', 's1', 'other-user'),
    ).rejects.toThrow(NotFoundException)
  })
})
