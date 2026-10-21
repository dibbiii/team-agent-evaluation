# Runbook: run di Warren su un repository locale (WSL `Ubuntu-26.04`)

Data: 2026-10-21. Stato: infrastruttura **provata solo con un `claude` FINTO** (costo 0, nessun modello, nessuna
credenziale). Con il vero Claude Code **non e' stato eseguito nulla**. Etichette: TESTED = eseguito con comando e
risultato; UNVERIFIED/BLOCKED = non provato.

## 1. Cosa c'e' e dove

| Cosa | Dove | Note |
|---|---|---|
| Script (repo, lato Windows) | `scripts/live/fixture-setup.sh`, `stub-claude.sh`, `warren-run.sh`, `deploy-to-wsl.ps1` | LF, copiati dentro la distribuzione da `deploy-to-wsl.ps1` |
| Script (dentro WSL) | `~/live/*.sh` | copiati via `\\wsl.localhost\Ubuntu-26.04\home\dibbi\live\` |
| Fixture | `~/fixtures/seed-app.git` (bare, `main`, 1 commit baseline, autore `tae-bot`) | ricreata da zero a ogni run |
| Ingressi | `~/seed-app.tar` (tar di Windows: `package.json`, `src/`, `test/`), `~/issue-catalog.json` | nessun test held-out |
| Stub | `~/stub-bin/claude` (copiato da `warren-run.sh` solo in modalita' `stub`) | mai nel PATH globale |
| Esca | `~/decoy-secret.txt` (contenuto finto) | per la verifica di isolamento |
| Uscite | `~/out/<run-id>.tar`, `~/live-runs/<ts>-<mode>-<ISSUE>/` | log, json, eventi, `isolation-probe.txt` |

## 2. Procedura (tutti i comandi)

Da PowerShell, nella cartella della repo:

```powershell
$env:WSL_UTF8 = "1"
powershell -NoProfile -File scripts\live\deploy-to-wsl.ps1
wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/warren-run.sh ISSUE-1 stub
```

(Il rumore `your 131072x1 screen size is bogus` e' di `wsl.exe`, innocuo.) Lo script, in ordine:

1. ricrea il bare repo (`fixture-setup.sh`: estrae il tar, controlla LF, nessun file inatteso, nessun riferimento
   ad `acceptance`, committa con autore `tae-bot`, `git clone --bare`);
2. scrive un git config dedicato (`GIT_CONFIG_GLOBAL`) con `insteadOf` da `fake://tae/seed-app` al bare repo;
3. avvia `bun src/cli/main.ts serve` con **ambiente minimo** (`env -i`) e questi parametri:
   `WARREN_RUNTIME=local`, `WARREN_FORGE=fake`, `WARREN_FAKE_FORGE_STATE_FILE=<run>/fake-forge-state.json`,
   `WARREN_API_TOKEN=tae-dummy-token`, `WARREN_DATA_DIR=<run>/data`, `WARREN_BIND_HOST=127.0.0.1`,
   `WARREN_BIND_PORT=18080`, `WARREN_DISABLE_UI=1`, `WARREN_LOG_LEVEL=info`, `GIT_CONFIG_GLOBAL`, identita' git
   `tae-warren`, `BUN_INSTALL=~/.bun`; attende `/healthz` e pretende `/readyz` = 200 (bwrap reale);
4. `POST /projects {"gitUrl":"fake://tae/seed-app"}` -> id progetto;
5. costruisce il prompt da `issues.json` (stessa formulazione di `scripts/run-baseline.mjs`, senza held-out);
6. dispatch (equivalente a `warren run`, il CLI e' `bun src/cli/main.ts run` dentro `~/warren`):

```bash
bun src/cli/main.ts run --max-cost-usd 1 --model claude-sonnet-5-5 \
  claude-code <project-id> -p "<prompt>"
```

   con `timeout` (stub 180 s, live 1500 s); il CLI segue gli eventi e termina da solo;
7. raccoglie `GET /runs`, `/runs/<id>`, `/runs/<id>/events`; stampa stato, costo, durata, tipi di evento, branch,
   commit, PR del forge finto, processi `claude` nuovi osservati, tracce fuori dal workspace;
8. esporta l'albero del branch `warren/<run-id>` in `~/out/<run-id>.tar` (senza `.claude/`, `.sandbox-tmp/`,
   `.warren/`; segnala con `ATTENZIONE` se erano nel branch);
9. ferma il server (solo il PID avviato, `trap`) e cancella eventuali copie di `.credentials.json` sotto la data dir.

Valutazione lato Windows (fuori dalla repo, poi cancellare il JSON in `results/`):

```powershell
$id = "run_xxxx"   # dal RIEPILOGO
$d = Join-Path $env:TEMP "tae-ws-$id"; New-Item -ItemType Directory $d | Out-Null
Copy-Item "\\wsl.localhost\Ubuntu-26.04\home\dibbi\out\$id.tar" "$d.tar"
tar -xf "$d.tar" -C $d
node scripts/evaluate.mjs $d ISSUE-1 warren-stub S01 MOCK
# poi: rimuovere results\S01-warren-stub-*.json
```

## 3. Risultati della prova `stub` (TESTED)

- **Percorso completo, 2 prove da stato pulito** (si cancellano `~/live-runs`, `~/out`, il bare repo prima di
  ognuna; nuova data dir, nuovo bare repo, nuovo progetto): `readyz` 200; progetto 201; run `succeeded`
  (`costUsd` 0,000421 `costBasis=api`, modello `claude-sonnet-5-5` registrato; durata run 0,6-0,7 s, script intero
  circa 6 s); eventi `reap.branch_pushed` (`commitsAhead` 1), `reap.pr_opened`, `reap.completed`;
  branch `warren/<run-id>` nel bare repo con 1 commit (`src/pricing.js`, 1 riga); PR n. 1 nello state file del
  forge finto (`fake://tae/seed-app/pulls/1`, `lifecycle open`, `autoMerge unarmed`); tar esportato (10240 byte).
- **Valutazione lato Windows**: `evaluate.mjs` = **PASS** (`visible_tests` e `heldout_acceptance` true) in
  entrambe le prove. Controllo negativo: lo stesso comando sulla fixture non corretta = **FAIL**
  (`heldout_acceptance` false), quindi il PASS e' significativo. Altre run di mise a punto
  (compresa una con commit "largo" e una con `PROMPT_HINT_FILE`) hanno dato lo stesso esito. I JSON di
  risultato `S01-warren-stub-*.json` sono stati cancellati.
- **Il `claude` visto dal server**: `command -v claude` = `/home/dibbi/stub-bin/claude` (anche dentro la
  sandbox). Il campionatore (ogni 0,1 s) non ha visto alcun processo con eseguibile in
  `~/.local/share/claude/versions`: vero claude non avviato. Nota: **esisteva gia' un `claude` vero (PID 446,
  padre una shell `-bash` interattiva, avviato prima della prova)**, non nostro e mai toccato.
- **Fine**: nessun `bun`/`warren`/`bwrap` residuo (`ps`), dopo ogni prova.

### Isolamento della run (default di Warren, non modificati) — dato principale

Rete: il built-in `claude-code` dichiara `burrow_config network = "open"` (`src/registry/builtins/claude-code.ts`);
la sandbox e' quindi `bwrap --unshare-all --share-net`. Output grezzo dello stub dentro la sandbox
(`isolation-probe.txt`, identico nelle due prove):

```text
uid=1000 gid=1000 HOME=/home/sandbox pwd=/workspace argv0=/home/dibbi/stub-bin/claude
nomi variabili d'ambiente: BUN_INSTALL_CACHE_DIR HOME PATH PWD SHLVL TMPDIR _
processi visibili in /proc: 5
a1 /home/dibbi/tae-escape-a1.txt: SCRITTURA RIUSCITA   (poi assente sull'host)
a2 /etc: Read-only file system        a3 /usr: Read-only file system
a4 /tmp: SCRITTURA RIUSCITA           a5 / : SCRITTURA RIUSCITA  (poi assenti sull'host)
a6 ~/.bun: Read-only file system      a7 /home/sandbox: SCRITTURA RIUSCITA (HOME della run)
b1 /home/dibbi/decoy-secret.txt: No such file or directory
b2 ls /home/dibbi: .bun .local live-runs stub-bin tae-escape-a1.txt
b3 assenti: ~/.claude, ~/.claude/.credentials.json, ~/.claude.json, ~/warren, ~/fixtures
b5 /etc/shadow: Permission denied
c1 TCP 1.1.1.1:443: connesso
c2 127.0.0.1:18080 GET /healthz senza token: HTTP/1.1 200 OK
c2 127.0.0.1:18080 GET /projects senza token: HTTP/1.1 401 Unauthorized
```

Lettura:

- **(a) Scrivere fuori dal workspace**: riesce solo su filesystem **effimeri dentro la sandbox** (la radice `/`
  e `/tmp` sono tmpfs, anche il percorso `/home/dibbi/...` non montato: `ls` dentro la sandbox lo mostra); dopo la
  run sull'host **non esiste alcun file** `tae-escape-*` (verificato con `ls` in `/home/dibbi`, `/tmp`, `/`,
  `~/.bun`). Fallisce (provato) su `/etc`, `/usr`, `~/.bun`; `~/.local/bin` risulta in sola lettura da `mountinfo` (non provata la scrittura).
  Persistono solo il workspace e `/home/sandbox` (HOME per-run).
- **(b) Leggere il file esca**: **non riesce** (`No such file or directory`): `/home/dibbi` non e' montata,
  esistono solo i punti di mount: `~/.bun` (ro, intera), `~/.local/bin` (ro, intera), `~/stub-bin` (ro), e i percorsi
  della data dir del progetto (`.git/objects` del clone in ro, git dir privato della run in rw). L'agente vede
  quindi i nomi `live-runs/<ts>/data/...` e il codice/binari in `~/.bun` e `~/.local/bin` (in live anche
  `~/.local/share/claude/versions`, ro). Le variabili d'ambiente sono ripulite (nessun token di Warren).
- **(c) Rete**: **riesce**: TCP verso `1.1.1.1:443` ok (necessario per l'API del modello). La sandbox condivide il
  network namespace dell'host: l'agente raggiunge anche il **control plane di Warren su `127.0.0.1:18080`**
  (`/healthz` 200 senza token; le altre rotte 401: il token non e' nell'ambiente dell'agente). Il filtro per
  dominio (`network = "restricted"`) non e' attivo per il built-in: sarebbe da configurare, **non** cambiato qui.
- `/sys/class/net` assente; `/proc` mostra 5 processi (pid namespace isolato); uid 1000.

## 4. Per la run LIVE (NON eseguita)

Comando esatto (il chiamante lo lancia dopo; consuma credito dell'abbonamento):

```powershell
$env:WSL_UTF8 = "1"
powershell -NoProfile -File scripts\live\deploy-to-wsl.ps1
wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/warren-run.sh ISSUE-1 live
```

Differenza unica rispetto a `stub`: niente `~/stub-bin` nel PATH e HOME reale (Warren copia
`~/.claude/.credentials.json` dentro la run). Tutto il resto (fixture, forge finto, `--max-cost-usd 1`,
`--model claude-sonnet-5-5`) e' identico. Prima di lanciarla decidere:

1. **node/npm non ci sono** nella distribuzione, ma il prompt dice `verifica con "npm test"`: l'agente non
   potra' eseguire i test come nel baseline. `bun test test/` funziona sulla fixture (5 pass, TESTED fuori
   sandbox). Opzione: `PROMPT_HINT_FILE` con una riga di nota (prova con stub: ok, ma cambia il prompt rispetto
   al baseline: va dichiarato).
2. **Credenziali nel branch (rischio reale)**: Warren non esclude `.claude/` dai commit (`commitExcludes` vuoto,
   scelta dichiarata nel sorgente) e in live copia `.credentials.json` in `/workspace/.claude/` (e in HOME). Un
   `git add -A` dell'agente le metterebbe nel branch pushato (provato con lo stub: `.claude/settings.local.json`
   finisce nel branch con commit largo; per il file credenziali e' estrapolazione). Lo script esclude `.claude/`
   dal tar, segnala con `ATTENZIONE`, e a fine run cancella le copie di `.credentials.json` sotto la data dir; il
   bare repo, pero', conserverebbe il blob: dopo la run live **cancellare `~/fixtures/seed-app.git`** e non
   estrarre mai `.claude/`.
3. Il modello di default di Warren e' `claude-sonnet-4-6` (`WARREN_MODEL_SONNET`); lo script passa `--model
   claude-sonnet-5-5` come il baseline (accettato dal server; con lo stub e' ignorato).
4. Il tetto `--max-cost-usd 1` e' il freno di Warren sulla stima (`costBasis=subscription_estimate` atteso con
   abbonamento): il suo effetto reale e' UNVERIFIED.

## 5. Discrepanze con la documentazione e punti incerti

- Nessuna `warren up` (richiede docker/bwrap + onboarding): si usa `serve` direttamente, come in S00.
- Il binario `warren` non e' nel PATH: il CLI si lancia come `bun src/cli/main.ts <comando>` in `~/warren`.
- `docs/credentials.md` dice che la sandbox ha HOME `/workspace`; nel codice HOME e' `/home/sandbox` e Warren copia
  le credenziali in entrambi i posti (`drive-prepare.ts` riga 141). Il commento del codice e' datato.
- `docs/project-setup.md` e' dedicato a GitHub (auto-merge): per il forge finto `autoMerge` risulta `unarmed`, nessuna
  azione. **Nessun file `.warren/` e' stato aggiunto alla fixture** (configurazione minima = nessuna): Warren
  scrive da solo `.warren/agent.json` nel workspace (escluso dai commit). `warren init` (config.yaml +
  triggers.yaml) non e' stato usato.
- Il server di prova usa un **HOME fittizio** (`<run>/server-home`) solo in modalita' `stub`, perche' Warren non
  trovi `~/.claude/.credentials.json` e non lo copi: l'originale non e' mai stato letto ne' copiato.
- L'esca e' letta con percorso assoluto `/home/dibbi/decoy-secret.txt`: con HOME fittizio `~` non coinciderebbe.
- `WARREN_FORGE=fake` e' di test: nessuna verifica di merge, CI o auto-merge.

## 6. Non provato

Qualsiasi cosa con il vero Claude Code: avvio dentro bwrap (percorso `~/.local/share/claude/versions` montato per
codice, non provato), uso delle credenziali copiate, `--dangerously-skip-permissions` in sandbox, comportamento con
rete aperta, costo reale, `--max-cost-usd`, tempi, `git add` dell'agente, esecuzione dei test senza node.
Non provate: modalita' `live` dello script (solo letta/sintassi), altri ISSUE oltre ISSUE-1 con lo stub
(lo stub corregge solo ISSUE-1, per le altre e' previsto che non committi: non provato), `network=restricted`,
runtime `docker`/`k8s`, Jira, forge reali.
