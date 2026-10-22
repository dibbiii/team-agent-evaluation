# Handoff

Data: 2026-10-22 (aggiornato dopo le run LIVE di tutti i candidati e le prove S03/S04/S07/S08/S09).

## Stato

- M0–M6 completati. Raccomandazione in `reports/FINAL-RECOMMENDATION.md` (D33): **B primaria** (Warren come Execution Plane dietro un'interfaccia stretta + Control Plane nostro), **A seconda forte** (runner e sandbox nostri), C differita con più motivi. Confidenza media (medio-alta sulla necessità di un Control Plane nostro, bassa-media su B contro A). Nessuna opzione è pronta per la produzione.
- **Run LIVE con un agente reale su ISSUE-1 fatte per tutti e cinque i candidati** (stesso modello `claude-sonnet-5-5`): baseline 9, Warren 5 (più 8 nelle prove S09/S07/S04), Paperclip 2, Paseo 2, OpenClaw 2, Gas Town 2. **Tutte con held-out PASS: effetto soffitto**, nessuna differenza di qualità dimostrata. Confronto in `reports/comparison.md` §2.1 e §2.2.
- Prove di controllo e sicurezza: Warren S09 (il tetto di costo **non ferma la run a metà**, 10,1×), S04 (nessun lock, due PR in conflitto), S07 (injection ignorate: resistenza del modello, non confine); Paperclip #16935 riprodotta con `claude_local` (anche in `authenticated`) più fuga dal wrapper accettata; Paseo senza password = comandi sull'host; OpenClaw solo con l'intero Gateway in `bwrap`; Gas Town solo con l'intero Gas Town in `bwrap`, `gt done` bloccato dai file propri non tracciati (run2 con workaround). Baseline: S03 (reviewer 17/17, vincolo di ruolo 3/3) e S08 (handoff PASS, nessun vantaggio misurabile), n=1.
- Git: `main` è stato pubblicato su `dibbiii/team-agent-evaluation` (privato, D26) e al momento dell'ultimo controllo `main` coincide con `origin/main`; le modifiche ai documenti di questa passata sono **non committate**. Regola D26/`reports/execution-log.md`: push di aggiornamento solo ai traguardi e comunicati; repository di prova separato `dibbiii/tae-sandbox` per Warren con forge reale (senza held-out).
- Spesa nel registro `results/budget-ledger.json`: **8,04 USD su 15** (stime a listino sul **piano Team** dell'azienda dell'utente, organizzazione Brainy Labs, non fatture). Voci: baseline 0,83 (di cui 0,38 sprecati da run invalidate), calibrazione 1,96, Warren S01 0,45, Paperclip 0,22, Paseo 0,145, OpenClaw 0,51, Gas Town 0,44, S03+S08 2,27, Warren S09/S07/S04 0,77 (dettagli nei report; i totali per voce non sono una somma esatta del registro).

## Cose attive che l'utente deve decidere o fare

1. **Distribuzione WSL dedicata `Ubuntu-26.04`**: contiene il login di Claude Code (`~/.claude/.credentials.json`, 551 byte, invariato dopo l'ultimo `cmp`), Warren, Bun, Node e le installazioni mantenute dei candidati (`~/pc`, `~/ps`, `~/ps-src`, `~/oc`, `~/pc-node`, `~/gt-go`, `~/gt-gopath`, `~/gt-bin`, `~/gt-src`). **Pulizia finale, azione dell'utente:** dall'interno `~/.local/bin/claude logout`; poi da PowerShell `wsl --unregister Ubuntu-26.04` (il nome deve essere **esatto**: scrivere `Ubuntu` cancellerebbe la distribuzione personale). Finché esiste, il token resta leggibile dai processi lì dentro; la cancellazione porta via anche le installazioni mantenute.
2. **ALERT sul wrapper delle credenziali (F46, D31).** Il wrapper «copia e cancella» usato nelle prime run LIVE è fragile: se il token OAuth scade durante la sessione (~8 ore), Claude Code riscrive il file nella copia, il wrapper la cancella e l'originale resta con un refresh token invalidato: il login scade e le run si fermano (è già successo). Il wrapper attuale non sovrascrive mai l'originale e conserva `.credentials.json.refreshed`; prima di ogni lotto fare un ping minimo (~0,01 USD) e dopo ogni run un `cmp` contro la copia di riferimento. Se il login è scaduto, serve che l'utente lo rifaccia (`wsl -d Ubuntu-26.04 -u dibbi`, poi `claude` e `/login`).
3. **Token Atlassian**: l'utente ha dichiarato di averlo revocato.
4. **Piano Team**: le run LIVE consumano limiti d'uso dell'azienda. Se non si vuole proseguire con run LIVE, non fare altro.
5. **Progetto Jira KAN**: contiene le 6 issue `[ISSUE-1]…[ISSUE-6]` create dallo script (etichetta `tae-benchmark`); si possono cancellare filtrando per quell'etichetta.
6. **Decisione aperta D34:** spike del runner A e fixture difficile con n≥3 su baseline e Warren (serve approvazione per budget e tempo).

## Da riprendere (in ordine di valore)

1. **Fixture difficile con n≥3 su baseline e Warren** (cross-modulo, regressioni sottili, requisito contraddittorio): la fixture facile ha effetto soffitto e la difficile è stata provata solo sulla baseline (n=1). Senza questo non si può dire se un orchestratore serve né se Warren porta un vantaggio. Stima precedente 10–11 USD (non rivalutata), o circa 5 USD per 5 issue.
2. **Spike del runner A** (wrapper `bwrap` + PR plumbing minimo) per confrontare B e A (D34).
3. **Forge GitHub reale con un token fine-grained dell'utente** limitato a `dibbiii/tae-sandbox` (contenuti e pull request in scrittura, nessun permesso di merge) e protezione del ramo con `enforce_admins` e revisione obbligatoria: serve a provare PR vere, `mergeable`, CI e il rilevamento delle collisioni, che con il forge finto non si vedono.
4. **Webhook Jira reali** (il controller è provato su Jira reale senza webhook).
5. **VM Linux remota (≥8 GiB)** per «lavora a PC spento», per run concorrenti serie e per provare i guasti con un agente vero (S06): oggi tutto gira su questo PC e non regge una sospensione.
6. **Controller**: implementare budget e arresto a monte, lease durevole, serializzazione delle collisioni (anche nei file di test), identità git di macchina (D28, D29); prototipo a costo zero dell'adapter Paperclip→Warren contro un finto Warren, solo se si vuole valutare C.
7. **Non eseguito sui candidati**: S02, S03 (DAG), S08, S06 con agente vero, un agente cooperante che sonda davvero i confini, l'esecuzione degli aggiramenti di Paperclip e Gas Town, Gas Town con Refinery/daemon/Witness, S09 con chiave API e tetto di Pi.

## Avvertenze per chi riprende

- Il `CLAUDE.md` globale dell'utente contamina le run `claude -p` se non si imposta `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`: verificarlo con una sonda prima di ogni lotto e leggere i riassunti degli agenti, non solo i test.
- Sul daemon Docker ci sono container e volumi dell'utente: toccare solo risorse `tae-` con label `tae=1`, mai `prune`.
- Il controllo automatico dei permessi di Claude Code ha bloccato (giustamente) una prova che avrebbe lanciato Claude Code **senza sandbox con i permessi disattivati** e con credenziali copiate: non ritentare.
- **Quoting:** wsl.exe + PowerShell rompono i comandi annidati. Usare script `.sh` copiati dentro la distribuzione dal lato Windows (`\\wsl.localhost\Ubuntu-26.04\...`, fine riga LF).
- **DNS di WSL** non funzionante su questo PC (anche nella `Ubuntu` personale). Nella distribuzione dedicata: `/etc/resolv.conf` è un file vero con 1.1.1.1 e 8.8.8.8 e `systemd-resolved` è disattivato. Non ripristinare il collegamento verso `/run`: la sandbox di Warren non monta `/run` e il DNS dentro la sandbox smette di funzionare (è costata una run).
- **Memoria:** la RAM disponibile dell'host oscilla (browser e WebView occupano diversi GB). Prima di una serie di run controllare la memoria *disponibile* (cache inclusa), non solo quella «libera»; la serie `warren-live-batch.ps1` si ferma sotto 1,5 GB.
- **Warren:** non esclude `.claude/` dai commit; la prova copia le credenziali nel workspace; cancellare il repository bare di prova dopo ogni run (`scripts/live/cleanup-run.sh`).
- **Candidati in LIVE (trappole da non ripetere):** Paperclip: impostare `engine: "cli"` (il motore ACP predefinito ignora il wrapper e ha già lanciato Claude Code fuori dalla sandbox) e lanciare il server con `setsid nohup`; Gas Town: preimpostare `~/.claude.json` (onboarding, tema, fiducia per percorso esatto di ogni worktree del polecat) e i pattern dei file di Gas Town in `.repo.git/info/exclude`, altrimenti `gt done` si blocca; OpenClaw: confinare l'intero Gateway, disattivare l'heartbeat (`agents.defaults.heartbeat.every = "0m"`); Paseo: password sempre impostata e wrapper con `env -i`; Warren: nessun `claude` sull'host fuori da `bwrap` (non lanciare `model-pin-check.sh`).
- **Come riprodurre:** comandi esatti nelle sezioni «Comandi» dei report `s01-*-live.md` e in `reports/FINAL-RECOMMENDATION.md` §11; le prove S03/S08 con `node scripts/run-s03-review.mjs` e `node scripts/run-s08-handoff.mjs` (opzione `--dry` a costo zero); i lotti Warren S09/S07/S04 con `scripts\live\warren-s0-batch.ps1`.
- Domande aperte: `docs/decisions.md` (D16, D27, D34) e il punto 10 della raccomandazione.

## Aggiornamento 2026-10-22 (sera)
- **Fatti dopo la stesura sopra:** fixture difficile a n=3 (`reports/hard-n3.md`: baseline 11/12, Warren 12/12), Warren con forge GitHub reale (`reports/s01-warren-github.md`), webhook Jira reali (`docs/jira-setup.md`). Voci 3 e 4 dell'elenco «Cosa resta» sono quindi **fatte**; restano VM remota, spike del runner A (D34) e la pulizia finale.
- Il token GitHub di prova va revocato dall'utente (fatto il 2026-10-22 secondo l'utente) e la regola di Automation `tae-webhook-test` in Jira va disattivata o cancellata (l'URL contiene un segreto; tunnel spento).
- Spesa registrata nel ledger: ~11,4 USD su 15 (stime a listino).
