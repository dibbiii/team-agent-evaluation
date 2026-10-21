#!/usr/bin/env bash
# Stato in sola lettura della distribuzione Ubuntu-26.04: orario, credenziali (solo ls -l e cmp con la copia di
# riferimento, MAI contenuto), processi, porte, residui. Uso: bash live/warren-s0-state.sh [ref|check]
#   ref   : crea/aggiorna la copia di riferimento ~/.tae-cred-ref (cp, permessi 600) dell'originale
#   check : confronta l'originale con la copia di riferimento (cmp -s) e stampa dimensione/permessi/mtime
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
C="$HOME/.claude/.credentials.json"; R="$HOME/.tae-cred-ref"
echo "ora: $(date '+%F %T %Z')"
case "${1:-check}" in
  ref) cp -p "$C" "$R" && chmod 600 "$R" && echo "copia di riferimento creata";;
esac
ls -l "$C" | awk '{print "originale:", $1, $5, $6, $7, $8}'
[ -f "$R" ] && { ls -l "$R" | awk '{print "riferimento:", $1, $5, $6, $7, $8}'; cmp -s "$C" "$R" && echo "CRED: IDENTICO al riferimento" || echo "CRED: DIVERSO dal riferimento (STOP)"; } || echo "riferimento assente"
echo "== processi rilevanti"; ps -eo pid,lstart,args --no-headers | grep -E '(^| )claude|bun |bwrap|warren|node ' | grep -v grep | cut -c1-160 || true
echo "== porte in ascolto"; ss -ltn 2>/dev/null | tail -n +2
echo "== copie credenziali (escluso originale e riferimento)"
find /home/dibbi -name '.credentials.json*' -not -path "$C" 2>/dev/null
echo "== RAM"; free -m | sed -n 2p
