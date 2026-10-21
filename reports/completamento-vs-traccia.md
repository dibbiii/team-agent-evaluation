# Stato rispetto alla traccia (`TEAM_AGENT_EVALUATION_INSTRUCTIONS.md`)

Data: 2026-10-21 (sera). Legenda: **FATTO** = prodotto e verificato; **PARZIALE** = fatto in parte, lacuna dichiarata; **MANCA (fattibile)** = si può fare senza altre risorse dell'utente; **MANCA (serve altro)** = richiede risorse, accessi o approvazioni che non ho. Costi in USD stimati a listino sul piano Team; spesa nel registro finora circa 2,5 su 15.

## Per sezione della traccia

| § | Richiesta | Stato | Cosa manca |
|---|---|---|---|
| 0 | Studiare, provare, confrontare 5 candidati + baseline; valutare Paperclip+Warren e Warren+custom; raccomandazione motivata | **FATTO** (raccomandazione: B primaria, A seconda, C differita, confidenza media) | Paperclip+Warren è valutato solo a livello di studio (vedi §8) |
| 1 | Autonomia e confini; chiedere prima di spendere, esporre, installare | **FATTO** | — |
| 2 | Leggere i requisiti; matrice di tracciabilità | **FATTO** (`docs/requirements/traceability.md`, 53 requisiti) | La matrice non ha la colonna «evidenza»: l'evidenza è in `reports/comparison.md` (da allineare) |
| 3 | Preflight del computer e del repository | **FATTO** (`reports/preflight.md`) | Aggiornare con Docker/WSL attivi (dati cambiati) |
| 4 | Una scheda per candidato con etichette DOC/CODE/TESTED… | **FATTO** (5 schede con sezioni sperimentali) | `docs.paperclip.ing` non letto direttamente; issue di OpenClaw e Hub lette solo in parte; alcuni checkout erano parziali |
| 5 | Laboratorio riproducibile: fixture neutra, test held-out, MOCK/LIVE, script | **PARZIALE** | Fixture facile e difficile, held-out, script di valutazione: fatti. **Mancano** la cartella `scenarios/` (definizione per scenario: ID, setup, input, comandi, attesi, teardown, esito, artefatti, costi), `reports/findings.md`, e gli script con i nomi suggeriti (`preflight`, `prepare`, `run-scenario`, `collect-results`, `cleanup`): la struttura era «suggerita», ma `scenarios/` è richiesta da §6 |
| 6 | Scenari S00–S10 | **PARZIALE** (vedi tabella sotto) | S03, S04 (sui candidati), S08, S10 e parti di S07/S09 |
| 7 | Metodologia: stessa fixture, MOCK poi LIVE, n≥3, ripristino, JSON per run | **PARZIALE** | n=3 solo per baseline (facile) e Warren su ISSUE-1; sulla fixture difficile n=1; schema JSON rispettato |
| 8 | Valutare l'integrazione Paperclip+Warren (6 punti) | **PARZIALE** | Studio documentale e confronto delle opzioni fatti. **Non verificati**: API/eventi per creare un task in Paperclip e lanciarlo in Warren, correlazione `Jira↔task↔run↔PR`, ownership dello stato, propagazione delle policy, dashboard comune, stima del codice di raccordo. Fattibile senza costo: studio del codice (adapter `http` di Paperclip contro `POST /runs` di Warren) ed eventuale prototipo con stub |
| 9 | Sicurezza operativa del laboratorio | **FATTO** | — |
| 10 | Due matrici; rubrica 0–5; gate bloccanti; report finale a 11 punti | **PARZIALE** | Matrici, gate e report finale: fatti. **Rubrica 0–5 non compilata** (dati insufficienti all'epoca): ora assegnabile per baseline e Warren con evidenza; per gli altri resta «non valutabile» |
| 11 | Milestone M0–M6, log, handoff, commit locali | **FATTO** | — |
| 12 | Comunicazione con l'utente | **FATTO** | — |
| 13 | Condizione di completamento | **FATTO con limiti dichiarati** | Le 7 condizioni sono soddisfatte «oppure» con blocker spiegati; restano lacune di merito (sopra e sotto) |

## Scenari S00–S10 per sistema

| Scenario | Fatto | Manca |
|---|---|---|
| S00 installazione e smoke | 5/5 candidati, tutti `PARTIAL` | `warren up`, Paperclip dal sorgente completo (RAM), `gt up` |
| S01 issue → PR | baseline 9/9 (facile) e 5/5 su Warren; fixture difficile in corso | run LIVE degli altri 4 candidati (**serve approvazione**: credenziali nei loro runtime) |
| S02 requisiti incompleti | baseline: FAIL 3/3 (non chiede); fixture difficile in corso | candidati: nessun Analyst provato |
| S03 piano e ruoli | — | **MANCA (fattibile)**: DAG da un piano, reviewer indipendente (si possono usare i 26 mutanti: il reviewer vede issue e diff, non i test), permessi di ruolo con strumenti vietati. ~1,5–3 USD |
| S04 parallelismo e collisioni | controller (mock e Jira reale): 5 worker senza doppioni | **MANCA (fattibile)**: due run Warren in parallelo e due in conflitto sullo stesso file. ~0,5 USD |
| S05 coda continua e Jira | controller su Jira reale 8/8; idempotenza Hub; conformance Jira di Warren con finto | webhook reali (**serve** configurare Jira); candidati con Jira reale |
| S06 crash e recovery | Warren (kill server/agente, SIGTERM, watchdog, salvage), Hub (SIGKILL), controller | altri candidati; «PC spento» (**serve** una VM remota) |
| S07 sicurezza | sandbox di laboratorio 13/13, injection sulla baseline 3/3, confini della sandbox di Warren con stub, default dei candidati | **MANCA (fattibile)**: tentativi ostili di un agente vero dentro Warren (esca, scrittura fuori, modifica dei test). ~0,3 USD |
| S08 memoria e handoff | — | **MANCA (fattibile in parte)**: sessione nuova che recupera il contesto, handoff a un secondo sviluppatore, invalidazione dopo un commit. ~0,5–1 USD |
| S09 modelli, costi, budget | costi misurati (baseline e Warren); modello non controllabile in Warren | **MANCA (fattibile)**: prova che un budget superato fermi la run (`--max-cost-usd` molto basso su Warren). ~0,05 USD |
| S10 cross-repo e UI | — | secondario: si può solo documentare l'adattatore richiesto |

## Cosa serve da te per chiudere ciò che resta
- **VM Linux remota** (≥8 GiB) per «lavora a PC spento» e run concorrenti serie.
- **Repository GitHub di prova con CI** per provare Warren con un forge reale (PR vere, branch protection).
- **Webhook Jira reali**: configurare l'automazione di Jira verso un endpoint raggiungibile.
- **Nuova approvazione esplicita** per le run LIVE di Paperclip, Gas Town, Paseo Hub e OpenClaw (credenziali nei loro runtime, con rischi dichiarati).
- Se vuoi **n=3 sulla fixture difficile** per entrambi i sistemi, stimo 10–11 USD sul piano Team: da approvare (propongo un sottoinsieme di 5 issue per circa 5 USD).

## Cosa posso fare subito senza altre risorse
1. Creare `scenarios/` (una scheda per scenario con tutti i campi richiesti) e `reports/findings.md`; compilare la rubrica 0–5 per baseline e Warren; aggiornare preflight e tracciabilità.
2. Studio del codice per il §8 (Paperclip→Warren), a costo zero.
3. Prove piccole a costo basso: S09 (budget), S07 su Warren, S04 su Warren, S03 sui mutanti, S08 sulla baseline. Totale stimato 3–5 USD.
