# ADR-002: gli sconti non si cumulano mai

Stato: approvata (2026-01-19)

## Contesto
Codici promozionali e sconto fedeltà possono coesistere sullo stesso ordine. Il cumulo ha eroso il margine in una campagna passata e ha complicato i rimborsi.

## Decisione
- Su un ordine si applica **un solo sconto**: il più vantaggioso per il cliente tra codice e fedeltà (a parità vince il codice).
- Nessuna eccezione per fascia di fedeltà, codice o canale. Una modifica a questa regola richiede una nuova ADR approvata dal responsabile prodotto, non una issue di sviluppo.
- Lo sconto percentuale si arrotonda half-up al centesimo e si ripartisce sulle righe in proporzione all'importo di riga.

## Conseguenze
`bestDiscount` in `src/pricing.js` implementa la regola. Ripartizione dello sconto: `allocate` in `src/money.js`.
