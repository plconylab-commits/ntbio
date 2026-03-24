# Project Research Summary

**Project:** 천연비료처방전 — 고객 DB / 처방 템플릿 / 할인율 / 매출 추적 마일스톤
**Domain:** 소규모 내부용 영업 관리 웹앱 (비료 처방전 → 거래명세표 자동화)
**Researched:** 2026-03-24
**Confidence:** HIGH

---

## Executive Summary

천연비료처방전은 천연바이오 내부 직원 1~2명이 사용하는 단일 페이지 바닐라 JS 앱이다. 처방전 PDF를 Claude Vision API로 파싱해 거래명세표를 자동 완성하는 기능이 이미 구현되어 있으며, 이번 마일스톤은 그 위에 고객 DB, 처방 템플릿, 할인율 관리, 미수금/매출 집계를 추가하는 것이다. 빌드 도구 없이 브라우저에서 직접 실행하고 서버가 없다는 제약이 모든 기술 결정의 기준이다.

기술 스택은 현재 구조를 유지한다. localStorage를 primary datastore로 사용하고, 신규 기능은 전부 새로운 JS 파일(`customerDB.js`, `salesDB.js`, `customerUI.js`, `salesUI.js`)로 추가하며 기존 파일을 최소한으로만 수정한다. 이 접근은 회귀 위험을 낮추고, 기존 코드에 익숙한 사람이 신규 파일을 독립적으로 이해할 수 있게 한다. localStorage의 5~10MB 한도는 예상 데이터 규모(2~6MB)에서 충분하지만, 데이터 소실 위험을 막기 위해 JSON export/import 기능을 고객 DB 구현 첫날에 함께 만드는 것이 필수다.

알려진 버그인 평당가 파싱 오류는 `pdfParser.js`의 `extractCostPageData()` 함수에 국한된 문제이며 해결책이 명확하다: 합계 행 우선 탐색 로직(`pyeongFromTotal` 변수 분리)으로 교체하면 된다. 이 버그를 가장 먼저 수정해야 한다 — 처방이력 저장 시 잘못된 평당가가 기록되면 모든 이후 매출 집계가 오염되기 때문이다.

---

## Key Findings

### Recommended Stack

빌드 도구 없이 브라우저에서 직접 실행하는 현재 구조를 완전히 유지한다. 새 기능은 `<script src="...">` 태그로 파일을 추가하는 방식으로 구현한다. 외부 라이브러리는 추가하지 않는다 (매출 그래프 시각화 요구 발생 시에만 Chart.js CDN 허용). Google Apps Script 연동은 이미 `apps-script-invoice.js`로 구현되어 있으며 localStorage가 source of truth이고 GAS는 클라우드 백업 역할에만 사용한다.

**Core technologies:**
- Vanilla JS (ES2020+): 앱 로직 전체 — 빌드 없이 실행, 기존 코드 일관성
- localStorage: 고객/처방/거래 데이터 저장 — 현재 코드에 이미 사용 중(`rxCostData`), 예상 데이터 규모(2~6MB)에서 충분
- `window.CustomerDB` / `window.SalesDB` 네임스페이스: 전역 스코프 오염 최소화하는 모듈 패턴
- `storageService.js` 추상화 레이어: 나중에 서버 DB 전환 시 UI 코드 수정 없이 교체 가능 (선택이지만 권장)

**스키마 키 구조:**
- `fertilizer_customers` — 고객 배열
- `fertilizer_prescriptions` — 처방 이력 배열
- `fertilizer_transactions` — 거래명세표 배열
- `fertilizer_schema_version` — 마이그레이션 버전 관리

**채택하지 않는 기술:**
React/Vue/Svelte (빌드 도구 필요), IndexedDB 직접 사용 (API 복잡도 대비 이득 없음), Firebase/Supabase (서버 비용, 인터넷 의존성)

### Expected Features

**Must have (table stakes) — 없으면 마일스톤 목표 미달:**
- 고객 자동완성 / 불러오기 — 고객명 입력 시 localStorage 검색 → 드롭다운, 선택 시 전체 폼 자동 채우기
- 고객별 할인율 저장 및 자동 적용 — 고객 선택 시 `#gDisc` 자동 세팅
- 처방이력 저장 (거래명세표 스냅샷) — 발행 시 자동 저장, 분쟁/재발행 대응
- 기존 처방 불러와 복사·수정·재발행 — 원본 보존, "복사 후 편집" 원칙
- 처방 템플릿 (작물 기반) — `isTemplate: true` 플래그로 기존 처방이력을 템플릿 지정
- 미수금 금액 입력 및 결제 처리 — 처방이력에 `payments: []` 배열, 상태 `unpaid/partial/paid` 자동 갱신
- 기간별 매출 합계 — 처방이력 집계, 단순 합산으로 충분

**Should have (있으면 좋음):**
- 고객 메모 필드 — 비정형 정보 보존 (구현 단순)
- 지역별 미수금 그룹핑 — 기존 `.au-region-card` CSS가 이미 준비됨, `cRegion` 기반
- 작물 × 평수 범위 기반 템플릿 추천 — 자동 제안

**Defer (v2+):**
- 처방 비교 diff, 작물 × 평수 자동 매칭, 엑셀 내보내기, 고객 전용 CRUD 관리 화면
- SMS/카카오 알림, 세금계산서 자동 발행, 월별 차트

**Anti-features (유혹이지만 하지 않는 것):**
- 로그인/권한 시스템 — 1~2인 내부용, 오버엔지니어링
- 재고 관리 — scope 외
- 다중 사용자 실시간 동기화 — localStorage로 시작, 나중에 JSON export/import

### Architecture Approach

기존 파일 구조를 그대로 유지하고 신규 파일만 추가하는 전략이다. `main.js`에는 고객 자동 매칭과 거래명세표 발행 시 이력 저장, 두 개의 훅만 추가한다. 신규 파일들은 `window.CustomerDB`, `window.SalesDB` 네임스페이스로 격리되어 전역 충돌을 방지한다. 기존 코드(`pdfParser.js` 600줄 등)의 전면 재작성은 회귀 위험이 크므로 핀포인트 수정(`extractCostPageData`만 변경)에 그친다.

**Major components:**
1. `customerDB.js` — 고객/처방이력 CRUD, localStorage 어댑터 (스토리지 추상화 내장)
2. `salesDB.js` — 거래명세표 저장, 미수금 추적, 매출 집계 (customerDB.js 의존)
3. `customerUI.js` — 고객 검색/선택 모달, 처방이력 불러오기 UI
4. `salesUI.js` — 거래이력 조회, 미수금 현황, 매출 집계 화면
5. `pdfParser.js` (기존, 핀포인트 수정) — `extractCostPageData()` 합계 행 우선 탐색으로 평당가 버그 수정

### Critical Pitfalls

1. **localStorage 데이터 무손실 전제** — 브라우저 캐시 삭제 시 모든 데이터 소실. 고객 DB 구현 첫날에 JSON export/import 기능을 함께 구현해야 한다. 4MB 초과 시 경고 표시 추가.

2. **평당가 중간값 오인식** — 복합형 처방전(천혜향 등)에서 중간 소계 행의 평당가가 최종값으로 잘못 추출됨. `pdfParser.js`의 `extractCostPageData()`에서 `pyeongFromTotal`(합계 행 평당가)과 `pyeongLastSeen`(fallback)을 분리 추적하는 방식으로 수정. 검증 모달에서 평당가를 명시적으로 표시하고 수동 수정 가능하게 해야 한다.

3. **광고 페이지 처방 데이터 혼입** — PDF 마지막 홍보 페이지를 처방 항목으로 오인식. 비용 페이지(`detectCostPage()`) 이후 페이지 무시 로직, `MAX_PAGES = 8` 제한 유지.

4. **Vision API JSON 아닌 응답 반환** — LLM이 코드 블록으로 감싸거나 전치 문장을 추가할 수 있음. `JSON.parse()` 전 `{`부터 `}` 사이만 추출하는 전처리 강화.

5. **DOM을 데이터베이스로 사용** — 현재 폼 값이 source of truth인 구조에서 처방이력 저장 시 DOM 긁기를 하면 레이아웃 변경에 깨지기 쉬움. `buildTransactionData()` 순수 함수로 DOM 읽기를 한 곳에 격리해야 한다.

---

## Implications for Roadmap

모든 기능이 고객 DB의 `customerId`에 의존하는 단방향 의존성 그래프가 명확하다. 이 의존성이 페이즈 순서를 결정한다.

```
평당가 버그 수정 (기반 데이터 정확성)
  └── 고객 DB + 자동완성 + JSON export (모든 이후 기능의 기반)
       └── 처방이력 저장 + 기존 처방 불러오기
            └── 처방 템플릿 (처방이력 위에 isTemplate 플래그)
            └── 할인율 자동 적용 (고객 레코드 discount 필드)
            └── 미수금/납부 처리 (처방이력에 payments 배열)
                 └── 매출 집계 화면 (처방이력 + payments 집계 뷰)
```

### Phase 1: 평당가 버그 수정 + 기반 인프라

**Rationale:** 저장되는 데이터의 정확성을 먼저 확보해야 한다. 잘못된 평당가가 처방이력에 저장되면 이후 매출 집계가 오염된다. 동시에 localStorage 스키마, `customerDB.js` 뼈대, JSON export/import를 초기에 구현해 이후 모든 페이즈가 의존할 기반을 만든다.

**Delivers:**
- 정확한 평당가 추출 (단순형/복합형 처방전 모두)
- `fertilizer_*` localStorage 키 스키마 초기화 및 버전 관리
- 전체 데이터 JSON 내보내기/가져오기 버튼
- `customerDB.js` CRUD API (`window.CustomerDB`)

**Addresses:** 평당가 버그(PROJECT.md Active requirement 1번), localStorage 데이터 소실 위험
**Avoids:** Pitfall 1 (데이터 소실), Pitfall 2 (평당가 오인식)
**Implementation note:** `pdfParser.js`의 `extractCostPageData()`만 수정. 나머지 파일 변경 없음.

---

### Phase 2: 고객 DB + 자동완성 + 할인율

**Rationale:** 고객 레코드(`customerId`)가 없으면 처방이력, 미수금, 매출 어느 것도 고객과 연결할 수 없다. 할인율은 고객 레코드의 필드 하나 추가이므로 이 페이즈에 함께 구현한다.

**Delivers:**
- 고객명/연락처 자동완성 드롭다운 (3자 이상 입력 시 localStorage 검색)
- 고객 선택 시 전체 폼 자동 채우기 + `#gDisc` 자동 적용
- 신규 고객 자동 등록 (처방 저장 시)
- 고객 레코드 갱신 (폼 수정 후 저장 시 덮어쓰기)
- 고객별 할인율 저장 ("이 값을 고객 기본값으로 저장" 옵션)
- `customerUI.js` 고객 선택 UI

**Addresses:** 고객 DB, 할인율 관리 (PROJECT.md Active requirements)
**Avoids:** Pitfall 9 (전역 함수명 충돌 — `CustomerDB.` 네임스페이스로 격리)
**Implementation note:** `main.js`에 고객 자동 매칭 훅 3줄 추가. `index.html`에 script 태그 추가.

---

### Phase 3: 처방이력 저장 + 기존 처방 불러오기 + 템플릿

**Rationale:** 고객 레코드가 있어야 처방이력을 고객과 연결할 수 있다. 처방이력이 있어야 "불러오기"와 "템플릿" 기능 모두 구현 가능하다. 두 기능은 같은 데이터 모델(`isTemplate` 플래그)을 공유하므로 한 페이즈에 묶는다.

**Delivers:**
- 거래명세표 발행 시 처방 자동 저장 (`fertilizer_prescriptions`, `fertilizer_transactions`)
- 처방이력 목록 모달 (날짜/작물/금액/상태 카드)
- 이력 선택 → cart 복원 + 날짜 오늘로 리셋 ("복사 후 편집" 워크플로)
- 처방이력 카드에 "템플릿으로 설정" 토글
- 신규 고객 작물 입력 시 템플릿 추천 배너
- `salesDB.js` 기반 구조 + `issueInvoice()` 훅

**Addresses:** 기존 고객 처방 불러오기, 작물/평수 기반 처방 템플릿 (PROJECT.md Active requirements)
**Avoids:** Pitfall 5 (DOM 데이터베이스 안티패턴 — `buildTransactionData()` 순수 함수로 격리)
**Implementation note:** 복사 후 편집 원칙 엄수 — 원본 처방이력은 수정 불가, 항상 새 레코드로 저장.

---

### Phase 4: 미수금 / 납부 처리 / 매출 집계

**Rationale:** 처방이력 데이터(`fertilizer_transactions`)가 완성된 후에만 미수금 상태와 매출 집계가 의미 있다. 기존 UI에 미수금 오버레이(`.au-overlay`, `#unpaidOverlay`)와 관련 CSS가 이미 구현되어 있어 로직 연결에 집중할 수 있다.

**Delivers:**
- 명세표 카드에 "납부 입력" 버튼 → 금액 + 날짜 입력 모달
- 납부 후 잔액 자동 계산, 상태 자동 갱신 (`unpaid → partial → paid`)
- 미수금 전체 목록 (기존 `.au-overlay` CSS 활용, 지역별 그룹핑)
- 기간 필터 (이번 달 / 지난 달 / 직접 입력) + 매출 합계
- 인쇄 지원 (기존 `body.print-au` 스타일 활용)
- `salesUI.js` 매출 집계 화면

**Addresses:** 거래이력 및 매출 관리, 미수금 추적 (PROJECT.md Active requirements)
**Avoids:** Pitfall 1 (용량 초과 — 저장 전 `JSON.stringify(allData).length` 체크, 4MB 경고)
**Implementation note:** 기존 서버 의존 미수금 버튼들(전체/현재고객/미입금확인)을 localStorage 기반으로 전환 또는 병행.

---

### Phase Ordering Rationale

- **평당가 버그를 1번으로:** 처방이력이 쌓이기 시작하면 잘못된 평당가를 소급 수정하는 것이 불가능하다. 데이터 적재 전에 정확성을 확보하는 것이 원칙이다.
- **JSON export를 Phase 1에:** localStorage 데이터가 생기는 시점 이전에 export 기능이 있어야 한다. 나중에 추가하면 이미 쌓인 데이터가 소실될 위험이 있다.
- **할인율을 Phase 2에 묶은 이유:** 고객 레코드의 `discountRate` 필드 하나 추가로 구현 가능하다. 별도 페이즈로 분리하면 고객 DB를 두 번 건드리는 오버헤드가 생긴다.
- **처방이력/템플릿을 Phase 3에 묶은 이유:** 템플릿은 처방이력에 `isTemplate: true` 플래그만 추가하는 구조이므로 분리할 이유가 없다. 같은 UI 컴포넌트(이력 목록 모달)를 공유한다.
- **매출 집계를 마지막으로:** 데이터가 쌓여야 집계가 의미 있다. 기존 UI 구조(`.au-overlay`, CSS) 덕분에 이 페이즈는 대부분 로직 연결 작업이다.

### Research Flags

**표준 패턴, 추가 조사 불필요:**
- Phase 1 (평당가 버그 수정): 버그 위치와 해결책이 코드 분석으로 확정됨
- Phase 2 (고객 DB): localStorage CRUD 패턴, 자동완성 드롭다운은 표준 구현
- Phase 3 (처방이력): 스키마 확정, 복사/수정 워크플로 명확

**구현 중 확인 필요:**
- Phase 2: 고객명 부분 매칭 기준 (어절 단위? 자모 분리 검색?)
- Phase 3: 처방 템플릿 추천 배너의 정확한 trigger 조건 (작물명만? 작물 + 평수 범위?)
- Phase 4: 기존 서버 의존 미수금 버튼들의 전환 범위 — 서버 기능 유지 병행 vs 완전 교체

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 기존 코드 직접 분석, localStorage 용량 계산, 현재 GAS 연동 코드 확인 |
| Features | HIGH | PROJECT.md Active requirements와 1:1 대응, 기존 UI 구조(모달, CSS) 직접 파악 |
| Architecture | HIGH | 코드 직접 분석 기반. 버그 위치(`pdfParser.js` lines 75-144) 확정, 수정 코드 제시 |
| Pitfalls | HIGH | 실제 코드에서 취약점 직접 확인. localStorage 동작은 MDN 공식 문서 기반 |

**Overall confidence:** HIGH

### Gaps to Address

- **고객명 매칭 기준**: PDF `farmInfo.farmName`과 localStorage 고객 레코드 `name`의 부분 매칭 로직을 어느 수준으로 할지 미결정. 계획 단계에서 담당자에게 확인 필요 (예: "홍길동 농원" vs "홍길동").

- **기존 서버 미수금 버튼 전환 범위**: `apps-script-invoice.js`를 통한 서버 조회 기능을 localStorage 전환 시 서버 경로를 완전히 제거할지, 병행 유지할지 결정 필요. 서버에 기존 데이터가 있으면 마이그레이션 작업 추가 발생.

- **처방이력 저장 trigger**: 인쇄 버튼, 서버저장 버튼, 또는 별도 저장 버튼 중 어느 시점에 자동 저장할지 UX 결정 필요. 실수로 저장되는 미완성 명세표를 어떻게 처리할지 포함.

- **discountRate 단위**: STACK.md는 0.0~1.0 소수, FEATURES.md는 0~100 정수를 혼용 제안. 구현 전 통일 필요 (권장: 0~100 정수, 표시 시 `%` 붙이기).

---

## Sources

### Primary (HIGH confidence)
- 코드 직접 분석: `pdfParser.js` (lines 75-144), `main.js` (lines 47-77), `uiController.js`, `prescriptionModel.js`, `index.html` — 기존 구현 현황, 버그 위치, UI 구조
- `.planning/PROJECT.md` — Active requirements, 제약조건, 처방전 구조 설명
- MDN Web Docs — localStorage: `https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage`
- MDN Web Docs — Storage quotas and eviction criteria

### Secondary (MEDIUM confidence)
- 도메인 추론: 소규모 영업 CRM의 표준 UX 패턴 (자동완성, 복사/수정 워크플로, 미수금 관리)
- localStorage 용량 추정: 데이터 규모(고객 50~200명, 처방이력 수천 건) × 예상 레코드 크기

### Tertiary (LOW confidence)
- 한글 PDF 텍스트 추출 이슈: pdf.js GitHub issues — 일반적 알려진 문제이나 이 앱의 실제 처방전 PDF에서 재현 여부는 미확인
- Chrome `@media print` 동작: CSS Paged Media spec + chromium 이슈 — 실제 프린터 출력 테스트 필요

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
