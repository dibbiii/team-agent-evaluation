# ADR-005: le operazioni di dominio sono atomiche

Stato: approvata (2026-02-09)

## Contesto
Un annullamento che cambia lo stato ma poi fallisce nel rimborso lascia clienti con prenotazioni annullate e soldi non restituiti.

## Decisione
- Un'operazione di dominio o riesce per intero o non lascia nessuna traccia: stato, saldi, rimborsi, messaggi e eventi restano come prima.
- Ordine consigliato: validare e calcolare; eseguire i passi esterni che possono fallire (gateway, ledger); accodare i messaggi; cambiare lo stato; emettere gli eventi per ultimi.
- Gli errori dei passi esterni si propagano al chiamante con il loro `code`, senza essere ingoiati.

## Conseguenze
I test di una operazione verificano anche il caso in cui un passo esterno fallisce.
