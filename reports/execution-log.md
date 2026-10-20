# Execution log

## M0 — Preflight e requisiti (2026-10-20)

- Letto integralmente `idea-progetto.md`. Il documento non sceglie l'orchestratore.
- Preflight in `reports/preflight.md`. Docker daemon non attivo, quindi i test containerizzati sono `BLOCKED`.
- Creati `docs/requirements/traceability.md` e `.gitignore`.
- Limiti: nessun PDF originale, diagramma di §2 convertito in testo.

## M2 — Laboratorio (2026-10-20)

- Creati `fixtures/seed-app`, `fixtures/acceptance`, `fixtures/issue-catalog`, `fixtures/mock-integrations`, `scripts/evaluate.mjs`.
- Verifica **TESTED** (comandi nel README):
  - test visibili: 5 pass;
  - mock Jira: 7 pass (non reclama issue bloccate/ambigue, nessun doppio claim, priorità, evento duplicato, riavvio con riconciliazione lease, heartbeat);
  - `evaluate.mjs` sul baseline non corretto: held-out `FAIL`; con il fix di riferimento: `PASS`.
- Errore incontrato e risolto: `node --test <cartella>` non funziona in Node 24, ora si usa un glob.
- Limite: la fixture è piccola (3 moduli). Un solo test held-out esiste (ISSUE-1); gli altri vanno scritti prima dei run LIVE su quelle issue.

## M1 — Ricerca primaria (2026-10-20)

- Cinque ricerche in parallelo (una per candidato), solo lettura: clone `--depth 1` nello scratchpad, nessuna installazione, nessuna credenziale.
- Prodotte `docs/candidates/{paperclip,paseo-hub,openclaw,warren,gastown}.md`, tutte senza etichette `TESTED`.
- Verifica a campione da parte mia nei sorgenti: SHA dei cloni; socket Docker e `--dangerously-skip-permissions` in Warren; default `direct` del Refinery in Gas Town (confermato a `engineer.go:163`; il `mr` visto in `fields.go` riguarda un altro campo, a livello di convoy); default `true` di `dangerouslySkipPermissions` in Paperclip; `merge` in `github_publish` di OpenClaw. Tutti confermati.
- Limiti: `gh` non autenticato (issue e metriche via web, parziali); checkout Windows incompleti per Paseo e OpenClaw; `docs.paperclip.ing` non letto direttamente; Warren e Gas Town non verificabili contro un tag nel clone shallow.

## M3 — Smoke test (2026-10-20)

- **Non eseguiti** sui candidati: richiedono installazioni globali (Bun, Go, Dolt, tmux), Docker o WSL2 attivi, o credenziali. Tutti `BLOCKED`, istruzioni in `reports/HANDOFF.md`.

## M4/M5 — Prove critiche e integrazione (2026-10-20)

- Prove critiche sui candidati: `BLOCKED` (come sopra, più budget LLM e Jira sandbox).
- Integrazione: studio documentale in `docs/architecture-options.md`. L'execution adapter Paperclip→Warren non è stato studiato nel codice né prototipato. Come stima del costo di un controller di coda: 92 righe di riferimento provate (7 test), non la versione di produzione.

## M6 — Conclusione (2026-10-20)

- Scritti `reports/comparison.md`, `docs/architecture-options.md`, `docs/decisions.md`, `docs/security-threat-model.md`, `reports/FINAL-RECOMMENDATION.md`, `reports/HANDOFF.md`.
- Raccomandazione **provvisoria**, confidenza bassa. La rubrica 0–5 non è compilata per mancanza di dati sperimentali.
