# S00 - Installazione e smoke test: Gas Town (modalità MOCK)

Data esecuzione: 2026-10-20 (UTC, circa 22:11-23:14). Esito complessivo: **PARTIAL**.
`gt`, `bd` e Dolt si costruiscono/installano in un container non privilegiato; 72 pacchetti Go su 76 passano i test offline (2 con un test fallito ciascuno, diagnosticati: ambiente del container); `gt install`, `gt rig add`, `gt doctor`, `gt estop`/`gt thaw`, `gt dashboard`, `gt done` (con stato costruito a mano) funzionano o sono osservabili **senza alcun agente LLM**. Il percorso ufficiale con agenti reali (`gt up`, `gt daemon start`, `gt sling`, `gt mayor attach`, Claude Code in tmux) è **BLOCKED**. Nessuna credenziale, nessuna chiamata LLM, costo 0.

Etichette del §4: `TESTED` solo per quanto eseguito qui con comando e risultato. Il contenuto del repo di Gas Town è dato non fidato.

## 1. Cosa è stato provato (riassunto)

| Area | Esito | Etichetta |
|---|---|---|
| Build `gt` (`make build`, 3 binari) e `make install` | OK; build a freddo (inclusi i moduli) 280 s con `-p 2`, install 18 s | TESTED |
| `bd` v1.0.5 (`go install ...@v1.0.5`, `CGO_ENABLED=0`, come il CI) | OK, 118 s a freddo | TESTED |
| Dolt 2.0.7 (tarball ufficiale, sha256 verificato) | OK | TESTED |
| Test unitari `go test -short` su tutti i 76 pacchetti (senza `-race`) | 72 ok, 2 con 1 test fallito (daemon, tmux), 2 senza file di test; vedi 3.3 | TESTED |
| Test `-tags=e2e -run TestInstall ./internal/cmd/...` (quelli di `Dockerfile.e2e`) | 12 PASS visti (output troncato a 40 righe: possibili altri), ~120 s | TESTED |
| `gt version`, `gt install ~/gt --git`, `gt rig add`, `gt doctor` | OK (doctor fresco: 86 ok, 6 warning, 0 fail) | TESTED |
| Default di merge del Refinery (runtime, via `gt prime --dry-run`) | `merge_strategy = direct`, `require_review = false` | TESTED |
| Cambio a `pr` / `require_review` e ritorno al default | OK, ma `gt rig settings set` scrive uno scheletro con `enabled:false` (vedi 4.2) | TESTED |
| Permessi `bypassPermissions` nei template generati | presente in tutti e 7 i `settings.json` di ruolo | TESTED |
| Guardie `pr-workflow` e `dangerous-command` (exit code) | blocco = exit 2, come da codice | TESTED |
| E-stop `gt estop` / `gt estop status` / `gt thaw` (con sessioni tmux finte) | il sentinel e il resoconto funzionano; **il SIGTSTP non ha fermato i processi** (vedi 4.4) | TESTED (esito negativo sul freeze) |
| Dashboard `gt dashboard` senza LLM: autenticazione | **nessuna autenticazione**; solo un CSRF token servito dalla pagina stessa (vedi 4.5) | TESTED |
| #4819 nella forma letterale (Dolt irraggiungibile) | **non riprodotta**: `gt done` si ferma con errore (fail-closed) | TESTED (negativo) |
| #4819 variante (lettura del convoy fallita, DB della rig leggibile) | **riprodotta**: `--merge=local` ignorato, branch pushato a origin | TESTED (variante, stato costruito a mano) |
| `gt up`, `gt daemon start`, `gt doctor --fix` senza `--no-start`, `gt sling`, `gt mayor attach` | non eseguiti: avviano agenti LLM (Mayor, Deacon, Witness, Refinery, polecat) | BLOCKED |
| Alternativa Docker ufficiale (`docker compose`, `Dockerfile`) | non eseguita: base `docker/sandbox-templates:claude-code`, `curl \| bash`, bind mount, porta pubblicata | BLOCKED (per vincoli) |
| Suite `integration` del CI (`-tags=integration`), `-race` | non eseguite | UNVERIFIED |
| Windows nativo | non provato | UNVERIFIED |

## 2. Ambiente e isolamento

- Host: Windows 11, Docker Engine 29.2.0, kernel dei container 6.6.87.2-microsoft-standard-WSL2. Git Bash con `MSYS_NO_PATHCONV=1`.
- Un solo container, `tae-gastown-s00`, label `tae=1`. Verificato con `docker inspect`: `Memory=2147483648`, `MemorySwap=2147483648`, `NanoCpus=2000000000`, `PidsLimit=512`, `CapDrop=[ALL]`, `SecurityOpt=[no-new-privileges]`, `User=1000:1000` (uid senza voce in `/etc/passwd`), `Privileged=false`, **`Mounts=0`**, **`PortBindings=map[]`**, nessun socket Docker, `--init`. Variabili d'ambiente dell'host: nessuna (`-e HOME`, `GOPATH`, `GOMAXPROCS` fissati da me).
- Il codice è entrato con `git -c core.autocrlf=false archive --prefix=gastown/ HEAD` + `docker cp` (commit `649b832b7672bc7a2dbef26f5983aba6198b819b`; 0 file CRLF verificati). Il clone Windows non è stato toccato. Nel container ho fatto `git init` + un commit locale (`46124df`, "tae local snapshot"): vedi 3.2 per il motivo e per l'effetto su `gt version`.
- Rete in uscita: bridge predefinita **non filtrata** per tutta la sessione. Traffico effettivo: pull dell'immagine, apt (deb.debian.org), `proxy.golang.org`/GitHub (moduli Go), release GitHub di Dolt. Nessun altro endpoint contattato intenzionalmente; non ho monitorato il traffico (la telemetria OTLP di `gt` non è stata osservata né disattivata: UNVERIFIED).
- Credenziali: nessuna. `claude` e `codex` non sono installati nel container (`command -v` vuoto).
- Un errore mio: `pkill -x sleep` ha terminato anche il `sleep infinity` che tiene vivo il container (exit 143); l'ho riavviato con `docker start`. Il filesystem era intatto, Dolt era caduto ed è stato riavviato con `gt dolt start`. Nessun effetto sui risultati, ma i test successivi sono su un container riavviato.

### Versioni e provenienza dei binari

| Voce | Versione / provenienza |
|---|---|
| Immagine | `golang:1.26.2-bookworm`, id `47ce5636e993`, digest `sha256:47ce5636e9936b2c5cbf708925578ef386b4f8872aec74a67bd13a627d242b19`; Go 1.26.2 linux/amd64, Debian 12 |
| `gt` | commit `649b832b7672bc7a2dbef26f5983aba6198b819b`, costruito da sorgente con `make build` e `make install` (`~/.local/bin/gt`); `gt version` stampa `46124df (dev: master@46124df)` (commit locale mio, non quello reale) |
| `bd` | v1.0.5, `go install github.com/steveyegge/beads/cmd/bd@v1.0.5` (versione di `go.mod` e di `.github/actions/setup-bd`), `CGO_ENABLED=0`; `bd version 1.0.5 (dev)` |
| Dolt | 2.0.7, `https://github.com/dolthub/dolt/releases/download/v2.0.7/dolt-linux-amd64.tar.gz`, sha256 `8e09138596763896cbce0632cd6e779fa1df405334c6c148bc314539a3b9795a`, uguale al `digest` che l'API di GitHub riporta per quell'asset |
| tmux | 3.3a (apt Debian 12; vedi 3.1) |
| git | 2.39.5 (già nell'immagine) |
| sqlite3 | 3.40.1 (apt) |
| ICU | `libicu-dev` 72.1-3 (apt); `pkg-config --modversion icu-uc` = 72.1 |
| lsof | 4.95.0-1 (apt, estratto a mano; vedi 3.1) |

Lo script `install.sh` di Dolt (v2.0.7) è stato letto per intero prima di decidere: scarica solo il tarball dalla release GitHub e lo installa in `/usr/local/bin`. Non l'ho eseguito: ho fatto a mano gli stessi passi come utente non root in `~/bin` con checksum. Lo script `install.sh` di Beads (usato dal `Dockerfile` ufficiale con `curl | bash` dal ramo `main`) **non è stato scaricato né letto**: ho usato `go install` alla versione fissata.

## 3. Passi eseguiti, comandi e risultati

Tutti i comandi con `docker exec` nel container (utente 1000). Cartella di lavoro `/home/tae/gastown`; town in `/home/tae/gt`.

### 3.1 Preparazione del container (passi manuali, non documentati nel repo)

```bash
export MSYS_NO_PATHCONV=1
docker pull golang:1.26.2-bookworm
docker create --name tae-gastown-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 \
  --pids-limit 512 --cap-drop ALL --security-opt no-new-privileges --user 1000:1000 --init \
  -e HOME=/home/tae -e GOPATH=/home/tae/go -e GOMAXPROCS=2 -w /home/tae \
  --entrypoint sleep golang:1.26.2-bookworm infinity
docker start tae-gastown-s00
docker exec -u 0 tae-gastown-s00 chmod 1777 /home/tae      # il workdir creato da Docker è di root
```

Pacchetti di sistema (apt come root dentro il container a capability azzerate). Con `--cap-drop ALL` apt e dpkg **non funzionano così come sono**:
- La cache `/var/cache/apt/archives/partial` appartiene a `_apt` e root senza `CAP_DAC_OVERRIDE` non ci scrive: soluzione `-o Dir::Cache::archives=/tmp/aptc` (cartella 1777) e `-o APT::Sandbox::User=root`.
- `libutempter0` (dipendenza di tmux) fallisce con `error setting ownership of './usr/lib/x86_64-linux-gnu/utempter/utempter'` (gruppo `utmp`, serve `CAP_CHOWN`). Soluzione: estratto a mano con `dpkg-deb --fsys-tarfile ... | tar -x --no-same-owner` e copiato `libutempter.so*` in `/usr/lib/x86_64-linux-gnu/` + `ldconfig`. Lo stato dpkg di `tmux` resta "non configurato" e apt rifiuta ulteriori `install` (per questo `lsof` l'ho scaricato con `apt-get download` ed estratto a mano in `/usr/local/bin`).
- Pacchetti: `tmux sqlite3 libicu-dev pkg-config` e poi `lsof`.

```bash
docker exec -u 0 tae-gastown-s00 sh -c 'mkdir -p /tmp/aptc/partial && chmod -R 1777 /tmp/aptc; \
  apt-get -o APT::Sandbox::User=root -o Dir::Cache::archives=/tmp/aptc update -qq; \
  apt-get -o APT::Sandbox::User=root -o Dir::Cache::archives=/tmp/aptc install -y --no-install-recommends tmux sqlite3 libicu-dev pkg-config'
```

`tmux` ha funzionato solo dopo la correzione di `libutempter`. `lsof` serve ai test di `internal/doltserver` (vedi 3.3).

### 3.2 Trasferimento del codice e artefatti miei

- Con `git archive` il tar non contiene `.git`. Ho fatto `git init` + identità locale fittizia. Conseguenza: `TestCapture` (`internal/checkpoint`) falliva con "Branch should be set in git repo" / "LastCommit should be set" perché il repo non aveva commit. Dopo `git add -A && git commit` il test passa. È un artefatto del mio trasporto, non un difetto di Gas Town (come per Warren, serve `.git`).
- Effetto collaterale: `make build`/`make install` usano `git describe`/`rev-parse`; senza tag e con il mio commit locale `gt version` mostra `dev` / `46124df` invece del commit reale. Il commit reale è `649b832`.
- Il `Makefile` esegue `check-up-to-date` (avviso innocuo "no upstream tracking branch").

### 3.3 Installazione, build e test

```bash
# Dolt (dopo aver letto install.sh), come utente non root
curl -fsSL -A dolt-installer https://github.com/dolthub/dolt/releases/download/v2.0.7/dolt-linux-amd64.tar.gz -o dolt.tgz
sha256sum dolt.tgz        # 8e09138596763896cbce0632cd6e779fa1df405334c6c148bc314539a3b9795a
tar zxf dolt.tgz && cp dolt-linux-amd64/bin/dolt ~/bin/ && ~/bin/dolt version   # 2.0.7 (avviso "old version", la 2.5.1 è la più recente)
# bd
CGO_ENABLED=0 go install github.com/steveyegge/beads/cmd/bd@v1.0.5               # 118 s (cold)
# gt
GOFLAGS=-p=2 make build                                                            # 280 s (cold, moduli inclusi); gt 137 MB
GOFLAGS=-p=2 make install                                                          # 18 s
```

| Passo | Risultato | Tempo |
|---|---|---|
| `go install bd@v1.0.5` | OK | 118 s |
| `make build` (gt, gt-proxy-server, gt-proxy-client) | OK | 280 s |
| `make install` | OK, `~/.local/bin/gt`; avviso `.beads has permissions 0755 (recommended: 0700)` | 18 s |
| `go test -short -count=1` (solo `internal/cmd`) | `ok`, 1.325 test di primo livello PASS, 11 SKIP | 115 s |
| `go test -short -count=1 ./internal/doltserver` | 245 PASS, 1 FAIL **senza lsof**; `ok` **con lsof** | 11 s |
| `go test -short -count=1 ./internal/daemon` | 301 PASS, 19 SKIP, 1 FAIL (`TestGitChildEnv_RecoversMissingIdentity`) | 217 s |
| `go test -short ./internal/tmux` | 1 FAIL (`TestGetPaneCommand_MultiPane`) | 104 s |
| `go test -short ./internal/polecat` | ok | 174 s |
| `go test -tags=e2e -run TestInstall ./internal/cmd/...` | 12 PASS visti (`TestInstallCreatesCorrectStructure`, `TestInstallDoctorClean`, `TestInstallWithDaemon`, ...) | ~120 s |
| Altri 68 pacchetti | ok | pochi secondi ciascuno (`refinery` 22 s, `doctor` 11 s, `git` 10 s, `beads` 9 s) |

Conteggio: `go list ./...` = 76 pacchetti; 72 ok; 2 FAIL (1 test ciascuno); 2 senza file di test (`cmd/gt-proxy-client`, `internal/health`). Sottoinsieme e motivo: ho scelto `go test -short` **senza `-race`** (il CI usa `-race -short -timeout=10m`) per contenere memoria e tempo nel limite di 2 GiB; la suite `-tags=integration` del CI (che usa anche immagini Docker `dolthub/dolt-sql-server`) non è stata eseguita.

Diagnosi dei fallimenti (tutti dovuti all'ambiente del container, non a Gas Town):

1. **`TestCleanStaleSocket_RemovesStaleFile` (doltserver)**: `cleanStaleSocket` usa `lsof` e l'immagine `golang` non lo ha. Con `lsof` 4.95.0 installato il pacchetto passa. Nota: `INSTALLING.md` non elenca `lsof`; `Dockerfile.e2e` lo installa ("procps and lsof are required by gt dolt start") ma il `Dockerfile` di produzione non lo cita. Se `gt dolt start` funzioni senza `lsof`: **non provato** (il mio `gt install` è stato eseguito dopo l'installazione di `lsof`).
2. **`TestGitChildEnv_RecoversMissingIdentity` (daemon)**: "USER should have been recovered, got empty"; l'uid 1000 non ha voce in `/etc/passwd` e `USER`/`LOGNAME` non sono impostati. Artefatto del container (`--user 1000:1000` senza utente).
3. **`TestGetPaneCommand_MultiPane` (tmux)**: si aspetta `pane_current_command=sleep`, il pane mostra `sh`. Riprodotto 3 volte su 3. Con `tmux new-session -d "sleep 300"` il processo figlio è `sh -c sleep 300` con `sleep` come nipote (`ps`), mentre `new-session "exec sleep 300"` mostra `sleep`: `/bin/sh` di Debian (dash) non fa exec dell'ultimo comando. Il test dipende dalla shell dell'ambiente.
4. **`TestCapture` (checkpoint)**: vedi 3.2.

### 3.4 Memoria e risorse

`docker stats --no-stream` campionato a intervalli di 6-30 s (il campione include la page cache del container).

| Fase | Mem container |
|---|---|
| a riposo, container appena creato | ~117 MiB |
| `make build` (picco campionato) | 917 MiB, 20 PID |
| `go test -short ./...` con `-p 2` (primo tentativo) | **1,995-2,0 GiB**, 166 PID: bloccato per oltre 4 minuti, link del test `deacon` a 371 MB di RSS, poi `protocol.test: link: signal: killed` (OOM) nel secondo tentativo |
| dopo aver terminato i `dolt` orfani | 1,0-1,2 GiB |
| dopo `gt install` + `gt rig add` | 1,23 GiB (cache), 10 PID |
| a riposo a fine prova | 48 MiB, 10 PID |
| disco del container | 5,26 GB scrivibili (virtual 6,18 GB): `~/go` 1,7 GB, `~/.cache` 1,9 GB |

Causa dell'esaurimento: **i test avviano molti `dolt sql-server` e li lasciano orfani** (PPID 1). Nel primo tentativo ne ho contati 18, ciascuno con ~80-100 MB di RSS, che da soli occupano 1,5-1,8 GiB. Con `-p 1` e un ciclo che esegue un pacchetto alla volta e termina i `dolt` orfani dopo ciascuno (`pkill -x dolt`), la memoria è rimasta sotto 1,2 GiB. Sui test `polecat` e `rig` ho visto gli orfani; il resto non è stato misurato pacchetto per pacchetto. **Con l'host a ~1 GB liberi la suite completa senza questo accorgimento non è eseguibile.**

Altro errore mio: `pkill -f "go test"` e `pkill -f "gt dashboard"` hanno ucciso la shell `sh -c` che conteneva quella stringa nella riga di comando; per questo ho usato `pkill -x <nome>` e `pgrep` per PID.

### 3.5 Creazione del workspace

```bash
cat > ~/gtenv.sh <<'EOF'
export PATH=/home/tae/.local/bin:/home/tae/bin:/home/tae/go/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin
export HOME=/home/tae TERM=xterm
EOF
git config --global user.name "TAE Test"; git config --global user.email tae@example.invalid; git config --global init.defaultBranch main
gt install ~/gt --git                              # 10,4 s; non ho usato --shell (modifica i file rc)
git init -q -b main seed ... && git clone --bare seed origin.git      # repo finto in /home/tae/fake/origin.git
gt rig add fakeproj /home/tae/fake/origin.git      # ERRORE (vedi sotto)
gt rig add fakeproj file:///home/tae/fake/origin.git   # 5,4 s ("Rig created in 4.5s")
```

- `gt install ~/gt --git`: crea `mayor/`, `deacon/`, `CLAUDE.md`, `AGENTS.md`, `.beads/` (prefisso `hq-`), 47 formule, bead `hq-mayor`/`hq-deacon`, avvia **un Dolt server** (porta 3307, in background). Avviso: `dolt_server_port in metadata.json is deprecated`. Nessuna chiamata LLM.
- `gt rig add` con un percorso locale è **rifiutato**: `invalid git URL "/home/tae/fake/origin.git": expected a remote URL (e.g. https://, git@host:, ssh://, s3://, file:///abs/path)`. Il messaggio suggerisce `file://`; la documentazione (`INSTALLING.md`) cita solo `https://`.
- Struttura della rig `fakeproj` (prefisso `fa`): `.repo.git`, `mayor/rig`, `refinery/rig` (worktree), `witness/`, `polecats/`, `crew/`, `settings/config.json`, `.beads`, e `.claude/settings.json` per ruolo.
- `gt doctor` dopo l'install: **86 passed, 6 warning, 0 failed** (3,7 s). Warning: `global-state` (`gt enable`), `daemon` non in esecuzione, `beads-custom-types` (11 mancanti), `beads-custom-statuses` (2), `town-claude-md`, `lifecycle-defaults`. Dopo le mie prove (polecat finti, convoy) il doctor è peggiorato (3 fail, 9 warning) per stato che ho creato io; `gt doctor --fix --no-start` (6 s) ha sistemato 8 voci e lascia **1 failure**: `claude-settings: Found 1 agent(s) missing settings.json -> Run 'gt up --restore'`, che coincide con il "Known issue" di `docs/docker.md` (risolverlo richiede `gt up`, quindi BLOCKED).
- `gt doctor --fix` senza `--no-start` non è stato eseguito: il check `daemon` è marcato `(fixable)` e `--no-start` è descritto come "Suppress starting daemon/agents during --fix".

### 3.6 Osservazione del default di merge del Refinery (runtime, senza agenti)

Il Refinery non ha un comando che stampi la configurazione effettiva; l'unico punto in cui il valore diventa visibile senza avviare l'agente è il prompt di patrol che `gt prime` produce per il ruolo Refinery (le variabili vengono da `buildRefineryPatrolVars`). `settings/config.json` della rig appena creata **non contiene** la chiave `merge_queue`.

```bash
cd ~/gt/fakeproj/refinery/rig
gt prime --dry-run | grep "Config: merge_strategy\|Config: require_review"
# **Config: merge_strategy = direct**
# **Config: require_review = false**
```

- Lo stesso testo del prompt dice: `**If merge_strategy = "direct" (default):** git checkout <merge-target>; git merge --no-ff ... origin/<polecat-branch>; git push origin <merge-target>`. Il default `direct` è anche in `internal/formula/formulas/mol-refinery-patrol.formula.toml` (`[vars.merge_strategy] default = "direct"`). **TESTED**: il default effettivo è l'integrazione diretta, senza PR.
- Cambio a `pr`:

```bash
gt rig settings set fakeproj merge_queue.merge_strategy pr
gt prime --dry-run | grep "Config: merge_strategy\|Config: require_review"     # pr / false
gt rig settings set fakeproj merge_queue.require_review true                     # pr / true
gt rig settings unset fakeproj merge_queue                                       # torna a direct / false
```

Dopo il primo `set`, `settings/config.json` contiene (osservato) `"merge_queue": {"enabled": false, "merge_strategy": "pr", "on_conflict": "", "retry_flaky_tests": 0, "poll_interval": "", "max_concurrent": 0}`: **il comando scrive uno scheletro con i valori zero, tra cui `enabled: false`**. Nel codice non-test non ho trovato lettori di `merge_queue.enabled` fuori dal motore `Engineer` (grep: nessuna occorrenza), quindi l'effetto pratico non è dimostrato, ma è un'insidia di configurazione. `gt doctor` non lo segnala.
- **Cosa è davvero il Refinery in questo commit**: il merge è eseguito dall'**agente LLM** che segue la formula `mol-refinery-patrol` (comandi `git merge`/`git push`/`gh pr create` scritti nel prompt). `Engineer.ProcessMRInfo`, `ProcessBatch` e `LoadConfig` (internal/refinery) **non hanno chiamanti nel codice non-test** (`grep -rn` su `internal/`): il motore Go descritto in scheda (engine.go:632-660, 769-880) non è collegato alla CLI in questo commit (UNVERIFIED su chiamanti esterni al modulo). Inoltre `Engineer.LoadConfig` legge `merge_queue` da `config.json` della rig, mentre `gt rig settings` e `gt prime` usano `settings/config.json`: due sorgenti diverse.

### 3.7 Permessi e guardie

```bash
grep -rn "bypassPermissions\|skipDangerousModePermissionPrompt" --include=*.json ~/gt
# deacon/dogs/boot, deacon, mayor, fakeproj/witness, fakeproj/crew, fakeproj/polecats, fakeproj/refinery: tutti con
#   "defaultMode": "bypassPermissions" e "skipDangerousModePermissionPrompt": true
gt config agent list
#  claude --dangerously-skip-permissions
#  codex ... --dangerously-bypass-approvals-and-sandbox
#  copilot --yolo   gemini --approval-mode yolo   kiro-cli chat --trust-all-tools   amp --dangerously-allow-all
GT_POLECAT=x gt tap guard pr-workflow           # exit=2
(cd ~; gt tap guard pr-workflow)                # exit=0 (fuori da contesto Gas Town)
echo '{"tool_input":{"command":"git push --force origin main"}}' | GT_POLECAT=x gt tap guard dangerous-command   # exit=2
echo '{"tool_input":{"command":"ls"}}' | GT_POLECAT=x gt tap guard dangerous-command                              # exit=0
```

La guardia `pr-workflow` ignora lo stdin: basta `GT_POLECAT`/`GT_CREW`/... o un `cwd` che contiene `/crew/` o `/polecats/`. Nei `settings.json` i matcher sono `Bash(gh pr create*)`, `Bash(git checkout -b*)`, `Bash(git switch -c*)` e, per `dangerous-command`, `Bash(rm -rf /*)` come esempio osservato (non ho elencato tutti i matcher). Non ho verificato la guardia dentro Claude Code (BLOCKED: nessun agente).

### 3.8 E-stop

Senza agenti ho creato due sessioni tmux finte sul socket della town (`tmux -L gt-1d897c new-session -d -s fa-witness "sleep 900"` e `-s hq-mayor "sleep 901"`), nomi riconosciuti da `isGTSession` (prefisso rig `fa-` e `hq-`).

```bash
gt estop status                  # No E-stop active.
gt estop -r "prova S00"          # ESTOP creato; "⏸ fa-witness", "⏭ hq-mayor (exempt)", "1 session(s) frozen"
cat ESTOP                        # manual<TAB>2026-10-20T23:08:10Z<TAB>prova S00
gt estop status                  # E-STOP ACTIVE (manual, 1s ago: prova S00); anche `gt status` lo mostra
ps -eo pid,pgid,stat,args | grep "sleep 90"     # dopo l'E-stop: sleep ancora in stato S+ (non T)
kill -TSTP -<pgid>               # a mano, stesso segnale e stesso gruppo: ancora S+
kill -STOP <pid>                 # SIGSTOP a mano: T+ ; kill -CONT: S+
gt thaw                          # "1 session(s) resumed"; ESTOP rimosso
gt estop --rig fakeproj -r "rig test"  &&  gt thaw --rig fakeproj    # ESTOP.fakeproj creato e rimosso
```

- Il comando esiste, scrive il sentinel (`ESTOP`, `ESTOP.<rig>`), esenta il Mayor (`hq-mayor`), riporta lo stato in `gt status`, e `gt thaw` lo rimuove.
- **Il "freeze" dichiarato ("1 session(s) frozen") non ha fermato il processo** in questo ambiente: `signalSessionGroup` invia `SIGTSTP` al gruppo di processi del pane (`syscall.Kill(-pid, SIGTSTP)`); il processo di prova è rimasto in `S+`. `SIGSTOP` invece lo ferma. Causa probabile (ipotesi, non provata direttamente): il gruppo di processi di un pane tmux è *orfano* (il padre, tmux, è in un'altra sessione) e il kernel Linux scarta `SIGTSTP` per i gruppi orfani quando l'azione è quella predefinita. Prova indiretta: un `sleep` in un gruppo non orfano (job control di `sh`) si è fermato. Un processo Claude Code (Node) potrebbe avere un handler proprio; **non provato**. Con agenti reali l'efficacia resta quindi `UNVERIFIED`, e l'unica parte provata è il sentinel (che il daemon, non avviato qui, dovrebbe leggere: `UNVERIFIED`).

### 3.9 Dashboard e autenticazione

```bash
gt dashboard --port 8080 &       # "listening on 127.0.0.1:8080" (nessun LLM, nessun daemon)
curl -s -o /tmp/dash.html -w "%{http_code}" http://127.0.0.1:8080/               # 200, 43.950 byte, <title>Gas Town Control Center
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/commands        # 200 senza credenziali
curl -s -X POST -H "Content-Type: application/json" -d '{"command":"status"}' http://127.0.0.1:8080/api/run
#   {"success":false,"error":"Invalid or missing dashboard token",...}  http=403
T=$(estratto dal <meta name="dashboard-token" ...> della pagina scaricata senza credenziali)   # 64 caratteri
curl -s -X POST -H "X-Dashboard-Token: $T" -d '{"command":"status"}' .../api/run    # success:true, output di `gt status`
curl -s -X POST -H "X-Dashboard-Token: $T" -d '{"command":"sling fa-96z fakeproj"}' .../api/run   # 403 "requires confirmation (set confirmed: true)"
curl -s -X POST -H "X-Dashboard-Token: $T" -d '{"title":"creata da dashboard senza login","rig":"fakeproj"}' .../api/issues/create   # 200, bead hq-j7d creato
IS_SANDBOX=1 gt dashboard --help | grep bind      # default "0.0.0.0"
```

**Nessuna autenticazione**: pagina e API in lettura aperte; per le POST c'è solo un token anti-CSRF che la pagina stessa fornisce a chiunque la scarichi. Il comando `POST /api/run` accetta una lista di comandi `gt` (`sling`, `rig add`, `mail send`, ... con `confirmed: true` per quelli "Confirm"). In modalità sandbox (`IS_SANDBOX`, impostata da `docker-compose.yml`) il bind predefinito diventa `0.0.0.0`, e il compose pubblica la porta: la scheda lo definiva "trusted local-network surface"; confermato. Non ho provato `sling` con `confirmed: true`.

### 3.10 `gt done` e #4819

La segnalazione https://github.com/gastownhall/gastown/issues/4819 (aperta, 2026-09-05): con Dolt irraggiungibile `gt done` tratta l'assenza di informazioni sul convoy come "workflow MR di default" e ignora `--merge=local`. Nota: `--merge=local` è un flag di `gt sling`, non di `gt done`; si traduce in `merge_strategy: local` sul convoy e nei campi di allegato del bead.

Senza `gt sling` (avvierebbe un polecat) ho **costruito a mano lo stato**: bead in `fakeproj`, worktree polecat in `~/gt/fakeproj/polecats/<nome>/fakeproj` creato da `.repo.git` con un commit, ambiente `BD_ACTOR=fakeproj/polecats/<nome> GT_ROLE=polecat GT_RIG=fakeproj GT_POLECAT=<nome> GT_TOWN_ROOT=/home/tae/gt`. `gt done` non lancia agenti (solo bead, git, notifica al Witness: "no tmux server running" per il nudge). Le prove sono quindi sullo stesso codice, ma con stato non generato da `sling`.

| Caso | Condizioni | Risultato |
|---|---|---|
| A (controllo) | bead `fa-lud` con `convoy_id` e `merge_strategy: local` nella descrizione, Dolt su | `→ Local merge strategy: skipping push and merge queue`; nessun branch su origin |
| B (letterale) | bead `fa-e7y` come A, **Dolt fermato** (`gt dolt stop`, nessun processo dolt) | `Error: source issue validation failed: source_issue fa-e7y could not be resolved ... Dolt server unreachable ...`; il branch **non** è stato pushato. **Fail-closed: #4819 NON riprodotta in questa forma** su `649b832` |
| C (controllo convoy) | bead `fa-96z` tracciato da un convoy `--merge=local` creato con `gt convoy create ... --merge=local`, bead senza campi di allegato, Dolt su | `→ Local merge strategy: skipping push and merge queue`; nessun branch su origin |
| D (variante) | bead `fa-qdo` come C, ma con `chmod 000 ~/gt/.beads` (il DB della rig resta leggibile, il lookup del convoy nel town fallisce) | `Pushing branch to remote... ✓ Branch pushed to origin`; il branch `polecat/capable/fa-qdo` **è su origin** nonostante la strategia del convoy sia `local`; la creazione dell'MR è fallita (`unknown repo/rig alias "fakeproj"`) e `gt done` ha terminato con "Work needs recovery (push or MR failed)" |

Lettura: in B il codice di questo commit si ferma prima (la validazione `resolveSubmitSourceIssue` precede la lettura del convoy e fa fallire `gt done`). Il difetto descritto nell'issue è però **riprodotto nella sua sostanza** in D: quando la lettura della strategia del convoy fallisce ma quella del bead va a buon fine, `getConvoyInfoForIssue` restituisce `nil` (o un'info senza strategia), il percorso di default fa un push a `origin` e prepara l'MR, ignorando `local`. D è una variante (guasto diverso: non "Dolt giù"), non prova che lo scenario del reporter (Dolt morto *dopo* il check) accada così; non ho potuto temporizzare quel guasto in modo ripetibile. Etichetta finale: **#4819 PARTIAL** (non riprodotta nella forma letterale; il difetto di fondo riprodotto in variante).

Effetto collaterale osservato: la prima `gt prime --dry-run` come Refinery sembra avere creato un patrol wisp (`hq-wisp-bcs`): la seconda esecuzione mostra "Hooked Work ... Bead ID: hq-wisp-bcs". Non indagato (la dry-run dovrebbe essere "senza effetti collaterali" secondo l'help).

## 4. Osservazioni di sicurezza (osservate a runtime)

1. **Default di merge = integrazione diretta** (`merge_strategy = direct`, `require_review = false`): TESTED (3.6). Per ottenere un flusso a PR serve scrivere `merge_queue.merge_strategy=pr` (e `require_review=true`); il polecat in questo commit riceve ancora `gt tap guard pr-workflow` che blocca `gh pr create` (exit 2 in contesto agente, 3.7). Il Refinery in `pr` crea la PR dal prompt; se faccia anche il merge è scritto nel prompt della formula, non nel codice (non verificato oltre `gt prime`).
2. **La politica di merge è nel prompt, non nel codice** (3.6): l'LLM del Refinery esegue i comandi della formula. Per R10/R12 significa che un cambio di prompt/modello può cambiare il comportamento; non esiste enforcement a livello infrastruttura in questo commit (salvo la branch protection del forge).
3. **Permessi**: `bypassPermissions` + `skipDangerousModePermissionPrompt` in tutti i settings generati; tutti i preset agente hanno flag equivalenti (`--dangerously-skip-permissions`, `--yolo`, `--trust-all-tools`, ...). TESTED.
4. **E-stop**: sentinel e UI funzionano; il freeze via SIGTSTP **non ha fermato un processo in un pane tmux** in questo ambiente (3.8).
5. **Dashboard senza autenticazione** (3.9), con comandi di scrittura raggiungibili e bind `0.0.0.0` sotto `IS_SANDBOX`.
6. **Dolt**: `gt install` avvia un Dolt server (3307) in background senza password (documentato: "root, no password for localhost"). Con più `gt`/container sullo stesso host il porto è condiviso: nessun problema qui (container isolato).
7. **Supply chain nel percorso ufficiale Docker**: il `Dockerfile` usa `curl -fsSL .../beads/main/scripts/install.sh | bash` (ramo `main`, non fissato) e `dolt` da release fissata; base `docker/sandbox-templates:claude-code`. Non eseguito per vincolo.

## 5. Passaggi manuali non documentati, discrepanze

- `lsof` non è un prerequisito citato in `INSTALLING.md`; senza, `TestCleanStaleSocket_RemovesStaleFile` fallisce (3.3).
- Con `--cap-drop ALL` `apt`/`dpkg` falliscono (cache `_apt`, `chown` a gruppi non-root); passi manuali in 3.1.
- Per ottenere versione reale da `gt version` servono `.git` con tag; in un archivio senza `.git` stampa `dev`.
- `go install github.com/steveyegge/beads/cmd/bd@latest` (documentato) non è stato provato: ho usato `@v1.0.5` (versione di `go.mod`/CI). Non so se `@latest` sia oggi compatibile.
- `gt rig add` richiede `file://` per repo locali (messaggio d'errore chiaro).
- `gt doctor` fresco: 6 warning attesi; `--fix` senza `--no-start` avvia daemon/agenti (non eseguito); resta il failure `claude-settings` come in `docs/docker.md`.
- I test avviano `dolt sql-server` orfani: memoria fino al limite del container (3.4).
- `gt rig settings set merge_queue.merge_strategy pr` scrive `enabled:false` e valori zero (3.6).

## 6. Limiti e riserve

- Un solo host (Windows 11 + Docker Engine 29.2.0, kernel WSL2 6.6.87.2), container Linux x64; nessun Linux nativo, macOS, WSL2 diretto.
- `n=1` per ogni passo; tempi di build a freddo non ripetuti a caldo.
- Memoria campionata a intervalli (6-30 s) e inclusa la page cache.
- Test con `-short`, senza `-race`; la suite `integration` non è stata eseguita.
- Gli scenari B-D di `gt done` sono su stato costruito a mano; D usa un guasto indotto dal permesso della cartella `.beads` del town, non uno stop di Dolt.
- Il merge "direct" è stato provato come configurazione/prompt effettivo, **non** con un Refinery reale che esegua un merge (richiede un agente).
- `gt up`, `gt daemon start`, `gt sling`, `gt mayor attach`, il flusso Mayor -> polecat -> Refinery, il costo (`gt costs`), il test "PC spento", Claude Code reale: BLOCKED.

## 7. Sblocco (cosa serve per completare S00 realmente)

- Autorizzazione a eseguire il daemon e almeno un agente reale (Claude Code con credenziali di prova e budget massimo), oppure un agente finto esplicito (alias `gt config agent set stub "..."` e `gt sling --agent stub`) da valutare caso per caso: non l'ho provato perché `gt up`/`sling` avviano più ruoli.
- Per l'efficacia dell'E-stop e dei guard: una sessione con Claude Code reale.
- Per il test di rete/telemetria: osservazione del traffico in uscita (non filtrabile qui).

## 8. Cleanup verificato

Container creato e rimosso con nome esplicito: `tae-gastown-s00` (`docker rm -f`). Immagine rimossa: `golang:1.26.2-bookworm` (`docker rmi`, id `47ce5636e993`); non esisteva prima. Nessun volume o rete `tae` creati. File temporanei dell'host nello scratchpad rimossi (`gastown-src.tar`, cartella con `install.sh` di Dolt); il clone `scratchpad/clones/gastown` è invariato.

Verifiche dopo il cleanup: `docker ps -a --filter label=tae=1` -> vuoto; `docker ps -a --filter name=tae-` -> vuoto; `docker volume ls --filter label=tae=1` e `docker network ls --filter label=tae=1` -> vuoti. Immagini dell'utente: 17 prima, 17 dopo (diff vuoto); container: 9 prima, 9 dopo; volumi e reti identici; `segnalibro-db` ancora `Up (healthy)`.
Modificati solo `docs/candidates/gastown.md`, `reports/s00-gastown.md`, `results/s00-gastown-948d14dc.json`.

## 9. Riproduzione (comandi esatti, in sintesi)

```bash
export MSYS_NO_PATHCONV=1
CLONE=<scratchpad>/clones/gastown       # commit 649b832b7672bc7a2dbef26f5983aba6198b819b
cd $CLONE && git -c core.autocrlf=false archive --prefix=gastown/ HEAD -o <scratchpad>/gastown-src.tar
docker pull golang:1.26.2-bookworm
docker create --name tae-gastown-s00 --label tae=1 --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512 \
  --cap-drop ALL --security-opt no-new-privileges --user 1000:1000 --init \
  -e HOME=/home/tae -e GOPATH=/home/tae/go -e GOMAXPROCS=2 -w /home/tae --entrypoint sleep golang:1.26.2-bookworm infinity
docker start tae-gastown-s00
docker exec -u 0 tae-gastown-s00 chmod 1777 /home/tae
# apt (vedi 3.1: cache in /tmp/aptc, libutempter e lsof estratti a mano)
docker cp "<scratchpad-win-path>\gastown-src.tar" tae-gastown-s00:/tmp/gastown-src.tar
docker exec tae-gastown-s00 sh -c 'cd /home/tae && tar -xf /tmp/gastown-src.tar --no-same-owner && cd gastown \
  && git init -q . && git config --global user.name "TAE Test" && git config --global user.email tae@example.invalid \
  && git config --global init.defaultBranch main && git add -A && git commit -q -m "tae local snapshot"'
# Dolt 2.0.7 (tarball + sha256), bd v1.0.5 (go install), make build, make install, gt install ~/gt --git,
# gt rig add fakeproj file:///home/tae/fake/origin.git, poi i comandi dei paragrafi 3.3-3.10.
# pulizia (solo nomi tae-)
docker rm -f tae-gastown-s00
docker rmi golang:1.26.2-bookworm
docker ps -a --filter label=tae=1        # deve essere vuoto
```
