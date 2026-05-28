# BRouter — Résultats benchmark NFR (NFR-PA-002)

Objectif : **p95 < 500 ms** et **p50 < 200 ms** sur un calcul d'accès POI lazy, aucun timeout (> 5 s).
Outil : `scripts/brouter-benchmark-prod.sh` (36 routes, profils `trekking`/`fastbike`/`gravel`).

---

## Méthodologie (important)

La NFR-PA-002 mesure la latence d'**un appel routing d'accès POI** (POI → trace), pas un trajet
inter-villes. L'architecture (`architecture-poi-access-routing.md`) pose l'hypothèse **~200 ms/POI**
(ligne « 50 POI × 200 ms en parallèle ») et un seuil de proximité `ACCESS_EAGER_THRESHOLD_M=1500 m`.

Le benchmark utilise donc des **routes courtes (~0,5–3 km)** sur 18 villes européennes variées
(ouest dense + centre/est), avec les profils réellement présents dans l'image BRouter v1.7.9.

> ⚠️ Découverte : un premier jet de benchmark utilisait des trajets **inter-villes de 20–60 km**
> (Paris→Versailles, Bordeaux→Arcachon…). Ils sortent à **700–1335 ms même à chaud** et faisaient
> échouer la NFR (p95 ≈ 1182–1335 ms). **Ces distances sont hors du use-case POI-accès** : la latence
> BRouter croît avec l'espace de recherche (distance × densité). À garder en tête pour la Story 2.1
> (RoutingService) si jamais un routing longue-distance est exposé — il faudra une NFR distincte.

> ⚠️ Découverte : **le profil `safety` n'existe pas** dans l'image (`/profiles2` contient
> `trekking`, `fastbike`, `gravel`, `mtb`, `shortest`, `softaccess`, `hiking-mountain`…).
> La story mentionnait `trekking/fastbike/safety` → remplacé par `trekking/fastbike/gravel`
> (cohérent avec l'enum app `routing_profile = ['road','gravel','bikepacking']`).

---

## Run 1 — 2026-05-28 ~21h30 (GMT+2)

- Opérateur : Guillaume (pair-programming avec Claude Code)
- Environnement : VPS Hostinger KVM 2 (`72.62.189.193`), Docker 29.3.1 / Compose v5.1.1
- Image : `brouter:1.7.9` (build from source `abrensch/brouter#v1.7.9`), JVM `-Xmx2g`, `maxthreads=1`
- Segments : 81 tuiles Europe (~3,0 Go), fraîchement téléchargées
- 36 routes courtes, profils trekking/fastbike/gravel

| Passe | min | p50 | avg | p95 | p99 | max | timeouts | fails | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 2a (tuiles plus froides) | 86 | **144** | 170 | **305** | 397 | 397 | 0 | 0/36 | **PASS** |
| 2b (chaud, régime permanent) | 83 | **142** | 161 | **332** | 332 | 332 | 0 | 0/36 | **PASS** |

**Verdict NFR-PA-002 (p95 < 500 ms & p50 < 200 ms) : ✅ PASS.**

Observations :
- Latence saine et stable entre froid et chaud (le cache froid n'impacte que la queue extrême,
  négligeable pour des routes courtes).
- Toutes les routes ≤ ~4,5 km sont sous 400 ms ; p50 conforme à l'hypothèse archi.
- CSV bruts conservés sur le VPS : `/tmp/run2a.csv`, `/tmp/run2b.csv`.

### Runs additionnels (rigueur statistique — optionnels)

La story recommande 3 runs à des moments différents (matin / après-midi / soir) pour capturer
la variance de charge VPS. Run 1 (ci-dessus) couvre la soirée avec une paire froid/chaud stable.

- [ ] Run 2 (après-midi) : p50=`___` p95=`___` p99=`___`
- [ ] Run 3 (matin) : p50=`___` p95=`___` p99=`___`
