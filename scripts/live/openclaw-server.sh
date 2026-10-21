#!/usr/bin/env bash
# Avvia/ferma il Gateway OpenClaw DENTRO bwrap (oc-sandboxed). Uso: openclaw-server.sh start [--creds]|stop|status
# setsid: un server lanciato con nohup dentro wsl.exe muore alla chiusura della sessione. Solo loopback (bind della config).
# Stop: solo PID+starttime avviati qui e i processi della loro sessione (sid). Nessun pkill.
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
R="$HOME"; ACT="${1:?start|stop|status}"; PIDF="$R/oc-gateway.pid"; LOGF="$R/oc-gateway.log"
case "$ACT" in
start)
  CRARG=(); [ "${2:-}" = "--creds" ] && CRARG=(--creds)
  [ -f "$PIDF" ] && { echo "gia' avviato? $(cat "$PIDF")"; exit 1; }
  setsid nohup bash "$R/bin/oc-sandboxed" "${CRARG[@]}" --ws ws1 -- openclaw gateway run </dev/null > "$LOGF" 2>&1 &
  P=$!; echo "$P $(awk '{print $22}' /proc/$P/stat)" > "$PIDF"; echo "avviato wrapper pid=$P creds=${#CRARG[@]}"
  for i in $(seq 1 120); do
    if curl -fsS -m 2 http://127.0.0.1:18789/readyz >/dev/null 2>&1; then echo "readyz OK dopo ~$i s"; exit 0; fi
    kill -0 "$P" 2>/dev/null || { echo "terminato"; tail -30 "$LOGF"; rm -f "$PIDF"; exit 1; }
    sleep 1
  done; echo "timeout"; tail -20 "$LOGF"; exit 1;;
stop)
  [ -f "$PIDF" ] || { echo "nessun pid"; exit 0; }
  read -r P ST < "$PIDF"
  if [ "$(awk '{print $22}' /proc/$P/stat 2>/dev/null)" = "$ST" ]; then
    kill -TERM "$P"; for i in $(seq 1 150); do kill -0 "$P" 2>/dev/null || break; sleep 0.2; done
    if kill -0 "$P" 2>/dev/null; then echo "ancora vivo dopo 30 s: SIGKILL (solo il mio pid)"; kill -KILL "$P"; fi
    echo "fermato pid=$P"
  else echo "pid $P non corrisponde (starttime): non lo tocco"; fi
  for q in $(ps -eo pid=,sid= | awk -v s="$P" '$2==s{print $1}'); do echo "residuo nella sessione: $q $(ps -o args= -p "$q" | cut -c1-100)"; kill -TERM "$q" 2>/dev/null; done
  sleep 1
  for q in $(ps -eo pid=,sid= | awk -v s="$P" '$2==s{print $1}'); do echo "residuo ostinato: $q"; kill -KILL "$q" 2>/dev/null; done
  rm -f "$PIDF";;
status)
  [ -f "$PIDF" ] && cat "$PIDF"
  ps -eo pid,ppid,sid,rss,args | grep -E "node|claude|bwrap|openclaw" | grep -v grep | cut -c1-190
  ss -ltn | awk 'NR>1{print $4}' | sort -u | tr '\n' ' '; echo
  find /home/dibbi -name .credentials.json -not -path /home/dibbi/.claude/.credentials.json 2>/dev/null;;
esac
