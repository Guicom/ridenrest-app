# Story 14.5: CI/CD — Déploiement automatisé via GitHub Actions

Status: done

## Story

En tant que **développeur pushant sur la branche main**,
je veux un pipeline de déploiement automatisé qui se connecte au VPS via SSH et exécute `deploy.sh`,
afin que la production soit mise à jour sans intervention manuelle après chaque merge sur `main`.

## Acceptance Criteria

1. **Pipeline déclenché sur push main** — Étant donné qu'un push sur `main` déclenche le workflow GitHub Actions, quand le job CI passe (lint, build, test), alors le job deploy démarre automatiquement et se connecte au VPS via SSH.

2. **Déploiement via SSH + deploy.sh** — Étant donné que le job deploy tourne, quand la connexion SSH est établie, alors il exécute `bash /home/deploy/ridenrest-app/deploy.sh` — qui enchaîne `git pull` → `pnpm install` → `turbo build` → copy assets → migrations DB → `pm2 reload`.

3. **Migrations DB sur le VPS** — Étant donné que `deploy.sh` est mis à jour, quand le build est terminé, alors `pnpm --filter @ridenrest/database drizzle-kit migrate` est exécuté sur le VPS (qui a accès à PostgreSQL local), avant le `pm2 reload`.

4. **Fail-safe build** — Étant donné que le build ou les migrations échouent (erreur dans `deploy.sh`), quand `set -e` détecte l'erreur, alors le script s'arrête immédiatement — PM2 conserve les processus précédents en ligne, et le workflow GitHub Actions se termine en échec (rouge).

5. **PM2 online après déploiement** — Étant donné que `deploy.sh` se termine avec succès, quand `pm2 status` est affiché, alors `ridenrest-web` (port 3011) et `ridenrest-api` (port 3010) sont en status `online` avec uptime > 0.

6. **Secrets GitHub configurés** — Étant donné que les secrets GitHub Actions sont configurés, quand le job deploy tourne, alors il utilise uniquement : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` pour la connexion SSH. Les anciens secrets Vercel/Fly.io (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `FLY_API_TOKEN`, `DATABASE_URL`) ne sont plus référencés dans le workflow.

7. **CI build toujours fonctionnel** — Étant donné que le job CI (lint, build, test) reste inchangé pour l'essentiel, quand un PR est ouvert sur `main`, alors le CI tourne sans le job deploy (PRs → CI only, push main → CI + deploy).

## Tasks / Subtasks

### Task 1 — Mettre à jour `deploy.sh` pour inclure les migrations DB

- [x] 1.1 Ajouter l'étape migrations entre le build et le `pm2 reload` (step [5/6])
- [x] 1.2 Utiliser un subshell `( cd packages/database && pnpm drizzle-kit migrate )` — approche choisie à la place du `--filter` Turborepo pour éviter les problèmes de cache et préserver le `cwd` du script parent (voir Dev Notes)
- [x] 1.3 Mettre à jour la numérotation des steps : de [1/5] → [6/5] à [1/6] → [6/6]
- [x] 1.4 Vérifier que `set -e` est toujours en première ligne (arrêt immédiat si erreur)

### Task 2 — Remplacer le job `deploy` dans `.github/workflows/ci.yml`

- [x] 2.1 Supprimer les steps Vercel (install vercel CLI + deploy web → Vercel)
- [x] 2.2 Supprimer les steps Fly.io (setup flyctl + flyctl deploy)
- [x] 2.3 Supprimer la step "Run DB migrations" du job deploy CI (migrations maintenant dans deploy.sh sur le VPS)
- [x] 2.4 Ajouter un step SSH unique avec `appleboy/ssh-action@v1.0.3` (pinned version, voir Dev Notes)
- [x] 2.5 Configurer le step SSH avec : `host: ${{ secrets.VPS_HOST }}`, `username: ${{ secrets.VPS_USER }}`, `key: ${{ secrets.VPS_SSH_KEY }}`
- [x] 2.6 Script SSH : `bash /home/deploy/ridenrest-app/deploy.sh`
- [x] 2.7 Supprimer les étapes Checkout, pnpm, Node.js, install dans le job deploy (le deploy.sh gère tout sur le VPS)
- [x] 2.8 Garder `needs: ci` et `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`

### Task 3 — Nettoyer les références aux anciens services dans ci.yml

- [x] 3.1 Retirer `DATABASE_URL: ${{ secrets.DATABASE_URL }}` du job deploy (DB est locale au VPS)
- [x] 3.2 Garder `BETTER_AUTH_SECRET` et `BETTER_AUTH_URL` dans le job CI build step (toujours requis pour le build Next.js)
- [x] 3.3 Vérifier que le job CI ne référence plus Vercel, Fly.io, Aiven

### Task 4 — Documenter les secrets GitHub Actions à configurer (manuel)

- [x] 4.1 Documenter dans les Dev Notes ci-dessous la liste complète des secrets à créer dans GitHub
- [x] 4.2 Documenter comment générer la clé SSH pour le deploy user (ed25519 recommandé)
- [x] 4.3 Documenter l'ajout de la clé publique dans `~/.ssh/authorized_keys` sur le VPS

## Dev Notes

### 1. `deploy.sh` — Version finale (mise en production 2026-03-26)

```bash
#!/usr/bin/env bash
set -e

APP_DIR="/home/deploy/ridenrest-app"
cd "$APP_DIR"

# Load DATABASE_URL from .env (explicit — avoids quoting/CRLF issues with source)
export DATABASE_URL
DATABASE_URL="$(grep '^DATABASE_URL=' "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '\r' | sed "s/^['\"]//;s/['\"]$//")"
if [[ -z "$DATABASE_URL" ]]; then
  echo "ERROR: DATABASE_URL not found in $APP_DIR/.env" >&2
  exit 1
fi

mkdir -p /data/gpx

echo "==> [1/6] git pull"
git pull origin main

echo "==> [2/6] pnpm install"
pnpm install --frozen-lockfile

echo "==> [3/6] turbo build"
set -a
# shellcheck source=.env
source "$APP_DIR/.env" 2>/dev/null || true
set +a
pnpm turbo build

echo "==> [4/6] Copy Next.js standalone static assets"
rm -rf apps/web/.next/standalone/apps/web/public
rm -rf apps/web/.next/standalone/apps/web/.next/static
cp -r apps/web/public apps/web/.next/standalone/apps/web/public
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

echo "==> [5/6] DB migrations (drizzle-kit)"
( cd packages/database && pnpm drizzle-kit migrate )

echo "==> [6/6] PM2 reload (zero-downtime)"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

echo "==> Deploy done. pm2 status:"
pm2 status
```

**Pourquoi les migrations dans `deploy.sh` et non dans GitHub Actions ?**
PostgreSQL tourne sur `localhost:5432` du VPS — inaccessible depuis les runners GitHub Actions (réseau externe). Les migrations DOIVENT s'exécuter depuis le VPS lui-même. C'est un changement d'architecture par rapport à l'ancien setup où Aiven était accessible depuis partout.

**Pourquoi `( cd packages/database && pnpm drizzle-kit migrate )` avec les parenthèses ?**
Les parenthèses créent un subshell — le `cd` n'affecte pas le répertoire courant du script parent. Après l'étape migrations, on reste dans `$APP_DIR`.

**Pourquoi `DATABASE_URL` avec `grep/cut/tr/sed` et non `source .env` ?**
Via SSH non-interactif, `source .env` peut échouer silencieusement ou mal parser les valeurs avec guillemets. Cette approche explicite garantit que `drizzle-kit migrate` reçoit la valeur exacte, sans CRLF ni guillemets.

**Pourquoi `set -a; source .env; set +a` avant `turbo build` ?**
`NEXT_PUBLIC_*` variables sont embeddées au moment du build. Sans `source .env`, Turbo ne les trouve pas → le build utilise des valeurs vides → erreurs CORS en prod. `set -a` exporte automatiquement toutes les variables sourcées.

**Pourquoi `rm -rf` avant `cp -r` pour les static assets ?**
Turbo conserve son cache d'outputs entre les builds. Sans suppression, les anciens chunks JS s'accumulent dans le dossier standalone. Au runtime, Next.js charge les nouveaux chunks via le manifest mais les hash ne correspondent plus aux anciens fichiers → `ChunkLoadError` en prod.

**Pourquoi `mkdir -p /data/gpx` ?**
Le dossier GPX n'existe pas sur un VPS fraîchement provisionné. Sans ce dossier, les uploads GPX échouent en `ENOENT` avec HTTP 500. `mkdir -p` est idempotent (pas d'erreur si déjà créé).

**`NODE_TLS_REJECT_UNAUTHORIZED=0` supprimé intentionnellement** — Cette variable était nécessaire avec Aiven (SSL auto-signé). Avec PostgreSQL Docker local (pas de SSL, connexion localhost), elle n'est plus nécessaire et serait une vulnérabilité inutile.

---

### 2. `.github/workflows/ci.yml` — Version finale

```yaml
name: CI / CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  PNPM_VERSION: '10.32.1'
  NODE_VERSION: '22'

jobs:
  # ─────────────────────────────────────────────────────
  # Job 1: CI — Lint + Build + Test (ALL pushes + PRs)
  # ─────────────────────────────────────────────────────
  ci:
    name: Lint, Build & Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2   # Turborepo needs git history for diff-based caching

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm turbo run lint --filter='*'

      - name: Build
        run: pnpm turbo run build --filter='*'
        env:
          BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET }}
          BETTER_AUTH_URL: ${{ secrets.BETTER_AUTH_URL }}

      - name: Test
        run: pnpm turbo run test --filter='*'

  # ─────────────────────────────────────────────────────
  # Job 2: Deploy — SSH vers VPS → deploy.sh
  # Only runs on push to main (not PRs) after CI passes
  # ─────────────────────────────────────────────────────
  deploy:
    name: Deploy to VPS
    runs-on: ubuntu-latest
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: bash /home/deploy/ridenrest-app/deploy.sh
```

---

### 3. Secrets GitHub Actions — Configuration manuelle (Settings → Secrets and variables → Actions)

**Secrets à CONSERVER (toujours actifs) :**
| Secret | Usage | Valeur |
|---|---|---|
| `BETTER_AUTH_SECRET` | Build Next.js (CI job) | Secret Better Auth (même que `.env` prod) |
| `BETTER_AUTH_URL` | Build Next.js (CI job) | `https://ridenrest.app` |

**Secrets à AJOUTER (nouveaux) :**
| Secret | Usage | Valeur |
|---|---|---|
| `VPS_HOST` | SSH deploy | IP ou domaine du VPS (ex: `123.456.789.0` ou `ridenrest.app`) |
| `VPS_USER` | SSH deploy | Utilisateur SSH sur le VPS (ex: `deploy`) |
| `VPS_SSH_KEY` | SSH deploy | Clé privée SSH au format PEM (voir ci-dessous) |

**Secrets à SUPPRIMER (obsolètes après migration) :**
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `FLY_API_TOKEN`
- `DATABASE_URL` (DB n'est plus accessible depuis les runners CI)

---

### 4. Génération de la clé SSH pour le deploy (recommandé : ed25519)

```bash
# Sur le MAC du développeur — générer une clé dédiée au CI/CD
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/ridenrest_deploy_ci

# Afficher la clé publique → à copier sur le VPS
cat ~/.ssh/ridenrest_deploy_ci.pub

# Afficher la clé privée → à copier dans GitHub Secret VPS_SSH_KEY
cat ~/.ssh/ridenrest_deploy_ci
```

```bash
# Sur le VPS (SSH manuellement) — ajouter la clé publique
echo "ssh-ed25519 AAAA... github-actions-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**Important :** Coller la clé privée **complète** dans le secret `VPS_SSH_KEY`, incluant les lignes `-----BEGIN OPENSSH PRIVATE KEY-----` et `-----END OPENSSH PRIVATE KEY-----`.

---

### 5. `appleboy/ssh-action` — Version pinned

Toujours pinner une version exacte pour les GitHub Actions (sécurité supply chain) :
- `appleboy/ssh-action@v1.0.3` — version stable, active en mars 2026
- **Ne jamais utiliser** `@master` ou `@latest` pour des actions de déploiement
- Vérifier les releases sur : https://github.com/appleboy/ssh-action/releases

---

### 6. Comportement fail-safe du pipeline

```
Push main
    ↓
[CI job] lint → build → test
    ↓ (si échec → pipeline rouge, deploy NE tourne PAS)
[Deploy job] SSH → deploy.sh
    ├── git pull ← si échec → set -e arrête le script
    ├── pnpm install ← si échec → set -e arrête
    ├── turbo build ← si échec → set -e arrête, PM2 garde l'ancienne version
    ├── copy assets ← si échec → set -e arrête
    ├── drizzle-kit migrate ← si échec → set -e arrête, PM2 garde l'ancienne version
    └── pm2 reload ← seulement si tout a réussi
```

**Point critique :** `set -e` dans `deploy.sh` garantit que PM2 n'est rechargé QUE si tout s'est passé sans erreur. En cas d'échec du build ou des migrations, l'ancienne version reste en production.

---

### 7. `ecosystem.config.js` — Chargement `.env` via fs (correction prod)

Lors du premier déploiement réel (2026-03-26), PM2 ne propageait pas `BETTER_AUTH_SECRET` aux processus enfants. Cause : PM2 ne lit pas `process.env` depuis le shell SSH. Fix : chargement explicite du `.env` via `fs.readFileSync` dans `ecosystem.config.js`, et spreading dans la section `env` de chaque app.

```js
const fs = require('fs');
const path = require('path');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  return fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .reduce((acc, line) => {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (match) acc[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      return acc;
    }, {});
}

const APP_DIR = '/home/deploy/ridenrest-app';
const envVars = loadEnv(path.join(APP_DIR, '.env'));

module.exports = {
  apps: [
    {
      name: 'ridenrest-web',
      script: 'apps/web/.next/standalone/apps/web/server.js',
      cwd: APP_DIR,
      env: { ...envVars, PORT: 3011, NODE_ENV: 'production', HOSTNAME: '0.0.0.0' },
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/pm2/ridenrest-web-error.log',
      out_file: '/var/log/pm2/ridenrest-web-out.log',
      merge_logs: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '5s',
    },
    {
      name: 'ridenrest-api',
      script: 'apps/api/dist/main.js',
      cwd: APP_DIR,
      env: { ...envVars, PORT: 3010, NODE_ENV: 'production' },
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/pm2/ridenrest-api-error.log',
      out_file: '/var/log/pm2/ridenrest-api-out.log',
      merge_logs: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '5s',
    },
  ],
};
```

**Règle critique :** Ne JAMAIS utiliser `env_production:` ou compter sur `process.env` pour les secrets dans un contexte PM2+SSH. Toujours spreader l'objet `envVars` explicitement dans chaque section `env`.

---

### 8. `turbo.json` — Déclaration des env vars pour invalidation cache

`NEXT_PUBLIC_*` variables sont embeddées au build. Si elles ne sont pas déclarées dans `turbo.json#tasks.build.env`, Turbo les ignore pour le calcul du hash de cache → le cache n'est pas invalidé quand les valeurs changent → build stale en prod.

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"],
      "env": [
        "NEXT_PUBLIC_API_URL",
        "NEXT_PUBLIC_BETTER_AUTH_URL",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL"
      ]
    }
  }
}
```

**Symptôme sans cette déclaration :** La prod affichait `http://localhost:3011` comme API URL (valeur de développement cachée) malgré le `.env` VPS correct avec `https://api.ridenrest.app`.

---

### 9. Ce que cette story N'inclut PAS

- **Suppression de `apps/api/fly.toml` et `apps/api/Dockerfile`** → story 14.7 (décommissionnement)
- **Migration des données Aiven → VPS** → story 14.7
- **Monitoring Uptime Kuma** → story 14.6
- **Backups PostgreSQL** → story 14.4
- **Provisionnement SSH sur le VPS** (création user `deploy`, config sudo, etc.) → manuel, documenté dans Epic 14 intro

---

### Project Structure Notes

```
ridenrest-app/
├── deploy.sh                         ← MODIFIÉ — migrations [5/6] + fixes prod (DATABASE_URL, mkdir gpx, source .env, rm-rf static)
├── ecosystem.config.js               ← MODIFIÉ — chargement .env via fs.readFileSync + spread dans env de chaque app
├── turbo.json                        ← MODIFIÉ — ajout tableau env pour invalidation cache NEXT_PUBLIC_*
└── .github/
    └── workflows/
        └── ci.yml                    ← MODIFIÉ — job deploy remplacé (SSH VPS via appleboy/ssh-action)
```

Aucune modification au code applicatif (`apps/`, `packages/`) dans cette story.

**Note sur `ecosystem.config.js` et `turbo.json` :** Ces fichiers appartiennent techniquement à la story 14.2, mais ont été modifiés lors du premier déploiement réel (story 14.5 en prod) suite à des bugs découverts en production. Les changements sont intentionnels et validés par Guillaume.

### References

- Story 14.1 — Docker Compose infra (PostgreSQL :5432, Redis :6379, Caddy) — prérequis
- Story 14.2 — `deploy.sh` et `ecosystem.config.js` créés — base de cette story
- `appleboy/ssh-action` : https://github.com/appleboy/ssh-action
- [GitHub Actions Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- `_bmad-output/memory/project_ports.md` — API :3010, Web :3011
- `project-context.md#VPS Deployment Config` — architecture hybride Docker+PM2

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ✅ `deploy.sh` : 5 steps → 6 steps, ajout migrations drizzle-kit en [5/6] via subshell. `set -e` conservé. Ajouts prod : grep explicite `DATABASE_URL`, `mkdir -p /data/gpx`, `set -a; source .env` avant turbo build, `rm -rf` avant `cp -r` pour assets statiques.
- ✅ `.github/workflows/ci.yml` : job deploy entièrement remplacé — suppression Vercel, Fly.io, DB migrations CI, Checkout/Node/pnpm/install. Remplacement par step SSH unique `appleboy/ssh-action@v1.0.3` avec secrets `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`.
- ✅ `BETTER_AUTH_SECRET` et `BETTER_AUTH_URL` conservés dans le job CI (build Next.js).
- ✅ Task 4 : documentation secrets/SSH présente dans Dev Notes sections 3 et 4 — validée complète.
- ✅ `ecosystem.config.js` (story 14.2) — modifié pour charger `.env` via `fs.readFileSync` et spreader dans `env` de chaque app. Fix requis : PM2 ne propage pas `process.env` via SSH, causait `BetterAuthError` en prod.
- ✅ `turbo.json` — ajout tableau `env` dans `build` task : `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Fix requis : sans cette déclaration, Turbo ignorait les changements d'env dans son hash de cache.
- ℹ️ Pipeline testé et validé en production réelle le 2026-03-26 — site live à `ridenrest.app`.
- ℹ️ Strava OAuth toujours non fonctionnel (erreur côté `strava.com/settings/api`) — problème plateforme Strava, pas notre code.

### Review Follow-ups (AI)

- [ ] [AI-Review][MEDIUM] M2 — Pinner `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` par version exacte (ex: `@v4.2.2`) ou SHA pour cohérence avec la règle supply chain énoncée en Dev Notes section 5 [`.github/workflows/ci.yml`]
- [ ] [AI-Review][MEDIUM] L3 — Regex `ecosystem.config.js` `loadEnv` ne gère pas les valeurs avec espaces internes dans guillemets simples ni les trailing spaces dans guillemets. Peu probable en pratique mais à surveiller si des secrets contiennent des espaces [`ecosystem.config.js:10`]
- [ ] [AI-Review][LOW] L1 — `git pull origin main` hardcode la branche. Remplacer par `git pull` seul pour utiliser le tracking remote configuré [`deploy.sh:18`]

### Completion Notes List

- ✅ `deploy.sh` : 5 steps → 6 steps, ajout migrations drizzle-kit en [5/6] via subshell. `set -e` conservé. Ajouts prod : grep explicite `DATABASE_URL`, `mkdir -p /data/gpx`, `set -a; source .env` avant turbo build, `rm -rf` avant `cp -r` pour assets statiques.
- ✅ `.github/workflows/ci.yml` : job deploy entièrement remplacé — suppression Vercel, Fly.io, DB migrations CI, Checkout/Node/pnpm/install. Remplacement par step SSH unique `appleboy/ssh-action@v1.0.3` avec secrets `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`.
- ✅ `BETTER_AUTH_SECRET` et `BETTER_AUTH_URL` conservés dans le job CI (build Next.js).
- ✅ Task 4 : documentation secrets/SSH présente dans Dev Notes sections 3 et 4 — validée complète.
- ✅ `ecosystem.config.js` (story 14.2) — modifié pour charger `.env` via `fs.readFileSync` et spreader dans `env` de chaque app. Fix requis : PM2 ne propage pas `process.env` via SSH, causait `BetterAuthError` en prod.
- ✅ `turbo.json` — ajout tableau `env` dans `build` task : `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Fix requis : sans cette déclaration, Turbo ignorait les changements d'env dans son hash de cache.
- ℹ️ Pipeline testé et validé en production réelle le 2026-03-26 — site live à `ridenrest.app`.
- ℹ️ Strava OAuth toujours non fonctionnel (erreur côté `strava.com/settings/api`) — problème plateforme Strava, pas notre code.
- ✅ [Code Review 2026-03-26] `ci.yml` : ajout `timeout-minutes` sur les deux jobs (20min CI / 30min deploy) + `command_timeout: 25m` sur appleboy/ssh-action (M1). Ajout `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_BETTER_AUTH_URL` dans les secrets du step Build CI (M3).
- ✅ [Code Review 2026-03-26] `deploy.sh` : ajout warning explicite si `NEXT_PUBLIC_API_URL` vide après source .env (M5). Ajout health check port `nc -z` sur :3010/:3011 post-déploiement (L2).
- ✅ [Code Review 2026-03-26] Story : task 1.2 description corrigée (subshell vs --filter) (M4). Dev Notes section 7 snippet mis à jour avec le vrai contenu ecosystem.config.js (L4).

### File List

- `deploy.sh`
- `.github/workflows/ci.yml`
- `ecosystem.config.js`
- `turbo.json`
