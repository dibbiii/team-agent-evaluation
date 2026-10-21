# Calibrazione della fixture difficile (baseline: Claude Code da solo)

Data: 2026-10-21. Modello `claude-sonnet-5-5`, prompt neutro (nessuna guida a chiedere), solo Claude Code (nessun orchestratore), strumenti ristretti, test held-out lato Windows. Dati: `results/H-CAL-baseline-claude-code-*.json`; testi completi dell'agente in `results/raw/` (non versionati). Fixture e validazione: `docs/hard-fixture.md`.
Scopo: capire se la fixture difficile è **ancora al soffitto**, **troppo dura** o **iniqua**. n=1 per issue (HARD-4 due volte): **indicativo, non una misura**.

## Risultati

| Issue | Tipo | Esito | Costo (USD stimati) | Durata | Note |
|---|---|---|---|---|---|
| HARD-1 IVA coerente | implement | PASS | 0,138 | 126 s | |
| HARD-2 pagamento idempotente | implement | PASS | 0,156 | 104 s | |
| HARD-3 rimborsi parziali (parte con HARD-1 applicata) | implement | PASS | 0,415 | 245 s | la più costosa; l'agente ha segnalato di non aver toccato `pay()` perché fuori ambito |
| HARD-4 valute | implement | **FAIL** poi **PASS** | 0,262 / 0,233 | 142 / 154 s | stessa issue, due esiti diversi |
| HARD-5 prestazioni | implement | PASS | 0,141 | 102 s | |
| HARD-6 CSV con sicurezza non dichiarata | implement | PASS | 0,122 | 101 s | |
| HARD-9 refactoring a comportamento identico | implement | PASS | 0,159 | 148 s | |
| HARD-10 bus di eventi | implement | PASS | 0,116 | 107 s | |
| HARD-7 conflitto con una decisione approvata | ask | **PASS** (rivalutato a mano) | 0,029 | 43 s | non ha toccato file e ha spiegato il conflitto con ADR-002 |
| HARD-8 gift card ambigue | ask | **FAIL** | 0,190 | 110 s | ha implementato con scelte sue («da confermare») |

- **Issue da implementare:** 9 prove, 8 `PASS` (89%); tutte le 8 issue sono state superate almeno una volta. Costo medio 0,194 USD, circa **4 volte** quello delle issue facili (0,05), durate di 100–250 s.
- **Correzione del giudizio su HARD-7:** il criterio automatico (contare i punti interrogativi) l'aveva segnata `FAIL`; leggendo il testo l'agente si è comportato come desiderato. Il criterio è stato corretto (non tocca il codice **e** spiega il problema) e l'esito rivalutato a mano, con la nota nel file di risultato.

## Cosa si può dire e cosa no

1. **La fixture non è più al soffitto del 100%, ma resta facile per questo agente:** una sola prova fallita su nove. Non ha ancora il potere discriminante che cercavamo.
2. **Variabilità:** HARD-4 è fallita e poi passata con lo stesso agente e lo stesso prompt. Con n=1 una singola prova può ingannare in entrambe le direzioni. Per le issue che contano servono n≥3.
3. **La causa del primo fallimento di HARD-4 non è nota:** il workspace era stato cancellato e gli esiti registravano solo vero/falso. Non so se fosse un errore dell'agente o un test troppo rigido (le stime di fragilità di HARD-4 nel documento della fixture sono «media»). La seconda prova è passata, quindi il test non è impossibile. Da quel momento i risultati conservano le righe dei test falliti e il codice prodotto.
4. **La guida del prompt conta:** il prompt dice che le decisioni approvate sono in `docs/adr/`. Con quel riferimento l'agente ha rispettato ADR-002 (HARD-7). Non so cosa farebbe senza (non provato). Davanti a una issue ambigua senza criteri (HARD-8), invece, **implementa comunque**: come con ISSUE-5 sulla fixture facile.
5. **Costi:** il lavoro difficile costa circa 4× e dura 2–4 minuti: per un confronto con n=3 su entrambi i sistemi servono diverse unità di USD stimati.

## Conseguenze per il confronto fra sistemi

- Se anche con Warren e con gli altri candidati l'agente è lo stesso modello, ci si aspetta che la qualità del codice sia **simile**: le differenze da misurare sono operative (isolamento, recupero, costo, attribuzione, controllo), non di «intelligenza». Il benchmark attuale **non può** dimostrare un vantaggio di qualità di un orchestratore e non esercita funzioni multi-agente.
- Per misurare davvero il valore di un team di agenti servirebbe una fixture molto più grande, con lavori paralleli e parti indipendenti da coordinare, e un candidato che sappia farlo: non c'è fra quelli provati in modo semplice.

## Limiti

n=1 (HARD-4 n=2), un solo modello, un solo sistema (Claude Code da solo), tetto di 25 turni, nessuna riprova delle issue passate; HARD-9 è stata interrotta una volta dal sistema per memoria quasi esaurita (costo non registrato), poi rifatta con esito PASS; l'esito delle issue `ask` resta euristico e va letto da una persona.
