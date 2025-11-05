# TRAE-Ollama-Bridge
<picture>
    <img src="../img/Traellama-Hero.png" alt="Traellama-Hero">
</picture>

업데이트: 2025-11-05 • 버전: latest

> OpenAI 엔드포인트가 고정된 IDE(TRAE 등)에서 로컬 Ollama 모델을 사용할 수 있게 해주는 브리지입니다. Ollama 를 OpenAI 호환 API 로 감싸고, 모델 매핑 관리와 채팅 테스트를 제공하는 Web UI 를 포함합니다. 필요하면 `https://api.openai.com` 호출을 시스템 수준에서 투명하게 가로챌 수 있습니다.

## 소개
TRAE 같은 IDE에서 모델 제공자와 Base URL이 고정된 제한을 우회하기 위해 로컬 Ollama를 OpenAI 호환 인터페이스로 제공합니다. Web UI로 모델 매핑을 관리하고 채팅을 테스트할 수 있습니다. 선택적으로 시스템 인터셉트 정책을 적용하여 항상 `https://api.openai.com`을 호출하는 클라이언트를 투명하게 접수할 수 있습니다.

## 핵심 기능
- OpenAI 호환 `/v1` 엔드포인트: TRAE 등 IDE에서 즉시 사용 가능.
- 이중 채팅 테스트 모드: "Explicit Bridge"와 "Transparent Interception" 간 원클릭 전환.
- API 키 검증(선택): `EXPECTED_API_KEY`와 `ACCEPT_ANY_API_KEY` 정책을 존중.
- 시스템 정책 일괄 설정: 로컬 CA/도메인 인증서 발급·재사용, `hosts` 기록, 443→로컬 포트 설정.
- 매핑 관리: Ollama 모델을 OpenAI 스타일 ID로 매핑하여 IDE에서 쉽게 선택.
- 스트리밍/비스트리밍 응답: OpenAI의 Chat Completions 동작을 모사.
- 로컬 우선·프라이버시: 트래픽은 로컬 머신을 벗어나지 않음.

## 주의사항
1. Ollama를 미리 설치하고 필요한 모델이 정상 동작하는지 확인하세요. 필요하면 컨텍스트 길이를 늘리세요.
2. `.env.example`을 `.env`로 복사하고 환경에 맞게 값을 설정하세요.
3. Trae IDE에서 커스텀 모델을 설정하기 전에 이 프로젝트를 먼저 시작하세요.

## 환경 변수
`.env.example` 참고:
- `PORT`(기본값 `3000`)
- `HTTPS_ENABLED=true|false`(기본값 `false`)
- `SSL_CERT_FILE`, `SSL_KEY_FILE`(HTTPS 활성화 시 필요)
- `OLLAMA_BASE_URL`(기본값 `http://127.0.0.1:11434`)
- `EXPECTED_API_KEY`(고정 키, 선택)
- `ACCEPT_ANY_API_KEY=true|false`(기본값 `true`)
- `STRIP_THINK_TAGS=true|false`(`<think>...</think>` 제거)
- `ELEVATOR_PORT`(기본값 `55055`)

## 빠른 시작(Windows)
0. Node.js(v18+ 권장)와 npm을 설치합니다.
1. `Start-Bridge.bat`을 더블 클릭하여 실행합니다(첫 실행은 의존성 자동 설치).
2. 브라우저가 `http://localhost:PORT/`(기본 `PORT=3000`)를 열어 Web UI를 표시합니다.
3. Web UI 특권 브리지 서비스:
   - "Install & Start Service" 클릭.
   - "Apply Intercept Policy" 클릭.
   - 해제는 "Revoke Policy" 또는 "Uninstall Service".
4. Web UI Ollama 모델 목록:
   - "Refresh"로 로컬 모델 목록 표시.
   - "Copy"로 모델명 복사.
5. Web UI 모델 매핑:
   - "Refresh"로 기존 매핑 표시.
   - "Add Mapping"으로 행 추가.
     - "Local Model Name"에 로컬 모델명(예: `llama2-13b`).
     - "Mapping ID"에 IDE에서 사용할 별칭(예: `OpenAI-llama2-13b`).
   - "Save"로 저장.
   - "Delete"로 삭제.
6. Web UI 채팅 테스트:
   - "Mapping ID"와 "Streaming"("Streaming" 또는 "Non-Streaming") 선택.
   - "Test Mode" 선택: "Explicit Bridge (/v1, local)" 또는 "Transparent Interception (https://api.openai.com)".
   - "System Status" 클릭 후 투명 인터셉트 시 "HTTPS: Enabled · hosts: Written" 표시를 확인.
   - 선택: "API Key" 입력. `EXPECTED_API_KEY` 설정 및 `ACCEPT_ANY_API_KEY=false`이면 정확히 일치하는 키 필요.
   - 메시지 입력 후 "Send" 클릭. 응답이 표시되면 성공.
   - "Clear" 클릭으로 채팅 비우기.

<picture>
    <img src="../img/WebUI.png" alt="WebUI 미리보기">
</picture>

## Trae IDE 설정
0. 빠른 시작을 완료하고 채팅 테스트가 성공하는지 확인.
1. Trae IDE를 열고 로그인.
2. AI 대화창에서 `설정(톱니바퀴)/모델/모델 추가` 클릭.
3. 공급자: `OpenAI` 선택.
4. 모델: `사용자 정의 모델` 선택.
5. 모델 ID: Web UI `映射ID`에서 정의한 값(예: `OpenAI-llama2-13b`).
6. API 키: 기본은 아무 값이나 가능. `.env`에 `EXPECTED_API_KEY`를 설정했다면 해당 값을 입력해야 함.
7. `모델 추가` 클릭.
8. 채팅에서 사용자 정의 모델 선택.

<picture>
    <img src="../img/TRAESetting.png" alt="TRAE 모델 설정" style="width:49%;display:inline-block;vertical-align:top;">
    <img src="../img/TRAESetting2.png" alt="TRAE 모델 설정 2" style="width:49%;display:inline-block;vertical-align:top;">
</picture>

## 사용 모드
- 투명 인터셉트: `https://api.openai.com`을 고정 호출하는 클라이언트용. 시스템 443→PORT 매핑과 로컬 CA+도메인 인증서로 TLS 검증을 수행하여 트래픽을 접수합니다.
- 명시 브리지: 클라이언트가 Base URL을 설정할 수 있으면 `http://localhost:PORT/v1` 또는 `https://localhost:PORT/v1`(HTTPS 활성화 시) 사용.

## FAQ
- 투명 인터셉트가 실패함?
  - Web UI의 "System Status"에서 "HTTPS: Enabled · hosts: Written" 표시를 확인.
  - PowerShell에서 `netsh interface portproxy show all`을 실행하여 `0.0.0.0:443 → 127.0.0.1:PORT` 또는 `::0:443 → ::1:PORT` 항목을 확인. 없다면 Web UI에서 "Apply Intercept Policy" 실행.
  - 인증서/신뢰: 로컬 CA를 "Trusted Root Certification Authorities"에 설치하고 `api.openai.com` 도메인 인증서를 생성·신뢰(`certmgr.msc`).
  - hosts 해석: `C:\\Windows\\System32\\drivers\\etc\\hosts`에서 `api.openai.com`의 로컬 포워딩(IPv4/IPv6) 및 충돌 항목 여부 확인.
  - 브라우저 CORS: CORS/인증서 경고가 발생하면 Web UI의 "Explicit Bridge"로 테스트하거나 IDE에서 직접 사용.

- 포트가 사용 중(`EADDRINUSE`)?
  - `.env`의 `PORT`를 비어있는 포트로 변경하거나 점유 프로세스를 종료.

- API 키 검증은 어떻게 동작?
  - `ACCEPT_ANY_API_KEY=true`(기본)에서는 아무 키나 허용.
  - `ACCEPT_ANY_API_KEY=false`이고 `EXPECTED_API_KEY` 설정 시 정확히 일치하는 키 필요.
  - Web UI의 "API Key"에 값을 입력하면 `Authorization: Bearer <key>` 헤더가 자동 첨부.

- 응답에 `<think>...</think>` 블록이 포함됨?
  - `STRIP_THINK_TAGS=true`로 `<think>` 제거하여 IDE 출력 정리.

## 관리 API
- `GET/POST/DELETE /bridge/models`: 매핑 관리
- `GET /bridge/ollama/models`: 로컬 모델 목록
- `POST /bridge/setup/https-hosts`: 로컬 CA/도메인 인증서 생성·재사용, hosts 기록, 443→PORT 설정
- `POST /bridge/setup/install-elevated-service`: 무상호작용 헬퍼 서비스 설치/시작
- `POST /bridge/setup/uninstall-elevated-service`: 헬퍼 서비스 제거
- `GET /bridge/setup/elevated-service-status`: 헬퍼 서비스 상태 조회
- `GET /bridge/setup/status`: HTTPS 및 hosts 상태 확인
- `POST /bridge/setup/revoke`: 인터셉트 해제(포워딩/프록시 중지 및 hosts 정리)

## 라이선스
MIT(루트 `LICENSE` 참조).

## 감사
[wkgcass의 글](https://zhuanlan.zhihu.com/p/1901085516268546004)에서 영감을 받았습니다.

---

## 업데이트 유지
레포지토리에 Star와 Watch를 눌러 최신 소식을 받아보세요.
> 프로젝트가 도움이 되었다면 Star 부탁드립니다!  
> [GitHub: TRAE-Ollama-Bridge](https://github.com/Noyze-AI/TRAE-Ollama-Bridge)