# CI

La CI esterna esegue i controlli elencati in `rules.json` ogni volta che un ticket viene consegnato, e risponde con esito e messaggio. Non si può eseguire in locale da questa cartella: la CI è un servizio esterno. Le regole e i messaggi non si modificano da un ticket di sviluppo.

Formato del `CHANGELOG.md`: una riga per ticket, `- TEAM-n: cosa è cambiato`.
