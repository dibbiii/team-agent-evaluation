#!/usr/bin/env bash
# Prepara in Ubuntu-26.04 (solo sotto $HOME) la fixture per OpenClaw: bare repo (fixture-setup.sh), workspace git
# ~/oc-ws/<nome> al commit baseline, prompt ~/oc-prompt-<ISSUE>.txt (stesso di scripts/run-baseline.mjs), wrapper ~/bin/oc-sandboxed.
# Uso: bash ~/openclaw-setup.sh <nome-workspace> <ISSUE-N>
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
NAME="${1:?nome}"; ISSUE="${2:?ISSUE-N}"
[[ "$NAME" =~ ^[a-z0-9-]+$ ]] || { echo "nome non valido"; exit 2; }
mkdir -p "$HOME/bin" "$HOME/oc-ws" "$HOME/oc-logs" "$HOME/oc-sbhome/.claude" "$HOME/pc-npm-shim"
if [ ! -x "$HOME/pc-npm-shim/npm" ]; then
  printf '#!/bin/sh\nexec node /home/dibbi/pc-node/node_modules/npm/bin/npm-cli.js "$@"\n' > "$HOME/pc-npm-shim/npm"; chmod 755 "$HOME/pc-npm-shim/npm"
fi
cp "$HOME/openclaw-sandboxed.sh" "$HOME/bin/oc-sandboxed"; chmod 755 "$HOME/bin/oc-sandboxed"
cp "$HOME/openclaw-sandbox-check.sh" "$HOME/oc-sbhome/check.sh"
BARE="$HOME/oc-fixture/seed-app.git"
mkdir -p "$HOME/oc-fixture"
bash "$HOME/live/fixture-setup.sh" "$BARE" >/dev/null
rm -rf "$HOME/oc-ws/$NAME"
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null git clone -q "$BARE" "$HOME/oc-ws/$NAME"
echo "workspace: $HOME/oc-ws/$NAME  HEAD=$(git -C "$HOME/oc-ws/$NAME" rev-parse --short HEAD)  branch=$(git -C "$HOME/oc-ws/$NAME" branch --show-current)"
git -C "$HOME/oc-ws/$NAME" ls-files | tr '\n' ' '; echo
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
  "Al termine rispondi con un riassunto di 3 righe."' "$HOME/issue-catalog.json" > "$HOME/oc-prompt-$ISSUE.txt"
wc -c "$HOME/oc-prompt-$ISSUE.txt"
