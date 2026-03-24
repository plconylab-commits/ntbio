---
phase: 01-pdf
verified: 2026-03-25T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 1: PDF 파싱 수정 + 기반 인프라 Verification Report

**Phase Goal:** 처방전 파싱이 정확하고, 이후 모든 데이터 저장의 기반 스키마가 준비된다
**Verified:** 2026-03-25
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                      | Status     | Evidence                                                                                   |
|----|--------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------|
| 1  | 복합형 처방전(천혜향 등)을 파싱하면 최종 합계 행의 평당가만 추출된다                                      | VERIFIED  | `pyeongFromTotal` (4 matches) + `pyeongLastSeen` (4 matches) + final decision line 153 in pdfParser.js |
| 2  | 비용 페이지 이후 광고/홍보 페이지가 처방 항목에 나타나지 않는다                                          | VERIFIED  | `break; // 비용 페이지 이후...` at pdfParser.js line 524                                       |
| 3  | 파싱 오류 시 사용자에게 재시도 안내 메시지가 표시된다                                                  | VERIFIED  | "다시 시도" in pdfParser.js (2 matches, lines 1064/1123) + main.js (2 matches, lines 86/88)    |
| 4  | 홍보용 항목은 장바구니에 금액 0원으로 추가된다                                                      | VERIFIED  | `isPromo` (5 matches) + `priceOverride` (3 matches) in uiController.js; retail and sp both set to priceOverride |
| 5  | localStorage에 fertilizer_customers, fertilizer_prescriptions, fertilizer_transactions 키가 초기화된다 | VERIFIED  | customerDB.js `_migrate()` initializes all 3 keys; called at module load (line 82)            |
| 6  | JSON 내보내기 버튼 클릭 시 전체 데이터가 .json 파일로 다운로드된다                                      | VERIFIED  | `doExportJSON()` defined in index.html (line 3171); uses Blob + URL.createObjectURL; wired to `CustomerDB.exportAll()` |
| 7  | JSON 가져오기 버튼으로 백업 파일을 업로드하면 데이터가 복원된다                                          | VERIFIED  | `doImportJSON(input)` defined in index.html (line 3191); uses FileReader + `CustomerDB.importAll(data)` |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact         | Expected                                                         | Status    | Details                                                                                        |
|------------------|------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------------------------|
| `pdfParser.js`   | extractCostPageData() 합계 행 우선 평당가 추출 + 비용 페이지 이후 break | VERIFIED  | `pyeongFromTotal` present (4x); `break` at line 524 with PARSE-02 comment; "다시 시도" at lines 1064/1123 |
| `main.js`        | 파싱 실패 시 재시도 안내 메시지                                        | VERIFIED  | JSON parse error branch + general error branch, both include "다시 시도"; `Unexpected token` detection at line 85 |
| `uiController.js`| 홍보용 항목 0원 처리                                                | VERIFIED  | `isPromo` detection across productRaw/productName/stageRaw; `priceOverride = 0`; applied to both new push and existing qty update |
| `customerDB.js`  | localStorage 스키마 초기화 + CRUD 기반 + exportAll/importAll       | VERIFIED  | File exists; `window.CustomerDB` exposed (1 match); `_migrate()` auto-called; `exportAll` + `importAll` both defined |
| `index.html`     | 내보내기/가져오기 버튼 + customerDB.js script 태그                   | VERIFIED  | `<script src="customerDB.js?v=1">` at line 805; `btn-export-json` + `btn-import-json` buttons at lines 675-676; `jsonFileInput` hidden file input at line 678 |

---

### Key Link Verification

| From             | To            | Via                                              | Status    | Details                                                                       |
|------------------|---------------|--------------------------------------------------|-----------|-------------------------------------------------------------------------------|
| `pdfParser.js`   | `main.js`     | `parsePdfToJSON()` return → `costData` consumed  | WIRED     | main.js line 21: `parsePdfToJSON(pdfFile)`; line 47: `const cd = prescriptionJSON.costData` |
| `uiController.js`| cart          | `_applyToCart()` → cart.push 시 홍보용 가격 0 강제  | WIRED     | `isPromo ? 0 : (prod.price || 0)` at line 1453; both `retail:` and `sp:` fields set to `priceOverride` at lines 1465/1467 |
| `customerDB.js`  | localStorage  | `_migrate()` 자동 호출로 3키 초기화                 | WIRED     | `_migrate()` called at end of IIFE (line 82); sets all 3 `fertilizer_*` keys if absent |
| `index.html`     | `customerDB.js`| script src 태그 + onclick으로 exportAll/importAll  | WIRED     | `<script src="customerDB.js?v=1">` at line 805; `CustomerDB.exportAll()` at line 3173; `CustomerDB.importAll(data)` at line 3199 |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase delivers parsing logic and localStorage infrastructure, not UI components that render dynamic data from a remote source. The localStorage data flow is self-contained (write on import, read on exportAll) and verified at the API level above.

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — browser-only app with no runnable Node.js entry point. All logic requires a browser + PDF.js + Vision API context. Wiring verified statically above.

---

### Requirements Coverage

| Requirement | Source Plan   | Description                                                              | Status    | Evidence                                                                               |
|-------------|---------------|--------------------------------------------------------------------------|-----------|----------------------------------------------------------------------------------------|
| PARSE-01    | 01-01-PLAN.md | 복합형 처방전에서 마지막 합계 행의 평당가 정확 추출                                     | SATISFIED | `pyeongFromTotal` priority + `pyeongLastSeen` fallback in `extractCostPageData()`, pdfParser.js lines 84-153 |
| PARSE-02    | 01-01-PLAN.md | 광고/홍보 이미지 페이지 자동 건너뜀                                               | SATISFIED | `break;` at pdfParser.js line 524 after cost page detection                            |
| PARSE-03    | 01-01-PLAN.md | Vision API JSON 파싱 실패 시 재시도 안내 메시지                                   | SATISFIED | "다시 시도" in all 4 error paths across pdfParser.js (lines 1064, 1123) and main.js (lines 86, 88) |
| PARSE-04    | 01-01-PLAN.md | `계=홍보용` 항목을 금액 0으로 처리하여 합계에서 제외                                   | SATISFIED | `isPromo` + `priceOverride = 0` in uiController.js `_applyToCart()`, lines 1445-1472  |

All 4 requirement IDs from PLAN frontmatter accounted for. No orphaned requirements found for Phase 1 in REQUIREMENTS.md (traceability table maps PARSE-01~04 exclusively to Phase 1).

---

### Anti-Patterns Found

| File             | Line | Pattern                         | Severity | Impact                                                              |
|------------------|------|---------------------------------|----------|---------------------------------------------------------------------|
| `customerDB.js`  | 51   | `save: function(c) { /* Phase 2 */ }` | Info    | Intentional stub — plan documents this as Phase 2 work; does not affect Phase 1 goal |
| `customerDB.js`  | 52   | `delete: function(id) { /* Phase 2 */ }` | Info | Intentional stub — same as above                                   |

No blocker or warning anti-patterns found. The two stubs are explicitly documented in 01-02-SUMMARY.md as known Phase 2 work and do not affect the localStorage initialization, exportAll, or importAll behaviors required by this phase.

---

### Human Verification Required

#### 1. 복합형 처방전 평당가 파싱 end-to-end

**Test:** Upload `천혜향(550평)농사 송한천장로님(3월10일).pdf` (available in project root) and inspect the extracted `unitPricePerPyeong` value in the browser console.
**Expected:** The value should match the final "합계" row's 평당 price, not any intermediate subtotal row's price.
**Why human:** Requires a browser + PDF.js + Vision API call with a real PDF. Cannot invoke from CLI.

#### 2. 광고/홍보 페이지 스킵 확인

**Test:** Upload a PDF that contains an ad/promo page after the cost summary page. Verify the resulting prescription items list in the UI contains no ad content.
**Expected:** Prescription stage list ends at the cost page; no ad items appear.
**Why human:** Requires a multi-page PDF with a trailing ad page and a live browser session.

#### 3. JSON 내보내기/가져오기 버튼 작동

**Test:** Click "JSON 내보내기" button in the browser. Then navigate to a fresh session, click "JSON 가져오기", select the downloaded file, confirm the prompt.
**Expected:** A `.json` file is downloaded on export; data is restored and visible after import.
**Why human:** Requires browser interaction with Blob download and FileReader APIs.

#### 4. 홍보용 항목 0원 장바구니 반영

**Test:** Upload a PDF containing a `계=홍보용` row. Inspect the cart total — the promo item should appear with price 0 and not inflate the total.
**Expected:** Cart item with "홍보용" in its name shows retail=0, sp=0.
**Why human:** Requires a real PDF with a 홍보용 row and a live browser + Vision API.

---

### Gaps Summary

No gaps. All 7 observable truths are verified, all 5 artifacts pass all three levels (exists, substantive, wired), all 4 key links are wired, all 4 requirement IDs are satisfied. Commits b11a6f7, 555a395, 829f203, and 386271c are confirmed in git history.

---

_Verified: 2026-03-25_
_Verifier: Claude (gsd-verifier)_
