# TRAE-Ollama-Bridge

Wrap local Ollama as an OpenAI-compatible API with a modern Web UI. Optionally enable system-level interception so clients that hardcode `https://api.openai.com` can transparently talk to your local Ollama. This project targets IDEs like TRAE where model or base URL is fixed.

## Highlights
- OpenAI-compatible endpoints: `/v1/models`, `/v1/chat/completions` (SSE supported)
- Web UI: manage mappings, run chat tests, inspect status
- One-click policy: local CA/domain certs, hosts (v4/v6), 443→PORT forwarding (forwarder first, portproxy fallback)
- Zero-interaction helper: installable background service to apply/revoke without repeated UAC prompts (optional, uninstallable)

## Quick Start (Windows)
1. Double-click `Start-Bridge.bat` (installs dependencies if needed).
2. Browser opens `http://localhost:PORT/` (default `PORT=3000`).
3. In the Web UI:
   - Install & start the privileged helper (one UAC), or use one-off UAC flow directly.
   - Apply interception policy (generate/reuse certs, write hosts, configure 443→PORT).
   - Revoke policy or uninstall service when needed.

## Modes
- Transparent Intercept: for clients that always talk to `https://api.openai.com`. System-level 443→PORT + local CA/domain cert performs TLS verification and transparently takes over.
- Explicit Bridge: when clients can set a base URL, use `http://localhost:PORT/v1` or `https://localhost:PORT/v1` once HTTPS is enabled.

## Environment
See `.env.example`:
- `PORT` (default 3000)
- `HTTPS_ENABLED=true|false` (default `false`)
- `SSL_CERT_FILE`, `SSL_KEY_FILE` (required when HTTPS is enabled)
- `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- `EXPECTED_API_KEY` (optional fixed key)
- `ACCEPT_ANY_API_KEY=true|false` (default `true`)
- `STRIP_THINK_TAGS=true|false` (strip `<think>...</think>` from responses)
- `ELEVATOR_PORT` (default `55055`)

## Admin APIs
- `GET/POST/DELETE /bridge/models`: manage mapping table
- `GET /bridge/ollama/models`: list local models
- `POST /bridge/setup/https-hosts`: generate/reuse local CA and domain cert, write hosts, configure 443→PORT
- `POST /bridge/setup/install-elevated-service`: install/start the helper service
- `POST /bridge/setup/uninstall-elevated-service`: uninstall helper and cleanup
- `GET /bridge/setup/elevated-service-status`: check helper status
- `GET /bridge/setup/status`: check HTTPS and hosts status
- `POST /bridge/setup/revoke`: revoke policy (stop forwarding/portproxy, clean hosts)

## Why for TRAE
- Some IDEs (e.g., TRAE) fix the model or base URL to OpenAI. With the transparent intercept mode, these clients can talk to local Ollama without changing IDE settings.
- If your IDE allows configuring the base URL, use the explicit bridge mode for a simpler setup.

## Development
- `npm start` or `node server.js` to run the bridge.
- To enable HTTPS, set `HTTPS_ENABLED=true` and provide cert paths in `.env`.
- Use the Web UI to install/apply/revoke; restart the bridge when switching to HTTPS.

## License
MIT (see root `LICENSE`).