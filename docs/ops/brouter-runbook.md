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
