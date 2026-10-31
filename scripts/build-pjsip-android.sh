#!/usr/bin/env bash
# Build Planiprêt's Android-only PJSIP 2.15.1 PJSUA2 Java/JNI module.
# No NetSapiens request is made: this only compiles local third-party sources.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PJPROJECT_SOURCE_DIR="${PJPROJECT_SOURCE_DIR:-$ROOT/.work/vendor/pjproject-2.15.1}"
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-$SDK_ROOT/ndk/27.2.12479018}"
OPENSSL_DIR="${PP_OPENSSL_ANDROID_DIR:-$ROOT/.work/vendor/openssl-android-3.5.9}"
OUT="$ROOT/android/pjsua2"
TAG_EXPECTED="2.15.1"
SWIG_BIN="${PP_SWIG_BIN:-$ROOT/.work/tools/swig-4.3.1/bin/swig}"
SWIG_BOOTSTRAP="$ROOT/scripts/ensure-swig-android.sh"
# Les sources PJSIP/OpenSSL et les ABI existantes sont déjà prêtes. Pour une
# reprise incrémentale (par exemple ajout d'armeabi-v7a), 12 Go maintiennent une
# marge sûre sans exiger une reconstruction complète inexistante.
MIN_FREE_KB=$((12 * 1024 * 1024))
FREE_KB="$(df -Pk "$ROOT" | awk 'NR==2 { print $4 }')"
fail() { printf 'ARRÊT — %s\n' "$*" >&2; exit 1; }
[ "$FREE_KB" -ge "$MIN_FREE_KB" ] || fail "au moins 12 Go libres sont requis pour compiler PJSIP/NDK; disponibles: $((FREE_KB / 1024 / 1024)) Go."
[ -d "$PJPROJECT_SOURCE_DIR/.git" ] || fail "sources PJSIP absentes: $PJPROJECT_SOURCE_DIR"
[ -x "$ANDROID_NDK_ROOT/ndk-build" ] || fail "NDK r27.2 absent: $ANDROID_NDK_ROOT. Installez exactement ndk;27.2.12479018 via Android Studio/SDK Manager."
[ -n "$OPENSSL_DIR" ] && [ -d "$OPENSSL_DIR" ] || fail "PP_OPENSSL_ANDROID_DIR doit désigner OpenSSL compilé pour Android (même ABI/API)."
if [ -z "${PP_SWIG_BIN:-}" ] && [ ! -x "$SWIG_BIN" ]; then
  [ -x "$SWIG_BOOTSTRAP" ] || fail "bootstrap SWIG absent: $SWIG_BOOTSTRAP"
  "$SWIG_BOOTSTRAP"
fi
[ -x "$SWIG_BIN" ] || fail "SWIG local absent: $SWIG_BIN. Construisez la version épinglée dans .work/tools ou définissez PP_SWIG_BIN."
export PATH="$(dirname "$SWIG_BIN"):$PATH"
command -v swig >/dev/null || fail "SWIG introuvable dans PATH après configuration locale."
cd "$PJPROJECT_SOURCE_DIR"
[ "$(git describe --tags --always)" = "$TAG_EXPECTED" ] || fail "tag PJSIP inattendu: $(git describe --tags --always); attendu $TAG_EXPECTED."

# This local, generated config is intentionally outside the Planiprêt source
# tree. It makes the voice build deterministic: Android PJSIP ships Speex AEC
# with denoise/AGC, while the runtime still falls back to device processing if
# a specific handset rejects an audio option. No call is ever routed to speaker
# by these flags; output route remains a user action in PpPjsipEngine.
cat > "$PJPROJECT_SOURCE_DIR/pjlib/include/pj/config_site.h" <<'EOF'
#define PJMEDIA_HAS_SPEEX_AEC 1
#define PJMEDIA_SPEEX_AEC_USE_AGC 1
#define PJMEDIA_SPEEX_AEC_USE_DENOISE 1
/* Planiprêt ships voice SIP/RTP, not Android hardware media codecs/video.
 * This keeps minSdk 26 compatible with NDK r27 while preserving PJSIP voice
 * codecs, microphone, earpiece/speaker/Bluetooth and native AEC. */
#define PJMEDIA_HAS_ANDROID_MEDIACODEC 0
EOF

export ANDROID_NDK_ROOT OPENSSL_DIR
export APP_PLATFORM=26
export PYTHONDONTWRITEBYTECODE=1
export PYTHONPYCACHEPREFIX="$ROOT/.work/ndk-python-cache"
mkdir -p "$PYTHONPYCACHEPREFIX"
# Android 15/16: NDK r27 requires both page-size flags to make every ELF LOAD
# segment 16 KB aligned. This applies to the PJSIP JNI link; OpenSSL is rebuilt
# with the same policy by scripts/build-openssl-android.sh.
export CFLAGS="${CFLAGS:-} -D__BIONIC_NO_PAGE_SIZE_MACRO"
export LDFLAGS="${LDFLAGS:-} -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
[ -x "$JAVA_HOME/bin/javac" ] || JAVA_HOME="$(dirname "$(dirname "$(command -v javac)")")"

# PJSIP documents one configure per ABI. Planiprêt livre arm64-v8a et armeabi-v7a
# pour les appareils physiques Android; x86 restaure la compatibilité d'appareils
# Intel 32 bits historiques et x86_64 sert aussi à l'émulateur de recette.
# Aucun ABI n'est le substitut silencieux d'un autre.
rm -rf "$OUT/src"
mkdir -p "$OUT/src/main/jniLibs" "$OUT/src/main/java"
for ABI in arm64-v8a armeabi-v7a x86 x86_64; do
  make distclean >/dev/null 2>&1 || true
  OPENSSL_PREFIX="$OPENSSL_DIR/$ABI"
  [ -d "$OPENSSL_PREFIX/include" ] && [ -d "$OPENSSL_PREFIX/lib" ] || fail "OpenSSL incomplet pour $ABI: $OPENSSL_PREFIX. Exécutez scripts/build-openssl-android.sh."
  TARGET_ABI="$ABI" ./configure-android --use-ndk-cflags --with-ssl="$OPENSSL_PREFIX"
  make dep
  make clean
  # PJSIP 2.15.1 liste les objets G.722 dans un sous-dossier mais son fichier
  # de dépendances Android les aplatit. Avec make parallèle/NDK r27, ce dossier
  # peut manquer entre `clean` et la règle générique %.o. Le créer ici garde
  # G.722 activé et évite le faux « No rule to make target g722/g722_enc.o ».
  # configure-android calcule TARGET_NAME à partir du NDK. Réutiliser sa valeur
  # exacte évite de supposer le triplet armv7 (qui varie selon l'outillage NDK).
  PJ_TARGET="$(sed -n 's/^export TARGET_NAME := //p' build.mak | head -n 1)"
  [ -n "$PJ_TARGET" ] || fail "TARGET_NAME PJSIP absent pour $ABI après configure-android."
  mkdir -p "$PJPROJECT_SOURCE_DIR/pjmedia/build/output/pjmedia-codec-$PJ_TARGET/g722"
  make -j"$(sysctl -n hw.ncpu)"
  # La cible par défaut du sous-projet Java produit à la fois libpjsua2.so
  # et les classes Java. Ne pas appeler `make` depuis le répertoire SWIG
  # parent : cela construirait aussi les wrappers hors périmètre (C#, etc.).
  # PJSIP conserve pjsua2_wrap.o dans un dossier partagé entre ABI. Sans le
  # clean, le linker x86_64 peut tenter de réutiliser l'objet ARM64 précédent.
  # Les bibliothèques déjà copiées dans OUT restent intactes, mais chaque ABI
  # relie son wrapper JNI avec son propre compilateur et ses propres libs.
  (cd pjsip-apps/src/swig/java && make clean && make)
  GENERATED="$PJPROJECT_SOURCE_DIR/pjsip-apps/src/swig/java/android/pjsua2/src/main"
  [ -d "$GENERATED/jniLibs/$ABI" ] || fail "JNI PJSIP généré absent pour $ABI."
  cp -R "$GENERATED/jniLibs/$ABI" "$OUT/src/main/jniLibs/"
  cp -R "$GENERATED/java/." "$OUT/src/main/java/"
  LIBDIR="$OUT/src/main/jniLibs/$ABI"
  # Le script OpenSSL Planiprêt installe dans <racine>/<ABI>/lib/. Accepter
  # aussi l'ancien layout plat <racine>/<ABI>/ pour les builds reproductibles.
  SSL="$(find "$OPENSSL_PREFIX" -type f -name libssl.so -print -quit)"
  CRYPTO="$(find "$OPENSSL_PREFIX" -type f -name libcrypto.so -print -quit)"
  [ -n "$SSL" ] && [ -n "$CRYPTO" ] || fail "dépendances OpenSSL absentes pour $ABI."
  cp "$SSL" "$CRYPTO" "$LIBDIR/"
done

# Les bindings Java produits par SWIG 4.3.1 peuvent contenir des espaces en fin
# de ligne et plusieurs lignes vides EOF. Les normaliser ici rend le résultat
# versionné stable et laisse les contrôles Git vérifier les sources générées.
find "$OUT/src/main/java" -type f -name '*.java' -exec \
  perl -0pi -e 's/[ \t]+(?=\n)//g; s/\n+\z/\n/' {} +

cat > "$OUT/build.gradle" <<'GRADLE'
plugins { id 'com.android.library' }

android {
  namespace 'org.pjsip.pjsua2'
  compileSdk rootProject.ext.compileSdkVersion
  defaultConfig {
    minSdk rootProject.ext.minSdkVersion
    targetSdk rootProject.ext.targetSdkVersion
    consumerProguardFiles 'consumer-rules.pro'
  }
  buildFeatures { buildConfig = false }
}
GRADLE
cat > "$OUT/consumer-rules.pro" <<'PROGUARD'
# PJSUA2/SWIG registers Java callbacks from libpjsua2 at runtime. Keep every
# generated class and member: R8 cannot see JNI-originated references.
-keep class org.pjsip.pjsua2.** { *; }
PROGUARD

for ABI in arm64-v8a armeabi-v7a x86 x86_64; do
  LIBDIR="$OUT/src/main/jniLibs/$ABI"
  [ -s "$LIBDIR/libpjsua2.so" ] || fail "libpjsua2.so manquante pour $ABI après le build."
  [ -s "$LIBDIR/libssl.so" ] || fail "libssl.so manquante pour $ABI: vérifiez PP_OPENSSL_ANDROID_DIR."
  [ -s "$LIBDIR/libcrypto.so" ] || fail "libcrypto.so manquante pour $ABI: vérifiez PP_OPENSSL_ANDROID_DIR."
  [ -s "$LIBDIR/libc++_shared.so" ] || fail "libc++_shared.so manquante pour $ABI."
done

printf 'OK — module JNI PJSIP Android %s préparé: %s\n' "$TAG_EXPECTED" "$OUT"
