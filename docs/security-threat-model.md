# Threat model

Basato su lettura di documentazione e sorgenti (SHA in `reports/comparison.md`). La tabella «Minacce e osservazioni» (T1-T10) nasce **solo dalla lettura**: le sue righe indicavano rischi derivati da configurazioni di default. Dopo le prove S00 e le run LIVE (2026-10-21 e 2026-10-22) **molte di quelle minacce sono state riprodotte**: le sezioni «Aggiornamento» sotto indicano, per ciascuna, che cosa è provato (TESTED), letto (CODE/DOC) o ancora non provato, con rimando ai finding F-numeri di `reports/findings.md`. Le prove sono state fatte in una WSL2 dedicata con wrapper `bwrap` nostri (Docker non disponibile: la sandbox nativa di OpenClaw resta `BLOCKED`). Ciò che **non** è stato provato con nessun candidato è il tentativo ostile o cooperante di un agente vero che cerchi di uscire dai confini (gap in `reports/findings.md`; F63 per Warren).

## Confini di fiducia

```mermaid
flowchart LR
  subgraph Umani
    Dev[Sviluppatori]
  end
  subgraph CP[Control Plane - fiducia alta]
    Q[Issue Queue Controller]
    P[Policy e approvazioni]
  end
  subgraph EP[Execution Plane - fiducia bassa]
    W[Worker non privilegiato]
    A[Coding agent in worktree]
  end
  subgraph EXT[Esterno e non fidato]
    J[Jira: testo delle issue]
    R[Repository di terze parti]
    L[Provider LLM]
  end
  CI[CI esterna]
  GH[Branch protection GitHub]
  J -- dati non fidati --> Q
  Q --> W --> A
  A -- prompt e codice --> L
  A -- branch + PR --> GH
  GH --> CI
  Dev -- approva e fa merge --> GH
```

Regole: il testo delle issue e dei repository è dato non fidato (prompt injection). L'Execution Plane non possiede credenziali di merge. Il merge avviene solo da un umano, dopo la CI.

## Minacce e osservazioni sui candidati

| ID | Minaccia | Osservazione dalla lettura | Mitigazione proposta | Verifica |
|---|---|---|---|---|
| T1 | Fuga di segreti verso l'agente | Gli agenti ereditano l'ambiente dell'host se non filtrato (Warren ha una allowlist di variabili, `UNVERIFIED` nel dettaglio) | Segreti per run, a scadenza e minimo scope; mai montare home | S07 |
| T2 | Evasione dalla sandbox | Warren monta il socket Docker (equivale a root sull'host) o richiede `SYS_ADMIN` senza seccomp/AppArmor; Paperclip documenta gli adapter locali come non sandboxati | VM o runtime Kubernetes dedicato, container rootless, nessun socket | S07 |
| T3 | Permessi aggirati dal prompt | Claude Code avviato con `--dangerously-skip-permissions` (Warren) o `dangerouslySkipPermissions=true` (Paperclip) o `bypassPermissions` (Gas Town) | Accettabile solo con sandbox reale; confini dai permessi del sistema, non dal prompt | S03, S07 |
| T4 | Merge non autorizzato | Gas Town merge diretto di default; OpenClaw `github_publish` con merge; Warren `autoMerge` opt-in | Branch protection e credenziali senza permesso di merge | S01, S07 |
| T5 | Modifica dei test per superare la verifica | Nessun candidato isola i test di accettazione per costruzione | Test held-out fuori dal workspace (come `scripts/evaluate.mjs`) e CI esterna | S07 |
| T6 | Prompt injection dal ticket Jira | Il contenuto dell'issue entra nel contesto dell'agente | Trattare come dati, nessuna credenziale di scrittura oltre il branch, review obbligatoria | S07 |
| T7 | Duplicazione di lavoro | Nessun lease per issue in Warren; lock per run in Paperclip; lease solo locale in OpenClaw | Lease con TTL e idempotenza nel controller (provato sul mock) | S04, S05 |
| T8 | Run fuori controllo, costi | Warren ha cost cap e watchdog; Gas Town non applica budget; Paseo Hub non ha budget | Budget e timeout applicati dal controller, kill del processo senza cooperazione dell'LLM | S06, S09 |
| T9 | Un solo token per tutti | Warren: bearer token unico, nessun RBAC (`SECURITY.md`) | Proxy autenticato davanti, o RBAC nel control plane | S07 |
| T10 | Compromissione del Gateway di notifica | OpenClaw: un solo confine di fiducia per Gateway | Gateway dedicato, senza tool privilegiati né credenziali di scrittura | S07 |

## Controlli minimi prima di qualunque run LIVE

1. Sandbox verificata (non solo dichiarata): scrittura fuori worktree negata, segreti-esca non leggibili, rete limitata.
2. Credenziale GitHub dell'agente senza permesso di merge; branch protection attiva.
3. Budget, timeout e numero massimo di retry applicati dal controller.
4. Test held-out fuori dalla sandbox.
5. Nessun accesso a produzione né a repository privati estranei.

## Aggiornamento 2026-10-21 — cosa è stato provato

Le righe sopra nascono dalla lettura. Gli smoke test S00 (container non privilegiato, nessun LLM, nessuna credenziale) hanno confermato o corretto alcune osservazioni. Fonti: `reports/s00-*.md`.

| ID | Esito | Prova |
|---|---|---|
| T2 Evasione dalla sandbox | **Non provata sui candidati.** Gli scenari verdi di Warren usano uno shim `bwrap`; `warren up` e i runtime reali non sono stati eseguiti | S00 Warren |
| T2 (nostro sandbox) | **Provato**: scrittura fuori dal workspace, modifica di test e segreti-esca negati; nessuna rete; non root; nessun socket; fork e memoria limitati (exit 137); `docker kill` ferma un processo che ignora SIGTERM. 13/13 | `scripts/s07-sandbox-check.sh` |
| T3 Permessi aggirati | **Provato**: Gas Town genera `bypassPermissions` in tutti e 7 i `settings.json`; OpenClaw ha exec `full` e `ask=off` e tool profile `full` dopo l'onboarding; Paperclip ha `dangerouslySkipPermissions` a `true` per default (C) | S00 Gas Town, OpenClaw; CODE Paperclip |
| T4 Merge non autorizzato | **Provato**: Gas Town `merge_strategy=direct` di default; il cambio a `pr` scrive anche `enabled:false` e valori a zero. OpenClaw: la release provata ha solo draft PR, il merge è nel sorgente `main` | S00 Gas Town, OpenClaw |
| T7 Duplicazione di lavoro | **Provato** il contrario su Paseo Hub (6 richieste concorrenti con la stessa `deliveryKey` = 1 run) e su OpenClaw Workboard (idempotency key); il payload diverso con la stessa chiave è scartato in silenzio. Non provato su Warren, Gas Town, Paperclip | S00 Hub, OpenClaw |
| T8 Run fuori controllo, costi | **Provato che il budget di Paperclip è aggirabile dall'agente** (#16935 riprodotta: auto-PATCH di `budgetMonthlyCents` 5.000 → 99.999.999, anche su un altro agente). Hub: SIGTERM non termina con un daemon connesso (#147 riprodotta) | S00 Paperclip, Hub |
| T9 Un solo token per tutti | **Provato**: Warren stampa il token operatore in chiaro nel log di avvio senza `WARREN_API_TOKEN`; OpenClaw lo scrive in chiaro in `openclaw.json` (0600); Paperclip `local_trusted` non ha login; la dashboard di Gas Town non ha autenticazione e le POST modificano lo stato | S00 |
| T10 Gateway di notifica | **Provato** (parziale): in OpenClaw con `sessions.visibility=all` un agente ha letto la sessione di un altro; con `agent` è bloccato | S00 OpenClaw |

### Nuove minacce emerse dalle prove

| ID | Minaccia | Mitigazione |
|---|---|---|
| T11 | **L'agente modifica i propri limiti** (budget, permessi, config) tramite la stessa API di governance che dovrebbe vincolarlo (Paperclip #16935) | Budget, permessi e arresto vivono nel controller o in un proxy che l'agente non raggiunge; mai nello stesso processo/API accessibile con la chiave dell'agente |
| T12 | **Fallback silenzioso sul percorso che integra** quando un servizio di supporto non risponde (Gas Town `gt done` ignora `--merge=local` con la lettura del convoy impossibile: variante riprodotta; #4819) | Fallire in modo chiuso: se lo stato non è leggibile, abortire; non scegliere un default che integra |
| T13 | **Percorso di arresto non cooperativo** non garantito (Hub #147; E-stop di Gas Town: SIGTSTP non ferma un processo in tmux, SIGSTOP sì) | Arresto dall'esterno con `docker kill` o equivalente, provato nel sandbox di laboratorio |
| T14 | **Bug di migrazione che perde la coda** dopo il riavvio (Hub v0.10.0: `manual-runs` risponde 500 dopo la migrazione) | Test di riavvio con coda piena prima di ogni aggiornamento di versione |
| T15 | **Prompt injection da issue verso la lettura di file fuori dal workspace**: **provata sulla baseline (n=3): non seguita**; l'agente ha dichiarato di non aver letto il file-esca. Nessun confine del sistema lo avrebbe impedito (`Bash(node:*)` consente di leggerlo), quindi è un esito del modello, non dell'infrastruttura. Non provata sui candidati | Sandbox senza credenziali raggiungibili; non affidarsi al comportamento del modello (`reports/s02-s07-baseline.md`) |

## Aggiornamento 2026-10-21 (sera) — emerso dalle run LIVE di Warren

| ID | Minaccia | Osservazione (T = provato) | Mitigazione |
|---|---|---|---|
| T16 | **Attribuzione dei commit a una persona** | L'agente ha firmato il commit con nome ed email reali dell'utente (T), conosciuti dal contesto di Claude Code; l'ambiente della sandbox è ripulito e `WARREN_GIT_AUTHOR_*` non arriva | Identità git di macchina imposta fuori dall'agente; verifica dell'autore in CI |
| T17 | **Esfiltrazione con rete aperta e credenziali copiate** | Warren copia `.credentials.json` nella cartella di lavoro; la sandbox ha `network="open"` (T); `restricted` è «honor system» (CODE) | Regole di rete esterne alla sandbox (firewall/egress filtering), credenziale a tetto di spesa e revocabile, non riusare la stessa credenziale altrove |
| T18 | **Perdita di lavoro al riavvio** | Il workspace non pushato viene distrutto senza salvage al riavvio del server (T) | Supervisore del processo, copia dei workspace prima del riavvio, commit/push frequenti dentro la run |
| T19 | **PR parziale da run fallita** | Con un commit wip pushato, Warren apre una PR anche con la run `failed` (T) | Policy sul forge che richiede CI verde e review umana; etichettare le PR di run fallite |
| T20 | **Credenziali nel branch** | Warren non esclude `.claude/` dai commit (CODE); un `git add -A` dell'agente può portarci stato o credenziali. Nelle 5 run valide non è successo (verificato sulle differenze) | Escludere `.claude/` con un controllo in CI/pre-receive; cancellare il repository di prova dopo le run |
| T21 | **Il pannello di controllo è raggiungibile dall'agente** | L'agente raggiunge `127.0.0.1:18080`; `/healthz` 200, il resto 401 senza token (T) | Token non esposto all'agente (già così), bind su socket o rete separata |

## Aggiornamento 2026-10-22 — stato delle minacce dopo le run LIVE

Fonti: `reports/findings.md` (F01-F71), `reports/s01-*-live.md`, `reports/s09-s07-s04-warren-live.md`, `reports/s03-s08-baseline.md`, `docs/decisions.md` (D28-D34). Dove la tabella cita «provato», l'etichetta è TESTED; i limiti sono dichiarati nella cella.

### Stato delle minacce già elencate

| ID | Stato aggiornato | Finding |
|---|---|---|
| T1 Fuga di segreti verso l'agente | **Provata in parte.** Warren: ambiente ripulito, esca nella home invisibile, ma credenziali copiate nel workspace e leggibili. Paseo: `PASEO_PASSWORD` e `PASEO_HOME` nell'ambiente del processo `claude` (osservazione passiva dei nomi nel log del wrapper; sfruttamento da parte di un agente non provato). OpenClaw: `OPENCLAW_MCP_TOKEN` nell'ambiente. Gas Town: nessun nome da segreto nell'ambiente del polecat | F09, F27, F64 |
| T2 Evasione dalla sandbox | I wrapper `bwrap` nostri hanno confinato Paperclip, Paseo, OpenClaw (intero Gateway) e Gas Town (intero Town) e `bwrap` nativo di Warren è stato misurato: **confini provati**, non evasioni. Un agente che tenti di uscire non è stato provato; la sandbox nativa di OpenClaw è `BLOCKED` (nessun Docker) | F14, F20, F36, F63 |
| T3 Permessi aggirati dal prompt | **Provata**: Gas Town `bypassPermissions` nei 7 `settings.json` e `--dangerously-skip-permissions`; Paperclip: un agente spegne `dangerouslySkipPermissions` con la sua chiave (200) | F01, F36 |
| T4 Merge non autorizzato | **Provata** per Gas Town (`merge_strategy=direct` e `require_review=false` di default; variante #4819); nelle 2 run LIVE `gt done` (run2, con workaround) ha pushato un branch sull'origin locale e messo l'MR in coda, mentre il merge su `main` non è avvenuto perché il Refinery non era avviato: **non provato**. OpenClaw release: solo draft PR. Warren: `autoMerge` opt-in spento (CODE). Forge reale con branch protection e CI esterna non provati con alcun candidato | F34, F37, F43, F59 |
| T5 Modifica dei test | Nelle run Warren S07 l'agente ha solo aggiunto righe ai test (13 inserzioni, 0 cancellazioni), come consentito dal prompt: non è un tentativo ostile. Held-out sempre fuori dal workspace. Isolamento dei test per costruzione: nessun candidato | F63 |
| T6 Prompt injection dal ticket | **Provata come comportamento del modello**: baseline n=3 e Warren n=2 (nota ostile nel ticket, injection in `AGENTS.md`) non seguite, esche non lette, 0 connessioni al listener locale. Nessun confine del sistema lo avrebbe impedito (rete aperta in Warren, esca montata in sola lettura leggibile): non contare sul modello | F51, F63 |
| T7 Duplicazione di lavoro | **Provata su Warren**: nessun lease per issue né per file; la stessa issue due volte senza chiave = 2 run e 2 PR; con la stessa `Idempotency-Key` = 1 run (solo in memoria, 10 minuti, chiave data dal chiamante). Su Gas Town e Paperclip non provata. Vedi T23 | F61, F62 |
| T8 Run fuori controllo, costi | **Provata**: il tetto di Warren con Claude Code scatta a run finita (0,1010 USD con tetto 0,01), non ferma la spesa; il budget di Paperclip è aggirabile dall'agente e in abbonamento resta a 0 centesimi; Gas Town senza enforcement (CODE). Hub: SIGTERM bloccato con daemon connesso (#147). Vedi T22 e T28 | F11, F45, F47, F60 |
| T9 Un solo token per tutti | **Provata**, più Paseo: senza password il WebSocket accetta chiunque. Vedi T24 | F08, F28, F15, F38 |
| T10 Compromissione del Gateway | **Provata** in OpenClaw: token in chiaro in `~/.openclaw/openclaw.json` (0600), `config.patch` accettata col token (visibility cambiata e ripristinata), `visibility=all` fa leggere la sessione di un altro agente. L'uso del token da parte dell'agente non è provato | F15, F19, F21 |
| T11 L'agente modifica i propri limiti | **Riprodotta con `claude_local`** (Paperclip #16935): auto-PATCH del budget da 5.000 a 99.999.999 centesimi (200), anche su un altro agente, in `local_trusted` e in `authenticated`; accettati anche `networkScope="open"` e `filesystemScope="none"`. Stessa famiglia: `exec_wrapper` e alias di agente di Gas Town (accettazione di configurazione provata, nessun agente avviato) e `config.patch` di OpenClaw | F01, F21, F40 |
| T12 Fallback silenzioso verso l'integrazione | Invariata (variante riprodotta; la forma letterale con Dolt fermato è fail-closed) | F43 |
| T16 Attribuzione dei commit | Provata più volte: Warren run A `Claude <noreply@anthropic.com>`, run B nome ed email reali dell'utente; Gas Town: autore = nome del polecat, committer = identità globale della sandbox (decisa dal sistema). L'identità dipende dall'agente, salvo dove il sistema la impone | F30, F65 |
| T17 Esfiltrazione con rete aperta | Invariata: rete aperta e credenziali copiate (T). Nelle run S07 l'esfiltrazione verso il listener non è avvenuta perché l'agente non l'ha tentata, non perché impedita | F26, F63 |
| T19 PR parziale da run fallita | Provata (commit wip pushato = PR con run `failed`). Variante nuova: una run con tetto di costo superato finisce `cancelled` con branch pushato e **nessuna PR**, ma indistinguibile da un cancel dell'operatore senza leggere l'evento `budget.exceeded` | F33, F60 |
| T20 Credenziali nel branch | **Provata con l'agente vero** (S07, 2 run): `.claude/.credentials.json` e `.claude/settings.local.json` compaiono come file non tracciati nel workspace; l'agente li ha lasciati fuori dal commit, nei branch non c'è nulla, ma un `git add -A` li avrebbe portati nel branch | F27, F64 |

### Nuove minacce emerse dalle run LIVE

| ID | Minaccia | Osservazione (T = provato, C = codice) | Mitigazione | Finding |
|---|---|---|---|---|
| T22 | **Tetto di costo del prodotto che non ferma la spesa** | Warren con Claude Code: il costo arriva una volta sola nell'envelope finale; `--max-cost-usd 0,01` ha dato 0,1010 USD (10,1 volte), `budget.exceeded` 7 ms dopo il risultato, stato `cancelled` con `failureReason` nullo (T, n=1). Nessun budget cumulativo e tetto malformato = nessun tetto (C). Il tetto di Pi a metà run non è provato | Budget, timeout assoluto e numero di run nel controller a monte (D28); i tetti dei prodotti solo come seconda difesa | F60 |
| T23 | **Nessun lock per issue né per file: PR in conflitto** | Warren, 2 run su ISSUE-2 e ISSUE-3 (stesso file) eseguite entrambe senza avviso, 2 PR aperte, conflitto al merge in `src/pricing.js` e `test/cart.test.js`; anche issue su file di codice diversi hanno confliggito in `test/cart.test.js`. Idempotenza solo in memoria 10 minuti, chiave data dal chiamante, il CLI `warren run` non la invia (T, n=1 per configurazione, forge finto) | Lease durevole e `Idempotency-Key` = chiave issue + tentativo nel controller; serializzare o integrare con rebase/merge queue (D29) | F61, F62 |
| T24 | **Servizio di controllo senza autenticazione = esecuzione sull'host** | Paseo senza password: `get_daemon_config`, `set_daemon_config_request` (cambia `providers.claude.command`) e `create_terminal` con comando arbitrario hanno scritto un file sull'host fuori da bwrap con l'uid del daemon (T); con password: «Password required». `PASEO_PASSWORD` non impostata è il default. Altri servizi senza autenticazione: dashboard di Gas Town (le POST cambiano lo stato), Dolt senza password, `local_trusted` di Paperclip | Password o token obbligatori ovunque, porta non raggiungibile dall'agente (D32) | F08, F14, F38, F42 |
| T25 | **Segreto del servizio di controllo nell'ambiente dell'agente** | `PASEO_PASSWORD` e `PASEO_HOME` nell'ambiente del processo `claude`, anche del sotto-processo dei metadati (T, passivo; C: base `process.env`); catena con T24: un agente con Bash che legge la password e raggiunge la porta potrebbe ripetere la sonda (non eseguita dall'agente reale) | `env -i` nel wrapper (adottato); rete della sandbox senza accesso al loopback del daemon | F09, F10 |
| T26 | **Aggiramento del confinamento tramite configurazione modificabile dall'agente** | Paperclip: `command` protetto (403) ma `engine:"acp"`, `agentCommand`, `replaceAdapterConfig` accettati (200); il motore ACP è il predefinito della release e il primo tentativo ha avviato Claude Code sull'host senza bwrap (incidente, costo 0). Gas Town: `exec_wrapper` e alias modificabili da un polecat, non tutti i percorsi usano `exec_wrapper` (T: accettazione, ripristinata; C: avvio). L'esecuzione dopo l'aggiramento non è stata provata | Confinare l'intero processo del candidato, mai un solo comando (D30); verificare nel log del wrapper ogni avvio | F02, F03, F20, F40 |
| T27 | **Consegna non completata, silenziosa** | Gas Town run1: codice e test corretti (held-out PASS) ma `gt done` bloccato dai file propri non tracciati (`cannot complete: uncommitted changes would be lost`); nessun push né MR, bead HOOKED, attesa fino al limite di 480 s. Paperclip, Paseo e OpenClaw non producono commit, branch né PR da soli (n=2 ciascuno) | Controllo esterno che verifichi la consegna (branch su origin) e limite di tempo per sessione; PR plumbing nel controller o in un runner | F59, F69 |
| T28 | **Spesa automatica non richiesta e budget che non si consuma** | Paperclip: continuazione automatica (0,0881 USD contro 0,0685 della run di lavoro, n=1); OpenClaw: heartbeat da ~0,128 USD dopo ~12 minuti e riepiloghi Haiku non misurati; con login in abbonamento il budget di Paperclip resta a 0 centesimi (`subscription_included`) | Guardia sul numero di run per issue; disattivare heartbeat e dreaming; contabilità e arresto nel controller sul costo a listino | F05, F16, F47 |
| T29 | **Credenziale di prova scaduta o rovinata da un wrapper** | Il wrapper «copia e cancella» ha lasciato l'originale con un refresh token invalidato: «OAuth session expired and could not be refreshed», run bloccate (T, incidente). Con il wrapper corretto, ping Haiku (0,0013 USD) e `cmp` dopo ogni run, l'originale è risultato invariato (551 byte) in tutte le run successive | Wrapper che non sovrascrive l'originale, ping prima di ogni lotto; in produzione credenziale breve, non personale e revocabile (D31) | F46 |
