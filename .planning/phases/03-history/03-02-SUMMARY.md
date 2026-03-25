---
phase: 03-history
plan: 02
subsystem: ui
tags: [vanilla-js, modal, prescription-history, template-banner, area-scaling]

# Dependency graph
requires:
  - phase: 03-history/03-01
    provides: CustomerDB.searchPrescriptions/searchPrescriptionsByCrop/listPrescriptions, CustomerUI.getCurrentCustomerId/refreshHistoryBadge

provides:
  - window.PrescriptionHistoryUI.openModal() — 처방이력 모달 열기
  - window.PrescriptionHistoryUI.closeModal() — 처방이력 모달 닫기
  - prescriptionHistoryUI.js — 처방이력 모달 UI + 템플릿 추천 배너 + 면적 비례 조정

affects:
  - index.html (historyPill, cCrop 이벤트 연결, ordList 앞 tmplBanner 삽입)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IIFE + window.PrescriptionHistoryUI 공개 API 패턴 — customerUI.js와 동일 구조"
    - "JSON.parse(JSON.stringify(snapshot)) deep copy — 원본 스냅샷 불변 보장"
    - "debounce 200ms (setTimeout) — 텍스트 필터 입력 최적화"
    - "ordList.parentElement.insertBefore(tmplBanner, ordList) — 배너 동적 삽입"
    - "document event delegation — 동적 삽입 버튼(tmplUseBtn/tmplSkipBtn) 이벤트 처리"

key-files:
  created:
    - prescriptionHistoryUI.js
  modified: []

key-decisions:
  - "템플릿 배너 버튼 이벤트: document delegation 방식 — DOMContentLoaded 이후 동적 삽입된 버튼을 addEventListener로 직접 연결하면 타이밍 이슈 가능성 있어 document click delegation 사용"
  - "cCrop change 이벤트: input 아닌 change 사용 — select 요소는 change 이벤트가 올바른 선택"

patterns-established:
  - "prescriptionHistoryUI.js: IIFE 안 전역 cart 직접 접근 — 빌드 없는 바닐라 JS에서 전역 변수 공유"

requirements-completed: [HIST-02, TMPL-01, TMPL-02]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 03 Plan 02: 처방이력 UI + 템플릿 배너 + 면적 비례 조정 Summary

**처방이력 모달(필터/불러오기) + 템플릿 추천 배너 + 면적 비례 수량 조정 IIFE 구현 — JSON deep copy로 원본 스냅샷 불변 보장**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T04:25:13Z
- **Completed:** 2026-03-25T04:28:00Z
- **Tasks:** 1 auto + 1 checkpoint (human-verify pending)
- **Files created:** 1

## Accomplishments

- `prescriptionHistoryUI.js` 생성 (424 lines) — IIFE 패턴, window.PrescriptionHistoryUI 공개 API
- 처방이력 모달: 고객명/작물/날짜 4-필터 + 200ms debounce 텍스트 필터
- `_loadSnapshotIntoCart`: deep copy 원본 보호, cart 교체 + 폼 전체 채우기 + applyGlobalDisc/render/syncPrint 호출
- `_scaleItemsByArea`: Math.max(1, Math.round(qty * ratio)) 면적 비례 조정, sourceArea <= 0 guard
- `_onCropChange`: searchPrescriptionsByCrop → 템플릿 배너 표시/숨기기
- historyPill click, cCrop change 이벤트 연결
- tmplBanner를 ordList 앞에 insertBefore로 동적 삽입

## Task Commits

1. **Task 1: prescriptionHistoryUI.js 생성** - `811fa6f` (feat)

## Files Created/Modified

- `prescriptionHistoryUI.js` — 처방이력 모달 + 템플릿 배너 + 면적 비례 조정 완전 구현

## Decisions Made

- 템플릿 배너 버튼 이벤트: document click delegation 방식 채택 — DOMContentLoaded 이후 동적 삽입된 요소의 이벤트 안전 처리
- cCrop change 이벤트 사용 확인 — select 요소에 적합한 이벤트 타입

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — 모든 기능이 실제 CustomerDB API에 연결됨.

## Issues Encountered

None.

## Human Verify Required

Task 2 (checkpoint:human-verify) 브라우저 검증 대기 중:
1. HIST-01: 발행 후 localStorage에 스냅샷 저장 확인
2. HIST-03: historyPill 모달 열림 + 필터 동작 확인
3. HIST-02: 이력 항목 클릭 후 장바구니/폼 복원 확인
4. TMPL-01: 작물 변경 시 템플릿 배너 나타남 확인
5. TMPL-02: 면적 비례 수량 조정 확인
6. 이력 없는 작물 선택 시 배너 미표시 확인

## Self-Check: PASSED

- prescriptionHistoryUI.js: FOUND
- Commit 811fa6f: FOUND

---
*Phase: 03-history*
*Completed: 2026-03-25*
