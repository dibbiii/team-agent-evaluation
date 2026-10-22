#!/usr/bin/env bash
# Installa gli strumenti per le run LIVE dentro Ubuntu-26.04, come utente `dibbi` (NON root). Nessun login, nessuna
# credenziale, nessuna chiamata al modello. Ogni scaricamento e' verificato con SHA-256 quando il fornitore lo pubblica.
# Uso: wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/provision-user.sh <fase>
#   bun            Bun 1.3.14 (come .bun-version di Warren) da GitHub oven-sh/bun, SHA-256 da SHASUMS256.txt, in ~/.local/bin
#   warren         Warren al commit ce088e8 (docs/candidates/warren.md) in ~/warren, poi warren-setup.sh e ui:install
#   claude-fetch   scarica l'installer ufficiale in ~/claude-install.sh e stampa SHA-256 e righe: DA LEGGERE PER INTERO
#   claude-install esegue l'installer gia' letto (scarica il binario, ne verifica lo SHA-256 e lo installa; non fa login)
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
[ "$(id -u)" -ne 0 ] || { echo "STOP: non eseguire come root"; exit 2; }
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
BUN_VER="1.3.14"
WARREN_SHA="ce088e854c96492358b6f0a0e26695baf801968d"

do_bun() {
  local d; d="$(mktemp -d "$HOME/.bun-dl.XXXXXX")"; trap 'rm -rf "$d"' RETURN
  local base="https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VER}"
  cd "$d"
  curl -fsSL -4 -o bun-linux-x64.zip "$base/bun-linux-x64.zip"
  curl -fsSL -4 -o SHASUMS256.txt "$base/SHASUMS256.txt"
  grep ' bun-linux-x64.zip$' SHASUMS256.txt > check.txt
  cat check.txt
  sha256sum -c check.txt
  unzip -q bun-linux-x64.zip
  mkdir -p "$HOME/.local/bin"
  install -m 755 bun-linux-x64/bun "$HOME/.local/bin/bun"
  echo "bun: $("$HOME/.local/bin/bun" --version)"
}

do_warren() {
  if [ ! -d "$HOME/warren/.git" ]; then
    mkdir -p "$HOME/warren"; cd "$HOME/warren"
    git init -q
    git remote add origin https://github.com/jayminwest/warren.git
  fi
  cd "$HOME/warren"
  git fetch -q --depth 1 origin "$WARREN_SHA"
  git checkout -q --detach FETCH_HEAD
  echo "commit: $(git rev-parse HEAD)"
  [ "$(git rev-parse HEAD)" = "$WARREN_SHA" ] || { echo "STOP: commit diverso dal documentato"; exit 1; }
  git status --short | head -3
  cd "$HOME"
  bash "$HOME/live/warren-setup.sh"
  cd "$HOME/warren"
  echo "== bun run ui:install (passo mancante nella documentazione di Warren, vedi reports/live-warren-prep.md)"
  bun run ui:install 2>&1 | tail -3
  git status --short | head -3
}

claude_fetch() {
  curl -fsSL -4 -o "$HOME/claude-install.sh" https://claude.ai/install.sh
  echo "righe: $(wc -l < "$HOME/claude-install.sh")   sha256: $(sha256sum "$HOME/claude-install.sh" | cut -d' ' -f1)"
}

claude_install() {
  [ -f "$HOME/claude-install.sh" ] || { echo "STOP: esegui prima claude-fetch e leggi lo script"; exit 1; }
  bash "$HOME/claude-install.sh"
  echo "== versione (nessuna chiamata al modello):"; "$HOME/.local/bin/claude" --version
}

case "${1:-}" in
  bun) do_bun ;;
  warren) do_warren ;;
  claude-fetch) claude_fetch ;;
  claude-install) claude_install ;;
  *) echo "Uso: provision-user.sh bun|warren|claude-fetch|claude-install"; exit 2 ;;
esac
