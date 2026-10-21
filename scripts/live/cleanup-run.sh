#!/usr/bin/env bash
# Pulizia dopo una run LIVE di Warren, dentro Ubuntu-26.04. Tocca SOLO: ~/fixtures/seed-app.git, ~/out, ~/live-runs/2026*.
# Prima VERIFICA (stampando solo i percorsi, mai il contenuto) che non restino copie di .credentials.json oltre
# all'originale in ~/.claude, e che nessun processo bun/warren/bwrap/claude sia rimasto.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
echo "== processi residui (atteso: nessuno)"
ps -eo pid,args --no-headers | grep -E 'bun src/cli|bwrap|/claude( |$)|warren' | grep -v grep || echo "nessuno"
echo "== copie di .credentials.json in HOME, escluso l'originale (atteso: nessuna)"
find "$HOME" -name '.credentials.json' -not -path "$HOME/.claude/.credentials.json" 2>/dev/null | sed 's/^/  /' | tee /tmp/cred-copies.txt
[ -s /tmp/cred-copies.txt ] && echo "ATTENZIONE: copie trovate sopra" || echo "nessuna copia"
rm -f /tmp/cred-copies.txt
echo "== cancello il repository di prova, le esportazioni e le cartelle delle run"
rm -rf "$HOME/fixtures/seed-app.git" "$HOME/out"
for d in "$HOME"/live-runs/2026*; do [ -d "$d" ] && rm -rf "$d" && echo "rimossa $(basename "$d")"; done
echo "== stato finale"
ls "$HOME/fixtures" 2>/dev/null | sed 's/^/  fixtures: /'; ls "$HOME/live-runs" 2>/dev/null | wc -l | sed 's/^/  cartelle in live-runs: /'
echo "originale in ~/.claude (solo permessi, contenuto non letto): $(ls -l "$HOME/.claude/.credentials.json" | awk '{print $1}')"
