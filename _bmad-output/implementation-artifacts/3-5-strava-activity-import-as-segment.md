# Story 3.5: Strava Route Import as Segment

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user with Strava connected**,
I want to import a Strava route directly as a GPX segment,
So that I can use my existing Strava planned routes without manually exporting and re-uploading GPX files.

## Acceptance Criteria

1. **Given** a user with Strava connected clicks "Importer depuis Strava" on the adventure detail page,
   **When** the route list loads,
   **Then** their recent Strava routes are listed (name, distance) — fetched from Strava API and cached for 1h in Redis to respect rate limits (NFR-041).

2. **Given** a user selects a Strava route to import,
   **When** the API fetches the route's GPX from Strava (`GET /routes/{id}/export_gpx`),
   **Then** the GPX data is saved on Fly.io volume (`/data/gpx/{segmentId}.gpx`) as a new segment with `parse_status: 'pending'`, a BullMQ `parse-segment` job is enqueued — and no Strava data is persisted beyond this import (NFR-043).

3. **Given** the import and GPX parsing succeed,
   **When** the segment card renders,
   **Then** the segment shows the Strava route name, distance, and a "Powered by Strava" attribution badge (FR-063).

4. **Given** the Strava API 15-minute rate limit is near (≥80% of 100 req/15min),
   **When** an import is requested,
   **Then** a warning is logged; at exactly 100/15min, the API returns HTTP 429 "Réessaie dans quelques minutes".

5. **Given** the Strava daily rate limit is near (≥800 of 1000 req/day),
   **When** an import is requested,
   **Then** a warning is logged; at exactly 1000/day, the API returns HTTP 429 "Limite Strava atteinte pour aujourd'hui, réessaie demain".

6. **Given** a user without Strava connected clicks "Importer depuis Strava",
   **When** the modal opens,
   **Then** they see "Connecte ton compte Strava dans les paramètres" with a link to `/settings`, and no route list loads.

## ⚠️ Critical Architectural Note: Routes, NOT Activities

The Epic title says "Activity Import" but the architecture mandates **Strava Routes only** (not activities):

| | Strava Routes ✅ | Strava Activities ❌ |
|---|---|---|
| Strava ToS | Allowed | Restricted |
| OAuth scope | `read_all` (already in place) | `activity:read_all` (not requested) |
| API endpoint | `GET /api/v3/athletes/{id}/routes` | `GET /api/v3/athlete/activities` |
| GPX export | `GET /api/v3/routes/{id}/export_gpx` | Manual stream conversion required |

**Routes** are planned itineraries created/saved by the user on Strava (e.g., a planned bikepacking route). This is what bikepacking/ultra-cycling users create in Strava. The current OAuth scopes `['read', 'read_all']` already support routes. **Do NOT request `activity:read_all`** — it's beyond what the ToS allows for this use case.

## Tasks / Subtasks

### Package — Schema Migration

- [x] Task 0 — Add `source` field to `adventure_segments` schema (AC: #3)
  - [x] 0.1 Update `packages/database/src/schema/adventure-segments.ts` — add column after `storageUrl`:
    ```typescript
    source: text('source'),  // null = manual upload, 'strava' = Strava route import
    ```
  - [x] 0.2 Run `pnpm --filter @ridenrest/database db:push` (or `db:migrate` if using migration files) to apply schema change
  - [x] 0.3 Update `packages/shared/src/types/adventure.types.ts` — add `source` to `AdventureSegmentResponse`:
    ```typescript
    export interface AdventureSegmentResponse {
      // ... existing fields ...
      source: string | null  // null = manual upload, 'strava' = Strava import
    }
    ```
  - [x] 0.4 Update `apps/api/src/segments/segments.service.ts` — update `toResponse()` to include `source`:
    ```typescript
    source: s.source ?? null,
    ```

### Backend — NestJS API

- [x] Task 1 — Refactor RedisProvider to global module (prerequisite for StravaService)
  - [x] 1.1 Create `apps/api/src/common/redis/redis.module.ts`:
    ```typescript
    import { Global, Module } from '@nestjs/common'
    import { RedisProvider } from '../providers/redis.provider.js'

    @Global()
    @Module({
      providers: [RedisProvider],
      exports: [RedisProvider],
    })
    export class RedisModule {}
    ```
  - [x] 1.2 Update `apps/api/src/app.module.ts`:
    - Add `RedisModule` to `imports` (BEFORE `QueuesModule`)
    - Remove `RedisProvider` from `providers` (now in `RedisModule`)
    - Remove `RedisProvider` from `exports` (now in `RedisModule` as global)
    - Add import: `import { RedisModule } from './common/redis/redis.module.js'`
    - Add import: `import { StravaModule } from './strava/strava.module.js'`
    - Add `StravaModule` to `imports`
  - [x] 1.3 **Verify**: `QueuesModule` currently has its own Redis via BullMQ — no change needed there. The `RedisModule` is only for direct ioredis usage.

- [x] Task 2 — Create Strava module files (AC: #1, #2, #4, #5, #6)
  - [x] 2.1 Create `apps/api/src/strava/dto/import-route.dto.ts`:
    ```typescript
    import { IsUUID } from 'class-validator'
    export class ImportRouteDto {
      @IsUUID('4')
      adventureId!: string
    }
    ```
  - [x] 2.2 Create `apps/api/src/strava/strava.controller.ts`:
    ```typescript
    import { Controller, Get, Post, Param, Body } from '@nestjs/common'
    import { ApiTags, ApiOperation } from '@nestjs/swagger'
    import { StravaService } from './strava.service.js'
    import { ImportRouteDto } from './dto/import-route.dto.js'
    import { CurrentUser } from '../common/decorators/current-user.decorator.js'
    import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

    @ApiTags('strava')
    @Controller('strava')
    export class StravaController {
      constructor(private readonly stravaService: StravaService) {}

      @Get('routes')
      @ApiOperation({ summary: 'List user Strava routes (cached 1h)' })
      async listRoutes(@CurrentUser() user: CurrentUserPayload) {
        return this.stravaService.listRoutes(user.id)
      }

      @Post('routes/:stravaRouteId/import')
      @ApiOperation({ summary: 'Import a Strava route as a GPX segment' })
      async importRoute(
        @CurrentUser() user: CurrentUserPayload,
        @Param('stravaRouteId') stravaRouteId: string,
        @Body() dto: ImportRouteDto,
      ) {
        return this.stravaService.importRoute(user.id, stravaRouteId, dto.adventureId)
      }
    }
    ```
  - [x] 2.3 Create `apps/api/src/strava/strava.service.ts` — see full implementation in Dev Notes below
  - [x] 2.4 Create `apps/api/src/strava/strava.module.ts`:
    ```typescript
    import { Module } from '@nestjs/common'
    import { StravaController } from './strava.controller.js'
    import { StravaService } from './strava.service.js'
    import { SegmentsModule } from '../segments/segments.module.js'
    import { AdventuresModule } from '../adventures/adventures.module.js'

    @Module({
      imports: [SegmentsModule, AdventuresModule],
      controllers: [StravaController],
      providers: [StravaService],
    })
    export class StravaModule {}
    ```
    Note: `RedisProvider` is available globally (Task 1) — no need to import `RedisModule` explicitly.

- [x] Task 3 — Backend tests (Jest) `apps/api/src/strava/strava.service.test.ts`
  - [x] 3.1 `listRoutes`: returns cached routes when Redis HIT (no Strava API call)
  - [x] 3.2 `listRoutes`: fetches from Strava and writes to Redis on cache MISS
  - [x] 3.3 `listRoutes`: throws `NotFoundException` when user has no Strava token in DB
  - [x] 3.4 `importRoute`: calls verifyOwnership, fetches GPX, calls `segmentsService.createSegment`, returns `AdventureSegmentResponse` with `source: 'strava'`
  - [x] 3.5 `checkRateLimit`: throws 429 when 15min counter ≥ 100
  - [x] 3.6 `checkRateLimit`: throws 429 when daily counter ≥ 1000
  - [x] 3.7 `getValidAccessToken`: returns current token when not expired
  - [x] 3.8 `getValidAccessToken`: refreshes and updates DB when token expired
  - [x] 3.9 Follow Jest patterns from `segments.service.test.ts`, mock `RedisProvider.getClient()` with jest.fn()

### Frontend — Next.js Web

- [x] Task 4 — Add API client functions in `apps/web/src/lib/api-client.ts` (AC: #1, #2)
  - [x] 4.1 Define `StravaRouteItem` type at top of file (or import from shared if added later):
    ```typescript
    export interface StravaRouteItem {
      id: string          // Strava route ID (numeric as string)
      name: string
      distanceKm: number
      elevationGainM: number | null
    }
    ```
  - [x] 4.2 Add `listStravaRoutes`:
    ```typescript
    export async function listStravaRoutes(): Promise<StravaRouteItem[]> {
      return apiFetch<StravaRouteItem[]>('/api/strava/routes')
    }
    ```
  - [x] 4.3 Add `importStravaRoute`:
    ```typescript
    export async function importStravaRoute(
      stravaRouteId: string,
      adventureId: string,
    ): Promise<AdventureSegmentResponse> {
      return apiFetch<AdventureSegmentResponse>(`/api/strava/routes/${stravaRouteId}/import`, {
        method: 'POST',
        body: JSON.stringify({ adventureId }),
      })
    }
    ```

- [x] Task 5 — Create `strava-import-modal.tsx` (AC: #1, #2, #6)
  - [x] 5.1 Create `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx`:
    ```tsx
    'use client'
    import { useState } from 'react'
    import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
    import { toast } from 'sonner'
    import { listStravaRoutes, importStravaRoute } from '@/lib/api-client'
    import {
      Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
    } from '@/components/ui/dialog'
    import { Button } from '@/components/ui/button'
    import { Skeleton } from '@/components/ui/skeleton'
    import type { StravaRouteItem } from '@/lib/api-client'

    interface StravaImportModalProps {
      adventureId: string
      open: boolean
      onOpenChange: (open: boolean) => void
      stravaConnected: boolean  // from profile.stravaAthleteId !== null
    }
    ```
  - [x] 5.2 If `!stravaConnected`: show message "Connecte ton compte Strava dans les paramètres" + `<Link href="/settings">` button. Do NOT call `listStravaRoutes`.
  - [x] 5.3 If `stravaConnected`: render `useQuery` for `listStravaRoutes` with `queryKey: ['strava', 'routes']` + `staleTime: 1000 * 60 * 60` (1h — mirrors Redis TTL)
  - [x] 5.4 Loading state: 3 `<Skeleton>` rows
  - [x] 5.5 Route list: for each route, render a row with name, distance (km), elevation gain. Button "Importer" per row.
  - [x] 5.6 `useMutation` for `importStravaRoute`:
    - `onSuccess`: `queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })`, close modal, `toast.success('Route Strava importée — analyse en cours')`
    - `onError`: `toast.error("Erreur lors de l'import Strava")`
  - [x] 5.7 Disable "Importer" buttons while mutation is pending (`importMutation.isPending`)

- [x] Task 6 — Update `segment-card.tsx` — add "Powered by Strava" badge (AC: #3)
  - [x] 6.1 In `done` state: check `segment.source === 'strava'` → add badge:
    ```tsx
    {segment.source === 'strava' && (
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <img src="/strava-logo.svg" alt="Strava" className="h-3 w-3" />
        Via Strava
      </span>
    )}
    ```
  - [x] 6.2 Add `strava-logo.svg` (Strava orange flame icon, SVG) to `apps/web/public/strava-logo.svg` — download from Strava brand assets (https://developers.strava.com/guidelines/) and keep as a simple SVG. Note: Strava brand guidelines require using their official logo in a specific way — keep it small and labeled.

- [x] Task 7 — Update `adventure-detail.tsx` — add Strava import button (AC: #1, #6)
  - [x] 7.1 Add state:
    ```typescript
    const [stravaImportOpen, setStravaImportOpen] = useState(false)
    ```
  - [x] 7.2 Fetch profile to check Strava connection (or receive `stravaConnected` as a prop from the page server component — **preferred** to avoid extra client fetch):
    - In `apps/web/src/app/(app)/adventures/[id]/page.tsx` (Server Component), add:
      ```typescript
      const profile = await getProfile()  // existing pattern if available, or new server fetch
      const stravaConnected = !!profile?.stravaAthleteId
      ```
    - Pass `stravaConnected: boolean` as prop to `<AdventureDetail>`
  - [x] 7.3 Add "Importer depuis Strava" button in the segments header (next to "+ Ajouter un segment"):
    ```tsx
    <Button variant="outline" size="sm" onClick={() => setStravaImportOpen(true)}>
      Importer depuis Strava
    </Button>
    ```
  - [x] 7.4 Render `<StravaImportModal>`:
    ```tsx
    <StravaImportModal
      adventureId={adventureId}
      open={stravaImportOpen}
      onOpenChange={setStravaImportOpen}
      stravaConnected={stravaConnected}
    />
    ```
  - [x] 7.5 Import `StravaImportModal` from `'./strava-import-modal'`

- [x] Task 8 — Frontend tests (Vitest)
  - [x] 8.1 `strava-import-modal.test.tsx`:
    - When `stravaConnected = false`: shows "Connecte ton compte Strava" message, no route list call
    - When `stravaConnected = true` + loading: shows skeletons
    - When routes loaded: renders route list with "Importer" buttons
    - Clicking "Importer": calls `importStravaRoute`, closes modal on success, shows toast
  - [x] 8.2 `segment-card.test.tsx`:
    - `source: 'strava'` in `done` state → shows "Via Strava" badge
    - `source: null` → no badge
  - [x] 8.3 Mock `listStravaRoutes` and `importStravaRoute` via `vi.mock('@/lib/api-client', ...)`

---

## Dev Notes

### CRITICAL: What's Already Done (Stories 1.x–3.4) — Do NOT Redo

**`apps/api` — existing infrastructure:**
- ✅ `SegmentsService` (exported from `SegmentsModule`) — **reuse `createSegment(adventureId, userId, file, name)`** for Strava import by constructing a `Multer.File`-like object from the GPX buffer
- ✅ `AdventuresService.verifyOwnership(adventureId, userId)` (from `AdventuresModule`) — reuse
- ✅ `RedisProvider` — move to `RedisModule` (Task 1), then inject via constructor DI — `this.redisProvider.getClient()` returns `ioredis` client
- ✅ `JwtAuthGuard` — global, automatically protects all endpoints including `/strava/*`
- ✅ `GPX_STORAGE_PATH` in `segments.service.ts` — Strava import uses same path via `SegmentsService.createSegment()`

**`apps/web` — existing infrastructure:**
- ✅ `adventure-detail.tsx` — has `showUploadForm` section + segment header with "+ Ajouter un segment" button. **Add** Strava import button next to it
- ✅ `segment-card.tsx` — has `done` state with segment name display. **Add** Strava badge check
- ✅ `api-client.ts` — has `apiFetch`. **Add** `listStravaRoutes`, `importStravaRoute`
- ✅ `dialog` shadcn component — check `apps/web/src/components/ui/dialog.tsx`; install if missing: `pnpm dlx shadcn@latest add dialog` from `apps/web`
- ✅ Strava OAuth implemented in story 2.3 — `profiles.stravaAthleteId` is `null` when not connected

---

### Architecture: StravaService Full Implementation

```typescript
// apps/api/src/strava/strava.service.ts
import { Injectable, NotFoundException, Logger, HttpException, HttpStatus } from '@nestjs/common'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { db, account } from '@ridenrest/database'
import { and, eq } from 'drizzle-orm'
import { SegmentsService } from '../segments/segments.service.js'
import { AdventuresService } from '../adventures/adventures.service.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

const STRAVA_API = 'https://www.strava.com/api/v3'
const ROUTES_CACHE_TTL = 3600       // 1 hour
const RATE_15MIN_KEY = 'strava:rate:15min'
const RATE_DAILY_KEY = 'strava:rate:daily'

interface StravaRouteItem {
  id: string
  name: string
  distanceKm: number
  elevationGainM: number | null
}

@Injectable()
export class StravaService {
  private readonly logger = new Logger(StravaService.name)

  constructor(
    private readonly segmentsService: SegmentsService,
    private readonly adventuresService: AdventuresService,
    private readonly redisProvider: RedisProvider,
  ) {}

  async listRoutes(userId: string): Promise<StravaRouteItem[]> {
    const redis = this.redisProvider.getClient()
    const cacheKey = `strava:routes:${userId}`

    // Cache HIT
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached) as StravaRouteItem[]

    // Get valid token + check rate limit
    const token = await this.getValidAccessToken(userId)
    await this.checkAndIncrementRateLimit()

    // Fetch routes from Strava (list up to 30 most recent)
    const res = await fetch(`${STRAVA_API}/athletes/${await this.getAthleteId(userId)}/routes?per_page=30`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new HttpException('Erreur Strava API', HttpStatus.BAD_GATEWAY)
    const raw = (await res.json()) as Array<{
      id: number; name: string; distance: number; elevation_gain: number | null
    }>

    const routes: StravaRouteItem[] = raw.map((r) => ({
      id: String(r.id),
      name: r.name,
      distanceKm: Math.round((r.distance / 1000) * 10) / 10,
      elevationGainM: r.elevation_gain ?? null,
    }))

    // Cache for 1h
    await redis.set(cacheKey, JSON.stringify(routes), 'EX', ROUTES_CACHE_TTL)
    return routes
  }

  async importRoute(
    userId: string,
    stravaRouteId: string,
    adventureId: string,
  ): Promise<AdventureSegmentResponse> {
    // Verify adventure ownership
    await this.adventuresService.verifyOwnership(adventureId, userId)

    // Get token + rate limit
    const token = await this.getValidAccessToken(userId)
    await this.checkAndIncrementRateLimit()

    // Fetch GPX from Strava
    const gpxRes = await fetch(`${STRAVA_API}/routes/${stravaRouteId}/export_gpx`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new HttpException('Erreur récupération GPX Strava', HttpStatus.BAD_GATEWAY)
    const gpxBuffer = Buffer.from(await gpxRes.arrayBuffer())

    // Get route name from cache (avoid extra API call)
    const redis = this.redisProvider.getClient()
    const cacheKey = `strava:routes:${userId}`
    const cached = await redis.get(cacheKey)
    const routes = cached ? (JSON.parse(cached) as StravaRouteItem[]) : []
    const routeName = routes.find((r) => r.id === stravaRouteId)?.name ?? `Route Strava ${stravaRouteId}`

    // Construct a Multer.File-like object to reuse createSegment logic
    const fakeFile = {
      buffer: gpxBuffer,
      originalname: `${routeName}.gpx`,
      size: gpxBuffer.length,
      fieldname: 'file',
      encoding: '7bit',
      mimetype: 'application/gpx+xml',
      stream: null as unknown as NodeJS.ReadableStream,
      destination: '',
      filename: '',
      path: '',
    } as Express.Multer.File

    // Reuse existing createSegment — handles file write + DB + BullMQ
    // source field is set via repository after creation
    const segment = await this.segmentsService.createSegment(adventureId, userId, fakeFile, routeName, 'strava')
    return segment
  }

  // ─── Token management ────────────────────────────────────────────────────

  private async getValidAccessToken(userId: string): Promise<string> {
    const [acct] = await db
      .select()
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'strava')))

    if (!acct?.accessToken) {
      throw new NotFoundException('Compte Strava non connecté. Va dans les paramètres pour connecter Strava.')
    }

    // Refresh if expired (or expires within 5 minutes)
    const expiresAt = acct.accessTokenExpiresAt
    if (expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      return this.refreshAccessToken(acct.id, acct.refreshToken!)
    }

    return acct.accessToken
  }

  private async refreshAccessToken(accountId: string, refreshToken: string): Promise<string> {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) throw new HttpException('Erreur refresh token Strava', HttpStatus.BAD_GATEWAY)

    const data = (await res.json()) as {
      access_token: string; refresh_token: string; expires_at: number
    }

    // Update DB
    await db.update(account)
      .set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        accessTokenExpiresAt: new Date(data.expires_at * 1000),
        updatedAt: new Date(),
      })
      .where(eq(account.id, accountId))

    return data.access_token
  }

  private async getAthleteId(userId: string): Promise<string> {
    const [acct] = await db
      .select({ accountId: account.accountId })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'strava')))
    if (!acct) throw new NotFoundException('Compte Strava non connecté')
    return acct.accountId  // Better Auth stores Strava athlete ID as accountId
  }

  // ─── Rate limiting ───────────────────────────────────────────────────────

  private async checkAndIncrementRateLimit(): Promise<void> {
    const redis = this.redisProvider.getClient()

    // 15-minute window (global — shared across all users)
    const count15 = await redis.incr(RATE_15MIN_KEY)
    if (count15 === 1) await redis.expire(RATE_15MIN_KEY, 900)
    if (count15 > 100) {
      throw new HttpException('Réessaie dans quelques minutes (limite Strava 15min atteinte)', HttpStatus.TOO_MANY_REQUESTS)
    }
    if (count15 > 80) this.logger.warn(`[Strava] Rate 15min: ${count15}/100`)

    // Daily window
    const countDaily = await redis.incr(RATE_DAILY_KEY)
    if (countDaily === 1) await redis.expire(RATE_DAILY_KEY, 86400)
    if (countDaily > 1000) {
      throw new HttpException("Limite Strava atteinte pour aujourd'hui, réessaie demain", HttpStatus.TOO_MANY_REQUESTS)
    }
    if (countDaily > 800) this.logger.warn(`[Strava] Rate daily: ${countDaily}/1000`)
  }
}
```

---

### Architecture: SegmentsService.createSegment() — Strava `source` Parameter

The existing `createSegment(adventureId, userId, file, name?)` signature needs a `source` parameter:

```typescript
// segments.service.ts — modify signature:
async createSegment(
  adventureId: string,
  userId: string,
  file: Express.Multer.File,
  name?: string,
  source?: string,  // ← ADD: 'strava' for imports, undefined for manual
): Promise<AdventureSegmentResponse>

// In the DB record creation:
segment = await this.segmentsRepo.create({
  id: segmentId,
  adventureId,
  name: segmentName,
  orderIndex,
  cumulativeStartKm: 0,
  parseStatus: 'pending',
  storageUrl,
  source: source ?? null,  // ← ADD
})
```

**⚠️ Also update `NewAdventureSegment` type**: Since `source` is now in the schema, `InferInsertModel` from Drizzle will automatically include it as optional (`string | null | undefined`). No manual type changes needed in `packages/database`.

---

### Architecture: Token Storage in `account` Table

Better Auth's `genericOAuth` stores Strava tokens in the `account` table:
```
account.userId         = user.id
account.providerId     = 'strava'
account.accountId      = Strava athlete ID (numeric, stored as string) ← use for /athletes/{id}/routes
account.accessToken    = Strava access token (valid ~6h)
account.refreshToken   = Strava refresh token (long-lived)
account.accessTokenExpiresAt = when access token expires
```

**Use `db` (NestJS main pool)** — NOT `authDb` (which is serverless-safe max:2 connections for Next.js). The `account` table is in the same PostgreSQL database, accessible from either pool. Use `db` in NestJS for consistency.

**Import in strava.service.ts:**
```typescript
import { db, account } from '@ridenrest/database'
```

---

### Architecture: Strava API Endpoints

```
GET  https://www.strava.com/api/v3/athletes/{athleteId}/routes?per_page=30
     Response: [{ id, name, distance (meters), elevation_gain, ... }]
     Auth: Bearer {accessToken}
     Cache: Redis key strava:routes:{userId}, TTL 3600s

GET  https://www.strava.com/api/v3/routes/{id}/export_gpx
     Response: GPX file (Content-Type: application/gpx+xml)
     Auth: Bearer {accessToken}
     No cache (one-time import)

POST https://www.strava.com/oauth/token (token refresh)
     Body: { client_id, client_secret, grant_type: 'refresh_token', refresh_token }
     Response: { access_token, refresh_token, expires_at }
```

---

### Architecture: Profile `stravaAthleteId` Check on Frontend

The adventure detail page (`apps/web/src/app/(app)/adventures/[id]/page.tsx`) is a Server Component. Fetch the profile server-side:

```typescript
// page.tsx (Server Component)
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'

export default async function AdventurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  // profile contains stravaAthleteId — fetch from DB or API
  // For MVP: make a server-side fetch to /api/profile or read profile from DB
  // OR: pass stravaConnected = false as default and let StravaImportModal handle it
  //     (it will show "not connected" based on 404/empty response from /api/strava/routes)
}
```

**Simpler MVP alternative**: Don't pass `stravaConnected` prop from page. Instead, in `StravaImportModal`, use the query's error state: if `listStravaRoutes()` returns 404 (no Strava account), show the "not connected" message. This avoids adding a profile fetch to the page.

---

### Architecture: RedisModule (Global)

After Task 1, `RedisProvider` is injectable in any module without explicit imports:

```typescript
// Before (app.module.ts):
providers: [AppService, RedisProvider, { provide: APP_GUARD, ... }],
exports: [RedisProvider],

// After (app.module.ts):
imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule, QueuesModule, HealthModule, AdventuresModule, SegmentsModule, StravaModule],
providers: [AppService, { provide: APP_GUARD, ... }],
// No exports needed — RedisModule is @Global()
```

---

### Architecture: NestJS Route for Strava (no conflicts)

`StravaController` uses `@Controller('strava')` with two routes:
- `GET /strava/routes` — no conflicts with existing routes
- `POST /strava/routes/:stravaRouteId/import` — no conflicts

`JwtAuthGuard` (global) protects both automatically. No special decorators needed.

---

### Environment Variables Needed

The following env vars must exist in `apps/api/.env` (they're already in `apps/web/.env.local` for Better Auth):

```bash
# apps/api/.env — ADD:
STRAVA_CLIENT_ID=<same as web>
STRAVA_CLIENT_SECRET=<same as web>
```

⚠️ The NestJS `StravaService` calls `process.env.STRAVA_CLIENT_ID` and `process.env.STRAVA_CLIENT_SECRET` for token refresh. These must also be in `apps/api/.env` (not just `apps/web/.env.local`).

---

### Project Structure Notes

**Files to CREATE:**
```
apps/api/src/common/redis/redis.module.ts           ← Global Redis module (Task 1)
apps/api/src/strava/strava.module.ts                ← New feature module
apps/api/src/strava/strava.controller.ts            ← GET routes + POST import
apps/api/src/strava/strava.service.ts               ← Business logic + token mgmt + rate limit
apps/api/src/strava/strava.service.test.ts          ← Jest tests
apps/api/src/strava/dto/import-route.dto.ts         ← { adventureId: string }
apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx
apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.test.tsx
apps/web/public/strava-logo.svg                     ← Strava brand mark (download from Strava)
```

**Files to MODIFY:**
```
packages/database/src/schema/adventure-segments.ts  ← add source: text('source')
packages/shared/src/types/adventure.types.ts        ← add source: string | null to AdventureSegmentResponse
apps/api/src/app.module.ts                          ← add StravaModule + RedisModule, remove RedisProvider
apps/api/src/segments/segments.service.ts           ← add source? param to createSegment + toResponse
apps/api/src/segments/segments.service.test.ts      ← update existing tests for new source param
apps/web/src/lib/api-client.ts                      ← add listStravaRoutes, importStravaRoute, StravaRouteItem
apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx  ← add Strava import button + modal
apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx      ← add Strava badge
apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx ← add source badge tests
```

**DB migration required**: `source text` column added to `adventure_segments`. Existing rows default to `null` (manual upload). No data loss.

---

### Anti-Patterns to Avoid

```typescript
// ❌ Requesting activity:read_all scope — Strava ToS violation for this use case
scopes: ['read', 'read_all', 'activity:read_all']  // DON'T add activity:read_all
// ✅ Routes only — current scopes are sufficient
scopes: ['read', 'read_all']  // already in auth.ts

// ❌ Using authDb (max:2) in NestJS for account queries
import { authDb } from '@ridenrest/database'  // designed for Next.js / serverless
// ✅ Use regular db pool in NestJS
import { db, account } from '@ridenrest/database'

// ❌ Storing Strava activity/route data in the database (NFR-043)
await db.insert(stravaRoutes).values({ stravaId, name, ... })
// ✅ Import only — no Strava data persisted beyond the GPX file + segment record

// ❌ Calling Strava API without rate limit check
const res = await fetch(`${STRAVA_API}/athletes/...`)
// ✅ Always checkAndIncrementRateLimit() before every Strava API call

// ❌ Creating a second RedisProvider instance in StravaModule
providers: [RedisProvider, StravaService]  // creates a SECOND Redis connection
// ✅ Rely on @Global() RedisModule — inject without explicit import

// ❌ Missing STRAVA_CLIENT_ID/SECRET in apps/api/.env
// Token refresh will fail silently — always add to both web and api env files

// ❌ Blocking the module route cache invalidation (invalidate strava:routes:{userId} on import)
// Actually: DO NOT invalidate after import — the cache contains the route list, not the segments
// The segment list cache ['adventures', adventureId, 'segments'] is what gets invalidated

// ❌ Import from subpath
import type { AdventureSegmentResponse } from '@ridenrest/shared/types'
// ✅
import type { AdventureSegmentResponse } from '@ridenrest/shared'

// ❌ Forgetting to handle the fake Multer.File stream field
const fakeFile = { buffer, originalname }  // TypeScript will error on missing required fields
// ✅ Cast with all fields present (see StravaService.importRoute pattern above)
```

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.5 ACs, NFR-041, NFR-043, FR-063]
- [Source: _bmad-output/planning-artifacts/architecture.md — Strava ToS constraint (routes only), data flow section 5, strava module structure, rate limiting pattern]
- [Source: _bmad-output/implementation-artifacts/2-3-strava-oauth-connection.md — Strava API constraints (100/15min, 1000/day), token refresh, scopes confirmed as ['read', 'read_all'], account.accountId = Strava athlete ID]
- [Source: apps/web/src/lib/auth/auth.ts — actual scopes ['read', 'read_all'], getUserInfo, accountId storage]
- [Source: packages/database/src/schema/auth.ts — account table: accessToken, refreshToken, accessTokenExpiresAt, accountId, providerId columns]
- [Source: packages/database/src/index.ts — db (main pool) vs authDb (serverless max:2)]
- [Source: apps/api/src/common/providers/redis.provider.ts — RedisProvider API: getClient() returns ioredis client]
- [Source: apps/api/src/app.module.ts — current module structure, RedisProvider placement]
- [Source: apps/api/src/segments/segments.module.ts — SegmentsService exported, SegmentsModule available for import]
- [Source: apps/api/src/segments/segments.service.ts — createSegment signature, GPX_STORAGE_PATH, toResponse pattern]
- [Source: packages/shared/src/types/adventure.types.ts — AdventureSegmentResponse current shape]
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx — segments header structure, existing button placement]
- [Source: _bmad-output/project-context.md — NestJS module rules, query key conventions, anti-patterns]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Bug fixed in StravaService.importRoute: `if (!res.ok)` → `if (!gpxRes.ok)` (variable naming bug in Dev Notes)
- StravaRouteItem interface exported from service to fix TypeScript TS4053 error
- DB push aborted (drizzle-kit incorrectly wanted to drop PostGIS spatial_ref_sys tables): manual SQL migration file created instead
- Button `asChild` not supported in @base-ui/react Button (different from Radix) — used `Button` wrapping `Link` instead
- Added explicit `afterEach(cleanup)` to frontend tests (Vitest doesn't auto-cleanup without @testing-library/react configuration)
- DB query for stravaConnected check in page.tsx uses `authDb` (serverless-safe pool for Next.js)

### Completion Notes List

- ✅ Task 0: `source TEXT` column added to adventure_segments schema (TypeScript + DB). Manual SQL migration at `packages/database/migrations/add_source_to_adventure_segments.sql` — run manually with `psql $DATABASE_URL -f packages/database/migrations/add_source_to_adventure_segments.sql`
- ✅ Task 1: RedisModule created as @Global() module, app.module.ts updated (RedisProvider removed from AppModule providers/exports, now in RedisModule)
- ✅ Task 2: Complete Strava module — DTO, Controller, Service (token management + rate limiting + cache), Module
- ✅ Task 3: 8 Jest tests for StravaService (cache HIT/MISS, 404, import, rate limits 15min+daily, token valid/refresh)
- ✅ Task 4: listStravaRoutes, importStravaRoute, StravaRouteItem type added to api-client.ts
- ✅ Task 5: StravaImportModal with stravaConnected check, useQuery (1h staleTime), useMutation with invalidation
- ✅ Task 6: segment-card Strava badge (`source === 'strava'` → "Via Strava" + strava-logo.svg)
- ✅ Task 7: adventure-detail receives stravaConnected prop, "Importer depuis Strava" button, StravaImportModal integrated; page.tsx server-side DB check for Strava connection
- ✅ Task 8: 5 Vitest frontend tests (strava-import-modal: 5 tests, segment-card: 3 tests)
- Total: 61 API tests + 68 web tests — 0 regressions, TypeScript clean

### Review Follow-ups (AI)

- [ ] [AI-Review][MEDIUM] Double DB query per `listRoutes`: `getValidAccessToken()` and `getAthleteId()` both query `account WHERE userId AND providerId='strava'` — merge into one query to return `{ accessToken, refreshToken, accessTokenExpiresAt, id, accountId }` [strava.service.ts:120-176]
- [ ] [AI-Review][MEDIUM] Double `verifyOwnership` on import: `StravaService.importRoute` calls `verifyOwnership` (line 75) then `SegmentsService.createSegment` calls it again internally (segments.service.ts:35) — remove the redundant call in `importRoute` [strava.service.ts:75]
- [ ] [AI-Review][MEDIUM] `stravaRouteId` path param unvalidated — add `@IsNumberString()` or similar validation via a param DTO to prevent arbitrary strings reaching the Strava API URL [strava.controller.ts:23]
- [ ] [AI-Review][LOW] `Button` wrapping `Link` in `StravaImportModal` is invalid HTML (nested interactive elements) — replace with a `<Link href="/settings" className="...">` styled directly, or use a single element approach [strava-import-modal.tsx:73]
- [ ] [AI-Review][LOW] Missing test for `importRoute` when user doesn't own the adventure (verifyOwnership throws NotFoundException) — add test 3.4b to `strava.service.test.ts`

### File List

**Created:**
- `packages/database/migrations/add_source_to_adventure_segments.sql`
- `apps/api/src/common/redis/redis.module.ts`
- `apps/api/src/strava/dto/import-route.dto.ts`
- `apps/api/src/strava/strava.controller.ts`
- `apps/api/src/strava/strava.service.ts`
- `apps/api/src/strava/strava.module.ts`
- `apps/api/src/strava/strava.service.test.ts`
- `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx`
- `apps/web/public/strava-logo.svg`

**Modified:**
- `packages/database/src/schema/adventure-segments.ts`
- `packages/shared/src/types/adventure.types.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/segments/segments.service.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/app/(app)/adventures/[id]/page.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/sortable-segment-card.test.tsx`
