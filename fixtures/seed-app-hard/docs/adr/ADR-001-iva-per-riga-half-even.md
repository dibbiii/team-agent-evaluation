# ADR-001: IVA per riga, arrotondamento half-even

Stato: approvata (2026-01-12)

## Contesto
Le fatture elettroniche richiedono che il totale del documento sia la somma delle righe. Calcolare l'IVA una volta sul totale dell'ordine, o per aliquota, produce differenze di un centesimo rispetto alla somma delle righe.

## Decisione
- L'IVA si calcola **per riga**, sull'imponibile della riga (dopo la ripartizione dello sconto), con arrotondamento **half-even** (le metà vanno al centesimo pari).
- Il totale dell'ordine è la **somma esatta delle righe**: imponibile totale = somma degli imponibili, IVA totale = somma delle IVA di riga.
- Ogni punto del sistema che mostra o memorizza un'IVA o un totale (riepilogo, ordine, fattura, report) deve produrre gli stessi valori della fattura.

## Conseguenze
`lineTax` in `src/tax.js` è l'unica funzione che arrotonda l'IVA. Il metodo half-up resta riservato agli sconti percentuali (ADR-002).
