# TRAE-Ollama-Bridge
<picture>
    <img src="../img/Traellama-Hero.png" alt="Traellama-Hero">
</picture>

> OpenAI の固定エンドポイントしか使えない IDE（TRAE など）で、ローカルの Ollama を利用できるようにするブリッジです。Ollama を OpenAI 互換 API にラップし、モデルマッピング管理とチャットテストができる Web UI を提供します。必要に応じて `https://api.openai.com` へのアクセスを透過的にインターセプトできます。

## 概要
TRAE などの IDE でモデルベンダーや Base URL が固定されている制約を回避するため、ローカル Ollama を OpenAI 互換インターフェースとして公開します。Web UI でモデルマッピングを管理し、チャットテストを行えます。システムレベルのインターセプトポリシーを使用して、`https://api.openai.com` を呼び出すクライアントを透過的に乗っ取ることも可能です。

## 注意事項
1. Ollama を事前にセットアップし、必要なモデルが正常に動作することを確認してください。必要に応じてコンテキスト長を拡張してください。
2. `.env.example` をコピーして `.env` にリネームし、環境に合わせて値を設定してください。
3. 本プロジェクトを起動してから Trae IDE のカスタムモデル設定を行ってください。

## 環境変数
`.env.example` を参照：
- `PORT`（デフォルト `3000`）
- `HTTPS_ENABLED=true|false`（デフォルト `false`）
- `SSL_CERT_FILE`, `SSL_KEY_FILE`（HTTPS を有効にする場合に必要）
- `OLLAMA_BASE_URL`（デフォルト `http://127.0.0.1:11434`）
- `EXPECTED_API_KEY`（固定キー、任意）
- `ACCEPT_ANY_API_KEY=true|false`（デフォルト `true`）
- `STRIP_THINK_TAGS=true|false`（`<think>...</think>` を除去）
- `ELEVATOR_PORT`（デフォルト `55055`）

## クイックスタート（Windows）
0. Node.js（推奨 v18+）と npm をインストール。
1. `Start-Bridge.bat` をダブルクリックして起動（初回は依存を自動インストール）。
2. ブラウザが `http://localhost:PORT/`（デフォルト `PORT=3000`）を開き、Web UI を表示。
3. Web UI の特権ブリッジサービス：
   - `注册并启动服务`（サービス登録と起動）をクリック。
   - `应用拦截策略`（インターセプト適用）をクリック。
   - 取り消す場合は `撤销拦截策略` または `卸载服务` をクリック。
4. Web UI の Ollama モデル一覧：
   - `刷新列表` でローカルの Ollama モデル一覧を表示。
   - `复制` でモデル名をクリップボードへコピー。
5. Web UI のモデルマッピング：
   - `刷新列表` で現在のマッピングを表示。
   - `新增映射` でマッピング行を追加。
     - `本地模型名称` にはローカルのモデル名（例：`llama2-13b`）。
     - `映射ID` には IDE で使用する別名（例：`OpenAI-llama2-13b`）。
   - `保存` で保存。
   - `删除` で削除。
6. Web UI のチャットテスト：
   - `映射ID` と `是否流式`（ストリーミング）を選択。ストリーミングはトークンをリアルタイム表示、非ストリーミングは完了後に一括表示。
   - プロンプトを入力して `发送` をクリック。応答が表示されれば成功。
   - `清空` でチャット欄をクリア。

## Trae IDE の設定
0. クイックスタートを完了し、チャットテストが成功することを確認。
1. Trae IDE を開いてログイン。
2. AI ダイアログで `設定（歯車）/ モデル / モデルを追加` をクリック。
3. ベンダー：`OpenAI` を選択。
4. モデル：`カスタムモデル` を選択。
5. モデル ID：Web UI の `映射ID` に設定した値（例：`OpenAI-llama2-13b`）。
6. API キー：デフォルトでは任意の値で可。`.env` に `EXPECTED_API_KEY` を設定した場合は、その値を入力必須。
7. `モデルを追加` をクリック。
8. チャット画面でカスタムモデルを選択。

## 利用モード
- 透過的インターセプト：`https://api.openai.com` を固定で呼び出すクライアント向け。システムの 443→PORT マッピングとローカル CA + ドメイン証明書により TLS を検証し、トラフィックを乗っ取ります。
- 明示的ブリッジ：クライアントが Base URL を設定可能なら、`http://localhost:PORT/v1` または `https://localhost:PORT/v1`（HTTPS 有効時）。

## 管理 API
- `GET/POST/DELETE /bridge/models`：マッピング管理
- `GET /bridge/ollama/models`：ローカルモデル一覧
- `POST /bridge/setup/https-hosts`：ローカル CA/ドメイン証明書の生成・再利用、hosts への書き込み、443→PORT の設定
- `POST /bridge/setup/install-elevated-service`：ゼロインタラクションのヘルパーサービスをインストール/起動
- `POST /bridge/setup/uninstall-elevated-service`：ヘルパーサービスをアンインストール
- `GET /bridge/setup/elevated-service-status`：ヘルパーサービスの状態を取得
- `GET /bridge/setup/status`：HTTPS と hosts の状態を確認
- `POST /bridge/setup/revoke`：インターセプトの解除（転送/プロキシ停止と hosts のクリーンアップ）

## ライセンス
MIT（ルートの `LICENSE` を参照）。

## 謝辞
[wkgcass 氏の記事](https://zhuanlan.zhihu.com/p/1901085516268546004)に着想を得ています。

---

## 更新情報
リポジトリを Star と Watch して最新情報を取得してください。
> このプロジェクトが役に立ったら Star をお願いします。  
> [GitHub: TRAE-Ollama-Bridge](https://github.com/Noyze-AI/TRAE-Ollama-Bridge)