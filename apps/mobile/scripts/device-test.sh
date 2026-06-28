#!/usr/bin/env bash
# Validation device (Maestro) — fail-closed + multi-plateforme + scan crash.
#
# Usage :
#   pnpm test:device                          # smoke sur TOUTES les plateformes dispo
#   pnpm test:device live-poi.yaml            # smoke + ce flow
#   pnpm test:device smoke.yaml weather.yaml  # plusieurs flows
#   PLATFORMS=ios pnpm test:device …          # forcer une plateforme (ios|android|ios,android)
#   BUILD=1 pnpm test:device …                # rebuild standalone avant, détaché (iOS: pnpm sim ; Android: gradlew assembleRelease + adb install)
#
# Robustesse (leçons MOB-5.x) :
#  - **Fail-closed** : si une plateforme a un device booté, ses flows DOIVENT tourner ;
#    une plateforme bootée sans aucun flow exécuté = ÉCHEC (plus de « iOS OU Android »
#    silencieux). Toujours nommer l'état réel par plateforme.
#  - **Scan crash** : un flow peut passer ses asserts UI alors qu'un crash natif est
#    survenu (ex. tâche background). On vide/relit le buffer crash et on ÉCHOUE sur tout
#    FATAL/SIGABRT pendant le flow — même si Maestro est « vert ».
#  - Android : setup encodé (adb reverse 3010/3011/8081 + grant localisation + geo fix)
#    pour ne pas le réinventer. Le release standalone joint localhost (cf. plugin cleartext).
set -euo pipefail

MAESTRO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.maestro" && pwd)"
MOBILE_DIR="$(cd "$MAESTRO_DIR/.." && pwd)"
API_URL="${EXPO_PUBLIC_API_URL:-http://localhost:3010}"
APP_ID="app.ridenrest"
GEO_LNG="${GEO_LNG:-1.4442}"   # Toulouse par défaut (sur/près d'une trace de test)
GEO_LAT="${GEO_LAT:-43.6047}"

# --- Toolchain ---
# JDK 17 OBLIGATOIRE pour Gradle/AGP (refuse un JDK trop récent, ex. 26). `/usr/libexec/
# java_home -v 17` cible explicitement la 17 ; fallback sur le prefix Homebrew openjdk@17.
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17 2>/dev/null || echo /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home)}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1

command -v maestro >/dev/null || { echo "❌ maestro introuvable — curl -Ls https://get.maestro.mobile.dev | bash"; exit 1; }

curl -s -m 4 -o /dev/null "$API_URL/api" || echo "⚠️  API ($API_URL) injoignable — login/POI échoueront (cache offline reste testable)."

FLOWS=("$@"); [ ${#FLOWS[@]} -eq 0 ] && FLOWS=("smoke.yaml")
# smoke.yaml toujours en tête (non-régression de crash natif au boot).
case " ${FLOWS[*]} " in *" smoke.yaml "*) ;; *) FLOWS=("smoke.yaml" "${FLOWS[@]}") ;; esac

# --- Détection des plateformes dispo ---
IOS_UDID=""; ANDROID_SERIAL=""
if command -v xcrun >/dev/null; then
  IOS_UDID="$(xcrun simctl list devices booted 2>/dev/null | grep -Eo '[0-9A-F-]{36}' | head -1 || true)"
fi
if command -v adb >/dev/null; then
  ANDROID_SERIAL="$(adb devices 2>/dev/null | awk '/\tdevice$/{print $1; exit}')"
fi
# Filtre optionnel PLATFORMS=
if [ -n "${PLATFORMS:-}" ]; then
  case ",$PLATFORMS," in *,ios,*) ;; *) IOS_UDID="" ;; esac
  case ",$PLATFORMS," in *,android,*) ;; *) ANDROID_SERIAL="" ;; esac
fi

[ -z "$IOS_UDID" ] && [ -z "$ANDROID_SERIAL" ] && { echo "❌ Aucun device booté (simulateur iOS / émulateur Android). Lance-en un."; exit 1; }

# Rebuild Android standalone (release, JS embarqué) SANS rester attaché aux logs.
# Piège : `expo run:android --variant release` build+install MAIS reste ensuite **attaché**
# à tailer Metro/logcat (« Logs for your project will appear below ») → la commande ne rend
# jamais la main et le script n'atteignait jamais l'exécution Maestro (hang infini). iOS,
# lui, s'auto-détache via `pnpm sim` (→ `simctl launch`) ; seul Android coinçait.
# On reproduit donc, **en détaché**, ce que `run:android` fait en interne :
#   prebuild (sync AndroidManifest : permissions + cleartext localhost) → gradlew
#   assembleRelease (rend la main quand le build est fini) → adb install → launch.
android_build_release() {
  local apk
  echo "▶︎ Android prebuild (sync manifest : permissions + cleartext localhost)…"
  (cd "$MOBILE_DIR" && npx expo prebuild -p android) || return 1
  echo "▶︎ Android build release (./gradlew :app:assembleRelease — JS embarqué, sans Metro)…"
  echo "   (1re compilation NDK longue : reanimated/worklets/maplibre. ☕)"
  (cd "$MOBILE_DIR/android" && ./gradlew :app:assembleRelease) || return 1
  # APK universel (toutes ABI ; pas de split par défaut). app-release.apk, sinon le + récent.
  apk="$MOBILE_DIR/android/app/build/outputs/apk/release/app-release.apk"
  [ -f "$apk" ] || apk="$(ls -t "$MOBILE_DIR"/android/app/build/outputs/apk/release/*.apk 2>/dev/null | head -1)"
  [ -n "$apk" ] && [ -f "$apk" ] || { echo "❌ APK release introuvable après build."; return 1; }
  echo "▶︎ Install ($apk) → $ANDROID_SERIAL"
  # -r : réinstalle en gardant les data. Signature/version incompatible → uninstall + reinstall.
  if ! adb -s "$ANDROID_SERIAL" install -r "$apk"; then
    echo "↻ install -r KO (signature/version) → uninstall + reinstall"
    adb -s "$ANDROID_SERIAL" uninstall "$APP_ID" >/dev/null 2>&1 || true
    adb -s "$ANDROID_SERIAL" install "$apk" || return 1
  fi
  # Lancement déterministe (hors Metro) — sanity boot ; Maestro relancera via launchApp.
  adb -s "$ANDROID_SERIAL" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
  return 0
}

# --- Build optionnel ---
if [ "${BUILD:-0}" = "1" ]; then
  [ -n "$IOS_UDID" ] && { echo "▶︎ iOS rebuild standalone (pnpm sim)…"; (cd "$MOBILE_DIR" && pnpm sim) || exit 1; }
  [ -n "$ANDROID_SERIAL" ] && { echo "▶︎ Android rebuild standalone (release, détaché)…"; android_build_release || exit 1; }
fi

cd "$MAESTRO_DIR"
mkdir -p screenshots
FAILED=0

# Détecte un crash FATAL/SIGABRT survenu APRÈS $1 (epoch) sur Android.
android_crash_since() {
  local since="$1"
  adb -s "$ANDROID_SERIAL" logcat -d -b crash -v epoch 2>/dev/null \
    | awk -v s="$since" '($1+0) >= s && /FATAL EXCEPTION|SIGABRT/ {print}'
}
# Détecte un nouveau crash report iOS (.ips) pour l'app depuis $1 (epoch).
ios_crash_since() {
  local since="$1"
  find "$HOME/Library/Logs/DiagnosticReports" -name 'RidenRest*.ips' -newermt "@$since" 2>/dev/null
}

run_flow() {  # $1=platform $2=device $3=flowpath
  local platform="$1" device="$2" flow="$3" start crash
  start="$(date +%s)"
  echo "▶︎ [$platform] maestro test $flow"
  if ! maestro --device "$device" test "$flow"; then
    echo "❌ [$platform] flow ÉCHOUÉ : $flow"; FAILED=1
  fi
  # Scan crash post-flow (même si Maestro est vert).
  if [ "$platform" = "android" ]; then crash="$(android_crash_since "$start")"; else crash="$(ios_crash_since "$start")"; fi
  if [ -n "$crash" ]; then
    echo "❌ [$platform] CRASH natif détecté pendant $flow (asserts UI verts ≠ pas de crash) :"
    echo "$crash" | head -6
    FAILED=1
  fi
}

# ── iOS ────────────────────────────────────────────────────────────────────────
if [ -n "$IOS_UDID" ]; then
  echo "════ iOS ($IOS_UDID) ════"
  # Setup localisation (idempotent) — permission + position simulée pour les flows Live.
  xcrun simctl privacy "$IOS_UDID" grant location-always "$APP_ID" >/dev/null 2>&1 || true
  xcrun simctl location "$IOS_UDID" set "$GEO_LAT,$GEO_LNG" >/dev/null 2>&1 || true
  ran=0
  for flow in "${FLOWS[@]}"; do
    [ -f "$flow" ] || { echo "↷ [ios] flow absent, ignoré : $flow"; continue; }
    run_flow ios "$IOS_UDID" "$flow"; ran=$((ran+1))
  done
  [ "$ran" = 0 ] && { echo "❌ [ios] device booté mais AUCUN flow exécuté (fail-closed)."; FAILED=1; }
fi

# ── Android ─────────────────────────────────────────────────────────────────────
if [ -n "$ANDROID_SERIAL" ]; then
  echo "════ Android ($ANDROID_SERIAL) ════"
  # Setup réseau + localisation (idempotent).
  for p in 8081 3010 3011; do adb -s "$ANDROID_SERIAL" reverse "tcp:$p" "tcp:$p" >/dev/null 2>&1 || true; done
  for perm in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION ACCESS_BACKGROUND_LOCATION; do
    adb -s "$ANDROID_SERIAL" shell pm grant "$APP_ID" "android.permission.$perm" >/dev/null 2>&1 || true
  done
  adb -s "$ANDROID_SERIAL" emu geo fix "$GEO_LNG" "$GEO_LAT" >/dev/null 2>&1 || true
  ran=0
  for flow in "${FLOWS[@]}"; do
    aflow="android/$flow"
    [ -f "$aflow" ] || { echo "↷ [android] pas de variante $aflow, ignoré"; continue; }
    run_flow android "$ANDROID_SERIAL" "$aflow"; ran=$((ran+1))
  done
  [ "$ran" = 0 ] && { echo "❌ [android] device booté mais AUCUN flow Android exécuté (fail-closed). Crée .maestro/android/<flow>."; FAILED=1; }
fi

echo "📸 Screenshots : $MAESTRO_DIR/screenshots/"
echo "ℹ️  Plateformes testées : ${IOS_UDID:+iOS }${ANDROID_SERIAL:+Android}"
if [ "$FAILED" = 0 ]; then echo "✅ Validation device OK (toutes plateformes dispo, 0 crash)"; else echo "❌ Validation device : au moins un échec/crash/skip"; exit 1; fi
