#!/usr/bin/env bash
# Esegue il CLI `paseo` 0.12.0 contro il daemon di prova, con ambiente minimo (HOME fittizio, PASEO_HOME=~/ps-home, password del
# daemon da ~/ps-pass, mai stampata). Uso: bash ~/paseo-cli.sh <argomenti di paseo>
# Variabili opzionali passate: PASEO_HUB_API_KEY, PASEO_HUB_URL. NOPASS=1 per non inviare la password.
R="$HOME"
PW=(); [ "${NOPASS:-0}" = 1 ] || PW=("PASEO_PASSWORD=$(cat "$R/ps-pass")")
EXTRA=(); for k in PASEO_HUB_API_KEY PASEO_HUB_URL; do [ -n "${!k:-}" ] && EXTRA+=("$k=${!k}"); done
exec env -i HOME="$R/ps-fake-home" PATH="/usr/local/bin:/usr/bin:/bin" LANG=C.UTF-8 PASEO_HOME="$R/ps-home" "${PW[@]}" "${EXTRA[@]}" \
  node "$R/ps/node_modules/@getpaseo/cli/bin/paseo" "$@"
