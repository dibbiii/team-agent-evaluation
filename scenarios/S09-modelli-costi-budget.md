# S09 — Modelli, costi e budget

Stato: **PARZIALE**. Costi e token misurati per baseline e candidati nelle run LIVE (stime a listino, non fatture); **nessun budget ha fermato una run a metà**: il tetto di Warren con Claude Code scatta solo a run finita (provato, F60) e il budget di Paperclip è aggirabile dall'agente e a 0 centesimi in abbonamento (F01, F47); il routing per task e l'escalation non sono stati provati.

## ID e obiettivo
- **ID:** S09. **Requisiti:** R06.1-R06.4, R11.3.
- **Obiettivo (§6):** identificare provider/modelli e granularità del routing; verificare l'escalation verso un modello più capace e se richiede un restart di sessione; misurare token input/output/cache solo se attendibili, altrimenti `unknown`; costo totale per issue **accettata** inclusi fallimenti e retry; verificare che un budget superato fermi davvero nuove esecuzioni; separare i confronti fra modelli da quelli fra orchestratori.

## Setup e condizioni iniziali
- Un solo modello in tutte le run: `claude-sonnet-5-5`, con login `claude.ai` (abbonamento Team): `total_cost_usd` è una **stima a listino**, `costBasis: "list"` (`reports/budget.md`).
- Registro cumulativo `results/budget-ledger.json` (tetto 15 USD; `spent_usd` 4,560626 al momento della lettura).

## Input
Le run di S01 (e S02/S07 sulla baseline).

## Comandi e script reali
- Registro e tetti: `scripts/run-baseline.mjs` (`TOTAL_CAP_USD = 15`, `RUN_CAP_USD = 1.5`, `MAX_TURNS = 25`), `scripts/run-hard-batch.mjs`, `scripts/live/warren-live-batch.ps1` (`-CapUsd`).
- Warren: `MAX_COST_USD` e `WARREN_RUN_MODEL` in `scripts/live/warren-run.sh`; verifica del modello fissato: `scripts/live/model-pin-check.sh`.
- Registrazione per candidato: `scripts/live/record-warren-run.mjs`, `paperclip-record-run.mjs`, `openclaw-record-run.mjs`; riepilogo uso/costi dal Gateway OpenClaw (sola lettura): `scripts/live/openclaw-usage.sh`. Per Paperclip il budget si legge dalle API `/budgets/overview` e `/costs/summary` (`reports/s01-paperclip-live.md` §3.2), non da uno script dedicato.

## Risultati attesi
Costo per issue accettata con fallimenti inclusi; budget superato = nessuna nuova esecuzione; routing osservato distinto da configurabilità; token `null` se non attendibili.

## Teardown
Non applicabile (nessuna risorsa persistente oltre al registro).

## Esito per sistema

| Sistema | Esito | Dato misurato | File |
|---|---|---|---|
| Baseline | `PARTIAL` | facile: 0,0448 (ISSUE-1), 0,0485 (ISSUE-2), 0,0563 (ISSUE-6) per issue accettata, nessun fallimento; difficile: medio 0,194 USD (circa 4×), 100-250 s; token e cache nei JSON | `reports/s01-baseline.md`, `reports/hard-calibration.md` |
| Warren (aggiornamento LIVE 2026-10-22) | `PARTIAL`: **il tetto non ferma la run, scatta solo a run finita** (TESTED) | 2 run LIVE: `--max-cost-usd 0,01` su ISSUE-1: l'agente ha finito il lavoro (0,1010 USD, **10,1x il tetto**), `budget.exceeded` emesso 7 ms dopo il `result`, stato `cancelled` (`failureReason` null), branch pushato con 1 commit corretto (held-out PASS), **nessuna PR**, costo nel record e nell'evento. Tetto 0,5: nessuna interferenza (`succeeded`, 0,0968, PR). Nessun budget cumulativo nel codice (CODE): non fermerebbe nuove run | `reports/s09-s07-s04-warren-live.md`, `results/S09-warren-*.json` |
| Warren (S01) | `PARTIAL` | modello **non controllabile** per `claude-code` (nessun `--model`, nessun `ANTHROPIC_MODEL`: CODE; la prima run mostrava `claude-opus-5-5`; aggirato con `.claude/settings.json` di progetto); `--max-cost-usd 1` accettato e mai superato nelle run S01 (l'effetto del tetto è misurato nella riga precedente); token `null` (Warren non li riporta); costo medio 0,0894 | `reports/s01-warren-live.md`, `docs/live-warren-recovery.md` |
| Paperclip | `PARTIAL` | token e costo riportati; **budget aggirabile dall'agente** (#16935); con login in abbonamento la spesa registrata resta **0 centesimi** (`billingType: subscription_included`), il tetto non si consuma; in S00 la policy `unpricedUsagePolicy=block` ha mandato in hard stop un run a 0 cent; con chiave API non provato | `reports/s01-paperclip-live.md` §3.2, `reports/s00-paperclip.md` |
| Paseo + Hub | `PARTIAL` | `lastUsage` con costo e token per run (perso al riavvio del daemon); modello statico, nessun budget (DOC) | `reports/s01-paseo-live.md` §3 |
| OpenClaw | `PARTIAL` | token da trascrizione; il campo `usage` di OpenClaw con `claude-cli` mostra solo l'ultima chiamata e nessun costo (`missingCostEntries`); spesa di fondo non richiesta (heartbeat 0,128 USD, riepiloghi Haiku non misurati); provider e failover (DOC) | `reports/s01-openclaw-live.md` §3 |
| Gas Town | `PARTIAL` (costi misurati nelle 2 run S01; nessun budget provato) | 0,2927 e 0,1423 USD su ISSUE-1 (medio 0,2175 contro 0,0448 della baseline, 4,9 volte; 0,435 per una consegna effettiva), token 24 / 4.273 / 548.773 / 56.071 e 14 / 2.256 / 236.133 / 29.002 (in / out / cache read / cache write), costo a listino con cache write 2,50 assunto; `gt costs` ha riportato 0,98 USD per run1 (prezzi fissi di Gas Town, non confrontabile) e nessun enforcement (CODE); `CLAUDE_CODE_EFFORT_LEVEL=high` di default; spese di fondo di daemon, Deacon e Witness non misurate (non avviati); modello `claude-sonnet-5-5` dalla trascrizione | `reports/s01-gastown-live.md` §11, `reports/findings.md` F45, F70 |

## Artefatti
`results/budget-ledger.json`, campi `estimated_cost_usd`/`input_tokens`/`output_tokens`/`cache_tokens` nei JSON di `results/`.

## Costi
Spesa del registro 4,56 USD su 15. Lotto S09/S07/S04 su Warren (8 run, `reports/s09-s07-s04-warren-live.md`): 0,774 USD su 1,5, non nel registro; le 2 run S09 costano 0,1010 (tetto 0,01) e 0,0968 (tetto 0,5). Gas Town: circa 0,44 USD (2 run più ping).

## Stato e motivo
**PARZIALE.** Provato in negativo: il tetto di Warren con Claude Code non arresta la run (10,1 volte il tetto, nessun budget cumulativo: F60, D28). Non provati: il tetto di Pi a metà run (serve un harness Pi); budget con chiave API su Paperclip; budget superato che blocchi nuove esecuzioni (per Warren non esiste, CODE); escalation a un modello superiore; routing per task; costo per issue accettata con fallimenti (nessuna run valida è fallita a livello di test, quindi il costo dei fallimenti è 0 nei dati, salvo la run Warren `cancelled` per tetto e la run1 di Gas Town non consegnata); confronto fra modelli diversi. Il costo con abbonamento non equivale a una fattura.
