#!/usr/bin/env bash
# Prepara Warren (commit ce088e8) dentro la distribuzione dedicata Ubuntu-26.04. Eseguire come utente normale.
# Precondizioni (passi già fatti): Bun 1.3.14 in ~/.local/bin, repository in ~/warren al commit ce088e8.
# Nessun segreto, nessun login: installa solo le dipendenze.
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
cd "$HOME/warren"
echo "bun: $(command -v bun) $(bun --version)   commit: $(git rev-parse --short HEAD)"
echo "== bun install --frozen-lockfile"
bun install --frozen-lockfile 2>&1 | tail -3
echo "== bun run ext:install"
bun run ext:install 2>&1 | tail -3
echo "== CLI richiesti dall'harness (cn, sd, ml), versioni fissate come nel CI di Warren"
bun add -g @os-eco/canopy-cli @os-eco/seeds-cli@0.5.13 @os-eco/mulch-cli@0.10.7 2>&1 | tail -3
for t in cn sd ml; do
  command -v "$t" >/dev/null || { echo "ASSENTE: $t"; exit 1; }
  echo "ok: $t -> $(command -v "$t")"
done
echo "SETUP OK"
