#!/usr/bin/env bash
# `claude` FINTO per la prova di Warren con forge GitHub reale (costo 0, nessun modello, nessuna credenziale).
# NON e' Claude Code. Imita la forma che Warren si aspetta da `claude-code` (stream-json in/out, ultima riga `result`).
# Variante scelta dal marcatore nel prompt: [variant=narrow] (default) | [variant=broad] | [variant=break]
#   narrow: modifica src/util.js (una riga di commento) e committa SOLO quel file (come un agente ordinato);
#   broad : come narrow ma con `git add -A` (un agente sbrigativo): mostra se .claude/ finisce nel branch;
#   break : committa anche test/zz-stub-broken.test.js che FALLISCE (la CI deve diventare rossa).
# Il commit NON imposta alcuna identita' (-c user.*): l'autore dipende da cio' che Warren fornisce alla sandbox.
set -uo pipefail
stdin="$(cat)"
emit() { printf '%s\n' "$1"; }
say() { jq -nc --arg t "$1" '{type:"assistant",message:{role:"assistant",content:[{type:"text",text:$t}]}}'; }
prompt="$(printf '%s' "$stdin" | jq -rs '[.[]|select(.type=="user")|.message.content[0].text]|join("\n")' 2>/dev/null || true)"
[ -n "$prompt" ] || prompt="$stdin"
variant="$(printf '%s' "$prompt" | grep -o '\[variant=[a-z]*\]' | head -1 | sed 's/.*=//; s/\]//')"; variant="${variant:-narrow}"
emit '{"type":"system","subtype":"init","session_id":"sess_tae_stub","model":"claude-stub","tools":[]}'
emit "$(say "stub-claude-github: variante=$variant, prompt di ${#prompt} caratteri")"
echo "stub: variante=$variant" >&2
echo "// stub tae: modifica innocua di prova ($variant)" >> src/util.js
if [ "$variant" = break ]; then
  mkdir -p test
  cat > test/zz-stub-broken.test.js <<'T'
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('stub: test volutamente rotto', () => { assert.equal(1 + 1, 3); });
T
fi
{
  echo "identita git vista dallo stub: name='$(git config user.name 2>&1)' email='$(git config user.email 2>&1)' env: $(env | grep -E '^GIT_(AUTHOR|COMMITTER)_(NAME|EMAIL)=' | cut -d= -f1 | tr '\n' ' ')"
  echo "git status prima del commit: $(git status --porcelain | tr '\n' ';')"
} >&2
case "$variant" in
  broad|break) git add -A ;;
  *) git add src/util.js ;;
esac
if ! git commit -q -m "chore(stub): modifica di prova ($variant)" >&2; then
  echo "stub: COMMIT FALLITO senza identita'; riprovo con identita' esplicita del solo stub" >&2
  git -c user.name=claude-stub -c user.email=stub@example.invalid commit -q -m "chore(stub): modifica di prova ($variant) [identita' dello stub]" >&2 || echo "stub: COMMIT FALLITO" >&2
fi
emit "$(say "stub-claude-github: commit fatto ($variant)")"
emit '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.000421,"usage":{"input_tokens":1200,"output_tokens":400,"cache_read_input_tokens":5000,"cache_creation_input_tokens":200}}'
exit 0
