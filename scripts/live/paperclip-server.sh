#!/usr/bin/env bash
# Avvia/ferma il server Paperclip (release npm 2026.1012.0, Node 24 locale) in Ubuntu-26.04. Uso: paperclip-server.sh start|stop|status
# Solo loopback. HOME fittizio (~/pc-home): il server non vede ~/.claude. PATH senza `claude`: nessun claude non confinato
# raggiungibile dal server. Telemetria e controllo aggiornamenti spenti. Dati in ~/pc-data.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
R="$HOME"; PIDF="$R/pc-server.pid"; LOGF="$R/pc-server.log"
case "${1:-}" in
start)
  [ -f "$PIDF" ] && { echo "gia' avviato? $(cat "$PIDF")"; exit 1; }
  mkdir -p "$R/pc-home" "$R/${PC_DATA:-pc-data}"
  cd "$R/pc" || exit 1
  if [ -f "$R/${PC_DATA:-pc-data}/instances/default/config.json" ]; then SUB=(run -d "$R/${PC_DATA:-pc-data}"); else SUB=(onboard --yes --no-install-service -d "$R/${PC_DATA:-pc-data}"); fi
  setsid nohup env -i HOME="$R/pc-home" PATH="$R/pc-node/node_modules/node/bin:/usr/local/bin:/usr/bin:/bin" LANG=C.UTF-8 \
    PAPERCLIP_TELEMETRY_DISABLED=1 PAPERCLIP_UPDATE_CHECK=0 \
    "$R/pc-node/node_modules/node/bin/node" node_modules/paperclipai/dist/index.js "${SUB[@]}" </dev/null > "$LOGF" 2>&1 &
  P=$!; echo "$P $(awk '{print $22}' /proc/$P/stat)" > "$PIDF"; echo "avviato pid=$P"
  for i in $(seq 1 120); do
    if curl -fsS -m 2 http://127.0.0.1:3100/api/health >/dev/null 2>&1; then echo "health OK dopo ~$((i*2)) s"; exit 0; fi
    kill -0 "$P" 2>/dev/null || { echo "server terminato"; tail -30 "$LOGF"; rm -f "$PIDF"; exit 1; }
    sleep 2
  done; echo "timeout"; tail -20 "$LOGF"; exit 1;;
stop)
  [ -f "$PIDF" ] || { echo "nessun pid"; exit 0; }
  read -r P ST < "$PIDF"
  if [ "$(awk '{print $22}' /proc/$P/stat 2>/dev/null)" = "$ST" ]; then
    kill -TERM "$P"; for i in $(seq 1 100); do kill -0 "$P" 2>/dev/null || break; sleep 0.2; done
    kill -0 "$P" 2>/dev/null && { echo "ancora vivo: SIGKILL"; kill -KILL "$P"; }
    echo "fermato pid=$P"
  else echo "pid $P non corrisponde (starttime): non lo tocco"; fi
  rm -f "$PIDF";;
status)
  [ -f "$PIDF" ] && cat "$PIDF"; curl -fsS -m 3 http://127.0.0.1:3100/api/health; echo
  ps -eo pid,ppid,rss,args | grep -E 'node|postgres' | grep -v grep | cut -c1-170;;
esac
