# Story 14.1: Docker Compose — Services infra + Environnement local unifié

Status: done

<!-- Fusion des stories 14.1 et 14.3 — 2026-03-25
     Raison : les deux sont indissociables — docker-compose.yml non testable sans brancher les apps dessus.
     Story 14.3 marquée cancelled dans sprint-status.yaml -->

## Story

As a **developer**,
I want a `docker-compose.yml` that runs PostgreSQL+PostGIS and Redis, and local `.env` files pointing to these local services,
So that I can start the full local stack with two commands (`docker compose up -d db redis` + `turbo dev`) and validate everything works — without relying on Aiven or Upstash.

## Acceptance Criteria

**Infrastructure (docker-compose.yml)**

1. **Given** `docker compose up -d db redis` is run, **When** containers start, **Then** PostgreSQL 16 + PostGIS 3.4 is accessible on `localhost:5432` and Redis 7 on `localhost:6379` with credentials from `.env`.

2. **Given** the `docker-compose.yml` is configured, **When** inspecting service definitions, **Then** PostgreSQL and Redis use named volumes (`pgdata`, `redisdata`) for data persistence across container restarts.

3. **Given** Caddy is defined in `docker-compose.yml` with `profiles: ["production"]`, **When** running `docker compose up -d db redis` locally, **Then** Caddy does NOT start — only db and redis containers run.

4. **Given** Caddy is configured via `Caddyfile`, **When** running `docker compose --profile production up -d` on the VPS, **Then** `ridenrest.com` proxies to Next.js (`localhost:3011`), `api.ridenrest.com` proxies to NestJS (`localhost:3010`), with automatic HTTPS via Let's Encrypt.

5. **Given** environment variables are needed, **When** `.env.example` is copied to `.env`, **Then** all required variables are documented with sensible local defaults (`POSTGRES_USER=ridenrest`, `POSTGRES_PASSWORD=ridenrest`, `POSTGRES_DB=ridenrest`).

**Environnement local unifié**

6. **Given** `turbo dev` is run after infra services are up, **When** Next.js and NestJS start in dev mode, **Then** `DATABASE_URL` points to local PostgreSQL (`postgresql://ridenrest:ridenrest@localhost:5432/ridenrest`) and `REDIS_URL` to local Redis (`redis://localhost:6379`).

7. **Given** a developer modifies source code in `apps/api/` or `apps/web/`, **When** the file is saved, **Then** hot-reload works exactly as before (NestJS watch, Next.js Fast Refresh) — no Docker rebuild needed for app code.

8. **Given** `docker compose down -v` is run, **When** volumes are destroyed, **Then** all data is wiped; `drizzle-kit migrate` re-creates the full schema on next `turbo dev`.

9. **Given** BullMQ is configured with `REDIS_URL=redis://localhost:6379`, **When** a density or GPX parsing job is enqueued, **Then** the job is processed correctly without Upstash-specific options (`maxRetriesPerRequest: null`, `enableReadyCheck: false`).

10. **Given** Better Auth is configured with `BETTER_AUTH_URL=http://localhost:3011`, **When** the user logs in via Google or Strava in dev, **Then** OAuth redirects resolve correctly on localhost.

## Tasks / Subtasks

- [x] Task 1 — Créer `docker-compose.yml` à la racine du repo (AC: 1, 2, 3, 4)
  - [x] Service `db` : image `postgis/postgis:16-3.4`, port `5432:5432`, volume `pgdata`, variables depuis `.env`, healthcheck `pg_isready`
  - [x] Service `redis` : image `redis:7-alpine`, port `6379:6379`, volume `redisdata`, healthcheck `redis-cli ping`, `command: redis-server --appendonly yes`
  - [x] Service `caddy` : image `caddy:2-alpine`, `profiles: ["production"]`, ports `80:80` et `443:443`, mount `./Caddyfile:/etc/caddy/Caddyfile:ro`, volumes `caddy_data` et `caddy_config`, `extra_hosts: ["host.docker.internal:host-gateway"]`
  - [x] Volumes nommés déclarés : `pgdata`, `redisdata`, `caddy_data`, `caddy_config`

- [x] Task 2 — Créer `Caddyfile` à la racine du repo (AC: 4)
  - [x] Bloc VPS : `ridenrest.com` → `reverse_proxy host.docker.internal:3011`, `api.ridenrest.com` → `reverse_proxy host.docker.internal:3010`
  - [x] HTTPS automatique Let's Encrypt via `email {$ACME_EMAIL}`
  - [x] Headers sécurité : `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Strict-Transport-Security "max-age=31536000; includeSubDomains"`

- [x] Task 3 — Créer `.env.example` à la racine (AC: 5)
  - [x] Variables Docker : `POSTGRES_USER=ridenrest`, `POSTGRES_PASSWORD=ridenrest`, `POSTGRES_DB=ridenrest`
  - [x] Variables Caddy/VPS commentées : `ACME_EMAIL=` (prod seulement)
  - [x] Commentaire inline sur chaque variable ; vérifier que `.env.example` est dans git et `.env` dans `.gitignore`
  - Note: `DATABASE_URL` et `REDIS_URL` ne sont PAS dans `.env.example` (ils vont dans `apps/api/.env` et `apps/web/.env.local`, pas dans le `.env` Docker)

- [x] Task 4 — Mettre à jour `apps/api/.env` avec les URLs locales (AC: 6, 9)
  - [x] Remplacer `DATABASE_URL` → `postgresql://ridenrest:ridenrest@localhost:5432/ridenrest`
  - [x] Remplacer `REDIS_URL` → `redis://localhost:6379`
  - [x] Commenter les anciennes URLs Aiven / Upstash avec `# PROD (conserver jusqu'à Story 14.7) :`
  - [x] Vérifier que `PORT=3010` est présent (sans ça NestJS démarre sur 3000, port réservé sur la machine de Guillaume)

- [x] Task 5 — Mettre à jour `apps/web/.env.local` avec les configs locales (AC: 6, 10)
  - [x] `DATABASE_URL=postgresql://ridenrest:ridenrest@localhost:5432/ridenrest`
  - [x] `BETTER_AUTH_URL=http://localhost:3011`
  - [x] `NEXT_PUBLIC_API_URL=http://localhost:3010`
  - [x] Vérifier présence : `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`

- [x] Task 6 — Créer `packages/database/.env` pour drizzle-kit (AC: 8)
  - [x] `DATABASE_URL=postgresql://ridenrest:ridenrest@localhost:5432/ridenrest`
  - [x] Vérifier que `packages/database/.env` est dans `.gitignore` (pattern `.env` racine couvre tous les sous-dossiers)

- [x] Task 7 — Corriger SSL dans `packages/database/src/db.ts` et `auth-db.ts` (AC: 6)
  - [x] Ajouter détection localhost : si `DATABASE_URL` contient `localhost` ou `127.0.0.1` → `ssl: false`
  - [x] Préserver la logique SSL existante pour les URLs de prod (Aiven avec `sslmode=require`)
  - [x] Même fix appliqué à `packages/database/src/auth-db.ts` (pool Better Auth — oubli initial)

- [x] Task 8 — Corriger la config BullMQ dans `apps/api/src/config/bullmq.config.ts` (AC: 9)
  - [x] Rendre `maxRetriesPerRequest: null` et `enableReadyCheck: false` conditionnels : uniquement si `REDIS_URL` commence par `rediss://`

- [x] Task 9 — Valider le stack local complet (AC: 1, 6, 7, 8)
  - [x] `docker compose up -d db redis` démarre sans erreur, healthchecks `healthy`
  - [x] `pnpm --filter @ridenrest/database exec drizzle-kit migrate` — toutes les migrations passent
  - [x] `SELECT PostGIS_version();` retourne 3.4.x (3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1)
  - [x] `turbo dev` — Next.js sur 3011, NestJS sur 3010 (NestJS répond sur localhost:3010)
  - [x] Hot-reload NestJS et Fast Refresh Next.js fonctionnent (Fast Refresh confirmé dans console browser)
  - [x] `docker compose down -v` puis cycle complet depuis zéro — tout repart proprement
  - [x] Fix découvert pendant validation : `auth-db.ts` avait le même bug SSL → même correction appliquée
  - [x] Fix découvert pendant validation : migration `0005_add_density_categories` absente du journal → ajoutée dans `_journal.json`
  - [x] Fix découvert pendant validation : `docker-compose.yml` platform `linux/amd64` ajouté pour postgis (pas de build ARM64 natif)
  - [x] Fix découvert pendant validation : `WeatherLayer` cleanup crash sur `map.getLayer` quand `map.style` est null après `map.remove()` → try-catch ajouté

- [x] Task 10 — Créer `scripts/dev-setup.sh` (AC: cohérence onboarding)
  - [x] Script reproductible : copy .env.example → .env, docker compose up, wait healthcheck, drizzle-kit migrate, vérifier PostGIS

- [x] Task 11 — Archiver les fichiers Fly.io (AC: cohérence repo)
  - [x] Déplacer `apps/api/fly.toml` → `_deprecated/fly.toml`
  - [x] Annoter `apps/api/Dockerfile` avec un commentaire header indiquant qu'il est obsolète (Fly.io uniquement, à supprimer en Story 14.7)

### Review Follow-ups (AI)

- [ ] [AI-Review][HIGH] Vérifier `packages/database/migrations/0004_add_density_progress.sql` — fichier orphelin avec index `0004` en doublon de `0004_mysterious_wildside.sql`. Le journal ne le référence pas. À supprimer ou à confirmer qu'il est intentionnel avant le prochain `drizzle-kit generate`. [packages/database/migrations/]

## Dev Notes

### Architecture hybride VPS — Pattern fondamental

Cette story pose les bases de l'architecture VPS hybride :
- **Docker** = services infra (PostgreSQL+PostGIS, Redis, Caddy) → `docker compose up/down`
- **Node.js natif + PM2** = apps (Next.js, NestJS) → `turbo build && pm2 restart` → Story 14.2

Le `docker-compose.yml` sert deux usages :
1. **Local dev** : `docker compose up -d db redis` — Caddy ne démarre pas (profile `production`)
2. **VPS prod** : `docker compose --profile production up -d` — tout tourne, Caddy gère le SSL

### Structure des fichiers .env dans le monorepo

**Trois niveaux, rôles distincts :**

```
/ (racine repo)
├── .env                    ← Docker Compose UNIQUEMENT
│                             (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB)
│                             NE PAS mettre DATABASE_URL ici pour les apps Node.js
├── .env.example            ← Template documentaire, commité dans git
│
├── apps/api/
│   └── .env                ← NestJS (@nestjs/config ConfigModule.forRoot())
│                             DATABASE_URL, REDIS_URL, PORT=3010, etc.
│
└── apps/web/
    └── .env.local          ← Next.js (chargé automatiquement en dev)
                              DATABASE_URL, BETTER_AUTH_URL, OAuth keys, etc.
```

**Règle clé** : Docker Compose lit le `.env` racine pour les variables des *containers*. Les apps Node.js lisent leurs propres `.env`. Pas de cascade automatique.

### docker-compose.yml — template complet

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    command: redis-server --appendonly yes

  caddy:
    image: caddy:2-alpine
    profiles: ["production"]
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    extra_hosts:
      - "host.docker.internal:host-gateway"   # ← CRITIQUE sur Linux VPS

volumes:
  pgdata:
  redisdata:
  caddy_data:
  caddy_config:
```

### Caddy : `host.docker.internal` sur Linux

Sur Linux/VPS, `host.docker.internal` n'est pas résolu automatiquement (contrairement à macOS Docker Desktop). L'instruction `extra_hosts: ["host.docker.internal:host-gateway"]` est obligatoire pour que Caddy puisse proxier vers les processus Node.js natifs sur l'hôte.

Le Caddyfile doit utiliser `host.docker.internal` (pas `localhost`) :
```caddyfile
{
  email {$ACME_EMAIL}
}

ridenrest.com {
  reverse_proxy host.docker.internal:3011
  header {
    X-Frame-Options DENY
    X-Content-Type-Options nosniff
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
  }
}

api.ridenrest.com {
  reverse_proxy host.docker.internal:3010
  header {
    X-Frame-Options DENY
    X-Content-Type-Options nosniff
  }
}
```

### PostGIS : extension automatique

L'image `postgis/postgis:16-3.4` active PostGIS automatiquement dans la base créée par `POSTGRES_DB`. **Ne pas ajouter `CREATE EXTENSION postgis` dans les migrations Drizzle** — c'est déjà fait par l'image.

Si PostGIS n'est pas présent après migration (cas rare) :
```bash
docker compose exec db psql -U ridenrest -d ridenrest -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### Correction SSL dans `packages/database/src/db.ts`

```typescript
const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')

const sslConfig = isLocal
  ? false
  : process.env.DATABASE_CA_CERT
    ? { rejectUnauthorized: true, ca: Buffer.from(process.env.DATABASE_CA_CERT, 'base64').toString() }
    : (() => {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        return { rejectUnauthorized: false }
      })()
```

### Correction BullMQ dans `apps/api/src/config/bullmq.config.ts`

```typescript
const redisUrl = process.env['REDIS_URL'] ?? ''
const isUpstash = redisUrl.startsWith('rediss://')

export const bullmqConfig: QueueOptions = {
  connection: {
    url: redisUrl,
    ...(isUpstash && {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    }),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
}
```

### PORT=3010 dans apps/api/.env — critique

`apps/api/package.json` : `"dev": "nest start --watch"` — NestJS lit `PORT` depuis l'env. Sans `PORT=3010`, il démarre sur **3000** qui est réservé sur la machine de Guillaume. Toujours vérifier que `PORT=3010` est présent dans `apps/api/.env`.

### Better Auth — `apps/web` se connecte directement à PostgreSQL

Better Auth dans `apps/web/src/lib/auth/auth.ts` utilise `authDb` (pool séparé dans `packages/database/src/auth-db.ts`) — il lit `DATABASE_URL` directement, pas via l'API NestJS. C'est pourquoi `DATABASE_URL` doit être dans **les deux** `apps/api/.env` ET `apps/web/.env.local`.

### Workflow drizzle-kit migrate

```bash
docker compose up -d db redis
# attendre que db soit "healthy"
pnpm --filter @ridenrest/database exec drizzle-kit migrate
# vérifier PostGIS
docker compose exec db psql -U ridenrest -d ridenrest -c "SELECT PostGIS_version();"
```

### Ce que cette story NE fait PAS

- **PM2 / ecosystem.config.js** → Story 14.2
- **CI/CD GitHub Actions** → Story 14.5
- **Backups PostgreSQL** → Story 14.4
- **Uptime Kuma** → Story 14.6 (sera ajouté au docker-compose.yml — la structure doit permettre l'ajout facile)
- **Plausible CE** → Story 15.1 (idem)
- **Migration données Aiven / suppression Upstash** → Story 14.7
- **Aiven et Upstash NE sont PAS supprimés** — la prod continue de tourner sur eux pendant que le dev bascule en local

### Ports du projet (ne pas changer)

| Service | Port |
|---|---|
| NestJS API | 3010 |
| Next.js Web | 3011 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Caddy HTTP | 80 |
| Caddy HTTPS | 443 |

3000/3001 sont réservés par d'autres projets sur la machine locale de Guillaume.

### References

- Architecture VPS hybride : `_bmad-output/planning-artifacts/architecture.md` — Addendum 2026-03-21
- Epics : `_bmad-output/planning-artifacts/epics.md` — Epic 14, Stories 14.1 et 14.3
- Ports : `project-context.md` — commentaire `<!-- Ports: API → 3010, Web → 3011 -->`
- Pool Drizzle : `project-context.md` — section "Drizzle Pool Configuration"
- BullMQ config actuelle : `apps/api/src/config/bullmq.config.ts`
- Database pool : `packages/database/src/db.ts`
- Better Auth config : `apps/web/src/lib/auth/auth.ts`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-03-25)

### Debug Log References

- Docker Compose syntax validated: `docker compose config --quiet` — OK (warnings sur variables manquantes sans `.env` sont normaux)
- BullMQ unit tests: 3/3 passed
- Full API test suite: 157 tests, 18 suites — all passed, no regressions
- Full web test suite: 548 tests, 55 suites — all passed, no regressions
- ESLint API: clean after typing `require()` return in test file

### Completion Notes List

- ✅ Task 1: `docker-compose.yml` créé — services db (postgis/postgis:16-3.4), redis (redis:7-alpine), caddy (profiles: production). Volumes nommés: pgdata, redisdata, caddy_data, caddy_config. extra_hosts pour Linux VPS.
- ✅ Task 2: `Caddyfile` créé — reverse proxy ridenrest.com:3011 et api.ridenrest.com:3010, headers sécurité, ACME email via env var.
- ✅ Task 3: `.env.example` créé — variables Docker uniquement (POSTGRES_USER/PASSWORD/DB + ACME_EMAIL commenté). Note: DATABASE_URL et REDIS_URL vont dans les .env des apps, pas dans le .env Docker.
- ⚠️ Tasks 4, 5, 6: Fichiers `.env` protégés par les permissions Claude Code — nécessitent modification manuelle (voir instructions ci-dessus dans les tasks).
- ✅ Task 7: `packages/database/src/db.ts` et `auth-db.ts` — SSL conditionnel localhost (isLocal → ssl: false). `auth-db.ts` oublié initialement, corrigé pendant validation.
- ✅ Task 8: `apps/api/src/config/bullmq.config.ts` — isUpstash = redisUrl.startsWith('rediss://'). Options Upstash uniquement si vrai. Tests unitaires écrits et passent.
- ✅ Task 9: Stack validé en totalité. Fixes supplémentaires découverts : (1) `_journal.json` — migration `0005_add_density_categories` manquante intégrée ; (2) `docker-compose.yml` — platform linux/amd64 pour postgis (Apple Silicon) ; (3) `WeatherLayer` — try-catch dans cleanup pour map.style null post-remove.
- ✅ Task 10: `scripts/dev-setup.sh` créé — script reproductible complet avec healthcheck poll, migrations, vérification PostGIS.
- ✅ Task 11: `apps/api/fly.toml` déplacé vers `_deprecated/fly.toml`. `apps/api/Dockerfile` annoté OBSOLETE.

### File List

- `docker-compose.yml` (créé)
- `Caddyfile` (créé)
- `.env.example` (créé)
- `apps/api/.env` (à modifier manuellement — URLs locales, jamais commité)
- `apps/web/.env.local` (à modifier manuellement — URLs locales, jamais commité)
- `packages/database/.env` (à modifier manuellement — pour drizzle-kit, jamais commité)
- `packages/database/src/db.ts` (modifié — SSL conditionnel localhost)
- `packages/database/src/auth-db.ts` (modifié — même fix SSL conditionnel)
- `packages/database/migrations/meta/_journal.json` (modifié — ajout entrée 0005_add_density_categories)
- `apps/api/src/config/bullmq.config.ts` (modifié — options Upstash conditionnelles)
- `apps/web/src/app/(app)/map/[id]/_components/weather-layer.tsx` (modifié — try-catch cleanup map.style null)
- `apps/api/src/config/bullmq.config.test.ts` (créé — tests unitaires BullMQ)
- `scripts/dev-setup.sh` (créé)
- `_deprecated/fly.toml` (déplacé depuis `apps/api/fly.toml`)
- `apps/api/fly.toml` (supprimé)
- `apps/api/Dockerfile` (annoté OBSOLETE, non supprimé)
