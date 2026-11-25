# MyMonitor Evidence Desk — 합성 공개 평가판

실시간 뉴스·시세·계좌 서비스가 아닌 **합성 자료 기반의 제한된 공개 평가판**입니다. 개인 운영 MyMonitor와 분리되어 있으며 owner/provider/AI 키가 필요하지 않습니다. 투자 추천이나 실제 과거 재현을 제공하지 않습니다.

## 지원 범위

사건 선택 → 자료 요약·가능한 해석·다음 확인 읽기 → 가상 근거 열기 → 브라우저에 저장 → 같은 주소에서 재개 → 합성 Markdown 내보내기를 지원합니다. 지도, 검색, Research/Portfolio 왕복은 합성 데모 범위입니다. /comparison.html은 **동일 코드의 Evidence Desk flag-off 비교**이며 과거 WorldMonitor 버전이 아닙니다.

실제 historical snapshot/replay, 실제 계좌, 유료 시세, 자동 수집, AI 분석은 연결하지 않습니다. 브리프는 저장 당시 사본이며 실제 역사 데이터가 아닙니다.

## 실행

Node.js 24와 npm, 패키지 registry 네트워크가 필요합니다. 원본 lockfile과 vendor 보안 패치를 보존합니다.

    npm ci
    npm run verify:demo
    python3 publication/prepare.py dist-evidence-desk --source-commit "$(git rev-parse HEAD)" --fresh-build
    python3 -m http.server 4187 --bind 127.0.0.1 --directory dist-evidence-desk

루트 호스팅 기준: /, /index.html, /comparison.html. 하위 경로 호스팅은 지원 대상으로 추가하지 않았습니다. 위 Python 서버는 로컬 실행 안내이며 실제 공개판은 assets-only Cloudflare Workers Static Assets의 기존 경로 설정을 사용합니다. API·Worker 실행 코드·DB·secret·수집 스케줄러는 추가하지 않습니다.

공개 지도는 https://tiles.openfreemap.org 네트워크가 필요합니다. 키 불필요는 완전 오프라인이라는 뜻이 아닙니다. 브라우저가 선택한 SVG fallback에서는 목록·근거·저장 사용이 확인되었습니다. WebGL 지도 네트워크 실패의 전체 앱 처리는 아래와 같이 미검수입니다.

브리프는 origin별 브라우저 저장소에만 저장됩니다. 다른 주소/브라우저에는 자동 이전되지 않으며 사용자가 저장소를 지우면 사라집니다. 별도 방문자 추적·세션 녹화를 추가하지 않았습니다.

## 알려진 제한 — 통과로 간주하지 않음

- MAP_COMPONENT_FAULT_QA: ENVIRONMENT_BLOCKED / NOT_RUN
- APP_WEBGL_FAULT_E2E: NOT_RUN
- 실제 Fold/터치: NOT_TESTED (390px 원격 Chromium은 모바일 에뮬레이션)
- 외부 사용자 효용 평가: NOT_STARTED
- 실제 과거 비교: NOT_CONNECTED

모든 검수 PASS, 사용자 선호, WorldMonitor 대비 우월성 또는 25% 시간 단축을 주장하지 않습니다. [참여자 과업지](docs/design/evidence-desk/PARTICIPANT_TASKS.md)를 사용하며 정답지는 이 사이트/소스 패키지에 포함하지 않습니다.

## 출처와 기여

WorldMonitor의 App shell, MapContainer, MapLibre/deck.gl, 검색 및 기본 화면 구조를 재사용했습니다. MyMonitor의 추가 기여는 합성 Evidence Desk 읽기 흐름, 사실과 해석의 구분을 돕는 표현, frozen demo 브리프 저장/재개, 합성 전용 배포 격리입니다. 독자 개발한 지도 엔진으로 소개하지 않습니다.

[AGPL-3.0-only LICENSE](LICENSE), [WorldMonitor 고정 출처](demo/evidence-desk/upstream-provenance.json), [소스/자산 고지](docs/design/evidence-desk/SOURCE_NOTICES.md), vendor 패치의 LICENSE·provenance·원본 패치를 보존합니다. 빌드 산출물의 THIRD_PARTY_NOTICES.txt에는 main/worker 포함 의존성 고지가 있습니다.

## 대응 소스와 게시 provenance

이 저장소는 검토된 source ZIP만으로 만든 별도 소스 snapshot입니다. 원래 private 저장소의 git 이력·운영 로그·.context·outputs·계좌 자료를 가져오지 않았으며 운영 workflow도 없습니다.

[공개 소스](https://github.com/pengveloper/MyMonitor-Evidence-Desk). 정확한 게시 source commit과 파일 hash는 사이트 publication 페이지 및 PUBLICATION_MANIFEST.json에서 확인할 수 있습니다.

원본 MyMonitor source revision: 3efdb24310096a7e7aa69237fc96fb00fd4067c8

- 원본 source ZIP SHA256: e9b0c8bdf40741f1b294307ada012eee8f6252b40d98d9a986cf8ecd3c64d251
- 원본 static ZIP SHA256: 7e7d90fa25212900f6e7903140f25d0fcb4d1014cd88e99b5993b501f6456c6f

SOURCE_MANIFEST.json은 원본 입력과 포장 파일을 구분합니다. package.json은 기존 검증된 demo 전용 lifecycle 변환본이며 package-lock/vendor는 그대로입니다. 원본 문서의 PUBLISH_APPROVAL_PENDING은 패키지 생성 당시의 역사적 상태입니다. 최초 공개는 검토된 기존 번들을 재사용했습니다. 날짜 안내와 저장 상태 수정부터는 해당 소스 커밋에서 정적 앱을 새로 빌드하며, 게시 manifest에 fresh-static-build와 runtimeBuildSourceCommit을 기록합니다.

## 공개 데모 표시·저장 상태 회귀 검사

자료 기준은 2026-10-05 11:00 KST로 고정됩니다. 기기 현재 시각이나 브리프 저장 시각은 관측 시각을 갱신하지 않습니다. 자료 요약과 핵심 미확인 내용을 함께 표시하며 현재 사건과 저장 사본의 안내를 각각의 보기 상태에 연결합니다. 기존 저장 기록의 날짜·내용·형식은 변경하지 않습니다.

정상 설치 후 전체 데모 검증: `npm ci` → `npm run verify:demo`. Node.js 24, npm, Python 3이 필요합니다. TypeScript 앱·worker 검사, 기존 표시/저장 회귀, publication provenance, 정적 빌드와 실제 빌드 파일의 검사 포함 여부를 순서대로 확인합니다. 게시나 브라우저 재검수는 실행하지 않습니다.

`typecheck:feedback`은 변경 범위의 회귀 검사로 유지합니다. 실제 demo dependency graph 전체는 `typecheck:demo`로 검사합니다. [12건의 분류·검사 범위·root tsconfig와의 차이](docs/DEMO_VERIFICATION.md)를 확인하세요. root tsconfig는 원래의 넓은 src 경로를 진단하므로 데모에서 대체하는 history JSON 누락 1건이 남습니다. 이를 전체 저장소 타입 검사 PASS라고 표현하지 않습니다.

이 공개 저장소에는 실행되는 CI workflow가 없습니다. WebGL 장애 경로·실제 Fold/터치·외부 사용자 효용의 미검증 상태와 현재 게시 버전은 그대로 유지합니다.
