#!/usr/bin/env bash
# Pulizia delle prove Gas Town in Ubuntu-26.04: SOLO sotto $HOME e per nome esatto. Mantiene l'installazione riusabile
# (~/gt-go, ~/gt-gopath, ~/gt-bin, ~/gt-src), ~/pc-node, gli script. Non legge mai ~/.claude/.credentials.json.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
echo "== processi (atteso: nessuno)"; ps -eo pid,args --no-headers | grep -E 'node|claude|bwrap|tmux|dolt|/gt |gt-bin' | grep -v grep | grep -v 'gastown-cleanup' | cut -c1-120 || echo "nessuno"
for d in gt-sbhome gt-dl; do [ -e "$HOME/$d" ] && rm -rf "${HOME:?}/$d" && echo "rimosso ~/$d"; done
for f in gt-src.tar gt-wrapper.log gt-run-run1.out gt-run-run1.pid gt-run-run2.out gt-run-run2.pid probe1.sh; do
  [ -e "$HOME/$f" ] && rm -f "${HOME:?}/$f" && echo "rimosso ~/$f"; done
echo "== verifiche"
echo "copie credenziali (atteso: nessuna):"; find "$HOME" -name '.credentials.json*' -not -path "$HOME/.claude/.credentials.json" 2>/dev/null
echo "originale ~/.claude/.credentials.json (solo permessi e dimensione): $(ls -l "$HOME/.claude/.credentials.json" | awk '{print $1, $5}')"
echo "porte in ascolto: $(ss -ltn | awk 'NR>1{print $4}' | tr '\n' ' ')"
echo "home: $(ls -A "$HOME" | tr '\n' ' ')"
du -sh "$HOME/gt-go" "$HOME/gt-gopath" "$HOME/gt-bin" "$HOME/gt-src" 2>/dev/null
