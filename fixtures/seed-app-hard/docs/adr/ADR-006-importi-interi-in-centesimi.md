# ADR-006: importi interi in centesimi

Stato: approvata (2026-01-05)

## Decisione
- Ogni importo è un intero in unità minime (centesimi). Nessun `number` frazionario nei calcoli monetari.
- Le divisioni passano da `roundHalfUp` / `roundHalfEven` in `src/money.js`; le ripartizioni da `allocate` (la somma delle parti è il totale).
- Il testo (per esempio "12.50" o "12,50 EUR") è solo una rappresentazione e si produce all'ultimo momento.

## Conseguenze
`centsToEuros` è deprecata (restituisce un float) e non va usata in nuovo codice.
