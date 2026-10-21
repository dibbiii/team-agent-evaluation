# Preflight — Team Agent Evaluation

Data rilevazione: 2026-10-20T16:50Z (UTC). Tutte le voci sono rilevazioni dirette, salvo dove indicato `non verificato`.

**Aggiornamento 2026-10-21:** le sezioni 1-8 sono la rilevazione iniziale e sono rimaste invariate come registro storico. Alcune voci sono superate (Docker ora attivo e usato, distribuzione WSL dedicata in uso, repository remoto pubblicato, Jira reale raggiunto): vedi la sezione 9, che riporta lo stato attuale e le risorse osservate nelle run. Dove una voce iniziale è smentita, la sezione 9 la richiama per numero.

## 1. Host

| Voce | Valore |
|---|---|
| OS / architettura | Windows 11 Pro 10.0.26200, AMD64 |
| CPU | Intel Core i7-1360P, 16 thread logici |
| RAM | 15,7 GB totali, **0,6 GB liberi** al momento della rilevazione |
| Disco C: | 623,8 GB liberi |
| Virtualizzazione | Hypervisor presente (`HypervisorPresent=True`) |
| WSL2 | Distro `Ubuntu` e `docker-desktop`, entrambe `Stopped` |

## 2. Toolchain

| Strumento | Esito |
|---|---|
| git | 2.53.0.windows.1 |
| Docker CLI | 29.2.0 — **daemon non raggiungibile** |
| Node / npm | v24.19.0 / 11.17.0 |
| Rust (rustc / cargo) | 1.96.0 |
| GitHub CLI | 2.102.0 (stato autenticazione: non verificato) |
| Claude Code | 2.1.304 |
| Python | **non installato** (esiste solo l'alias del Microsoft Store) |
| Go, pnpm | non installati |

## 3. Docker

> **Superato** (2026-10-20/21): Docker Desktop è stato avviato dall'utente e usato per le S00; vedi §9.1.

`docker info` fallisce: la pipe `dockerDesktopLinuxEngine` non esiste, Docker Desktop non è in esecuzione e il servizio `com.docker.service` è `Stopped`.
Conseguenza: ogni scenario che richiede container è `BLOCKED` finché Docker Desktop non viene avviato dall'utente. Non si simulano test containerizzati.
Sblocco: avviare Docker Desktop, poi rieseguire `docker info`. Con 0,6 GB di RAM libera conviene chiudere altre applicazioni e limitare la memoria assegnata a WSL2.

## 4. Repository

- Branch: `main`, **nessun commit**.
- Remote: `origin` → `https://github.com/dibbiii/team-agent-evaluation`.
- File non tracciati: `.serena/`, `TEAM_AGENT_EVALUATION_INSTRUCTIONS.md`, `idea-progetto.md`.
- `idea-progetto.md` è l'originale dei requisiti: **non modificare**.
- Nessun `AGENTS.md`, `README.md` o `CLAUDE.md` di progetto preesistente.
- Nessun push eseguito. Il push richiede autorizzazione esplicita.

## 5. Credenziali (solo nomi, valori mai letti né stampati)

Variabili d'ambiente presenti: `CLAUDE_CODE_MESSAGING_TOKEN`, `CONTEXT7_API_KEY`, `GITHUB_MCP_AUTH`, `NOTION_TOKEN`.
Nessuna variabile `ANTHROPIC_*`, `OPENAI_*` o `JIRA_*` rilevata. Nessuna di queste credenziali viene usata prima dell'approvazione su costi e account.

## 6. Accesso a fonti ufficiali

HTTP 200 su: i repository `paperclipai/paperclip`, `getpaseo/hub`, `openclaw/openclaw`, `jayminwest/warren`, `gastownhall/gastown` e le documentazioni `docs.paperclip.ing`, `paseo.sh/docs/hub`, `docs.openclaw.ai/it`.
Il download delle dipendenze non è stato ancora provato.

## 7. Fattibilità dei test

| Categoria | Scenari | Stato |
|---|---|---|
| Locale senza Docker | Lettura codice, fixture, harness MOCK, adapter Jira finto, test di unità | Fattibile |
| Locale con Docker | S00 container, S04, S06, S07 | `BLOCKED` finché Docker non parte |
| LIVE con LLM a pagamento | S01, S09 e baseline | Richiede approvazione con budget massimo |
| GitHub Actions | Riavvii e CI esterna (parziale) | Richiede approvazione prima di push o workflow |
| VPS / VM dedicata | «Lavora a PC spento», S06 completo | `BLOCKED` finché non esiste un host remoto |
| Jira reale | S05 con webhook | `BLOCKED` senza progetto Jira sandbox autorizzato |

## 8. Vincoli operativi derivati

- Concorrenza massima 1–2 stack alla volta per la RAM disponibile.
- Python assente: la fixture e gli script usano Node o Rust, già installati.
- Nessuna installazione globale senza approvazione.

## 9. Aggiornamento 2026-10-21 — stato attuale e risorse osservate nelle run

Fonti: `reports/execution-log.md`, `reports/s00-*.md`, `reports/live-warren-prep.md`, `reports/s01-*-live.md`, `reports/hard-calibration.md`. Valori misurati nelle run, non una nuova rilevazione dell'host (nessun comando è stato rieseguito per scrivere questa sezione).

### 9.1 Docker (smentisce §3 e le righe «Docker» di §7)

- Docker Desktop avviato dall'utente; Docker Engine 29.2.0; nelle S00 il daemon aveva una VM da 8 GB (`reports/s00-openclaw.md` §2). Docker Desktop è risultato ancora acceso dopo la chiusura della finestra (processo e distribuzione WSL `docker-desktop` attivi): non l'ha spento l'agente di valutazione (`reports/execution-log.md`, 2026-10-21).
- Sul daemon ci sono container e volumi dell'utente: si è operato **solo** su risorse con prefisso `tae-` e label `tae=1`; dopo ogni prova 0 container `tae-`, immagini invariate (17=17) e database dell'utente sano.
- Ogni smoke test S00: un container alla volta, 2 GiB di memoria, 2 CPU, 512 PID, `CapDrop=ALL`, `no-new-privileges`, utente non root, nessun mount, nessun socket Docker, nessuna porta pubblicata; rete in uscita aperta solo per scaricare dipendenze.
- Limite osservato: a 2 GiB diversi passi vanno in OOM (Paperclip `pnpm install`, `vite build` e typecheck di `packages/db`; OpenClaw test del Workboard): sono limiti dell'ambiente, non difetti accertati dei prodotti (`reports/s00-paperclip.md`, `reports/s00-openclaw.md`).

### 9.2 Distribuzione WSL dedicata `Ubuntu-26.04`

- Creata con `wsl --install Ubuntu-26.04` dall'utente (utente `dibbi`), distinta dalla `Ubuntu` personale. Isolamento applicato con `scripts/wsl-isolate.sh apply` (`[automount] enabled=false`, `[interop] enabled=false`, `appendWindowsPath=false`; backup `/etc/wsl.conf.bak-tae`) e riavvio con `wsl --terminate Ubuntu-26.04`; `verify` come utente `dibbi`: **6 controlli su 6 PASS** (C: non montato, `/mnt/c` vuota, PATH senza percorsi Windows, nessun `cmd.exe`, utente non root, nessun socket Docker). Il verify è rimasto 6/6 dopo le modifiche a DNS e `wsl.conf`.
- Limite dichiarato: WSL2 non è un confine di sicurezza forte (VM e kernel condivisi con le altre distribuzioni). Anomalie non risolte: `Failed to start the systemd user session` all'avvio (non bloccante finora); l'utente ha accettato l'invio di metriche anonime a Canonical al primo avvio.
- Rete: il «DNS tunneling» di WSL non risponde su questo PC (stesso difetto nella `Ubuntu` personale). Rimedio solo per `Ubuntu-26.04`: `generateResolvConf=false` e `/etc/resolv.conf` come **file vero** con 1.1.1.1 e 8.8.8.8 (una prima correzione con `systemd-resolved` rendeva `/etc/resolv.conf` un collegamento a `/run`, non montato dalla sandbox di Warren, e ha rotto il DNS dentro la sandbox: `reports/execution-log.md`). Conseguenza: i nomi dei siti sono visti da Cloudflare e Google. Verifica a costo zero: `scripts/live/sandbox-net-check.sh`.
- Toolchain nella distribuzione (da `reports/live-warren-prep.md` e `reports/s01-*-live.md`): git 2.53.0, `bubblewrap` 0.11.1, tmux 3.6, curl 8.18.0, unzip 6.00, jq 1.8.1, Bun 1.3.14 (SHA-256 verificato), Node 22.22.1 e npm 9.2.0 di sistema (la baseline sull'host usa Node 24; differenza dichiarata), Node 24.22.0 in `~/pc-node`, Go 1.26.2 e Dolt 2.0.7 (SHA-256 verificati), `bd` v1.0.5, Claude Code 2.1.304 installato e 2.1.306 effettivamente lanciato dopo l'aggiornamento automatico nativo.
- `bwrap` funziona come utente normale (userns senza restrizioni), senza socket Docker né `SYS_ADMIN`: `GET /readyz` di Warren 200 con `bwrap: ok`. Questo corregge le S00 di Warren in Docker (503 per mancanza di `bwrap`).
- Il login di Claude Code (account `claude.ai`, piano Team) è stato fatto dall'utente dentro la distribuzione. Il token di accesso dura circa 8 ore ed è **scaduto** durante le prove di Gas Town (`reports/s01-gastown-live.md` §3.3): serve un nuovo login per ogni ulteriore run LIVE. Cleanup finale, a cura dell'utente: `claude logout` dentro la distribuzione e `wsl --unregister Ubuntu-26.04` (nome ESATTO).

### 9.3 Risorse osservate nelle run (misure, non limiti)

| Voce | Valore osservato | Fonte |
|---|---|---|
| Warren `serve` (WSL) | RSS 198 MB (180-220 MB nelle S00); `healthz` in 1,4 s; suite completa 7.928 pass in 105,7 s | `reports/live-warren-prep.md`, `reports/FINAL-RECOMMENDATION.md` |
| Paperclip server (WSL) | RSS circa 570 MB; health in 8-16 s; installazione 1,4 GB | `reports/s01-paperclip-live.md` §1 |
| Paseo + Hub | circa 590 MB (daemon e Hub); `~/ps` 794 MB e `~/ps-src` 915 MB su disco | `reports/FINAL-RECOMMENDATION.md` §3, `reports/s01-paseo-live.md` §8 |
| OpenClaw (WSL) | Gateway RSS 1,43-1,53 GB; ogni `claude` caldo 240-270 MB; pronto in 16-21 s; installazione 619 MB | `reports/s01-openclaw-live.md` §2 |
| Gas Town (WSL) | `go install bd` 14 s e build di `gt` 62 s (cache fredda); su disco `~/gt-go` 269 MB, `~/gt-gopath` 1,3 GB, `~/gt-bin` 243 MB | `reports/s01-gastown-live.md` §2, §8 |
| RAM libera dell'host prima delle run | 5,7-5,8 GB (Paseo); mai sotto 2,3 GB (OpenClaw); 2,4-2,6 GB (calibrazione difficile); **948 MB** con paginazione di circa 1.200 pagine/s (rimandata la prima run di Warren: `msedgewebview2` circa 4 GB e `chrome` circa 3 GB) | `reports/s01-paseo-live.md` §3, `reports/s01-openclaw-live.md` §2, `reports/execution-log.md` |
| Soglie di arresto adottate | 1.200 MB (serie difficile), 1.500 MB (serie Warren), 0,6 GB (sonde S02/S07) | `scripts/run-hard-batch.mjs`, `scripts/live/warren-live-batch.ps1`, `reports/s02-s07-baseline.md` |

Il sistema ha fermato per memoria quasi esaurita le sonde S02/S07 (prima esecuzione, 0 run completate) e la serie difficile alla sesta prova (HARD-9, poi rifatta): vedi `reports/execution-log.md`.

### 9.4 Repository, credenziali e fattibilità (aggiorna §4, §5, §7)

- **Repository (§4):** `main` pubblicato sul repository privato `dibbiii/team-agent-evaluation` con approvazione dell'utente, dopo un controllo dell'intera storia (nessun segreto noto, 2,3 MB). Creato anche il repository di prova privato `dibbiii/tae-sandbox` (solo fixture difficile di partenza, CI `npm test` su Node 22 con `contents: read`, nessun held-out; protezione del ramo non ancora impostata). `gh` è stato usato per le issue dei repository dei candidati (il «non autenticato» di §2 di M1 non vale più). I push di aggiornamento di `main` si fanno ai traguardi e si comunicano. Fonte: `reports/execution-log.md`.
- **Credenziali (§5):** le variabili d'ambiente iniziali non sono state riverificate. Il login `claude.ai` di Claude Code è usato solo dentro la distribuzione dedicata (copia con `cp`, mai letta né stampata). Per S05 su Jira reale l'utente ha impostato nell'ambiente le variabili `JIRA_*`; nessun valore è stato scritto in file o usato dall'agente. Il token API di Jira è comparso una volta nella conversazione e va revocato a fine prova (`reports/execution-log.md`).
- **Python (§2):** sull'host non è stato riverificato. Nella distribuzione uno script di installazione usa `python3` (`reports/s01-gastown-live.md` §8); le fixture e gli script di valutazione restano in Node.
- **Fattibilità (§7), stato attuale:** locale con Docker, **fatto** (S00); LIVE con LLM, **fatto** per baseline, Warren, Paperclip, Paseo, OpenClaw (budget in `reports/budget.md`), Gas Town fermo per login scaduto; GitHub Actions, la CI di `tae-sandbox` esiste ma non è stata usata con alcun candidato; Jira reale, **fatto** per il controller di riferimento (progetto `KAN`), webhook non provati; VPS/VM dedicata, ancora `BLOCKED` (tutto gira su questo computer: non vale come prova di «lavora a PC spento»).
- **Vincoli operativi (§8):** confermati; una run LIVE alla volta e un candidato alla volta per la RAM; controllo della memoria libera prima di ogni run.
