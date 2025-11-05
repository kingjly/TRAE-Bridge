# TRAE-Ollama-Bridge
<picture>
    <img src="../img/Traellama-Hero.png" alt="Traellama-Hero">
</picture>

Actualizado: 2025-11-05 • Versión: última

> Usa modelos locales de Ollama en IDEs que fijan el proveedor y la URL de OpenAI (como TRAE). Este puente envuelve Ollama con una API compatible con OpenAI y ofrece una Web UI para gestionar mapeos de modelos, probar chats y, opcionalmente, interceptar `https://api.openai.com` de forma transparente.

## Introducción
Publica tu Ollama local mediante una interfaz compatible con OpenAI para sortear las restricciones de proveedor y Base URL en TRAE y otros IDEs. La Web UI gestiona mapeos de modelos y proporciona pruebas de chat. Con una política de interceptación a nivel de sistema, se puede tomar el control de clientes que siempre llaman a `https://api.openai.com`.

## Características destacadas
- Endpoints `/v1` compatibles con OpenAI: plug-and-play con TRAE y IDEs similares.
- Prueba de chat en doble modo: cambia con un clic entre "Explicit Bridge" y "Transparent Interception".
- Validación opcional de API Key: respeta las políticas `EXPECTED_API_KEY` y `ACCEPT_ANY_API_KEY`.
- Política de sistema en un clic: instalar/reutilizar CA local y certificado de dominio, escribir hosts y configurar 443→puerto local.
- Gestión de mapeos: mapear modelos locales de Ollama a IDs estilo OpenAI para seleccionarlos fácilmente en IDEs.
- Respuestas en streaming/no streaming: simula el comportamiento de Chat Completions de OpenAI.
- Local-first y privacidad: el tráfico permanece en tu máquina.

## Notas
1. Configura Ollama previamente y verifica que los modelos necesarios se ejecuten correctamente. Considera ampliar la longitud del contexto.
2. Copia `.env.example` a `.env` y ajusta los valores según tu entorno.
3. Inicia este proyecto antes de configurar el modelo personalizado en Trae IDE.

## Variables de entorno
Consulta `.env.example`:
- `PORT` (por defecto `3000`)
- `HTTPS_ENABLED=true|false` (por defecto `false`)
- `SSL_CERT_FILE`, `SSL_KEY_FILE` (necesarios cuando se habilita HTTPS)
- `OLLAMA_BASE_URL` (por defecto `http://127.0.0.1:11434`)
- `EXPECTED_API_KEY` (clave fija, opcional)
- `ACCEPT_ANY_API_KEY=true|false` (por defecto `true`)
- `STRIP_THINK_TAGS=true|false` (elimina `<think>...</think>`)
- `ELEVATOR_PORT` (por defecto `55055`)

## Inicio rápido (Windows)
0. Instala Node.js (v18+ recomendado) y npm.
1. Haz doble clic en `Start-Bridge.bat` para iniciar (la primera ejecución instala dependencias automáticamente).
2. El navegador abrirá `http://localhost:PORT/` (por defecto `PORT=3000`) y mostrará la Web UI.
3. Servicio puente con privilegios desde la Web UI:
   - Haz clic en "Install & Start Service".
   - Haz clic en "Apply Intercept Policy".
   - Para deshacer, haz clic en "Revoke Policy" o "Uninstall Service".
4. Lista de modelos de Ollama en la Web UI:
   - Haz clic en "Refresh" para ver los modelos locales.
   - Haz clic en "Copy" para copiar el nombre del modelo.
5. Mapeo de modelos en la Web UI:
   - Haz clic en "Refresh" para mostrar los mapeos actuales.
   - Haz clic en "Add Mapping" para añadir una nueva fila.
     - En "Local Model Name", introduce el nombre del modelo local (ej.: `llama2-13b`).
     - En "Mapping ID", introduce el alias global para usar en IDEs (ej.: `OpenAI-llama2-13b`).
   - Haz clic en "Save" para guardar.
   - Haz clic en "Delete" para eliminar.
6. Pruebas de chat en la Web UI:
   - Selecciona "Mapping ID" y "Streaming" ("Streaming" o "Non-Streaming").
   - Selecciona "Test Mode": "Explicit Bridge (/v1, local)" o "Transparent Interception (https://api.openai.com)".
   - Haz clic en "System Status" para confirmar que muestra "HTTPS: Enabled · hosts: Written" al probar la intercepción transparente.
   - Opcional: introduce "API Key". Si `EXPECTED_API_KEY` está definido y `ACCEPT_ANY_API_KEY=false`, debes introducir exactamente ese valor.
   - Introduce el mensaje y haz clic en "Send". Si aparece la respuesta, la prueba fue exitosa.
   - Haz clic en "Clear" para limpiar el chat.

<picture>
    <img src="../img/WebUI.png" alt="Vista previa de la WebUI">
</picture>

## Configurar Trae IDE
0. Completa el Inicio rápido y verifica que la prueba de chat funcione.
1. Abre e inicia sesión en Trae IDE.
2. En el diálogo de IA, haz clic en `Ajustes (engranaje) / Modelos / Añadir modelo`.
3. Proveedor: selecciona `OpenAI`.
4. Modelo: elige `Modelo personalizado`.
5. ID de modelo: usa el alias definido en `映射ID` de la Web UI (ej.: `OpenAI-llama2-13b`).
6. Clave API: cualquier valor funciona por defecto. Si defines `EXPECTED_API_KEY` en `.env`, debes introducir exactamente ese valor.
7. Haz clic en `Añadir modelo`.
8. En el chat, selecciona tu modelo personalizado.

<picture>
    <img src="../img/TRAESetting.png" alt="Configuración de modelo en TRAE" style="width:49%;display:inline-block;vertical-align:top;">
    <img src="../img/TRAESetting2.png" alt="Configuración de modelo en TRAE 2" style="width:49%;display:inline-block;vertical-align:top;">
</picture>

## Modos de uso
- Intercepción transparente: para clientes que fijan `https://api.openai.com`. El mapeo del sistema 443→PORT junto con un CA local y certificado de dominio valida TLS y toma el control del tráfico.
- Puente explícito: si el cliente permite configurar Base URL, usa `http://localhost:PORT/v1` o `https://localhost:PORT/v1` (con HTTPS habilitado).

## Preguntas frecuentes (FAQ)
- ¿Falla el chat en modo de Intercepción transparente?
  - En la Web UI, haz clic en "System Status" y confirma que muestra "HTTPS: Enabled · hosts: Written".
  - En PowerShell, ejecuta `netsh interface portproxy show all` y verifica `0.0.0.0:443 → 127.0.0.1:PORT` o `::0:443 → ::1:PORT`. Si no aparece, haz clic en "Apply Intercept Policy" en la Web UI.
  - Certificados y confianza: instala el CA local en "Trusted Root Certification Authorities" y genera/confía un certificado de dominio para `api.openai.com` (`certmgr.msc`).
  - Resolución de hosts: verifica que `C:\Windows\System32\drivers\etc\hosts` tenga `api.openai.com` apuntando a local (IPv4/IPv6) sin entradas conflictivas.
  - CORS del navegador: si aparecen advertencias de CORS/certificados, prueba con "Explicit Bridge" en la Web UI o directamente en el IDE.

- ¿El puerto del servicio está en uso (`EADDRINUSE`)?
  - Cambia `PORT` en `.env` a un puerto libre o detén el proceso que lo ocupa.

- ¿Cómo funciona la validación de API Key?
  - Con `ACCEPT_ANY_API_KEY=true` (por defecto) se acepta cualquier clave.
  - Con `ACCEPT_ANY_API_KEY=false` y `EXPECTED_API_KEY` definido, la solicitud debe incluir exactamente esa clave.
  - Al completar "API Key" en la Web UI se envía automáticamente `Authorization: Bearer <key>`.

- ¿Respuestas con bloques `<think>...</think>`?
  - Ajusta `STRIP_THINK_TAGS=true` para eliminar `<think>` y limpiar la salida en el IDE.

## API de administración
- `GET/POST/DELETE /bridge/models`: gestión de mapeos
- `GET /bridge/ollama/models`: listar modelos locales
- `POST /bridge/setup/https-hosts`: generar/reutilizar CA local y certificado de dominio, escribir en hosts y configurar 443→PORT
- `POST /bridge/setup/install-elevated-service`: instalar/iniciar servicio auxiliar sin interacción
- `POST /bridge/setup/uninstall-elevated-service`: desinstalar el servicio auxiliar
- `GET /bridge/setup/elevated-service-status`: consultar estado del servicio auxiliar
- `GET /bridge/setup/status`: comprobar estado de HTTPS y hosts
- `POST /bridge/setup/revoke`: revocar la política de interceptación (detener el proxy/redirección y limpiar hosts)

## Licencia
MIT (consulta `LICENSE` en la raíz).

## Agradecimientos
[Artículo de wkgcass](https://zhuanlan.zhihu.com/p/1901085516268546004) que inspiró este proyecto.

---

## Mantente actualizado
Marca el repositorio con Star y Watch para recibir novedades.
> Si este proyecto te resulta útil, ¡agradecemos tu estrella!  
> [GitHub: TRAE-Ollama-Bridge](https://github.com/Noyze-AI/TRAE-Ollama-Bridge)