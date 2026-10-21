# S06 — Crash, recovery e continuità

Stato: **PARZIALE**. Fault injection fatta su Warren (con agente stub, costo 0), Paseo Hub (SIGKILL con run in volo, agente finto), controller di coda; per gli altri solo riavvio a riposo. «PC spento»: `BLOCKED`.

## ID e obiettivo
- **ID:** S06. **Requisiti:** R05.3, R08.1, R08.3, R10.4.
- **Obiettivo (§6):** fault injection solo su processi/container dell'esperimento: arresto forzato del worker durante una modifica; riavvio dell'orchestratore durante una run; indisponibilità dell'API esterna o evento duplicato; timeout/errore del provider; fallimento ripetuto di un test CI. Distinguere recupero di file/worktree, recupero dello stato dell'issue e ripresa della sessione conversazionale. «Lavora a PC spento» richiede un worker ospitato altrove.

## Setup e condizioni iniziali
- Warren 0.19.3 in WSL `Ubuntu-26.04`, `WARREN_RUNTIME=local`, forge finto su repository bare locale, agente = stub lento `claude` (`scripts/live/stub-claude.sh` e lo stub generato da `warren-recovery.sh`), server avviato con `env -i`, nessuna credenziale.
- Hub v0.10.0 + daemon 0.12.0 in container non privilegiati (S00).

## Input
Marcatori nel prompt dello stub: `[slow=N]`, `[hang=1]`, `[wip_commit=1]`.

## Comandi e script reali
- Warren: `scripts/live/warren-recovery.sh <1|2|3|4|5|all> [marcatori]` — prove 1 `kill -9` del server, 2 `kill -9` dello stub, 3 SIGTERM del server, 4 watchdog con stub bloccato, 5 salvage e `--rescue-from`. Procedura completa: `docs/live-warren-recovery.md` §1.
- Hub, riavvio e SIGKILL: `reports/s00-paseo-hub.md`. Riavvio del daemon Paseo con agenti finiti: `reports/s01-paseo-live.md` §3.2. Riavvio del Gateway OpenClaw con ripresa di sessione: `reports/s01-openclaw-live.md` §3.
- Controller: riavvio con lease riconciliata nei test di `fixtures/mock-integrations/queue-controller.test.mjs`.

## Risultati attesi
Stato corretto dopo il riavvio, artefatti conservati, nessun duplicato, retry limitati, costi e osservabilità coerenti, possibilità di intervento umano; le tre forme di recupero riportate separatamente.

## Teardown
Lo script uccide solo i PID avviati e i processi tracciati (PID + starttime), cancella bare repo e cartelle di prova e verifica che non restino `bun`/`bwrap`/stub (`docs/live-warren-recovery.md` §1).

## Esito per sistema

| Sistema | Esito | n | Dettaglio (recupero: file / stato / sessione) | File |
|---|---|---|---|---|
| Warren | `PARTIAL` | 5 prove + varianti `wip` | `kill -9` del server: figli muoiono subito (`--die-with-parent`), run resta `running` nel DB a server fermo; al riavvio `failed/sandbox_run_lost` e **1 retry automatico da zero**; **workspace distrutto senza salvage** (anche commit locali non pushati). `kill -9` dell'agente: `failed/provider_error`, 0 retry. SIGTERM del server: esce in 5,1 s senza finalizzare le run in volo. Watchdog (~20 s con variabili documentate): `failed/timed_out`. Salvage e `--rescue-from` solo se il push fallisce. Nessun duplicato di run o PR. File: persi se non pushati; stato: recuperato; sessione: **nessuna ripresa** (nessun `--resume`, CODE) | `docs/live-warren-recovery.md`, `reports/s01-warren-live.md`, `reports/comparison.md` |
| Paseo Hub | `PARTIAL` | 1 | SIGKILL con run in volo: agente sopravvissuto, daemon riconnesso in ~2 s, nessun secondo agente. **Bug v0.10.0:** `manual-runs` risponde 500 dopo il riavvio; coda con daemon offline non parte attraverso un riavvio di Hub. **#147** riprodotta: SIGTERM a Hub con daemon connesso non termina (≥90 s) | `reports/s00-paseo-hub.md` |
| Paseo daemon (LIVE) | `PARTIAL` | 1 | dopo riavvio: stato agente `closed`, `lastUsage` perso; sopravvivono `sessionId` e `nativeHandle`; ripresa della sessione non provata; nessun riavvio durante una run | `reports/s01-paseo-live.md` §3.2 |
| OpenClaw | `PARTIAL` | 1 | riavvio a riposo con persistenza di schede, claim, sessione; un turno `c3` dopo il riavvio ha ripreso la sessione (`--resume` per DOC). **Anomalia:** due riavvii consecutivi falliti con `AggregateError: Shared-state read and cleanup failed`, causa non diagnosticata. Crash con run in volo non provato | `reports/s00-openclaw.md`, `reports/s01-openclaw-live.md` §3 |
| Paperclip | `PARTIAL` | 1 | SIGTERM in 240-425 ms, dati persistiti; run in volo non provato; ne parte una di continuazione automatica | `reports/s00-paperclip.md`, `reports/s01-paperclip-live.md` §3.2 |
| Gas Town | non eseguito (solo E-stop senza agenti) | 1 | `gt estop`: il SIGTSTP **non** ferma un processo in tmux, SIGSTOP sì | `reports/s00-gastown.md` |
| Controller di riferimento | `PASS` (mock) | test | riavvio con lease riconciliata; evento duplicato idempotente | `fixtures/mock-integrations/queue-controller.test.mjs` |
| Baseline | non eseguito | 0 | - | - |
| «PC spento» (R08.1) | `BLOCKED` | - | serve una VM Linux remota; oggi tutto gira su questo computer | `reports/FINAL-RECOMMENDATION.md` §10 |

## Artefatti
`docs/live-warren-recovery.md` (output grezzo essenziale), `reports/s00-paseo-hub.md`; output completi nello scratchpad della sessione (non versionati).

## Costi
0 USD (stub o agente finto).

## Stato e motivo
**PARZIALE.** Non provati: guasti con un agente Claude Code vero dentro Warren; run concorrenti e riavvii ripetuti di Warren; crash con run in volo su OpenClaw, Paperclip, Gas Town; errore transitorio del provider (MOCK); fallimento ripetuto di un test CI; riavvio durante una run Paseo. Per Warren la ripresa di sessione è CODE (assenza di `--resume`), non provata con un agente vero.
