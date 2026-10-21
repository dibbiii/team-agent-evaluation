#!/usr/bin/env bash
# Avvia il control plane di Warren (runtime "local" con bwrap REALE) con un token fittizio, verifica /readyz e doctor,
# poi ferma SOLO il processo avviato qui. Nessuna credenziale, nessun LLM. Eseguire come utente normale in Ubuntu-26.04.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
DATA="$HOME/warren-data-bootcheck"
rm -rf "$DATA"; mkdir -p "$DATA"
export WARREN_API_TOKEN="tae-dummy-token" WARREN_DATA_DIR="$DATA" WARREN_BIND_HOST=127.0.0.1 WARREN_BIND_PORT=8080 WARREN_RUNTIME=local
cd "$HOME/warren"
bun src/cli/main.ts serve > "$DATA/serve.log" 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null' EXIT
t0=$(date +%s.%N)
for _ in $(seq 1 200); do
  curl -fsS -m 1 http://127.0.0.1:8080/healthz >/dev/null 2>&1 && break
  sleep 0.1
done
t1=$(date +%s.%N)
printf 'healthz pronto in %.1f s\n' "$(echo "$t1 - $t0" | bc -l 2>/dev/null || echo 0)"
echo "== GET /readyz (con token):"
code=$(curl -s -m 5 -o "$DATA/readyz.json" -w '%{http_code}' -H "Authorization: Bearer $WARREN_API_TOKEN" http://127.0.0.1:8080/readyz)
echo "HTTP $code"; cat "$DATA/readyz.json"; echo
echo "== warren doctor:"
WARREN_BASE_URL=http://127.0.0.1:8080 HOME="$DATA/cli-home" bun src/cli/main.ts doctor 2>&1 | tail -8
echo "== memoria del server (VmRSS kB): $(grep VmRSS /proc/$PID/status 2>/dev/null)"
echo "== log di avvio (ultime righe, token e segreti non attesi):"
tail -n 4 "$DATA/serve.log" | cut -c1-220
