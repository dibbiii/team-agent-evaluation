# Budget LIVE autorizzato

Data: 2026-10-20. L'utente ha delegato la scelta del budget («scegli tu un budget che ti sembra adeguato e documentalo»). Questo documento fissa i limiti.

## Cosa copre

Solo la **baseline single-agent**: Claude Code in modalità non interattiva (`claude -p`), modello fissato `claude-sonnet-5-5`, su issue della fixture.

| Voce | Limite |
|---|---|
| Spesa totale (stima a prezzo di listino riportata dalla CLI) | **15,00 USD** |
| Per singola run | **1,50 USD** (`--max-budget-usd 1.5`) |
| Turni massimi per run | 25 (`--max-turns 25`) |
| Run pianificate | 9 valide: ISSUE-1, ISSUE-2, ISSUE-6, n=3 ciascuna (più 9 run invalidate per contaminazione, vedi sotto) |
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
- Isolamento dalla configurazione dell'utente: `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` (esclude il `CLAUDE.md` globale, che altrimenti altera la baseline), `--setting-sources project`, `--strict-mcp-config` senza server MCP, `--no-session-persistence`.
  **Correzione del 2026-10-20:** la prima versione si affidava solo a `--setting-sources project`, che **non** esclude il `CLAUDE.md` globale. Una sonda lo ha mostrato (senza la variabile l'agente riportava la regola «spiega e fermati»; con la variabile rispondeva `NESSUNA`). Le prime 9 run ne erano contaminate: gli agenti si fermavano a metà lavoro (ISSUE-6 fallì 3 volte su 3, con riassunti del tipo «mi fermo qui, come da tue preferenze»). Sono state **invalidate e conservate** in `results/invalid-contaminated/`, escluse da ogni confronto. Il loro costo (0,38 USD) resta nel registro. Le run valide sono state rifatte dopo la correzione.
- Nessuna credenziale viene copiata in file o container. L'autenticazione è quella già presente nella CLI.

## Cosa NON è coperto (richiede un'altra approvazione)

- Run LIVE dei candidati (Paperclip, Warren, Gas Town, ecc.) con un agente reale al loro interno: richiederebbero di fornire credenziali dentro i container o sul loro runtime. Non autorizzato da questo budget.
- Jira reale, repository esterni, push o PR.
- Qualunque spesa oltre 15,00 USD.

## Limiti di validità

n=3 per issue: nessuna generalizzazione statistica. Un solo modello, quindi nessun confronto fra modelli. La baseline gira sull'host con permessi ristretti e non in un container: è un compromesso per non dover iniettare credenziali in una sandbox.

---

## Aggiunta 2026-10-21 — run LIVE dei candidati (autorizzata dall'utente: «decidi tu»)

L'utente ha delegato la scelta del budget (che «viene preso dall'abbonamento») e dei candidati.

| Voce | Decisione |
|---|---|
| Autenticazione | Abbonamento claude.ai dell'utente, con login di `claude` fatto **dentro** la distribuzione WSL dedicata `Ubuntu-26.04`. Nessuna chiave API. Il login lo completa l'utente nel browser |
| Candidati | **Warren** (priorità: decide fra le opzioni A e B), poi **Paperclip** con `claude_local` solo se Warren è completato (anche per rifare #16935 con un agente reale). **Nessun LIVE** per Gas Town (`direct` di default, `bypassPermissions`), Paseo Hub (dispatcher), OpenClaw (fuori dal percorso critico) |
| Tetto (stima a listino, registro condiviso `results/budget-ledger.json`, 15 USD totali) | Warren 5 USD, Paperclip 3 USD |
| Per run | 1,00 USD; Warren max 6 run, Paperclip max 3 |
| Dati | Solo la fixture del benchmark: nessun dato reale, nessun repository privato, nessuna credenziale oltre al login di `claude` |

Regole di arresto: stop dopo 2 run consecutive in errore di esecuzione; stop se `scripts/wsl-isolate.sh verify` non passa; stop se una run tenta di leggere o scrivere fuori dal worktree o di raggiungere il disco Windows; stop se il login scade.

Rischio accettato dall'utente: il token di accesso dell'abbonamento resta salvato nella distribuzione dedicata e può essere letto dai processi che girano lì (codice di terzi, agenti con i permessi disattivati). Non è denaro, ma un accesso al suo account. Mitigazioni: distribuzione senza disco Windows né interop, utente non root, `claude logout` e `wsl --unregister Ubuntu-26.04` a fine prova (eseguiti il 2026-10-22), e nessun altro uso di quella distribuzione.

Costi: con l'abbonamento `total_cost_usd` è una stima a listino. Warren può avere un proprio tetto per run (da configurare); in ogni caso il registro del benchmark è la fonte per il totale.

---

## Aggiunta 2026-10-21 (sera) — run LIVE degli altri quattro candidati (autorizzate dall'utente)

L'utente ha dato l'approvazione esplicita alle run LIVE di Paperclip, Gas Town, Paseo Hub e OpenClaw («hai l'approvazione per la run degli altri candidati»), con il login di Claude Code già presente nella distribuzione `Ubuntu-26.04` (piano Team, organizzazione Brainy Labs). Rischi già dichiarati e accettati: credenziali leggibili dai processi nella distribuzione, rete aperta, permessi dell'agente disattivati dentro la sandbox o dentro la distribuzione dedicata.

Tetti che stabilisco io, **in stima a listino**, entro i 15 USD totali del registro (spesa al momento circa 3,5):

| Candidato | Tetto | Run massime | Note |
|---|---|---|---|
| Paperclip (`claude_local`) | 1,5 USD | 2 | più la riprova di #16935 con un agente `claude_local` (senza LLM) |
| Paseo Hub + daemon | 1,5 USD | 2 | un provider reale (Claude) agganciato al daemon |
| OpenClaw | 1,5 USD | 2 | con la CLI `claude` dell'host come backend (documentato), non con una chiave API |
| Gas Town | 2,5 USD | 1–2 | il più rischioso: più agenti LLM (Mayor, Polecat, Refinery) possono consumare molto; limite di tempo e arresto manuale |

Regole: una run alla volta (RAM), un candidato alla volta; per ogni candidato una prova a costo zero prima (rete e DNS dentro la sandbox, come per Warren); isolamento verificato prima di dare credenziali; arresto se il consumo supera il tetto; pulizia e verifica che non restino copie di credenziali; nessun push né PR verso repository esterni; nessuna porta esposta fuori dal PC. Restano esclusi: webhook Jira pubblici (richiedono un endpoint raggiungibile da internet: decisione separata).
Se il controllo automatico dei permessi di Claude Code blocca un'azione (per esempio un agente senza sandbox con i permessi disattivati), non la aggiro: mi fermo e lo riferisco.

## Aggiornamento 2026-10-22 — tetto alzato a 35 USD per le tre fasi successive

L'utente ha approvato (risposta «Tutte e tre (~20-25 USD)») le tre fasi di `docs/next-phase-plan.md`: Fase 1 (spike del runner minimo contro Warren, ~1,5-2 USD), Fase 2 (controller durevole su Postgres e workflow end to end con Jira, ~2-3 USD) e Fase 3 (agente solo contro team, n=3 per braccio, ~7,5-16,8 USD). Spesa già registrata al momento della decisione: 11,36 USD. **Nuovo tetto totale del registro: 35,00 USD** (11,36 già spesi + circa 20-25 USD previsti + riserva). Il tetto per fase e per run resta quello dichiarato nel piano e va rispettato (le run si fermano al superamento); si procede **una fase alla volta**, con un controllo del ledger e un riepilogo all'utente alla fine di ciascuna. Il costo resta una stima a listino sul piano Team, non una fattura. `scripts/run-baseline.mjs` ora usa `TOTAL_CAP_USD = 35`.
