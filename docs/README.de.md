# TRAE-Ollama-Bridge
<picture>
    <img src="../img/Traellama-Hero.png" alt="Traellama-Hero">
</picture>

Aktualisiert: 2025-11-05 • Version: aktuell

> Verwenden Sie lokale Ollama-Modelle in IDEs, die OpenAI-Endpunkte fest verdrahten (z. B. TRAE). Diese Bridge stellt Ollama über eine OpenAI-kompatible API bereit und bietet eine Weboberfläche zur Verwaltung von Modellzuordnungen, zum Testen von Chats und – optional – zur transparenten Interzeption von `https://api.openai.com`.

## Überblick
Stellen Sie Ihren lokalen Ollama über eine OpenAI-kompatible Schnittstelle bereit, um feste Anbieter- und Base-URL-Beschränkungen in TRAE und ähnlichen IDEs zu umgehen. Die Web UI verwaltet Modellzuordnungen und bietet einen Chat-Tester. Eine Systemrichtlinie kann Clients, die immer `https://api.openai.com` aufrufen, transparent übernehmen.

## Highlights
- OpenAI-kompatible `/v1` Endpunkte: Plug-and-Play mit TRAE und ähnlichen IDEs.
- Dualer Chat-Testmodus: per Klick zwischen "Explicit Bridge" und "Transparent Interception" wechseln.
- Optionale API-Key-Validierung: respektiert `EXPECTED_API_KEY` und `ACCEPT_ANY_API_KEY`.
- One-Click-Systemrichtlinie: lokales CA- und Domain-Zertifikat installieren/wiederverwenden, hosts schreiben und 443→lokalen Port konfigurieren.
- Zuordnungsverwaltung: lokale Ollama-Modelle auf OpenAI-IDs abbilden, bequem in IDEs auswählen.
- Streaming-/Nicht-Streaming-Antworten: OpenAI Chat Completions Verhalten.
- Lokal-first & Datenschutz: Traffic verbleibt auf Ihrem Rechner.

## Hinweise
1. Installieren und konfigurieren Sie Ollama im Voraus und stellen Sie sicher, dass die benötigten Modelle korrekt laufen. Erhöhen Sie ggf. die Kontextlänge.
2. Kopieren Sie `.env.example` nach `.env` und passen Sie die Werte an Ihre Umgebung an.
3. Starten Sie dieses Projekt, bevor Sie das benutzerdefinierte Modell in Trae IDE konfigurieren.

## Umgebungsvariablen
Siehe `.env.example`:
- `PORT` (Standard `3000`)
- `HTTPS_ENABLED=true|false` (Standard `false`)
- `SSL_CERT_FILE`, `SSL_KEY_FILE` (erforderlich bei aktiviertem HTTPS)
- `OLLAMA_BASE_URL` (Standard `http://127.0.0.1:11434`)
- `EXPECTED_API_KEY` (fester Schlüssel, optional)
- `ACCEPT_ANY_API_KEY=true|false` (Standard `true`)
- `STRIP_THINK_TAGS=true|false` (entfernt `<think>...</think>`)
- `ELEVATOR_PORT` (Standard `55055`)

## Schnellstart (Windows)
0. Installieren Sie Node.js (empfohlen v18+) und npm.
1. Doppelklicken Sie auf `Start-Bridge.bat`, um zu starten (beim ersten Lauf werden Abhängigkeiten automatisch installiert).
2. Der Browser öffnet `http://localhost:PORT/` (Standard `PORT=3000`) und zeigt die Web UI.
3. Privilegierter Bridge-Service über die Web UI:
   - Klicken Sie auf "Install & Start Service".
   - Klicken Sie auf "Apply Intercept Policy".
   - Zum Aufheben klicken Sie auf "Revoke Policy" oder "Uninstall Service".
4. Ollama-Modellliste in der Web UI:
   - Klicken Sie auf "Refresh", um lokale Modelle anzuzeigen.
   - Klicken Sie auf "Copy", um den Modellnamen zu kopieren.
5. Modellzuordnung in der Web UI:
   - Klicken Sie auf "Refresh", um aktuelle Zuordnungen zu sehen.
   - Klicken Sie auf "Add Mapping", um eine neue Zeile hinzuzufügen.
     - Tragen Sie den lokalen Modellnamen in "Local Model Name" ein (z. B. `llama2-13b`).
     - Tragen Sie den globalen Alias in "Mapping ID" ein (z. B. `OpenAI-llama2-13b`) zur Verwendung in IDEs wie TRAE.
   - Klicken Sie auf "Save", um zu speichern.
   - Klicken Sie auf "Delete", um zu löschen.
6. Chat-Test in der Web UI:
   - Wählen Sie "Mapping ID" und "Streaming" ("Streaming" oder "Non-Streaming").
   - Wählen Sie "Test Mode": "Explicit Bridge (/v1, local)" oder "Transparent Interception (https://api.openai.com)".
   - Klicken Sie auf "System Status" und bestätigen Sie, dass "HTTPS: Enabled · hosts: Written" angezeigt wird, wenn Sie die transparente Interzeption testen.
   - Optional: geben Sie "API Key" ein. Wenn `EXPECTED_API_KEY` gesetzt ist und `ACCEPT_ANY_API_KEY=false`, müssen Sie genau diesen Wert eingeben.
   - Geben Sie Ihre Nachricht ein und klicken Sie auf "Send". Wenn eine Antwort erscheint, war der Test erfolgreich.
   - Klicken Sie auf "Clear", um den Chat zu leeren.

<picture>
    <img src="../img/WebUI.png" alt="WebUI Vorschau">
</picture>

## Trae IDE konfigurieren
0. Schließen Sie den Schnellstart ab und verifizieren Sie den erfolgreichen Chat-Test.
1. Öffnen und melden Sie sich in Trae IDE an.
2. Klicken Sie im KI-Dialog auf `Einstellungen (Zahnrad) / Modelle / Modell hinzufügen`.
3. Anbieter: `OpenAI`.
4. Modell: `Benutzerdefiniertes Modell`.
5. Modell-ID: verwenden Sie den Alias aus `映射ID` der Web UI (z. B. `OpenAI-llama2-13b`).
6. API-Schlüssel: standardmäßig funktioniert jeder Wert. Wenn `EXPECTED_API_KEY` in `.env` gesetzt ist, müssen Sie genau diesen Wert eingeben.
7. Klicken Sie auf `Modell hinzufügen`.
8. Wählen Sie im Chat Ihr benutzerdefiniertes Modell.

<picture>
    <img src="../img/TRAESetting.png" alt="TRAE Modell-Einstellungen" style="width:49%;display:inline-block;vertical-align:top;">
    <img src="../img/TRAESetting2.png" alt="TRAE Modell-Einstellungen 2" style="width:49%;display:inline-block;vertical-align:top;">
</picture>

## Betriebsmodi
- Transparente Interzeption: für Clients, die `https://api.openai.com` fest aufrufen. Systemweises 443→PORT-Mapping mit lokalem CA- und Domain-Zertifikat validiert TLS und übernimmt den Verkehr.
- Explizite Bridge: wenn der Client eine benutzerdefinierte Base URL unterstützt, verwenden Sie `http://localhost:PORT/v1` oder `https://localhost:PORT/v1` (bei aktiviertem HTTPS).

## FAQ
- Transparente Interzeption schlägt fehl?
  - Klicken Sie in der Web UI auf "System Status" und bestätigen Sie, dass "HTTPS: Enabled · hosts: Written" angezeigt wird.
  - Führen Sie in PowerShell `netsh interface portproxy show all` aus und prüfen Sie auf `0.0.0.0:443 → 127.0.0.1:PORT` oder `::0:443 → ::1:PORT`. Ist die Liste leer, klicken Sie in der Web UI auf "Apply Intercept Policy".
  - Zertifikate & Vertrauen: lokales CA unter "Trusted Root Certification Authorities" installieren und ein Domain-Zertifikat für `api.openai.com` erzeugen und vertrauen (`certmgr.msc`).
  - Hosts-Auflösung: prüfen Sie `C:\Windows\System32\drivers\etc\hosts` auf einen lokalen Eintrag für `api.openai.com` (IPv4/IPv6) ohne Konflikte.
  - Browser-CORS: zeigt der Browser CORS/Cert-Warnungen, testen Sie mit "Explicit Bridge" in der Web UI oder direkt in der IDE.

- Dienst-Port belegt (`EADDRINUSE`)?
  - Ändern Sie `PORT` in `.env` auf einen freien Port oder beenden Sie den belegenden Prozess.

- Wie funktioniert die API-Key-Validierung?
  - Mit `ACCEPT_ANY_API_KEY=true` (Standard) wird jeder Key akzeptiert.
  - Mit `ACCEPT_ANY_API_KEY=false` und gesetztem `EXPECTED_API_KEY` muss genau dieser Key übermittelt werden.
  - Das Ausfüllen von "API Key" in der Web UI sendet automatisch `Authorization: Bearer <key>`.

- Antworten enthalten `<think>...</think>`?
  - Setzen Sie `STRIP_THINK_TAGS=true`, um `<think>`-Abschnitte zu entfernen und die IDE-Ausgabe zu säubern.

## Verwaltungs-APIs
- `GET/POST/DELETE /bridge/models`: Zuordnungen verwalten
- `GET /bridge/ollama/models`: lokale Modelle auflisten
- `POST /bridge/setup/https-hosts`: lokalen CA- und Domain-Zertifikate generieren/wiederverwenden, hosts schreiben und 443→PORT konfigurieren
- `POST /bridge/setup/install-elevated-service`: Zero-Interaction-Hilfsdienst installieren/starten
- `POST /bridge/setup/uninstall-elevated-service`: Hilfsdienst deinstallieren
- `GET /bridge/setup/elevated-service-status`: Status des Hilfsdienstes abfragen
- `GET /bridge/setup/status`: HTTPS- und hosts-Status prüfen
- `POST /bridge/setup/revoke`: Interzeption aufheben (Weiterleitung/Proxy stoppen und hosts bereinigen)

## Lizenz
MIT (siehe `LICENSE` im Projektstamm).

## Danksagungen
[Artikel von wkgcass](https://zhuanlan.zhihu.com/p/1901085516268546004) inspirierte dieses Projekt.

---

## Auf dem Laufenden bleiben
Geben Sie dem Repository Star und Watch, um Updates zu erhalten.
> Wenn dieses Projekt hilfreich ist, freuen wir uns über einen Stern!  
> [GitHub: TRAE-Ollama-Bridge](https://github.com/Noyze-AI/TRAE-Ollama-Bridge)