# S01 — Una issue semplice fino a PR

Stato: **PARZIALE**. Provati in LIVE: baseline (fixture facile e difficile), Warren, Paperclip, Paseo, OpenClaw. **Gas Town: `BLOCKED`** (nessuna run con l'agente). Nessun candidato ha prodotto una PR reale: forge finto per Warren, nessun commit/PR per gli altri tre.

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
- Gas Town (fermo al login): `scripts/live/gastown-prep.sh`, `gastown-sandboxed.sh`, `gastown-setup-inner.sh`, `gastown-start-run.sh`, `gastown-ping-inner.sh`, `gastown-cleanup.sh`. Come riprendere: `reports/s01-gastown-live.md` §10.

## Risultati attesi
Test visibili e held-out verdi; modifica collegata alla issue; commit e PR sul forge; nessun merge automatico; costo e durata registrati nel JSON per run (§7).

## Teardown
Script `*-cleanup.sh` per nome esatto sotto `$HOME` della distribuzione; verifiche: nessun processo residuo, nessuna copia di `.credentials.json` oltre all'originale, nessuna porta su `0.0.0.0`. Non eseguiti (spettano all'utente): `claude logout` e `wsl --unregister Ubuntu-26.04` (nome ESATTO).

## Esito per sistema

| Sistema | Esito | n | Costo (USD, stima a listino) | Note | File |
|---|---|---|---|---|---|
| Baseline, fixture facile | `PASS` | 9 (ISSUE-1, 2, 6 × 3) | medio 0,0499; ISSUE-1 0,0448 | 9 run precedenti invalidate dal `CLAUDE.md` globale | `reports/s01-baseline.md`, `results/S01-baseline-claude-code-*.json`, `results/invalid-contaminated/` |
| Baseline, fixture difficile | `PASS` su 8 prove su 9 (issue da implementare) | 11 prove (HARD-4 due volte, HARD-9 una interrotta dal sistema e rifatta) | medio 0,194 | HARD-4 FAIL poi PASS con lo stesso prompt; calibrazione n=1 | `reports/hard-calibration.md`, `results/H-CAL-baseline-claude-code-*.json` |
| Warren + Claude Code | `PASS` | 5 (ISSUE-1 ×3, ISSUE-2, ISSUE-6) | medio 0,0894 (ISSUE-1: 0,0945) | branch pushato e PR **finta** su forge `fake://`; commit con identità reale dell'utente | `reports/s01-warren-live.md`, `results/S01-warren-live-*.json` |
| Paperclip (`claude_local`, `engine:"cli"`) | `PASS` | 2 (ISSUE-1) | 0,0667 e 0,1566 (con continuazione automatica) | nessun commit, nessuna PR; spesa registrata in budget 0 centesimi | `reports/s01-paperclip-live.md`, `results/S01-paperclip-live-587f9843.json`, `results/S01-paperclip-live-6f3cb08d.json` |
| Paseo (daemon 0.12.0, provider sostituito con wrapper) | `PASS` | 2 (ISSUE-1) | 0,0732 e 0,0720 | nessun commit, nessuna PR, nessuna continuazione | `reports/s01-paseo-live.md`, `results/S01-paseo-live-7085fe27.json`, `results/S01-paseo-live-6eb3b3ed.json` |
| OpenClaw (Gateway in bwrap, backend `claude-cli`) | `PASS` | 2 (ISSUE-1) + 1 turno di ripresa | 0,2447 (cache fredda) e 0,1208; più un heartbeat non richiesto 0,128 | nessun commit, nessuna PR | `reports/s01-openclaw-live.md`, `results/S01-openclaw-live-32674079.json`, `results/S01-openclaw-live-f1bc408a.json` |
| Gas Town | `BLOCKED` | 0 valide (1 tentativo, 44 s, costo 0) | 0 | dialogo di fiducia di Claude Code 2.1.306 non accettato da Gas Town; poi login scaduto | `reports/s01-gastown-live.md`, `results/S01-gastown-live-blocked.json` |

## Artefatti
JSON per run in `results/`; log grezzi in `results/raw/` (non versionati); prompt e script in `scripts/live/`.

## Costi
Stime a listino su abbonamento Team, non fatture. Spesa del registro: 4,56 USD su 15 (`results/budget-ledger.json`, campo `spent_usd`). Per fase: baseline valida 0,45 (più 0,38 delle invalidate), calibrazione difficile 1,96, Warren circa 0,45, Paperclip 0,223, Paseo 0,1452, OpenClaw circa 0,51 (0,5-0,65 con le Haiku non misurate).

## Stato e motivo
**PARZIALE.**
- Confronto **non isolato** (versione di Claude Code 2.1.304 vs 2.1.306, Node 22 vs 24, strumenti e permessi diversi, prompt di sistema diversi); effetto soffitto sulla fixture facile: nessuna differenza di qualità dimostrabile.
- La fixture difficile è stata provata **solo sulla baseline** (n=1): nessun candidato ha girato su HARD-N.
- Nessun candidato è stato provato con forge reale, CI esterna o branch protection; «nessun merge automatico» è provato per OpenClaw release (solo draft PR, TESTED) e Gas Town (merge `direct` di default, TESTED come difetto); per Warren è CODE (`pr.autoMerge` opt-in spento).
- Gas Town: richiede un nuovo login dell'utente e la preimpostazione della fiducia per ogni worktree del polecat.
