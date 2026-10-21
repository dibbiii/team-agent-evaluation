#!/usr/bin/env bash
# Riporta ~/oc-ws/ws1 al commit baseline (tra una run e l'altra): checkout + clean del solo workspace di prova. Non tocca altro.
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP"; exit 3; }
G=(env GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null git -C "$HOME/oc-ws/ws1")
"${G[@]}" checkout -q -- . ; "${G[@]}" clean -fdq; "${G[@]}" status --short; echo "reset ok HEAD=$("${G[@]}" rev-parse --short HEAD)"
