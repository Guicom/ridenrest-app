#!/usr/bin/env bash
# Seed E2E web (one-shot, idempotent) : crée le user de test + une aventure parsée.
#
# - User de test via Better Auth (email/mot de passe — Google OAuth non scriptable).
# - Aventure : DUPLIQUÉE depuis une aventure source qui a une trace parsée (waypoints
#   en DB) → pas besoin de re-parser ni de copier les GPX (le rendu vient des waypoints).
#
# Usage : SRC_ADVENTURE_ID=<uuid-source> bash apps/web/e2e/seed.sh
# Puis reporter l'EADV affiché dans apps/web/.env.test (E2E_ADVENTURE_ID).
set -euo pipefail

BASE_URL="${E2E_BASE_URL:-http://localhost:3011}"
PGURL="${DATABASE_URL:-postgresql://ridenrest:ridenrest@localhost:5432/ridenrest}"
EMAIL="${E2E_EMAIL:-e2e@ridenrest.local}"
PASSWORD="${E2E_PASSWORD:-Test1234!}"
SRC="${SRC_ADVENTURE_ID:?Définis SRC_ADVENTURE_ID (une aventure existante avec trace parsée)}"

echo "▶︎ Création/au besoin du user de test ($EMAIL)…"
curl -s -X POST "$BASE_URL/api/auth/sign-up/email" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"E2E Bot\"}" >/dev/null || true
USER_ID=$(psql "$PGURL" -t -A -q -c "select id from \"user\" where email='$EMAIL' limit 1;" | tr -d '[:space:]')
[ -n "$USER_ID" ] || { echo "❌ user introuvable"; exit 1; }

echo "▶︎ (Re)seed de l'aventure pour $USER_ID (source $SRC)…"
psql "$PGURL" -q -c "delete from adventures where user_id='$USER_ID';"
NEW_ADV=$(psql "$PGURL" -t -A -q -c "insert into adventures (id,user_id,name,total_distance_km,status,created_at,updated_at,density_status,total_elevation_gain_m,density_progress,density_categories,start_date,end_date,density_analyzed_at,avg_speed_kmh,total_elevation_loss_m,routing_profile) select gen_random_uuid(),'$USER_ID',name||' (E2E)',total_distance_km,status,now(),now(),density_status,total_elevation_gain_m,density_progress,density_categories,start_date,end_date,density_analyzed_at,avg_speed_kmh,total_elevation_loss_m,routing_profile from adventures where id='$SRC' returning id;" | tr -d '[:space:]')
psql "$PGURL" -q -c "insert into adventure_segments (id,adventure_id,name,order_index,cumulative_start_km,distance_km,elevation_gain_m,storage_url,parse_status,geom,waypoints,bounding_box,created_at,updated_at,source,elevation_loss_m) select gen_random_uuid(),'$NEW_ADV',name,order_index,cumulative_start_km,distance_km,elevation_gain_m,storage_url,parse_status,geom,waypoints,bounding_box,now(),now(),source,elevation_loss_m from adventure_segments where adventure_id='$SRC';"

echo "✅ EADV=$NEW_ADV"
echo "   → mets à jour E2E_ADVENTURE_ID=$NEW_ADV dans apps/web/.env.test"
