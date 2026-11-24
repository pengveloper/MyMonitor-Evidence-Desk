# MyMonitor Alpha

세계 사건을 지도와 근거로 읽는 MyMonitor의 최신 화면(Field 디자인)을 누구나 실행할 수 있게 한 Alpha입니다. API 키, 계정, 유료 자료 없이 동작합니다. 투자 추천을 하지 않습니다.

같은 화면 코드를 세 가지 실행 형태가 나눠 씁니다. 차이는 자료를 읽는 어댑터와 프로필뿐입니다.

| 실행 형태 | 자료 | 어디서 실행 | 이 저장소에 포함 |
|---|---|---|---|
| 공개 데모 | 합성 자료, 또는 브라우저가 USGS에서 직접 받는 실제 지진 자료 | 정적 호스팅 | 예 |
| 자체 설치 (Community) | 내 서버가 USGS에서 받아 저장한 실제 지진 자료 | 내 컴퓨터·서버 | 예 |
| 개인 운영 (Personal) | 시세·보유·학습 기록 등 개인 자료 | 비공개 배포 | 아니요 |

## 지금 되는 것
- 사건 선택, 확인된 사실과 아직 모르는 것 구분해 읽기, 출처 원문 열기, 사건 검색(Ctrl+K)
- 사건 기록 저장 → 같은 주소로 다시 열기 → Markdown 내보내기 (기록은 이 브라우저에만 저장)
- 자료 상태를 문장으로 표시: 실제/합성, 마지막 수신 시각, 오래된 값, 수신 실패, 저장된 자료 없음
- 자체 설치: USGS 수집 → 로컬 저장 → 읽기 API → 같은 화면

## 아직 안 되는 것 (화면에서도 숨겼습니다)
- 시장 맥락, Research(분석), Portfolio(보유), 과거 사례 학습: 개인 운영 형태에만 있는 저장 자료가 필요합니다. 공개 자료 기반 시장 맥락과 학습은 다음 단계입니다.
- 실제 WebGL 지도: 이 Alpha는 네트워크가 필요 없는 SVG 지도를 씁니다.
- 뉴스·분쟁·선박 등 다른 출처: 연결하지 않았고, 출처 화면에 "이 배포에서 쓰지 않는 출처"로 표시됩니다.

## 자체 설치로 시작하기
Node.js 24 (22.18 이상도 동작)와 npm이 필요합니다.

    npm ci
    npm run alpha:build
    npm run alpha:start          # http://127.0.0.1:4310

처음에는 저장된 사건이 없습니다. 화면의 **지금 수집**을 누르거나 다른 터미널에서 `npm run alpha:collect`를 실행하면 USGS 공개 피드(최근 7일, 규모 4.5 이상)를 받아 `alpha-data/events.json`에 저장합니다. 키도 비용도 없습니다.

Docker:

    docker compose -f alpha/docker-compose.yml up --build
    docker compose -f alpha/docker-compose.yml exec mymonitor-alpha node alpha/server/collect.ts

### 설정 (환경 변수)
| 이름 | 기본값 | 뜻 |
|---|---|---|
| `ALPHA_AUTO_COLLECT_MINUTES` | `0` (꺼짐) | 자동 수집 간격(분). 5 이상만 허용. 켜면 시작할 때 한 번, 이후 간격마다 수집 |
| `ALPHA_HOST` / `ALPHA_PORT` | `127.0.0.1` / `4310` | 기본은 이 컴퓨터에서만 접속 |
| `ALPHA_DATA_DIR` | `alpha-data` | 저장 위치. 사건은 30일 보존 |
| `ALPHA_USGS_FEED` | `4.5_week` | `4.5_day`, `4.5_week`, `significant_month` 중 하나 |
| `ALPHA_COLLECT_TOKEN` | 없음 | 설정하면 `POST /api/collect`에 `Authorization: Bearer` 필요. 없으면 이 컴퓨터(loopback)에서만 수집 요청 가능 |

- 수집 요청은 60초에 한 번으로 제한됩니다. USGS 요약 피드는 1분마다 갱신되므로 그보다 자주 받을 이유가 없습니다.
- 서버는 인증 기능이 없습니다. 외부에 열려면 직접 리버스 프록시와 접근 제어를 앞에 두세요.
- 앞으로 키가 필요한 제공자를 붙이더라도 키는 서버 환경 변수로만 읽고 브라우저로 보내지 않습니다. 유료 호출과 자동 수집은 기본으로 꺼 둡니다.

### 읽기 API
- `GET /api/events` — 저장된 사건과 상태(`FRESH` / `STALE` / `EMPTY`), 마지막 성공 시각, 마지막 시도와 실패 사유
- `GET /api/status` — 저장 건수, 최근 시도 10건, 자동 수집 설정
- `POST /api/collect` — 지금 한 번 수집

## 공개 데모로 실행하기

    npm run alpha:build
    python3 -m http.server 4312 --bind 127.0.0.1 --directory dist-alpha

기본은 합성 자료입니다. 상단의 **USGS 실제 자료**를 누르면 브라우저가 USGS에서 직접 받습니다. MyMonitor 서버를 거치지 않습니다. 실제 자료 버튼 없이 합성 자료만 제공하려면 `ALPHA_DEMO_LIVE=0 npm run alpha:build`로 빌드합니다.

## 검증

    npm run verify:alpha

타입 검사 → 테스트 → 빌드 → 번들 점검(개인 운영의 주소·제공자·키 이름·원격 측정이 들어가지 않았는지) → 서버가 지어낸 피드를 수집·저장·제공하는지를 네트워크 없이 확인합니다. 실제 USGS 수신은 이 명령에 포함하지 않으며 `npm run alpha:collect`로 따로 확인합니다.

## 화면 코드의 출처
`src/features/global-briefing/field/`는 개인 운영 MyMonitor와 같은 파일입니다. 어느 판과 같은지는 [FIELD_SOURCE.json](FIELD_SOURCE.json)에 파일별 SHA-256으로 적었습니다. 이 Alpha는 그 파일을 고치지 않고, 프로필 스타일(`app/alpha.css`)과 자료 어댑터(`app/data.ts`)로 실행 형태의 차이를 표현합니다.

자료와 글꼴, 라이선스 고지는 [NOTICE.md](NOTICE.md)에 있습니다. 라이선스는 AGPL-3.0-only입니다.
