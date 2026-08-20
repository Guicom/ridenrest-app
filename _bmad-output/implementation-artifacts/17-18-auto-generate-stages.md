# Story 17.18 — Génération automatique des étapes (mode planning)

**Statut** : review — 2026-08-20
**Épopée** : 17 (Quality of Life)
**Dépend de** : 11.1 (CRUD étapes), 17.7 (vitesse/pause/ETA par étape), 17.16 (rayon réglable), 17.17 (types Google par catégorie)
**Périmètre** : API + web + mobile (même lot — décision Guillaume 2026-08-20)

---

## Story

En tant que **cyclobikepacker qui prépare une aventure de plusieurs jours**,
je veux **générer automatiquement mes étapes** en donnant un objectif de km/jour, un D+ maximum
et les types d'hébergement qui me conviennent,
afin de **ne plus placer 12 étapes à la main** et d'obtenir une découpe dont chaque fin d'étape
a réellement de quoi dormir.

---

## Décisions produit (validées 2026-08-20)

| Question | Décision | Conséquence |
|---|---|---|
| Où tourne l'algorithme | **Endpoint API dédié**, synchrone | `POST /adventures/:id/stages/generate`. Le client n'a qu'un formulaire + un état de chargement. Logique testable en Jest. |
| Plateformes | **API + web + mobile** dans cette story | Parité imposée dès le départ (règle 10 : les points d'application sont nommés, cf. T9/T10). |
| Candidat en échec | **Recul puis avance** : `0, −5, +5, −10, +10 … −40, +40` | Trouve plus d'étapes qu'un recul seul. Contrepartie assumée ci-dessous. |
| Détection des hébergements | **Text Search Essentials (IDs Only)** — `places.id` seul, masque `MASK_IDS_ONLY` | **Gratuit et illimité.** On n'a besoin que de savoir *s'il y a* des hébergements, pas de qui ils sont. Change la structure de l'algorithme (cf. contrainte 4). |
| Dates de départ | **Date + heure de départ dans le formulaire** ; étape *i* part à `date de la première + i jours`, **à la même heure** | Les étapes générées portent un `departureTime`, donc ETA, météo par étape et synchro de date de fin (17.12) fonctionnent immédiatement. Impose une arithmétique calendaire, pas un `+86 400 000 ms` (cf. contrainte 9). |

### Contrepartie assumée du « recul puis avance »

Alterner autour de la cible peut produire une étape **plus longue** que l'objectif km/jour
(jusqu'à +40 km). L'objectif km/jour est donc une **cible avec tolérance ±40 km**, pas un
plafond.

Le **D+ max reste une contrainte dure** dans les deux directions : un candidat dont le D+
d'étape dépasse `maxElevationGainM` est rejeté, qu'il soit en avance ou en recul. Sans cela, le
réglage D+ n'aurait aucun effet dès qu'un recul échoue — l'algorithme irait chercher plus loin
un point qui viole précisément ce que l'utilisateur vient de fixer.

---

## Contraintes découvertes dans le code (à lire AVANT d'implémenter)

### 1. Il n'existe pas de « trou » au milieu — les étapes forment une chaîne contiguë depuis km 0

`StagesService.createStage` a deux chemins seulement : **append** après la dernière étape
(`startKm = last.endKm`), ou **split** d'une étape existante quand `endKm` tombe dedans
(`stages.repository.findContaining`). `deleteStage` recalcule `startKm = prevEndKm` pour toutes
les étapes restantes. Le modèle garantit donc `stage[0].startKm === 0` et
`stage[i].startKm === stage[i-1].endKm`.

⇒ **« Compléter les trous » = prolonger après la dernière étape jusqu'à la fin de la trace.**
C'est le seul trou possible. Le formulaire doit dire exactement ça (« Compléter à partir du
km N »), pas « combler les trous », qui promet quelque chose que le modèle de données ne peut
pas produire.

### 2. Le rayon de recherche est un réglage que l'utilisateur possède déjà (règle 12)

`useMapStore.searchRadiusKm` existe en planning depuis le 2026-08-20 (défaut
`DEFAULT_SEARCH_RADIUS_KM = 3`, max `MAX_SEARCH_RADIUS_KM = 20`). La génération **doit** le
consommer, pas re-coder un 3 km en dur : sinon la vérification « il y a 3 hébergements ici »
porterait sur une zone différente de celle que l'utilisateur voit sur sa carte.

### 3. La génération n'interroge pas Overpass (règle 10)

Overpass a été mesuré entre **1 s et 31 s** par requête. Avec 8 à 24 vérifications pour une
aventure de 800 km, l'endpoint deviendrait injouable. La génération **compte via Google
(IDs Only)** et **lit en complément** les lignes déjà en base, toutes sources autorisées par le
profil : les POI `source='overpass'` en cache (TTL 30 j) comptent gratuitement, ils ne sont
simplement pas rafraîchis.

⚠️ `shelter` n'a **aucun type Google** (`CATEGORY_GOOGLE_TYPES`, story 17.17) — les refuges
viennent d'OSM. Générer avec **seulement** « Refuge / Abri » coché ne peut donc compter que ce
qui est déjà en cache. Le formulaire avertit au lieu de laisser croire à une absence de refuges.

### 4. Le comptage est GRATUIT — masque IDs Only (décision Guillaume, 2026-08-20)

`GooglePlacesProvider.searchPlaceIds(bbox, googleType, textQuery)` existe déjà : masque
`MASK_IDS_ONLY = 'places.id,nextPageToken'`, SKU **Text Search Essentials (IDs Only)**, gratuit
et illimité, une seule page (20 résultats max — sans importance quand le seuil est 3). Il passe
par `resolveTextQuery`, donc le `textQuery` calibré par type (règle 11b) s'applique : pas de
régression « campground → 0 résultat ».

C'est ce qui rend la première version de cet algorithme obsolète. Elle contournait un coût qui
n'existe plus :

| | conception initiale (masque Pro) | conception retenue (IDs Only) |
|---|---|---|
| Coût, 800 km à froid | 1,54 $ à 4,61 $ | **0 $** |
| Évaluation d'un candidat | impossible en direct (0,19 $ l'unité) → collecte par tranches de 50 km + fenêtres paresseuses + set de couverture par run | **une requête par type, directe** |
| Géométrie du test | disque `ST_DWithin` autour du point | **bbox carrée** autour du point (cf. contrainte 5) |
| Latence typique (8 étapes) | 10 à 50 s | **~4 s** |
| Effet de bord | les POI collectés étaient persistés → carte préchauffée | aucune persistance (cf. contrainte 6) |

⚠️ **Ne jamais faire basculer ce chemin sur `MASK_PRO`.** C'est le même garde-fou que pour
l'analyse de densité : le comptage émet une requête par type et par candidat, soit jusqu'à
102 requêtes par étape. En SKU Pro ce serait 3,26 $ **par étape**.

### 5. IDs Only ne renvoie pas de coordonnées ⇒ le test devient une bbox, pas un disque

Sans `places.location`, impossible de filtrer par distance : on ne peut compter que « dans le
rectangle interrogé ». Le test « 3 hébergements dans un rayon de 3 km » devient donc **« dans un
carré de 6 km de côté centré sur le point »** — 27 % de surface en plus, un coin à 4,24 km au
lieu de 3.

Assumé : l'objectif est de détecter une **présence**, et un hébergement à 4 km d'une fin d'étape
reste un hébergement atteignable. Mais deux conséquences à écrire dans le code et dans l'UI :

- **Libellé** : « au moins 3 hébergements détectés **autour du point** », jamais « dans un rayon
  de X km » — la promesse serait fausse dans les coins.
- **Buffer longitude corrigé** : `bufferLngDeg = radiusKm / (111 * cos(lat))`. Le chemin
  d'affichage (`pois.service.ts`) divise les deux axes par 111 km, ce qui **sous-tamponne** la
  longitude (à 48° de latitude, un buffer de 3 km n'en fait que 2,0). Divergence délibérée ici ;
  le défaut préexistant du chemin d'affichage est hors périmètre → `deferred-work.md`.

### 6. Un échec fournisseur n'est pas un zéro (leçon 17.13, règle 1)

Overpass est resté injoignable **5 mois** parce qu'un 406 ressemblait à une absence de
résultats. Le même piège existe ici, en pire : un 429 de quota sur les 6 types d'un candidat
donnerait « 0 hébergement », et l'algorithme conclurait « aucun hébergement entre le km X et le
km Y » — un mensonge indiscernable de la vérité terrain.

Règle : le comptage retourne `{ count, determinate }`. `determinate: false` dès qu'**aucun** type
n'a répondu. Un candidat indéterminé est **écarté sans être compté comme un refus**, et si
*tous* les candidats d'une étape sont indéterminés, le warning est `provider_unavailable`
(« vérification impossible, réessayez »), **jamais** `no_accommodation`.
Corollaire : **ne jamais mettre en cache un comptage indéterminé.**

### 7. La génération ne préchauffe plus la carte

IDs Only ne rapporte ni nom ni position : rien n'est inséré dans `accommodations_cache`. Après
une génération, cliquer « Rechercher » coûte donc le prix normal d'une recherche (règle 11) —
la génération n'y change rien, ni en bien ni en mal.

Corollaire à ne pas confondre à la lecture des logs : le nombre annoncé par la génération et le
nombre de pins affichés ensuite **peuvent différer**. Le générateur compte des `place_id` dans un
carré ; la carte affiche des POI filtrés sur le couloir, dédoublonnés cross-source. « 3
hébergements détectés » puis 2 pins n'est pas un bug.

### 8. Les POI en cache sont stockés par `segment_id`

Le complément lu en base doit l'être **au niveau aventure** (join `accommodations_cache` →
`adventure_segments` sur `adventure_id`) avec `COUNT(DISTINCT (external_id, source))` : compter
dans le seul segment du candidat raterait les hébergements insérés sous le segment voisin quand
le candidat est près d'une frontière, et le même établissement peut exister sous deux
`segment_id`.

### 9. « On reprend l'heure de départ » ⇒ incrément CALENDAIRE, jamais 24 h en millisecondes

Le client envoie déjà un instant UTC : `new Date(valeurDatetimeLocal).toISOString()`
(`sidebar-stages-section.tsx:121`), stocké dans une colonne `timestamp` sans fuseau. Ajouter
`86 400 000 ms` par étape décale donc l'heure murale d'une heure au passage à l'heure d'hiver ou
d'été : un départ à 08:00 le 24 octobre devient 07:00 le 25. Sur une aventure de 8 jours à cheval
sur le dernier week-end d'octobre, toutes les étapes suivantes sont fausses — et l'heure fausse
part ensuite dans la prévision météo de l'étape.

L'exigence est explicite : **l'heure de départ est reprise à l'identique**. Donc :

1. Le client envoie `firstDepartureAt` (ISO) **et** `timeZone` (IANA, via
   `Intl.DateTimeFormat().resolvedOptions().timeZone`). Un instant seul ne suffit pas : le serveur
   ne peut pas savoir que `2026-10-24T06:00:00.000Z` veut dire « 08:00 à Paris ».
2. Helper pur `addDaysPreservingWallClock(baseIso, days, timeZone)` dans `packages/shared` —
   aucune dépendance à ajouter (le monorepo n'a ni `date-fns`, ni `luxon`, ni `dayjs` ; tout est
   en `Date` natif, et `mapWithConcurrency` / `poi-dedup` montrent la convention : petit helper
   pur et testé). Principe : lire l'heure murale de l'instant de base dans `timeZone` via
   `Intl.DateTimeFormat`, incrémenter la **date** en arithmétique UTC (aucun DST en jeu sur une
   date nue), puis résoudre l'instant de la nouvelle heure murale en deux passes d'offset.
3. **`timeZone` vient du client, donc non fiable** : un identifiant IANA invalide fait *lever* un
   `RangeError` à `new Intl.DateTimeFormat('en', { timeZone })`. Valider dans un `try/catch` et
   retomber sur `'UTC'` — sans ça, une valeur bidon renvoie un 500 au lieu d'un résultat.
4. Cas limites à figer par des tests : heure murale **inexistante** (passage à l'heure d'été,
   02:30) → résolution vers l'avant ; heure **ambiguë** (retour à l'heure d'hiver) → première
   occurrence. Un départ à 08:00 ne les rencontre jamais, mais le comportement doit être pinné
   plutôt que subi.

---

## Invariant — ZÉRO requête facturée (exigence Guillaume, 2026-08-20)

La génération d'étapes ne doit émettre **aucun** appel Google facturable. Ce n'est pas une
consigne de vigilance : c'est un invariant à outiller, parce que le projet a déjà perdu de
l'argent et du temps exactement là (prefetch carte en masque Pro pendant 5 mois, 406 Overpass lu
comme une absence de résultats). Une phrase dans un commentaire n'a pas suffi la première fois.

### État des lieux — il n'existe que deux appels facturables dans toute l'API

```
apps/api/src/pois/pois.service.ts:238   getPlaceDetails(placeId)          → Place Details Pro
apps/api/src/pois/pois.service.ts:419   searchPlacesByType(bbox, types)   → Text Search Pro
```

`density-analyze.processor.ts:130` utilise `searchLayerPlaceIds` — masque IDs Only, gratuit.
**La génération d'étapes doit rester dans cette seconde famille, et n'appeler ni l'un ni l'autre
des deux sites ci-dessus.**

### Les cinq verrous

1. **Un seul point de décision de facturation.** `textSearch(bbox, type, textQuery, mask,
   paginate)` est déjà le seul endroit où le SKU se décide. On y ajoute la résolution explicite
   du palier : `resolveSku(mask) → 'essentials_ids_only' | 'pro'`.

2. **Un compteur par SKU, injectable.** `GoogleBillingCounter` (`apps/api/src/pois/providers/`)
   incrémenté dans `textSearch` **et** dans `getPlaceDetails`. Deux compteurs : `free`, `billable`.

3. **Garde d'exécution dans le générateur.** Snapshot du compteur `billable` avant et après la
   génération. Delta > 0 →
   - log `error` : `[Stage gen] FACTURATION INATTENDUE : n appel(s) Pro émis` ;
   - warning `unexpected_billing` dans la réponse ;
   - en `NODE_ENV !== 'production'`, **throw** — la CI et le dev local échouent bruyamment.
   Un log seul en prod (pas de throw) : on ne casse pas une génération déjà payée, on la signale.

4. **Verrou statique du masque** (T12) : assertion sur l'en-tête `X-Goog-FieldMask` émis par le
   chemin de comptage — exactement `places.id,nextPageToken`, et aucun `pageToken` dans le corps.

5. **Verrou statique des dépendances** (T13) : un test lit le source de
   `stage-generator.service.ts` et échoue s'il contient `PoisService`, `getPlaceDetails`,
   `searchPlacesByType`, `MASK_PRO` ou `PRO_FIELDS`. Grossier, mais c'est le seul verrou qui
   résiste à un futur « je réutilise `findPois`, c'est déjà écrit » — la tentation est réelle,
   puisque c'était la conception de la veille.

### Plafond dur du nombre d'appels

`MAX_COUNT_REQUESTS_PER_GENERATION = 600`. Atteint → la génération s'arrête avec le warning
`request_budget_reached`. Défense en profondeur : borne le rayon d'action d'une régression
future, et protège aussi le quota de débit (cf. Risques).

### Ce qui reste à confirmer sur le plancher gratuit

Le provider documente le SKU **Text Search Essentials (IDs Only)** comme « gratuit et illimité »,
et c'est bien ainsi que Google le tarifie aujourd'hui (0,00 $). Mais un plafond mensuel a déjà
existé sur les paliers Essentials, et la story ne peut pas le garantir à la place de la console
de facturation : **T16 vérifie le relevé réel après une génération** (SKU consommé, montant à
0,00 $, absence de plafond mensuel applicable). Si un plafond existe, il est franchissable :
le cache Redis des comptages et le plafond dur ci-dessus le rendent gérable, mais ce serait à
documenter dans la règle 11.

---

## Acceptance Criteria

1. **Given** une aventure avec au moins un segment `parseStatus='done'`,
   **When** l'utilisateur ouvre la section « Étapes » de la sidebar planning,
   **Then** un bouton « Générer les étapes » est présent, désactivé si aucun segment n'est parsé
   ou si le profil n'est pas encore chargé (règle 9 : `useOverpassEnabled().ready`).

2. **Given** le formulaire de génération ouvert,
   **When** il s'affiche,
   **Then** il propose : **km par jour** (requis, 10–300, défaut 80), **D+ max par étape**
   (optionnel, vide = pas de contrainte), **types d'hébergement** (multi-sélection parmi
   `LAYER_CATEGORIES.accommodations`, au moins 1, défaut = les types cochés dans
   `activeAccommodationTypes`), et — **si et seulement si des étapes existent déjà** — un choix
   **« Remplacer les étapes existantes » / « Compléter à partir du km N »**.

3. **Given** aucune étape n'existe,
   **When** le formulaire s'affiche,
   **Then** le choix remplacer/compléter est absent (rien à remplacer) et la génération part de
   `km 0`.

4. **Given** le formulaire valide et le mode « Remplacer »,
   **When** l'utilisateur confirme,
   **Then** une `AlertDialog` de confirmation annonce le nombre d'étapes qui vont être
   supprimées, et rien n'est supprimé avant confirmation.

5. **Given** une génération lancée,
   **When** la requête est en vol,
   **Then** le bouton passe en état chargement et le formulaire est verrouillé. Aucun spinner
   plein écran (règle « Loading States »).

6. **Given** une aventure de 240 km, `targetKmPerDay=80`, `hotel` coché, et au moins 3 hôtels
   détectés autour des km 80 et 160,
   **When** la génération s'exécute,
   **Then** 3 étapes sont créées : `[0–80]`, `[80–160]`, `[160–240]`, nommées « Étape 1..3 »,
   couleurs cyclées sur `STAGE_COLORS` par `orderIndex`, et la liste des étapes est rafraîchie
   (`['adventures', adventureId, 'stages']`).

7. **Given** un candidat à évaluer,
   **When** l'algorithme le teste,
   **Then** le comptage vaut `max(place_id distincts retournés par Google IDs Only sur la bbox du
   candidat, lignes distinctes d'`accommodations_cache` dans le rayon)`, restreint aux types
   demandés et aux sources autorisées par le profil — et le candidat est retenu si ce nombre
   est ≥ `STAGE_GEN_MIN_ACCOMMODATIONS` (3).

8. **Given** le candidat nominal (`prevEndKm + targetKmPerDay`) est rejeté,
   **When** l'algorithme cherche une alternative,
   **Then** il essaie les décalages `−5, +5, −10, +10 … −40, +40` km dans cet ordre et retient
   **le premier** candidat qui satisfait *à la fois* le seuil d'hébergements et la contrainte
   D+.

9. **Given** aucun des 17 candidats ne satisfait les contraintes alors que les comptages étaient
   **déterminés**,
   **When** l'algorithme abandonne cette étape,
   **Then** la génération **s'arrête** ici, les étapes déjà créées sont conservées, et la
   réponse porte un warning `no_accommodation` avec la tranche explorée
   (`[cible−40, cible+40]`), rendu à l'écran comme : « Aucun hébergement correspondant entre le
   km X et le km Y. 3 étapes créées, le reste du parcours n'est pas découpé. »

10. **Given** aucun type Google n'a répondu pour un candidat (quota, 5xx, timeout),
    **When** l'algorithme traite ce candidat,
    **Then** il est écarté **sans** compter comme un refus, le comptage n'est **pas** mis en
    cache, et si tous les candidats d'une étape sont dans ce cas, le warning est
    `provider_unavailable` (« vérification impossible, réessayez ») — **jamais**
    `no_accommodation`.

11. **Given** la distance restante après une étape est ≤ `targetKmPerDay`,
    **When** l'algorithme continue,
    **Then** il crée une **dernière étape jusqu'à la fin de la trace** sans vérifier les
    hébergements ni le D+ (la destination finale n'est pas déplaçable), avec un warning
    informatif `sparse_final_stage` si elle compte moins de 3 hébergements.

12. **Given** un GPX sans données d'élévation et un `maxElevationGainM` renseigné,
    **When** la génération s'exécute,
    **Then** la contrainte D+ est ignorée et un warning `no_elevation_data` est retourné une
    seule fois — la génération n'échoue pas.

13. **Given** le mode « Compléter à partir du km N »,
    **When** la génération s'exécute,
    **Then** aucune étape existante n'est supprimée ni modifiée, et la première étape générée
    part de `dernière étape.endKm`.

14. **Given** la génération dépasse `MAX_GENERATED_STAGES_PER_CALL` (14),
    **When** la limite est atteinte,
    **Then** la réponse s'arrête là avec un warning `truncated`, et l'UI propose « Générer la
    suite » (qui relance en mode « compléter »).

15. **Given** l'appel échoue (réseau, 5xx, timeout),
    **When** l'erreur remonte,
    **Then** un toast d'erreur s'affiche, les étapes créées avant l'échec restent en base
    (le refetch les montre), et le formulaire reste ouvert avec les valeurs saisies.

16. **Given** seul « Refuge / Abri » est coché,
    **When** le formulaire est rempli,
    **Then** un message d'avertissement explique que ce type n'existe que dans OSM et que la
    génération ne s'appuiera que sur les données déjà en cache.

17. **Given** le formulaire de génération,
    **When** il s'affiche,
    **Then** il propose une **date et une heure de départ**, pré-remplies : la date depuis
    `adventure.startDate` si elle existe (sinon aujourd'hui), l'heure à
    `DEFAULT_DEPARTURE_HOUR` (08:00). En mode « Compléter », la date est pré-remplie à
    `dernière étape.departureTime + 1 jour` quand la dernière étape en a une.

18. **Given** une date et une heure de départ renseignées,
    **When** les étapes sont créées,
    **Then** l'étape *i* (0-indexée) porte `departureTime = première date + i jours`, **à la même
    heure murale**, et l'étape 1 part exactement à l'instant saisi.

19. **Given** une génération qui franchit un changement d'heure (ex. départ le 24 octobre, 8
    étapes),
    **When** on inspecte les `departureTime` créés,
    **Then** toutes les étapes partent à la même heure locale (08:00), y compris après le
    changement — l'incrément est calendaire, pas `+86 400 000 ms`.

20. **Given** un `timeZone` absent ou invalide dans la requête,
    **When** le serveur calcule les dates,
    **Then** il retombe sur `'UTC'` sans erreur — jamais de 500 sur un identifiant IANA bidon.

21. **Given** des étapes générées avec des `departureTime`,
    **When** la génération se termine et la liste est rafraîchie,
    **Then** la dialog de synchro de date de fin (17.12) se déclenche normalement via
    `onAfterChange`, puisque la dernière étape a désormais `departureTime` **et** `etaMinutes`.
    C'est le comportement attendu, pas un effet de bord à neutraliser.

22. **Given** une génération complète, quel que soit son résultat,
    **When** on inspecte les compteurs de facturation Google,
    **Then** le nombre d'appels facturables (Text Search Pro, Place Details) émis par la
    génération est **exactement 0**. Un delta non nul est loggué en `error`, remonté en warning
    `unexpected_billing`, et fait échouer les tests hors production.

23. **Given** une génération qui atteindrait `MAX_COUNT_REQUESTS_PER_GENERATION` (600) appels de
    comptage,
    **When** le plafond est atteint,
    **Then** la génération s'arrête avec le warning `request_budget_reached` et conserve les
    étapes créées.

24. **Given** l'app mobile en mode planning,
    **When** l'utilisateur ouvre la carte « Étapes »,
    **Then** le même bouton, le même formulaire et les mêmes messages sont disponibles, avec le
    même contrat d'API (parité règle 10).

---

## Algorithme

```
generateStages(adventureId, dto):
  waypoints  = adventuresService.getAdventureWaypoints(adventureId)   // km cumulés multi-segments
  totalKm    = waypoints.at(-1).distKm
  radiusKm   = dto.radiusKm ?? DEFAULT_SEARCH_RADIUS_KM
  googleTypes = googleTypesForCategories(dto.accommodationTypes)      // 17.17 — [] si shelter seul
  minCount   = STAGE_GEN_MIN_ACCOMMODATIONS                            // 3

  tz         = validTimeZone(dto.timeZone) ?? 'UTC'                    // contrainte 9
  departureOf(i) = dto.firstDepartureAt
                     ? addDaysPreservingWallClock(dto.firstDepartureAt, i, tz)
                     : null                                            // i = index de l'étape générée

  if dto.mode === 'replace':  deleteAllStages(adventureId)
  prevEndKm  = lastStage?.endKm ?? 0
  warnings, created = [], []

  while created.length < MAX_GENERATED_STAGES_PER_CALL:
    remaining = totalKm - prevEndKm
    if remaining <= 0: break

    // AC #11 — dernière étape : la destination n'est pas déplaçable
    if remaining <= dto.targetKmPerDay:
      created.push(makeStage(prevEndKm, totalKm))
      if countAt(totalKm).count < minCount: warn('sparse_final_stage', prevEndKm, totalKm)
      break

    target = prevEndKm + dto.targetKmPerDay
    chosen, allIndeterminate = null, true

    for offset in [0, -5, +5, -10, +10, ..., -40, +40]:            // STAGE_GEN_STEP_KM / _MAX_OFFSET_KM
      endKm = target + offset
      if endKm <= prevEndKm or endKm >= totalKm: continue

      elev = computeElevationGainForRange(waypoints, prevEndKm, endKm)
      if dto.maxElevationGainM != null:
        if elev == null: warnOnce('no_elevation_data')               // AC #12
        else if elev.gain > dto.maxElevationGainM: continue          // contrainte dure, 2 sens

      { count, determinate } = countAt(endKm)
      if not determinate: continue                                   // AC #10 — pas un refus
      allIndeterminate = false
      if count >= minCount: chosen = endKm; break

    if chosen == null:
      warnings.push({ code: allIndeterminate ? 'provider_unavailable' : 'no_accommodation',
                      fromKm: target - 40, toKm: target + 40 })
      break                                                          // AC #9/#10 — arrêt net

    created.push(makeStage(prevEndKm, chosen))
    prevEndKm = chosen

  insertStagesBatch(created)            // une transaction, D+/D-/ETA calculés comme createStage
                                        // chaque makeStage(i) porte departureOf(i)
  return { stages: listStages(), created: created.length, warnings, stoppedAtKm }
```

### `countAt(km)` — le cœur, et le seul appel externe

```
countAt(km):
  pt   = interpolateAtKm(waypoints, km)
  bbox = { minLat: pt.lat - radiusKm/111,                    maxLat: pt.lat + radiusKm/111,
           minLng: pt.lng - radiusKm/(111*cos(pt.lat)),      maxLng: pt.lng + radiusKm/(111*cos(pt.lat)) }
                                                             // contrainte 5 — correction cos(lat)

  cacheKey = `stagegen:count:{bbox arrondie à 3 décimales}:{types triés}`
  si HIT Redis : retourner { count, determinate: true }

  // Gratuit (IDs Only) mais borné : mapWithConcurrency (règle 8), jamais Promise.all nu
  outcomes = mapWithConcurrency(googleTypes, GOOGLE_COUNT_CONCURRENCY /* 6 */,
               type => provider.searchPlaceIds(bbox, type, resolveTextQuery(type)))
  googleIds   = union des place_id des types en succès
  anySucceeded = au moins un type a répondu

  // Complément gratuit : ce qui est DÉJÀ en base (inclut Overpass si le profil l'autorise)
  dbCount = poisRepo.countAccommodationsNearPoint(adventureId, pt.lat, pt.lng, radiusKm*1000,
                                                 dto.accommodationTypes, excludeSourcesFromProfile)

  // `max` et non `+` : les deux ensembles se recoupent (même hôtel des deux côtés).
  // Minorant, comme dans `density-analyze.processor.ts`.
  count = max(googleIds.size, dbCount)

  determinate = anySucceeded or googleTypes.length == 0    // shelter seul ⇒ la base fait foi
  si determinate : setex(cacheKey, GOOGLE_PLACES_CACHE_TTL, count)   // jamais un indéterminé
  retourner { count, determinate }
```

**Latence attendue.** Une évaluation = 1 salve parallèle de `googleTypes.length` requêtes
(6 pour `hotel` seul) ≈ 400 ms. Cas nominal : 1 candidat par étape → 8 étapes ≈ **4 s**. Pire cas
d'une étape (17 candidats) ≈ 7 s — et il ne se produit qu'une fois, puisque l'étape qui épuise
ses 17 candidats arrête la génération. Les runs suivants sur la même zone sont servis par Redis.

---

## Contrat d'API

```
POST /adventures/:adventureId/stages/generate
```

```typescript
// packages/shared/src/types/adventure.types.ts
export interface GenerateStagesInput {
  targetKmPerDay: number                   // 10..300
  maxElevationGainM?: number               // absent = pas de contrainte
  accommodationTypes: PoiCategory[]        // ⊆ LAYER_CATEGORIES.accommodations, non vide
  radiusKm?: number                        // 0.5..MAX_SEARCH_RADIUS_KM, défaut DEFAULT_SEARCH_RADIUS_KM
  mode: 'replace' | 'fill'
  overpassEnabled?: boolean                // lecture des lignes OSM en cache
  /** Départ de la PREMIÈRE étape générée. Absent → les étapes n'ont pas de departureTime. */
  firstDepartureAt?: string                // ISO 8601
  /** IANA, ex. 'Europe/Paris'. Non fiable (client) → validé, repli 'UTC'. Cf. contrainte 9. */
  timeZone?: string
}

export type StageGenerationWarningCode =
  | 'no_accommodation'      // aucun candidat valide dans ±40 km → génération arrêtée
  | 'provider_unavailable'  // comptage impossible (quota/5xx) → NE PAS lire comme une absence
  | 'no_elevation_data'     // D+ demandé mais GPX sans altitudes → contrainte ignorée
  | 'sparse_final_stage'    // dernière étape créée d'office, < 3 hébergements
  | 'truncated'             // MAX_GENERATED_STAGES_PER_CALL atteint
  | 'request_budget_reached'// MAX_COUNT_REQUESTS_PER_GENERATION atteint
  | 'unexpected_billing'    // un appel facturable a fui dans le chemin — anomalie, cf. Invariant

export interface StageGenerationWarning {
  code: StageGenerationWarningCode
  fromKm: number | null
  toKm: number | null
}

export interface GenerateStagesResponse {
  stages: AdventureStageResponse[]   // liste COMPLÈTE après génération
  created: number
  warnings: StageGenerationWarning[]
  stoppedAtKm: number | null         // km atteint quand la génération s'est arrêtée avant la fin
}
```

Le `ResponseInterceptor` global wrappe en `{ data: ... }`. **Nouvel** endpoint, donc aucun
risque de casser les binaires mobiles déjà distribués (corollaire d'API de la règle 12) — et
c'est précisément pourquoi on n'enrichit pas `POST /stages` existant.

### Constantes (`packages/shared/src/constants/stages.constants.ts`)

```typescript
export const STAGE_GEN_STEP_KM = 5
export const STAGE_GEN_MAX_OFFSET_KM = 40
export const STAGE_GEN_MIN_ACCOMMODATIONS = 3
export const MAX_GENERATED_STAGES_PER_CALL = 14
export const DEFAULT_TARGET_KM_PER_DAY = 80
export const DEFAULT_DEPARTURE_HOUR = 8      // heure pré-remplie dans le formulaire
/** Dérivé — ne pas redéclarer la liste (une seule source de vérité) */
export const ACCOMMODATION_CATEGORIES = LAYER_CATEGORIES.accommodations
```

Côté API : `GOOGLE_COUNT_CONCURRENCY = 6`, `MAX_COUNT_REQUESTS_PER_GENERATION = 600`.

---

## Tâches / Sous-tâches

### Phase 1 — Contrat partagé

- [x] **T1** — `packages/shared` : constantes ci-dessus + types `GenerateStagesInput`,
      `GenerateStagesResponse`, `StageGenerationWarning`, exports dans `index.ts`.
      Test : `ACCOMMODATION_CATEGORIES` reste égal à `LAYER_CATEGORIES.accommodations`
      (verrou anti-divergence, comme le test de partition de 17.17).
- [x] **T1b** — `packages/shared` : helper pur `addDaysPreservingWallClock(baseIso, days,
      timeZone)` + `isValidTimeZone(tz)` (`try/catch` sur `new Intl.DateTimeFormat`).
      **Aucune dépendance ajoutée** — `Intl` suffit, le monorepo n'a ni `date-fns` ni `luxon`.
      Tests : +1 jour ordinaire ; traversée du passage à l'heure d'hiver (24 → 25 oct.,
      `Europe/Paris`) → **même heure murale** ; traversée du passage à l'heure d'été ; heure
      murale inexistante (02:30 au printemps) → résolution vers l'avant ; heure ambiguë →
      première occurrence ; `timeZone` invalide → repli `'UTC'`.

### Phase 2 — API

- [x] **T2** — `apps/api/src/stages/dto/generate-stages.dto.ts` : `class-validator`
      (`@Min/@Max` sur `targetKmPerDay`, `@ArrayNotEmpty` + `@IsIn(ACCOMMODATION_CATEGORIES)`,
      `@Max(MAX_SEARCH_RADIUS_KM)` sur `radiusKm`, `@IsIn(['replace','fill'])`,
      `@IsISO8601()` sur `firstDepartureAt` (optionnel, même forme que `CreateStageDto`),
      `@IsString()` sur `timeZone` — la validité IANA se vérifie dans le service, pas par un
      décorateur (liste non énumérable).
- [x] **T3** — `google-places.provider.ts` : `countPlaceIdsForTypes(bbox, googleTypes)` →
      `{ ids: Set<string>, anySucceeded: boolean, requests: number }`.
      **Masque `MASK_IDS_ONLY` uniquement, une page, aucune pagination** — reprendre le
      commentaire d'avertissement de `searchLayerPlaceIds`. Aucun paramètre `mask` exposé à
      l'appelant : le masque est décidé dans la méthode.
      Ne pas réutiliser `searchLayerPlaceIds` telle quelle : elle prend un *calque* et
      interrogerait les 16 types au lieu des types demandés (annulerait 17.17), et elle avale les
      échecs (`allSettled` sans remonter `anySucceeded`), ce que la contrainte 6 interdit ici.
- [x] **T4** — **Invariant de facturation** : `resolveSku(mask)` + service injectable
      `GoogleBillingCounter` (`{ free, billable }`), incrémenté dans `textSearch` **et** dans
      `getPlaceDetails`. Aucun autre chemin ne doit pouvoir émettre une requête Google.
- [x] **T5** — `pois.repository.ts` : `countAccommodationsNearPoint(adventureId, lat, lng,
      radiusM, categories, excludeSources)` — join `adventure_segments`, `expires_at > now()`,
      `ST_DWithin`, `COUNT(DISTINCT (external_id, source))`. Toutes les requêtes Drizzle restent
      au repository (jamais dans un service).
- [x] **T6** — `stages.repository.ts` : `deleteAllByAdventureId(adventureId)` et
      `createMany(rows)` (insertion batchée, une transaction — pas un INSERT par étape).
- [x] **T7** — `apps/api/src/stages/stage-generator.service.ts` : l'algorithme ci-dessus.
      Injecte `GooglePlacesProvider` + `GoogleBillingCounter` + `PoisRepository` +
      `RedisProvider` + `StagesRepository` + `AdventuresService`.
      **N'injecte PAS `PoisService`** : le comptage ne passe plus par le chemin d'affichage
      (facturé Pro). Garde de facturation (verrou 3) + plafond
      `MAX_COUNT_REQUESTS_PER_GENERATION`.
      Réutiliser `computeElevationGainForRange` / `computeEtaMinutes` exportés de
      `stages.service.ts` — ne pas les dupliquer.
      Chaîne les `departureTime` via `addDaysPreservingWallClock` (contrainte 9).
      Logs de signature (règle 13) :
      `[Stage gen] target=Xkm offset=-5 count=2/3 (google=2 db=0) → rejet`,
      `[Stage gen] offset=+5 INDÉTERMINÉ (0/6 types ont répondu)`,
      `[Stage gen] terminé — 8 étapes, 54 appels gratuits, 0 facturé`.
- [x] **T8** — `stages.controller.ts` : `@Post('generate')` sur
      `@Controller('adventures/:adventureId/stages')`, `@CurrentUser()`, retour brut.
      Pas de try/catch (`HttpExceptionFilter` global).
      `BadRequestException` si aucun segment `parseStatus='done'`.

### Phase 3 — Clients

- [x] **T9** — `apps/web` :
  - `lib/api-client.ts` : `generateStages(adventureId, input)`.
  - `hooks/use-stages.ts` : `generateStages` en `useMutation`, `onSuccess` → `refetchQueries(['adventures', id, 'stages'])` + `onAfterChange` (déclenche la synchro de date de fin de 17.12).
  - `_components/generate-stages-dialog.tsx` : formulaire (Dialog shadcn, boutons `size="lg"` — cf. règle Button/DialogFooter), `AlertDialog` de confirmation en mode « Remplacer » (AC #4), avertissement `shelter` (AC #16), rendu des warnings (AC #9/#10/#12/#14/#18) avec un message **distinct** pour `provider_unavailable`.
  - `_components/sidebar-stages-section.tsx` : bouton « Générer les étapes » + état chargement (AC #1/#5).
  - Champ **date + heure de départ** (`<input type="datetime-local">`, même convention que le dialog de création existant : `new Date(valeur).toISOString()`), pré-rempli selon l'AC #17, et `timeZone` = `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - Valeurs par défaut lues dans `useMapStore` : `searchRadiusKm`, `activeAccommodationTypes`.
  - `overpassEnabled` via `useOverpassEnabled()` avec **gate sur `ready`** (règle 9).
  - Libellés : « autour du point », jamais « dans un rayon de » (contrainte 5).

- [x] **T10** — `apps/mobile`, port iso (règle 10) :
  - `lib/api/stages.ts` : `generateStages` (chemin **sans** `/api`).
  - `hooks/use-stages.ts` : même mutation.
  - `components/map/generate-stages-dialog.tsx` (NativeWind, tokens `@ridenrest/design-tokens`, icônes `lucide-react-native`), i18n FR/EN — dont le sélecteur date + heure (réutiliser celui de `stage-dialog.tsx`) et l'envoi de `timeZone`.
  - `components/map/sidebar-stages-section.tsx` : bouton + état chargement.
  - Tests **hors** `src/app/` s'ils importent une route.

### Phase 4 — Tests

- [x] **T11** — Jest API (`stage-generator.service.test.ts`) :
      cible OK au premier coup ; ordre des décalages respecté (`0, −5, +5, −10 …`) ;
      D+ rejette un candidat en avance comme en recul ; `elevationGainM=null` → contrainte
      ignorée + warning une seule fois ; 17 refus déterminés → `no_accommodation` avec la bonne
      tranche ; **tous les types en échec → `provider_unavailable`, pas `no_accommodation`, et
      aucune écriture Redis** (le test qui protège contre la répétition de la panne Overpass) ;
      `max(google, db)` et non la somme ; `shelter` seul → **zéro** appel Google, comptage porté
      par la base ; mode `fill` ne touche pas les étapes existantes ; mode `replace` supprime
      d'abord ; `remaining <= targetKmPerDay` → étape finale jusqu'à `totalKm` sans vérification ;
      chaînage des départs : étape *i* à `première + i jours` **à la même heure murale**, y
      compris à cheval sur un changement d'heure ; `firstDepartureAt` absent → `departureTime`
      null sur toutes les étapes ; `timeZone` invalide → repli UTC sans erreur ;
      `MAX_GENERATED_STAGES_PER_CALL` → `truncated` ; plafond d'appels →
      `request_budget_reached` ; HIT Redis → aucun appel provider ;
      **`GoogleBillingCounter.billable` reste à 0 sur chacun des scénarios ci-dessus**.
- [x] **T12** — Jest API (`google-places.provider.test.ts`) — **verrou du masque** : le chemin de
      comptage envoie `X-Goog-FieldMask` exactement égal à `places.id,nextPageToken`, sans
      `places.location` / `displayName` / `types`, et **sans** `pageToken` dans le corps. C'est ce
      test qui garde la gratuité ; le nommer explicitement comme tel.
- [x] **T13** — Jest API — **verrou statique des dépendances** : lecture du source de
      `stage-generator.service.ts`, échec s'il contient `PoisService`, `getPlaceDetails`,
      `searchPlacesByType`, `MASK_PRO` ou `PRO_FIELDS`. Message d'échec explicite pointant vers
      la section « Invariant » de cette story.
- [x] **T14** — Vitest web : formulaire (validation, défauts issus du store, avertissement
      `shelter`, confirmation avant remplacement, bouton désactivé tant que le profil n'est pas
      `ready`), rendu distinct de chaque code de warning.
- [x] **T15** — Jest mobile : mêmes cas sur le dialog mobile.

### Phase 5 — Validation & doc

- [x] **T16a** — **Validation web (desktop)** : effectuée par Guillaume le 2026-08-20 —
      génération fonctionnelle sur une aventure réelle. ✅
- [ ] **T16b** — **Validation mobile** : différée (décision Guillaume 2026-08-20). La story
      reste en `review` tant que ce point n'est pas couvert. Le code mobile n'ajoute aucun
      module natif, donc `pnpm sim` suffit — pas de `prebuild`.
- [ ] **T16c** — **Relevé de facturation Google** : non couvert par la validation web.
      Vérifier dans la console Cloud que la génération a consommé le SKU **Text Search
      Essentials (IDs Only)** pour **0,00 $**, et qu'aucun plafond mensuel ne s'y applique.
      C'est le seul point qui confirme l'invariant côté fournisseur plutôt que côté code.
- [x] **T17** — Doc Sync (règle CRITICAL) : entrée `17-18-…` dans `sprint-status.yaml`, section
      Story 17.18 dans `epics.md`, et amendement de la **règle 11** de `project-context.md` —
      elle documente aujourd'hui `searchLayerPlaceIds` (densité) comme seul chemin de comptage
      gratuit ; la génération d'étapes en devient le second, avec le même interdit de bascule
      vers `MASK_PRO` et le compteur `GoogleBillingCounter` comme garde-fou outillé.

## Vérifications (2026-08-20)

### Gate

| périmètre | tests | avant | tsc | eslint |
|---|---|---|---|---|
| `packages/shared` | **65** (6 fichiers) | 41 | 0 | 0 |
| `apps/api` | **527** (41 suites) | 481 (39) | 0 | 0 |
| `apps/web` | **1199** (101 fichiers) | 1182 (100) | 89 = **baseline** | 0 erreur |
| `apps/mobile` | **669** (97 suites) | 657 (96) | 0 | 0 |

`turbo run test` : 10 tâches, 10 succès.

Les 89 erreurs `tsc` du web sont **préexistantes** et toutes dans des fichiers de test
(`use-pois.test.ts` en majorité) : mesuré à 89 avant **et** après, via `git stash push -u`.
Idem pour les 2 avertissements ESLint de `map-view.tsx` (`react-hooks/exhaustive-deps` +
directive `eslint-disable` inutile), présents au baseline aux mêmes règles.

⚠️ Première tentative de mesure faussée : `git stash push --keep-index` laisse les fichiers
**non suivis** en place tout en retirant les modifications — on obtenait donc un état
incohérent (le dialog existait, son import non) et un faux baseline de 98. `push -u` est
la bonne commande pour ce projet.

### Route réellement montée (règle 13)

Le contrôle qui compte n'est pas « ça répond », c'est « ça répond *parce que la route
existe* » :

```
POST /api/adventures/{uuid}/stages/generate        → 401   (route matchée, guard rejette)
POST /api/adventures/{uuid}/stages/nonexistent     → 404   (contrôle : rien ne matche)
```

Le 404 du chemin frère prouve que le 401 vient bien du nouveau contrôleur, et non d'une
réponse d'authentification servie à tout va.

### Comportements mesurés, pas supposés

- **Incrément calendaire** : `2026-10-24T06:00Z + 1 jour` = `2026-10-25T07:00Z`, soit un saut
  de **25 h**. Un `+86 400 000` aurait donné 07:00 locale au lieu de 08:00. Sur 5 étapes à
  partir du 22 octobre, exactement **un** saut de 25 h et quatre de 24 h.
- **Cas limites DST** figés après mesure : heure murale inexistante (02:30 au printemps) →
  résolution vers l'avant (03:30) ; heure ambiguë (02:30 à l'automne) → **seconde** occurrence
  (`01:30Z`). L'hypothèse initiale « première occurrence » était fausse — corrigée sur la
  mesure, et l'idempotence est testée.
- **Invariant de facturation** : `billable === 0` asserté sur le cas nominal, sur l'échec
  total du fournisseur, et le `throw` hors production vérifié en simulant une fuite
  (`billing.record('text_search_pro')` depuis le mock du provider).
- **Verrou du masque** : assertion sur l'en-tête `X-Goog-FieldMask` réellement émis
  (`places.id,nextPageToken`), absence de `pageToken` dans le corps, et `free: 3 / billable: 0`
  sur 3 types.

### Écarts assumés par rapport à la story

- **`GOOGLE_COUNT_CONCURRENCY` et `MAX_COUNT_REQUESTS_PER_GENERATION` restent côté API**
  (`stage-generator.service.ts`) et non dans `packages/shared` : aucun client n'en a besoin.
- **Le libellé du warning mobile utilise le token `density-medium`** (l'ambre du design
  system) : il n'existe pas de token `warning`, et le contexte projet interdit une couleur en
  dur côté mobile.
- **Le mobile n'a pas de toast** : les statuts de génération s'affichent dans un encart
  dismissible sous le CTA de la carte « Étapes », là où le web utilise `sonner` + encart.

### État de la validation terrain

- ✅ **Web (desktop)** — validé par Guillaume le 2026-08-20 : la génération fonctionne sur une
  aventure réelle.
- ⏳ **Mobile** — **reste à tester**, différé par Guillaume. Aucun module natif ajouté, donc
  `pnpm sim` suffit (pas de `prebuild --clean`). Le dialog n'a jamais été observé sur device ;
  seuls ses tests unitaires (12) le couvrent.
- ⏳ **Facturation Google** — **non couvert par la validation web**. Les tests prouvent que le
  code ne *demande* que le masque IDs Only ; seul le relevé Cloud prouve que Google ne *facture*
  rien. Tant que ce point n'est pas fait, l'invariant est vérifié côté code uniquement.

## Correctif de suite — « ETA » affichait une durée (2026-08-20)

**Retour Guillaume après la validation web** : le cartouche annonçait « ETA ~13h00 » pour une
étape de 195 km partant à 08:00. `ETA` se lit comme une heure d'arrivée ; la valeur affichée
était la **durée** (`etaMinutes` = roulage + pause). L'arrivée réelle est 21:00.

Deux défauts distincts, tous deux corrigés :

1. **Mauvais label.** `etaMinutes` est une durée, pas un instant. On distingue désormais
   « Arrivée 21:00 · 13h de trajet » (quand le départ est connu) de « Durée 13h » (sinon).
2. **Format ambigu.** `~13h00` ressemble à 13:00. `formatDuration` rend `13h` pour une durée
   pile — un test verrouille explicitement `formatDuration(780) !== '13h00'`.

L'arrivée est **dérivée, jamais stockée** : `computeStageArrival(departureTime, etaMinutes)`
dans `packages/shared/src/utils/stage-timing.ts` (9 tests). Aucun changement d'API ni de schéma.

⚠️ **Nuance à ne pas « corriger » plus tard** : ce helper ajoute des **millisecondes**, alors que
le chaînage des départs (`addDaysPreservingWallClock`) incrémente une **date civile**. Ce n'est
pas une incohérence — une étape de 13 h qui traverse la nuit du changement d'heure dure
réellement 13 h et son heure murale d'arrivée doit se décaler, tandis que « le lendemain à la
même heure » est une notion civile. Un test couvre chacun des deux cas.

Détails d'affichage :
- l'arrivée est **datée** quand elle tombe le lendemain (« ven. 21 août · 04:00 ») — sans quoi
  une étape de 10 h partie à 18:00 afficherait « Arrivée 04:00 » sans dire quel jour ;
- la pause reste mentionnée (`(dont 1h de pause)`), puisqu'elle est déjà comprise dans la durée ;
- **mode live** : la durée restante était affichée nue (`~2h15`), même ambiguïté → préfixée
  « dans ~2h15 ».

Portée : `packages/shared` (helper + 9 tests), `apps/web` (`stage-card.tsx` + tests réécrits),
`apps/mobile` (`stage-card.tsx`, `lib/format/stage.ts`, i18n FR/EN). Gate après correctif :
shared **74**, web **1201**, mobile **669**, `tsc` web de retour à **89 = baseline**.

## Hors périmètre (explicite)

- **Écriture en retour dans `adventure.startDate`** : le formulaire *lit* `startDate` pour
  pré-remplir la date, mais ne la réécrit jamais, même si l'utilisateur choisit une autre date.
  Aucune écriture cachée. La date de **fin**, elle, reste proposée par le flux existant de 17.12,
  qui demande confirmation.
- **Une durée autre qu'un jour par étape** : l'incrément est fixé à +1 jour, y compris pour une
  étape allongée à 120 km par le « +40 km ». C'est cohérent avec un objectif exprimé en km/**jour** ;
  les jours de repos (une étape = 2 jours) sont une autre story.
- **Prévision météo au-delà de l'horizon du fournisseur** : les étapes lointaines auront un
  `departureTime` mais pas de météo (Open-Meteo ne prévoit qu'à quelques jours). Ce n'est pas un
  défaut de la génération — le badge météo dégrade déjà proprement.
- **`speedKmh` / `pauseHours` par étape** : `null` → héritent de `adventure.avgSpeedKmh`.
- **Rafraîchissement Overpass** pendant la génération (contrainte 3).
- **Préchauffage de la carte** par la génération (contrainte 7).
- **Sous-tamponnage en longitude du chemin d'affichage** (`pois.service.ts`, contrainte 5) →
  `deferred-work.md`.

## Risques

| Risque | Détail | Mitigation |
|---|---|---|
| **Quota QPM Google** | IDs Only est gratuit mais **pas exempt de quota de débit**. Pire cas théorique : 14 étapes × 17 candidats × 6 types = 1 428 requêtes en moins d'une minute. | `MAX_COUNT_REQUESTS_PER_GENERATION = 600` ; `mapWithConcurrency` à 6 (règle 8) ; cache Redis des comptages ; et surtout contrainte 6 — un 429 doit produire `provider_unavailable`, pas « aucun hébergement ». Relever le seuil de concurrence uniquement après mesure. |
| **Régression vers un appel facturé** | Le scénario le plus probable : quelqu'un « réutilise `findPois`, c'est déjà écrit » — c'était littéralement la conception de la veille — ou ajoute `places.location` au masque pour afficher les hébergements trouvés. | Les cinq verrous de la section « Invariant » : point de facturation unique, compteur par SKU, garde d'exécution avec `throw` hors production, verrou du masque (T12), verrou statique des dépendances (T13). |
| **Plancher gratuit du SKU** | La story s'appuie sur « Text Search Essentials (IDs Only) = 0,00 $, illimité ». Un plafond mensuel a déjà existé sur les paliers Essentials. | T16 vérifie le relevé de facturation réel. Si un plafond existe : cache Redis + plafond dur le rendent gérable, mais à documenter dans la règle 11. |
| **Durée de la requête** | ~4 s en nominal, ~7 s de plus quand une étape épuise ses 17 candidats. Endpoint synchrone. | Marge confortable sous les timeouts par défaut. `MAX_GENERATED_STAGES_PER_CALL = 14` borne le total. Bascule BullMQ (`stage-generation`, `DensityService` comme modèle) seulement si T14 mesure un p95 > 30 s. |
| **Sur-comptage par la bbox** | Un hébergement à 4,24 km dans un coin compte pour un rayon annoncé de 3 km. | Libellés « autour du point » (contrainte 5). Si l'écart gêne à l'usage, la seule correction possible passe par le masque Pro — donc payante : à ne faire que sur constat terrain. |
| **Sur-longueur d'étape** | Le « +40 km » peut produire une étape de 120 km pour un objectif de 80. | Décision produit assumée ; l'écart est visible sur le cartouche de l'étape. Si gênant, rendre le sens d'exploration configurable. |
