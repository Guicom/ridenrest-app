import { Injectable } from '@nestjs/common'
import { db } from '@ridenrest/database'
import { adventures, adventureSegments } from '@ridenrest/database'
import type { Adventure, NewAdventure } from '@ridenrest/database'
import { eq, and, desc } from 'drizzle-orm'

@Injectable()
export class AdventuresRepository {
  async create(data: NewAdventure): Promise<Adventure> {
    const [row] = await db.insert(adventures).values(data).returning()
    return row as Adventure
  }

  async findAllByUserId(userId: string): Promise<Adventure[]> {
    return db
      .select()
      .from(adventures)
      .where(eq(adventures.userId, userId))
      .orderBy(desc(adventures.createdAt))
  }

  async findByIdAndUserId(id: string, userId: string): Promise<Adventure | null> {
    const [row] = await db
      .select()
      .from(adventures)
      .where(and(eq(adventures.id, id), eq(adventures.userId, userId)))
    return row ?? null
  }

  async updateTotalDistance(id: string, totalDistanceKm: number): Promise<void> {
    await db
      .update(adventures)
      .set({ totalDistanceKm, updatedAt: new Date() })
      .where(eq(adventures.id, id))
  }

  async updateName(id: string, name: string): Promise<Adventure> {
    const [row] = await db
      .update(adventures)
      .set({ name, updatedAt: new Date() })
      .where(eq(adventures.id, id))
      .returning()
    return row as Adventure
  }

  async deleteById(id: string): Promise<void> {
    await db.delete(adventures).where(eq(adventures.id, id))
  }

  async findSegmentStorageUrlsByAdventureId(adventureId: string): Promise<string[]> {
    const rows = await db
      .select({ storageUrl: adventureSegments.storageUrl })
      .from(adventureSegments)
      .where(eq(adventureSegments.adventureId, adventureId))
    return rows.filter((r) => r.storageUrl).map((r) => r.storageUrl!)
  }
}
