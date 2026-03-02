# TRAE-Ollama-Bridge
<picture>
    <img src="../img/Traellama-Hero.png" alt="Traellama-Hero">
</picture>

Updated: 2025-11-05 • Version: latest

> Use local Ollama models or any third-party OpenAI-compatible API in IDEs that hard-code OpenAI endpoints. This bridge provides a unified OpenAI-compatible layer, with Web UI controls for model mapping, upstream routing, chat testing, and optional transparent interception of `https://api.openai.com`.

## Overview
Wrap local Ollama or a custom OpenAI-compatible upstream into a bridgeable interface to bypass fixed model/vendor and Base URL restrictions in TRAE and similar IDEs. The Web UI manages model mappings, upstream configuration, and chat testing. An optional system-level interception policy can transparently take over clients that always call `https://api.openai.com`.

## Highlights
- OpenAI-compatible `/v1` endpoints: plug-and-play with TRAE and similar IDEs.
- Upstream switching: route to local Ollama or any OpenAI-compatible third-party provider.
- Dual-mode chat test: switch between "Explicit Bridge" and "Transparent Interception" in one click.
- Optional API Key validation: respects `EXPECTED_API_KEY` and `ACCEPT_ANY_API_KEY` policies.
- One-click system policy: install/reuse local CA & domain certs, write hosts, and configure 443→local port forwarding.
- Mapping management: map local Ollama models to OpenAI-style IDs for easy selection in IDEs.
- Streaming/non-streaming responses: simulate OpenAI Chat Completions behavior.
- Local-first privacy: traffic stays on your machine.

## Notes
1. If you use `UPSTREAM_TYPE=ollama`, make sure Ollama is installed and your required models run correctly (consider increasing context length).
2. Copy `.env.example` to `.env` and adjust values to your environment.
3. Start this project before configuring the Trae IDE custom model.

## Environment Variables
See `.env.example`:
- `PORT` (default `3000`)
- `HTTPS_ENABLED=true|false` (default `false`)
- `SSL_CERT_FILE`, `SSL_KEY_FILE` (required when HTTPS is enabled)
- `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- `UPSTREAM_TYPE=ollama|openai` (default `ollama`)
- `UPSTREAM_BASE_URL` (optional override)
- `UPSTREAM_API_KEY` (optional upstream bearer token)
- `UPSTREAM_CHAT_PATH`, `UPSTREAM_MODELS_PATH` (optional endpoint overrides for non-standard compatible APIs)
- `FORWARD_CLIENT_API_KEY=true|false` (default `true`)
- `EXPECTED_API_KEY` (optional fixed key)
- `ACCEPT_ANY_API_KEY=true|false` (default `true`)
- `STRIP_THINK_TAGS=true|false` (strip `<think>...</think>` blocks)
- `ELEVATOR_PORT` (default `55055`)

## Quick Start (Windows)
0. Install Node.js (v18+ recommended) and npm.
1. Double-click `Start-Bridge.bat` to launch (first run installs dependencies automatically).
2. Your browser opens `http://localhost:PORT/` (default `PORT=3000`) to show the Web UI.
3. Privileged bridge service from Web UI:
   - Click "Install & Start Service".
   - Click "Apply Intercept Policy".
   - To undo, click "Revoke Policy" or "Uninstall Service".
4. Web UI upstream models list:
   - Click "Refresh" to list models from your active upstream target.
   - Click "Copy" to copy the model name.
5. Web UI model mappings:
   - Click "Refresh" to show current mappings.
   - Click "Add Mapping" to add a new mapping row.
     - Enter upstream model name in "Local Model Name" (e.g., `llama2-13b` or `gpt-4o-mini`).
     - Enter a global alias in "Mapping ID" (e.g., `OpenAI-llama2-13b`) to use in IDEs like TRAE.
   - Click "Save" to persist mappings.
   - Click "Delete" to remove a mapping row.
6. Web UI chat tester:
   - Choose "Mapping ID" and "Streaming" ("Streaming" or "Non-Streaming").
   - Choose "Test Mode": "Explicit Bridge (/v1, local)" or "Transparent Interception (https://api.openai.com)".
   - Click "System Status" to confirm it shows "HTTPS: Enabled · hosts: Written" when testing transparent interception.
   - Optional: enter "API Key". If `EXPECTED_API_KEY` is set and `ACCEPT_ANY_API_KEY=false`, you must enter that exact value.
   - Enter your prompt and click "Send". Seeing a response in the chat box means the test succeeded.
   - Click "Clear" to clear the chat.

<picture>
    <img src="../img/WebUI.png" alt="WebUI Preview">
</picture>

## Configure Trae IDE
0. Complete the Quick Start steps and verify chat testing works.
1. Open and log in to Trae IDE.
2. In the AI dialog, click `Settings (gear icon) / Models / Add Model`.
3. Vendor: select `OpenAI`.
4. Model: choose `Custom Model`.
5. Model ID: fill the alias defined in Web UI `映射ID` (e.g., `OpenAI-llama2-13b`).
6. API Key: any value works by default. If you set `EXPECTED_API_KEY` in `.env`, you must enter that exact value.
7. Click `Add Model`.
8. In the chat, select your custom model.

<picture>
    <img src="../img/TRAESetting.png" alt="TRAE Model Settings" style="width:49%;display:inline-block;vertical-align:top;">
    <img src="../img/TRAESetting2.png" alt="TRAE Model Settings 2" style="width:49%;display:inline-block;vertical-align:top;">
</picture>

## Modes
- Transparent Interception: for clients that hard-code `https://api.openai.com`. A system-level 443→PORT mapping combined with local CA and domain certificate handles TLS verification to take over traffic.
- Explicit Bridge: if the client supports a custom Base URL, use `http://localhost:PORT/v1` or, with HTTPS enabled, `https://localhost:PORT/v1`.

## Use Third-Party OpenAI-Compatible APIs
1. Open Web UI and set upstream type to `openai`.
2. Fill upstream base URL (for example `https://your-provider.example.com`).
3. Fill upstream API key (or leave empty and let bridge forward the API key from TRAE).
4. If provider endpoints are non-standard, set custom chat/models paths.
5. Save, refresh model list, and create mapping aliases for TRAE.

## FAQ
- Chat fails in Transparent Interception mode?
  - In the Web UI, click "System Status" and confirm it shows "HTTPS: Enabled · hosts: Written".
  - In PowerShell, run `netsh interface portproxy show all` and check for `0.0.0.0:443 → 127.0.0.1:PORT` or `::0:443 → ::1:PORT`. If empty, click "Apply Intercept Policy" in the Web UI.
  - Certificates & trust: ensure your local CA is installed under "Trusted Root Certification Authorities" and a domain cert for `api.openai.com` is generated and trusted (`certmgr.msc`).
  - Hosts resolution: verify `C:\Windows\System32\drivers\etc\hosts` has `api.openai.com` pointing locally (IPv4/IPv6) without conflicting entries.
  - Browser CORS: if the browser shows CORS/cert warnings, test with "Explicit Bridge" in Web UI or directly inside the IDE.

- Service port in use (`EADDRINUSE`)?
  - Change `PORT` in `.env` to a free port or stop the process that occupies it.

- How does API Key validation work?
  - With `ACCEPT_ANY_API_KEY=true` (default) any key is accepted.
  - With `ACCEPT_ANY_API_KEY=false` and `EXPECTED_API_KEY` set, requests must include the exact key.
  - Filling "API Key" in the Web UI automatically sends `Authorization: Bearer <key>`.

- Responses include `<think>...</think>` blocks?
  - Set `STRIP_THINK_TAGS=true` to remove `<think>` sections for cleaner IDE output.

## Management APIs
- `GET/POST/DELETE /bridge/models`: manage the mapping table
- `GET/POST /bridge/upstream`: get/update active upstream config
- `GET /bridge/upstream/models`: list models from active upstream
- `GET /bridge/ollama/models`: backward-compatible alias of upstream models endpoint
- `POST /bridge/setup/https-hosts`: generate/reuse local CA and domain certs, write hosts, and configure 443→PORT
- `POST /bridge/setup/install-elevated-service`: install/start a zero-interaction helper service
- `POST /bridge/setup/uninstall-elevated-service`: uninstall the helper service
- `GET /bridge/setup/elevated-service-status`: query helper service status
- `GET /bridge/setup/status`: check HTTPS and hosts status
- `POST /bridge/setup/revoke`: revoke interception (stop forwarding/proxy and clean hosts)

## License
MIT (see root `LICENSE`).

## Acknowledgements
[Article by wkgcass](https://zhuanlan.zhihu.com/p/1901085516268546004) inspired this project.

---

## Stay Updated

Star and Watch the repo to get the latest updates.
> If this project helps you, a star is appreciated!  
> [Go to GitHub: TRAE-Ollama-Bridge](https://github.com/Noyze-AI/TRAE-Ollama-Bridge)
