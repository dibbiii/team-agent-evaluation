# Schema dei JSON di risultato (`results/*.json`)

Lo schema di base è in `TEAM_AGENT_EVALUATION_INSTRUCTIONS.md` §7. Questo documento aggiunge due campi, scritti da `scripts/evaluate.mjs`, per separare **il codice** dalla **consegna**.

## Regola

> **`status` = solo codice. La consegna si legge in `workflow_acceptance`.**

`status` (e il suo duplicato esplicito `code_acceptance`) dice solo se i test visibili e i test held-out passano sul `src/` prodotto. Non dice se il lavoro è stato consegnato: PR creata, CI verde, review approvata, ticket aggiornato.

### Perché

Nel primo run di Gas Town (`reports/s01-gastown-live.md` §11, run1) il codice era giusto (test 7/7, commit locale) ma `gt done` è rimasto bloccato: nessun push, nessuna MR, bead ancora HOOKED. Il JSON dice `status: PASS`, e chi legge solo quel campo conclude che il lavoro è stato consegnato. È un falso PASS di consegna. Lo stesso equivoco c'è nei JSON S09/S07 di Warren (F71): `PASS` indicava il codice, mentre l'esito dello scenario (per S09, il tetto di costo che non ferma la run) stava solo nel testo del report. Tenere i due piani in campi diversi evita l'equivoco e lascia `status` com'è, quindi gli script esistenti non si rompono.

## Campi aggiunti

| Campo | Valori ammessi | Significato |
|---|---|---|
| `code_acceptance` | `"PASS"` \| `"FAIL"` | Esito sul codice. Stesso valore di `status` quando `status` lo imposta `evaluate.mjs` (test visibili **e** held-out verdi). |
| `workflow_acceptance` | oggetto, vedi sotto | Esito sulla consegna. |

`workflow_acceptance`:

| Campo | Valori | Note |
|---|---|---|
| `pr_created` | `true` \| `false` \| `null` | `true` = PR/MR/branch consegnato al forge; `false` = misurato e assente. |
| `ci_status` | `"passed"` \| `"failed"` \| `"none"` \| `null` | `"none"` = nessuna CI ha prodotto un esito verificabile. |
| `review_state` | `"approved"` \| `"pending"` \| `"none"` \| `null` | `"pending"` = in attesa; `"none"` = nessuna review. |
| `tracker_updated` | `true` \| `false` \| `null` | Il ticket è stato aggiornato (es. spostato in review). |
| `delivered` | `true` \| `false` \| `null` | **Calcolato**, non si imposta a mano (vedi regola sotto). |
| `notes` | testo \| `null` | Libero (`--notes=...`). |

**`null` significa «non misurato»**, mai «no». Le quantità non misurate valgono `null` (regola del repository).

### Calcolo di `delivered`

- `false` se **almeno un** campo misurato è sfavorevole (`pr_created=false`, `ci_status` `failed` o `none`, `review_state` `pending` o `none`, `tracker_updated=false`);
- `true` solo se **tutti** i campi misurati sono favorevoli **e** `pr_created` è stato misurato;
- `null` in tutti gli altri casi (nulla misurato, oppure misurato solo ciò che è favorevole ma senza `pr_created`).

## Come si impostano

Con flag espliciti dopo gli argomenti posizionali di `evaluate.mjs` (che restano invariati):

```bash
node scripts/evaluate.mjs <workspace> ISSUE-1 <candidato> S01 LIVE [modello] \
  --pr=created|none --ci=passed|failed|none --review=approved|pending|none --tracker=updated|none --notes="testo"
```

Valori non ammessi o flag sconosciuti fanno terminare lo script con codice 2, senza scrivere nulla. La logica è in `scripts/lib/workflow-acceptance.mjs`, testata da `scripts/workflow-acceptance.test.mjs`.

## Esempi

Senza flag (comportamento di prima, consegna non misurata):

```json
"status": "PASS",
"code_acceptance": "PASS",
"workflow_acceptance": { "pr_created": null, "ci_status": null, "review_state": null, "tracker_updated": null, "delivered": null, "notes": null }
```

Codice giusto ma consegna fallita (caso Gas Town run1), con `--pr=none`:

```json
"status": "PASS",
"code_acceptance": "PASS",
"workflow_acceptance": { "pr_created": false, "ci_status": null, "review_state": null, "tracker_updated": null, "delivered": false, "notes": null }
```

Con `--pr=created --ci=passed`: `delivered` è `true`, perché tutto il misurato è favorevole e `pr_created` è misurato (review e ticket restano «non misurati»). Aggiungendo `--review=pending` diventa `false`.

## Cosa NON cambia

- `status` mantiene il significato di prima. Gli script `run-baseline.mjs`, `warren-hard-*`, `record-*` ecc. leggono il JSON, ne cambiano alcuni campi (anche `status`, per esempio `FAIL` se la run del sistema non è `succeeded`) e lo riscrivono: i nuovi campi passano intatti. Se uno script porta `status` a `FAIL` per ragioni di workflow, `code_acceptance` resta l'esito sul codice.
- I JSON storici **non** vengono modificati (sono dati sperimentali): non hanno i due campi. Per loro la consegna è annotata a mano in `docs/matrix-annotations.json` e letta da `scripts/build-matrix.mjs`; `reports/MATRIX.md` mostra «non misurato» dove manca.
- Gli script `scripts/live/*-record-run.mjs` non impostano ancora i flag di consegna: chi registra una nuova run con PR reale deve passarli a `evaluate.mjs` (o completare `workflow_acceptance` nel record).
