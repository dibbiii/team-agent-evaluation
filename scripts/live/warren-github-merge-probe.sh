#!/usr/bin/env bash
# Prova che la protezione del ramo rifiuta un merge senza revisione. Uso: bash ~/live/warren-github-merge-probe.sh <PR>
# SOLO se la PR e' bloccata dalla protezione (mergeable_state=blocked): con 'clean' NON tenta nulla (rischio di merge reale su main).
# Equivalente di `gh pr merge` (gh non e' installato nella distribuzione): PUT /pulls/<N>/merge con il token dell'agente.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP"; exit 3; }
N="${1:?PR}"; [[ "$N" =~ ^[0-9]+$ ]] || exit 2
grep -qx "PR $N branch .*" "$HOME/tae-github-created.txt" || { echo "STOP: la PR $N non e' tra quelle create da me"; exit 2; }
API() { bash "$HOME/live/warren-github-api.sh" "$@"; }
for i in 1 2 3 4 5 6; do ms="$(API GET "/pulls/$N" | sed '$d' | jq -r '.mergeable_state')"; [ "$ms" != unknown ] && break; sleep 3; done
echo "PR $N mergeable_state=$ms"
if [ "$ms" != blocked ]; then echo "STOP: stato '$ms' diverso da blocked: nessun tentativo di merge"; exit 1; fi
echo "tentativo di merge (squash) senza revisione:"
API PUT "/pulls/$N/merge" '{"merge_method":"squash"}' | jq -c '.' 2>/dev/null || true
echo "dopo: $(API GET "/pulls/$N" | sed '$d' | jq -c '{state,merged}')  main=$(API GET /git/ref/heads/main | sed '$d' | jq -r .object.sha)"
