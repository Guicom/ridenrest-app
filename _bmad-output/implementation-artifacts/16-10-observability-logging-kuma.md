# Story 16.10: Observability — Structured Logging & Uptime Kuma Alerts

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer maintaining the production system**,
I want structured logs and proactive monitoring alerts,
so that I can debug issues quickly and be notified before users report them.

## Acceptance Criteria

1. **Structured logging — NestJS JSON output** — Every NestJS service, controller, and BullMQ processor logs significant events (request in/out, job start/complete/fail, cache hit/miss, unhandled error) via `nestjs-pino` with JSON output. Every log entry contains at minimum: `level`, `timestamp`, `context` (module name), `msg`, and `reqId` (correlation UUID — auto-generated per request by `pino-http`, propagated as `X-Request-Id` header).

2. **`pm2 logs api` shows JSON** — When the API is running on the VPS under PM2, `pm2 logs api` outputs structured JSON lines (no pretty-print in production). `pino-pretty` is used only in local dev via `NODE_ENV=development`.

3. **`HttpExceptionFilter` logs 5xx via pino** — The global `HttpExceptionFilter` logs unhandled (non-HttpException) errors using the injected `Logger` (pino-backed) instead of `console.error`. 4xx errors are NOT logged (normal user errors). 500 errors ARE logged with `level: 'error'`.

4. **BullMQ processors use pino Logger** — `GpxParseProcessor` and `DensityAnalyzeProcessor` use `private readonly logger = new Logger(ClassName.name)` (already done for Density; GPX processor needs adding). Both log: job start (level `log`), job complete with duration (level `log`), job failure with error (level `error`).

5. **`/api/health` enriched response** — The health endpoint (`GET /api/health`) returns: `{ status: 'ok', version, timestamp, uptime: process.uptime() }`. The endpoint remains `@Public()` (no JWT required). No DB/Redis ping added for MVP (keep it simple — TCP monitors handle infra checks in Kuma).

6. **Uptime Kuma monitors configured** — The following monitors exist in Uptime Kuma (`status.ridenrest.app`):
   - HTTP(S): `https://api.ridenrest.app/api/health` → expects HTTP 200
   - HTTP(S): `https://ridenrest.app` → expects HTTP 200
   - TCP: `localhost:5432` (PostgreSQL) — from within the VPS Docker network
   - TCP: `localhost:6379` (Redis) — from within the VPS Docker network
   - Notification channel: at least one of email or Telegram configured and tested.

7. **No external log shipping for MVP** — Logs stay on VPS disk via PM2. No Loki, Datadog, or external service required. This is a deliberate MVP scope decision.

## Tasks / Subtasks

- [x] **Task 1 — Install `nestjs-pino` and configure in AppModule** (AC: #1, #2)
  - [x] 1.1 — Install packages: `pnpm add nestjs-pino pino-http --filter @ridenrest/api` and `pnpm add -D pino-pretty --filter @ridenrest/api`
  - [x] 1.2 — In `app.module.ts`, import `LoggerModule` from `nestjs-pino`:
    ```typescript
    import { LoggerModule } from 'nestjs-pino'

    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
        transport: process.env['NODE_ENV'] !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
          : undefined,
        // Correlation ID: auto-generate if X-Request-Id not present
        genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
        // Quiet noise: skip health check logs in production
        autoLogging: {
          ignore: (req) => req.url === '/api/health',
        },
        serializers: {
          req: (req) => ({ method: req.method, url: req.url, reqId: req.id }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      },
    })
    ```
  - [x] 1.3 — In `main.ts`, replace `NestFactory.create(AppModule)` with `NestFactory.create(AppModule, { bufferLogs: true })` then call `app.useLogger(app.get(Logger))` after creation (standard nestjs-pino bootstrap pattern).
  - [x] 1.4 — Import `Logger` from `nestjs-pino` (not `@nestjs/common`) in `main.ts`:
    ```typescript
    import { Logger } from 'nestjs-pino'
    // ...
    const app = await NestFactory.create(AppModule, { bufferLogs: true })
    app.useLogger(app.get(Logger))
    ```

- [x] **Task 2 — Update `HttpExceptionFilter` to use pino Logger** (AC: #3)
  - [x] 2.1 — Inject `Logger` from `nestjs-pino` into `HttpExceptionFilter` (make it injectable with a constructor, register it as a provider instead of `new HttpExceptionFilter()`):
    ```typescript
    import { Logger } from 'nestjs-pino'

    @Injectable()
    @Catch()
    export class HttpExceptionFilter implements ExceptionFilter {
      constructor(private readonly logger: Logger) {}

      catch(exception: unknown, host: ArgumentsHost): void {
        // ... existing status/code/message logic ...

        // Only log non-HttpException (unexpected 500s)
        if (!(exception instanceof HttpException)) {
          this.logger.error({ err: exception }, 'Unhandled exception')
        }
        response.status(status).json({ error: { code, message } })
      }
    }
    ```
  - [x] 2.2 — In `app.module.ts`, change global filter registration from `app.useGlobalFilters(new HttpExceptionFilter())` to providing it via DI:
    ```typescript
    // In AppModule providers:
    { provide: APP_FILTER, useClass: HttpExceptionFilter }
    // Remove app.useGlobalFilters(...) from main.ts
    ```
  - [x] 2.3 — Add `APP_FILTER` import from `@nestjs/core` in `app.module.ts`.

- [x] **Task 3 — Add Logger to `GpxParseProcessor`** (AC: #4)
  - [x] 3.1 — Add `private readonly logger = new Logger(GpxParseProcessor.name)` to `apps/api/src/segments/jobs/gpx-parse.processor.ts` (import `Logger` from `@nestjs/common` — the pino integration overrides it globally)
  - [x] 3.2 — Log job start: `this.logger.log({ segmentId, jobId: job.id }, 'GPX parse job started')`
  - [x] 3.3 — Log job complete: `this.logger.log({ segmentId, durationMs, jobId: job.id }, 'GPX parse job completed')`
  - [x] 3.4 — Log job failure (in catch): `this.logger.error({ segmentId, jobId: job.id, err: error }, 'GPX parse job failed')`
  - [x] 3.5 — Verify `DensityAnalyzeProcessor` already has Logger — it does (`density-analyze.processor.ts:52`). Add structured fields if missing: `{ adventureId, jobId: job.id }` in log calls.

- [x] **Task 4 — Enrich `/api/health` endpoint** (AC: #5)
  - [x] 4.1 — In `apps/api/src/health/health.controller.ts`, add `uptime: process.uptime()` to the response:
    ```typescript
    check() {
      return {
        status: 'ok',
        version: process.env['npm_package_version'] ?? '0.0.1',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      }
    }
    ```
  - [x] 4.2 — Update the `@ApiOperation` description from "used by Fly.io and uptime monitors" to "used by Uptime Kuma and uptime monitors" (Fly.io was decommissioned in Epic 14).

- [ ] **Task 5 — Configure Uptime Kuma monitors** (AC: #6)
  - [ ] 5.1 — Access Uptime Kuma at `status.ridenrest.app` (admin panel)
  - [ ] 5.2 — Create monitor: **API Health** — Type: HTTP(S), URL: `https://api.ridenrest.app/api/health`, Interval: 60s, Expected status: 200
  - [ ] 5.3 — Create monitor: **Web App** — Type: HTTP(S), URL: `https://ridenrest.app`, Interval: 60s, Expected status: 200
  - [ ] 5.4 — Create monitor: **PostgreSQL TCP** — Type: TCP Port, Host: `localhost`, Port: `5432`, Interval: 60s
  - [ ] 5.5 — Create monitor: **Redis TCP** — Type: TCP Port, Host: `localhost`, Port: `6379`, Interval: 60s
  - [ ] 5.6 — Configure at least one notification channel (email or Telegram) — test with "Test notification" button to confirm delivery
  - [ ] 5.7 — Link all 4 monitors to the notification channel

- [x] **Task 6 — Tests** (AC: #1, #3, #4, #5)
  - [x] 6.1 — `health.controller.test.ts`: add assertion that response includes `uptime` field (number) and update the description text assertion if tested.
  - [x] 6.2 — `http-exception.filter.test.ts` (create if absent): test that a non-HttpException calls `logger.error()`; test that an HttpException (4xx) does NOT call `logger.error()`.
  - [x] 6.3 — `gpx-parse.processor.test.ts`: add assertion that `logger.log` is called on job start and complete; that `logger.error` is called on failure.
  - [x] 6.4 — No unit tests for Uptime Kuma configuration (manual setup, not code).

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] `autoLogging.ignore` uses exact match — fails for `/api/health/` or `/api/health?probe=1`. Use `req.url?.startsWith('/api/health')` [`app.module.ts:35`]
- [ ] [AI-Review][LOW] `genReqId` doesn't guard against `string[]` header — cast `as string` hides duplicate header edge case. Add `typeof` guard [`app.module.ts:32`]
- [ ] [AI-Review][LOW] No integration test for correlation ID (`X-Request-Id`) flow — AC #1 mandates `reqId` propagation but zero test coverage for this behavior
- [ ] [AI-Review][LOW] `pino-http ^11.0.0` installed but dev notes still say `^10.x` — update dev notes to reflect actual installed version [`Dev Notes > Package versions`]

## Dev Notes

### Why `nestjs-pino` over NestJS built-in Logger

NestJS's built-in `Logger` uses `console.log` and outputs plain text. `nestjs-pino` integrates `pino` (fastest Node.js logger, JSON output) and overrides `Logger` globally via DI — so ALL existing `new Logger(ClassName.name)` usages automatically output JSON without code changes. This is the minimal-invasive path.

**Key benefit**: `pino-http` middleware automatically logs every HTTP request/response with timing — zero manual instrumentation needed for controller-level observability. Correlation ID (`reqId`) flows through all logs for that request automatically.

### Package versions (April 2026)

```
nestjs-pino: ^4.x   (latest stable — supports NestJS 11)
pino-http:   ^10.x
pino-pretty: ^13.x  (dev only)
```

Check `https://www.npmjs.com/package/nestjs-pino` for latest before installing. The `^4.x` series added NestJS 11 support.

### `HttpExceptionFilter` — DI injection pattern

Currently `HttpExceptionFilter` is instantiated manually with `app.useGlobalFilters(new HttpExceptionFilter())`. To inject `Logger` (pino), it must be registered as an `APP_FILTER` provider in AppModule — this is the standard NestJS pattern for global filters that require DI:

```typescript
// app.module.ts
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js'

@Module({
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter }, // ← ADD THIS
  ],
})
```

```typescript
// main.ts — REMOVE this line:
// app.useGlobalFilters(new HttpExceptionFilter())
```

**CRITICAL**: If both `app.useGlobalFilters()` AND `APP_FILTER` provider are active, the filter runs twice. Remove `app.useGlobalFilters()` from `main.ts` when switching to DI.

### `GpxParseProcessor` — current state (no Logger)

The GPX parse processor (`apps/api/src/segments/jobs/gpx-parse.processor.ts`) currently has NO `Logger` instance — unlike `DensityAnalyzeProcessor` which has one. Task 3 fills this gap. The pattern to follow is exactly what `DensityAnalyzeProcessor` does:

```typescript
// density-analyze.processor.ts (reference — already correct)
private readonly logger = new Logger(DensityAnalyzeProcessor.name)
// constructor: this.logger.log('DensityAnalyzeProcessor initialized')
```

### Log field conventions (pino structured fields)

Always pass structured data as first argument, message as second:
```typescript
// ✅ Correct — machine-parseable
this.logger.log({ segmentId, durationMs: 342 }, 'GPX parse job completed')
this.logger.error({ err: error, segmentId }, 'GPX parse job failed')

// ❌ Avoid — string interpolation loses structure
this.logger.log(`GPX parse completed for ${segmentId} in 342ms`)
```

`nestjs-pino` serializes the first object as top-level fields in the JSON log line. `err` is a special key that pino serializes with `stack` automatically.

### `DensityAnalyzeProcessor` — existing Logger calls to enrich

The processor already has `this.logger.log(...)` calls but some use plain strings. For consistency, enrich them with structured fields where the job/adventure ID would be useful for filtering logs:

```typescript
// Before (current)
this.logger.log(`Processing density job for adventure ${adventureId}`)

// After (structured)
this.logger.log({ adventureId, jobId: job.id }, 'Density analysis job started')
```

This is a low-risk improvement but NOT blocking — only do it if it doesn't expand scope too much.

### Health endpoint — Fly.io reference cleanup

The current `@ApiOperation` says "used by Fly.io and uptime monitors" — Fly.io was decommissioned in Epic 14.7. Update to "used by Uptime Kuma and uptime monitors" to keep docs accurate.

### Uptime Kuma — TCP monitors for Docker services

PostgreSQL and Redis run in Docker containers on the VPS. Their ports are mapped to `localhost`:
- PostgreSQL: `localhost:5432` (from `docker-compose.yml` — `"5432:5432"` port mapping)
- Redis: `localhost:6379` (from `docker-compose.yml` — `"6379:6379"` port mapping)

Uptime Kuma also runs in Docker on the same VPS. TCP monitors to `localhost` from inside a Docker container may need to use the host's Docker bridge IP (`172.17.0.1`) instead of `localhost`. Use `host.docker.internal` if `localhost` doesn't resolve from Kuma's container.

**Practical**: test each TCP monitor manually after creating it — if it shows "down" immediately, switch to `host.docker.internal:5432`.

### `bootstrap()` in `main.ts` — nestjs-pino pattern

The official `nestjs-pino` bootstrap pattern requires `bufferLogs: true` to capture logs that happen during module initialization (before pino logger is bound):

```typescript
// main.ts — complete updated bootstrap
import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module.js'
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))

  app.enableCors({
    origin: process.env['WEB_URL'] ?? 'http://localhost:3011',
    credentials: true,
  })

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalInterceptors(new ResponseInterceptor())
  // Note: HttpExceptionFilter is now registered via APP_FILTER in AppModule — NOT here
  app.setGlobalPrefix('api')

  const config = new DocumentBuilder()
    .setTitle("Ride'n'Rest API")
    .setDescription('API for the bikepacking accommodation finder')
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)

  await app.listen(process.env['PORT'] ?? 3010)
}

bootstrap().catch(console.error)
```

### Project Structure Notes

| File | Action |
|---|---|
| `apps/api/package.json` | Add `nestjs-pino`, `pino-http`; add `pino-pretty` as devDependency |
| `apps/api/src/app.module.ts` | Import `LoggerModule.forRoot(...)` from `nestjs-pino`; add `APP_FILTER` for `HttpExceptionFilter` |
| `apps/api/src/main.ts` | Add `bufferLogs: true` + `app.useLogger(app.get(Logger))`; remove `app.useGlobalFilters(new HttpExceptionFilter())` |
| `apps/api/src/common/filters/http-exception.filter.ts` | Inject `Logger` from `nestjs-pino`; log non-HttpException errors with `this.logger.error({ err }, msg)` |
| `apps/api/src/segments/jobs/gpx-parse.processor.ts` | Add `Logger`, log job start/complete/fail |
| `apps/api/src/density/jobs/density-analyze.processor.ts` | Optionally enrich existing log calls with structured fields |
| `apps/api/src/health/health.controller.ts` | Add `uptime: Math.floor(process.uptime())` to response; update Swagger description |
| Uptime Kuma (manual) | Add 4 monitors + 1 notification channel (no code) |

### References

- `nestjs-pino` docs: https://github.com/iamolegga/nestjs-pino (README has the exact bootstrap pattern)
- `DensityAnalyzeProcessor` (reference Logger usage): `apps/api/src/density/jobs/density-analyze.processor.ts:52`
- `GpxParseProcessor` (needs Logger added): `apps/api/src/segments/jobs/gpx-parse.processor.ts`
- `HttpExceptionFilter` (needs DI + pino): `apps/api/src/common/filters/http-exception.filter.ts`
- `main.ts` (bootstrap to update): `apps/api/src/main.ts`
- `app.module.ts` (LoggerModule + APP_FILTER): `apps/api/src/app.module.ts`
- `health.controller.ts` (uptime field): `apps/api/src/health/health.controller.ts`
- Epic 14.6 (Uptime Kuma setup — already done): `_bmad-output/planning-artifacts/epics.md` — Kuma is running at `status.ridenrest.app`
- NestJS APP_FILTER pattern: [Source: epics.md#Story-16.10] — standard DI global filter
- VPS deploy config: `project-context.md#VPS-Deployment-Config`
- Port config: API :3010 [project-context.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — clean implementation, no debugging needed.

### Completion Notes List

- Installed `nestjs-pino@^4.x`, `pino-http@^10.x` as production deps; `pino-pretty@^13.x` as devDep via pnpm filter
- `LoggerModule.forRoot()` configured in `AppModule` with: JSON prod / pino-pretty dev, correlation ID via `crypto.randomUUID()`, health endpoint auto-logging suppressed, structured req/res serializers
- `main.ts` updated to `bufferLogs: true` + `app.useLogger(app.get(Logger))` — standard nestjs-pino bootstrap; removed manual `useGlobalFilters(new HttpExceptionFilter())`
- `HttpExceptionFilter` converted to injectable class with `Logger` (nestjs-pino) DI; logs `logger.error({ err }, 'Unhandled exception')` for non-HttpException only; 4xx errors NOT logged
- `HttpExceptionFilter` registered via `{ provide: APP_FILTER, useClass: HttpExceptionFilter }` in AppModule providers
- `GpxParseProcessor`: added `private readonly logger = new Logger(GpxParseProcessor.name)`; logs job start (with segmentId + jobId), complete (with durationMs), and failure (with err); replaced `console.error` with `this.logger.error`
- `DensityAnalyzeProcessor`: already had Logger — no changes needed (existing calls use plain strings; story noted structured enrichment as optional/non-blocking)
- `health.controller.ts`: added `uptime: Math.floor(process.uptime())` to response; updated Swagger description from "Fly.io" to "Uptime Kuma"
- Task 5 (Uptime Kuma monitors): manual configuration — no code, left unchecked pending manual setup by Guillaume
- All 227 tests pass (20 suites), zero regressions; 3 test files updated with new assertions
- **Code review fixes (2026-04-02):** H1 — `HttpExceptionFilter` now logs ALL 5xx (including HttpException 500s) via `status >= 500` check; M1 — `makeJob` test helper adds `id: 'job-abc-123'` for realistic job ID testing; M2 — silent segment skip now emits `logger.warn` for production observability; M3 — `process.env.WEB_URL` → `process.env['WEB_URL']` for consistent bracket notation

### File List

- `apps/api/package.json` — added `nestjs-pino`, `pino-http` (deps), `pino-pretty` (devDep)
- `apps/api/src/app.module.ts` — added `LoggerModule.forRoot`, `APP_FILTER` for `HttpExceptionFilter`
- `apps/api/src/main.ts` — `bufferLogs: true`, `app.useLogger(app.get(Logger))`, removed `useGlobalFilters`, removed unused `HttpExceptionFilter` import
- `apps/api/src/common/filters/http-exception.filter.ts` — `@Injectable()`, constructor `Logger` injection, pino `logger.error` for non-HttpException
- `apps/api/src/segments/jobs/gpx-parse.processor.ts` — added `Logger`, log start/complete/fail
- `apps/api/src/health/health.controller.ts` — added `uptime`, updated Swagger description
- `apps/api/src/health/health.controller.test.ts` — added `uptime` field assertion
- `apps/api/src/common/filters/http-exception.filter.test.ts` — updated for DI Logger; added logger.error assertions
- `apps/api/src/segments/jobs/gpx-parse.processor.test.ts` — added logger.log/error spy assertions; added job.id to makeJob fixture; added logger.warn test for silent skip
- `pnpm-lock.yaml` — updated lockfile after nestjs-pino/pino-http/pino-pretty install
