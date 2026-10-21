# S09 — Modelli, costi e budget

Stato: **PARZIALE**. Costi e token misurati per baseline e candidati nelle run LIVE (stime a listino, non fatture); **nessun budget è stato provato come arresto reale di una run**; il routing per task e l'escalation non sono stati provati.

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
| Warren | `PARTIAL` | modello **non controllabile** per `claude-code` (nessun `--model`, nessun `ANTHROPIC_MODEL`: CODE; la prima run mostrava `claude-opus-5-5`; aggirato con `.claude/settings.json` di progetto); `--max-cost-usd 1` accettato, **effetto non misurato**; token `null` (Warren non li riporta); costo medio 0,0894 | `reports/s01-warren-live.md`, `docs/live-warren-recovery.md` |
| Paperclip | `PARTIAL` | token e costo riportati; **budget aggirabile dall'agente** (#16935); con login in abbonamento la spesa registrata resta **0 centesimi** (`billingType: subscription_included`), il tetto non si consuma; in S00 la policy `unpricedUsagePolicy=block` ha mandato in hard stop un run a 0 cent; con chiave API non provato | `reports/s01-paperclip-live.md` §3.2, `reports/s00-paperclip.md` |
| Paseo + Hub | `PARTIAL` | `lastUsage` con costo e token per run (perso al riavvio del daemon); modello statico, nessun budget (DOC) | `reports/s01-paseo-live.md` §3 |
| OpenClaw | `PARTIAL` | token da trascrizione; il campo `usage` di OpenClaw con `claude-cli` mostra solo l'ultima chiamata e nessun costo (`missingCostEntries`); spesa di fondo non richiesta (heartbeat 0,128 USD, riepiloghi Haiku non misurati); provider e failover (DOC) | `reports/s01-openclaw-live.md` §3 |
| Gas Town | non eseguito | `gt costs` con prezzi fermi a gennaio 2025 e nessun enforcement (CODE); nessuna run con l'agente | `reports/comparison.md` §1 |

## Artefatti
`results/budget-ledger.json`, campi `estimated_cost_usd`/`input_tokens`/`output_tokens`/`cache_tokens` nei JSON di `results/`.

## Costi
Spesa del registro 4,56 USD su 15. Stima per la prova del budget su Warren: circa 0,05 USD (`reports/completamento-vs-traccia.md`).

## Stato e motivo
**PARZIALE.** Non provati: arresto reale di una run al superamento del budget (Warren con `--max-cost-usd` molto basso; chiave API su Paperclip); escalation a un modello superiore; routing per task; costo per issue accettata con fallimenti (nessuna run valida è fallita, quindi il costo dei fallimenti è 0 nei dati); confronto fra modelli diversi. Il costo con abbonamento non equivale a una fattura.
