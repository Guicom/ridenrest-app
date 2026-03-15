import { Injectable } from '@nestjs/common'
import { db } from '@ridenrest/database'
import { adventureSegments, adventures } from '@ridenrest/database'
import type { AdventureSegment, NewAdventureSegment } from '@ridenrest/database'
import { eq, asc, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

@Injectable()
export class SegmentsRepository {
  async create(data: NewAdventureSegment): Promise<AdventureSegment> {
    const [row] = await db.insert(adventureSegments).values(data).returning()
    return row as AdventureSegment
  }

  async findAllByAdventureId(adventureId: string): Promise<AdventureSegment[]> {
    return db
      .select()
      .from(adventureSegments)
      .where(eq(adventureSegments.adventureId, adventureId))
      .orderBy(asc(adventureSegments.orderIndex))
  }

  async findByIdAndUserId(segmentId: string, userId: string): Promise<AdventureSegment | null> {
    const [row] = await db
      .select({ segment: adventureSegments })
      .from(adventureSegments)
      .innerJoin(adventures, eq(adventureSegments.adventureId, adventures.id))
      .where(
        and(
          eq(adventureSegments.id, segmentId),
          eq(adventures.userId, userId),
        ),
      )
    return row?.segment ?? null
  }

  async findAdventureIdBySegmentId(segmentId: string): Promise<string | null> {
    const [row] = await db
      .select({ adventureId: adventureSegments.adventureId })
      .from(adventureSegments)
      .where(eq(adventureSegments.id, segmentId))
    return row?.adventureId ?? null
  }

  async countByAdventureId(adventureId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adventureSegments)
      .where(eq(adventureSegments.adventureId, adventureId))
    return row?.count ?? 0
  }

  async updateAfterParse(
    segmentId: string,
    data: {
      geomWkt: string
      waypoints: object
      distanceKm: number
      elevationGainM: number | null
      boundingBox: object
      parseStatus: 'done' | 'error'
    },
  ): Promise<void> {
    await db
      .update(adventureSegments)
      .set({
        geom: sql`ST_GeomFromText(${data.geomWkt}, 4326)`,
        waypoints: data.waypoints as Record<string, unknown>[],
        distanceKm: data.distanceKm,
        elevationGainM: data.elevationGainM,
        boundingBox: data.boundingBox as Record<string, unknown>,
        parseStatus: data.parseStatus,
        updatedAt: new Date(),
      })
      .where(eq(adventureSegments.id, segmentId))
  }

  async updateParseError(segmentId: string): Promise<void> {
    await db
      .update(adventureSegments)
      .set({ parseStatus: 'error', updatedAt: new Date() })
      .where(eq(adventureSegments.id, segmentId))
  }

  async setProcessingStatus(segmentId: string): Promise<void> {
    await db
      .update(adventureSegments)
      .set({ parseStatus: 'processing', updatedAt: new Date() })
      .where(eq(adventureSegments.id, segmentId))
  }

  async updateOrderIndexes(updates: Array<{ id: string; orderIndex: number }>): Promise<void> {
    if (updates.length === 0) return
    await Promise.all(
      updates.map(({ id, orderIndex }) =>
        db
          .update(adventureSegments)
          .set({ orderIndex, updatedAt: new Date() })
          .where(eq(adventureSegments.id, id)),
      ),
    )
  }

  async delete(segmentId: string): Promise<void> {
    await db.delete(adventureSegments).where(eq(adventureSegments.id, segmentId))
  }

  async updateCumulativeDistances(
    updates: Array<{ id: string; cumulativeStartKm: number }>,
  ): Promise<void> {
    if (updates.length === 0) return
    await Promise.all(
      updates.map(({ id, cumulativeStartKm }) =>
        db
          .update(adventureSegments)
          .set({ cumulativeStartKm, updatedAt: new Date() })
          .where(eq(adventureSegments.id, id)),
      ),
    )
  }
}
