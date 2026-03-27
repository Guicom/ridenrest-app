# Story 14.6: Monitoring — Uptime Kuma

Status: done

## Story

As a **developer managing a production VPS**,
I want basic monitoring and alerting via Uptime Kuma,
So that I know immediately if the app goes down or the VPS runs out of resources.

## Acceptance Criteria

1. **Given** Uptime Kuma is added to `docker-compose.yml`, **When** `docker compose --profile production up -d` is run, **Then** the Uptime Kuma container starts and its web UI is accessible via Caddy at `https://status.ridenrest.app` protected by HTTP basic auth.

2. **Given** `status.ridenrest.app` is accessed without credentials, **When** the browser sends the request to Caddy, **Then** Caddy returns a 401 and prompts for basic auth credentials (user/password stored as env vars in `.env`).

3. **Given** monitors are configured in the Uptime Kuma UI, **When** checking monitor list, **Then** the following monitors exist:
   - HTTP(s): `https://ridenrest.app` (web app)
   - HTTP(s): `https://api.ridenrest.app/health` (API health — `@Public()` endpoint, no auth needed)
   - TCP: `db:5432` (PostgreSQL via Docker network)
   - TCP: `redis:6379` (Redis via Docker network)

4. **Given** a monitored service goes down, **When** 2 consecutive checks fail (60s interval), **Then** a notification is sent on at least one configured channel (email or Telegram).

5. **Given** a "Push" monitor is configured in Uptime Kuma and a cron script (`scripts/monitor-resources.sh`) runs every 5 minutes, **When** disk usage exceeds 80% OR RAM exceeds 90%, **Then** the push monitor reports `down` and triggers an alert; otherwise it reports `up`.

---

## Tasks / Subtasks

### Task 1 — Add Uptime Kuma service to `docker-compose.yml`

- [x] 1.1 Add `uptime-kuma` service under the `caddy` service block:
  ```yaml
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: ridenrest-uptime-kuma
    profiles: ["production"]
    volumes:
      - uptime-kuma-data:/app/data
    extra_hosts:
      - "host.docker.internal:host-gateway"  # Required on Linux VPS for host TCP checks
    restart: unless-stopped
  ```
  - No `ports` needed — Caddy accesses it via Docker network (`uptime-kuma:3001`)
  - Do NOT expose port 3001 on the host — Caddy is the only gateway
  - `profile: production` → same pattern as Caddy, not started in local dev

- [x] 1.2 Add `uptime-kuma-data` to the `volumes` section at bottom of file:
  ```yaml
  volumes:
    pgdata:
    redisdata:
    caddy_data:
    caddy_config:
    uptime-kuma-data:   # ← add this
  ```

- [x] 1.3 Add `STATUS_USER` and `STATUS_HASHED_PASSWORD` to the `caddy` service environment section:
  ```yaml
  caddy:
    environment:
      ACME_EMAIL: ${ACME_EMAIL}
      STATUS_USER: ${STATUS_USER}
      STATUS_HASHED_PASSWORD: ${STATUS_HASHED_PASSWORD}
  ```

### Task 2 — Update `Caddyfile` with `status.ridenrest.app`

- [x] 2.1 Add new site block at the end of `Caddyfile`:
  ```caddyfile
  status.ridenrest.app {
    basicauth {
      {$STATUS_USER} {$STATUS_HASHED_PASSWORD}
    }
    reverse_proxy uptime-kuma:3001
  }
  ```
  - Caddy accesses `uptime-kuma:3001` via Docker network (service name DNS resolution)
  - `basicauth` uses Caddy's env var substitution (`{$VAR}` syntax, already used by `{$ACME_EMAIL}`)

### Task 3 — Document `.env` additions (VPS + local)

- [x] 3.1 Add to `.env.example` (if exists) or document in Dev Notes the new vars:
  ```
  # Uptime Kuma basic auth for status.ridenrest.app
  STATUS_USER=admin
  STATUS_HASHED_PASSWORD=    # generate with: docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpassword'
  ```
- [x] 3.2 On the VPS, add `STATUS_USER` and `STATUS_HASHED_PASSWORD` to `/home/deploy/ridenrest-app/.env` (the production secret file, never committed)
- [x] 3.3 Caddy's `basicauth` requires a **bcrypt hash** — NOT the plaintext password. Generation command (run once on any machine with Docker):
  ```bash
  docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourSecurePassword'
  # Output example: $2a$14$n4Cx4BmzTZsU5L7G6s3a7eFsO0kE5zz9nMhWQhC5dvG4BfXvsMlFG
  ```
  Paste the full output (including `$2a$14$...`) as `STATUS_HASHED_PASSWORD` in `.env`.

### Task 4 — Create `scripts/monitor-resources.sh` for disk/RAM push monitoring

- [x] 4.1 Create `scripts/monitor-resources.sh`:
  ```bash
  #!/usr/bin/env bash
  # VPS resource monitor — posts to Uptime Kuma Push monitor
  # Configured push URL stored in /home/deploy/ridenrest-app/.env
  # Runs via cron every 5 minutes: */5 * * * * /home/deploy/ridenrest-app/scripts/monitor-resources.sh

  set -e

  APP_DIR="/home/deploy/ridenrest-app"
  PUSH_URL_FILE="$APP_DIR/.uptime-push-url"

  if [[ ! -f "$PUSH_URL_FILE" ]]; then
    echo "ERROR: Push URL file not found at $PUSH_URL_FILE" >&2
    exit 1
  fi

  PUSH_URL="$(cat "$PUSH_URL_FILE" | tr -d '\n')"

  DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
  MEM_USAGE=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2 * 100}')

  MSG="Disk:${DISK_USAGE}% RAM:${MEM_USAGE}%"

  if [ "$DISK_USAGE" -ge 80 ] || [ "$MEM_USAGE" -ge 90 ]; then
    curl -sf "${PUSH_URL}?status=down&msg=${MSG}&ping=" > /dev/null
    echo "[$(date -u +%FT%TZ)] ALERT — $MSG" >> /var/log/ridenrest-monitor.log
  else
    curl -sf "${PUSH_URL}?status=up&msg=${MSG}&ping=" > /dev/null
  fi
  ```

- [x] 4.2 Make executable: `chmod +x scripts/monitor-resources.sh`
- [x] 4.3 The Push URL is stored in a separate file (`.uptime-push-url`) rather than `.env` to keep it isolated and avoid parsing issues. This file is created manually on the VPS after the Push monitor is created in the Uptime Kuma UI.
- [x] 4.4 Document in Dev Notes the one-time VPS setup for this script:
  ```bash
  # 1. Create the Push URL file after getting the URL from Uptime Kuma UI
  echo "https://status.ridenrest.app/api/push/XXXXXXXX" > /home/deploy/ridenrest-app/.uptime-push-url

  # 2. Create the log file
  touch /var/log/ridenrest-monitor.log
  chown deploy:deploy /var/log/ridenrest-monitor.log

  # 3. Add cron job (as deploy user)
  crontab -e
  # Add: */5 * * * * /home/deploy/ridenrest-app/scripts/monitor-resources.sh >> /var/log/ridenrest-monitor.log 2>&1
  ```

### Task 5 — Deploy and configure monitors on VPS (manual steps documented)

- [ ] 5.1 On VPS: add `STATUS_USER` and `STATUS_HASHED_PASSWORD` to `.env`
- [ ] 5.2 On VPS: run `docker compose --profile production up -d` to start Uptime Kuma and reload Caddy
- [ ] 5.3 Open `https://status.ridenrest.app` in browser → verify basic auth prompt → login
- [ ] 5.4 On first launch, create admin account in Uptime Kuma UI
- [ ] 5.5 Add monitors via Uptime Kuma UI (see Dev Notes section 4 for exact settings):
  - HTTP(s) — `ridenrest.app` — 60s interval
  - HTTP(s) — `api.ridenrest.app/health` — 60s interval
  - TCP — `db` — port `5432` — 60s interval
  - TCP — `redis` — port `6379` — 60s interval
  - Push — name "VPS Resources" — copy the generated push URL → save to `.uptime-push-url`
- [ ] 5.6 Add notification channel (email or Telegram) — see Dev Notes section 5
- [ ] 5.7 Configure cron for `monitor-resources.sh` per Task 4.4 docs

> **Note:** Task 5 items are manual VPS operations — cannot be automated. They are documented as-is for execution on the VPS by the developer.

### Review Follow-ups (AI)

- [x] [AI-Review][Med] `sprint-status.yaml` absent du File List story — ajouté
- [x] [AI-Review][Med] `MSG` non URL-encodé dans curl (`monitor-resources.sh`) — remplacé `%` par `pct` et espaces par `+`, ajout log d'erreur curl
- [x] [AI-Review][Med] Security headers absents sur `status.ridenrest.app` (`Caddyfile`) — ajout `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
- [x] [AI-Review][Low] `set -e` sans log local quand curl échoue (`monitor-resources.sh`) — ajout `|| echo ...` sur les deux appels curl

---

## Dev Notes

### 1. Architecture — Why this approach

Uptime Kuma runs as a Docker container in the `production` profile (same as Caddy). It is NOT exposed on the host's public network — only Caddy has a public port, and it reverse-proxies `status.ridenrest.app` to `uptime-kuma:3001` via the internal Docker network.

```
Internet
  └── Caddy :443 (public)
        └── status.ridenrest.app → [basicauth] → uptime-kuma:3001 (internal Docker)
```

Uptime Kuma monitors other Docker services (`db`, `redis`) via Docker DNS (service names). No `extra_hosts` trick needed for those — they're on the same compose network. The `extra_hosts: host.docker.internal:host-gateway` is kept for potential future host-level TCP checks, and mirrors what Caddy already has.

### 2. Uptime Kuma data persistence

Uptime Kuma stores all configuration (monitors, notifications, settings) in a SQLite database inside `/app/data`. The `uptime-kuma-data` named volume ensures this data survives container restarts and `docker compose down` (without `--volumes`).

**Warning:** `docker compose down -v` would delete all Uptime Kuma config — don't use it on production.

### 3. Caddy basicauth — password generation

Caddy's `basicauth` requires a bcrypt hash. The `{$STATUS_HASHED_PASSWORD}` env var must contain the **full bcrypt string**, not the plaintext password.

```bash
# Generate hash (run from any machine with Docker)
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourSecurePassword'
# Output: $2a$14$...

# In VPS .env:
STATUS_USER=admin
STATUS_HASHED_PASSWORD=$2a$14$n4Cx4BmzTZsU5L7G6s3a7eFsO0kE5zz9nMhWQhC5dvG4BfXvsMlFG
```

**Important:** Do NOT put the hash in `.env` with inline comments (`KEY=value # comment`) — the comment would become part of the value. This is a known `.env` gotcha documented in project-context.md.

After updating `.env` on VPS, reload Caddy:
```bash
docker compose --profile production restart caddy
```

### 4. Monitor configuration in Uptime Kuma UI

| Monitor | Type | URL / Host | Port | Interval | Max Retries |
|---|---|---|---|---|---|
| ridenrest.app | HTTP(s) | `https://ridenrest.app` | — | 60s | 2 |
| API Health | HTTP(s) | `https://api.ridenrest.app/health` | — | 60s | 2 |
| PostgreSQL | TCP Port | `db` | `5432` | 60s | 2 |
| Redis | TCP Port | `redis` | `6379` | 60s | 2 |
| VPS Resources | Push | (auto-generated) | — | heartbeat 10min | 1 |

**Notes:**
- For HTTP(s) monitors: expected status 200, keyword check on "ok" for the API health response (`{"status":"ok","version":"...","timestamp":"..."}`)
- For TCP monitors: hostname is `db` and `redis` (Docker DNS from the compose network), NOT `localhost` — Uptime Kuma is inside Docker, so `localhost:5432` would be its own container, not PostgreSQL
- For the Push monitor: Uptime Kuma generates a unique URL like `https://status.ridenrest.app/api/push/XXXXXXXX` — copy it to `.uptime-push-url` on the VPS

### 5. Notification channel setup

**Option A — Email (via Resend):**
Uptime Kuma supports SMTP. Use Resend's SMTP relay:
- SMTP Host: `smtp.resend.com`
- Port: `465` (SSL) or `587` (STARTTLS)
- Username: `resend`
- Password: your `RESEND_API_KEY`
- From: `noreply@ridenrest.app`

**Option B — Telegram (simpler, recommended):**
1. Create a bot via @BotFather on Telegram → get token
2. Start a conversation with the bot → get your Chat ID
3. In Uptime Kuma: Settings → Notifications → Add → Telegram
4. Enter bot token and chat ID

Both options are free. Telegram is simpler for solo dev monitoring.

### 6. Disk/RAM monitoring — Push approach rationale

Uptime Kuma 1.x has no built-in host disk/RAM monitoring (the agent is a separate binary). The **Push** approach is the right trade-off for MVP:
- A cron script checks disk/RAM every 5 minutes
- If OK → pings Uptime Kuma push URL (`?status=up`)
- If threshold exceeded → pings with `?status=down` → triggers notification
- If script fails entirely (cron dies, VPS crash) → push URL times out → Uptime Kuma alerts

The Push URL is stored in `.uptime-push-url` (separate from `.env`) to avoid parsing issues with the special URL characters.

### 7. deploy.sh — No changes needed

The existing `deploy.sh` does NOT restart Docker containers — they run persistently. Uptime Kuma will start once with `docker compose --profile production up -d` and persist across deploys.

If Uptime Kuma needs to be restarted for a config change (e.g., new image version), the developer runs manually:
```bash
docker compose --profile production pull uptime-kuma
docker compose --profile production up -d uptime-kuma
```

### 8. What this story does NOT include

- **Uptime Kuma status page** (public-facing) — could be configured to show a public status page at `status.ridenrest.app` without auth, but that's a UI choice after monitoring is set up
- **Advanced alerting** (PagerDuty, Slack, webhook) — email or Telegram is sufficient for MVP
- **CPU% monitoring** — current `monitor-resources.sh` only checks disk and RAM; CPU spikes are transient and less useful for MVP alerting
- **Log aggregation** — PM2 logs in `/var/log/pm2/` already handle app-level logging

### Project Structure Notes

```
ridenrest-app/
├── docker-compose.yml          ← MODIFIED — add uptime-kuma service + volume + caddy env vars
├── Caddyfile                   ← MODIFIED — add status.ridenrest.app block with basicauth
└── scripts/
    ├── backup.sh               ← existing (story 14.4)
    └── monitor-resources.sh    ← NEW — VPS disk/RAM push monitor cron script
```

No changes to `apps/` or `packages/`. No new dependencies. No changes to `deploy.sh`.

### References

- Story 14.1 — `docker-compose.yml` initial structure, Caddy + extra_hosts pattern
- Story 14.4 — `scripts/` directory, cron pattern, log file creation
- Story 14.5 — `deploy.sh` final version (no changes needed here)
- `apps/api/src/health/health.controller.ts` — `GET /health` endpoint, `@Public()`, returns `{status, version, timestamp}`
- `project-context.md#VPS Deployment Config` — ports, architecture, `.env` inline comment gotcha
- [Uptime Kuma Docker Hub](https://hub.docker.com/r/louislam/uptime-kuma)
- [Caddy basicauth directive](https://caddyserver.com/docs/caddyfile/directives/basicauth)
- [Uptime Kuma Push Monitor docs](https://github.com/louislam/uptime-kuma/wiki/Push-Monitor)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — infra story, no application code.

### Completion Notes List

- **Task 1 (docker-compose.yml)**: Service `uptime-kuma` ajouté avec `profiles: ["production"]`, volume nommé `uptime-kuma-data`, et variables `STATUS_USER`/`STATUS_HASHED_PASSWORD` injectées dans le service `caddy`. Pas d'exposition du port 3001 sur le host — Caddy seul peut joindre `uptime-kuma:3001` via le réseau Docker interne.
- **Task 2 (Caddyfile)**: Bloc `status.ridenrest.app` ajouté avec `basicauth` utilisant les env vars Caddy (`{$STATUS_USER}` / `{$STATUS_HASHED_PASSWORD}`), puis `reverse_proxy uptime-kuma:3001`.
- **Task 3.1 (⚠️ action manuelle requise)**: Le fichier `.env.example` existe mais n'est pas modifiable par Claude (permissions .env exclues pour sécurité). **À faire manuellement** : ajouter les 2 lignes suivantes à `.env.example` :
  ```
  STATUS_USER=admin
  STATUS_HASHED_PASSWORD=    # generate with: docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpassword'
  ```
- **Task 3.2**: Action manuelle VPS (ajout vars `.env` production).
- **Task 4 (scripts/monitor-resources.sh)**: Script créé et rendu exécutable (`chmod +x`). Lit `PUSH_URL` depuis `.uptime-push-url` (fichier séparé de `.env` pour éviter les problèmes de parsing). Alerte si disk ≥ 80% OU RAM ≥ 90%, sinon heartbeat `up`.
- **Task 5**: Étapes VPS manuelles documentées dans le story file — à exécuter après déploiement.
- **Tests**: Pas de tests unitaires/intégration — story purement infra (config YAML, Caddyfile, bash script). Validation syntaxique effectuée : `docker compose config` ✅, `bash -n monitor-resources.sh` ✅.

### Senior Developer Review (AI)

- **Date:** 2026-03-27
- **Outcome:** Changes Requested (auto-fixed)
- **Action Items:** 4 total — 4 Medium/Low, all resolved

#### Action Items

- [x] [Med] `sprint-status.yaml` absent du File List
- [x] [Med] `MSG` non URL-encodé dans curl — `%` et espaces dans query string
- [x] [Med] Security headers absents sur `status.ridenrest.app` (Caddyfile)
- [x] [Low] `set -e` sans log local quand `curl` échoue

### File List

- `docker-compose.yml` — ajout service uptime-kuma, volume uptime-kuma-data, env vars STATUS_USER/STATUS_HASHED_PASSWORD sur caddy
- `Caddyfile` — ajout bloc status.ridenrest.app avec basicauth + reverse_proxy + security headers
- `scripts/monitor-resources.sh` — nouveau script VPS disk/RAM push monitor (exécutable)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — statut 14-6 mis à jour

### Change Log

- 2026-03-27: Story 14.6 — Implémentation Uptime Kuma monitoring. Ajout service Docker, config Caddy basicauth, script cron VPS resource monitor.
- 2026-03-27: Code review fixes — MSG URL encoding, security headers Caddyfile, curl error logging.
