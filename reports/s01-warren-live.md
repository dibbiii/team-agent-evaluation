# S01 — Warren, run LIVE con Claude Code

Data: 2026-10-21. Modalità `LIVE`. Dati: `results/S01-warren-live-*.json` (5 run valide), log grezzi locali in `results/raw/` (non versionati). Preparazione: `reports/live-warren-prep.md`; procedura: `docs/live-warren-runbook.md`.

## Cosa è stato provato

Warren 0.19.3 (commit `ce088e8`), runtime `local` con `bwrap` reale (nessun socket Docker, nessun `SYS_ADMIN`), forge `fake://` su repository bare locale, agente `claude-code` che lancia **Claude Code 2.1.306** dentro la sandbox, con `--max-cost-usd 1`. Distribuzione WSL2 dedicata `Ubuntu-26.04` (senza disco Windows), autenticazione con il login dell'utente (piano Team). Modello `claude-sonnet-5-5`, verificato nell'evento `init` di ogni run. Valutazione: test visibili e **test held-out lato Windows**, fuori dalla sandbox, su `src/` estratto dal branch senza `.claude/`.

## Risultati (run valide)

| Issue | n | Esito | Costo medio (USD, stima a listino) | Intervallo costo | Finestra di esecuzione dell'agente |
|---|---|---|---|---|---|
| ISSUE-1 (bug) | 3 | 3/3 PASS | 0,0945 | 0,0839–0,1085 | 13,0–17,1 s |
| ISSUE-2 (feature) | 1 | 1/1 PASS | 0,0842 | — | 14,0 s |
| ISSUE-6 (feature cross-file) | 1 | 1/1 PASS | 0,0791 | — | 12,9 s |

Totale: **5/5 PASS**, costo medio 0,0894 USD. Spesa delle 5 run: circa 0,45 USD. Costo per issue accettata = costo medio, perché nessuna run valida è fallita.

## Confronto con la baseline (stesso modello, stesso prompt, stessi test held-out)

| | Baseline (Claude Code da solo) | Warren + Claude Code | Rapporto |
|---|---|---|---|
| Esito | 9/9 PASS (n=3 per issue) | 5/5 PASS (n=3 su ISSUE-1, n=1 sulle altre) | pari |
| Costo medio per run | 0,0499 USD | 0,0894 USD | **circa 1,8×** |

**Il confronto NON è perfettamente isolato** (istruzioni §7). Differenze note:
- **Versione di Claude Code:** 2.1.304 (baseline) contro 2.1.306 (Warren; si è aggiornata da sola).
- **Node:** 24 sull'host (baseline), 22 nella distribuzione (Warren).
- **Strumenti e permessi:** la baseline ha solo `Read, Edit, Write, Glob, Grep, Bash` con Bash limitato a `node`/`npm test`; Warren lancia l'agente con **tutti** gli strumenti di Claude Code e i permessi disattivati, dentro la sandbox.
- **Modello:** fissato con `.claude/settings.json` di progetto nel repository della fixture (Warren non passa `--model`).
- **Durata non confrontabile:** quella della baseline include avvio della CLI e valutazione, quella di Warren è solo la finestra di esecuzione dell'agente (senza preparazione del workspace, push e chiusura).
- n molto diverso (9 contro 5), un solo modello.

Ipotesi **non verificata** sul costo maggiore: un contesto di partenza più grande (più strumenti disponibili) per l'agente in Warren. Warren non riporta i token (`null`), quindi non ho potuto controllarlo.

## Cosa è emerso, oltre al verde

1. **La sandbox reale funziona su Linux/WSL2 senza privilegi extra** (nel Docker delle S00 non era possibile). `readyz` 200 con `bwrap` reale.
2. **Prima run fallita per un errore di configurazione mio** (`run_42t1sjc5t01x`): DNS dentro la sandbox, perché avevo reso `/etc/resolv.conf` un collegamento verso `/run`, che la sandbox non monta. Costo 0, non conta come run dell'agente. Corretto e verificato con una prova a costo zero (`scripts/live/sandbox-net-check.sh`).
3. **Il modello non è controllabile da Warren per questa harness** (CODE + osservato): nessun `--model` e nessun `ANTHROPIC_MODEL`. La prima run mostrava `claude-opus-5-5`. Per R06 il routing è configurabile ma **non effettivo** per `claude-code`.
4. **Identità reale nei commit:** l'agente ha firmato il commit con nome ed email dell'utente, dichiarando: «Git non aveva un'identità configurata, quindi ho usato la tua email e il nome…». Warren avrebbe una identità di macchina (`WARREN_GIT_AUTHOR_*`) ma nella sandbox l'ambiente è ripulito. Con un push reale i commit sarebbero attribuiti a una persona.
5. **Rete aperta** nella sandbox (necessaria per l'API del modello): vedi le misure di isolamento in `reports/comparison.md`. La modalità `restricted` è dichiarata «honor-system enforcement» nel codice.
6. **Warren non riporta i token** nel record della run (`null`); il costo è la stima di Claude Code (`costBasis` figura `api` anche con l'abbonamento).
7. **Credenziali:** Warren le copia nella cartella di lavoro della run; nei 5 branch non ne è finita nessuna (controllo sulle differenze rispetto alla baseline), e dopo ogni run le copie sono state rimosse e verificate.

## Cosa questi risultati NON dimostrano

- **Effetto soffitto:** entrambi i sistemi passano tutto. La fixture è facile, quindi non dimostra alcun vantaggio di qualità di Warren: il valore atteso di Warren sta in isolamento, recupero e piping di branch/PR, non nel codice scritto.
- **n piccolo:** 3 su ISSUE-1, 1 sulle altre due. Nessuna generalizzazione.
- **Funzioni multi-agente di Warren** (plan-run, piano seriale): non esercitate. Ogni run è una singola issue con un solo agente.
- **Forge reale:** il forge è finto. Non provati PR reali, CI, branch protection, merge.
- **Jira:** non coinvolto in questo scenario.
- **Costi su abbonamento:** stime a listino sul piano Team dell'azienda, non una fattura.
