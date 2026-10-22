# S01 — Una issue semplice fino a PR

Stato: **PARZIALE**. Provati in LIVE: baseline (fixture facile e difficile) e tutti e 5 i candidati: Warren, Paperclip, Paseo, OpenClaw e Gas Town (2 run, entrambe `PASS` sui test; nella run1 la consegna non si è completata, la run2 ha richiesto un workaround). Nessun candidato ha prodotto una PR reale: forge finto per Warren; Gas Town (run2) un branch pushato sull'origin locale e una MR in coda, senza merge; nessun commit/PR per Paperclip, Paseo e OpenClaw (F69).

## ID e obiettivo
- **ID:** S01. **Requisiti:** R10.6, R12.2, R03.4, R12.1.
- **Obiettivo (§6):** dato un bug concreto nella fixture, verificare selezione task, contesto, modifica, test, commit e PR (o PR simulata); rispetto dei criteri di accettazione con test indipendenti; **nessun merge automatico**; confronto con la baseline alle stesse condizioni.

## Setup e condizioni iniziali
- Fixture facile `fixtures/seed-app` (carrello, Node, zero dipendenze), commit baseline immutabile (`73f78fa`, autore `tae-bot`, con `.claude/settings.json` che fissa `claude-sonnet-5-5`).
- Issue: `fixtures/issue-catalog/issues.json` (ISSUE-1 bug sconto SAVE10, ISSUE-2 feature SAVE50, ISSUE-6 feature cross-file). Fixture difficile: `fixtures/seed-app-hard` con `fixtures/issue-catalog/hard-issues.json` (HARD-1…HARD-10).
- Test held-out: `fixtures/acceptance/ISSUE-N.acceptance.test.js` e `fixtures/acceptance-hard/HARD-N.acceptance.test.js`, eseguiti **lato Windows, fuori dal workspace dell'agente**, su `src/` esportato senza `.claude/`.
- LIVE: login `claude.ai` (piano Team) nella distribuzione `Ubuntu-26.04`; ogni agente dentro `bwrap` (`--unshare-all --share-net`), rete aperta. Modello `claude-sonnet-5-5`, verificato dall'evento `init` o dal trace in ciascuna run. Budget: `reports/budget.md` (15 USD totali, 1,50 USD per run baseline, 1 USD per run dei candidati).

## Input
Prompt identico per tutti, generato come in `scripts/run-baseline.mjs` (nessun test held-out visibile all'agente).

## Comandi e script reali
- Baseline facile: `node scripts/run-baseline.mjs ISSUE-1 S01` (analogo per ISSUE-2 e ISSUE-6). Baseline difficile: `FIXTURE=hard node scripts/run-baseline.mjs HARD-1 H-CAL` oppure la serie `node scripts/run-hard-batch.mjs HARD-1 HARD-2 …`. Validazione della fixture difficile senza modelli: `node scripts/validate-hard-fixture.mjs`.
- Valutazione di un workspace: `node scripts/evaluate.mjs <cartella> ISSUE-1 <candidato> S01 LIVE claude-sonnet-5-5`.
- Warren: `scripts/live/deploy-to-wsl.ps1`, `scripts/live/warren-setup.sh`, `scripts/live/fixture-setup.sh`, `scripts/live/warren-run.sh <ISSUE> live`, serie con `scripts/live/warren-live-batch.ps1 -Issues ISSUE-1,ISSUE-1,ISSUE-1`, registrazione con `scripts/live/record-warren-run.mjs`, pulizia `scripts/live/cleanup-run.sh`; prova a costo zero `scripts/live/sandbox-net-check.sh`; stub `scripts/live/stub-claude.sh`; controllo modello `scripts/live/model-pin-check.sh`. Procedura: `docs/live-warren-runbook.md`.
- Paperclip: `scripts/live/paperclip-install.sh`, `paperclip-setup.sh`, `paperclip-server.sh`, `paperclip-claude-sandboxed.sh`, `paperclip-run.mjs`, `paperclip-export.sh`, `paperclip-record-run.mjs`, `paperclip-cleanup.sh`. Comandi: `reports/s01-paperclip-live.md` §8.
- Paseo: `scripts/live/paseo-deploy.ps1`, `paseo-setup.sh`, `paseo-server.sh`, `paseo-claude-sandboxed.sh`, `paseo-run.mjs`, `paseo-export.sh`. Comandi: `reports/s01-paseo-live.md` §10.
- OpenClaw: `scripts/live/openclaw-install.sh`, `openclaw-setup.sh`, `openclaw-sandboxed.sh`, `openclaw-server.sh`, `openclaw-turn.sh`, `openclaw-export.sh`, `openclaw-record-run.mjs`, `openclaw-cleanup.sh`. Comandi: `reports/s01-openclaw-live.md` §10.
- Gas Town (2 run LIVE): `scripts/live/gastown-prep.sh`, `gastown-sandboxed.sh`, `gastown-setup-inner.sh`, `gastown-seed-inner.sh` (fiducia per i worktree del polecat), `gastown-ping-inner.sh`, `gastown-start-run.sh run<N> 480 ISSUE-1 0.9`, `gastown-exclude-inner.sh` (workaround di run2), `gastown-export.sh`, `gastown-record-run.mjs`, `gastown-restart-inner.sh`, `gastown-cleanup.sh`. Comandi e sequenza: `reports/s01-gastown-live.md` §10-§11.

## Risultati attesi
Test visibili e held-out verdi; modifica collegata alla issue; commit e PR sul forge; nessun merge automatico; costo e durata registrati nel JSON per run (§7).

## Teardown
Script `*-cleanup.sh` per nome esatto sotto `$HOME` della distribuzione; verifiche: nessun processo residuo, nessuna copia di `.credentials.json` oltre all'originale, nessuna porta su `0.0.0.0`. Non eseguiti (spettano all'utente): `claude logout` e `wsl --unregister Ubuntu-26.04` (nome ESATTO).

## Esito per sistema

| Sistema | Esito | n | Costo (USD, stima a listino) | Note | File |
|---|---|---|---|---|---|
| Baseline, fixture facile | `PASS` | 9 (ISSUE-1, 2, 6 × 3) | medio 0,0499; ISSUE-1 0,0448 | 9 run precedenti invalidate dal `CLAUDE.md` globale | `reports/s01-baseline.md`, `results/S01-baseline-claude-code-*.json`, `results/invalid-contaminated/` |
| Baseline, fixture difficile | `PASS` su 8 prove su 9 (issue da implementare) | 11 prove (HARD-4 due volte, HARD-9 una interrotta dal sistema e rifatta) | medio 0,194 | HARD-4 FAIL poi PASS con lo stesso prompt; calibrazione n=1 | `reports/hard-calibration.md`, `results/H-CAL-baseline-claude-code-*.json` |
| Fixture difficile n=3 (HARD-4, 5, 6, 9): baseline contro Warren | baseline `PASS` 11/12 (HARD-4 2/3, le altre 3/3); Warren `PASS` 12/12 | 12 + 12 (5 prove baseline dalla calibrazione) | baseline 0,166 e Warren 0,167 a run | confronto non isolato; unico FAIL: HARD-4 della calibrazione, causa non verificata (codice non conservato); durate non confrontabili; nessuna differenza di qualità dimostrata | `reports/hard-n3.md`, `results/H-N3-baseline-claude-code-*.json`, `results/S01-warren-hard-live-*.json` |
| Warren + Claude Code | `PASS` | 5 (ISSUE-1 ×3, ISSUE-2, ISSUE-6) | medio 0,0894 (ISSUE-1: 0,0945) | branch pushato e PR **finta** su forge `fake://`; commit con identità reale dell'utente | `reports/s01-warren-live.md`, `results/S01-warren-live-*.json` |
| Paperclip (`claude_local`, `engine:"cli"`) | `PASS` | 2 (ISSUE-1) | 0,0667 e 0,1566 (con continuazione automatica) | nessun commit, nessuna PR; spesa registrata in budget 0 centesimi | `reports/s01-paperclip-live.md`, `results/S01-paperclip-live-587f9843.json`, `results/S01-paperclip-live-6f3cb08d.json` |
| Paseo (daemon 0.12.0, provider sostituito con wrapper) | `PASS` | 2 (ISSUE-1) | 0,0732 e 0,0720 | nessun commit, nessuna PR, nessuna continuazione | `reports/s01-paseo-live.md`, `results/S01-paseo-live-7085fe27.json`, `results/S01-paseo-live-6eb3b3ed.json` |
| OpenClaw (Gateway in bwrap, backend `claude-cli`) | `PASS` | 2 (ISSUE-1) + 1 turno di ripresa | 0,2447 (cache fredda) e 0,1208; più un heartbeat non richiesto 0,128 | nessun commit, nessuna PR | `reports/s01-openclaw-live.md`, `results/S01-openclaw-live-32674079.json`, `results/S01-openclaw-live-f1bc408a.json` |
| Gas Town (`gt sling` con polecat, tutto in `bwrap`, `--no-boot`) | `PASS` (test visibili e held-out, entrambe le run); consegna: run1 **non completata**, run2 completata con un workaround | 2 (ISSUE-1) | 0,2927 e 0,1423 (medio 0,2175, 4,9 volte la baseline 0,0448; 0,435 per una consegna effettiva); `gt costs` 0,98 per run1 (prezzi fissi, non confrontabile) | run1: `gt done` bloccato da file propri di Gas Town non tracciati, nessun push né MR, bead HOOKED, attesa fino a 480 s (F59). Run2 con i pattern in `.repo.git/info/exclude`: branch pushato sull'origin locale, MR in coda, bead CLOSED; autore = nome del polecat, committer = identità della sandbox; `main` invariato (Refinery non avviato). Prima delle 2 run: 1 tentativo bloccato (dialogo di fiducia di Claude Code 2.1.306, poi login scaduto, 44 s, costo 0) | `reports/s01-gastown-live.md` §3, §11, `results/S01-gastown-live-10e4e5cc.json` (run1) e `results/S01-gastown-live-3d14c1b6.json` (run2) (2 file) |

## Artefatti
JSON per run in `results/`; log grezzi in `results/raw/` (non versionati); prompt e script in `scripts/live/`.

## Costi
Stime a listino su abbonamento Team, non fatture. Spesa del registro: 4,56 USD su 15 (`results/budget-ledger.json`, campo `spent_usd`). Per fase: baseline valida 0,45 (più 0,38 delle invalidate), calibrazione difficile 1,96, Warren circa 0,45, Paperclip 0,223, Paseo 0,1452, OpenClaw circa 0,51 (0,5-0,65 con le Haiku non misurate). Gas Town circa 0,44 (2 run più il ping di 0,0013), da `reports/s01-gastown-live.md` §11 (JSON completati senza ledger: non incluso nei 4,56 del registro; spese di fondo di daemon, Deacon e Witness non misurate).

## Stato e motivo
**PARZIALE.**
- Confronto **non isolato** (versione di Claude Code 2.1.304 vs 2.1.306, Node 22 vs 24, strumenti e permessi diversi, prompt di sistema diversi); effetto soffitto sulla fixture facile: nessuna differenza di qualità dimostrabile.
- La fixture difficile: baseline n=1 su tutte le issue (calibrazione); n=3 su HARD-4, 5, 6, 9 per baseline e per **Warren** (unico candidato provato sulla fixture difficile; riga qui sopra e `reports/hard-n3.md`). Gli altri candidati non hanno girato su HARD-N.
- Nessun candidato è stato provato con forge reale, CI esterna o branch protection; «nessun merge automatico» è provato per OpenClaw release (solo draft PR, TESTED) e Gas Town (merge `direct` di default, TESTED come difetto; nelle 2 run il merge non è avvenuto solo perché il Refinery non era avviato); per Warren è CODE (`pr.autoMerge` opt-in spento).
- Gas Town: richiede la preimpostazione della fiducia per ogni worktree del polecat e, nel predefinito, un repository che ignori i file propri di Gas Town, altrimenti `gt done` non consegna (F39, F59). Refinery, Witness, Deacon, daemon, E-stop con Claude Code reale e ripresa a metà lavoro non sono provati.
- Tutti i candidati passano la fixture facile (Warren 5/5, Paperclip 2/2, Paseo 2/2, OpenClaw 2/2, Gas Town 2/2, baseline 9/9): effetto soffitto, nessuna differenza di qualità dimostrata (F48).
