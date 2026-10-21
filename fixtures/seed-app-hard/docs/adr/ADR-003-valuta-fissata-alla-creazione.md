# ADR-003: la valuta dell'ordine non cambia dopo la creazione

Stato: approvata (2026-01-26)

## Contesto
I cambi variano di giorno in giorno. Un cliente che ha visto e accettato un importo non deve vedersi addebitare un importo diverso.

## Decisione
- La **valuta** e il **cambio** di un ordine si fissano alla creazione e non cambiano più, per tutta la vita dell'ordine (pagamento, rimborsi, report).
- Gli importi di contabilità restano nella valuta base (EUR). L'importo da addebitare in un'altra valuta si calcola **una volta**, alla creazione, e viene memorizzato.
- Le conversioni usano solo interi (nessun float) e arrotondamento half-even.

## Conseguenze
Nessun codice deve leggere il cambio "corrente" per un ordine già creato.
