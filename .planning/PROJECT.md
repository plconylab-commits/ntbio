# 천연비료처방전 웹앱

## What This Is

천연바이오 비료회사 내부용 웹앱. 처방전 PDF를 업로드하면 거래명세표가 자동으로 완성되고, 고객 DB·처방이력·거래이력·미수금을 localStorage로 관리한다. 처방전↔거래명세표 diff 대조 기능으로 오류를 사전에 검출한다.

v1.0 MVP 출시 완료 (2026-03-27). 6 phases, 11 plans, 바닐라 JS + localStorage 구조.

## Core Value

처방전 PDF(또는 기존 처방 데이터)를 불러오면 거래명세표가 자동으로 완성되어야 한다 — 최소한의 수작업으로.

## Requirements

### Validated (v1.0)

- ✓ 처방전 PDF → Vision API 파싱 → 장바구니 자동 입력 — 기존 구현
- ✓ 제품 DB(옥토팜, 옥스팜, 뉴천연팜 등) 관리 — 기존 구현
- ✓ 거래명세표 UI 및 인쇄 기능 — 기존 구현
- ✓ 고객 정보(이름, 작물, 면적) 자동 입력 — 기존 구현
- ✓ PDF 파싱 4종 버그 수정 (PARSE-01~04) — v1.0
- ✓ 고객 DB CRUD + 자동완성 + 할인율 관리 (CUST-01~05, DISC-01~02) — v1.0
- ✓ 처방이력 저장·불러오기·템플릿 추천 (HIST-01~03, TMPL-01~02) — v1.0
- ✓ 거래이력·미수금 저장 및 조회 (SALE-01~03) — v1.0
- ✓ 인쇄/PDF 버그 수정 (PRINT-01~04) — v1.0
- ✓ 처방전↔거래명세표 diff 대조 (XCHK-01~06) — v1.0

### Active (v1.1 후보)

- [ ] **SALE-04**: 기간별(월/분기) 매출 합계 조회 — v1.0 Known Gap
- [ ] **SALE-05**: 고객별 총 거래금액 및 미수금 조회 — v1.0 Known Gap

### Out of Scope

- 외부 공개 고객 포털 — 내부 업무용, 로그인/권한 불필요
- 모바일 앱(네이티브) — 웹 반응형으로 충분
- 재고 관리 — 별도 시스템
- 실시간 다중 사용자 — localStorage 기반, 단일 기기

## Context

**v1.0 출시 후 현재 상태:**
- 코드베이스: `index.html`, `main.js`, `prescriptionModel.js`, `productDB.js`, `uiController.js` + `customerDB.js`, `customerUI.js`, `salesHistoryUI.js`, `rxCompare.js`, `rxCompareUI.js`
- localStorage keys: `fertilizer_customers`, `fertilizer_prescriptions`, `fertilizer_transactions`
- 처방전 파싱: pdfParser.js + Vision API (Claude)
- 인쇄/PDF: html2canvas + jsPDF
- 총 LOC: ~16,571 lines (JS + HTML)

**Known Issues:**
- SALE-04/05 (기간별 매출, 고객별 미수금 조회) 미구현
- 고객명 매칭: PDF `farmInfo.farmName` ↔ localStorage `name` 부분 매칭 검증 필요

## Constraints

- **Tech Stack**: 바닐라 JS + HTML/CSS — 빌드 도구 없이 브라우저에서 바로 실행
- **AI API**: Claude Vision API (처방전 PDF 파싱)
- **데이터 저장**: localStorage — 클라우드 동기화는 v2 이후
- **인쇄**: 거래명세표 및 처방전 인쇄 기능 유지 필수

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 바닐라 JS + localStorage 유지 | 빌드 도구 없이 즉시 실행, 기존 코드 일관성 | ✓ Good — 11 plans 완성, 회귀 없음 |
| 평당가: 합계 행에서만 추출 | 복합형 처방전 중간 행은 부분값 | ✓ Good |
| IIFE + window.XXX 네임스페이스 | 빌드 없이 전역 접근 | ✓ Good — 5개 모듈 동일 패턴 |
| 발행 시 자동 스냅샷 | 별도 저장 버튼 불필요 | ✓ Good |
| 처방전 비교: 카트 덮어쓰지 않음 | 표시 전용, 실수 방지 | ✓ Good |
| 퍼지 매칭: lowercase + 특수문자 제거 후 contains | 한국어 제품명 부분일치 처리 | ✓ Good — 1:1 greedy로 중복 방지 |

## Evolution

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-27 after v1.0 milestone*
