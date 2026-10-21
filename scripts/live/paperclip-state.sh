#!/usr/bin/env bash
# Controllo di stato (sola lettura): processi, porte, copie di credenziali. Nessun segreto letto.
echo "== processi rilevanti"; ps -eo pid,lstart,args | grep -E 'node|claude|bwrap|postgres|paperclip|bun' | grep -v grep | cut -c1-160 || true
echo "== porte in ascolto"; ss -ltn | awk 'NR>1{print $4}' | sort -u | tr '\n' ' '; echo
echo "== copie credenziali (deve essere vuoto)"; find /home/dibbi -name .credentials.json -not -path /home/dibbi/.claude/.credentials.json 2>/dev/null
echo "== claude"; ls -la ~/.local/bin 2>&1 | head; ls ~/.local/share/claude 2>&1 | head
echo "== pc"; ls ~/pc ~/pc-node 2>&1 | head
echo "== mem"; free -m | head -2
