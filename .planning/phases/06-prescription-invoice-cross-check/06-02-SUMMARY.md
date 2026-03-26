---
phase: 06-prescription-invoice-cross-check
plan: 02
subsystem: ui
tags: [vanilla-js, modal, pdf, diff-table, iife]

# Dependency graph
requires:
  - phase: 06-01
    provides: rxCompare.js with buildDiffRows, calcCartPricePerPyeong, extractRxItems, fuzzyMatch
  - phase: 01-pdf
    provides: pdfParser.js with parsePdfToJSON()

provides:
  - rxCompareUI.js — comparison modal UI with IIFE + window.RxCompareUI namespace
  - index.html toolbar button "처방전 비교" wired to RxCompareUI.openCompareModal()
  - Full prescription-vs-cart comparison flow: upload → parse → diff table rendering

affects:
  - Phase 6 success criteria (XCHK-05, XCHK-06)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - IIFE module pattern with window namespace (matching Phase 02/03/04 conventions)
    - Dynamic modal DOM creation via innerHTML (matching _openOldInvConfirmModal pattern)
    - Separate file input (rxComparePdfInput) to avoid touching existing pdfFileInput

key-files:
  created:
    - rxCompareUI.js
  modified:
    - index.html

key-decisions:
  - "rxCompareUI.js calls parsePdfToJSON(file) directly — never calls handlePrescriptionUpload() which would overwrite cart"
  - "Separate file input id=rxComparePdfInput per D-04 to avoid conflict with existing PDF upload flow"
  - "Match rows hidden by default with toggle button — reduces noise for large diff tables"
  - "Script load order: rxCompare.js must precede rxCompareUI.js, both after pdfParser.js"

patterns-established:
  - "Modal overlay: position:fixed; inset:0; z-index:9900; matches project overlay z-index convention"
  - "Cart read-only guard: all comparison logic reads cart without mutation"

requirements-completed: [XCHK-05, XCHK-06]

# Metrics
duration: ~35min (including checkpoint verification)
completed: 2026-03-27
---

# Phase 6 Plan 02: 처방전↔거래명세표 비교 모달 UI Summary

**Toolbar "처방전 비교" button opens a modal that uploads a prescription PDF, calls parsePdfToJSON directly (no cart mutation), renders a color-coded 4-status diff table with pyeongdanga summary row**

## Performance

- **Duration:** ~35 min (including human-verify checkpoint)
- **Started:** 2026-03-27
- **Completed:** 2026-03-27
- **Tasks:** 3 (Task 1: rxCompareUI.js, Task 2: index.html integration, Task 3: human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- `rxCompareUI.js` (344 lines) implements full modal lifecycle: empty-cart guard, upload zone, loading state, diff table rendering with 4 row types
- `index.html` updated with toolbar button (`🔍 처방전 비교`) and correct script load order for rxCompare.js + rxCompareUI.js
- End-to-end flow verified in browser: all diff row types (match/qty-diff/rx-only/cart-only), match row toggle, cart unchanged after comparison

## Task Commits

Each task was committed atomically:

1. **Task 1: Create rxCompareUI.js** - `b5ee65e` (feat)
2. **Task 2: Integrate into index.html** - `3e7cdcb` (feat)
3. **Task 3: Human-verify checkpoint** - approved (no code changes needed)

## Files Created/Modified

- `rxCompareUI.js` — IIFE module exposing `window.RxCompareUI.openCompareModal()`: modal creation, file input handling, parsePdfToJSON call, diff table rendering with summary row
- `index.html` — Added `<div class="act-row"><button class="btn-compare">` toolbar button + two script tags for rxCompare.js and rxCompareUI.js

## Decisions Made

- Called `parsePdfToJSON(file)` directly instead of `handlePrescriptionUpload()` — the latter overwrites the cart which violates D-03 (cart read-only constraint)
- Used id `rxComparePdfInput` for the hidden file input per D-04, completely separate from the existing `pdfFileInput`
- Matched rows collapsed by default to reduce noise; toggle shows count: `일치 항목 보기 (N건)`
- Script tags inserted after salesHistoryUI.js and before html2canvas to maintain correct dependency order

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 6 is now complete: both plans (06-01 logic module TDD + 06-02 UI) are done
- All 6 success criteria for Phase 6 are met:
  1. Toolbar "처방전 비교" button opens comparison modal ✓
  2. PDF upload triggers auto-comparison with diff table ✓
  3. Diff table shows 4 status types with color coding ✓
  4. Fuzzy matching handles product name variations ✓
  5. Pyeongdanga summary row shown above diff table ✓
  6. Cart data is never modified during comparison ✓
- `node rxCompare.test.js` passes 43/43 tests
- Ready for any follow-on phases (cloud sync, etc.)

---
*Phase: 06-prescription-invoice-cross-check*
*Completed: 2026-03-27*
