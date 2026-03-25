# Phase 3: 처방이력 + 템플릿 - Research

**Researched:** 2026-03-25
**Domain:** Vanilla JS localStorage — snapshot storage, history UI, proportional scaling
**Confidence:** HIGH (all findings from direct codebase inspection)

---

## Summary

Phase 3 adds prescription history (processing snapshots) and template functionality on top of the customer DB built in Phase 2. The app already has a `saveInvoice()` function called at every print/PDF/email trigger that writes invoice records to IndexedDB + localStorage. The `fertilizer_prescriptions` localStorage key was initialized in Phase 1 but never written to (only `countPrescriptions()` reads it). This phase must bridge those two stores: when a prescription is published, write a prescription snapshot into `fertilizer_prescriptions` with a `customerId` foreign key.

The core new file will be `prescriptionHistoryDB.js` (following the `customerDB.js` IIFE pattern) and `prescriptionHistoryUI.js`. The history panel follows the `custListOverlay` modal pattern already established. Template logic requires a proportional scaling step: `newQty = round(oldQty * newArea / sourceArea)`.

The key architectural risk is that the `saveInvoice()` function inside `index.html` already handles dedup logic and fires at `doPrint()`, `doPdf()`, and `doEmail()`. The prescription snapshot must hook into the same three triggers without duplicating dedup logic. The cleanest approach: add a `savePrescrSnapshot()` call immediately after `saveInvoice()` at all three sites, or inside `saveInvoice()` itself.

**Primary recommendation:** Add prescription snapshot writes to `CustomerDB` (extend `customerDB.js` with `savePrescription` / `listPrescriptions` / `searchPrescriptions`) rather than creating a fully separate file, since the data key already exists there. Add a new `prescriptionHistoryUI.js` for the panel and template banner UI.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIST-01 | 거래명세표 발행(인쇄/저장) 시 처방 스냅샷이 자동으로 저장된다 | `doPrint()`, `doPdf()`, `doEmail()` all call `saveInvoice()` — hook `savePrescrSnapshot()` at the same three call sites |
| HIST-02 | 저장된 처방이력을 불러와 수정 후 재발행할 수 있다 (원본 유지, 복사본 편집) | Load snapshot into `cart` + customer fields; never mutate the stored record; pattern identical to `_loadRxDataFromStorage()` |
| HIST-03 | 처방이력은 고객, 작물, 날짜로 검색·필터링할 수 있다 | In-memory filter over `_get(KEYS.prescriptions)` — same approach as `_renderCustomerList()` |
| TMPL-01 | 저장된 처방이력에서 유사 처방(같은 작물, 비슷한 면적)을 검색해 새 처방의 시작점으로 사용한다 | Search prescriptions by crop on `cCrop` input change; show recommendation banner like `historyPill` |
| TMPL-02 | 처방 항목(제품, 수량)을 불러온 뒤 면적에 맞게 수량을 자동 비례 조정한다 | `newQty = Math.max(1, Math.round(item.qty * newArea / sourceArea))` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| localStorage (native) | Browser API | Prescription snapshot persistence | Already used for all data in this app |
| Vanilla JS IIFE | — | Module encapsulation | Project pattern: `window.CustomerDB` namespace |
| IndexedDB (native) | Browser API | Invoice storage | Already used in `index.html` for `invoiceHistory`; prescriptions stay in localStorage per existing schema |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new | — | — | No new dependencies needed |

**Installation:** None required. All APIs are browser-native.

---

## Architecture Patterns

### Recommended Project Structure
```
customerDB.js        # extend: add savePrescription, listPrescriptions, searchPrescriptions, findPrescriptionsByCustomer
prescriptionHistoryUI.js  # NEW: history panel modal + template banner
index.html           # patch: hook savePrescrSnapshot at doPrint/doPdf/doEmail sites
```

### Pattern 1: Prescription Snapshot Schema

**What:** A single immutable record written at publish time.
**When to use:** Saved once; never mutated. To "edit" a past prescription, load a copy into the live cart.

```javascript
// Written once at doPrint / doPdf / doEmail time
var snapshot = {
  id:          'p_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
  savedAt:     new Date().toISOString(),
  customerId:  _currentCustomerId || null,  // from customerUI.js closure
  customer: {
    name:   name,
    crop:   document.getElementById('cCrop').value || '',
    area:   parseFloat(document.getElementById('cArea').value) || 0,
    region: document.getElementById('cRegion').value || '',
    phone:  document.getElementById('cPhone').value || ''
  },
  items: cart.map(function(c) {
    return { name: c.name, size: c.size, retail: c.retail, sp: c.sp, qty: c.qty, gift: c.gift || false };
  }),
  discountRate: parseFloat(document.getElementById('gDisc').value) || 0,
  vatIncluded:  document.getElementById('vatChk').checked,
  totals: {
    supply:     supply,
    grandTotal: grandTotal
  }
};
```

**Key design decision:** `customerId` links to `fertilizer_customers`. Can be `null` if customer was not saved to DB. The snapshot `customer` sub-object is denormalized — it captures name/crop/area at the moment of publication, so future edits to the customer record do not alter history.

### Pattern 2: Loading History into Cart (HIST-02)

**What:** Copy snapshot fields into live cart and form fields. Identical to `_loadRxDataFromStorage()`.
**When to use:** User clicks "불러오기" on a history item.

```javascript
// prescriptionHistoryUI.js
function loadSnapshotIntoCart(snapshot) {
  cart = snapshot.items.map(function(item, idx) {
    return {
      i: 'hist_' + Date.now() + '_' + idx,
      name:  item.name,
      size:  item.size,
      retail: item.retail,
      sp:    item.sp,
      qty:   item.qty,
      disc:  item.retail > 0 ? Math.round((1 - item.sp / item.retail) * 100) : 0,
      gift:  item.gift || false,
      custom: true
    };
  });
  document.getElementById('cName').value   = snapshot.customer.name  || '';
  document.getElementById('cCrop').value   = snapshot.customer.crop  || '';
  document.getElementById('cArea').value   = snapshot.customer.area  || '';
  document.getElementById('cRegion').value = snapshot.customer.region || '';
  document.getElementById('gDisc').value   = snapshot.discountRate   || 0;
  if (typeof applyGlobalDisc === 'function') applyGlobalDisc();
  if (typeof render === 'function') render();
  if (typeof syncPrint === 'function') syncPrint();
  showToast('처방이력 불러옴 — 수정 후 재발행 가능');
}
```

### Pattern 3: Proportional Quantity Scaling (TMPL-02)

**What:** When template items are loaded, scale quantities by the ratio of new area to source area.
**When to use:** Template-from-history flow — user enters a new customer area after template is suggested.

```javascript
function scaleItemsByArea(items, sourceArea, newArea) {
  if (!sourceArea || sourceArea <= 0 || !newArea || newArea <= 0) return items;
  var ratio = newArea / sourceArea;
  return items.map(function(item) {
    return Object.assign({}, item, {
      qty: Math.max(1, Math.round(item.qty * ratio))
    });
  });
}
```

**Edge cases:** `sourceArea = 0` (divide-by-zero guard required). `newArea = 0` (don't scale). Minimum qty = 1.

### Pattern 4: Template Recommendation Banner (TMPL-01)

**What:** When `cCrop` changes and prescriptions exist for that crop, show a sticky banner above the cart.
**When to use:** User selects a crop that has past prescriptions.

```javascript
// Triggered by cCrop input/change event
function _onCropChange() {
  var crop = (document.getElementById('cCrop') || {}).value || '';
  if (!crop) { _hideTmplBanner(); return; }
  var matches = CustomerDB.searchPrescriptionsByCrop(crop);
  if (matches.length > 0) {
    _showTmplBanner(matches[0]); // Show most recent match
  } else {
    _hideTmplBanner();
  }
}
```

**Where to anchor the banner:** Insert above `#ordList` inside `.right` panel. CSS: `position: sticky; top: 0; z-index: 10`.

### Pattern 5: History Filter (HIST-03)

**What:** In-memory filter over all prescriptions.

```javascript
// In customerDB.js
searchPrescriptions: function(opts) {
  // opts: { name, crop, dateFrom, dateTo }
  var list = _get(KEYS.prescriptions);
  if (opts.name) {
    var q = opts.name.toLowerCase();
    list = list.filter(function(p) { return p.customer.name && p.customer.name.toLowerCase().includes(q); });
  }
  if (opts.crop) {
    list = list.filter(function(p) { return p.customer.crop === opts.crop; });
  }
  if (opts.dateFrom) {
    list = list.filter(function(p) { return p.savedAt >= opts.dateFrom; });
  }
  if (opts.dateTo) {
    list = list.filter(function(p) { return p.savedAt <= opts.dateTo + 'T23:59:59'; });
  }
  return list.sort(function(a, b) { return b.savedAt.localeCompare(a.savedAt); });
}
```

### Pattern 6: Hooking into saveInvoice (HIST-01)

**What:** The three publish triggers are `doPrint()`, `doPdf()`, `doEmail()` in `index.html`. Each already calls `saveInvoice()`.
**When to use:** The cleanest hook is to call `CustomerDB.savePrescrSnapshot(buildSnapshotFromLiveState())` in each of the three functions immediately after `saveInvoice()`.

```javascript
// index.html patch — doPrint():
function doPrint(){
  saveInvoice();
  CustomerDB.savePrescrSnapshot(_buildPrescrSnapshot()); // ADD THIS
  ...
}
```

`_buildPrescrSnapshot()` is a helper defined in `index.html` or `prescriptionHistoryUI.js` that reads live DOM + cart state.

**Why not inside `saveInvoice()` directly:** `saveInvoice()` already guards with `if(!name||!phone)return`. Prescription snapshots should save even if phone is blank (for new customers). Keeping the call separate avoids coupling the two save paths.

### Anti-Patterns to Avoid

- **Mutating stored snapshots:** HIST-02 says "원본 유지 (원본은 이후 수정되지 않는다)". Never update a saved prescription record. Create a new record at next publish.
- **Storing HTML in snapshots:** The snapshot must store raw data (`items[]`, `customer`, `totals`), not rendered HTML. HTML is generated at display time.
- **Saving dedup by content hash:** The 60-second dedup in `saveInvoice()` is time-based. Prescription snapshots need a simpler guard: skip if `cart.length === 0` or if no `name` is set.
- **Scaling by quantity input directly:** Always scale from the original `snapshot.items[].qty`, not from whatever is currently in the cart (which may have been manually edited).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date range filter UI | Custom date picker | Native `<input type="date">` | Already used for `cDate` in index.html; consistent, no deps |
| Search debounce | Custom timer | Standard 150–300ms setTimeout pattern | Already used in customer autocomplete blur delay |
| localStorage quota error | Silent ignore | Try/catch with user-facing `showToast()` | `showToast()` already exists in index.html |
| Modal overlay | New CSS system | Reuse `.overlay` / `custListOverlay` pattern | Already two overlay patterns in codebase |

---

## Common Pitfalls

### Pitfall 1: `_currentCustomerId` is a closure in customerUI.js

**What goes wrong:** `prescriptionHistoryUI.js` cannot directly read `_currentCustomerId` from `customerUI.js` — it's a private closure variable.
**Why it happens:** The IIFE pattern correctly hides internals.
**How to avoid:** `customerUI.js` must expose a getter: `window.CustomerUI = { getCurrentCustomerId: function() { return _currentCustomerId; } }` — or pass the value through a DOM data attribute when the customer is selected.
**Warning signs:** `savePrescrSnapshot` stores `customerId: null` even when a customer is selected.

### Pitfall 2: `fertilizer_prescriptions` key already initialized but empty

**What goes wrong:** Reading prescriptions at app startup is fine. Writing the first record may show stale UI (count badge still shows 0 until page refresh) if the badge is only updated at page load.
**Why it happens:** `countPrescriptions()` in `customerUI.js` reads storage at selection time. After saving a snapshot, call `_updateHistoryBadge(customerId)` explicitly.
**How to avoid:** After `CustomerDB.savePrescrSnapshot()`, call the badge update function.
**Warning signs:** Badge shows "0건 처방이력" for a customer that just had their first prescription published.

### Pitfall 3: `cCrop` is a `<select>` not a text `<input>`

**What goes wrong:** Attaching `oninput` instead of `onchange` to the crop select may not fire reliably across browsers for select elements.
**Why it happens:** `input` event fires on `<input>` elements; `change` fires on `<select>`.
**How to avoid:** Use `addEventListener('change', ...)` for `#cCrop`.
**Warning signs:** Template banner never appears.

### Pitfall 4: Proportional scaling with area = 0

**What goes wrong:** `0 / 0 = NaN`, `qty * NaN = NaN`, which renders as blank in the UI.
**Why it happens:** Customers may not have area set (optional field).
**How to avoid:** Guard: `if (!sourceArea || !newArea) skip scaling`. Show a toast "면적 미입력 — 수량 비례 조정 건너뜀".
**Warning signs:** Cart items show NaN quantity after template load.

### Pitfall 5: localStorage size limit

**What goes wrong:** After many prescriptions, localStorage may approach the ~5MB browser limit.
**Why it happens:** Each snapshot stores full item arrays with all price fields.
**How to avoid:** No immediate mitigation needed for v1 (prescriptions are small — ~1KB each). Document as known limitation. For future: add a "최근 100건만 유지" cleanup function.
**Warning signs:** `localStorage.setItem` throws `QuotaExceededError`.

### Pitfall 6: Script load order

**What goes wrong:** `prescriptionHistoryUI.js` calls `CustomerDB.savePrescrSnapshot()` but `customerDB.js` must be loaded first.
**Why it happens:** Vanilla JS, no module system.
**How to avoid:** In `index.html`, `<script src="customerDB.js">` already precedes `<script src="customerUI.js">`. Add `<script src="prescriptionHistoryUI.js">` after `customerUI.js`.
**Warning signs:** `CustomerDB.savePrescrSnapshot is not a function` in console.

---

## Code Examples

### CustomerDB extensions (customerDB.js)

```javascript
// Source: direct codebase analysis — follows existing _get/_set/KEYS pattern

savePrescrSnapshot: function(snapshot) {
  if (!snapshot || !snapshot.items || !snapshot.items.length) return null;
  var list = _get(KEYS.prescriptions);
  list.push(snapshot);
  _set(KEYS.prescriptions, list);
  return snapshot;
},

listPrescriptions: function(customerId) {
  var all = _get(KEYS.prescriptions);
  if (customerId) {
    return all.filter(function(p) { return p.customerId === customerId; })
              .sort(function(a, b) { return b.savedAt.localeCompare(a.savedAt); });
  }
  return all.sort(function(a, b) { return b.savedAt.localeCompare(a.savedAt); });
},

searchPrescriptionsByCrop: function(crop) {
  if (!crop) return [];
  return _get(KEYS.prescriptions)
    .filter(function(p) { return p.customer && p.customer.crop === crop; })
    .sort(function(a, b) { return b.savedAt.localeCompare(a.savedAt); });
},

deletePrescription: function(id) {
  var list = _get(KEYS.prescriptions);
  _set(KEYS.prescriptions, list.filter(function(p) { return p.id !== id; }));
}
```

### Script tag ordering in index.html

```html
<!-- existing -->
<script src="customerDB.js?v=2"></script>
<script src="customerUI.js?v=1"></script>
<!-- add Phase 3 -->
<script src="prescriptionHistoryUI.js?v=1"></script>
```

---

## Key Data Flows

### HIST-01: Publish → Snapshot

```
doPrint() / doPdf() / doEmail()
  └─ saveInvoice()           (writes to IndexedDB/localStorage invoiceHistory)
  └─ CustomerDB.savePrescrSnapshot(
       _buildPrescrSnapshot()  // reads cart + DOM + CustomerUI.getCurrentCustomerId()
     )                        (writes to fertilizer_prescriptions)
  └─ CustomerUI.refreshHistoryBadge()
```

### HIST-02: History → Cart (restore)

```
User clicks history item
  └─ prescriptionHistoryUI._loadSnapshot(snapshot)
     └─ cart = snapshot.items.map(...)
     └─ fill form fields
     └─ applyGlobalDisc() + render() + syncPrint()
     └─ showToast('처방이력 불러옴 — 수정 후 재발행 가능')
     └─ close history modal
```

### TMPL-01/02: Crop selected → Template banner

```
#cCrop change event
  └─ CustomerDB.searchPrescriptionsByCrop(crop)
  └─ if results.length > 0 → show banner with most-recent match
     └─ User clicks "이 처방 사용"
        └─ load items from snapshot
        └─ scaleItemsByArea(items, snapshot.customer.area, currentArea)
        └─ fill cart + sync
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `rxData` localStorage (one-way, consumed) | `fertilizer_prescriptions` (permanent array) | rxData was a "pass-through" from prescription model; prescriptions are permanent records |
| No prescription history | `fertilizer_prescriptions` array | Key initialized in Phase 1, ready to use |

---

## Open Questions

1. **`_currentCustomerId` exposure**
   - What we know: it's private in `customerUI.js` closure
   - What's unclear: preferred exposure pattern (getter on `window.CustomerUI` vs DOM data attribute)
   - Recommendation: add `window.CustomerUI = { getCurrentCustomerId: function() { return _currentCustomerId; } }` to `customerUI.js`

2. **처방이력 저장 trigger — 인쇄 버튼 vs 별도 저장 버튼**
   - Noted in STATE.md as an unresolved UX question
   - Recommendation: hook into all three existing triggers (`doPrint`, `doPdf`, `doEmail`) for consistency with `saveInvoice()`. Do NOT add a fourth separate button — that contradicts success criterion 1 ("인쇄하거나 저장하면 자동으로").

3. **Template: most recent match vs. user-selectable?**
   - Success criterion 4 says "추천 배너가 나타난다" (banner), not a list
   - Recommendation: banner shows most recent crop match with a single "불러오기" action; a secondary "다른 이력 보기" link opens the full history modal filtered by crop

4. **History panel placement**
   - Success criterion 2/3 refers to a "처방이력 목록" — separate modal or inline?
   - Recommendation: reuse `custListOverlay` modal pattern; trigger from `historyPill` badge click

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. All APIs are browser-native localStorage/DOM.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected (vanilla JS, no test runner configured) |
| Config file | None — manual browser testing is the project norm |
| Quick run command | Open `index.html` in browser, execute console assertions |
| Full suite command | Same — no automated suite exists |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIST-01 | Snapshot saved when doPrint() called | manual | Open browser, click 인쇄, check `JSON.parse(localStorage.getItem('fertilizer_prescriptions'))` | N/A — manual only |
| HIST-01 | Snapshot not duplicated within 60 seconds | manual | Call doPrint() twice rapidly; expect 1 record | N/A |
| HIST-02 | Load history → cart populated + form filled | manual | Click history item, verify cart + form fields match snapshot | N/A |
| HIST-02 | Original snapshot unchanged after load+edit | manual | Load, mutate cart, re-check localStorage record | N/A |
| HIST-03 | Filter by customer name returns only matching | manual | Console: `CustomerDB.searchPrescriptions({name:'홍'})` | N/A |
| HIST-03 | Filter by date range returns correct subset | manual | Console assertion | N/A |
| TMPL-01 | Banner appears when crop matches saved prescription | manual | Select crop that has history; verify banner visible | N/A |
| TMPL-01 | Banner absent when no crop match | manual | Select crop with no history; verify banner hidden | N/A |
| TMPL-02 | Quantities scale proportionally | manual | Source area=100, new area=200, qty=3 → expected qty=6 | N/A |
| TMPL-02 | Min qty = 1 when scaled down | manual | Source area=200, new area=50, qty=1 → expected qty=1 | N/A |

### Wave 0 Gaps

No automated test infrastructure exists or is needed — project is validated by browser interaction. The planner should include browser verification steps in each task's "Done when" criteria.

*(No Wave 0 file creation needed — no test framework to install)*

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `index.html` lines 922, 984–1007, 1558–1564, 1849–1895
- Direct codebase inspection: `customerDB.js` lines 1–128 (full file)
- Direct codebase inspection: `customerUI.js` lines 1–504 (full file)
- `fertilizer_prescriptions` key: `customerDB.js` KEYS object + `_migrate()` function

### Secondary (MEDIUM confidence)
- STATE.md: "처방이력 저장 trigger 미결정" blocker entry — confirms UX question is open
- ROADMAP.md + REQUIREMENTS.md: phase goals, success criteria

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from codebase; no new libraries needed
- Architecture patterns: HIGH — all patterns directly derived from existing code in customerDB.js / customerUI.js
- Pitfalls: HIGH — each pitfall identified from concrete code inspection
- Proportional scaling formula: HIGH — straightforward arithmetic with documented edge cases

**Research date:** 2026-03-25
**Valid until:** 2026-06-25 (stable vanilla JS codebase, localStorage API unchanging)
