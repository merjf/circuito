#!/usr/bin/env bash
#
# Build an installable APK locally — no Expo account, no EAS queue.
#
#   npm run apk                  release APK, sideloadable
#   npm run apk -- --install     ...and push it to the connected device
#   npm run apk -- --debug       debug variant (needs Metro running to run)
#   npm run apk -- --keep-native keep android/ for fast incremental rebuilds
#
# SIGNING: the release variant is signed with React Native's standard debug
# keystore, which is what Expo's template configures. That is fine for putting
# the app on your own phone, and the keystore is byte-identical every time
# `prebuild` runs, so a new APK installs cleanly over the previous one.
# It is NOT suitable for the Play Store — that needs a keystore only you hold.
#
# THE android/ FOLDER: this script deletes it when it finishes. Leaving it in
# place converts the project to the bare workflow, and from then on edits to
# app.json stop having any effect — a genuinely confusing failure. Pass
# --keep-native when you are iterating and want incremental Gradle builds; just
# remember to delete it before trusting app.json again.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

VARIANT="release"
KEEP_NATIVE=0
INSTALL=0

for arg in "$@"; do
  case "$arg" in
    --debug)       VARIANT="debug" ;;
    --release)     VARIANT="release" ;;
    --keep-native) KEEP_NATIVE=1 ;;
    --install)     INSTALL=1 ;;
    -h|--help)     sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg  (try --help)" >&2; exit 2 ;;
  esac
done

fail() { echo ""; echo "✗ $1" >&2; shift; for line in "$@"; do echo "  $line" >&2; done; exit 1; }

# ── Preflight ──────────────────────────────────────────────────────────────
# Checked up front because Gradle's own errors for these are long and unhelpful.

command -v java >/dev/null 2>&1 || fail "Java is not installed." \
  "Gradle 9 needs JDK 17 or newer." \
  "  brew install --cask temurin@17"

# Read the version as a property rather than parsing `java -version`: that
# banner is polluted by JAVA_TOOL_OPTIONS on plenty of machines, and a parse
# that quietly yields an empty string turns this guard into a no-op.
JAVA_SPEC="$(java -XshowSettings:properties -version 2>&1 \
  | awk -F'= *' '/java\.specification\.version/ { gsub(/ /, "", $2); print $2; exit }')"
JAVA_MAJOR="${JAVA_SPEC#1.}"          # 1.8 -> 8, 17 -> 17, 21 -> 21

case "$JAVA_MAJOR" in
  ''|*[!0-9]*)
    fail "Could not determine the Java version." \
      "\`java -XshowSettings:properties -version\` did not report" \
      "java.specification.version. Is JAVA_HOME pointing somewhere odd?" ;;
esac

if [ "$JAVA_MAJOR" -lt 17 ]; then
  fail "Java $JAVA_MAJOR found, but Gradle 9 needs JDK 17 or newer." \
    "  brew install --cask temurin@17" \
    "  export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
fi

SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK_DIR" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  SDK_DIR="$HOME/Library/Android/sdk"   # Android Studio's default on macOS
fi
[ -n "$SDK_DIR" ] && [ -d "$SDK_DIR" ] || fail "Android SDK not found." \
  "Install Android Studio, open it once so it downloads the SDK, then:" \
  "  export ANDROID_HOME=\$HOME/Library/Android/sdk" \
  "  export PATH=\$PATH:\$ANDROID_HOME/platform-tools"

echo "▸ JDK $JAVA_MAJOR"
echo "▸ Android SDK  $SDK_DIR"
echo "▸ Variant      $VARIANT"

# ── Native project ─────────────────────────────────────────────────────────

if [ "$KEEP_NATIVE" = "1" ] && [ -d android ]; then
  echo "▸ Reusing existing android/ (--keep-native)"
else
  echo "▸ Generating android/ from app.json"
  npx expo prebuild --platform android --clean --no-install
fi

# Gradle reads the SDK location from here when ANDROID_HOME is not exported
# into its environment, which is the common case when running from an IDE.
# local.properties uses Java-properties syntax, where Windows backslashes are
# escape characters. Convert them to forward slashes before writing the value.
SDK_DIR_GRADLE="$SDK_DIR"
if command -v cygpath >/dev/null 2>&1; then
  SDK_DIR_GRADLE="$(cygpath -m "$SDK_DIR")"
fi
printf 'sdk.dir=%s\n' "$SDK_DIR_GRADLE" > android/local.properties

# ── Build ──────────────────────────────────────────────────────────────────

GRADLE_TASK="assembleRelease"
[ "$VARIANT" = "debug" ] && GRADLE_TASK="assembleDebug"

echo "▸ Gradle $GRADLE_TASK — first run downloads Gradle and can take a while"
( cd android && ./gradlew "$GRADLE_TASK" --console=plain )

APK_SRC="android/app/build/outputs/apk/$VARIANT/app-$VARIANT.apk"
[ -f "$APK_SRC" ] || fail "Gradle finished but no APK at $APK_SRC" \
  "Check the Gradle output above for the real error."

VERSION="$(node -p "require('./app.json').expo.version")"
STAMP="$(date +%Y%m%d-%H%M)"
mkdir -p build
APK_OUT="build/circuito-${VERSION}-${VARIANT}-${STAMP}.apk"
cp "$APK_SRC" "$APK_OUT"

SIZE="$(du -h "$APK_OUT" | cut -f1)"

# ── Install ────────────────────────────────────────────────────────────────

if [ "$INSTALL" = "1" ]; then
  ADB="$SDK_DIR/platform-tools/adb"
  command -v adb >/dev/null 2>&1 && ADB="adb"
  if [ -x "$ADB" ] || command -v "$ADB" >/dev/null 2>&1; then
    echo "▸ Installing to connected device"
    "$ADB" install -r "$APK_OUT"
  else
    echo "! adb not found — skipping install"
  fi
fi

# android/ is removed by the EXIT trap above.

echo ""
echo "✓ $APK_OUT  ($SIZE)"
echo ""
if [ "$VARIANT" = "debug" ]; then
  echo "  Debug variant — it needs Metro running (npm start) to load JS."
else
  echo "  Standalone release build. Copy it to the phone, or:"
  echo "    adb install -r $APK_OUT"
fi
echo "  Signed with the standard debug keystore — fine for your own device,"
echo "  not for the Play Store."
