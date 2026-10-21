#!/usr/bin/env bash
# Avvia/ferma daemon Paseo 0.12.0 (npm, Node di sistema 22) e Hub v0.10.0 (dal sorgente) in Ubuntu-26.04.
# Uso: paseo-server.sh daemon|hub start|stop|status   (DAEMON_NOPASS=1 avvia il daemon SENZA password, solo per la sonda)
# Solo loopback. HOME fittizio (~/ps-fake-home): i processi del server non vedono ~/.claude. PATH senza `claude`.
# setsid: un server lanciato con nohup dentro wsl.exe muore alla chiusura della sessione. Stop: solo PID+starttime avviati
# qui e i processi della loro sessione (sid).
set -uo pipefail
[ "${WSL_DISTRO_NAME:-}" = "Ubuntu-26.04" ] || { echo "STOP: non sei in Ubuntu-26.04"; exit 3; }
R="$HOME"; WHAT="${1:?daemon|hub}"; ACT="${2:?start|stop|status}"
PIDF="$R/ps-$WHAT.pid"; LOGF="$R/ps-$WHAT.log"
BASEPATH="/usr/local/bin:/usr/bin:/bin"
case "$ACT" in
start)
  [ -f "$PIDF" ] && { echo "gia' avviato? $(cat "$PIDF")"; exit 1; }
  mkdir -p "$R/ps-fake-home"
  if [ "$WHAT" = daemon ]; then
    PW=(); [ "${DAEMON_NOPASS:-0}" = 1 ] || PW=("PASEO_PASSWORD=$(cat "$R/ps-pass")")
    setsid nohup env -i HOME="$R/ps-fake-home" PATH="$BASEPATH" LANG=C.UTF-8 PASEO_HOME="$R/ps-home" "${PW[@]}" \
      node "$R/ps/node_modules/@getpaseo/cli/bin/paseo" daemon run </dev/null > "$LOGF" 2>&1 &
    URL=http://127.0.0.1:6767/api/health
  else
    cd "$R/ps-src/hub" || exit 1
    PWH="$(cat "$R/ps-pass")"
    setsid nohup env -i HOME="$R/ps-fake-home" PATH="$BASEPATH" LANG=C.UTF-8 PORT=3000 PASEO_HUB_BIND=127.0.0.1 \
      PASEO_HUB_APP_URL=http://localhost:3000 PASEO_HUB_DATA_DIR="$R/ps-hub-data" \
      PASEO_BOOTSTRAP_ORGANIZATION="TAE Org" PASEO_BOOTSTRAP_OWNER_EMAIL=owner@tae.invalid PASEO_BOOTSTRAP_OWNER_PASSWORD="$PWH-Aa1" \
      node dist/index.js </dev/null > "$LOGF" 2>&1 &
    URL=http://127.0.0.1:3000/health
  fi
  P=$!; echo "$P $(awk '{print $22}' /proc/$P/stat)" > "$PIDF"; echo "avviato pid=$P"
  for i in $(seq 1 90); do
    if curl -fsS -m 2 "$URL" >/dev/null 2>&1; then echo "$WHAT health OK dopo ~$i s"; exit 0; fi
    kill -0 "$P" 2>/dev/null || { echo "terminato"; tail -30 "$LOGF"; rm -f "$PIDF"; exit 1; }
    sleep 1
  done; echo "timeout"; tail -20 "$LOGF"; exit 1;;
stop)
  [ -f "$PIDF" ] || { echo "nessun pid"; exit 0; }
  read -r P ST < "$PIDF"
  if [ "$(awk '{print $22}' /proc/$P/stat 2>/dev/null)" = "$ST" ]; then
    kill -TERM "$P"; for i in $(seq 1 100); do kill -0 "$P" 2>/dev/null || break; sleep 0.2; done
    if kill -0 "$P" 2>/dev/null; then echo "ancora vivo dopo 20 s: SIGKILL (solo il mio pid)"; kill -KILL "$P"; fi
    echo "fermato pid=$P"
  else echo "pid $P non corrisponde (starttime): non lo tocco"; fi
  # eventuali residui nella sessione (sid = pid del leader) avviata qui
  for q in $(ps -eo pid=,sid= | awk -v s="$P" '$2==s{print $1}'); do echo "residuo nella sessione: $q $(ps -o args= -p "$q" | cut -c1-100)"; kill -TERM "$q" 2>/dev/null; done
  sleep 1
  for q in $(ps -eo pid=,sid= | awk -v s="$P" '$2==s{print $1}'); do echo "residuo ostinato: $q"; kill -KILL "$q" 2>/dev/null; done
  rm -f "$PIDF";;
status)
  [ -f "$PIDF" ] && cat "$PIDF"
  ps -eo pid,ppid,sid,rss,args | grep -E "node|claude|bwrap" | grep -v grep | cut -c1-170;;
esac
