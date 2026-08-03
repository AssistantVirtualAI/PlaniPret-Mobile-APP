#!/bin/bash
# Build OpenSSL + pjproject for iOS (device arm64 + simulator arm64) and
# assemble libpjsip.xcframework for the PpPjsip plugin.
#
# Must run on macOS with a FULL Xcode install (not just Command Line Tools).
#
#   cd ~/planipret-standalone && bash scripts/build-pjsip-ios.sh
#
# Output: ios/App/App/Plugins/PpPjsip/Frameworks/libpjsip.xcframework
#
# ---------------------------------------------------------------------------
# TLS EST OBLIGATOIRE. Le transport natif est TLS 5061 : PJSIP n'a pas de
# transport SIP over WebSocket (la macro PJSIP_TRANSPORT_WSS n'existe pas).
# Sur un build autoconf, PJ_HAS_SSL_SOCK est DÉTECTÉ par configure à partir
# d'OpenSSL ; il ne suffit pas de le déclarer dans config_site.h. Sans OpenSSL,
# la macro retombe à 0, le binaire compile, canImport(pjsua) est vrai, et
# pjsua_transport_create(PJSIP_TRANSPORT_TLS, …) échoue à l'exécution avec
# PJSIP_EUNSUPTRANSPORT — cause invisible dans le code Swift. Ce script échoue
# donc explicitement (exit 1) si configure n'annonce pas
# « OpenSSL library found, SSL support enabled ».
#
# Notes de portabilité vérifiées sur les sources amont :
#  - Cibles OpenSSL 3.0 réelles (Configurations/15-ios.conf) : ios64-xcrun et
#    iossimulator-xcrun. « iossimulator-arm64 » N'EXISTE PAS. Les variantes
#    *-xcrun résolvent le SDK elles-mêmes, donc pas de CROSS_TOP/CROSS_SDK.
#  - xcrun --sdk attend un nom de SDK en minuscules (iphoneos /
#    iphonesimulator), jamais un nom de plateforme (iPhoneOS).
#  - configure-iphone de pjproject code DEVPATH en dur sur iPhoneOS.platform :
#    pour le simulateur, DEVPATH doit être exporté explicitement, sinon la
#    passe « simulator » compile en réalité pour le device.
#  - configure-iphone attend IPHONESDK = chemin COMPLET du SDK, et MIN_IOS = le
#    flag complet (-mios-version-min=… / -mios-simulator-version-min=…).
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${PJSIP_WORKDIR:-$APP_DIR/.pjsip-build}"
OUT="$APP_DIR/ios/App/App/Plugins/PpPjsip/Frameworks"
PJ_TAG="${PJSIP_TAG:-2.15.1}"
OPENSSL_TAG="${OPENSSL_TAG:-openssl-3.0.15}"
MIN_IOS_VER="${MIN_IOS_VER:-14.0}"

# ---------------------------------------------------------------------------
# 0) Contrôles d'environnement — c'est ici qu'échouait la version précédente
# ---------------------------------------------------------------------------
command -v xcodebuild >/dev/null || { echo "❌ xcodebuild introuvable — ce script exige macOS + Xcode."; exit 1; }
command -v xcrun      >/dev/null || { echo "❌ xcrun introuvable — installe Xcode."; exit 1; }
command -v libtool    >/dev/null || { echo "❌ libtool introuvable — installe les Xcode command line tools."; exit 1; }
command -v perl       >/dev/null || { echo "❌ perl introuvable — requis par ./Configure d'OpenSSL."; exit 1; }

DEVELOPER_DIR_PATH="$(xcode-select -p)"
if [ ! -d "$DEVELOPER_DIR_PATH/Platforms/iPhoneOS.platform" ]; then
  echo ""
  echo "❌ ARRÊT — xcode-select pointe vers « $DEVELOPER_DIR_PATH »,"
  echo "   qui ne contient pas de plateforme iPhoneOS."
  echo "   C'est le cas quand seuls les Command Line Tools sont sélectionnés :"
  echo "   aucun SDK iOS n'est alors disponible, d'où « SDK iPhoneOS cannot be located »."
  echo ""
  echo "   Corrige avec :"
  echo "     sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  echo "   puis relance ce script."
  exit 1
fi

# xcrun attend des noms de SDK EN MINUSCULES. Passer « iPhoneOS » le fait
# interpréter comme un chemin relatif → l'erreur observée au premier essai.
SDK_DEVICE_PATH="$(xcrun --sdk iphoneos --show-sdk-path 2>/dev/null || true)"
SDK_SIM_PATH="$(xcrun --sdk iphonesimulator --show-sdk-path 2>/dev/null || true)"

if [ -z "$SDK_DEVICE_PATH" ] || [ ! -d "$SDK_DEVICE_PATH" ]; then
  echo "❌ ARRÊT — SDK iphoneos introuvable. SDK disponibles :"
  xcodebuild -showsdks || true
  exit 1
fi
if [ -z "$SDK_SIM_PATH" ] || [ ! -d "$SDK_SIM_PATH" ]; then
  echo "❌ ARRÊT — SDK iphonesimulator introuvable. SDK disponibles :"
  xcodebuild -showsdks || true
  exit 1
fi

echo "▶ Xcode      : $DEVELOPER_DIR_PATH"
echo "▶ SDK device : $SDK_DEVICE_PATH"
echo "▶ SDK simu   : $SDK_SIM_PATH"
echo "▶ pjproject  : $PJ_TAG"
echo "▶ OpenSSL    : $OPENSSL_TAG"
echo ""

mkdir -p "$WORK" "$OUT"

# ---------------------------------------------------------------------------
# 1) OpenSSL (device arm64 + simulateur arm64)
#    Cibles ios64-xcrun / iossimulator-xcrun : elles appellent
#    « xcrun -sdk <sdk> cc » elles-mêmes, donc aucun CROSS_TOP/CROSS_SDK.
# ---------------------------------------------------------------------------
SSL_SRC="$WORK/openssl-src"
if [ ! -d "$SSL_SRC/Configure" ] && [ ! -f "$SSL_SRC/Configure" ]; then
  rm -rf "$SSL_SRC"
  # Clone complet léger puis checkout du tag : « --depth 1 --branch <tag> » sur
  # un tag annoté laisse un HEAD détaché sur un objet qui n'est pas le commit
  # du tag (avertissement « is not a commit! » observé au premier essai).
  git clone --filter=blob:none --no-checkout \
    https://github.com/openssl/openssl.git "$SSL_SRC"
  git -C "$SSL_SRC" checkout -q "tags/$OPENSSL_TAG"
fi
if [ -f "$SSL_SRC/VERSION.dat" ]; then
  echo "▶ OpenSSL source : $(tr '\n' ' ' < "$SSL_SRC/VERSION.dat" | sed 's/  */ /g')"
fi

# $3 = flags SUPPLÉMENTAIRES passés à ./Configure, chacun en UN SEUL argument.
#
# ./Configure d'OpenSSL n'a aucune branche pour « -arch » : tout argument qui ne
# commence pas par -, + ou / est interprété comme un NOM DE CIBLE. Passer
# « -arch arm64 » en deux mots fait donc lire « arm64 » comme une seconde cible :
#   target already defined - ios64-xcrun (offending arg: arm64)
# La syntaxe documentée pour un flag à argument séparé est l'encodage %20, que
# Configure décode en espace : « -arch%20arm64 ».
#
# À noter : ios64-xcrun ajoute DÉJÀ « -arch arm64 » elle-même, donc la tranche
# device n'en a pas besoin. iossimulator-xcrun, elle, ne fixe aucune
# architecture : il faut l'y préciser.
build_openssl () {
  local tag="$1" ossl_target="$2"
  shift 2
  local extra_flags=("$@")
  local prefix="$WORK/openssl/$tag"

  if [ -f "$prefix/lib/libssl.a" ] && [ -f "$prefix/lib/libcrypto.a" ]; then
    echo "▶ OpenSSL: $tag déjà construit → $prefix"
    return 0
  fi

  echo "▶ OpenSSL: $tag (cible $ossl_target, flags: ${extra_flags[*]})"
  rm -rf "$WORK/openssl-build-$tag"
  cp -R "$SSL_SRC" "$WORK/openssl-build-$tag"
  pushd "$WORK/openssl-build-$tag" >/dev/null

  ./Configure "$ossl_target" no-shared no-dso no-async no-tests no-engine \
    --prefix="$prefix" "${extra_flags[@]}"

  # Configure imprime « Failure! build file wasn't produced » sans code d'erreur
  # utilisable dans certains cas : on vérifie le produit attendu.
  if [ ! -f configdata.pm ]; then
    echo "❌ ARRÊT — ./Configure n'a pas produit configdata.pm pour « $tag »."
    exit 1
  fi

  make -j"$(sysctl -n hw.ncpu)" build_libs
  make install_dev
  popd >/dev/null

  # OpenSSL 3.x installe parfois dans lib64 ; configure-iphone attend lib/.
  if [ ! -d "$prefix/lib" ] && [ -d "$prefix/lib64" ]; then
    ln -s lib64 "$prefix/lib"
  fi
  test -f "$prefix/lib/libssl.a"    || { echo "❌ OpenSSL $tag : libssl.a manquant";    exit 1; }
  test -f "$prefix/lib/libcrypto.a" || { echo "❌ OpenSSL $tag : libcrypto.a manquant"; exit 1; }
  test -f "$prefix/include/openssl/ssl.h" || { echo "❌ OpenSSL $tag : en-têtes manquants"; exit 1; }

  # L'architecture doit être arm64 : une erreur de flags produirait silencieusement
  # du x86_64 et le lien final échouerait bien plus tard, sans cause lisible.
  local archs
  archs="$(lipo -archs "$prefix/lib/libcrypto.a" 2>/dev/null || echo '?')"
  if [ "$archs" != "arm64" ]; then
    echo "❌ ARRÊT — libcrypto.a ($tag) est en « $archs », attendu « arm64 »."
    exit 1
  fi
  echo "✔ OpenSSL $tag → $prefix (arm64)"
}

# Device : ios64-xcrun fournit déjà -arch arm64 ; on ne surcharge que la version min.
build_openssl device    ios64-xcrun        "-mios-version-min=$MIN_IOS_VER" "-fno-common"
# Simulateur : aucune architecture dans la cible, d'où -arch%20arm64 (encodage %20).
build_openssl simulator iossimulator-xcrun "-arch%20arm64" "-mios-simulator-version-min=$MIN_IOS_VER" "-fno-common"
echo ""

# ---------------------------------------------------------------------------
# 2) pjproject
# ---------------------------------------------------------------------------
cd "$WORK"
if [ ! -d pjproject/.git ]; then
  rm -rf pjproject
  git clone --filter=blob:none --no-checkout \
    https://github.com/pjsip/pjproject.git pjproject
  git -C pjproject checkout -q "tags/$PJ_TAG"
fi
cd pjproject

# config_site.h — PJSIP n'a PAS de transport SIP over WebSocket : ne pas
# ajouter PJSIP_TRANSPORT_WSS, la macro n'existe pas.
# PJ_HAS_SSL_SOCK n'est PAS déclaré ici : sur autoconf il est détecté par
# configure via --with-ssl, et le forcer masquerait une absence d'OpenSSL.
cat > pjlib/include/pj/config_site.h <<'EOF'
#define PJ_CONFIG_IPHONE 1
#define PJMEDIA_HAS_VIDEO 0
#define PJSIP_HAS_TLS_TRANSPORT 1
#define PJSIP_MAX_PKT_LEN 8000
#include <pj/config_site_sample.h>
EOF

build_arch () {
  local tag="$1" sdk_path="$2" platform="$3" min_flag="$4"
  local ssl_prefix="$WORK/openssl/$tag"
  local log="$WORK/configure-$tag.log"

  echo "▶ pjproject $PJ_TAG : $tag"
  echo "  SDK        : $sdk_path"
  echo "  --with-ssl : $ssl_prefix"

  make distclean >/dev/null 2>&1 || true

  # configure-iphone code DEVPATH en dur sur iPhoneOS.platform. Sans cet
  # export, la passe simulateur compilerait pour le device et produirait deux
  # tranches identiques, que xcodebuild -create-xcframework refuse.
  env \
    DEVPATH="$DEVELOPER_DIR_PATH/Platforms/${platform}.platform/Developer" \
    IPHONESDK="$sdk_path" \
    ARCH="-arch arm64" \
    MIN_IOS="$min_flag" \
    ./configure-iphone --with-ssl="$ssl_prefix" \
      --disable-video --disable-libyuv --disable-opencore-amr 2>&1 | tee "$log"

  # Garde-fou n°1 — un TLS silencieusement désactivé coûte des heures de
  # diagnostic plus tard, avec un PJSIP_EUNSUPTRANSPORT invisible dans le Swift.
  if ! grep -q "OpenSSL library found, SSL support enabled" "$log"; then
    echo ""
    echo "❌ ARRÊT — configure n'a PAS détecté OpenSSL pour « $tag »."
    echo "   Attendu dans la sortie : « OpenSSL library found, SSL support enabled »"
    echo "   Journal complet : $log"
    echo "   Sans cela PJ_HAS_SSL_SOCK=0, et pjsua_transport_create(PJSIP_TRANSPORT_TLS)"
    echo "   échouera à l'exécution avec PJSIP_EUNSUPTRANSPORT."
    exit 1
  fi
  echo "✔ TLS : « OpenSSL library found, SSL support enabled » ($tag)"

  make dep && make clean && make

  # Garde-fou n°2 — la macro doit être à 1 dans la config effective produite
  # par autoconf. Bloquant : poursuivre livrerait un xcframework importable
  # mais sans TLS.
  if ! grep -qE '^[[:space:]]*#[[:space:]]*define[[:space:]]+PJ_HAS_SSL_SOCK[[:space:]]+1' \
        pjlib/include/pj/compat/os_auto.h 2>/dev/null; then
    echo "❌ ARRÊT — PJ_HAS_SSL_SOCK n'est pas à 1 pour « $tag ». Journal : $log"
    exit 1
  fi
  echo "✔ PJ_HAS_SSL_SOCK = 1 ($tag)"

  # Une seule archive statique par architecture, OpenSSL inclus : le TLS ne
  # dépend ainsi pas d'une étape Xcode manuelle facile à oublier.
  local dest="$WORK/libs/$tag"
  rm -rf "$dest"; mkdir -p "$dest/parts"
  find . -name '*.a' -path '*-apple-darwin_ios*' -exec cp {} "$dest/parts/" \;
  local n_parts
  n_parts="$(find "$dest/parts" -name '*.a' | wc -l | tr -d ' ')"
  if [ "$n_parts" -lt 5 ]; then
    echo "❌ ARRÊT — seulement $n_parts archives pjproject trouvées pour « $tag »."
    echo "   La compilation a probablement échoué en amont."
    exit 1
  fi
  echo "  archives pjproject collectées : $n_parts"

  libtool -static -o "$dest/libPJSIP.a" \
    "$dest/parts"/*.a \
    "$ssl_prefix/lib/libssl.a" \
    "$ssl_prefix/lib/libcrypto.a"
  rm -rf "$dest/parts"
  test -f "$dest/libPJSIP.a" || { echo "❌ libPJSIP.a manquant pour $tag"; exit 1; }

  # Garde-fou n°3 — la tranche doit contenir les symboles TLS d'OpenSSL et
  # être de la bonne plateforme.
  if ! nm -g "$dest/libPJSIP.a" 2>/dev/null | grep -q 'SSL_CTX_new'; then
    echo "❌ ARRÊT — libPJSIP.a ($tag) ne contient pas les symboles OpenSSL."
    exit 1
  fi
  echo "✔ libPJSIP.a ($tag) : symboles OpenSSL présents"
  echo ""
}

build_arch device    "$SDK_DEVICE_PATH" iPhoneOS        "-mios-version-min=$MIN_IOS_VER"
build_arch simulator "$SDK_SIM_PATH"    iPhoneSimulator "-mios-simulator-version-min=$MIN_IOS_VER"

# ---------------------------------------------------------------------------
# 3) En-têtes + xcframework
# ---------------------------------------------------------------------------
rm -rf "$WORK/headers"; mkdir -p "$WORK/headers"
cp -R pjlib/include/.      "$WORK/headers/"
cp -R pjlib-util/include/. "$WORK/headers/"
cp -R pjnath/include/.     "$WORK/headers/"
cp -R pjmedia/include/.    "$WORK/headers/"
cp -R pjsip/include/.      "$WORK/headers/"

# Module map : permet « import pjsua » depuis Swift sans bridging header.
cat > "$WORK/headers/module.modulemap" <<'EOF'
module pjsua [system] {
  header "pjsua-lib/pjsua.h"
  export *
}
EOF

rm -rf "$OUT/libpjsip.xcframework"
xcodebuild -create-xcframework \
  -library "$WORK/libs/device/libPJSIP.a"    -headers "$WORK/headers" \
  -library "$WORK/libs/simulator/libPJSIP.a" -headers "$WORK/headers" \
  -output "$OUT/libpjsip.xcframework"

echo ""
echo "✅ libpjsip.xcframework (TLS activé) → $OUT"
echo ""
echo "Étapes Xcode restantes, une seule fois :"
echo "  1. Cible App → General → Frameworks, Libraries, and Embedded Content → +"
echo "     → Add Other… → Add Files… → $OUT/libpjsip.xcframework"
echo "     → régler « Do Not Embed » (bibliothèque statique)."
echo "  2. Build Settings → Preprocessor Macros : ajouter PJ_AUTOCONF=1"
echo "     (exigé par la documentation PJSIP ; sans lui les en-têtes pjlib ne"
echo "      trouvent pas pj/compat/os_auto.h)."
echo "  3. Product → Clean Build Folder, puis Run."
