# Preparare il Jira per il benchmark (guida passo-passo)

Stato: lo script è provato solo contro il finto Jira. **Non è mai stato eseguito su un Jira vero**: la prima esecuzione reale va fatta con l'anteprima e controllata a mano.

## Cosa fa
Crea nel progetto `KAN` le 6 issue sintetiche del benchmark (tipo "Task", con etichette `tae-benchmark`, `tae-issue-N` e, per quelle pronte, `ready`) e un collegamento "blocca" fra ISSUE-1 e ISSUE-4. Non modifica né cancella le issue esistenti (KAN-1, KAN-2, KAN-3) e non tocca altri progetti.

## 1. Crea un token API (nel tuo browser)
1. Vai su <https://id.atlassian.com/manage-profile/security/api-tokens>.
2. «Crea token API» (quello classico va bene), scegli un nome come `tae-benchmark` e una scadenza breve (7 giorni).
3. Copia il token. **Non incollarlo in chat né in un file della repository.**

Il token ha gli stessi permessi del tuo account: per questo lo script è limitato al progetto indicato e gira in anteprima finché non lo autorizzi.

## 2. Imposta le variabili nel tuo terminale (PowerShell)
```powershell
$env:JIRA_BASE_URL = "https://brainylabs-team.atlassian.net"
$env:JIRA_EMAIL    = "la-tua-email-atlassian"
$env:JIRA_API_TOKEN = "il-token-appena-creato"
$env:JIRA_PROJECT  = "KAN"
```
Valgono solo per quella finestra di terminale.

## 3. Anteprima (non scrive nulla, nessuna rete)
```powershell
node scripts/jira-seed.mjs
```
Deve elencare 6 issue. Controlla titoli, etichette e che solo ISSUE-4 risulti bloccata.

## 4. Creazione
```powershell
node scripts/jira-seed.mjs --apply
```
Alla fine deve dire `COMPLETATO: direzione dei collegamenti verificata.` Se stampa `DIREZIONE DEL LINK INATTESA`, **non proseguire**: dimmelo, perché il controller andrebbe adattato.
Lo script è idempotente: rilanciarlo non crea duplicati.

## 5. Controllo visivo in Jira
- Nella lista compaiono 6 nuove issue `[ISSUE-1] …` … `[ISSUE-6] …`.
- Aprendo `[ISSUE-4]` si legge «è bloccata da» `[ISSUE-1]`.
- ISSUE-1, 2, 3 e 6 hanno l'etichetta `ready`; ISSUE-4 e ISSUE-5 no.
- Se la priorità non risulta impostata, è normale: il campo può non accettare i valori del benchmark e lo script crea comunque senza.

## 6. A fine prova
Revoca il token dalla stessa pagina. Le issue `tae-*` si possono cancellare filtrando per l'etichetta `tae-benchmark`.

## Limiti noti
- Il controller riconosce gli stati per nome (inglese e italiano) e usa gli ID di transizione scoperti a runtime. Se il tuo workflow usa altri nomi, vanno aggiunti in `NAMES` di `fixtures/mock-integrations/queue-controller.mjs`.
- Le transizioni del tuo progetto potrebbero richiedere campi obbligatori: non verificato.
- I webhook non sono stati provati su Jira reale.

## Esito della creazione (2026-10-21, eseguita dall'utente sul progetto KAN)
Create `KAN-4` … `KAN-9` ([ISSUE-1] … [ISSUE-6]). Il collegamento «blocca» è risultato inizialmente invertito; lo script lo ha rilevato, corretto e verificato. Confermato a vista: `KAN-7` «è bloccato da» `KAN-4`. Le issue di esempio `KAN-1`, `KAN-2`, `KAN-3` non sono state modificate. Workflow reale: Da completare [new] → In corso → In revisione → Completata [done].

## Prova S05 su Jira reale (nessun LLM, nessun costo)
```powershell
node scripts/jira-s05-live.mjs            # anteprima, nessuna rete
node scripts/jira-s05-live.mjs --apply    # esegue la prova e poi rimette tutto a posto
```
Prerequisiti: le 6 issue `tae-benchmark` devono esistere e stare tutte in «Da completare». La prova tocca solo quelle: claim per priorità, claim concorrenti senza doppioni, «In revisione» alla PR, dipendenza sbloccata solo da «Completata», riconciliazione, ticket dell'utente invariati. Alla fine ripristina stati ed etichetta `ready` e cancella i commenti e i link `example.invalid` che ha creato. Scrive `results/S05-jira-live-*.json`.
Se qualcosa va storto a metà, il ripristino parte comunque; se segnala errori di cleanup, controlla a mano le issue `KAN-4` … `KAN-9`.
