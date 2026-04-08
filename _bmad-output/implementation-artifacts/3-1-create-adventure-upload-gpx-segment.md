# Story 3.1: Create Adventure & Upload First GPX Segment

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user**,
I want to create a named adventure and upload a GPX file as my first segment,
So that my route appears in the app and I can start planning around it.

## Acceptance Criteria

1. **Given** a logged-in user submits a name on the "Nouvelle aventure" form,
   **When** the creation request completes,
   **Then** an adventure record is created in DB, the user is redirected to `/adventures/:id`, and the adventure appears in their list (FR-010).

2. **Given** a user uploads a valid GPX file on the adventure detail page,
   **When** the file is received by `POST /api/adventures/:adventureId/segments` (multipart) and saved on Fly.io volume (`/data/gpx/{segmentId}.gpx`),
   **Then** a segment record is created with `parseStatus: 'pending'` and a job `parse-segment` BullMQ is enqueued with `{ segmentId, storageUrl }` (FR-011).

3. **Given** the BullMQ processor parses the GPX file successfully (≤ 50 000 points, < 10s),
   **When** parsing completes,
   **Then** the segment's `geom` (LINESTRING), `waypoints` (JSONB), `distanceKm`, and `parseStatus: 'done'` are saved — and the original GPX file remains on Fly.io volume (NFR-005, NFR-033).

4. **Given** the GPX file is malformed or unparseable,
   **When** the processor fails,
   **Then** `parseStatus: 'error'` and an `errorMessage` are saved — the adventure record and any previous valid segments are untouched (NFR-033).

5. **Given** the GPX file contains `<ele>` elevation tags on trackpoints,
   **When** the processor parses the file,
   **Then** each waypoint in the `waypoints` JSONB is stored as `{ dist_km, lat, lng, ele }` — enabling D+ computation without re-parsing.

6. **Given** the GPX file has no `<ele>` tags,
   **When** the processor completes,
   **Then** waypoints are stored without `ele` field and elevation displays as "N/A" in the UI — no error thrown.

7. **Given** a user attempts to upload a GPX file larger than 10 MB,
   **When** the upload is attempted,
   **Then** an error "Fichier trop volumineux (max 10 MB)" is displayed before upload starts (client-side check).

   > ⚠️ **Discrepancy note**: epics.md says "50 MB" but `MAX_GPX_FILE_SIZE_BYTES` constant is 10 MB. Using 10 MB (already implemented constant). Update epics.md if the limit changes.

## Tasks / Subtasks

- [x] Task 1 — Install new dependencies (AC: all)
  - [x] 1.1 In `apps/api`: `pnpm --filter @ridenrest/api add @types/multer` — TypeScript types for multer file upload
  - [x] 1.2 In `apps/web`: confirm `@tanstack/react-query` is installed (already done in story 1.5 — skip if present)

- [x] Task 2 — NestJS: adventures module (AC: #1)
  - [x] 2.1 Create `apps/api/src/adventures/adventures.repository.ts` — Drizzle queries: `create`, `findAllByUserId`, `findByIdAndUserId`, `delete`
  - [x] 2.2 Create `apps/api/src/adventures/adventures.service.ts` — `createAdventure`, `listAdventures`, `getAdventure`, `updateTotalDistance`
  - [x] 2.3 Create `apps/api/src/adventures/adventures.service.test.ts` — unit tests with mocked repository
  - [x] 2.4 Create `apps/api/src/adventures/dto/create-adventure.dto.ts` — `@IsString()`, `@MinLength(1)`, `@MaxLength(100)`
  - [x] 2.5 Create `apps/api/src/adventures/adventures.controller.ts` — `POST /adventures`, `GET /adventures`, `GET /adventures/:id`
  - [x] 2.6 Create `apps/api/src/adventures/adventures.module.ts` — export `AdventuresService` for use by segments module

- [x] Task 3 — NestJS: segments module (AC: #2)
  - [x] 3.1 Create `apps/api/src/segments/segments.repository.ts` — Drizzle queries: `create`, `findAllByAdventureId`, `findByIdAndUserId`, `updateAfterParse`, `findAllByAdventureIdForRecompute`
  - [x] 3.2 Create `apps/api/src/segments/segments.service.ts` — `createSegment` (saves file + DB + enqueue job), `listSegments`, `recomputeCumulativeDistances`
  - [x] 3.3 Create `apps/api/src/segments/segments.service.test.ts` — unit tests for recomputeCumulativeDistances logic
  - [x] 3.4 Create `apps/api/src/segments/dto/create-segment.dto.ts` — `@IsString()`, `@IsOptional()`, `@MaxLength(100)` for optional `name`
  - [x] 3.5 Create `apps/api/src/segments/segments.controller.ts` — `POST /adventures/:adventureId/segments` (multipart), `GET /adventures/:adventureId/segments`
  - [x] 3.6 Create `apps/api/src/segments/segments.module.ts` — imports `AdventuresModule`, `QueuesModule`

- [x] Task 4 — NestJS: GPX parse BullMQ processor (AC: #3, #4, #5, #6)
  - [x] 4.1 Create `apps/api/src/segments/jobs/gpx-parse.processor.ts` — Worker for `gpx-processing` queue, processes `parse-segment` jobs
  - [x] 4.2 Create `apps/api/src/segments/jobs/gpx-parse.processor.test.ts` — unit tests: valid GPX, malformed GPX, GPX without ele

- [x] Task 5 — Register modules in AppModule (AC: all)
  - [x] 5.1 Update `apps/api/src/app.module.ts` — add `AdventuresModule`, `SegmentsModule` to imports array

- [x] Task 6 — Next.js: API client methods (AC: #1, #2, #7)
  - [x] 6.1 Update `apps/web/src/lib/api-client.ts` — add `createAdventure`, `listAdventures`, `getAdventure`, `listSegments`, `createSegment` (multipart)
  - [x] 6.2 Add TanStack Query provider in `apps/web/src/app/layout.tsx` if not already present (already in `(app)/layout.tsx` ✅)

- [x] Task 7 — Next.js: Adventures list page + create adventure (AC: #1)
  - [x] 7.1 Update `apps/web/src/app/(app)/adventures/page.tsx` — full implementation with `useQuery(['adventures'])`, adventure cards, create button
  - [x] 7.2 Create `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx` — client component, renders adventure cards
  - [x] 7.3 Create `apps/web/src/app/(app)/adventures/_components/create-adventure-dialog.tsx` — dialog with React Hook Form + Zod, calls `createAdventure`, redirects to `/adventures/:id`

- [x] Task 8 — Next.js: Adventure detail page + GPX upload + parse polling (AC: #2, #3, #4, #5, #6, #7)
  - [x] 8.1 Create `apps/web/src/app/(app)/adventures/[id]/page.tsx` — server component layout, passes id to client
  - [x] 8.2 Create `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — client component: `useQuery(['adventures', id])` + `useQuery(['adventures', id, 'segments'])` with polling
  - [x] 8.3 Create `apps/web/src/app/(app)/adventures/[id]/_components/gpx-upload-form.tsx` — client-side file size validation (10 MB), multipart upload, progress state
  - [x] 8.4 Create `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` — shows segment info, parse status indicator (pending/processing/done/error)

- [ ] Task 9 — Final validation (AC: #1–#7) — **Manual integration testing required** *(validate `processing` status now visible during parse)*
  - [ ] 9.1 Create adventure "Test Transcantabrique" → redirected to `/adventures/:id` ✅
  - [ ] 9.2 Adventure appears in `/adventures` list ✅
  - [ ] 9.3 Upload valid GPX → segment created with parseStatus: 'pending' in UI ✅
  - [ ] 9.4 After a few seconds, segment transitions to parseStatus: 'done', distanceKm visible ✅
  - [ ] 9.5 Upload malformed GPX → segment shows parseStatus: 'error' ✅
  - [ ] 9.6 Upload GPX > 10 MB → "Fichier trop volumineux (max 10 MB)" shown before any network request ✅
  - [ ] 9.7 DB: `adventure_segments` row has `geom` (LINESTRING), `waypoints` (JSONB), `distance_km` set after parse ✅
  - [ ] 9.8 `GET /api/adventures/:adventureId/segments` returns segments for that adventure only (auth enforced) ✅

### Review Follow-ups (AI) — LOW severity, addresser ultérieurement

- [ ] [AI-Review][LOW] `adventure-list.tsx` — Ajouter `onError` sur `createMutation` pour afficher un feedback en cas d'erreur réseau/serveur lors de la création d'aventure [`apps/web/src/app/(app)/adventures/_components/adventure-list.tsx:1127`]
- [ ] [AI-Review][LOW] `adventures.repository.ts` — Consolider les deux import statements séparés depuis `@ridenrest/database` en un seul [`apps/api/src/adventures/adventures.repository.ts:2-3`]
- [ ] [AI-Review][LOW] `api-client.ts` — Déplacer `import type { AdventureResponse, AdventureSegmentResponse }` en haut du fichier (ESLint `import/first`) [`apps/web/src/lib/api-client.ts:66`]

---

## Dev Notes

### CRITICAL: What's Already Done — Do NOT Redo

From stories 1.1–2.4 (already implemented):

**packages/database:**
- ✅ `adventures` table schema with `id`, `userId`, `name`, `totalDistanceKm`, `status`, `createdAt`, `updatedAt`
- ✅ `adventure_segments` table schema with `id`, `adventureId`, `name`, `orderIndex`, `cumulativeStartKm`, `distanceKm`, `elevationGainM`, `storageUrl`, `parseStatus`, `geom`, `waypoints`, `boundingBox`
- ✅ Exported types: `Adventure`, `NewAdventure`, `AdventureSegment`, `NewAdventureSegment`
- ✅ `parseStatusEnum`: `'pending' | 'processing' | 'done' | 'error'`

**packages/shared:**
- ✅ `createAdventureSchema` — `{ name: z.string().min(1).max(100) }`
- ✅ `createSegmentSchema` — `{ name: z.string().min(1).max(100) }` (file handled separately by NestJS)
- ✅ `AdventureResponse` + `AdventureSegmentResponse` — API response interfaces (camelCase JSON)
- ✅ `MAX_GPX_FILE_SIZE_BYTES` = 10MB, `MAX_GPX_POINTS` = 2000, `RDP_EPSILON` = 0.0001

**packages/gpx:**
- ✅ `parseGpx(xml: string): GpxPoint[]` — parses `<trkpt>` elements, extracts `{ lat, lng, elevM? }`
- ✅ `computeCumulativeDistances(points): KmWaypoint[]` — returns `{ dist_km, lat, lng, ele? }[]`
- ✅ `computeElevationGain(points): number`
- ✅ `rdpSimplify(points, epsilon): GpxPoint[]`
- ✅ `computeBoundingBox(points): BoundingBox` — returns `{ minLat, maxLat, minLng, maxLng }`

**apps/api:**
- ✅ `QueuesModule` — `gpx-processing` + `density-analysis` queues registered, exports `BullModule`
- ✅ `JwtAuthGuard` global via `APP_GUARD` — all routes protected by default
- ✅ `@CurrentUser()` decorator — extracts `{ id, email }` from JWT
- ✅ `ResponseInterceptor` — wraps all controller returns as `{ "data": ... }`
- ✅ `HttpExceptionFilter` — handles all exceptions globally
- ✅ `ValidationPipe` global — validates DTOs via class-validator

**apps/web:**
- ✅ `api-client.ts` with `apiFetch<T>()` — handles Bearer token + FormData detection
- ✅ `apps/web/src/app/(app)/adventures/page.tsx` — stub to replace (not a new file)

**This story adds:** Adventures CRUD + Segments upload + GPX parse processor + Web pages (list + detail + upload)

---

### Architecture: Data Flow for GPX Upload

```
1. Create Adventure
   Browser → POST /api/adventures { name }
   → NestJS AdventuresController → AdventuresService.createAdventure()
   → DB: INSERT INTO adventures (user_id, name) → returns AdventureResponse
   → Web: redirect to /adventures/:id

2. Upload GPX Segment
   Browser → POST /api/adventures/:adventureId/segments (multipart: file + optional name)
   → NestJS SegmentsController → @UploadedFile() + @Body() dto
   → SegmentsService.createSegment():
       a. Verify adventure ownership (throw 404 if not found)
       b. Generate segmentId = crypto.randomUUID()
       c. Write buffer to /data/gpx/{segmentId}.gpx
       d. INSERT adventure_segments (parse_status: 'pending', storage_url: '/data/gpx/{segmentId}.gpx')
       e. recomputeCumulativeDistances(adventureId) — all distances 0 until parsed
       f. BullMQ: queue.add('parse-segment', { segmentId, storageUrl: '/data/gpx/{segmentId}.gpx' })
   → Web: TanStack Query polling every 3s while parseStatus === 'pending'

3. GPX Parse Job (BullMQ worker)
   Job: { segmentId, storageUrl }
   → Read file: fs.readFile(storageUrl)
   → Parse: parseGpx(xml) → GpxPoint[]
   → Validate: points.length > 0 (throw if empty/malformed)
   → Compute: computeCumulativeDistances(points) → KmWaypoint[]
   → Compute: computeElevationGain(points) → elevationGainM
   → Compute: computeBoundingBox(points) → BoundingBox
   → Build WKT: 'LINESTRING(lng lat, lng lat, ...)'
   → DB: UPDATE adventure_segments SET geom=ST_GeomFromText(wkt,4326), waypoints=..., distance_km=..., parse_status='done'
   → recomputeCumulativeDistances(adventureId)
   → On error: UPDATE adventure_segments SET parse_status='error', error logged

4. TanStack Query polling
   refetchInterval: data?.some(s => s.parseStatus === 'pending' || s.parseStatus === 'processing') ? 3000 : false
   → When all 'done': segment cards update with distance, elevation
```

---

### Task 2: Adventures Module (NestJS)

#### `apps/api/src/adventures/adventures.repository.ts` (NEW FILE)

```typescript
import { Injectable } from '@nestjs/common'
import { db } from '@ridenrest/database'
import { adventures } from '@ridenrest/database'
import type { Adventure, NewAdventure } from '@ridenrest/database'
import { eq, and, desc } from 'drizzle-orm'

@Injectable()
export class AdventuresRepository {
  async create(data: NewAdventure): Promise<Adventure> {
    const [row] = await db.insert(adventures).values(data).returning()
    return row!
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
}
```

#### `apps/api/src/adventures/adventures.service.ts` (NEW FILE)

```typescript
import { Injectable, NotFoundException } from '@nestjs/common'
import { AdventuresRepository } from './adventures.repository.js'
import type { AdventureResponse } from '@ridenrest/shared/types'

@Injectable()
export class AdventuresService {
  constructor(private readonly adventuresRepo: AdventuresRepository) {}

  async createAdventure(userId: string, name: string): Promise<AdventureResponse> {
    const adventure = await this.adventuresRepo.create({ userId, name })
    return this.toResponse(adventure)
  }

  async listAdventures(userId: string): Promise<AdventureResponse[]> {
    const rows = await this.adventuresRepo.findAllByUserId(userId)
    return rows.map(this.toResponse)
  }

  async getAdventure(id: string, userId: string): Promise<AdventureResponse> {
    const adventure = await this.adventuresRepo.findByIdAndUserId(id, userId)
    if (!adventure) throw new NotFoundException('Adventure not found')
    return this.toResponse(adventure)
  }

  async verifyOwnership(id: string, userId: string): Promise<void> {
    const adventure = await this.adventuresRepo.findByIdAndUserId(id, userId)
    if (!adventure) throw new NotFoundException('Adventure not found')
  }

  async updateTotalDistance(id: string, totalDistanceKm: number): Promise<void> {
    await this.adventuresRepo.updateTotalDistance(id, totalDistanceKm)
  }

  private toResponse(a: import('@ridenrest/database').Adventure): AdventureResponse {
    return {
      id: a.id,
      userId: a.userId,
      name: a.name,
      totalDistanceKm: a.totalDistanceKm,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }
  }
}
```

#### `apps/api/src/adventures/dto/create-adventure.dto.ts` (NEW FILE)

```typescript
import { IsString, MinLength, MaxLength } from 'class-validator'

export class CreateAdventureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string
}
```

#### `apps/api/src/adventures/adventures.controller.ts` (NEW FILE)

```typescript
import { Controller, Get, Post, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AdventuresService } from './adventures.service.js'
import { CreateAdventureDto } from './dto/create-adventure.dto.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('adventures')
@Controller('adventures')
export class AdventuresController {
  constructor(private readonly adventuresService: AdventuresService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new adventure' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateAdventureDto,
  ) {
    return this.adventuresService.createAdventure(user.id, dto.name)
  }

  @Get()
  @ApiOperation({ summary: 'List all adventures for current user' })
  async findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.adventuresService.listAdventures(user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single adventure by id' })
  async findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.adventuresService.getAdventure(id, user.id)
  }
}
```

#### `apps/api/src/adventures/adventures.module.ts` (NEW FILE)

```typescript
import { Module } from '@nestjs/common'
import { AdventuresController } from './adventures.controller.js'
import { AdventuresService } from './adventures.service.js'
import { AdventuresRepository } from './adventures.repository.js'

@Module({
  controllers: [AdventuresController],
  providers: [AdventuresService, AdventuresRepository],
  exports: [AdventuresService],
})
export class AdventuresModule {}
```

#### `apps/api/src/adventures/adventures.service.test.ts` (NEW FILE)

```typescript
import { AdventuresService } from './adventures.service.js'
import { NotFoundException } from '@nestjs/common'

const mockRepo = {
  create: jest.fn(),
  findAllByUserId: jest.fn(),
  findByIdAndUserId: jest.fn(),
  updateTotalDistance: jest.fn(),
}

const service = new AdventuresService(mockRepo as any)

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
})
```

---

### Task 3: Segments Module (NestJS)

#### `apps/api/src/segments/segments.repository.ts` (NEW FILE)

```typescript
import { Injectable } from '@nestjs/common'
import { db } from '@ridenrest/database'
import { adventureSegments, adventures } from '@ridenrest/database'
import type { AdventureSegment, NewAdventureSegment } from '@ridenrest/database'
import { eq, asc, and, inArray } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

@Injectable()
export class SegmentsRepository {
  async create(data: NewAdventureSegment): Promise<AdventureSegment> {
    const [row] = await db.insert(adventureSegments).values(data).returning()
    return row!
  }

  async findAllByAdventureId(adventureId: string): Promise<AdventureSegment[]> {
    return db
      .select()
      .from(adventureSegments)
      .where(eq(adventureSegments.adventureId, adventureId))
      .orderBy(asc(adventureSegments.orderIndex))
  }

  async findByIdAndUserId(segmentId: string, userId: string): Promise<AdventureSegment | null> {
    // Join with adventures to verify ownership
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
        waypoints: data.waypoints as any,
        distanceKm: data.distanceKm,
        elevationGainM: data.elevationGainM,
        boundingBox: data.boundingBox as any,
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

  async updateCumulativeDistances(
    updates: Array<{ id: string; cumulativeStartKm: number }>,
  ): Promise<void> {
    // Update each segment's cumulative_start_km
    for (const { id, cumulativeStartKm } of updates) {
      await db
        .update(adventureSegments)
        .set({ cumulativeStartKm, updatedAt: new Date() })
        .where(eq(adventureSegments.id, id))
    }
  }
}
```

#### `apps/api/src/segments/dto/create-segment.dto.ts` (NEW FILE)

```typescript
import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator'

export class CreateSegmentDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  name?: string
}
```

#### `apps/api/src/segments/segments.service.ts` (NEW FILE)

```typescript
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { SegmentsRepository } from './segments.repository.js'
import { AdventuresService } from '../adventures/adventures.service.js'
import type { AdventureSegmentResponse } from '@ridenrest/shared/types'
import { MAX_GPX_FILE_SIZE_BYTES } from '@ridenrest/shared/constants'

const GPX_STORAGE_PATH = process.env.GPX_STORAGE_PATH ?? '/data/gpx'

@Injectable()
export class SegmentsService {
  constructor(
    private readonly segmentsRepo: SegmentsRepository,
    private readonly adventuresService: AdventuresService,
    @InjectQueue('gpx-processing') private readonly gpxQueue: Queue,
  ) {}

  async createSegment(
    adventureId: string,
    userId: string,
    file: Express.Multer.File,
    name?: string,
  ): Promise<AdventureSegmentResponse> {
    // Verify adventure ownership
    await this.adventuresService.verifyOwnership(adventureId, userId)

    // Validate file size (belt-and-suspenders — client also validates)
    if (file.size > MAX_GPX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Fichier trop volumineux (max 10 MB)')
    }

    // Determine order index (append at end)
    const count = await this.segmentsRepo.countByAdventureId(adventureId)
    const orderIndex = count // 0-based

    // Generate segment ID before writing file (used as filename)
    const segmentId = crypto.randomUUID()
    const storageUrl = path.join(GPX_STORAGE_PATH, `${segmentId}.gpx`)

    // Derive name from filename if not provided
    const segmentName = name?.trim() || file.originalname.replace(/\.gpx$/i, '')

    // Write file to Fly.io volume
    try {
      await fs.mkdir(GPX_STORAGE_PATH, { recursive: true })
      await fs.writeFile(storageUrl, file.buffer)
    } catch (err) {
      throw new InternalServerErrorException('Failed to save GPX file')
    }

    // Create DB record
    const segment = await this.segmentsRepo.create({
      id: segmentId,
      adventureId,
      name: segmentName,
      orderIndex,
      cumulativeStartKm: 0, // recomputed below (distance unknown until parse)
      parseStatus: 'pending',
      storageUrl,
    })

    // Recompute cumulative distances (all 0 until parse completes)
    await this.recomputeCumulativeDistances(adventureId)

    // Enqueue BullMQ parse job
    await this.gpxQueue.add('parse-segment', { segmentId, storageUrl })

    return this.toResponse(segment)
  }

  async listSegments(adventureId: string, userId: string): Promise<AdventureSegmentResponse[]> {
    // Verify ownership before listing
    await this.adventuresService.verifyOwnership(adventureId, userId)
    const rows = await this.segmentsRepo.findAllByAdventureId(adventureId)
    return rows.map(this.toResponse)
  }

  /**
   * Recompute cumulative distances for all segments of an adventure.
   * Called after: segment create, segment delete, segment reorder, parse complete.
   */
  async recomputeCumulativeDistances(adventureId: string): Promise<void> {
    const segments = await this.segmentsRepo.findAllByAdventureId(adventureId)
    let cumulative = 0
    const updates = segments.map((seg) => {
      const result = { id: seg.id, cumulativeStartKm: cumulative }
      cumulative += seg.distanceKm
      return result
    })
    await this.segmentsRepo.updateCumulativeDistances(updates)
    // Update adventure total distance
    await this.adventuresService.updateTotalDistance(adventureId, cumulative)
  }

  private toResponse(s: import('@ridenrest/database').AdventureSegment): AdventureSegmentResponse {
    return {
      id: s.id,
      adventureId: s.adventureId,
      name: s.name,
      orderIndex: s.orderIndex,
      cumulativeStartKm: s.cumulativeStartKm,
      distanceKm: s.distanceKm,
      elevationGainM: s.elevationGainM ?? null,
      parseStatus: s.parseStatus,
      boundingBox: (s.boundingBox as any) ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }
  }
}
```

#### `apps/api/src/segments/segments.controller.ts` (NEW FILE)

```typescript
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger'
import { SegmentsService } from './segments.service.js'
import { CreateSegmentDto } from './dto/create-segment.dto.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'
import type { Express } from 'express'

@ApiTags('segments')
@Controller('adventures/:adventureId/segments')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: undefined /* memory storage */ }))
  @ApiOperation({ summary: 'Upload a GPX file as a new segment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
      },
      required: ['file'],
    },
  })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateSegmentDto,
  ) {
    if (!file) throw new BadRequestException('GPX file is required')
    return this.segmentsService.createSegment(adventureId, user.id, file, dto.name)
  }

  @Get()
  @ApiOperation({ summary: 'List segments for an adventure' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
  ) {
    return this.segmentsService.listSegments(adventureId, user.id)
  }
}
```

> **`FileInterceptor('file', { storage: undefined })`** : `undefined` storage defaults to `memoryStorage` — the file arrives as `file.buffer` (Buffer). This avoids multer writing to disk with a random filename. We write it ourselves to `/data/gpx/{segmentId}.gpx` with the correct UUID filename.

#### `apps/api/src/segments/segments.module.ts` (NEW FILE)

```typescript
import { Module } from '@nestjs/common'
import { SegmentsController } from './segments.controller.js'
import { SegmentsService } from './segments.service.js'
import { SegmentsRepository } from './segments.repository.js'
import { AdventuresModule } from '../adventures/adventures.module.js'
import { QueuesModule } from '../queues/queues.module.js'

@Module({
  imports: [AdventuresModule, QueuesModule],
  controllers: [SegmentsController],
  providers: [SegmentsService, SegmentsRepository],
  exports: [SegmentsService],
})
export class SegmentsModule {}
```

#### `apps/api/src/segments/segments.service.test.ts` (NEW FILE)

```typescript
// Focus: recomputeCumulativeDistances logic
import { SegmentsService } from './segments.service.js'

const mockSegmentsRepo = {
  create: jest.fn(),
  findAllByAdventureId: jest.fn(),
  findByIdAndUserId: jest.fn(),
  countByAdventureId: jest.fn(),
  updateAfterParse: jest.fn(),
  updateParseError: jest.fn(),
  updateCumulativeDistances: jest.fn(),
}

const mockAdventuresService = {
  verifyOwnership: jest.fn(),
  updateTotalDistance: jest.fn(),
}

const mockGpxQueue = { add: jest.fn() }

const service = new SegmentsService(
  mockSegmentsRepo as any,
  mockAdventuresService as any,
  mockGpxQueue as any,
)

beforeEach(() => jest.clearAllMocks())

const makeSegment = (id: string, distanceKm: number, orderIndex: number) => ({
  id,
  adventureId: 'adv-1',
  name: `Segment ${orderIndex}`,
  orderIndex,
  cumulativeStartKm: 0,
  distanceKm,
  elevationGainM: null,
  storageUrl: `/data/gpx/${id}.gpx`,
  parseStatus: 'done' as const,
  geom: null,
  waypoints: null,
  boundingBox: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('recomputeCumulativeDistances', () => {
  it('sets cumulative distances correctly for 3 segments', async () => {
    mockSegmentsRepo.findAllByAdventureId.mockResolvedValue([
      makeSegment('s1', 100, 0),
      makeSegment('s2', 150, 1),
      makeSegment('s3', 50, 2),
    ])
    mockSegmentsRepo.updateCumulativeDistances.mockResolvedValue(undefined)
    mockAdventuresService.updateTotalDistance.mockResolvedValue(undefined)

    await service.recomputeCumulativeDistances('adv-1')

    expect(mockSegmentsRepo.updateCumulativeDistances).toHaveBeenCalledWith([
      { id: 's1', cumulativeStartKm: 0 },
      { id: 's2', cumulativeStartKm: 100 },
      { id: 's3', cumulativeStartKm: 250 },
    ])
    expect(mockAdventuresService.updateTotalDistance).toHaveBeenCalledWith('adv-1', 300)
  })

  it('sets total distance to 0 for pending segments (distanceKm = 0)', async () => {
    mockSegmentsRepo.findAllByAdventureId.mockResolvedValue([
      makeSegment('s1', 0, 0), // pending
    ])
    mockSegmentsRepo.updateCumulativeDistances.mockResolvedValue(undefined)
    mockAdventuresService.updateTotalDistance.mockResolvedValue(undefined)

    await service.recomputeCumulativeDistances('adv-1')

    expect(mockAdventuresService.updateTotalDistance).toHaveBeenCalledWith('adv-1', 0)
  })
})
```

---

### Task 4: GPX Parse Processor (BullMQ)

#### `apps/api/src/segments/jobs/gpx-parse.processor.ts` (NEW FILE)

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import * as fs from 'node:fs/promises'
import { parseGpx, computeCumulativeDistances, computeElevationGain, computeBoundingBox } from '@ridenrest/gpx'
import { SegmentsRepository } from '../segments.repository.js'
import { SegmentsService } from '../segments.service.js'
import { db, adventureSegments } from '@ridenrest/database'
import { eq } from 'drizzle-orm'

interface ParseSegmentJob {
  segmentId: string
  storageUrl: string
}

@Processor('gpx-processing')
export class GpxParseProcessor extends WorkerHost {
  constructor(
    private readonly segmentsRepo: SegmentsRepository,
    private readonly segmentsService: SegmentsService,
  ) {
    super()
  }

  async process(job: Job<ParseSegmentJob>): Promise<void> {
    const { segmentId, storageUrl } = job.data
    let adventureId: string | null = null

    try {
      // 1. Get adventure ID for recompute (needed even on error)
      const [segRow] = await db
        .select({ adventureId: adventureSegments.adventureId })
        .from(adventureSegments)
        .where(eq(adventureSegments.id, segmentId))

      if (!segRow) {
        // Segment deleted before job ran — silently complete
        return
      }
      adventureId = segRow.adventureId

      // 2. Read GPX file
      const gpxBuffer = await fs.readFile(storageUrl)
      const gpxXml = gpxBuffer.toString('utf-8')

      // 3. Parse track points
      const rawPoints = parseGpx(gpxXml)
      if (rawPoints.length === 0) {
        throw new Error('GPX file contains no track points')
      }

      // 4. Compute waypoints with cumulative distances
      const waypoints = computeCumulativeDistances(rawPoints)
      const distanceKm = waypoints[waypoints.length - 1]?.dist_km ?? 0

      // 5. Compute elevation gain
      const elevationGainM = computeElevationGain(rawPoints)

      // 6. Compute bounding box
      const boundingBox = computeBoundingBox(rawPoints)

      // 7. Build WKT LINESTRING for PostGIS
      // PostGIS WKT: longitude first, then latitude (EPSG:4326)
      const linestring = `LINESTRING(${rawPoints.map((p) => `${p.lng} ${p.lat}`).join(', ')})`

      // 8. Update segment in DB
      await this.segmentsRepo.updateAfterParse(segmentId, {
        geomWkt: linestring,
        waypoints,
        distanceKm,
        elevationGainM: elevationGainM > 0 ? elevationGainM : null,
        boundingBox,
        parseStatus: 'done',
      })

      // 9. Recompute cumulative distances now that we have real distanceKm
      await this.segmentsService.recomputeCumulativeDistances(adventureId)
    } catch (err) {
      // Log the error and mark segment as failed
      console.error(`[GpxParseProcessor] Failed to parse segment ${segmentId}:`, err)
      await this.segmentsRepo.updateParseError(segmentId)
      // Do NOT re-throw — job marked as failed by BullMQ after maxAttempts
    }
  }
}
```

> **BullMQ error handling pattern (from project-context.md)**: processors log errors + let job fail → auto-retry (max 3). After max retries, job moves to failed queue. The processor catches errors itself to ensure `updateParseError` is called even on first attempt, then does NOT re-throw. BullMQ will still retry the job if configured.
>
> **`computeBoundingBox`**: imported from `@ridenrest/gpx` (already exported from `packages/gpx/src/corridor.ts`).
>
> **`distanceKm`**: taken from the last waypoint's `dist_km` — this is the total distance computed by Haversine cumulative distances.

#### Register processor in segments module:

Add `GpxParseProcessor` to the `providers` array in `segments.module.ts`:

```typescript
import { GpxParseProcessor } from './jobs/gpx-parse.processor.js'

@Module({
  imports: [AdventuresModule, QueuesModule],
  controllers: [SegmentsController],
  providers: [SegmentsService, SegmentsRepository, GpxParseProcessor],
  exports: [SegmentsService],
})
export class SegmentsModule {}
```

#### `apps/api/src/segments/jobs/gpx-parse.processor.test.ts` (NEW FILE)

```typescript
// Mock fs and gpx package — test processor logic only
jest.mock('node:fs/promises')
jest.mock('@ridenrest/gpx')

import * as fsMock from 'node:fs/promises'
import * as gpxMock from '@ridenrest/gpx'
import { GpxParseProcessor } from './gpx-parse.processor.js'

const mockSegmentsRepo = {
  updateAfterParse: jest.fn(),
  updateParseError: jest.fn(),
}
const mockSegmentsService = {
  recomputeCumulativeDistances: jest.fn(),
}
const mockDb = {
  select: jest.fn(),
}

// Note: full DB mock is complex — focus on service-level logic tests
// Integration test (manual): upload real GPX file → verify DB fields after job

describe('GpxParseProcessor', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls updateParseError when GPX has no track points', async () => {
    jest.mocked(fsMock.readFile).mockResolvedValue(Buffer.from('<gpx></gpx>') as any)
    jest.mocked(gpxMock.parseGpx).mockReturnValue([])

    // Test is integration-level — validated in manual Task 9
    // Unit testing requires full DB mock — deferred for this story
  })
})
```

> **Note on processor tests**: Full unit testing of the processor requires mocking the Drizzle DB instance, which is complex with the current setup. The `segments.service.test.ts` covers the `recomputeCumulativeDistances` logic. Processor correctness is validated in Task 9 (manual integration test). Add proper processor unit tests in a dedicated testing story.

---

### Task 5: Register Modules in AppModule

#### `apps/api/src/app.module.ts` (UPDATED)

```typescript
import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { RedisProvider } from './common/providers/redis.provider.js'
import { QueuesModule } from './queues/queues.module.js'
import { HealthModule } from './health/health.module.js'
import { AdventuresModule } from './adventures/adventures.module.js'
import { SegmentsModule } from './segments/segments.module.js'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    QueuesModule,
    HealthModule,
    AdventuresModule,
    SegmentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RedisProvider,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [RedisProvider],
})
export class AppModule {}
```

---

### Task 6: Next.js API Client Methods

#### `apps/web/src/lib/api-client.ts` (UPDATED — add adventure + segment methods)

Add these methods to the existing `api-client.ts` file (after the existing `apiFetch` function):

```typescript
import type { AdventureResponse, AdventureSegmentResponse } from '@ridenrest/shared/types'

// ── Adventures ──────────────────────────────────────────────────────────────

export async function createAdventure(name: string): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>('/api/adventures', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function listAdventures(): Promise<AdventureResponse[]> {
  return apiFetch<AdventureResponse[]>('/api/adventures')
}

export async function getAdventure(id: string): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>(`/api/adventures/${id}`)
}

// ── Segments ─────────────────────────────────────────────────────────────────

export async function listSegments(adventureId: string): Promise<AdventureSegmentResponse[]> {
  return apiFetch<AdventureSegmentResponse[]>(`/api/adventures/${adventureId}/segments`)
}

export async function createSegment(
  adventureId: string,
  file: File,
  name?: string,
): Promise<AdventureSegmentResponse> {
  const formData = new FormData()
  formData.append('file', file)
  if (name) formData.append('name', name)

  return apiFetch<AdventureSegmentResponse>(`/api/adventures/${adventureId}/segments`, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type — browser sets it with multipart boundary
  })
}
```

#### TanStack Query Provider (if not already present)

Check `apps/web/src/app/layout.tsx` or a `providers.tsx` file. If `QueryClientProvider` is missing, create:

```typescript
// apps/web/src/components/providers/query-provider.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30_000, retry: 1 },
      },
    }),
  )
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

Wrap the app in `apps/web/src/app/layout.tsx`:
```tsx
import { QueryProvider } from '@/components/providers/query-provider'
// ...
<QueryProvider>{children}</QueryProvider>
```

> Check first — `QueryClientProvider` may already be present from story 1.5 if TanStack Query was set up. Only add if missing.

---

### Task 7: Adventures List Page + Create Adventure

#### `apps/web/src/app/(app)/adventures/page.tsx` (REPLACE stub)

```typescript
import { Suspense } from 'react'
import { AdventureList } from './_components/adventure-list'

export const metadata = {
  title: 'Mes aventures — Ride\'n\'Rest',
}

export default function AdventuresPage() {
  return (
    <main className="container mx-auto max-w-4xl p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mes aventures</h1>
      </div>
      <Suspense fallback={<div className="animate-pulse h-32 bg-muted rounded-lg" />}>
        <AdventureList />
      </Suspense>
    </main>
  )
}
```

#### `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx` (NEW FILE)

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { listAdventures, createAdventure } from '@/lib/api-client'
import { CreateAdventureDialog } from './create-adventure-dialog'

export function AdventureList() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: adventures = [], isPending } = useQuery({
    queryKey: ['adventures'],
    queryFn: listAdventures,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createAdventure(name),
    onSuccess: (adventure) => {
      queryClient.invalidateQueries({ queryKey: ['adventures'] })
      router.push(`/adventures/${adventure.id}`)
    },
  })

  if (isPending) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse h-20 bg-muted rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CreateAdventureDialog
        onSubmit={(name) => createMutation.mutate(name)}
        isPending={createMutation.isPending}
      />

      {adventures.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Aucune aventure pour l'instant.</p>
          <p className="text-sm mt-1">Créez votre première aventure ci-dessus.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {adventures.map((adventure) => (
            <button
              key={adventure.id}
              onClick={() => router.push(`/adventures/${adventure.id}`)}
              className="w-full text-left p-4 border rounded-lg hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{adventure.name}</span>
                <span className="text-sm text-muted-foreground">
                  {adventure.totalDistanceKm > 0
                    ? `${adventure.totalDistanceKm.toFixed(1)} km`
                    : 'Distance à calculer'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(adventure.createdAt).toLocaleDateString('fr-FR')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

#### `apps/web/src/app/(app)/adventures/_components/create-adventure-dialog.tsx` (NEW FILE)

```typescript
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createAdventureSchema, type CreateAdventureInput } from '@ridenrest/shared/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  onSubmit: (name: string) => void
  isPending: boolean
}

export function CreateAdventureDialog({ onSubmit, isPending }: Props) {
  const [open, setOpen] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAdventureInput>({
    resolver: zodResolver(createAdventureSchema),
  })

  const handleCreate = (values: CreateAdventureInput) => {
    onSubmit(values.name)
    reset()
    setOpen(false)
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full">
        + Nouvelle aventure
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit(handleCreate)} className="border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold">Nouvelle aventure</h2>
      <div className="space-y-1">
        <Label htmlFor="adventure-name">Nom de l'aventure</Label>
        <Input
          id="adventure-name"
          placeholder="Ex: Desertus Bikus 2026"
          autoFocus
          {...register('name')}
        />
        {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Création...' : 'Créer'}
        </Button>
        <Button type="button" variant="outline" onClick={() => { setOpen(false); reset() }}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
```

---

### Task 8: Adventure Detail Page + GPX Upload

#### `apps/web/src/app/(app)/adventures/[id]/page.tsx` (NEW FILE)

```typescript
import { AdventureDetail } from './_components/adventure-detail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdventureDetailPage({ params }: Props) {
  const { id } = await params
  return <AdventureDetail adventureId={id} />
}
```

#### `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` (NEW FILE)

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { getAdventure, listSegments } from '@/lib/api-client'
import { GpxUploadForm } from './gpx-upload-form'
import { SegmentCard } from './segment-card'

interface Props {
  adventureId: string
}

export function AdventureDetail({ adventureId }: Props) {
  const { data: adventure, isPending: adventureLoading } = useQuery({
    queryKey: ['adventures', adventureId],
    queryFn: () => getAdventure(adventureId),
  })

  const { data: segments = [] } = useQuery({
    queryKey: ['adventures', adventureId, 'segments'],
    queryFn: () => listSegments(adventureId),
    // Poll every 3s while any segment is pending or processing
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      return data.some(
        (s) => s.parseStatus === 'pending' || s.parseStatus === 'processing',
      )
        ? 3000
        : false
    },
  })

  if (adventureLoading) {
    return <div className="animate-pulse h-32 bg-muted rounded-lg m-4" />
  }

  if (!adventure) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Aventure introuvable.
      </div>
    )
  }

  return (
    <main className="container mx-auto max-w-4xl p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{adventure.name}</h1>
        <p className="text-muted-foreground text-sm">
          {adventure.totalDistanceKm > 0
            ? `${adventure.totalDistanceKm.toFixed(1)} km total`
            : 'Distance à calculer'}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Segments</h2>
        {segments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun segment. Ajoutez un fichier GPX pour démarrer.
          </p>
        ) : (
          <div className="space-y-2">
            {segments.map((segment) => (
              <SegmentCard key={segment.id} segment={segment} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Ajouter un segment GPX</h2>
        <GpxUploadForm adventureId={adventureId} />
      </section>
    </main>
  )
}
```

#### `apps/web/src/app/(app)/adventures/[id]/_components/gpx-upload-form.tsx` (NEW FILE)

```typescript
'use client'

import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSegment } from '@/lib/api-client'
import { MAX_GPX_FILE_SIZE_BYTES } from '@ridenrest/shared/constants'
import { Button } from '@/components/ui/button'

interface Props {
  adventureId: string
}

export function GpxUploadForm({ adventureId }: Props) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => createSegment(adventureId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })
      queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
      setSelectedFile(null)
      if (inputRef.current) inputRef.current.value = ''
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const file = e.target.files?.[0]
    if (!file) { setSelectedFile(null); return }

    // Client-side size validation (AC #7)
    if (file.size > MAX_GPX_FILE_SIZE_BYTES) {
      setFileError('Fichier trop volumineux (max 10 MB)')
      setSelectedFile(null)
      e.target.value = ''
      return
    }

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      setFileError('Format invalide — seuls les fichiers .gpx sont acceptés')
      setSelectedFile(null)
      e.target.value = ''
      return
    }

    setSelectedFile(file)
  }

  const handleUpload = () => {
    if (!selectedFile) return
    uploadMutation.mutate(selectedFile)
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <input
          ref={inputRef}
          type="file"
          accept=".gpx"
          onChange={handleFileChange}
          className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:cursor-pointer"
          disabled={uploadMutation.isPending}
        />
        {fileError && <p className="text-destructive text-xs mt-1">{fileError}</p>}
        {selectedFile && (
          <p className="text-xs text-muted-foreground mt-1">
            {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}
      </div>

      {uploadMutation.isError && (
        <p className="text-destructive text-xs">
          Échec de l'upload. Réessayez.
        </p>
      )}

      <Button
        onClick={handleUpload}
        disabled={!selectedFile || uploadMutation.isPending}
      >
        {uploadMutation.isPending ? 'Upload en cours...' : 'Uploader le segment'}
      </Button>
    </div>
  )
}
```

#### `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` (NEW FILE)

```typescript
import type { AdventureSegmentResponse, ParseStatus } from '@ridenrest/shared/types'

const STATUS_LABELS: Record<ParseStatus, string> = {
  pending: 'En attente...',
  processing: 'Analyse en cours...',
  done: 'Analysé',
  error: 'Erreur d\'analyse',
}

const STATUS_COLORS: Record<ParseStatus, string> = {
  pending: 'text-muted-foreground',
  processing: 'text-blue-600',
  done: 'text-green-600',
  error: 'text-destructive',
}

interface Props {
  segment: AdventureSegmentResponse
}

export function SegmentCard({ segment }: Props) {
  return (
    <div className="border rounded-lg p-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{segment.name}</p>
        <p className="text-xs text-muted-foreground">
          {segment.cumulativeStartKm > 0
            ? `Début à ${segment.cumulativeStartKm.toFixed(1)} km`
            : 'Début'}
        </p>
      </div>

      <div className="text-right flex-shrink-0 space-y-0.5">
        {segment.parseStatus === 'done' ? (
          <>
            <p className="text-sm font-medium">
              {segment.distanceKm.toFixed(1)} km
            </p>
            <p className="text-xs text-muted-foreground">
              {segment.elevationGainM != null
                ? `D+ ${Math.round(segment.elevationGainM)} m`
                : 'D+ N/A'}
            </p>
          </>
        ) : (
          <p className={`text-xs ${STATUS_COLORS[segment.parseStatus]}`}>
            {STATUS_LABELS[segment.parseStatus]}
            {segment.parseStatus === 'pending' || segment.parseStatus === 'processing' ? (
              <span className="animate-pulse"> ●</span>
            ) : null}
          </p>
        )}
      </div>
    </div>
  )
}
```

---

### Environment Variables

#### `apps/api/.env` — ADD:

```
GPX_STORAGE_PATH=/data/gpx
```

> In local dev, this path must exist. Create it: `mkdir -p /data/gpx` OR set to a local path like `./data/gpx` and create it. On Fly.io production, the volume is mounted at `/data/gpx` automatically.

---

### Critical Implementation Notes

**nodenext import rule (apps/api)**: ALL imports in `apps/api` MUST use `.js` extension. Example:
```typescript
import { SegmentsRepository } from './segments.repository.js'  // ✅
import { SegmentsRepository } from './segments.repository'     // ❌
```

**FileInterceptor memory storage**: `FileInterceptor('file')` without storage config defaults to `memoryStorage`. File arrives as `file.buffer`. This is correct for our pattern (we generate the UUID filename, write it ourselves). If multer's `limits.fileSize` is needed for server-side validation, add:
```typescript
FileInterceptor('file', { limits: { fileSize: MAX_GPX_FILE_SIZE_BYTES } })
```

**`@types/multer` vs bundled types**: NestJS ships `@types/multer` as a peer dep in `@nestjs/platform-express`. If `Express.Multer.File` is missing, run `pnpm --filter @ridenrest/api add -D @types/multer`.

**PostGIS geom insert with Drizzle**: Drizzle's custom type for PostGIS doesn't support `ST_GeomFromText()` natively. Use the `sql` template tag from `drizzle-orm` for the geom field in `updateAfterParse`. The other fields are updated normally.

**`computeBoundingBox` import**: Verify it's exported from `packages/gpx/src/index.ts`. It is (from `corridor.ts`). Import as: `import { computeBoundingBox } from '@ridenrest/gpx'`

**`createAdventureSchema` for NestJS DTO**: The NestJS DTO uses `class-validator` decorators (not Zod) because `ValidationPipe` is class-validator-based. The Zod schema in `packages/shared` is for client-side validation (React Hook Form). Both coexist — don't try to use Zod directly in NestJS DTOs.

**GPX file size limit discrepancy**: `MAX_GPX_FILE_SIZE_BYTES = 10MB` in code vs `50MB` in `epics.md` AC #7. Using 10MB (constants file is source of truth). If this needs changing, update `packages/shared/src/constants/gpx.constants.ts` only.

### File Structure After Story 3.1

```
apps/api/src/
├── adventures/
│   ├── adventures.module.ts                       ← NEW
│   ├── adventures.controller.ts                   ← NEW
│   ├── adventures.service.ts                      ← NEW
│   ├── adventures.service.test.ts                 ← NEW
│   ├── adventures.repository.ts                   ← NEW
│   └── dto/
│       └── create-adventure.dto.ts                ← NEW
├── segments/
│   ├── segments.module.ts                         ← NEW
│   ├── segments.controller.ts                     ← NEW
│   ├── segments.service.ts                        ← NEW
│   ├── segments.service.test.ts                   ← NEW
│   ├── segments.repository.ts                     ← NEW
│   ├── dto/
│   │   └── create-segment.dto.ts                  ← NEW
│   └── jobs/
│       ├── gpx-parse.processor.ts                 ← NEW
│       └── gpx-parse.processor.test.ts            ← NEW
└── app.module.ts                                  ← UPDATED

apps/web/src/
├── app/
│   └── (app)/
│       └── adventures/
│           ├── page.tsx                           ← UPDATED (replace stub)
│           ├── _components/
│           │   ├── adventure-list.tsx             ← NEW
│           │   └── create-adventure-dialog.tsx    ← NEW
│           └── [id]/
│               ├── page.tsx                       ← NEW
│               └── _components/
│                   ├── adventure-detail.tsx       ← NEW
│                   ├── gpx-upload-form.tsx        ← NEW
│                   └── segment-card.tsx           ← NEW
└── lib/
    └── api-client.ts                              ← UPDATED (add adventure/segment methods)
```

### Scope Boundaries — What NOT to Implement in This Story

- ❌ NO segment reorder, delete, or replace (story 3.2+)
- ❌ NO parse status polling UI beyond segments list (no toast notifications)
- ❌ NO MapLibre map view (story 4.x)
- ❌ NO density analysis (story 4.x)
- ❌ NO Strava GPX import (story 3.5)
- ❌ NO GPX download endpoint (`GET /segments/:id/gpx`) — story 3.2+
- ❌ NO segment rename or adventure rename (story 3.4)
- ❌ NO adventure delete (story 3.4)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.1 ACs]
- [Source: _bmad-output/planning-artifacts/architecture.md — BullMQ queues, GPX flow, Fly.io volumes, NestJS structure]
- [Source: _bmad-output/project-context.md — nodenext imports, ResponseInterceptor, repository pattern, query keys, RGPD]
- [Source: packages/database/src/schema/adventures.ts — adventures table columns]
- [Source: packages/database/src/schema/adventure-segments.ts — adventure_segments table columns + parseStatusEnum]
- [Source: packages/database/src/index.ts — exports: Adventure, AdventureSegment, adventures, adventureSegments]
- [Source: packages/shared/src/schemas/adventure.schema.ts — createAdventureSchema, reorderSegmentsSchema]
- [Source: packages/shared/src/schemas/segment.schema.ts — createSegmentSchema]
- [Source: packages/shared/src/types/adventure.types.ts — AdventureResponse, AdventureSegmentResponse, ParseStatus]
- [Source: packages/shared/src/constants/gpx.constants.ts — MAX_GPX_FILE_SIZE_BYTES, MAX_GPX_POINTS]
- [Source: packages/gpx/src/index.ts — parseGpx, computeCumulativeDistances, computeElevationGain, computeBoundingBox]
- [Source: apps/api/src/queues/queues.module.ts — gpx-processing queue already registered]
- [Source: apps/api/src/app.module.ts — AppModule current state]
- [Source: _bmad-output/implementation-artifacts/2-1-email-password-registration-login.md — api-client.ts pattern, nodenext rules]

---

## Dev Agent Record

### Implementation Notes

- **KmWaypoint type correction**: `packages/gpx` exports `KmWaypoint` with `km` (not `dist_km`) and `elevM` (not `ele`). The processor maps to DB storage format `{ dist_km, lat, lng, ele? }` on write.
- **`@ridenrest/shared` sub-path imports**: The shared package only exports from root `.`. All imports use `@ridenrest/shared` directly (not `@ridenrest/shared/types` or `@ridenrest/shared/schemas`).
- **QueryProvider**: Already in `apps/web/src/app/(app)/layout.tsx` from story 1.5 — no changes needed.
- **`@types/multer`**: Installed as devDependency. `FileInterceptor('file')` without storage option defaults to memoryStorage, file arrives as `file.buffer`.
- **GpxParseProcessor [FIXED by code-review]**: Now re-throws after `updateParseError` so BullMQ retry mechanism works correctly.
- **GpxParseProcessor [FIXED by code-review]**: DB query moved to `SegmentsRepository.findAdventureIdBySegmentId()` — no more direct `db.select()` in processor.
- **GpxParseProcessor [FIXED by code-review]**: Sets `parseStatus = 'processing'` at job start via `SegmentsRepository.setProcessingStatus()`.
- **GpxParseProcessor [FIXED by code-review]**: Applies `rdpSimplify` when `rawPoints.length > MAX_GPX_POINTS` before building WKT LINESTRING.
- **SegmentsRepository [FIXED by code-review]**: `updateCumulativeDistances()` now uses `Promise.all` instead of sequential loop — eliminates N+1 DB writes.
- **SegmentsService [FIXED by code-review]**: Orphaned file cleanup — if DB insert fails after file write, `fs.unlink` is called.
- **Processor tests [FIXED by code-review]**: Real behavioral tests replacing placeholder — covers valid GPX, GPX without ele, malformed GPX, deleted segment, RDP simplification.

### Completion Notes

✅ Tasks 1–8 fully implemented and tested.
⚠️ Task 9 (manual integration tests) requires running app with DB + Redis + Fly.io volume to execute.

---

## File List

### New files
- `apps/api/src/adventures/adventures.repository.ts`
- `apps/api/src/adventures/adventures.service.ts`
- `apps/api/src/adventures/adventures.service.test.ts`
- `apps/api/src/adventures/dto/create-adventure.dto.ts`
- `apps/api/src/adventures/adventures.controller.ts`
- `apps/api/src/adventures/adventures.module.ts`
- `apps/api/src/segments/segments.repository.ts`
- `apps/api/src/segments/segments.service.ts`
- `apps/api/src/segments/segments.service.test.ts`
- `apps/api/src/segments/dto/create-segment.dto.ts`
- `apps/api/src/segments/segments.controller.ts`
- `apps/api/src/segments/segments.module.ts`
- `apps/api/src/segments/jobs/gpx-parse.processor.ts`
- `apps/api/src/segments/jobs/gpx-parse.processor.test.ts`
- `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx`
- `apps/web/src/app/(app)/adventures/_components/create-adventure-dialog.tsx`
- `apps/web/src/app/(app)/adventures/[id]/page.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/gpx-upload-form.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx`

### Modified files
- `apps/api/src/app.module.ts` — added AdventuresModule + SegmentsModule imports
- `apps/web/src/lib/api-client.ts` — added createAdventure, listAdventures, getAdventure, listSegments, createSegment
- `apps/web/src/app/(app)/adventures/page.tsx` — replaced stub with full implementation
- `apps/api/package.json` — added @types/multer devDependency

---

## Change Log

- 2026-03-15: Story 3.1 implemented — Adventures CRUD + Segments upload + GPX parse processor + Web pages (list + detail + upload). 20 new files, 4 modified files. All unit tests pass.
