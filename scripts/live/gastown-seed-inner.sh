#!/usr/bin/env bash
# DENTRO bwrap (senza creds): precrea ~/.claude.json della HOME sandbox: onboarding completato, tema, fiducia per i worktree
# dei polecat (percorso ESATTO, nomi del pool "minerals") e per mayor/rig. Nessuna credenziale.
export HOME=/home/sandbox
cd "$HOME"
[ -f .claude.json ] || echo '{}' > .claude.json
NAMES='obsidian quartz jasper onyx opal topaz garnet ruby amber jade'
jq --arg names "$NAMES" '. + {hasCompletedOnboarding:true, theme:"dark"}
 | .projects = ((.projects // {}) + ( ($names|split(" ")|map({key:("/home/sandbox/gt/seedapp/polecats/"+.+"/seedapp"), value:{hasTrustDialogAccepted:true,hasCompletedProjectOnboarding:true}})|from_entries) ))' .claude.json > .claude.json.new && mv .claude.json.new .claude.json
jq -c '.projects|keys|length' .claude.json
