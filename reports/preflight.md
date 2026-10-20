# Preflight — Team Agent Evaluation

Data rilevazione: 2026-10-20T16:50Z (UTC). Tutte le voci sono rilevazioni dirette, salvo dove indicato `non verificato`.

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
