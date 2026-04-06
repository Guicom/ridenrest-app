import { Injectable } from '@nestjs/common'
import { db, profiles } from '@ridenrest/database'
import { eq } from 'drizzle-orm'

@Injectable()
export class ProfileRepository {
  async findByUserId(userId: string) {
    const [row] = await db
      .select({ overpassEnabled: profiles.overpassEnabled, tier: profiles.tier })
      .from(profiles)
      .where(eq(profiles.id, userId))
    return row ?? null
  }

  async updateOverpassEnabled(userId: string, enabled: boolean): Promise<void> {
    await db
      .update(profiles)
      .set({ overpassEnabled: enabled })
      .where(eq(profiles.id, userId))
  }
}
