# Phase 4: 거래이력 + 미수금 + 매출 - Research

**Researched:** 2026-03-25
**Domain:** Vanilla JS SPA — invoice payment tracking, receivables management, period-based sales aggregation
**Confidence:** HIGH (all findings sourced from direct codebase inspection)

---

## Summary

Phase 4 요구사항(SALE-01~05)의 핵심 기능 대부분이 이미 `index.html` 안에 구현되어 있다. `saveInvoice()`, `addPayment()`, `removePayment()`, `deleteInvoice()`, `openAllUnpaid()`, `openUnpaidModal()`, `updateUnpaidBadge()` 함수가 모두 존재하며, 미입금 모달 UI와 전체 미수금 목록 오버레이도 HTML로 렌더링된다.

**누락된 기능은 두 가지다.** 첫째, 기간별 매출 집계 화면(이번 달/지난 달/직접 입력)이 없다 — SALE-04 전체가 미구현이다. 둘째, 고객별 총 거래금액 + 현재 미수금 잔액 요약 뷰가 없다 — SALE-05 전체가 미구현이다. SALE-01/02/03은 이미 인덱스에 구현되어 있으나, `fertilizer_transactions` (CustomerDB 관리 localStorage 키)와 `invoiceHistory` (IndexedDB 관리 별도 캐시)가 **이중 저장 구조**로 분리되어 있어 연결하는 작업이 필요하다.

**Primary recommendation:** 기존 `saveInvoice()` / `addPayment()` 함수를 최소한으로 수정하되, `fertilizer_transactions` 에 미러 쓰기를 추가해 CustomerDB.exportAll() 이 거래 데이터도 포함하도록 연결한다. 매출 집계(SALE-04)와 고객별 요약(SALE-05)은 `salesHistoryUI.js` 신규 파일로 추가한다.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SALE-01 | 발행된 거래명세표(고객, 날짜, 금액, 품목)를 저장한다 | `saveInvoice()` 이미 구현 — IndexedDB + localStorage 폴백. `fertilizer_transactions` 미러 쓰기 추가 필요 |
| SALE-02 | 거래별 납부 여부(납부완료/미납)를 기록한다 | `addPayment()`, `removePayment()` 이미 구현 — status: '미입금'/'일부입금'/'입금완료'. `fertilizer_transactions` 동기화 필요 |
| SALE-03 | 미납 거래를 목록으로 조회한다 (미수금 관리) | `openUnpaidModal()`, `openAllUnpaid()` 이미 구현. 미구현: 전체 미수금 목록에서 입금 액션 인라인 미제공 |
| SALE-04 | 기간별(월/분기) 매출 합계를 조회한다 | 완전 미구현 — 신규 UI + 집계 로직 필요 |
| SALE-05 | 고객별 총 거래금액 및 미수금을 조회한다 | 완전 미구현 — 신규 UI + 집계 로직 필요 |
</phase_requirements>

---

## Critical Discovery: 기존 구현 현황

### 이미 구현된 기능 (index.html 내)

| 기능 | 함수명 | 위치 (line approx) | 상태 |
|------|--------|-------------------|------|
| 거래 저장 | `saveInvoice()` | ~1891 | 완전 구현 |
| 납부 기록 추가 | `addPayment(id, amount, payDate, payer)` | ~1939 | 완전 구현 |
| 납부 기록 취소 | `removePayment(invId, payIdx)` | ~1960 | 완전 구현 |
| 거래 소프트 삭제 | `deleteInvoice(id)` | ~1977 | 완전 구현 |
| 미입금 뱃지 갱신 | `updateUnpaidBadge()` | ~1989 | 완전 구현 |
| 현재 고객 미입금 모달 | `openUnpaidModal(name, phone)` | ~2026 | 완전 구현 |
| 전체 미수금 목록 | `openAllUnpaid()` | ~3105 | 완전 구현 (지역별 그룹) |
| 미입금 인라인 입력 UI | `renderUnpaidList()` 내 cardHtml | ~2064 | 완전 구현 |

### 저장소 구조 이중화 문제 (CRITICAL)

현재 거래 데이터는 두 개의 분리된 저장소에 관리된다:

**저장소 A — IndexedDB (invoiceHistory)**
- DB명: `NTBioInvoices`, Store: `invoices`
- 캐시: `_invoiceCache` 전역 변수
- 접근: `getInvoiceHistory()` / `setInvoiceHistory()`
- localStorage 폴백 키: `invoiceHistory`
- 서버 동기화: Google Apps Script API (`INVOICE_API`)

**저장소 B — localStorage (fertilizer_transactions)**
- 관리: `CustomerDB._KEYS.transactions` → `fertilizer_transactions`
- 초기화: `_migrate()` 에서 빈 배열로 초기화됨
- 현재 사용: `CustomerDB.exportAll()` 에서 포함되지만 **실제 데이터는 비어있음**
- SALE-01/02 구현 시 saveInvoice()가 IndexedDB에만 써서 CustomerDB 백업에 포함되지 않는 상태

**결론:** Phase 4에서 `saveInvoice()` 와 `addPayment()` 가 `fertilizer_transactions` 에도 미러 쓰기하도록 연결해야 CustomerDB.exportAll() 백업이 완전해진다. 단, 기존 동작을 깨지 않는 방향으로 — IndexedDB가 primary, localStorage는 export/import용 미러.

### 레코드 스키마 (기존 saveInvoice() 생성 구조)

```javascript
{
  id: '1711000000000_1234',      // Date.now() + random
  savedAt: '2026-03-25T...',    // ISO string
  status: '미입금',              // '미입금' | '일부입금' | '입금완료' | '삭제됨'
  paidAt: null,
  paidAmount: 0,
  payments: [],                  // [{amount, date, payer?, cancelled?, cancelledAt?}]
  customer: {
    name, phone, phone2, addr, region, area, crop, date
  },
  items: [{name, size, retail, sp, qty, gift, date}],
  totals: {retail, supply, vatIncluded, vatAmount, grandTotal},
  // Phase 4 추가 필요:
  customerId: null               // CustomerUI.getCurrentCustomerId() — 이미 _buildPrescrSnapshot에서 수집함
}
```

`saveInvoice()` 레코드에는 `customerId`가 없다. `_buildPrescrSnapshot()`에는 있다. Phase 4에서 `saveInvoice()` 실행 시 `CustomerUI.getCurrentCustomerId()`를 호출해 `customerId`를 레코드에 추가해야 SALE-05 고객별 집계가 가능해진다.

---

## Standard Stack

### Core (변경 없음 — 기존 패턴 그대로)

| 기술 | 버전 | 목적 |
|------|------|------|
| Vanilla JS (ES5/ES6 혼용) | — | 전체 앱 언어 |
| localStorage | — | CustomerDB 스키마 (`fertilizer_transactions`) |
| IndexedDB | — | 거래이력 primary 저장소 (`NTBioInvoices`) |
| IIFE + window 네임스페이스 | — | 모듈 패턴 (`window.CustomerDB`, `window.CustomerUI`) |
| CSS-in-JS (style injection) | — | 각 UI 파일에서 `document.createElement('style')` |

### Supporting

| 기술 | 목적 | When to Use |
|------|------|-------------|
| `document.addEventListener('DOMContentLoaded')` | UI 초기화 | 모든 신규 UI 파일 |
| `document.click` delegation | 동적 요소 이벤트 | 동적으로 삽입하는 버튼 |
| `Date` API | 기간 필터 계산 | 이번 달 / 지난 달 범위 계산 |

**Installation:** 신규 JS 파일을 index.html `<script src="">` 태그로 추가. 빌드 도구 없음.

---

## Architecture Patterns

### 기존 파일 추가 패턴

```
index.html          ← 기존 함수 최소 수정 (saveInvoice에 customerId + 미러쓰기 추가)
customerDB.js       ← transactions CRUD 메서드 추가 (saveTransaction, listTransactions 등)
salesHistoryUI.js   ← 신규: 매출 집계 + 고객별 요약 UI (SALE-04, SALE-05)
```

### 신규 파일 구조 패턴 (prescriptionHistoryUI.js 참조)

```javascript
(function() {
  'use strict';

  // 1. CSS 주입
  function _injectSalesCSS() { ... }

  // 2. 모달/패널 HTML 동적 생성
  function _createSalesPanel() { ... }

  // 3. 집계 로직 (순수 함수)
  function _calcPeriodSales(invoices, dateFrom, dateTo) { ... }
  function _calcCustomerSummary(invoices, customerName) { ... }

  // 4. 렌더링 함수
  function _renderSalesPanel() { ... }

  // 5. DOMContentLoaded 이벤트 등록
  document.addEventListener('DOMContentLoaded', function() { ... });

  // 6. 외부 API 노출
  window.SalesHistoryUI = {
    open: openSalesPanel,
    refresh: _renderSalesPanel
  };
})();
```

### CustomerDB 확장 패턴 (customerDB.js)

기존 `_get(KEYS.transactions)` / `_set(KEYS.transactions)` 를 사용하는 메서드 추가:

```javascript
// customerDB.js에 추가할 메서드들
saveTransaction: function(record) { ... },   // invoiceHistory 레코드를 transactions에 미러
updateTransaction: function(record) { ... }, // 납부 상태 변경 시 동기화
listTransactions: function(opts) { ... },    // 기간/고객 필터 조회
getCustomerSummary: function(customerName) { ... }  // SALE-05: 고객별 집계
```

### 기간 필터 계산 패턴

```javascript
// '이번 달' 범위 계산
function _thisMonthRange() {
  var now = new Date();
  var from = new Date(now.getFullYear(), now.getMonth(), 1);
  var to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),  // 'YYYY-MM-DD'
    to:   to.toISOString().slice(0, 10)
  };
}

// '지난 달' 범위 계산
function _lastMonthRange() {
  var now = new Date();
  var from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var to   = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10)
  };
}
```

### Anti-Patterns to Avoid

- **IndexedDB를 직접 쓰는 신규 코드 작성:** 기존 `getInvoiceHistory()` / `setInvoiceHistory()` 를 통해서만 접근. IDB는 비동기 — 직접 쓰기 시 race condition 발생 위험
- **fertilizer_transactions와 invoiceHistory를 merge하려는 시도:** 두 저장소는 역할이 다름. transactions는 CustomerDB 백업용 미러 — primary는 항상 IndexedDB
- **status 문자열 하드코딩:** `'미입금'`, `'일부입금'`, `'입금완료'`, `'삭제됨'` — 기존 코드의 정확한 문자열 그대로 사용 (필터 로직이 이에 의존함)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 날짜 범위 필터 | 복잡한 날짜 파싱 라이브러리 | `Date` 내장 + ISO string 비교 | 기존 `savedAt` 이 ISO string이므로 lexicographic 비교로 충분 |
| 금액 포맷 | 별도 유틸 | 기존 `won()` / `comma()` 함수 | index.html에 이미 존재 |
| 모달 오버레이 | 외부 컴포넌트 | 기존 `.overlay.on` 패턴 | Phase 2/3에서 확립된 패턴 |
| 고객 중복 매칭 | 복잡한 fuzzy match | 기존 `customerKey(name, phone)` | index.html 에 이미 구현 (`name+phone` 정규화 키) |

---

## Common Pitfalls

### Pitfall 1: invoiceHistory vs fertilizer_transactions 이중화
**What goes wrong:** `fertilizer_transactions` 에 직접 저장하면 IndexedDB 캐시(`_invoiceCache`)와 데이터가 불일치. 반대로 IndexedDB에만 저장하면 CustomerDB.exportAll() 백업 파일에 거래 데이터 누락.
**Why it happens:** Phase 1에서 schema를 잡을 때 transactions 키를 예약했지만, 실제 구현은 IndexedDB로 별도 진행됨.
**How to avoid:** `saveInvoice()` / `addPayment()` / `removePayment()` 에서 IndexedDB 저장 후 추가로 `CustomerDB.saveTransaction()` 미러 호출. 동기적 localStorage 쓰기는 항상 IndexedDB 쓰기 이후 수행.
**Warning signs:** exportAll()로 백업한 파일을 열었을 때 `transactions: []` 이면 미러가 안 된 것.

### Pitfall 2: customerId 없는 거래 레코드
**What goes wrong:** SALE-05 고객별 집계를 `customer.name` 으로 하면 고객명 변경 시 이력이 끊어짐. 동명이인 오매칭.
**Why it happens:** `saveInvoice()` 레코드에 `customerId` 필드가 없음.
**How to avoid:** `saveInvoice()` 내부에서 `typeof CustomerUI !== 'undefined' && CustomerUI.getCurrentCustomerId()` 를 호출해 `customerId` 추가. 없으면 `null` 허용.
**Warning signs:** `record.customerId` 가 undefined인 레코드.

### Pitfall 3: 기간 필터에서 날짜 timezone 오프셋
**What goes wrong:** `new Date('2026-03-01')` 은 UTC 자정으로 파싱됨. 한국(UTC+9)에서 비교 시 2월 28일 오후가 3월로 분류되는 edge case.
**Why it happens:** JS Date 는 날짜 문자열을 UTC로 파싱하나 `savedAt` 은 `new Date().toISOString()` 즉 UTC ISO string.
**How to avoid:** `savedAt` 의 앞 10자(`slice(0, 10)`)를 문자열로 직접 비교. `'2026-03-01' <= savedAt.slice(0,10) && savedAt.slice(0,10) <= '2026-03-31'` 방식 사용.
**Warning signs:** 월말/월초 거래가 집계에서 누락.

### Pitfall 4: 전체 미수금 목록(openAllUnpaid)에서 `h.deleted` vs `h.status==='삭제됨'` 불일치
**What goes wrong:** `openAllUnpaid()` 는 `h.deleted` 속성을 체크하지만 실제 삭제는 `h.status = '삭제됨'` 으로만 기록됨 — `h.deleted` 필드는 존재하지 않음.
**Why it happens:** `deleteInvoice()` 는 `status = '삭제됨'` 만 설정하고 `deleted` boolean 필드는 추가하지 않음.
**How to avoid:** 필터 조건을 `h.status !== '삭제됨'` 으로 통일. `openAllUnpaid()` 내 기존 `if(h.deleted)return false;` 는 현재 무해하나 혼란스러우므로 수정 권장.
**Warning signs:** 소프트 삭제된 항목이 미수금 목록에 표시됨.

### Pitfall 5: 매출 집계 범위 — `grandTotal` vs `supply`
**What goes wrong:** VAT 포함 여부에 따라 집계 기준이 달라질 수 있음.
**Why it happens:** `totals.grandTotal = Math.round(supply * vatMult)`. VAT 포함 시 supply × 1.1.
**How to avoid:** 매출 집계는 `totals.grandTotal` (청구 기준) 사용. supply(공급가) vs grandTotal(청구액)을 UI에서 명확히 표기.
**Warning signs:** 매출 합계가 예상보다 10% 적거나 많음.

---

## Code Examples

### 기간별 매출 집계 (SALE-04)

```javascript
// Source: index.html saveInvoice() 레코드 구조 기반 직접 도출
function calcSalesByPeriod(dateFrom, dateTo) {
  var invoices = getInvoiceHistory();
  var filtered = invoices.filter(function(h) {
    if (h.status === '삭제됨') return false;
    var d = h.savedAt.slice(0, 10);
    return d >= dateFrom && d <= dateTo;
  });
  var total = filtered.reduce(function(s, h) {
    return s + h.totals.grandTotal;
  }, 0);
  var paidTotal = filtered.reduce(function(s, h) {
    return s + (h.paidAmount || 0);
  }, 0);
  return {
    count: filtered.length,
    total: total,
    paid: paidTotal,
    unpaid: total - paidTotal,
    invoices: filtered
  };
}
```

### 고객별 요약 집계 (SALE-05)

```javascript
// Source: index.html customerKey() + updateUnpaidBadge() 패턴 기반
function calcCustomerSummary(name, phone) {
  var key = customerKey(name, phone);
  var invoices = getInvoiceHistory().filter(function(h) {
    return h.status !== '삭제됨' &&
           customerKey(h.customer.name, h.customer.phone) === key;
  });
  var totalAmount = invoices.reduce(function(s, h) {
    return s + h.totals.grandTotal;
  }, 0);
  var totalPaid = invoices.reduce(function(s, h) {
    return s + (h.paidAmount || 0);
  }, 0);
  return {
    count:       invoices.length,
    totalAmount: totalAmount,
    totalPaid:   totalPaid,
    unpaid:      totalAmount - totalPaid,
    invoices:    invoices
  };
}
```

### fertilizer_transactions 미러 쓰기 (SALE-01/02 연결)

```javascript
// saveInvoice() 내부에서 추가 (CustomerDB 가용 시)
history.push(record);
setInvoiceHistory(history);
updateUnpaidBadge();
pushToServer('save', record);
// 미러 쓰기 추가
if (typeof CustomerDB !== 'undefined' && CustomerDB.saveTransaction) {
  CustomerDB.saveTransaction(record);
}
```

---

## Runtime State Inventory

> 이 Phase는 rename/refactor Phase가 아니므로 전체 카테고리 점검은 불필요. 단, 저장소 이중화 문제와 관련된 기존 상태를 문서화한다.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | IndexedDB `NTBioInvoices` — 기존 사용자 거래 데이터 | 기존 레코드에 `customerId` 없음 — 신규 레코드부터만 추가, 기존 레코드는 `null` 허용 |
| Stored data | localStorage `fertilizer_transactions` — 빈 배열 (`[]`) | saveTransaction 미러 구현 후 신규 저장부터 채워짐 — 기존 레코드 소급 불필요 |
| Live service config | Google Apps Script (`INVOICE_API`) — 서버 동기화 | Phase 4 범위 아님 — 기존 pushToServer() 그대로 유지 |
| OS-registered state | None | 없음 |
| Secrets/env vars | `INVOICE_API` URL (index.html에 하드코딩) | Phase 4 범위 아님 |
| Build artifacts | None | 없음 |

---

## Environment Availability

Step 2.6: SKIPPED — 이 Phase는 외부 CLI 도구, 서비스, 런타임 없이 브라우저 내 코드/데이터 변경만 수행한다. 기존 Google Apps Script 서버 연동은 변경 없음.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | 없음 — 브라우저 기반 수동 검증 |
| Config file | 없음 |
| Quick run command | 브라우저에서 직접 열기 (`open index.html`) |
| Full suite command | 브라우저에서 시나리오 수동 실행 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Method | Notes |
|--------|----------|-----------|--------|-------|
| SALE-01 | 발행 시 거래 레코드 저장 | smoke | doPrint() 후 `getInvoiceHistory()` 콘솔 확인 | |
| SALE-02 | 납부 입력 후 status 자동 갱신 | smoke | 미입금 모달에서 입금액 입력 후 상태 배지 확인 | |
| SALE-03 | 미납 거래 전체 목록 조회 | smoke | '미수금 전체 목록' 버튼 클릭 | 기존 UI 존재 |
| SALE-04 | 기간별 매출 합계 표시 | smoke | 매출 패널에서 '이번 달' 선택 후 합계 수치 확인 | 신규 UI 필요 |
| SALE-05 | 고객별 거래금액/미수금 요약 | smoke | 고객 선택 후 요약 배지/패널 확인 | 신규 UI 필요 |

### Wave 0 Gaps

테스트 프레임워크 없음 — 모든 검증은 브라우저 수동 시나리오. 별도 테스트 파일 생성 불필요.

---

## What's Already Built vs What's Missing

### 이미 구현 완료 (수정 불필요 또는 최소 수정)

| 기능 | SALE # | 파일 | 상태 |
|------|--------|------|------|
| 거래 저장 (`saveInvoice`) | SALE-01 | index.html | 완료. `customerId` 필드 추가만 필요 |
| 납부 기록 (`addPayment`) | SALE-02 | index.html | 완료 |
| 납부 취소 (`removePayment`) | SALE-02 | index.html | 완료 |
| 미수금 뱃지 (`updateUnpaidBadge`) | SALE-03 | index.html | 완료 |
| 현재 고객 미입금 모달 (`openUnpaidModal`) | SALE-03 | index.html | 완료 |
| 전체 미수금 목록 오버레이 (`openAllUnpaid`) | SALE-03 | index.html | 완료 (지역별 그룹, 인쇄 포함) |

### 미구현 (신규 작업 필요)

| 기능 | SALE # | 위치 | 작업 내용 |
|------|--------|------|-----------|
| `customerId` 필드 추가 | SALE-01/05 | index.html `saveInvoice()` | 1줄 추가 |
| `fertilizer_transactions` 미러 | SALE-01/02 | customerDB.js + index.html | CustomerDB에 saveTransaction/updateTransaction 추가 + saveInvoice/addPayment에 미러 호출 |
| 기간별 매출 집계 UI | SALE-04 | salesHistoryUI.js (신규) | 이번달/지난달/직접입력 + 합계 표시 |
| 고객별 요약 UI | SALE-05 | salesHistoryUI.js (신규) | 선택된 고객의 총 거래금액 + 미수금 잔액 표시 |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage `invoiceHistory` | IndexedDB `NTBioInvoices` (localStorage 폴백) | 기존 구현 시 | IndexedDB는 비동기 — getInvoiceHistory() 호출 전 `initInvoiceDB()` await 필요 |
| 없음 | `fertilizer_transactions` 예약됨 (빈 배열) | Phase 1 스키마 정의 시 | Phase 4에서 실제로 채워야 함 |

---

## Open Questions

1. **SALE-04 매출 집계 UI 위치**
   - What we know: 기존 버튼 그룹이 index.html `.actions` 영역에 있음 (`btn-all-unpaid` 등)
   - What's unclear: 매출 집계를 별도 버튼으로 열지, 전체 미수금 목록 모달 안에 탭으로 넣을지
   - Recommendation: 별도 버튼 + 오버레이 패턴 (기존 `openAllUnpaid()` 와 동일한 패턴). 탭 패턴은 기존 UI 구조와 맞지 않음.

2. **SALE-05 고객별 요약의 진입점**
   - What we know: 고객 선택 시 `_onCustomerSelect()` 가 호출되고 이미 처방이력 배지를 갱신함
   - What's unclear: 요약을 미입금 버튼 영역 아래 인라인 표시할지, 별도 모달로 열지
   - Recommendation: 인라인 표시 (고객 선택 시 자동 갱신되는 요약 배지 형태). 거래가 없으면 숨김. customerUI.js의 `_updateHistoryBadge` 패턴 참조.

3. **fertilizer_transactions 소급 마이그레이션 필요 여부**
   - What we know: 기존 사용자의 IndexedDB에 이미 거래가 쌓여있을 수 있음
   - What's unclear: 소급 마이그레이션을 하면 CustomerDB 백업에 기존 거래도 포함되어 좋지만, 초기 사용자(Phase 4 이전 데이터 없음)는 해당 없음
   - Recommendation: 소급 마이그레이션은 범위 초과 — `initInvoiceDB()` 에서 IDB → transactions 일괄 마이그레이션을 옵션으로 추가하되 Plan에 포함할지는 Planner 판단.

---

## Sources

### Primary (HIGH confidence)
- `/Users/glen/천연비료처방전/천연비료처방전/index.html` — saveInvoice, addPayment, removePayment, deleteInvoice, openUnpaidModal, openAllUnpaid, renderUnpaidList, updateUnpaidBadge 함수 직접 검사 (lines 1891–3202)
- `/Users/glen/천연비료처방전/천연비료처방전/customerDB.js` — 전체 파일: KEYS, _get, _set, savePrescrSnapshot, listPrescriptions, exportAll, importAll
- `/Users/glen/천연비료처방전/천연비료처방전/customerUI.js` — 전체 파일: 고객 선택, 처방이력 배지 패턴
- `/Users/glen/천연비료처방전/천연비료처방전/prescriptionHistoryUI.js` — IIFE + CSS injection + 모달 생성 패턴 (lines 1-80)
- `.planning/REQUIREMENTS.md` — SALE-01~05 정의
- `.planning/ROADMAP.md` — Phase 4 목표 및 성공 기준

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — 기존 결정 사항 (Phase 3 decisions)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 기존 파일 직접 검사로 확인
- Architecture: HIGH — prescriptionHistoryUI.js, customerUI.js 패턴 직접 검사
- Pitfalls: HIGH — 코드에서 실제 버그/불일치 직접 발견 (invoiceHistory vs fertilizer_transactions, h.deleted vs h.status)
- Missing features (SALE-04/05): HIGH — grep 결과로 미구현 확인

**Research date:** 2026-03-25
**Valid until:** 이 Phase 계획 완료 시까지 (코드베이스가 안정적)
