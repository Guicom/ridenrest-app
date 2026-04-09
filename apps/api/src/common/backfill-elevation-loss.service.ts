import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common'
import { db, adventureSegments, adventureStages, adventures } from '@ridenrest/database'
import { eq, isNull, isNotNull, and, asc } from 'drizzle-orm'
import { computeElevationLoss } from '@ridenrest/gpx'
import { computeElevationGainForRange } from '../stages/stages.service.js'
import type { MapWaypoint } from '@ridenrest/shared'

/**
 * One-time backfill: compute elevation_loss_m for existing segments and stages
 * that have elevation_gain_m but no elevation_loss_m (created before story 17.4).
 *
 * Runs at API startup. Once all rows are backfilled, subsequent startups skip (no-op).
 */
@Injectable()
export class BackfillElevationLossService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackfillElevationLossService.name)

  async onApplicationBootstrap() {
    try {
      await this.backfillSegments()
      await this.backfillStages()
    } catch (err) {
      this.logger.error('Elevation loss backfill failed — non-blocking', err)
    }
  }

  private async backfillSegments() {
    const rows = await db
      .select({
        id: adventureSegments.id,
        waypoints: adventureSegments.waypoints,
      })
      .from(adventureSegments)
      .where(
        and(
          isNotNull(adventureSegments.elevationGainM),
          isNull(adventureSegments.elevationLossM),
        ),
      )

    if (rows.length === 0) return
    this.logger.log(`Backfilling elevation_loss_m for ${rows.length} segments…`)

    let updated = 0
    for (const row of rows) {
      if (!row.waypoints) continue
      const wps = row.waypoints as Array<{ lat: number; lng: number; ele?: number | null; elevM?: number }>
      const points = wps.map((w) => ({
        lat: w.lat,
        lng: w.lng,
        elevM: w.ele ?? w.elevM,
      }))
      if (!points.some((p) => p.elevM != null)) continue
      const loss = computeElevationLoss(points)
      await db
        .update(adventureSegments)
        .set({ elevationLossM: loss > 0 ? loss : null })
        .where(eq(adventureSegments.id, row.id))
      updated++
    }

    // Also update adventure totals
    await this.backfillAdventureTotals()
    this.logger.log(`Backfilled elevation_loss_m for ${updated} segments`)
  }

  private async backfillStages() {
    const rows = await db
      .select({
        id: adventureStages.id,
        adventureId: adventureStages.adventureId,
        startKm: adventureStages.startKm,
        endKm: adventureStages.endKm,
      })
      .from(adventureStages)
      .where(
        and(
          isNotNull(adventureStages.elevationGainM),
          isNull(adventureStages.elevationLossM),
        ),
      )

    if (rows.length === 0) return
    this.logger.log(`Backfilling elevation_loss_m for ${rows.length} stages…`)

    // Group by adventureId to load waypoints once per adventure
    const byAdventure = new Map<string, typeof rows>()
    for (const row of rows) {
      const list = byAdventure.get(row.adventureId) ?? []
      list.push(row)
      byAdventure.set(row.adventureId, list)
    }

    let updated = 0
    for (const [adventureId, stages] of byAdventure) {
      const waypoints = await this.getAdventureWaypoints(adventureId)
      if (waypoints.length < 2) continue

      // Skip adventures whose waypoints have no elevation data — stages would
      // remain null after compute, keeping them eligible on every restart.
      const hasElevData = waypoints.some((wp) => wp.ele !== undefined && wp.ele !== null)
      if (!hasElevData) continue

      for (const stage of stages) {
        const elev = computeElevationGainForRange(waypoints, stage.startKm, stage.endKm)
        await db
          .update(adventureStages)
          .set({ elevationLossM: elev?.loss ?? null })
          .where(eq(adventureStages.id, stage.id))
        updated++
      }
    }
    this.logger.log(`Backfilled elevation_loss_m for ${updated} stages`)
  }

  private async backfillAdventureTotals() {
    // Find adventures that have segments with loss data but no total_elevation_loss_m
    const advRows = await db
      .select({ id: adventures.id })
      .from(adventures)
      .where(isNull(adventures.totalElevationLossM))

    for (const adv of advRows) {
      const segs = await db
        .select({
          elevationLossM: adventureSegments.elevationLossM,
        })
        .from(adventureSegments)
        .where(eq(adventureSegments.adventureId, adv.id))

      const hasLossData = segs.some((s) => s.elevationLossM !== null)
      if (!hasLossData) continue

      const totalLoss = segs.reduce((sum, s) => sum + (s.elevationLossM ?? 0), 0)
      await db
        .update(adventures)
        .set({ totalElevationLossM: totalLoss })
        .where(eq(adventures.id, adv.id))
    }
  }

  private async getAdventureWaypoints(adventureId: string): Promise<MapWaypoint[]> {
    const rows = await db
      .select({
        waypoints: adventureSegments.waypoints,
        cumulativeStartKm: adventureSegments.cumulativeStartKm,
      })
      .from(adventureSegments)
      .where(
        and(
          eq(adventureSegments.adventureId, adventureId),
          eq(adventureSegments.parseStatus, 'done'),
        ),
      )
      .orderBy(asc(adventureSegments.orderIndex))

    const all: MapWaypoint[] = []
    for (const row of rows) {
      if (!row.waypoints) continue
      const wps = row.waypoints as Array<{ lat: number; lng: number; ele?: number | null; distKm?: number; dist_km?: number }>
      for (const wp of wps) {
        all.push({
          lat: wp.lat,
          lng: wp.lng,
          ...(wp.ele !== undefined && wp.ele !== null ? { ele: wp.ele } : {}),
          distKm: (wp.distKm ?? wp.dist_km ?? 0) + row.cumulativeStartKm,
        })
      }
    }
    return all
  }
}
