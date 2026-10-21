#!/usr/bin/env bash
export PATH="$HOME/pc-node/node_modules/node/bin:$PATH"
export PAPERCLIP_TELEMETRY_DISABLED=1
cd "$HOME/pc/node_modules/@embedded-postgres/linux-x64" && node scripts/hydrate-symlinks.js && echo hydrate-ok && ls -la native/lib | head -5
cd "$HOME/pc"
node node_modules/paperclipai/dist/index.js --help 2>&1 | head -40
node node_modules/paperclipai/dist/index.js run --help 2>&1 | head -30
