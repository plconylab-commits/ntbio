---
phase: 09-price-page-image-attach
plan: 01
subsystem: ui
tags: [print, invoice, vanilla-js, global-variable]

# Dependency graph
requires: []
provides:
  - window._invoiceUnitPrice 전역 변수 (index.html)
  - _appendPricePageIfNeeded() 함수 — syncPrint() 실행마다 평당가 페이지 조건부 주입
  - main.js 경로 A: PDF 업로드 시 window._invoiceUnitPrice 저장
  - uiController.js 경로 B: 검증 모달 [적용] 완료 시 window._invoiceUnitPrice 저장
affects: [print, syncPrint, clearAll]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "window._invoiceUnitPrice 전역 변수로 모듈 간 평당가 값 공유 (빌드 없는 바닐라 JS)"
    - "syncPrint() 마지막 줄에 추가 페이지 주입 훅 패턴"
    - "IIFE를 사용한 _applyToCart() 내 독립 평당가 계산 (클로저 오염 방지)"

key-files:
  created: []
  modified:
    - index.html
    - main.js
    - uiController.js

key-decisions:
  - "window._invoiceUnitPrice 전역 변수 방식: 빌드 도구 없이 main.js, uiController.js, index.html 간 값 공유"
  - "syncPrint() innerHTML 대입 이후에 _appendPricePageIfNeeded() 호출 — 대입이 먼저 와야 주입이 덮어쓰이지 않음"
  - "uiController.js 경로 B는 _recalcVldUnitPrice() 반환값 없어 IIFE로 독립 계산"

patterns-established:
  - "syncPrint() 확장 패턴: innerHTML 대입 후 마지막에 추가 페이지 주입 함수 호출"

requirements-completed: [PRICE-01]

# Metrics
duration: 10min
completed: 2026-03-27
---

# Phase 09 Plan 01: 평당가 페이지 주입 Summary

**window._invoiceUnitPrice 전역 변수 + _appendPricePageIfNeeded() 함수로 syncPrint() 실행마다 평당가 안내 페이지(.p-price-page)를 printDoc 끝에 조건부 자동 주입**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-27T00:20:00Z
- **Completed:** 2026-03-27T00:30:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- index.html에 `let _invoiceUnitPrice = 0` 전역 선언, `_appendPricePageIfNeeded()` 함수, syncPrint() 훅, clearAll() 초기화 추가
- main.js 경로 A: PDF 업로드(`handlePrescriptionUpload`) 시 `if (unitPrice)` 블록 내에서 `window._invoiceUnitPrice = unitPrice` 저장
- uiController.js 경로 B: 검증 모달 `_applyToCart()` 성공 경로에서 IIFE로 cart 기반 평당가 계산 후 `window._invoiceUnitPrice` 저장, syncPrint() 직전 실행

## Task Commits

1. **Task 1: index.html — 전역 변수 + 함수 + syncPrint 훅 + clearAll 초기화** - `3972020` (feat)
2. **Task 2: main.js — 경로 A PDF 업로드 시 저장** - `43dcc36` (feat)
3. **Task 3: uiController.js — 경로 B 검증 모달 완료 시 저장** - `8b42086` (feat)

## Files Created/Modified

- `index.html` - 전역 변수 선언, _appendPricePageIfNeeded() 함수, syncPrint() 훅, clearAll() 초기화
- `main.js` - handlePrescriptionUpload() 내 window._invoiceUnitPrice 대입 추가
- `uiController.js` - _applyToCart() 성공 경로에 IIFE 평당가 계산 + 저장 추가

## Decisions Made

- `window._invoiceUnitPrice` 전역 변수 방식 사용: 빌드 도구 없는 바닐라 JS 환경에서 main.js, uiController.js, index.html이 빌드 없이 공유 가능한 유일한 방법
- syncPrint() 내 `innerHTML =` 대입 이후에 `_appendPricePageIfNeeded()` 호출: 대입이 먼저 실행되어야 주입 결과가 덮어쓰이지 않음
- uiController.js 경로 B는 `_recalcVldUnitPrice()`가 반환값 없어 IIFE 내에서 `cart.filter` 기반으로 독립 재계산

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PRICE-01 완료: syncPrint() 실행마다 평당가 안내 페이지가 printDoc 끝에 자동 주입됨
- 브라우저 수동 확인 필요: PDF 업로드 → 검증 모달 [적용] → printDoc 하단 "평당가 안내" 페이지 확인
- 다음 계획(이미지 첨부 등) 진행 가능

---
*Phase: 09-price-page-image-attach*
*Completed: 2026-03-27*
