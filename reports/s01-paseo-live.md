# S01 - Paseo (daemon) e Paseo Hub, run LIVE con Claude Code reale

Data: 2026-10-21 (UTC circa 15:00-15:20, piu' una fase di sola lettura/sonde prima). Modalita' `LIVE` per le run
dell'agente, `MOCK`/a costo zero per la superficie di controllo. Dati: `results/S01-paseo-live-7085fe27.json`,
`results/S01-paseo-live-6eb3b3ed.json`. Etichette: **TESTED** = eseguito qui con comando e risultato; **CODE** =
letto nel sorgente (clone `getpaseo/paseo` tag v0.12.0, commit `cafe4b0`; clone `getpaseo/hub` tag v0.10.0, commit
`28f6c78`), non eseguito; **UNVERIFIED/BLOCKED** = non provato.

## Esito in breve (le 5 parti)

| Parte | Esito |
|---|---|
| 1. Lettura di come Paseo lancia l'agente + sonde a costo zero | **FATTO**: il daemon lancia il binario via `spawnClaudeCodeProcess` della SDK; il campo `agents.providers.claude.command` (array) sostituisce l'intero comando (CODE+TESTED). Confinabile: **SI**, con un wrapper esterno sostituito via `command` |
| 2. Run LIVE su ISSUE-1, dentro bwrap | **FATTO**: 2 run (c1, c2), entrambe **PASS** (test visibili e held-out), modello `claude-sonnet-5-5` confermato dal daemon, `bypassPermissions` |
| 3. Valutazione lato Windows | `node scripts/evaluate.mjs <cartella> ISSUE-1 paseo-live S01 LIVE claude-sonnet-5-5`: PASS, PASS |
| 4. Pulizia | verificata (sez. 8) |
| 5. Documentazione | questo report e `docs/candidates/paseo-hub.md` |

**Finding da dichiarare esplicitamente** (richiesto dal coordinatore, sez. 4.3): il daemon passa **in chiaro, nell'ambiente
del processo che lancia** (sia l'agente `claude` principale sia il sotto-processo `claude-haiku-5-5` usato per i
metadati), le variabili **`PASEO_HOME` e `PASEO_PASSWORD`** con cui il daemon stesso era stato avviato, insieme a
`PASEO_AGENT_ID`/`PASEO_AGENT_CWD`. Questo e' **TESTED** (osservato passivamente nel log del mio wrapper, che registra
solo i *nomi* delle variabili ricevute prima di azzerarle con `env -i`) e **CODE** (confermato in
`provider-launch-config.ts`: `createProviderEnvSpec` toglie solo 4 variabili di sessione Claude
(`PARENT_SESSION_ENV_VARS`), non `PASEO_*`; `createProviderEnv` usa come `baseEnv` di default `process.env`, cioe'
l'intero ambiente del processo daemon). **Non ho eseguito** nessuna azione che sfrutti questo (nessuna lettura della
password dall'interno della sandbox, nessuna chiamata al daemon con quella password da un agente): mi sono fermato
all'osservazione passiva, come richiesto. Implicazione CODE (non dimostrata): un agente con accesso a Bash e senza un
wrapper che ripulisca l'ambiente (cioe' l'uso "di fabbrica" di Paseo, senza `command` personalizzato) potrebbe leggere
`PASEO_PASSWORD` con un semplice `env` e usarla per parlare al daemon con gli stessi permessi del processo CLI che lo
ha avviato (stesso genere di rischio della riprova #16935 di Paperclip, ma qui a livello di variabili d'ambiente
anziche' di configurazione HTTP).

## 1. Come Paseo lancia l'agente (CODE, poi verificato con sonde a costo zero)

- Il motivo per cui l'analisi del codice viene prima di tutto (lezione di Paperclip): Paseo (a differenza di
  Paperclip/`claude_local`) **non ha un motore alternativo (ACP) che bypassi `command`** per il provider `claude`:
  CODE in `packages/server/src/server/agent/providers/claude/agent.ts` e `query.ts`. Il percorso e':
  `resolveProviderLaunch({ commandConfig: runtimeSettings?.command, defaultBinary: "claude" })` risolve il comando
  (di fabbrica: cerca `claude` nel PATH del daemon; con un override: usa l'array `command` cosi' com'e', primo elemento
  = binario, resto = argomenti anteposti). Il child process e' creato da `spawnClaudeCodeProcess` (passato alla SDK
  `@anthropic-ai/claude-agent-sdk`, `query()`), che in `query.ts` chiama `spawnProcess(command, args, {env, stdio,
  shell:false, ...})`: **nessuna shell**, **nessun motore che ignori l'override** (diverso da Paperclip, dove
  `engine:"acp"` ignorava `command`). Il campo `command` e' quindi, da codice, un punto di confinamento solido: se si
  sostituisce con un wrapper, **ogni** lancio del provider `claude` (agente principale, sotto-processo di generazione
  metadati, scoperta modelli, `--version`, `auth status`) passa per quel binario.
- Configurazione usata: `~/.paseo/config.json` -> `agents.providers.claude.command: ["/home/dibbi/bin/ps-sandboxed"]`
  (vedi `public-docs/custom-providers.md`, sezione "Custom binary"; CODE confermato in
  `packages/protocol/src/messages.ts`, `MutableDaemonConfigSchema.providers`). Il wrapper (`scripts/live/paseo-claude-sandboxed.sh`,
  installato come `~/bin/ps-sandboxed`, NOME diverso da `claude`) esegue il vero Claude Code 2.1.306 dentro
  `bwrap --unshare-all --share-net --die-with-parent --uid 1000 --gid 1000`, con gli stessi montaggi di
  Warren/Paperclip (`/usr /etc /lib* /bin /sbin /opt` in sola lettura, Node 24, `~/.local/share/claude`,
  `~/.local/bin`), workspace in lettura/scrittura, **HOME della sandbox persistente per workspace**
  (`~/ps-sbhome/<nome>`, necessaria perche' il daemon puo' riusare la stessa `cwd` per piu' invocazioni dello stesso
  agente: la cartella delle sessioni Claude deve restare la stessa tra una chiamata e l'altra). Il file di credenziali
  e' copiato con `cp` (mai letto) solo quando il `cwd` e' sotto `~/ps-ws/` (lancio reale), **non** nelle sonde/probe del
  daemon (scoperta modelli, `--version`): per quelle uso una HOME e una cartella di lavoro temporanee e vuote, **senza
  credenziali**.
- **Sonda a costo zero del wrapper** (`ps-sandboxed --tae-check scripts/live/paseo-sandbox-check.sh`, senza credenziali,
  daemon spento): uid 1000, HOME `/home/sandbox`; DNS e HTTPS verso `api.anthropic.com` funzionanti (serve
  all'agente); `~/.claude`, `~/.claude/.credentials.json`, `~/ps-home`, `~/ps-pass`, `~/ps-hub-data`,
  `~/decoy-secret.txt`, `~/ps-src` **assenti** dentro la sandbox (solo `~/ps` visibile, montato in sola lettura perche'
  serve al client Node per le sonde); scrittura fuori dal workspace riuscita solo su tmpfs effimero (verificata assente
  sull'host dopo); `/etc`, `/usr` in sola lettura; `npm test` (7/7) e `claude --version` funzionano dentro la sandbox;
  nessun processo in `/proc` oltre ai 5 attesi.
- **Diagnostica del provider** (`paseo provider diagnostic claude`, CODE+TESTED): conferma `Command source: override`,
  `Configured command: /home/dibbi/bin/ps-sandboxed`, `Resolved path` uguale, `Version: 2.1.306 (Claude Code)` (letto
  dal wrapper, non dal vero `claude` non confinato: il check sul formato `"X.Y.Z (Claude Code)"` in
  `resolveClaudeCodeVersion` impedisce che un wrapper "muto" si spacci per una versione valida), `Auth: {"loggedIn":
  false, ...}` (dentro la HOME vuota della sonda, corretto: nessuna credenziale li').
- **Il daemon NON scarica modelli vocali di default in questo setup**: ho disattivato `features.dictation/voiceMode`
  fin dalla configurazione (lezione di S00), quindi non ho ripetuto la verifica del download; CODE conferma che il
  percorso e' lo stesso osservato in S00 (`sherpa/model-catalog.ts`).

## 2. Cosa puo' cambiare un agente/client (superficie di controllo, letture CODE + 2 sonde passive)

Eseguite **solo** letture di configurazione e una modifica-e-ripristino immediato della config del daemon, fatte da me
dall'esterno (non dall'agente), con il daemon avviato **senza password** (`DAEMON_NOPASS=1`, solo per questa sonda, mai
usato per le run reali): dimostrano cosa un client qualunque puo' fare **se conosce la password** (o se non c'e'), non
un'azione dell'agente durante una run.

| Prova | Esito |
|---|---|
| Connessione WebSocket al daemon senza password (con `PASEO_PASSWORD` impostata all'avvio) | **rifiutata**: `Password required` (TESTED) |
| Stessa connessione con il daemon avviato senza password | **riuscita** (coerente con la doc: "anyone who can reach the daemon... can connect" senza password) |
| `get_daemon_config` (lettura) | riuscita: espone `providers.claude.command` per intero |
| `set_daemon_config_request` con `providers.claude.command=["/bin/true"]`, poi ripristino al valore originale | **ACCETTATA entrambe le volte** (permesso `daemon.manage`, CODE in `operation-permissions.ts`); confermo che il meccanismo di confinamento (`command`) e' **una config del daemon modificabile da chiunque abbia accesso WS con permesso `daemon.manage`**, non un parametro immutabile all'avvio |
| `create_terminal` con `command`/`args` arbitrari su un workspace aperto | **ACCETTATA**: ho fatto scrivere `id` e `uname -n` in un file sull'host (`/home/dibbi/ps-escape-marker.txt`), eseguito **fuori da bwrap**, con l'uid del processo daemon. Confermato: il terminale di Paseo e' un'esecuzione host piena, non sandboxata da Paseo stesso (coerente con `security.md`: "Hub/Paseo non sandboxano il processo del provider"; qui vale anche per i terminali) |
| Lettura dell'ambiente del processo spawnato (vedi finding in testa) | `PASEO_HOME`/`PASEO_PASSWORD` presenti (TESTED passivo + CODE) |

**Chi puo' fare queste cose**: chiunque si connetta al WS del daemon con la password giusta (o senza, se non e'
impostata) e con permesso `daemon.manage`/`workspace.write` per quella sessione. Un **agente** in esecuzione
**non** ha di per se' un canale verso il WS del daemon a meno che (a) gli sia dato accesso di rete al socket
`127.0.0.1:6767` (nel mio wrapper la rete e' condivisa, quindi **raggiungibile**, verificato con la sonda:
`127.0.0.1:6767 raggiungibile`, `/api/status` **200** quando il daemon gira senza password) e (b) conosca o non serva
la password. **Non ho fatto eseguire all'agente reale** nessuna di queste richieste (ne' la patch della config ne' il
terminale): sono state fatte da me, da fuori la sandbox, con lo stesso client Node (`@getpaseo/client`) montato in
sola lettura nel wrapper **solo per la modalita' di verifica** (`--tae-check`), mai nella modalita' di lavoro reale.
Il rischio CODE (non dimostrato, vedi finding in testa) e' che un agente con Bash **e** la password nell'ambiente
**e** raggiungibilita' di rete verso il daemon **potrebbe** fare la stessa cosa da solo; con la mia configurazione
(password impostata, wrapper che azzera l'ambiente con `env -i` prima di eseguire il vero `claude`) l'agente **non**
ha mai ricevuto la password ne' le altre variabili `PASEO_*` (solo `CLAUDE_CODE_*`/`CLAUDE_AGENT_*`/`TZ`, verificabile
riga per riga nel log del wrapper).

### Autenticazione del daemon/Hub: chi puo' collegarsi

- **Daemon**: nessuna password di default (`PASEO_PASSWORD is not set`, come gia' in S00); con password, bearer
  HTTP/WS; `/api/health` sempre esente. **Ho impostato una password casuale** per tutte le run reali (sez. 3).
- **Hub**: ho avviato anche Hub v0.10.0 (stesso sorgente di S00) per leggere/validare un trigger (vedi sez. 2.1), ma
  **non l'ho usato per dispatciare le run LIVE** (ho usato il daemon direttamente via `createAgent`, piu' semplice e
  meno rischioso: una sola rete di comunicazione in meno). Login owner bootstrap, cambio password obbligatorio,
  creazione di una chiave API organizzativa con i 5 scope pubblici (TESTED, stesso flusso di S00). `paseo hub connect
  --permission hub.execute`: connesso, `hub.execute` concesso (TESTED).

### 2.1 Trigger nuovi con provider reale (parzialmente provato, poi non usato per la run)

Ho validato (zero costo, nessun agente invocato) un trigger `manual.run` self-contained con `agent: {provider: claude,
model: claude-sonnet-5-5, mode: bypassPermissions}` contro il daemon connesso: `POST /api/v1/triggers/validate` ->
**200** `{"name":"tae-issue-1","valid":true}` (TESTED). Questo dimostra che, **a differenza di S00** (dove il daemon
non aveva un provider reale e tutto cio' che restava era `hub-e2e`), con il provider `claude` reale configurato i
trigger nuovi dell'Hub **passano la validazione**. Non ho proseguito con `install`/`dispatch` via Hub: ho preferito il
percorso piu' diretto (CLI/client contro il daemon) per la run vera, per ridurre la superficie (un server in meno
acceso, meno tempo con credenziali in memoria). Il dispatch via Hub resta quindi **CODE+validato**, non **eseguito**.

## 3. Run LIVE su ISSUE-1

Comando (equivalente a `paseo run --provider claude --model claude-sonnet-5-5 --mode bypassPermissions --cwd
~/ps-ws/<nome> "<prompt>"`, fatto con `@getpaseo/client` per leggere l'intero snapshot finale):
`scripts/live/paseo-run.mjs <nome> ISSUE-1 <workspace>`. Fixture: stesso bare repo locale di Warren/Paperclip
(`scripts/live/fixture-setup.sh`), stesso prompt di `scripts/run-baseline.mjs`, nessun test held-out visibile
all'agente. Daemon avviato **con password** (`~/ps-pass`, casuale, 600, mai stampata), provider `claude` = wrapper
bwrap. Prima di ogni run: processi/porte controllati, RAM libera dell'host 5,8 GB (c1) e 5,7 GB (c2), ben sopra la
soglia di 1500 MB.

| Run | Workspace | Esito Paseo | Test visibili/held-out | Durata (createdAt->updatedAt) | Costo riportato (listino) | Token (input/output/cache) | Commit |
|---|---|---|---|---|---|---|---|
| c1 | ws1 | `idle` (= successo), `requiresAttention: finished` | PASS / PASS | 12,285 s | 0,0732094 USD | 6 / 1.038 / 58.614 | nessuno |
| c2 | ws2 | `idle` (= successo), `requiresAttention: finished` | PASS / PASS | 12,289 s (misura del mio script, start del wait a stop) | 0,0720035 USD | 6 / 952 / 58.555 | nessuno |

Totale stimato a listino: **0,1452 USD** su un tetto di 1,5 USD; 2 run con l'agente vero su un massimo di 3 concesso
(la terza non e' stata usata: vedi sez. 4 per cosa ho verificato al suo posto, a costo zero). Modello confermato da
`runtimeInfo.model`/`modelUsage` del daemon: `claude-sonnet-5-5` (esplicito in `--model`, coerente con
`.claude/settings.json` del repository di fixture). `currentModeId`/`runtimeInfo.modeId`: `bypassPermissions`
(equivalente del `--dangerously-skip-permissions` di Paperclip/Warren; **nessun motore ACP ne' bypass del wrapper**:
confermato dal log del wrapper, 2 invocazioni "work" per run, entrambe dentro bwrap, piu' un sotto-processo
`claude-haiku-5-5` con `--permission-mode default` usato **solo** per generare titolo/metadati, anch'esso dentro
bwrap). Qualita' del codice: c1 usa `Math.round(amount*(100-percent)/100)`, c2 usa aritmetica intera
`Math.floor((amount*(100-percent)+50)/100)`; entrambe aggiungono test equivalenti a quelli di Paperclip/Warren per lo
stesso ISSUE-1. **Nessun commit, nessuna PR**: il workspace resta con le modifiche non committate (coerente con "Paseo
manages agents, it doesn't commit for you": e' il daemon puro, senza l'automazione di Hub che potrebbe far aprire una
PR via un passo `github`).

### 3.1 Avvio, cosa succede a fine run, multi-agente/dispatch

- **Avvio**: dalla creazione dell'agente (`createAgent`) lo stato passa a `running` entro la stessa richiesta
  (nessuna latenza di polling come in Paperclip); il prompt iniziale e' gia' incluso nella richiesta di creazione
  (`initialPrompt`), niente "assegnazione" separata.
- **Fine run**: stato terminale `idle` (non "succeeded"/"failed" come Paperclip: Paseo modella l'agente come una
  sessione persistente che torna a riposo, non come un job che termina), `requiresAttention: true`,
  `attentionReason: "finished"`. **Nessuna continuazione automatica osservata** (diversamente da Paperclip): l'agente
  resta `idle` e non riparte da solo. Nessun secondo processo avviato (wrapper: 2 invocazioni "work" per run, come
  atteso: la SDK Claude puo' riavviare il processo tra un turno e l'altro dello stesso agente).
- **Multi-agente/dispatch**: non provato in questa fase (nessun subagente, nessun `send_agent_prompt`, MCP Paseo
  disattivato per gli agenti: `daemon.mcp.injectIntoAgents=false` nella mia config, per ridurre la superficie); CODE
  (sez. 6 della scheda) conferma l'esistenza del meccanismo ma resta UNVERIFIED in LIVE.
- **Worktree**: non provato (workspace locale semplice, non isolato); CODE conferma `worktree.mode` esiste per
  `createAgent`/trigger Hub.

### 3.2 Persistenza e ripresa dopo riavvio del daemon (TESTED)

Dopo le 2 run (entrambe gia' `idle`), ho fermato e riavviato il daemon (`paseo-server.sh daemon stop; ... start`,
stesso `PASEO_HOME`) e ho riletto l'agente c1 con `fetchAgent`:

- **Prima del riavvio**: `status: "idle"`, `lastUsage` presente (i valori di sez. 3).
- **Dopo il riavvio**: `status: "closed"` (non piu' `idle`); `lastUsage` **assente** dalla risposta (il contatore di
  costo/token dell'ultima esecuzione non sopravvive al riavvio nello snapshot restituito, anche se l'agente stesso
  si'); **sopravvivono**: `id`, `provider`, `cwd`, `workspaceId`, `model`, `runtimeInfo.sessionId` (lo stesso ID di
  sessione Claude), `persistence.nativeHandle` (= lo stesso `sessionId`: la sessione Claude Code sottostante e'
  teoricamente riprendibile tramite quell'handle, ma non ho provato a riprenderla con un nuovo prompt: fuori budget).
  `createdAt`/`updatedAt`/`title`/`currentModeId` invariati. Nessun errore di connessione dopo un breve ritardo
  (il primo tentativo subito dopo l'avvio ha dato `503` transitorio, risolto al secondo tentativo ~pochi secondi
  dopo: il daemon non era ancora pronto a servire WS, pur rispondendo gia' 200 su `/api/health`).
- **Interpretazione**: la persistenza e' dello **stato dell'agente** (metadati, non il contatore di spesa
  dell'ultima run), in linea con quanto gia' osservato per Hub in S00 (stato dei run persistito, ma non tutto
  sopravvive a un riavvio senza perdite). Non ho provato un riavvio **durante** una run in corso (richiederebbe un
  prompt che tenga l'agente occupato oltre la finestra di riavvio: non fatto, per restare dentro 3 run e il tetto di
  spesa; la run piu' breve possibile con un prompt reale dura gia' solo 12 s, difficile da intercettare a meta' senza
  un prompt apposito che si discosti dal prompt standard del benchmark).

## 4. Valutazione lato Windows

```powershell
node scripts\evaluate.mjs <cartella-estratta> ISSUE-1 paseo-live S01 LIVE claude-sonnet-5-5
```

Esportazione con `scripts/live/paseo-export.sh <workspace> <tag>` (tar di `package.json`, `src/`, `test/`, **senza**
`.claude/` ne' `.git`; verificato `.claude/settings.json` presente nel ramo ma escluso dal tar). Esito: **PASS, PASS**
(`visible_tests` e `heldout_acceptance` true per entrambe le run). File completati a mano (vedi sez. 7, errore di
sequenza) con i dati di costo/token/durata letti dalla console durante l'esecuzione, non da un file `paseo-record-run.mjs`
dedicato (non scritto: con solo 2 run e campi semplici ho preferito modificare direttamente il JSON di `evaluate.mjs`,
dichiarando la fonte in `notes`). `results/budget-ledger.json` **non toccato**.

## 5. Differenze dal comportamento predefinito di Paseo

1. **Provider override** (`agents.providers.claude.command`) al posto del `claude` di sistema: necessario per il
   confinamento, nessun motore alternativo lo bypassa (diverso da Paperclip).
2. **Password del daemon impostata** (di fabbrica assente): necessaria perche' senza password chiunque raggiunga la
   porta si collega (verificato in sez. 2); il bootstrap di fabbrica di Paseo **non** la richiede.
3. **`daemon.mcp.injectIntoAgents: false`** (di fabbrica gia' `false`): lasciato cosi', non e' una deviazione ma una
   scelta di default che riduce la superficie (nessun tool Paseo esposto all'agente).
4. **`features.dictation`/`voiceMode` disattivati**: di fabbrica attivi, disattivati per evitare il download di ~814 MB
   di modelli vocali osservato in S00 (irrilevante per un worker headless).
5. **Relay disattivato**: gia' il default per le home nuove (`daemon.relay.enabled: false`), confermato qui.
6. **Dispatch diretto (client/CLI) invece che via Hub**: scelta per questa fase (sez. 2.1); il percorso via Hub resta
   CODE+validato ma non eseguito in LIVE.

## 6. Confronto con Warren/Paperclip/baseline (NON isolato)

| | Baseline (solo Claude Code) | Warren (ISSUE-1, n=3) | Paperclip (ISSUE-1, n=2) | **Paseo (ISSUE-1, n=2)** |
|---|---|---|---|---|
| Esito | PASS | 3/3 PASS | 2/2 PASS | **2/2 PASS** |
| Costo per run (listino) | ~0,05 USD (media tutte le issue) | 0,0945 (0,0839-0,1085) | 0,0667 / 0,1566 (con continuazione) | **0,0732 / 0,0720** |
| Durata | n/d | 13,0-17,1 s | 13,3 s (c1); 28,0 s (c2, con continuazione) | **12,3 s / 12,3 s** |
| Continuazione automatica | no | n/d | si' (Paperclip ne accoda una seconda) | **no (osservato)** |
| Commit/PR | no | commit + PR finta | nessuno | **nessuno** |
| Multi-server coinvolti | 1 (CLI) | 1 (Warren) | 1 (Paperclip) + 1 wrapper | **1 (daemon)**, Hub acceso ma non usato per il dispatch |

Confronto **non isolato** (versioni diverse di Claude Code: 2.1.306 qui come in Paperclip, 2.1.304 nella baseline e
in Warren; strumenti e prompt di sistema diversi per prodotto; n piccolo, 1 sola issue facile, effetto soffitto: tutti
passano). Il costo e la durata di Paseo sono i piu' bassi e i piu' stabili fra i tre candidati provati finora (nessuna
continuazione automatica che raddoppi la spesa, a differenza di Paperclip), ma **nessuna differenza di qualita' del
codice e' dimostrata** con questo campione.

## 7. Limiti, errore di processo da dichiarare, e non provato

- **Errore di sequenza (da dichiarare)**: ho eseguito la pulizia (rimozione di `~/ps-run-c1.json`/`~/ps-run-c2.json`
  dalla distribuzione) **prima** di copiarli in `results/raw/` sul lato Windows. I valori riportati in questo report e
  nei JSON di risultato sono stati trascritti **dall'output di console** catturato durante l'esecuzione (non perduti:
  lo stdout del comando include gia' `lastUsage` per intero), ma non esiste piu' un file grezzo allegato in
  `results/raw/` per queste due run, e per c2 non ho un timestamp ISO preciso di inizio/fine (solo la durata misurata
  dallo script). Correzione per la prossima volta: copiare sempre il file grezzo **prima** di qualunque pulizia.
- **Nessuna run attraverso un riavvio del daemon** (solo dopo, ad agenti gia' finiti): vedi sez. 3.2.
- **Nessun multi-agente, nessun worktree, nessun dispatch via Hub eseguito** (solo validato): vedi sez. 3.1, 2.1.
- **Il finding su `PASEO_PASSWORD`/`PASEO_HOME` nell'ambiente non e' stato sfruttato**: nessuna prova che un agente
  possa davvero leggerle e usarle (per farlo avrebbe dovuto girare senza il mio wrapper che azzera l'ambiente, cioe'
  nella configurazione "di fabbrica" di Paseo: non l'ho provato, su istruzione esplicita di non eseguire sonde che
  modificano permessi/comando di lancio o che dimostrino l'uscita dalla sandbox).
  **Nessuna esecuzione di Claude Code fuori da bwrap in questa fase**, fatta eccezione per: (a) il CLI `paseo` stesso
  (Node, non Claude Code, mai dentro bwrap: e' lo strumento di controllo, non l'agente) e (b) il client WS Node usato
  per le sonde a costo zero (stesso discorso). Nessun incidente come quello di Paperclip (motore ACP sull'host): qui
  non esiste un motore alternativo che bypassi `command`.
- **Solo ISSUE-1** (facile), n=2: nessuna generalizzazione: stessa riserva di Warren/Paperclip.
- **Hub**: avviato e usato solo per leggere RBAC/validazione (gia' S00) e per validare un trigger nuovo con provider
  reale (sez. 2.1); non ripetuti i test di crash/coda/SIGTERM di S00 con un agente vero (restano quelli di S00, con
  l'agente finto).
- Costi: stime a listino con abbonamento Team, non una fattura.

## 8. Pulizia verificata

Rimossi per nome esatto (solo sotto `$HOME`): `~/ps-ws`, `~/ps-fixture`, `~/ps-sbhome`, `~/ps-home`, `~/ps-hub-data`,
`~/ps-fake-home`, `~/ps-probehome.*`, `~/ps-probecwd.*`, `~/ps-pass`, `~/ps-hub-key`, `~/ps-prompt-ISSUE-1.txt`,
`~/ps-trigger-*.json`, `~/ps-daemon.pid`, `~/ps-hub.pid`, `~/ps-daemon.log`, `~/ps-hub.log`, `~/ps-wrapper.log`,
`~/ps-escape-marker.txt`, `~/ps-run-c1.json`, `~/ps-run-c2.json`, `~/out/ps-c1.tar`, `~/out/ps-c2.tar`. **Mantenuti**
(installazione riusabile, come per Paperclip): `~/ps` (npm install di `@getpaseo/cli@0.12.0`, 794 MB), `~/ps-src`
(clone di sola lettura `getpaseo/paseo` tag v0.12.0 e `getpaseo/hub` tag v0.10.0 con `hub/dist` compilato, 915 MB),
`~/bin/ps-sandboxed`, script `~/paseo-*`. Verifiche finali: nessun processo `node`/`claude`/`bwrap`/`paseo` (`ps`),
nessuna cartella `~/ps-probehome.*`/`~/ps-sbhome`, `find /home/dibbi -name .credentials.json -not -path
/home/dibbi/.claude/.credentials.json` vuoto, `~/.claude/.credentials.json` ancora `-rw-------` e mai letto/stampato,
porte in ascolto solo `10.255.255.254:53` (DNS di WSL). Windows: cartelle temporanee di valutazione in
`%TEMP%\tae-ps-c1*`, `tae-ps-c2*` (fuori dalla repo, non pulite esplicitamente ma gia' fuori dal perimetro tracciato).
`results/budget-ledger.json` non toccato; nessun commit, nessun push.

## 9. Dichiarazione: ogni volta che Claude Code e' girato fuori da bwrap

**Mai**, in questa fase. Le uniche esecuzioni fuori da bwrap sono state: il CLI `paseo` (Node puro, usato per
`status`/`provider diagnostic`/`hub connect`), lo script Node con `@getpaseo/client` per le run e le sonde (Node puro,
mai Claude Code), e il daemon/Hub stessi (Node, mai Claude Code). Non si e' verificato l'incidente di Paperclip (motore
alternativo che ignora il wrapper): per il provider `claude` di Paseo non esiste un simile motore alternativo (sez. 1).

## 10. Comandi (riproduzione)

```powershell
$env:WSL_UTF8 = "1"
powershell -NoProfile -File scripts\live\paseo-deploy.ps1
wsl -d Ubuntu-26.04 -u dibbi --cd /home/dibbi -- bash paseo-setup.sh ws1 ISSUE-1
wsl -d Ubuntu-26.04 -u dibbi --cd /home/dibbi -- bash paseo-server.sh daemon start
wsl -d Ubuntu-26.04 -u dibbi --cd /home/dibbi/ps -- node paseo-run.mjs c1 ISSUE-1 ws1
wsl -d Ubuntu-26.04 -u dibbi --cd /home/dibbi -- bash paseo-export.sh ws1 ps-c1
node scripts\evaluate.mjs <cartella-estratta> ISSUE-1 paseo-live S01 LIVE claude-sonnet-5-5
wsl -d Ubuntu-26.04 -u dibbi --cd /home/dibbi -- bash paseo-server.sh daemon stop
# pulizia: vedi sez. 8 (rm -rf per nome esatto, solo sotto $HOME)
```
