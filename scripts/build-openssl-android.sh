#!/usr/bin/env bash
# Compile OpenSSL 3.5.9 LTS pour les ABI Android livrés par Planiprêt.
# Produit uniquement les prérequis locaux de PJSIP : aucun appel NetSapiens,
# aucune clé, aucun secret et aucune publication n'est effectuée.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-$SDK_ROOT/ndk/27.2.12479018}"
OPENSSL_TAG="${OPENSSL_TAG:-openssl-3.5.9}"
SOURCE_DIR="${OPENSSL_SOURCE_DIR:-$ROOT/.work/vendor/openssl-${OPENSSL_TAG}}"
OUT="${PP_OPENSSL_ANDROID_DIR:-$ROOT/.work/vendor/openssl-android-3.5.9}"
# Toutes les sources fournisseur sont déjà présentes localement; une ABI
# supplémentaire requiert moins de 1 Go temporaire. Le seuil de 12 Go conserve
# une marge de compilation sans refuser inutilement une reprise incrémentale.
MIN_FREE_KB=$((12 * 1024 * 1024))
FREE_KB="$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')"

fail() { printf 'ARRÊT — %s\n' "$*" >&2; exit 1; }
[ "$FREE_KB" -ge "$MIN_FREE_KB" ] || fail "au moins 16 Go libres sont requis; disponibles: $((FREE_KB / 1024 / 1024)) Go."
[ -x "$ANDROID_NDK_ROOT/ndk-build" ] || fail "NDK r27.2 absent: $ANDROID_NDK_ROOT. Installez exactement ndk;27.2.12479018."
command -v git >/dev/null || fail "git introuvable"
command -v perl >/dev/null || fail "perl introuvable"
command -v make >/dev/null || fail "make introuvable"

# OpenSSL 3.5 detects a modern Android NDK by finding its generic `clang` on
# PATH; it then chooses the ABI/API-specific compiler itself (for example
# aarch64-linux-android26-clang). NDK r27 no longer ships the old *-gcc names.
TOOLCHAIN_BIN="$(find "$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt" -name clang -perm -111 -print -quit 2>/dev/null || true)"
[ -n "$TOOLCHAIN_BIN" ] || fail "clang LLVM introuvable dans le NDK: $ANDROID_NDK_ROOT"
TOOLCHAIN_BIN="$(dirname "$TOOLCHAIN_BIN")"
export PATH="$TOOLCHAIN_BIN:$PATH"
command -v clang >/dev/null || fail "clang NDK non disponible dans PATH"

mkdir -p "$(dirname "$SOURCE_DIR")" "$(dirname "$OUT")"
if [ ! -d "$SOURCE_DIR/.git" ]; then
  git clone --depth 1 --branch "$OPENSSL_TAG" https://github.com/openssl/openssl.git "$SOURCE_DIR"
fi
[ "$(git -C "$SOURCE_DIR" describe --tags --exact-match 2>/dev/null || true)" = "$OPENSSL_TAG" ] || \
  fail "source OpenSSL inattendue; attendu tag $OPENSSL_TAG."
[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ] || fail "sources OpenSSL locales modifiées: $SOURCE_DIR"

# Chaque architecture est bâtie dans une copie isolée : les fichiers générés par
# Configure ne peuvent ainsi jamais croiser arm64-v8a et x86_64.
build_one() {
  local abi="$1" openssl_target="$2"
  local prefix="$OUT/$abi"
  local build="$ROOT/.work/openssl-build-$abi"
  # NDK r27 ne choisit pas l'alignement 16 KB par défaut. Le marqueur porte
  # explicitement cette politique afin qu'un ancien OpenSSL 4 KB ne soit jamais
  # réutilisé pour une release Play.
  local marker="tag=$OPENSSL_TAG;abi=$abi;target=$openssl_target;ndk=$(basename "$ANDROID_NDK_ROOT");elf-page-size=16384"

  if [ -s "$prefix/lib/libssl.so" ] && [ -s "$prefix/lib/libcrypto.so" ] \
      && [ -f "$prefix/.planipret-build-marker" ] \
      && [ "$(cat "$prefix/.planipret-build-marker")" = "$marker" ]; then
    echo "OpenSSL déjà prêt: $abi"
    return 0
  fi

  rm -rf "$build" "$prefix"
  cp -R "$SOURCE_DIR" "$build"
  rm -rf "$build/.git"
  (
    cd "$build"
    export ANDROID_NDK_ROOT
    # Flags requis par la documentation Android pour NDK r27 et inférieur.
    # OpenSSL produit libssl.so/libcrypto.so : les deux doivent avoir tous leurs
    # segments ELF PT_LOAD alignés à 16 KB, y compris lorsqu'ils sont liés par
    # PJSIP dans le module mobile.
    export LDFLAGS="${LDFLAGS:-} -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384"
    ./Configure "$openssl_target" shared no-tests no-apps no-legacy \
      --prefix="$prefix" --openssldir="$prefix/ssl"
    make -j"$(sysctl -n hw.ncpu)" build_libs
    make install_sw
  )
  test -s "$prefix/lib/libssl.so" || fail "libssl.so absente après build $abi"
  test -s "$prefix/lib/libcrypto.so" || fail "libcrypto.so absente après build $abi"
  printf '%s\n' "$marker" > "$prefix/.planipret-build-marker"
}

build_one arm64-v8a android-arm64
build_one armeabi-v7a android-arm
build_one x86 android-x86
build_one x86_64 android-x86_64

echo "OK — OpenSSL $OPENSSL_TAG compilé pour arm64-v8a, armeabi-v7a, x86 et x86_64 : $OUT"
