#!/usr/bin/env bash
# Installa in Ubuntu-26.04 (solo sotto $HOME) Node 24 (pacchetto npm "node", come il Node 24.22.0 di S00) e la release
# npm paperclipai@2026.1012.0. Gli script di installazione NON vengono eseguiti (--ignore-scripts): si lancia a mano
# solo quello indispensabile (hydrate-symlinks di embedded-postgres), dopo averlo letto.
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
mkdir -p "$HOME/pc-node" "$HOME/pc"
cd "$HOME/pc-node"
[ -f package.json ] || echo '{"name":"pc-node","private":true}' > package.json
npm install --no-audit --no-fund --no-save node@24.22.0 npm@11.19.1 2>&1 | tail -5
NODE24="$HOME/pc-node/node_modules/node/bin/node"
ls -l "$NODE24" || true
"$NODE24" -v
cd "$HOME/pc"
[ -f package.json ] || echo '{"name":"pc","private":true}' > package.json
"$NODE24" "$HOME/pc-node/node_modules/npm/bin/npm-cli.js" install --ignore-scripts --no-audit --no-fund paperclipai@2026.1012.0 2>&1 | tail -8
echo "== versione:"; jq -r .version node_modules/paperclipai/package.json
echo "== script di installazione presenti:"
for p in node_modules/*/package.json node_modules/@*/*/package.json; do
  jq -r 'select(.scripts.preinstall or .scripts.install or .scripts.postinstall)|"\(.name) pre=\(.scripts.preinstall//"-") inst=\(.scripts.install//"-") post=\(.scripts.postinstall//"-")"' "$p" 2>/dev/null
done
du -sh node_modules | tail -1
