#!/usr/bin/env bash
# Disattiva la cadenza ricorrente dell'heartbeat (agents.defaults.heartbeat.every = "0m") via WS RPC config.patch, per non far
# spendere altri turni automatici durante la prova. Eseguito DENTRO la sandbox (client). Non stampa il token.
cd /home/dibbi/oc-ws/ws1 || exit 1
H="$(openclaw gateway call config.get --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.hash||j.baseHash||(j.snapshot&&j.snapshot.hash)||"")})')"
P="$(node -e 'console.log(JSON.stringify({raw:JSON.stringify({agents:{defaults:{heartbeat:{every:"0m"}}}}),baseHash:process.argv[1]}))' "$H")"
openclaw gateway call config.patch --params "$P" --json 2>&1 | head -c 200; echo
openclaw gateway call cron.list --json 2>&1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s.slice(s.indexOf("{")));for(const x of j.jobs)console.log(x.name,"enabled="+x.enabled,JSON.stringify(x.schedule),JSON.stringify(x.state))})'
