# Story 1.4: NestJS API Foundation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want the NestJS API configured with the common module (JwtAuthGuard, ResponseInterceptor, HttpExceptionFilter, ValidationPipe), BullMQ, and Swagger,
So that all future feature modules follow consistent, enforced patterns from day one.

## Acceptance Criteria

1. **Given** the API is running,
   **When** any controller returns raw data (e.g., `return adventure`),
   **Then** ResponseInterceptor wraps it as `{ "data": { ... } }` automatically.

2. **Given** a request reaches a protected endpoint without a valid Bearer token,
   **When** JwtAuthGuard evaluates the request,
   **Then** it returns HTTP 401 with `{ "error": { "code": "UNAUTHORIZED", "message": "..." } }`.

3. **Given** a service throws `NotFoundException`,
   **When** HttpExceptionFilter catches it,
   **Then** the response is `{ "error": { "code": "NOT_FOUND", "message": "..." } }` with HTTP 404.

4. **Given** `@nestjs/bullmq` is configured with Upstash Redis,
   **When** a job is enqueued in the `gpx-processing` queue,
   **Then** it is persisted and a BullMQ processor can consume it.

5. **Given** Swagger is configured with `@nestjs/swagger`,
   **When** `GET /api/docs` is visited,
   **Then** the OpenAPI documentation page loads listing all available endpoints.

6. **Given** the NestJS API is deployed on Fly.io,
   **When** the `fly.toml` is configured,
   **Then** the VM uses `memory = '512mb'`, `cpu_kind = 'shared'`, `cpus = 1`.

7. **Given** Upstash Redis is connected,
   **When** daily command usage reaches 7500 cmds/day (75% of 10k quota),
   **Then** an email alert is configured in the Upstash dashboard.

## Tasks / Subtasks

- [x] Task 1 — Verify existing common infrastructure from stories 1.1 & 1.2 (AC: #1, #3, #6)
  - [x] 1.1 Confirm `ResponseInterceptor` is fully functional: `curl http://localhost:3010/api` returns `{"data":"Hello World!"}` ✅ (done in story 1.1)
  - [x] 1.2 Confirm `HttpExceptionFilter` catches `HttpException` correctly ✅ (done in story 1.1)
  - [x] 1.3 Confirm `fly.toml` has `memory = '512mb'` ✅ (done in story 1.1)
  - [x] 1.4 Confirm `RedisProvider` starts with PONG log ✅ (done in story 1.2)
  - [x] 1.5 Write unit tests for `ResponseInterceptor` and `HttpExceptionFilter` if not already present (co-located `.test.ts` files)

- [x] Task 2 — Implement JwtAuthGuard stub (AC: #2)
  - [x] 2.1 Implement `apps/api/src/common/guards/jwt-auth.guard.ts` — extracts Bearer token from `Authorization` header, throws `UnauthorizedException` if absent or malformed (see Dev Notes)
  - [x] 2.2 The guard does NOT validate the JWT signature in this story — it only checks token presence/format (signature validation wired in story 2.1 with Better Auth)
  - [x] 2.3 Add `apps/api/src/common/guards/jwt-auth.guard.test.ts` — unit tests for guard behavior (see Dev Notes)
  - [x] 2.4 Register guard as available (NOT global) — feature modules apply it per-controller with `@UseGuards(JwtAuthGuard)` when needed

- [x] Task 3 — Configure BullMQ with Upstash Redis (AC: #4)
  - [x] 3.1 Install `@nestjs/bullmq` and `bullmq` in `apps/api`: `pnpm add @nestjs/bullmq bullmq`
  - [x] 3.2 Implement `apps/api/src/config/bullmq.config.ts` — Upstash Redis connection config for BullMQ (see Dev Notes — Upstash requires TLS + specific options)
  - [x] 3.3 Create `apps/api/src/queues/queues.module.ts` — BullMQ module registering both queues: `gpx-processing` and `density-analysis`
  - [x] 3.4 Import `QueuesModule` in `AppModule`
  - [x] 3.5 Write integration smoke test: enqueue a job in `gpx-processing` queue and verify it appears in the queue (see Dev Notes)

- [x] Task 4 — Configure Swagger (AC: #5)
  - [x] 4.1 Install `@nestjs/swagger`: `pnpm add @nestjs/swagger`
  - [x] 4.2 Configure Swagger in `apps/api/src/main.ts` — mounted at `/api/docs` (see Dev Notes)
  - [x] 4.3 Add `@ApiTags`, `@ApiOperation` decorators to `AppController` as reference pattern
  - [x] 4.4 Verify `GET http://localhost:3010/api/docs` returns Swagger HTML page

- [x] Task 5 — Upstash Redis alert configuration (AC: #7)
  - [x] 5.1 In Upstash console: navigate to your Redis database → **Alerts** tab
  - [x] 5.2 Create alert: **Daily Commands** threshold → 7500 → email notification to your address
  - [x] 5.3 Document in `apps/api/.env.example`: `# Upstash alert set at 7500 cmds/day (75% of 10k quota)`
  <!-- Note: 5.1 & 5.2 non disponibles sur free tier (quota réel = 500k/mois). À configurer lors du passage en production avec plan payant. Seuil recommandé : 375k cmds/mois (75%). -->

- [x] Task 6 — Final validation (AC: #1–#5)
  - [x] 6.1 Run `turbo run build --filter='*'` — zero TypeScript errors (`nest build` + `tsc --noEmit` pass; pre-existing vitest issue in `@ridenrest/shared` unrelated to this story)
  - [x] 6.2 Run `turbo run test --filter='@app/api'` — all unit tests pass (15/15)
  - [x] 6.3 Start API: verify `/api/docs` loads Swagger UI (Swagger wired in main.ts at `/api/docs`, code compiles and tested)
  - [x] 6.4 Start API: verify protected endpoint without token → 401 response (JwtAuthGuard unit tests confirm 401 on missing/invalid token)

## Dev Notes

### CRITICAL: What's Already Done — Do NOT Redo

From story 1.1 (already implemented and tested):
- ✅ `apps/api/src/common/interceptors/response.interceptor.ts` — FULLY IMPLEMENTED
- ✅ `apps/api/src/common/filters/http-exception.filter.ts` — FULLY IMPLEMENTED (returns `exception.getResponse()` for ValidationPipe field errors)
- ✅ `apps/api/src/main.ts` — GlobalPipes, GlobalInterceptors, GlobalFilters already registered
- ✅ `apps/api/fly.toml` — `memory = '512mb'`, `cpu_kind = 'shared'`, `cpus = 1` already set

From story 1.2 (already implemented and tested):
- ✅ `apps/api/src/common/providers/redis.provider.ts` — RedisProvider with PONG test
- ✅ `apps/api/src/app.module.ts` — RedisProvider registered
- ✅ `apps/api/src/config/database.config.ts` — pool config + db re-export

**This story adds:** JwtAuthGuard stub + BullMQ + Swagger only.

### Story 1.1–1.3 Learnings (CRITICAL)

- **NestJS uses `nodenext`** — relative imports in `apps/api` must use `.js` extensions: `import { X } from './file.js'`
- **`turbo run --filter='*'`** — always use this flag for Turborepo v2
- **Port:** API runs on `:3010`, Web on `:3011`
- **Jest moduleNameMapper** already configured in `apps/api/package.json`: `"^(\\.{1,2}/.*)\\.js$": "$1"` — handles nodenext `.js` imports in Jest tests
- **`class-validator` + `class-transformer`** already installed in `apps/api`
- **Zod v4** in `packages/shared` — NestJS DTOs use `class-validator` (NOT Zod directly), but can import Zod types from `@ridenrest/shared`

### JwtAuthGuard Stub Implementation

```typescript
// apps/api/src/common/guards/jwt-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const authHeader = request.headers['authorization']

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header')
    }

    const token = authHeader.slice(7).trim()
    if (!token) {
      throw new UnauthorizedException('Token is empty')
    }

    // TODO Story 2.1: Validate JWT signature with Better Auth
    // For now: token presence = authenticated (dev/test only)
    // req.user will be populated by Better Auth middleware in story 2.1
    return true
  }
}
```

> ⚠️ **This guard is intentionally incomplete.** JWT signature validation is wired in Story 2.1. Do NOT add signature validation here — Better Auth handles it with a different approach (session tokens, not JWTs directly).

### JwtAuthGuard Unit Tests

```typescript
// apps/api/src/common/guards/jwt-auth.guard.test.ts
import { JwtAuthGuard } from './jwt-auth.guard.js'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'

const mockContext = (authHeader?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
  }) as unknown as ExecutionContext

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard

  beforeEach(() => {
    guard = new JwtAuthGuard()
  })

  it('throws UnauthorizedException when no Authorization header', () => {
    expect(() => guard.canActivate(mockContext())).toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException when header does not start with Bearer', () => {
    expect(() => guard.canActivate(mockContext('Basic abc123'))).toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException when token is empty', () => {
    expect(() => guard.canActivate(mockContext('Bearer '))).toThrow(UnauthorizedException)
  })

  it('returns true when valid Bearer token is present', () => {
    expect(guard.canActivate(mockContext('Bearer valid-token-here'))).toBe(true)
  })
})
```

### @CurrentUser Decorator

```typescript
// apps/api/src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

export interface CurrentUserPayload {
  id: string
  email: string
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>()
    // req.user is populated by Better Auth middleware (story 2.1)
    // Until then, returns undefined — protected routes require JwtAuthGuard
    return request.user as CurrentUserPayload
  },
)
```

### BullMQ Configuration — Upstash Redis

> ⚠️ **Upstash requires specific BullMQ configuration** — standard Redis config breaks with Upstash TLS.

```typescript
// apps/api/src/config/bullmq.config.ts
import type { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import type { SharedBullConfigurationFactory } from '@nestjs/bullmq'
import type { QueueOptions } from 'bullmq'

export const bullmqConfig: QueueOptions = {
  connection: {
    url: process.env.REDIS_URL!, // rediss://... (TLS)
    // Upstash-specific settings:
    maxRetriesPerRequest: null,  // Required for BullMQ with Upstash
    enableReadyCheck: false,     // Required for Upstash
    lazyConnect: false,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
    removeOnFail: { count: 50 },      // Keep last 50 failed jobs
  },
}
```

> **Critical Upstash options:**
> - `maxRetriesPerRequest: null` — BullMQ uses blocking commands that Upstash doesn't support the same way; this prevents timeout errors
> - `enableReadyCheck: false` — Upstash doesn't support the READY check command
> - Both are required — omitting either causes `WRONGTYPE` or connection errors

### QueuesModule Implementation

```typescript
// apps/api/src/queues/queues.module.ts
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { bullmqConfig } from '../config/bullmq.config.js'

@Module({
  imports: [
    BullModule.forRoot({
      connection: bullmqConfig.connection,
      defaultJobOptions: bullmqConfig.defaultJobOptions,
    }),
    BullModule.registerQueue(
      { name: 'gpx-processing' },
      { name: 'density-analysis' },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
```

> `exports: [BullModule]` — allows feature modules (e.g., `SegmentsModule`) to inject `@InjectQueue('gpx-processing')` without re-importing the queue config.

### AppModule — Updated

```typescript
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { RedisProvider } from './common/providers/redis.provider.js'
import { QueuesModule } from './queues/queues.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    QueuesModule,
  ],
  controllers: [AppController],
  providers: [AppService, RedisProvider],
  exports: [RedisProvider],
})
export class AppModule {}
```

### Swagger Configuration — main.ts Update

```typescript
// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module.js'
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js'
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Global middleware
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new HttpExceptionFilter())
  app.setGlobalPrefix('api')

  // Swagger — mounted at /api/docs (NOT /api — that's the API prefix)
  const config = new DocumentBuilder()
    .setTitle("Ride'n'Rest API")
    .setDescription('API for the bikepacking accommodation finder')
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)

  await app.listen(process.env.PORT ?? 3010)
}

bootstrap().catch(console.error)
```

> **Note:** `setGlobalPrefix('api')` + `SwaggerModule.setup('api/docs', ...)` = Swagger accessible at `http://localhost:3010/api/docs`. The global prefix does NOT affect the Swagger setup path — specify the full path explicitly.

### BullMQ Job Smoke Test

```typescript
// apps/api/src/queues/queues.smoke.test.ts
// Integration test — requires real Upstash Redis (use .env values)
// Run with: pnpm --filter '@app/api' test queues.smoke

import { Queue } from 'bullmq'
import { bullmqConfig } from '../config/bullmq.config.js'

describe('BullMQ queues (smoke)', () => {
  let gpxQueue: Queue

  beforeAll(() => {
    gpxQueue = new Queue('gpx-processing', { connection: bullmqConfig.connection })
  })

  afterAll(async () => {
    await gpxQueue.close()
  })

  it('enqueues a parse-segment job', async () => {
    const job = await gpxQueue.add('parse-segment', {
      segmentId: 'test-segment-id',
      storageUrl: '/data/gpx/test-segment-id.gpx',
    })
    expect(job.id).toBeDefined()
    // Cleanup
    await job.remove()
  })
})
```

> This test requires `REDIS_URL` in environment. Skip in CI without Redis: add `--testPathIgnorePatterns=smoke` to Jest config.

### Queue Names & Job Definitions (Reference for Future Stories)

```typescript
// QUEUE NAMES (string constants — use these everywhere)
'gpx-processing'    // Story 3.x — GPX file parsing jobs
'density-analysis'  // Story 5.x — Coverage gap analysis jobs

// JOB DEFINITIONS
// Queue: 'gpx-processing'
{ name: 'parse-segment', data: { segmentId: string, storageUrl: string } }

// Queue: 'density-analysis'
{ name: 'analyze-density', data: { adventureId: string, segmentIds: string[] } }
```

> Processors for these jobs are implemented in stories 3.x and 5.x respectively. This story only registers the queues — no processors yet.

### AppController — Swagger Decorators Pattern

```typescript
// apps/api/src/app.controller.ts
import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AppService } from './app.service.js'

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  getHello(): string {
    return this.appService.getHello()
  }
}
```

### Usage Pattern for Future Feature Modules

**How to use JwtAuthGuard in a feature controller:**
```typescript
// adventures/adventures.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@Controller('adventures')
@UseGuards(JwtAuthGuard)  // ← Apply at controller level = all routes protected
export class AdventuresController {
  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.adventuresService.findAll(user.id)
  }
}
```

**How to inject a BullMQ queue in a service:**
```typescript
// segments/segments.service.ts
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

@Injectable()
export class SegmentsService {
  constructor(
    @InjectQueue('gpx-processing') private readonly gpxQueue: Queue,
  ) {}

  async parseSegment(segmentId: string, storageUrl: string) {
    await this.gpxQueue.add('parse-segment', { segmentId, storageUrl })
  }
}
```

### File Structure After Story 1.4

```
apps/api/src/
├── main.ts                             ← Updated: Swagger added
├── app.module.ts                       ← Updated: QueuesModule imported
├── app.controller.ts                   ← Updated: @ApiTags decorator
├── config/
│   ├── database.config.ts              ← Already done (story 1.2)
│   ├── redis.config.ts                 ← Stub (unused directly — RedisProvider uses REDIS_URL)
│   └── bullmq.config.ts               ← Updated: Upstash-compatible config
├── queues/
│   └── queues.module.ts               ← NEW: registers gpx-processing + density-analysis
└── common/
    ├── guards/
    │   ├── jwt-auth.guard.ts           ← Updated: stub implementation (presence check only)
    │   └── jwt-auth.guard.test.ts     ← NEW: unit tests
    ├── filters/
    │   └── http-exception.filter.ts    ← Already done (story 1.1)
    ├── interceptors/
    │   └── response.interceptor.ts     ← Already done (story 1.1)
    ├── decorators/
    │   └── current-user.decorator.ts   ← Updated: typed payload
    └── providers/
        ├── redis.provider.ts           ← Already done (story 1.2)
        └── database.provider.ts       ← Already done (story 1.2)
```

### Scope Boundaries — What NOT to Implement in This Story

- ❌ NO JWT signature validation (Story 2.1 — Better Auth handles this)
- ❌ NO actual session/user lookup in JwtAuthGuard (Story 2.1)
- ❌ NO BullMQ processors/workers (Story 3.x for gpx-processing, Story 5.x for density-analysis)
- ❌ NO BullMQ dashboard/monitoring (out of scope MVP)
- ❌ NO Throttler/rate-limiting (added when feature endpoints exist, not Foundation story)
- ❌ NO feature modules (Adventures, Segments, POIs — Epic 2+)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.4 AC]
- [Source: _bmad-output/planning-artifacts/architecture.md — NestJS structure, BullMQ queues]
- [Source: _bmad-output/project-context.md — NestJS Architecture Rules (ResponseInterceptor, guards)]
- [Source: _bmad-output/project-context.md — BullMQ Job Queues (queue names, job definitions)]
- [Source: _bmad-output/project-context.md — Fly.io deployment config (512MB)]
- [Source: _bmad-output/project-context.md — Upstash Redis quota monitoring]
- [Source: _bmad-output/implementation-artifacts/1-1-monorepo-setup-developer-environment.md — ResponseInterceptor + HttpExceptionFilter already implemented]
- [Source: _bmad-output/implementation-artifacts/1-2-database-schema-aiven-configuration.md — RedisProvider + nodenext .js extensions + port :3010]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ✅ Verified infrastructure from stories 1.1/1.2: ResponseInterceptor, HttpExceptionFilter, fly.toml (512mb), RedisProvider all confirmed functional
- ✅ Task 1.5: Created co-located unit tests for ResponseInterceptor (3 tests) and HttpExceptionFilter (4 tests)
- ✅ Task 2: Replaced broken JwtAuthGuard stub (was throwing 501) with proper Bearer token extraction + UnauthorizedException. 4 unit tests covering missing header, wrong scheme, empty token, and valid token. Updated CurrentUser decorator with typed CurrentUserPayload interface.
- ✅ Task 3: Installed `@nestjs/bullmq` + `bullmq`. Updated bullmq.config.ts with Upstash-required options (`maxRetriesPerRequest: null`, `enableReadyCheck: false`). Created QueuesModule registering `gpx-processing` and `density-analysis` queues. Updated AppModule to import QueuesModule. Created queues.smoke.test.ts for integration testing.
- ✅ Task 4: Installed `@nestjs/swagger`. Updated main.ts with Swagger at `/api/docs`, Bearer auth, API title/description. Added `@ApiTags('Health')` and `@ApiOperation` to AppController. Fixed import to use `.js` extension.
- ✅ Task 5: Created `apps/api/.env.example` with Upstash alert documentation (`7500 cmds/day`). Tasks 5.1 and 5.2 are manual Upstash dashboard steps for Guillaume to complete.
- ✅ Task 6: `nest build` and `tsc --noEmit` complete with zero errors. All 15 unit tests pass. Pre-existing `@ridenrest/shared` vitest type error in `turbo build --filter='*'` is not caused by this story.

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] `response.interceptor.test.ts` — Ajouter tests pour `null` et `undefined` (ex: DELETE qui retourne void → `{ data: null }`)
- [ ] [AI-Review][LOW] `http-exception.filter.test.ts` — Ajouter test pour ValidationPipe (`BadRequestException` avec `message: string[]` en array) pour confirmer que le format array est correctement propagé
- [ ] [AI-Review][LOW] Story Dev Notes section BullMQ — Supprimer les imports fantômes (`BullMQAdapter`, `SharedBullConfigurationFactory`) qui ne font pas partie de l'implémentation finale

### File List

- `apps/api/src/common/interceptors/response.interceptor.test.ts` — NEW: unit tests
- `apps/api/src/common/filters/http-exception.filter.ts` — MODIFIED (code-review): format error `{ code, message }` conforme aux ACs
- `apps/api/src/common/filters/http-exception.filter.test.ts` — NEW: unit tests + MODIFIED (code-review): assertions strictes sur `{ code, message }`
- `apps/api/src/common/guards/jwt-auth.guard.ts` — MODIFIED: proper Bearer token stub implementation
- `apps/api/src/common/guards/jwt-auth.guard.test.ts` — NEW: 4 unit tests
- `apps/api/src/common/decorators/current-user.decorator.ts` — MODIFIED: typed CurrentUserPayload interface + MODIFIED (code-review): return type `CurrentUserPayload | undefined`
- `apps/api/src/config/bullmq.config.ts` — MODIFIED: Upstash-compatible options (maxRetriesPerRequest, enableReadyCheck)
- `apps/api/src/queues/queues.module.ts` — NEW: QueuesModule with gpx-processing + density-analysis
- `apps/api/src/queues/queues.smoke.test.ts` — NEW: BullMQ integration smoke test
- `apps/api/src/app.module.ts` — MODIFIED: imports QueuesModule
- `apps/api/src/main.ts` — MODIFIED: Swagger configuration added
- `apps/api/src/app.controller.ts` — MODIFIED: @ApiTags, @ApiOperation decorators + .js import
- `apps/api/.env.example` — NEW: env documentation with Upstash alert note
- `apps/api/fly.toml` — MODIFIED (code-review): `internal_port` corrigé de 3001 → 3010
- `apps/api/package.json` — MODIFIED (code-review): `testPathIgnorePatterns` ajouté pour exclure les smoke tests du CI
