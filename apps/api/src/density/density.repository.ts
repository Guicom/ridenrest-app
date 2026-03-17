import { Injectable } from '@nestjs/common'
import { db } from '@ridenrest/database'
import { adventures, adventureSegments, coverageGaps } from '@ridenrest/database'
import type { Adventure } from '@ridenrest/database'
import { eq, and, inArray } from 'drizzle-orm'
import type { DensityStatus, CoverageGapSummary } from '@ridenrest/shared'

interface SegmentForAnalysis {
  id: string
  waypoints: Array<{ dist_km: number; lat: number; lng: number; ele?: number }> | null
}

interface InsertGapData {
  segmentId: string
  fromKm: number
  toKm: number
  severity: 'medium' | 'critical'
}

@Injectable()
export class DensityRepository {
  async findByAdventureId(adventureId: string, userId: string): Promise<Adventure | null> {
    const [row] = await db
      .select()
      .from(adventures)
      .where(and(eq(adventures.id, adventureId), eq(adventures.userId, userId)))
    return row ?? null
  }

  async setDensityStatus(adventureId: string, status: DensityStatus): Promise<void> {
    await db
      .update(adventures)
      .set({ densityStatus: status, updatedAt: new Date() })
      .where(eq(adventures.id, adventureId))
  }

  async setDensityProgress(adventureId: string, progress: number): Promise<void> {
    await db
      .update(adventures)
      .set({ densityProgress: progress, updatedAt: new Date() })
      .where(eq(adventures.id, adventureId))
  }

  async deleteGapsByAdventureId(adventureId: string): Promise<void> {
    // Delete coverage_gaps rows for all segments of this adventure
    const segmentIds = await db
      .select({ id: adventureSegments.id })
      .from(adventureSegments)
      .where(eq(adventureSegments.adventureId, adventureId))
    if (segmentIds.length === 0) return
    await db
      .delete(coverageGaps)
      .where(inArray(coverageGaps.segmentId, segmentIds.map((s) => s.id)))
  }

  async findParsedSegmentIds(adventureId: string): Promise<string[]> {
    const rows = await db
      .select({ id: adventureSegments.id })
      .from(adventureSegments)
      .where(
        and(
          eq(adventureSegments.adventureId, adventureId),
          eq(adventureSegments.parseStatus, 'done'),
        ),
      )
    return rows.map((r) => r.id)
  }

  async findSegmentsForAnalysis(segmentIds: string[]): Promise<SegmentForAnalysis[]> {
    if (segmentIds.length === 0) return []
    const rows = await db
      .select({ id: adventureSegments.id, waypoints: adventureSegments.waypoints })
      .from(adventureSegments)
      .where(inArray(adventureSegments.id, segmentIds))
    return rows as SegmentForAnalysis[]
  }

  async insertGaps(gaps: InsertGapData[]): Promise<void> {
    if (gaps.length === 0) return
    await db.insert(coverageGaps).values(
      gaps.map((g) => ({
        segmentId: g.segmentId,
        fromKm: g.fromKm,
        toKm: g.toKm,
        gapLengthKm: g.toKm - g.fromKm,
        severity: g.severity,
      })),
    )
  }

  async findGapsBySegmentIds(segmentIds: string[]): Promise<CoverageGapSummary[]> {
    if (segmentIds.length === 0) return []
    const rows = await db
      .select({
        segmentId: coverageGaps.segmentId,
        fromKm: coverageGaps.fromKm,
        toKm: coverageGaps.toKm,
        severity: coverageGaps.severity,
      })
      .from(coverageGaps)
      .where(inArray(coverageGaps.segmentId, segmentIds))
    return rows as CoverageGapSummary[]
  }
}
