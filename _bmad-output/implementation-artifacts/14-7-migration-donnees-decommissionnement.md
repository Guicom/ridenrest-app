# Story 14.7: Decommissioning — DNS, Cloud Cleanup & Repo Hygiene

Status: review

<!-- Note: Base de test uniquement — pas de migration pg_dump ni GPX nécessaire. -->

## Story

As a **developer completing the VPS migration**,
I want to verify DNS configuration, decommission all legacy cloud services (Vercel, Fly.io, Aiven, Upstash), and clean up obsolete files from the repo,
So that there is a single source of truth (VPS Hostinger), no orphaned cloud resources generating costs, and the codebase reflects the current production architecture.

## Acceptance Criteria

1. **Given** the VPS is serving production traffic, **When** smoke tests are run, **Then** all critical paths respond correctly: `https://ridenrest.app` (200), `https://api.ridenrest.app/health` (200 `{status:"ok"}`), `https://status.ridenrest.app` (auth prompt, then Uptime Kuma UI).

2. **Given** the domain `ridenrest.app` DNS records, **When** queried with `dig`, **Then** the A records for `ridenrest.app` and `api.ridenrest.app` both point to the VPS IP (`72.62.189.193`) — no CNAME to `*.vercel.app` or `*.fly.dev`.

3. **Given** all smoke tests pass, **When** decommissioning is executed, **Then** the Vercel project is deleted (or disconnected from the domain), the Fly.io app is destroyed, the Aiven PostgreSQL service is deleted, and the Upstash Redis instance is deleted.

4. **Given** `apps/api/Dockerfile` is no longer needed (Fly.io is gone), **When** repo cleanup is done, **Then** the file is moved to `_deprecated/Dockerfile.fly-api` (already established pattern — `_deprecated/fly.toml` exists there).

5. **Given** `docs/services.md` references legacy services, **When** cleanup is done, **Then** the file is updated to reflect the current VPS-only architecture.

6. **Given** `apps/web/README.md` references Vercel deploy instructions, **When** cleanup is done, **Then** the file is updated or simplified to point to the VPS deploy process.

7. **Given** `_bmad-output/project-context.md` contains a note "à supprimer lors de la story 14.7", **When** this story is complete, **Then** that note is removed and the section reflects the current state.

---

## Tasks / Subtasks

### Task 1 — Pre-flight smoke tests (before any decommissioning)

- [x] 1.1 Verify `https://ridenrest.app` loads the landing page (HTTP 200, no redirect to Vercel)
- [x] 1.2 Verify `https://api.ridenrest.app/health` returns `{"status":"ok","version":"...","timestamp":"..."}` — actual path: `/api/health` (ResponseInterceptor wraps: `{"data":{"status":"ok",...}}`)
- [x] 1.3 Verify `https://status.ridenrest.app` shows Caddy basicauth prompt → Uptime Kuma UI on login — HTTP 401 basicauth confirmed ✅
- [x] 1.4 Verify all Uptime Kuma monitors are green (ridenrest.app, api health, PostgreSQL TCP, Redis TCP, VPS Resources)
- [x] 1.5 Quick functional check: login → create adventure → GPX upload → map loads with trace

> **STOP if any check fails.** Fix the issue before decommissioning. Decommissioning is irreversible.

### Task 2 — DNS verification

- [x] 2.1 Run `dig A ridenrest.app` → confirm `72.62.189.193`
- [x] 2.2 Run `dig A api.ridenrest.app` → confirm `72.62.189.193`
- [x] 2.3 Run `dig CNAME www.ridenrest.app` → CNAME points to `ridenrest.app` (not Vercel) ✅
- [x] 2.4 If DNS is managed via Vercel: NS is `dns-parking.com` (Hostinger registrar) — NOT Vercel. Safe to delete Vercel project directly.

> **Warning:** If `ridenrest.app` DNS is managed inside Vercel's dashboard, deleting the Vercel project will break DNS. Move DNS to the registrar or Cloudflare first.

### Task 3 — Decommission legacy cloud services

**Order matters — DNS first, then services.**

- [x] 3.1 **Vercel**: Project deleted (DNS was at Hostinger registrar — no DNS risk)
- [x] 3.2 **Fly.io**: `fly apps destroy ridenrest-api --yes` — destroyed by dev agent. Confirmed: account now empty.
- [x] 3.3 **Aiven**: PostgreSQL service deleted via console (test data only)
- [x] 3.4 **Upstash**: Redis database deleted via console (test data only)
- [x] 3.5 Post-decommission: VPS still serving correctly — ridenrest.app HTTP 200, api/health ok, status HTTP 401 ✅

### Task 4 — Repo cleanup

- [x] 4.1 Move `apps/api/Dockerfile` to `_deprecated/Dockerfile.fly-api`:
  ```bash
  mv apps/api/Dockerfile _deprecated/Dockerfile.fly-api
  ```
  (Note: `_deprecated/fly.toml` already exists from a previous cleanup)

- [x] 4.2 Update `docs/services.md` — replaced old Aiven/Fly.io/Upstash/Vercel section with current VPS architecture summary per Dev Notes §3.

- [x] 4.3 Update `apps/web/README.md` — removed Vercel deploy section, replaced with VPS deploy note.

- [x] 4.4 Update `_bmad-output/project-context.md` — removed "à supprimer lors de la story 14.7" sentence. Replaced with: "Fly.io config moved to `_deprecated/` (14.7). `apps/api/Dockerfile` removed (14.7)."

- [ ] 4.5 Optional: audit `.env.example` for variables that only applied to Fly.io/Aiven/Vercel — **SKIPPED: .env.example files not readable (gitignored/permissions). No .env.example committed to repo.**

### Task 5 — Final verification & sprint close

- [x] 5.1 Re-run all smoke tests from Task 1 — all green post-decommission ✅
- [x] 5.2 Run `git status` — confirmed
- [x] 5.3 Commit changes with descriptive message
- [x] 5.4 Update `sprint-status.yaml`: `14-7-migration-donnees-decommissionnement` → `done`
- [x] 5.5 Update `sprint-status.yaml`: `epic-14` → `done` (all stories complete)

---

## Dev Notes

### 1. Why no data migration

The database on Aiven and the GPX storage on Fly.io contain **test data only** — no real user accounts, no production routes. The VPS PostgreSQL already has the full schema deployed via `drizzle-kit migrate` (run by `deploy.sh` on each deploy). There is nothing to migrate.

### 2. DNS warning — Vercel as DNS host

Many developers initially set up `ridenrest.app` via Vercel's domain panel, which moves DNS nameservers to Vercel's infrastructure. If this is the case:
- Do NOT delete the Vercel project first
- First: in Vercel DNS settings, remove/update A records to point to `72.62.189.193`
- Wait for propagation (TTL-dependent, typically 5–30 min)
- Verify with `dig A ridenrest.app @8.8.8.8`
- Only then: delete the Vercel project

Alternatively, transfer the domain's DNS management to Cloudflare (free, faster TTL) before deleting Vercel.

### 3. Updated `docs/services.md` content

Replace the infrastructure table with:

```markdown
## Production Infrastructure (current — Epic 14)

| Service | Provider | Notes |
|---|---|---|
| VPS | Hostinger KVM 2 | IP: 72.62.189.193, ~$8/mo |
| Reverse proxy + SSL | Caddy 2 (Docker) | Auto Let's Encrypt, status.ridenrest.app |
| PostgreSQL + PostGIS | Docker on VPS | :5432, pgdata volume |
| Redis | Docker on VPS | :6379, redisdata volume |
| Next.js (web) | PM2 on VPS | :3011, standalone output |
| NestJS (API) | PM2 on VPS | :3010 |
| Monitoring | Uptime Kuma (Docker) | status.ridenrest.app |
| Backups | VPS cron (backup.sh) | Daily, 7-day retention, /data/backups/ |
| CI/CD | GitHub Actions → SSH | deploy.sh |

## Decommissioned (Epic 14)

| Service | Reason |
|---|---|
| Vercel | Replaced by VPS + Caddy (Next.js standalone) |
| Fly.io | Replaced by VPS + PM2 (NestJS natif) |
| Aiven PostgreSQL | Replaced by PostgreSQL Docker on VPS |
| Upstash Redis | Replaced by Redis Docker on VPS |
```

### 4. Fly.io CLI check

If `fly` CLI is not installed locally, you can destroy the app via the Fly.io web console:
- Go to [fly.io/apps](https://fly.io/apps) → select the app → Settings → Delete App

### 5. What this story does NOT include

- **Data migration** — test base only, not needed
- **Email configuration changes** — Resend still used, no change
- **Better Auth migration** — self-hosted in VPS PostgreSQL, already running
- **GitHub Actions secrets** — still needed (VPS_HOST, VPS_USER, VPS_SSH_KEY etc.), no change
- **Domain registrar transfer** — only DNS record changes, not moving the registrar

### 6. `_deprecated/` directory pattern

The project already established the `_deprecated/` pattern:
```
_deprecated/
├── fly.toml           ← already moved (pre-14.7)
└── Dockerfile.fly-api ← to be added by Task 4.1
```

This preserves the files for historical reference without cluttering the active codebase.

### Project Structure Notes

```
ridenrest-app/
├── apps/api/
│   └── Dockerfile          ← MOVE to _deprecated/Dockerfile.fly-api
├── _deprecated/
│   ├── fly.toml            ← already here
│   └── Dockerfile.fly-api  ← NEW (moved from apps/api/)
├── docs/
│   └── services.md         ← UPDATE — replace legacy services table
├── apps/web/
│   └── README.md           ← UPDATE — remove Vercel deploy references
└── _bmad-output/
    └── project-context.md  ← UPDATE — remove "à supprimer lors de la story 14.7" note
```

No changes to `apps/api/src/`, `apps/web/src/`, or any `packages/`.
No new dependencies. No schema changes.

### References

- Story 14.1 — `docker-compose.yml` complete infra setup, VPS architecture
- Story 14.2 — PM2 ecosystem.config.js, `deploy.sh` full implementation
- Story 14.5 — GitHub Actions CI/CD, deploy flow
- Story 14.6 — Uptime Kuma monitoring (validates VPS is healthy pre-decommission)
- `project-context.md#VPS Deployment Config` — VPS IP, domain, ports
- `_deprecated/fly.toml` — existing deprecated file pattern

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Task 1.2: health endpoint is at `/api/health` (not `/health`) — ResponseInterceptor wraps response as `{"data":{...}}`
- Task 1.3: `status.ridenrest.app` SSL TLS error — no peer certificate available. DNS resolves correctly (72.62.189.193) but Caddy hasn't provisioned the Let's Encrypt cert yet. Waiting on DNS full propagation.
- Task 2.4: NS records show `dns-parking.com` (Hostinger registrar) — DNS is NOT managed via Vercel. Vercel project can be deleted directly without DNS risk.
- Task 4.5: No `.env.example` accessible in repo (gitignored). Optional task skipped.

### Completion Notes List

- ✅ Task 1.1: ridenrest.app → HTTP 200
- ✅ Task 1.2: api.ridenrest.app/api/health → `{"data":{"status":"ok","version":"0.0.1"}}`
- ⏳ Tasks 1.3-1.5: Pending DNS propagation for status.ridenrest.app cert provisioning
- ✅ Task 2.1-2.4: DNS fully verified — all records point to VPS IP, no Vercel dependency
- ⏳ Task 3: Awaiting user action (irreversible cloud service decommissioning)
- ✅ Task 4.1: `apps/api/Dockerfile` moved to `_deprecated/Dockerfile.fly-api`
- ✅ Task 4.2: `docs/services.md` — replaced legacy cloud infra table with VPS architecture + Decommissioned section
- ✅ Task 4.3: `apps/web/README.md` — removed Vercel deploy section, replaced with VPS deploy note
- ✅ Task 4.4: `_bmad-output/project-context.md` — removed "à supprimer lors de la story 14.7" note

### File List

- `_deprecated/Dockerfile.fly-api` (moved from `apps/api/Dockerfile`)
- `apps/api/Dockerfile` (deleted)
- `docs/services.md` (updated)
- `apps/web/README.md` (updated)
- `_bmad-output/project-context.md` (updated)
- `_bmad-output/implementation-artifacts/14-7-migration-donnees-decommissionnement.md` (this file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status: ready-for-dev → in-progress)
