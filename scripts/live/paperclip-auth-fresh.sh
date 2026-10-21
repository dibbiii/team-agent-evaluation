#!/usr/bin/env bash
# Crea una istanza NUOVA e vuota (~/pc-data-auth) gia' in modalita' authenticated/private/loopback, partendo dalla config
# della prima istanza (stessi segreti locali, percorsi riscritti). Ferma prima il server in corso: uno alla volta.
set -euo pipefail
S="$HOME/pc-data/instances/default"; D="$HOME/pc-data-auth/instances/default"
mkdir -p "$D/secrets"
cp "$S/.env" "$D/.env"; cp "$S/secrets/master.key" "$D/secrets/master.key"; chmod 600 "$D/.env" "$D/secrets/master.key"
sed "s#/pc-data/#/pc-data-auth/#g" "$S/config.json.local_trusted.bak" | jq '.server.deploymentMode="authenticated" | .server.exposure="private"' > "$D/config.json"
chmod 600 "$D/config.json"
jq '{server:.server, database:.database, storage:.storage, secrets:.secrets}' "$D/config.json" | head -40
