#!/usr/bin/env bash
# DENTRO bwrap (gastown-sandboxed.sh, senza --creds): prepara HOME della sandbox, town e rig per Gas Town. Costo zero:
# nessun agente viene avviato. Il remoto "origin" e' un repository bare LOCALE (file://), nessun remoto reale.
# Prerequisito (lato host, fuori da bwrap): ~/gt-sbhome/origin/seed-app.git creato da fixture-setup.sh.
set -uo pipefail
export HOME=/home/sandbox
cd "$HOME"
[ -d "$HOME/origin/seed-app.git" ] || { echo "STOP: manca origin/seed-app.git"; exit 1; }
git config --global user.name "tae-gt"
git config --global user.email "tae-gt@example.invalid"
git config --global init.defaultBranch main
dolt config --global --add user.name "tae-gt" >/dev/null 2>&1
dolt config --global --add user.email "tae-gt@example.invalid" >/dev/null 2>&1
dolt config --global --add versioncheck.disabled true >/dev/null 2>&1
dolt config --global --add metrics.disabled true >/dev/null 2>&1
echo "== dolt config globale"; cat "$HOME/.dolt/config_global.json" 2>/dev/null; echo
echo "== gt install"
time gt install "$HOME/gt" --git --name tae-town 2>&1 | tail -25
echo "== listener (atteso: dolt solo su 127.0.0.1)"
ss -ltnp 2>/dev/null | awk 'NR==1||/LISTEN/'
echo "== gt rig add seedapp"
cd "$HOME/gt"
time gt rig add seedapp file:///home/sandbox/origin/seed-app.git 2>&1 | tail -25
echo "== rig: struttura"
ls -la "$HOME/gt" "$HOME/gt/seedapp"
echo "== gt config agent list"
gt config agent list 2>&1 | head -30
echo "== gt doctor"
gt doctor 2>&1 | tail -40
echo "== processi"
ps -eo pid,ppid,args --no-headers | cut -c1-150
echo "== stop dolt"
gt dolt stop 2>&1 | tail -3
sleep 1
ps -eo pid,args --no-headers | grep -E "dolt|tmux" | grep -v grep || echo "nessun dolt/tmux"
