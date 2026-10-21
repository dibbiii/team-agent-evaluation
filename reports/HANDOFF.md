# Handoff

Data: 2026-10-21.

## Stato

- M0–M6 completati. Raccomandazione in `reports/FINAL-RECOMMENDATION.md`: **B primaria** (Warren come Execution Plane + controller custom), **A seconda**, C differita. Confidenza media. Nessuna opzione è pronta per la produzione.
- Provato con un agente reale: **solo Warren** (5 run LIVE, 5/5 PASS; guasti S06 con stub). Gli altri candidati: smoke test S00 e letture.
- Commit solo locali. **Nessun push** (richiede l'approvazione dell'utente).
- Spesa nel registro `results/budget-ledger.json`: circa 1,72 USD su 15 (stime a listino sul **piano Team** dell'azienda dell'utente, organizzazione Brainy Labs): baseline 0,83 (di cui 0,38 sprecati da run invalidate), preparazione LIVE circa 0,12, Warren 5 run valide circa 0,45.

## Cose attive che l'utente deve decidere o fare

1. **Distribuzione WSL dedicata `Ubuntu-26.04`**: contiene il login di Claude Code (`~/.claude/.credentials.json`), Warren, Bun, Node e strumenti. A fine prove, dall'interno: `~/.local/bin/claude logout`; poi da PowerShell: `wsl --unregister Ubuntu-26.04` (il nome deve essere **esatto**: scrivere `Ubuntu` cancellerebbe la distribuzione personale). Finché esiste, il token resta leggibile dai processi lì dentro.
2. **Token Atlassian**: l'utente ha dichiarato di averlo revocato.
3. **Piano Team**: le run LIVE consumano limiti d'uso dell'azienda. Se non si vuole proseguire con run LIVE, non fare altro.
4. **Push** della repository su `dibbii/team-agent-evaluation`: non fatto, serve approvazione.
5. **Progetto Jira KAN**: contiene le 6 issue `[ISSUE-1]…[ISSUE-6]` create dallo script (etichetta `tae-benchmark`); si possono cancellare filtrando per quell'etichetta.

## Da riprendere (in ordine di valore)

1. **Fixture più dura** (cross-modulo, regressioni sottili, requisito contraddittorio): la fixture attuale ha effetto soffitto (baseline 9/9, Warren 5/5). Senza questo non si può dire se un orchestratore serve.
2. **Warren, prova più dura**: run concorrenti (S04), riavvii ripetuti, forge reale su un repository di prova con CI e branch protection, rete limitata, adattatore dal controller (`POST /runs`).
3. **Valutare l'Opzione A con `--resume`** se i limiti di Warren sul recupero (run in volo non riprese, workspace distrutto al riavvio) pesano.
4. **VM Linux remota (≥8 GiB)** per «lavora a PC spento» e per run concorrenti. Oggi tutto gira su questo PC e non regge una sospensione.
5. **Webhook Jira reali** (il controller è provato su Jira reale senza webhook).
6. **Run LIVE degli altri candidati** (Paperclip `claude_local`, Gas Town, Paseo Hub, OpenClaw): richiedono una nuova approvazione esplicita, perché implicano credenziali nei loro runtime.

## Avvertenze per chi riprende

- Il `CLAUDE.md` globale dell'utente contamina le run `claude -p` se non si imposta `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`: verificarlo con una sonda prima di ogni lotto e leggere i riassunti degli agenti, non solo i test.
- Sul daemon Docker ci sono container e volumi dell'utente: toccare solo risorse `tae-` con label `tae=1`, mai `prune`.
- Il controllo automatico dei permessi di Claude Code ha bloccato (giustamente) una prova che avrebbe lanciato Claude Code **senza sandbox con i permessi disattivati** e con credenziali copiate: non ritentare.
- **Quoting:** wsl.exe + PowerShell rompono i comandi annidati. Usare script `.sh` copiati dentro la distribuzione dal lato Windows (`\\wsl.localhost\Ubuntu-26.04\...`, fine riga LF).
- **DNS di WSL** non funzionante su questo PC (anche nella `Ubuntu` personale). Nella distribuzione dedicata: `/etc/resolv.conf` è un file vero con 1.1.1.1 e 8.8.8.8 e `systemd-resolved` è disattivato. Non ripristinare il collegamento verso `/run`: la sandbox di Warren non monta `/run` e il DNS dentro la sandbox smette di funzionare (è costata una run).
- **Memoria:** la RAM disponibile dell'host oscilla (browser e WebView occupano diversi GB). Prima di una serie di run controllare la memoria *disponibile* (cache inclusa), non solo quella «libera»; la serie `warren-live-batch.ps1` si ferma sotto 1,5 GB.
- **Warren:** non esclude `.claude/` dai commit; la prova copia le credenziali nel workspace; cancellare il repository bare di prova dopo ogni run (`scripts/live/cleanup-run.sh`).
- Domande aperte: `docs/decisions.md` (D15–D24) e il punto 10 della raccomandazione.
