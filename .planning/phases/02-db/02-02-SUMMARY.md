---
phase: 02-db
plan: 02
subsystem: customer-ui
tags: [vanilla-js, autocomplete, customer-db, discount-state, localStorage]

# Dependency graph
requires:
  - "customerDB.js CustomerDB.save/delete/search/countPrescriptions (from 02-01)"
  - "index.html applyGlobalDisc() and syncPrint() globals"
provides:
  - "customerUI.js — IIFE autocomplete dropdown, form auto-fill, discount state management"
  - "고객 저장/삭제 인라인 UI (.cust-actions row)"
affects:
  - "index.html — #cName .fg, #gDisc .fg.disc, .cust-actions, script tag"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "injectCustomerCSS() — IIFE CSS injection via <style id='cust-css'> following injectValidationCSS() pattern"
    - "Closure state variables (_savedDiscount, _currentCustomerId, _acIndex, _deleteTimer)"
    - "mousedown handler on ac items (prevents blur before click fires)"
    - "setTimeout 150ms for blur/outside-click autocomplete close (allows item click)"
    - "Inline 2-step delete confirm with 5s auto-cancel timer"

key-files:
  created:
    - customerUI.js
  modified:
    - index.html

key-decisions:
  - "mousedown (not click) on autocomplete items prevents blur-before-click race condition"
  - "setTimeout 150ms on blur/_closeAutocomplete — standard pattern for autocomplete dismiss without losing click"
  - "_savedDiscount closure variable tracks DB baseline; compare on every gDisc input to toggle temp/saved state"
  - "customerUI.js script loaded after customerDB.js so CustomerDB global is available"

# Metrics
duration: 15min
completed: 2026-03-25
---

# Phase 02 Plan 02: 고객 DB UI — 자동완성 + 폼 채우기 + 할인율 상태 Summary

**customerUI.js IIFE 신규 생성 — 이름 자동완성 드롭다운, 6개 필드 폼 자동 채우기, 저장/임시 할인율 상태 분리, 인라인 2단계 삭제 확인, 처방이력 건수 배지 완성**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-25T02:29:57Z
- **Completed:** 2026-03-25T02:45:00Z
- **Tasks:** 2 (of 3; Task 3 is human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- customerUI.js (신규): IIFE 패턴, DOMContentLoaded 초기화
  - injectCustomerCSS(): 드롭다운/버튼/배지/할인율 상태 스타일 CSS 주입, guard 포함
  - _renderAutocomplete(): 이름 substring 하이라이트 (`<span class="cust-ac-match">`), 처방이력 건수 배지, 결과 없음 "저장된 고객 없음"
  - _onCustomerSelect(): cName/cPhone/cAddr/cRegion/cArea/cCrop/gDisc 7개 필드 채우기 + 400ms flash 효과
  - _updateDiscountState('saved'|'temp'): yellow/red-lt 배경 전환 + discTempBadge/discSaveLink 표시
  - _onSaveCustomer(): CustomerDB.save() 호출, 성공 flash, "저장 중…" 로딩 상태
  - _onDeleteCustomer(): 인라인 2단계 확인("정말 삭제?" / "예, 삭제" / "취소"), 5초 자동 취소
  - _updateHistoryBadge(): countPrescriptions() 기반 pill 표시/숨김
  - 키보드 네비게이션: ArrowDown/ArrowUp/Enter/Escape
  - 외부 클릭/blur 150ms 딜레이 닫기
- index.html 수정 4곳:
  - #cName .fg: position:relative + autocomplete="off" + #historyPill + #custAutocomplete
  - #gDisc .fg.disc: position:relative + #discTempBadge + #discSaveLink
  - .cust-actions: #custSaveBtn("고객 저장") + #custDelBtn(display:none)
  - script 태그: customerDB.js 바로 뒤에 customerUI.js?v=1

## Task Commits

Each task was committed atomically:

1. **Task 1: customerUI.js 생성** - `ef9d4f3` (feat)
2. **Task 2: index.html DOM 마크업 + script 태그** - `f52e030` (feat)
3. **Task 3: 브라우저 검증 후 수정사항** - `cbe9076` (feat), `7e52b6a` (fix), `317bbb8` (fix)

## Files Created/Modified

- `customerUI.js` — 신규 생성, 자동완성/폼채우기/할인율상태/저장삭제 전체 UI 로직
- `index.html` — #cName/.fg 수정, #gDisc/.fg.disc 수정, .cust-actions 신규, script 태그 추가

## Decisions Made

- mousedown 핸들러 사용: blur 이벤트보다 먼저 실행되어 자동완성 아이템 클릭 누락 방지
- setTimeout 150ms: onblur 시 _closeAutocomplete 딜레이 — 클릭이 완료된 뒤 닫힘
- _savedDiscount 클로저 변수: DB 기본값 추적, gDisc input마다 현재값과 비교하여 상태 결정
- customerUI.js를 customerDB.js 뒤에 로드: CustomerDB 전역 객체 의존성 순서 보장

## Deviations from Plan

### Auto-fixed Issues (Post-Checkpoint)

**1. [Rule 1 - Bug] render() TypeError: it.i.startsWith 숫자 타입 체크 추가**
- **Found during:** Task 3 (브라우저 검증)
- **Issue:** `it.i`가 숫자일 때 `.startsWith()` 호출 시 TypeError 발생
- **Fix:** `typeof it.i === 'string'` 조건 추가로 타입 가드
- **Commit:** `7e52b6a`

**2. [Rule 1 - Bug] UI 레이블 오류: 지원가 → 공급가**
- **Found during:** Task 3 (브라우저 검증)
- **Issue:** 가격 레이블이 "지원가"로 표시되어 사용자 확인 시 지적
- **Fix:** 레이블을 "공급가"로 변경
- **Commit:** `317bbb8`

**3. [Rule 2 - Feature] 동명이인 구분 + 고객 목록 패널**
- **Found during:** Task 3 (브라우저 검증)
- **Issue:** 동명이인이 있을 경우 자동완성에서 구분 불가
- **Fix:** 자동완성 드롭다운에 작물/지역 정보 표시, 고객 목록 패널(고객 목록 버튼) 추가
- **Commit:** `cbe9076`

## Known Stubs

None — all functions are fully implemented and wired to CustomerDB API.

## Checkpoint Status: APPROVED

Task 3 (브라우저 검증) — 사용자가 브라우저에서 직접 확인 후 승인 완료 (2026-03-25).

## Self-Check: PASSED

- FOUND: customerUI.js
- FOUND: index.html
- FOUND: 02-02-SUMMARY.md
- FOUND: commit ef9d4f3
- FOUND: commit f52e030

---
*Phase: 02-db*
*Completed: 2026-03-25*
