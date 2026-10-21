#!/usr/bin/env bash
# Verifica quale modello usa Claude Code (a) senza impostazioni e (b) con .claude/settings.json di progetto che fissa il modello.
# Due chiamate minime (circa 0,01 USD ciascuna di stima). NON stampa credenziali. Eseguire come utente normale in Ubuntu-26.04.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
export PATH="$HOME/.local/bin:$PATH"
WANT="${1:-claude-sonnet-5-5}"
T="$(mktemp -d "$HOME/.modelcheck.XXXXXX")"; trap 'rm -rf "$T"' EXIT
probe() { # cartella -> stampa le chiavi di modelUsage e il costo
  ( cd "$1" && claude -p "Rispondi solo con la parola OK." --output-format json --no-session-persistence --tools "" --max-budget-usd 0.10 2>&1 ) \
    | jq -r '"modelli usati: " + ((.modelUsage // {}) | keys | join(",")) + "  costo stimato USD: " + ((.total_cost_usd // 0) | tostring) + "  errore: " + ((.is_error // false) | tostring)' 2>/dev/null \
    || echo "risposta non JSON"
}
mkdir -p "$T/senza" "$T/con/.claude"
printf '{\n  "model": "%s"\n}\n' "$WANT" > "$T/con/.claude/settings.json"
echo "(a) SENZA impostazioni di progetto:"; probe "$T/senza"
echo "(b) CON .claude/settings.json {\"model\": \"$WANT\"}:"; probe "$T/con"

# --- (c)/(d): stessa modalità di Warren (stream-json in ingresso e in uscita, --verbose), modello letto dall'evento "init" ---
probe_stream() {
  ( cd "$1" && printf '%s\n' '{"type":"user","message":{"role":"user","content":"Rispondi solo con la parola OK."}}' \
      | claude --print --input-format stream-json --output-format stream-json --verbose --no-session-persistence --max-budget-usd 0.10 2>&1 ) \
    | jq -rs '"init.model=" + (([.[]|select(.type=="system" and .subtype=="init")|.model][0]) // "?") + "  modelUsage=" + (([.[]|select(.type=="result")|.modelUsage // {}|keys|join(",")][0]) // "?") + "  costo=" + (([.[]|select(.type=="result")|.total_cost_usd][0] // 0)|tostring)' 2>/dev/null \
    || echo "risposta non interpretabile"
}
echo "(c) modalita' Warren, SENZA impostazioni:"; probe_stream "$T/senza"
echo "(d) modalita' Warren, CON .claude/settings.json:"; probe_stream "$T/con"

