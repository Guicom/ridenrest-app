# Ride'n'Rest — Services & Dashboards

Référence rapide de tous les services externes utilisés dans le projet.

---

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

---

## Auth & Identité

| Service | URL Dashboard | Description |
|---------|--------------|-------------|
| **Google Cloud Console** | https://console.cloud.google.com | OAuth 2.0 Google Sign-In — gestion Client ID / Client Secret |
| **Strava API** | https://www.strava.com/settings/api | OAuth Strava — import d'activités GPX depuis le compte de l'utilisateur |

---

## APIs Données

| Service | URL Dashboard / Docs | Description |
|---------|---------------------|-------------|
| **Overpass API** | https://overpass-turbo.eu | Requêtes OSM — hébergements, restauration, épiceries, vélo (gratuit, ODbL, commercial ok) |
| **WeatherAPI.com** | https://www.weatherapi.com/my | Météo par coordonnées GPS — 1M calls/mois free, commercial ok |
| **Geoapify** | https://myprojects.geoapify.com | Géocodage & reverse geocoding — 3000 req/jour free, commercial ok |
| **OpenFreeMap** | https://openfreemap.org | Tuiles cartographiques pour MapLibre GL JS — MIT, 100% gratuit commercial |

---

## Monétisation & Affiliation

| Service | URL Dashboard | Description |
|---------|--------------|-------------|
| **Booking.com Affiliate** | https://join.booking.com | Programme d'affiliation — commissions 4-8% sur réservations. À réappliquer quand le trafic est établi. Deep links paramétrés disponibles sans affiliation. |
| **Expedia Affiliate Network** | https://expediapartnercentral.com | Programme d'affiliation backup — même modèle que Booking.com |

---

## Ports locaux (développement)

| Service | Port |
|---------|------|
| NestJS API | `3010` |
| Next.js Web | `3011` |

> Les ports 3000/3001 sont réservés (éviter les conflits avec d'autres projets locaux).

---

## Variables d'environnement clés

```bash
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Strava OAuth
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=

# Aiven PostgreSQL
DATABASE_URL=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# WeatherAPI
WEATHER_API_KEY=

# Geoapify
GEOAPIFY_API_KEY=
```
