/** Audited at e37b03b. Code existence is not live acceptance. Preview only. */
export const OWNER_PREVIEW_NAVIGATION = [
    {
        "id": "today",
        "label": "오늘"
    },
    {
        "id": "invest",
        "label": "내 투자"
    },
    {
        "id": "discover",
        "label": "발견"
    },
    {
        "id": "records",
        "label": "기록"
    },
    {
        "id": "all",
        "label": "전체"
    }
] as const;
export type OwnerPreviewSection = (typeof OWNER_PREVIEW_NAVIGATION)[number]['id'];
export interface OwnerFeature {
    id: string;
    label: string;
    group: OwnerPreviewSection;
    purpose: string;
    preserveExisting: boolean;
    route: string | null;
    components: string[];
    apis: string[];
    sources: string[];
    tests: string[];
    implementation: 'EXISTING_PARTIAL' | 'PROPOSED';
    acceptance: 'NOT_TESTED_THIS_ROUND';
    access: 'OWNER_ONLY_UNVERIFIED';
    note: string;
}
export const OWNER_FEATURES: readonly OwnerFeature[] = [
    {
        "id": "today",
        "label": "오늘",
        "group": "today",
        "purpose": "시장·개인 종목의 중요한 변화와 다음 확인",
        "preserveExisting": true,
        "route": "/#ownerHomeMount",
        "components": [
            "src/features/stock-research/owner-intelligence-view.ts",
            "src/app/panel-layout.ts"
        ],
        "apis": [
            "api/autonomous-learning.ts",
            "api/market/v1/[rpc].ts"
        ],
        "sources": [
            "OwnerSignalStory",
            "EODHD/FRED/SEC/Toss"
        ],
        "tests": [
            "tests/owner-signal-story.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "Home 구성 존재; 이번 라운드 live acceptance 미실행"
    },
    {
        "id": "portfolio",
        "label": "보유·관심종목",
        "group": "invest",
        "purpose": "확인된 개인 포지션과 관심 목록",
        "preserveExisting": true,
        "route": "/#controlRoomStockSummaryMount",
        "components": [
            "src/features/stock-research/control-room-stock-research.ts",
            "src/services/owner-context.ts"
        ],
        "apis": [
            "api/autonomous-learning.ts",
            "api/market/v1/[rpc].ts"
        ],
        "sources": [
            "Toss canonical holdings",
            "manual watchlist"
        ],
        "tests": [
            "tests/tossinvest-owner-portfolio.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "확인된 보유와 관심을 구분; 미확인 수량은 순노출로 추론하지 않음"
    },
    {
        "id": "ticker",
        "label": "종목 상세·12항목 분석",
        "group": "invest",
        "purpose": "네 종목의 분석·원문·가설·반론",
        "preserveExisting": true,
        "route": "/stocks/:symbol",
        "components": [
            "src/features/stock-research/stock-research-overlay.ts",
            "src/features/stock-research/owner-analysis-view.ts"
        ],
        "apis": [
            "api/autonomous-learning.ts",
            "api/market/v1/[rpc].ts",
            "server/_shared/owner-intelligence.ts"
        ],
        "sources": [
            "OwnerIntelligenceEvidence"
        ],
        "tests": [
            "tests/dom/stock-research-overlay.test.mts",
            "tests/owner-intelligence.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "12항목 화면·분석 코드 존재; 이 미리보기는 fixture만 사용"
    },
    {
        "id": "risk",
        "label": "노출·위험",
        "group": "invest",
        "purpose": "수량/평가금액·위험 티켓",
        "preserveExisting": true,
        "route": "/stocks/:symbol#ticker-360-risk",
        "components": [
            "src/features/stock-research/risk-ticket-model.ts",
            "src/features/stock-research/risk-change-checkpoint.ts"
        ],
        "apis": [
            "api/market/v1/[rpc].ts"
        ],
        "sources": [
            "SEC risk evidence",
            "owner portfolio context"
        ],
        "tests": [
            "tests/risk-ticket-model.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "위험 티켓과 변화 비교 존재; 전체 포트폴리오 노출 완전성 별도"
    },
    {
        "id": "discover-now",
        "label": "지금 투자 후보",
        "group": "discover",
        "purpose": "수동 요청 시점의 제한된 후보 발굴",
        "preserveExisting": false,
        "route": null,
        "components": [],
        "apis": [],
        "sources": [],
        "tests": [],
        "implementation": "PROPOSED",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "DISCOVERY-0 계약만 구현; 실제 universe·job·수집·저장 연결 전"
    },
    {
        "id": "next-session",
        "label": "다음 거래일 계획",
        "group": "discover",
        "purpose": "세션·조건·보류·재평가 계획",
        "preserveExisting": false,
        "route": null,
        "components": [],
        "apis": [],
        "sources": [],
        "tests": [],
        "implementation": "PROPOSED",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "공식 거래소 달력과 목표 세션 계약 연결 전"
    },
    {
        "id": "public-portfolios",
        "label": "투자자 공개 포트폴리오",
        "group": "discover",
        "purpose": "기준일/공개일/수집일을 구분한 공개자료",
        "preserveExisting": false,
        "route": null,
        "components": [],
        "apis": [],
        "sources": [],
        "tests": [],
        "implementation": "PROPOSED",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "13F 공개일/기준일/수집일을 구분하는 전용 흐름 없음"
    },
    {
        "id": "analysis-history",
        "label": "분석 이력·OUTDATED",
        "group": "records",
        "purpose": "동일 입력·새 revision·오류 노출 구분",
        "preserveExisting": true,
        "route": "/stocks/:symbol",
        "components": [
            "src/features/stock-research/owner-analysis-view.ts",
            "server/_shared/owner-analysis-store.ts",
            "server/_shared/owner-analysis-lifecycle.ts"
        ],
        "apis": [
            "api/autonomous-learning.ts",
            "api/market/v1/[rpc].ts"
        ],
        "sources": [
            "immutable evidence + retained brief"
        ],
        "tests": [
            "tests/owner-analysis-store.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "저장·OUTDATED 경로 존재; 전체 revision 탐색 전용 화면은 미연결"
    },
    {
        "id": "decision",
        "label": "판단·위험 티켓",
        "group": "records",
        "purpose": "선정/보류/취소 이유·조건",
        "preserveExisting": true,
        "route": "/stocks/:symbol#ticker-360-risk",
        "components": [
            "src/features/stock-research/ticker-decision-model.ts",
            "src/features/stock-research/risk-ticket-model.ts"
        ],
        "apis": [
            "api/market/v1/[rpc].ts"
        ],
        "sources": [
            "risk ticket",
            "canonical stock evidence"
        ],
        "tests": [
            "tests/risk-ticket-model.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "판단 모델 존재; 사용자 선정/보류 원장과 동일하지 않음"
    },
    {
        "id": "action-outcome",
        "label": "행동·결과",
        "group": "records",
        "purpose": "실제/모의 행동·수수료·환율·비교 기준",
        "preserveExisting": true,
        "route": "/stocks/:symbol#ticker-360-cases",
        "components": [
            "src/features/stock-research/open-outcome-replay-view.ts",
            "src/features/stock-research/signal-lab-persistence.ts"
        ],
        "apis": [
            "api/autonomous-learning.ts"
        ],
        "sources": [
            "historical replay",
            "Toss read-only trade history"
        ],
        "tests": [
            "tests/dom/open-outcome-replay-view.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "모의·실제 결과를 혼합하지 않음; 사용자 행동 연결 완전성 미검증"
    },
    {
        "id": "learning",
        "label": "회고·규칙·학습",
        "group": "records",
        "purpose": "반복 오류·개선 규칙의 버전",
        "preserveExisting": true,
        "route": "/stocks/:symbol#ticker-360-learning",
        "components": [
            "src/features/stock-research/signal-lab-contract.ts",
            "src/features/stock-research/signal-lab-persistence.ts",
            "shared/autonomous-learning-core.ts"
        ],
        "apis": [
            "api/autonomous-learning.ts"
        ],
        "sources": [
            "PIT cases/outcomes",
            "owner behavior"
        ],
        "tests": [
            "tests/autonomous-learning-core.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "브라우저 localStorage 연구 기록과 서버 PIT는 별개 저장 경로"
    },
    {
        "id": "all-features",
        "label": "전체 기능·검색",
        "group": "all",
        "purpose": "중앙 레지스트리·검색·즐겨찾기·기능 상태",
        "preserveExisting": false,
        "route": null,
        "components": [],
        "apis": [],
        "sources": [],
        "tests": [],
        "implementation": "PROPOSED",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "격리 미리보기에서 검색·분류·즐겨찾기 구현; 운영 메뉴 미연결"
    },
    {
        "id": "market",
        "label": "시장·업종·breadth",
        "group": "all",
        "purpose": "직접 지표와 proxy·coverage",
        "preserveExisting": true,
        "route": "/#panelsGrid",
        "components": [
            "src/features/product-recovery/market-breadth-intelligence.ts",
            "shared/owner-market-context.ts"
        ],
        "apis": [
            "api/market/v1/[rpc].ts"
        ],
        "sources": [
            "EODHD breadth",
            "market context"
        ],
        "tests": [
            "tests/market-breadth-eodhd.test.mjs"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "전체 시장 breadth를 반도체 직접 지수로 표시하지 않음"
    },
    {
        "id": "macro",
        "label": "경제·원자재·환율",
        "group": "all",
        "purpose": "관측/발표/수집 시점·단위",
        "preserveExisting": true,
        "route": "/stocks/:symbol",
        "components": [
            "src/features/stock-research/owner-intelligence-view.ts",
            "server/_shared/owner-public-macro.ts"
        ],
        "apis": [
            "api/autonomous-learning.ts",
            "api/market/v1/[rpc].ts"
        ],
        "sources": [
            "FRED",
            "ECB reference FX"
        ],
        "tests": [
            "tests/owner-public-macro.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "관측 시점·단위 보존; ECB는 체결 환율 아님"
    },
    {
        "id": "news",
        "label": "뉴스·번역",
        "group": "all",
        "purpose": "관련성·번역 fallback·원문 보존",
        "preserveExisting": true,
        "route": "/stocks/:symbol",
        "components": [
            "src/features/stock-research/owner-news-clusters.ts",
            "server/_shared/owner-intelligence.ts"
        ],
        "apis": [
            "api/autonomous-learning.ts",
            "api/market/v1/[rpc].ts"
        ],
        "sources": [
            "EODHD news",
            "SEC event clusters"
        ],
        "tests": [
            "tests/owner-news-clusters.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "한국어 번역 실패 시 원문 유지; 완전 번역 보장 아님"
    },
    {
        "id": "sec",
        "label": "SEC·공시 원문",
        "group": "all",
        "purpose": "원문 장기 보존·시점 근거",
        "preserveExisting": true,
        "route": "/stocks/:symbol#ticker-360-evidence",
        "components": [
            "server/_shared/sec-filing-evidence.ts",
            "src/features/stock-research/stock-research-overlay.ts"
        ],
        "apis": [
            "api/autonomous-learning.ts",
            "api/market/v1/[rpc].ts",
            "api/intelligence/v1/[rpc].ts"
        ],
        "sources": [
            "SEC EDGAR",
            "last-confirmed evidence"
        ],
        "tests": [
            "tests/sec-fpi-risk-evidence.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "원문 장기 보존 코드 존재; 자연 TTL 회복은 별도 관찰"
    },
    {
        "id": "capital-actions",
        "label": "자본·희석·기업행동",
        "group": "all",
        "purpose": "ATM capacity/actual issuance·split·listing",
        "preserveExisting": true,
        "route": "/stocks/:symbol#ticker-360-risk",
        "components": [
            "src/features/stock-research/risk-ticket-model.ts",
            "server/_shared/sec-filing-evidence.ts"
        ],
        "apis": [
            "api/market/v1/[rpc].ts"
        ],
        "sources": [
            "SEC corporate intelligence"
        ],
        "tests": [
            "tests/sec-corporate-intel.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "ATM capacity와 실제 issuance는 구분; 독립 페이지 없음"
    },
    {
        "id": "short-data",
        "label": "공매도 관련 근거",
        "group": "all",
        "purpose": "short volume/interest/FTD 의미 구분",
        "preserveExisting": true,
        "route": "/stocks/:symbol",
        "components": [
            "src/features/stock-research/signal-lab-contract.ts",
            "server/_shared/owner-intelligence.ts"
        ],
        "apis": [
            "api/autonomous-learning.ts",
            "api/market/v1/[rpc].ts"
        ],
        "sources": [
            "typed short/option availability"
        ],
        "tests": [
            "tests/owner-intelligence.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "종류별 계약 존재; 실제 판단에 쓸 직접 자료 연결 부족"
    },
    {
        "id": "bridge",
        "label": "JASYNQ 연결",
        "group": "all",
        "purpose": "계약·동기화·heartbeat·outcome 실제 검증",
        "preserveExisting": true,
        "route": null,
        "components": [
            "src/services/jasynq-settings-content.ts",
            "server/_shared/intelligence-bridge-store.ts"
        ],
        "apis": [],
        "sources": [
            "intelligence bridge contract"
        ],
        "tests": [
            "tests/intelligence-bridge-contract.test.mts",
            "tests/intelligence-bridge-endpoints.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "연결 계약·설정 존재; 실제 동기화/heartbeat/outcome 미검증"
    },
    {
        "id": "health",
        "label": "데이터·운영 진단",
        "group": "all",
        "purpose": "owner-critical와 global/legacy 구분",
        "preserveExisting": true,
        "route": null,
        "components": [
            "src/features/stock-research/owner-critical-health.ts",
            "src/components/UnifiedSettings.ts"
        ],
        "apis": [
            "api/health.js"
        ],
        "sources": [
            "owner-critical coverage",
            "global/legacy health"
        ],
        "tests": [
            "tests/owner-real-use-data.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "진단 구현 존재; 독립 URL와 owner 접근 전수 확인 전"
    },
    {
        "id": "settings",
        "label": "설정·예산·접근",
        "group": "all",
        "purpose": "개인 권한·비용 범위·기능 설정",
        "preserveExisting": true,
        "route": "/settings.html",
        "components": [
            "src/components/UnifiedSettings.ts",
            "src/services/owner-shell-policy.ts",
            "server/_shared/owner-llm.ts"
        ],
        "apis": [],
        "sources": [
            "deployment policy",
            "configured owner AI budget"
        ],
        "tests": [
            "tests/owner-shell-policy.test.mts",
            "tests/owner-llm.test.mts"
        ],
        "implementation": "EXISTING_PARTIAL",
        "acceptance": "NOT_TESTED_THIS_ROUND",
        "access": "OWNER_ONLY_UNVERIFIED",
        "note": "서버 설정 예산을 재사용; 설정 파일/secret 노출 없음"
    }
];
export function findOwnerFeatures(query: string, section: OwnerPreviewSection = 'all'): readonly OwnerFeature[] {
    const needle = query.trim().toLocaleLowerCase();
    return OWNER_FEATURES.filter(f => (section === 'all' || f.group === section) && (!needle || [f.label, f.purpose, f.note, f.id].join(' ').toLocaleLowerCase().includes(needle)));
}
