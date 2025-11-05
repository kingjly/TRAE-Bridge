# TRAE-Ollama-Bridge
<picture>
    <img src="../img/Traellama-Hero.png" alt="Traellama-Hero">
</picture>

Обновлено: 2025-11-05 • Версия: latest

> Используйте локальные модели Ollama в IDE, где эндпоинт OpenAI зафиксирован (например, TRAE). Этот мост оборачивает Ollama в API, совместимый с OpenAI, и предоставляет Web UI для управления сопоставлениями моделей, тестирования чатов и, при необходимости, прозрачного перехвата обращений к `https://api.openai.com`.

## Обзор
Публикуйте локальный Ollama через совместимый с OpenAI интерфейс, чтобы обойти ограничения поставщика и Base URL в TRAE и похожих IDE. Web UI управляет сопоставлениями моделей и предоставляет тестер чата. Системная политика перехвата может прозрачно взять под контроль клиентов, которые всегда обращаются к `https://api.openai.com`.

## Особенности
- Эндпоинты `/v1`, совместимые с OpenAI: готовы к использованию в TRAE и других IDE.
- Два режима теста чатов: переключение одним кликом между "Explicit Bridge" и "Transparent Interception".
- Необязательная валидация API-ключа: учитывает `EXPECTED_API_KEY` и `ACCEPT_ANY_API_KEY`.
- Системная политика в один клик: выпуск/повторное использование локального CA и доменного сертификата, запись `hosts`, настройка 443→локальный порт.
- Управление сопоставлениями: сопоставляйте модели Ollama с ID в стиле OpenAI для удобного выбора в IDE.
- Ответы потоковые и непотоковые: эмулирует поведение Chat Completions OpenAI.
- Локальный приоритет и приватность: трафик не покидает ваш компьютер.

## Примечания
1. Предварительно установите и настройте Ollama, убедитесь, что нужные модели работают корректно. При необходимости увеличьте длину контекста.
2. Скопируйте `.env.example` в `.env` и адаптируйте значения под вашу среду.
3. Запустите этот проект до настройки пользовательской модели в Trae IDE.

## Переменные окружения
Смотрите `.env.example`:
- `PORT` (по умолчанию `3000`)
- `HTTPS_ENABLED=true|false` (по умолчанию `false`)
- `SSL_CERT_FILE`, `SSL_KEY_FILE` (требуются при включенном HTTPS)
- `OLLAMA_BASE_URL` (по умолчанию `http://127.0.0.1:11434`)
- `EXPECTED_API_KEY` (фиксированный ключ, опционально)
- `ACCEPT_ANY_API_KEY=true|false` (по умолчанию `true`)
- `STRIP_THINK_TAGS=true|false` (удаляет блоки `<think>...</think>`)
- `ELEVATOR_PORT` (по умолчанию `55055`)

## Быстрый старт (Windows)
0. Установите Node.js (рекомендуется v18+) и npm.
1. Дважды щелкните `Start-Bridge.bat` для запуска (при первом запуске зависимости установятся автоматически).
2. Браузер откроет `http://localhost:PORT/` (по умолчанию `PORT=3000`) и покажет Web UI.
3. Привилегированный сервис моста через Web UI:
   - Нажмите "Install & Start Service".
   - Нажмите "Apply Intercept Policy".
   - Для отмены нажмите "Revoke Policy" или "Uninstall Service".
4. Список моделей Ollama в Web UI:
   - Нажмите "Refresh", чтобы показать локальные модели.
   - Нажмите "Copy", чтобы скопировать имя модели.
5. Сопоставления моделей в Web UI:
   - Нажмите "Refresh", чтобы увидеть текущие сопоставления.
   - Нажмите "Add Mapping", чтобы добавить новую строку.
     - Введите локальное имя модели в "Local Model Name" (например, `llama2-13b`).
     - Введите глобальный псевдоним в "Mapping ID" (например, `OpenAI-llama2-13b`) для использования в IDE.
   - Нажмите "Save", чтобы сохранить.
   - Нажмите "Delete", чтобы удалить.
6. Тест чата в Web UI:
   - Выберите "Mapping ID" и "Streaming" ("Streaming" или "Non-Streaming").
   - Выберите "Test Mode": "Explicit Bridge (/v1, local)" или "Transparent Interception (https://api.openai.com)".
   - Нажмите "System Status" и при тесте прозрачного перехвата убедитесь, что отображается "HTTPS: Enabled · hosts: Written".
   - Необязательно: введите "API Key". Если задан `EXPECTED_API_KEY` и `ACCEPT_ANY_API_KEY=false`, необходимо указать именно это значение.
   - Введите сообщение и нажмите "Send". Если ответ отображается — тест успешен.
   - Нажмите "Clear", чтобы очистить чат.

<picture>
    <img src="../img/WebUI.png" alt="Предпросмотр WebUI">
</picture>

## Настройка Trae IDE
0. Завершите Быстрый старт и убедитесь, что тест чата работает.
1. Откройте и войдите в Trae IDE.
2. В диалоге ИИ нажмите `Настройки (шестеренка) / Модели / Добавить модель`.
3. Поставщик: выберите `OpenAI`.
4. Модель: выберите `Пользовательская модель`.
5. ID модели: используйте псевдоним, определенный в Web UI `映射ID` (например, `OpenAI-llama2-13b`).
6. API-ключ: по умолчанию подходит любое значение. Если вы задали `EXPECTED_API_KEY` в `.env`, необходимо ввести именно это значение.
7. Нажмите `Добавить модель`.
8. В чате выберите вашу пользовательскую модель.

<picture>
    <img src="../img/TRAESetting.png" alt="Настройка модели TRAE" style="width:49%;display:inline-block;vertical-align:top;">
    <img src="../img/TRAESetting2.png" alt="Настройка модели TRAE 2" style="width:49%;display:inline-block;vertical-align:top;">
</picture>

## Режимы использования
- Прозрачный перехват: для клиентов, которые фиксированно обращаются к `https://api.openai.com`. Системное сопоставление 443→PORT вместе с локальным CA и доменным сертификатом выполняет проверку TLS и перехватывает трафик.
- Явный мост: если клиент поддерживает произвольный Base URL, используйте `http://localhost:PORT/v1` или `https://localhost:PORT/v1` (при включенном HTTPS).

## FAQ
- Прозрачный перехват не работает?
  - В Web UI откройте "System Status" и убедитесь, что отображается "HTTPS: Enabled · hosts: Written".
  - В PowerShell выполните `netsh interface portproxy show all` и проверьте наличие `0.0.0.0:443 → 127.0.0.1:PORT` или `::0:443 → ::1:PORT`. Если записей нет — нажмите "Apply Intercept Policy" в Web UI.
  - Сертификаты и доверие: установите локальный CA в "Trusted Root Certification Authorities" и сгенерируйте/доверяйте доменный сертификат для `api.openai.com` (`certmgr.msc`).
  - Разрешение hosts: проверьте `C:\\Windows\\System32\\drivers\\etc\\hosts`, чтобы `api.openai.com` указывал локально (IPv4/IPv6) и не было конфликтующих записей.
  - Браузерный CORS: при предупреждениях CORS/сертификатов тестируйте через "Explicit Bridge" в Web UI или непосредственно из IDE.

- Порт занят (`EADDRINUSE`)?
  - Измените `PORT` в `.env` на свободный или завершите процесс, занимающий порт.

- Как работает проверка API-ключа?
  - При `ACCEPT_ANY_API_KEY=true` (по умолчанию) принимается любой ключ.
  - При `ACCEPT_ANY_API_KEY=false` и заданном `EXPECTED_API_KEY` запрос должен содержать именно этот ключ.
  - Ввод "API Key" в Web UI автоматически добавляет заголовок `Authorization: Bearer <key>`.

- Ответ содержит блоки `<think>...</think>`?
  - Установите `STRIP_THINK_TAGS=true`, чтобы удалить `<think>` и сделать вывод в IDE чище.

## API управления
- `GET/POST/DELETE /bridge/models`: управление таблицей сопоставлений
- `GET /bridge/ollama/models`: список локальных моделей
- `POST /bridge/setup/https-hosts`: создание/повторное использование локального CA и доменного сертификата, запись в hosts и настройка 443→PORT
- `POST /bridge/setup/install-elevated-service`: установка/запуск вспомогательного сервиса без взаимодействия
- `POST /bridge/setup/uninstall-elevated-service`: удаление вспомогательного сервиса
- `GET /bridge/setup/elevated-service-status`: статус вспомогательного сервиса
- `GET /bridge/setup/status`: проверка состояния HTTPS и hosts
- `POST /bridge/setup/revoke`: отзыв политики перехвата (остановка перенаправления/прокси и очистка hosts)

## Лицензия
MIT (см. `LICENSE` в корне).

## Благодарности
[Статья wkgcass](https://zhuanlan.zhihu.com/p/1901085516268546004) вдохновила этот проект.

---

## Будьте в курсе
Поставьте Star и включите Watch, чтобы получать обновления.
> Если проект вам полезен, будем благодарны за звездочку!  
> [GitHub: TRAE-Ollama-Bridge](https://github.com/Noyze-AI/TRAE-Ollama-Bridge)