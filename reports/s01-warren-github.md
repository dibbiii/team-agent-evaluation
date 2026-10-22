# S01 — Warren con forge GitHub reale (`dibbiii/tae-sandbox`): stub a costo zero, 2 run LIVE con agente vero, CI rossa con stub

Data: 2026-10-22 (ora locale 09:35-09:55). Stato: completo, salvo la CI rossa con agente vero (non eseguita). Prova 1 e prova 3 con un `claude` FINTO (costo 0); prova 2 con Claude Code vero SOLO dentro bwrap di Warren (2 run, HARD-5 e HARD-6). Etichette: TESTED = eseguito e misurato; CODE = letto nei sorgenti; UNVERIFIED/BLOCKED = non provato. Dati: `results/S01-warren-github-stub-*.json` (3, `mode: MOCK`) e `results/S01-warren-github-live-*.json` (2, `mode: LIVE`), grezzi in `results/raw/warren-github-*` (senza `data/` né clone; `grep` di `github_pat_` = 0 file).

## Setup

- Repo remoto privato `dibbiii/tae-sandbox`: `main` = `00b80694c46e3cddd48df91c455df33c3635e556` (1 commit, autore `tae-bot`), solo fixture difficile + `.claude/settings.json` (modello fissato) + `.github/workflows/ci.yml` (job `test`, `npm test`, Node 22, su `pull_request` e push su `main`). `.gitignore`: solo `node_modules/`, `.env`, `.env.*`, `*.log` (**non** ignora `.claude/`).
- Warren 0.19.3, runtime `local`, bwrap reale (`readyz` 200). Forge: `WARREN_FORGE=github` (CODE `src/forge/registry.ts`: token letto da `WARREN_GIT_TOKEN` poi `GITHUB_TOKEN`; per un PAT fine-grained il registro prevede `githubCheckRuns=false`, ma non risulta impostato dal boot normale: non indagato). Il token (file `~/.tae-gh-token`, 600) è letto dallo script e passato **solo** nell'ambiente del processo server (`env -i ... WARREN_GIT_TOKEN=...`); non è nell'ambiente del CLI né dell'agente (la sandbox ripulisce l'ambiente, già misurato nelle S00/S07). Mai stampato; i log sono filtrati con `sed` e controllati con `grep github_pat_`.
- Identità di macchina configurata per la prova: `WARREN_GIT_AUTHOR_NAME=tae-warren-bot`, `WARREN_GIT_AUTHOR_EMAIL=tae-warren-bot@example.invalid` (nei lotti precedenti non era impostata: **differenza dichiarata**).
- `autoMerge` NON configurato (nessun `.warren/config.yaml` nel repo): spento, come richiesto.
- `gh` NON è installato nella distribuzione: ho usato `curl` verso `https://api.github.com/repos/dibbiii/tae-sandbox/...` (script `scripts/live/warren-github-api.sh`, percorsi limitati a quel repo). `gh pr merge` / `gh pr close --delete-branch` sono stati sostituiti dalle chiamate REST equivalenti (`PUT /pulls/N/merge`, `PATCH /pulls/N` + `DELETE /git/refs/heads/<branch>`).
- Stub `scripts/live/warren-github-stub-claude.sh`, 3 varianti scelte da un marcatore nel prompt: `narrow` (modifica `src/util.js`, `git add` del solo file), `broad` (`git add -A`, come un agente sbrigativo), `break` (come `broad` più un test che fallisce). Il commit dello stub **non imposta nessuna identità**: l'autore mostra ciò che Warren fornisce.

Comandi (PowerShell, dalla cartella della repo):

```powershell
$env:WSL_UTF8="1"
powershell -NoProfile -File scripts\live\warren-github-deploy.ps1
wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/sandbox-net-check.sh
wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/warren-github-run.sh stub s1-narrow narrow
wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- env CI_WAIT_S=30  bash live/warren-github-run.sh stub s1-broad broad
wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- env CI_WAIT_S=120 bash live/warren-github-run.sh stub s3-break break
wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/warren-github-merge-probe.sh <PR>
wsl -d Ubuntu-26.04 -u dibbi --cd ~ -- bash live/warren-github-cleanup.sh 00b80694c46e3cddd48df91c455df33c3635e556
```

## Risultati (TESTED)

| | narrow (PR 1, `run_wfag5gyv28h8`) | broad (PR 2, `run_0frqd1q1zbr3`) | break (PR 3, `run_xpgxwdmrkx6g`) |
|---|---|---|---|
| Run Warren | `succeeded`, 6 s | `succeeded` | `succeeded` |
| Branch / base | `warren/<run-id>` -> `main` | idem | idem |
| File nel diff della PR | `src/util.js` | `src/util.js` + **`.claude/settings.local.json`** | `src/util.js`, `test/zz-stub-broken.test.js`, **`.claude/settings.local.json`** |
| Autore e committer del commit | `tae-warren-bot <tae-warren-bot@example.invalid>` (entrambi) | idem | idem |
| Autore GitHub del commit / firma | `null` (email non associata) / `verified=false` | idem | idem |
| Autore della PR (utente GitHub) | `dibbiii` (proprietario del token) | idem | idem |
| `mergeable_state` | `blocked` | `blocked` | `blocked` |
| `auto_merge` | `null` | `null` | `null` |
| Commenti / revisioni sulla PR | 0 / nessuna | 0 | 0 |
| Eventi di Warren dopo `reap.completed` (30-150 s di attesa) | 0 nuovi | 0 | 0 |

- **Titolo e corpo della PR.** Titolo = prima riga del messaggio di commit. Corpo (TESTED): sezioni Summary, Run (id run, agente, costo e token), Commits, Files changed (diffstat), Prompt (in `<details>`), firma «Opened by warren run». Il **prompt completo finisce nel corpo della PR**: su un forge reale, un repo privato lo limita agli utenti del repo, ma resta un dato da tenere presente (per issue reali conterrebbe il testo del ticket).
- **Identità.** `WARREN_GIT_AUTHOR_*` arriva alla sandbox e viene usata per autore e committer anche quando l'agente non imposta nulla: il commit non è attribuito a una persona. Nelle run dei lotti precedenti (variabile non impostata) l'agente vero firmava con nome ed email reali dell'utente (F30). La PR resta comunque **della persona proprietaria del token** (`user: dibbiii`): con un PAT personale la «voce» della PR è sempre la persona; un'identità di macchina sulla PR richiederebbe una GitHub App (`WARREN_FORGE=app`, CODE, non provato). I commit non sono firmati.
- **Credenziali e `.claude/` nel branch (F27).** Con un `git add -A` (varianti broad e break) **`.claude/settings.local.json` finisce nel branch e nella PR sul forge reale** (Warren non esclude `.claude/` dai commit: `commitExcludes` vuoto, CODE `src/runtime/adapters/claude-code.ts`:79). Nello stub la cartella `.claude/` contiene solo quel file (nessuna credenziale perché il server aveva un HOME fittizio). **Con l'agente vero Warren copia `.credentials.json` in `/workspace/.claude/`**: un commit largo lo porterebbe nel repo remoto (estrapolazione, non provata: UNVERIFIED). Con un commit ordinato (`narrow`) il diff contiene solo il file voluto. Nelle 12+8+5 run vere dei lotti precedenti l'agente non ha mai fatto un commit largo.
- **CI.** I check run, lo status combinato e le Actions sono **inaccessibili con questo token** (403 «Resource not accessible by personal access token» su `/commits/<sha>/check-runs`, `/commits/<sha>/status`, `/actions/runs`: il token ha solo Contents e Pull requests). `mergeable_state` è `blocked` in tutti i casi (revisione mancante), quindi non distingue verde da rosso. L'esito della CI si ricava dal **messaggio del tentativo di merge**: PR 1 (modifica innocua) elenca solo la revisione mancante, quindi il controllo `test` risultava soddisfatto; PR 3 (test rotto) aggiunge `Required status check "test" is failing.`. Quindi: **la CI è partita da sola su entrambe le PR, è passata su quella buona ed è fallita su quella rotta** (TESTED indirettamente; non ho visto la pagina Actions; il tempo è stato <5 min). Warren non riceve questo segnale con il PAT: UNVERIFIED se con un token con permesso Checks vedrebbe lo stato.
- **Warren tenta un merge?** No. `auto_merge: null`, `merged: false`, nessun evento di arming, nessun commento. Il codice dice che senza `pr.autoMerge` non arma nulla (CODE `docs/project-setup.md`). Eventi osservati: solo `reap.pr_opened`, `reap.branch_pushed`, `reap.completed`, `reap.workspace_destroyed`.
- **Protezione del ramo (TESTED).** `PUT /pulls/1/merge` (squash) con il token dell'agente: HTTP 405 `At least 1 approving review is required by reviewers with write access.` Su PR 3: la stessa frase più `Required status check "test" is failing.` `merged: false`, `main` invariato. Lo script non tenta il merge se `mergeable_state` non è `blocked` (nessun rischio di merge reale). Non ho letto né modificato la protezione (nessun tentativo oltre quelli dichiarati).
- **Prova 3 (CI rossa), cosa fa Warren.** PR con test rotto: la run Warren resta **`succeeded`**, la PR resta **aperta**, **nessuna ritentata, nessun commento, nessun segnale** nei 120 s di osservazione; Warren non osserva la CI con questo token (CODE: gli eventi `ci.*` non compaiono). Il guasto lo mostra solo il forge (controllo `test` rosso, merge bloccato). Fatta con lo stub a costo zero perché il comportamento è lato Warren e non dipende dall'agente; **non provata con un agente vero**. Per un CI-fixer (`ci_fixer_run`) esiste codice (CODE), non esercitato.
- **Pulizia sul forge.** PR 1, 2, 3 chiuse, 3 branch cancellati per nome esatto (HTTP 204), `main` = `00b80694...` **INVARIATO**, rimane solo il branch `main`.

## Prova 2: due run LIVE con l'agente vero (TESTED)

Autorizzazione: il ping di rinnovo credenziali fuori da bwrap era stato NEGATO dal controllo dei permessi (non aggirato; comando negato: `claude -p "rispondi solo: ok" --tools "" ...` in HOME vera). Il coordinatore ha deciso di farne a meno: l'mtime dell'originale (06:46, 551 byte) indica un rinnovo già avvenuto. Copia di riferimento con `cp` (`warren-s0-state.sh ref`), poi solo `ls -l` e `cmp` prima e dopo ogni run: **IDENTICO** dopo entrambe (originale mai letto né sovrascritto; copia cancellata a fine prova). Claude Code è partito solo dentro bwrap (campionatore: 3 processi con eseguibile in `~/.local/share/claude/versions`, nessuno fuori dalla sandbox). Comando: `env CI_WAIT_S=150 bash live/warren-github-run.sh live l1-hard5 HARD-5` (poi `l2-hard6 HARD-6` con attesa CI 90 s).

| | HARD-5 (PR 4, `run_r8hbh2z6k5t2`) | HARD-6 (PR 5, `run_5bhejah3kg6c`) |
|---|---|---|
| Modello (evento init) | claude-sonnet-5-5 | claude-sonnet-5-5 |
| Stato Warren / tetto | succeeded / 1 USD | succeeded / 1 USD |
| Held-out lato Windows (`FIXTURE=hard`, src dal branch senza `.claude`) | **PASS** | **PASS** |
| Costo (stima a listino) | 0,1247 USD | 0,1180 USD |
| Durata run (Warren, include push e PR) | 25,2 s | 29,7 s |
| Turni | 5 | 6 |
| File nel diff della PR | `src/reports.js`, `test/reports-export.test.js` | `src/export.js`, `src/index.js`, `test/reports-export.test.js` |
| `.claude`/credenziali nel branch | no | no |
| Autore e committer | `tae-warren-bot` (entrambi) | idem |
| Titolo PR | titolo del commit dell'agente | idem |
| Merge senza revisione col token | 405 «At least 1 approving review is required» (solo la revisione: il controllo `test` non è segnalato come fallito, quindi la CI era verde) | idem |
| Eventi Warren dopo la chiusura (90-150 s) | 0 | 0 |
| `main` del forge | invariato | invariato |

Confronto con le stesse issue su forge finto (`reports/hard-n3.md`, Warren n=3): HARD-5 0,129 USD / 23,2 s / 6 turni; HARD-6 0,137 USD / 23,3 s / 6 turni. Con il forge GitHub reale costi e turni sono nello stesso intervallo, la durata è di pochi secondi maggiore (push e PR reali; non misurato in modo isolato). Esito identico (PASS held-out). n=1 per issue: nessuna generalizzazione.

Osservazioni (TESTED): (1) con `WARREN_GIT_AUTHOR_*` impostato l'agente vero firma come `tae-warren-bot`, mentre nei lotti precedenti (variabile non impostata) firmava con nome ed email dell'utente (F30): l'identità di macchina funziona anche con l'agente vero; (2) il corpo della PR contiene la riga «Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>» riportata dall'agente in «Agent notes»; (3) la CI è partita da sola su entrambe le PR e risultava verde (desunto dal messaggio di merge; l'API dei check dà 403); (4) nessun commit largo: i due agenti hanno fatto commit ordinati, quindi il rischio `.claude` nel branch non si è manifestato con l'agente vero.

**Prova 3 con agente vero: non eseguita.** Il comportamento di Warren a CI rossa è lato Warren ed è già osservato con lo stub; un agente vero tenderebbe a non consegnare test rotti, quindi servirebbe una trappola artificiale. Spesa delle 2 run vere: 0,243 USD (limite 1,0, massimo 4 run).

## Cosa dimostra e cosa no

Dimostra (TESTED, forge reale, stub): Warren apre **PR reali** su GitHub con un PAT fine-grained a scope minimo; non tenta il merge e non arma l'auto-merge senza opt-in; la protezione del ramo (revisione obbligatoria, controllo `test`) blocca il merge anche per chi detiene il token; la CI esterna parte da sola e si comporta come atteso (verde/rosso); `WARREN_GIT_AUTHOR_*` dà un'identità di macchina ai commit. Gate «CI esterna» (R10.6): **soddisfatto sul piano infrastrutturale**, ma Warren non legge la CI con questo token. Gate «nessun merge automatico» (R12.2): **soddisfatto qui** per la combinazione (autoMerge spento + protezione con revisione + token senza diritti di merge senza revisione), **non per garanzia di Warren**: l'opt-in resta disponibile in configurazione.
Dimostra anche (agente vero, n=1 per issue): PR reali con HARD-5 e HARD-6, held-out PASS, identità di macchina rispettata dall'agente, nulla di sensibile nel branch con commit ordinati, merge bloccato. Non dimostra: CI rossa con agente vero, credenziali nel branch con un commit largo dell'agente vero, CI fixer, auto-merge, GitHub App, protezione con un token che possa fare più cose, rete limitata. UNVERIFIED: la visibilità della CI per Warren con un token con permesso Checks.

## Pulizia finale

PR 1-5 chiuse, 5 branch `warren/run_*` cancellati per nome esatto, `main` = `00b80694...` invariato. Cancellati: `/home/dibbi/.tae-gh-token` (**l'utente deve revocare il PAT su GitHub: io non posso**), copia di riferimento delle credenziali, cartelle di prova, tar, script e prompt copiati in `~/live` e `~/hard-prompts`. Nessun processo, porta o copia di credenziali residui; credenziali originali invariate (551 byte, 06:46).

## Incidenti minori

- **Cartella Windows `C:\wsl.localhost\`**: un errore di quoting (backslash perso in un file creato via heredoc) ha scritto per sbaglio 9 copie di script e prompt (HARD-5/6, `sandbox-net-check.sh`, `warren-s0-state.sh`, 5 script `warren-github-*`) sotto `C:\wsl.localhost\Ubuntu-26.04\home\dibbi\...`. Nessun segreto. `Remove-Item` è bloccato come percorso di sistema protetto (anche per me): **la cancellerà l'utente a mano**. Lo script `warren-github-deploy.ps1` è stato corretto.
- Orari: lo script logga in UTC (07:45 = 09:45 locali).
