#!/usr/bin/env bash
# Pulizia finale del lotto Warren sulla fixture difficile, dentro Ubuntu-26.04. Tocca SOLO (nomi esatti sotto $HOME):
# ~/.tae-cred-ref (copia di riferimento, SOLO con l'argomento "final"), ~/hard-prompts, ~/seed-app-hard.tar,
# ~/fixtures/seed-app-hard.git, ~/out, ~/live-runs/2026*, ~/live/warren-hard-*.sh. Poi VERIFICA e stampa lo stato
# (credenziali: solo ls -l, MAI contenuto). Uso: bash ~/warren-hard-cleanup.sh [final]
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
C="$HOME/.claude/.credentials.json"; R="$HOME/.tae-cred-ref"
if [ "${1:-}" = final ]; then
  [ -f "$R" ] && { cmp -s "$C" "$R" && echo "CRED finale: IDENTICO al riferimento" || echo "CRED finale: DIVERSO (riportare)"; }
  rm -f "$R"
  rm -rf "$HOME/hard-prompts" "$HOME/seed-app-hard.tar" "$HOME/fixtures/seed-app-hard.git" "$HOME/out"
  rm -f "$HOME/live/warren-hard-run.sh" "$HOME/live/warren-hard-fixture-setup.sh"
  for d in "$HOME"/live-runs/2026*; do [ -d "$d" ] && rm -rf "$d"; done
fi
echo "riferimento presente: $([ -e "$R" ] && echo SI || echo no)"
echo "== copie di credenziali (escluso l'originale) e file .tae-cred*:"
find "$HOME" -name '.credentials.json*' -not -path "$C" 2>/dev/null
find "$HOME" -maxdepth 2 -name '.tae-cred*' 2>/dev/null
echo "== residui di prova:"
ls -d "$HOME"/hard-prompts "$HOME"/seed-app-hard.tar "$HOME"/fixtures/seed-app-hard.git "$HOME"/out "$HOME"/.export.* "$HOME"/.fixture-work.* "$HOME"/live/warren-hard-* 2>/dev/null
ls "$HOME/live-runs" "$HOME/fixtures" 2>/dev/null | sed 's/^/  /'
echo "== processi (claude, bun, bwrap, warren, python3):"
ps -eo pid,lstart,args --no-headers | awk '$0 ~ /claude|bun |bwrap|warren|python3/ && $0 !~ /awk/' | cut -c1-120
echo "== porte in ascolto:"; ss -ltn | tail -n +2
echo "originale: $(ls -l "$C" | awk '{print $1, $5, $6, $7, $8}')"
