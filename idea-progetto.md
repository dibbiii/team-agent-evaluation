# Progetto: piattaforma di sviluppo software autonomo tramite team di agenti AI

## 1. Visione generale

L'obiettivo che abbiamo definito è realizzare un sistema di sviluppo software autonomo, collaborativo e supervisionabile, nel quale un team di agenti AI possa gestire gran parte del ciclo di vita dello sviluppo, dalla comprensione dei requisiti fino alla produzione di codice verificato e pronto per essere integrato.

Non vogliamo semplicemente utilizzare un assistente AI che scrive codice, né aprire più sessioni Claude Code contemporaneamente.

Vogliamo costruire un sistema nel quale gli agenti AI lavorino come un team di sviluppo coordinato, con responsabilità distinte, conoscenza condivisa, capacità di collaborazione e un coordinatore intelligente che organizzi le attività.

L'essere umano mantiene il controllo sulle decisioni importanti, ma non deve intervenire continuamente per dire agli agenti cosa fare dopo.

### Il risultato che vogliamo raggiungere

Immaginiamo che un'azienda abbia un progetto software con cinquanta issue aperte su Jira.

Il sistema dovrebbe essere capace di:

1. Collegarsi a Jira e individuare le issue pronte per essere sviluppate.
2. Comprendere i requisiti di ogni issue, recuperando le informazioni già conosciute del progetto.
3. Intervistare gli sviluppatori quando mancano informazioni o decisioni fondamentali.
4. Preparare un piano tecnico dettagliato, identificando dipendenze, rischi e criteri di accettazione.
5. Affidare autonomamente le attività agli agenti più adatti, scegliendo per ciascuno il modello AI più conveniente.
6. Far collaborare gli agenti durante l'implementazione, anche in parallelo.
7. Eseguire compilazioni, test, controlli di sicurezza e revisioni indipendenti.
8. Correggere gli errori, cambiare strategia o richiedere aiuto quando necessario.
9. Produrre pull request verificabili e aggiornare le issue Jira.
10. Passare alle attività successive, senza necessità di un nuovo intervento umano per ogni task.

Tutto questo deve poter funzionare per molte ore consecutive, anche durante la notte, con i computer degli sviluppatori spenti.

Il giorno successivo, gli sviluppatori dovrebbero poter aprire un'interfaccia e vedere quali attività sono state completate, quali agenti stanno lavorando, quali decisioni richiedono attenzione e quanto è costato il lavoro.

### Principi fondamentali

| Principio              | Significato                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Autonomia              | Gli agenti devono poter proseguire senza supervisione continua.                        |
| Collaborazione         | Gli agenti possono delegarsi lavoro e scambiarsi informazioni.                         |
| Controllo umano        | Gli sviluppatori possono osservare, intervenire, correggere e approvare.               |
| Affidabilità           | Un errore non deve propagarsi incontrollatamente agli altri agenti.                    |
| Persistenza            | Stato e conoscenza devono sopravvivere a crash, riavvii e nuove sessioni.              |
| Efficienza             | Modelli, agenti, token e infrastruttura devono essere utilizzati in modo intelligente. |
| Condivisione           | Più sviluppatori possono lavorare e supervisionare lo stesso progetto.                 |
| Miglioramento continuo | Il sistema deve poter riutilizzare le conoscenze acquisite nelle attività precedenti.  |

## 2. Architettura generale che abbiamo immaginato

Abbiamo progressivamente individuato la necessità di separare l'organizzazione del lavoro dall'esecuzione concreta degli agenti.

La struttura ideale è composta da un Control Plane centrale e da un Execution Plane distribuito, supportati da servizi condivisi di conoscenza, monitoraggio e sicurezza.

Human Team

Sviluppatori · Team leader · Reviewer · Responsabili

Control Plane

Dashboard · Orchestration Gateway · Planning · Issue Queue · Approvals · Scheduler

Jira

Linear

Trello

GitHub / GitLab

Remote Execution Plane

Analyst

Developer

Reviewer

Coding agent · Subagenti · Tool · Sandbox · Git worktree

Model Gateway

Routing · Token · Costi

Knowledge Engine

Codebase · Memoria · ADR

Observability

Log · Trace · Dashboard

Quality & Security

CI · Test · Policy

Architettura concettuale: i quattro servizi inferiori sono condivisi e utilizzabili da tutti gli agenti.

La separazione è importante perché consente di sostituire un coding agent, cambiare provider LLM oppure migrare da Jira a un altro tracker senza dover ricostruire l'intera piattaforma.

Non abbiamo ancora deciso se costruire questo sistema utilizzando un orchestratore già esistente, come Paperclip, oppure partire da Claude Code e aggiungere soltanto i componenti necessari.

L'architettura rappresenta ciò che vogliamo ottenere, non una scelta tecnologica già definitiva.

## 3. Workflow completo: dall'issue alla pull request

Abbiamo individuato sei fasi principali, che devono funzionare come una pipeline automatizzata.

01

Issue Discovery & Analysis

Recupero dell'issue, analisi dei requisiti e valutazione della fattibilità.

02

Context Retrieval & Interview

Recupero della conoscenza esistente e domande all'umano quando necessarie.

03

Planning & Approval

Pianificazione tecnica, dipendenze e criteri di accettazione.

04

Agentic Development

Assegnazione dinamica del lavoro e implementazione collaborativa.

05

Verification & Integration

Test, review indipendente, correzioni e creazione delle PR.

06

Completion & Learning

Aggiornamento di Jira, memoria condivisa e passaggio all'issue successiva.

### 3.1 Recupero e selezione delle issue

Jira sarà inizialmente la principale fonte delle attività, perché è lo strumento utilizzato in azienda. Linear e Trello potranno essere supportati tramite adapter.

Un componente chiamato Issue Queue Controller dovrà:

- Recuperare automaticamente le issue tramite API e webhook.
- Verificare che siano sufficientemente definite per essere sviluppate.
- Considerare priorità, dipendenze, componenti coinvolti e rischio.
- Impedire a più agenti di lavorare accidentalmente sulla stessa attività.
- Individuare le issue che possono essere eseguite in parallelo.
- Registrare stato, assegnazioni, blocchi e risultati.
- Passare alle attività successive quando le precedenti raggiungono il livello di completamento richiesto.

Non vogliamo una semplice elaborazione sequenziale del backlog. Vogliamo uno scheduler capace di sfruttare il parallelismo quando è sicuro.

Per esempio, mentre due agenti lavorano a un backend, un Analyst può già preparare i requisiti della prossima issue.

### 3.2 Intervista iniziale e definizione dei requisiti

Uno degli elementi centrali della nostra idea è un Analyst Agent capace di intervistare l'essere umano.

L'agente non deve semplicemente chiedere come implementare una funzionalità. Deve analizzare il problema e cercare di comprenderlo completamente.

Durante questa fase deve conoscere gli obiettivi di prodotto, individuare edge case, esaminare vincoli esistenti, proporre alternative e chiedere chiarimenti quando incontra ambiguità sostanziali.

Non deve chiedere informazioni già disponibili nel repository, in Jira o nella documentazione.

Il risultato dovrebbe comprendere una specifica dei requisiti, decisioni approvate, questioni ancora aperte e criteri di accettazione.

Prevediamo anche un secondo agente, o una fase di analisi critica, incaricato di individuare contraddizioni e requisiti mancanti.

### 3.3 Pianificazione approfondita

Una volta stabiliti i requisiti, interviene il Planner, eventualmente affiancato da un Architect.

Abbiamo deciso che il piano dovrebbe essere rappresentato sia come documento leggibile sia come DAG di task, con dipendenze esplicite.

Ogni task dovrebbe contenere:

| Proprietà           | Significato                              |
| ------------------- | ---------------------------------------- |
| Objective           | Risultato da ottenere                    |
| Context             | Informazioni necessarie                  |
| Dependencies        | Task e decisioni da cui dipende          |
| Scope               | Componenti e file coinvolti              |
| Acceptance Criteria | Condizioni verificabili di completamento |
| Risk                | Complessità e rischio della modifica     |
| Verification        | Test e controlli obbligatori             |
| Budget              | Limite delle risorse utilizzabili        |

Il piano non deve essere immutabile: quando gli agenti scoprono informazioni nuove, possono proporre aggiornamenti, ma non cambiare silenziosamente requisiti approvati.

Inoltre, abbiamo considerato una pianificazione proporzionata al rischio. Una piccola correzione non dovrebbe richiedere lo stesso processo di una modifica architetturale o di sicurezza.

### 3.4 Esecuzione tramite team agentico

Il gateway consulta il piano e crea dinamicamente gli agenti necessari.

Gli agenti ricevono un incarico preciso, un contesto mirato, gli strumenti autorizzati e un modello AI scelto in base alle caratteristiche dell'attività.

Lavorano in ambienti isolati e possono comunicare fra loro per risolvere dipendenze e scambiare informazioni.

Ogni attività completata produce artefatti verificabili: codice, test, documentazione, decisioni e risultati.

### 3.5 Verifica e integrazione

Prima che le modifiche diventino disponibili al resto del team, devono superare controlli automatici e una review indipendente, con profondità commisurata al rischio.

Se qualcosa non funziona, il gateway può organizzare una correzione. Se fallisce ripetutamente, cambia strategia, modello o richiede assistenza.

Al termine vengono create una o più PR, e i controlli CI determinano se il codice è pronto per l'integrazione.

### 3.6 Completamento e prossima issue

Quando l'attività soddisfa i criteri previsti, il sistema:

- Aggiorna Jira e collega la PR.
- Registra le decisioni e gli artefatti prodotti.
- Aggiorna la conoscenza relativa ai componenti modificati.
- Conserva eventuali apprendimenti riutilizzabili.
- Seleziona la prossima issue idonea.

Il punto importante è che il sistema deve poter continuare a lavorare autonomamente su una sequenza di issue, non soltanto su una singola richiesta.

## 4. Struttura e ruoli del team di agenti

Non abbiamo pensato a una squadra rigida composta sempre dagli stessi agenti.

Vogliamo definire un catalogo di specializzazioni che il gateway possa attivare dinamicamente, in base alle esigenze.

| Agente                     | Responsabilità                                                         |
| -------------------------- | ---------------------------------------------------------------------- |
| Team Leader / Orchestrator | Coordina, pianifica, assegna, controlla dipendenze e gestisce problemi |
| Analyst                    | Comprende requisiti, intervista l'umano e prepara specifiche           |
| Researcher                 | Cerca nel codice, nella documentazione e nelle fonti ufficiali         |
| Architect                  | Studia design, interfacce, implicazioni tecniche e alternative         |
| Planner                    | Produce task, dipendenze, criteri di accettazione e piani eseguibili   |
| Developer                  | Implementa codice, refactoring e test                                  |
| QA Engineer                | Esegue verifiche funzionali, integrazione e regressione                |
| Reviewer                   | Controlla indipendentemente la correttezza delle modifiche             |
| Integrator                 | Gestisce integrazione, PR, conflitti e controlli CI                    |
| Knowledge Curator          | Consolida conoscenze verificate e aggiorna la memoria                  |

Questi rappresentano ruoli disponibili, non dieci processi sempre attivi.

Per un task piccolo potrebbe essere sufficiente un solo Developer e un Reviewer.

Per una feature complessa il gateway potrebbe avviare più Developer, un Architect e un QA, coordinandoli attraverso il piano.

### Come devono collaborare

Abbiamo individuato tre strumenti principali di comunicazione:

Messaggi diretti tra agenti. Un Developer può chiedere chiarimenti all'Architect o a un altro Developer senza passare necessariamente attraverso l'umano.

Task e artefatti condivisi. Gli agenti possono consultare contratti API, specifiche, decisioni e risultati prodotti dagli altri.

Eventi per il gateway. Il coordinatore viene informato quando un task termina, emerge una dipendenza, serve una decisione oppure fallisce una verifica.

Non vogliamo un'unica conversazione gigantesca condivisa tra tutti gli agenti: consumerebbe molti token e renderebbe difficile distinguere informazioni rilevanti da quelle superate.

### Come garantire il rispetto dei ruoli

Uno dei problemi emersi dalla ricerca è che un prompt non garantisce da solo che un agente rispetti la propria responsabilità.

Per questo abbiamo previsto permessi applicati dall'infrastruttura.

Un Analyst può consultare codice e documentazione, ma non dovrebbe poter modificare arbitrariamente il repository. Un Developer può implementare, ma non cambiare unilateralmente una decisione approvata. Un Reviewer deve poter ispezionare il lavoro indipendentemente, senza acquisire permessi di scrittura non autorizzati attraverso subagenti.

## 5. I due gateway che vogliamo utilizzare

Abbiamo distinto due componenti fondamentali.

### Orchestration Gateway

È il coordinatore del lavoro e risponde alle domande:

- Quale task deve essere eseguito?
- Quali agenti servono?
- Cosa può essere parallelizzato?
- Quali dipendenze devono essere soddisfatte?
- Quando serve una nuova pianificazione?
- Quando intervenire, sospendere o terminare un'esecuzione?

Preferiamo che funzioni attraverso eventi e regole deterministiche, utilizzando l'LLM per le decisioni che richiedono ragionamento.

### Model Gateway

È il componente che decide quale modello AI utilizzare.

L'idea è non legare stabilmente ogni agente a uno specifico modello, ma scegliere in base al singolo task.

Strategia di routing proposta

Economy

Ricerca, classificazione, task semplici

Balanced

Implementazione e debugging ordinario

Frontier

Architettura, rischio e problemi complessi

Il gateway deve valutare complessità, rischio, ambiguità, dimensione del contesto, capacità dei modelli e costo stimato.

Abbiamo anche immaginato un meccanismo di escalation automatica: quando un modello economico incontra difficoltà reali, il gateway può passare a uno più capace.

Dove possibile, il sistema deve preferire strumenti deterministici come compilatori, language server e ricerca simbolica anziché chiamate LLM inutili.

È importante sottolineare che la scelta dinamica del modello tra esecuzioni è più semplice rispetto al cambio del modello durante una sessione già attiva in un coding agent esterno.

## 6. Project Knowledge Engine: la memoria collettiva degli agenti

Questo è uno dei componenti più importanti che abbiamo aggiunto successivamente.

Non vogliamo che ogni agente, quando inizia una nuova issue, debba esplorare l'intero repository e ricostruire tutto il contesto.

Vogliamo che il progetto possieda una conoscenza persistente, condivisa e versionata, consultabile da qualunque agente e sviluppatore.

Abbiamo identificato quattro tipi di memoria:

| Memoria           | Contenuto                                            |
| ----------------- | ---------------------------------------------------- |
| Project Memory    | Architettura, stack, convenzioni e vincoli           |
| Code Intelligence | Simboli, componenti, relazioni e dipendenze          |
| Decision Memory   | Decisioni approvate e motivazioni                    |
| Experience Memory | Problemi incontrati, soluzioni e pratiche verificate |

### Onboarding iniziale

Quando un nuovo repository viene collegato al sistema, vogliamo un processo che analizzi la struttura della codebase, riconosca i componenti, recuperi documentazione e decisioni e interroghi gli sviluppatori soltanto sulle informazioni mancanti.

Il risultato comprende file come `AGENTS.md`, `CLAUDE.md`, documentazione architetturale, ADR e memorie consultabili dagli agenti.

### Context Pack per ogni issue

Prima dell'esecuzione, un Context Builder prepara un pacchetto di informazioni rilevanti.

Per esempio, per un problema relativo all'autenticazione, include i moduli coinvolti, i simboli principali, le decisioni già prese, i test disponibili e le PR precedenti pertinenti.

Non inserisce l'intera codebase nel prompt. Identifica le informazioni importanti e permette all'agente di approfondire quando necessario.

Abbiamo valutato Serena MCP, ricerca strutturale, ricerca testuale, Git e, eventualmente, strumenti semantici come Qdrant o Graphiti.

### Aggiornamento dopo ogni modifica

La memoria non può essere statica.

Dopo un merge, il sistema deve identificare i componenti modificati, aggiornare gli indici e invalidare oppure verificare nuovamente le informazioni che potrebbero essere diventate obsolete.

Una conoscenza deve avere una fonte, un ambito di validità e possibilmente un riferimento al commit.

### Apprendimento dalle issue precedenti

Vogliamo anche che gli agenti migliorino progressivamente il loro modo di lavorare.

Al termine di una issue, un Knowledge Curator può analizzare il lavoro svolto e proporre di conservare scoperte importanti, decisioni e soluzioni a problemi ricorrenti.

Gli apprendimenti devono essere verificati prima di diventare memoria autorevole. In alcuni casi possono anche essere trasformati in Skill riutilizzabili.

Non stiamo parlando di riaddestrare i modelli, ma di migliorare continuamente contesto, strumenti e procedure a loro disposizione.

## 7. Esecuzione remota e collaborazione tra sviluppatori umani

Abbiamo stabilito che gli agenti non devono dipendere dal computer di chi ha avviato il lavoro.

Vogliamo che possano girare su server aziendali, VPS o ambienti cloud, continuando a lavorare quando gli sviluppatori chiudono il browser o spengono il PC.

### Remote Execution Workers

Ogni worker dovrebbe poter:

- Recuperare il repository e preparare il proprio ambiente.
- Eseguire il coding agent e gli strumenti autorizzati.
- Utilizzare Git worktree o sandbox separate.
- Compilare ed eseguire test.
- Produrre commit, artefatti e risultati.
- Registrare continuamente gli eventi dell'esecuzione.
- Riprendersi da interruzioni attraverso checkpoint persistenti.

La disponibilità del server remoto non è però sufficiente: anche autenticazione, sessione agentica e orchestratore devono supportare realmente esecuzioni prolungate e recuperabili.

### Handoff tra colleghi

Questo requisito è emerso dal confronto con il tuo capo.

Immaginiamo che uno sviluppatore avvii una feature e un altro debba continuarla il giorno successivo.

Non vogliamo che debba leggere centinaia di messaggi oppure copiare manualmente una chat.

Ogni progetto deve conservare centralmente lo stato delle attività, i piani, le decisioni, i risultati e i riferimenti a branch e PR.

Il secondo sviluppatore deve poter aprire la dashboard, capire lo stato del lavoro, esaminare le modifiche e assumere il controllo delle attività per cui è autorizzato.

Abbiamo considerato anche la condivisione delle chat, ma abbiamo concluso che condividere la cronologia non equivale necessariamente a condividere una sessione attiva.

Per questo la fonte della verità deve essere il progetto e non la singola conversazione.

## 8. Affidabilità: impedire la propagazione degli errori

Questo è diventato uno dei requisiti più importanti dell'intero sistema.

Vogliamo che gli agenti lavorino autonomamente per molte ore, ma senza che un errore iniziale contamini tutto il lavoro successivo.

### Verification Contracts

Prima di iniziare un task, il sistema deve sapere cosa significa completarlo correttamente.

I criteri di accettazione possono richiedere compilazione riuscita, test unitari, test di integrazione, verifiche di sicurezza, controlli visivi e approvazione umana.

L'agente non deve poter modificare autonomamente i criteri per far risultare completato il lavoro.

### Review indipendente

La verifica deve essere eseguita da un agente con contesto e responsabilità distinti.

Il Reviewer deve confrontare il codice principalmente con la specifica approvata, senza adottare automaticamente tutte le assunzioni del Developer.

### Blast Radius Control

Ogni task lavora inizialmente in isolamento.

Una modifica viene integrata soltanto quando ha superato i controlli richiesti. Allo stesso modo, una scoperta fatta da un agente non può diventare immediatamente una regola permanente del progetto.

### Recovery intelligente

Il gateway deve classificare i fallimenti e scegliere come reagire.

Un timeout temporaneo può richiedere un retry, mentre un test che fallisce ripetutamente può richiedere un'altra strategia, un modello più capace o una nuova pianificazione.

Abbiamo previsto limiti su tentativi, concorrenza, durata senza progresso verificabile e budget.

### Agent Supervisor

Abbiamo anche ipotizzato un supervisore indipendente che osserva gli eventi e rileva comportamenti anomali, come retry infiniti, accessi non autorizzati, spese inattese o modifiche fuori dallo scope.

Il Supervisor deve poter fermare realmente un'esecuzione, anche senza la collaborazione dell'LLM.

## 9. Interfaccia di monitoraggio e intervento umano

Vogliamo una dashboard centralizzata, utilizzabile da browser e possibilmente affiancata da una CLI.

L'interfaccia dovrebbe fornire almeno quattro viste.

| Vista                   | Funzionalità                                       |
| ----------------------- | -------------------------------------------------- |
| Project Overview        | Stato delle issue, progresso, obiettivi e blocchi  |
| Agent Activity          | Agenti attivi, task, modelli, sessioni e strumenti |
| Observability & Costs   | Token, spese, durata, retry, errori e trace        |
| Decision & Review Inbox | Domande, decisioni, approvazioni e PR              |

### Monitoraggio dei costi

Vogliamo poter distinguere token input, output e cache quando disponibili, per agente, modello, task, issue e progetto.

Il sistema deve mostrare anche il budget residuo, la spesa complessiva, il costo dei tentativi falliti e il costo medio per issue effettivamente accettata.

L'obiettivo non è minimizzare soltanto i token, ma il costo necessario a produrre lavoro corretto.

### Decision Inbox

Gli agenti devono poter chiedere l'intervento umano senza interrompere inutilmente tutto il team.

Se tre agenti hanno dubbi che dipendono dalla stessa decisione, il gateway dovrebbe raccoglierli in una richiesta unica con alternative, conseguenze e raccomandazione motivata.

I task indipendenti possono continuare mentre la decisione è in attesa.

### Autonomia configurabile

Abbiamo previsto modalità differenti a seconda del progetto e del rischio.

| Modalità               | Comportamento                                                                |
| ---------------------- | ---------------------------------------------------------------------------- |
| Plan Only              | Analisi e piano senza modificare codice                                      |
| Supervised Development | Sviluppo con approvazioni frequenti                                          |
| Autonomous Development | Sviluppo e verifiche autonome, con interventi per eccezioni                  |
| Autonomous PR          | Lavoro fino a PR verificata, lasciando merge e release ai controlli previsti |

Per l'azienda, il comportamento che preferiamo è l'autonomia fino alla PR, mantenendo controlli espliciti su operazioni sensibili e integrazione.

## 10. Altre funzionalità avanzate che abbiamo immaginato

Abbiamo aggiunto diverse capacità per migliorare progressivamente il sistema.

| Capacità                       | Obiettivo                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Smart Scheduling               | Scegliere task in base a priorità, dipendenze, rischio e risorse disponibili |
| Cross-Repository Coordination  | Gestire una feature distribuita su più repository e più PR                   |
| Temporary Preview Environments | Far eseguire il software agli agenti per verificarne il comportamento reale  |
| Adaptive Model Benchmarking    | Imparare quali modelli risultano più efficienti per ciascun tipo di task     |
| Continuous Agent Evaluation    | Testare prompt, skill, router e workflow su issue storiche                   |
| Proactive Maintenance          | Individuare problemi e proporre nuove issue prima che vengano segnalati      |
| Tool Registry                  | Gestire tool MCP e plugin con permessi, disponibilità e provenienza          |
| Audit & Security               | Registrare decisioni e azioni, proteggere credenziali e isolare i processi   |

Queste funzionalità non sono tutte indispensabili per l'MVP.

Alcune, come smart scheduling, permessi e recovery, sono fondamentali. Altre, come manutenzione proattiva e ottimizzazione automatica dei modelli, rappresentano evoluzioni successive.

## 11. Quali tecnologie abbiamo considerato?

Nel corso della discussione abbiamo analizzato varie strade.

### Piattaforma pronta o semi-pronta

Abbiamo identificato Paperclip, Warren, Orchestrator.inc, Paseo, OpenHands, OpenClaw ed Emdash come candidati con punti di forza differenti.

Paperclip è particolarmente interessante per il control plane aziendale; Warren per l'esecuzione isolata e remota; Orchestrator.inc per la coordinazione developer-first; Paseo per i worker remoti; OpenHands per gli SDK e gli ambienti di coding.

Non abbiamo trovato una singola piattaforma open source che abbia dimostrato di soddisfare tutti i requisiti senza personalizzazioni.

### Approccio Claude Code-first

L'ultima strada che abbiamo approfondito parte dagli strumenti che utilizzate già in azienda.

L'idea è utilizzare Claude Code per la parte di sviluppo e delega, collegarlo a Jira tramite MCP, conservare le informazioni con `CLAUDE.md` e Serena e sfruttare sessioni remote o cloud per le esecuzioni lunghe.

Abbiamo valutato anche Ultracode e gli Agent Teams.

Questo approccio riduce il numero di componenti, ma deve ancora dimostrare di soddisfare correttamente il requisito della coda Jira continua, della collaborazione multiutente e del recovery centralizzato.

### Componenti complementari

Tra gli strumenti che abbiamo considerato per aggiungere capacità specifiche:

| Funzione              | Tecnologie                           |
| --------------------- | ------------------------------------ |
| Orchestrazione custom | LangGraph, Microsoft Agent Framework |
| Workflow durevoli     | Temporal                             |
| Model Gateway         | LiteLLM                              |
| Code Intelligence     | Serena                               |
| Memoria avanzata      | Graphiti, Mem0, Qdrant               |
| Documentazione        | Context7, documentazione ufficiale   |
| Osservabilità         | Langfuse, Phoenix, OpenTelemetry     |
| Testing               | Playwright, CI, test di integrazione |
| Storage               | PostgreSQL, Git                      |

La decisione tecnologica non è stata ancora presa. Abbiamo invece definito abbastanza chiaramente i requisiti che la soluzione dovrà soddisfare.

## 12. Come svilupperei concretamente il progetto

Per non costruire subito una piattaforma enorme, abbiamo ipotizzato un percorso incrementale.

Fase A — Autonomia affidabile

Integrare Jira, un runtime Claude Code remoto, pianificazione, test, quality gate, retry limitati e produzione di PR.

Fase B — Team e collaborazione

Aggiungere più agenti, task paralleli, coordinamento, interfaccia condivisa, passaggio del controllo tra colleghi e osservabilità.

Fase C — Conoscenza condivisa

Introdurre onboarding, Context Pack, memoria versionata, aggiornamenti dopo i merge e consolidamento degli apprendimenti.

Fase D — Ottimizzazione intelligente

Aggiungere routing adattivo dei modelli, benchmark, scheduling ottimizzato e miglioramento continuo delle procedure.

Per validare il progetto abbiamo anche proposto di utilizzare un insieme di issue Jira già risolte, confrontando un singolo coding agent con una soluzione multi-agente.

Le metriche principali sarebbero qualità del risultato, regressioni, costo complessivo, tempo fino alla PR, capacità di recupero dopo un crash e numero di interventi umani.

## 13. Le decisioni ancora aperte

Ci sono alcune questioni che abbiamo volutamente lasciato aperte e che determineranno l'architettura finale.

| Decisione                 | Alternative                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| Orchestratore             | Claude Code-first, Paperclip, Warren oppure custom                |
| Collocazione degli agenti | Cloud gestito, server aziendale, worker distribuiti               |
| Collaborazione umana      | Handoff strutturato oppure controllo condiviso di sessioni attive |
| Modelli AI                | Solo Claude oppure gateway multi-provider                         |
| Memoria                   | File versionati e Serena oppure knowledge base più articolata     |
| Autonomia                 | Stop a fine slice, PR pronta, merge automatico condizionato       |
| Complessità del sistema   | Stack minimale oppure piattaforma interna modulare                |

Per il vostro contesto aziendale, la strada che avevamo iniziato a privilegiare era validare prima Claude Code e gli strumenti già utilizzati, per capire quali requisiti impongono davvero l'introduzione di un orchestratore esterno.

Questo non significa che Claude Code sia necessariamente la scelta definitiva.

Significa evitare di aggiungere Paperclip, OpenClaw o un framework custom se una soluzione più semplice è già sufficiente.

## 14. La visione finale

Immagino il risultato come un Autonomous Software Development Platform che lavora in questo modo:

Un responsabile definisce un obiettivo oppure inserisce attività in Jira. Il sistema comprende cosa deve essere fatto, consulta la conoscenza del progetto e richiede eventuali chiarimenti. Un coordinatore organizza le attività in un piano strutturato, sceglie quali agenti coinvolgere e quali modelli utilizzare.

Gli agenti lavorano su infrastruttura remota, si scambiano informazioni, producono codice e documentazione e verificano progressivamente i risultati. Gli errori vengono contenuti attraverso isolamento, test e controlli indipendenti. Le operazioni che richiedono autorizzazione umana vengono sospese, mentre gli altri task possono continuare.

Una volta pronta una PR, il sistema aggiorna Jira e passa al lavoro successivo. Le conoscenze verificate vengono conservate per accelerare le attività future.

Tutti gli sviluppatori autorizzati possono osservare il progresso, leggere decisioni e risultati, intervenire quando necessario e riprendere il lavoro di un collega senza dipendere dalla sua sessione personale.

Il sistema continua a lavorare finché ha attività eseguibili, risorse disponibili e autorizzazioni sufficienti.

### In una frase

Vogliamo trasformare gli agenti AI da semplici assistenti di programmazione a un team di sviluppo autonomo, persistente, condiviso, capace di pianificare, collaborare, verificare il proprio lavoro e migliorare progressivamente, mantenendo l'essere umano come responsabile delle decisioni e del risultato finale.

Il vero elemento distintivo non sarebbe il numero di agenti o la complessità del gateway, ma la capacità di trasformare continuamente issue aziendali in modifiche software verificabili, senza perdere controllo, contesto e affidabilità.