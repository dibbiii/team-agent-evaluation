# Handoff

Data: 2026-10-20.

## Stato

- M0, M1 e M2 completati; M3–M5 **non eseguiti sui candidati** (bloccati, vedi sotto); M6 completato in forma **provvisoria** (`reports/FINAL-RECOMMENDATION.md`).
- Nessun processo o container attivo avviato da questa valutazione. Docker Desktop è spento (stato iniziale, non modificato).
- Cloni di terze parti in `<scratchpad>/clones/` (fuori da OneDrive). Possono essere cancellati senza perdita: sono ricreabili con `git clone --depth 1`.
- Nessun push, nessuna PR, nessuna spesa, nessuna credenziale usata.

## Per riprendere

1. Sbloccare gli elementi della lista qui sotto.
2. S00 sui candidati in una VM Linux o WSL2 (Warren: Bun ≥ 1.1; Gas Town: Go 1.26.2+, Dolt, bd, tmux).
3. Scrivere i test held-out di ISSUE-2…6 in `fixtures/acceptance/` prima dei run LIVE.
4. Baseline LIVE su ISSUE-1 (n≥3), poi S01–S09.

## Cosa serve (credenziali: solo nomi, mai valori)

- Docker Desktop attivo o una VM Linux dedicata.
- Budget LLM massimo e numero di run, con variabile d'ambiente per la chiave del provider scelto.
- Progetto Jira sandbox (opzionale) e token a scope minimo.
- `gh auth login` per leggere issue e release.
- Autorizzazione al push della repository (`main` non ha commit remoti verificati).

## Domande aperte

Vedi `docs/decisions.md` e il punto 10 di `reports/FINAL-RECOMMENDATION.md`.
