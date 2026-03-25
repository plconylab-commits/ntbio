---
phase: 03-history
plan: 01
subsystem: database
tags: [localStorage, vanilla-js, prescription-history, customer-db]

# Dependency graph
requires:
  - phase: 02-db
    provides: customerDB.js IIFE with KEYS/list/save/findById, customerUI.js autocomplete

provides:
  - CustomerDB.savePrescrSnapshot(snapshot) — 처방이력 스냅샷 저장
  - CustomerDB.listPrescriptions(customerId) — 고객별/전체 이력 조회
  - CustomerDB.searchPrescriptions(opts) — name/crop/dateFrom/dateTo 복합 필터
  - CustomerDB.searchPrescriptionsByCrop(crop) — 작물별 템플릿 추천 검색
  - CustomerDB.deletePrescription(id) — 개별 처방이력 삭제
  - window.CustomerUI.getCurrentCustomerId() — 현재 선택 고객 ID getter
  - window.CustomerUI.refreshHistoryBadge() — 처방이력 배지 갱신
  - index.html _buildPrescrSnapshot() — 처방이력 스냅샷 빌드 헬퍼
  - doPrint/doPdf/doEmail — 발행 시 처방이력 자동 저장

affects:
  - 03-history/03-02 (처방이력 UI가 이 API를 소비)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "처방이력 스냅샷: 발행 함수 호출 시 자동 저장 (doPrint/doPdf/doEmail after saveInvoice)"
    - "window.CustomerUI 외부 API 패턴 — IIFE 클로저 안 private 변수를 안전하게 노출"
    - "QuotaExceededError try/catch — localStorage 용량 초과 대응"
    - "_savePrescrSnapshotSafe() 래퍼 — CustomerDB/CustomerUI undefined 방어"

key-files:
  created: []
  modified:
    - customerDB.js
    - customerUI.js
    - index.html

key-decisions:
  - "발행 시 자동 저장 trigger: saveInvoice() 직후 _savePrescrSnapshotSafe() 호출 — 별도 저장 버튼 불필요"
  - "CustomerUI 외부 API를 IIFE 안 DOMContentLoaded 콜백 밖에 배치 — closure 접근 + DOM 불필요 조기 노출"
  - "searchPrescriptions name 필터: toLowerCase().includes() — 대소문자 무시 부분 매칭"

patterns-established:
  - "처방이력 스냅샷 구조: customerId, customer(name/crop/area/region/phone), items[], discountRate, vatIncluded, totals{supply/grandTotal}"
  - "처방이력 ID 패턴: 'p_' + Date.now() + '_' + random 4자리"

requirements-completed: [HIST-01, HIST-03]

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 03 Plan 01: 처방이력 + 템플릿 데이터 레이어 Summary

**localStorage 기반 처방이력 CRUD 5종 + 발행(인쇄/PDF/이메일) 시 자동 스냅샷 저장 후킹 — Plan 02 UI의 데이터 기반 완성**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T04:18:00Z
- **Completed:** 2026-03-25T04:22:52Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- CustomerDB에 5개 처방이력 메서드 추가 (savePrescrSnapshot/list/search/searchByCrop/delete)
- window.CustomerUI 외부 API로 getCurrentCustomerId + refreshHistoryBadge 게터 노출
- doPrint/doPdf/doEmail 3개 발행 함수 모두에 처방이력 자동 저장 후킹
- prescriptionHistoryUI.js script 태그를 올바른 load order로 추가 (Plan 02 준비)

## Task Commits

Each task was committed atomically:

1. **Task 1: CustomerDB 처방이력 CRUD + CustomerUI getter 추가** - `ba189d9` (feat)
2. **Task 2: index.html 스냅샷 빌더 + 발행 함수 후킹 + script 태그** - `30faa3c` (feat)

## Files Created/Modified
- `customerDB.js` — savePrescrSnapshot/listPrescriptions/searchPrescriptions/searchPrescriptionsByCrop/deletePrescription 5개 메서드 추가
- `customerUI.js` — window.CustomerUI 외부 API (getCurrentCustomerId, refreshHistoryBadge) 추가
- `index.html` — _buildPrescrSnapshot + _savePrescrSnapshotSafe 헬퍼 추가, doPrint/doPdf/doEmail 후킹, prescriptionHistoryUI.js 태그 추가

## Decisions Made
- 발행 시 자동 저장: 별도 저장 버튼 없이 saveInvoice() 직후 스냅샷 저장으로 결정 — 기존 UX 흐름 유지
- window.CustomerUI IIFE 안 DOMContentLoaded 밖 배치 — _currentCustomerId 클로저 접근 가능하면서도 DOM 필요 없는 공개 시점

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 모든 처방이력 API가 준비됨 — Plan 02(처방이력 UI)가 즉시 소비 가능
- prescriptionHistoryUI.js script 태그 포함 완료 (파일은 Plan 02에서 생성)
- 빈 장바구니 guard 동작: _buildPrescrSnapshot 에서 cart.length 0 시 null 반환

---
*Phase: 03-history*
*Completed: 2026-03-25*
