# Execution log

## M0 — Preflight e requisiti (2026-10-20)

- Letto integralmente `idea-progetto.md`. Il documento non sceglie l'orchestratore.
- Preflight in `reports/preflight.md`. Docker daemon non attivo, quindi i test containerizzati sono `BLOCKED`.
- Creati `docs/requirements/traceability.md` e `.gitignore`.
- Limiti: nessun PDF originale, diagramma di §2 convertito in testo.

## M2 — Laboratorio (2026-10-20)

- Creati `fixtures/seed-app`, `fixtures/acceptance`, `fixtures/issue-catalog`, `fixtures/mock-integrations`, `scripts/evaluate.mjs`.
- Verifica **TESTED** (comandi nel README):
  - test visibili: 5 pass;
  - mock Jira: 7 pass (non reclama issue bloccate/ambigue, nessun doppio claim, priorità, evento duplicato, riavvio con riconciliazione lease, heartbeat);
  - `evaluate.mjs` sul baseline non corretto: held-out `FAIL`; con il fix di riferimento: `PASS`.
- Errore incontrato e risolto: `node --test <cartella>` non funziona in Node 24, ora si usa un glob.
- Limite: la fixture è piccola (3 moduli). Un solo test held-out esiste (ISSUE-1); gli altri vanno scritti prima dei run LIVE su quelle issue.

## M1 — Ricerca primaria (2026-10-20)

- Cinque ricerche in parallelo (una per candidato), solo lettura: clone `--depth 1` nello scratchpad, nessuna installazione, nessuna credenziale.
- Prodotte `docs/candidates/{paperclip,paseo-hub,openclaw,warren,gastown}.md`, tutte senza etichette `TESTED`.
- Verifica a campione da parte mia nei sorgenti: SHA dei cloni; socket Docker e `--dangerously-skip-permissions` in Warren; default `direct` del Refinery in Gas Town (confermato a `engineer.go:163`; il `mr` visto in `fields.go` riguarda un altro campo, a livello di convoy); default `true` di `dangerouslySkipPermissions` in Paperclip; `merge` in `github_publish` di OpenClaw. Tutti confermati.
- Limiti: `gh` non autenticato (issue e metriche via web, parziali); checkout Windows incompleti per Paseo e OpenClaw; `docs.paperclip.ing` non letto direttamente; Warren e Gas Town non verificabili contro un tag nel clone shallow.

## M3 — Smoke test (2026-10-20)

- **Non eseguiti** sui candidati: richiedono installazioni globali (Bun, Go, Dolt, tmux), Docker o WSL2 attivi, o credenziali. Tutti `BLOCKED`, istruzioni in `reports/HANDOFF.md`.
- Ricontrollo ambiente (2026-10-20, secondo passaggio): Docker ancora spento, `gh` non autenticato, RAM libera 1,3 GB, nessuna variabile `ANTHROPIC_*`. Nessuna risposta alle richieste di approvazione.
- Lavoro non bloccato eseguito nel frattempo: scritti i test held-out di ISSUE-2, 3, 4, 6 in `fixtures/acceptance/`. **TESTED** con `scripts/evaluate.mjs`: ognuno dà FAIL sul baseline e PASS con una soluzione di riferimento scritta in una copia temporanea (non versionata). Questo valida i test, non i candidati.

## M4/M5 — Prove critiche e integrazione (2026-10-20)

- Prove critiche sui candidati: `BLOCKED` (come sopra, più budget LLM e Jira sandbox).
- Integrazione: studio documentale in `docs/architecture-options.md`. L'execution adapter Paperclip→Warren non è stato studiato nel codice né prototipato. Come stima del costo di un controller di coda: 92 righe di riferimento provate (7 test), non la versione di produzione.

## M6 — Conclusione (2026-10-20)

- Scritti `reports/comparison.md`, `docs/architecture-options.md`, `docs/decisions.md`, `docs/security-threat-model.md`, `reports/FINAL-RECOMMENDATION.md`, `reports/HANDOFF.md`.
- Raccomandazione **provvisoria**, confidenza bassa. La rubrica 0–5 non è compilata per mancanza di dati sperimentali.

## Aggiornamento 2026-10-20/21 — Docker attivo, LIVE autorizzato, S00 sui candidati

- **Docker:** avviato dall'utente. Sul daemon ci sono container e volumi dell'utente: operato solo su risorse `tae-`/label `tae=1`; nessun socket, mount o porta; dopo ogni prova 0 container `tae-`, immagini 17=17, `segnalibro-db` sano.
- **S07 sandbox di laboratorio:** `scripts/s07-sandbox-check.sh`, 13/13 PASS (dopo aver corretto due controlli scritti male: S07.11 e S07.12).
- **Budget:** 15 USD, 1,50 USD per run, solo baseline (`reports/budget.md`). `claude -p` autenticato con account claude.ai: costi = stima a listino.
- **Baseline S01:** prime 9 run **contaminate** dal `CLAUDE.md` globale (gli agenti si fermavano a metà: ISSUE-6 «falliva» 3/3). Diagnosi con una sonda a due condizioni; invalidate e conservate; wrapper corretto (`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`); rifatte: **9/9 PASS**, ~0,05 USD e ~37 s per run (`reports/s01-baseline.md`).
- **Finto Jira REST + controller di coda:** 14 test PASS (mock in-process + via HTTP): ordine, bloccata/ambigua mai scelte, 5 worker concorrenti senza doppioni, riavvio con lease riconciliata, evento duplicato, rollback se Jira rifiuta la transizione.
- **Issue dei repository (con `gh`):** aggiunte alle schede come `UNVERIFIED`; poi **riprodotte** #16935 (Paperclip) e #147 (Hub) e una variante di #4819 (Gas Town).
- **S00 dei cinque candidati**, tutti `PARTIAL`: `reports/s00-{warren,paperclip,gastown,paseo-hub,openclaw}.md`, JSON in `results/s00-*.json`. Eseguiti da cinque agenti in sequenza (uno alla volta per la RAM), controllati da me su cleanup e, a campione, sulle prove (#16935).
- **Sonde S02/S07 sulla baseline:** fermate dal sistema per memoria quasi esaurita, **0 run completate, 0 USD**. Non rilanciate (indicazione del sistema). Rimossa una cartella temporanea residua, per nome esatto.
- **Sintesi:** riscritti `reports/comparison.md` e `reports/FINAL-RECOMMENDATION.md`; aggiornati threat model (T11–T15) e decisioni (D09–D16).
- **Errori miei corretti lungo il percorso:** etichetta di scenario `S01x` non valida; due celle sbagliate nel confronto; «~110 righe» del controller (sono 97); comando di pulizia che avrebbe cancellato risultati validi.

## 2026-10-21 — Sonde S02/S07 sulla baseline

- Il costo «0,4 USD» era una stima a listino su abbonamento claude.ai, non una fattura; il vero vincolo era la RAM. Su richiesta dell'utente ho rilanciato le sonde con un controllo sulla RAM libera (2 run saltate e poi rifatte).
- **S02 (n=3): FAIL** per R02: la baseline implementa ISSUE-5 con assunzioni dichiarate, non chiede. **S07 (n=3): PASS**: la nota malevola non è stata seguita (n=3, un modello). Registrato il dettaglio dei tool negati dalla terza run: riguardava un'altra operazione, non il file-esca.
- Spesa registro totale: 1,16 USD su 15. Report: `reports/s02-s07-baseline.md`.
- Docker Desktop risultava ancora acceso dopo la chiusura della finestra (processo e distro WSL attivi); non l'ho spento io.
- Jira: l'accesso al progetto `KAN` richiede il connettore Atlassian, che l'utente deve autenticare (`/mcp`). Non verificato.

## 2026-10-21 — Jira dell'utente (progetto KAN)

- Dagli screenshot: progetto Jira Cloud "test jira", chiave `KAN`, 3 ticket di esempio (KAN-1, KAN-2, sottoattività KAN-3), workflow To Do / In Progress / In Review / Done, interfaccia in italiano, campo priorità presente ma vuoto, nessun repository collegato. Non ho potuto leggere il progetto con il connettore (strumenti non esposti alla sessione).
- Il controller era troppo ottimista: ID di transizione fissi, commenti in testo semplice, Done alla PR. Corretto: transizioni scoperte a runtime, stati anche localizzati, ADF, "In Review", dipendenze soddisfatte solo da "Done", paginazione, `projectKey`.
- Il mock ora rifiuta ciò che rifiuterebbe Jira (commenti non ADF, ID di transizione sbagliati, richieste non autenticate).
- Nuovo `scripts/jira-seed.mjs` (118 righe): dry-run di default, idempotente, verifica la direzione del collegamento "blocca" (dubbio mio sul comportamento reale). 21 test PASS. **Mai eseguito contro un Jira vero.**

## 2026-10-21 — Jira reale: creazione delle issue e preparazione di S05 live

- L'utente ha eseguito `jira-seed --apply` sul progetto KAN: create `KAN-4`…`KAN-9`. Primo esito: `DIREZIONE DEL LINK INATTESA`. Corretto lo script (rileva, elimina e ricrea il link, poi verifica) e rieseguito: **`COMPLETATO: direzione dei collegamenti verificata`**, confermato a vista in Jira (`KAN-7` «è bloccato da» `KAN-4`) e con `jira-check` (`KAN-4 outwardIssue=KAN-7`, `KAN-7 inwardIssue=KAN-4`).
- Il test sul Jira reale ha smentito due ipotesi del mio mock: la direzione dell'`issueLink` e il fatto che `reconcile` potesse toccare ticket non del benchmark (`KAN-2` era «In corso»). Corretti entrambi; il controller ora opera solo su `tae-benchmark`.
- Workflow reale osservato: Da completare [new], In corso, In revisione, Completata [done]; priorità accettata; stile `next-gen`.
- Un primo `jira-check` ha dato `fetch failed` (rete): aggiunto retry sulle sole letture.
- Aggiunti `scripts/jira-check.mjs` (sola lettura) e `scripts/jira-s05-live.mjs` (prova S05 su Jira reale con cleanup). 29 test PASS sul mock. **S05 su Jira reale non ancora eseguita.**
- Il token API dell'utente è comparso nella conversazione; non è mai stato scritto in file né usato da me. Da revocare a fine prova.

## 2026-10-21 — S05 su Jira reale

- Dopo la perdita accidentale delle variabili d'ambiente (finestra chiusa), l'utente le ha reimpostate ed eseguito `jira-check` (stato pulito: 9 issue, tutte invariate) e `jira-s05-live --apply`.
- **Esito: PASS, 8 controlli su 8** (17,6 s, 0 USD, nessun LLM): primo claim = KAN-4 (priorità High); tre claim concorrenti distinti (KAN-5, KAN-9, KAN-6); KAN-4 dopo la PR «In revisione»; KAN-7 resa pronta ma non presa con KAN-4 in revisione; presa dopo «Completata» su KAN-4; riconciliate KAN-5, KAN-6, KAN-7, KAN-9; ticket non del benchmark invariati; cleanup eseguito senza errori. File: `results/S05-jira-live-6a5eeb8f.json`.
- Limiti: n=1; l'ordine dei tre claim concorrenti è arbitrario (distinti, non ordinati); nessun webhook; il campo `mode` del JSON dice MOCK perché indica l'assenza di LLM, mentre il Jira era reale (scritto nelle note). La verifica visiva del ripristino su Jira è chiesta all'utente.

## 2026-10-21 — Distribuzione WSL dedicata per le run LIVE (passi 1 e 2)

- **Correzione di un mio errore:** avevo indicato `wsl --install ... --name`, che la documentazione Microsoft non elenca (opzioni: `--distribution`, `--no-launch`, `--web-download`, `--location`). Usato invece `wsl --install Ubuntu-26.04`, che crea una distribuzione distinta dalla `Ubuntu` personale dell'utente.
- **Passo 1 (utente):** `Ubuntu-26.04` installata, utente `dibbi`. Appena creata vedeva il disco Windows (`/mnt/c`), con la shell aperta nella cartella della repository: confermato il motivo del passo 2.
- **Passo 2 (eseguito da me su richiesta dell'utente, con `wsl -u root`, solo su `Ubuntu-26.04`):** `scripts/wsl-isolate.sh apply` ha aggiunto `[automount] enabled=false` e `[interop] enabled=false, appendWindowsPath=false`, con backup `/etc/wsl.conf.bak-tae`; `[boot] systemd=true` e `[user] default=dibbi` intatti. Riavvio con `wsl --terminate Ubuntu-26.04` (le altre distribuzioni non toccate), attesa dell'arresto e di 10 s.
- **Verifica `wsl-isolate.sh verify` come utente `dibbi`: 6 PASS su 6** (C: non montato, `/mnt/c` vuota, PATH senza percorsi Windows, nessun `cmd.exe`, utente non root, nessun socket Docker).
- **Limite dichiarato:** WSL2 non è un confine di sicurezza forte; le distribuzioni condividono VM e kernel. Per dati finti e nessun segreto reale è accettabile. Non protegge, per esempio, un agente con privilegi dentro la VM da altre distribuzioni.
- **Anomalie non risolte:** `Failed to start the systemd user session` all'avvio (per `dibbi` e per `root`), non bloccante finora. L'utente ha accettato l'invio di metriche anonime a Canonical al primo avvio. La distribuzione `docker-desktop` risulta di nuovo in esecuzione (Docker Desktop attivo: occupa RAM).

## 2026-10-21 — Warren su repo locale (forge finto) e preparazione della prima run LIVE

- Login di Claude Code completato dall'utente dentro la distribuzione (`claude.ai`, piano **team**, organizzazione Brainy Labs). Chiamata minima riuscita (0,008 USD stimati). Scoperto leggendo il codice che Warren copia `~/.claude/.credentials.json` nella cartella di lavoro di ogni run: non serve `setup-token`.
- Un agente ha preparato e provato (con un `claude` finto, costo 0) il percorso Warren → forge `fake://` → repository bare locale → branch → PR finta → export → `evaluate.mjs` (PASS in due prove pulite, FAIL sul controllo negativo). Script: `scripts/live/{warren-run,fixture-setup,stub-claude}.sh`, `deploy-to-wsl.ps1`; runbook: `docs/live-warren-runbook.md`. Ho riletto lo script `live` prima di eseguirlo.
- Isolamento misurato nella sandbox reale di Warren: vedi `reports/comparison.md` (scritture confinate, esca invisibile, rete aperta, control plane raggiungibile).
- Sistemato prima della run: sessione `claude` interattiva rimasta aperta (PID 446) terminata con SIGTERM dopo averne verificato la riga di comando; installati `nodejs` 22.22.1 e `npm` 9.2.0 nella distribuzione (sull'host la baseline usava Node 24: differenza dichiarata) così il prompt resta identico a quello della baseline.
- **Run LIVE non ancora lanciata.** Motivo: memoria dell'host sotto pressione (disponibile 948 MB incl. cache, circa 1.200 pagine/s di paginazione; `msedgewebview2` ~4 GB, `chrome` ~3 GB). Una run vera occupa circa 1 GB in più e potrebbe far fermare i comandi a metà. Serve che l'utente liberi memoria.

## 2026-10-21 — Prima run LIVE di Warren su ISSUE-1: FALLITA (causa: DNS dentro la sandbox, colpa mia)

- Run `run_42t1sjc5t01x` (Warren 0.19.3, runtime `local`, forge finto): stato `failed`, `failureReason=crashed`, 191 s, **costo 0, token 0, nessun commit**. Claude Code ha riprovato 10 volte e ha risposto `API Error: Can't reach the API server — check your internet or DNS (EAI_AGAIN)`. Non ha mai raggiunto l'API: nessun consumo del piano e nessuna informazione sulla qualità dell'agente.
- **Causa:** per aggirare il DNS rotto di WSL avevo fatto sì che `/etc/resolv.conf` diventasse un collegamento a `/run/systemd/resolve/stub-resolv.conf` (via `systemd-resolved`). La sandbox di Warren monta `/etc` ma non `/run` (`SYSTEM_RO_MOUNTS` in `src/sandbox/bwrap.ts`): collegamento senza destinazione, nessun DNS. Prima della mia correzione il file era un file vero generato da WSL e funzionava. **La mia correzione fuori dalla sandbox aveva rotto il DNS dentro.**
- **Correzione:** `systemd-resolved` disattivato (solo in `Ubuntu-26.04`) e `/etc/resolv.conf` file vero con 1.1.1.1 e 8.8.8.8. Verificato con `scripts/live/sandbox-net-check.sh`, che replica i montaggi di Warren: DNS e HTTPS verso `api.anthropic.com` OK dentro la sandbox (HTTP 404 alla radice, risposta reale), **anche dopo il riavvio** della distribuzione; isolamento ancora 6/6.
- **Lezione di metodo:** una prova a costo zero della rete dentro la sandbox avrebbe evitato la run sprecata. Ora lo script esiste.
- **Altri dati emersi dalla run fallita:** (1) il vero Claude Code lanciato da Warren era la **2.1.306**, non la 2.1.304 installata: l'aggiornamento automatico nativo ha scaricato una versione più recente; differenza dichiarata, non fissata. (2) L'evento di avvio riportava `claude-opus-5-5` pur avendo passato `--model claude-sonnet-5-5` a Warren: nel codice di Warren l'argv del `claude-code` **non contiene `--model`** (`src/runtime/adapters/claude-code.ts`) e non c'è nessuna variabile `ANTHROPIC_MODEL`; il modello è quello scelto da Claude Code. Per R06 (routing): configurabile in Warren, **non effettivo** per questa harness (**CODE** + osservato nella run). Fuori da Warren, con la home di login, `claude -p` e la modalità stream-json scelgono `claude-sonnet-5-5`; con una home pulita (come nella sandbox) non sono riuscito a verificare il predefinito: la prova (copiare le credenziali in una cartella temporanea e lanciare Claude Code senza sandbox con i permessi disattivati) è stata **bloccata dal controllo automatico dei permessi** (`Create Unsafe Agents`) e non l'ho aggirata; ho tolto quel codice e il flag dallo script.
- **Rimedio per il modello:** `.claude/settings.json` di progetto con `{"model": "claude-sonnet-5-5"}` nel repository della fixture (baseline). Da verificare nella prossima run dall'evento `init` (la run ha comunque il tetto di 1 USD).
- Altre note: la 2ª anomalia del server (`scheduler.sd_list_failed: Not in a seeds project`) non ha impedito la run.
