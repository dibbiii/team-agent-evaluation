# Fixture difficile a n=3: baseline contro Warren (HARD-4, HARD-5, HARD-6, HARD-9)

Data: 2026-10-22 (00:00-02:30 circa, ora locale). Modalità `LIVE`. Modello `claude-sonnet-5-5` in tutte le run (baseline: chiave di `modelUsage`; Warren: evento `init`, 12 su 12). Etichette: TESTED = eseguito e misurato; CODE = letto nei sorgenti; UNVERIFIED = non provato. Costi = stima a listino di Claude Code su abbonamento Team, **non fatture**.
Dati: `results/H-N3-baseline-claude-code-*.json` (7 run nuove della baseline), `results/H-CAL-baseline-claude-code-*.json` (5 run precedenti contate), `results/S01-warren-hard-live-*.json` (12 run Warren). Grezzi (testi dell'agente, `src/` e `test/` prodotti, eventi, console) in `results/raw/` (non versionati): `h-n3-baseline-HARD-*`, `warren-hard-p1-*`, `warren-hard-p2-*`. Script: `scripts/live/warren-hard-*.{sh,mjs,ps1}`. `results/budget-ledger.json` non toccato.

## Scelta delle issue

HARD-4, HARD-5, HARD-6, HARD-9: tutte con `depends_on: []` e `ready: true` nel catalogo, quindi nessuna pre-applicazione di dipendenze (HARD-3 sì, ed è stata esclusa). Le quattro toccano file diversi (`money/orders/payments`, `reports`, `export`, `shipping`) e hanno test held-out indipendenti (11, 5, 9, 4 test). Nessuna sostituzione è stata necessaria. HARD-4 è l'unica issue instabile in calibrazione (FAIL poi PASS).

## Esito per issue e sistema (n=3, PASS/FAIL per prova)

Le prove «contate» della baseline sono quelle di `reports/hard-calibration.md` con **lo stesso criterio**: stesso script `run-baseline.mjs` con `FIXTURE=hard`, stesso prompt senza guida a chiedere (`ask_nudge: false`), stessi strumenti ristretti, stesso isolamento dal `CLAUDE.md` globale, stesso modello, stesso tetto di 25 turni, stessi test held-out. Contate: HARD-4 due prove (`33587fb2` FAIL, `2f630dc6` PASS), HARD-5 `9de01c6b`, HARD-6 `b6aa6e56`, HARD-9 `ac61e71a` (quella rifatta dopo l'interruzione per memoria). Differenza: le prove precedenti erano con Claude Code 2.1.306, le nuove con 2.1.307. Nuove run: 1 (HARD-4) + 2 + 2 + 2 = 7.

| Issue | Baseline (prove in ordine) | Baseline PASS | Warren (prove in ordine) | Warren PASS |
|---|---|---|---|---|
| HARD-4 valute | FAIL, PASS, PASS | **2/3** | PASS, PASS, PASS | **3/3** |
| HARD-5 prestazioni | PASS, PASS, PASS | 3/3 | PASS, PASS, PASS | 3/3 |
| HARD-6 CSV | PASS, PASS, PASS | 3/3 | PASS, PASS, PASS | 3/3 |
| HARD-9 refactoring | PASS, PASS, PASS | 3/3 | PASS, PASS, PASS | 3/3 |
| Totale | | **11/12** | | **12/12** |

Costo, durata e turni (media sulle tre prove; baseline: 1 o 2 prove vecchie più le nuove):

| Issue | Baseline costo (USD) | Baseline durata (s) | Baseline turni | Warren costo (USD) | Warren durata (s) | Warren turni |
|---|---|---|---|---|---|---|
| HARD-4 | 0,255 (0,262; 0,233; 0,270) | 138,6 | 20, 20, 22 | 0,235 (0,242; 0,255; 0,208) | 47,9 | 10, 9, 8 |
| HARD-5 | 0,123 (0,141; 0,122; 0,107) | 84,7 | 12, 14, 11 | 0,129 (0,134; 0,125; 0,129) | 23,2 | 6, 6, 6 |
| HARD-6 | 0,132 (0,122; 0,142; 0,132) | 89,1 | 11, 15, 12 | 0,137 (0,136; 0,136; 0,140) | 23,3 | 6, 6, 6 |
| HARD-9 | 0,152 (0,159; 0,139; 0,157) | 107,2 | 12, 10, 8 | 0,167 (0,152; 0,188; 0,160) | 36,4 | 7, 11, 9 |
| Media sulle 12 prove | **0,166** | | | **0,167** | | |

Run Warren (id): HARD-4 `run_z507facps3fa`, `run_kdyx9g825ye8`, `run_hw3rdd04qfvs`; HARD-5 `run_98fs8wjvvzv6`, `run_asw1dcmccny4`, `run_8m2zknndv9jr`; HARD-6 `run_bqt9n97gq652`, `run_j1e3krg7qd2g`, `run_5v3ef42nkjc3`; HARD-9 `run_bew5ecedsxvk`, `run_e43whfcbf0k2`, `run_szvdatty5c0f`. Tutte `succeeded`, tutte con branch `warren/<run-id>` e PR sul forge finto.

## Budget

| Voce | USD (listino) |
|---|---|
| Baseline, 7 run nuove | 1,069 (media 0,153) |
| Warren, 4 run di prova (una per issue) | 0,663 (media 0,166) |
| Warren, altre 8 run | 1,340 |
| **Totale lotto** | **3,073** su 4,5 di tetto |

Le 5 prove baseline precedenti (0,917 USD) non sono state riaddebitate a questo lotto. Dopo il pilota (0,663 per 4 run) la proiezione per le 12 run era circa 2,0 USD (totale circa 3,1), sotto il tetto: nessuna riduzione a n=2 è servita. Nessun arresto per memoria (AvailableMBytes sempre tra 2223 e 3473 MB, soglia 1500) e nessuna run interrotta dal sistema.

## FAIL: causa e codice prodotto

C'è **un solo FAIL** nelle 24 prove (12 baseline + 12 Warren), ed è della baseline: HARD-4, prima prova della calibrazione (`results/H-CAL-baseline-claude-code-33587fb2.json`, 2026-10-21 13:25).

- **Righe dei test falliti: non disponibili (UNVERIFIED).** La prova è precedente all'introduzione della conservazione delle righe di fallimento e del workspace (`reports/hard-calibration.md`, punto 3): il JSON registra solo `heldout_acceptance: false`, e il codice prodotto non è conservato (esiste solo il testo dell'agente, `results/raw/baseline-HARD-4-1792589237356.txt`). Non posso quindi mostrare il codice né i nomi dei test falliti.
- **Ipotesi sulla causa (non verificata), dal solo riassunto dell'agente e dal codice dell'held-out.** Il riassunto dice che l'agente ha aggiunto i campi `paidMinor` e `refundedMinor` (nella valuta dell'ordine) e ha lasciato `paidCents` e `refundedCents` **in EUR**, dichiarando che quei campi «non erano richiesti nell'issue». Il test held-out `HARD-4.acceptance.test.js` (righe 129-131) pretende che il rimborso verso il gateway sia `payableCents` e che `refunded.refundedCents` sia uguale a `payableCents`. Se la prova è fallita lì, la classificazione è mista: **scelta progettuale dell'agente** (ha cambiato la semantica di campi esistenti con un'invenzione non richiesta) **più sotto-specificazione dell'issue** (l'issue dice che «pagamento e rimborso usano gli importi memorizzati», ma non dice in che unità sia `refundedCents`). Non ho elementi per dire «test troppo rigido»: la soluzione minima (il pagamento addebita `payableCents`, quindi `paidCents` lo è) soddisfa il test. Le due prove successive e le 3 di Warren hanno passato senza quella deviazione: il test non è impossibile.
- **Nelle 23 prove che non sono FAIL** il test non ha rilevato nulla da diagnosticare.

Nota di metodo: la differenza HARD-4 baseline 2/3 contro Warren 3/3 coincide interamente con questa prova (1 su 3 contro 0 su 3).

## Confronto baseline contro Warren: NON isolato

Differenze note (§7 delle istruzioni):

- **Strumenti e permessi.** La baseline ha solo `Read, Edit, Write, Glob, Grep, Bash` con Bash limitato a `node`/`npm test`. Warren lancia Claude Code con **tutti** gli strumenti e i permessi disattivati, dentro bwrap. I comandi dell'agente Warren mostrano `Bash` che concatena più letture (`cat src/...; ls test docs/adr; cat docs/adr/*`) e scrive con heredoc o con `python3`: con meno chiamate l'agente chiude in 6-11 turni contro 8-22 della baseline.
- **Durata non confrontabile.** Baseline = intero `run-baseline` (avvio della CLI, run, valutazione); Warren = finestra `startedAt-endedAt` di Warren (include preparazione del workspace e push). Le durate Warren (20-52 s) sono 2-4 volte inferiori a quelle della baseline (71-154 s), ma **non attribuisco la differenza a Warren**: è plausibilmente l'effetto di strumenti e turni diversi, non misurato in modo isolato.
- **Versione di Claude Code.** 5 prove baseline con 2.1.306, 7 con 2.1.307; tutte le 12 Warren con 2.1.307 (evento `init`).
- **Node.** 24 sull'host Windows (baseline) contro 22 nella distribuzione WSL (`/usr/bin/node`, visibile anche dentro bwrap, verificato) per Warren. `npm test` funziona in entrambi.
- **Modello.** Baseline con `--model`; Warren con `.claude/settings.json` di progetto nel repository della fixture (Warren non passa `--model`, F29). La baseline non ha quel file.
- **Contesto del repository.** Con Warren il repo contiene un commit baseline con `.claude/settings.json`; alcuni agenti hanno cercato `CLAUDE.md`/`AGENTS.md` (non esistono). Il `CLAUDE.md` globale dell'utente non è visibile in nessuno dei due casi (baseline: `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`; Warren: la home non è montata nella sandbox).
- **Prompt:** identico per costruzione (stessa funzione `buildPrompt`, `scripts/live/warren-hard-prompt.mjs`, che replica `run-baseline.mjs` con `FIXTURE=hard` senza guida a chiedere).
- **Test held-out:** gli stessi, eseguiti lato Windows su `src/` estratto (per Warren, dal branch senza `.claude/`). Per Warren non sono mai entrati nella distribuzione: il tar della fixture contiene solo `package.json`, `src`, `test`, `docs`, e lo script di preparazione si ferma se trova riferimenti a held-out, riferimenti o mutanti.
- **Identità:** in tutti i 12 commit di Warren l'agente ha firmato con nome ed email reali dell'utente (F30 confermata). Nessun `ATTENZIONE` per credenziali o file di stato nei branch.
- **n e criterio:** n=3 per issue su entrambi i sistemi, ma 5 prove della baseline provengono dalla calibrazione (altro giorno, altra versione minore).

## Cosa dimostra e cosa non dimostra con n=3

Dimostra (TESTED):
- Warren è **in grado di eseguire la fixture difficile end to end** con il vero Claude Code in bwrap su 4 issue di tipo diverso: 12/12 run `succeeded`, 12/12 held-out PASS, branch e PR sul forge finto, nessun errore di esecuzione, nessuna perdita di credenziali nei branch.
- Sulla stessa fixture difficile **la qualità del codice, misurata dai test held-out, non è distinguibile** fra Warren e baseline: 12/12 contro 11/12 non è una differenza apprezzabile con questi n (l'unico FAIL è una prova isolata del giorno prima; con un FAIL su 12 il margine statistico è nullo).
- Il **costo per run è praticamente identico** (0,167 contro 0,166 USD in media), diversamente dalla fixture facile dove Warren costava circa 1,8 volte la baseline (`reports/s01-warren-live.md`). Con la fixture difficile non vedo il sovraccosto: non so perché (UNVERIFIED; plausibile che il costo sia dominato dal lavoro del modello e non dal contesto di partenza).

Non dimostra:
- **Nessun vantaggio (né svantaggio) di qualità di Warren.** Il segnale unico (HARD-4 2/3 contro 3/3) è una prova fallita della baseline, probabilmente per una scelta dell'agente (ipotesi non verificata); con n=3 e un solo evento non è una differenza reale. Se esistesse un effetto reale su HARD-4, servirebbero molte più prove su quella issue (n≥10 per sistema) per rilevarlo.
- **Effetto soffitto parziale:** 23 prove su 24 passano. La fixture, per queste quattro issue, ha poco potere discriminante fra i due sistemi, come già osservato in calibrazione. HARD-1, HARD-2, HARD-3, HARD-7, HARD-8 e HARD-10 non sono state provate con Warren.
- **Funzioni multi-agente di Warren** non esercitate (una issue, un agente), nessun forge reale, nessuna CI, nessun conflitto tra più run.
- **Le durate** (Warren più veloce) e i **turni** (Warren meno) non sono attribuibili al sistema: strumenti e finestre di misura diversi (vedi sopra).
- Un solo modello; costi a listino; sicurezza della sandbox non rimisurata in questo lotto (rete aperta come da F26; l'agente non ha provato a uscire, e le credenziali copiate da Warren sono state rimosse a fine run).

## Integrità delle credenziali e pulizia

- Copia di riferimento `~/.tae-cred-ref` creata con `cp` alle 02:11; **prima e dopo ognuna delle 12 run**: `ls -l` identico (`-rw------- 551 Oct 21 22:45`) e `cmp` = IDENTICO (24 controlli su 24, più il controllo finale delle 02:28). Il contenuto non è mai stato letto né stampato; l'originale non è mai stato sovrascritto. Ultima run alle 02:27, ben prima del limite delle 05:30. Dopo ogni run `find` non ha trovato copie di `.credentials.json` (Warren le rimuove; lo script le cerca e le cancellerebbe sotto la data dir). La copia di riferimento è stata cancellata a fine lavoro (`find` vuoto, `.tae-cred*` assenti).
- Il processo `claude` pid 449 (sessione dell'utente) è rimasto intatto e non toccato.
- Pulizia (verificata 02:29): nessun processo mio residuo (`bun`, `bwrap`, `claude` a parte il pid 449), unica porta in ascolto il DNS di WSL (`10.255.255.254:53`), `~/fixtures`, `~/live-runs`, `~/out`, `~/hard-prompts`, `~/seed-app-hard.tar` rimossi (nomi esatti sotto `$HOME`).
- Controllo di rete in sandbox (`sandbox-net-check.sh`) prima di ciascun lotto Warren: «rete e DNS OK dentro la sandbox».

## Comandi fuori da bwrap e esecuzioni di Claude Code

- **Claude Code lato Windows (baseline): 7 esecuzioni** di `claude -p` da `scripts/live/warren-hard-baseline.mjs`, con `--tools Read,Edit,Write,Glob,Grep,Bash`, Bash limitato a `node`/`npm test`, `--permission-mode acceptEdits`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, cartella temporanea fuori dalla repo. Nessun permesso disattivato.
- **Claude Code lato WSL: 12 esecuzioni, solo dentro la sandbox bwrap di Warren.** Mai sull'host WSL (non ho lanciato `model-pin-check.sh`).
- **Comandi host WSL fuori da bwrap**, come utente `dibbi` in `Ubuntu-26.04`: `bash` degli script `warren-hard-run.sh`, `warren-hard-fixture-setup.sh`, `warren-hard-cleanup.sh`, `warren-s0-state.sh`, `cleanup-run.sh`, `sandbox-net-check.sh` (bwrap senza agente); `bun src/cli/main.ts serve` e `run` (server e CLI di Warren, PID tracciati e fermati); `git`, `curl`, `jq`, `ss`, `pgrep`, `cp`, `cmp`, `ls`, `find`, `rm` (solo sotto `$HOME`). Una riga di verifica mal quotata da PowerShell ha avviato per errore `bwrap` senza argomenti (stampa l'uso e termina) e `node` senza input (termina): nessun effetto. Nessun `-u root`, `apt`, `.wslconfig`, `/etc`, rete, DNS; nessun accesso a `Ubuntu` o `docker-desktop` né a `~/oc ~/ps ~/pc ~/gt-*`.
- Lato Windows: PowerShell, `node` per gli script e `evaluate.mjs`, `tar` per il pacchetto della fixture, copie dei grezzi. Un `rm -f /dev/null` digitato per errore nella shell Git Bash di Windows è fallito («Operation not permitted»).

## Limiti

n=3 per issue (n=12 per sistema), un solo modello, un solo candidato oltre alla baseline, forge finto, durate non confrontabili, due versioni minori di Claude Code nella baseline, la causa dell'unico FAIL non è verificabile perché il codice di quella prova non è stato conservato.
