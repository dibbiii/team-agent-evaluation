#!/usr/bin/env bash
# Prova della modalita' authenticated (private, loopback): salva la config e la porta in authenticated. Uso: switch|restore
set -euo pipefail
C="$HOME/pc-data/instances/default/config.json"
case "${1:-}" in
switch) cp -n "$C" "$C.local_trusted.bak"; jq '.server.deploymentMode="authenticated" | .server.exposure="private"' "$C.local_trusted.bak" > "$C"; jq '.server' "$C";;
restore) cp "$C.local_trusted.bak" "$C"; jq '.server.deploymentMode' "$C";;
esac
