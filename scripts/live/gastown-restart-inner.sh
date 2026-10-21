#!/usr/bin/env bash
# DENTRO bwrap (senza creds, costo zero): riavvio completo della sandbox dopo la run: lo stato (Dolt, bead, MR, branch) e' ancora li'?
export HOME=/home/sandbox
cd "$HOME/gt"
gt dolt start 2>&1 | tail -2
echo "== gt status"; gt status 2>&1 | head -20
cd seedapp
echo "== bd list --all (rig)"; bd list --all 2>&1 | head -20
echo "== bd list tipo merge-request"; bd list --all --type merge-request 2>&1 | head; bd list --all -l gt:merge-request 2>&1 | head
cd "$HOME/gt"
echo "== gt mq list"; gt mq list seedapp 2>&1 | head -15
echo "== polecat list"; gt polecat list seedapp 2>&1 | head
echo "== daemon/costs"; gt costs 2>&1 | head -5
gt dolt stop 2>&1 | tail -1
