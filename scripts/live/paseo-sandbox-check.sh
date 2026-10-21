#!/usr/bin/env bash
# Eseguito DENTRO la sandbox del wrapper (ps-sandboxed --tae-check). Nessuna credenziale, nessun LLM.
echo "id: $(id -u):$(id -g) HOME=$HOME pwd=$(pwd) argv0=$0"
echo "env: $(env | cut -d= -f1 | sort | tr '\n' ' ')"
echo "== DNS/HTTPS"; getent hosts api.anthropic.com | head -1 || echo "DNS FALLITO"
echo "api.anthropic.com HTTP: $(curl -sS -m 15 -o /dev/null -w '%{http_code}' https://api.anthropic.com/ 2>&1)"
echo "== visibilita' host"
for p in /home/dibbi/.claude /home/dibbi/.claude/.credentials.json /home/dibbi/warren /home/dibbi/fixtures /home/dibbi/ps-home /home/dibbi/ps-pass /home/dibbi/ps-hub-data /home/dibbi/decoy-secret.txt /home/dibbi/ps-src /home/dibbi/ps /home/dibbi/out /mnt/c; do
  if [ -e "$p" ]; then echo "VISIBILE: $p"; else echo "assente: $p"; fi
done
echo "ls /home/dibbi: $(ls -A /home/dibbi | tr '\n' ' ')"
echo "== esca fuori dal workspace"
cat /home/dibbi/decoy-secret.txt 2>&1 | head -1
echo x > /home/dibbi/tae-escape-ps.txt 2>&1 && echo "scrittura /home/dibbi/tae-escape-ps.txt: RIUSCITA (tmpfs effimero)" || echo "scrittura /home/dibbi: negata"
echo x > /etc/tae-x 2>&1 | head -1; echo x > /usr/tae-x 2>&1 | head -1
echo x > "$(pwd)/tae-ws-write.txt" && echo "scrittura nel workspace: RIUSCITA" && rm -f "$(pwd)/tae-ws-write.txt"
echo "== strumenti"
node -v; echo "npm: $(npm -v)"; (cd "$(pwd)" && npm test 2>&1 | tail -5); /home/dibbi/.local/bin/claude --version
echo "== rete verso l'host (porte del daemon e dell'Hub)"
for port in 6767 3000; do
  (exec 3<>/dev/tcp/127.0.0.1/$port) 2>/dev/null && echo "127.0.0.1:$port raggiungibile" || echo "127.0.0.1:$port non raggiungibile"
done
echo "daemon /api/health: $(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:6767/api/health 2>&1)"
echo "daemon /api/status senza credenziali: $(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:6767/api/status 2>&1)"
echo "hub /health: $(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/health 2>&1)"
echo "hub /api/v1/projects senza credenziali: $(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/v1/projects 2>&1)"
echo "== processi in /proc: $(ls /proc | grep -c '^[0-9]')"
# sonda di controllo del daemon (solo se esiste il client montato): password assente nell'ambiente della sandbox
if [ -f /home/dibbi/ps/paseo-probe.mjs ]; then echo "== sonda WS"; node /home/dibbi/ps/paseo-probe.mjs; fi
