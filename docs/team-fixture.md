# Fixture di squadra (`seed-app-team`)

Costo di costruzione e di validazione: 0 USD. Nessun modello, nessuna rete, nessuna distribuzione WSL. Solo codice Node e documenti.

**Stato:** costruita e validata a costo zero il 2026-10-22. **Nessuna run con un agente è stata fatta su questa fixture**: ogni numero su difficoltà, turni e costi è una **stima** di progetto, etichettata così, non una misura.

## 1. Perché esiste

La fixture difficile (`docs/hard-fixture.md`) misura se UN agente sa risolvere issue indipendenti con trappole realistiche, e lo sa fare: 23 prove su 24 passano (`reports/hard-n3.md`). Ma non può dire se un **team** di agenti (Analyst, Planner, due Developer, Reviewer indipendente, supervisore, come in `idea-progetto.md` §4) vale il suo costo, perché le sue issue non si parlano fra loro: un agente solo le risolve una alla volta senza bisogno di coordinarsi.

Questa fixture sposta la difficoltà dal **codice** al **carico di coordinamento**. Il codice è volutamente piccolo (11 file, 307 righe): ciò che cresce è il numero di cose che devono restare coerenti fra loro mentre il lavoro avanza.

## 2. Cosa misura (i sette elementi e dove stanno)

| # | Elemento | Come è fatto | Test oggettivo |
|---|---|---|---|
| 1 | Sotto-compiti con dipendenze reali e file condivisi | 7 ticket più un change-request (§4); grafo a diamante `TEAM-2 -> TEAM-3, TEAM-4 -> TEAM-5`; `TEAM-5` e `TEAM-6` partono dallo stesso stato e toccano entrambi `cancel()` in `src/bookings.js` | `git merge-file` sui due rami di riferimento dà un conflitto; ogni sotto-compito fallisce senza le sue dipendenze |
| 2 | Requisito incompleto + oracolo umano | `docs/requirements/feature.md` non dice cosa succede se si annulla a noleggio già iniziato (**Q1**) né come si arrotonda la penale (**Q2**); `fixtures/oracle-team/answers.json` risponde alle domande previste e con «non è importante» a quelle non previste | `[T2][Q1]`, `[T3][Q1]`, `[T2][Q2]`: implementare senza chiedere li fa fallire, con il nome del test che dice dove |
| 3 | Cambio di requisito a metà | `fixtures/oracle-team/change-request-1.md` (CR-1), da rilasciare nel workspace dopo il completamento di `TEAM-4`: i rimborsi senza penale tornano sul metodo originale, non a credito | 4 punti di controllo `[CR:ledger]`, `[CR:wiring]`, `[CR:notify]`, `[CR:event]`: ognuno misura UNA assunzione che il lavoro già fatto dava per scontata |
| 4 | Fallimento CI deterministico | `scripts/team-ci.mjs` simula la CI esterna: test, `no-console`, `money-helpers` (nessun `Math.ceil` fuori da `money.js`, ADR-001), `sorted-exports` (gli export di `index.js` in ordine: tipico dopo un merge), `tests-with-code`, `changelog`. Risponde con esito e messaggio con file e riga | 4 mutanti «solo CI»: il codice è giusto, la CI li boccia; ogni tentativo finisce in `ci-log.jsonl` |
| 5 | Conflitto con una decisione approvata | `feature.md` REQ-3 dice che il credito «scade dopo 90 giorni»; `ADR-004` dice che non scade mai (come HARD-7) | `[T4][ADR-004]`: il saldo è identico a 90, 91, 400 e 5000 giorni; il Reviewer (`TEAM-7`) deve segnalarlo |
| 6 | Held-out, riferimenti, mutanti | `fixtures/acceptance-team/` (55 test, mai nella cartella dell'agente), `fixtures/reference-team/` (soluzioni per sotto-compito, merge e feature completa), 32 mutanti (§7) | `scripts/validate-team-fixture.mjs` |
| 7 | Determinismo e dimensione | orologio, id e gateway iniettati; PRNG con seme fisso; nessun timer; dimensione ridotta | validazione ripetuta 3 volte con risultato identico |

## 3. Struttura

| Percorso | Contenuto | Lo vede l'agente? |
|---|---|---|
| `fixtures/seed-app-team/` | Repository di partenza: `src/` (11 file), `test/` (28 test visibili), `docs/adr/` (5 ADR), `docs/requirements/feature.md`, `ci/` (regole), `CHANGELOG.md` | Sì |
| `fixtures/issue-catalog/team-tasks.json` | Sotto-compiti TEAM-1..8: tipo (`ask`, `implement`, `review`), ruolo, `depends_on`, `ready`, campi Jira-like, `release` del change-request | Sì (il driver lo trasforma in ticket) |
| `fixtures/oracle-team/` | `answers.json` (risposte), `oracle.mjs` (aiuto per il driver), `change-request-1.md` (da rilasciare a metà) | No, solo il driver |
| `fixtures/acceptance-team/` | Test held-out `TEAM-n.acceptance.test.js` e `FEATURE.acceptance.test.js` (55 test) con `helpers.mjs` | **Mai** |
| `fixtures/reference-team/` | `stages/` (una sovrapposizione per sotto-compito, costruita sulle sole sue dipendenze), `merge/` (unione a mano dei due rami paralleli), `stages.json` (catene), `mutants.mjs` (32 mutanti come modifiche testuali) | No |
| `scripts/team-ci.mjs` + `scripts/lib/team-ci-lib.mjs` | CI locale che simula la CI esterna | No (è fuori dalla cartella dell'agente) |
| `scripts/validate-team-fixture.mjs` | Validazione, vedi §7 | |
| `scripts/score-team-run.mjs` + `scripts/lib/team-score-lib.mjs` | Valutazione di una run | |

Moduli di `src/`: `money` (centesimi, `pct` half-up, `ceilDiv`), `calendar` (date ISO UTC), `catalog`, `pricing` (preventivo), `bookings` (`BookingService`), `payments` (gateway finto con guasto iniettabile), `notifications` (`Outbox`), `events` (bus), `config`, `util`, `index`. **Non esistono** `policy.js` e `ledger.js`: li scrivono i sotto-compiti.

## 4. La feature e il grafo dei sotto-compiti

Feature: **annullamento con penale e credito cliente**. Oggi `cancel()` cambia solo lo stato.

```
TEAM-1 (ask, Analyst)  ->  TEAM-2 (penale a scaglioni, src/policy.js)
TEAM-2  ->  TEAM-3 (cancel() con penale, src/bookings.js)      } B e C partono insieme
TEAM-2  ->  TEAM-4 (CreditLedger, src/ledger.js)               }
TEAM-3 + TEAM-4  ->  TEAM-5 (collegamento credito, src/bookings.js)   <- D chiude il diamante
TEAM-3  ->  TEAM-6 (avviso in outbox, src/bookings.js)         <- parallelo a TEAM-5: stesso cancel() = conflitto
TEAM-4 completato  ->  si rilascia il change-request CR-1  ->  TEAM-8 (aggiorna ledger, cancel(), avviso, evento)
TEAM-5 + TEAM-6 + TEAM-8  ->  TEAM-7 (review indipendente)
```

| Ticket | Tipo | Ruolo | Dipende da | File | Held-out |
|---|---|---|---|---|---|
| TEAM-1 | ask | Analyst | nessuno | `docs/requirements/` | usa l'oracolo; le domande si classificano (§6) |
| TEAM-2 | implement | Developer | TEAM-1 | `src/policy.js`, `index.js` | 9 test, con `[Q1]` e `[Q2]` |
| TEAM-3 | implement | Developer | TEAM-2 | `src/bookings.js` | 11 test |
| TEAM-4 | implement | Developer | TEAM-2 | `src/ledger.js`, `index.js` | 8 test, con `[ADR-004]` |
| TEAM-5 | implement | Developer | TEAM-3, TEAM-4 | `src/bookings.js` | 8 test, con `[ADR-005]` (atomicità) |
| TEAM-6 | implement | Developer | TEAM-3 | `src/bookings.js`, `src/notifications.js`, `index.js` | 7 test, con `[ADR-003]` |
| TEAM-8 | implement | Developer | TEAM-4 (rilascio) | `bookings.js`, `ledger.js`, `notifications.js` | 9 test `[CR:...]` |
| TEAM-7 | review | Reviewer | TEAM-5, 6, 8 | tutto, sola lettura | verdetto confrontato con l'esito dei test |
| (feature) | integrazione | | | | 3 test `[FEATURE]` |

I sotto-compiti sono 7, più il change-request: il piano originale ne ha 7 (uno è `ask` e uno è `review`, non producono codice), il change-request è il ticket 8 che esiste solo dopo il rilascio.

### Le due trappole di requisito, spiegate semplice
- **Q1 e Q2 (requisito incompleto).** `feature.md` elenca tre scaglioni di penale (0%, 30%, 70%) ma non dice (Q1) che cosa succede se l'annullamento arriva *dopo* la data di inizio, né (Q2) come si arrotonda una penale che non è un numero intero di centesimi. Un buon Analyst lo nota e chiede. L'oracolo risponde: Q1 = 100% della tariffa e deposito restituito; Q2 = arrotondamento per eccesso. Chi non chiede indovina: di solito 70% o un errore, e `pct()` (half-up). I test `[T2][Q1]`, `[T2][Q2]` falliscono con quel nome: il fallimento è **diagnosticabile**.
- **Conflitto con ADR-004.** Chi implementa alla lettera «scade dopo 90 giorni» rompe `[T4][ADR-004]`. Chi lo segnala (Analyst o Reviewer) fa la cosa giusta; l'oracolo risponde «vale ADR-004».

## 5. Come si usa (protocollo per il driver)

Lo fa il driver, non l'agente. Lo stesso protocollo vale per i due bracci (agente solo e team) in modo che il momento del change-request sia identico:

1. Copiare `fixtures/seed-app-team/` in una cartella di lavoro; il driver dà ai ruoli i ticket da `team-tasks.json` (mai il campo `release` né il file del CR).
2. **Round 1:** TEAM-1, TEAM-2, TEAM-3, TEAM-4. Le domande dell'Analyst (o dell'agente solo) vanno a `askOracle(domanda)` di `fixtures/oracle-team/oracle.mjs` e la risposta torna all'agente. Ogni domanda e ogni risposta si registra in `run-log.json`.
3. Dopo il round 1: `releaseChangeRequest(<cartella>)` copia `change-request-1.md` in `docs/requirements/`.
4. **Round 2:** TEAM-5, TEAM-6, TEAM-8. **Round 3:** TEAM-7, il Reviewer scrive `review.json` (`{ "verdict": "approve" | "request_changes", "findings": [{ "text": "..." }] }`).
5. Ogni consegna passa dalla CI locale: `node scripts/team-ci.mjs <cartella> --task TEAM-3 --log <ci-log.jsonl>`. Ogni invocazione aggiunge una riga al log: è il conteggio **oggettivo** dei tentativi. L'agente non vede il runner né le regole di controllo oltre a `ci/rules.json`.
6. Valutazione: `node scripts/score-team-run.mjs <cartella-finale> <run-log.json>`.

`run-log.json` (dichiarato dal driver; un campo assente vale «non misurato», mai zero):

```json
{
  "run_id": "...", "arm": "single | team | other",
  "questions": ["testo della domanda", "..."],
  "human_interventions": 0,
  "git_conflicts": 0,
  "ci_attempts": { "TEAM-2": 1, "TEAM-3": 2 },
  "completion_order": ["TEAM-1", "TEAM-2", "TEAM-4", "TEAM-3"],
  "change_request": { "released_after": "TEAM-4", "released": true },
  "prs": [{ "task": "TEAM-2", "branch": "..." }],
  "tracker_updates": 7,
  "review_expected": true,
  "tokens": { "input": 0, "output": 0, "cache": 0 },
  "cost_usd": 0.0, "turns": 0,
  "roles_used": ["Analyst", "Planner", "Developer", "Developer", "Reviewer"]
}
```

## 6. Che cosa produce la valutazione

`scripts/score-team-run.mjs` scrive (e stampa) un JSON con:

- **`code_acceptance`** (e `status`, stesso valore): `PASS` solo se i test **visibili originali** del seed (eseguiti contro il `src/` dell'agente, che non può indebolirli), **tutti** i test held-out e l'integrità sono a posto. Integrità: le ADR esistenti e `ci/` non si modificano (aggiungere una nuova ADR è ammesso).
- **`workflow_acceptance`** nel formato di `docs/results-schema.md`, **simulato dal runner locale**: `ci_status` dalla CI locale sull'albero finale, `review_state` da `review.json` (`approve` = `approved`, `request_changes` = `pending`), `pr_created` e `tracker_updated` dal run-log. Non c'è un forge reale: la dicitura è nelle note.
- **Metriche di coordinamento:**
  - conflitti Git (dichiarati);
  - tentativi di CI (dal `ci-log.jsonl` se c'è, altrimenti dichiarati) e quanti oltre il primo per ticket;
  - **domande utili e inutili**: ogni domanda passa dall'oracolo. Utile = prima domanda che corrisponde a una voce `expected` (Q1, Q2, Q3-ADR-004); inutile = risposta già nel repository (date, deposito, canale di invio) o risposta di default o ripetizione. L'abbinamento è per parole chiave: **è una euristica dichiarata**, non un giudizio semantico;
  - **assunzioni non aggiornate dopo il change-request** (0-4), dai test `[CR:...]` che falliscono;
  - interventi umani (dichiarati);
  - **ordine di dipendenza**: ogni sotto-compito completato deve avere le dipendenze completate prima;
  - accordo del Reviewer con i test (approvato un codice che fallisce = 0; allarme su codice che passa = 0,5);
  - diagnosi dei fallimenti attesi: «Q1 noleggio già iniziato», «Q2 arrotondamento», «ADR-004 credito non scade».
- **Punteggio composito** (`composite`) con pesi trasparenti, riportati in ogni risultato:

| Voce | Peso | Formula |
|---|---|---|
| Correttezza | 45 | test held-out superati / totali |
| Consegna | 10 | `workflow_acceptance.delivered` (1 se true, 0 se false) |
| Ordine di dipendenza | 8 | 1 − violazioni / sotto-compiti completati |
| Assunzioni dopo il CR | 10 | 1 − non aggiornate / 4 |
| Domande | 10 | 0,6 × (attese poste / 3) + 0,4 × (1 − inutili / 4) |
| Efficienza CI | 5 | 1 − tentativi extra / 6 |
| Conflitti Git | 3 | 1 − conflitti / 4 |
| Interventi umani | 4 | 1 − interventi / 4 |
| Accordo del Reviewer | 5 | vedi sopra |

Le voci **non misurate** (`null`) sono escluse e il totale viene riportato a 100 sul peso misurato (`composite.coverage` dice quanto). Per confrontare i **due bracci** si usa `composite_common`, che considera solo le voci misurabili allo stesso modo in entrambi (correttezza, consegna, assunzioni dopo il CR, domande, efficienza CI, interventi umani): ordine di dipendenza, conflitti e accordo del Reviewer esistono per costruzione solo nel team. I pesi sono una scelta di progetto e sono modificabili solo motivando, e **prima** delle prove.

## 7. Come è stata validata

Comando: `node scripts/validate-team-fixture.mjs` (circa 2,5 minuti per esecuzione completa su questo computer, tre esecuzioni per il determinismo). Controlla:

1. 28 test visibili passano sul seed; i 55 test held-out falliscono sul seed (per file: tutti e 7 i file falliscono).
2. Per ogni sotto-compito: l'albero con le sole sue dipendenze passa i visibili, i test del riferimento, i suoi held-out e la CI; senza le dipendenze fallisce (colonna «Fallisce senza dip.»).
3. Feature completa (con CR-1): visibili, 55/55 held-out e CI passano; il merge prima del CR passa gli held-out pre-CR.
4. Mutanti (`fixtures/reference-team/mutants.mjs`): ognuno bocciato dai test held-out attesi, oppure (per i quattro «solo CI») dalla CI locale con il controllo atteso; si controlla anche che i test **visibili non** li catturino già (sono difetti non coperti dai visibili).
5. Conflitto Git inevitabile: `git merge-file` fra i rami `TEAM-5` e `TEAM-6` dà un conflitto su `src/bookings.js`.
6. Nessun test held-out, soluzione, oracolo o change-request dentro `seed-app-team`; i test held-out non importano dai riferimenti né dai mutanti; il catalogo non cita trappole o mutanti.
7. Catalogo: grafo aciclico con diamante, tipi `ask`/`implement`/`review`, coppie parallele che toccano lo stesso file, `ready` coerente, CR con rilascio.
8. Oracolo: ogni voce attesa ha un tag che compare nei test; domande di prova abbinate alla voce giusta.
9. Dimensione del seed (8-20 file, 300-900 righe, 4-6 ADR) e determinismo: tre esecuzioni complete con lo stesso risultato.

**Risultati dell'ultima validazione** (tutti riportati dallo script, non da stime):

Eseguita il 2026-10-22 con `node scripts/validate-team-fixture.mjs` (3 esecuzioni complete, 478 s in totale, circa 160 s ciascuna), esito **TUTTO OK**:

- **Seed:** 11 file sorgente, 307 righe, 5 ADR, 28 test visibili (28 passano). I 55 test held-out falliscono su tutti e 7 i file (sul seed passa al più qualche test di regressione già vera, per esempio riprenotare dopo un annullamento: il file fallisce comunque).
- **Riferimenti:** per ognuno dei 6 sotto-compiti di codice l'albero con le sole dipendenze passa visibili, test del riferimento, held-out del sotto-compito e CI; senza le dipendenze gli held-out falliscono (5 su 5 per i sotto-compiti con dipendenze). Feature completa: visibili PASS, held-out **55/55**, CI PASS.
- **Mutanti: 32 in tutto, 28 con canale held-out, tutti 28 catturati, 0 non catturati;** 4 «solo CI» (i test passano, la CI fallisce sul controllo atteso: `money-helpers`, `sorted-exports`, `changelog`, `no-console`). Nessuno dei 28 è catturato dai test visibili. Per tipo: difetto sottile 13, assunzione non aggiornata dopo il CR 6, requisito incompleto indovinato male 3, conflitto di merge risolto male 3, dipendenza ignorata 2, violazione di ADR 1, solo CI 4.
- **Conflitto Git:** `git merge-file` fra i rami `TEAM-5` e `TEAM-6` su `src/bookings.js`: 1 conflitto.
- **Determinismo:** tre esecuzioni complete con la stessa impronta del risultato (`f2d28d7d021b` tre volte).
- **Catalogo:** 8 ticket, diamante chiuso in TEAM-5, coppie parallele sullo stesso file: TEAM-5/TEAM-6 e TEAM-4/TEAM-6 (più coppie che coinvolgono il CR).

Test dello scoring e della validazione: `scripts/score-team-run.test.mjs` e `scripts/validate-team-fixture.test.mjs` (`node --test scripts/*.test.mjs`).

### Mutanti per sotto-compito e per tipo

| Sotto-compito | Mutanti | Tipi |
|---|---|---|
| TEAM-2 | 8 | requisito incompleto indovinato male (Q1 ×2, Q2), difetto sottile ×3, solo CI ×2 |
| TEAM-3 | 5 | dipendenza ignorata, difetto sottile ×3 (data ignorata, quantità ignorata, stato cambiato prima di validare), solo CI |
| TEAM-4 | 3 | violazione di ADR-004, difetto sottile, dipendenza ignorata |
| TEAM-5 | 4 | difetto sottile ×3 (deposito dimenticato, ordine delle operazioni, errore ingoiato), conflitto risolto male |
| TEAM-6 | 5 | conflitti risolti male ×2, difetto sottile ×3 |
| TEAM-8 | 7 | assunzione non aggiornata dopo il CR ×6, solo CI |

## 8. Stime di fragilità e ambiguità per sotto-compito

**Sono stime di progetto, non misure** (nessuna run con un agente): «fragilità» = probabilità che un test fallisca anche con un'implementazione ragionevole per colpa del test; «ambiguità» = quanto il testo lascia spazio a più letture ragionevoli.

| Sotto-compito | Fragilità (stima) | Ambiguità (stima) | Note |
|---|---|---|---|
| TEAM-1 | n/a | Alta per costruzione | È proprio l'ambiguità di `feature.md` che deve emergere. Rischio: domande formulate in modo che le parole chiave dell'oracolo non le riconoscano (euristica, vedi limiti) |
| TEAM-2 | Bassa-media | Alta (Q1, Q2 volute) | I test fissano i nomi dei campi (`tier`, `percent`, `feeCents`, `daysBefore`) e i nomi degli scaglioni (`free`, `partial`, `late`, `started`: l'ultimo è nella risposta dell'oracolo). Un agente che non chiede può anche scegliere un nome diverso per lo scaglione dopo l'inizio; è la stessa mancanza di domanda |
| TEAM-3 | Media | Bassa | Fissa la forma di `booking.cancellation` e dell'evento (campi dichiarati in REQ-2). I test controllano i campi uno per uno, non l'uguaglianza dell'oggetto: campi in più non fanno fallire |
| TEAM-4 | Bassa | Alta sull'ADR (voluta) | I test controllano i campi della voce uno per uno; la proprietà «non scade mai» è un invariante |
| TEAM-5 | Media | Media | L'atomicità (ADR-005) è verificata con un ledger che lancia: chi non legge ADR-005 e cambia lo stato prima fallisce, con il nome del test. Il test con un ledger «ballerino» (fallisce una volta) presuppone che si possa ritentare |
| TEAM-6 | Media-alta | Bassa | Il testo del messaggio è confrontato **per esteso**: è prescritto in REQ-5, ma un solo carattere diverso fa fallire. Rischio più alto di test «troppo rigido» |
| TEAM-8 | Media | Media | Dipende da leggere `change-request-1.md` per intero. I test `[CR:...]` sono scritti per misurare ciascuno un'assunzione distinta |

## 9. Difficoltà per un agente solo (stima)

**Stima, non misurata.** Riferimenti reali: la fixture difficile costa 0,12-0,26 USD per issue e 6-22 turni; la più cara (HARD-3) 0,415 USD (`reports/hard-calibration.md`, `reports/hard-n3.md`).

- L'agente solo dovrebbe **riuscire ma con fatica**: ogni sotto-compito è piccolo, ma sono sei da tenere coerenti, con una CI che boccia le violazioni comuni, un requisito incompleto da chiarire e un cambio a metà.
- Stima: **70-110 turni e 0,9-2,2 USD per run** (centrale circa 1,4 USD), contro 6-22 turni e 0,12-0,26 USD di una issue difficile. Per il team, stima **115-140 turni totali e 1,6-3,4 USD** (centrale circa 2,4), perché ogni sessione rilegge il repository. Ipotesi in `docs/next-phase-plan.md` §5.
- **Non è risolvibile da un banale script:** i test held-out sono nascosti, controllano comportamenti derivati da più file (instradamento del rimborso, atomicità, messaggi, saldi), includono proprietà su 300 e 120 casi pseudo-casuali e invarianti (il credito non scade mai), e un'implementazione fissa o parziale cade (32 mutanti).
- Rischio opposto, **effetto soffitto**: con un solo modello forte e un seed così piccolo l'agente solo potrebbe passare tutto. Se capita, `docs/next-phase-plan.md` §3 dichiara come procedere (alzare la difficoltà, non concludere che il team è inutile).

## 10. Cosa NON misura

- **Non dimostra** che un team sia meglio di un agente solo: costruisce il banco di prova, non la risposta. Nessuna run con un agente è stata fatta.
- **Non misura la sicurezza**: nessun agente che sondi i confini, nessuna prompt injection (S07 resta altrove).
- **Non misura la qualità della conversazione** fra ruoli, solo i risultati (codice, domande classificate per parole chiave, CI, ordine).
- **Non è un forge reale**: PR, CI e review sono simulati dal runner locale. Non prova webhook, Jira, merge queue, rebase sul forge.
- **Non misura il recupero da crash** (S06) né la memoria fra sessioni (S08).
- **Un solo dominio** (un piccolo sistema di noleggio), **un solo tipo di cambio di requisito**, tre requisiti incompleti o in conflitto; non generalizza a codice reale grande.
- I conteggi **dichiarati dal driver** (domande, conflitti, interventi, ordine di completamento) sono onesti solo se il driver lo è: dove c'è un registro oggettivo (`ci-log.jsonl`, test `[CR:...]`) vale quello.
- L'abbinamento delle domande all'oracolo è per **parole chiave**: una domanda giusta scritta in modo insolito può essere classificata «inutile», una domanda generica con la parola giusta «utile». I casi dubbi si rileggono a mano.
- Le soglie del composito sono scelte di progetto, non calibrate su dati.

## 11. Rischi di equità fra i due bracci

| Rischio | Perché falsa il confronto | Come lo si controlla |
|---|---|---|
| Accesso all'oracolo | `claude -p` non è interattivo: l'agente solo non può «chiedere» come un Analyst | Il driver offre al braccio A lo stesso canale (una riga `ASK:` letta dal driver, risposta dall'oracolo) e conta le domande allo stesso modo |
| Momento del change-request | Il team parallelizza, l'agente solo no: «dopo un sotto-compito completo» non è lo stesso istante | Round identici per i due bracci (§5): il CR si rilascia dopo il round 1 per tutti |
| Review indipendente | Esiste solo nel team | Nel braccio A il Reviewer non c'è: la voce è `null` e non entra nel composito comune. Se si vuole un confronto con review, si aggiunge un passo di review anche ad A e si dichiara |
| Metriche solo-team (ordine, conflitti, accordo) | Il composito completo favorisce chi ha più cose da misurare | Si confronta solo `composite_common` |
| Conteggio dei tentativi CI | Chi consegna un ticket alla volta ha più tentativi «in gioco» | Si conta `extra` (oltre il primo per ticket); lo stesso massimo di tentativi per i due bracci |
| Dichiarazioni del driver | Il driver del team è nostro e potrebbe contare diversamente dal driver dell'agente solo | Dove possibile si usano registri oggettivi (`ci-log.jsonl`, held-out); gli altri conteggi si dichiarano con la stessa regola |
| Costo | Il team ha più sessioni e rilegge il repository | Il costo si riporta separato e si usa «costo per run accettata»; il composito non lo include |
| Prompt e istruzioni | Un prompt più curato per un braccio falsa tutto | Lo stesso testo di base per ogni ticket; le differenze di ruolo sono le sole ammesse |
| Overfitting dei ruoli al CI | Un ruolo che legge `ci/rules.json` evita l'errore e un altro no | Le regole sono visibili a tutti nel seed: è il caso reale |
| Un solo modello, n piccolo | Nessuna generalizzazione | Dichiarato in `docs/next-phase-plan.md` |

## 12. Come eseguire

```bash
# Validazione completa (circa 2,5 minuti per esecuzione, 3 esecuzioni per il determinismo)
node scripts/validate-team-fixture.mjs
# Iterare: una sola esecuzione, solo i mutanti di un sotto-compito, con i test che falliscono
node scripts/validate-team-fixture.mjs --once --only TEAM-8 --explain
# Scrivere in una cartella l'albero della soluzione di riferimento completa
node scripts/validate-team-fixture.mjs --materialize /percorso/vuoto
# CI locale su una cartella di lavoro (aggiunge una riga al registro dei tentativi)
node scripts/team-ci.mjs <cartella> --task TEAM-3 --log <ci-log.jsonl>
# Valutare una run
node scripts/score-team-run.mjs <cartella-finale> <run-log.json> --out <risultato.json>
# Suite dei test
node --test scripts/*.test.mjs "fixtures/mock-integrations/*.test.mjs"
```

Funziona con Node 22 e successivi, senza dipendenze. I test visibili del seed: `(cd fixtures/seed-app-team && npm test)`.
