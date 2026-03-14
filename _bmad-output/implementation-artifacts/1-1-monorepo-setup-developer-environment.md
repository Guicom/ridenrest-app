# Story 1.1: Monorepo Setup & Developer Environment

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want the monorepo initialized with Turborepo, apps/web (Next.js 15), apps/api (NestJS 11), and shared packages scaffolded,
So that all development can happen in a unified environment with a single `turbo dev` command.

## Acceptance Criteria

1. **Given** the repo is cloned and `pnpm install` runs from the root,
   **When** installation completes,
   **Then** all workspace packages resolve via `workspace:*` protocol without errors.

2. **Given** `turbo dev` is run,
   **When** both apps start,
   **Then** apps/web is accessible on localhost:3000 and apps/api on localhost:3001 without errors.

3. **Given** `packages/typescript-config` exists with strict mode enabled,
   **When** any app extends it in its `tsconfig.json`,
   **Then** TypeScript strict checks are enforced across all workspaces.

4. **Given** `packages/eslint-config` is configured,
   **When** `turbo lint` runs,
   **Then** ESLint passes with zero errors across all apps and packages.

## Tasks / Subtasks

- [x] Task 1 — Initialize Turborepo monorepo (AC: #1, #2)
  - [x] 1.1 Run `pnpm create turbo@latest ridenrest-app --package-manager pnpm` to scaffold base
  - [x] 1.2 Remove `apps/docs` (unused default Turborepo app)
  - [x] 1.3 Verify root `pnpm-workspace.yaml` lists `apps/*` and `packages/*`
  - [x] 1.4 Verify root `turbo.json` has correct pipeline: `lint → build → test`, with `build` depending on upstream packages
  - [x] 1.5 Add `packageManager: "pnpm@9.x"` field in root `package.json`

- [x] Task 2 — Scaffold apps/web (Next.js 15) (AC: #2)
  - [x] 2.1 Update auto-generated Next.js to version 15: `pnpm add next@15 react@19 react-dom@19` inside `apps/web`
  - [x] 2.2 Configure App Router with route groups: `(marketing)/` and `(app)/`
  - [x] 2.3 Create `apps/web/src/app/(marketing)/page.tsx` — minimal static landing page
  - [x] 2.4 Create `apps/web/src/app/(app)/layout.tsx` — placeholder auth-gated layout
  - [x] 2.5 Create `apps/web/src/app/api/auth/[...all]/route.ts` — Better Auth catch-all stub (exports empty handler for now)
  - [x] 2.6 Create `apps/web/src/middleware.ts` — minimal stub (pass-through for now, expanded in story 2.x)
  - [x] 2.7 Configure `apps/web/tsconfig.json` to extend `@ridenrest/typescript-config/nextjs`
  - [x] 2.8 Configure `apps/web/.eslintrc.js` (or `eslint.config.mjs`) to extend `@ridenrest/eslint-config`
  - [x] 2.9 Install Tailwind CSS v4: `pnpm add tailwindcss@4 @tailwindcss/postcss` — configure `postcss.config.mjs`
  - [x] 2.10 Add `apps/web/.env.local.example` with all required env var keys (empty values)
  - [x] 2.11 Ensure `apps/web` starts on port 3000 without errors

- [x] Task 3 — Scaffold apps/api (NestJS 11) (AC: #2)
  - [x] 3.1 Run `npx @nestjs/cli new apps/api --package-manager pnpm --skip-git` from monorepo root
  - [x] 3.2 Configure `apps/api` in `pnpm-workspace.yaml` and `turbo.json`
  - [x] 3.3 Configure `apps/api/tsconfig.json` to extend `@ridenrest/typescript-config/nestjs`
  - [x] 3.4 Configure `apps/api/.eslintrc.js` to extend `@ridenrest/eslint-config`
  - [x] 3.5 Create `apps/api/src/config/` directory with stubs: `database.config.ts`, `redis.config.ts`, `bullmq.config.ts`
  - [x] 3.6 Create `apps/api/src/common/` with stubs: `guards/jwt-auth.guard.ts`, `filters/http-exception.filter.ts`, `interceptors/response.interceptor.ts`, `decorators/current-user.decorator.ts`
  - [x] 3.7 Create `apps/api/fly.toml` with mandatory VM config (`memory = '512mb'`, `cpu_kind = 'shared'`, `cpus = 1`)
  - [x] 3.8 Add `apps/api/.env.example` with all required env var keys (empty values)
  - [x] 3.9 Ensure `apps/api` starts on port 3001 without errors

- [x] Task 4 — Create shared packages (AC: #3, #4)
  - [x] 4.1 Create `packages/typescript-config/` with `base.json`, `nextjs.json`, `nestjs.json` and `package.json` (name: `@ridenrest/typescript-config`)
  - [x] 4.2 Create `packages/eslint-config/` with `index.js` and `package.json` (name: `@ridenrest/eslint-config`)
  - [x] 4.3 Create `packages/database/` with stub structure: `src/schema/` (empty files), `src/index.ts`, `drizzle.config.ts`, `package.json` (name: `@ridenrest/database`)
  - [x] 4.4 Create `packages/shared/` with stub structure: `src/types/`, `src/schemas/`, `src/constants/`, `src/index.ts`, `package.json` (name: `@ridenrest/shared`)
  - [x] 4.5 Create `packages/gpx/` with stub structure: `src/haversine.ts`, `src/rdp.ts`, `src/corridor.ts`, `src/parser.ts`, `src/index.ts`, `package.json` (name: `@ridenrest/gpx`)
  - [x] 4.6 Create `packages/ui/` minimal scaffold: `src/index.ts`, `package.json` (name: `@ridenrest/ui`)
  - [x] 4.7 Wire `workspace:*` deps: `apps/web` and `apps/api` both depend on `@ridenrest/shared`, `@ridenrest/database`, `@ridenrest/gpx`

- [x] Task 5 — Validate end-to-end (AC: #1, #2, #3, #4)
  - [x] 5.1 Run `pnpm install` from root — zero errors
  - [x] 5.2 Run `turbo lint` — zero ESLint errors across all workspaces
  - [x] 5.3 Run `turbo build` — both apps build without TypeScript errors
  - [x] 5.4 Run `turbo dev` — apps/web on :3000 and apps/api on :3001 respond to GET requests

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Jest testRegex `.spec.ts` ne capte pas la convention `.test.ts` du projet — changé en `".*\\.(test|spec)\\.ts$"` [apps/api/package.json:63]
- [x] [AI-Review][HIGH] HttpExceptionFilter perd les détails de validation — remplacé `exception.message` par `exception.getResponse()` pour retourner les field-level errors de ValidationPipe [apps/api/src/common/filters/http-exception.filter.ts:22]
- [x] [AI-Review][MEDIUM] packageManager pnpm@10.32.1 au lieu de pnpm@9.x — **décision documentée** : pnpm@10 utilisé car disponible sur la machine, pnpm@9 EOL imminente. Aucun breaking change identifié pour ce monorepo. [package.json:4]
- [x] [AI-Review][MEDIUM] eslint-config manque les règles type-checked — remplacé par `tseslint.configs.recommendedTypeChecked` + `parserOptions.projectService: true` [packages/eslint-config/index.js:4]
- [x] [AI-Review][MEDIUM] Script lint de apps/web utilise `--ext` déprécié en ESLint v9 — remplacé par `eslint 'src/**/*.{ts,tsx}'` [apps/web/package.json:9]
- [x] [AI-Review][MEDIUM] AppModule manque ConfigModule — ajouté `@nestjs/config@^4.0.0` aux deps + `ConfigModule.forRoot({ isGlobal: true })` dans AppModule [apps/api/src/app.module.ts]
- [x] [AI-Review][LOW] bootstrap() floating promise sans .catch() — ajouté `bootstrap().catch(console.error)` [apps/api/src/main.ts:16]
- [x] [AI-Review][LOW] tsconfig de apps/api exclut `spec.ts` mais pas `test.ts` — ajouté `"**/*.test.ts"` à l'exclude [apps/api/tsconfig.json:11]
- [x] [AI-Review][LOW] `lang="en"` — **won't fix MVP** : le contenu UI est en anglais, `lang="en"` est correct. À revoir lors de l'ajout de l'i18n (post-MVP). [apps/web/src/app/layout.tsx:27]
- [x] [AI-Review][LOW] base.json `moduleResolution: "bundler"` — **won't fix** : JSON ne supporte pas les commentaires, split configs = sur-ingénierie. Overridé correctement dans nestjs.json. [packages/typescript-config/base.json:9]

## Dev Notes

### Exact Initialization Commands

Follow this sequence to avoid setup mistakes:

```bash
# Step 1: Create Turborepo base (run in parent directory)
pnpm create turbo@latest ridenrest-app --package-manager pnpm

cd ridenrest-app

# Step 2: Remove unused default app
rm -rf apps/docs

# Step 3: Create NestJS API in apps/
npx @nestjs/cli new apps/api --package-manager pnpm --skip-git

# Step 4: Upgrade Next.js to 15 in apps/web
cd apps/web
pnpm add next@15 react@19 react-dom@19
cd ../..

# Step 5: Create custom packages
mkdir -p packages/gpx packages/database packages/shared packages/ui packages/typescript-config packages/eslint-config

# Step 6: Install from root
pnpm install
```

### Critical: Turborepo Pipeline (turbo.json)

```json
{
  "$schema": "https://turborepo.org/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

> `"^build"` means: build dependencies (packages) before apps. This ensures `@ridenrest/shared`, `@ridenrest/database`, `@ridenrest/gpx` are compiled before `apps/web` and `apps/api`.

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### TypeScript Config — Strict Mode (mandatory)

**packages/typescript-config/base.json:**
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"]
  }
}
```

**packages/typescript-config/nestjs.json:**
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./"
  }
}
```

**packages/typescript-config/nextjs.json:**
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "module": "esnext",
    "jsx": "preserve",
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### apps/api/fly.toml — MANDATORY CONFIG

```toml
app = "ridenrest-api"
primary_region = "cdg"  # Paris — closest to target users (Spain/France bikepacking)

[build]

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = false  # Always-on required (no cold starts for API)
  auto_start_machines = true

[[vm]]
  memory = '512mb'
  cpu_kind = 'shared'
  cpus = 1
```

> ⚠️ **NEVER use 256MB free tier** — NestJS + BullMQ workers reach ~230MB at idle → OOM kill under load. 512MB = ~$1.94/month on shared-cpu-1x.

### Package Naming Convention

All packages use scoped names under `@ridenrest/`:

| Package folder | name in package.json |
|---|---|
| `packages/database` | `@ridenrest/database` |
| `packages/shared` | `@ridenrest/shared` |
| `packages/gpx` | `@ridenrest/gpx` |
| `packages/ui` | `@ridenrest/ui` |
| `packages/typescript-config` | `@ridenrest/typescript-config` |
| `packages/eslint-config` | `@ridenrest/eslint-config` |

Apps reference them with `workspace:*`:
```json
{
  "dependencies": {
    "@ridenrest/shared": "workspace:*",
    "@ridenrest/database": "workspace:*",
    "@ridenrest/gpx": "workspace:*"
  }
}
```

### ESLint Config (packages/eslint-config/index.js)

```js
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
  ],
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
  },
  parserOptions: {
    project: true,
  },
}
```

### Package Stubs — What to Create Now vs Later

This story creates **stubs only** for packages. Do NOT implement logic yet:

**`packages/gpx/src/index.ts`** — export stubs, implementation in Story 1.3:
```typescript
export const haversine = (_a: unknown, _b: unknown): number => 0  // stub
export const rdpSimplify = (points: unknown[]): unknown[] => points  // stub
```

**`packages/database/src/index.ts`** — export db placeholder, schemas in Story 1.2:
```typescript
export {}  // Schemas and db export added in Story 1.2
```

**`packages/shared/src/index.ts`** — export stubs, types in Story 1.3:
```typescript
export {}  // Types, schemas, constants added in Story 1.3
```

### .env.example Files

**`apps/web/.env.local.example`:**
```
# Better Auth
BETTER_AUTH_SECRET=

# Google OAuth (story 2.2)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Resend email (story 2.4)
RESEND_API_KEY=

# API URL
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**`apps/api/.env.example`:**
```
# Database (Aiven PostgreSQL + PostGIS)
DATABASE_URL=

# Cache/Queue (Upstash Redis)
REDIS_URL=

# Auth (same secret as apps/web)
BETTER_AUTH_SECRET=

# Strava OAuth (story 2.3)
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=

# Weather API (story 6.x)
WEATHER_API_KEY=

# Overpass (story 4.x)
OVERPASS_API_URL=https://overpass-api.de/api/interpreter
```

### apps/web App Router Structure — Route Groups

```
apps/web/src/app/
├── layout.tsx           ← Root layout (fonts, global CSS, metadata)
├── globals.css          ← Tailwind CSS v4 directives
├── not-found.tsx        ← Global 404
├── (marketing)/         ← SSG pages — NO auth required — SEO indexed
│   ├── page.tsx         ← Landing page
│   ├── about/page.tsx
│   ├── privacy/page.tsx
│   ├── terms/page.tsx
│   └── _components/
├── (app)/               ← CSR pages — auth-gated — noindex
│   ├── layout.tsx       ← Auth guard wrapper layout
│   └── adventures/
│       └── page.tsx     ← Placeholder
└── api/
    └── auth/
        └── [...all]/
            └── route.ts ← Better Auth catch-all (stub in 1.1, wired in 2.1)
```

> **Key rule:** `(marketing)/` = SSG, no auth. `(app)/` = client-rendered, auth-gated. NEVER add auth checks in marketing pages. NEVER add SSG to app pages.

### apps/api NestJS Structure — Stubs Only

Only scaffold `common/` and `config/` in this story. Feature modules (`adventures`, `segments`, etc.) are added in their respective epics.

```
apps/api/src/
├── main.ts                            ← NestJS entry, port 3001
├── app.module.ts                      ← Root module (imports: ConfigModule)
├── config/
│   ├── database.config.ts             ← Pool config stub (Pool imported but not connected yet)
│   ├── redis.config.ts                ← Redis provider stub
│   └── bullmq.config.ts              ← BullMQ config stub
└── common/
    ├── guards/
    │   └── jwt-auth.guard.ts          ← Stub — throws 501 "Not implemented" (wired in 2.1)
    ├── filters/
    │   └── http-exception.filter.ts   ← Implement NOW (used by all modules)
    ├── interceptors/
    │   └── response.interceptor.ts    ← Implement NOW (wraps { data: ... })
    └── decorators/
        └── current-user.decorator.ts  ← Stub (wired in 2.1)
```

> `ResponseInterceptor` and `HttpExceptionFilter` must be IMPLEMENTED (not stubbed) in this story. They are global and all future modules depend on them.

### ResponseInterceptor Implementation (implement now)

```typescript
// apps/api/src/common/interceptors/response.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, { data: T }> {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<{ data: T }> {
    return next.handle().pipe(map((data) => ({ data })))
  }
}
```

### HttpExceptionFilter Implementation (implement now)

```typescript
// apps/api/src/common/filters/http-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR

    const message = exception instanceof HttpException
      ? exception.message
      : 'Internal server error'

    response.status(status).json({
      error: { code: HttpStatus[status], message },
    })
  }
}
```

### main.ts — Global Pipe, Filter, Interceptor

```typescript
// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new HttpExceptionFilter())
  app.setGlobalPrefix('api')
  await app.listen(3001)
}
bootstrap()
```

### Naming Conventions Reference

| Thing | Convention | Example |
|---|---|---|
| DB table names | `snake_case` plural | `adventure_segments` |
| DB columns | `snake_case` | `order_index`, `user_id` |
| DB FK | `{singular}_id` | `adventure_id` |
| DB index | `idx_{table}_{col}` | `idx_adventure_segments_adventure_id` |
| REST resources | plural kebab-case | `/adventures`, `/adventure-segments` |
| REST route params | `:id` (UUID) | `/adventures/:id` |
| REST query params | camelCase | `?fromKm=10&toKm=50` |
| TS variables/functions | camelCase | `adventureId`, `parseGpxFile()` |
| TS Types/Interfaces | PascalCase | `Adventure`, `GpxSegment` |
| TS constants | SCREAMING_SNAKE_CASE | `MAX_GPX_POINTS` |
| Next.js files | kebab-case.tsx | `adventure-card.tsx` |
| NestJS files | kebab-case.{type}.ts | `adventures.service.ts` |
| API JSON fields | camelCase | `adventureId`, `totalDistanceKm` |
| Stores | `use{Domain}Store` | `useMapStore`, `useUIStore` |

### Project Structure Notes

- Alignment with `_bmad-output/project-context.md` — this is the single source of truth for all conventions
- This story creates the skeleton only — no DB connections, no auth, no feature logic
- All packages start as stubs; they are fleshed out in Stories 1.2 and 1.3
- `ResponseInterceptor` and `HttpExceptionFilter` are the ONLY non-stub implementations in this story
- No Docker or docker-compose — local dev runs natively with `turbo dev`

### Scope Boundaries — What NOT to Implement in This Story

- ❌ NO database connection or Drizzle setup (Story 1.2)
- ❌ NO Zod schemas or shared types (Story 1.3)
- ❌ NO GPX utility logic (Story 1.3)
- ❌ NO BullMQ workers/processors (Story 1.4)
- ❌ NO Better Auth wiring (Story 2.1)
- ❌ NO Swagger setup (Story 1.4)
- ❌ NO shadcn/ui components (Story 1.5)
- ❌ NO TanStack Query or Zustand stores (Story 1.5)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Monorepo Structure]
- [Source: _bmad-output/planning-artifacts/architecture.md — apps/web folder structure]
- [Source: _bmad-output/planning-artifacts/architecture.md — apps/api folder structure]
- [Source: _bmad-output/planning-artifacts/architecture.md — packages/ structure]
- [Source: _bmad-output/planning-artifacts/architecture.md — Environment Variables]
- [Source: _bmad-output/planning-artifacts/architecture.md — Fly.io Config]
- [Source: _bmad-output/project-context.md — Critical Implementation Rules]
- [Source: _bmad-output/project-context.md — Naming Conventions]
- [Source: _bmad-output/project-context.md — NestJS Architecture Rules]
- [Source: _bmad-output/project-context.md — Next.js App Router Rules]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.1 AC]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **pnpm not installed** → Installed globally via `npm install -g pnpm`
- **Turborepo scope issue** → `turbo dev`/`turbo lint`/`turbo build` without `--filter='*'` only ran api in Turbo v2 — fixed root scripts with `--filter='*'`
- **`tsc` not found in packages** → Added `typescript` to root devDependencies (hoisted by pnpm)
- **`outDir` resolved to wrong path** → TypeScript `extends` resolves relative paths from source config file; overrode `"outDir": "./dist"` explicitly in `apps/api/tsconfig.json`
- **NestJS 11 uses nodenext** → Updated `packages/typescript-config/nestjs.json` from `commonjs` to `nodenext` module
- **eslint-plugin-prettier missing** → Removed prettier from api eslint config (not in story scope)
- **class-validator missing** → Added `class-validator` + `class-transformer` to api dependencies (required by NestJS ValidationPipe)

### Completion Notes List

- Monorepo initialized manually (directory pre-existed with BMAD artifacts, `pnpm create turbo` was not applicable)
- apps/web scaffolded via `pnpm create next-app@15` with App Router; src/ dir added manually
- apps/api scaffolded via `@nestjs/cli new` — NestJS 11 with nodenext module
- `ResponseInterceptor` and `HttpExceptionFilter` FULLY IMPLEMENTED (not stubs): verified with `curl http://localhost:3001/api` returning `{"data":"Hello World!"}`
- All shared packages created as stubs: database, shared, gpx, ui
- `turbo run lint --filter='*'` — 6/6 successful, ZERO errors (4 warnings: `_request` unused in auth stub, floating promise in bootstrap())
- `turbo run build --filter='*'` — 6/6 successful
- `turbo run dev --filter='*'` — web on :3000 ✅, api on :3001 ✅ (verified via curl)
- No unit tests written: this story is pure infrastructure scaffolding — the "tests" are the turbo validation commands (Task 5). No business logic to unit test.

### File List

- `package.json` (root)
- `pnpm-workspace.yaml`
- `turbo.json`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/.env.local.example`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/(marketing)/page.tsx`
- `apps/web/src/app/(app)/layout.tsx`
- `apps/web/src/app/(app)/adventures/page.tsx`
- `apps/web/src/app/api/auth/[...all]/route.ts`
- `apps/web/src/middleware.ts`
- `apps/web/next.config.ts`
- `apps/web/postcss.config.mjs`
- `apps/web/eslint.config.mjs`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/tsconfig.build.json`
- `apps/api/eslint.config.mjs`
- `apps/api/nest-cli.json`
- `apps/api/fly.toml`
- `apps/api/.env.example`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/app.controller.ts`
- `apps/api/src/app.service.ts`
- `apps/api/src/config/database.config.ts`
- `apps/api/src/config/redis.config.ts`
- `apps/api/src/config/bullmq.config.ts`
- `apps/api/src/common/guards/jwt-auth.guard.ts`
- `apps/api/src/common/filters/http-exception.filter.ts`
- `apps/api/src/common/interceptors/response.interceptor.ts`
- `apps/api/src/common/decorators/current-user.decorator.ts`
- `packages/typescript-config/package.json`
- `packages/typescript-config/base.json`
- `packages/typescript-config/nextjs.json`
- `packages/typescript-config/nestjs.json`
- `packages/eslint-config/package.json`
- `packages/eslint-config/index.js`
- `packages/database/package.json`
- `packages/database/tsconfig.json`
- `packages/database/eslint.config.mjs`
- `packages/database/drizzle.config.ts`
- `packages/database/src/index.ts`
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/eslint.config.mjs`
- `packages/shared/src/index.ts`
- `packages/gpx/package.json`
- `packages/gpx/tsconfig.json`
- `packages/gpx/eslint.config.mjs`
- `packages/gpx/src/index.ts`
- `packages/gpx/src/haversine.ts`
- `packages/gpx/src/rdp.ts`
- `packages/gpx/src/corridor.ts`
- `packages/gpx/src/parser.ts`
- `packages/ui/package.json`
- `packages/ui/tsconfig.json`
- `packages/ui/eslint.config.mjs`
- `packages/ui/src/index.ts`
