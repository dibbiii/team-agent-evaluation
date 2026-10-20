# S01 — Baseline single-agent (Claude Code), LIVE

Data: 2026-10-20. Modo `LIVE`. Modello `claude-sonnet-5-5`. Strumento: `claude -p` (Claude Code 2.1.304) via `scripts/run-baseline.mjs`. Il commit della repository usato come base è registrato in `baseline_commit` di ogni JSON (la fixture non è cambiata tra le run).
Budget e isolamento: `reports/budget.md`. Dati grezzi: `results/S01-baseline-claude-code-*.json` (valide), `results/invalid-contaminated/` (escluse).

## Risultati (run valide, n=3 per issue)

| Issue | Tipo | Esito | Costo medio (USD) | Durata media | Turni | Costo per issue accettata |
|---|---|---|---|---|---|---|
| ISSUE-1 | bug (arrotondamento sconto) | 3/3 PASS | 0,0448 | 40 s | 6–7 | 0,0448 |
| ISSUE-2 | feature (SAVE50 con tetto) | 3/3 PASS | 0,0485 | 33 s | 7–11 | 0,0485 |
| ISSUE-6 | feature cross-file (limite quantità) | 3/3 PASS | 0,0563 | 39 s | 9–11 | 0,0563 |

`PASS` = test visibili e test held-out (eseguiti fuori dal workspace dell'agente su una copia di `src/`) entrambi verdi.
Spesa valida: 0,45 USD (9 run). Spesa totale nel registro: 0,83 USD, compresi 0,38 USD delle 9 run invalidate.
Token: registrati in ogni JSON (input, output, cache). Costi = stima a prezzo di listino, perché l'account è un abbonamento.

## Costo dei fallimenti

Nessun fallimento dell'agente tra le run valide, quindi il costo dei fallimenti è 0. I 0,38 USD sprecati nelle run contaminate sono imputabili alla nostra configurazione, non alla baseline, e non sono inclusi nel costo per issue accettata.

## Incidente di validità

Le prime 9 run erano contaminate dal `CLAUDE.md` globale dell'utente (regola «spiega e fermati»): gli agenti si fermavano a metà lavoro, ISSUE-6 «falliva» 3/3. `--setting-sources project` non lo esclude; `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` sì (sonda a due condizioni). Le run contaminate sono state invalidate e conservate. Lezione per tutti i test futuri: **verificare l'isolamento con una sonda prima di ogni lotto** e controllare i riassunti degli agenti, non solo il verde dei test.

## Cosa questo risultato NON dimostra

- **Effetto soffitto:** la baseline passa tutto. Le issue sono piccole (3 file di sorgente), quindi la fixture non discrimina: non può mostrare alcun vantaggio, né svantaggio, di un orchestratore multi-agente. Per misurarlo servono issue più dure (cross-modulo, ambigue, con regressioni sottili) e una fixture più grande. È il limite principale di questo benchmark.
- n=3 per issue, un solo modello, nessuna generalizzazione. Nessun confronto con i candidati: nessuno è stato eseguito in LIVE.
- Il test held-out è scritto da noi: misura i criteri che abbiamo dichiarato, non la qualità complessiva (non valuta stile, test aggiunti dall'agente, né rischio di regressione fuori dai criteri).
- Nessuna prova su requisiti non funzionali della baseline (coda Jira, multiutente, recovery centralizzato): restano da dimostrare, come dice il documento (§13).
- Costi su abbonamento: non equivalgono a una fattura a consumo.
