---
phase: 08-sales-aggregate
plan: 01
subsystem: ui
tags: [vanilla-js, iife, overlay, sales, aggregation]

requires:
  - phase: 04-sales-history
    provides: salesHistoryUI.js IIFE 패턴, getInvoiceHistory(), _calcPeriodSales(), openSalesPanel()

provides:
  - _thisQuarterRange(): 이번 분기 날짜 범위 반환
  - _lastQuarterRange(): 지난 분기 날짜 범위 반환 (1월 기준 전년도 4분기)
  - _buildCustomerAggregates(): 전체 고객별 거래금액·미수금 집계 (삭제됨·cancelled 제외)
  - openCustomerSummaryPanel(): 고객별 집계 오버레이 UI (미수금 내림차순 정렬)
  - SalesHistoryUI.openCustomerSummaryPanel 공개 API

affects:
  - index.html (진입점 버튼)
  - salesHistoryUI.js

tech-stack:
  added: []
  patterns:
    - "분기 범위 계산: Math.floor(month/3)로 분기 인덱스, year-1/lastQ=3으로 연도 경계 처리"
    - "고객 집계: payments 배열 우선, paidAmount fallback으로 이중 데이터 구조 호환"
    - "오버레이 지연 초기화: _custSummaryOverlay=null 클로저 변수로 첫 호출 시에만 DOM 생성"

key-files:
  created: []
  modified:
    - salesHistoryUI.js
    - index.html

key-decisions:
  - "payments.cancelled 제외 계산: payments 배열이 있는 레코드는 filter(!p.cancelled).reduce로, 없으면 paidAmount fallback"
  - "분기 버튼은 '직접 입력' 버튼 다음에 추가 — 기존 버튼 순서 유지, 분기 버튼 후미 배치"
  - "고객별 집계 버튼: btn-all-unpaid 클래스 재사용, green 계열 스타일 구분"

patterns-established:
  - "분기 경계 처리: lastQ<0이면 lastQ=3, year-=1 — 1월 기준 전년도 4분기 정확 처리"

requirements-completed: [SALE-04, SALE-05]

duration: 15min
completed: 2026-03-27
---

# Phase 8 Plan 01: 매출 집계 — 분기 조회 + 고객별 집계 Summary

**salesHistoryUI.js에 분기 범위 함수 2개(thisQ/lastQ) + 고객별 집계 오버레이(미수금 내림차순, payments.cancelled 제외) 추가, index.html에 진입점 버튼 삽입**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-27T00:00:00Z
- **Completed:** 2026-03-27T00:15:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- SALE-04: 매출 집계 패널에 '이번 분기' · '지난 분기' 버튼 추가, 클릭 시 해당 분기 범위로 _renderSalesStats 호출
- SALE-05: 전체 고객 거래금액·미수금 집계 오버레이 (_buildCustomerAggregates → openCustomerSummaryPanel), 삭제됨 제외, payments.cancelled 제외 정확 계산
- 미수금 내림차순 정렬로 미수금 많은 고객 즉시 파악 가능

## Task Commits

Each task was committed atomically:

1. **Task 1: SALE-04 — 분기 범위 함수 + 버튼 + 핸들러 수정** - `7a5603a` (feat)
2. **Task 2: SALE-05 — 고객별 집계 함수 + 오버레이 UI + 진입점 버튼** - `4977f8b` (feat)

## Files Created/Modified

- `salesHistoryUI.js` - _thisQuarterRange(), _lastQuarterRange(), _buildCustomerAggregates(), openCustomerSummaryPanel(), CSS 추가, 공개 API 확장
- `index.html` - '고객별 집계' 진입점 버튼 추가 (line 700)

## Decisions Made

- payments.cancelled 제외: `h.payments.filter(p => !p.cancelled).reduce(sum, 0)` — cancelled 처리된 입금은 미수금 계산에서 제외
- 분기 버튼을 '직접 입력' 버튼 다음에 배치 — 기존 버튼 순서 유지
- 고객별 집계 버튼: 기존 btn-all-unpaid 클래스에 green 인라인 스타일로 시각 구분

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SALE-04, SALE-05 요구사항 완료 — v1.1 milestone 기능 구현 완료
- 브라우저에서 index.html을 열어 '매출 집계' 패널의 분기 버튼 및 '고객별 집계' 오버레이 수동 검증 권장

---
*Phase: 08-sales-aggregate*
*Completed: 2026-03-27*
