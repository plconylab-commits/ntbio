# Phase 2: 고객 DB + 할인율 — Research

**Researched:** 2026-03-25
**Domain:** localStorage CRUD, autocomplete UI, sessionDiscount state management
**Confidence:** HIGH (direct code analysis)

---

## Summary

Phase 2는 `customerDB.js`에 이미 존재하는 스켈레톤 위에 실제 CRUD를 구현하고, `customerUI.js`(신규 파일)로 자동완성 드롭다운과 할인율 상태 관리 UI를 추가하는 작업이다. 기존 파일 수정 범위는 매우 좁다 — `index.html`의 `.cust-bar` HTML에 `.cust-actions` 행 한 줄과 `#custAutocomplete` 드롭다운 마크업을 추가하고, `<script src="customerUI.js">` 태그를 추가하는 것이 전부다.

핵심 복잡도는 두 곳이다. 첫째, 현재 `checkUnpaidOnCustomer()`는 서버 동기화(`syncFromServer()`)에 의존한다. Phase 2는 이 함수를 localStorage CustomerDB 경로로 교체하거나 병렬 실행해야 한다 — 서버가 없는 환경에서도 자동완성과 폼 채우기가 동작해야 하기 때문이다. 둘째, `discountRate` 단위가 코드베이스 내에서 혼용되고 있다 — `gDisc` 입력 필드는 0~100 정수(%)를 사용하지만 `ARCHITECTURE.md` 스키마는 0.0~1.0 소수를 제안했다. 이 Phase에서 0~100 정수로 통일한다(저장도, 읽기도).

`doExportJSON`/`doImportJSON`은 Phase 1에서 이미 `index.html` 하단 `<script>` 블록(lines 3171–3207)에 구현 완료되어 있으며 `CustomerDB.exportAll()` / `CustomerDB.importAll()`을 그대로 호출한다. Phase 2에서 추가 작업 없음.

**Primary recommendation:** `customerUI.js` 신규 파일에 자동완성 + 할인율 상태 + 저장/삭제 버튼을 모두 구현하고, `customerDB.js`의 `save()` / `delete()` 스텁만 채운다. 기존 `checkUnpaidOnCustomer()` 서버 경로는 건드리지 않고, 그 앞에 CustomerDB 로컬 경로를 단락(short-circuit)으로 삽입한다.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CUST-01 | 고객 정보(이름, 작물, 면적, 할인율, 연락처)를 localStorage에 저장한다 | `CustomerDB.save()` 스텁 구현. `fertilizer_customers` 키 스키마 확정 |
| CUST-02 | 고객 이름 자동완성으로 기존 고객을 빠르게 선택한다 | `#gName` 없음 — 실제 필드는 `#cName`. `#custAutocomplete` 드롭다운 절대 위치 패턴 확정 |
| CUST-03 | 기존 고객 선택 시 할인율이 자동으로 적용된다 | 고객 선택 → `#gDisc.value = customer.discountRate` + `applyGlobalDisc()` 호출 |
| CUST-04 | 고객 DB를 JSON 파일로 내보내기/가져오기 할 수 있다 | `doExportJSON`/`doImportJSON` Phase 1에서 이미 구현 완료. Phase 2 추가 작업 없음 |
| CUST-05 | 고객별 처방이력 목록을 볼 수 있다 | `CustomerDB.listPrescriptions(customerId)` 호출 — Phase 2에서는 드롭다운 배지(N건)로만 표시. 상세 모달은 Phase 3 |
| DISC-01 | 고객별 기본 할인율을 저장하고 고객 선택 시 자동 적용한다 | 고객 레코드 `discountRate` 필드(0~100 정수). 선택 시 `applyGlobalDisc()` 연쇄 호출 |
| DISC-02 | 세션 내에서 임시로 할인율을 변경해도 저장된 기본값은 덮어쓰지 않는다 | `customerUI.js` 클로저 변수 `_savedDiscount` vs 현재 `#gDisc.value` 비교로 임시 상태 감지 |
</phase_requirements>

---

## 1. 실제 DOM 필드 ID — index.html `.cust-bar` 완전 목록

코드 직접 확인(lines 540–594):

| 필드 | 실제 ID | 타입 | 비고 |
|------|---------|------|------|
| 고객명 | `#cName` | `<input>` | `onblur="checkUnpaidOnCustomer()"` — **주의: `#gName` 아님** |
| 연락처 | `#cPhone` | `<input>` | `onblur="checkUnpaidOnCustomer()"` |
| 연락처 2 | `#cPhone2` | `<input>` | `#phone2Row`(display:none) 안에 있음 |
| 주소 | `#cAddr` | `<input>` | |
| 할인율 | `#gDisc` | `<input type="number">` | `oninput="applyGlobalDisc()"`. 0~100 정수 |
| 계산서 발행일 | `#cDate` | `<input type="date">` | |
| 지역 | `#cRegion` | `<input>` | |
| 평수 | `#cArea` | `<input type="number">` | |
| 종류 | `#cAreaType` | `<select>` | |
| 작물 | `#cCrop` | `<select>` | 고정 옵션 목록 (감자/고구마/... 22가지) |

**중요:** 처방전 파서 결과를 폼에 주입하는 `handlePrescriptionUpload()`(main.js lines 33–44)는 `cName`, `cCrop`, `cArea` ID를 사용한다. 자동완성 구현도 이 ID들을 그대로 사용해야 한다.

**주의:** 요청 명세서에서 `#gName`, `#gCrop`, `#gArea`, `#gPhone`으로 언급된 필드들은 실제 HTML에 존재하지 않는다. 올바른 ID는 위 표의 값이다.

---

## 2. customerDB.js 현재 상태 — 구현 완료 vs 스텁

파일 직접 확인 (lines 1–83):

### 구현 완료 (Phase 1에서 완성)

| 함수 | 상태 | 설명 |
|------|------|------|
| `_migrate()` | 완료 | `fertilizer_*` 키 초기화, 버전 관리. 앱 시작 시 자동 실행 |
| `_get(key)` | 완료 | localStorage JSON 안전 읽기 (try-catch) |
| `_set(key, value)` | 완료 | localStorage JSON 쓰기 |
| `exportAll()` | 완료 | `{ version, exportedAt, customers, prescriptions, transactions }` 반환 |
| `importAll(data)` | 완료 | 유효성 검사 후 3개 키 전체 덮어쓰기 |
| `list()` | 완료 | `_get(KEYS.customers)` 배열 반환 |
| `findById(id)` | 완료 | id 완전 매칭 |
| `findByName(name)` | 완료 | `c.name.includes(name)` — 부분 문자열 포함 매칭 |

### 스텁 (Phase 2에서 구현 필요)

| 함수 | 현재 코드 | Phase 2 구현 내용 |
|------|-----------|------------------|
| `save(customer)` | `function(c) { /* Phase 2 */ }` | create-or-update. `c.id` 있으면 update, 없으면 `c_ + Date.now()` 부여 후 push |
| `delete(id)` | `function(id) { /* Phase 2 */ }` | 배열에서 id 제거 후 저장 |

### 추가 필요 함수 (Phase 2 신규)

```javascript
// 자동완성 검색 — 이름 부분 매칭, 대소문자/앞뒤공백 무시
search(query)  → Customer[]   // query 2글자 이상 시 name.includes(query.trim())

// 처방이력 건수 (CUST-05 드롭다운 배지용)
countPrescriptions(customerId)  → number
```

---

## 3. 자동완성 드롭다운 구현 패턴

### DOM 구조 (UI-SPEC.md 확정)

```html
<!-- index.html .cust-row1 내부, 기존 #cName .fg에 position:relative 추가 -->
<div class="fg" style="position:relative">
  <label>고객명</label>
  <input id="cName" placeholder="홍길동" ...>
  <div id="custAutocomplete" class="cust-ac" style="display:none"></div>
</div>
```

`#custAutocomplete`는 `#cName`의 `.fg` 부모 안에 절대 위치로 삽입된다 (UI-SPEC §Layout Integration).

### 트리거 조건

- `keyup` on `#cName` — **1자 이상** 입력 시 검색 (UI-SPEC: "after 1 character")
- `CustomerDB.search(query)` 호출 → 결과 배열 렌더링
- 결과 없으면 "저장된 고객 없음" 단일 항목(비활성화, muted, italic)

### 드롭다운 아이템 구조

```html
<div class="cust-ac-item" data-id="c_xxx">
  <span class="cust-ac-name">
    <!-- 매칭 부분 font-weight:700, 나머지 500 -->
    <span>홍</span><strong>길</strong><span>동</span>
  </span>
  <span class="cust-ac-badge">3건</span>  <!-- 처방이력 건수, 0이면 숨김 -->
</div>
```

### 키보드 내비게이션

- `ArrowDown` / `ArrowUp`: 포커스 이동
- `Enter`: 선택
- `Escape`: 드롭다운 닫기
- 외부 클릭: 150ms 딜레이 후 닫기 (아이템 클릭 허용)

### CSS 주요 값 (UI-SPEC §Color + Component 1)

```css
#custAutocomplete {
  position: absolute; top: 100%; left: 0; width: 100%;
  z-index: 500;
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: 0 0 7px 7px;
  box-shadow: 0 4px 12px rgba(0,0,0,.12);
  max-height: 200px; overflow-y: auto;
}
.cust-ac-item {
  height: 36px; padding: 8px 11px;
  font-size: 14px; font-weight: 500;
  display: flex; align-items: center; justify-content: space-between;
}
.cust-ac-item:hover { background: var(--g-pale); }
.cust-ac-item.active { background: var(--g-btn); color: #fff; }
```

`#cName` 포커스 시 (드롭다운 열릴 때): `border-color: var(--g-btn); border-radius: 7px 7px 0 0`

### CSS 주입 패턴

`uiController.js`의 `injectValidationCSS()` 패턴을 그대로 따른다:

```javascript
// customerUI.js 내부
function injectCustomerCSS() {
  if (document.getElementById('cust-css')) return;
  const style = document.createElement('style');
  style.id = 'cust-css';
  style.textContent = `/* ... */`;
  document.head.appendChild(style);
}
```

---

## 4. 고객 Save / Load / Delete 흐름

### 고객 선택 (자동완성에서 클릭)

```javascript
// customerUI.js
function onCustomerSelect(customer) {
  // 폼 채우기
  document.getElementById('cName').value  = customer.name;
  document.getElementById('cPhone').value = customer.phone || '';
  document.getElementById('cAddr').value  = customer.addr || '';
  document.getElementById('cRegion').value = customer.region || '';
  document.getElementById('cArea').value  = customer.area || '';

  // 작물 — select 옵션 매칭 (없으면 그냥 첫 번째 유지)
  const cropEl = document.getElementById('cCrop');
  if (cropEl) {
    const opt = Array.from(cropEl.options).find(o => o.value === customer.crop);
    if (opt) cropEl.value = customer.crop;
  }

  // 할인율 — 저장된 기본값으로 세팅, _savedDiscount 갱신
  const discEl = document.getElementById('gDisc');
  if (discEl) {
    discEl.value = customer.discountRate || 0;
    _savedDiscount = customer.discountRate || 0;
    _currentCustomerId = customer.id;
    _updateDiscountState('saved');
  }
  applyGlobalDisc();  // 기존 함수 호출 — cart에 즉시 반영

  // 처방이력 배지 (UI-SPEC Component 4)
  _updateHistoryBadge(customer.id);

  // 드롭다운 닫기
  _closeAutocomplete();
}
```

### 고객 저장/수정

```javascript
// customerUI.js
function onSaveCustomer() {
  const name = document.getElementById('cName').value.trim();
  if (!name) { /* 오류 표시 */ return; }

  const customer = {
    id: _currentCustomerId || undefined,  // undefined면 save()가 신규 ID 부여
    name: name,
    phone: document.getElementById('cPhone').value.trim(),
    addr:  document.getElementById('cAddr').value.trim(),
    region: document.getElementById('cRegion').value.trim(),
    area:   Number(document.getElementById('cArea').value) || 0,
    crop:   document.getElementById('cCrop').value || '',
    discountRate: Number(document.getElementById('gDisc').value) || 0,
    memo: ''
  };

  const saved = CustomerDB.save(customer);  // create or update
  _currentCustomerId = saved.id;
  _savedDiscount = saved.discountRate;
  _updateDiscountState('saved');
}
```

### CustomerDB.save() 구현 (스텁 채우기)

```javascript
// customerDB.js save() 스텁 구현
save: function(customer) {
  var list = _get(KEYS.customers);
  var now = new Date().toISOString();
  if (customer.id) {
    // update
    var idx = list.findIndex(function(c) { return c.id === customer.id; });
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], customer, { updatedAt: now });
      _set(KEYS.customers, list);
      return list[idx];
    }
  }
  // create
  var newCustomer = Object.assign({}, customer, {
    id: 'c_' + Date.now(),
    createdAt: now,
    updatedAt: now
  });
  list.push(newCustomer);
  _set(KEYS.customers, list);
  return newCustomer;
},
```

### CustomerDB.delete() 구현 (스텁 채우기)

```javascript
delete: function(id) {
  var list = _get(KEYS.customers);
  _set(KEYS.customers, list.filter(function(c) { return c.id !== id; }));
},
```

### 삭제 확인 흐름 (UI-SPEC §6)

`confirm()` 대화상자 금지. 삭제 버튼 클릭 시:
1. "고객 삭제" → "정말 삭제?" + "예, 삭제" + "취소" (인라인 전환)
2. 5초 후 자동 취소
3. "예, 삭제" 클릭 → `CustomerDB.delete(_currentCustomerId)` → `_currentCustomerId = null` → 저장 버튼을 "고객 저장(신규)"으로 전환

---

## 5. 할인율 sessionDiscount vs savedDiscount 분리

### 핵심 개념

`gDisc` 필드의 현재 값은 두 가지 상태를 가질 수 있다:

| 상태 | 의미 | 시각 표시 |
|------|------|-----------|
| Saved (saved) | 고객 레코드의 기본 할인율과 동일 | yellow 배경 (기존 `.fg.disc` 스타일 유지) |
| Temporary (temp) | 세션 중 사용자가 임시 변경한 값 | red-lt 배경 + "임시 변경 — 저장 안됨" 배지 |

### 구현 패턴 (UI-SPEC §5)

```javascript
// customerUI.js 클로저 변수
var _savedDiscount = 0;       // 마지막으로 DB에 저장된 값
var _currentCustomerId = null; // 현재 선택된 고객 ID

function _updateDiscountState(state) {
  var discEl = document.getElementById('gDisc');
  var badge  = document.getElementById('discTempBadge');
  var saveLink = document.getElementById('discSaveLink');

  if (state === 'saved') {
    // yellow 배경은 기존 .fg.disc CSS가 처리함
    discEl.style.background = '';
    discEl.style.borderColor = '';
    if (badge) badge.style.display = 'none';
    if (saveLink) saveLink.style.display = 'none';
  } else {
    // 임시 변경
    discEl.style.background = '#FFEBEE';
    discEl.style.borderColor = '#EF9A9A';
    if (badge) badge.style.display = '';
    if (saveLink) saveLink.style.display = '';
  }
}

// gDisc의 oninput="applyGlobalDisc()" 호출 후 추가 감지
// → index.html의 applyGlobalDisc() 수정 없이 customerUI.js에서
//   별도 'input' 이벤트 리스너를 추가하는 방식으로 구현
document.getElementById('gDisc').addEventListener('input', function() {
  if (!_currentCustomerId) return;  // 고객 미선택 시 상태 없음
  var current = Number(this.value) || 0;
  _updateDiscountState(current === _savedDiscount ? 'saved' : 'temp');
});
```

### "기본값으로 저장" 링크 클릭 시

```javascript
function onSaveDiscountAsDefault() {
  if (!_currentCustomerId) return;
  var current = Number(document.getElementById('gDisc').value) || 0;
  var customer = CustomerDB.findById(_currentCustomerId);
  if (!customer) return;
  customer.discountRate = current;
  CustomerDB.save(customer);
  _savedDiscount = current;
  _updateDiscountState('saved');
}
```

**DISC-02 보장:** 이 링크를 클릭하지 않으면 `CustomerDB.save()` 는 호출되지 않는다. `applyGlobalDisc()`는 cart에만 영향을 주고 DB를 변경하지 않는다.

---

## 6. 처방이력 건수 표시 (CUST-05)

Phase 2에서의 범위는 드롭다운 아이템 배지와 `#cName` 필드 내 pill로 한정된다. 상세 이력 모달은 Phase 3.

### 건수 조회 위치

```javascript
// customerDB.js에 추가 필요
countPrescriptions: function(customerId) {
  var list = _get(KEYS.prescriptions);
  return list.filter(function(rx) { return rx.customerId === customerId; }).length;
}
```

Phase 2에서는 `fertilizer_prescriptions` 키가 항상 `[]`이므로 건수는 항상 0이 된다. 드롭다운 배지는 0이면 숨기도록 처리(UI-SPEC: "Not shown if count is 0").

### 배지 업데이트 시점

1. 드롭다운 아이템 렌더링 시: 각 고객에 대해 `CustomerDB.countPrescriptions(c.id)` 호출
2. 고객 선택 후 `#cName` 필드 pill: 선택한 고객의 건수

---

## 7. doExportJSON / doImportJSON — Phase 1 구현 위치

두 함수 모두 **이미 구현 완료**. Phase 2에서 추가 작업 없음.

### 위치

`index.html` 하단 inline `<script>` 블록, lines 3171–3207:

```javascript
// line 3171 — 이미 존재
function doExportJSON() {
  var data = CustomerDB.exportAll();
  var json = JSON.stringify(data, null, 2);
  // Blob 다운로드 (파일명: fertilizer_backup_YYYY-MM-DD.json)
  // ...
}

// line 3191 — 이미 존재
function doImportJSON(input) {
  // FileReader로 JSON 파싱 → confirm 후 CustomerDB.importAll(data) 호출
  // ...
}
```

### 버튼 위치

`index.html` actions 영역 (lines 674–678):

```html
<button class="btn-export-json" onclick="doExportJSON()">JSON 내보내기</button>
<button class="btn-import-json" onclick="document.getElementById('jsonFileInput').click()">JSON 가져오기</button>
<input type="file" id="jsonFileInput" accept=".json" style="display:none" onchange="doImportJSON(this)">
```

---

## 8. checkUnpaidOnCustomer() — Phase 2 연동 전략

### 현재 구현 (index.html line 2117)

`checkUnpaidOnCustomer()`는 서버 동기화(`syncFromServer()`)에 의존한다:
1. `syncLoader` 보여주기
2. `syncFromServer()` (비동기 서버 호출)
3. 성공/실패 모두 `applyIfFound()` → `getInvoiceHistory()`(서버 응답) 에서 고객 찾아 폼 채우기

### Phase 2 전략: CustomerDB Short-Circuit

`checkUnpaidOnCustomer()`는 수정하지 않는다. 대신 `#cName`의 `onblur` 이전에 customerUI.js가 먼저 처리한다:

```javascript
// customerUI.js 초기화 코드
document.getElementById('cName').addEventListener('input', function() {
  var q = this.value.trim();
  if (q.length >= 1) {
    _showAutocomplete(q);  // CustomerDB.search() 호출
  } else {
    _closeAutocomplete();
  }
});
```

사용자가 드롭다운에서 고객을 선택하면(`onCustomerSelect()`), 이미 모든 폼이 채워지므로 `checkUnpaidOnCustomer()`의 서버 조회는 부가 정보(미납금)에만 사용된다.

---

## 9. script 로딩 순서

현재 `index.html` script 태그 순서 (lines 796–808):

```
prescriptionModel.js?v=2
productDB.js?v=2
productMapper.js?v=3
rxNormalizer.js?v=14
pdf.js (CDN)
pdfParser.js?v=16
uiController.js?v=3
main.js?v=2
customerDB.js?v=1       ← Phase 1에서 추가됨
html2canvas.min.js (CDN)
jspdf.umd.min.js (CDN)
email.min.js (CDN)
```

### Phase 2에서 추가할 태그

`customerDB.js` 바로 뒤에 삽입:

```html
<script src="customerUI.js?v=1"></script>
```

`customerUI.js`는 `CustomerDB` (customerDB.js), `applyGlobalDisc` (index.html 인라인), DOM (`#cName`, `#gDisc` 등)에 의존하므로 DOMContentLoaded 이후 초기화해야 한다:

```javascript
// customerUI.js 마지막
document.addEventListener('DOMContentLoaded', function() {
  injectCustomerCSS();
  _initAutocomplete();
  _initDiscountStateListener();
  _injectCustomerActions();  // .cust-actions 행 동적 삽입
});
```

---

## Standard Stack

| 파일 | 상태 | 역할 |
|------|------|------|
| `customerDB.js` | 기존 (스텁 채우기) | localStorage CRUD |
| `customerUI.js` | 신규 생성 | 자동완성, 할인율 상태, 저장/삭제 버튼 |
| `index.html` | 최소 수정 | `<script>` 태그 1개 추가, `.fg` position:relative |

외부 라이브러리 추가 없음.

---

## Architecture Patterns

### 파일 구조 (Phase 2 이후)

```
customerDB.js     — CRUD 완성 (save/delete 스텁 채우기 + search/countPrescriptions 추가)
customerUI.js     — 신규: 자동완성 + 할인율 상태 + 저장/삭제 버튼 (CSS 주입 포함)
index.html        — <script src="customerUI.js?v=1"> 태그 추가
                    #cName .fg에 style="position:relative" 추가
```

### 패턴: CSS 동적 주입 (기존 uiController.js 패턴 재사용)

```javascript
// customerUI.js
function injectCustomerCSS() {
  if (document.getElementById('cust-css')) return;
  const style = document.createElement('style');
  style.id = 'cust-css';
  style.textContent = `/* 자동완성, 할인율 배지, 저장/삭제 버튼 CSS */`;
  document.head.appendChild(style);
}
```

### 패턴: 클로저 상태 관리

`customerUI.js`는 IIFE 없이 클로저를 사용하지 않아도 되지만, `_savedDiscount`, `_currentCustomerId` 같은 내부 상태는 변수명 앞에 `_` 접두사를 붙여 전역 충돌 최소화 의도를 표시한다. 전역 충돌 방지를 위해 customerUI.js 전체를 IIFE로 감싸는 것을 권장한다.

### Anti-Patterns to Avoid

- **applyGlobalDisc() 수정 금지:** 기존 할인율 적용 로직은 cart에만 영향. 이 함수를 수정하면 기존 단가 계산 회귀 위험이 크다. 대신 `input` 이벤트 리스너를 추가하는 방식으로 상태 감지.
- **checkUnpaidOnCustomer() 수정 금지:** 서버 경로 유지. 자동완성 선택 후 서버에서 미수금 조회가 추가로 실행되는 것은 정상 동작.
- **cCrop select 옵션 변경 금지:** 22개 고정 옵션이 있는 `<select>`. 저장된 고객의 crop이 옵션 목록에 없으면 그냥 선택 안 된 상태 유지 (오류 없이 무시).

---

## Don't Hand-Roll

| 문제 | 하지 않을 것 | 사용할 것 | 이유 |
|------|------------|----------|------|
| 자동완성 드롭다운 | 외부 라이브러리 | 순수 HTML/CSS/JS (직접 구현) | 빌드 도구 없음, 기능 단순 (50줄 이내) |
| 한글 부분 검색 | 자모 분리 검색 라이브러리 | `String.includes()` 단순 포함 검색 | 고객 수 50~200명. 자모 분리는 오버엔지니어링 |
| discountRate 저장 | localStorage 직접 조작 | `CustomerDB.save()` 경유 | 스키마 일관성, 마이그레이션 경로 보존 |

---

## Common Pitfalls

### Pitfall 1: #gName vs #cName 혼동

**What goes wrong:** 문서(ARCHITECTURE.md, 요청 명세서)에서 `#gName`, `#gCrop`, `#gArea`, `#gPhone` 등으로 언급되지만 실제 HTML에 이 ID들은 없다.
**Why it happens:** 아키텍처 설계 단계에서 예상한 ID와 실제 구현된 ID가 다르다.
**How to avoid:** 실제 ID 목록(이 문서 Section 1)을 참조. `#cName`, `#cPhone`, `#cAddr`, `#cRegion`, `#cArea`, `#cCrop`, `#gDisc`.
**Warning signs:** `document.getElementById('gName')` 반환 값이 null.

### Pitfall 2: discountRate 단위 혼용

**What goes wrong:** ARCHITECTURE.md 스키마는 `discountRate: 0.15` (소수)로 정의했으나, `#gDisc` 입력 필드와 `applyGlobalDisc()` 함수는 `15` (0~100 정수)를 사용한다.
**Why it happens:** 설계 단계 혼용.
**How to avoid:** **Phase 2에서 0~100 정수로 통일.** localStorage 저장도 정수, `applyGlobalDisc()`도 정수. `discountRate: 15`가 "15% 할인"을 의미.
**Warning signs:** 할인율 저장 후 불러올 때 `0.15`가 들어있으면 `#gDisc`에 `0.15`가 표시됨 (소수 오입력 버그).

### Pitfall 3: cCrop이 select인데 값을 setValue로 설정

**What goes wrong:** `document.getElementById('cCrop').value = '천혜향'`이 옵션 목록에 없는 값이면 선택이 안 된다.
**How to avoid:** 고객 불러오기 시 `Array.from(cropEl.options).find(...)` 로 옵션 존재 여부 확인 후 설정. 없으면 건너뛰기.

### Pitfall 4: customerUI.js가 DOMContentLoaded 전에 초기화

**What goes wrong:** `document.getElementById('cName')` 가 null을 반환해 이벤트 리스너 추가 실패.
**How to avoid:** `customerUI.js` 초기화 코드 전체를 `DOMContentLoaded` 이벤트 안에서 실행.

### Pitfall 5: 자동완성 드롭다운 z-index 충돌

**What goes wrong:** 드롭다운이 다른 요소(예: 모달 오버레이 `.overlay`) 뒤에 가려진다.
**How to avoid:** `z-index: 500` 사용 (UI-SPEC 명시). 모달 오버레이는 `z-index: 1000`으로 항상 위에 있으므로 충돌 없음.

### Pitfall 6: gDisc의 applyGlobalDisc 이중 실행

**What goes wrong:** `#gDisc`의 `oninput="applyGlobalDisc()"` (기존) + customerUI.js의 `addEventListener('input', ...)` (신규)가 동시에 실행된다.
**Why it's ok:** `applyGlobalDisc()` 호출 자체는 문제없다. 다만 customerUI.js의 input 리스너에서는 `applyGlobalDisc()` 를 다시 호출하지 말고 상태 감지만 해야 한다.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — vanilla JS, localStorage only, no new npm/CDN packages)

---

## Validation Architecture

`nyquist_validation: true` — 검증 섹션 포함.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | 없음 — 브라우저 직접 실행 앱, 빌드 도구 없음 |
| Config file | 없음 |
| Quick run command | 브라우저 콘솔에서 수동 실행 |
| Full suite command | 브라우저 콘솔에서 수동 실행 |

이 앱은 테스트 프레임워크가 없다. 검증은 브라우저 콘솔 + 수동 UI 시나리오로 수행한다. 각 태스크 완료 시 아래 "브라우저 스모크 테스트" 커맨드를 콘솔에서 실행하는 것이 검증 기준이다.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | 검증 방법 |
|--------|----------|-----------|-----------|
| CUST-01 | 고객 저장 후 localStorage에 레코드 존재 | unit (콘솔) | `CustomerDB.list()` → 배열에 방금 저장한 고객 확인 |
| CUST-02 | #cName 입력 시 드롭다운 표시 | manual UI | 1자 입력 후 `#custAutocomplete` display 확인 |
| CUST-02 | 드롭다운 선택 시 모든 필드 채워짐 | manual UI | 선택 후 `#cPhone`, `#cAddr`, `#cRegion`, `#cArea`, `#cCrop`, `#gDisc` 값 확인 |
| CUST-03 | 고객 선택 시 할인율 자동 적용 | manual UI | 드롭다운 선택 후 `applyGlobalDisc()` 호출 여부 + cart 할인율 확인 |
| CUST-04 | JSON 내보내기 파일 정상 생성 | manual UI | 내보내기 버튼 클릭 → 파일 다운로드 확인 (Phase 1 완료) |
| CUST-04 | JSON 가져오기 후 CustomerDB.list() 반영 | manual UI | 가져오기 후 `CustomerDB.list()` (Phase 1 완료) |
| CUST-05 | 드롭다운 아이템에 처방이력 건수 배지 표시 | manual UI | Phase 2에서 항상 0건 (Phase 3 이전). 배지 숨김 확인 |
| DISC-01 | 고객 저장 시 discountRate 0~100 정수로 저장 | unit (콘솔) | `CustomerDB.list()[0].discountRate` → 정수 값 확인 |
| DISC-02 | #gDisc 변경 시 DB 저장 안 됨 | unit (콘솔) | `gDisc` 값 변경 → `CustomerDB.findById(id).discountRate` 기존 값 유지 확인 |

### 브라우저 스모크 테스트 스크립트

```javascript
// 콘솔에 붙여넣기 — Phase 2 완료 후 실행
(function() {
  // 1. 고객 저장 테스트
  var saved = CustomerDB.save({ name: '테스트농가', phone: '010-0000-0000', discountRate: 15 });
  console.assert(saved.id, 'save: id 부여됨');
  console.assert(CustomerDB.findById(saved.id).name === '테스트농가', 'findById: 이름 일치');

  // 2. 검색 테스트
  var results = CustomerDB.search('테스트');
  console.assert(results.length > 0, 'search: 결과 있음');

  // 3. 할인율 저장 단위 테스트
  console.assert(typeof saved.discountRate === 'number', 'discountRate: number 타입');
  console.assert(saved.discountRate === 15, 'discountRate: 15 (정수)');

  // 4. 삭제 테스트
  CustomerDB.delete(saved.id);
  console.assert(CustomerDB.findById(saved.id) === null, 'delete: null');

  console.log('[Phase 2 스모크 테스트] 모두 통과');
})();
```

### Wave 0 Gaps

- [ ] 테스트 프레임워크 없음 — 브라우저 콘솔 스크립트가 유일한 자동 검증 수단. Phase 2 완료 시 위 스모크 스크립트로 대체.
- [ ] `CustomerDB.search()` 함수 신규 추가 필요 (현재 `findByName()`만 있음, 단일 결과 반환)

---

## Open Questions

1. **discountRate 단위 확정 필요**
   - What we know: `#gDisc`은 0~100 정수. `ARCHITECTURE.md` 스키마는 0.0~1.0 소수.
   - What's unclear: 기존 서버 데이터(apps-script-invoice.js)에 저장된 할인율 단위.
   - Recommendation: **0~100 정수로 확정** (이 문서). 서버 데이터와 충돌 시 Phase 4에서 마이그레이션.

2. **고객명 부분 매칭 수준**
   - What we know: 현재 `findByName()`은 `c.name.includes(name)` — 단순 포함 검색.
   - What's unclear: "홍길동 농원" 고객을 "홍길동"으로 검색 시 매칭할지.
   - Recommendation: `String.includes()` 유지. 자모 분리 검색 오버엔지니어링.

3. **cCrop select vs 자유입력**
   - What we know: `#cCrop`은 22개 옵션을 가진 `<select>`. 고객 저장 시 crop 필드가 옵션 외 값이면 불러오기 시 선택 불가.
   - Recommendation: 저장은 현재 `cCrop.value` 그대로 저장. 불러오기 시 옵션 없으면 무시.

---

## Sources

### Primary (HIGH confidence)

- `index.html` 직접 분석 (lines 540–594, 1040–1056, 1379–1398, 2117–2156, 3171–3207) — DOM 필드 ID, gDisc 사용법, checkUnpaidOnCustomer, doExportJSON/doImportJSON
- `customerDB.js` 직접 분석 (lines 1–83) — 구현 완료 vs 스텁 상태
- `main.js` 직접 분석 (lines 18–91) — handlePrescriptionUpload 내 DOM 주입 ID
- `.planning/phases/02-db/02-UI-SPEC.md` — 컴포넌트 인벤토리, 색상 토큰, 상호작용 상태
- `.planning/research/ARCHITECTURE.md` — localStorage 스키마, CustomerDB API 설계
- `.planning/research/SUMMARY.md` — 기술 스택 결정, 할인율 단위 이슈 문서화

### Secondary (MEDIUM confidence)

- `uiController.js` 직접 분석 (lines 1–60) — injectValidationCSS() 패턴 확인

---

## Metadata

**Confidence breakdown:**

- DOM 필드 ID 목록: HIGH — index.html 직접 확인
- customerDB.js 상태: HIGH — 직접 읽기
- 자동완성 구현 패턴: HIGH — UI-SPEC 확정, 표준 절대위치 드롭다운
- 할인율 분리 로직: HIGH — UI-SPEC §5 명시, applyGlobalDisc() 기존 로직 확인
- discountRate 단위: MEDIUM — 혼용 감지됨, 정수 통일 권장

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable — vanilla JS, no framework churn)
