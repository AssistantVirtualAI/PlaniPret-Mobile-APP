#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# verify-pjsip-tls.sh — vérification POST-BUILD du xcframework PJSIP.
#
# Objectif : rendre impossible la livraison d'une bibliothèque « importable mais
# sans TLS ». On n'inspecte pas la sortie de configure ici (c'est le rôle du
# build), mais les BINAIRES FINAUX : si les symboles OpenSSL et le transport TLS
# de PJSIP ne sont pas dans l'archive, on échoue (exit 1).
#
#   bash scripts/verify-pjsip-tls.sh [chemin/libpjsip.xcframework]
#
# Utilisé par build-pjsip-ios.sh (dernière étape) et par la CI.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
XCF="${1:-$APP_DIR/ios/App/App/Plugins/PpPjsip/Frameworks/libpjsip.xcframework}"
WORK="${PJSIP_WORKDIR:-$APP_DIR/.pjsip-build}"

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }

fail() {
  echo ""
  red "❌ VÉRIFICATION TLS ÉCHOUÉE — $1"
  echo "   Le xcframework serait importable (canImport(pjsua) vrai) mais"
  echo "   pjsua_transport_create(PJSIP_TRANSPORT_TLS) échouerait à l'exécution"
  echo "   avec PJSIP_EUNSUPTRANSPORT (220003)."
  echo "   Reconstruis avec : bash scripts/build-pjsip-ios.sh"
  exit 1
}

command -v nm >/dev/null || fail "nm introuvable (Xcode command line tools requis)"
[ -d "$XCF" ] || fail "xcframework absent : $XCF"

echo "▶ Vérification TLS de $XCF"

# Symboles OpenSSL (backend cryptographique) — au moins un doit être présent.
OPENSSL_SYMS=(SSL_CTX_new OPENSSL_init_ssl SSL_library_init TLS_client_method)
# Symboles PJSIP prouvant que le transport TLS a été compilé (PJ_HAS_SSL_SOCK=1).
PJSIP_SYMS=(pjsip_tls_transport_start pj_ssl_sock_create pj_ssl_cipher_get_availables)

slices=0
while IFS= read -r lib; do
  slices=$((slices + 1))
  slice="$(basename "$(dirname "$lib")")"
  echo "  • tranche $slice → $(basename "$lib")"
  syms="$(nm -gU "$lib" 2>/dev/null || nm -g "$lib" 2>/dev/null || true)"
  [ -n "$syms" ] || fail "impossible de lire les symboles de $lib"

  found_ssl=""
  for s in "${OPENSSL_SYMS[@]}"; do
    if grep -q "[ _]${s}\$" <<<"$syms"; then found_ssl="$s"; break; fi
  done
  [ -n "$found_ssl" ] || fail "aucun symbole OpenSSL (${OPENSSL_SYMS[*]}) dans la tranche '$slice' — OpenSSL n'a pas été fusionné dans libPJSIP.a"
  echo "    ✔ OpenSSL présent (symbole $found_ssl)"

  for s in "${PJSIP_SYMS[@]}"; do
    grep -q "[ _]${s}\$" <<<"$syms" || fail "symbole PJSIP TLS manquant '$s' dans la tranche '$slice' — PJ_HAS_SSL_SOCK valait 0 au moment du build"
  done
  echo "    ✔ transport TLS PJSIP présent (${PJSIP_SYMS[*]})"
done < <(find "$XCF" -name '*.a' -type f)

[ "$slices" -ge 1 ] || fail "aucune archive .a trouvée dans le xcframework"

# En-tête : le module doit exposer pjsip_tls_transport_start.
grep -rq "pjsip_tls_transport_start" "$XCF" --include='*.h' \
  || fail "en-tête pjsip/sip_transport_tls.h absent du xcframework"
green "  ✔ en-têtes TLS exportés"

# Journaux de configure conservés par le build : confirmation croisée.
shopt -s nullglob
logs=("$WORK"/configure-*.log)
if [ ${#logs[@]} -gt 0 ]; then
  for log in "${logs[@]}"; do
    tag="$(basename "$log" .log)"; tag="${tag#configure-}"
    grep -q "OpenSSL library found, SSL support enabled" "$log" \
      || fail "configure-$tag.log ne contient pas « OpenSSL library found, SSL support enabled »"
    echo "  ✔ $tag : OpenSSL détecté par configure"
  done
else
  echo "  ⚠ aucun configure-*.log dans $WORK (vérification croisée ignorée)"
fi

green "✅ TLS confirmé dans le xcframework ($slices tranche(s))"
