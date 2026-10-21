#!/usr/bin/env bash
# Host WSL (fuori da bwrap; solo jq/cp): genera il prompt di ISSUE-N (identico a scripts/run-baseline.mjs, come
# openclaw-setup.sh) in ~/gt-sbhome/prompt-ISSUE-N.txt. Nessun test held-out.
# Uso: bash ~/gastown-prep.sh ISSUE-1
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
ISSUE="${1:?ISSUE-N}"
jq -r --arg k "$ISSUE" '.[]|select(.key==$k)|
  "Sei uno sviluppatore. Lavora nella cartella corrente (una piccola libreria Node senza dipendenze, prezzi in centesimi).",
  "Issue \(.key) (\(.type), priorità \(.priority)): \(.summary)",
  "",
  .description,
  "",
  "Criteri di accettazione:",
  (.acceptance[] | "- " + .),
  "",
  "Implementa la modifica, aggiungi o aggiorna i test in test/ e verifica con \"npm test\". Non cambiare l'\''interfaccia pubblica oltre quanto richiesto.",
  "Al termine rispondi con un riassunto di 3 righe."' "$HOME/issue-catalog.json" > "$HOME/gt-sbhome/prompt-$ISSUE.txt"
wc -c "$HOME/gt-sbhome/prompt-$ISSUE.txt"
cat "$HOME/gt-sbhome/prompt-$ISSUE.txt"
