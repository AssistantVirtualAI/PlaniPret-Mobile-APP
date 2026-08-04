#!/usr/bin/env bash
# Build OpenSSL + pjproject for iOS (device arm64 + simulator arm64) and
# assemble libpjsip.xcframework for the PpPjsip plugin.
#
# Must run on macOS with Xcode command line tools. This cannot be produced in
# the Lovable sandbox (no macOS / no iOS SDK).
#
#   cd apps/planipret-mobile && bash scripts/build-pjsip-ios.sh
#
# Output: ios/App/App/Plugins/PpPjsip/Frameworks/libpjsip.xcframework
#
# TLS EST OBLIGATOIRE. Le transport natif est TLS 5061 (voir
# docs/pjsip/TRANSPORT-DECISION.md) : PJSIP n'a pas de transport SIP over
# WebSocket. Sur un build autoconf, PJ_HAS_SSL_SOCK est DÉTECTÉ par configure
# à partir d'OpenSSL, il ne suffit pas de le déclarer dans config_site.h. Sans
# OpenSSL, la macro retombe à 0, le binaire compile, canImport(pjsua) est vrai,
# et pjsua_transport_create(PJSIP_TRANSPORT_TLS, …) échoue à l'exécution avec
# PJSIP_EUNSUPTRANSPORT. Ce script échoue donc explicitement (exit 1) si
# configure n'annonce pas « OpenSSL library found, SSL support enabled ».
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${PJSIP_WORKDIR:-$APP_DIR/.pjsip-build}"
OUT="$APP_DIR/ios/App/App/Plugins/PpPjsip/Frameworks"
PJ_TAG="${PJSIP_TAG:-2.15.1}"
OPENSSL_TAG="${OPENSSL_TAG:-openssl-3.0.15}"
MIN_IOS="${MIN_IOS:-14.0}"

command -v xcodebuild >/dev/null || { echo "xcodebuild introuvable — ce script exige macOS + Xcode."; exit 1; }
command -v xcrun >/dev/null || { echo "xcrun introuvable — installe Xcode et sélectionne-le avec xcode-select."; exit 1; }
command -v libtool >/dev/null || { echo "libtool introuvable — installe les Xcode command line tools."; exit 1; }

mkdir -p "$WORK" "$OUT"

# ---------------------------------------------------------------------------
# Détecter automatiquement le SDK iOS installé (ex: iphoneos26.5)
# xcrun --sdk iphoneos/iphonesimulator fonctionne comme alias générique
# mais CROSS_TOP attend le nom de plateforme sans version (iPhoneOS/iPhoneSimulator)
# ---------------------------------------------------------------------------
IOS_SDK_PATH="$(xcrun --sdk iphoneos --show-sdk-path 2>/dev/null || true)"
SIM_SDK_PATH="$(xcrun --sdk iphonesimulator --show-sdk-path 2>/dev/null || true)"
if [ -z "$IOS_SDK_PATH" ] || [ -z "$SIM_SDK_PATH" ]; then
  echo "❌ SDK iOS introuvable. Vérifie: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer"
  exit 1
fi
# Extraire le nom de plateforme sans version ni .sdk (ex: iPhoneOS)
IOS_PLATFORM_NAME="$(basename "$IOS_SDK_PATH" | sed 's/[0-9][0-9.]*\.sdk$//' | sed 's/\.sdk$//')"
SIM_PLATFORM_NAME="$(basename "$SIM_SDK_PATH" | sed 's/[0-9][0-9.]*\.sdk$//' | sed 's/\.sdk$//')"
echo "▶ SDK détectés: device=$(basename "$IOS_SDK_PATH") simulator=$(basename "$SIM_SDK_PATH")"
echo "▶ Plateformes: device=$IOS_PLATFORM_NAME simulator=$SIM_PLATFORM_NAME"

# ---------------------------------------------------------------------------
# 1) OpenSSL pour iPhoneOS.sdk arm64 et iPhoneSimulator.sdk arm64
#    (guide OpenSSL pour iOS : Configure ios64-cross / iossimulator-arm64)
# ---------------------------------------------------------------------------
SSL_SRC="$WORK/openssl-src"
if [ ! -d "$SSL_SRC" ]; then
  git clone --depth 1 --branch "$OPENSSL_TAG" https://github.com/openssl/openssl.git "$SSL_SRC"
fi

build_openssl () {
  local tag="$1" sdk_alias="$2" ossl_target="$3"
  local prefix="$WORK/openssl/$tag"
  if [ -f "$prefix/lib/libssl.a" ] && [ -f "$prefix/lib/libcrypto.a" ]; then
    echo "▶ OpenSSL: $tag déjà construit → $prefix"
    return 0
  fi
  local sdk_path
  sdk_path="$(xcrun --sdk "$sdk_alias" --show-sdk-path)"
  # Nom de plateforme sans version (iPhoneOS ou iPhoneSimulator)
  local platform_name
  platform_name="$(basename "$sdk_path" | sed 's/[0-9][0-9.]*\.sdk$//' | sed 's/\.sdk$//')"
  echo "▶ OpenSSL: $tag ($platform_name / arm64, $OPENSSL_TAG)"

  rm -rf "$WORK/openssl-build-$tag"
  cp -R "$SSL_SRC" "$WORK/openssl-build-$tag"
  pushd "$WORK/openssl-build-$tag" >/dev/null

  export CROSS_TOP="$(xcode-select -p)/Platforms/${platform_name}.platform/Developer"
  export CROSS_SDK="$(basename "$sdk_path")"
  export CC="$(xcrun -find clang)"
  # Passer le sysroot et l'arch explicitement pour que clang trouve les headers iOS
  export CFLAGS="-arch arm64 -isysroot $sdk_path -mios-version-min=$MIN_IOS"
  export CXXFLAGS="$CFLAGS"

  ./Configure "$ossl_target" no-shared no-dso no-async no-tests \
    --prefix="$prefix"
  make -j"$(sysctl -n hw.ncpu)" build_libs
  make install_dev

  unset CROSS_TOP CROSS_SDK CC CFLAGS CXXFLAGS
  popd >/dev/null

  # OpenSSL 3.x installe parfois dans lib64 ; configure-iphone attend lib/.
  if [ ! -d "$prefix/lib" ] && [ -d "$prefix/lib64" ]; then ln -s lib64 "$prefix/lib"; fi
  test -f "$prefix/lib/libssl.a" || { echo "❌ OpenSSL $tag: libssl.a manquant"; exit 1; }
  test -f "$prefix/lib/libcrypto.a" || { echo "❌ OpenSSL $tag: libcrypto.a manquant"; exit 1; }
}

# ios64-xcrun et iossimulator-xcrun sont les cibles modernes pour Xcode récent
# (ios64-cross n'est plus reconnu depuis OpenSSL 3.x avec Xcode 15+)
build_openssl device    iphoneos         ios64-xcrun
build_openssl simulator iphonesimulator  iossimulator-xcrun

# ---------------------------------------------------------------------------
# 2) pjproject
# ---------------------------------------------------------------------------
cd "$WORK"
if [ ! -d pjproject ]; then
  git clone --depth 1 --branch "$PJ_TAG" https://github.com/pjsip/pjproject.git
fi
cd pjproject

# config_site.h — IMPORTANT : PJSIP n'a PAS de transport SIP over WebSocket.
# La macro PJSIP_TRANSPORT_WSS n'existe pas ; ne pas l'ajouter.
# PJ_HAS_SSL_SOCK n'est PAS déclaré ici : sur autoconf il est détecté par
# configure à partir de --with-ssl, et le forcer masquerait une absence d'OpenSSL.
cat > pjlib/include/pj/config_site.h <<'EOF'
#define PJ_CONFIG_IPHONE 1
#define PJMEDIA_HAS_VIDEO 0
#define PJSIP_HAS_TLS_TRANSPORT 1
#define PJSIP_MAX_PKT_LEN 8000
#include <pj/config_site_sample.h>
EOF

build_arch () {
  local sdk_alias="$1" arch="$2" tag="$3"
  local ssl_prefix="$WORK/openssl/$tag"
  local log="$WORK/configure-$tag.log"
  # Résoudre le chemin SDK réel (ex: /path/to/iPhoneOS26.5.sdk)
  local sdk_path
  sdk_path="$(xcrun --sdk "$sdk_alias" --show-sdk-path)"
  local sdk_basename
  sdk_basename="$(basename "$sdk_path")"  # ex: iPhoneOS26.5.sdk
  echo "▶ pjproject $PJ_TAG: $tag ($sdk_basename / $arch), --with-ssl=$ssl_prefix"

  # Dériver le DEVPATH depuis le chemin SDK réel
  # ex: /Applications/Xcode.app/.../iPhoneSimulator.platform/Developer
  local platform_dir
  platform_dir="$(dirname "$(dirname "$sdk_path")")"  # remonte de SDKs/xxx.sdk à Developer
  make distclean >/dev/null 2>&1 || true
  DEVPATH="$platform_dir" IPHONESDK="$sdk_basename" ARCH="-arch $arch" \
    ./configure-iphone --with-ssl="$ssl_prefix" \
      --disable-video --disable-libyuv --disable-opencore-amr 2>&1 | tee "$log"

  # Garde-fou n°1 : TLS silencieusement désactivé = des heures de diagnostic
  # perdues plus tard, avec un PJSIP_EUNSUPTRANSPORT invisible dans le Swift.
  if ! grep -q "OpenSSL library found, SSL support enabled" "$log"; then
    echo ""
    echo "❌ ARRÊT — configure n'a PAS détecté OpenSSL pour '$tag'."
    echo "   Attendu dans la sortie : « OpenSSL library found, SSL support enabled »"
    echo "   Journal complet : $log"
    echo "   Sans cela, PJ_HAS_SSL_SOCK=0 et pjsua_transport_create(PJSIP_TRANSPORT_TLS)"
    echo "   échouera à l'exécution avec PJSIP_EUNSUPTRANSPORT."
    exit 1
  fi
  echo "✔ TLS: « OpenSSL library found, SSL support enabled » ($tag)"

  make dep && make clean && make

  # Garde-fou n°2 : la macro doit être à 1 dans la config effective. Ce test
  # est bloquant : poursuivre produirait un xcframework importable mais sans TLS.
  if ! grep -qE '^\s*#\s*define\s+PJ_HAS_SSL_SOCK\s+1' pjlib/include/pj/compat/os_auto.h 2>/dev/null; then
    echo "❌ ARRÊT — PJ_HAS_SSL_SOCK n'est pas à 1 pour '$tag'. Journal : $log"
    exit 1
  fi

  # Étape documentée : une seule archive statique par architecture.
  local dest="$WORK/libs/$tag"
  rm -rf "$dest"; mkdir -p "$dest/parts"
  find . -name '*.a' -path '*-apple-darwin_ios*' -exec cp {} "$dest/parts/" \;
  # OpenSSL est fusionné dans l'archive livrée. Le transport TLS ne dépend donc
  # pas d'une étape manuelle Xcode facile à oublier après la création du xcframework.
  libtool -static -o "$dest/libPJSIP.a" \
    "$dest/parts"/*.a \
    "$ssl_prefix/lib/libssl.a" \
    "$ssl_prefix/lib/libcrypto.a"
  rm -rf "$dest/parts"
  test -f "$dest/libPJSIP.a" || { echo "❌ libPJSIP.a manquant pour $tag"; exit 1; }
}

# Utiliser les alias génériques xcrun (iphoneos/iphonesimulator) qui fonctionnent
# avec toutes les versions de SDK (iphoneos26.5, iphoneos17.x, etc.)
build_arch iphoneos arm64 device
build_arch iphonesimulator arm64 simulator

# ---------------------------------------------------------------------------
# 3) En-têtes + xcframework
# ---------------------------------------------------------------------------
rm -rf "$WORK/headers"; mkdir -p "$WORK/headers"
cp -R pjlib/include/. "$WORK/headers/"
cp -R pjlib-util/include/. "$WORK/headers/"
cp -R pjnath/include/. "$WORK/headers/"
cp -R pjmedia/include/. "$WORK/headers/"
cp -R pjsip/include/. "$WORK/headers/"

# Module map so Swift can `import pjsua`.
cat > "$WORK/headers/module.modulemap" <<'EOF'
module pjsua [system] {
  header "pjsua-lib/pjsua.h"
  export *
}
EOF

rm -rf "$OUT/libpjsip.xcframework"
xcodebuild -create-xcframework \
  -library "$WORK/libs/device/libPJSIP.a" -headers "$WORK/headers" \
  -library "$WORK/libs/simulator/libPJSIP.a" -headers "$WORK/headers" \
  -output "$OUT/libpjsip.xcframework"

# ---------------------------------------------------------------------------
# 4) Vérification POST-xcodebuild des binaires livrés (bloquante)
#    Symboles OpenSSL + transport TLS PJSIP dans chaque tranche, puis test de
#    lancement réel de pjsua_transport_create(TLS) dans le simulateur.
# ---------------------------------------------------------------------------
PJSIP_WORKDIR="$WORK" bash "$APP_DIR/scripts/verify-pjsip-tls.sh" "$OUT/libpjsip.xcframework"

if [ "${PJSIP_SKIP_SELFTEST:-0}" != "1" ]; then
  PJSIP_WORKDIR="$WORK" bash "$APP_DIR/scripts/pjsip-tls-selftest.sh"
else
  echo "↷ self-test TLS ignoré (PJSIP_SKIP_SELFTEST=1)"
fi

echo "✅ libpjsip.xcframework (TLS activé et vérifié) → $OUT"
echo "   OpenSSL est inclus dans chaque tranche de l'archive. Ajoute le xcframework"
echo "   à la cible App (Frameworks, Libraries and Embedded Content), puis: npx cap sync ios"
