# ADR-001: importi in centesimi interi, arrotondamenti solo negli helper di `src/money.js`

Stato: approvata (2026-01-12)

## Contesto
Un arrotondamento sbagliato di un centesimo diventa una differenza fra fattura e incasso. In passato ogni modulo arrotondava a modo suo.

## Decisione
- Tutti gli importi sono interi in centesimi. Mai numeri decimali per i soldi.
- Gli arrotondamenti si fanno solo con gli helper di `src/money.js` (`pct` arrotonda half-up, `ceilDiv` per eccesso). Fuori da quel file non si usano `Math.round`, `Math.ceil`, `Math.floor`, `Math.trunc`, `toFixed`, `parseFloat`.
- Se serve un arrotondamento diverso, si aggiunge un helper a `src/money.js` con test.

## Conseguenze
La CI esterna controlla questa regola (`ci/rules.json`, regola `money-helpers`).
