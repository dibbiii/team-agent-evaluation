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

## Decisioni successive (2026-10-21)

| ID | Data | Decisione | Motivo | Stato |
|---|---|---|---|---|
| D09 | 2026-10-20 | Budget LIVE 15 USD totali, 1,50 USD per run, solo baseline | Delegato dall'utente; vedi `reports/budget.md` | Applicata |
| D10 | 2026-10-20 | Le 9 prime run baseline sono invalidate e conservate in `results/invalid-contaminated/` | Il `CLAUDE.md` globale era caricato nonostante `--setting-sources project`; ora `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, verificato con una sonda | Applicata |
| D11 | 2026-10-20 | Smoke test dei candidati solo in container non privilegiato, senza socket, mount né porte, senza credenziali | Istruzioni §1 e §9; sul daemon ci sono container dell'utente | Applicata |
| D12 | 2026-10-20 | Il Jira sandbox non è necessario per proseguire: finto Jira con API in formato REST v3 e controller di coda che lo usa via HTTP | L'utente non ha un Jira sandbox; l'adapter si ripunta a uno reale cambiando URL e credenziali. S05 resta `PARTIAL` | Applicata |
| D13 | 2026-10-21 | Raccomandazione: Opzione A primaria, B seconda, C differita | Vedi `reports/FINAL-RECOMMENDATION.md`. Fondata su prove S00, #16935 riprodotta, baseline 9/9 e controller provato | Valida fino ai nuovi test |
| D14 | 2026-10-21 | Budget e permessi degli agenti vivono fuori dalla loro portata | #16935 riprodotta su Paperclip | Applicata come requisito di progetto |
| D15 | 2026-10-21 | Le sonde S02/S07 sulla baseline, fermate la prima volta dal sistema per memoria, sono state rilanciate su richiesta dell'utente con un controllo sulla RAM libera | L'utente ha chiarito che il costo non è monetario (abbonamento); 6 run completate | Chiusa |
| D16 | 2026-10-21 | La fixture va resa più dura prima di concludere sul valore di un orchestratore | La baseline passa 9/9: effetto soffitto | Aperta |
| D17 | 2026-10-21 | Il controller usa gli stati e le transizioni come li espone Jira Cloud: ID scoperti a runtime, stati riconosciuti per nome (anche in italiano), commenti in ADF, PR pronta = "In Review", "Done" solo dopo il merge umano | Dedotto dagli screenshot del progetto KAN dell'utente (workflow To Do / In Progress / In Review / Done, interfaccia in italiano, priorità vuota). Provato solo contro il mock che riproduce queste forme | Applicata |
| D18 | 2026-10-21 | Le issue del benchmark si creano nel Jira dell'utente con `scripts/jira-seed.mjs`, in dry-run di default, idempotente, solo sul progetto indicato | L'utente non ha un Jira sandbox separato; il token resta nell'ambiente dell'utente | Applicata |
| D19 | 2026-10-21 | S05 su Jira reale eseguita dall'utente con `scripts/jira-s05-live.mjs`: PASS 8/8, n=1, nessun LLM, nessun costo | Il controller di riferimento regge su Jira Cloud (priorità, claim concorrenti, In revisione, dipendenze sbloccate da Completata, riconciliazione, ticket utente intatti). Non copre i webhook né alcun candidato | Chiusa |
| D20 | 2026-10-21 | Le run LIVE dei candidati si faranno in una distribuzione WSL2 dedicata (`Ubuntu-26.04`) senza il disco Windows né interop, con utente non root | Riduce l'esposizione dell'agente al PC dell'utente. Non è un confine forte (VM e kernel condivisi): accettabile per dati finti e credenziali a budget limitato; per un uso reale servirebbe una VM separata | Applicata, verificata 6/6 |
| D21 | 2026-10-21 | In Warren il modello di Claude Code si fissa con `.claude/settings.json` di progetto nel repository della fixture, non con `--model` | Warren non passa `--model` alla harness `claude-code` (CODE) e nella prima run LIVE il modello risultava `opus-5-5`. Da verificare dall'evento `init` | Applicata, da verificare |
| D22 | 2026-10-21 | Non si lancia mai Claude Code con i permessi disattivati fuori da una sandbox, nemmeno per una prova; il controllo automatico dei permessi ha bloccato una prova di questo tipo | Rischio di agente senza confini con credenziali; rispettato il blocco | Applicata |
