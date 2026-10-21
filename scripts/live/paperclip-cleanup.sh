#!/usr/bin/env bash
# Pulizia delle prove Paperclip in Ubuntu-26.04: SOLO sotto $HOME e per nome esatto. Mantiene l'installazione (~/pc, ~/pc-node),
# il wrapper e gli script. Prima verifica processi, porte e copie di credenziali; non legge mai ~/.claude/.credentials.json.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
echo "== processi (atteso: nessuno)"
ps -eo pid,args --no-headers | grep -E 'node|postgres|paperclip|claude|bwrap' | grep -v grep | grep -v 'paperclip-cleanup' | cut -c1-120 || echo "nessuno"
echo "== rimozione per nome esatto"
for d in pc-data pc-data-auth pc-home pc-ws pc-fixture; do
  if [ -e "$HOME/$d" ]; then rm -rf "${HOME:?}/$d" && echo "rimosso ~/$d"; fi
done
for f in out/pc-c1.tar out/pc-c2.tar pc-prompt-ISSUE-1.txt pc-16935.json pc-16935b.json pc-16935-auth.json pc-run-r1.json pc-run-c1.json pc-run-c2.json pc-server.log pc-server.pid pc-wrapper.log; do
  [ -e "$HOME/$f" ] && rm -f "${HOME:?}/$f" && echo "rimosso ~/$f"
done
echo "== verifiche"
echo "copie credenziali (atteso: nessuna):"; find "$HOME" -name .credentials.json -not -path "$HOME/.claude/.credentials.json" 2>/dev/null
echo "cartelle pc-runhome.* (atteso: nessuna):"; ls -d "$HOME"/pc-runhome.* 2>/dev/null
echo "porte in ascolto: $(ss -ltn | awk 'NR>1{print $4}' | tr '\n' ' ')"
echo "originale ~/.claude/.credentials.json (solo permessi): $(ls -l "$HOME/.claude/.credentials.json" | awk '{print $1}')"
echo "home: $(ls "$HOME" | tr '\n' ' ')"
