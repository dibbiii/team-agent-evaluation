# Team Agent Evaluation

Valutazione tecnica riproducibile di Paperclip, Paseo/Paseo Hub, OpenClaw, Warren e Gas Town, più una baseline con un solo coding agent, rispetto ai requisiti di `idea-progetto.md` (originale, non modificare). Le regole operative sono in `TEAM_AGENT_EVALUATION_INSTRUCTIONS.md`.

## Mappa

| Percorso | Contenuto |
|---|---|
| `idea-progetto.md` | Requisiti (fonte autorevole) |
| `docs/requirements/traceability.md` | Requisiti R01–R13, priorità, test |
| `docs/candidates/*.md` | Schede dei cinque candidati, con etichette DOC/CODE/TESTED/… |
| `docs/architecture-options.md`, `docs/decisions.md`, `docs/security-threat-model.md` | Analisi architetturale |
| `fixtures/seed-app/` | Fixture neutra (carrello, Node, nessuna dipendenza) |
| `fixtures/acceptance/` | Test held-out, eseguiti fuori dal workspace dell'agente |
| `fixtures/issue-catalog/` | 6 issue sintetiche (una bloccata, una ambigua, due in conflitto) |
| `fixtures/mock-integrations/` | Mock Jira con lease, eventi idempotenti, riconciliazione |
| `scripts/evaluate.mjs` | Valuta un workspace con i test held-out e scrive il JSON del run |
| `reports/` | Preflight, log, risultati, confronto, raccomandazione finale |

## Comandi

```bash
# Test della fixture (baseline: 5 test passano, il bug ISSUE-1 non è coperto dai test visibili)
(cd fixtures/seed-app && npm test)

# Test del mock Jira / queue controller (7 test)
node --test "fixtures/mock-integrations/*.test.mjs"

# Valutare un workspace modificato da un agente
node scripts/evaluate.mjs <workspace> ISSUE-1 <candidato> S01 MOCK|LIVE [modello]
```

Requisiti: Node ≥ 22. Python non è necessario.

## Regole

- I risultati MOCK non dimostrano capacità di coding autonomo.
- Quantità non misurate valgono `null`, mai valori inventati.
- Nessun segreto nel repository. I cloni di terze parti stanno fuori dalla repo.
