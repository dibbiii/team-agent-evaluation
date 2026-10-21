#!/usr/bin/env bash
# Installa la release npm openclaw@2026.10.5 in ~/oc con Node 24 (~/pc-node), SENZA script di install. Nessun avvio.
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
N="$HOME/pc-node/node_modules/node/bin"
export PATH="$N:$PATH"
mkdir -p "$HOME/oc"
cd "$HOME/oc"
export HOME="$HOME" npm_config_update_notifier=false
time node "$HOME/pc-node/node_modules/npm/bin/npm-cli.js" install --prefix "$HOME/oc" openclaw@2026.10.5 --ignore-scripts --no-fund --no-audit --maxsockets 4
"$HOME/oc/node_modules/.bin/openclaw" --version || true
du -sh "$HOME/oc"
