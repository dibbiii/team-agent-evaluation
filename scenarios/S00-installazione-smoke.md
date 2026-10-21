# S00 — Installazione e smoke test

Stato: **FATTO** per i cinque candidati, ma l'esito è `PARTIAL` per tutti (nessun candidato ha completato il percorso ufficiale di avvio con agenti reali nei container di S00). Etichette: TESTED = provato qui con comando e risultato; CODE/DOC = letto; BLOCKED = impedito.

## ID e obiettivo
- **ID:** S00. **Requisiti collegati:** R11.1, R11.2 (traceability).
- **Obiettivo (§6):** installare il candidato alla revisione scelta, avviare dashboard/API/CLI e un'esecuzione minimale, verificare configurazione, storage, log, startup/shutdown e cleanup; registrare tempi, risorse, errori, passaggi manuali. Nessun provider a pagamento prima dell'approvazione.

## Setup e condizioni iniziali
- Modalità `MOCK` (nessun LLM, nessuna credenziale, costo 0).
- Un container alla volta, nome `tae-<candidato>-s00`, label `tae=1`, non privilegiato: 2 GiB di memoria, 2 CPU, 512 PID, `CapDrop=ALL`, `no-new-privileges`, utente non root, nessun mount, nessun socket Docker, nessuna porta pubblicata (verifica con `docker inspect` in ciascun `reports/s00-*.md`, sezione 2).
- Versioni provate: Paperclip sorgente `05f7079` e release npm `2026.1012.0`; Paseo daemon v0.12.0 (`cafe4b0`) e Hub v0.10.0 (`28f6c78`); OpenClaw release npm 2026.10.5 (sorgente studiato `6beb671`, non coincide); Warren 0.19.3 (`ce088e8`); Gas Town `649b832` (`reports/comparison.md`, tabella versioni).
- Seconda passata, fuori da Docker: distribuzione WSL2 dedicata `Ubuntu-26.04` (vedi `reports/preflight.md` §9 e `reports/live-warren-prep.md`).

## Input
Nessuno (solo installazione e avvio). Dipendenze scaricate dai registri pubblici (rete in uscita aperta nei container di S00).

## Comandi e script reali
- Procedure e comandi esatti per candidato: `reports/s00-warren.md`, `reports/s00-paperclip.md`, `reports/s00-gastown.md`, `reports/s00-paseo-hub.md`, `reports/s00-openclaw.md`.
- Isolamento della distribuzione WSL: `scripts/wsl-isolate.sh` (`apply` come root, poi `verify` come utente; atteso 6/6 PASS).
- Preparazione Warren in WSL: `scripts/live/deploy-to-wsl.ps1`, `scripts/live/warren-setup.sh`, `scripts/live/warren-boot-check.sh`.
- Installazione degli altri in WSL (usate poi da S01): `scripts/live/paperclip-install.sh`, `scripts/live/paseo-deploy.ps1`, `scripts/live/openclaw-install.sh`, `scripts/live/gastown-install.sh` + `scripts/live/gastown-build.sh`.
- Prova di rete e DNS dentro la sandbox, a costo zero: `scripts/live/sandbox-net-check.sh`.

## Risultati attesi
Il candidato parte, risponde a un health check, esegue un'esecuzione minimale senza LLM, si ferma con SIGTERM e si riavvia sullo stesso storage; il cleanup lascia 0 risorse `tae-`.

## Teardown
`docker ps -a --filter label=tae=1 -q` deve essere vuoto; dopo ogni prova verificati 0 container `tae-`, immagini invariate (17=17) e il database dell'utente intatto (`reports/execution-log.md`, 2026-10-20/21). In WSL: `scripts/live/*-cleanup.sh` per nome esatto, solo sotto `$HOME` (per esempio `scripts/live/paperclip-cleanup.sh`).

## Esito per sistema

| Sistema | Esito | n | Dati misurati | File |
|---|---|---|---|---|
| Paperclip | `PARTIAL` | 1 | server headless con `tsx`: `/api/health` 200 in 14-22 s; run con adapter `http` OK in 1,3 s; SIGTERM in 240-425 ms con dati persistiti; `pnpm install` OOM alla prima prova (exit 137) e OK con concorrenza ridotta (1.351 pacchetti, 44 s); `pnpm dev` richiede `cargo`; `vite build` e typecheck di `packages/db` in OOM a 2 GiB | `reports/s00-paperclip.md`, `results/s00-paperclip-8301e0b4.json` |
| Paseo + Hub | `PARTIAL` | 1 | daemon: `/api/health` 200, bootstrap 93 ms, SIGTERM in 2,6 s; Hub: build 66 s (picco ~1,7 GiB), avvio 9-10 s a freddo; test del repo Hub 1.079 pass, 108 non eseguiti per assenza di Docker | `reports/s00-paseo-hub.md`, `results/s00-paseo-hub-5cfde00d.json` |
| OpenClaw | `PARTIAL` | 1 | `npm install` 344 pacchetti, 619 MB; Gateway pronto in 19,5 s (freddo) e 24,3 s (riavvio); SIGTERM in 1,4 s e 0,8 s con persistenza; 658 test di `gateway-protocol` PASS; test del Workboard in OOM a 2 GiB | `reports/s00-openclaw.md`, `results/s00-openclaw-bdccd84b.json` |
| Warren | `PARTIAL` | 1 (Docker) + 1 (WSL) | Docker: 7.927 pass, 40 skip, 0 fail; SIGTERM in 20-29 ms; `warren up` rifiuta (nessun `bwrap`). WSL2 dedicata: `/readyz` 200 con `bwrap: ok`, `healthz` in 1,4 s, 7.928 pass, 32 skip, 1 fail (test del lint UI, causa non indagata) | `reports/s00-warren.md`, `reports/live-warren-prep.md`, `results/s00-warren-b04a98ba.json` |
| Gas Town | `PARTIAL` | 1 (Docker) + 1 (WSL) | Docker: build a freddo 280 s, `gt doctor` 86 ok / 6 warning / 0 fail, 72 pacchetti Go su 76 con test ok; WSL: build di `gt` e `bd` dentro bwrap in 62 s totali e 14 s, stesso `gt doctor` | `reports/s00-gastown.md`, `reports/s01-gastown-live.md` §2, `results/s00-gastown-948d14dc.json` |
| Baseline | `NOT_APPLICABLE` | - | Claude Code 2.1.304 già installato sull'host | `reports/preflight.md` |

## Artefatti
`results/s00-*.json` (5 file); `reports/s00-*.md`; log grezzi in `results/raw/` (non versionati).

## Costi
0 USD (nessun LLM). Rete in uscita aperta nei container per scaricare dipendenze.

## Stato e motivo
**FATTO con esito `PARTIAL`** per tutti. Cosa non è stato provato: `warren up`, Paperclip dal sorgente completo (RAM), Gas Town `gt up` e agenti nei container di S00, trigger nuovi e agenti reali di Hub, dispatch del Workboard di OpenClaw. Diversi blocchi sono OOM dell'ambiente a 2 GiB, non difetti accertati (`reports/FINAL-RECOMMENDATION.md` §4).
