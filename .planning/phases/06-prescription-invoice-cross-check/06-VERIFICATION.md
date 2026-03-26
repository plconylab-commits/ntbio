---
phase: 06-prescription-invoice-cross-check
verified: 2026-03-27T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
human_verification:
  - test: "End-to-end browser flow with real prescription PDF"
    expected: "Modal opens, PDF uploaded, diff table renders with correct color-coded rows, cart unchanged after close"
    why_human: "Requires browser, real PDF upload, and visual inspection of diff table rendering and color coding"
  - test: "Empty cart guard"
    expected: "Clicking 처방전 비교 with empty cart shows toast error and does NOT open modal"
    why_human: "Requires browser interaction to confirm toast appears vs modal not opening"
---

# Phase 6: 처방전↔거래명세표 대조 검토 Verification Report

**Phase Goal:** 처방전 PDF와 현재 거래명세표 카트를 대조하여 품목 유무·수량 차이·금액 차이를 자동으로 검출하고 모달 diff 테이블로 표시한다.
**Verified:** 2026-03-27
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                           | Status     | Evidence                                                                 |
|----|---------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------|
| 1  | 거래명세표 툴바에 "처방전 비교" 버튼이 있고 클릭하면 비교 모달이 열린다              | ✓ VERIFIED | index.html line 708: `btn-compare` button calling `RxCompareUI.openCompareModal()` |
| 2  | 모달에서 처방전 PDF를 업로드하면 카트와 자동 대조되어 diff 테이블이 표시된다         | ✓ VERIFIED | rxCompareUI.js: `_onRxFileSelected` calls `parsePdfToJSON(file)` then `_showResults(json)` |
| 3  | diff 테이블이 일치/수량차이/한쪽에만/미매칭 4가지 상태를 색상으로 구분한다           | ✓ VERIFIED | rxCompareUI.js lines 119-133: match/qty-diff/rx-only/cart-only with distinct bg colors |
| 4  | 퍼지 매칭으로 품목명을 자동 대응하고 매칭 실패는 "미매칭"으로 표시한다               | ✓ VERIFIED | rxCompare.js: `fuzzyMatch` bidirectional contains; 43 unit tests pass     |
| 5  | 처방전 평당가 vs 카트 공급가 합계/면적 요약이 diff 테이블 상단에 표시된다            | ✓ VERIFIED | rxCompareUI.js lines 57-78: `rxCmpSummary` div with both pyeongdanga values |
| 6  | 비교 과정에서 카트 데이터가 절대 변경되지 않는다                                   | ✓ VERIFIED | rxCompareUI.js: only `cart.length` read and `cart` passed to RxCompare functions — no push/splice/assignment |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact          | Expected                                                           | Status     | Details                                                                           |
|-------------------|--------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------|
| `rxCompare.js`    | Pure comparison logic: normalizeForMatch, fuzzyMatch, buildDiffRows, calcCartPricePerPyeong, extractRxItems | ✓ VERIFIED | 202-line file; bare function declarations; `window.RxCompare` export at line 194 |
| `rxCompare.test.js` | Unit tests for all comparison functions                          | ✓ VERIFIED | 223-line file; 43 tests; `node rxCompare.test.js` exits 0; vm.runInContext pattern |
| `rxCompareUI.js`  | Compare modal UI: openCompareModal, _onRxFileSelected, _renderDiffTable | ✓ VERIFIED | 344-line IIFE; `window.RxCompareUI = { openCompareModal }` at line 342            |
| `index.html`      | Toolbar button + script tags for rxCompare.js + rxCompareUI.js   | ✓ VERIFIED | Button at line 708; script tags at lines 843-844                                  |

---

### Key Link Verification

| From                | To             | Via                                              | Status     | Details                                                                    |
|---------------------|----------------|--------------------------------------------------|------------|----------------------------------------------------------------------------|
| `rxCompare.test.js` | `rxCompare.js` | `vm.runInContext`                                | ✓ WIRED    | Line 11: `vm.runInContext(code, ctx)` — all 5 functions extracted from ctx |
| `rxCompareUI.js`    | `rxCompare.js` | `RxCompare.buildDiffRows`, `calcCartPricePerPyeong`, `extractRxItems` | ✓ WIRED | Lines 36-37, 52: 3 RxCompare calls confirmed (grep count: 3)  |
| `rxCompareUI.js`    | `pdfParser.js` | `parsePdfToJSON(file)`                           | ✓ WIRED    | Line 224: `json = await parsePdfToJSON(file)` — direct call, not handlePrescriptionUpload |
| `rxCompareUI.js`    | `index.html`   | reads global `cart` variable                    | ✓ WIRED    | Lines 295, 37, 52: cart read-only (length check + passed to RxCompare functions) |
| `index.html`        | `rxCompareUI.js` | script src + toolbar button onclick            | ✓ WIRED    | Line 844: `<script src="rxCompareUI.js?v=1">`; line 708: `onclick="RxCompareUI.openCompareModal()"` |

---

### Data-Flow Trace (Level 4)

| Artifact        | Data Variable | Source                                      | Produces Real Data | Status      |
|-----------------|---------------|---------------------------------------------|--------------------|-------------|
| `rxCompareUI.js` | `diffRows`   | `RxCompare.buildDiffRows(rxItems, cart)`    | Yes — rxItems from PDF parse, cart from DOM global | ✓ FLOWING |
| `rxCompareUI.js` | `rxItems`    | `RxCompare.extractRxItems(prescriptionJSON)` | Yes — filtered from `prescriptionJSON.rxRows` (real PDF parse output) | ✓ FLOWING |
| `rxCompareUI.js` | `cartPpyeong` | `RxCompare.calcCartPricePerPyeong(cart, area)` | Yes — sums sp*qty from live cart | ✓ FLOWING |
| `rxCompareUI.js` | `rxPpyeong`  | `prescriptionJSON.costData.unitPricePerPyeong` | Yes — extracted from PDF; null-guarded with fallback text | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior                                           | Command                                       | Result              | Status  |
|----------------------------------------------------|-----------------------------------------------|---------------------|---------|
| All 43 unit tests pass                             | `node rxCompare.test.js`                      | PASSED: 43, FAILED: 0 | ✓ PASS |
| normalizeForMatch strips spaces/parens             | (covered by test suite)                       | Verified via tests   | ✓ PASS |
| fuzzyMatch bidirectional contains                  | (covered by test suite)                       | Verified via tests   | ✓ PASS |
| buildDiffRows zero tolerance on qty diff (D-11)    | (covered by test suite)                       | Verified via tests   | ✓ PASS |
| Script load order: pdfParser → rxCompare → rxCompareUI | `grep -n script src index.html`           | pdfParser:836 < rxCompare:843 < rxCompareUI:844 | ✓ PASS |
| handlePrescriptionUpload NOT called (D-03)         | `grep handlePrescriptionUpload rxCompareUI.js`| 0 matches           | ✓ PASS |
| pdfFileInput NOT touched (D-04)                    | `grep pdfFileInput rxCompareUI.js`            | 0 matches           | ✓ PASS |
| cart not mutated                                   | `grep "cart\." rxCompareUI.js`                | Only `cart.length` read | ✓ PASS |
| Browser E2E flow                                   | Requires browser                              | —                   | ? SKIP  |

---

### Requirements Coverage

| Requirement | Source Plan   | Description                                                            | Status      | Evidence                                                   |
|-------------|---------------|------------------------------------------------------------------------|-------------|------------------------------------------------------------|
| XCHK-01     | 06-01-PLAN.md | normalizeForMatch: strip non-alphanumeric, lowercase, preserve Korean  | ✓ SATISFIED | rxCompare.js line 24; 6 test cases pass                    |
| XCHK-02     | 06-01-PLAN.md | fuzzyMatch: bidirectional contains after normalization                 | ✓ SATISFIED | rxCompare.js lines 36-41; 6 test cases pass                |
| XCHK-03     | 06-01-PLAN.md | buildDiffRows: 4-status 1:1 greedy matching, zero qty tolerance (D-11) | ✓ SATISFIED | rxCompare.js lines 105-173; 12 test cases pass             |
| XCHK-04     | 06-01-PLAN.md | calcCartPricePerPyeong + extractRxItems                                | ✓ SATISFIED | rxCompare.js lines 184-200; 10 test cases pass             |
| XCHK-05     | 06-02-PLAN.md | rxCompareUI.js: modal with upload zone, loading state, diff table      | ✓ SATISFIED | rxCompareUI.js 344 lines; all structural elements verified |
| XCHK-06     | 06-02-PLAN.md | index.html toolbar button + correct script load order                  | ✓ SATISFIED | index.html lines 708, 843-844; load order confirmed        |

**Note on XCHK IDs in REQUIREMENTS.md:** The XCHK-01 through XCHK-06 requirement IDs are referenced in ROADMAP.md (Phase 6 section) and both PLAN frontmatter files, but they do NOT appear as defined entries in `.planning/REQUIREMENTS.md`. The REQUIREMENTS.md file was last updated 2026-03-24 (before Phase 6 was planned). This is a documentation gap — the REQUIREMENTS.md traceability table should include a Phase 6 row for XCHK requirements — but it does not block the implementation: the requirements are fully described in ROADMAP.md Success Criteria and both PLAN files, and the implementation satisfies all 6 of them.

---

### Anti-Patterns Found

| File            | Line | Pattern                          | Severity    | Impact                                                      |
|-----------------|------|----------------------------------|-------------|-------------------------------------------------------------|
| None found      | —    | —                                | —           | —                                                           |

Scanned: rxCompare.js, rxCompareUI.js, index.html (relevant sections)
- No TODO/FIXME/PLACEHOLDER comments found in implementation files
- No empty return stubs (`return null`, `return []`, `return {}`)
- No hardcoded empty data passed to rendering paths
- `display:none` on match rows is intentional collapse behavior (not a stub)
- Cart read-only constraint fully respected

---

### Human Verification Required

#### 1. End-to-end Browser Flow

**Test:** Open index.html in browser. Add 3+ products to cart with quantities. Click the "처방전 비교" button. Upload a real prescription PDF. Observe loading state, then diff table.
**Expected:** Loading state "처방전 분석 중..." appears; diff table renders with color-coded rows (yellow for qty-diff, red for rx-only/cart-only, green-pale for match); match rows hidden by default; toggle button shows/hides match rows; pyeongdanga summary row above table; closing modal leaves cart unchanged.
**Why human:** Requires browser, real PDF file, and visual inspection of colors, layout, and interactive toggle behavior.

#### 2. Empty Cart Guard

**Test:** Clear all cart items. Click "처방전 비교" button.
**Expected:** Toast message "카트가 비어있습니다..." appears; modal does NOT open.
**Why human:** Requires browser interaction to confirm toast fires and modal is blocked.

---

### Gaps Summary

No gaps found. All 6 observable truths are verified, all 4 artifacts exist and are substantive and wired, all 5 key links are connected, data flows correctly through all rendering paths, and no anti-patterns were detected. The only documentation gap is that XCHK-01 through XCHK-06 are not added to the REQUIREMENTS.md traceability table, but this does not affect the implementation.

---

_Verified: 2026-03-27_
_Verifier: Claude (gsd-verifier)_
