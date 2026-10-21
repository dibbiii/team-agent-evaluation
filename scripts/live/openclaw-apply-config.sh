#!/usr/bin/env bash
# Copia scripts/live/openclaw-config.json in HOME della sandbox e lo applica con `openclaw config set --batch-file` DENTRO bwrap.
# Se la prima applicazione fallisce per path protetto, si riprova con --replace (agents.defaults.models).
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
cp "$HOME/openclaw-config.json" "$HOME/oc-sbhome/cfg.json"
bash "$HOME/bin/oc-sandboxed" --ws ws1 -- openclaw config set --batch-file /home/sandbox/cfg.json --dry-run 2>&1 | tail -15
echo "---- applico"
bash "$HOME/bin/oc-sandboxed" --ws ws1 -- openclaw config set --batch-file /home/sandbox/cfg.json --replace 2>&1 | tail -15
