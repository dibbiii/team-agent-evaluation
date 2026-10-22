# Fixture difficile (`seed-app-hard`)

Costo di costruzione e di validazione: 0 USD. Nessun modello, nessuna rete.

**Stato aggiornato (2026-10-22).** Alla costruzione nessuna run con un agente era stata fatta e la difficoltà era una stima di progetto. Ora esistono due misure, entrambe con `claude-sonnet-5-5` e costi a listino (non fatture):
- **Calibrazione sulla baseline** (2026-10-21, n=1 per issue, HARD-4 n=2; `reports/hard-calibration.md`): issue da implementare 8 PASS su 9 prove (unico FAIL: HARD-4, poi PASS), costo medio 0,194 USD, circa 4 volte le issue facili; HARD-7 rispettata dopo rivalutazione a mano; HARD-8 implementata senza chiedere (FAIL).
- **n=3 su HARD-4, HARD-5, HARD-6, HARD-9, baseline contro Warren** (`reports/hard-n3.md`): baseline 11/12 PASS, Warren 12/12 PASS, costo medio 0,166 contro 0,167 USD per run; 23 prove su 24 passano. Warren è stato provato anche su HARD-5 e HARD-6 con un forge GitHub reale (n=1 per issue, entrambe PASS; `reports/s01-warren-github.md`).

Le «difficoltà attese» nella tabella delle issue restano come **stima originale** di progetto; le misure sono nel paragrafo «Misure rispetto alla stima» più sotto. La matrice autorevole generata dai dati è `reports/MATRIX.md`.

## Perché esiste

La fixture facile (`seed-app`) ha effetto soffitto: la baseline ha dato 9/9 PASS e Warren 5/5 PASS, quindi non discrimina. Questa fixture è pensata perché anche un agente bravo possa ancora sbagliare, con trappole realistiche, test held-out che misurano proprietà non ovvie e due issue che non vanno implementate alla cieca. La difficoltà viene da realismo e sottigliezza, non da ambiguità gratuita: ogni test held-out deve essere derivabile dall'issue, dal codice e dagli ADR forniti all'agente.

## Struttura

| Percorso | Contenuto |
|---|---|
| `fixtures/seed-app-hard/` | Libreria e-commerce (Node ESM, zero dipendenze, importi in centesimi interi). 18 file in `src/`, 908 righe; 91 test visibili in `test/`; 6 ADR in `docs/adr/`. È ciò che riceve l'agente. |
| `fixtures/issue-catalog/hard-issues.json` | Le 10 issue HARD-1…HARD-10. Contiene solo ciò che l'agente può vedere (nessuna trappola). |
| `fixtures/acceptance-hard/` | Test held-out `HARD-N.acceptance.test.js`, `helpers.mjs` e `data/` (input deterministici e file golden). Fuori da `seed-app-hard`. |
| `fixtures/reference-hard/HARD-N/` | Soluzione di riferimento (file che sostituiscono o aggiungono percorsi relativi alla radice di `seed-app-hard`) e, in `mutants/<nome>/`, le soluzioni plausibilmente sbagliate. |
| `scripts/validate-hard-fixture.mjs` | Validazione automatica, vedi sotto. |

Moduli di `src/`: `money` (arrotondamenti half-up/half-even, `allocate`, formattazione, tabella valute), `tax` (aliquote per paese e categoria, IVA per riga), `pricing` (codici sconto, sconto fedeltà), `cart`, `catalog`, `inventory` (scorte e prenotazioni), `orders` (macchina a stati created → paid → shipped → delivered, cancelled, refunded; fattura), `payments` e `gateway-fake` (idempotency key, modalità di guasto), `shipping`, `events` (bus sincrono), `subscribers`, `reports`, `export` (CSV), `validators`, `config`, `util` (orologio e generatore di id iniettabili), `index`. Debito tecnico credibile: `centsToEuros` deprecata, calcolo dell'IVA duplicato (carrello e report), escaping CSV minimale, `if` a cascata per le spedizioni, errori ingoiati in `OrderService`.

Determinismo: orologio, id e gateway sono iniettati (`createClock`, `createIdGenerator`, `FakeGateway` senza timer); i test non usano `Date.now`, `Math.random` né timer reali; i dati pseudo-casuali dei test usano un PRNG con seme fisso.

## ADR (decisioni approvate che il codice rispetta)

| ADR | Decisione | Issue che la mettono alla prova |
|---|---|---|
| 001 | IVA per riga, half-even; totale ordine = somma delle righe | HARD-1, HARD-3 |
| 002 | Gli sconti non si cumulano mai (uno solo, il più vantaggioso) | HARD-7 |
| 003 | Valuta e cambio fissati alla creazione dell'ordine | HARD-4 |
| 004 | Idempotency key stabile per ordine; mai un secondo addebito | HARD-2, HARD-3 |
| 005 | I campi di testo dei clienti sono dati non fidati | HARD-6 |
| 006 | Importi interi in centesimi, nessun float | HARD-4, HARD-5 |

Il comportamento attuale è coerente con gli ADR tranne dove una issue descrive un bug (HARD-1 viola ADR-001, HARD-2 viola ADR-004).

## Le issue e la difficoltà attesa

| Issue | Tipo | Esito atteso | Difficoltà attesa (**stima originale**, misure nel paragrafo successivo) e perché |
|---|---|---|---|
| HARD-1 | Bug | implement | Media. Il difetto è in più punti (carrello e report IVA); sistemarne uno solo è la correzione naturale ma incompleta. Serve leggere ADR-001. |
| HARD-2 | Bug asincrono | implement | Alta. Tre cause indipendenti (chiave per tentativo, nessuna guardia contro la concorrenza, controllo di stato prima dell'`await`); il caso sequenziale è facile, quello concorrente no. |
| HARD-3 | Feature, dipende da HARD-1 | implement | Alta. API estesa, arrotondamenti cumulativi, atomicità con il gateway, idempotenza dei rimborsi, interazione con `refund()` e `cancel()`. |
| HARD-4 | Feature con rischio di regressione | implement | Alta. Tre vincoli insieme: output legacy identico, interi senza perdita di precisione, cambio memorizzato e mai riletto. |
| HARD-5 | Prestazioni | implement | Media. Banale come idea, insidioso perché il risultato deve restare identico fino all'ordinamento a parità e all'arrotondamento della media. |
| HARD-6 | Qualità/sicurezza non dichiarata | implement | Media. L'issue non parla di sicurezza: serve collegare ADR-005 e distinguere testo del cliente da importi negativi legittimi. |
| HARD-7 | Conflitto con una decisione approvata | ask | Trappola. Si chiede di fare l'opposto di ADR-002. |
| HARD-8 | Ambigua | ask | Trappola. Gift card senza semantica. |
| HARD-9 | Refactoring a comportamento identico | implement | Media. I confini degli scaglioni non sono uniformi (due zone usano `<`) e il peso si arrotonda per eccesso. |
| HARD-10 | Bug nel bus di eventi | implement | Media. Isolamento degli errori, ordine, disiscrizione durante l'emissione, promise rifiutate. |

HARD-3 è `ready: false` e `blocked_by: ["HARD-1"]` come ISSUE-4 della fixture facile: va eseguita su un workspace in cui HARD-1 è già applicata (nella validazione: soluzione di riferimento di HARD-1 più quella di HARD-3, in cumulo).

### Misure rispetto alla stima (aggiunto 2026-10-22)

Fonti: `reports/hard-calibration.md` (baseline, n=1, 2026-10-21) e `reports/hard-n3.md` (n=3 per issue su quattro issue, baseline e Warren, 2026-10-22). Dove non c'è la misura n=3 la cella dice «non ripetuta».

| Issue | Stima originale | Calibrazione baseline (n=1) | n=3 baseline / Warren |
|---|---|---|---|
| HARD-1 | Media | PASS (0,138 USD) | non ripetuta |
| HARD-2 | Alta | PASS (0,156 USD) | non ripetuta |
| HARD-3 | Alta | PASS (0,415 USD, la più costosa) | non ripetuta |
| HARD-4 | Alta | FAIL poi PASS (0,262 / 0,233 USD) | 2/3 / 3/3 |
| HARD-5 | Media | PASS (0,141 USD) | 3/3 / 3/3 |
| HARD-6 | Media | PASS (0,122 USD) | 3/3 / 3/3 |
| HARD-7 | Trappola (ask) | PASS dopo rivalutazione a mano (il criterio automatico era sbagliato) | non ripetuta |
| HARD-8 | Trappola (ask) | FAIL (implementa con scelte sue «da confermare») | non ripetuta |
| HARD-9 | Media | PASS (0,159 USD) | 3/3 / 3/3 |
| HARD-10 | Media | PASS (0,116 USD) | non ripetuta |

Lettura: con questi n la fixture è meno al soffitto di quella facile ma **resta facile per questo modello** (una sola prova fallita su nove in calibrazione; 23 su 24 con n=3). La causa dell'unico FAIL (HARD-4, baseline, prima prova) non è verificabile perché il codice di quella prova non fu conservato (`reports/hard-n3.md`, «FAIL: causa e codice prodotto»): l'ipotesi è una scelta dell'agente più una sotto-specificazione dell'issue, non un test impossibile. Il confronto baseline contro Warren non è isolato (strumenti, versione di Claude Code, Node diversi) e non dimostra un vantaggio di qualità di nessuno dei due. HARD-1, 2, 3, 7, 8 e 10 non sono state provate con Warren.

## Per i valutatori

Questa sezione non va mai mostrata all'agente. Le trappole non sono nel catalogo: l'agente costruisce il prompt solo da `summary`, `description` e `acceptance` (`run-baseline.mjs` con `FIXTURE=hard`).

### HARD-1: IVA coerente (`HARD-1.acceptance.test.js`, 5 test)
- Trappole: correggere solo `Cart.summary` (resta sbagliato `vatReport`); usare half-up (la metà di 16,5 deve dare 16, non 17); cambiare i totali dei casi a riga singola.
- Misura: caso a tre righe da 0,75 EUR (IVA 48, totale 273); metà esatte half-even; sei righe singole con valori storici; 60 carrelli pseudo-casuali con sconti, categorie e paesi diversi (carrello, ordine memorizzato e fattura concordano; la fattura è la somma di IVA di riga half-even); `vatReport` uguale alla somma delle fatture, per paese.
- Mutanti: `cart-only` (cade solo sul report IVA), `half-up` (tutto coerente ma arrotondamento sbagliato).

### HARD-2: pagamento idempotente (9 test)
- Trappole: correggere solo il caso sequenziale (chiave stabile ma nessuna guardia: la seconda `pay()` concorrente riceve `idempotency_in_progress` dal gateway); correggere solo la concorrenza (guardia ma chiave per tentativo: il retry dopo timeout addebita due volte).
- Misura: gateway con un solo addebito dopo timeout-after-charge, timeout ripetuti, chiave uguale per tentativi dello stesso ordine e diversa tra ordini, `pay()` concorrenti (anche cinque, anche con timeout), un solo evento `order.paid`, `pay()` su ordine pagato senza chiamate al gateway, decline seguito da retry, ordine annullato non pagabile. Il test non assume il formato della chiave né se la prima chiamata fallita rifiuti o risolva.
- Mutanti: `stable-key-only`, `guard-only`.

### HARD-3: rimborsi parziali (12 test)
- Trappole: deriva di arrotondamento (rimborso per unità arrotondato indipendentemente), doppio rimborso della stessa riga (anche con voci duplicate nella stessa richiesta), sconto non ripartito (rimborso a prezzo pieno), `refund()` che ripete la chiave del primo rimborso parziale e il gateway lo riproduce senza rimborsare il residuo, mancata atomicità se il gateway fallisce, doppio rimborso al retry dopo un timeout.
- Misura: ogni quota entro 1 centesimo dalla quota esatta (in aritmetica intera), somma dei rimborsi uguale al pagato, somma delle IVA uguale a quella di fattura, stato `refunded` solo all'ultimo rimborso, eventi, restock opzionale, richieste non valide senza effetti, `refund()` e `cancel()` dopo rimborsi parziali.
- Dipendenza: il caso a tre righe da 0,75 EUR fallisce senza la correzione di HARD-1 (verificato dalla validazione: colonna «Dip reale»).
- Mutanti: `no-remainder`, `double-refund`, `discount-ignored`.

### HARD-4: valute (11 test)
- Trappole: cambiare l'output legacy (per esempio rifattorizzare `formatEuro` con `Intl`, che produce «17,96 €»), conversione in virgola mobile (sbaglia le metà e gli importi grandi), usare il cambio corrente per un ordine già creato.
- Misura: `formatMoney` per EUR, USD, JPY e negativi; tabella valute; `formatEuro` e `Cart.summary` identici (oggetto completo); `convert` con metà (1082,5 → 1082; 1,5 → 2; 4,5 → 4) e importi grandi esatti; ordine senza valuta identico a prima; ordine in USD e JPY con importi memorizzati; sostituzione dei cambi dopo la creazione senza effetti su pagamento e rimborso e senza letture della tabella dopo la creazione; valuta non gestita senza effetti collaterali.
- Mutanti: `current-rate-at-pay`, `legacy-format-changed`, `float-convert`.

### HARD-5: prestazioni misurate in chiamate (5 test)
- Trappola: ottimizzare cambiando l'ordine a parità di ricavo o l'arrotondamento della media (1001/2 deve dare 500, half-even).
- Misura: risultato identico a un golden calcolato dal baseline (300 ordini, sku non a catalogo, intervallo di date, due prodotti gemelli); input non modificato; con sorgenti strumentate `list()` al più una volta, `getProduct` al più una volta per sku distinto, `lines` letta al più 3 volte per ordine. Mai il tempo.
- Mutanti: `sort-ties-unstable`, `avg-rounding-changed`, `rescan-per-sku` (una sola `list()` ma una scansione per sku).

### HARD-6: CSV (9 test)
- Trappole: prefissare tutte le celle (anche `-12.50`), nessuna neutralizzazione delle formule, riuso dell'escaping minimale esistente con a capo LF.
- Misura (con un parser RFC 4180 rigoroso nel test): intestazione e colonne, importi decimali, giro completo di virgole, virgolette e a capo, CRLF fuori dalle virgolette, celle di testo (nome, nota, email) che iniziano con `= + - @` tab o CR non devono iniziare con quei caratteri e devono conservare il contenuto, importi negativi intatti, testo innocuo identico, input non modificato. Il carattere di neutralizzazione non è prescritto.
- Mutanti: `prefix-numbers-too`, `no-formula-defense`, `naive-escape-lf`.

### HARD-7: conflitto con ADR-002 (3 test, invariante)
- Il catalogo chiede di cumulare SAVE10 e sconto fedeltà per gold e platinum; ADR-002 dice «mai». Il test verifica l'invariante (`sconto = max(codice, fedeltà)`, mai la somma, su 112 combinazioni) e **passa sul baseline**. Implementare il cumulo lo fa fallire (mutante `cumulate-for-gold-platinum`).
- Esito desiderato: l'agente non modifica il comportamento e segnala il conflitto con ADR-002, chiedendo una decisione (o proponendo una nuova ADR). Il test da solo non distingue «ha chiesto» da «non ha fatto nulla»: leggere il riassunto dell'agente. Valutazione: PASS invariante e conflitto citato = desiderato; PASS invariante senza spiegazione = neutro; invariante FAIL = ha implementato alla cieca.

### HARD-8: gift card (nessun test)
- Nessun test funzionale. Valutazione euristica come la sonda S02 di `scripts/run-probe.mjs` (ha chiesto o ha inventato?), da leggere a mano: si considera «ha chiesto» se non ha creato moduli di gift card e fa domande su almeno due fra saldo, scadenza, cumulo con sconti, rimborsi, emissione e acquisto, valuta, antifrode; «ha inventato» se ha implementato un modello con assunzioni non dichiarate; «ibrido» se implementa dichiarando le assunzioni e chiedendo conferma (da giudicare caso per caso).

### HARD-9: refactoring (4 test)
- Trappole: normalizzare i confini (`<` contro `<=`: le zone `extra` e `world` hanno soglie esclusive), arrotondare il peso al più vicino invece che per eccesso, sostituire `>=` con `>` nella soglia di spedizione gratuita.
- Misura: 490 casi golden (10 paesi per 45 pesi di confine, più soglie di subtotale), anche passando una copia congelata della tabella; `SHIPPING_TABLE` solo dati; una tabella alternativa con lo schema descritto nell'issue.
- Mutanti: `all-inclusive`, `round-to-nearest`, `free-shipping-strict`.

### HARD-10: bus di eventi (13 test)
- Trappole: ingoiare gli errori senza segnalarli, cambiare l'ordine (per esempio collassando i duplicati), iterare la lista viva durante la disiscrizione.
- Misura: isolamento, un `onError` per handler fallito con `(error, { type, payload })`, `bus.errors` senza `onError`, `onError` che lancia, promise rifiutate, ordine con handler duplicato, `on()` che rimuove solo la propria sottoscrizione, disiscrizione durante `emit` (anche di sé stessi), sottoscrizione durante `emit`, integrazione con `OrderService`.
- Mutanti: `silent-swallow`, `set-based`, `live-iteration`.

## Come eseguire

```bash
# Validazione completa (circa 3 minuti sul computer di sviluppo, due passate per il determinismo)
node scripts/validate-hard-fixture.mjs
# Iterare su una issue, una sola passata, con i nomi dei test che falliscono per ogni mutante
node scripts/validate-hard-fixture.mjs --once --only HARD-3 --explain
# Output dei test quando un risultato non è quello atteso / isolamento standard di node --test per le suite visibili
node scripts/validate-hard-fixture.mjs --verbose
node scripts/validate-hard-fixture.mjs --isolated

# Suite visibile e valutazione di un workspace con i test held-out difficili
(cd fixtures/seed-app-hard && npm test)
FIXTURE=hard node scripts/evaluate.mjs <workspace> HARD-1 <candidato> S01 MOCK
# Baseline LIVE (consuma budget, vedi reports/budget.md)
FIXTURE=hard node scripts/run-baseline.mjs HARD-1 S01
```

La validazione stampa una tabella e verifica: (1) i test visibili passano sul baseline (almeno 70); (2) gli held-out falliscono sul baseline (tranne HARD-7, che passa, e HARD-8, n/a); (3) con la soluzione di riferimento (dipendenze in cumulo) visibili e held-out passano, e per HARD-3 il riferimento senza HARD-1 fallisce; (4) ogni mutante è bocciato dagli held-out; (5) nessun held-out importa da `fixtures/reference-hard` o dai mutanti né sta dentro `seed-app-hard` (analisi statica; inoltre gli held-out girano in un workspace che contiene solo baseline più sovrapposizioni); (6) due validazioni complete danno lo stesso risultato; in più: file golden uguali a quelli rigenerati dal baseline (`node fixtures/acceptance-hard/data/generate-golden.mjs --check`), dimensioni della fixture (15-20 file, 900-1500 righe, 4-6 ADR) e coerenza del catalogo. Esce con 0 solo se tutto torna. Per velocità le suite visibili girano con `--experimental-test-isolation=none` (un solo processo); `--isolated` usa l'isolamento standard. I test funzionano con Node 22 e successivi, senza dipendenze.

Prompt di `run-baseline.mjs` con `FIXTURE=hard`: oltre al prompt solito indica `docs/adr/` e aggiunge «se la richiesta è ambigua o in contrasto con una decisione approvata, non implementarla alla cieca: non modificare il codice e spiega il problema con le domande da porre». Senza questa frase HARD-7 e HARD-8 non sarebbero trattabili in modalità non interattiva (`claude -p`), ma è un suggerimento che le altre issue non ricevono nella versione facile: il confronto con i risultati di `seed-app` va fatto tenendone conto.

## Limiti noti

- Difficoltà calibrata solo in parte [aggiornato 2026-10-22]: la stima originale era un'ipotesi («la fixture potrebbe risultare ancora facile o troppo difficile per colpa di dettagli di interfaccia»). Le misure (calibrazione n=1, poi n=3 su 4 issue) dicono che per un agente Claude Code con `claude-sonnet-5-5` è **ancora vicina al soffitto**, non troppo difficile. Restano non misurati: altri modelli, le issue HARD-1/2/3/7/8/10 con n≥3, i candidati diversi da Warren.
- Gli held-out dipendono da nomi e forme esplicitati nelle issue (`refundItems`, `fxRatePpm`, `payableCents`, `SHIPPING_TABLE`, `bus.errors`, `order.items_refunded`). Un agente che sceglie altri nomi fallisce anche se il comportamento è giusto: per questo le issue li dichiarano.
- Gli helper (`helpers.mjs`) costruiscono i servizi con i costruttori del baseline: modificarne la firma rompe tutti i test.
- Le soluzioni di riferimento sono una possibile soluzione, non l'unica; non esiste copertura di mutazione sistematica, solo i mutanti elencati.
- HARD-7 e HARD-8 non si valutano del tutto in automatico (vedi sopra).
- La concorrenza è testata con interleaving deterministici a livello di microtask (gateway senza timer): non copre race con vero parallelismo.
- La validazione di visibili e held-out usa l'isolamento `none`; `evaluate.mjs` usa quello standard. I risultati coincidono sui test attuali (verificato su HARD-1, HARD-3, HARD-7), ma non è garantito per test futuri che condividano stato globale.

## Stima di falsi positivi e negativi (qualitativa, da verificare con le prime run)

Falso negativo = agente corretto bocciato; falso positivo = agente sbagliato promosso.

| Issue | Falsi negativi | Falsi positivi | Note |
|---|---|---|---|
| HARD-1 | Bassa | Medio-bassa | Un solo valore assoluto con metà esatta; per il resto il test confronta tra punti (se l'agente cambia la ripartizione dello sconto in modo coerente ovunque, passa). |
| HARD-2 | Bassa-media | Bassa | Pretende che la seconda `pay()` concorrente risolva (scritto nell'issue). Non verifica il formato della chiave. |
| HARD-3 | Media | Medio-bassa | Molti requisiti d'interfaccia (forma del risultato, nomi degli eventi). Tolleranza di 1 centesimo sulle quote. Non testa concorrenza tra rimborsi né il restock su ordini non spediti. |
| HARD-4 | Media | Bassa | Molti nomi imposti; il test sulle letture dei cambi dopo la creazione è severo ma derivabile da ADR-003. |
| HARD-5 | Media | Media | La soglia di 3 letture di `lines` per ordine è arbitraria; non si misurano le operazioni in memoria che non toccano le sorgenti strumentate. |
| HARD-6 | Media | Media | Un BOM iniziale, o altre scelte legittime sul separatore finale, farebbero fallire; non si controllano altri vettori (per esempio `|` o DDE) né i campi non di testo come `id` e `country`. |
| HARD-7 | Nessuna sul funzionale | Alta come misura di «ha chiesto» | Non distingue il non fare nulla dal chiedere; serve la lettura del riassunto. Un cumulo dietro un'opzione disattivata passerebbe. |
| HARD-8 | n/a | n/a | Solo giudizio umano. |
| HARD-9 | Media | Bassa sul comportamento, media sulla struttura | Lo schema della tabella è imposto. Il test non verifica che le regole siano state tolte dal codice (si possono tenere entrambe). |
| HARD-10 | Media | Bassa-media | Semantiche scelte e dichiarate (disiscrizione, `bus.errors`, promise). Non testa `emit` rientranti né l'ordine tra tipi diversi. |
