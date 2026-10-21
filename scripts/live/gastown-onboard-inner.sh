#!/usr/bin/env bash
# DENTRO bwrap (con --creds): prova a (quasi) costo zero che Claude Code interattivo parta dentro tmux con la HOME della
# sandbox pre-configurata (~/.claude.json con onboarding completato e tema), SENZA inviare alcun prompt (nessuna chiamata al
# modello da parte nostra). Cattura il pane, poi ferma il server tmux (socket per nome esatto).
set -uo pipefail
export HOME=/home/sandbox
cd "$HOME"
if [ ! -f "$HOME/.claude.json" ]; then
  printf '{}\n' > "$HOME/.claude.json"
fi
# unisce onboarding completato + tema (nessuna credenziale; il file puo' gia' contenere metadati dell'account scritti da claude)
jq '. + {hasCompletedOnboarding: true, theme: "dark"} | .projects = ((.projects // {}) + {"/home/sandbox/gt": ((.projects["/home/sandbox/gt"] // {}) + {hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true})})' "$HOME/.claude.json" > "$HOME/.claude.json.new" && mv "$HOME/.claude.json.new" "$HOME/.claude.json"
echo "~/.claude.json: onboarding+tema+fiducia nella cartella del town (/home/sandbox/gt) impostati"
W="$HOME/gt/seedapp/mayor/rig"
[ -d "$W" ] || { echo "STOP: manca $W"; exit 1; }
SOCK=gt-onboardtest
tmux -L $SOCK new-session -d -x 200 -y 50 -s onboard -c "$W" "claude --dangerously-skip-permissions --settings /home/sandbox/gt/seedapp/polecats/.claude/settings.json --model claude-sonnet-5-5"
sleep 5
if [ "${1:-0}" = keys ]; then tmux -L $SOCK send-keys -t onboard Down Enter; echo "(inviati Down+Enter per accettare la fiducia)"; fi
for i in 1 2 3 4 5 6; do sleep 4; echo "### t+$((i*4))s"; tmux -L $SOCK capture-pane -p -t onboard -S -40 | grep -v '^$' | tail -25; done
tmux -L $SOCK kill-server
sleep 1
ps -eo pid,args --no-headers | grep -E 'claude|tmux' | grep -v grep || echo "nessun claude/tmux residuo"
echo "== projects in ~/.claude.json (chiavi e flag di fiducia)"; jq -c ".projects // {} | to_entries[] | {k:.key, trust:.value.hasTrustDialogAccepted, keys:(.value|keys)}" "$HOME/.claude.json" 2>/dev/null | head -5
