---
phase: 06-prescription-invoice-cross-check
plan: 01
subsystem: testing
tags: [vanilla-js, tdd, fuzzy-matching, diff, vm-context, iife]

requires:
  - phase: 05-pdf-fix
    provides: prescriptionModel.js calcRequiredQty signature (mirrored inline)

provides:
  - rxCompare.js: pure comparison module (normalizeForMatch, fuzzyMatch, buildDiffRows, calcCartPricePerPyeong, extractRxItems)
  - rxCompare.test.js: 43 passing unit tests for all comparison functions

affects:
  - 06-02 (rxCompareUI.js will import comparison logic via window.RxCompare)

tech-stack:
  added: []
  patterns:
    - "Bare function declarations (no IIFE) for vm.runInContext testability + window.RxCompare guard at bottom"
    - "1:1 greedy matching: sort by normalized name length DESC, then find best unmatched cart item"
    - "TDD: test file committed RED before implementation, GREEN commit after all tests pass"

key-files:
  created:
    - rxCompare.js
    - rxCompare.test.js
  modified: []

key-decisions:
  - "Used bare function declarations (not IIFE) so vm.runInContext hoists functions to ctx object — matches rxNormalizer.js pattern"
  - "window.RxCompare assignment guarded by typeof window check at module bottom — works in both Node vm context and browser"
  - "_calcRequiredQty inlined in rxCompare.js — avoids DOM dependency on prescriptionModel.js in test/Node context"
  - "fuzzyMatch: bidirectional contains (na.includes(nb) || nb.includes(na)) — handles both short-in-long and long-in-short cases"
  - "buildDiffRows uses indexOf for cartUsed (not Set) to maintain ES5 compatibility with vm.createContext"

patterns-established:
  - "Pattern: bare function declarations for vm.runInContext testability + window.XXX guard for browser"
  - "Pattern: 1:1 greedy matching — sort rx items by normalized name length DESC before matching loop"

requirements-completed:
  - XCHK-01
  - XCHK-02
  - XCHK-03
  - XCHK-04

duration: 12min
completed: 2026-03-26
---

# Phase 06 Plan 01: rxCompare Pure Comparison Logic Summary

**Pure JS comparison module with fuzzy Korean product name matching, 4-status diff classification, and price-per-pyeong calculation — 43 tests passing via Node vm.runInContext**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-26T16:38:19Z
- **Completed:** 2026-03-26T16:50:00Z
- **Tasks:** 1 (TDD: RED + GREEN phases)
- **Files modified:** 2

## Accomplishments

- `normalizeForMatch`: strips all non-Korean/alphanumeric chars and lowercases (e.g., '옥토팜 (발효계분)' -> '옥토팜발효계분')
- `fuzzyMatch`: bidirectional contains check after normalization — handles '옥토팜' matching '옥토팜발효계분'
- `buildDiffRows`: 1:1 greedy matching with 4 status types (match/qty-diff/rx-only/cart-only), zero qty tolerance (D-11)
- `calcCartPricePerPyeong`: sum(sp*qty)/area, returns null for zero/null area (D-13)
- `extractRxItems`: filters invalid rxRows, applies inline calcRequiredQty with totalArea fallback

## Task Commits

1. **RED phase: rxCompare.test.js (43 failing tests)** - `a6b3b4f` (test)
2. **GREEN phase: rxCompare.js implementation** - `70970fa` (feat)

## Files Created/Modified

- `rxCompare.js` - Pure comparison logic, 201 lines, no DOM dependencies, window.RxCompare for browser
- `rxCompare.test.js` - 43 unit tests covering all behavior specs from plan

## Decisions Made

- Used bare function declarations (not IIFE) to match rxNormalizer.js pattern — vm.runInContext hoists bare function declarations to the ctx object, while IIFE-scoped functions would not be accessible as ctx properties
- `_calcRequiredQty` inlined to avoid prescriptionModel.js dependency in Node test context
- `cartUsed` implemented as array with `indexOf` (not Set) for broader JS engine compatibility in vm context
- `window.RxCompare` guard: `if (typeof window !== 'undefined')` — function declarations still accessible in vm ctx regardless

## Deviations from Plan

None — plan executed exactly as written. The plan noted to check rxNormalizer.js for the export pattern; confirmed bare function declarations are the correct approach (not IIFE for vm testability).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `rxCompare.js` is ready for import by `rxCompareUI.js` (Phase 06 Plan 02) via `window.RxCompare`
- All 5 exported functions verified with 43 tests
- No blockers

## Self-Check: PASSED

- FOUND: rxCompare.js
- FOUND: rxCompare.test.js
- FOUND: 06-01-SUMMARY.md
- FOUND: commit a6b3b4f (test RED phase)
- FOUND: commit 70970fa (feat GREEN phase)
- node rxCompare.test.js: 43 PASSED, 0 FAILED

---
*Phase: 06-prescription-invoice-cross-check*
*Completed: 2026-03-26*
