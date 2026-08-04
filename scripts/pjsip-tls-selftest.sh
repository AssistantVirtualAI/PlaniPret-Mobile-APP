#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pjsip-tls-selftest.sh — TEST DE LANCEMENT réel du transport TLS.
#
# La vérification de symboles (verify-pjsip-tls.sh) prouve que le code TLS est
# dans l'archive. Ce test-ci prouve qu'il FONCTIONNE : il démarre PJSUA et
# appelle pjsua_transport_create(PJSIP_TRANSPORT_TLS). Tout échec est rapporté
# avec le code pj_status_t et son libellé (PJSIP_EUNSUPTRANSPORT = 220003).
#
#   bash scripts/pjsip-tls-selftest.sh
#
# Exécuté dans le simulateur iOS (tranche arm64-simulator du xcframework).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
XCF="${PJSIP_XCFRAMEWORK:-$APP_DIR/ios/App/App/Plugins/PpPjsip/Frameworks/libpjsip.xcframework}"
WORK="${PJSIP_WORKDIR:-$APP_DIR/.pjsip-build}"
TESTDIR="$WORK/tls-selftest"
SIM_NAME="${PJSIP_SIM_NAME:-pjsip-tls-selftest}"
SIM_TYPE="${PJSIP_SIM_TYPE:-iPhone 15}"

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }

fail() {
  echo ""
  red "❌ TEST DE LANCEMENT TLS ÉCHOUÉ — $1"
  echo "   pjsua_transport_create(PJSIP_TRANSPORT_TLS) n'a pas pu être validé."
  echo "   Cause la plus fréquente : PJSIP compilé sans OpenSSL (PJ_HAS_SSL_SOCK=0),"
  echo "   ce qui donne PJSIP_EUNSUPTRANSPORT (220003) à l'exécution."
  echo "   Reconstruis avec : bash scripts/build-pjsip-ios.sh"
  exit 1
}

command -v xcrun >/dev/null || fail "xcrun introuvable — macOS + Xcode requis"
[ -d "$XCF" ] || fail "xcframework absent : $XCF"

LIB="$(find "$XCF" -path '*simulator*' -name '*.a' -type f | head -n1)"
[ -n "$LIB" ] || fail "aucune tranche simulateur dans le xcframework"
HEADERS="$(dirname "$LIB")/Headers"
[ -d "$HEADERS" ] || HEADERS="$(find "$XCF" -type d -name Headers | head -n1)"
[ -d "$HEADERS" ] || fail "en-têtes introuvables dans le xcframework"

mkdir -p "$TESTDIR"
cat > "$TESTDIR/main.c" <<'EOF'
#include <stdio.h>
#include <pjsua-lib/pjsua.h>

static void die(const char *what, pj_status_t st) {
    char buf[256];
    pj_strerror(st, buf, sizeof(buf));
    printf("TLS_TRANSPORT_FAIL step=%s status=%d msg=%s\n", what, (int)st, buf);
    if (st == PJSIP_EUNSUPTRANSPORT) {
        printf("DIAG unsupported_transport: PJSIP a ete compile sans backend SSL "
               "(PJ_HAS_SSL_SOCK=0). Rebuild avec --with-ssl=<openssl-prefix>.\n");
    }
    fflush(stdout);
    exit(1);
}

int main(void) {
    pj_status_t st;
    unsigned cipher_count = PJ_SSL_SOCK_MAX_CIPHERS;
    pj_ssl_cipher ciphers[PJ_SSL_SOCK_MAX_CIPHERS];

    if ((st = pjsua_create()) != PJ_SUCCESS) die("pjsua_create", st);

    pjsua_config cfg;            pjsua_config_default(&cfg);
    pjsua_logging_config log_cfg; pjsua_logging_config_default(&log_cfg);
    log_cfg.level = 4; log_cfg.console_level = 4;
    pjsua_media_config media_cfg; pjsua_media_config_default(&media_cfg);

    if ((st = pjsua_init(&cfg, &log_cfg, &media_cfg)) != PJ_SUCCESS) die("pjsua_init", st);

    st = pj_ssl_cipher_get_availables(ciphers, &cipher_count);
    printf("DIAG ssl_backend_ciphers=%u (status=%d)\n", cipher_count, (int)st);
    if (cipher_count == 0) {
        printf("DIAG no_ssl_backend: aucun cipher disponible -> OpenSSL absent du binaire.\n");
    }

    pjsua_transport_config tcfg; pjsua_transport_config_default(&tcfg);
    tcfg.port = 0;
    pjsua_transport_id tid = -1;
    if ((st = pjsua_transport_create(PJSIP_TRANSPORT_TLS, &tcfg, &tid)) != PJ_SUCCESS)
        die("pjsua_transport_create(TLS)", st);

    printf("TLS_TRANSPORT_OK transport_id=%d ciphers=%u\n", (int)tid, cipher_count);
    fflush(stdout);
    pjsua_destroy();
    return 0;
}
EOF

SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
echo "▶ Compilation du self-test (arm64-simulator)"
xcrun --sdk iphonesimulator clang \
  -arch arm64 -mios-simulator-version-min="${MIN_IOS:-14.0}" -isysroot "$SDK" \
  -I "$HEADERS" "$TESTDIR/main.c" "$LIB" \
  -framework Foundation -framework Security -framework AudioToolbox \
  -framework AVFoundation -framework CFNetwork -framework CoreAudio \
  -lc++ -lz -o "$TESTDIR/pjsip-tls-selftest" \
  || fail "compilation impossible — le lien contre libPJSIP.a a échoué (symboles OpenSSL manquants ?)"

# Simulateur dédié, booté sans UI.
UDID="$(xcrun simctl list devices | grep -m1 "$SIM_NAME" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/' || true)"
if [ -z "$UDID" ]; then
  RUNTIME="$(xcrun simctl list runtimes | grep -m1 -oE 'com\.apple\.CoreSimulator\.SimRuntime\.iOS[^ ]*')"
  [ -n "$RUNTIME" ] || fail "aucun runtime iOS installé pour le simulateur"
  UDID="$(xcrun simctl create "$SIM_NAME" "$SIM_TYPE" "$RUNTIME")"
fi
xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true

echo "▶ Exécution dans le simulateur ($UDID)"
set +e
OUTPUT="$(xcrun simctl spawn "$UDID" "$TESTDIR/pjsip-tls-selftest" 2>&1)"
CODE=$?
set -e
echo "$OUTPUT"

xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true

if [ $CODE -ne 0 ] || ! grep -q "TLS_TRANSPORT_OK" <<<"$OUTPUT"; then
  DETAIL="$(grep -m1 'TLS_TRANSPORT_FAIL' <<<"$OUTPUT" || echo "sortie inattendue (code $CODE)")"
  fail "$DETAIL"
fi

green "✅ pjsua_transport_create(PJSIP_TRANSPORT_TLS) réussit — TLS opérationnel"
