#!/usr/bin/env bash
# Crea (da zero) il repository git BARE della fixture DIFFICILE (seed-app-hard) dentro Ubuntu-26.04.
# Ingresso: ~/seed-app-hard.tar (creato lato Windows: package.json, src/, test/, docs/). I test held-out
# (fixtures/acceptance-hard) e le soluzioni di riferimento restano SOLO lato Windows e non entrano mai qui.
# Uscita: $1 (default ~/fixtures/seed-app-hard.git), branch main, un solo commit baseline, autore tae-bot.
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
BARE="${1:-$HOME/fixtures/seed-app-hard.git}"
TAR="${SEED_TAR:-$HOME/seed-app-hard.tar}"
[ -f "$TAR" ] || { echo "STOP: manca $TAR"; exit 1; }
case "$BARE" in "$HOME"/*) ;; *) echo "STOP: percorso fuori da \$HOME: $BARE"; exit 1;; esac

WORK="$(mktemp -d "$HOME/.fixture-work.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
tar -xf "$TAR" -C "$WORK"
if grep -rlI $'\r' "$WORK" >/dev/null; then echo "STOP: trovati CR nei file"; exit 1; fi
for f in "$WORK"/*; do
  case "$(basename "$f")" in package.json|src|test|docs) ;; *) echo "STOP: voce inattesa $f"; exit 1;; esac
done
# Nessun riferimento ai test held-out ne' alle soluzioni di riferimento.
if grep -rqiE 'acceptance|reference-hard|acceptance-hard|mutants' "$WORK"; then echo "STOP: riferimenti a held-out/riferimento nella fixture"; exit 1; fi
if find "$WORK" -name '*.acceptance.test.js' | grep -q .; then echo "STOP: test held-out presenti"; exit 1; fi

# Modello fissato con le impostazioni di progetto (come nei lotti precedenti: Warren non passa --model a claude-code).
PIN_MODEL="${PIN_MODEL-claude-sonnet-5-5}"
if [ -n "$PIN_MODEL" ]; then
  mkdir -p "$WORK/.claude"
  printf '{\n  "model": "%s"\n}\n' "$PIN_MODEL" > "$WORK/.claude/settings.json"
fi

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=tae-bot GIT_AUTHOR_EMAIL=tae-bot@example.invalid
export GIT_COMMITTER_NAME=tae-bot GIT_COMMITTER_EMAIL=tae-bot@example.invalid
export GIT_AUTHOR_DATE="2026-01-01T00:00:00Z" GIT_COMMITTER_DATE="2026-01-01T00:00:00Z"
git -C "$WORK" init -q -b main
git -C "$WORK" add -A
git -C "$WORK" commit -q -m "baseline seed-app-hard"
rm -rf "$BARE"
mkdir -p "$(dirname "$BARE")"
git clone -q --bare "$WORK" "$BARE"
git --git-dir="$BARE" symbolic-ref HEAD refs/heads/main
echo "bare: $BARE"
echo "HEAD: $(git --git-dir="$BARE" rev-parse main)"
echo "file: $(git --git-dir="$BARE" ls-tree -r --name-only main | wc -l)"
git --git-dir="$BARE" ls-tree -r --name-only main | grep -E '^(docs|\.claude|package.json)' | tr '\n' ' '; echo
