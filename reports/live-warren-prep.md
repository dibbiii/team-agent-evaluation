# Preparazione delle run LIVE di Warren (passo 3)

Data: 2026-10-21. Ambiente: distribuzione WSL2 dedicata `Ubuntu-26.04` (utente `dibbi`), isolata dal disco Windows (`scripts/wsl-isolate.sh verify` 6/6). Nessun segreto, nessun login, nessun LLM in questa fase. Esecuzione di tutti i comandi: Claude (io), con `wsl -u root` solo per `apt` e per la configurazione; il resto come `dibbi`.

## Cosa è stato installato e con quale provenienza

| Componente | Versione | Provenienza e verifica |
|---|---|---|
| git, bubblewrap | 2.53.0, 0.11.1 | già presenti nell'immagine Ubuntu 26.04 |
| curl, unzip, jq | 8.18.0, 6.00, 1.8.1 | `apt` (indirizzi IPv4 forzati) |
| Bun | 1.3.14 (come `.bun-version` di Warren) | release ufficiale GitHub `oven-sh/bun`, **SHA-256 verificato** (`sha256sum -c`: OK; il checksum viene dallo stesso repository, quindi protegge dalla corruzione e non da una compromissione) |
| Warren | 0.19.3, commit `ce088e8` | `git fetch --depth 1` del commit esatto già studiato; `git status` pulito |
| `cn`, `sd`, `ml` | canopy `latest`, seeds 0.5.13, mulch 0.10.7 | `bun add -g`, versioni come nel CI di Warren |
| Claude Code | 2.1.304 (come l'host e la baseline) | installer ufficiale `claude.ai/install.sh`, **letto per intero prima di eseguirlo** (260 righe, SHA-256 `3A68D340…A944`): scarica da `downloads.claude.ai`, verifica lo SHA-256 contro un manifest dello stesso host, poi `claude install`. Nessuna azione nascosta |

## Problemi incontrati e come sono stati risolti

1. **DNS non funzionante in WSL (globale).** `Temporary failure resolving 'archive.ubuntu.com'`; stesso difetto nella `Ubuntu` personale, quindi non causato da noi. Causa: il «DNS tunneling» di WSL (`10.255.255.254`) non risponde su questo PC. IP diretto raggiungibile (TCP 443 verso 1.1.1.1). Rimedio **solo per `Ubuntu-26.04`**, senza toccare `.wslconfig` né l'altra distribuzione: `[network] generateResolvConf=false` in `wsl.conf` e, dopo che `systemd-resolved` ha ripreso `/etc/resolv.conf`, `DNS=1.1.1.1 8.8.8.8` in `/etc/systemd/resolved.conf.d/tae-dns.conf`. Conseguenza: i nomi dei siti da cui si scarica sono visti da Cloudflare e Google.
2. **Quoting fra PowerShell, `wsl.exe` e bash.** Più tentativi con `bash -c "..."` hanno dato risultati sbagliati (variabili Windows espanse, comando troncato). Soluzione adottata: script nella repository (`scripts/live/*.sh`), copiati dentro la distribuzione dal lato Windows tramite `\\wsl.localhost\...` con fine riga LF, ed eseguiti da lì. Nessun effetto collaterale dei tentativi falliti.
3. **Passo di installazione mancante nella documentazione di Warren.** Con `bun install` e `ext:install` bastavano pochi test; mancava `bun run ui:install`. Senza, la suite dava 3 fallimenti e 2 errori (`Cannot find module '@tanstack/react-query'`). È la stessa discrepanza già segnalata in S00.
4. **Isolamento mantenuto.** Dopo le modifiche a `wsl.conf` e al DNS, `verify` è rimasto 6/6.

## Risultati verificati (TESTED)

- **`bwrap` funziona come utente normale, senza privilegi speciali**: base `exit=0`; con `--unshare-all` vede 4 processi; `/etc` in sola lettura (`Read-only file system`); con rete isolata `1.1.1.1:443` irraggiungibile (`Network is unreachable`). Nessuna restrizione AppArmor/userns presente (`unprivileged_userns_clone` e `apparmor_restrict_unprivileged_userns` assenti).
- **Warren `serve` con `WARREN_RUNTIME=local`**: `healthz` in 1,4 s, RSS 198 MB, `GET /readyz` → **200** con `bwrap: ok — "bwrap created a minimal sandbox (unshare-all + ro-bind / + exec /bin/true)"` (nelle S00 in Docker era 503 per mancanza di `bwrap`). `warren doctor` verde su tutti e tre i controlli.
- **Suite di test completa (dopo `ui:install`)**: **7.928 pass, 32 skip, 1 fail**, 105,7 s (S00 in Docker: 7.927 pass, 40 skip, 0 fail). Gli 8 test in meno saltati sono quelli che richiedono `bwrap`, ora eseguiti e passati. Gli skip rimasti sono Postgres e Kubernetes (`kubectl`, `withDb`).
- **1 fallimento residuo non diagnosticato**: `scripts/check-ui-raw-elements.plugins.test.ts` («biome produced no JSON report»). È un test dello strumento di lint della UI, non del runtime né della sandbox. In S00 il lint passava: causa non indagata (`UNVERIFIED`).

## Limiti

- Provato il controllo di salute di Warren con `bwrap` reale; **non** ancora una run con un agente: serve il login di Claude Code.
- `bwrap` è provato di per sé e tramite il controllo di Warren, non ancora sotto carico né con un agente ostile.
- WSL2 non è un confine di sicurezza forte (VM e kernel condivisi con le altre distribuzioni).
- La distribuzione dedicata ora ha rete in uscita aperta (serve per scaricare e per l'API del modello); la sandbox dell'agente invece può avere la rete isolata, da configurare in Warren.

## Prossimo passo (richiede l'utente)

Login di Claude Code con l'abbonamento, dentro la distribuzione, da terminale interattivo: vedi la spiegazione data in chat.
