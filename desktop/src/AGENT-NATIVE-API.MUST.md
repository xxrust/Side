# STOP / READ — Agent-native API is mandatory
See ../../prd/2026-10-27-dag-redesign/AGENT-NATIVE-API.md
Export a single `agentApi` (or equivalent) facade used by both UI and headless scripts.
UI must not write project state except through that facade.
