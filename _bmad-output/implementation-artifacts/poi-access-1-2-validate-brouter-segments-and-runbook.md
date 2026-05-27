# Story POI-Access 1.2 : Valider le téléchargement des segments en local & créer le runbook ops

Status: ready-for-dev

<!--
Story scope-specific issue de epics-poi-access-routing.md (feature POI Access Routing).
Préfixe `poi-access-` pour cohérence avec la story 1.1.
Dépendance dure : Story 1.1 doit être DONE avant de démarrer cette story.
La validation NFR p95 < 500 ms FORMELLE se fait sur le VPS prod via Story 1.5, pas ici.
-->

## Story

As a **DevOps engineer**,
I want to validate the BRouter Europe segment download workflow on my local machine and document the operational procedures in a runbook,
So that the team has a reproducible reference for first-time bootstrap and recurring ops tasks before deploying to production (Story 1.5).

## Acceptance Criteria

1. **Given** le conteneur BRouter provisionné en local (Story 1.1 DONE), **When** je lance le conteneur pour la première fois sur ma machine, **Then** soit BRouter télécharge automatiquement les segments Europe (~3 GB) depuis `brouter.de/brouter/segments4/` (chemin auto), **soit** j'exécute manuellement les commandes de téléchargement (chemin manuel — voir Dev Notes pour la stratégie).

2. **Given** la décision auto vs manuel prise (Task 1), **When** le téléchargement est complet, **Then** :
   - Les fichiers `.rd5` couvrant l'Europe sont présents dans le volume `brouter-segments` (vérifiable via `docker exec ridenrest-brouter ls -la /segments4`)
   - Le téléchargement total complet en < 30 minutes sur connexion ~10 Mo/s
   - La taille totale des segments est consignée dans `docs/ops/brouter-runbook.md` (informative)

3. **Given** les segments persistent dans le volume Docker, **When** je fais `docker compose restart brouter`, **Then** AUCUN re-téléchargement n'est déclenché (validation visuelle des logs container : pas de wget/download)

4. **Given** les segments sont chargés, **When** j'exécute un script de smoke test (3-5 requêtes routing sur des coordonnées européennes connues, profil `trekking`), **Then** :
   - Les 5 requêtes retournent HTTP 200
   - Chaque réponse est un GeoJSON LineString valide (parseable par `jq`)
   - Aucune n'a `messages` d'erreur dans le payload BRouter
   - La latence locale est notée pour information (PAS de validation NFR formelle ici — c'est Story 1.5 sur VPS)

5. **Given** la validation locale est OK, **When** je crée `docs/ops/brouter-runbook.md`, **Then** le runbook contient les **6 sections obligatoires** :
   - **(a) Provisionnement initial** : commande exacte, prérequis disque (≥ 5 GB libres), durée download attendue, vérifications post-install
   - **(b) Diagnostic d'une panne BRouter** : logs (`docker logs -f ridenrest-brouter`), commande healthcheck, vérification volume, fallback circuit breaker (cf. Story 2.1)
   - **(c) Procédure de mise à jour des segments OSM** : cron mensuel + procédure manuelle (script `update-brouter-segments.sh`)
   - **(d) Procédure de bump de `ACCESS_ENGINE_VERSION`** : explication impact (recalcul lazy progressif, pas de pic de charge), commande de bump dans `.env`, vérification déploiement
   - **(e) Procédure de diagnostic d'explosion de queue BullMQ `poi-access-calculation`** : purge, throttle, monitoring Bull Board (cf. Story 4.3)
   - **(f) Première installation sur VPS prod** : réfère explicitement à la Story 1.5 + lien vers le fichier story
   - **(g) Bonus** : commande de smoke test rapide (réutilisée en CI)

6. **Given** le script de smoke test fonctionne, **When** je le commit dans le repo, **Then** il est placé dans `scripts/brouter-smoke-test.sh`, est exécutable (`chmod +x`), et utilise `BROUTER_BASE_URL` depuis `.env` (cohérence avec Story 1.1).

7. **Given** la documentation est créée, **When** je commit, **Then** le diff inclut UNIQUEMENT :
   - `docs/ops/brouter-runbook.md` (nouveau)
   - `scripts/brouter-smoke-test.sh` (nouveau, exécutable)
   - `scripts/update-brouter-segments.sh` (nouveau, exécutable — section (c) du runbook)
   - Éventuelles mises à jour mineures de `architecture-poi-access-routing.md` ou `epics-poi-access-routing.md` si découvertes (Doc Sync Rule)

8. **Given** la story est terminée, **When** je remets la main au PM, **Then** je consigne dans les Completion Notes : (a) le chemin retenu (auto vs manuel), (b) la taille observée des segments Europe, (c) le temps de téléchargement réel, (d) la latence moyenne du smoke test (informative).

---

## ⚠️ Critical Discovery Notes — À LIRE AVANT IMPLÉMENTATION

### 1. Dépendance dure : Story 1.1 doit être DONE

Cette story consomme directement les artefacts de Story 1.1 :
- Le conteneur Docker `ridenrest-brouter` doit exister et démarrer
- L'image Docker validée (tag exact) est documentée dans la Story 1.1 Completion Notes
- L'endpoint healthcheck validé est documenté dans la Story 1.1 Completion Notes
- `BROUTER_BASE_URL` est dans `.env.example` (et le dev a une valeur dans son `.env` local)

**Action préliminaire** : lire intégralement la section "Completion Notes List" de la story 1.1 avant de démarrer.

### 2. Auto-download des segments : à confirmer/infirmer en Task 1

L'architecture supposait l'auto-download. La recherche web de Story 1.1 a indiqué que c'est probablement faux côté Docker (l'app Android le fait, mais pas l'image Docker). **Cette story doit valider expérimentalement** :

Si auto-download confirmé → Task 2-3 : monitor le download, documenter dans runbook
Si auto-download infirmé → Task 4-5 : préparer commande manuelle, l'intégrer au runbook

**Commande manuelle de référence** (à ajuster selon validation) :
```bash
# Télécharger les segments Europe (sous-ensemble — pas tout le monde)
# Les segments sont nommés par tile : E5_N45.rd5 = Europe centrale, etc.
docker exec ridenrest-brouter sh -c '
  cd /segments4 && \
  wget -nv -nc -r -l1 -np -A "E*.rd5,W*.rd5" \
    https://brouter.de/brouter/segments4/
'
# (À tester — peut nécessiter une liste explicite des fichiers Europe)
```

### 3. Quels fichiers `.rd5` couvrent "l'Europe" ?

BRouter divise le monde en tiles de 5°×5° (latitude × longitude). Pour couvrir l'Europe :
- Latitudes : N35 à N70 (8 tiles)
- Longitudes : W15 à E40 (12 tiles)
- Total approximatif : ~50-60 fichiers `.rd5` (taille variable selon densité OSM)

**Source de référence** : https://brouter.de/brouter/segments4/ (lister les fichiers `.rd5` existants pour identifier ceux à télécharger).

**Stratégie pragmatique** : télécharger TOUT le contenu du dossier `segments4` couvrant l'Europe. Si l'archi disait "~3 GB", c'est probablement ~50-60 fichiers × ~50 MB en moyenne.

### 4. Validation NFR latence : NON dans cette story

L'architecture (NFR-PA-002) spécifie `< 500 ms p95 sur VPS KVM 2`. **Cette validation formelle est en Story 1.5** (bootstrap VPS prod), pas ici. Cette story produit un benchmark INFORMATIF en local seulement.

→ Ne PAS bloquer cette story si la latence locale dépasse 500 ms : c'est attendu sur certaines machines de dev (CPU plus lent, RAM partagée).

### 5. Le runbook est CRITIQUE pour Story 1.5

Story 1.5 (bootstrap VPS prod) va RÉUTILISER les procédures de ce runbook. Si le runbook est vague ou incomplet, Story 1.5 sera bloquée. Section (a) "Provisionnement initial" doit être suffisante pour qu'un dev qui n'a jamais touché BRouter puisse exécuter la procédure sur le VPS sans questions.

---

## Tasks / Subtasks

- [ ] **Task 1** — Tester le comportement de démarrage initial (AC: 1, 2, ⚠️Discovery #2)
  - [ ] Volume Docker propre : `docker volume rm ridenrest-app_brouter-segments` (si existe)
  - [ ] `docker compose up -d brouter` puis `docker logs -f ridenrest-brouter` pendant 5 min
  - [ ] Observer : y a-t-il des messages de téléchargement automatique ? (wget, download, etc.)
  - [ ] Vérifier `docker exec ridenrest-brouter ls -la /segments4` :
    - Si fichiers `.rd5` apparaissent → **chemin auto** confirmé, passer à Task 2
    - Si dossier vide → **chemin manuel** requis, passer à Task 3

- [ ] **Task 2** — [SI AUTO] Monitorer et documenter l'auto-download (AC: 1, 2)
  - [ ] Laisser tourner le download jusqu'à complétion (peut prendre 15-30 min)
  - [ ] Mesurer le temps total via `docker logs ridenrest-brouter | grep -i download`
  - [ ] Lister les fichiers téléchargés : `docker exec ridenrest-brouter sh -c 'ls /segments4 | wc -l'` et `du -sh /segments4`
  - [ ] Noter pour le runbook : durée réelle, nombre de fichiers, taille totale
  - [ ] Passer à Task 4 (skip Task 3)

- [ ] **Task 3** — [SI MANUEL] Préparer la commande de téléchargement (AC: 1, 2, ⚠️Discovery #3)
  - [ ] Consulter https://brouter.de/brouter/segments4/ pour identifier les fichiers `.rd5` Europe
  - [ ] Créer le script `scripts/update-brouter-segments.sh` :
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    # Télécharge les segments BRouter pour l'Europe
    # Usage: ./scripts/update-brouter-segments.sh
    
    BROUTER_CONTAINER="${BROUTER_CONTAINER:-ridenrest-brouter}"
    SEGMENTS_DIR="/segments4"
    
    # Liste des tiles Europe (à ajuster après vérification de brouter.de)
    TILES=(
      "E0_N45" "E0_N50" "E0_N55" "E0_N60"
      "E5_N45" "E5_N50" "E5_N55" "E5_N60"
      "E10_N45" "E10_N50" "E10_N55"
      "W5_N45" "W5_N50" "W5_N55"
      # ... compléter selon brouter.de
    )
    
    for TILE in "${TILES[@]}"; do
      docker exec "$BROUTER_CONTAINER" wget -nv -nc \
        -P "$SEGMENTS_DIR" \
        "https://brouter.de/brouter/segments4/${TILE}.rd5" || true
    done
    
    echo "✅ Done. Segments size:"
    docker exec "$BROUTER_CONTAINER" du -sh "$SEGMENTS_DIR"
    ```
  - [ ] Rendre exécutable : `chmod +x scripts/update-brouter-segments.sh`
  - [ ] Lancer le script et observer
  - [ ] Mesurer durée + taille finale (pour runbook)

- [ ] **Task 4** — Vérifier la persistance volume (AC: 3)
  - [ ] `docker compose restart brouter`
  - [ ] `docker logs --tail 50 ridenrest-brouter` après restart : confirmer absence de re-download
  - [ ] `docker exec ridenrest-brouter ls /segments4 | wc -l` : nombre de fichiers inchangé

- [ ] **Task 5** — Créer le script de smoke test (AC: 4, 6)
  - [ ] Créer `scripts/brouter-smoke-test.sh` :
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    # Smoke test BRouter routing
    # Usage: ./scripts/brouter-smoke-test.sh [BASE_URL]
    
    BASE_URL="${1:-${BROUTER_BASE_URL:-http://localhost:17777}}"
    PROFILE="${PROFILE:-trekking}"
    
    # 5 routes européennes test (lon1,lat1|lon2,lat2)
    declare -a ROUTES=(
      "Paris→Versailles|2.3488,48.8534|2.1301,48.8014"
      "Lyon→Vienne|4.8357,45.7640|4.8743,45.5235"
      "Bordeaux→Arcachon|-0.5792,44.8378|-1.1797,44.6584"
      "Berlin→Potsdam|13.4050,52.5200|13.0635,52.3906"
      "Amsterdam→Utrecht|4.9041,52.3676|5.1214,52.0907"
    )
    
    EXIT_CODE=0
    for ROUTE in "${ROUTES[@]}"; do
      NAME=$(echo "$ROUTE" | cut -d'|' -f1)
      FROM=$(echo "$ROUTE" | cut -d'|' -f2)
      TO=$(echo "$ROUTE" | cut -d'|' -f3)
      
      START=$(date +%s%3N)
      RESPONSE=$(curl -sS "${BASE_URL}/brouter?lonlats=${FROM}|${TO}&profile=${PROFILE}&alternativeidx=0&format=geojson" || echo "CURL_FAIL")
      END=$(date +%s%3N)
      DURATION=$((END - START))
      
      if echo "$RESPONSE" | jq -e '.features[0].geometry.type == "LineString"' >/dev/null 2>&1; then
        echo "✅ $NAME — ${DURATION}ms"
      else
        echo "❌ $NAME — failed (${DURATION}ms)"
        echo "$RESPONSE" | head -3
        EXIT_CODE=1
      fi
    done
    
    exit $EXIT_CODE
    ```
  - [ ] `chmod +x scripts/brouter-smoke-test.sh`
  - [ ] Lancer : `./scripts/brouter-smoke-test.sh`
  - [ ] Tous les 5 tests doivent passer ✅
  - [ ] Noter latence moyenne (informative seulement)

- [ ] **Task 6** — Créer le runbook ops (AC: 5)
  - [ ] Créer le dossier `docs/ops/` si absent
  - [ ] Créer `docs/ops/brouter-runbook.md` avec les 6 sections obligatoires + bonus :
    - Section (a) : commande `docker compose up -d brouter`, prérequis (≥5 GB disque, Docker 20+), durée attendue (mesurée Task 2/3), commande de vérification post-install
    - Section (b) : `docker logs`, `docker inspect health`, `docker exec ls /segments4`, mention du circuit breaker dans RoutingService (Story 2.1)
    - Section (c) : référencer `scripts/update-brouter-segments.sh`, cron mensuel exemple (`0 3 1 * *`), procédure manuelle
    - Section (d) : édition `.env` → `ACCESS_ENGINE_VERSION=brouter-1.7.9+trekking-{date}` → redémarrage API → recalcul lazy au prochain accès POI (pas de purge cache nécessaire)
    - Section (e) : commandes Bull Board, `redis-cli` pour purger, ajuster concurrency dans `apps/api/src/pois/access-worker/access-worker.module.ts`
    - Section (f) : "Pour la première installation sur VPS prod, voir Story POI-Access 1.5 (`_bmad-output/implementation-artifacts/poi-access-1-5-bootstrap-vps-prod.md`)"
    - Section (g) Bonus : `./scripts/brouter-smoke-test.sh` exemple d'usage
  - [ ] Documenter le chemin retenu (auto vs manuel) selon résultat Task 1
  - [ ] Inclure les chiffres réels mesurés (durée download, taille, latence smoke test)

- [ ] **Task 7** — Validation finale + Doc Sync (AC: 7)
  - [ ] Re-lancer `./scripts/brouter-smoke-test.sh` une dernière fois : tous green
  - [ ] Si découvertes nouvelles vs architecture (ex: nom exact des fichiers segments, comportement spécifique image) → mettre à jour `architecture-poi-access-routing.md` (Doc Sync Rule)
  - [ ] `git diff --stat` doit lister : `docs/ops/brouter-runbook.md`, `scripts/brouter-smoke-test.sh`, `scripts/update-brouter-segments.sh` (+ archi/epics si maj)

- [ ] **Task 8** — Commit & Completion Notes (AC: 7, 8)
  - [ ] Renseigner les Completion Notes List ci-dessous :
    - Chemin retenu (auto vs manuel)
    - Taille observée segments Europe
    - Temps de téléchargement réel
    - Latence moyenne smoke test
    - Tag de l'image Docker BRouter utilisée (issu de Story 1.1)
    - Endpoint healthcheck utilisé (issu de Story 1.1)
  - [ ] Message de commit suggéré : `feat(ops): add BRouter runbook + smoke test + segments script (story poi-access-1.2)`

---

## Dev Notes

### Patterns projet à respecter

**Scripts shell** (cf. autres scripts existants) :
- Shebang `#!/usr/bin/env bash` (pas `/bin/bash`)
- `set -euo pipefail` toujours
- Variables d'env avec fallback : `"${VAR:-default}"`
- Pas de `set -x` par défaut (verbeux)
- Output `✅` / `❌` pour les checks visibles humain
- Exit code 0 si succès, ≥1 si échec

**Docs `docs/ops/`** :
- Pas de convention stricte trouvée (à vérifier si autres runbooks existent — sinon créer la convention)
- Format Markdown standard, niveaux H2 pour les sections principales
- Code blocks avec langage (`bash`, `yaml`, `sql`, etc.)
- Liens relatifs vers les autres docs du repo (`_bmad-output/...`, `apps/api/src/...`)

### BRouter — Format de l'URL d'appel

Format complet d'une requête BRouter routing :
```
GET {BROUTER_BASE_URL}/brouter
  ?lonlats={lon1},{lat1}|{lon2},{lat2}  (jusqu'à plusieurs waypoints)
  &profile={trekking|fastbike|safety|car-fast}
  &alternativeidx={0|1|2|3}  (route principale ou alternatives)
  &format={geojson|gpx|kml}
```

Exemple : `http://localhost:17777/brouter?lonlats=2.3488,48.8534|2.1301,48.8014&profile=trekking&alternativeidx=0&format=geojson`

**⚠️ Ordre des coordonnées** : `lon,lat` (GeoJSON), JAMAIS `lat,lon`. Cohérent avec NFR du project (cf. `architecture-poi-access-routing.md` §Enforcement Guidelines règle #1).

### BRouter — Profils standards

| Profil BRouter | Usage | Mapping projet |
|---|---|---|
| `trekking` | Mix route + chemins blancs | "Gravel" (default aventure) |
| `fastbike` | Route asphaltée privilégiée | "Route" |
| `safety` | Priorité trafic réduit | "Bikepacking" |

(Mapping défini en `architecture-poi-access-routing.md` §Starter Template Evaluation #2.)

### BRouter — Réponse GeoJSON

Structure type retournée :
```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": { "type": "LineString", "coordinates": [[lon, lat, ele], ...] },
    "properties": {
      "track-length": "4523",           // distance totale en mètres (string!)
      "filtered ascend": "127",          // D+ en mètres
      "plain-ascend": "120",
      "messages": [["lon", "lat", "ele", ...]]
    }
  }]
}
```

Validation minimale smoke test : `jq -e '.features[0].geometry.type == "LineString"'`

### Pourquoi `jq` et pas un parseur Node.js ?

Le smoke test reste un script ops standalone qui doit fonctionner même si Node.js n'est pas installé / l'API down. `jq` est disponible partout (Linux/Mac, GitHub Actions runners, etc.). Si `jq` n'est pas dispo localement, le dev peut l'installer : `brew install jq` (Mac) / `apt install jq` (Debian/Ubuntu).

### Persistance volume Docker

Le volume nommé `brouter-segments` est géré par Docker (`/var/lib/docker/volumes/ridenrest-app_brouter-segments/_data/` sous le hood). Il survit aux :
- `docker compose restart brouter`
- `docker compose down` (sans `-v`)
- `docker rm ridenrest-brouter`
- Reboot du host

Il est détruit uniquement par :
- `docker compose down -v`
- `docker volume rm ridenrest-app_brouter-segments`
- `docker volume prune` (si non utilisé)

**Anti-pattern** : ne PAS bind-mount un dossier local (`./brouter-segments:/segments4`) — perte de portabilité, conflits de permission UID/GID.

### Project Structure Notes

**Pas de conflit** avec la structure existante. Nouveaux fichiers :
- `docs/ops/brouter-runbook.md` (nouveau dossier `docs/ops/` créé si absent)
- `scripts/brouter-smoke-test.sh` (cohérent avec scripts existants ex: `scripts/dev-setup.sh` créé en Story 14.1)
- `scripts/update-brouter-segments.sh` (idem)

### Testing Standards

- Validation manuelle via les AC (smoke test = test fonctionnel)
- Pas de test unitaire (scripts shell + docs)
- Le smoke test sera réutilisable dans la pipeline CI plus tard (post-MVP)

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-1.2] — AC originaux
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Bootstrap-Téléchargement-initial-des-segments] — assomption auto-download (à valider)
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Enforcement-Guidelines] — règle [lon,lat]
- [Source: _bmad-output/implementation-artifacts/poi-access-1-1-provision-brouter-docker-service.md] — Completion Notes (à lire AVANT cette story)
- [Source: _bmad-output/project-context.md#Doc-Sync-Rule] — règle sync docs
- [Source: scripts/dev-setup.sh] — pattern de script ops existant
- BRouter upstream : https://github.com/abrensch/brouter (v1.7.9)
- BRouter segments index : https://brouter.de/brouter/segments4/
- BRouter API doc : https://github.com/abrensch/brouter/blob/master/docs/users/api.md

---

## Dev Agent Record

### Agent Model Used

_(À renseigner par le dev agent)_

### Debug Log References

_(Logs et diagnostics — vide pour l'instant)_

### Completion Notes List

_(À remplir par le dev agent en fin d'implémentation — référencé par AC #8)_

- Chemin retenu (Task 1) : ☐ Auto-download / ☐ Manuel
- Tag image BRouter utilisée (issu Story 1.1) : `___`
- Endpoint healthcheck utilisé (issu Story 1.1) : `___`
- Nombre de fichiers segments Europe téléchargés : `___`
- Taille totale segments Europe : `___ GB`
- Temps de téléchargement réel : `___ min`
- Latence moyenne smoke test (informatif seulement) : `___ ms`
- Écarts vs architecture détectés et synchronisés : `___`

### File List

_(À remplir par le dev agent au fur et à mesure)_

- [ ] `docs/ops/brouter-runbook.md` (nouveau)
- [ ] `scripts/brouter-smoke-test.sh` (nouveau, exécutable)
- [ ] `scripts/update-brouter-segments.sh` (nouveau, exécutable — si chemin manuel)
- [ ] `_bmad-output/planning-artifacts/architecture-poi-access-routing.md` (modifié si découvertes)
- [ ] `_bmad-output/planning-artifacts/epics-poi-access-routing.md` (modifié si découvertes)
