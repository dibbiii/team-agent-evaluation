#!/usr/bin/env bash
# Crea (da zero) il repository git BARE della fixture seed-app dentro Ubuntu-26.04.
# Ingresso: ~/seed-app.tar (creato dal lato Windows con il tar di Windows su fixtures/seed-app:
#   package.json, src/, test/). NIENTE test held-out (restano in fixtures/acceptance, lato Windows).
# Uscita: $1 (default ~/fixtures/seed-app.git), branch main, un solo commit baseline, autore tae-bot.
set -euo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
BARE="${1:-$HOME/fixtures/seed-app.git}"
TAR="${SEED_TAR:-$HOME/seed-app.tar}"
[ -f "$TAR" ] || { echo "STOP: manca $TAR"; exit 1; }
case "$BARE" in "$HOME"/*) ;; *) echo "STOP: percorso fuori da \$HOME: $BARE"; exit 1;; esac

WORK="$(mktemp -d "$HOME/.fixture-work.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
tar -xf "$TAR" -C "$WORK"
# Fine riga LF: nessun CR ammesso (il tar di Windows non converte, ma verifichiamo).
if grep -rlI $'\r' "$WORK" >/dev/null; then echo "STOP: trovati CR nei file"; exit 1; fi
# Niente test held-out: la fixture deve contenere solo package.json, src/, test/.
for f in "$WORK"/*; do
  case "$(basename "$f")" in package.json|src|test) ;; *) echo "STOP: voce inattesa $f"; exit 1;; esac
done
if grep -rqi 'acceptance' "$WORK"; then echo "STOP: riferimenti ad acceptance nella fixture"; exit 1; fi

# Fissa il modello per la run LIVE. Warren NON passa --model a Claude Code (verificato nei sorgenti: l'argv del
# claude-code non lo contiene) e con una HOME pulita Claude Code sceglie da solo il modello; nella prima run LIVE
# l'evento init riportava claude-opus-5-5. Le impostazioni di progetto fanno parte del repository baseline.
# PIN_MODEL vuoto = nessuna fissazione.
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
git -C "$WORK" commit -q -m "baseline seed-app"
rm -rf "$BARE"
mkdir -p "$(dirname "$BARE")"
git clone -q --bare "$WORK" "$BARE"
git --git-dir="$BARE" symbolic-ref HEAD refs/heads/main
echo "bare: $BARE"
echo "HEAD: $(git --git-dir="$BARE" rev-parse main)"
git --git-dir="$BARE" ls-tree -r --name-only main
