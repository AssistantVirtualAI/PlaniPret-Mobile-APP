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
# 1) OpenSSL pour iPhoneOS.sdk arm64 et iPhoneSimulator.sdk arm64
#    (guide OpenSSL pour iOS : Configure ios64-cross / iossimulator-arm64)
# ---------------------------------------------------------------------------
SSL_SRC="$WORK/openssl-src"
if [ ! -d "$SSL_SRC" ]; then
  git clone --depth 1 --branch "$OPENSSL_TAG" https://github.com/openssl/openssl.git "$SSL_SRC"
fi

build_openssl () {
  local tag="$1" sdk_name="$2" ossl_target="$3"
  local prefix="$WORK/openssl/$tag"
  if [ -f "$prefix/lib/libssl.a" ] && [ -f "$prefix/lib/libcrypto.a" ]; then
    echo "▶ OpenSSL: $tag déjà construit → $prefix"
    return 0
  fi
  echo "▶ OpenSSL: $tag ($sdk_name / arm64, $OPENSSL_TAG)"
  local sdk_path
  sdk_path="$(xcrun --sdk "$sdk_name" --show-sdk-path)"

  rm -rf "$WORK/openssl-build-$tag"
  cp -R "$SSL_SRC" "$WORK/openssl-build-$tag"
  pushd "$WORK/openssl-build-$tag" >/dev/null

  export CROSS_TOP="$(xcode-select -p)/Platforms/${sdk_name}.platform/Developer"
  export CROSS_SDK="$(basename "$sdk_path")"
  export CC="$(xcrun -find clang)"

  ./Configure "$ossl_target" no-shared no-dso no-async no-tests \
    --prefix="$prefix" \
    -mios-version-min="$MIN_IOS" -isysroot "$sdk_path" -arch arm64
  make -j"$(sysctl -n hw.ncpu)" build_libs
  make install_dev

  unset CROSS_TOP CROSS_SDK CC
  popd >/dev/null

  # OpenSSL 3.x installe parfois dans lib64 ; configure-iphone attend lib/.
  if [ ! -d "$prefix/lib" ] && [ -d "$prefix/lib64" ]; then ln -s lib64 "$prefix/lib"; fi
  test -f "$prefix/lib/libssl.a" || { echo "❌ OpenSSL $tag: libssl.a manquant"; exit 1; }
  test -f "$prefix/lib/libcrypto.a" || { echo "❌ OpenSSL $tag: libcrypto.a manquant"; exit 1; }
}

build_openssl device    iPhoneOS         ios64-cross
build_openssl simulator iPhoneSimulator  iossimulator-arm64

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
  local sdk="$1" arch="$2" tag="$3"
  local ssl_prefix="$WORK/openssl/$tag"
  local log="$WORK/configure-$tag.log"
  echo "▶ pjproject $PJ_TAG: $tag ($sdk / $arch), --with-ssl=$ssl_prefix"

  make distclean >/dev/null 2>&1 || true
  IPHONESDK="$sdk" ARCH="-arch $arch" \
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

build_arch iPhoneOS.sdk arm64 device
build_arch iPhoneSimulator.sdk arm64 simulator

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

echo "✅ libpjsip.xcframework (TLS activé) → $OUT"
echo "   OpenSSL est inclus dans chaque tranche de l'archive. Ajoute le xcframework"
echo "   à la cible App (Frameworks, Libraries and Embedded Content), puis: npx cap sync ios"
