# Opzioni architetturali

Valutazione da lettura più il controller di riferimento provato in locale. Nessuna delle opzioni è stata eseguita end to end. Il documento (§11, §13) non sceglie l'orchestratore e preferisce validare prima Claude Code.

## Opzione A — Stack minimale: Claude Code remoto + Issue Queue Controller custom

```text
Jira ──► Issue Queue Controller (custom) ──► worker remoto (VM/container) ──► Claude Code in worktree ──► PR
             │ lease, priorità, dipendenze                                          │
             └── stato e decisioni su Git/Postgres                                  └── CI esterna + branch protection
```

- **Esistente:** Claude Code, MCP Jira/GitHub, CI e branch protection del repository.
- **Da sviluppare:** controller della coda (lease, riconciliazione, idempotenza), runner con timeout/retry/budget, dashboard minima o report, policy di sandbox.
- **Evidenza:** la logica di coda con lease, priorità, dipendenze, evento duplicato e riavvio è stata scritta e provata in 92 righe di codice (`fixtures/mock-integrations/mock-jira.mjs`, 7 test). Stima, non misura, per la versione di produzione: da 1.000 a 3.000 righe con Jira reale, webhook, persistenza su Postgres e test.
- **Rischi:** collaborazione multiutente, dashboard e recovery centralizzato sono da costruire; il documento (§13) dice che Claude Code «deve ancora dimostrare» coda Jira continua, multiutente e recovery. Le capacità di Claude Code non sono state provate in questa valutazione.

## Opzione B — Warren come Execution Plane + Control Plane custom minimo

```text
Jira ──► Issue Queue Controller + policy + approvazioni (custom)
              │  (estensione warren-tracker/v1 o API di Warren)
              ▼
         Warren: run isolate, harness Claude Code, trace, salvage, branch push
              ▼
         PR + CI esterna (branch protection: nessun merge automatico)
```

- **Esistente (Warren, MIT):** ciclo di vita delle run, watchdog, salvage, riconciliazione di processi persi, cost cap per run, estensione Jira sperimentale (solo lettura issue, stati, blockedBy, close).
- **Da sviluppare:** coda con lease e priorità, readiness, aggiornamento Jira con link PR, approvazioni, RBAC, supervisore; ruoli e piano (Warren ha solo un plan-run seriale).
- **Rischi:** socket Docker o `SYS_ADMIN` per l'isolamento locale. Il runtime Kubernetes è citato nei sorgenti ma non verificato. Un solo bearer token, nessun RBAC. Windows nativo non supportato. Progetto del 2026-05, in evoluzione rapida.

## Opzione C — Paperclip (Control Plane) + Warren (Execution Plane)

```text
Jira ─► [Issue Queue Controller custom] ─► Paperclip (governance, assegnazioni, budget, audit, dashboard)
                                                │  [Execution Adapter: DA PROTOTIPARE, non esiste]
                                                ▼
                                     Warren run ─► branch/PR ─► CI esterna
```

- **Esistente:** governance di Paperclip (checkout atomico, review/approval applicati dal runtime, budget hard stop, audit, multiutente con ruoli), esecuzione di Warren.
- **Da sviluppare:** controller Jira, execution adapter Paperclip→Warren, correlazione `Jira issue ↔ task Paperclip ↔ run Warren ↔ branch/PR`, ownership unica dello stato.
- **Non verificato:** se Paperclip abbia un adapter generico (HTTP/processo) utilizzabile per lanciare Warren. Non presumerlo.
- **Rischi:** due sistemi con modello di stato diverso, doppia fonte di verità per budget e ruoli, i default permissivi di entrambi (`dangerouslySkipPermissions=true`, socket Docker). Paperclip è un control plane per «aziende di agenti» con ruoli business, quindi parte del modello non è utile al caso e va configurata o ignorata.
- **Stima qualitativa:** sforzo alto, rischio alto; l'adapter non è stato studiato nel codice.

## Opzioni scartate come base

| Candidato | Ruolo | Motivo |
|---|---|---|
| Paseo + Hub | gestione dei daemon, distribuzione, dispatch a eventi | Hub è un dispatcher, non un orchestratore del ciclo di sviluppo; nessun budget, DAG o sandbox; dichiara perdita di dati possibile. Resta riferimento per daemon e handoff |
| Gas Town | riferimento per DAG e convoy | merge diretto di default, ruoli vincolati dal prompt, `bypassPermissions`, nessun Jira, nessun budget enforcement, dipendenze pesanti (Go, Dolt, tmux) |
| OpenClaw | canale di notifica e intervento umano | un solo confine di fiducia per Gateway; `github_publish` include il merge. Non nel percorso critico; possibile su Gateway dedicato senza credenziali di scrittura |

## Confronto

| Criterio | A (minimale) | B (Warren + custom) | C (Paperclip + Warren) |
|---|---|---|---|
| Componenti da gestire | 1 prodotto + 1 custom | 1 prodotto + 1 custom | 2 prodotti + 2 custom |
| Codice custom stimato | medio | medio-alto | alto |
| Isolamento reale | da progettare (VM o container non privilegiato) | Warren, con le riserve sul socket | doppio, con le stesse riserve |
| Collaborazione e audit | da costruire | da costruire | già in Paperclip |
| Maturità del prodotto base | alta (Claude Code) | media-bassa | media-bassa x2 |
| Cosa resta non provato | tutto sulle capacità di Claude Code | tutto su Warren | tutto, compreso l'adapter |
