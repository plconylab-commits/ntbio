# Phase 8: 매출 집계 - Research

**Researched:** 2026-03-27
**Domain:** 바닐라 JS — IndexedDB 기반 거래이력 집계 UI 확장 (salesHistoryUI.js + index.html)
**Confidence:** HIGH (코드 직접 분석, 외부 라이브러리 무관)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SALE-04 | 기간별(월/분기) 매출 합계 조회 | salesHistoryUI.js에 이미 월별 집계 패널 존재 — 분기 버튼 추가 + _thisQuarterRange/_lastQuarterRange 함수 추가만 필요 |
| SALE-05 | 고객별 총 거래금액 및 미수금 조회 | CustomerDB.getCustomerSummary()가 이미 구현됨 — 고객 전체 목록을 순회하는 집계 뷰 UI가 없음, 별도 오버레이 필요 |
</phase_requirements>

---

## Summary

Phase 8은 두 개의 독립적인 UI 확장 작업이다.

**SALE-04 (기간별 매출):** `salesHistoryUI.js`에 `openSalesPanel()` 함수와 집계 오버레이가 이미 완전히 구현되어 있다. 현재 버튼 구성은 "이번 달 / 지난 달 / 직접 입력" 세 가지이다. 분기 버튼("이번 분기 / 지난 분기")을 추가하려면 (1) 분기 날짜 범위 계산 함수 2개, (2) `.sales-period-btns`에 버튼 2개 추가만 하면 된다. 집계 로직(`_calcPeriodSales`)은 dateFrom/dateTo 범위 기반이므로 분기를 그대로 지원한다. 단, `_calcPeriodSales`는 `getInvoiceHistory()`(IndexedDB 캐시)를 사용하므로, 페이지가 초기화된 상태에서만 동작한다 — `CustomerDB.listTransactions()`가 아님.

**SALE-05 (고객별 집계):** `CustomerDB.getCustomerSummary(name, phone)` API는 이미 구현되어 있다. 그러나 고객 전체를 한 번에 나열하는 집계 뷰가 없다. 현재 `salesHistoryUI.js`의 고객별 요약 배지(`custSalesBadge`)는 현재 입력 중인 고객 1명에 대한 실시간 배지이며, 전체 고객 집계가 아니다. 필요한 작업: 전체 고객 목록에서 `getInvoiceHistory()`를 순회해 고객별로 집계하는 새 뷰(오버레이 또는 탭)를 `salesHistoryUI.js` 또는 `index.html`에 추가.

**Primary recommendation:** salesHistoryUI.js에 (1) 분기 범위 함수 2개 + 버튼 2개, (2) 고객별 집계 오버레이를 추가한다. 두 작업 모두 기존 패턴(overlay/panel HTML, dateFrom/dateTo range, forEach 집계)을 그대로 재사용한다.

---

## 데이터 구조 분석

### transaction 레코드 스키마 (index.html `saveInvoice()` 기준)

```javascript
{
  id:         '1711400000000_1234',    // timestamp + random
  savedAt:    '2026-03-27T09:00:00.000Z',  // ISO 8601 — 기간 필터 기준
  status:     '미입금' | '일부입금' | '입금완료' | '삭제됨',
  paidAt:     null | ISO string,
  paidAmount: 0,                       // 누적 입금액
  payments:   [{ amount, date, payer? }],  // 입금 이력
  customer: {
    name:    '홍길동',
    phone:   '010-1234-5678',
    phone2:  '',
    addr:    '',
    region:  '경북',
    area:    '500',
    crop:    '고추',
    date:    '2026-03-27'
  },
  items: [{ name, size, retail, sp, qty, gift, date }],
  customerId: null | 'c_...',          // CustomerDB 연결 ID
  totals: {
    retail:      1000000,
    supply:      900000,
    vatIncluded: true,
    vatAmount:   90000,
    grandTotal:  990000               // 집계 대상 금액
  }
}
```

**중요:** `paidAmount` 필드는 단순 합산이 아니라 `payments` 배열에서 `cancelled` 제외 후 재계산된다. 미수금 계산 시에는 `(h.payments||[]).filter(p=>!p.cancelled).reduce((s,p)=>s+p.amount,0)`가 정확한 방식이다. `_calcPeriodSales`에서는 `h.paidAmount || 0`을 쓰는데, 이는 `payments` 취소 항목을 반영하지 않는 구버전 방식 — 집계 함수 작성 시 주의 필요.

### 스토리지 이중성

| 스토리지 | 키/저장소 | 용도 | 집계 데이터 소스 |
|----------|-----------|------|-----------------|
| IndexedDB | `NTBioInvoices` store `invoices`, key `history` | 거래이력 주 저장소 | `getInvoiceHistory()` = `_invoiceCache` |
| localStorage | `fertilizer_transactions` | `CustomerDB.saveTransaction()` 동기 저장 | `CustomerDB.listTransactions()` |

`saveInvoice()`는 IndexedDB(`setInvoiceHistory`)와 `CustomerDB.saveTransaction()` 양쪽에 모두 저장한다. 두 저장소는 동일한 레코드를 가리키지만 별도로 관리된다. **salesHistoryUI.js의 `_calcPeriodSales()`는 `getInvoiceHistory()`(IndexedDB)를 사용한다 — 이 방식을 유지해야 일관성이 있다.**

---

## Standard Stack

### Core
| 파일 | 역할 | 수정 범위 |
|------|------|----------|
| `salesHistoryUI.js` | 매출 집계 오버레이 + 고객별 요약 배지 | SALE-04 분기 버튼 + SALE-05 고객별 집계 뷰 추가 |
| `index.html` | 매출 집계 버튼 (`SalesHistoryUI.openSalesPanel()`) | SALE-05 고객별 집계 진입점 버튼 추가 가능 |
| `customerDB.js` | `getCustomerSummary(name, phone)` API | 수정 불필요 — 이미 구현됨 |

### Supporting
| 파일 | 역할 | 관련성 |
|------|------|-------|
| `customerUI.js` | 고객 목록 UI, 고객 선택 | SALE-05에서 고객 목록 순회 시 `CustomerDB.list()` 사용 |

### 재사용할 기존 함수

| 함수 | 위치 | 설명 |
|------|------|------|
| `_calcPeriodSales(dateFrom, dateTo)` | salesHistoryUI.js:93 | 기간별 집계 — 분기에도 그대로 사용 가능 |
| `_dateStr(d)` | salesHistoryUI.js:71 | Date → 'YYYY-MM-DD' 변환 |
| `_thisMonthRange()` | salesHistoryUI.js:78 | 이번 달 범위 — 분기 함수 작성 시 참고 |
| `_lastMonthRange()` | salesHistoryUI.js:85 | 지난 달 범위 — 분기 함수 작성 시 참고 |
| `_fmt(n)` | salesHistoryUI.js:219 | `comma()` 래퍼 — 원화 포맷 |
| `getInvoiceHistory()` | index.html:1786 | IndexedDB 캐시 읽기 |
| `CustomerDB.list()` | customerDB.js:48 | 전체 고객 목록 반환 |
| `CustomerDB.getCustomerSummary(name, phone)` | customerDB.js:230 | 고객별 집계 — count, totalAmount, totalPaid, unpaid, invoices |

---

## Architecture Patterns

### SALE-04: 분기 버튼 추가 패턴

현재 `.sales-period-btns`에 버튼이 3개("이번 달", "지난 달", "직접 입력") 있다. 분기 버튼 2개를 추가하면 총 5개가 된다. `flex-wrap:wrap`이 이미 적용되어 있으므로 줄 바꿈 처리는 자동.

```javascript
// salesHistoryUI.js에 추가할 분기 범위 계산 함수

function _thisQuarterRange() {
  var now = new Date();
  var q = Math.floor(now.getMonth() / 3);  // 0=1분기, 1=2분기, 2=3분기, 3=4분기
  var from = new Date(now.getFullYear(), q * 3, 1);
  var to   = new Date(now.getFullYear(), q * 3 + 3, 0);
  return { from: _dateStr(from), to: _dateStr(to) };
}

function _lastQuarterRange() {
  var now = new Date();
  var q = Math.floor(now.getMonth() / 3);
  var lastQ = q - 1;
  var year = now.getFullYear();
  if (lastQ < 0) { lastQ = 3; year -= 1; }
  var from = new Date(year, lastQ * 3, 1);
  var to   = new Date(year, lastQ * 3 + 3, 0);
  return { from: _dateStr(from), to: _dateStr(to) };
}
```

분기 버튼은 `data-period="thisQ"`, `data-period="lastQ"` 값을 사용하고, 기존 period 버튼 클릭 핸들러에 분기 처리 케이스를 추가:

```javascript
// 기존 else if 체인에 추가
var range = _activePeriod === 'this'  ? _thisMonthRange()   :
            _activePeriod === 'last'  ? _lastMonthRange()   :
            _activePeriod === 'thisQ' ? _thisQuarterRange() :
                                        _lastQuarterRange();
```

### SALE-05: 고객별 집계 뷰 패턴

고객별 집계는 `getInvoiceHistory()`를 순회하여 `customerKey(name, phone)` 기준으로 그룹화한다. `CustomerDB.getCustomerSummary()`는 name+phone을 알아야 호출할 수 있으므로, 직접 IDB 캐시를 순회하는 방식이 더 효율적.

```javascript
function _buildCustomerAggregates() {
  var history = (typeof getInvoiceHistory === 'function') ? getInvoiceHistory() : [];
  var fmt = (typeof customerKey === 'function') ? customerKey : function(n, p) {
    return (n + '|' + p).toLowerCase();
  };
  var map = {};
  history.forEach(function(h) {
    if (h.status === '삭제됨') return;
    var key = fmt(h.customer.name, h.customer.phone);
    if (!map[key]) {
      map[key] = {
        name:   h.customer.name,
        phone:  h.customer.phone,
        region: h.customer.region || '',
        count:  0, total: 0, paid: 0
      };
    }
    var entry = map[key];
    entry.count++;
    entry.total += (h.totals && h.totals.grandTotal) || 0;
    // payments 취소 항목 제외 정확 계산
    var paidAmt = (h.payments || []).filter(function(p) { return !p.cancelled; })
                    .reduce(function(s, p) { return s + p.amount; }, 0);
    entry.paid += paidAmt;
  });
  // unpaid 계산 후 배열화
  return Object.values(map).map(function(e) {
    e.unpaid = e.total - e.paid;
    return e;
  }).sort(function(a, b) { return b.unpaid - a.unpaid; });  // 미수금 많은 순
}
```

UI는 기존 `sales-panel` 스타일을 재사용하되, 고객 행 목록을 테이블로 렌더한다. 새 오버레이(`custSummaryOverlay`) 또는 `sales-panel` 내 탭 전환 방식 두 가지가 가능하다. **별도 오버레이** 방식이 기존 코드 구조를 덜 건드린다.

### 진입점 버튼 배치

현재 index.html의 액션 버튼 영역 (line 699):

```html
<div class="act-row">
  <button ... onclick="SalesHistoryUI.openSalesPanel()">매출 집계</button>
  <button ... onclick="checkUnpaidOnCustomer()">미수금 확인</button>
</div>
```

SALE-05의 고객별 집계 버튼을 같은 row 또는 새 row에 추가할 수 있다.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 분기 날짜 범위 | 커스텀 달력 라이브러리 | 순수 JS `new Date(year, month, day)` | 이미 _thisMonthRange() 패턴 존재 |
| 원화 포맷 | 숫자 포맷 함수 | `_fmt(n)` = `comma(n)` 래퍼 | 이미 salesHistoryUI.js에 존재 |
| 고객 키 생성 | 별도 해시 | `customerKey(name, phone)` (index.html 전역) | 동일 로직 재사용 |
| 집계 오버레이 CSS | 새 CSS 파일 | 기존 `.sales-overlay/.sales-panel` CSS 재사용 | `_injectSalesCSS()`에 추가 |

---

## Common Pitfalls

### Pitfall 1: paidAmount vs payments 배열 불일치
**What goes wrong:** `_calcPeriodSales()`는 `h.paidAmount || 0`을 쓰지만, 취소된 입금(`p.cancelled = true`)이 있는 경우 `paidAmount`가 정확하지 않을 수 있다.
**Why it happens:** `paidAmount`는 입금 추가/취소 시 재계산되어 덮어쓰이지만, 구버전 레코드는 `payments` 배열 없이 `paidAmount`만 가질 수 있다.
**How to avoid:** SALE-05 고객별 집계 함수에서는 `payments` 배열 기반 계산을 우선하되, `payments`가 없으면 `paidAmount`로 폴백:
```javascript
var paidAmt = h.payments
  ? h.payments.filter(function(p) { return !p.cancelled; }).reduce(function(s, p) { return s + p.amount; }, 0)
  : (h.paidAmount || 0);
```
**Warning signs:** 고객별 집계 미수금 합산이 `openAllUnpaid()`의 합산과 다르면 이 문제.

### Pitfall 2: getInvoiceHistory()는 DOM 초기화 후에만 유효
**What goes wrong:** `salesHistoryUI.js`의 함수들은 `getInvoiceHistory()`를 호출하는데, 이 함수는 `index.html`에 정의된 전역 함수다. salesHistoryUI.js가 단독으로(index.html 외 환경에서) 실행되면 `undefined`.
**Why it happens:** `_calcPeriodSales`에서 이미 `(typeof getInvoiceHistory === 'function') ? getInvoiceHistory() : []`로 방어 처리하고 있다.
**How to avoid:** 새로 추가하는 함수도 동일한 방어 패턴을 사용.

### Pitfall 3: 분기 계산 연도 경계
**What goes wrong:** 1월에 `_lastQuarterRange()` 호출 시 전년도 4분기(10~12월)를 계산해야 한다. `month - 3`으로 단순 계산하면 음수 월이 발생.
**Why it happens:** JavaScript `new Date(year, -1, 1)` 같은 음수 월은 자동으로 이전 연도로 롤오버되지만, 분기 단위로는 명시적 처리가 더 안전하다.
**How to avoid:** `_lastQuarterRange()`에서 `lastQ < 0`이면 `year -= 1; lastQ = 3` 처리 (위 코드 예시 참고).

### Pitfall 4: 고객별 집계 뷰에서 동명이인 분리
**What goes wrong:** `customerKey(name, phone)` 기준으로 그룹화하면 이름+전화번호가 동일한 경우만 같은 고객으로 처리된다. phone이 없는 레코드(`phone === ''`)는 모두 같은 고객으로 묶인다.
**Why it happens:** `customerKey('홍길동', '') === customerKey('이철수', '')`가 성립하지 않지만, `phone2`는 키에 포함되지 않는다.
**How to avoid:** phone이 빈 경우 name 단독으로 그룹화하거나, 별도 버킷("전화번호 없음")으로 처리. 이미 `openUnpaidForCurrent()`에서 같은 문제를 우회하는 패턴이 있다.

### Pitfall 5: 고객 집계 오버레이가 index.html 전역 함수에 의존
**What goes wrong:** SALE-05 집계 함수를 `salesHistoryUI.js`에 두면 `getInvoiceHistory`, `customerKey`, `comma` 모두 전역 함수 여부를 typeof로 체크해야 한다.
**How to avoid:** 기존 `_calcPeriodSales`가 이미 사용하는 `typeof getInvoiceHistory === 'function'` 패턴을 동일하게 적용.

### Pitfall 6: 분기 버튼이 "직접 입력" 상태를 덮어씀
**What goes wrong:** 현재 기간 버튼 클릭 시 `.sales-date-range`의 on 클래스를 제거한다. 분기 버튼 클릭 시 `custom` 상태의 date range 입력창이 닫혀야 한다 — 이는 이미 existing 로직이 처리하므로 문제없다. 단, 분기 버튼에 `_activePeriod !== 'custom'` 분기를 추가하지 않으면 `_dateRangeEl.classList.remove('on')` 호출이 없는 경로가 생길 수 있다.

---

## Code Examples

### SALE-04: 분기 범위 함수 (salesHistoryUI.js에 추가)

```javascript
// Source: 분석 기반 — _thisMonthRange/_lastMonthRange 패턴 동일 적용
function _thisQuarterRange() {
  var now = new Date();
  var q = Math.floor(now.getMonth() / 3);
  var from = new Date(now.getFullYear(), q * 3, 1);
  var to   = new Date(now.getFullYear(), q * 3 + 3, 0);
  return { from: _dateStr(from), to: _dateStr(to) };
}

function _lastQuarterRange() {
  var now = new Date();
  var q = Math.floor(now.getMonth() / 3);
  var lastQ = q - 1;
  var year = now.getFullYear();
  if (lastQ < 0) { lastQ = 3; year -= 1; }
  var from = new Date(year, lastQ * 3, 1);
  var to   = new Date(year, lastQ * 3 + 3, 0);
  return { from: _dateStr(from), to: _dateStr(to) };
}
```

### SALE-04: 기간 버튼 HTML 추가 (salesHistoryUI.js `_createSalesOverlay` 내)

```javascript
// 기존 버튼 3개에 2개 추가
'    <button class="sales-period-btn" data-period="thisQ">이번 분기</button>',
'    <button class="sales-period-btn" data-period="lastQ">지난 분기</button>',
```

### SALE-04: 기간 선택 핸들러 수정

```javascript
// 기존 2항 삼항을 다항으로 교체
var range;
if (_activePeriod === 'this')       range = _thisMonthRange();
else if (_activePeriod === 'last')  range = _lastMonthRange();
else if (_activePeriod === 'thisQ') range = _thisQuarterRange();
else if (_activePeriod === 'lastQ') range = _lastQuarterRange();
if (range) _renderSalesStats(range.from, range.to);
```

### SALE-05: 고객별 집계 함수 (salesHistoryUI.js에 추가)

```javascript
function _buildCustomerAggregates() {
  var history = (typeof getInvoiceHistory === 'function') ? getInvoiceHistory() : [];
  var fmtKey = (typeof customerKey === 'function')
    ? customerKey
    : function(n, p) { return (n.trim() + '|' + p.replace(/\D/g, '')).toLowerCase(); };

  var map = {};
  history.forEach(function(h) {
    if (h.status === '삭제됨') return;
    var key = fmtKey(h.customer.name, h.customer.phone);
    if (!map[key]) {
      map[key] = { name: h.customer.name, phone: h.customer.phone,
                   region: h.customer.region || '', count: 0, total: 0, paid: 0 };
    }
    var entry = map[key];
    entry.count++;
    entry.total += (h.totals && h.totals.grandTotal) || 0;
    var paidAmt = h.payments
      ? h.payments.filter(function(p) { return !p.cancelled; })
                  .reduce(function(s, p) { return s + p.amount; }, 0)
      : (h.paidAmount || 0);
    entry.paid += paidAmt;
  });

  return Object.keys(map).map(function(k) {
    var e = map[k];
    e.unpaid = e.total - e.paid;
    return e;
  }).sort(function(a, b) { return b.unpaid - a.unpaid; });
}
```

### SALE-05: 고객별 집계 오버레이 공개 API

```javascript
// salesHistoryUI.js window.SalesHistoryUI 확장
window.SalesHistoryUI = {
  openSalesPanel:          openSalesPanel,
  updateCustomerSummary:   _updateCustomerSummary,
  openCustomerSummaryPanel: openCustomerSummaryPanel  // SALE-05 신규
};
```

---

## 현재 salesHistoryUI.js 구조 맵

```
salesHistoryUI.js (357 lines)
├── _injectSalesCSS()          — CSS 주입 (style#sales-css)
├── _dateStr(d)                — Date → 'YYYY-MM-DD'
├── _thisMonthRange()          — 이번 달 범위
├── _lastMonthRange()          — 지난 달 범위
├── [추가 필요] _thisQuarterRange()
├── [추가 필요] _lastQuarterRange()
├── _calcPeriodSales(from,to)  — getInvoiceHistory() 기반 집계
├── _createSalesOverlay()      — 집계 오버레이 DOM 생성/참조
├── _fmt(n)                    — comma() 래퍼
├── _renderSalesStats(from,to) — 집계 결과를 DOM에 업데이트
├── openSalesPanel()           — 오버레이 열기 (이번 달 기본)
├── _closeSalesPanel()         — 오버레이 닫기
├── _ensureBadge()             — custSalesBadge DOM 보장
├── _updateCustomerSummary()   — 현재 고객 1명 요약 배지 갱신
├── DOMContentLoaded           — cName/cPhone change 이벤트 바인딩
└── window.SalesHistoryUI      — 공개 API
    ├── openSalesPanel
    └── updateCustomerSummary
```

---

## 기존 집계 오버레이 DOM 구조

```html
<!-- id="salesOverlay" (.sales-overlay) -->
<div class="sales-panel">
  <button class="sales-close-btn">✕</button>
  <h3>매출 집계</h3>
  <div class="sales-period-btns">
    <button data-period="this">이번 달</button>    ← active 기본
    <button data-period="last">지난 달</button>
    <button data-period="custom">직접 입력</button>
    <!-- SALE-04: 분기 버튼 2개 추가 위치 -->
  </div>
  <div class="sales-date-range" id="salesDateRange">
    <input type="date" id="salesDateFrom">
    <span>~</span>
    <input type="date" id="salesDateTo">
    <button id="salesQueryBtn">조회</button>
  </div>
  <div class="sales-stat-card" id="salesStatCard">
    <div>거래 건수 / <span id="salesCount"></span></div>
    <div>총 매출 / <span id="salesTotal"></span></div>
    <div>입금액 / <span id="salesPaid"></span></div>
    <div>미수금 / <span id="salesUnpaid"></span>
         <a id="salesUnpaidLink">전체 목록 보기 →</a></div>
  </div>
</div>
```

---

## Environment Availability

Step 2.6: SKIPPED (외부 도구 의존 없음 — 바닐라 JS 파일 수정만)

---

## Validation Architecture

바닐라 JS 프로젝트, 공식 테스트 프레임워크 없음.

| Property | Value |
|----------|-------|
| Framework | 없음 (수동 브라우저 테스트) |
| Config file | 없음 |
| Quick run command | 브라우저에서 직접 확인 |
| Full suite command | 브라우저에서 직접 확인 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SALE-04 | 이번 분기/지난 분기 버튼 클릭 → 해당 기간 매출 통계 표시 | manual | 브라우저 수동 확인 | N/A |
| SALE-04 | 분기 날짜 경계 — 1월에 지난 분기가 전년도 4분기로 계산됨 | manual | 브라우저 콘솔 `_lastQuarterRange()` 직접 호출 | N/A |
| SALE-05 | 고객별 집계 뷰 — 전체 고객 거래금액/미수금 목록 표시 | manual | 브라우저 수동 확인 | N/A |
| SALE-05 | 미수금 순 정렬 — 미수금 높은 고객이 목록 상단 | manual | 브라우저 수동 확인 | N/A |

---

## Open Questions

1. **SALE-05: 고객별 집계 뷰 진입점**
   - What we know: 현재 액션 버튼 영역에 "매출 집계" 버튼 하나가 있다
   - What's unclear: 고객별 집계를 별도 버튼으로 추가할지, 기존 매출 집계 패널 안에 탭/링크로 넣을지
   - Recommendation: 기존 `sales-panel` 안에 "고객별 조회" 링크/버튼을 추가하여 패널 내 뷰 전환. 별도 오버레이보다 진입점이 자연스럽고 버튼 영역을 덜 차지.

2. **SALE-05: 고객별 집계에서 phone 없는 레코드 처리**
   - What we know: `customerKey('홍길동', '')`는 `'홍길동|'`로, 다른 고객과 겹치지 않는다
   - What's unclear: 여러 phone-없는 레코드가 동명이인이면 잘못 합산됨
   - Recommendation: phone이 비어 있을 때는 name만으로 그룹화, 또는 "전화번호 없음 (N건)" 별도 버킷으로 표시 — 실제 데이터에서 phone 누락이 흔하지 않으면 무시해도 무방.

3. **SALE-04: 분기 레이블 표시**
   - What we know: "이번 분기"만 표시하면 어느 분기인지 불명확
   - What's unclear: "이번 분기 (1분기)"처럼 분기 번호를 표시해야 하는지
   - Recommendation: 버튼 레이블에 분기 번호 동적 주입: `'이번 분기 ('+Math.floor(new Date().getMonth()/3+1)+'Q)'` — 또는 버튼은 단순 "이번 분기"로 두고, 집계 결과 헤더에 날짜 범위를 표시.

---

## Sources

### Primary (HIGH confidence)
- `salesHistoryUI.js` — 전체 코드 직접 분석 (357 lines)
- `customerDB.js` — `getCustomerSummary`, `listTransactions` 직접 분석
- `index.html` (lines 699, 855-916, 1786-1957, 3331-3428) — `saveInvoice`, `getInvoiceHistory`, IDB 구조, `openAllUnpaid` 패턴 직접 분석

### Secondary (MEDIUM confidence)
- 없음 (외부 라이브러리 무관)

---

## Metadata

**Confidence breakdown:**
- SALE-04 (분기 버튼): HIGH — 날짜 범위 로직 패턴 명확, 추가 코드 10줄 미만
- SALE-05 (고객별 집계): HIGH — `_buildCustomerAggregates()` 로직 명확, UI 구조만 결정 필요
- paidAmount vs payments 문제: HIGH — 코드 직접 확인

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (코드 기반 분석 — 외부 라이브러리 없으므로 안정적)
