#!/usr/bin/env bash
# Raccolta metriche dal Gateway (client dentro bwrap, sola lettura): costi/uso, sessioni, cron, heartbeat. Nessuna scrittura.
# Uso (dentro la sandbox): bash /home/sandbox/collect.sh
cd /home/dibbi/oc-ws/ws1 || exit 1
for m in usage.cost sessions.usage sessions.list cron.list; do
  echo "===== $m"; openclaw gateway call "$m" --json --timeout 30000 2>&1 | head -c ${MAXC:-3500}; echo
done
echo "===== system heartbeat last"; openclaw system heartbeat last 2>&1 | head -c 800; echo
echo "===== workspace git status"; GIT_CONFIG_GLOBAL=/dev/null git status --short; GIT_CONFIG_GLOBAL=/dev/null git log --oneline | head -3
