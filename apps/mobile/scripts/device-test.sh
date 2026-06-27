#!/usr/bin/env bash
# Validation device automatisée (Maestro sur simulateur iOS) — MOB-4.x.
#
# Usage :
#   pnpm test:device                 # smoke (l'app démarre + planning s'ouvre, pas de crash)
#   pnpm test:device weather.yaml     # un flow précis
#   pnpm test:device weather.yaml weather-persistence.yaml
#   BUILD=1 pnpm test:device weather.yaml   # rebuild standalone (pnpm sim) avant les flows
#
# Pré-requis : simulateur iOS booté + app installée & CONNECTÉE une fois à la main
# (la session persiste en secure-store), backend local up (API :3010). Les flows
# Maestro vivent dans apps/mobile/.maestro/ ; screenshots → .maestro/screenshots/.
set -euo pipefail

MAESTRO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.maestro" && pwd)"
API_URL="${EXPO_PUBLIC_API_URL:-http://localhost:3010}"

# --- Toolchain : JAVA_HOME (Maestro tourne sur la JVM) + Maestro sur le PATH ---
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home 2>/dev/null || echo /opt/homebrew/opt/openjdk)}"
export PATH="$JAVA_HOME/bin:$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1

command -v maestro >/dev/null || { echo "❌ maestro introuvable — installe-le : curl -Ls https://get.maestro.mobile.dev | bash"; exit 1; }

# --- Garde-fous : simulateur booté + backend joignable ---
if ! xcrun simctl list devices booted 2>/dev/null | grep -q Booted; then
  echo "❌ Aucun simulateur iOS booté. Lance-en un (Xcode / simctl boot)."; exit 1
fi
if ! curl -s -m 4 -o /dev/null "$API_URL/api"; then
  echo "⚠️  API ($API_URL) injoignable — les fetchs météo/POI échoueront (le cache offline reste testable)."
fi

# --- Build optionnel (BUILD=1) : produit le build Release autonome ---
if [ "${BUILD:-0}" = "1" ]; then
  echo "▶︎ Rebuild standalone (pnpm sim)…"
  (cd "$MAESTRO_DIR/.." && pnpm sim)
fi

# --- Flows à exécuter (défaut : smoke) ---
FLOWS=("$@"); [ ${#FLOWS[@]} -eq 0 ] && FLOWS=("smoke.yaml")

cd "$MAESTRO_DIR"            # screenshots/ + runFlow relatifs résolus ici
mkdir -p screenshots
FAILED=0
for flow in "${FLOWS[@]}"; do
  echo "▶︎ maestro test $flow"
  if ! maestro test "$flow"; then FAILED=1; fi
done

echo "📸 Screenshots : $MAESTRO_DIR/screenshots/"
[ "$FAILED" = "0" ] && echo "✅ Validation device OK" || { echo "❌ Au moins un flow a échoué"; exit 1; }
