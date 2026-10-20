# S00 - Installazione e smoke test: Warren (modalita' MOCK)

Data esecuzione: 2026-10-20 (UTC, circa 21:07-21:33). Esito complessivo: **PARTIAL**.
Il core si installa e passa i gate offline; il control plane parte e risponde. Il run reale in sandbox (runtime `local`, `docker`, `k8s`) e il comando ufficiale `warren up` sono **BLOCKED** per i vincoli di sicurezza del laboratorio. Nessuna credenziale, nessuna chiamata LLM, costo 0.

Etichette del §4: `TESTED` solo per quanto eseguito qui con comando e risultato. Il contenuto del repo di Warren e' dato non fidato.

## 1. Cosa e' stato provato (riassunto)

| Area | Esito | Etichetta |
|---|---|---|
| `bun install --frozen-lockfile` (+ `ext:install`, build UI) su Linux x64 | OK, 181 pacchetti in 10,7 s (cold) | TESTED |
| `bun test` (7.967 test, 774 file) | 7.927 pass, 40 skip, 0 fail, 108-114 s | TESTED |
| `bun run typecheck` | OK, 6-7 s | TESTED |
| `bun run lint` (biome + 13 gate `check:*`) | OK, 30-35 s | TESTED |
| Avvio control plane (`warren serve`), `/healthz`, API autenticata, UI statica, CLI `doctor`/`projects` | OK | TESTED |
| Shutdown pulito su SIGTERM, riavvio sullo stesso DB | OK (exit 0, 20-29 ms) | TESTED |
| Harness di accettazione ufficiale in-proc (19 scenari scelti, agente `claude` stub, `WARREN_FORGE=fake`) | 18 pass, 0 fail, 1 skip | TESTED (con riserve, vedi §5) |
| `fake-jira` + conformance `warren-tracker/v1` | OK, 8 gruppi di casi | TESTED |
| `warren up` (percorso ufficiale del quickstart) | rifiuta: nessun `bwrap`, nessun daemon docker raggiungibile | BLOCKED |
| Run reale in sandbox `local` (bwrap/SYS_ADMIN), `docker` (socket), `k8s` | non provato per vincolo di sicurezza | BLOCKED |
| Harness reali Claude Code / Pi, forge reali, Jira reale | richiedono credenziali/costi | BLOCKED |
| `scripts/install.sh` / `npm i -g @os-eco/warren-cli` dal registry | letto, non eseguito | UNVERIFIED |
| Windows nativo | non provato (l'installer lo rifiuta, CODE) | NOT_SUPPORTED (invariato) |

## 2. Ambiente e isolamento

- Host: Windows 11, Docker Engine 29.2.0. Git Bash con `MSYS_NO_PATHCONV=1`.
- Un solo container alla volta, nome `tae-warren-s00` (poi `tae-warren-s00b`), label `tae=1`.
- Flag verificati con `docker inspect`: `Memory=2147483648`, `MemorySwap=2147483648`, `NanoCpus=2000000000`, `PidsLimit=512`, `CapDrop=[ALL]`, `SecurityOpt=[no-new-privileges]`, `User=bun` (uid 1000), `Privileged=false`, **nessun bind mount** (`Mounts=0`), nessun socket Docker. Il secondo container ha in piu' `--init`.
- Codice portato con `git archive` dal clone `...\scratchpad\clones\warren` (commit `ce088e854c96492358b6f0a0e26695baf801968d`) e `docker cp`; poi `tar -x --no-same-owner` come utente `bun`. Il clone non e' stato toccato.
- Rete: bridge predefinita **con uscita aperta per tutta la sessione** (non ho applicato un filtro). Traffico effettivo: pull immagini, `apt-get` (git), registry npm (`bun install`, `bun add -g`). Nessun altro endpoint e' stato contattato intenzionalmente. Il mock-run non ha chiamato servizi esterni.
- Variabili d'ambiente dell'host: non usate. Dentro il container solo token fittizi (`WARREN_API_TOKEN=tae-dummy-token`, `TRACKER_BEARER=tae-fake-bearer`).

### Versioni e immagini

| Voce | Valore |
|---|---|
| Warren | 0.19.3, commit `ce088e854c96492358b6f0a0e26695baf801968d` |
| Immagine passata 1 | `oven/bun:1.2` = Bun 1.2.23, Debian 12, digest `sha256:6ebf306367da43ad75c4d5119563e24de9b66372929ad4fa31546be053a16f74` |
| Immagine passata 2 | `oven/bun:1.3.14` = Bun 1.3.14, Debian 13, digest `sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4` |
| git (apt, nel container) | 2.39.5 (passata 1), 2.47.3 (passata 2) |
| `@os-eco/seeds-cli` / `mulch-cli` / `canopy-cli` | 0.5.13 / 0.10.7 / 0.2.6 (canopy non pinnato dal CI: preso `latest`) |

La scelta di due immagini e' motivata da una discrepanza del repo: `engines` dice Bun >= 1.1, il `Dockerfile` usa `oven/bun:1.2`, ma `.bun-version` (usato dal CI) fissa **1.3.14**. Ho provato entrambe: stessi risultati.

## 3. Passi eseguiti, comandi e risultati

Tutti i comandi sono stati lanciati con `docker exec` nel container (utente `bun`). Directory di lavoro: `/home/bun/warren`.

### 3.1 Preparazione del container (passi manuali)

```bash
export MSYS_NO_PATHCONV=1
docker pull oven/bun:1.2                       # poi tag locale tae-bun:1.2
docker create --name tae-warren-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 \
  --pids-limit 512 --cap-drop ALL --security-opt no-new-privileges --user bun \
  -w /home/bun --entrypoint sleep tae-bun:1.2 infinity
docker start tae-warren-s00
docker exec -u 0 tae-warren-s00 sh -c 'apt-get -o APT::Sandbox::User=root update -qq; \
  apt-get -o APT::Sandbox::User=root install -y --no-install-recommends git ca-certificates'
```

- L'immagine `oven/bun` **non contiene git**, necessario per worktree e test. L'ho installato con apt come root dentro il container a capability azzerate. Funziona solo con `-o APT::Sandbox::User=root` (altrimenti apt non puo' cambiare utente); resta un avviso innocuo `chown ... term.log failed`. Tempo: 16,6 s.
- Lo stesso apt non e' un passo del repo: e' un adattamento mio, da dichiarare come passo manuale.

### 3.2 Trasferimento del codice (errore mio, diagnosticato)

- Primo tentativo: `git archive HEAD` dal clone Windows. Il clone ha `core.autocrlf=true`, quindi **l'archivio conteneva file CRLF**. Conseguenze: 30 test falliti, tra cui `--dry-run exited 127: /usr/bin/env: 'bash\r': No such file or directory`, e fallimenti di golden e check di sync dei documenti. Non e' un difetto di Warren: e' un artefatto del mio trasporto.
- Correzione: `git -c core.autocrlf=false archive --prefix=warren/ HEAD`. Verificato: 0 file CRLF in `package.json` e `scripts/install.sh`. Tutti i risultati sotto vengono dal secondo trasferimento.
- Nota di riproducibilita': su Windows con `autocrlf=true` va sempre usato `-c core.autocrlf=false`.
- `git archive` non porta `.git`: il gate `check:merge-strategy` (usa `git check-attr`) falliva con "not a git repository". Risolto con `git init` + identita' locale fittizia dentro il container (nessun commit). Con `.git` presente il gate passa.

### 3.3 Installazione dipendenze (passi ufficiali del CI e di CONTRIBUTING)

```bash
bun install --frozen-lockfile     # 181 packages installed [10.67s]  (cold; 6,26 s sulla passata 2)
bun run ext:install               # 6 sottopacchetti (extensions/*), 0,03-2,9 s ciascuno
bun run build:ui                  # vite build, "built in 8.00s" (5,55 s passata 2); src/ui/dist 844 KB
```

- **Discrepanza documentale**: `CONTRIBUTING.md` dice solo `bun install`. Con solo quello, `bun test` produce **5 errori** `Cannot find module` (`@sinclair/typebox` in `extensions/judge`, `react/jsx-dev-runtime` e `@tanstack/react-query` in `src/ui`). Servono anche `bun run ext:install` e `bun run ui:install` (o `build:ui`), come fa il CI (`.github/workflows/ci.yml`). Con solo `bun install`: 7.868 pass, 5 fail/errors. Dopo `ext:install` + `build:ui`: 0 fail.
- Bun non esegue gli script di installazione delle dipendenze non fidate per default; non ho abilitato nulla.
- Dimensioni: `warren/` 1.015 MB (incl. `node_modules` 415 MB), `~/.bun` 37 MB.
- `bun run src/cli/main.ts --version` -> `0.19.3`; `--help` elenca 22 comandi (`serve`, `up`, `doctor`, `run`, `plan`, ...).

### 3.4 Test e gate offline

| Comando | Risultato | Durata |
|---|---|---|
| `bun test` | 7.927 pass, 40 skip, 0 fail, 26.973 expect, 7.967 test in 774 file | 108-114 s (passata 1: 109 s; passata 2: 108 s) |
| `bun run typecheck` | exit 0 | 7 s / 6 s |
| `bun run lint` | exit 0 (biome su 1.691 file, layers, version-sync 0.19.3, wire-types, design-docs, seeds-integrity 1.851 righe, merge-strategy, rls 52 migrazioni, client-contract, extension gates, `gen:cli-ref` 22 comandi) | 35 s / 30 s |

I 40 test saltati (analizzati dai `(skip)` nel log): Postgres (DrizzleAdapter, pg-migrate parity, withDb, runMigrateToPostgres, disruption protection) e sandbox reale `bwrap` Linux (private git dir, `probeSandboxGit`, LocalEngine). Quindi **i test del sandbox reale non sono stati eseguiti qui**.

### 3.5 Avvio del control plane con parametri minimi

```bash
WARREN_API_TOKEN=tae-dummy-token WARREN_DATA_DIR=/home/bun/data \
WARREN_BIND_HOST=127.0.0.1 WARREN_BIND_PORT=8080 WARREN_RUNTIME=local \
bun src/cli/main.ts serve
```

Log di avvio (sanificato, tutti `level 30`): `warren server starting` (sqlite, tcp 127.0.0.1:8080), `seeded built-in agents` (claude-code, pi, planner, nightwatch, bugwatch, pr-fixer, healer), `github app registration gate resolved` (enabled, "default on: private instance without App credentials"), `lifecycle bus wired`, `preview listener ... 127.0.0.1:8081`, `scheduler running` (tick 60 s), `plan-run coordinator running` (10 s), `run watchdog running` (heartbeat 2.700.000 ms = 45 min), `ops stats worker`, `preview eviction worker`, `workspace GC worker`, `warren server listening`. Dal primo log al "listening" passano circa 59 ms; il resto e' caricamento del runtime.

Sonde HTTP (script `bun`, token fittizio):

| Richiesta | Risposta |
|---|---|
| `GET /healthz` senza token | 200 `{"ok":true}` |
| `GET /readyz` senza token | 401 `missing Authorization header` (coerente con `docs/operations.md`:L9) |
| `GET /readyz` con token | **503**: `db_reachable` ok, `bwrap` KO "Executable not found in $PATH" |
| `GET /projects` senza / con token | 401 / 200 `{"projects":[]}` |
| `GET /runs` con token | 200 `{"runs":[],"total":0,...}` |
| `GET /agents` con token | 200, 7 agenti builtin |
| `GET /` senza token | 200, UI statica (HTML) |

CLI (`HOME=/tmp/cli-home`, `WARREN_BASE_URL`, `WARREN_API_TOKEN`): `doctor` -> `server_reachable ok`, `auth_valid ok` ("admitted as operator (capabilities: readPublic, readOperator, dispatch, admin)"), `version_match ok` ("cli and server both at 0.19.3"), exit 0. `projects` exit 0.

Osservazione: con `WARREN_RUNTIME=local` il server parte ma `/readyz` resta 503 senza `bwrap`: **il control plane non e' "ready" senza il sandbox, e il sandbox non puo' essere creato nel nostro container** (vedi 4).

### 3.6 Tempi di avvio, shutdown, memoria

Misurati con uno script `bun` che lancia `serve`, fa polling su `/healthz` ogni 25 ms, legge `VmRSS`, invia SIGTERM e attende l'uscita del figlio (misura fatta nel container di passata 1):

| Prova | healthz pronto | RSS del processo | SIGTERM -> exit |
|---|---|---|---|
| boot 1, DB nuovo (migrazioni) | 2.017 ms | 220 MB | 29 ms, exit 0 |
| boot 2, DB esistente | 1.257 ms | 179 MB | 20 ms, exit 0 |

Memoria del container (`docker stats --no-stream`, campionamento ogni 5-8 s, quindi i picchi reali possono essere piu' alti):

| Fase | Mem container |
|---|---|
| a riposo dopo `bun install` | 54 MiB (poi 356-437 MiB con page cache) |
| server `serve` attivo | 538 MiB, 33 PID |
| `bun test` (passata 1) | picco campionato 786 MiB, 36 PID |
| harness di accettazione (passata 1) | picco 942 MiB, 137 PID |
| `bun test` + gate + accettazione (passata 2) | picco 1,198 GiB, 11 PID (campionato) |

Il limite di 2 GiB non e' mai stato raggiunto. Attenzione al budget dell'host (circa 1,2 GB liberi): il picco di 1,2 GiB e' al limite; e' stato eseguito con un solo container. Il consumo include la page cache del container.

Nota di misura: il mio primo tentativo di misurare lo shutdown con `kill -0` e' andato in loop perche' il container di prima passata non aveva `--init` e il processo terminato restava zombie; non e' un difetto di Warren. Il log mostrava `warren server stopping`.

### 3.7 Run minimo con harness finto (harness di accettazione ufficiale)

Il server **non** espone un runtime `fake`: `WARREN_RUNTIME` accetta solo `local`, `docker`, `k8s` (CODE `src/runtime/registry.ts`). `FakeProvider` (`src/runtime/fake/fake-provider.ts`) e' dichiarato "Test-only". Il forge `fake` esiste invece come `WARREN_FORGE=fake`.

L'unico percorso supportato dal repo per un run senza credenziali e' l'harness `scripts/acceptance/` (documentato in `ACCEPTANCE.md`):
- usa uno **stub** dell'agente Claude (`scripts/acceptance/lib/stub-agent/claude-code-agent.sh`) e un **bwrap finto** (`bwrap-shim.sh`, 84 righe, che fa solo `cd` ed `exec`);
- repository git locali con riscrittura `insteadOf` (nessuna rete);
- `WARREN_FORGE=fake` per gli scenari con PR.

Letti prima dell'uso: `inproc.ts`, `fixtures.ts` (porzione), `bwrap-shim.sh`, elenco degli stub. Non ho letto riga per riga tutti gli stub.

Prerequisiti non documentati nel README: l'harness richiede i CLI `cn`, `sd`, `ml` nel PATH. Il CI li installa con `bun add -g @os-eco/canopy-cli @os-eco/seeds-cli@0.5.13 @os-eco/mulch-cli@0.10.7`. Senza `cn` l'harness fallisce subito (`Executable not found in $PATH: "cn"`, provato). Nel container ho dovuto impostare `BUN_INSTALL_BIN=/home/bun/.bun/bin` e `BUN_INSTALL=/home/bun/.bun`, altrimenti `bun add -g` falliva con `EACCES` nel link dei binari.

```bash
export PATH=/home/bun/.bun/bin:$PATH
bun run scripts/acceptance/run.ts --only 01,03,04,05,06,07,08,09,10,11,14,15,17,22,26,35,36,40,43
```

Ho scelto il sottoinsieme del job CI "nightly" escludendo 41 (richiede bwrap reale), 42 (self-host con Docker), 13, 16, 21, 30 (non necessari).

Risultato (passata 1: 84 s; passata 2: 68 s; identico): **18 pass, 0 fail, 1 skip**. Skip = scenario 35 (CI fixer: richiede `GITHUB_TOKEN` reale). Esempi (tempi passata 1):

- 01 boot + `/healthz` + `/readyz` dopo refresh: 30 ms
- 04 `POST /runs` -> 201, `renderedAgentJson` congelato allo spawn: 4,5 s
- 05 stream eventi NDJSON, eventi durevoli: 0,8 s
- 06 riavvio di warren: run in volo riconciliati come `sandbox_run_lost`, eventi durevoli: 17 s
- 07 steer `POST /runs/:id/steer`: 8,4 s
- 08 cancel idempotente: 0,9 s
- 15 trigger cron senza doppio dispatch: 4,0 s
- 26 plan-run seriale, 3 figli, PR via FakeForge, resume dal figlio successivo: 15,6 s
- 40 FakeForge dispatch -> reap -> push -> PR: 2,5 s
- 43 RemoteTracker: plan-run con lista ordinata di issue contro FakeTracker `warren-tracker/v1`, issue chiuse al merge: 5,4 s

Cosa dimostrano: lifecycle del run, eventi, steer, cancel, recovery del control plane dopo riavvio, plan-run seriale, PR simulata, protocollo tracker. Cosa **non** dimostrano: il sandbox (sostituito dallo shim), un agente reale, il costo, un forge reale.

### 3.8 fake-jira (estensione `tracker-jira`)

```bash
cd extensions/tracker-jira && bun run src/dev-server.ts --port 18090 --bearer tae-fake-bearer
cd ../tracker-conformance && bun run src/check.ts http://127.0.0.1:18090 --bearer tae-fake-bearer
```

- `GET /capabilities` -> `supportsPlans=false, supportsMetadata=false, supportsScheduledIssues=false, isGitNative=false` (conferma la scheda).
- `GET /issue-statuses` -> `{"WAR-1":"open","WAR-2":"other","WAR-3":"closed"}`; `GET /issues/WAR-1` -> `blockedBy:["WAR-2"]`; senza token 401.
- `POST /issues/WAR-1/close` -> 200 e stato `closed`. **Osservazione**: WAR-1 e' stato chiuso anche se bloccata da WAR-2 non chiusa: l'estensione non applica i blocker; la decisione resta al chiamante (Warren/controller).
- Conformance: `PASS - the server conforms to warren-tracker/v1 (experimental)`, 8 gruppi di casi.
- Primo tentativo con `TRACKER_BEARER` come variabile d'ambiente: 401 (uso errato mio; `check.ts` vuole `--bearer`).
- Questo dimostra l'estensione contro Jira **finto**; non prova l'integrazione con Jira Cloud ne' un controller di coda (vedi scheda).

### 3.9 `warren up` (percorso ufficiale)

```bash
env -i PATH=$PATH HOME=/tmp/up-home bun src/cli/main.ts up --no-open --no-wizard
# warren up: no usable sandbox (bwrap on PATH) and no reachable docker daemon - install the sandbox tool or start docker, then re-run `warren up`
# up_exit=1
```

BLOCKED: serve `bwrap` (con user namespace) o un daemon Docker raggiungibile; nessuno dei due e' ammesso. Non e' stata creata `~/.warren`. Il comportamento coincide con la docstring di `up.ts` e con il quickstart.

## 4. Osservazioni sulla sicurezza (osservate a runtime)

1. **Sandbox `local` impossibile con i nostri vincoli.** Nel container: `CapEff: 0000000000000000`, `NoNewPrivs: 1`, `Seccomp: 2`, `unshare -U true` -> `Operation not permitted`, nessun `bwrap`. Conferma sperimentale che il runtime `local` richiede in Compose `SYS_ADMIN` + AppArmor/seccomp/systempaths `unconfined` (CODE/DOC `docker-compose.yml`). La scheda lo diceva da lettura; ora e' osservato che con la nostra postura minima **non puo' funzionare**.
2. **L'harness di accettazione non testa l'isolamento.** Lo shim `bwrap` esegue direttamente il comando; il run stub gira senza namespace. I 18 scenari verdi non dicono nulla sulla contenzione di un agente reale. Per S07 serve un runtime sandboxed reale.
3. **Token operatore nei log.** Senza `WARREN_API_TOKEN` il server stampa nel log JSON `mintedOperatorToken` con il valore completo ("printed exactly once; persisted under the data dir") e lo salva in `<data>/operator-token` (modo `0600`, 44 byte). Il `warren.db` (+ `-wal`, `-shm`) e' `0644`. Con token da ambiente nessun token appare nei log. Coerente con DOC `docs/self-host/docker.md`:L73-L78; da trattare come rischio di log. Ho stampato solo i primi 6 caratteri di un token usa-e-getta del container.
4. **Autenticazione**: tutte le route tranne `/healthz` (e la UI statica `/`) rispondono 401 senza bearer o con bearer errato (provato: 401/401). Bearer unico, nessun utente nominato (invariato, DOC).
5. **Bind**: il default e' `0.0.0.0:8080` (CODE `src/server/config.ts`). Io ho forzato `127.0.0.1`. Il listener di preview parte comunque su `127.0.0.1:8081`.
6. **Il server esegue un watchdog di default** (heartbeat 45 min) e scheduler: confermato dai log di avvio (non una prova di recovery reale dei run sandboxed).
7. **Immagine base**: `oven/bun` e' Debian e gira come utente `bun`; l'installazione di git ha richiesto root nel container. Il container di Warren stesso (Dockerfile) installa bwrap, uidmap, nodejs da NodeSource (`curl -fsSL https://deb.nodesource.com/setup_22.x | bash -` nel `Dockerfile`): non eseguito qui, ma da segnalare per la supply chain.
8. **Postura degli script**: letto per intero `scripts/install.sh`. Non usa `curl | sh` per bun (scarica in un file temporaneo ed esegue con bash), ma scarica comunque `https://bun.sh/install` e installa `@os-eco/warren-cli` globale da npm; la pagina `https://warren.run/install` non e' stata ispezionata (non scaricata). Non eseguito.
9. Nessun processo stub ha tentato connessioni esterne (non monitorato a livello di rete: UNVERIFIED in senso forte, ma l'harness usa solo repo locali).

## 5. Limiti e riserve

- Un solo host (Windows 11 + Docker Desktop/Engine 29.2.0), container Linux x64. Linux nativo, macOS e WSL2 non provati.
- `n=1` per ogni passata (due passate con versioni Bun diverse). Tempi di avvio: 1 cold + 1 warm, non una distribuzione.
- La memoria e' campionata a intervalli di 5-8 s e include la page cache; il picco reale puo' essere superiore.
- Il sottoinsieme dell'acceptance e' scelto da me (19 su ~40 scenari); 35 saltato.
- Il commit verificato e' quello della scheda (shallow clone); non verificato che coincida col tag v0.19.3.
- Nessun test di Postgres, k8s, GitHub App, GitLab/ADO, `claude`/`pi` reali, preview.

## 6. Sblocco (cosa serve per completare S00 realmente)

- Host Linux/VM dedicata con Docker e `bwrap` + user namespace (o k8s con RuntimeClass sandboxed): provare `warren up` e il runtime `local` o `docker`.
- Approvazione esplicita per il runtime `docker` (monta il socket Docker, equivale a root sull'host) oppure usare k8s.
- Chiave Anthropic o token OAuth di prova con budget massimo; token GitHub di prova per il forge reale.
- Per Jira: progetto sandbox autorizzato (o continuare con `fake-jira`).

## 7. Cleanup verificato

Container creati e rimossi (nome esplicito): `tae-warren-s00` e `tae-warren-s00b` (`docker rm -f`). Immagini rimosse per nome: tag locali `tae-bun:1.2` e `tae-bun:1.3.14`; immagini scaricate `oven/bun:1.2` (id `sha256:6ebf3063...`) e `oven/bun:1.3.14` (id `sha256:e10577f0...`); nessuna delle due esisteva prima. Volumi e reti `tae`: nessuno creato.

Verifiche dopo il cleanup:
- `docker ps -a --filter label=tae=1` -> vuoto; `docker ps -a --filter name=tae-` -> vuoto.
- `docker images | grep -E "tae-|oven"` -> vuoto. Le immagini dell'utente: 17 prima, 17 dopo.
- `docker volume ls --filter label=tae=1` e `docker network ls --filter label=tae=1` -> vuoti.
- Container dell'utente: 9 prima, 9 dopo; `segnalibro-db` ancora `Up (healthy)`.
- Rimossi anche i file temporanei dell'host nello scratchpad (`warren-src.tar`). Il clone `scratchpad\clones\warren` e' rimasto invariato.
- Modificati solo `docs/candidates/warren.md`, `reports/s00-warren.md`, `results/s00-warren-<run_id>.json`.

## 8. Riproduzione e pulizia (comandi esatti)

```bash
export MSYS_NO_PATHCONV=1
CLONE=<scratchpad>/clones/warren   # commit ce088e854c96492358b6f0a0e26695baf801968d
git -C $CLONE -c core.autocrlf=false archive --prefix=warren/ HEAD -o <scratchpad>/warren-src.tar
docker pull oven/bun:1.3.14 && docker tag oven/bun:1.3.14 tae-bun:1.3.14
docker create --name tae-warren-s00b --label tae=1 --memory 2g --memory-swap 2g --cpus 2 \
  --pids-limit 512 --cap-drop ALL --security-opt no-new-privileges --user bun --init \
  -w /home/bun --entrypoint sleep tae-bun:1.3.14 infinity && docker start tae-warren-s00b
docker exec -u 0 tae-warren-s00b sh -c 'apt-get -o APT::Sandbox::User=root update -qq; \
  apt-get -o APT::Sandbox::User=root install -y --no-install-recommends git ca-certificates'
docker cp <scratchpad>/warren-src.tar tae-warren-s00b:/tmp/warren-src.tar
docker exec tae-warren-s00b sh -c 'cd /home/bun && tar -xf /tmp/warren-src.tar --no-same-owner && cd warren \
  && git init -q . && git config user.name tae && git config user.email tae@example.invalid \
  && bun install --frozen-lockfile && bun run ext:install && bun run build:ui'
docker exec -e BUN_INSTALL_BIN=/home/bun/.bun/bin -e BUN_INSTALL=/home/bun/.bun -w /home/bun tae-warren-s00b sh -c \
  'mkdir -p /home/bun/.bun/bin; bun add -g @os-eco/canopy-cli @os-eco/seeds-cli@0.5.13 @os-eco/mulch-cli@0.10.7'
docker exec -w /home/bun/warren tae-warren-s00b sh -c 'export PATH=/home/bun/.bun/bin:$PATH; \
  bun test; bun run typecheck; bun run lint; \
  bun run scripts/acceptance/run.ts --only 01,03,04,05,06,07,08,09,10,11,14,15,17,22,26,35,36,40,43'
# pulizia (solo nomi tae-)
docker rm -f tae-warren-s00b
docker rmi tae-bun:1.3.14 oven/bun:1.3.14
docker ps -a --filter label=tae=1        # deve essere vuoto
```
