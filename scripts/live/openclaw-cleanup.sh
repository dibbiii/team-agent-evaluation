#!/usr/bin/env bash
# Pulizia delle prove OpenClaw in Ubuntu-26.04: SOLO sotto $HOME e per nome esatto. Mantiene l'installazione (~/oc), ~/pc-node,
# ~/bin/oc-sandboxed e gli script. Non legge mai ~/.claude/.credentials.json.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
echo "== processi (atteso: nessuno)"; ps -eo pid,args --no-headers | grep -E 'node|claude|bwrap|openclaw' | grep -v grep | grep -v 'openclaw-cleanup' | cut -c1-120 || echo "nessuno"
for d in oc-ws oc-fixture oc-sbhome oc-logs; do [ -e "$HOME/$d" ] && rm -rf "${HOME:?}/$d" && echo "rimosso ~/$d"; done
for f in out/oc-c1.tar out/oc-c2.tar oc-prompt-ISSUE-1.txt oc-prompt-ping.txt oc-prompt-resume.txt oc-gateway.log oc-gateway.pid oc-wrapper.log .oc-sampling \
  oc-turn-nocred1.json oc-turn-nocred1.sample.txt oc-turn-nocred1.err oc-turn-nocred2.json oc-turn-nocred2.sample.txt oc-turn-nocred2.err \
  oc-turn-c1.json oc-turn-c1.sample.txt oc-turn-c1.err oc-turn-c2.json oc-turn-c2.sample.txt oc-turn-c2.err oc-turn-c3resume.json oc-turn-c3resume.sample.txt oc-turn-c3resume.err; do
  [ -e "$HOME/$f" ] && rm -f "${HOME:?}/$f" && echo "rimosso ~/$f"; done
echo "== verifiche"
echo "copie credenziali (atteso: nessuna):"; find "$HOME" -name .credentials.json -not -path "$HOME/.claude/.credentials.json" 2>/dev/null
echo "originale ~/.claude/.credentials.json (solo permessi): $(ls -l "$HOME/.claude/.credentials.json" | awk '{print $1}')"
echo "porte in ascolto: $(ss -ltn | awk 'NR>1{print $4}' | tr '\n' ' ')"
echo "home: $(ls -A "$HOME" | tr '\n' ' ')"; ls ~/out 2>/dev/null
