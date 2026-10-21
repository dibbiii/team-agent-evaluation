#!/usr/bin/env bash
# Diagnostica a costo zero DENTRO bwrap (senza credenziali). Uso: bash ~/openclaw-diag.sh
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP"; exit 3; }
echo "== gateway run in foreground, log debug (timeout 25 s), righe con errori/stato"
bash "$HOME/bin/oc-sandboxed" --ws ws1 -- timeout 25 openclaw --log-level debug gateway run 2>&1 | grep -v "startup phase" | grep -i -B2 -A12 "error\|fail\|lock\|owner" | cut -c1-400 | head -80
