# Registro delle decisioni

| ID | Data | Decisione | Motivo | Stato |
|---|---|---|---|---|
| D01 | 2026-10-20 | Fixture e harness in Node, senza dipendenze | Python assente, Node 24 presente; la fixture deve essere neutra | Applicata |
| D02 | 2026-10-20 | I cloni dei candidati stanno fuori dalla repo e fuori da OneDrive | Evitare di sincronizzare migliaia di file di terze parti; istruzioni §5 | Applicata |
| D03 | 2026-10-20 | Nessuna installazione globale né uso di credenziali | Istruzioni §1: serve approvazione | Applicata |
| D04 | 2026-10-20 | Le schede dei candidati sono basate su lettura, senza TESTED | Nessun candidato avviabile senza installazioni e Docker | Applicata |
| D05 | 2026-10-20 | Il mock Jira è un controller di riferimento, non un candidato | Misura il costo dell'adapter, non le capacità dei prodotti | Applicata |
| D06 | 2026-10-20 | La rubrica 0–5 non è compilata | Mancano dati sperimentali (istruzioni §10) | Applicata |
| D07 | 2026-10-20 | Raccomandazione provvisoria: partire da Opzione A, con B come seconda scelta | Vedi `reports/FINAL-RECOMMENDATION.md`; da rivedere dopo i test LIVE | Provvisoria |
| D08 | 2026-10-20 | Test held-out per ISSUE-1, 2, 3, 4, 6 | Validati: FAIL sul baseline, PASS con una soluzione di riferimento. ISSUE-5 non ne ha, perché è ambigua per costruzione (S02) | Chiusa |

## Decisioni aperte del documento (§13) e posizione di questa valutazione

| Decisione | Posizione | Fondamento |
|---|---|---|
| Orchestratore | Non decidibile in modo definitivo senza LIVE; indicazione provvisoria per stack minimale | Nessun candidato copre R01, R03, R04.3 e il gate sulle merge |
| Collocazione degli agenti | Server aziendale o VM dedicata con container non privilegiato | I candidati con default permissivi richiedono isolamento esterno |
| Collaborazione umana | Handoff strutturato | Coerente con §7; la sessione attiva condivisa resta `LATER` |
| Modelli | Non decidibile | S09 non eseguito |
| Memoria | File versionati e Serena per la fase A | Coerente con §6 e §13; nessun candidato offre code intelligence |
| Autonomia | PR pronta, nessun merge automatico, imposto da branch protection | R12.2; nessun candidato lo garantisce da solo |
| Complessità | Stack minimale prima, piattaforma modulare solo se serve | §13 |
