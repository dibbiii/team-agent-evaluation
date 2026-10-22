# Piano della fase successiva (proposta, da approvare fase per fase)

Data: 2026-10-22. Stato: **proposta**. Nessuna spesa è stata fatta per scrivere questo piano e nessuna parte parte senza un tuo via libera esplicito, fase per fase. Tutti i numeri di costo e di durata sono **stime** (etichettate così) calcolate da misure già nel repository; le ipotesi sono dichiarate in §5.

## 0. Perché questo piano e cosa deve decidere

Dopo tutte le prove con un agente reale la raccomandazione resta: **Control Plane nostro in ogni caso**, Execution Plane o Warren dietro un'interfaccia stretta (opzione B) o un runner nostro (opzione A) (D33, D34). I dati non distinguono B da A: effetto soffitto (la fixture difficile passa 23 prove su 24, `reports/hard-n3.md`) e confronto non isolato. Resta inoltre aperta la domanda che dà senso a tutto il progetto di `idea-progetto.md`: **un team di agenti (Analyst, Planner, due Developer, Reviewer indipendente, supervisore) produce più valore di un agente solo?** Le prove fatte finora non la toccano (`reports/hard-calibration.md`: «non esercita funzioni multi-agente»).

Il piano ha tre fasi, ognuna con una domanda sola, un costo stimato e **criteri di successo e di fallimento scritti prima delle prove** (pre-registrazione, §6):

| Fase | Domanda | Costo stimato | Dove |
|---|---|---|---|
| 1 | Un runner minimo nostro regge il confronto con Warren a parità di condizioni? | 1,5-2 USD | WSL `Ubuntu-26.04` (da ricreare) |
| 2 | Un controller durevole su Postgres tiene claim, lease, tentativi e recupero, anche con un agente vero? | 2-3 USD | WSL + Postgres in Docker |
| 3 | Il team batte l'agente solo sulla fixture di squadra? | 7,5-16,8 USD con n=3 per braccio | WSL |

Il materiale per la Fase 3 è già pronto e validato a costo zero: `docs/team-fixture.md`, `fixtures/seed-app-team/`, `fixtures/acceptance-team/`, `scripts/score-team-run.mjs`, `scripts/team-ci.mjs`.

## 1. Fase 1: spike del runner minimo contro Warren

### Cosa si costruisce
Un **Execution Plane custom** piccolo (obiettivo dichiarato: al massimo circa 500 righe, un solo file di configurazione):
- lancia Claude Code (`claude -p`) dentro il sandbox `bwrap` già provato (D30: il confine sta attorno all'intero processo);
- timeout assoluto, imposto dal runner e non dall'agente (D28);
- cattura degli eventi (`stream-json`) in un file JSONL per run, con costo e turni;
- crea il branch e la PR sul forge (stesso repository sandbox usato con Warren), **mai il merge**.

### Come si confronta con Warren (parità di condizioni)
Stesse issue della fixture difficile, scelte fra quelle già passate: **HARD-5 e HARD-6**, n=3 per sistema = 12 run, circa 0,13-0,14 USD ciascuna (misura: `reports/hard-n3.md`), quindi **circa 1,6-2,0 USD (stima)**. Le run dei due sistemi si alternano (A, W, A, W...) nella stessa finestra di tempo.

**Variabili da pareggiare** (tutte registrate nel risultato di ogni run):

| Variabile | Come si pareggia |
|---|---|
| Versione di Claude Code | la stessa, fissata e annotata (le run di `hard-n3.md` usavano 2.1.307; la distribuzione WSL è stata cancellata, quindi si rifanno **entrambi** i bracci con la versione installata allora) |
| Modello | `claude-sonnet-5-5` per tutti |
| Strumenti e permessi | lo stesso insieme: quello che Warren impone (tutti gli strumenti, controlli dei permessi disattivati) **dentro lo stesso profilo `bwrap`**; il runner nostro lo replica |
| Prompt | lo stesso testo, costruito dalla stessa funzione di `scripts/run-baseline.mjs` |
| Fixture e commit di partenza | `seed-app-hard`, stesso commit, stesse issue, stessi test held-out fuori dal sandbox |
| Turni massimi, timeout, budget per run | gli stessi (25 turni, 1,00 USD, 600 s) |
| Ambiente del processo | `env -i`, isolamento dal `CLAUDE.md` globale (`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`), stesso Node |
| Macchina e finestra di tempo | la stessa, run alternate |
| Credenziali | stesso wrapper (D31: l'originale non si sovrascrive, ping minimo prima del lotto, `cmp` dopo ogni run) |

**Variabili che restano diverse (e sono ciò che si vuole misurare):** il codice di dispatch e di ciclo di vita della run; il formato degli eventi; come si legge il costo (busta finale di Warren contro `result` di `stream-json`); la preparazione del workspace e la creazione della PR; il tempo di avvio (la durata si misura da fuori, dal dispatch all'URL della PR, per entrambi). Warren ha in più idempotenza e tetto di costo che qui non si usano. Il confronto **non** sarà isolato al 100% anche dopo questi accorgimenti: va dichiarato nel report.

### Criteri pre-registrati (Fase 1)

Successo del runner A, **tutti** necessari:
1. **Codice:** almeno 5 run su 6 con held-out PASS, e non più di 1 run in meno rispetto a Warren.
2. **Consegna:** 6 su 6 con branch e PR create sul forge, nessun merge.
3. **Timeout reale:** una prova a costo zero con un finto agente che dorme: con timeout di 60 s il processo (e i figli) muore entro 70 s, 3 volte su 3.
4. **Eventi:** 6 su 6 con un file di eventi non vuoto, con risultato finale, costo e numero di turni.
5. **Costo:** costo medio per run non oltre 1,25 volte quello di Warren nella stessa sessione.
6. **Semplicità:** il runner sta entro circa 500 righe e un file di configurazione (se supera 800 righe è un fallimento di semplicità).

Fallimento: i criteri 1, 2, 3 o 4 non soddisfatti.

Cosa concluderei:
- **Successo pieno:** il runner A è un'alternativa credibile; il confronto resta quasi un pareggio sulla qualità (soffitto), quindi si sceglie con criteri operativi: A se evita la dipendenza da Warren (licenza, manutenzione, F61/F62), B se il costo di mantenimento di A supera quello dell'interfaccia stretta. Proseguo con l'interfaccia stretta comune ai due, così la scelta resta reversibile.
- **Fallimento di A, Warren passa:** adotto B (Warren dietro interfaccia stretta) e A resta piano di riserva.
- **Entrambi falliscono lo stesso criterio:** il problema è nell'ambiente (credenziali, `bwrap`, rete), non nel sistema: non si conclude nulla sui due.
- **Differenze entro il rumore (n=3):** nessuna conclusione di qualità, si dichiara pareggio.

## 2. Fase 2: controller durevole su Postgres e workflow con Jira

### Cosa si costruisce
Il Control Plane nostro, in forma minima, con stato su **Postgres** (Docker):
- **claim atomico** di un'issue (`SELECT ... FOR UPDATE SKIP LOCKED` o `UPDATE ... RETURNING`): due worker non prendono la stessa issue;
- **lease rinnovabili** con heartbeat; se il lease scade l'issue torna disponibile;
- **id di tentativo** (`attempt_id`) usato come token di fencing: il risultato di un tentativo vecchio viene rifiutato;
- **riconciliazione** con lo stato del worker (run che il controller crede vive e non lo sono, e viceversa);
- `Idempotency-Key` derivata da chiave issue e tentativo (D29), tetto di spesa nel controller (D28);
- integrazione Jira già provata (webhook, duplicato) più transizioni di stato.

### Workflow end to end con un agente vero
Un piccolo catalogo di 3 issue sulla fixture facile o difficile: una bloccata da un'altra (dipendenza), una ambigua (chiarimento umano via commento Jira), una con CI che fallisce al primo tentativo (usa `scripts/team-ci.mjs`). Prove di guasto con agente vero: **crash del worker** a metà run e **crash del controller** a metà run, n=2 ciascuna.

Costo **stimato 2-3 USD**: circa 12-18 run di agente reali da 0,13-0,2 USD (ipotesi A1 e A2 del §5) più 0,3 USD di riserva. I test di concorrenza e di scadenza dei lease si fanno prima con un finto agente (costo 0).

### Criteri pre-registrati (Fase 2)

Successo, **tutti** necessari:
1. **Claim:** in 50 prove con 5 worker in gara su 10 issue (finto agente, costo 0) nessuna issue è presa da due worker.
2. **Lease:** un worker ucciso viene rilevato e l'issue riassegnata entro 2 volte la durata del lease, 3 volte su 3.
3. **Fencing:** il risultato di un tentativo scaduto è rifiutato (finto agente, 10 prove su 10).
4. **Crash del controller con agente vero:** dopo il riavvio, per ogni issue esiste **un solo** tentativo concluso e **una sola** PR, nessun duplicato, 2 su 2.
5. **Crash del worker con agente vero:** nuovo tentativo con nuovo `attempt_id`, la PR finale è una, 2 su 2. Si dichiara cosa si recupera: file/workspace, stato dell'issue, **non** la sessione conversazionale (S06).
6. **Workflow:** la dipendenza sblocca l'issue successiva, il chiarimento umano sblocca l'issue ambigua, la CI fallita causa un solo nuovo tentativo e poi arriva in PR; 3 workflow su 3.
7. **Tetto:** con il tetto cumulativo del controller superato, nessun nuovo dispatch parte.

Fallimento: una qualunque PR duplicata, un'issue persa, o un risultato vecchio accettato. In quel caso si torna al disegno (lease, fencing) prima di spendere altro: non si ripete finché non si capisce la causa.

Cosa concluderei: se tutto passa, il Control Plane minimo è credibile e la scelta A o B diventa un dettaglio dietro l'interfaccia. Se i punti 4-5 falliscono con l'agente vero ma passano con il finto, il difetto è nella riconciliazione con lo stato reale del worker, ed è il rischio principale da trattare prima di una fase pilota.

## 3. Fase 3: braccio A (agente solo) contro braccio B (team)

### Domanda e ipotesi
**Ipotesi nulla H0: «il team non porta vantaggio rispetto a un agente solo con lo stesso budget».** La Fase 3 prova a rifiutarla. La fixture è `seed-app-team` (`docs/team-fixture.md`): una feature da consegnare con dipendenze a diamante, due sotto-compiti sullo stesso file, un requisito incompleto, un cambio di requisito a metà, una CI che boccia le violazioni comuni, un conflitto con una ADR e un Reviewer indipendente.

### I due bracci (stesse condizioni, cambia solo l'organizzazione)
- **Braccio A, agente solo:** una sessione `claude -p` per round (con `--resume` o riassunto), vede lo stesso elenco di ticket TEAM, usa lo stesso oracolo e la stessa CI.
- **Braccio B, team:** **driver di orchestrazione sottile, nostro**, basato su sessioni `claude -p` **per ruolo**: Analyst (solo lettura e domande), Planner (piano e DAG), Developer × 2 (ognuno in un proprio `git worktree`), Reviewer indipendente (sola lettura, sessione nuova, riceve specifica e diff, non il racconto del Developer), supervisore (codice deterministico senza modello: budget, turni, timeout, può uccidere davvero i processi). **Non è un prodotto di terzi:** si stima nell'ordine di 400-700 righe (stima) e fa parte del costo di sviluppo del braccio.
- **Round identici per entrambi** (così il momento del change-request è lo stesso): round 1 = TEAM-1..TEAM-4, poi si rilascia `change-request-1.md`; round 2 = TEAM-5, TEAM-6, TEAM-8; round 3 = TEAM-7 (review). Nel braccio B i Developer lavorano in parallelo dove il grafo lo permette (TEAM-3 e TEAM-4; TEAM-5 e TEAM-6); l'integrazione è del driver con `git merge`, e un conflitto va a un Developer.
- **Pareggiato:** modello `claude-sonnet-5-5`, versione di Claude Code, strumenti, bwrap, oracolo (`fixtures/oracle-team/answers.json`), CI locale (`scripts/team-ci.mjs`) con al massimo 3 tentativi per ticket, stessa fixture e stesso commit, test held-out fuori dal sandbox, budget massimo per run (sotto).
- **Diverso per costruzione:** ruoli, parallelismo, review indipendente, memoria passata fra sessioni.

### Misure
- **Primarie:** (P1) **punteggio composito comune** (0-100, voci misurabili allo stesso modo nei due bracci: correttezza, consegna, assunzioni aggiornate dopo il CR, domande utili, tentativi di CI, interventi umani; `composite_common` di `scripts/score-team-run.mjs`); (P2) tasso di `code_acceptance` PASS; (P3) **costo per run accettata** (USD a listino divisi per run PASS).
- **Secondarie:** assunzioni non aggiornate dopo il CR (0-4), domande utili e inutili, tentativi di CI, conflitti Git, interventi umani, tempo dal via alla consegna, accordo del Reviewer con i test, costo e token per ruolo.

### Design e budget
n ≥ 3 per braccio (6 run), ordine alternato A, B, A, B, A, B, una sola prova di rodaggio senza conteggio solo se il driver cambia dopo la prima. **Budget massimo per run: A 3,00 USD e 150 turni; B 5,00 USD e 260 turni totali sui ruoli**, timeout assoluto 45 minuti per A e 90 per B. Una run che sfora il tetto si ferma e si registra FAIL con il costo reale.

### Criteri pre-registrati (Fase 3)

Con n=3 non si calcolano valori p (non servirebbero a nulla): si usa una regola di dominio dichiarata prima.

**H0 rifiutata (il team porta valore)**, tutte e tre necessarie:
1. ogni run B ha P1 maggiore di **ogni** run A (con 3 contro 3 è l'unico esito che dà p esatto 0,05 a una coda);
2. differenza fra le medie di P1 **≥ 8 punti** su 100;
3. costo per run accettata di B **non oltre 2 volte** quello di A.

**H0 non rifiutata (nessun vantaggio dimostrato):** differenza media < 8 punti oppure intervalli sovrapposti. Non significa «il team è inutile»: significa che con questa fixture e questo n non si vede.

**Team dannoso:** tasso di PASS di B più basso di quello di A di almeno una run su tre, **oppure** costo per run accettata oltre 2 volte senza il guadagno di 8 punti.

**Soffitto:** se A passa 3 su 3 con P1 ≥ 90 e B lo stesso, la fixture non discrimina: si dichiara che la domanda non ha risposta con questo materiale e si **alza la difficoltà** (un terzo round con una seconda feature sullo stesso modulo) invece di concludere. Questo risultato è già un'informazione: l'agente solo basta per feature di questa taglia.

Cosa concluderei:
- **H0 rifiutata:** il team vale il suo costo per lavori con questa struttura (dipendenze, file condivisi, requisiti incompleti): si costruisce il driver a ruoli sopra il Control Plane. Resto cauto: un solo modello, una sola fixture, n=3.
- **H0 non rifiutata, costo B maggiore:** conviene **agente solo con controller**, e il multi-agente si riserva ai compiti in cui la parallelizzazione risparmia tempo reale. La parte di Control Plane (claim, lease, CI, gate sulle merge) resta comunque necessaria.
- **Team dannoso:** si abbandona il team a ruoli per questo modello e si investe nel controller e nella review indipendente come singolo passo (S03 ha già mostrato 17 mutanti su 17 respinti dal Reviewer).
- **Il team vince solo sulle metriche di coordinamento ma non su P1:** lo si riporta come tale (meno conflitti, più domande utili) senza dire che «vince».

## 4. Requisiti di ambiente

- **Ricreare la distribuzione WSL dedicata con nome `Ubuntu-26.04`** (cancellata con `wsl --unregister`), e **nuovo login** di Claude Code dentro la distribuzione (lo fai tu nel browser). Alla fine, stessa pulizia: logout e `wsl --unregister Ubuntu-26.04` (nome esatto).
- **Rischi già noti:** wrapper delle credenziali fragile (F46, D31: non sovrascrivere l'originale, ping minimo da circa 0,01 USD prima di ogni lotto, `cmp` dopo ogni run); **token che scade dopo circa 8 ore** (un lotto della Fase 3 dura, stima, 3-5 ore: si controlla il login a metà); controllo dei permessi che **nega l'esecuzione di Claude Code fuori da bwrap**, quindi ogni run passa dal wrapper e il confine sta attorno all'intero processo (D30); password o token su ogni servizio (D32); i test held-out non entrano mai nel sandbox.
- Docker per Postgres (Fase 2), Node 22 o successivo, Git.
- Nessun merge automatico, nessun dato reale, forge e Jira solo di prova.

## 5. Stime di costo e ipotesi dichiarate

Tutte **stime**, non misure. Base: costi a listino da abbonamento (non fatture).

| Ipotesi | Valore | Fonte |
|---|---|---|
| A1: costo per turno di un agente | 0,010-0,015 USD per turno sulle issue difficili (0,12-0,26 USD per 6-22 turni); lo supponiamo 0,012-0,020 sulla fixture di squadra perché il contesto è più grande | `reports/hard-n3.md` (n piccolo) |
| A2: costo delle issue più care | 0,415 USD per HARD-3, la più cara | `reports/hard-calibration.md` |
| A3: turni dell'agente solo sulla feature | 70-110 (6 sotto-compiti da 8-12 turni, giri di CI e rilavorazioni, change-request) | stima di progetto, non misurata |
| A4: turni del team | 115-140 totali sui ruoli: più sessioni, ognuna rilegge il repository (circa 3 turni di avvio per sessione) | stima di progetto |
| A5: nessun ritentativo oltre i tetti per run; nessuna riscrittura del driver durante il lotto | | |
| A6: il costo non scende con il caching in modo apprezzabile | prudente | |

| Voce | Stima (USD) | Calcolo |
|---|---|---|
| Fase 1 | 1,5-2,0 | 12 run × 0,13-0,17 |
| Fase 2 | 2,0-3,0 | 12-18 run reali × 0,13-0,2 + riserva |
| Fase 3, braccio A, per run | 0,9-2,2 (centrale 1,4) | 70-110 turni × 0,012-0,020 |
| Fase 3, braccio B, per run | 1,6-3,4 (centrale 2,4) | 115-140 turni × 0,012-0,020 più il costo dei conflitti |
| Fase 3 con n=3 per braccio | 7,5-16,8 (centrale circa 11,4) | 3 × (A + B) |
| **Totale proposto** | **circa 11-22 USD** | |

Nel registro restano **3,64 USD su 15** (spesi 11,36). Con quel residuo si copre **solo la Fase 1** (1,5-2,0) e una parte della Fase 2. Le Fasi 2 e 3 complete richiedono un nuovo tetto.

## 6. Pre-registrazione: regole di uso

- I criteri di successo e fallimento dei §1, §2 e §3 sono **fissati a partire dalla tua approvazione**. Dopo l'approvazione di una fase non si cambiano soglie, metriche né ipotesi; se serve una modifica si scrive una nuova versione, con data e motivo, **prima** di vedere i dati della fase interessata.
- Si registrano tutte le run, comprese quelle fallite o interrotte; le run annullate per errore di ambiente (per esempio login scaduto) si segnalano come tali e non si contano.
- n, ordine delle run e budget si dichiarano prima. Le conclusioni non generalizzano oltre un modello, una fixture, n=3.
- Registro delle versioni di questo piano: v1 = 2026-10-22 (questa), non ancora approvata.

## 7. Decisioni che servono a te

1. **Budget.** Nel registro restano 3,64 USD su 15. Quale **tetto nuovo** fissi? Opzioni: (a) nessuno, solo Fase 1 (1,5-2,0 USD); (b) circa 6-7 USD per Fasi 1 e 2; (c) circa 20-25 USD per tutte e tre le fasi con n=3 (include una riserva del 20%); (d) Fase 3 ridotta a n=2 per braccio (circa 5-11 USD) come prova di fattibilità, dichiarando che n=2 non permette nessuna conclusione.
2. **Ordine delle fasi.** La Fase 3 usa `claude -p` direttamente e **non dipende dall'esito della Fase 1**. Ordine proposto da me: **1, poi 3, poi 2** (prima il runner economico, poi la domanda sul team che decide se il controller deve gestire parallelismo e ruoli, infine il controller). Alternative: 1, 2, 3 (l'ordine naturale) oppure 3 per prima (la domanda più importante, ma il costo più alto per primo).
3. **Soglie.** Confermi le soglie del §3 (8 punti di differenza, costo fino a 2 volte, tetti per run 3 e 5 USD)? Sono scelte mie, modificabili **solo prima** delle prove.
4. **Un solo modello.** Confermi `claude-sonnet-5-5` per entrambi i bracci? Un secondo modello raddoppia il costo.

## 8. Rischi

| Rischio | Effetto | Mitigazione |
|---|---|---|
| Effetto soffitto anche sulla fixture di squadra (l'agente solo la risolve bene) | Fase 3 non discrimina | Criterio «soffitto» del §3 e fixture più difficile pronta da aggiungere; la stima di fatica dell'agente solo è una **stima**, non una misura |
| n=3 troppo piccolo | Nessuna conclusione statistica | Regola di dominio dichiarata; nessun valore p; i risultati si riportano come indicativi |
| Il driver del braccio B è fatto da noi: un suo difetto penalizza il team | Si scambia un difetto del driver per un limite del team | Prova di rodaggio, log di ogni sessione, supervisore che registra gli errori del driver separati da quelli degli agenti |
| Credenziali: token a 8 ore, wrapper fragile (F46) | Run bloccate o login perso | D31, ping prima di ogni lotto, un lotto per volta |
| Equità fra i bracci | Confronto falsato | Round identici, stesso oracolo e stessa CI, composito comune (vedi `docs/team-fixture.md`, «Rischi di equità») |
| Il confine di sicurezza dipende dal wrapper `bwrap` | Run fuori dal confine | Ogni run passa dal wrapper; nessun test di sicurezza con un agente che sondi i confini (non provato, F63) |
| Costo oltre le stime | Budget esaurito a metà | Tetto per run, tetto cumulativo del controller, lotto fermato dopo la prima run se la proiezione supera il tetto |
| Il costo di sviluppo del driver e del controller non è nel conto in USD | Sottostima del costo totale | Si annota il tempo di sviluppo di ogni componente |
