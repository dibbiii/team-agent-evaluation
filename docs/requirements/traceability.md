# Matrice di tracciabilità dei requisiti

Fonte autorevole: `idea-progetto.md` (non modificato). Le sezioni citate sono quelle del documento.
Candidati: **PC** Paperclip, **PS** Paseo/Paseo Hub, **OC** OpenClaw, **WR** Warren, **GT** Gas Town, **BL** baseline Claude Code single-agent.
Priorità: `MUST` necessario per la PoC o per adottare la piattaforma, `SHOULD` importante, `LATER` fase successiva.
La priorità deriva dal documento (§10, §12, §13). Dove il documento non decide, lo si dichiara.

Gli stati `evidenza` si compilano in `reports/comparison.md`. Qui si definisce solo cosa verificare e con quale test.

## Requisiti

| ID | Requisito | Sez. documento | Priorità | Criterio di accettazione | Test | Candidati |
|---|---|---|---|---|---|---|
| R01.1 | Scoprire issue da Jira via API/webhook | §3.1 | MUST | Un catalogo di ≥5 issue viene acquisito da mock Jira (e da sandbox se autorizzata) | S05 | tutti + BL |
| R01.2 | Valutare la readiness di un'issue | §3.1 | MUST | Un'issue ambigua è marcata non pronta e non avviata | S02, S05 | tutti + BL |
| R01.3 | Priorità e dipendenze nella selezione | §3.1, §10 | MUST | Con una issue bloccata, viene scelta la successiva eseguibile | S05 | tutti + BL |
| R01.4 | Lock/lease anti-duplicazione | §3.1 | MUST | Due worker non reclamano la stessa issue; un evento duplicato è idempotente | S04, S05 | tutti + BL |
| R01.5 | Aggiornare lo stato su Jira e collegare la PR | §3.6 | MUST | Stato e link PR tornano al tracker (mock o sandbox) | S05 | tutti + BL |
| R01.6 | Passare alla issue successiva senza intervento umano | §3.6, §14 | MUST | Con coda di 5 issue, la successiva parte dopo il completamento della precedente | S05 | tutti + BL |
| R02.1 | Analyst consulta prima codice, docs e Jira | §3.2 | SHOULD | Le domande poste non sono ricavabili dal repository | S02 | tutti + BL |
| R02.2 | Intervista umana con alternative e impatti | §3.2, §9 | SHOULD | La domanda contiene opzioni, conseguenze e raccomandazione | S02 | tutti + BL |
| R02.3 | Output: specifica, decisioni, questioni aperte, criteri | §3.2 | SHOULD | Esiste un artefatto strutturato con le quattro parti | S02 | tutti + BL |
| R02.4 | Analisi critica di contraddizioni | §3.2 | LATER | Un secondo passaggio individua un requisito contraddittorio iniettato | S02 | tutti + BL |
| R03.1 | Piano come documento leggibile e DAG eseguibile | §3.3 | MUST | Il DAG è machine-readable e il sistema esegue davvero quello pianificato | S03 | tutti + BL |
| R03.2 | Task con Objective, Context, Dependencies, Scope, Acceptance, Risk, Verification, Budget | §3.3 | SHOULD | Tutti gli otto campi presenti per ogni task | S03 | tutti + BL |
| R03.3 | Modifiche al piano proposte, non silenziose | §3.3 | MUST | Un cambio di requisito approvato richiede nuova approvazione e lascia traccia | S02, S03 | tutti + BL |
| R03.4 | Pianificazione proporzionata al rischio | §3.3 | SHOULD | Un bug piccolo salta il processo completo | S01, S03 | tutti + BL |
| R04.1 | Ruoli come catalogo attivabile dinamicamente | §4 | SHOULD | Per un task piccolo parte solo Developer + Reviewer | S03 | tutti + BL |
| R04.2 | Messaggi diretti, artefatti condivisi, eventi per il gateway | §4 | SHOULD | Un Developer interroga l'Architect senza passare dall'umano | S03 | tutti + BL |
| R04.3 | Permessi di ruolo applicati dall'infrastruttura, non dal prompt | §4 | MUST | Un Analyst/Reviewer non scrive fuori dal consentito; i subagenti non superano i permessi | S03, S07 | tutti + BL |
| R05.1 | Scheduler deterministico/event-driven, LLM solo per il ragionamento | §5 | MUST | Le decisioni di scheduling si ripetono con lo stesso input senza chiamate LLM | S04, S05 | tutti + BL |
| R05.2 | Parallelismo sicuro e rilevamento di collisioni | §3.1, §10 | MUST | Due task indipendenti vanno in parallelo; due in conflitto vengono serializzati o segnalati | S04 | tutti + BL |
| R05.3 | Retry limitati, escalation, pause e stop | §8 | MUST | Un fallimento ripetuto si ferma al limite e passa a escalation | S06 | tutti + BL |
| R06.1 | Routing multi-modello per task | §5 | SHOULD | Il modello scelto cambia con tipo/rischio del task | S09 | tutti + BL |
| R06.2 | Escalation verso un modello più capace | §5 | SHOULD | Dopo fallimenti, il task riparte con un modello superiore (indicare se serve un nuovo avvio di sessione) | S09 | tutti + BL |
| R06.3 | Budget con arresto reale; costi input/output/cache | §5, §9 | MUST | Un budget superato blocca nuove esecuzioni; token `null` se non attendibili | S09 | tutti + BL |
| R06.4 | Routing effettivo distinto da configurabilità | §5 | SHOULD | Il report separa «configurabile» da «osservato in esecuzione» | S09 | tutti + BL |
| R07.1 | Project Memory (architettura, stack, convenzioni) | §6 | SHOULD | Un agente in sessione nuova la recupera senza leggere la chat precedente | S08 | tutti + BL |
| R07.2 | Code Intelligence (simboli, relazioni) | §6 | SHOULD | Query simbolica risolta senza leggere l'intero repository | S08 | tutti + BL |
| R07.3 | Decision Memory con motivazioni | §6 | MUST | Una decisione approvata viene riportata alla issue successiva | S02, S08 | tutti + BL |
| R07.4 | Experience Memory verificata prima di diventare autorevole | §6 | LATER | Un apprendimento resta «proposto» finché non verificato | S08 | tutti + BL |
| R07.5 | Context Pack per issue | §6 | SHOULD | Il pacchetto cita moduli, simboli, decisioni, test e PR rilevanti | S08 | tutti + BL |
| R07.6 | Invalidazione dopo merge/commit, con fonte e commit di riferimento | §6 | SHOULD | Dopo un commit che cambia un componente, la conoscenza collegata è marcata da rivedere | S08 | tutti + BL |
| R08.1 | Worker indipendente dal PC personale | §7 | MUST | Il lavoro prosegue con IDE e client chiusi; con PC spento serve host remoto | S06 | tutti + BL |
| R08.2 | Sandbox/worktree isolati | §7, §8 | MUST | Ogni task opera in worktree o container separato | S04, S07 | tutti + BL |
| R08.3 | Checkpoint persistenti e ripresa | §7 | MUST | Dopo kill del worker restano file, stato issue e, se possibile, sessione. Le tre cose sono riportate separatamente | S06 | tutti + BL |
| R09.1 | Più utenti, ruoli e audit | §7 | SHOULD | Due utenti con ruoli diversi; le azioni sono registrate | S08 | tutti + BL |
| R09.2 | Handoff strutturato tra colleghi | §7 | MUST | Un secondo sviluppatore ricostruisce stato, blocchi, piano, diff e decisioni dai soli dati di progetto | S08 | tutti + BL |
| R09.3 | Controllo di sessioni attive condivise | §7, §13 | LATER | Il documento lascia la scelta aperta. Si registra se il candidato lo supporta, senza penalizzare chi non lo fa | S08 | tutti + BL |
| R10.1 | Verification Contract immutabile dall'agente | §8 | MUST | L'agente non riesce a modificare gli acceptance test; test held-out eseguiti fuori sandbox | S07 | tutti + BL |
| R10.2 | Review indipendente su specifica e diff | §8 | MUST | Il Reviewer riceve specifica e diff, non solo la narrazione del Developer | S03 | tutti + BL |
| R10.3 | Blast radius: integrazione solo dopo i controlli | §8 | MUST | Una modifica non confluisce senza superare i controlli; le scoperte non diventano regole permanenti automaticamente | S07 | tutti + BL |
| R10.4 | Supervisor che ferma davvero le run | §8 | MUST | Un processo in loop viene terminato senza cooperazione dell'LLM | S07 | tutti + BL |
| R10.5 | Isolamento di credenziali, rete e filesystem | §10 | MUST | Segreti esca non leggibili; scritture fuori worktree negate dal sistema | S07 | tutti + BL |
| R10.6 | CI esterna come verifica | §3.5 | MUST | La PR è verificata da CI fuori dall'ambiente dell'agente | S01 | tutti + BL |
| R11.1 | Stato di task e agenti in una vista unica | §9 | SHOULD | Dashboard o CLI mostrano issue, agenti, modelli e sessioni | S00, S06 | tutti + BL |
| R11.2 | Log e trace per run | §9 | SHOULD | Per ogni run esistono log consultabili e sanificabili | S00, S06 | tutti + BL |
| R11.3 | Costi per agente/modello/task/issue/progetto, budget residuo | §9 | MUST | Costo per issue accettata, inclusi tentativi falliti | S09 | tutti + BL |
| R11.4 | Decision Inbox aggregata, task indipendenti continuano | §9 | SHOULD | Tre dubbi sulla stessa decisione generano una sola richiesta | S02 | tutti + BL |
| R12.1 | Modalità Plan Only, Supervised, Autonomous Development, Autonomous PR | §9 | SHOULD | Le quattro modalità sono selezionabili per progetto, con effetto verificato | S01, S03 | tutti + BL |
| R12.2 | Default PR pronta senza merge automatico | §9, §13 | MUST | Nessun merge automatico possibile con la configurazione predefinita | S01, S07 | tutti + BL |
| R13.1 | Coordinamento cross-repository | §10 | LATER | Due PR coordinate su due repository, senza merge | S10 | tutti |
| R13.2 | Preview environments e verifica UI | §10 | LATER | Test browser con screenshot su una UI di esempio | S10 | tutti |
| R13.3 | Plugin/MCP registrati con permessi e provenienza | §10 | SHOULD | Un tool MCP viene registrato con permessi espliciti | S07 | tutti + BL |
| R13.4 | Valutazione continua e benchmarking adattivo dei modelli | §10, §12 | LATER | Fase D del documento | — | non testato |
| R13.5 | Manutenzione proattiva | §10 | LATER | Fase successiva dichiarata dal documento | — | non testato |

## Mappa delle fasi del documento (§12)

- **Fase A** (autonomia affidabile): R01, R03.1, R05, R08, R10, R12.
- **Fase B** (team e collaborazione): R04, R05.2, R09, R11.
- **Fase C** (conoscenza condivisa): R07.
- **Fase D** (ottimizzazione): R06.2, R13.4, R13.5.

## Note di interpretazione

- Il documento non sceglie l'orchestratore (§11, §13). Non gli si attribuiscono decisioni tecnologiche.
- La priorità `MUST` per R08, R10 e R05 deriva da §10 («smart scheduling, permessi e recovery sono fondamentali»).
- R09.3 (sessioni attive condivise) è `LATER` perché §13 lo lascia aperto e §7 privilegia l'handoff strutturato.
- Nel documento sono presenti solo tabelle testuali, senza immagini o diagrammi. Il diagramma di §2 è stato convertito in testo e perde la struttura a blocchi: la gerarchia Control Plane / Execution Plane / servizi condivisi è letta dal testo di §2.
- Il PDF originale non è disponibile. L'unica fonte è il Markdown.
