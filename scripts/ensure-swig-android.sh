#!/usr/bin/env bash
# Installe localement SWIG 4.3.1 pour régénérer le module Android PJSUA2.
# Le binaire, la source et l'archive restent sous .work/ et ne sont jamais versionnés.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="4.3.1"
EXPECTED_SHA256="44fc829f70f1e17d635a2b4d69acab38896699ecc24aa023e516e0eabbec61b8"
TOOLS_DIR="$ROOT/.work/tools"
CACHE_DIR="$ROOT/.work/vendor"
PREFIX="$TOOLS_DIR/swig-$VERSION"
ARCHIVE="$CACHE_DIR/swig-$VERSION.tar.gz"
SOURCE_DIR="$CACHE_DIR/swig-$VERSION-src"
URL="${PP_SWIG_URL:-https://downloads.sourceforge.net/swig/swig-$VERSION.tar.gz}"

fail() { printf 'ARRÊT — %s\n' "$*" >&2; exit 1; }

if [ -x "$PREFIX/bin/swig" ]; then
  "$PREFIX/bin/swig" -version | grep -Fq "SWIG Version $VERSION" \
    || fail "le SWIG local ne correspond pas à la version épinglée $VERSION: $PREFIX"
  printf 'SWIG %s déjà prêt : %s\n' "$VERSION" "$PREFIX/bin/swig"
  exit 0
fi

for command in curl tar make cc c++ shasum pcre2-config; do
  command -v "$command" >/dev/null 2>&1 || fail "$command est requis pour construire SWIG $VERSION"
done

mkdir -p "$TOOLS_DIR" "$CACHE_DIR"
if [ ! -f "$ARCHIVE" ]; then
  tmp="$ARCHIVE.download"
  rm -f "$tmp"
  curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
    --output "$tmp" "$URL"
  mv "$tmp" "$ARCHIVE"
fi

actual="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
[ "$actual" = "$EXPECTED_SHA256" ] || fail "SHA-256 SWIG invalide: $actual (attendu $EXPECTED_SHA256)"

work="$CACHE_DIR/.swig-build-$VERSION"
rm -rf "$work" "$SOURCE_DIR" "$PREFIX"
mkdir -p "$work"
tar -xzf "$ARCHIVE" -C "$work"
[ -x "$work/swig-$VERSION/configure" ] || fail "la distribution SWIG ne contient pas configure"
mv "$work/swig-$VERSION" "$SOURCE_DIR"
rm -rf "$work"

(
  cd "$SOURCE_DIR"
  ./configure --prefix="$PREFIX" --with-pcre
  make -j"$(sysctl -n hw.ncpu)"
  make install
)

[ -x "$PREFIX/bin/swig" ] || fail "installation SWIG incomplète: $PREFIX/bin/swig absent"
"$PREFIX/bin/swig" -version | grep -Fq "SWIG Version $VERSION" \
  || fail "SWIG installé mais version inattendue"
printf 'OK — SWIG %s installé après validation SHA-256 : %s\n' "$VERSION" "$PREFIX/bin/swig"
