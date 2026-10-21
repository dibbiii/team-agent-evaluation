# S06 su Warren: crash, recovery e continuita' (stub, costo 0)

Data: 2026-10-21. Ambiente: WSL2 `Ubuntu-26.04` (utente `dibbi`, senza disco Windows, bwrap reale), Warren 0.19.3
(`~/warren`), `WARREN_RUNTIME=local`, forge finto `fake://tae/seed-app` su bare repo locale. **Nessun modello, nessuna
credenziale, costo 0**: l'agente e' uno stub (`claude` finto) con HOME fittizio per il server. Il vero `claude` non e' mai
stato eseguito e nessun file di credenziali e' stato letto o copiato (il server di prova ha PATH con `~/stub-bin-slow` in
testa e `HOME=<run>/server-home`).

Etichette: **TESTED** = eseguito (comando e risultato grezzo); **CODE** = letto nei sorgenti di Warren; **UNVERIFIED/BLOCKED** =
non provato. Distinzione richiesta dalla traccia §6 S06: **(a)** recupero di file/worktree, **(b)** recupero dello stato di
issue/run, **(c)** reale ripresa della sessione conversazionale.

## 1. Procedura

Da PowerShell (cartella della repo):

```powershell
$env:WSL_UTF8 = "1"
$txt = [IO.File]::ReadAllText("scripts\live\warren-recovery.sh") -replace "`r",""
[IO.File]::WriteAllText("\\wsl.localhost\Ubuntu-26.04\home\dibbi\live\warren-recovery.sh", $txt, (New-Object System.Text.UTF8Encoding($false)))
wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/warren-recovery.sh 1      # 1..5 oppure all
wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/warren-recovery.sh 2 "[wip_commit=1]"   # variante con lavoro parziale GIA' committato
```

`scripts/live/warren-recovery.sh` (parametro `1|2|3|4|5|all`, secondo argomento opzionale = marcatori aggiunti al prompt):

- scrive lo **stub lento** `~/stub-bin-slow/claude`: applica la correzione di ISSUE-1 in `src/pricing.js` **senza committare**, poi attende
  N secondi (marcatore `[slow=N]` nel prompt, default 25) e solo dopo fa commit e termina. Il parametro passa dal **prompt**
  (la sandbox ripulisce l'ambiente, quindi non si puo' usare una variabile d'ambiente). Marcatori: `[hang=1]` (blocco di 3600 s senza
  output e senza commit), `[wip_commit=1]` (prima dell'attesa committa un "wip" e lascia un file `NOTES-uncommitted.txt` non committato);
- per ogni prova parte da zero: nuovo bare repo (`fixture-setup.sh`), nuova data dir, nuovo progetto, `bun src/cli/main.ts serve`
  con `env -i`, `WARREN_RUNTIME=local`, forge finto, porta 18080; dispatch con il CLI `warren run` in background;
- attende l'evento "modifica scritta" (letto con `GET /runs/<id>/events?limit=2000`, **non** bloccante: senza `limit` l'endpoint
  e' una coda in streaming finche' la run non e' terminale), aspetta 2 s e inietta il guasto;
- dopo ogni passo fa uno *snapshot*: DB di Warren letto direttamente in sola lettura (`bun:sqlite`, funziona a server fermo),
  `GET /runs`, eventi di ogni run, processi tracciati (PID + starttime, per non confondere PID riusati), workspace su disco
  (`git status`/`log` nel workspace della run), riferimenti del bare repo, PR del forge finto;
- polling dello stato (timeout 150 s) fino a che nessuna run e' `queued/running`; poi prova `warren run --rescue-from <id>`;
- uccide **solo** PID avviati dallo script (server, CLI) e i processi tracciati dello stub/bwrap ancora vivi; alla fine cancella
  bare repo e cartella della prova e verifica che non resti nessun `bun`/`bwrap`/stub.

Le 5 prove: **1** `kill -9` del server a meta' run e riavvio sulla stessa data dir; **2** `kill -9` del solo stub (server vivo);
**3** `SIGTERM` del server e riavvio; **4** watchdog con stub bloccato; **5** (extra) salvage + `--rescue-from` reale.
La modalita' `all` non e' stata eseguita come unico comando (le 5 prove sono state lanciate una per volta, piu' le varianti `wip`).

## 2. Cosa dice il codice (CODE)

- **Il run store del provider locale e' in memoria.** `src/runtime/local/run-store.ts`: lo stato per-run (eventi, fase, inbox)
  e' del processo; "una warren restart reconciles live runs as `lost`". La copia durevole degli eventi e' scritta dal bridge nel DB
  (`warren.db`, SQLite in data dir).
- **Riconciliazione al boot.** `src/server/bridges.ts` `bootBridges`: legge le run `queued|running`, interroga `provider.status()`;
  se `exists:false` chiama `reconcileLostSandboxRun` (`src/server/bridge-reconnect.ts`): finalizza `failed` con
  `failure_reason=sandbox_run_lost`, evento `bridge_lost`, poi `provider.terminate()` che **distrugge il workspace** (nessun
  salvage in questo percorso), poi l'hook di retry.
- **Un solo retry automatico per run "infra-lost"** (`src/runs/retry/infra-lost-retry.ts`): causa `sandbox_run_lost` o `preempted`;
  nuova run con `retry_of` = originale; il link e' il budget (una retry non ne genera altre, un originale gia' ritentato non
  ne genera); tetto di costo ereditato meno la spesa gia' fatta; eventi `run.retry_dispatched` / `run.retry_of`. Non scatta per
  cancel dell'operatore ne' per `provider_error`.
- **Salvage-before-destroy** (`src/runs/reap/salvage.ts`, `src/runtime/salvage.ts`): solo se il push del branch in reap fallisce:
  push di `HEAD` su `warren/rescue/<runId>` e/o bundle in `<data>/salvage/<runId>.bundle`; scrive `runs.salvage_ref/salvage_path`.
  `warren run --rescue-from <id>` (`src/server/handlers/runs/dispatch.ts` `resolveRescueDefaults`) richiede `salvage_ref`
  non nullo, altrimenti 400 "has no rescue branch to re-dispatch from".
- **Watchdog** (`src/runs/watchdog.ts`, `src/runs/watchdog-config.ts`): acceso di default, budget di inattivita' 45 min
  (`DEFAULT_WATCHDOG_HEARTBEAT_TIMEOUT_MS`), tick 30 s; heartbeat = timestamp dell'evento piu' recente (altrimenti `startedAt`).
  Configurabile da ambiente: `WARREN_RUN_HEARTBEAT_TIMEOUT_MS`, `WARREN_WATCHDOG_TICK_MS`, `WARREN_WATCHDOG_DISABLED`,
  `WARREN_RUN_TERMINAL_RECONCILE_GRACE_MS` (120 s), `WARREN_RUN_CANCEL_RECONCILE_GRACE_MS` (15 s). Forza `failed/timed_out` passando
  da reap ("preserva quel che l'agente aveva committato"). **Nessun limite di durata massima assoluta** della run: conta solo il
  silenzio (un agente che emette eventi di continuo non e' mai fermato dal watchdog). UNVERIFIED: non provato un tetto di durata
  (non risulta nei sorgenti letti).
- **Sandbox.** `src/sandbox/bwrap.ts`: `--die-with-parent` (morto il server muore bwrap); `src/sandbox/sandbox.ts`: spawn `detached: true`.
- **Ripresa di sessione (c).** Nel built-in `claude-code` e nell'adapter locale **non c'e' `--resume`/`session_id` riusato**: la
  ricerca di `--resume|resumeSession|session_id` nei sorgenti (esclusi test e UI) trova solo l'adapter `pi`. Il rescue
  (`--rescue-from`) e `continueFromRunId` rilanciano una **nuova** run con lo stesso prompt su un branch esistente, non riprendono
  la conversazione. Con lo stub la sessione non e' misurabile (lo stub non ha memoria): **(c) = BLOCKED/UNVERIFIED** con agente vero;
  il codice indica che non esiste un meccanismo di resume della sessione dell'agente (per `claude-code`).
- **Riavvio del server e documentazione.** `docs/quickstart.md` dice che dopo lo stop "the instance resumes where it stopped"
  (stato, progetti, credenziali persistono). Vero per progetti/stato; **non** per le run in volo (vedi prove).

## 3. Risultati (TESTED)

Tutte le prove: base `73f78fa`, ISSUE-1, stub con `[slow=25]` (prova 4: `[hang=1] [wip_commit=1]`, prova 5: `[slow=3]`).
Output grezzo completo salvato nella sessione (scratchpad) e riportato qui nelle parti essenziali.

### Prova 1 — `kill -9` del server (control plane) a meta' run, riavvio sulla STESSA data dir

Comando: `kill -9 <pid server>` 2 s dopo la scrittura dello stub; server riavviato dopo **34 s** con lo stesso `WARREN_DATA_DIR`.

- **Processi figli: muoiono subito.** Prima: `bun serve` 451 -> `bwrap` 598 -> `bwrap` 599 -> `bash stub` 600 -> `sleep` 634. A +3 s dal kill:
  `pid=598/599/600/634 MORTO` (`--die-with-parent`); nessun figlio sopravvive. Il CLI `warren run` (client, processo separato) **resta vivo** e
  stampa `event tail ... failed ([ECONNRESET]); polling for the terminal state instead`.
- **A server fermo (33 s)** il DB resta `state:"running"` (letto in sola lettura: `{"id":"run_nearb...","state":"running","failure_reason":null}`):
  **nessuno** finalizza la run finche' il server non riparte. Nessuna PR, nessun branch pushato (`refs/heads/main` soltanto).
- **(a) File/worktree.** A server fermo il workspace **e' ancora su disco** (`data/local/workspaces/local-run_*`): `src/pricing.js` con
  `Math.round`, `git status`: ` M src/pricing.js`, `?? .claude/settings.local.json`; nella variante `wip` anche il commit
  `fe1fd4d wip(ISSUE-1)` e `NOTES-uncommitted.txt`. **Al riavvio il workspace viene distrutto** (`reap.workspace_destroyed`, 17 ms dopo
  `bridge_lost`): lavoro non committato **e** committato-ma-non-pushato **perduti** (nessun salvage, nessun `warren/rescue/*`, nessun bundle).
- **(b) Stato run.** Riavvio pronto in 1 s; subito: `run_bez92... state=failed failure=sandbox_run_lost`; eventi `bridge_lost`
  (`"reason":"sandbox_run_lost","finalized":true`), `reap.workspace_destroyed`, `run.retry_dispatched`. **Retry automatico (1)**:
  `run_razdaz... retryOf=run_bez92... state=running` -> dopo 22 s `succeeded`, branch `warren/run_razdaz...` con 1 commit, PR n. 1
  (`fake://tae/seed-app/pulls/1`). Spesa: ereditato il tetto (`remainingBudgetUsd:1`).
- **Duplicati:** nessuna PR duplicata (una sola PR, della retry), nessuna run duplicata oltre la retry prevista; il branch della run originale non esiste.
- **(c) Sessione.** La retry riparte da zero (nuova sessione, riesegue tutto lo stub, 25 s); nessuna ripresa. Non misurabile con lo stub; CODE: nessun resume.
- **Intervento manuale:** nessuno per ottenere una run completata; ma **serve** un riavvio del server (nessun supervisore lo fa) e
  per salvare il lavoro del workspace bisogna copiarlo a mano **prima** di riavviare.
- **`warren run --rescue-from <id>`:** exit 1, `[validation_error] run run_bez92... has no rescue branch to re-dispatch from`
  (la run persa non ha `salvage_ref`): il rescue **non e' applicabile** a questo guasto.

### Prova 2 — `kill -9` del solo stub (server vivo)

Comando: `kill -9 952` (PID del `bash stub-bin-slow/claude`, individuato fra i discendenti del server).

- Dopo 3 s: `run_47z44... state=failed failure=provider_error`; evento sintetico
  `agent_end {"synthesized":true,"reason":"agent_exit_without_terminal_envelope","exitCode":137}`; eventi
  `reap.empty_push` (`"dirty":true,"dirtyPaths":["src/pricing.js",".claude/settings.local.json"]`), `reap.provider_error`
  (`provider:"anthropic"` e `model` sono **etichette fisse del classificatore, non una chiamata reale**), `reap.workspace_destroyed`,
  `reap.provider_retry_skipped {"verdict":"unknown"}`. bwrap e sleep muoiono con lui.
- **Retry: nessuno** (0): `provider_error` non e' tra le cause "infra-lost"; `provider_retry_skipped` indica una policy di retry del provider
  che non si e' attivata (`verdict: unknown`). **Salvage: nessuno** (`salvageRef=-`).
- **(a) File.** Senza commit: lavoro **perduto** (workspace distrutto subito, branch pushato a `commitsAhead:0`, cioe' puntatore alla base;
  nessuna PR). Variante `wip_commit=1`: il commit wip **e' pushato** (`warren/run_3wkac... = f8af75a wip(ISSUE-1)`, `commitsAhead:1`) e
  **viene aperta una PR** (`reap.pr_opened`, `prUrl` valorizzato) **anche se la run e' `failed`**; il file non committato (`NOTES-uncommitted.txt`) e' perso.
- **(b)** Stato corretto e immediato; nessun intervento. **Duplicati:** nessuno. **(c)** nessuna ripresa (nessun retry). `--rescue-from`: 400 come sopra.

### Prova 3 — SIGTERM (arresto pulito) del server durante la run, poi riavvio

- `kill -TERM 1496`: il server **esce con codice 0 dopo 5,1 s** (`warren server stopping` poi la chiusura del bridge `errored:false`;
  la causa dei 5 s non e' stata indagata: UNVERIFIED; CODE: `stopAll()` attende `entry.done` di ogni bridge). Il SIGTERM **non cancella la
  run ne' finalizza nulla**: a server fermo il DB resta `running`, workspace ancora su disco (`M src/pricing.js`). Processi stub/bwrap morti
  entro 3 s dall'uscita (non distinguibile se uccisi al SIGTERM o all'uscita: erano vivi prima).
- Dopo 33 s e riavvio: identico alla prova 1: `sandbox_run_lost`, workspace distrutto, **1 retry automatico**
  (`run_000sg... retryOf=run_yt58g...`) `succeeded` in 22 s, 1 PR, nessun duplicato, `--rescue-from` -> 400.
- Differenza dalla 1: arresto ordinato (exit 0, log di stop), ma **nessun beneficio per la run in volo**: l'arresto pulito non attende ne' salva la run.

### Prova 4 — Watchdog (timeout di inattivita')

Configurazione sicura, solo variabili d'ambiente documentate nel sorgente (sorgente di Warren intatto):
`WARREN_RUN_HEARTBEAT_TIMEOUT_MS=20000 WARREN_WATCHDOG_TICK_MS=3000`. Log di boot:
`"run watchdog running","tickMs":3000,"heartbeatTimeoutMs":20000,"terminalReconcileGraceMs":120000,"cancelReconcileGraceMs":15000`.
Stub `[hang=1] [wip_commit=1]`: modifica + commit wip + `NOTES-uncommitted.txt`, poi `sleep 3600` senza output.

- Evento `watchdog.timed_out {"idleMs":20125,"heartbeatTimeoutMs":20000}`; run `failed failure=timed_out` dopo **18 s** dall'inizio del polling
  (~20 s dall'ultimo evento). Il `sleep 3600` e la sandbox sono terminati (`MORTO`), nessun residuo.
- **(a)** il commit wip e' **pushato** (`refs/heads/warren/run_a10r9... = 19e4f7d wip(ISSUE-1)`, `commitsAhead:1`); il file non committato e' perso;
  **nessuna PR**, nessun rescue ref (il push e' riuscito, quindi il salvage non scatta). **(b)** stato corretto, nessuna retry (la causa `timed_out`
  non e' infra-lost). Nessun intervento manuale. **(c)** nessuna ripresa.
- Limite: il default (45 min) e' molto largo; con un agente che emette eventi continuamente (cicli di tool) il watchdog non interviene mai
  (nessun tetto assoluto trovato nel codice, UNVERIFIED).

### Prova 5 (extra) — salvage reale e `warren run --rescue-from`

Il bare repo rifiuta con un hook `pre-receive` il push di `refs/heads/warren/run_*` (passa `warren/rescue/*`); stub `[slow=3]`.

- Run: `failed failure=finalize_failed salvageRef=warren/rescue/run_vyqjp...`; eventi `reap_failed {"step":"branch_push"}`,
  `reap.workspace_salvaged {"rescueRef":"warren/rescue/run_vyqjp...","bundlePath":null}`, `reap.workspace_destroyed`. Il bare repo ha
  `refs/heads/warren/rescue/run_vyqjp... = 1dd1eb5 fix(ISSUE-1)...`. **(a) lavoro recuperato** (in questo caso il commit c'era).
- Rimosso l'hook, `warren run --rescue-from run_vyqjp...`: exit 0, nuova run `run_1f9sb...` `succeeded`, **branch =
  `warren/rescue/run_vyqjp...`** (spinge sullo stesso branch di rescue, `commitsAhead:1`); evento `reap.pr_open_skipped {"reason":"branch_is_base"}`:
  **nessuna PR aperta** dal rescue. Nessun `retryOf` fra le due run (il legame e' solo implicito nel branch). **(c)** il rescue rilancia il
  prompt originale in una nuova run: non e' una ripresa di sessione.
- Il `salvage_ref` si valorizza solo quando il push di reap fallisce: **non** per kill -9 (prova 1/3), non per crash dell'agente (prova 2),
  non per timeout riuscito (prova 4). Per i guasti "crash" il rescue non e' quindi disponibile.

## 4. Tabella riassuntiva

| Prova | (a) file/worktree | (b) stato issue/run | (c) sessione | Duplicati | Intervento manuale |
|---|---|---|---|---|---|
| 1 `kill -9` server | workspace su disco finche' il server e' fermo; **distrutto al riavvio**, nulla pushato ne' salvato (anche commit locali persi) | resta `running` nel DB a server fermo; al riavvio `failed/sandbox_run_lost` + **1 retry** da zero, `succeeded`, 1 PR | non ripresa (retry da zero); stub: non misurabile | nessuna PR/run in piu' (solo la retry prevista) | riavviare il server; copiare a mano il workspace prima del riavvio se serve; `--rescue-from` NON applicabile (no salvage) |
| 2 `kill -9` agente | non committato perso; commit wip pushato (+ PR aperta anche se `failed`) | immediato `failed/provider_error`, **0 retry** | nessuna ripresa | nessuno | nessuno per lo stato; nuova run a mano per rifare il lavoro; `--rescue-from` 400 |
| 3 SIGTERM server | come 1 (stop in 5,1 s, exit 0, run non finalizzata ne' salvata) | come 1 | come 1 | nessuno | come 1 |
| 4 watchdog (20 s) | commit wip pushato, non committato perso, nessuna PR | `failed/timed_out` in ~20 s, 0 retry | nessuna | nessuno | nessuno |
| 5 salvage + rescue | recuperato su `warren/rescue/<id>` | `failed/finalize_failed`; rescue = nuova run `succeeded` | rilancio del prompt, non ripresa | nessuna PR (`branch_is_base`) | `--rescue-from` dopo aver rimosso la causa del push |

## 5. Limiti e discrepanze

- **Stub, non Claude Code:** (c) non e' misurabile; con un agente vero la nuova run non ha memoria della conversazione (CODE). Il costo
  riportato e' fisso (0,000421) e non significa nulla per i test di costo di S06. Non provati: reale API esterna indisponibile, errore
  transitorio del provider, test CI ripetutamente fallito (parti della traccia fuori dallo scopo di questa prova).
- **Discrepanza con la documentazione:** `docs/quickstart.md` ("the instance resumes where it stopped") e' vera per stato/progetti ma
  **non** per le run in corso: vengono marcate `failed/sandbox_run_lost` e rieseguite da zero (una sola volta). Il lavoro non pushato dello
  workspace (anche committato) e' distrutto al riavvio, senza salvage: il salvage-before-destroy vale solo per il percorso di reap, non per il
  riconciliatore del boot (CODE e TESTED).
- **Nessun supervisore:** `warren serve` non si riavvia da solo (qui riavviato a mano). Il comportamento sotto `warren up`/docker/k8s non e' stato provato
  (UNVERIFIED); il commento del codice dice che sotto k8s il pod puo' sopravvivere e fare salvage in-pod.
- **PR su run fallita:** nella prova 2 con commit wip la run e' `failed` ma una PR e' stata aperta dal forge finto (`reap.pr_opened`). Va tenuto presente
  per la revisione umana (e con un forge vero potrebbe creare rumore o PR parziali).
- **Retry unica e silenziosa:** la retry riusa il prompt e non porta il lavoro precedente; con un agente vero ripagherebbe i token (il tetto e' ereditato meno
  la spesa). Il budget dipende dalla spesa registrata della prima run; con run uccisa nel bel mezzo la spesa registrata puo' essere ~0 (qui 0).
- **Eventi e tempi:** gli eventi della run originale restano nel DB (5-8 eventi), quelli del run store in memoria sono persi (`deletedEvents: 0` nel destroy
  al riavvio). `provider_error` con `provider:"anthropic"` e' un'etichetta di classificazione, non una chiamata.
- **Condizioni dei tempi:** riavvio dopo 34 s per scelta della prova; l'avvio e la riconciliazione richiedono ~1 s. Non misurato cosa accade con
  riavvii ripetuti o con piu' run concorrenti in volo (UNVERIFIED).
- **Pulizia:** a fine prove nessun `bun`/`warren`/`bwrap`/stub residuo, porta 18080 libera, bare repo e cartelle `~/live-runs/recovery-*` cancellati,
  `~/stub-bin-slow` rimosso. Nessun file `.credentials.json` sotto le data dir.
