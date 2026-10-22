#!/usr/bin/env bash
# Pulizia sul forge: chiude SOLO le PR e cancella SOLO i branch elencati in ~/tae-github-created.txt (creati dalle prove),
# per nome esatto. Equivalente di `gh pr close --delete-branch` (gh non installato). Poi verifica main invariato.
# Uso: bash ~/live/warren-github-cleanup.sh <sha-main-atteso>
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP"; exit 3; }
EXP="${1:?sha main atteso}"
API() { bash "$HOME/live/warren-github-api.sh" "$@"; }
while read -r _ N _ B; do
  [[ "$N" =~ ^[0-9]+$ ]] && [[ "$B" =~ ^warren/run_[a-z0-9]+$ ]] || { echo "riga ignorata"; continue; }
  echo "PR $N: $(API PATCH "/pulls/$N" '{"state":"closed"}' | sed '$d' | jq -c '{state,merged}')"
  echo "branch $B: $(API DELETE "/git/refs/heads/$B" | tail -1)"
done < <(sed 's/^PR \([0-9]*\) branch \(.*\)$/PR \1 branch \2/' "$HOME/tae-github-created.txt" | awk '{print $1, $2, $3, $4}')
echo "== stato finale"
API GET "/pulls?state=all&per_page=100" | sed '$d' | jq -c '[.[]|{n:.number,state,merged:.merged_at,head:.head.ref}]'
API GET "/branches?per_page=100" | sed '$d' | jq -c '[.[].name]'
M="$(API GET /git/ref/heads/main | sed '$d' | jq -r .object.sha)"; echo "main=$M atteso=$EXP: $([ "$M" = "$EXP" ] && echo INVARIATO || echo DIVERSO)"
API GET "/commits?per_page=5" | sed '$d' | jq -r '.[]|.sha[0:7]+" "+.commit.message' | head -5
