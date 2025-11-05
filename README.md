# TRAE-Ollama-Bridge
<picture>
    <img src="img/Traellama-Hero.png" alt="Traellama-Hero">
</picture>

[![English](https://img.shields.io/badge/docs-English-purple)](docs/README.en.md) [![简体中文](https://img.shields.io/badge/文档-简体中文-yellow)](README.md) [![日本語](https://img.shields.io/badge/ドキュ-日本語-b7003a)](docs/README.ja.md) [![한국어 문서](https://img.shields.io/badge/docs-한국어-green)](docs/README.ko.md) [![Documentación en Español](https://img.shields.io/badge/docs-Español-orange)](docs/README.es.md) [![Documentation en Français](https://img.shields.io/badge/docs-Français-blue)](docs/README.fr.md) [![Documentação em Português (Brasil)](<https://img.shields.io/badge/docs-Português-purple>)](docs/README.pt.md) [![Dokumentation auf Deutsch](https://img.shields.io/badge/docs-Deutsch-darkgreen)](docs/README.de.md) [![Документация на русском языке](https://img.shields.io/badge/доки-Русский-darkblue)](docs/README.ru.md)

<span style="font-size:1.4em;">由于在 TRAE （或其他IDE）中模型服务商被固定，无法使用本地Ollama模型或修改 Base URL。通过本项目，可让这些客户端直接与本地 Ollama 交互，绕开 IDE 限制。</span>

## 简介
将本地 Ollama 模型包装为 OpenAI 兼容接口，用于解决在 TRAE 等 IDE 中无法自定义模型或 API Base 时的限制。
提供现代 WebUI 管理模型映射与聊天测试；通过可选的系统拦截策略，透明接管固定访问 `https://api.openai.com` 的客户端。

## 亮点特性
- OpenAI 兼容 `/v1` 接口：即插即用，兼容 TRAE 等主流 IDE 请求格式。
- 双模式聊天测试：在 WebUI 中一键切换「显式桥接」与「透明拦截」。
- API Key 可选校验：支持在 WebUI 填写密钥，联动 `EXPECTED_API_KEY` 与 `ACCEPT_ANY_API_KEY` 策略。
- 一键系统策略：自动安装/复用本地 CA 与域证书、写入 hosts、配置 443→本地端口转发。
- 模型映射管理：将本地 Ollama 模型映射为 OpenAI 风格 ID，方便在 IDE 中选择与复用。
- 流式/非流式响应：真实模拟 OpenAI Chat Completions 接口行为。
- 本地优先与隐私：请求与数据不出本机，安全、可控。

> 如果你也在为 IDE 固定服务商/不可改 Base URL 而困扰，TRAE-Ollama-Bridge 让你「立刻」用上本地模型。若本项目帮到了你，欢迎点个 Star 支持，让更多人看到并受益！

## 注意事项
1. 使用本项目前需要配置好Ollama，确保能够正常运行所需要的模型。适当放大Ollama上下文长度。
2. 使用前需要将.env.example复制一份并改名为.env，并根据实际情况修改其中的参数。
3. 确保开启本项目，再在Trae IDE中使用自定义模型。

## 环境变量
详见 `.env.example`：
- `PORT`（默认 3000）  
  - 桥接服务监听的本地端口，WebUI 与 /v1 端点均在此端口提供
- `HTTPS_ENABLED=true|false`（默认 `false`）  
  - 是否启用 HTTPS；设为 true 后需同时配置 SSL_CERT_FILE 与 SSL_KEY_FILE
- `SSL_CERT_FILE`、`SSL_KEY_FILE`（启用 HTTPS 时需要）  
  - 本地证书文件绝对路径，用于透明拦截 https://api.openai.com 时的 TLS 握手
- `OLLAMA_BASE_URL`（默认 `http://127.0.0.1:11434`）  
  - Ollama 服务地址，确保桥接能正常访问本地模型
- `EXPECTED_API_KEY`（固定密钥，可选）  
  - 若设置，则只有携带该密钥的请求才被允许；留空则不校验密钥
- `ACCEPT_ANY_API_KEY=true|false`（默认 `true`）  
  - true 时允许任意密钥通过；false 时强制校验 EXPECTED_API_KEY
- `STRIP_THINK_TAGS=true|false`（剥离 `<think>...</think>`）  
  - 设为 true 可自动移除模型返回中的 <think> 片段，使 IDE 界面更整洁
- `ELEVATOR_PORT`（默认 `55055`）  
  - 高权限助手进程专用端口，用于安装/卸载系统级拦截策略，无需手动访问

## 快速开始（Windows）

</picture>
    <img src="img/WebUI.png" alt="WebUI 预览">
</picture>

### 0. 确保已安装 Node.js（建议 v18+）和 npm。
### 1. 双击 `Start-Bridge.bat` 启动（首次自动安装依赖）。
### 2. 浏览器会打开 `http://localhost:PORT/`（默认 `PORT=3000`），进入 WebUI 主界面。
### 3. WebUI 特权桥接服务：
   - 点击 `注册并启动服务` 按钮。
   - 点击 `应用拦截策略` 按钮。
   - 如需撤销，点击 `撤销拦截策略` 或 `卸载服务` 按钮。
### 4. WebUI Ollama模型列表：
   - 点击 `刷新列表` 按钮，自动显示本地Ollama模型列表。
   - 点击 `复制` 按钮，将模型名称复制到剪贴板。
### 5. WebUI 模型映射：
   - 点击 `刷新列表` 按钮，自动显示当前映射列表。
   - 点击 `新增映射` 按钮，将新增一行映射项。
     - 本地模型名称 输入框中输入本地 Ollama 模型名称（从Ollama模型列表中复制，例如 `llama2-13b`），
     - 映射ID 输入框中输入自定义的全局模型名称（用于在TRAE等IDE中调用，例如 `OpenAI-llama2-13b`）。
   - 点击 `保存` 按钮，将映射项保存到配置文件。
   - 点击 `删除` 按钮，删除当前行映射项。
### 6. WebUI 聊天测试：
   - 选择 `映射ID` 用于测试的模型。
   - 选择 `是否流式` 为模型选择合适的输出模式。
     - 若选择`流式响应`，会实时显示模型输出，
     - 若选择`非流式响应`，会等待模型完成后一次性显示。
   - 选择 `测试模式` 用于测试不同的调用模式。
     - 若选择`显式桥接`，即测试`https://localhost:PORT/v1`。不依赖“注册并启动服务”和“应用拦截策略”。
     - 若选择`透明拦截`，即测试 `https://api.openai.com`。需要完成“注册并启动服务”和“应用拦截策略”。确保点击 WebUI 的`系统状态`按钮时，显示“ HTTPS：已启用，hosts：已写入”。
   - 可选输入 `API 密钥`
     - 若在.env中`EXPECTED_API_KEY`定义了值，且`ACCEPT_ANY_API_KEY=false`，则必须输入该值。
     - 若在.env中`ACCEPT_ANY_API_KEY=true`，则可以输入任意值。
     - 未填写时不携带 `Authorization` 头，适用于默认宽松认证。
   - 输入聊天内容，点击 `发送` 按钮，若对话框中显示模型响应，则测试成功。
   - 点击 `清空` 按钮，清空对话框内容。

> 小贴士：在透明拦截模式下，务必先完成服务注册与拦截策略应用，并在 WebUI 点击「系统状态」确认 `HTTPS：已启用 · hosts：已写入`。

## 配置 Trae IDE

<picture>
    <img src="img/TRAESetting.png" alt="TRAE 模型设置" style="width:49%;display:inline-block;vertical-align:top;">
    <img src="img/TRAESetting2.png" alt="TRAE 模型设置2" style="width:49%;display:inline-block;vertical-align:top;">
</picture>

### 0.  确保已完成 **快速开始（Windows）** 中的所有步骤，并在 聊天测试 中测试成功。
### 1.  打开并登录 Trae IDE。
### 2.  在 AI 对话框中，点击 `设置图标（齿轮图标）/模型/添加模型` 。
### 3.  **服务商**：选择 `OpenAI`。
### 4.  **模型**：选择 `自定义模型`。
### 5.  **模型 ID**：填写在 WebUI 模型映射中 `映射ID` 输入框中定义的值 (例如: `OpenAI-llama2-13b`)。
### 6.  **API 密钥**：若在.env中`EXPECTED_API_KEY`定义了值，且`ACCEPT_ANY_API_KEY=false`，则必须输入该值。若在.env中`ACCEPT_ANY_API_KEY=true`，则可以输入任意值。
### 7.  点击 `添加模型` 按钮。
### 8.  回到 AI 聊天框，选择自定义模型。

## 使用模式
- 透明拦截：适用于固定访问 `https://api.openai.com` 的 TRAE 和其他部分IDE客户端。系统级 443→PORT 映射配合本地 CA + 域证书完成 TLS 校验，实现透明接管。
- 显式桥接：若客户端支持自定义 Base URL，使用 `http://localhost:PORT/v1` 或启用 HTTPS 后的 `https://localhost:PORT/v1`。

## 常见问题与故障排查（FAQ）
- 透明拦截模式聊天失败？
  - 打开 WebUI 点击「系统状态」，确认 `HTTPS：已启用 · hosts：已写入`。
  - 在 PowerShell 执行 `netsh interface portproxy show all` 检查是否存在 `0.0.0.0:443 → 127.0.0.1:PORT` 或 `::0:443 → ::1:PORT` 的转发；为空则在 WebUI 点击「应用拦截策略」。
  - 证书与信任：确保本地 CA 已安装到「受信任的根证书颁发机构」，并为 `api.openai.com` 生成并信任了域证书（可用 `certmgr.msc` 检查）。
  - hosts 解析：确认 `C:\Windows\System32\drivers\etc\hosts` 存在 `api.openai.com` 指向本地的记录（IPv4/IPv6），且无冲突条目。
  - 浏览器跨域：若浏览器报 CORS/证书错误，可优先用「显式桥接」模式在 WebUI 测试，或直接在 IDE 内验证。

- 服务启动端口被占用（EADDRINUSE）？
  - 修改 `.env` 中的 `PORT` 为未占用端口，或结束占用该端口的进程。

- API Key 如何生效？
  - `ACCEPT_ANY_API_KEY=true`（默认）时，接受任意密钥；
  - `ACCEPT_ANY_API_KEY=false` 且设置了 `EXPECTED_API_KEY` 时，必须填写匹配的密钥；
  - WebUI 的「API Key」输入框填写后会自动附带 `Authorization: Bearer <key>` 进行请求。

- 返回包含 `<think>...</think>` 片段？
  - 将 `.env` 中 `STRIP_THINK_TAGS=true`，使返回更简洁（适合 IDE 展示）。

## 管理接口
- `GET/POST/DELETE /bridge/models`：映射表管理
- `GET /bridge/ollama/models`：列出本地模型
- `POST /bridge/setup/https-hosts`：生成/复用本地 CA 与域证书，写入 hosts，并配置 443→PORT
- `POST /bridge/setup/install-elevated-service`：安装/启动零交互助手
- `POST /bridge/setup/uninstall-elevated-service`：卸载零交互助手
- `GET /bridge/setup/elevated-service-status`：查询助手状态
- `GET /bridge/setup/status`：检查 HTTPS 与 hosts 状态
- `POST /bridge/setup/revoke`：撤销拦截策略（停止转发/端口代理，清理 hosts）

## 许可证
MIT（参见根目录 `LICENSE`）。

## 感谢
[`wkgcass大佬`](https://github.com/wkgcass)的[`知乎专栏·【掀桌子】让Trae IDE无缝接入本地大模型`](https://zhuanlan.zhihu.com/p/1901085516268546004)对本项目的启发。

---

## 😊 保持更新

点击仓库右上角 Star 和 Watch 按钮，获取最新项目动态。
> **⭐ 如果本项目对你有帮助，欢迎点个 Star 支持！**  
> **你的一个 Star，将帮助更多开发者发现并用上本地大模型。**  
> [👉 前往 GitHub 给 TRAE-Ollama-Bridge 点星](https://github.com/Noyze-AI/TRAE-Ollama-Bridge)
