# BRouter — Runbook Ops

Service de routing cycliste self-hosted (BRouter v1.7.9) pour le calcul d'accès aux POIs.

---

## (a) Provisionnement initial

### Prerequis

- Docker 20+ avec Docker Compose v2
- Espace disque : **>= 5 GB** libres (segments Europe ~3 GB + marge)
- Connexion internet pour le telechargement initial des segments OSM

### Demarrage du conteneur

```bash
docker compose up -d brouter
```

Le conteneur `ridenrest-brouter` demarre sur le port `127.0.0.1:17777`. Il est fonctionnel immediatement mais ne peut pas router sans segments.

### Telechargement des segments Europe

BRouter ne telecharge **pas** les segments automatiquement. Le script `scripts/update-brouter-segments.sh` telecharge les 81 tiles couvrant l'Europe (W15-E40, N35-N70) depuis `brouter.de` et les copie dans le volume Docker.

```bash
./scripts/update-brouter-segments.sh
```

- Duree attendue : **~2 minutes** sur connexion 10 Mo/s (~3 GB)
- Le script saute les fichiers deja presents (idempotent)
- Les tiles ocean (404) sont ignorees silencieusement

### Verification post-install

```bash
# Verifier le nombre de segments
docker exec ridenrest-brouter sh -c 'ls /segments4/*.rd5 2>/dev/null | wc -l'
# Attendu : 81

# Verifier la taille totale
docker exec ridenrest-brouter du -sh /segments4
# Attendu : ~3.0 GB

# Healthcheck
docker inspect --format='{{.State.Health.Status}}' ridenrest-brouter
# Attendu : healthy

# Smoke test complet (5 routes europeennes)
./scripts/brouter-smoke-test.sh
# Attendu : 5/5 passed
```

---

## (b) Diagnostic d'une panne BRouter

### Logs

```bash
docker logs -f ridenrest-brouter
# Logs normaux : healthcheck GET /brouter toutes les 30s
# Erreur typique : "datafile E5_N45.rd5 not found" → segments manquants
```

### Healthcheck

```bash
docker inspect --format='{{.State.Health.Status}}' ridenrest-brouter
# healthy / unhealthy / starting

# Test manuel
curl -sS http://localhost:17777/brouter
# Reponse attendue : texte d'aide BRouter (pas de 500)
```

### Verification volume segments

```bash
docker exec ridenrest-brouter ls /segments4/*.rd5 | wc -l
# Si 0 : segments absents → relancer update-brouter-segments.sh
# Si < 81 : telechargement incomplet → relancer le script (idempotent)
```

### Conteneur ne demarre pas

```bash
docker compose logs brouter
# Verifier : image build OK, port 17777 libre, memoire suffisante (2.5 GB)

docker compose up -d --build brouter
# Force rebuild si l'image a ete supprimee
```

### Circuit breaker (Story 2.1)

Le `RoutingService` NestJS (Story 2.1) implementera un circuit breaker pour gerer les pannes BRouter. En attendant, si BRouter est down, les requetes de routing echouent avec une erreur explicite cote API.

---

## (c) Mise a jour des segments OSM

Les segments BRouter sont bases sur les donnees OpenStreetMap. Une mise a jour mensuelle garantit des donnees de routing fraiches.

### Mise a jour manuelle

```bash
# Supprimer les anciens segments et retelecharger
docker exec ridenrest-brouter sh -c 'rm -f /segments4/*.rd5'
./scripts/update-brouter-segments.sh

# Redemarrer pour que BRouter recharge les segments
docker compose restart brouter

# Valider
./scripts/brouter-smoke-test.sh
```

### Cron mensuel (VPS prod)

```bash
# Ajouter au crontab utilisateur sur le VPS
# Le 1er de chaque mois a 3h du matin — --force supprime puis retelecharge tous les segments
0 3 1 * * cd /home/deploy/ridenrest-app && ./scripts/update-brouter-segments.sh --force >> /var/log/brouter-segments-update.log 2>&1 && docker compose restart brouter
```

Le flag `--force` supprime les segments existants avant de retelecharger, garantissant des donnees a jour. Sans `--force`, le script est idempotent (saute les fichiers presents) — utile pour le provisionnement initial ou la reprise apres echec.

---

## (d) Bump de ACCESS_ENGINE_VERSION

La variable `ACCESS_ENGINE_VERSION` dans `.env` identifie la version du moteur de routing utilise pour calculer les acces POI. Format : `brouter-1.7.9+trekking-{YYYY-MM-DD}`.

### Quand bumper

- Apres une mise a jour des segments OSM (section c)
- Apres un changement de version BRouter
- Apres un changement de profil de routing

### Procedure

```bash
# 1. Editer .env sur le VPS
ACCESS_ENGINE_VERSION=brouter-1.7.9+trekking-2026-06-01

# 2. Redemarrer l'API pour prendre en compte la nouvelle version
pm2 restart api

# 3. Verification
curl -s http://localhost:3010/api/health | jq .
```

### Impact

Le bump de version declenche un **recalcul lazy progressif** : les acces POI sont recalcules au prochain acces utilisateur, pas en batch. Il n'y a **pas de pic de charge** ni de purge cache necessaire. Les anciens calculs restent valides jusqu'a leur prochaine consultation.

---

## (e) Diagnostic queue BullMQ poi-access-calculation

La queue `poi-access-calculation` (Story 4.3) gere le calcul asynchrone des acces POI via BRouter.

### Inspection via Bull Board

L'interface Bull Board (si configuree) permet de visualiser les jobs en attente, en cours et echoues.

### Commandes Redis CLI

```bash
# Nombre de jobs en attente
docker exec ridenrest-app-redis-1 redis-cli LLEN bull:poi-access-calculation:wait

# Nombre de jobs echoues
docker exec ridenrest-app-redis-1 redis-cli LLEN bull:poi-access-calculation:failed

# Purger les jobs echoues
docker exec ridenrest-app-redis-1 redis-cli DEL bull:poi-access-calculation:failed

# Purger TOUS les jobs (attention : operation destructive)
docker exec ridenrest-app-redis-1 redis-cli --scan --pattern "bull:poi-access-calculation:*" | xargs -n 100 docker exec -i ridenrest-app-redis-1 redis-cli DEL
```

### Ajuster la concurrence

La concurrence du worker est configurable dans `apps/api/src/pois/access-worker/access-worker.module.ts`. Reduire la concurrence si BRouter est surcharge (latence > 5s par requete).

### Throttle d'urgence

Si la queue explose (> 10 000 jobs en attente), reduire temporairement la concurrence a 1 et investiguer la cause (boucle infinie, retry storm, etc.).

---

## (f) Premiere installation sur VPS prod

Pour la premiere installation de BRouter sur le VPS de production, suivre la procedure complete documentee dans :

**Story POI-Access 1.5** : [`_bmad-output/implementation-artifacts/poi-access-1-5-bootstrap-vps-prod.md`](_bmad-output/implementation-artifacts/poi-access-1-5-bootstrap-vps-prod.md)

Cette story couvre :
- Build de l'image sur le VPS
- Telechargement des segments en production
- Validation NFR p95 < 500 ms (KVM 2)
- Integration avec `deploy.sh`

---

## (g) Smoke test rapide

```bash
# Test complet (5 routes, profil trekking)
./scripts/brouter-smoke-test.sh

# Test avec URL personnalisee (ex: VPS prod)
./scripts/brouter-smoke-test.sh http://localhost:17777

# Test avec un profil different
PROFILE=fastbike ./scripts/brouter-smoke-test.sh
```

Le smoke test valide :
- 5 routes europeennes (Paris, Lyon, Bordeaux, Berlin, Amsterdam)
- Reponse HTTP 200 avec GeoJSON LineString valide
- Latence par route (informatif)
- Exit code 0 si tout passe, >= 1 sinon (utilisable en CI)

---

## (h) Log du bootstrap initial prod

| | |
|---|---|
| Date | 2026-05-28 |
| Operateur | Guillaume (pair-programming Claude Code) |
| VPS | Hostinger KVM 2 (72.62.189.193) |
| Image | `brouter:1.7.9` (build from source `abrensch/brouter#v1.7.9`) |
| Segments | 81 tuiles Europe, ~3.0 GB, download manuel en ~121 s |
| Benchmark NFR-PA-002 | p50 ~143 ms, p95 ~305-332 ms -> PASS |

Detail complet : [`brouter-prod-bootstrap-log-2026-05-28.md`](brouter-prod-bootstrap-log-2026-05-28.md).
Resultats benchmark : [`brouter-benchmark-results.md`](brouter-benchmark-results.md).

---

## (i) Redeploiement BRouter sans downtime

BRouter est gere par Docker (pas PM2). Le `deploy.sh` (step [4/7]) execute automatiquement :

```bash
docker compose up -d brouter
# health-gate : bloque la suite du deploy tant que BRouter n'est pas healthy (timeout 5 min)
```

`up -d` reutilise l'image existante (no-op si deja healthy) et ne reconstruit que si l'image est
absente ou si son tag a change. Aucune interruption tant que la definition du service est inchangee.

Manuellement :

```bash
cd /home/deploy/ridenrest-app
docker compose up -d brouter
docker inspect --format='{{.State.Health.Status}}' ridenrest-brouter   # attendre "healthy"
./scripts/brouter-smoke-test.sh http://127.0.0.1:17777                 # valider 5/5
```

---

## (j) Rollback BRouter

ATTENTION : l'image est **construite depuis les sources** (pas de tag registre a puller). Le
rollback ne se fait donc PAS via `docker compose pull brouter:<old>`. Deux cas :

**Cas 1 — regression du `deploy.sh` ou de la conf compose (le plus courant)**

```bash
cd /home/deploy/ridenrest-app
git revert <commit-fautif>     # ou: git checkout <ref-precedente> -- docker-compose.yml deploy.sh
git push                       # re-declenche le pipeline CI/CD -> redeploy propre
```

**Cas 2 — downgrade de version BRouter (changer de tag source)**

```bash
# Dans docker-compose.yml, repasser le build context ET l'image au tag precedent, ex. :
#   build: { context: 'https://github.com/abrensch/brouter.git#v1.7.8' }
#   image: brouter:1.7.8
docker compose build brouter   # rebuild depuis l'ancien tag source
docker compose up -d brouter
docker inspect --format='{{.State.Health.Status}}' ridenrest-brouter   # attendre "healthy"
```

Les segments (volume `ridenrest-app_brouter-segments`) sont independants de l'image : un downgrade
d'image ne les touche pas.

---

## (k) Purge du volume segments + re-download

Si les segments sont corrompus ou incomplets (routing en erreur "datafile not found", ou nombre de
tuiles < 81) :

```bash
cd /home/deploy/ridenrest-app
docker compose down brouter
docker volume rm ridenrest-app_brouter-segments
docker compose up -d brouter             # recree le conteneur + un volume vide
./scripts/update-brouter-segments.sh     # re-telecharge les 81 tuiles (~3 GB, ~2-3 min)
docker inspect --format='{{.State.Health.Status}}' ridenrest-brouter
./scripts/brouter-smoke-test.sh http://127.0.0.1:17777
```

Alternative non destructive (re-telecharger sans supprimer le volume) :

```bash
./scripts/update-brouter-segments.sh --force   # supprime puis re-telecharge les .rd5 in-place
docker compose restart brouter
```

---

## (l) Monitoring — Uptime Kuma

Monitor `BRouter Production` (cree Story 1.5) :

| Champ | Valeur |
|---|---|
| Type | HTTP(s) - Keyword |
| URL | `http://brouter:17777/brouter?lonlats=2.3488,48.8534%7C2.3488,48.8624&profile=trekking&format=geojson` |
| Keyword | `LineString` |
| Intervalle | 30 s, 3 retries |
| Notifications | email + Telegram |

ATTENTION : l'URL utilise le **nom de service Docker `brouter`** (reseau Compose), PAS
`host.docker.internal:17777`. BRouter est binde sur `127.0.0.1:17777` (loopback hote, securite
NFR-PA-008) → donc injoignable via la passerelle bridge `172.17.0.1` (`host.docker.internal`) :
un service loopback n'est pas accessible depuis le bridge Docker. Le routage container-to-container
via le nom de service contourne le bind hote sans l'affaiblir. Le keyword `LineString` valide une
**vraie requete de routing** (detecte aussi le cas "up mais sans segments", piege Story 1.1).

---

## (m) Observabilite — Pipeline d'acces POI (Story 4.3)

> **Note de scope (2026-05-31).** Story 4.3 re-cadree au minimum viable : beaucoup d'observabilite
> existait deja (logs JSON pino, DLQ, circuit breaker). Cette section documente l'existant +
> l'endpoint de sante de queue ajoute. Sentry et Prometheus sont **differes** (cf. fin de section).

### Ce qui est deja en place (pas de nouveau code)

- **Logs JSON structures** : `nestjs-pino` (config `apps/api/src/app.module.ts`). En prod `level=info`,
  format JSON (compatible Loki/Grafana). Chaque requete HTTP porte un `reqId` (= traceId).
- **Circuit breaker BRouter** (`RoutingService`) : logge chaque echec BRouter en `warn` structure
  (`reason`, `profile`, `durationMs`, `engineVersion`). Reasons : `timeout`, `network`, `http_error`,
  `parse_error`, `circuit_open`. Ouvre apres 5 echecs/60s, half-open apres 30s.
- **Dead-letter queue** `poi-access-failures` : un job d'acces en echec definitif (apres 3 retries)
  y est depose ET le POI est marque `access_failed=true` (stop recalcul perpetuel). Log `error`
  `access_job_failed_final`.
- **Fallback BRouter** : une indispo BRouter n'est PAS une erreur — le job reussit, le POI reste
  eligible (recalcul lazy/eager ulterieur). Log `warn` `access_job_fallback` (volume attendu normal).

### Logs structures — champs du pipeline d'acces

| Champ | Source | Note |
|---|---|---|
| `level`, `time` | pino | automatique |
| `context` (service) | `Logger(Name)` | ex. `AccessWorkerProcessor`, `RoutingService` |
| `msg` | code | ex. `access_job_success`, `access_fallback`, `access_job_failed_final` |
| `status` | worker | `processing` / `ok` / `fallback` / `error` |
| `poiId`, `jobId`, `durationMs`, `engineVersion` | worker | |
| `reason` | routing/fallback | motif BRouter (`timeout`...`circuit_open`) ou `routing_failed` (fallback) |
| `reqId` (traceId) | pino HTTP | **absent des jobs worker** (pas de contexte HTTP) — limitation acceptee |

> **Niveau des logs de succes (deviation AC4 assumee).** `access_job_success` est emis en `info`
> (pas `debug`/silencieux comme le suggerait l'AC4 d'origine). Decision 2026-05-31 : avec le pivot
> `nearest-trace` + pre-calcul eager, le volume de calculs est borne par le nombre de POI (et non
> par requete utilisateur) — le souci de volume qui motivait `debug` ne s'applique plus, et un log
> `info` par calcul est utile a l'observabilite pendant le rollout MVP. A re-evaluer si le volume
> de POI explose.

Filtrer les logs d'un POI : `pm2 logs api | grep '"poiId":"<id>"'`.

### Endpoint de sante de queue

`GET /api/health/access-queue` (controller `apps/api/src/health/access-queue-health.controller.ts`).

- **Auth** : header `x-health-token` compare a l'env `HEALTH_ENDPOINT_TOKEN` (fail-closed : refuse
  si la variable n'est pas configuree). `@Public` (bypass JWT) + `@SkipThrottle`.
- **Reponse** : `{ depth, failed24h, oldestPendingAgeS }`
  - `depth` = jobs `waiting` + `delayed` (a traiter)
  - `failed24h` = echecs definitifs des dernieres 24h (set `failed` retenu, max 50)
  - `oldestPendingAgeS` = age du plus vieux job en attente — `waiting` ET `delayed` (backoff) — (s), 0 si vide

```bash
# Test local / prod
curl -s -H "x-health-token: $HEALTH_ENDPOINT_TOKEN" http://localhost:3010/api/health/access-queue
# Attendu : {"data":{"depth":0,"failed24h":0,"oldestPendingAgeS":0}}
```

### Monitor Uptime Kuma — POI Access Queue Health

A creer cote UI Kuma (reutilise les channels de notif existants : email + Telegram).

**Reseau** : l'API NestJS tourne en PM2 NATIF sur le host (port 3010), PAS dans Docker — donc
le monitor ne peut PAS utiliser un nom de service Docker (contrairement au monitor BRouter, l).
Deux options depuis le conteneur Kuma :
- **Recommande** : URL publique via Caddy `https://api.ridenrest.app/api/health/access-queue`
  (l'endpoint est protege par token → exposition publique acceptable).
- Alternative interne : `http://172.17.0.1:3010/api/health/access-queue` (passerelle bridge
  Docker → host ; NestJS bind `0.0.0.0`).

| Champ | Valeur |
|---|---|
| Friendly Name | `POI Access Queue Health` |
| Monitor Type | `HTTP(s) - Json Query` |
| URL | `https://api.ridenrest.app/api/health/access-queue` |
| Method | `GET` |
| Headers (JSON) | `{ "x-health-token": "<HEALTH_ENDPOINT_TOKEN>" }` |
| **Requete Json** (jsonata) | `data.depth <= 200` |
| **Valeur attendue** | `true` |
| Heartbeat Interval | 60 s |
| Retries | 3 |
| Accepted Status Codes | 200-299 |
| Notifications | email + Telegram (channels existants) |

**Logique de la condition** : la version actuelle de Kuma evalue la `Requete Json` (jsonata)
contre le corps de reponse, convertit le resultat en chaine et le compare a la `Valeur attendue`.
`data.depth <= 200` renvoie un booleen → `"true"` quand la queue est saine (monitor UP),
`"false"` des que `depth > 200` (≠ `"true"` → monitor DOWN → alerte).

> ⚠️ La racine jsonata est directement l'objet JSON → `data.depth` (PAS `$.data.depth`).
> Le header `x-health-token` doit porter la MEME valeur que `HEALTH_ENDPOINT_TOKEN` du `.env` VPS,
> sinon l'endpoint renvoie 401 (fail-closed) et le monitor reste DOWN.
> Test : gonfler artificiellement la queue (uploader plusieurs segments d'aventure → pre-calcul
> eager) et verifier que l'alerte se declenche au-dela du seuil. Optionnel : un 2e monitor sur
> `data.failed24h <= 10` pour alerter sur un taux d'echec anormal.

### Bull Board — dashboard de triage des queues

- **URL** : `/api/admin/queues` (le global prefix `api` s'applique a la route `/admin/queues`).
- **Gate** : monte UNIQUEMENT si `BULL_BOARD_ENABLED=true` (defaut OFF). Pas de rôle admin dans le
  projet → en prod, **ne PAS exposer via Caddy**. Acces via tunnel SSH :
  ```bash
  ssh -L 3010:localhost:3010 user@72.62.189.193
  # puis ouvrir http://localhost:3010/api/admin/queues dans le navigateur
  ```
- **Basic Auth (fail-closed)** : une auth HTTP Basic via `BULL_BOARD_USER` + `BULL_BOARD_PASSWORD`
  est exigee. Si le dashboard est active (`BULL_BOARD_ENABLED=true`) SANS credentials configurees,
  l'acces est **refuse (503)** — jamais ouvert (cf. `bull-board.module.ts`). Toujours definir les
  deux variables avant d'activer.
- Queues affichees : `poi-access-calculation`, `poi-access-failures` (DLQ), `gpx-processing`,
  `density-analysis`. Permet d'inspecter/rejouer/purger les jobs en echec.
- **Metriques affichees** : Bull Board (UI native) montre les **compteurs par etat** de chaque queue
  (`waiting` / `active` / `completed` / `failed` / `delayed` / `paused`) + l'inspection job par job.
  Il n'expose PAS de tuile calculee « avg processing time » ni « failed 24h » : ces indicateurs
  agreges vivent sur l'endpoint de sante (`failed24h`) et dans les logs (`durationMs` par job).

### Comment interpreter les metriques

- **Queue depth normale** : ~0 au repos. Un pic transitoire apres un upload de segment (pre-calcul
  eager de tous les POI proches) est NORMAL et se resorbe en quelques minutes (concurrence 5).
- **Queue depth anormale** : `depth > 200` durablement, ou `oldestPendingAgeS` qui croit sans
  redescendre → le worker ne consomme pas (voir ci-dessous).
- **Taux failed sain** : `failed24h` proche de 0. Quelques echecs isoles = OK (POI degenere, hoquet
  reseau). Un `failed24h` qui grimpe = probleme systemique (BRouter down prolonge, DB en erreur).

### Investiguer un spike de fallbacks BRouter

1. Logs : `pm2 logs api | grep access_fallback` (et `grep '"reason":"circuit_open"'`).
2. Si beaucoup de `circuit_open` → BRouter est down/lent : voir section (b) Diagnostic d'une panne.
3. Le monitor Kuma `BRouter Production` (section l) doit aussi alerter — correler.
4. Les fallbacks ne corrompent pas les donnees : les POI concernes seront recalcules au prochain
   acces lazy ou pre-calcul eager une fois BRouter retabli.

### Debug une queue qui grossit

1. Verifier que le worker tourne : `pm2 status` (process `api`), logs `access_job_start`/`_success`.
2. Verifier la sante BRouter (section b) — un BRouter lent ralentit le drain.
3. Verifier RAM/CPU du VPS : `htop` / `docker stats` (concurrence 5 + pool PG 10).
4. Inspecter via Bull Board les jobs `active` bloques.
5. Throttle d'urgence si retry storm (section e).

### Differe — Sentry (AC3, post-MVP)

Sentry n'est installe nulle part dans le projet. Quand il sera ajoute (follow-up `infra-install-sentry`),
le hook `beforeSend` devra **filtrer les volumes attendus** pour ne pas noyer les vraies erreurs :

```typescript
// Spec du filtre a implementer lors de l'install Sentry :
Sentry.init({
  beforeSend(event, hint) {
    const ex = hint.originalException
    // BRouter indispo = volume attendu normal (timeout/reseau/HTTP/circuit) → NE PAS envoyer.
    if (ex instanceof BrouterUnavailableException) {
      return null
    }
    // Restent envoyes : parse_error BRouter, erreurs DB, exceptions inattendues.
    return event
  },
})
```

> Note : `routing_failed` n'est PAS un `reason` d'exception (c'est le statut de fallback retourne par
> `AccessCalculatorService`, jamais leve). Le filtre porte sur `BrouterUnavailableException`
> (reasons `timeout|network|http_error|parse_error|circuit_open`). Decision produit : filtrer
> TOUTE `BrouterUnavailableException` (y compris `parse_error` cote BRouter, deja loggee en `warn`).

### Differe — Metriques Prometheus (AC8, post-MVP)

Non implemente (pas de Grafana en place). A ajouter si le volume le justifie (follow-up
`infra-prometheus-metrics`) : `prom-client` + endpoint `/metrics` protege, compteurs
`access_compute_total{status,source}`, histogram `access_compute_duration_seconds`,
counter `access_brouter_failures_total{reason}`.

### Variables d'environnement (a ajouter au `.env` VPS + `apps/api/.env.example`)

```bash
# Endpoint de sante de queue (consomme par Uptime Kuma) — OBLIGATOIRE (fail-closed)
HEALTH_ENDPOINT_TOKEN="<token aleatoire — openssl rand -hex 24>"

# Bull Board (dashboard de triage) — OFF par defaut
BULL_BOARD_ENABLED=false
BULL_BOARD_USER="admin"
BULL_BOARD_PASSWORD="<mot de passe fort>"
```
