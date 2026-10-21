#!/usr/bin/env bash
# Controllo di stato (sola lettura) per OpenClaw LIVE: processi, porte, copie di credenziali, spazio, RAM. Nessun segreto letto.
echo "== distro: ${WSL_DISTRO_NAME:-?}"
echo "== processi rilevanti"; ps -eo pid,lstart,args | grep -E 'node|claude|bwrap|openclaw' | grep -v grep | grep -v openclaw-state | cut -c1-170 || true
echo "== porte in ascolto"; ss -ltn | awk 'NR>1{print $4}' | sort -u | tr '\n' ' '; echo
echo "== copie credenziali (deve essere vuoto)"; find /home/dibbi -name .credentials.json -not -path /home/dibbi/.claude/.credentials.json 2>/dev/null
echo "== home"; ls -A ~ | tr '\n' ' '; echo
echo "== bin"; ls ~/bin 2>&1 | tr '\n' ' '; echo
echo "== claude"; ls ~/.local/bin 2>&1 | tr '\n' ' '; echo
echo "== disco/mem"; df -h ~ | tail -1; free -m | head -2
echo "== node"; ls ~/pc-node/node_modules/node/bin 2>&1; ~/pc-node/node_modules/node/bin/node -v; which node; node -v
