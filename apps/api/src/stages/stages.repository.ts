import { Injectable } from '@nestjs/common'
import { db, adventureStages, adventures } from '@ridenrest/database'
import type { AdventureStage, NewAdventureStage } from '@ridenrest/database'
import { eq, asc, desc, and, gt, lt, sql } from 'drizzle-orm'

@Injectable()
export class StagesRepository {
  async findByAdventureId(adventureId: string): Promise<AdventureStage[]> {
    return db
      .select()
      .from(adventureStages)
      .where(eq(adventureStages.adventureId, adventureId))
      .orderBy(asc(adventureStages.orderIndex))
  }

  async findByIdAndAdventureId(id: string, adventureId: string): Promise<AdventureStage | undefined> {
    const [row] = await db
      .select()
      .from(adventureStages)
      .where(and(eq(adventureStages.id, id), eq(adventureStages.adventureId, adventureId)))
    return row
  }

  async findLastByAdventureId(adventureId: string): Promise<AdventureStage | undefined> {
    const [row] = await db
      .select()
      .from(adventureStages)
      .where(eq(adventureStages.adventureId, adventureId))
      .orderBy(desc(adventureStages.orderIndex))
      .limit(1)
    return row
  }

  async countByAdventureId(adventureId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adventureStages)
      .where(eq(adventureStages.adventureId, adventureId))
    return row?.count ?? 0
  }

  async create(data: NewAdventureStage): Promise<AdventureStage> {
    const [row] = await db.insert(adventureStages).values(data).returning()
    return row as AdventureStage
  }

  async update(id: string, data: Partial<Pick<AdventureStage, 'name' | 'color' | 'endKm' | 'startKm' | 'orderIndex' | 'distanceKm' | 'elevationGainM' | 'etaMinutes'>>): Promise<AdventureStage> {
    const [row] = await db
      .update(adventureStages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adventureStages.id, id))
      .returning()
    return row as AdventureStage
  }

  async findContaining(adventureId: string, endKm: number): Promise<AdventureStage | undefined> {
    const [row] = await db
      .select()
      .from(adventureStages)
      .where(
        and(
          eq(adventureStages.adventureId, adventureId),
          lt(adventureStages.startKm, endKm),
          gt(adventureStages.endKm, endKm),
        ),
      )
      .limit(1)
    return row
  }

  async incrementOrderIndexGt(adventureId: string, orderIndex: number): Promise<void> {
    await db
      .update(adventureStages)
      .set({ orderIndex: sql`${adventureStages.orderIndex} + 1` })
      .where(
        and(
          eq(adventureStages.adventureId, adventureId),
          gt(adventureStages.orderIndex, orderIndex),
        ),
      )
  }

  /** Atomically split an existing stage into two via a single DB transaction.
   *  Increments orderIndex for all stages after the split point, inserts the new
   *  stage, and updates the remainder — all-or-nothing. */
  async createWithSplit(params: {
    adventureId: string
    splitTargetId: string
    splitTargetOrderIndex: number
    newStageData: NewAdventureStage
    remainderUpdate: Partial<Pick<AdventureStage, 'orderIndex' | 'startKm' | 'distanceKm' | 'elevationGainM' | 'etaMinutes'>>
  }): Promise<AdventureStage> {
    const { adventureId, splitTargetId, splitTargetOrderIndex, newStageData, remainderUpdate } = params
    return db.transaction(async (tx) => {
      await tx
        .update(adventureStages)
        .set({ orderIndex: sql`${adventureStages.orderIndex} + 1` })
        .where(
          and(
            eq(adventureStages.adventureId, adventureId),
            gt(adventureStages.orderIndex, splitTargetOrderIndex),
          ),
        )

      const [newStage] = await tx
        .insert(adventureStages)
        .values(newStageData)
        .returning()

      await tx
        .update(adventureStages)
        .set({ ...remainderUpdate, updatedAt: new Date() })
        .where(eq(adventureStages.id, splitTargetId))

      return newStage as AdventureStage
    })
  }

  async findSubsequent(adventureId: string, orderIndex: number): Promise<AdventureStage[]> {
    return db
      .select()
      .from(adventureStages)
      .where(and(eq(adventureStages.adventureId, adventureId), gt(adventureStages.orderIndex, orderIndex)))
      .orderBy(asc(adventureStages.orderIndex))
  }

  /** Find a stage by id with ownership check via adventures.user_id. */
  async findByIdWithAdventureUserId(
    id: string,
    userId: string,
  ): Promise<{ id: string; adventureId: string; endKm: number; distanceKm: number; departureTime: Date | null } | null> {
    const [row] = await db
      .select({
        id: adventureStages.id,
        adventureId: adventureStages.adventureId,
        endKm: adventureStages.endKm,
        distanceKm: adventureStages.distanceKm,
        departureTime: adventureStages.departureTime,
      })
      .from(adventureStages)
      .innerJoin(adventures, eq(adventureStages.adventureId, adventures.id))
      .where(
        and(
          eq(adventureStages.id, id),
          eq(adventures.userId, userId),
        ),
      )
    return row ?? null
  }

  async delete(id: string): Promise<void> {
    await db.delete(adventureStages).where(eq(adventureStages.id, id))
  }

  async updateMany(
    stages: Array<Pick<AdventureStage, 'id' | 'startKm' | 'distanceKm' | 'orderIndex'> & {
      elevationGainM?: number | null
      etaMinutes?: number | null
    }>,
  ): Promise<void> {
    if (stages.length === 0) return
    await Promise.all(
      stages.map(({ id, startKm, distanceKm, orderIndex, elevationGainM, etaMinutes }) =>
        db
          .update(adventureStages)
          .set({
            startKm, distanceKm, orderIndex,
            ...(elevationGainM !== undefined ? { elevationGainM } : {}),
            ...(etaMinutes !== undefined ? { etaMinutes } : {}),
            updatedAt: new Date(),
          })
          .where(eq(adventureStages.id, id)),
      ),
    )
  }
}
