# Budget LIVE autorizzato

Data: 2026-10-20. L'utente ha delegato la scelta del budget («scegli tu un budget che ti sembra adeguato e documentalo»). Questo documento fissa i limiti.

## Cosa copre

Solo la **baseline single-agent**: Claude Code in modalità non interattiva (`claude -p`), modello fissato `claude-sonnet-5-5`, su issue della fixture.

| Voce | Limite |
|---|---|
| Spesa totale (stima a prezzo di listino riportata dalla CLI) | **15,00 USD** |
| Per singola run | **1,50 USD** (`--max-budget-usd 1.5`) |
| Turni massimi per run | 25 (`--max-turns 25`) |
| Run pianificate | 9: ISSUE-1, ISSUE-2, ISSUE-6, n=3 ciascuna |
| Riserva per prove e ripetizioni | 1,50 USD (9 × 1,50 = 13,50 USD di tetto teorico) |

Il tetto per run è molto sopra la stima attesa. Una chiamata minima è costata 0,0099 USD (`total_cost_usd`, misurata). Per task piccoli su una fixture di tre file si attendono costi nell'ordine di decine di centesimi per run: **è una stima, non una misura**; il valore reale viene registrato per ogni run.

## Natura del costo

`claude auth status` mostra un login `claude.ai` (abbonamento), non una chiave API a consumo. `total_cost_usd` è quindi una stima a prezzo di listino (`costBasis: "list"`), utile per confrontare le run. Le run consumano anche i limiti d'uso dell'abbonamento dell'utente.

## Regole di arresto

- Il wrapper `scripts/run-baseline.mjs` tiene un registro cumulativo (`results/budget-ledger.json`) e **non avvia** una run se spesa accumulata + tetto per run supera 15,00 USD.
- Stop dopo 3 run consecutive in errore (non per test falliti, ma per errori di esecuzione).
- Una run che supera il tetto viene fermata dalla CLI e registrata come `FAIL` con il costo reale.

## Isolamento delle run

- Workspace: copia temporanea della fixture fuori dalla repo; i test held-out restano fuori e vengono eseguiti da `scripts/evaluate.mjs` su una copia separata (l'agente non li vede).
- Strumenti consentiti: Read, Edit, Write, Glob, Grep e Bash limitato a `node` e `npm test`. Niente web, niente `--dangerously-skip-permissions`.
- Isolamento dalla configurazione dell'utente: `--setting-sources project` (non carica il `CLAUDE.md` globale, che altrimenti altererebbe il comportamento della baseline), `--strict-mcp-config` senza server MCP, `--no-session-persistence`.
- Nessuna credenziale viene copiata in file o container. L'autenticazione è quella già presente nella CLI.

## Cosa NON è coperto (richiede un'altra approvazione)

- Run LIVE dei candidati (Paperclip, Warren, Gas Town, ecc.) con un agente reale al loro interno: richiederebbero di fornire credenziali dentro i container o sul loro runtime. Non autorizzato da questo budget.
- Jira reale, repository esterni, push o PR.
- Qualunque spesa oltre 15,00 USD.

## Limiti di validità

n=3 per issue: nessuna generalizzazione statistica. Un solo modello, quindi nessun confronto fra modelli. La baseline gira sull'host con permessi ristretti e non in un container: è un compromesso per non dover iniettare credenziali in una sandbox.
