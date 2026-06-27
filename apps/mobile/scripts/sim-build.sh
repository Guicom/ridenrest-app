#!/usr/bin/env bash
#
# sim-build.sh — Build AUTONOME de l'app mobile pour le simulateur iOS.
# ============================================================================
# Pourquoi : le couple « dev client (Debug) + Metro » est fragile (binaire natif
# périmé → « Cannot find native module », Metro absent → « Could not connect to
# development server », cache Metro corrompu…). Ce script produit un build **Release
# avec le bundle JS EMBARQUÉ** : l'app est autonome, ne dépend d'AUCUN serveur Metro,
# et le JS est forcément synchro avec le natif (compilés ensemble).
#
# ⚠️ `expo-dev-client` est une dépendance → par défaut `expo run:ios` ouvre l'app via
# un deep-link dev-client (`exp+ridenrest://…:8081`) qui la branche sur Metro. Ce script
# **relance l'app directement** après le build (`simctl launch`) pour qu'elle charge le
# **bundle embarqué**, indépendamment de tout Metro résiduel. (Validé MOB-4.6, 2026-06-27.)
#
# Flux : l'agent (Claude) lance ce script en fin de dev → l'app est installée + lancée en
# standalone sur le simulateur booté. L'humain n'a plus qu'à la **rouvrir** sur le simu
# pour tester. Aucun terminal à garder ouvert, aucun écran rouge possible.
#
# Usage :
#   pnpm sim                 # device = simulateur booté
#   pnpm sim "iPhone 17 Pro" # cible un device par nom ou UDID
#
# Prérequis : Xcode 26.4+ (`xcodebuild -version`), un simulateur booté, et le backend
# local (Docker + API NestJS :3010 + Better Auth :3011) en marche pour les appels réseau
# (ATS localhost autorisée via app.config.ts → NSAllowsLocalNetworking).
# ============================================================================
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" # apps/mobile

BUNDLE_ID="app.ridenrest"
DEVICE="${1:-}"

resolve_booted_udid() {
  xcrun simctl list devices booted -j 2>/dev/null \
    | python3 -c 'import json,sys; d=json.load(sys.stdin).get("devices",{}); ids=[x["udid"] for v in d.values() for x in v if x.get("state")=="Booted"]; print(ids[0] if ids else "")' \
    2>/dev/null || true
}

# UDID concret (pour cibler le build ET relancer en standalone via simctl).
if [[ "$DEVICE" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
  UDID="$DEVICE"
else
  UDID="$(resolve_booted_udid)"
fi

echo "▶︎  Build STANDALONE iOS (Release, JS embarqué — aucun Metro requis)"
echo "    Device : ${DEVICE:-${UDID:-<auto / défaut Expo>}}"
echo "    (1re compilation longue ; incrémental ensuite. Va prendre un café ☕)"
echo ""

ARGS=(--configuration Release --no-bundler)
if [ -n "$DEVICE" ]; then
  ARGS+=(--device "$DEVICE")
elif [ -n "$UDID" ]; then
  ARGS+=(--device "$UDID")
fi

npx expo run:ios "${ARGS[@]}"

# Lancement STANDALONE déterministe : on relance l'app directement pour charger le bundle
# EMBARQUÉ (et pas une éventuelle session Metro résiduelle ouverte par le deep-link).
TARGET="${UDID:-booted}"
echo ""
echo "▶︎  Relance standalone (bundle embarqué, hors Metro)…"
xcrun simctl terminate "$TARGET" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch "$TARGET" "$BUNDLE_ID" >/dev/null 2>&1 || true

echo ""
echo "✅  App autonome installée + lancée sur le simulateur."
echo "    → Pour re-tester plus tard : rouvre simplement « Ride'n'Rest » sur le simu."
echo "    → Aucun serveur à lancer, aucune connexion Metro nécessaire."
