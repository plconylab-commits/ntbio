# Phase 10: 처방전 PDF 파싱 정확도 + 연동 완성 - Research

**Researched:** 2026-03-27
**Domain:** PDF coordinate-based parsing (처방전.html), localStorage cross-page sync, cost page extraction
**Confidence:** HIGH

---

## Summary

Phase 10 covers 7 requirements (PARSE-10~14, SYNC-01~02) targeting the coordinate-based PDF parser (`parseRxPdfCoords` in 처방전.html) and the bidirectional data sync between index.html and 처방전.html.

**Critical finding: most issues are already fixed in committed code.** Commits 209033a (PARSE-10), 01c99d9 (PARSE-11), and c6de2b8 (PARSE-12) landed on the current branch. PARSE-13 is handled by the existing `mergedRows` loop at line 3716. PARSE-14 (`extractCostFromPdfDoc`) fires in both PDF-load paths. SYNC-01 works via the `rxPendingPdf` IIFE. SYNC-02 works via `goBackToCart()` → `rxData` → `_loadRxDataFromStorage()`.

**What actually needs to be built:** (1) End-to-end smoke tests against each real prescription PDF to confirm the recently-landed fixes produce correct output. (2) Clarify whether SYNC-02 requires fully-automatic background sync (no button click) or the existing "← 거래명세표" button is sufficient. (3) Potentially strengthen `_isCostPage` for PDFs that lack the usual keywords.

**Primary recommendation:** Write a verification checklist that validates each requirement against the known prescription PDFs; only patch code where a test reveals a remaining failure.

---

## Requirement Status Matrix

<phase_requirements>
## Phase Requirements

| ID | Description | Implementation Status | Evidence |
|----|-------------|----------------------|----------|
| PARSE-10 | 모든 페이지 파싱 — 마지막 페이지 제외 로직 제거 | DONE | 처방전.html:4326 `lastPage = pdfDoc.numPages` (commit 209033a) |
| PARSE-11 | Y좌표 중간값 경계(midpoint boundary) 방식으로 제품 오배정 방지 | DONE | 처방전.html:4598-4615 `assignToBlock` midpoint logic (commit 01c99d9) |
| PARSE-12 | 옥스팜/뉴천연팜/옥토팜 포함 단계 → 기비로 분류 | DONE | 처방전.html:4348-4349 `detectTypeFromParsedLabel` checks product keys (commit c6de2b8) |
| PARSE-13 | 같은 달 2페이지 이상인 경우 달 평당가 합산 | DONE | 처방전.html:3716-3730 `mergedRows` loop aggregates same `getMonthLabel` values |
| PARSE-14 | PDF에 명시된 평당가 우선 추출·사용 | DONE | 처방전.html:5001 (`onRxPdfSelected`) + :1152 (`rxPendingPdf` IIFE) both call `extractCostFromPdfDoc` |
| SYNC-01 | index.html 처방전 업로드 → 처방전.html 자동 연동 | DONE (manual nav) | index.html:2770 saves `rxPendingPdf`; 처방전.html:1107-1166 reads it on load when `stages.length===0` |
| SYNC-02 | 처방전.html 단계 편집 후 저장 → index.html 카트 동기화 | PARTIAL | 처방전.html:5857 `goBackToCart()` writes `rxData`; index.html:1026-1058 reads on `pageshow` |
</phase_requirements>

---

## Standard Stack

This phase is pure vanilla JS / HTML modification — no new libraries required.

| Component | Version | Purpose |
|-----------|---------|---------|
| pdf.js (`pdfjsLib`) | in-use (CDN) | PDF coord extraction — `extractRxPdfCoords` |
| localStorage | browser native | Cross-page state: `rxPendingPdf`, `rxStages`, `rxData` |

**No new npm packages needed.**

---

## Architecture Patterns

### Cross-page Data Flow (verified from source)

```
index.html upload path (prescription PDF):
  onPdfSelected()
    ├─ not ##RX## and not ##TN##
    ├─ localStorage.removeItem('rxStages')       ← line 2772
    ├─ localStorage.setItem('rxPendingPdf', b64) ← line 2770
    └─ handlePrescriptionUpload(file)            ← Vision AI path

처방전.html load:
  DOMContentLoaded
    ├─ reads rxStages → stages (or empty)
    └─ if stages.length === 0:
         rxPendingPdf IIFE                       ← lines 1107-1166
           ├─ reads rxPendingPdf from localStorage
           ├─ checks for ##RX## embed
           ├─ falls back to extractRxPdfCoords + parseRxPdfCoords
           ├─ calls extractCostFromPdfDoc
           └─ _saveRxStages()

처방전.html → index.html sync:
  goBackToCart()                                 ← line 5857
    ├─ aggregates stage product quantities
    ├─ _saveRxStages()
    ├─ localStorage.setItem('rxData', ...)       ← one-time key
    └─ location.href = 'index.html'

index.html pageshow:
  _loadRxDataFromStorage()                       ← line 1036
    └─ reads rxData, rebuilds cart[]
```

### PDF Structure (confirmed across all prescription PDFs)

| PDF Type | Pages | Structure | Cost Page |
|----------|-------|-----------|-----------|
| 송한천님 style (천혜향/레드향) | 7-8 | P1=cover, P2=기비(옥스팜/뉴천연팜/옥토팜), P3+=stages(3 per page), LAST=사용금액 | "합계=X원 평당(Y원)" |
| 수박/진천 style | 4-5 | P1=cover, P2=기비 table, P3+=stages, P4=소매가/공급가/계 table | "합계=X원 평당(Y원)" |
| 깻잎/오이 style | 3-4 | P1=cover, P2-3=stages (no separate 기비 page), P(last)=합계 OR blank | "합계=X원 평당(Y원)" or none |
| 수박(24년) old style | 7 | Text-based, no coordinate layout | none |
| 샤인/수박(1000평) | 9-15 | Multi-month (3월~9월), each month=1 page with 3 stages | "평당(000)" placeholder |

### Coordinate-Based Parser (`parseRxPdfCoords`) — Key Logic

```
LEFT column (x < RX_LEFT_X_MAX):  stage labels
RIGHT column (x >= RX_LEFT_X_MAX): product rows (포/병/봉/통/개 units)

stageBlocks: left-column clusters by Y-gap (RX_STAGE_Y_GAP)
assignToBlock(y, page):
  - sort pageBlocks by yMin
  - for each block[i]: upperBound = (block[i].yMax + block[i+1].yMin) / 2
  - y <= upperBound → assign to block[i]
  - ✓ FIXED (commit 01c99d9)

Result stage fields:
  pageGroup = 1000 + sourcePage  ← ALL stages on same page share group key
  month = 0                       ← set post-parse via recalcTypeNums
  realMonth = null                ← coord parser doesn't set this
  type = detectTypeFromParsedLabel(...)
```

### Cost Page Detection (`_isCostPage`)

Keywords matched: `['소매가','공급가','단가','합계','총액','금액','계']`, threshold ≥ 3.

| PDF Format | Keywords Found | Passes? |
|-----------|---------------|---------|
| 송한천님 style: "사용금액...합계=X원...평당(Y원)" | 금액(from 사용금액) + 합계 + 계(from 합계) = 3 | YES |
| 수박 style: "소매가/공급가/계=X...합계=X원" | 소매가 + 공급가 + 합계 + 계 = 4 | YES |
| 깻잎 style: "합계=X원 평당(Y원)" | 합계 + 계 = 2 | BORDERLINE — only 2 |
| 수박(24년) / no cost page | 0-1 | NO (correct) |

**Gap:** 깻잎(400평) cost line is on a single trailing row. May fail `_isCostPage` with only 2 keywords.

### PARSE-13: Same-month Cost Summation (already correct)

The coord parser assigns `pageGroup = 1000 + page`. Three stages on page 4 all get `pageGroup=1004`. `getStageGroupKey()` returns 1004 for all three. In `renderSummaryCard()`, `groups[1004]` contains all three stages → `groupTotal(1004)` sums them → ONE "4월" row in the cost page. The `mergedRows` loop (line 3716) further handles text-parser edge cases where the same month label appears in two different pageGroup keys.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| PDF text extraction | custom text reader | `pdfjsLib.getPage().getTextContent()` — already in `extractRxPdfCoords` |
| Cross-page state | IndexedDB / server | localStorage keys: `rxPendingPdf`, `rxStages`, `rxData` — established pattern |
| Monthly cost aggregation | new grouping logic | Existing `mergedRows` loop at line 3716 — already correct |

---

## Common Pitfalls

### Pitfall 1: `rxStages` Deletion Before `rxPendingPdf` Read
**What goes wrong:** index.html:2772 deletes `rxStages` before saving `rxPendingPdf`. If 처방전.html is already open in another tab, that tab's stages survive. But if 처방전.html loads FRESH, stages = 0, triggers rxPendingPdf IIFE ✓ (intended).
**Warning sign:** If a code change re-orders these two lines.

### Pitfall 2: `rxPendingPdf` localStorage Size Limit
**What goes wrong:** Large PDFs (>2MB binary) encoded as base64 can hit localStorage's ~5MB limit.
**Why it happens:** btoa() expands binary by 33%.
**How to avoid:** The existing catch block at index.html:2771 already handles this silently. No change needed — just don't increase PDF page count unnecessarily.

### Pitfall 3: `_isCostPage` False Negative for Sparse Cost Pages
**What goes wrong:** PDFs where the cost summary has few keywords (깻잎 style: only "합계" + "계" = 2 < threshold 3) will fail cost page detection.
**Prevention:** Add "평당" or "사용금액" to `_COST_KW` list, or lower `_COST_KW_MIN` to 2. Verify against actual PDFs before changing.

### Pitfall 4: `detectTypeFromParsedLabel` Priority Order
**What goes wrong:** The function checks 엽면 → 관주 → 옥스팜(기비) → 감사비료 → 기비 → 추비.
A stage labeled "감사비료" but containing 옥스팜 returns '기비' (not '감사비료').
**This is correct behavior** — the business rule says 옥스팜 stages ARE 기비 regardless of label.
**Warning sign:** If someone reorders the if-checks, 기비 products might be miscategorized.

### Pitfall 5: SYNC-02 Cart Rebuild on pageshow
**What goes wrong:** `_loadRxDataFromStorage()` reads the one-shot `rxData` key. If the browser cached index.html (bfcache), `pageshow` fires with `e.persisted=true` → re-reads `rxData`. But `rxData` is deleted at line 1039 on first read. Second pageshow (after back-button navigation) finds no `rxData` → cart is NOT rebuilt.
**How to avoid:** The `goBackToCart()` path is correct (user clicks button, fresh navigation). Do not rely on bfcache for cart sync.

### Pitfall 6: pageTitle Header Row Contamination
**What goes wrong:** The header row "옥토팜(발효계분) 옥스팜(휴믹산+풀빅산)부식산 뉴천연팜(종합광물)" spans full page width and would be detected as `pageTitle` by method A. This would contaminate `stageDisplayText`.
**Already fixed:** `isProductDesc` check at 처방전.html:4416 catches this and adds to `titleRowSet` without setting `pageTitles[pg]`.
**Warning sign:** Adding new product names to prescriptions without updating the `isProductDesc` regex.

---

## Code Examples

### Current `extractRxPdfCoords` (PARSE-10 — already fixed)
```javascript
// Source: 처방전.html:4323-4341
async function extractRxPdfCoords(pdfDoc) {
  const allItems = [];
  const lastPage = pdfDoc.numPages;  // ← was pdfDoc.numPages - 2 before fix
  for (let p = 1; p <= lastPage; p++) {
    // ... reads ALL pages including the last (cost page)
    // cost page: no 포/병/봉 units → automatically generates no product rows
  }
}
```

### Current `assignToBlock` (PARSE-11 — already fixed)
```javascript
// Source: 처방전.html:4598-4615
function assignToBlock(y, page) {
  const pageBlocks = /* sorted by yMin */;
  for (let i = 0; i < pageBlocks.length; i++) {
    const cur  = pageBlocks[i];
    const next = pageBlocks[i + 1];
    const upperBound = next ? (cur.yMax + next.yMin) / 2 : Infinity;  // midpoint
    if (y <= upperBound) return cur.idx;
  }
  return pageBlocks[pageBlocks.length - 1].idx;
}
```

### Current `detectTypeFromParsedLabel` (PARSE-12 — already fixed)
```javascript
// Source: 처방전.html:4344-4354
function detectTypeFromParsedLabel(label, products) {
  const text = [label, ...products.map(p => p.key), ...products.map(p => p.desc)].join(' ');
  if (/엽면/.test(text)) return '엽면';
  if (/관주/.test(text)) return '관주';
  // ← NEW: checks product keys, not just label text
  if ((products||[]).some(p => /옥스팜|뉴천연팜|옥토팜/.test(p.key||''))) return '기비';
  if (/감사|수확/.test(text)) return '감사비료';
  if (/기비|밑거름|기본시비|토양|경운/.test(text)) return '기비';
  return '';
}
```

### SYNC-01 rxPendingPdf Auto-Load (처방전.html:1107-1166)
```javascript
// Triggers when: stages.length === 0 on DOMContentLoaded
if (stages.length === 0) {
  (async () => {
    const b64 = localStorage.getItem('rxPendingPdf');
    if (!b64) return;
    localStorage.removeItem('rxPendingPdf');
    // ... decode, parse with extractRxPdfCoords + parseRxPdfCoords
    // ... extract cost with extractCostFromPdfDoc
    // ... _saveRxStages()
  })();
}
```

### SYNC-02 Back-to-Cart Sync (처방전.html:5857-5888)
```javascript
function goBackToCart() {
  // Aggregate stage product quantities into rxData.cart
  const totals = {};
  stages.forEach(st => { (st.products||[]).forEach(p => { totals[p.key] += p.qty; }); });
  rxData.cart = /* updated quantities */;
  _saveRxStages();
  localStorage.setItem('rxData', JSON.stringify(rxData));  // one-shot key
  location.href = 'index.html';
}
// index.html reads rxData on pageshow via _loadRxDataFromStorage()
```

---

## PDF Corpus Analysis

### All Prescription PDFs in Project Folder

| File | Pages | 기비 Products | 평당가 in PDF | Multi-stage Page |
|------|-------|-------------|-------------|-----------------|
| test_cheonghy.pdf | 7 | 옥토팜/옥스팜/뉴천연팜 | 합계=1,292,500원 평당(2,350원) | P4,5,6: 3 stages each (4월/5월/6월) |
| 천혜향(550평)...pdf | 7 | 옥토팜/옥스팜/뉴천연팜 | 합계=1,292,500원 평당(2,350원) | Same as test_cheonghy (duplicate) |
| 레드향(1250평)...pdf | 8 | 옥토팜/옥스팜/뉴천연팜 | 합계=2,317,500 평당(1,854원) | P4,5,6,7: 3 stages each |
| (옥토X)레드향(1250평)...pdf | 8 | 옥스팜/뉴천연팜 only | 합계=1,617,500 평당(1,294원) | P3-7: stages |
| 깻잎(400평)...pdf | 4 | 옥토팜/옥스팜/뉴천연팜 | 합계=656,000원 평당(1,640원) | Single stages per page |
| 오이(천안)...pdf | 3 | None | None | P2: stages, P3: blank |
| 메론(1000평)...pdf | 8 | 옥토팜/옥스팜/뉴천연팜 | 합계=0원 평당(0원) (placeholder) | — |
| 메론(500평)...pdf | 9 | 옥토팜/옥스팜/뉴천연팜 | 평당(000원) (placeholder) | — |
| 샤인(1000평)...pdf | 15 | 없음 | 합계=0 평당(0원) (placeholder) | P2-14: 3 stages each |
| 수박(1000평)...pdf | 9 | 없음 | 합계=000원 평당(000원) (placeholder) | P2-8: stages |
| 수박(1200평)진천(옥동리).pdf | 5 | 옥토팜/옥스팜/뉴천연팜 | 합계=1,908,000원 평당(1,590원) | P2: 기비 table, P3: stages |
| 수박(1200평)진천(한천리).pdf | 5 | 옥토팜/옥스팜/뉴천연팜 | 합계=1,908,000원 평당(1,590원) | Same structure as above |
| 수박(3200평)진천(한천리).pdf | 5 | 옥토팜/옥스팜/뉴천연팜 | 합계=5,088,000원 평당(1,590원) | Same structure |
| 수박(24년)...pdf | 7 | 뉴천연팜/옥스팜 | None (old text-only format) | Text columns, no layout |

### Cost Page Format Matrix

| Format | "사용금액" | "합계=X원" | "평당(Y원)" | "소매가/공급가" | `_isCostPage` result |
|--------|----------|-----------|-----------|--------------|---------------------|
| 송한천님 style | ✓ | ✓ | ✓ | ✗ | PASS (금액+합계+계 = 3) |
| 수박/진천 style | ✗ | ✓ | ✓ | ✓ | PASS (소매가+공급가+합계+계 = 4+) |
| 깻잎 style | ✗ | ✓ (1 line) | ✓ (1 line) | ✗ | **BORDERLINE** (합계+계 = 2, threshold = 3) |
| Placeholder (000원) | varies | 0원 | 0원 | varies | PASS but extracts 0 |

**Action item:** Verify 깻잎 cost page detection. If it fails, fix: add "사용" to `_COST_KW` or lower `_COST_KW_MIN` to 2.

---

## What Needs To Be Built (Confirmed Gaps)

### Gap 1: Verification / Smoke Testing
All PARSE-10~14 fixes are in the code but have NOT been tested end-to-end against the real PDFs. The plan needs tasks that open each prescription PDF and verify:
- Correct stage count and types
- Correct product assignment per stage
- Correct cost page 평당가 extraction
- No "last page stages missing" regression

### Gap 2: `_isCostPage` for 깻잎 Style
깻잎(400평) cost data: `"합계=656,000,원 평당(1,640원)"` — only keywords are "합계" and "계" (from "합계") = 2, which is below `_COST_KW_MIN = 3`. **Cost extraction will silently fail.** Fix: Add `"사용"` or `"평당"` to `_COST_KW`, OR lower threshold to 2.

### Gap 3: SYNC-02 UX Clarity
The current SYNC-02 flow requires the user to click "← 거래명세표" button. The requirement text ("저장 → 동기화") could mean either (a) auto-sync on `_saveRxStages`, or (b) sync via the back button.

**Recommended interpretation:** The "← 거래명세표" button IS the save+sync action. No auto-sync needed. The plan should document this as-is and add a UI verification test.

### Gap 4: SYNC-01 Navigation UX
After uploading a prescription PDF in index.html, the user must manually navigate to 처방전.html for the `rxPendingPdf` auto-load to trigger. The plan should verify whether a toast message directing the user to click "처방전" navigation exists, or add one.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual browser testing (no automated test framework) |
| Config file | none |
| Quick run command | Open each PDF in 처방전.html, check console output |
| Full suite command | Load all 14 PDFs, verify stage counts and types |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Test Method |
|--------|----------|-----------|------------|
| PARSE-10 | All pages parsed (last page not excluded) | smoke | Load test_cheonghy.pdf → expect 6월 stages (page 6) present |
| PARSE-11 | Products correctly assigned per stage on multi-stage pages | smoke | Load test_cheonghy.pdf page 4 (3 stages) → verify each stage has its own products |
| PARSE-12 | 옥스팜/뉴천연팜/옥토팜 stages classified as 기비 | smoke | Load 깻잎 or 레드향 → stage on page 2 should be type='기비' |
| PARSE-13 | Same-month stages share one cost row | visual | Load test_cheonghy.pdf → cost page shows "4월" ONCE with summed amount |
| PARSE-14 | PDF 평당가 extracted and shown in cost modal | smoke | Load 레드향(1250평) → rxData.extractedUnitPrice = 1854 |
| SYNC-01 | 처방전.html auto-loads stages from rxPendingPdf | flow | Upload PDF in index.html → navigate to 처방전.html → stages appear |
| SYNC-02 | index.html cart reflects 처방전.html stage products | flow | Edit stage quantity in 처방전.html → click ← 거래명세표 → cart updated |

### Wave 0 Gaps
- No automated test infrastructure exists — all testing is manual browser verification
- Verification plan should include a checklist-style VERIFICATION.md

---

## Open Questions

1. **깻잎 `_isCostPage` failure — severity?**
   - What we know: 깻잎(400평) cost line has only 2 matching keywords
   - What's unclear: Does this PDF actually fail, or does "합계=656,000,원" + "평당(1,640원)" count as 3 (합계 + 계 + 금액 from "원" substring)?
   - Recommendation: Test manually; if it fails add "사용" to `_COST_KW`

2. **SYNC-02 scope — auto-sync vs. manual button?**
   - What we know: `goBackToCart()` exists and works; requirement says "저장 → 동기화"
   - What's unclear: Does "저장" mean clicking the back button, or auto-on-edit?
   - Recommendation: Treat existing button as sufficient unless UX review says otherwise

3. **PARSE-14 per-month PDF 평당가 extraction**
   - What we know: `_extractCostFromTexts` extracts the FINAL total 평당가 from the cost page footer line
   - What's unclear: Should per-month 평당가 values from the PDF cost page (e.g., "기비용 평당(1,454원)", "3월 평당(131원)") be extracted and used to pre-populate the stage cost view?
   - Recommendation: Out of scope for PARSE-14 as stated; PARSE-14 says "명시된 평당가 값" = the overall total, which already works

---

## Environment Availability

Step 2.6: SKIPPED — Phase is pure code/HTML modification with no external dependencies beyond the browser environment already in use.

---

## Sources

### Primary (HIGH confidence)
- 처방전.html direct analysis — lines 4323-4822 (`extractRxPdfCoords`, `parseRxPdfCoords`, `assignToBlock`, `detectTypeFromParsedLabel`), lines 4850-4929 (`_isCostPage`, `extractCostFromPdfDoc`), lines 1107-1166 (`rxPendingPdf` IIFE), lines 5857-5888 (`goBackToCart`)
- index.html direct analysis — lines 2676-2779 (`onPdfSelected`), lines 1036-1058 (`_loadRxDataFromStorage`), lines 1954-1979 (`goToPrescription`)
- git log — commits 209033a (PARSE-10), 01c99d9 (PARSE-11), c6de2b8 (PARSE-12)
- pdftotext analysis of all 14 prescription PDFs in project folder

### Secondary (MEDIUM confidence)
- Cost page keyword detection: verified by running per-keyword grep against actual PDF text output

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — vanilla JS, no new libraries
- Architecture: HIGH — all functions read directly from source
- Current state: HIGH — git log and code analysis confirm which fixes are committed
- Remaining gaps: MEDIUM — 깻잎 _isCostPage edge case needs browser verification

**Research date:** 2026-03-27
**Valid until:** 2026-04-10 (code is stable; PDF corpus is fixed)
