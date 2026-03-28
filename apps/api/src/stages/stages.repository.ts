import { Injectable } from '@nestjs/common'
import { db, adventureStages } from '@ridenrest/database'
import type { AdventureStage, NewAdventureStage } from '@ridenrest/database'
import { eq, asc, desc, and, gt, sql } from 'drizzle-orm'

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

  async update(id: string, data: Partial<Pick<AdventureStage, 'name' | 'color' | 'endKm' | 'distanceKm' | 'elevationGainM' | 'etaMinutes'>>): Promise<AdventureStage> {
    const [row] = await db
      .update(adventureStages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adventureStages.id, id))
      .returning()
    return row as AdventureStage
  }

  async findSubsequent(adventureId: string, orderIndex: number): Promise<AdventureStage[]> {
    return db
      .select()
      .from(adventureStages)
      .where(and(eq(adventureStages.adventureId, adventureId), gt(adventureStages.orderIndex, orderIndex)))
      .orderBy(asc(adventureStages.orderIndex))
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
