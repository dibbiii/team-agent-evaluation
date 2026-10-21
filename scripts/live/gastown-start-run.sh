#!/usr/bin/env bash
# Host WSL: avvia IN BACKGROUND (setsid nohup) il monitor di una run Gas Town dentro bwrap, CON le credenziali (copiate con cp
# nella HOME della sandbox e rimosse all'uscita del wrapper). Scrive PID e log in ~/gt-run-<etichetta>.{pid,out}.
# Uso: bash ~/gastown-start-run.sh <etichetta> <secondi-max> <ISSUE-N> <tetto-USD-cumulativo> [argomenti extra di gt sling...]
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
LABEL="${1:?etichetta}"; MAX="${2:?secondi}"; ISSUE="${3:?ISSUE-N}"; CAP="${4:?tetto}"; shift 4
if ps -eo args --no-headers | grep -E 'bwrap|claude|tmux|dolt' | grep -v grep >/dev/null; then echo "STOP: processi bwrap/claude/tmux/dolt gia' presenti"; exit 1; fi
printf '%s\n' "$CAP" > "$HOME/gt-sbhome/obs-cap"
setsid nohup bash "$HOME/gastown-sandboxed.sh" --creds -- bash /home/sandbox/gastown-monitor-inner.sh "$LABEL" "$MAX" "$ISSUE" "$@" > "$HOME/gt-run-$LABEL.out" 2>&1 < /dev/null &
echo $! > "$HOME/gt-run-$LABEL.pid"
echo "avviato wrapper pid=$(cat "$HOME/gt-run-$LABEL.pid") etichetta=$LABEL max=${MAX}s tetto=$CAP"
