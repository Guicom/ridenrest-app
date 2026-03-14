# Story 1.2: Database Schema & Aiven Configuration

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want Drizzle ORM schemas defined in packages/database and migrations applied to Aiven PostgreSQL,
So that the database schema is the single source of truth shared across both apps.

## Acceptance Criteria

1. **Given** `packages/database` is set up with Drizzle schemas (including Better Auth tables),
   **When** `pnpm db:migrate` runs,
   **Then** tables `profiles`, `adventures`, `adventure_segments`, `accommodations_cache`, `weather_cache`, `coverage_gaps` (+ Better Auth tables `user`, `session`, `account`, `verification`) are created in Aiven without errors.

2. **Given** PostGIS is enabled in Aiven PostgreSQL,
   **When** `adventure_segments` is created,
   **Then** the `geom` column accepts LINESTRING geometries (ST_Buffer, ST_DWithin queries pass).

3. **Given** `packages/database` exports inferred types,
   **When** `apps/api` imports `Adventure` from `@ridenrest/database`,
   **Then** TypeScript compiles without `any` types — all column types are correctly inferred.

4. **Given** Upstash Redis credentials are configured in `apps/api/.env`,
   **When** the Redis provider starts,
   **Then** a test ping returns PONG without errors.

## Tasks / Subtasks

- [x] Task 1 — Enable PostGIS on Aiven & configure DATABASE_URL (AC: #1, #2)
  - [x] 1.1 In Aiven console: Databases → your PostgreSQL service → Extensions → enable `postgis`
  - [x] 1.2 Copy Aiven connection string (`postgres://...`) into `apps/api/.env` as `DATABASE_URL`
  - [x] 1.3 Copy Upstash Redis connection string (`rediss://...`) into `apps/api/.env` as `REDIS_URL`
  - [x] 1.4 Verify PostGIS enabled: `psql $DATABASE_URL -c "SELECT PostGIS_Version();"` → returns version string

- [x] Task 2 — Install Drizzle ORM dependencies (AC: #1, #3)
  - [x] 2.1 In `packages/database`: `pnpm add drizzle-orm pg && pnpm add -D drizzle-kit @types/pg`
  - [x] 2.2 In `apps/api`: `pnpm add drizzle-orm pg && pnpm add -D @types/pg` (runtime dep for pool)
  - [x] 2.3 Add `db:generate` and `db:migrate` scripts to root `package.json` (see Dev Notes)

- [x] Task 3 — Define Better Auth tables schema (AC: #1)
  - [x] 3.1 Create `packages/database/src/schema/auth.ts` with Better Auth required tables: `user`, `session`, `account`, `verification` (exact schema in Dev Notes)
  - [x] 3.2 Do NOT use `better-auth generate` — define tables manually to control naming and have Drizzle inferred types

- [x] Task 4 — Define custom business tables schemas (AC: #1, #2, #3)
  - [x] 4.1 Create `packages/database/src/schema/profiles.ts` — extends auth user (see Dev Notes)
  - [x] 4.2 Create `packages/database/src/schema/adventures.ts`
  - [x] 4.3 Create `packages/database/src/schema/adventure-segments.ts` — includes PostGIS `geom` column via `customType`
  - [x] 4.4 Create `packages/database/src/schema/accommodations-cache.ts`
  - [x] 4.5 Create `packages/database/src/schema/weather-cache.ts`
  - [x] 4.6 Create `packages/database/src/schema/coverage-gaps.ts`

- [x] Task 5 — Configure drizzle.config.ts and db connection (AC: #1)
  - [x] 5.1 Implement `packages/database/drizzle.config.ts` (see Dev Notes)
  - [x] 5.2 Implement `packages/database/src/db.ts` — creates and exports `db` instance (Pool + drizzle)
  - [x] 5.3 Update `packages/database/src/index.ts` to export all schemas, types, and `db`

- [x] Task 6 — Wire database into apps/api (AC: #3, #4)
  - [x] 6.1 Implement `apps/api/src/config/database.config.ts` with mandatory pool config (max: 10, timeouts)
  - [x] 6.2 Create `apps/api/src/common/providers/database.provider.ts` — NestJS provider wrapping `db` from `@ridenrest/database`
  - [x] 6.3 Implement `apps/api/src/common/providers/redis.provider.ts` — ioredis client pinging on module init
  - [x] 6.4 Register both providers in `AppModule`

- [x] Task 7 — Run migrations and validate (AC: #1, #2, #3, #4)
  - [x] 7.1 Run `pnpm db:generate` — drizzle-kit generates SQL migration files
  - [x] 7.2 Run `pnpm db:migrate` — applies migration to Aiven PostgreSQL
  - [x] 7.3 Verify in Aiven console (or psql) that all 10 tables exist
  - [x] 7.4 Verify PostGIS: `geom geometry(LINESTRING, 4326)` column confirmed in generated SQL migration
  - [x] 7.5 Start apps/api and verify Redis ping log: `[RedisProvider] Redis connected - PONG`
  - [x] 7.6 Run `turbo run build --filter='*'` — zero TypeScript errors

### Review Follow-ups (AI) — 2026-03-14

- [x] [AI-Review][HIGH] Ajouter un index sur `adventures.user_id` — la requête principale ("liste des aventures du user") fait un full table scan sans index FK [packages/database/src/schema/adventures.ts]
- [x] [AI-Review][HIGH] Ajouter `.$onUpdateFn(() => new Date())` sur tous les champs `updatedAt` dans les schemas Drizzle — `.defaultNow()` ne s'applique qu'à l'INSERT, `updated_at` reste figé après chaque UPDATE [packages/database/src/schema/*.ts]
- [x] [AI-Review][MEDIUM] Conditionner SSL via `DATABASE_CA_CERT` env var — si défini: `rejectUnauthorized: true + CA cert`; sinon fallback `false` avec commentaire de dette technique [packages/database/src/db.ts]
- [x] [AI-Review][MEDIUM] Ajouter une contrainte UNIQUE sur `(segment_id, external_id, source)` dans `accommodations_cache` — sans cela, chaque refresh du cache crée des doublons [packages/database/src/schema/accommodations-cache.ts]
- [x] [AI-Review][MEDIUM] Ajouter une contrainte UNIQUE sur `(segment_id, waypoint_km, forecast_at)` dans `weather_cache` — même problème de doublons sur les prévisions météo [packages/database/src/schema/weather-cache.ts]
- [x] [AI-Review][MEDIUM] Remplacer l'index `segment_id` seul par un index composite `(segment_id, expires_at)` dans `accommodations_cache` — requête `WHERE segment_id = $1 AND expires_at > NOW()` non-optimale avec index séparés [packages/database/src/schema/accommodations-cache.ts]
- [x] [AI-Review][MEDIUM] Ajouter une garde dans `RedisProvider.getClient()` pour éviter un retour undefined si appelé avant `onModuleInit` [apps/api/src/common/providers/redis.provider.ts]
- [x] [AI-Review][LOW] Documenter `NODE_TLS_REJECT_UNAUTHORIZED=0` comme dette technique connue via commentaire dans `db.ts` [packages/database/src/db.ts]
- [x] [AI-Review][LOW] Ajouter un commentaire expliquant pourquoi `database.config.ts` ne contient pas de configuration Pool [apps/api/src/config/database.config.ts]
- [x] [AI-Review][LOW] Remplacer l'appel manuel `provider.onModuleInit()` par `await moduleRef.init()` dans le test Redis [apps/api/src/common/providers/redis.provider.test.ts]
- [ ] [AI-Review][ACTION REQUIRED] Lancer `pnpm db:generate` puis `pnpm db:migrate` — les changements de schemas (index `user_id`, unique constraints, index composite) nécessitent une nouvelle migration

## Dev Notes

### Story 1.1 Learnings (CRITICAL — apply to this story)

- **NestJS uses `nodenext` module** — imports in `apps/api` must use `.js` extension in relative imports (e.g., `import { db } from './db.js'`), or configure `moduleResolution` correctly
- **`turbo run --filter='*'`** — always use this flag, not bare `turbo run`, for Turborepo v2
- **`typescript` must be in root devDeps** — hoisted by pnpm, don't add per-package
- **`class-validator` + `class-transformer` already installed** in `apps/api` — don't reinstall
- **`packages/database/src/index.ts` is currently empty** — this story fills it completely
- **`packages/database/drizzle.config.ts` is a stub** — this story implements it

### PostGIS on Aiven — Setup Steps

Aiven PostgreSQL free tier (5GB) supports PostGIS. Steps:

1. Go to [console.aiven.io](https://console.aiven.io) → your PostgreSQL service
2. Navigate to **Databases** tab → **Extensions**
3. Enable `postgis` (and optionally `postgis_topology`)
4. Verify: `psql $DATABASE_URL -c "SELECT PostGIS_Version();"` → returns `"3.x.x ..."`

> ⚠️ PostGIS must be enabled BEFORE running `db:migrate` — the `geom` column type depends on it.

### Better Auth Tables — Manual Drizzle Schema

Define these exactly — Better Auth's Drizzle adapter uses them via `db` passed to `betterAuth({ database: { db, type: 'postgres' } })`.

**`packages/database/src/schema/auth.ts`:**
```typescript
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
```

> ⚠️ Better Auth table names are lowercase singular (`user`, `session`, `account`, `verification`) — do NOT pluralize. Better Auth's adapter expects these exact names.

### Business Tables — Complete Schemas

**`packages/database/src/schema/profiles.ts`:**
```typescript
import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { user } from './auth.js'

export const tierEnum = pgEnum('tier', ['free', 'pro', 'team'])
export const unitPrefEnum = pgEnum('unit_pref', ['km', 'mi'])
export const currencyEnum = pgEnum('currency', ['EUR', 'USD', 'GBP'])

export const profiles = pgTable('profiles', {
  id: text('id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  tier: tierEnum('tier').notNull().default('free'),
  unitPref: unitPrefEnum('unit_pref').notNull().default('km'),
  currency: currencyEnum('currency').notNull().default('EUR'),
  stravaAthleteId: text('strava_athlete_id').unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

**`packages/database/src/schema/adventures.ts`:**
```typescript
import { pgTable, text, timestamp, real, pgEnum } from 'drizzle-orm/pg-core'
import { user } from './auth.js'

export const adventureStatusEnum = pgEnum('adventure_status', ['planning', 'active', 'completed'])

export const adventures = pgTable('adventures', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  totalDistanceKm: real('total_distance_km').notNull().default(0),
  status: adventureStatusEnum('status').notNull().default('planning'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

**`packages/database/src/schema/adventure-segments.ts`:**
```typescript
import { pgTable, text, timestamp, real, integer, jsonb, pgEnum, customType, index } from 'drizzle-orm/pg-core'
import { adventures } from './adventures.js'

export const parseStatusEnum = pgEnum('parse_status', ['pending', 'processing', 'done', 'error'])

// PostGIS LINESTRING — Drizzle doesn't support PostGIS natively; use customType
const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(LINESTRING, 4326)'
  },
})

export const adventureSegments = pgTable('adventure_segments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  adventureId: text('adventure_id').notNull().references(() => adventures.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull(),
  cumulativeStartKm: real('cumulative_start_km').notNull().default(0),
  distanceKm: real('distance_km').notNull().default(0),
  elevationGainM: real('elevation_gain_m'),
  storageUrl: text('storage_url'), // Path on Fly.io volume: /data/gpx/{segmentId}.gpx
  parseStatus: parseStatusEnum('parse_status').notNull().default('pending'),
  geom: geometry('geom'), // PostGIS LINESTRING — null until parsing complete
  waypoints: jsonb('waypoints'), // Precomputed km waypoints [{km, lat, lng, elevM}]
  boundingBox: jsonb('bounding_box'), // {minLat, maxLat, minLng, maxLng}
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  adventureIdIdx: index('idx_adventure_segments_adventure_id').on(table.adventureId),
  orderIdx: index('idx_adventure_segments_order').on(table.adventureId, table.orderIndex),
}))
```

**`packages/database/src/schema/accommodations-cache.ts`:**
```typescript
import { pgTable, text, timestamp, real, jsonb, index } from 'drizzle-orm/pg-core'
import { adventureSegments } from './adventure-segments.js'

export const accommodationsCache = pgTable('accommodations_cache', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  segmentId: text('segment_id').notNull().references(() => adventureSegments.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(), // OSM ID or provider ID
  source: text('source').notNull(), // 'overpass'
  category: text('category').notNull(), // 'hotel' | 'hostel' | 'camp_site' | 'shelter'
  name: text('name').notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  distFromTraceM: real('dist_from_trace_m').notNull(),
  distAlongRouteKm: real('dist_along_route_km').notNull(),
  rawData: jsonb('raw_data'), // Full OSM/provider response
  cachedAt: timestamp('cached_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(), // cachedAt + 24h
}, (table) => ({
  segmentIdIdx: index('idx_accommodations_cache_segment_id').on(table.segmentId),
  expiresAtIdx: index('idx_accommodations_cache_expires_at').on(table.expiresAt),
}))
```

**`packages/database/src/schema/weather-cache.ts`:**
```typescript
import { pgTable, text, timestamp, real, jsonb, index } from 'drizzle-orm/pg-core'
import { adventureSegments } from './adventure-segments.js'

export const weatherCache = pgTable('weather_cache', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  segmentId: text('segment_id').notNull().references(() => adventureSegments.id, { onDelete: 'cascade' }),
  waypointKm: real('waypoint_km').notNull(), // km mark on the route
  forecastAt: timestamp('forecast_at').notNull(), // Estimated passage time
  temperatureC: real('temperature_c'),
  precipitationMm: real('precipitation_mm'),
  windSpeedKmh: real('wind_speed_kmh'),
  windDirection: real('wind_direction'),
  weatherCode: text('weather_code'), // WeatherAPI.com code
  rawData: jsonb('raw_data'),
  cachedAt: timestamp('cached_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(), // cachedAt + 1h
}, (table) => ({
  segmentKmIdx: index('idx_weather_cache_segment_km').on(table.segmentId, table.waypointKm),
}))
```

**`packages/database/src/schema/coverage-gaps.ts`:**
```typescript
import { pgTable, text, timestamp, real, pgEnum, index } from 'drizzle-orm/pg-core'
import { adventureSegments } from './adventure-segments.js'

export const gapSeverityEnum = pgEnum('gap_severity', ['low', 'medium', 'critical'])

export const coverageGaps = pgTable('coverage_gaps', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  segmentId: text('segment_id').notNull().references(() => adventureSegments.id, { onDelete: 'cascade' }),
  fromKm: real('from_km').notNull(),
  toKm: real('to_km').notNull(),
  gapLengthKm: real('gap_length_km').notNull(),
  severity: gapSeverityEnum('severity').notNull(), // low <15km, medium 15-30km, critical >30km
  analyzedAt: timestamp('analyzed_at').notNull().defaultNow(),
}, (table) => ({
  segmentIdIdx: index('idx_coverage_gaps_segment_id').on(table.segmentId),
}))
```

### packages/database/src/index.ts — Full Export

```typescript
// Auth tables (Better Auth)
export * from './schema/auth.js'

// Enums
export { tierEnum, unitPrefEnum, currencyEnum } from './schema/profiles.js'
export { adventureStatusEnum } from './schema/adventures.js'
export { parseStatusEnum } from './schema/adventure-segments.js'
export { gapSeverityEnum } from './schema/coverage-gaps.js'

// Tables
export { profiles } from './schema/profiles.js'
export { adventures } from './schema/adventures.js'
export { adventureSegments } from './schema/adventure-segments.js'
export { accommodationsCache } from './schema/accommodations-cache.js'
export { weatherCache } from './schema/weather-cache.js'
export { coverageGaps } from './schema/coverage-gaps.js'

// Database instance
export { db } from './db.js'

// Inferred types (use these throughout apps — never redefine)
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type { adventures } from './schema/adventures.js'
import type { adventureSegments } from './schema/adventure-segments.js'
import type { profiles } from './schema/profiles.js'
import type { accommodationsCache } from './schema/accommodations-cache.js'
import type { weatherCache } from './schema/weather-cache.js'
import type { coverageGaps } from './schema/coverage-gaps.js'

export type Adventure = InferSelectModel<typeof adventures>
export type NewAdventure = InferInsertModel<typeof adventures>
export type AdventureSegment = InferSelectModel<typeof adventureSegments>
export type NewAdventureSegment = InferInsertModel<typeof adventureSegments>
export type Profile = InferSelectModel<typeof profiles>
export type AccommodationCache = InferSelectModel<typeof accommodationsCache>
export type WeatherCache = InferSelectModel<typeof weatherCache>
export type CoverageGap = InferSelectModel<typeof coverageGaps>
```

### packages/database/src/db.ts

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as authSchema from './schema/auth.js'
import * as profilesSchema from './schema/profiles.js'
import * as adventuresSchema from './schema/adventures.js'
import * as adventureSegmentsSchema from './schema/adventure-segments.js'
import * as accommodationsCacheSchema from './schema/accommodations-cache.js'
import * as weatherCacheSchema from './schema/weather-cache.js'
import * as coverageGapsSchema from './schema/coverage-gaps.js'

// Pool is created once at module level — shared across the process
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                       // Aiven free tier max ~25 total — NestJS gets 10
  idleTimeoutMillis: 30000,      // Release idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if DB unreachable
})

export const db = drizzle(pool, {
  schema: {
    ...authSchema,
    ...profilesSchema,
    ...adventuresSchema,
    ...adventureSegmentsSchema,
    ...accommodationsCacheSchema,
    ...weatherCacheSchema,
    ...coverageGapsSchema,
  },
})
```

### packages/database/drizzle.config.ts — Implementation

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/schema/*.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config
```

### Migration Scripts — Root package.json

Add these scripts to root `package.json`:

```json
{
  "scripts": {
    "db:generate": "dotenv -e apps/api/.env -- drizzle-kit generate --config=packages/database/drizzle.config.ts",
    "db:migrate": "dotenv -e apps/api/.env -- drizzle-kit migrate --config=packages/database/drizzle.config.ts",
    "db:studio": "dotenv -e apps/api/.env -- drizzle-kit studio --config=packages/database/drizzle.config.ts"
  }
}
```

Install `dotenv-cli` at root: `pnpm add -D -w dotenv-cli`

> Alternatively, set `DATABASE_URL` in your shell before running migrate:
> ```bash
> export DATABASE_URL="postgres://..." && pnpm db:migrate
> ```

### apps/api/src/config/database.config.ts — Implementation

```typescript
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

// Re-export db from shared package — NestJS modules import from here
export { db } from '@ridenrest/database'

// Export pool separately for health checks
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})
```

> **Note:** `apps/api` uses the `db` instance exported from `@ridenrest/database`. The pool config in both files MUST match — `max: 10` is mandatory. NEVER increase `max` without updating the Aiven connection budget.

### apps/api/src/common/providers/redis.provider.ts — Implementation

```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisProvider.name)
  private client: Redis

  async onModuleInit(): Promise<void> {
    this.client = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    })

    const pong = await this.client.ping()
    this.logger.log(`Redis connected - ${pong}`) // Should log "Redis connected - PONG"
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit()
  }

  getClient(): Redis {
    return this.client
  }
}
```

Install ioredis in apps/api: `pnpm add ioredis` (from `apps/api` directory)

### AppModule — Register Providers

```typescript
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { RedisProvider } from './common/providers/redis.provider.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  controllers: [AppController],
  providers: [AppService, RedisProvider],
  exports: [RedisProvider],
})
export class AppModule {}
```

### Aiven Connection String Format

Aiven provides a URI in this format:
```
postgres://{user}:{password}@{host}:{port}/{database}?sslmode=require
```

> ⚠️ **SSL is required on Aiven** — the `?sslmode=require` parameter must be present. `pg` Pool handles this automatically when the URL contains it.

### Upstash Redis Connection String Format

Upstash provides a `rediss://` (TLS) URL:
```
rediss://:{password}@{host}:{port}
```

> ioredis handles `rediss://` (TLS) automatically. Do NOT use `redis://` (non-TLS) with Upstash.

### CRITICAL: PostGIS geom Column Notes

- The `customType` approach for `geom` means drizzle-kit generates the column as `geometry(LINESTRING, 4326)` — **PostGIS must be enabled BEFORE migration**
- Raw PostGIS queries (ST_Buffer, ST_DWithin) must be written using `sql` tagged template from drizzle-orm:
  ```typescript
  import { sql } from 'drizzle-orm'
  // Example in repository:
  await db.execute(sql`
    SELECT * FROM adventure_segments
    WHERE ST_DWithin(geom::geography, ST_GeomFromText(${linestring}, 4326)::geography, ${radiusM})
  `)
  ```
- Drizzle does NOT have PostGIS query builder helpers — raw SQL required for spatial queries
- The `geom` column returns a WKB (Well-Known Binary) string from the DB — parse with a PostGIS library if needed

### packages/database/src/schema/ File Structure

```
packages/database/src/
├── schema/
│   ├── auth.ts                  ← Better Auth tables (user, session, account, verification)
│   ├── profiles.ts              ← profiles table + tier/unitPref enums
│   ├── adventures.ts            ← adventures table + status enum
│   ├── adventure-segments.ts    ← adventure_segments + parseStatus enum + geom customType
│   ├── accommodations-cache.ts  ← accommodations_cache
│   ├── weather-cache.ts         ← weather_cache
│   └── coverage-gaps.ts        ← coverage_gaps + severity enum
├── db.ts                        ← Pool + drizzle instance
└── index.ts                     ← All exports + inferred types
```

### Scope Boundaries — What NOT to Implement in This Story

- ❌ NO Better Auth server config (Story 2.1 — needs `auth.ts` in `apps/web/lib/auth/`)
- ❌ NO JWT validation or Guards (Story 2.1)
- ❌ NO BullMQ setup (Story 1.4)
- ❌ NO Swagger (Story 1.4)
- ❌ NO Drizzle queries in feature modules (no feature modules exist yet)
- ❌ NO GPX parsing logic (Story 1.3)
- ❌ NO Zod schemas (Story 1.3)

### Project Structure Notes

- All Drizzle queries in future feature modules go into `{feature}.repository.ts` — NEVER in services
- Import types from `@ridenrest/database` — NEVER redefine `Adventure`, `AdventureSegment`, etc. locally
- The `db` instance exported from `@ridenrest/database` is the single DB connection — NestJS injects it via `RedisProvider` pattern or imports directly

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.2 AC]
- [Source: _bmad-output/planning-artifacts/architecture.md — packages/database structure]
- [Source: _bmad-output/planning-artifacts/architecture.md — DB pool config (Aiven constraint)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Environment variables]
- [Source: _bmad-output/project-context.md — Drizzle Pool Configuration (Aiven Free Tier Constraint)]
- [Source: _bmad-output/project-context.md — Naming Conventions (DB tables snake_case)]
- [Source: _bmad-output/project-context.md — Key Tables (adventures, adventure_segments, profiles, accommodations_cache)]
- [Source: _bmad-output/project-context.md — NestJS Architecture Rules]
- [Source: _bmad-output/implementation-artifacts/1-1-monorepo-setup-developer-environment.md — Debug Log (nodenext module, turbo filter)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `packages/database` uses `moduleResolution: "bundler"` — NO `.js` extensions in relative imports (drizzle-kit esbuild can't resolve them). Only `apps/api` (nodenext) uses `.js` extensions.
- Aiven SSL: `pg` >= 8.x treats `sslmode=require` as `verify-full` → needs `ssl: { rejectUnauthorized: false }` in pool config + `NODE_TLS_REJECT_UNAUTHORIZED=0` in db:migrate script.
- `drizzle-kit` must be installed at root (`-w`) for `pnpm db:*` scripts to find the binary.
- Scripts use `sh -c 'cd packages/database && ...'` pattern to resolve schema globs relative to package root.
- Jest `moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" }` needed in `apps/api` to handle nodenext `.js` imports in tests.
- Task 6.2 (`database.provider.ts`): `db` is exported directly from `@ridenrest/database` and re-exported via `database.config.ts` — no dedicated NestJS DI provider needed; future feature modules import `db` directly from the package.

### Completion Notes List

- All 7 tasks complete. 10 tables migrated to Aiven PostgreSQL: `user`, `session`, `account`, `verification`, `profiles`, `adventures`, `adventure_segments`, `accommodations_cache`, `weather_cache`, `coverage_gaps`.
- PostGIS `geom geometry(LINESTRING, 4326)` column confirmed in migration SQL and applied successfully.
- RedisProvider unit tested (3 tests, mocked ioredis) — all passing.
- Build: zero TypeScript errors across all packages.
- Full test suite: 4/4 passing.

### File List

- `packages/database/src/schema/auth.ts` — new
- `packages/database/src/schema/profiles.ts` — new
- `packages/database/src/schema/adventures.ts` — new
- `packages/database/src/schema/adventure-segments.ts` — new
- `packages/database/src/schema/accommodations-cache.ts` — new
- `packages/database/src/schema/weather-cache.ts` — new
- `packages/database/src/schema/coverage-gaps.ts` — new
- `packages/database/src/db.ts` — new
- `packages/database/src/index.ts` — updated (was empty stub)
- `packages/database/drizzle.config.ts` — updated (was stub)
- `packages/database/migrations/0000_confused_lily_hollister.sql` — new (generated)
- `packages/database/migrations/meta/_journal.json` — new (generated)
- `apps/api/src/config/database.config.ts` — updated
- `apps/api/src/common/providers/redis.provider.ts` — new
- `apps/api/src/common/providers/redis.provider.test.ts` — new
- `apps/api/src/app.module.ts` — updated (RedisProvider registered)
- `apps/api/package.json` — updated (ioredis, @types/pg, pg, drizzle-orm, moduleNameMapper)
- `package.json` — updated (db:generate, db:migrate, db:studio scripts, dotenv-cli, drizzle-kit)
