#!/usr/bin/env bash
# Eseguito DENTRO la sandbox del wrapper (via claude-sandboxed --tae-check). Nessuna credenziale, nessun LLM.
echo "id: $(id -u):$(id -g) HOME=$HOME pwd=$(pwd) argv0=$0"
echo "env: $(env | cut -d= -f1 | sort | tr '\n' ' ')"
echo "resolv.conf: $(ls -l /etc/resolv.conf | awk '{print $1,$NF}')"
echo "== DNS"; getent hosts api.anthropic.com | head -1 || echo "DNS FALLITO"
echo "== HTTPS"; echo "api.anthropic.com HTTP: $(curl -sS -m 15 -o /dev/null -w '%{http_code}' https://api.anthropic.com/ 2>&1)"
echo "== visibilita' host"
for p in /home/dibbi/.claude /home/dibbi/.claude/.credentials.json /home/dibbi/warren /home/dibbi/fixtures /home/dibbi/pc-data /home/dibbi/pc-home /home/dibbi/decoy-secret.txt /home/dibbi/pc /home/dibbi/out /mnt/c; do
  if [ -e "$p" ]; then echo "VISIBILE: $p"; else echo "assente: $p"; fi
done
echo "ls /home/dibbi: $(ls -A /home/dibbi | tr '\n' ' ')"
echo "== esca fuori dal workspace"
cat /home/dibbi/decoy-secret.txt 2>&1 | head -1
echo "lettura esca: rc=$?"
echo x > /home/dibbi/tae-escape-a1.txt 2>&1 && echo "scrittura /home/dibbi/tae-escape-a1.txt: RIUSCITA (tmpfs effimero)" || echo "scrittura /home/dibbi: negata"
echo x > /etc/tae-x 2>&1 | head -1; echo x > /usr/tae-x 2>&1 | head -1
echo x > /home/dibbi/.local/bin/tae-x 2>&1 | head -1
echo x > "$(pwd)/tae-ws-write.txt" && echo "scrittura nel workspace: RIUSCITA" && rm -f "$(pwd)/tae-ws-write.txt"
echo x > "$(pwd)/../tae-ws-parent.txt" 2>&1 && echo "scrittura nella cartella padre del workspace: RIUSCITA (effimera?)" || echo "scrittura nel padre: negata"
echo "== strumenti"
node -v; echo "npm: $(npm -v)"; (cd "$(pwd)" && npm test 2>&1 | tail -8); /home/dibbi/.local/bin/claude --version
echo "== rete verso l'host"
(exec 3<>/dev/tcp/127.0.0.1/3100) 2>&1 && echo "127.0.0.1:3100 raggiungibile" || echo "127.0.0.1:3100 non raggiungibile"
echo "== processi in /proc: $(ls /proc | grep -c '^[0-9]')"
