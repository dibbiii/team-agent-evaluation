#!/usr/bin/env bash
# Prepara in Ubuntu-26.04 (solo sotto $HOME): wrapper ~/bin/ps-sandboxed, config del daemon Paseo (PASEO_HOME=~/ps-home),
# password casuale del daemon (~/ps-pass, 600, mai stampata), fixture (bare), workspace git ~/ps-ws/<nome> e prompt.
# Uso: bash ~/paseo-setup.sh <nome-workspace> <ISSUE-N>
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
NAME="${1:?nome}"; ISSUE="${2:?ISSUE-N}"
[[ "$NAME" =~ ^[a-z0-9-]+$ ]] || { echo "nome non valido"; exit 2; }
mkdir -p "$HOME/bin" "$HOME/ps-ws" "$HOME/pc-npm-shim" "$HOME/ps-home" "$HOME/ps-fake-home"
if [ ! -x "$HOME/pc-npm-shim/npm" ]; then
  printf '#!/bin/sh\nexec node /home/dibbi/pc-node/node_modules/npm/bin/npm-cli.js "$@"\n' > "$HOME/pc-npm-shim/npm"; chmod 755 "$HOME/pc-npm-shim/npm"
fi
cp "$HOME/paseo-claude-sandboxed.sh" "$HOME/bin/ps-sandboxed"; chmod 755 "$HOME/bin/ps-sandboxed"
if [ ! -f "$HOME/ps-pass" ]; then (umask 077; head -c 24 /dev/urandom | base64 | tr -d '/+=\n' > "$HOME/ps-pass"); fi
# config del daemon: loopback, relay spento, voce/dettatura spente (evita il download di ~814 MB di modelli), MCP del daemon
# acceso ma non iniettato negli agenti, provider claude = wrapper bwrap
cat > "$HOME/ps-home/config.json" <<'JSON'
{
  "version": 1,
  "daemon": { "listen": "127.0.0.1:6767", "relay": { "enabled": false }, "mcp": { "enabled": true, "injectIntoAgents": false } },
  "features": { "dictation": { "enabled": false }, "voiceMode": { "enabled": false } },
  "agents": { "providers": { "claude": { "command": ["/home/dibbi/bin/ps-sandboxed"] } } }
}
JSON
BARE="$HOME/ps-fixture/seed-app.git"
mkdir -p "$HOME/ps-fixture"
bash "$HOME/live/fixture-setup.sh" "$BARE" >/dev/null
rm -rf "$HOME/ps-ws/$NAME"
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null git clone -q "$BARE" "$HOME/ps-ws/$NAME"
echo "workspace: $HOME/ps-ws/$NAME  HEAD=$(git -C "$HOME/ps-ws/$NAME" rev-parse --short HEAD)  branch=$(git -C "$HOME/ps-ws/$NAME" branch --show-current)"
git -C "$HOME/ps-ws/$NAME" ls-files | tr '\n' ' '; echo
# stesso prompt di scripts/run-baseline.mjs (e di paperclip-setup.sh), nessun test held-out
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
  "Al termine rispondi con un riassunto di 3 righe."' "$HOME/issue-catalog.json" > "$HOME/ps-prompt-$ISSUE.txt"
wc -c "$HOME/ps-prompt-$ISSUE.txt"
