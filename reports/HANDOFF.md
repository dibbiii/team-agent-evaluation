# Handoff

Data: 2026-10-21.

## Stato

- M0–M6 completati. M3 (smoke test) fatto in modalità MOCK per tutti e cinque i candidati: tutti `PARTIAL`. M4 (prove critiche con agenti reali) **non eseguito sui candidati**. M5 (integrazione) solo come studio e controller di riferimento.
- Raccomandazione in `reports/FINAL-RECOMMENDATION.md`: Opzione A primaria, B seconda, C differita. Confidenza media sui rischi di sicurezza, bassa sul confronto di capacità.
- Nessun processo o container attivo avviato da questa valutazione (`docker ps -a --filter label=tae=1` vuoto). Docker Desktop è acceso su richiesta dell'utente: si può spegnere per liberare RAM.
- Commit solo locali. **Nessun push** (richiede l'approvazione dell'utente).
- Spesa: 0,83 USD nel registro `results/budget-ledger.json` (0,45 valida + 0,38 su run invalidate). Budget residuo 14,17 USD.

## Da riprendere (in ordine di valore)

1. ~~Sonde S02/S07 sulla baseline~~ **fatte** (6 run, `reports/s02-s07-baseline.md`). Se se ne rilanciano altre: la RAM libera dell'host è spesso < 1 GB (browser, Docker Desktop); il wrapper salta la run sotto 0,6 GB.
2. **Fixture più dura** (cross-modulo, regressioni sottili, requisito contraddittorio) e baseline n≥3: la fixture attuale ha effetto soffitto (9/9).
3. **VM Linux con ≥8 GiB**: Warren con isolamento reale (`warren up`, kill del worker, S06); Paperclip completo (`pnpm dev`, serve Rust); riproduzione di #16935 con `claude_local` e in modalità `authenticated`.
4. **Jira Cloud gratuito** (progetto `TAE`, token a scope minimo in variabile d'ambiente): puntare `queue-controller.mjs` a Jira reale.
5. **Run LIVE dei candidati** (S01–S03, S08): servono credenziali dentro i container o i runtime dei candidati. Richiede una nuova approvazione esplicita con budget massimo e numero di run.

## Cosa serve (credenziali: solo nomi, mai valori)

- Budget LLM aggiuntivo per i candidati (approvazione esplicita); chiave provider in variabile d'ambiente.
- Token Jira a scope minimo; progetto Jira sandbox.
- Autorizzazione al push della repository.

## Avvertenze per chi riprende

- Il `CLAUDE.md` globale dell'utente contamina le run `claude -p` se non si imposta `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`: verificarlo con una sonda prima di ogni lotto e leggere i riassunti degli agenti, non solo i test.
- Sul daemon Docker ci sono container e volumi dell'utente. Toccare solo risorse `tae-` con label `tae=1`; mai `prune`.
- I cloni di terze parti sono nello scratchpad della sessione (fuori dalla repo). Sono ricreabili con `git clone`.
- Domande aperte: `docs/decisions.md` (D15, D16) e il punto 10 della raccomandazione.
