#!/usr/bin/env bash
# DENTRO bwrap (con --creds): verifica la validita' del login con UNA chiamata minima (Haiku, ~0,01 USD). Nessuno strumento.
export HOME=/home/sandbox
cd "$HOME"
claude -p "Rispondi solo con la parola OK." --model claude-haiku-5-5 --no-session-persistence --output-format json 2>&1 | jq -c '{is_error, result, total_cost_usd, model: (.modelUsage|keys)}' 2>&1 | head -3
