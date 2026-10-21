# Stato rispetto alla traccia (`TEAM_AGENT_EVALUATION_INSTRUCTIONS.md`)

Data: 2026-10-21 (notte; aggiornato dopo le run LIVE di Paperclip, Paseo e OpenClaw e il blocco di Gas Town). Legenda: **FATTO** = prodotto e verificato; **PARZIALE** = fatto in parte, lacuna dichiarata; **NON ESEGUITO** = nessuna prova; **MANCA (fattibile)** = si può fare senza altre risorse dell'utente; **MANCA (serve altro)** = richiede risorse, accessi o approvazioni che non ho. Costi in USD stimati a listino sul piano Team; spesa nel registro 4,56 su 15 (`results/budget-ledger.json`).

**Cosa è cambiato rispetto alla versione precedente** (serata): run LIVE con un agente reale ora fatte per **Paperclip** (2 run PASS, riprova #16935 con `claude_local`), **Paseo** (2 run PASS, superficie di controllo) e **OpenClaw** (2 run PASS); **Gas Town** preparata ma **bloccata dal login scaduto** (nessuna run); calibrazione della fixture difficile conclusa; create `scenarios/`, `reports/findings.md`, `reports/rubric.md`; preflight e tracciabilità aggiornati.

## Per sezione della traccia

| § | Richiesta | Stato | Cosa manca |
|---|---|---|---|
| 0 | Studiare, provare, confrontare 5 candidati + baseline; valutare Paperclip+Warren e Warren+custom; raccomandazione motivata | **FATTO** (raccomandazione: B primaria, A seconda, C differita, confidenza media) | Paperclip+Warren è valutato solo a livello di studio (vedi §8) |
| 1 | Autonomia e confini; chiedere prima di spendere, esporre, installare | **FATTO** | — |
| 2 | Leggere i requisiti; matrice di tracciabilità | **FATTO** (`docs/requirements/traceability.md`, 53 requisiti, con colonna «Evidenza» aggiunta il 2026-10-21) | L'evidenza è un riassunto dei report esistenti; dove scrive «n.p.» non c'è alcuna prova |
| 3 | Preflight del computer e del repository | **FATTO** (`reports/preflight.md`, §9 aggiornato con Docker e WSL in uso, distribuzione dedicata e risorse osservate) | Le variabili d'ambiente iniziali e Python sull'host non sono state riverificate |
| 4 | Una scheda per candidato con etichette DOC/CODE/TESTED… | **FATTO** (5 schede con sezioni sperimentali) | `docs.paperclip.ing` non letto direttamente; issue di OpenClaw e Hub lette solo in parte; alcuni checkout erano parziali |
| 5 | Laboratorio riproducibile: fixture neutra, test held-out, MOCK/LIVE, script | **PARZIALE** | Fixture facile e difficile, held-out, script di valutazione e script LIVE per candidato (`scripts/live/`): fatti. Create `scenarios/` (schede S00–S10 con i campi di §6) e `reports/findings.md`. **Mancano** solo gli script con i nomi suggeriti (`preflight`, `prepare`, `run-scenario`, `collect-results`, `cleanup`): la struttura era «suggerita»; esistono equivalenti per candidato (`*-setup.sh`, `*-run.*`, `*-record-run.mjs`, `*-cleanup.sh`) ma non un punto d'ingresso unico |
| 6 | Scenari S00–S10 | **PARZIALE** (vedi tabella sotto; schede in `scenarios/`) | S03, S08, S10 non eseguiti; S02, S04, S06, S07, S09 parziali; S01 senza Gas Town |
| 7 | Metodologia: stessa fixture, MOCK poi LIVE, n≥3, ripristino, JSON per run | **PARZIALE** | n=3 per baseline (facile) e Warren su ISSUE-1; Paperclip, Paseo, OpenClaw n=2 su ISSUE-1; fixture difficile n=1 e solo baseline; confronti non isolati (versione di Claude Code, Node, strumenti); schema JSON rispettato |
| 8 | Valutare l'integrazione Paperclip+Warren (6 punti) | **PARZIALE** | Studio documentale e confronto delle opzioni fatti; nuovo dato: #16935 riprodotta anche con `claude_local` (budget e config aggirabili dall'agente, fuga dal wrapper), che pesa sull'opzione C. **Non verificati** nelle run: API/eventi per creare un task in Paperclip e lanciarlo in Warren, correlazione `Jira↔task↔run↔PR`, ownership dello stato, propagazione delle policy, dashboard comune, stima del codice di raccordo. Il documento di studio `docs/integration-paperclip-warren.md` è scritto da un altro agente: non verificato qui |
| 9 | Sicurezza operativa del laboratorio | **FATTO** | — |
| 10 | Due matrici; rubrica 0–5; gate bloccanti; report finale a 11 punti | **PARZIALE** | Matrici, gate e report finale: fatti (da riallineare alle run LIVE di Paperclip, Paseo, OpenClaw e al blocco di Gas Town: non modificati qui). **Rubrica 0–5 compilata** in `reports/rubric.md` solo dove c'è evidenza (baseline, Warren, e le dimensioni misurate per gli altri); il resto è «non valutabile» con motivazione; nessuna media pesata, per non mascherare i fallimenti critici |
| 11 | Milestone M0–M6, log, handoff, commit locali | **FATTO** | — |
| 12 | Comunicazione con l'utente | **FATTO** | — |
| 13 | Condizione di completamento | **FATTO con limiti dichiarati** | Le 7 condizioni sono soddisfatte «oppure» con blocker spiegati; restano lacune di merito (sopra e sotto) |

## Scenari S00–S10 per sistema

| Scenario | Fatto | Manca |
|---|---|---|
| S00 installazione e smoke | 5/5 candidati, tutti `PARTIAL` (`scenarios/S00-installazione-smoke.md`) | `warren up`, Paperclip dal sorgente completo (RAM), `gt up` |
| S01 issue → PR | baseline 9/9 (facile) e 8/9 (difficile, n=1); **Warren 5/5, Paperclip 2/2, Paseo 2/2, OpenClaw 2/2** (ISSUE-1, forge finto solo per Warren, nessun commit/PR per gli altri tre); **Gas Town `BLOCKED`**: dialogo di fiducia di Claude Code 2.1.306 non accettato da `gt sling`, poi login scaduto (`scenarios/S01-issue-semplice-pr.md`) | **Gas Town** (serve un nuovo login dell'utente e la preimpostazione della fiducia per il worktree del polecat); fixture difficile sui candidati (n≥3); forge reale e CI |
| S02 requisiti incompleti | baseline: FAIL 3/3 su ISSUE-5 e FAIL su HARD-8 (non chiede); HARD-7 PASS dopo rivalutazione a mano | candidati: nessun Analyst provato |
| S03 piano e ruoli | — (**non eseguito**) | **MANCA (fattibile)**: DAG da un piano, reviewer indipendente (si possono usare i mutanti in `fixtures/reference-hard/*/mutants/`: il reviewer vede issue e diff, non i test), permessi di ruolo con strumenti vietati. ~1,5–3 USD |
| S04 parallelismo e collisioni | controller (mock e Jira reale): 5 worker senza doppioni; idempotenza di Hub (6 richieste = 1 run) | **MANCA (fattibile)**: due run Warren in parallelo e due in conflitto sullo stesso file. ~0,5 USD |
| S05 coda continua e Jira | controller su Jira reale 8/8; idempotenza Hub; conformance Jira di Warren con finto | webhook reali (**serve** configurare Jira); candidati con Jira reale |
| S06 crash e recovery | Warren (kill server/agente, SIGTERM, watchdog, salvage; stub), Hub (SIGKILL), controller; riavvio a riposo di Paperclip, Paseo, OpenClaw | guasti con agente vero; run in volo su Paperclip, OpenClaw, Gas Town; «PC spento» (**serve** una VM remota) |
| S07 sicurezza | sandbox di laboratorio 13/13, injection sulla baseline 3/3, confini della sandbox di Warren con processo-sonda, default dei candidati, **#16935 con `claude_local` e fuga dal wrapper (Paperclip), Paseo senza password = comandi host, `PASEO_PASSWORD` nell'ambiente, token del Gateway di OpenClaw in chiaro, Gas Town `--dangerously-skip-permissions`** | **MANCA (fattibile)**: tentativi ostili di un agente vero dentro Warren e dentro gli altri (esca, scrittura fuori, modifica dei test); esecuzione degli aggiramenti già accettati. ~0,3 USD per Warren |
| S08 memoria e handoff | — (**non eseguito**; solo evidenza indiretta: sessione OpenClaw ripresa dopo riavvio) | **MANCA (fattibile in parte)**: sessione nuova che recupera il contesto, handoff a un secondo sviluppatore, invalidazione dopo un commit. ~0,5–1 USD |
| S09 modelli, costi, budget | costi e token misurati (baseline, Warren, Paperclip, Paseo, OpenClaw); modello non controllabile in Warren; budget Paperclip aggirabile e a 0 centesimi in abbonamento; heartbeat a pagamento di OpenClaw | **MANCA (fattibile)**: prova che un budget superato fermi la run (`--max-cost-usd` molto basso su Warren; chiave API su Paperclip). ~0,05 USD |
| S10 cross-repo e UI | — (**non eseguito**) | secondario: si può solo documentare l'adattatore richiesto |

## Cosa serve da te per chiudere ciò che resta
- **Nuovo login di Claude Code** nella distribuzione `Ubuntu-26.04` (`wsl -d Ubuntu-26.04 -u dibbi`, poi `claude` e `/login`): la sessione è scaduta e serve per riprendere Gas Town e per ogni altra run LIVE. Poi, a fine prove, `claude logout` e `wsl --unregister Ubuntu-26.04` (nome ESATTO; azioni tue).
- **VM Linux remota** (≥8 GiB) per «lavora a PC spento» e run concorrenti serie.
- **Token GitHub a scope minimo** limitato a `dibbiii/tae-sandbox` (contenuti e pull request in scrittura, nessun permesso di merge) e protezione del ramo con `enforce_admins` e revisione obbligatoria, per provare Warren con un forge reale (PR vere, branch protection).
- **Webhook Jira reali**: configurare l'automazione di Jira verso un endpoint raggiungibile; revocare il token API quando le prove Jira sono finite.
- **Decisione su Gas Town**: riprovare la run LIVE (budget tetto 2,5 USD previsto in `reports/budget.md`) oppure chiudere lo scenario come `BLOCKED` documentato.
- Se vuoi **n=3 sulla fixture difficile** per i sistemi confrontati, la stima precedente era 10–11 USD sul piano Team (non rivalutata dopo le run LIVE): da approvare; proposto un sottoinsieme di 5 issue per circa 5 USD.
- Decidere se **cancellare le installazioni mantenute** nella distribuzione (`~/pc`, `~/ps`, `~/ps-src`, `~/oc`, `~/pc-node`, `~/gt-go`, `~/gt-gopath`, `~/gt-bin`, `~/gt-src`: i report chiedono se tenerle).

## Cosa posso fare subito senza altre risorse
1. Allineare `reports/comparison.md` e `reports/FINAL-RECOMMENDATION.md` alle run LIVE di Paperclip, Paseo, OpenClaw e al blocco di Gas Town (in questa passata non sono stati toccati, come da incarico).
2. Studio del codice per il §8 (Paperclip→Warren), a costo zero (documento in lavorazione da un altro agente).
3. Prove piccole a costo basso: S09 (budget), S07 su Warren, S04 su Warren, S03 sui mutanti, S08 sulla baseline. Totale stimato 3–5 USD (stime di `reports/completamento-vs-traccia.md` precedenti, non rivalutate).
