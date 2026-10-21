#!/usr/bin/env bash
# Sonda in sola lettura dell'ambiente di Ubuntu-26.04 (nessun segreto).
echo "distro=$WSL_DISTRO_NAME user=$(id -un)"
for c in node npm npx pnpm corepack git bwrap curl jq gcc g++ make python3 cargo bun claude tar; do printf '%s: ' $c; (command -v $c && $c --version 2>&1 | head -1) || echo assente; done
node -v; free -m | head -2; df -h $HOME | tail -1
ls -la ~ | head -40
ls ~/.local/bin ~/.local/share/claude 2>&1 | head
ls -ld ~/.claude; ls ~/.claude | head -20
