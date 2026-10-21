#!/usr/bin/env bash
# DENTRO bwrap (con --creds): stato del login di Claude Code (solo campi non sensibili). Costo zero.
export HOME=/home/sandbox
claude auth status --json 2>&1 | jq -c '{loggedIn, authMethod, apiProvider, subscriptionType}' 2>&1 | head -3
