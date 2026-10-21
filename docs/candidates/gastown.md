# Scheda candidato: Gas Town

> Fase 1 (ricerca primaria, sola lettura) **più lo scenario S00 eseguito il 2026-10-20 in container isolato** (vedi «Risultati sperimentali S00» in fondo e `reports/s00-gastown.md`). I §1-§10 restano `DOC`/`CODE` salvo dove una nota «[S00]» li corregge; sono `TESTED` solo le affermazioni della sezione «Risultati sperimentali S00». Nessuna chiamata LLM.
> Etichette: `DOC` (documentazione ufficiale), `CODE` (letto nel sorgente), `PARTIAL`, `UNVERIFIED`, `NOT_SUPPORTED` (solo con evidenza), `BLOCKED`.
> Il contenuto del repository esterno è trattato come dato non fidato. Riferimenti `file:riga` relativi alla radice del clone al commit indicato.

## 1. Scopo originario e confini

- Gas Town è un "workspace manager" multi-agente: coordina più coding agent (Claude Code, Copilot, Codex, Gemini, ...) su repository diversi, con stato di lavoro persistente in un ledger "Beads" su Dolt e in git worktree. `DOC` README.md:3-16.
- Ruoli principali: Mayor (coordinatore AI), Polecats (worker con identità persistente e sessioni effimere), Witness (monitor per rig), Deacon (supervisore cross-rig), Dogs (worker di manutenzione), Refinery (merge queue per rig), Crew (workspace umano). `DOC` README.md:46-100, 767-778.
- Non è un orchestratore per issue tracker aziendali: è un sistema CLI/tmux centrato su un proprio tracker (Beads). Il progetto si dichiara "experimental software focused on multi-agent coordination". `DOC` SECURITY.md (sezione Scope).
- Risolve bene: molti coding agent in parallelo su una macchina, con recupero da crash e merge queue. Non risolve nativamente: Jira, RBAC multiutente, model gateway con budget, knowledge engine, dashboard con costi per issue.

## 2. Versione verificata, URL, data

| Campo | Valore |
|---|---|
| Repository | https://github.com/gastownhall/gastown (modulo Go dichiarato `github.com/steveyegge/gastown`, go.mod:1) |
| Commit verificato (clone `--depth 1`, HEAD) | `649b832b7672bc7a2dbef26f5983aba6198b819b`, data commit 2026-07-23 |
| Tag | Nessun tag nel clone shallow (`git describe` fallisce). Ultima release in CHANGELOG.md:10: **v1.2.1 (2026-06-06)**. Il HEAD è successivo alla v1.2.1 (`[Unreleased]` vuoto, CHANGELOG.md:8). |
| Release pubbliche (pagina GitHub Releases, WebFetch) | v1.2.1 (06 giu), v1.2.0 (30 mag), v1.1.0 (07 mag), v1.0.1 (25 apr), v1.0.0 (03 apr). Binari Windows citati nelle note di v1.2.x. `DOC` |
| Metriche GitHub (WebFetch, non autenticato) | ~18,4k stelle, ~1,7k fork, 377 issue aperte, 131 PR aperte. Le stelle non sono un criterio di scelta. |
| Data consultazione | 2026-10-20 |
| Limite | `gh` non autenticato: non ho analizzato le singole issue. Il numero di issue aperte è solo un indicatore di attività/maturità. |

Nota di compatibilità: la release v1.2.0 richiede Dolt >= 2.0.7 e `bd` v1.0.4 (versioni più nuove di `bd` fanno uscire `gt`). `DOC` (pagina Releases, v1.2.0). Dipendenza fragile fra progetti dello stesso autore.

## 3. Licenza, dipendenze, runtime, maturità

- Licenza: **MIT**, copyright 2025 Steve Yegge. `CODE` LICENSE:1-3. Obbligo rilevante: conservare l'avviso di copyright. Le licenze di dipendenze Go, Dolt e Beads non sono state verificate (`UNVERIFIED`).
- Linguaggio: Go 1.26.2 (go.mod:3). `CODE`.
- Prerequisiti nativi (README.md:129-137, docs/INSTALLING.md): Git >= 2.20, Go >= 1.26.2, **Beads `bd` >= 0.57.0**, sqlite3, ICU4C (build da sorgente con query layer ICU), **tmux >= 3.0** (richiesto da `gt up` e dai ruoli tmux-backed: Mayor, Witness, Refinery, polecats), **Dolt** (SQL server per town, porta 3307, avviato dal daemon, nessun fallback embedded: docs/design/architecture.md:148-165), Claude Code CLI (runtime predefinito). `DOC`/`CODE`.
- Alternativa Docker: l'immagine include Go, Dolt, `bd`, tmux; il compose usa `no-new-privileges`, `cap_drop: ALL` e poche `cap_add` (docker-compose.yml:12-22). `DOC` docs/docker.md.
- Maturità: attività alta (7.770 commit secondo la pagina repo, release regolari, CHANGELOG esteso), ma SECURITY.md ha una tabella versioni obsoleta ("0.1.x") e il progetto si dichiara sperimentale. Parte dei design doc è marcata "Proposal" o "In Progress" (es. docs/design/sandboxed-polecat-execution.md:3-5): distinguere sempre design da funzionalità implementate.

## 4. Architettura

- **Town** (`~/gt`): directory radice con config, Dolt, daemon. **Rig**: contenitore di un repo git. `DOC` README.md:52-58.
- **Storage**: un solo Dolt SQL Server per town, un database per rig/hq; gli agenti scrivono su `main` con transazioni; il daemon controlla il server a ogni heartbeat e lo riavvia (docs/design/architecture.md:148-170; docs/design/dolt-storage.md:19). `DOC`.
- **Beads** (`bd`): tracker git-backed con ID `prefisso-xxxxx` (README.md:80). Due livelli: town (`hq-`) e rig (docs/design/architecture.md:5-30). `DOC`.
- **Processi**: Daemon Go (heartbeat 3 min) -> Boot (agente AI di triage) -> Deacon (agente AI di pattuglia) -> Witness e Refinery per rig (README.md:620-629). `DOC`. Gli agenti AI girano in sessioni tmux. `DOC`/`CODE` (internal/tmux).
- **Comunicazione**: mail asincrona (`gt mail`), `gt nudge` per messaggi immediati, eventi `.events.jsonl`, `gt seance` per interrogare sessioni precedenti (README.md:106-113). `DOC`.
- **Hook**: worktree git + bead agganciato all'agente; `gt prime` ricostruisce il contesto a ogni avvio (README.md:68-70, 718-727). `DOC`.
- **Scheduler**: `scheduler.max_polecats` abilita dispatch differito con limite di concorrenza gestito dal daemon; default dispatch diretto (docs/design/scheduler.md:1-50, README.md:663-674). `DOC`.
- **API/SDK**: trovata la CLI `gt`/`bd`, una dashboard web htmx (README.md:599-618) e un proxy mTLS (`cmd/gt-proxy-server`, docs/proxy-server.md). `DOC`/`CODE`. L'assenza di una API di controllo programmatica è `UNVERIFIED` (non ho esaminato tutto `internal/web`).
- **Telemetria**: log e metriche OTLP (VictoriaMetrics/VictoriaLogs di default), variabili `GT_OTEL_*` (README.md:702-716; docs/otel-data-model.md). `DOC`.

## 5. Coding agent e provider LLM

- Preset integrati: `claude`, `gemini`, `codex`, `kiro`, `cursor`, `auggie`, `amp`, `opencode`, `copilot`, `pi`, `omp` (README.md:507). `DOC`. Template hook per claude, codex, copilot, cursor, gemini, omp, opencode, pi, vibe in `internal/hooks/templates/`. `CODE`.
- **Claude Code è il runtime predefinito** (README.md:137). Integrazione con `settings.json` passato via `--settings`, con hook di lifecycle per mail e avvio (README.md:471; docs/HOOKS.md:1-30). `DOC`.
- **Limite per la nostra sicurezza**: i template Claude impostano `"permissions": {"defaultMode": "bypassPermissions"}` e `skipDangerousModePermissionPrompt: true` (internal/hooks/templates/claude/settings-autonomous.json:2,8-10; analogo per `settings-interactive.json`). `CODE`. Gli agenti girano senza conferme, con i permessi dell'utente host. Coerente con SECURITY.md ("Workers run in separate tmux sessions but share filesystem access"; "Agents execute shell commands as the running user").
- Runtime senza hook (Codex) ricevono un fallback via "nudge" di avvio (README.md:474-476). `DOC`.
- Provider LLM: nessun gateway proprio; dipende dalla CLI dell'agente scelto. Alias custom: `gt config agent set claude-glm "claude-glm --model glm-4"` (README.md:524-531). `DOC`. Chiamate dirette alle API LLM nel core: non individuate (`UNVERIFIED`, non esaustivo).
- Limiti d'uso Claude: il daemon ispeziona il pane tmux per segnali di usage-limit prima di riavviare l'agente (CHANGELOG.md:36-41). `DOC`.

## 6. Ruoli, task, deleghe, DAG, scheduling, collaborazione, stato

### Mapping Beads / Convoys / Molecules / ruoli verso issue Jira (analisi concettuale, nessun test)

| Concetto Gas Town | Natura | Equivalente nel nostro modello | Note |
|---|---|---|---|
| **Bead / issue** (`gt-abc12`) | Unità di lavoro nel ledger Dolt; "bead" e "issue" sono sinonimi (README.md:80). `DOC` | Issue Jira (1:1 se creata per mirror) | Nessuna sincronizzazione con Jira. Serve un adapter che crei un bead per ogni issue e conservi la chiave Jira in un campo/label. Campi custom: `UNVERIFIED`. |
| **Convoy** (`hq-cv-*`) | Unità di tracking persistente per un insieme di bead, anche cross-rig; si chiude quando tutte le issue tracciate sono chiuse (docs/concepts/convoy.md:1-80). `DOC` | Epic Jira / feature / batch | Convoy `mountain`: stall detection e skip logic per epic (README.md:74). `DOC` |
| **Formula** (TOML) | Template di workflow con `[[steps]]` e `needs` (README.md:384-421). `DOC` | Procedura (non è una issue) | I `needs` formano un DAG di step interni a una singola unità di lavoro. |
| **Molecule / wisp** | Istanza di formula: root-only wisp (step letti dal formula embedded) o poured wisp (step materializzati con checkpoint) (docs/concepts/molecules.md:1-30). `DOC` | Checklist/piano di esecuzione di una issue | Non sono task Jira. |
| **Epic con dipendenze + `gt convoy stage/launch`** | Valida il DAG, calcola le wave (Kahn), lancia la wave 1; il ConvoyManager alimenta le successive (docs/design/convoy/mountain-eater.md:16, 105-107, 375-381). `DOC` (design doc) | DAG di task con dipendenze (R03) | Stato di implementazione non verificato in `internal/convoy`: `PARTIAL`. |
| **Mayor** | Coordinatore AI: riceve richieste umane, crea convoy, fa `sling` (README.md:48-50, 742-752). `DOC` | Orchestrator / Team Leader (parziale) | È un agente LLM, non uno scheduler deterministico. |
| **Polecat** | Worker con identità persistente e sessione effimera, un worktree per assegnazione; IDLE -> WORKING -> DONE (docs/concepts/polecat-lifecycle.md:11-45). `DOC` | Developer | Catalogo ruoli fisso. |
| **Witness / Deacon / Dogs** | Osservazione, recupero, manutenzione (README.md:86-92). `DOC` | Parte dell'Agent Supervisor (R10) | Boot/Deacon/Witness sono agenti AI; solo il daemon è codice Go deterministico (README.md:624-629). |
| **Refinery** | Merge queue per rig (vedi §9). `DOC`/`CODE` | Integrator (parziale) | Merge diretto per default. |
| **Crew** | Clone personale dell'umano (README.md:60-62). `DOC` | Sviluppatore umano | Nessun modello utenti/ruoli. |

Per un flusso Jira -> PR serve un Issue Queue Controller esterno che crei i bead, chiami `gt sling`/`gt convoy`, rilegga lo stato e aggiorni Jira. Un `grep -ri jira` sull'intero clone trova solo `.beads/backup/issues.jsonl` e `.beads/config.yaml` (dati interni del tracker del progetto), nessun codice o doc di integrazione: **NOT_SUPPORTED nativamente** (evidenza: ricerca testuale completa al commit indicato; non esclude estensioni terze).

### Altri aspetti

- **Anti-duplicazione/lease (R01)**: `gt sling` rifiuta un bead già `pinned/hooked/in_progress` senza `--force`; se l'agente agganciato ha sessione morta forza il re-sling automaticamente (internal/cmd/sling.go:644-693, 790-793). `CODE`. È un guard sullo stato nel database, non un lease con scadenza: `PARTIAL`. Atomicità del claim con processi concorrenti: `UNVERIFIED`.
- **Scheduler (R05)**: capacità massima di polecat, pausa/ripresa (README.md:663-674). `DOC`. Priorità/rischio/dipendenze nello scheduling: `UNVERIFIED` (docs/design/scheduler.md non letto per intero).
- **Collaborazione tra agenti**: mail, nudge, seance (README.md:106-113). `DOC`. Messaggi non tipizzati.
- **Stato persistente**: ledger Dolt + worktree + eventi. `DOC`/`CODE`.
- **Team dinamico (R04)**: ruoli predefiniti; esiste un design `docs/gas-city/crew-specialization-design.md` (non letto) e `--prefer-skill` (docs/why-these-features.md:94). Analyst/Architect/QA/Reviewer/Knowledge Curator non sono ruoli nativi. `PARTIAL` tramite formule e direttive.
- **Estensioni**: direttive di ruolo e overlay di formule senza patchare il Go (docs/design/directives-and-overlays.md; docs/contrib-harnesses/README.md:1-12), sistema di plugin con 13 plugin inclusi in `plugins/` (docs/design/plugin-system.md). `DOC`/`CODE`.

## 7. Locale/remoto, sandbox, sicurezza, auth, RBAC

- **Locale**: ruoli in sessioni tmux sullo stesso UID dell'utente (docs/design/sandboxed-polecat-execution.md:13-17). `DOC`.
- **Remoto/background (R08)**: il daemon può tenere gli agenti attivi su una macchina sempre accesa (es. server Linux o Docker). Worker remoti distribuiti non nativi. Il design "daytona" con proxy mTLS è una **proposta** (docs/design/sandboxed-polecat-execution.md:3-5, §3.3); esistono `cmd/gt-proxy-server` e `gt-proxy-client` (`CODE`, stato d'uso `UNVERIFIED`). `PARTIAL`.
- **Sandbox**: `exec_wrapper` nelle impostazioni runtime del rig antepone un wrapper al comando agente (internal/config/loader.go:2255-2257, 2308-2309, 2721-2729). `CODE`. Profili exitbox/daytona descritti solo nella proposta (sandboxed-polecat-execution.md:158-169). Immagine Docker del progetto: container non privilegiato con capability ridotte, dashboard esposto su porta host come "trusted local-network surface" (README.md:277). `DOC`.
- **Permessi per ruolo (R04/R10)**: applicazione debole.
  - Template Claude con `bypassPermissions` (§5). `CODE`.
  - Guardie `PreToolUse` per `gh pr create`, `git checkout -b`, `git switch -c` (guard `pr-workflow`) e per comandi pericolosi (`sudo`, `apt install`, `rm -rf`, force push, `git reset --hard`, `git clean`) (settings-autonomous.json:15-80; internal/cmd/tap_guard.go:14-60). `CODE`. Sono pattern di comando, aggirabili: non sono un confine filesystem/OS.
  - Le restrizioni di ruolo (es. Witness "non fa implementazione", "do NOT auto-nuke polecats with unpushed work") stanno nei prompt/template (templates/witness-CLAUDE.md:10, 60, 88). `CODE`. Non applicate dall'infrastruttura: per S03 sarebbe un limite (prompt-only).
  - RBAC utente, SSO, audit multiutente: non trovati nella documentazione consultata. `UNVERIFIED` (assenza non dimostrata con ricerca esaustiva).
- **Attenzione critica**: la guardia `pr-workflow` dichiara che "Gas Town workers push directly to main. PRs add friction that breaks the autonomous execution model" (internal/cmd/tap_guard.go:38-40). Il comportamento predefinito è l'opposto di R12 e blocca `gh pr create` ai polecat salvo overlay opt-in (§9).
- **E-stop**: sentinella `ESTOP` nella root della town; congela gli agenti (SIGTSTP) e il daemon non li riavvia; il Mayor è esente (internal/estop/estop.go:1-12). `CODE`. Esiste `estop_windows.go`. Efficacia reale: `UNVERIFIED`. **[S00]** `gt estop`, `gt estop status`, `gt estop --rig`, `gt thaw` esistono e funzionano sul sentinel (`TESTED`), ma con sessioni tmux finte (`sleep`) il `SIGTSTP` inviato al gruppo di processi del pane **non ha fermato il processo** (resta `S+`; `SIGSTOP` a mano sì), pur con il messaggio «1 session(s) frozen». Causa probabile (non provata): gruppo di processi orfano. Con un agente reale `UNVERIFIED`.

## 8. Retry, checkpoint, recovery, idempotenza, cancellazione, timeout, budget

- **Recovery di sessione/worktree**: hook + worktree persistono; `gt prime` ripristina il contesto; il Witness classifica GUPP Violation/Stalled/Zombie e fa nudge/handoff (README.md:587-597, 631-633). `DOC`.
- **Checkpoint**: poured wisps con step come sub-wisp e ripresa dall'ultimo step chiuso (docs/concepts/molecules.md:20-24); pacchetto `internal/checkpoint`. `DOC`/`CODE`. Con il default root-only non c'è checkpoint a livello step. `DOC`.
- **Crash loop**: 3 crash sulla stessa issue -> blocco, bug bead, escalation (docs/design/witness-at-team-lead.md:487-496; docs/design/polecat-lifecycle-patrol.md:313). `DOC` (design; implementazione `UNVERIFIED`). Backoff `PauseBackoff` 60s per pause da usage limit (CHANGELOG.md:36-41). `DOC`.
- **Daemon/Dolt**: heartbeat e riavvio automatico di Dolt con backoff (docs/design/architecture.md:166; docs/design/dolt-storage.md:19). `DOC`.
- **Distinzione S06**: sopravvivono worktree, branch e stato dei bead; la sessione conversazionale non viene ripresa: riparte una nuova sessione che ricostruisce il contesto da hook/mail (`gt prime`), con `gt seance` per interrogare sessioni precedenti (README.md:106-113). `DOC`.
- **Retry/timeout**: `retry_flaky_tests`, `poll_interval`, `max_concurrent` della merge queue (docs/reference.md:71-90). `DOC`. Limite di tentativi per task con cambio di strategia/modello: `UNVERIFIED`.
- **Cancellazione/stop**: E-stop, `gt scheduler pause`, kill di sessione. Supervisore che ferma un agente senza LLM: il daemon è Go deterministico, ma Boot/Deacon sono agenti AI. `PARTIAL`.
- **Costi (R06/R11)**: `gt costs` calcola il costo dai transcript di Claude Code (`~/.claude/projects/`) con prezzi per modello (internal/cmd/costs.go:50-56, 183-199), per ruolo/rig, attribuzione a work item (`--work-item`) e digest giornaliero in bead (costs.go:76-101). `CODE`. Separa input, cache creation e cache read (costs.go:183-185). `CODE`. Solo sessioni Claude Code; prezzi hardcoded "as of Jan 2025" (costs.go:198), potenzialmente obsoleti. **Nessun budget enforcement trovato** (`UNVERIFIED`). `gt quota` gestisce la rotazione di account per limiti di quota (internal/cmd/quota.go; internal/quota), non budget.
- **Routing modelli (R06)**: `role_agents` mappa ruolo -> alias agente (internal/config/types.go:64-69), `cost_tier` è informativo (types.go:98-104), `gt sling --agent` sovrascrive il runtime per singolo sling (README.md:499). `CODE`/`DOC`. Routing per step con pricing OpenRouter e benchmark: piano "In Progress" (docs/design/model-aware-molecules.md:1-40), non verificato come implementato. Escalation automatica: `UNVERIFIED`.

## 9. Tracker, Git/GitHub, PR, CI, MCP, logging, costi, dashboard

### Jira e altri tracker
- Nessuna integrazione nativa con Jira, Linear o Trello (§6). `NOT_SUPPORTED` nativo (grep completo). "Wasteland" (federazione via DoltHub, README.md:688-700) non è un adapter di tracker aziendale. `DOC`.
- Adapter esterno necessario: webhook/poll Jira -> `bd create` + `gt sling`, ritorno stato. Sforzo stimato (qualitativo, non misurato): medio, con dipendenza dalle CLI `bd`/`gt` e dal formato dati di Beads.

### Merge queue Refinery: auto-merge e come disattivarlo (punto critico)
- **Default: merge diretto sul branch base, senza PR.** `merge_strategy` "direct" (default) = merge locale `--no-ff` + `git push`; "pr" usa l'API del provider VCS (internal/config/types.go:1340-1343; internal/refinery/engineer.go:163-166, 632-660). `CODE`. Dopo i test (se `run_tests` non disattivato) il Refinery integra senza intervento umano (README.md:96, 651-661: "merges to main using a Bors-style bisecting queue"). `DOC`. **Viola il default desiderato R12 (PR pronta, senza merge automatico).** **[S00]** Default confermato a runtime (`TESTED`): `gt prime --dry-run` come Refinery stampa `merge_strategy = direct`, `require_review = false`. **Correzione**: in questo commit il merge lo esegue l'**agente LLM** che segue la formula `mol-refinery-patrol` (comandi `git merge`/`git push`/`gh pr create` nel prompt); `Engineer.ProcessMRInfo`/`ProcessBatch`/`LoadConfig` (engineer.go) non hanno chiamanti non-test in `internal/` (il motore Go citato sopra non è collegato alla CLI, `UNVERIFIED` fuori dal modulo), e `LoadConfig` legge `config.json` mentre `gt rig settings` scrive `settings/config.json`. Si passa a `pr` con `gt rig settings set <rig> merge_queue.merge_strategy pr` (`TESTED`), ma il comando scrive anche `enabled:false` e valori zero nello scheletro `merge_queue`.
- **`merge_strategy = "pr"`**: richiede una PR esistente per il branch, verifica che la head coincida con lo SHA dell'MR, poi chiama `MergePR(pr, "merge")` via provider (GitHub di default, Bitbucket; `vcs_provider`) (engineer.go:769-880). `CODE`. Rispetta la branch protection, ma **il Refinery effettua comunque il merge**.
- **`require_review = true`** (solo con `merge_strategy = "pr"`): senza approvazione umana il merge è rinviato ("awaiting human approval — deferring merge", `NeedsApproval`) (engineer.go:814-833; types.go:1349-1352; default false). `CODE`. È la configurazione più vicina a R12, ma dopo l'approvazione il Refinery mergia da solo. Per impedire qualunque merge automatico servirebbero permessi del token GitHub senza merge e/o branch protection; il comportamento del Refinery in quel caso è `UNVERIFIED`.
- **Per singola issue**: `gt sling --no-merge` ("Skip merge queue on completion (keep work on feature branch for review)") e `--review-only` (internal/cmd/sling.go:159, 169); campi `no_merge`, `review_only`, `merge_strategy=local` sul bead fanno rifiutare l'MR prima del merge (engineer.go:1005-1030; docs/design/scheduler.md:134; docs/CLEANUP.md:28). `CODE`/`DOC`. `gt done` con `no_merge` non richiede commit/MR (done.go:995-1010). `CODE`. Se il branch venga pubblicato e se si crei una PR: `UNVERIFIED`.
- **Disattivazione globale**: `merge_queue.enabled` esiste nelle impostazioni rig (docs/reference.md:71-72; engineer.go:104-105, 368-369). Effetto di `enabled=false` sul flusso `gt done`: `UNVERIFIED`.
- **Flusso PR**: harness opt-in `docs/contrib-harnesses/polecat-pr-flow` (direttiva di ruolo + overlay di `mol-polecat-work`) fa aprire ai polecat una PR GitHub prima di `gt done` ("open PRs, don't merge them yourself", README dell'harness, righe 1-25). `DOC`. Va riconciliato con la guardia `pr-workflow` che blocca `gh pr create` nel template Claude (settings-autonomous.json:16-23): se l'overlay la disattivi è `UNVERIFIED`; potrebbe servire un override hook in `~/.gt/hooks-overrides/` (docs/HOOKS.md:30-45).
- **Gate**: `run_tests`, `test_command`, `lint_command`, `build_command` configurabili; bisect su fallimento; `on_conflict` `assign_back`/`auto_rebase` (types.go:1355-1361; reference.md:71-90). `DOC`/`CODE`. Uso dello stato dei check CI esterni nel Refinery: `UNVERIFIED`.
- Provider VCS: GitHub e Bitbucket (`internal/github`, `internal/bitbucket`). GitLab: nessuna directory dedicata trovata, `UNVERIFIED`.

### Altro
- **MCP**: solo come funzionalità dell'agente (Claude Code); Gas Town non è un Tool Registry. Pacchetto PyPI `beads-mcp` (docs/design/architecture.md:298). `DOC`. Un MCP server malevolo è citato come minaccia nella proposta di sandbox (sandboxed-polecat-execution.md:13-17).
- **Dashboard (R09/R11)**: `gt dashboard` web (htmx, auto-refresh, command palette, porta 8080) e TUI `gt feed` con vista problemi (README.md:565-618). `DOC`. Mostra agenti, convoy, hook, code, issue, escalation. Costi per issue/budget nel dashboard: `UNVERIFIED`. Autenticazione del dashboard: non documentata ("trusted local-network surface", README.md:277). **[S00]** `TESTED`: **nessuna autenticazione**; pagina e API in lettura rispondono 200 senza credenziali e il token anti-CSRF delle POST è nella pagina stessa; `POST /api/run` esegue comandi `gt` in allowlist (anche `sling`, `rig add`, `mail send`, con `confirmed:true`), `POST /api/issues/create` ha creato un bead; con `IS_SANDBOX` il bind predefinito è `0.0.0.0`.
- **Escalation e intervento umano**: `gt escalate -s <sev>` con routing Deacon -> Mayor -> Overseer (umano) (README.md:639-649). `DOC`. Una Decision Inbox che aggreghi domande con alternative e raccomandazione: `UNVERIFIED`.
- **Logging**: `.events.jsonl`, `gt feed`, OTLP (§4). `DOC`.

## 10. Adeguatezza al nostro caso

### Copertura R01-R13

| Req. | Copertura | Etichetta | Cosa manca / note |
|---|---|---|---|
| R01 Jira, coda, lease | Coda propria (Beads + convoy + sling) con guard anti re-sling. Nessun Jira, webhook, readiness check, lease con scadenza | NOT_SUPPORTED (Jira nativo); PARTIAL (lock) | Adapter esterno obbligatorio; ownership dello stato Jira/Beads; riconciliazione eventi duplicati da costruire |
| R02 Analyst/intervista | Nessun ruolo Analyst; intervista strutturata non nativa | UNVERIFIED | Direttive/formule custom; Decision Inbox assente |
| R03 Planning DAG | Formule con `needs`, epic con dipendenze, `gt convoy stage` con wave (design doc) | PARTIAL | Nessun piano leggibile + verification contract + approvazione piano; il Mayor pianifica come LLM |
| R04 Team dinamico | Mayor/Polecat/Witness/Refinery/Crew/Dogs; specializzazioni in design | PARTIAL | Mancano Analyst, Architect, QA, Reviewer, Knowledge Curator nativi; permessi di ruolo non applicati dall'infrastruttura |
| R05 Orchestration Gateway | Daemon Go deterministico + scheduler a capacità + Witness/Deacon AI | PARTIAL | Scheduler deterministico solo per capacità; coordinamento affidato a agenti LLM |
| R06 Model Gateway | `role_agents`, alias, `--agent`; `gt costs` solo Claude | PARTIAL | Nessun gateway, budget, escalation verificati; pricing hardcoded; routing per step solo design |
| R07 Knowledge Engine | Beads/mail/seance/`gt prime`; niente Code Intelligence, Decision/Experience Memory con provenienza, Context Pack | UNVERIFIED / PARTIAL | Integrare Serena, memoria versionata, Context Builder |
| R08 Esecuzione remota | Daemon su macchina sempre accesa, immagine Docker, worktree; proxy mTLS/daytona in design | PARTIAL; test "PC spento" BLOCKED | Nessun worker pool remoto verificato; serve server/VM |
| R09 Collaborazione umana | Crew workspace, dashboard locale, escalation | PARTIAL | Nessun multiutente/RBAC/audit/auth dashboard; nessun handoff strutturato tra umani |
| R10 Quality & Security | Gate test/lint/build nel Refinery, bisect, E-stop, guard su comandi | PARTIAL | `bypassPermissions`, stesso UID, permessi di ruolo via prompt, nessun reviewer indipendente nativo; sandbox solo design/`exec_wrapper` |
| R11 Osservabilità | `gt feed`, dashboard, OTLP, `gt costs` | PARTIAL | Budget residuo, costo dei fallimenti, costo per issue accettata non verificati |
| R12 Autonomia / PR no merge | Configurabile (`merge_strategy=pr`, `require_review`, `--no-merge`) ma **default = merge diretto** e guard che blocca la creazione di PR | PARTIAL | Da provare in S01/S07; non esistono preset Plan Only/Supervised |
| R13 Estensioni | Direttive/overlay, plugin, formule, Wasteland; convoy cross-rig (`DOC`) | PARTIAL | Preview, valutazione continua, Tool Registry non verificati |

### Valutazione sintetica
- **Valore come riferimento**: hook/worktree persistenti, convoy/wave DAG, Witness/Deacon per recovery, merge queue bisecting, E-stop, OTEL. Il documento d'istruzioni (§8) lo indica come riferimento per DAG e collaborazione, non necessariamente come base.
- **Rischi**: (1) default di merge diretto su main; (2) `bypassPermissions` e stesso UID; (3) accoppiamento a tmux/Dolt/`bd` con versioni da fissare insieme; (4) supporto Windows nativo limitato; (5) ruoli e policy via prompt; (6) molti agenti LLM nel control loop (Mayor, Deacon, Boot), contro la preferenza per orchestrazione deterministica (idea-progetto.md §5); (7) progetto in forte evoluzione (377 issue aperte).
- **Integrazione**: adapter Jira + policy PR (`merge_strategy=pr`, `require_review`, overlay `polecat-pr-flow`, override hook) + sandbox (Docker/`exec_wrapper`) + budget esterno. Sforzo e rischio: medio-alto; sarebbe una piattaforma di esecuzione multi-agente "a una macchina", non un Control Plane aziendale. PoC e produzione vanno giudicati separatamente: possibile come PoC di esecuzione, non adatto alla produzione senza i punti sopra.
- **Gate bloccanti**: "impossibilità di impedire merge non autorizzati" va verificata; il default (merge diretto) lo viola, evitabile solo con configurazione corretta da provare in S07 (finora `BLOCKED`).

### Requisiti runtime per un test locale su Windows (non eseguito)
- **Nativo**: Git, Go 1.26.2+, Dolt (installazione separata), `bd` (`go install github.com/steveyegge/beads/cmd/bd@latest`, ma v1.2.0 richiede `bd` v1.0.4), `gt` (`go install ...@latest` o binario Windows da Releases). Build da sorgente con ICU: shell MSYS2 UCRT64/MinGW64 con `icu`, `toolchain`, `pkg-config`; PowerShell/MSVC non basta (README.md:178-191; docs/INSTALLING.md:90-101). `DOC`.
- **Limite dichiarato**: per workflow completi con tmux usare WSL o altro Linux; le shell Windows native sono ambienti CLI minimi (README.md:191; INSTALLING.md:101, 151: `--shell`, `gt up`, ruoli tmux e Mayor solo su macOS/Linux/WSL). `DOC`. Nel codice esistono file `*_windows.go` (tmux, estop, acp) e commenti su "psmux" come alternativa tmux per Windows (internal/config/loader.go:2294; internal/tmux/tmux.go:370, 1101). `CODE`. Supporto reale: `UNVERIFIED`.
- **Opzioni per il test**: (a) WSL2 Ubuntu con tmux, Dolt, Go, `bd`, `gt`, Claude Code; (b) Docker Desktop con `docker compose` (docs/docker.md; variabili `GIT_USER`, `GIT_EMAIL`, `FOLDER`; non montare home né socket Docker). Entrambe richiedono approvazione per installazioni. Non esiste un runtime MOCK documentato: un agente stub andrebbe definito (`UNVERIFIED`).
- **LIVE**: serve Claude Code con credenziali e budget approvato: `BLOCKED` fino ad approvazione.

## 11. Riferimenti e risultati sperimentali

Fonti primarie (clone al commit `649b832b7672bc7a2dbef26f5983aba6198b819b`, consultazione 2026-10-20):
- README.md (r.3-16, 46-118, 121-277, 454-481, 507, 565-718, 767-778); LICENSE; SECURITY.md; CHANGELOG.md (r.8-60).
- docs/INSTALLING.md (r.18, 90-101, 125, 151); docs/docker.md; docker-compose.yml (r.12-22); docs/HOOKS.md.
- docs/concepts/{convoy,molecules,polecat-lifecycle}.md; docs/design/{architecture,scheduler,model-aware-molecules,sandboxed-polecat-execution,witness-at-team-lead,polecat-lifecycle-patrol,dolt-storage}.md; docs/design/convoy/mountain-eater.md; docs/contrib-harnesses/polecat-pr-flow/README.md; docs/reference.md (r.71-90).
- Codice: internal/refinery/engineer.go (r.104-105, 163-175, 346-370, 632-660, 769-880, 1005-1030); internal/config/types.go (r.64-104, 1340-1361); internal/cmd/sling.go (r.159, 169, 614-693, 790-793); internal/cmd/done.go (r.995-1010); internal/cmd/tap_guard.go (r.14-60); internal/hooks/templates/claude/settings-autonomous.json (r.2-80); internal/cmd/costs.go (r.50-101, 183-199); internal/estop/estop.go (r.1-12); internal/config/loader.go (r.2255-2257, 2294, 2308-2309, 2721-2729).
- Web (WebFetch, 2026-10-20): https://github.com/gastownhall/gastown e /releases.

**Risultati sperimentali:** solo S00 (vedi la sezione «Risultati sperimentali S00» in fondo). S01-S10 restano `BLOCKED` (dipendono da agenti reali e, per LIVE, da budget Claude approvato); S05 richiede un adapter Jira minimo (mock Jira).

Prime prove consigliate quando sbloccato: (1) `merge_strategy=pr` + `require_review=true` su repo di prova con token a scope minimo, verificando che il Refinery non mergi senza approvazione; (2) `gt sling --no-merge` e verifica della PR; (3) race di due `gt sling` sullo stesso bead; (4) kill forzato di un polecat e di Dolt/daemon; (5) scrittura fuori dal worktree con `bypassPermissions`; (6) `gt costs --by-role` e verifica dell'assenza di budget enforcement.

## Segnalazioni dalle issue (consultate 2026-10-20 con `gh`; non riprodotte)

Etichetta: `UNVERIFIED` (segnalazione di terzi, non provata qui).

- **#4819 (aperta, 2026-09-05):** se Dolt non è raggiungibile, `gt done` tratta l'assenza di informazioni sul convoy come «workflow MR di default» e **ignora `--merge=local`**: nel caso riportato un bead da tenere sul branch è finito nella merge queue e il Refinery ha tentato un push diretto sul main protetto (bloccato da GitLab). Il reporter indica anche `main@649b832`, lo stesso commit studiato qui. Rischio per R12: un errore di infrastruttura può far ricadere il sistema sul percorso che integra. **[S00] Esito: PARTIAL.** Forma letterale (Dolt fermato prima di `gt done`) **non riprodotta** su `649b832`: `gt done` termina con `source issue validation failed ... Dolt server unreachable` e non pubblica il branch (fail-closed). **Variante riprodotta** (stato costruito a mano, senza `gt sling`): con un convoy `--merge=local` e la lettura del convoy nel town resa impossibile (`chmod 000 ~/gt/.beads`, DB della rig leggibile) `gt done` ha pushato il branch a `origin` ignorando `local`; con infrastruttura sana la strategia `local` è rispettata e non c'è push. Non provato lo scenario del reporter (Dolt che muore a metà di `gt done`).
- **#4442 (aperta):** nulla impedisce né rileva un merge con `--admin` che aggira branch protection e CI; il percorso del Refinery è pulito, ma un agente con privilegi potrebbe farlo (R10, R12).
- **#4475 (aperta):** `gt scheduler pause` tornerebbe attivo sotto il daemon in esecuzione, quindi la pausa non è durevole (R05.3).
- **Jira:** nessuna issue trovata sul tema. Conferma, senza dimostrarla, l'assenza di integrazione.

## Risultati sperimentali S00

Prova del 2026-10-20, modalità MOCK, **PARTIAL**. Dettaglio, comandi e log sanificati in `reports/s00-gastown.md`; dati in `results/s00-gastown-948d14dc.json`. Container `golang:1.26.2-bookworm` (digest `sha256:47ce5636e993...`), utente non root, `--cap-drop ALL`, 2 GiB, nessun mount né porta pubblicata, rete in uscita **non filtrata**. `gt` costruito dal commit `649b832`, `bd` v1.0.5, Dolt 2.0.7 (sha256 verificato), tmux 3.3a. Nessuna credenziale, nessun LLM, costo 0.

| Affermazione | Etichetta | Evidenza |
|---|---|---|
| Build di `gt` (`make build` + `make install`), `bd` (`go install @v1.0.5`), Dolt (tarball) | TESTED | 280 s + 18 s, 118 s, ok (cold, `-p 2`) |
| `go test -short` su 76 pacchetti (senza `-race`, un pacchetto alla volta) | TESTED (parziale) | 72 ok, 2 con 1 test fallito (daemon, tmux), 2 senza test; `internal/cmd` 1.325 PASS in 115 s |
| Test `-tags=e2e -run TestInstall` | TESTED | 12 PASS visti, ~120 s |
| `gt install ~/gt --git`, `gt rig add` (repo locale `file://`), `gt doctor` | TESTED | 10 s, 5 s; doctor fresco 86 ok / 6 warning / 0 fail |
| Default di merge del Refinery = `direct`, `require_review=false` | TESTED | `gt prime --dry-run` (ruolo Refinery) |
| Cambio a `pr` / `require_review` e ritorno al default | TESTED | `gt rig settings set/unset`; il set scrive `enabled:false` e zeri |
| `bypassPermissions` + `skipDangerousModePermissionPrompt` nei template | TESTED | 7 `settings.json` generati; preset agente con flag `yolo`-like |
| Guardie `pr-workflow` / `dangerous-command` | TESTED | exit 2 in contesto agente, 0 fuori; non provate dentro Claude Code |
| E-stop (`estop`, `thaw`, per rig) | TESTED (parziale) | sentinel e stato ok, Mayor esente; SIGTSTP non ferma un processo in un pane tmux |
| Dashboard senza LLM: autenticazione | TESTED | nessuna autenticazione, CSRF token nella pagina, scrittura possibile |
| #4819 forma letterale | TESTED (negativo) | fail-closed su `649b832`, nessun push |
| #4819 variante (lettura del convoy fallita) | TESTED (variante) | branch pushato ignorando `local`, stato costruito a mano |
| `gt up`, `daemon start`, `sling`, `mayor attach`, `doctor --fix` senza `--no-start` | BLOCKED | avviano agenti LLM |
| Percorso Docker ufficiale (`docker compose`) | BLOCKED | bind mount, porta pubblicata, base `docker/sandbox-templates:claude-code`, `curl \| bash` |
| Suite `integration`, `-race`, Windows nativo | UNVERIFIED | non eseguiti |

Etichette corrette o precisate dalla prova:
- **Refinery (§9)**: il merge è del prompt della formula; il motore Go in `engineer.go` non ha chiamanti non-test (vedi nota «[S00]» in §9).
- **E-stop (§7)**: da `UNVERIFIED` a «sentinel `TESTED`, freeze via SIGTSTP non efficace su un pane tmux in questo ambiente».
- **Dashboard (§9)**: da «non documentata» a `TESTED` «nessuna autenticazione».
- **#4819**: da `UNVERIFIED` a `PARTIAL` (forma letterale non riprodotta, variante riprodotta).
- **Versione (§2)**: dal clone senza tag `gt version` stampa `dev`; la versione effettiva è il commit.
- **Dipendenza `bd`**: `go.mod` fissa `github.com/steveyegge/beads v1.0.5` e il CI installa quella versione; la documentazione indica `@latest` (non provato).
- **Prerequisiti non documentati**: `lsof` (serve ai test di `internal/doltserver`, `Dockerfile.e2e` lo installa, `INSTALLING.md` no); con `--cap-drop ALL` apt/dpkg richiedono passi manuali (cache `_apt`, `libutempter0` non installabile senza `CAP_CHOWN`).
- **`gt rig add`** rifiuta un percorso locale semplice e richiede `file:///...` (messaggio d'errore chiaro).
- **Memoria**: i test lasciano `dolt sql-server` orfani (circa 18 osservati, ~80-100 MB ciascuno); la suite completa in un colpo satura i 2 GiB.
- **`gt prime --dry-run`** come Refinery sembra creare un patrol wisp (`hq-wisp-bcs`), contro la descrizione «senza effetti collaterali» (non indagato).
- **Doctor**: resta il failure `claude-settings` dopo `gt doctor --fix --no-start`, coerente con «Known issues» di `docs/docker.md` (richiede `gt up`).

Prima prova consigliata una volta autorizzato un agente reale: provare Refinery in modalità `pr` con `require_review=true` e verificare che il merge non avvenga senza approvazione; verificare l'effetto reale di `gt estop` su Claude Code; ripetere D di #4819 uccidendo Dolt a metà di `gt done`.

## Risultati sperimentali S01 LIVE (2026-10-21): 2 run PASS (dopo un blocco iniziale per login scaduto)

Dettaglio in `reports/s01-gastown-live.md`; dati in `results/S01-gastown-live-blocked.json`; grezzi in `results/raw/gastown-*`. Prima fase: nessuna run (login scaduto, vedi nota di processo). **Fase ripresa: 2 run con l'agente vero, entrambe PASS** (visibili e held-out, `claude-sonnet-5-5`), stima a listino 0,2927 e 0,1423 USD (totale ~0,44 USD), tutto in bwrap con `gt sling --no-boot`. Dati: `results/S01-gastown-live-10e4e5cc.json`, `...-3d14c1b6.json`; dettaglio in sez. 11 del report.

| Affermazione | Etichetta | Evidenza |
|---|---|---|
| Gas Town lancia `claude` in una sessione tmux con `exec env ... claude --dangerously-skip-permissions --settings <rig>/polecats/.claude/settings.json "<beacon>"` (interattivo, prompt posizionale, percorso assoluto del binario, `CLAUDE_CODE_EFFORT_LEVEL=high` di default) | CODE + TESTED | `session_manager.go:320-625`, `loader.go`, `env.go`; campionatore in bwrap (`ps` con padre tmux) |
| `exec_wrapper` per rig / alias di agente esistono ma non sono un confine: percorsi che lo saltano (`handoff.go:881`, `daemon/lifecycle.go:569`, `execRuntime`) e un polecat puo' cambiarli (`gt rig settings set ... runtime.exec_wrapper`, `gt config agent set` accettati) | CODE + TESTED (accettazione) | sonde a costo zero in bwrap |
| Confinamento dell'intero Gas Town (tmux, Dolt, bd, gt, claude) in `bwrap`: processi nel pid/mnt namespace della sandbox, nulla fuori | TESTED | campioni con `ns-pid`/`ns-mnt` uguali a quelli della sandbox |
| `gt sling <bead> <rig> --no-boot` avvia solo il polecat (nessun Mayor/Deacon/Witness/Refinery); `gt sling` senza `--no-boot` esegue `gt rig boot` | TESTED (con `--no-boot`) / CODE (senza) | `gt status`, `sling_helpers.go:898-925` |
| `gt` compila senza gcc/ICU con `CGO_ENABLED=0 -tags gms_pure_go` (62 s) al commit 649b832; `bd` v1.0.5 14 s; Dolt 2.0.7 sha256 verificato; Go 1.26.2 sha256 verificato | TESTED | `results/raw/gastown-build.log` |
| Un polecat non puo' fare `gt sling` ("polecats cannot sling"), ma puo' leggere/scrivere tutti i bead su Dolt senza password | TESTED | `results/raw/gastown-probe-control-surface.txt` |
| Claude Code 2.1.306 in HOME nuova richiede onboarding e fiducia preimpostati; il dialogo di fiducia ha "No, exit" preselezionato e **Gas Town 649b832 non lo accetta** (`startup blocked ... workspace trust prompt`, rollback automatico dello spawn); la fiducia e' per percorso esatto, non ereditata dalla cartella padre | TESTED | run1 e prove di onboarding |
| Run LIVE su ISSUE-1 (n=2): PASS/PASS; commit con autore = nome del polecat e committer = identita' git della sandbox; run1 con `gt done` BLOCCATO dai file di Gas Town non tracciati (nessun push/MR), run2 (workaround `.repo.git/info/exclude`) con push del branch sull'origin locale, MR in coda, bead chiuso, nessun merge (Refinery non avviato); costo 0,2927/0,1423 USD a listino; `gt costs` (prezzi hardcoded) 0,98 USD per run1 | TESTED | report sez. 11 |
| Stato dopo riavvio della sandbox (Dolt, bead, MR in coda, branch) | TESTED | `gt mq list`, `gt status`; ripresa a meta' lavoro non provata |
| Spese di fondo di daemon/Deacon/Witness, merge del Refinery, E-stop su Claude Code reale | UNVERIFIED | non avviati |

Nota di processo: il wrapper "copia le credenziali e cancella all'uscita" usato per tutti i candidati e' fragile quando il token scade durante la sessione (la copia rinnovata viene cancellata e l'originale resta con un refresh token invalidato); e' la causa probabile della perdita del login. Il wrapper di Gas Town ora conserva la copia cambiata come `.credentials.json.refreshed` e non sovrascrive mai l'originale.
