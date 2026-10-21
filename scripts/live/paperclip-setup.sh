#!/usr/bin/env bash
# Prepara in Ubuntu-26.04 (solo sotto $HOME): wrapper ~/bin/claude-sandboxed, fixture (bare), workspace git ~/pc-ws/<nome>
# e prompt dell'issue. Uso: bash ~/paperclip-setup.sh <nome-workspace> <ISSUE-N>
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
NAME="${1:?nome}"; ISSUE="${2:?ISSUE-N}"
[[ "$NAME" =~ ^[a-z0-9-]+$ ]] || { echo "nome non valido"; exit 2; }
mkdir -p "$HOME/bin" "$HOME/pc-ws" "$HOME/pc-npm-shim"
cat > "$HOME/pc-npm-shim/npm" <<'SHIM'
#!/bin/sh
exec node /home/dibbi/pc-node/node_modules/npm/bin/npm-cli.js "$@"
SHIM
chmod 755 "$HOME/pc-npm-shim/npm"
cp "$HOME/paperclip-claude-sandboxed.sh" "$HOME/bin/claude-sandboxed"; chmod 755 "$HOME/bin/claude-sandboxed"
BARE="$HOME/pc-fixture/seed-app.git"
mkdir -p "$HOME/pc-fixture"
bash "$HOME/live/fixture-setup.sh" "$BARE" >/dev/null
rm -rf "$HOME/pc-ws/$NAME"
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null git clone -q "$BARE" "$HOME/pc-ws/$NAME"
echo "workspace: $HOME/pc-ws/$NAME  HEAD=$(git -C "$HOME/pc-ws/$NAME" rev-parse --short HEAD)  branch=$(git -C "$HOME/pc-ws/$NAME" branch --show-current)"
git -C "$HOME/pc-ws/$NAME" ls-files | tr '\n' ' '; echo
jq -r --arg k "$ISSUE" '.[]|select(.key==$k)|
  "Sei uno sviluppatore. Lavora nella cartella corrente (una piccola libreria Node senza dipendenze, prezzi in centesimi).",
  "Issue \(.key) (\(.type), priorità \(.priority)): \(.summary)",
  "",
  .description,
  "",
  "Criteri di accettazione:",
  (.acceptance[] | "- " + .),
  "",
  "Implementa la modifica, aggiungi o aggiorna i test in test/ e verifica con \"npm test\". Non cambiare l'"'"'interfaccia pubblica oltre quanto richiesto.",
  "Al termine rispondi con un riassunto di 3 righe."' "$HOME/issue-catalog.json" > "$HOME/pc-prompt-$ISSUE.txt"
wc -c "$HOME/pc-prompt-$ISSUE.txt"
