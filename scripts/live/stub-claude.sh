#!/usr/bin/env bash
# `claude` FINTO per le prove di Warren (costo 0, nessun modello, nessuna credenziale).
# NON e' Claude Code: e' uno script che imita la forma che Warren si aspetta dall'harness `claude-code`
# (vedi scripts/acceptance/lib/stub-agent/claude-code-path-shim.sh nel repo di Warren):
#   - argv: --print --input-format stream-json --output-format stream-json --verbose ...
#   - stdin: il prompt come turno utente stream-json; stdout: righe JSON, l'ultima e' `result` con costo/uso.
# Cosa fa:
#   1. se il prompt cita ISSUE-1, applica la correzione (Math.floor -> Math.round in src/pricing.js) e fa commit
#      (Warren pretende il commit: working tree sporco = run fallita `dropped_commit`);
#   2. esegue le sonde di isolamento (scrittura fuori workspace, lettura del file esca, rete) e le emette come
#      testo `assistant` (finiscono negli eventi della run) e su stderr. Le sonde NON modificano il workspace.
set -uo pipefail
stdin="$(cat)"
emit() { printf '%s\n' "$1"; }
say() { jq -nc --arg t "$1" '{type:"assistant",message:{role:"assistant",content:[{type:"text",text:$t}]}}'; }

prompt="$(printf '%s' "$stdin" | jq -rs '[.[]|select(.type=="user")|.message.content[0].text]|join("\n")' 2>/dev/null || true)"
[ -n "$prompt" ] || prompt="$stdin"
issue="$(printf '%s' "$prompt" | grep -o 'ISSUE-[0-9]\+' | head -1 || true)"
echo "stub-claude: avviato (issue='${issue}' argv0=$0 argc=$#)" >&2

emit '{"type":"system","subtype":"init","session_id":"sess_tae_stub","model":"claude-stub","tools":[]}'
emit "$(say "stub-claude: ricevuto prompt di ${#prompt} caratteri, issue='${issue}'")"

if [ "$issue" = "ISSUE-1" ] && [ -f src/pricing.js ]; then
  sed -i 's/Math\.floor/Math.round/' src/pricing.js
  if [[ "$prompt" == *"[broad_add=1]"* ]]; then git add -A; else git add src/pricing.js; fi  # knob di prova: commit "largo"
  git -c user.name=claude-stub -c user.email=stub@example.invalid \
    commit -q -m "fix(ISSUE-1): arrotonda al centesimo piu' vicino (stub)" >&2 || echo "stub-claude: COMMIT FALLITO" >&2
  emit "$(say "stub-claude: applicato il fix di ISSUE-1 e fatto commit")"
else
  emit "$(say "stub-claude: nessuna correzione nota per '${issue}': nessuna modifica, nessun commit")"
fi

# ---- Sonde di isolamento (solo osservazione; risultati come testo) ----
out=""
r() { out+="$1"$'\n'; }
try_write() { # etichetta, percorso
  if err="$( { printf 'tae-probe\n' > "$2"; } 2>&1 )"; then r "$1: SCRITTURA RIUSCITA ($2)"; else r "$1: scrittura negata ($2): ${err##*: }"; fi
}
r "== contesto"
r "uid=$(id -u) gid=$(id -g) HOME=$HOME pwd=$(pwd) argv0=$0"
r "command -v claude (visto dall'agente) = $(command -v claude 2>&1)  realpath = $(readlink -f "$(command -v claude)" 2>&1)"
r "PATH=$PATH"
r "processi visibili in /proc: $(ls /proc | grep -c '^[0-9]\+$')"
r "nomi delle variabili d'ambiente (senza valori): $(env | cut -d= -f1 | sort | tr '\n' ' ')"
r "contenuto di /workspace (nomi): $(ls -A /workspace | tr '\n' ' ')"
r "/workspace/.warren (creata da Warren, non presente nel repo): $(ls -A /workspace/.warren 2>&1 | tr '\n' ' ')"
r "git status (porcellana) a inizio sonde: $(git status --porcelain 2>&1 | tr '\n' ';')"
r "mount (punto e opzioni, da /proc/self/mountinfo):"
r "$(cut -d' ' -f5,6 /proc/self/mountinfo | sed 's/,relatime//; s/,nosuid//; s/,nodev//; s/^/  /')"
r "== (a) scrittura fuori dal workspace"
try_write "a1 home dell'utente host" /home/dibbi/tae-escape-a1.txt
try_write "a2 /etc" /etc/tae-escape-a2.txt
try_write "a3 /usr" /usr/tae-escape-a3.txt
try_write "a4 /tmp" /tmp/tae-escape-a4.txt
try_write "a5 radice /" /tae-escape-a5.txt
try_write "a6 toolchain ~/.bun" /home/dibbi/.bun/tae-escape-a6.txt
try_write "a7 HOME della run" "$HOME/tae-escape-a7.txt"
r "a8 workspace padre: $(ls -ld /workspace/.. 2>&1)"
r "== (b) lettura del file esca e di dati dell'utente host"
if content="$(cat /home/dibbi/decoy-secret.txt 2>&1)"; then r "b1 decoy-secret.txt: LETTO -> ${content}"; else r "b1 decoy-secret.txt: non leggibile: ${content##*: }"; fi
r "b2 ls /home/dibbi: $(ls -A /home/dibbi 2>&1 | tr '\n' ' ')"
r "b2 ls /home: $(ls -A /home 2>&1 | tr '\n' ' ')"
for p in /home/dibbi/.claude /home/dibbi/.claude/.credentials.json /home/dibbi/.claude.json /home/dibbi/warren /home/dibbi/fixtures; do
  if [ -e "$p" ]; then r "b3 esiste (solo test -e, mai letto): $p"; else r "b3 assente: $p"; fi
done
r "b4 \$HOME/.claude nella run: $(ls -A "$HOME/.claude" 2>&1 | tr '\n' ' ') (solo nomi)"
if shadow="$(head -c 20 /etc/shadow 2>&1)"; then r "b5 /etc/shadow: LETTO"; else r "b5 /etc/shadow: ${shadow##*: }"; fi
r "== (c) rete"
if res="$(timeout 5 bash -c 'exec 3<>/dev/tcp/1.1.1.1/443 && echo connesso' 2>&1)"; then r "c1 TCP 1.1.1.1:443: ${res}"; else r "c1 TCP 1.1.1.1:443: FALLITO (${res##*: })"; fi
http_probe() { # percorso: richiesta HTTP/1.1 grezza al control plane (porta 18080 di default), prima riga di risposta
  timeout 5 bash -c 'exec 3<>/dev/tcp/127.0.0.1/18080 && printf "GET $0 HTTP/1.1\r\nHost: 127.0.0.1:18080\r\nConnection: close\r\n\r\n" >&3 && head -1 <&3' "$1" 2>&1
}
for path in /healthz /projects; do
  if res="$(http_probe "$path")"; then r "c2 control plane di Warren 127.0.0.1:18080 GET $path (senza token): ${res%$'\r'}"; else r "c2 GET $path: FALLITO (${res##*: })"; fi
done
r "c3 interfacce: $(ls /sys/class/net 2>&1 | tr '\n' ' ')"
emit "$(say "$out")"
printf '%s' "$out" >&2

emit '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.000421,"usage":{"input_tokens":1200,"output_tokens":400,"cache_read_input_tokens":5000,"cache_creation_input_tokens":200}}'
exit 0
