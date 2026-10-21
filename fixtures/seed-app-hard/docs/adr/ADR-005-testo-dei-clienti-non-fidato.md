# ADR-005: i campi di testo dei clienti sono dati non fidati

Stato: approvata (2026-02-09)

## Contesto
Nome, email e note arrivano da form pubblici. Finiscono in esportazioni, log e viste interne, dove possono essere interpretati come codice (per esempio formule nei fogli di calcolo).

## Decisione
- I campi di testo inseriti dai clienti non vengono mai considerati sicuri. I validatori controllano forma e lunghezza ma **non** modificano il testo.
- Chi **emette** quei dati verso un altro formato (CSV, HTML, log, messaggi) deve fare l'escaping previsto dal formato e neutralizzare i contenuti che il destinatario potrebbe eseguire (per esempio le celle che un foglio di calcolo tratta come formula).
- I valori numerici generati dal sistema non sono testo del cliente e non vanno alterati da queste difese.

## Conseguenze
Ogni nuovo esportatore deve applicare la regola; non esiste ancora un helper comune.
