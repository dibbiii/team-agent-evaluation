# Scenari S00-S10

Una scheda per scenario, con i campi richiesti da §6 della traccia (`TEAM_AGENT_EVALUATION_INSTRUCTIONS.md`): ID, obiettivo, setup, input, comandi e script reali (con percorso), risultati attesi, teardown, esito per sistema con rimando ai file, artefatti, costi, stato e motivo.

Le schede sono scritte **solo con dati già presenti nella repository**: nessuna prova è stata rieseguita per scriverle. Gli esiti sono quelli di `reports/` e `results/`; le etichette (TESTED, CODE, DOC) hanno il significato di §4. Gli esiti usano i valori di §6 (`PASS`, `FAIL`, `PARTIAL`, `BLOCKED`, `NOT_APPLICABLE`); «non eseguito» indica che la prova non è stata fatta (non che sia impedita).

Stato: **FATTO** = prodotto e verificato per gli scenari e i sistemi previsti dal piano; **PARZIALE** = fatto in parte, lacuna dichiarata nella scheda; **NON ESEGUITO** = nessuna prova.

| Scenario | Scheda | Stato | Sintesi dell'esito | Cosa manca |
|---|---|---|---|---|
| S00 Installazione e smoke test | [S00](S00-installazione-smoke.md) | FATTO (esito `PARTIAL` per i 5) | 5 candidati installati e avviati senza LLM; limiti di RAM a 2 GiB e percorsi ufficiali bloccati | `warren up`, Paperclip completo, `gt up`, agenti in Hub |
| S01 Una issue fino a PR | [S01](S01-issue-semplice-pr.md) | PARZIALE | baseline 9/9 (facile) e 8/9 (difficile, n=1); Warren 5/5; Paperclip 2/2; Paseo 2/2; OpenClaw 2/2; Gas Town 2/2 `PASS` (run1 senza completare la consegna: `gt done` bloccato; run2 con un workaround). Tutti passano la fixture facile: effetto soffitto, nessuna differenza di qualità dimostrata | fixture difficile sui candidati (n≥3); forge reale e CI; Gas Town senza il workaround e con Refinery, Witness e daemon |
| S02 Requisiti incompleti | [S02](S02-requisiti-incompleti.md) | PARZIALE | baseline `FAIL` su ISSUE-5 (3/3) e HARD-8; HARD-7 `PASS` rivalutata a mano | tutti i candidati |
| S03 Planning e ruoli | [S03](S03-planning-ruoli.md) | PARZIALE (solo baseline) | baseline: reviewer di sola lettura respinge 17 mutanti su 17 con 0 falsi positivi su 5 riferimenti (non discrimina: effetto soffitto); vincolo di ruolo imposto dai permessi di Claude Code (n=1 per variante) | DAG e piano a otto campi; nessun candidato eseguito su S03 |
| S04 Parallelismo e collisioni | [S04](S04-parallelismo-collisioni.md) | PARZIALE | controller di riferimento senza doppioni (mock e Jira reale); idempotenza di Hub | run parallele e in conflitto sui candidati |
| S05 Coda continua e Jira | [S05](S05-coda-jira.md) | PARZIALE | controller `PASS` su Jira Cloud reale (8/8, n=1) | webhook; candidati con la coda |
| S06 Crash e recovery | [S06](S06-crash-recovery.md) | PARZIALE | Warren: run in volo non riprese, workspace distrutto, 1 retry; Hub: SIGKILL ok con bug dopo riavvio | agente vero nei guasti; altri candidati; PC spento (`BLOCKED`) |
| S07 Sicurezza e blast radius | [S07](S07-sicurezza-blast-radius.md) | PARZIALE | confini Warren reali ma rete aperta; Paperclip #16935, Paseo senza password, Gas Town permissivo | tentativi ostili di un agente vero |
| S08 Memoria e handoff | [S08](S08-memoria-handoff.md) | PARZIALE (solo baseline) | baseline: handoff fra sessioni nuove `PASS` ma senza vantaggio misurabile rispetto al controllo senza handoff; cambio di aliquota 22%→21% rilevato da un agente con accesso a git (n=1 per variante) | nessun candidato; memoria persistente e Context Pack; secondo sviluppatore umano |
| S09 Modelli, costi, budget | [S09](S09-modelli-costi-budget.md) | PARZIALE | costi e token misurati (stime a listino, anche Gas Town); Warren: il tetto di costo non ferma la run, scatta a run finita (0,1010 USD con tetto 0,01); budget Paperclip aggirabile e a 0 in abbonamento | tetto di Pi a metà run; chiave API su Paperclip; escalation; routing |
| S10 Cross-repo e UI | [S10](S10-cross-repo-ui.md) | NON ESEGUITO | secondario | tutto |

Documenti collegati: `reports/comparison.md` (matrici), `reports/findings.md` (finding numerati), `reports/rubric.md` (rubrica 0-5), `reports/completamento-vs-traccia.md` (stato rispetto alla traccia), `docs/requirements/traceability.md` (requisiti con colonna evidenza).

Nota di metodo: i confronti fra sistemi in S01 **non sono isolati** (versione di Claude Code 2.1.304 vs 2.1.306, Node 22 vs 24, strumenti e prompt di sistema diversi) e la fixture facile ha effetto soffitto; la fixture difficile è stata calibrata solo sulla baseline (`reports/hard-calibration.md`). Nei JSON S09 e S07 di Warren il campo `status: PASS` indica che il codice supera i test held-out, non l'esito dello scenario (F71).
