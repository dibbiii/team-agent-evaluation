#!/usr/bin/env bash
# DENTRO bwrap (senza creds): WORKAROUND dichiarato per la run2. Nella run1 `gt done` e' stato bloccato ("uncommitted changes would be
# lost") dai file di Gas Town non tracciati nel worktree del polecat (.beads/redirect, .runtime/, .claude/commands/, CLAUDE.md).
# Li aggiungo a .repo.git/info/exclude (condiviso da tutti i worktree del rig) per vedere il resto del flusso (push, MR, identita').
export HOME=/home/sandbox
E="$HOME/gt/seedapp/.repo.git/info/exclude"
mkdir -p "$(dirname "$E")"
printf '\n# tae workaround run2\n.beads/\n.runtime/\n.claude/commands/\nCLAUDE.md\nAGENTS.md\n' >> "$E"
tail -7 "$E"
