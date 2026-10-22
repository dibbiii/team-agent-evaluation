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
- I webhook sono stati provati su Jira reale il 2026-10-22 (vedi sotto): una regola di Automation «Transizione ticket eseguita → Invia richiesta web» verso un ricevitore locale esposto con un tunnel temporaneo.

## Esito della creazione (2026-10-21, eseguita dall'utente sul progetto KAN)
Create `KAN-4` … `KAN-9` ([ISSUE-1] … [ISSUE-6]). Il collegamento «blocca» è risultato inizialmente invertito; lo script lo ha rilevato, corretto e verificato. Confermato a vista: `KAN-7` «è bloccato da» `KAN-4`. Le issue di esempio `KAN-1`, `KAN-2`, `KAN-3` non sono state modificate. Workflow reale: Da completare [new] → In corso → In revisione → Completata [done].

## Prova S05 su Jira reale (nessun LLM, nessun costo)
```powershell
node scripts/jira-s05-live.mjs            # anteprima, nessuna rete
node scripts/jira-s05-live.mjs --apply    # esegue la prova e poi rimette tutto a posto
```
Prerequisiti: le 6 issue `tae-benchmark` devono esistere e stare tutte in «Da completare». La prova tocca solo quelle: claim per priorità, claim concorrenti senza doppioni, «In revisione» alla PR, dipendenza sbloccata solo da «Completata», riconciliazione, ticket dell'utente invariati. Alla fine ripristina stati ed etichetta `ready` e cancella i commenti e i link `example.invalid` che ha creato. Scrive `results/S05-jira-live-*.json`.
Se qualcosa va storto a metà, il ripristino parte comunque; se segnala errori di cleanup, controlla a mano le issue `KAN-4` … `KAN-9`.


## Prova dei webhook su Jira reale (2026-10-22, eseguita con l'utente)
- **Montaggio:** ricevitore locale `scripts/jira-webhook-receiver.mjs` (solo 127.0.0.1, solo POST su `/hook/<segreto>`, ogni altra richiesta 404, corpo massimo 16 KB, eventi applicati una volta sola) + tunnel temporaneo `cloudflared` (quick tunnel senza account). Regola creata dall'utente nel progetto KAN: trigger «Transizione ticket eseguita», azione «Invia richiesta Web» POST con corpo personalizzato `{"issue":"{{issue.key}}","status":"{{issue.status.name}}","ts":"{{now}}","event":"transitioned"}`.
- **Risultato (TESTED):** spostando KAN-4 da «Da completare» a «In corso» e indietro sono arrivati 2 eventi (`In Progress`, `To Do`), con ritardo di circa 0,14 s fra l'orario di Jira e quello di ricezione. Un evento rispedito a mano (come un ritentativo di Jira) è stato scartato come duplicato. Prima dell'uso reale: segreto sbagliato o richiesta GET → 404; da fuori, tramite tunnel: 200 con segreto, 404 senza. Dati: `results/S05-jira-webhook-events.jsonl`.
- **Cosa NON dimostra:** nessuna delega di lavoro scatenata dall'evento (il ricevitore registra, non guida il controller); nessuna prova di ritentativi veri di Jira né di consegna fuori ordine; nessuna autenticazione oltre al segreto nell'URL (Automation non firma il corpo); 3 richieste rifiutate con 404 di cui 1 è una mia prova, le altre 2 non identificate; il tunnel `trycloudflare` non è un'infrastruttura di produzione (URL temporaneo, nessuna garanzia).
- **Chiusura:** tunnel e ricevitore fermati; la regola in Jira va disattivata o cancellata dall'utente (l'URL contiene il segreto).
