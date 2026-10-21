#!/usr/bin/env bash
# Controlli dopo le run (nessun valore stampato): token OAuth/API in chiaro in stato/log di OpenClaw? RSS dei processi; porte; sessioni persistite.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP"; exit 3; }
echo "== file con prefisso sk-ant- (solo nomi) in stato OpenClaw, log e uscite"
grep -rIl "sk-ant-" "$HOME/oc-sbhome/.openclaw" "$HOME/oc-logs" "$HOME"/oc-turn-* "$HOME/oc-gateway.log" 2>/dev/null || echo "nessuno"
echo "== file binari (sqlite) con prefisso sk-ant-oat / accessToken"
grep -rlaE "sk-ant-oat|\"accessToken\"" "$HOME/oc-sbhome/.openclaw" "$HOME/oc-logs" 2>/dev/null || echo "nessuno"
echo "== credenziali: dove esistono ora (solo percorso)"; find "$HOME" -name .credentials.json 2>/dev/null
echo "== RSS (KB) processi del gateway e claude"; ps -eo pid,rss,args | grep -E "openclaw|claude|node " | grep -v grep | awk '{printf "%s %s ", $1, $2; for(i=3;i<=5&&i<=NF;i++) printf "%s ", $i; print ""}' | cut -c1-140
echo "== porte"; ss -ltnp 2>/dev/null | awk 'NR>1{print $4}' | sort -u | tr '\n' ' '; echo
echo "== disco stato"; du -sh "$HOME/oc-sbhome" "$HOME/oc-sbhome/.openclaw" "$HOME/oc-sbhome/.claude" 2>/dev/null
