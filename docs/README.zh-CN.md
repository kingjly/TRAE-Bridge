# TRAE-Ollama-Bridge

将本地 Ollama 模型包装为 OpenAI 兼容接口，并提供现代 WebUI 管理模型映射与聊天测试；通过可选的系统拦截策略，透明接管固定访问 `https://api.openai.com` 的客户端。该项目专门用于解决在 TRAE 等 IDE 中无法自定义模型或 API Base 时的限制。

## 亮点
- OpenAI 兼容：`/v1/models`、`/v1/chat/completions`（支持 SSE）
- WebUI：管理映射、测试聊天、系统状态
- 一键策略：本地 CA/域证书、hosts(v4/v6)、443→PORT 转发（转发器优先、portproxy 备用）
- 零交互助手：通过后台服务免 UAC 执行应用/撤销（可选安装/卸载）

## 快速开始（Windows）
1. 双击 `Start-Bridge.bat` 启动（首次自动安装依赖）。
2. 浏览器会打开 `http://localhost:PORT/`（默认 `PORT=3000`）。
3. 在 WebUI 中：
   - 注册并启动服务（一次 UAC），或直接使用一次性 UAC 流程。
   - 应用拦截策略（生成/复用证书、hosts、443→PORT）。
   - 如需撤销，点击“撤销拦截策略”或“卸载服务”。

## 使用模式
- 透明拦截：适用于固定访问 `https://api.openai.com` 的客户端（例如部分 IDE）。系统级 443→PORT 映射配合本地 CA + 域证书完成 TLS 校验，实现透明接管。
- 显式桥接：若客户端支持自定义 Base URL，使用 `http://localhost:PORT/v1` 或启用 HTTPS 后的 `https://localhost:PORT/v1`。

## 环境变量
详见 `.env.example`：
- `PORT`（默认 3000）
- `HTTPS_ENABLED=true|false`（默认 `false`）
- `SSL_CERT_FILE`、`SSL_KEY_FILE`（启用 HTTPS 时需要）
- `OLLAMA_BASE_URL`（默认 `http://127.0.0.1:11434`）
- `EXPECTED_API_KEY`（固定密钥，可选）
- `ACCEPT_ANY_API_KEY=true|false`（默认 `true`）
- `STRIP_THINK_TAGS=true|false`（剥离 `<think>...</think>`）
- `ELEVATOR_PORT`（默认 `55055`）

## 管理接口
- `GET/POST/DELETE /bridge/models`：映射表管理
- `GET /bridge/ollama/models`：列出本地模型
- `POST /bridge/setup/https-hosts`：生成/复用本地 CA 与域证书，写入 hosts，并配置 443→PORT
- `POST /bridge/setup/install-elevated-service`：安装/启动零交互助手
- `POST /bridge/setup/uninstall-elevated-service`：卸载零交互助手
- `GET /bridge/setup/elevated-service-status`：查询助手状态
- `GET /bridge/setup/status`：检查 HTTPS 与 hosts 状态
- `POST /bridge/setup/revoke`：撤销拦截策略（停止转发/端口代理，清理 hosts）

## 与 TRAE 的联系
- 在某些 IDE（例如 TRAE）中，模型或 Base URL 固定为 OpenAI。通过本项目的透明拦截模式，可让这些客户端直接与本地 Ollama 交互，而无需修改 IDE 配置。
- 若 IDE 支持自定义 Base URL，则使用显式桥接模式即可轻松集成本地 Ollama。

## 开发
- `npm start` 或 `node server.js` 启动服务。
- 启用 HTTPS 时，设置 `.env` 中的 `HTTPS_ENABLED=true` 并填充证书路径。
- WebUI 支持一键安装/应用/撤销策略；变更 HTTPS 后请重启服务。

## 许可证
MIT（参见根目录 `LICENSE`）。