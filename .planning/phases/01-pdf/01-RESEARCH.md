# Phase 1: PDF 파싱 수정 + 기반 인프라 — Research

**Researched:** 2026-03-25
**Domain:** Vanilla JS PDF 파싱 버그 수정, localStorage 스키마 초기화, JSON export/import UI
**Confidence:** HIGH (코드 직접 분석 기반)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PARSE-01 | 복합형 처방전(천혜향 등 여러 기간/평당가 포함)에서 마지막 합계 행의 `합계=... 평당(...)` 값을 정확히 추출한다 | pdfParser.js lines 95-97 버그 위치 확정, 수정 코드 제시 |
| PARSE-02 | 광고/홍보 페이지(처방 내용 없는 이미지 페이지)를 자동으로 건너뛴다 | pdfParser.js lines 500-515 `hasPriceKw` 로직 분석, 보강 전략 제시 |
| PARSE-03 | Vision API 응답에서 JSON 파싱 실패 시 재시도 또는 명확한 오류 메시지를 표시한다 | 현재 파서는 pdf.js 좌표 기반 전용 (Vision API 미사용) — 폴백 경로 및 방어 코드 위치 확정 |
| PARSE-04 | 홍보용(`계=홍보용`) 항목을 금액 0으로 처리하여 합계에서 제외한다 | uiController.js 장바구니 적용 경로 분석, 필터링 삽입점 확정 |
</phase_requirements>

---

## Summary

Phase 1은 4가지 파싱 버그 수정과 localStorage 기반 데이터 인프라 초기화를 묶은 단계다. 모든 수정은 기존 파일의 핀포인트 변경으로 처리할 수 있으며 신규 파일은 `customerDB.js` 하나만 추가된다.

**PARSE-01(평당가 버그)**는 `pdfParser.js`의 `extractCostPageData()` 함수 line 97에 위치한다. `for (const row of rows)` 루프가 비용 페이지 행을 위에서 아래로 순회하며 "평당" 포함 행을 만날 때마다 `unitPricePerPyeong`을 덮어쓰는 구조가 문제다. 천혜향처럼 여러 소계 행이 있는 처방전에서 마지막으로 만나는 행이 합계 행이라는 보장이 없다. 해결책은 `pyeongFromTotal`(합계 행에서 추출)과 `pyeongLastSeen`(fallback) 두 변수로 분리 추적하는 것이다.

**PARSE-02(광고 페이지)**는 이미 `hasPriceKw` 로직으로 비용 페이지 감지 후 `continue`하는 구조가 있다. 현재 코드는 비용 페이지를 `costData`로 파싱한 뒤 처방 단계 파싱에서 제외(continue)하고 있다. 광고/홍보 페이지는 비용 페이지 이후에 오는데, 현재 구조에서는 비용 페이지 감지 이후 페이지가 계속 처리될 수 있다. 비용 페이지 감지 후 `break`로 나머지 페이지를 완전히 건너뛰는 로직 추가가 필요하다.

**PARSE-03(JSON 파싱 방어)**은 현재 `pdfParser.js`가 pdf.js 좌표 기반 전용 파서로 Vision API를 직접 호출하지 않는다. 폴백 경로는 `allPrescriptions.length === 0`일 때 `alert('스캔 이미지 PDF는 지원되지 않습니다.')`를 보여주고 `null`을 반환하는 것이다. 이 메시지를 사용자 친화적인 재시도 안내로 개선하고, `parsePdfToJSON` try/catch 블록에서 `JSON.parse`가 등장하는 위치(`localStorage` 관련 코드 포함)에 방어 코드를 추가해야 한다.

**PARSE-04(홍보용 항목)**는 `계=홍보용` 표기 항목이 `originalName`에 포함될 때 `uiController.js`의 `_applyToCart()` 함수에서 금액을 0원으로 강제하는 방식으로 구현한다. 처방 데이터를 장바구니에 적용하는 경로가 이 파일에 있다.

**localStorage 기반 인프라**는 `customerDB.js` 신규 파일 생성으로 처리한다. `fertilizer_customers`, `fertilizer_prescriptions`, `fertilizer_transactions` 세 키를 빈 배열로 초기화하고 `fertilizer_schema_version`을 `"1"`로 설정한다. JSON 전체 내보내기/가져오기 버튼은 `index.html`의 `.actions` 영역 하단에 추가한다.

**Primary recommendation:** pdfParser.js의 `extractCostPageData()` 함수 line 95-97을 `pyeongFromTotal`/`pyeongLastSeen` 분리 추적 방식으로 수정하고, 비용 페이지 감지 후 남은 페이지 skip 로직을 추가하라.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS (ES2020+) | N/A (브라우저 내장) | 앱 로직 전체 | 빌드 도구 없이 직접 실행, 기존 코드 일관성 |
| pdf.js | 3.11.174 (CDN) | PDF 텍스트 레이어 추출 | 이미 index.html line 792에 로드됨 |
| localStorage | 브라우저 내장 | 고객/처방/거래 데이터 저장 | 서버 없는 단독 실행 요건, 기존 코드와 일관성 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Blob + URL.createObjectURL | 브라우저 내장 | JSON 파일 다운로드 | 내보내기 버튼 클릭 시 |
| FileReader API | 브라우저 내장 | JSON 파일 업로드 읽기 | 가져오기 버튼 클릭 시 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| localStorage | IndexedDB | IndexedDB는 용량 크지만 API 복잡도가 높음 — 예상 데이터 1~2MB 규모에서 localStorage 충분 |
| Blob 다운로드 | server-side export | 서버 없는 요건으로 불가 |

**Installation:** 추가 npm install 불필요 — 모두 브라우저 내장 API 또는 기존 CDN.

---

## Architecture Patterns

### Recommended Project Structure (Phase 1 후 상태)

```
pdfParser.js       — extractCostPageData() 수정 (lines 75-144)
customerDB.js      — [신규] localStorage CRUD + 스키마 초기화 (window.CustomerDB)
index.html         — JSON export/import 버튼 2개 추가 (.actions 영역)
pdfPromptTemplate.js — (선택) 홍보 페이지 무시 지시 추가
uiController.js    — 홍보용 항목 0원 필터링 추가
main.js            — parsePdfToJSON 에러 메시지 개선
```

### Pattern 1: 합계 행 우선 추적 (PARSE-01 핵심 패턴)

**What:** 비용 페이지 행 순회 시 "평당가"를 담는 변수를 합계 행용과 일반용으로 분리한다.
**When to use:** 복합형 처방전처럼 여러 소계 행에 모두 "평당가"가 등장하는 구조에서 마지막 합계 행 값만 최우선으로 사용해야 할 때.

---

## PARSE-01: 평당가 버그 — 정확한 위치와 수정

### 버그 위치 (pdfParser.js)

```javascript
// pdfParser.js lines 94-98 — 현재 버그 있음
// ── 평당 단가 행 ─────────────────────────────────────────
if (PYEONG_RE.test(text)) {
  const nums = parseNums(text, 100, 10_000_000);
  if (nums.length) unitPricePerPyeong = nums[nums.length - 1];  // ← line 97: 매번 덮어씀
}
```

**문제:** `for (const row of rows)` (line 91)가 비용 페이지를 위에서 아래로 순회한다. 천혜향처럼 여러 단계별 소계 행이 있는 처방전에서 `PYEONG_RE`에 매칭될 때마다 `unitPricePerPyeong`이 덮어써진다. 비용 요약 페이지 구조 예시:

```
기비용    소매가 150,000  공급가 127,500  평당 231원
관주 1번  소매가 320,000  공급가 272,000  평당 495원
관주 2번  소매가 180,000  공급가 153,000  평당 278원
합계      소매가 850,000  공급가 722,500  평당 1,313원  ← 이것이 최종값이어야 함
```

만약 "합계" 행이 마지막이면 우연히 맞지만, 처방전 레이아웃에 따라 합계가 중간에 오거나 "합계" 텍스트 없이 맨 마지막 소계 행이 마지막으로 처리될 수 있다.

### 제안 수정 (extractCostPageData 함수 내부만 변경)

현재 `extractCostPageData` 함수 선언은 **line 75**이고 `return` 문은 **line 143**이다. 수정 범위는 lines 80-143이다.

```javascript
// pdfParser.js — extractCostPageData() 수정안
// 변경 전 (line 81-83):
//   let totalCost          = null;
//   let unitPricePerPyeong = null;
//   let supplySum          = 0;
//
// 변경 후:
  let totalCost          = null;
  let unitPricePerPyeong = null;
  let pyeongFromTotal    = null;  // [신규] 합계 행에서 추출한 평당가 — 최우선
  let pyeongLastSeen     = null;  // [신규] 마지막으로 본 평당가 — fallback
  let supplySum          = 0;

// 변경 전 (lines 94-98):
//   if (PYEONG_RE.test(text)) {
//     const nums = parseNums(text, 100, 10_000_000);
//     if (nums.length) unitPricePerPyeong = nums[nums.length - 1];  // ← 덮어씀
//   }
//
// 변경 후:
    if (PYEONG_RE.test(text)) {
      const nums = parseNums(text, 100, 10_000_000);
      if (nums.length) {
        const val = nums[nums.length - 1];
        pyeongLastSeen = val;                          // 항상 마지막 값 기록
        if (TOTAL_RE.test(text)) {
          pyeongFromTotal = val;                       // 합계 행이면 별도 보존
        }
      }
    }

// 변경 전 (line 143):
//   return { totalCost, unitPricePerPyeong };
//
// 변경 후 (return 직전에 최종 결정 추가):
  // 평당가 최종 결정: 합계 행 > 마지막 평당 행
  unitPricePerPyeong = pyeongFromTotal !== null ? pyeongFromTotal : pyeongLastSeen;
  return { totalCost, unitPricePerPyeong };
```

**변경 요약:** 3가지 코드 변경.
1. 선언부에 `pyeongFromTotal`, `pyeongLastSeen` 추가
2. lines 94-98의 단순 덮어쓰기를 분기 처리로 교체
3. return 직전에 `unitPricePerPyeong` 최종 결정 1줄 추가

---

## PARSE-02: 광고/홍보 페이지 건너뛰기

### 현재 비용 페이지 감지 로직 (pdfParser.js lines 500-515)

```javascript
// lines 503-515 — 현재 구조
const hasPriceKw   = /소\s*매\s*가|공\s*급\s*가/.test(allText);
const hasNumericKw = /(?:평\s*당|단\s*가)\D{0,5}\d{3,}/.test(allText);
const hitCount     = COST_PAGE_KEYWORDS.filter(k => allText.includes(k)).length;
if (hasPriceKw || hasNumericKw || hitCount >= COST_PAGE_MIN_HITS) {
  // costData 추출 후 continue — 이 페이지 처방 단계 파싱 제외
  costData = extractCostPageData(rows);
  continue;  // ← 현재 페이지만 skip, 이후 페이지는 계속 처리됨
}
```

**문제:** 비용 페이지 이후의 광고/홍보 페이지가 처방 단계로 잘못 파싱될 수 있다. `continue`는 현재 페이지만 skip하고 다음 페이지(광고 페이지)는 처리한다.

### 수정 전략

**Option A: 비용 페이지 이후 break (단순, 추천)**

비용 페이지 감지 시 `continue` 대신 `costData`를 설정하고 루프를 `break`한다. 처방전 구조상 비용 요약 페이지는 처방 페이지들 다음에 오므로, 비용 페이지를 만나면 더 이상 처방 페이지가 없다고 간주해도 안전하다.

```javascript
// pdfParser.js line 511 수정
if (hasPriceKw || hasNumericKw || hitCount >= COST_PAGE_MIN_HITS) {
  console.log(`[Parser] page ${p} → 비용 페이지 감지, 이후 페이지 모두 스킵`);
  costData = extractCostPageData(rows);
  break;  // ← continue에서 break으로 변경 — 이후 모든 페이지 처리 중단
}
```

**Option B: 비용 페이지 이후 플래그 설정 (보수적)**

`costPageFound` 플래그를 두어 감지 이후 페이지는 처방 파싱에서 무조건 skip.

Option A가 코드 변경이 1줄로 최소화되고 처방전 구조와 일치하므로 추천한다.

**Vision API 프롬프트 보강 (pdfPromptTemplate.js — 선택적)**

현재 `PDF_SYSTEM_PROMPT`에는 광고/홍보 페이지에 대한 명시적 지시가 없다. 스캔 이미지 PDF를 Vision API로 처리하는 경로가 활성화될 경우를 대비해 아래 문구를 `buildPdfUserPrompt()` 반환 문자열에 추가한다:

```
마지막 비용 요약 페이지 이후에 나오는 제품 홍보/광고 이미지 페이지는 처방 항목에 포함하지 마세요.
```

---

## PARSE-03: JSON 파싱 방어 전략

### 현재 상태 확인

`pdfParser.js`는 현재 100% pdf.js 좌표 기반 파서다. Vision API를 직접 호출하는 코드가 없다. `parsePdfToJSON` 함수는 try/catch를 가지고 있으나 오류 시 `err.message`를 `alert`로 보여준다 (main.js line 84).

폴백 경로: `allPrescriptions.length === 0`일 때 line 1053에서 `alert('스캔 이미지 PDF는 지원되지 않습니다.')` 후 `null` 반환.

### PARSE-03 범위 재정의

"Vision API 응답이 JSON이 아닌 형태로 오더라도 앱이 멈추지 않는다"는 성공 기준은, 현재 코드 구조에서 다음 두 경우로 구체화된다:

1. **parsePdfToJSON 자체 에러 시**: `main.js`의 catch 블록이 `alert(err.message)`를 보여준다 — 이를 사용자 친화적 메시지로 개선한다.
2. **localStorage JSON 파싱 실패 시**: `index.html` line 956, 866에서 `JSON.parse(raw)` 후 catch가 없는 경우가 있다 — try/catch로 감싸고 빈 배열 fallback을 추가한다.

### 수정 방향

**main.js catch 블록 개선 (line 82-85):**

```javascript
// 현재:
} catch (err) {
  console.error('처방전 처리 오류:', err);
  alert('처방전 처리 중 오류가 발생했습니다: ' + err.message);
}

// 수정 후:
} catch (err) {
  console.error('처방전 처리 오류:', err);
  const msg = err.message || '';
  if (msg.includes('JSON') || msg.includes('parse') || msg.includes('Unexpected token')) {
    alert('처방전 파싱에 실패했습니다.\n\n다시 시도해 주세요. 반복 실패 시 PDF를 새로 저장하거나 담당자에게 문의하세요.');
  } else {
    alert('처방전 처리 중 오류가 발생했습니다.\n\n' + msg);
  }
}
```

**parsePdfToJSON 내부 안전 처리**: 스캔 PDF 폴백 메시지를 재시도 안내로 교체:

```javascript
// pdfParser.js line 1053 수정
alert('처방전에서 텍스트를 추출할 수 없습니다.\n스캔 이미지(이미지 전용) PDF인 경우, 처방전을 텍스트 PDF로 다시 저장한 후 업로드해 주세요.');
```

---

## PARSE-04: 홍보용 항목 0원 처리

### 홍보용 항목 형태

PROJECT.md 기술: `계=홍보용` 표기. 이는 처방전 비용 요약 표의 특정 행에서 `계` 열에 금액 대신 `홍보용`이라고 적히는 형태다.

### 처리 경로 분석

현재 `extractCostPageData()`는 비용 페이지에서 숫자만 추출하므로 `홍보용` 텍스트 행은 이미 자연스럽게 무시된다. 문제는 처방 품목 리스트에서 홍보용 제품이 `originalName`에 포함될 때 거래명세표 금액 합계에 포함되는 경우다.

### 삽입점: uiController.js `_applyToCart()` 함수

처방 데이터가 장바구니에 적용되는 경로에서 `originalName` 또는 `stageLabel`에 `홍보용`이 포함된 항목을 감지해 `retailPrice`와 `supplyPrice`를 0으로 강제한다.

```javascript
// uiController.js _applyToCart() 내부 — 각 item 처리 루프에 추가
const isPromo = /홍보용/.test(item.originalName || '') ||
                /홍보용/.test(rx.stageLabel     || '');
if (isPromo) {
  // 홍보용 항목: 수량은 유지, 금액만 0으로
  item._promoOverride = true;
  // 장바구니 추가 시 가격 0 강제 적용
}
```

**대안**: `productMapper.js`의 `findProduct()` 결과에서 `홍보용` 감지 후 price=0 오버라이드. 이 방법은 더 상위에서 필터링하므로 추천.

실제 삽입 위치는 `uiController.js`의 `_applyToCart` 함수 내에서 `addToCart` 또는 동등 호출 직전 `retailPrice` 계산부다. `uiController.js` 코드를 직접 확인해 정확한 라인을 확인한다.

---

## localStorage 스키마 초기화

### customerDB.js 설계 (신규 파일)

**스키마 키:**
```
fertilizer_customers       — 고객 배열 []
fertilizer_prescriptions   — 처방 이력 배열 []
fertilizer_transactions    — 거래명세표 배열 []
fertilizer_schema_version  — "1"
```

**초기화 패턴:**

```javascript
// customerDB.js — window.CustomerDB 네임스페이스
(function() {
  const SCHEMA_VERSION = 1;
  const KEYS = {
    customers:     'fertilizer_customers',
    prescriptions: 'fertilizer_prescriptions',
    transactions:  'fertilizer_transactions',
    version:       'fertilizer_schema_version'
  };

  function _migrate() {
    const stored = parseInt(localStorage.getItem(KEYS.version) || '0', 10);
    if (stored >= SCHEMA_VERSION) return;
    // v0 → v1: 신규 설치 — 빈 배열로 초기화
    if (stored < 1) {
      if (!localStorage.getItem(KEYS.customers))
        localStorage.setItem(KEYS.customers,     JSON.stringify([]));
      if (!localStorage.getItem(KEYS.prescriptions))
        localStorage.setItem(KEYS.prescriptions, JSON.stringify([]));
      if (!localStorage.getItem(KEYS.transactions))
        localStorage.setItem(KEYS.transactions,  JSON.stringify([]));
      localStorage.setItem(KEYS.version, String(SCHEMA_VERSION));
    }
  }

  function _get(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch(e) { console.error('DB read error:', key, e); return []; }
  }
  function _set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  window.CustomerDB = {
    // 고객 CRUD (Phase 2에서 구현)
    list:         () => _get(KEYS.customers),
    findById:     (id) => _get(KEYS.customers).find(c => c.id === id) || null,
    findByName:   (name) => _get(KEYS.customers).find(
                    c => c.name && c.name.includes(name)) || null,
    save:         (c) => { /* Phase 2에서 구현 */ },
    delete:       (id) => { /* Phase 2에서 구현 */ },

    // 내보내기 / 가져오기
    exportAll() {
      return {
        version:       SCHEMA_VERSION,
        exportedAt:    new Date().toISOString(),
        customers:     _get(KEYS.customers),
        prescriptions: _get(KEYS.prescriptions),
        transactions:  _get(KEYS.transactions)
      };
    },
    importAll(data) {
      if (!data || !data.version) throw new Error('유효하지 않은 백업 파일입니다.');
      _set(KEYS.customers,     Array.isArray(data.customers)     ? data.customers     : []);
      _set(KEYS.prescriptions, Array.isArray(data.prescriptions) ? data.prescriptions : []);
      _set(KEYS.transactions,  Array.isArray(data.transactions)  ? data.transactions  : []);
    },

    _migrate
  };

  // 앱 시작 시 스키마 초기화 실행
  _migrate();
})();
```

### index.html script 태그 추가 위치

현재 `index.html` lines 788-797에 script 태그들이 있다:

```html
<script src="prescriptionModel.js?v=2"></script>
...
<script src="main.js?v=2"></script>
```

`customerDB.js`는 다른 JS 파일에 의존하지 않으므로 `main.js` 이후 맨 마지막에 추가한다:

```html
<!-- index.html — main.js 이후 추가 -->
<script src="customerDB.js?v=1"></script>
```

---

## JSON 내보내기/가져오기 버튼 배치

### 현재 `.actions` 영역 구조 (index.html lines 651-673)

```html
<div class="actions">
  <div class="act-group">
    <button class="btn-print">인쇄</button>
    <div class="act-row">
      <button class="btn-pdf">PDF 저장</button>
      <button class="btn-email">서버저장</button>
    </div>
  </div>
  <div class="act-divider"></div>
  <div class="act-group">
    [PDF 업로드 버튼, 미수금 버튼들]
  </div>
  <div class="act-divider"></div>
  <div class="act-group">
    <button class="btn-rx">처방전 처방</button>
    <button class="btn-clear">전체 초기화</button>
  </div>
</div>
```

### 버튼 배치 제안

마지막 `act-divider` 이후, `.act-group` 마지막 블록 내에 추가하거나 새 그룹으로 삽입:

```html
<!-- index.html — 마지막 act-divider 다음에 새 act-group 추가 -->
<div class="act-divider"></div>
<div class="act-group" style="flex-direction:row;gap:6px;">
  <button class="btn-db-export" onclick="exportDBData()"
    style="flex:1;padding:9px 10px;border-radius:7px;border:1.5px solid var(--g-btn);
           background:var(--g-pale);color:var(--g-dark);font-family:inherit;
           font-size:12px;font-weight:700;cursor:pointer;">
    📤 DB 내보내기
  </button>
  <button class="btn-db-import" onclick="document.getElementById('dbImportInput').click()"
    style="flex:1;padding:9px 10px;border-radius:7px;border:1.5px solid var(--g-btn);
           background:var(--g-pale);color:var(--g-dark);font-family:inherit;
           font-size:12px;font-weight:700;cursor:pointer;">
    📥 DB 가져오기
  </button>
  <input type="file" id="dbImportInput" accept=".json" style="display:none"
    onchange="importDBData(this)">
</div>
```

**버튼 로직 (customerDB.js 또는 index.html 인라인 script에 추가):**

```javascript
function exportDBData() {
  const data = window.CustomerDB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `천연비료DB_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importDBData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      window.CustomerDB.importAll(data);
      alert('데이터를 성공적으로 가져왔습니다.');
    } catch (err) {
      alert('가져오기 실패: 올바른 백업 파일인지 확인하세요.\n' + err.message);
    }
    input.value = ''; // 같은 파일 재선택 허용
  };
  reader.readAsText(file);
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 파일 다운로드 | 서버 라우트 | Blob + URL.createObjectURL | 브라우저 내장, 서버 불필요 |
| 파일 읽기 | FormData/서버 업로드 | FileReader API | 클라이언트 전용, 브라우저 내장 |
| JSON 스키마 마이그레이션 | 복잡한 버전 관리 라이브러리 | 단순 if (stored < N) 블록 | 데이터 규모와 팀 규모에 비례해 단순할수록 좋음 |
| 홍보용 필터링 | 별도 처방 데이터베이스 | originalName 문자열 패턴 매칭 | 이미 originalName에 원문 보존됨 |

**Key insight:** 이 앱의 규모(1-2인 사용자, 수백 건 데이터)에서 복잡한 라이브러리나 서버 의존은 오히려 유지보수 부채가 된다. 브라우저 내장 API로 충분하다.

---

## Common Pitfalls

### Pitfall 1: break vs continue — 비용 페이지 이후 처리

**What goes wrong:** `continue` 대신 `break`로 바꾸면 비용 페이지가 처방 루프의 마지막 페이지가 아닌 중간에 있을 때 이후 처방 페이지도 모두 스킵된다.

**Why it happens:** 처방전 구조상 비용 요약 페이지는 항상 처방 페이지들 이후에 오지만 코드는 이를 가정한다.

**How to avoid:** `break`를 사용하되 로그를 충분히 남긴다. 처방 페이지보다 비용 페이지가 먼저 오는 경우는 처방전 구조에서 불가능하다(PROJECT.md 기준).

**Warning signs:** 파싱 후 `allPrescriptions.length === 0`이면서 costData는 있는 경우.

### Pitfall 2: PYEONG_RE가 처방 페이지에서도 매칭됨

**What goes wrong:** `PYEONG_RE = /평\s*당|단\s*가/`가 처방 페이지의 "500평당 10포" 같은 텍스트와도 매칭된다. 비용 페이지 감지 로직이 약하면 처방 페이지를 비용 페이지로 오인할 수 있다.

**How to avoid:** 비용 페이지 감지 임계값(`COST_PAGE_MIN_HITS`)과 `hasPriceKw` 조건이 이미 핵심 가격 키워드(소매가/공급가)를 기준으로 하므로 현재 로직은 안전하다. PARSE-01 수정은 `extractCostPageData()` 내부만 변경하므로 비용 페이지 감지 로직에 영향 없다.

### Pitfall 3: localStorage 초기화를 기존 데이터 위에 덮어쓰기

**What goes wrong:** `_migrate()`에서 기존 키 존재 여부 확인 없이 빈 배열로 덮어쓰면 이미 저장된 데이터가 소실된다.

**How to avoid:** 초기화 전 `localStorage.getItem(key)` null 확인 후에만 설정 (위 코드에 이미 반영됨).

**Warning signs:** 앱 재로드 후 기존 데이터가 사라지면 즉시 위험 신호.

### Pitfall 4: JSON.parse try/catch 누락

**What goes wrong:** `index.html` line 956에서 `JSON.parse(raw)`를 try/catch 없이 호출한다. 저장된 데이터가 손상되면 앱 전체가 예외로 멈춘다.

**How to avoid:** `customerDB.js`의 `_get()` 헬퍼처럼 모든 JSON 파싱을 try/catch로 감싸고 null 또는 빈 배열을 fallback으로 반환한다.

---

## Code Examples

### 내보내기 패턴 (Blob + createObjectURL)

```javascript
// Source: MDN Web Docs — Blob
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

### 가져오기 패턴 (FileReader)

```javascript
// Source: MDN Web Docs — FileReader
function readJSONFile(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try { callback(null, JSON.parse(e.target.result)); }
    catch(err) { callback(err, null); }
  };
  reader.readAsText(file, 'UTF-8');
}
```

### localStorage JSON 안전 읽기 패턴

```javascript
// 방어적 읽기 — 항상 이 패턴 사용
function safeParse(key, defaultValue = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    console.error('localStorage parse error:', key, e);
    return defaultValue;
  }
}
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | 없음 — 테스트 인프라 미설치. 기존 rxNormalizer.v14.test.js가 node 직접 실행 방식 |
| Config file | 없음 |
| Quick run command | `node rxNormalizer.v14.test.js` |
| Full suite command | `node rxNormalizer.v14.test.js` (현재 단일 파일) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PARSE-01 | 복합형 처방전 평당가가 합계 행 값으로 추출됨 | unit | `node pdfParser.unit.test.js` | ❌ Wave 0 |
| PARSE-01 | 단순형 처방전 평당가가 정상 추출됨 (regression) | unit | `node pdfParser.unit.test.js` | ❌ Wave 0 |
| PARSE-02 | 비용 페이지 이후 페이지가 처방 결과에 포함되지 않음 | unit | `node pdfParser.unit.test.js` | ❌ Wave 0 |
| PARSE-03 | parsePdfToJSON 예외 시 alert 메시지에 재시도 안내가 포함됨 | manual | 브라우저에서 손상 PDF 업로드 | — |
| PARSE-04 | 홍보용 originalName 항목의 금액이 0으로 처리됨 | unit | `node pdfParser.unit.test.js` | ❌ Wave 0 |
| 인프라 | fertilizer_customers 키가 localStorage에 초기화됨 | unit | `node customerDB.test.js` | ❌ Wave 0 |
| 인프라 | exportAll() → importAll() 왕복 데이터 동일 | unit | `node customerDB.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node rxNormalizer.v14.test.js` (기존 regression 확인)
- **Per wave merge:** `node pdfParser.unit.test.js && node customerDB.test.js`
- **Phase gate:** 모든 unit 테스트 통과 + 브라우저에서 성공 기준 5개 수동 확인

### Wave 0 Gaps

- [ ] `pdfParser.unit.test.js` — extractCostPageData() 단위 테스트 (PARSE-01, PARSE-02, PARSE-04)
- [ ] `customerDB.test.js` — localStorage CRUD + export/import 단위 테스트

테스트 파일 구조 (node 직접 실행, 브라우저 없이):

```javascript
// pdfParser.unit.test.js — 가짜 rows 배열로 extractCostPageData 직접 테스트
// extractCostPageData를 window/global 없이 테스트하려면 함수를 exports로 추출하거나
// 테스트 파일에서 inline으로 함수를 재정의하는 방식 사용

// 예시:
const rows_복합형 = [
  { items: [{ text:'기비용', x:10, w:40 }, { text:'평당 231원', x:200, w:60 }], y: 50 },
  { items: [{ text:'관주1번', x:10, w:40 }, { text:'평당 495원', x:200, w:60 }], y: 80 },
  { items: [{ text:'합계', x:10, w:30 }, { text:'평당 1,313원', x:200, w:70 }], y: 120 }
];
// 기대값: unitPricePerPyeong = 1313 (합계 행의 값)
```

**Wave 0에서 이 두 파일을 먼저 생성해야 한다.** (기존 rxNormalizer.v14.test.js 패턴 참고)

---

## Environment Availability

Step 2.6: SKIPPED (외부 서비스 없음 — 브라우저 내장 API와 기존 CDN만 사용. 네트워크 접근 불필요한 단계.)

---

## Open Questions

1. **비용 페이지 위치 가정 검증**
   - What we know: PROJECT.md에 "마지막 페이지 이후는 광고(무시)"라고 기술됨
   - What's unclear: 일부 처방전 PDF에서 비용 페이지가 처방 페이지 중간에 삽입될 가능성
   - Recommendation: break 전략을 사용하되, 파싱 결과 검증 모달에서 총 처방 단계 수를 보여줘 사용자가 이상을 감지할 수 있게 한다

2. **홍보용 항목 감지 패턴 완전성**
   - What we know: `계=홍보용`이 표기 형태임 (PROJECT.md)
   - What's unclear: 정확한 텍스트 패턴 — `originalName`에 "홍보용"이 포함되는 형태인지, 아니면 별도 필드인지
   - Recommendation: `originalName`과 `stageLabel` 모두에 `/홍보용/` 패턴 검사 적용

3. **customerDB.js 위치: 별도 파일 vs index.html 인라인**
   - What we know: 아키텍처 연구에서 별도 파일 `customerDB.js` 권장
   - What's unclear: Phase 1 범위에서 CRUD 전체를 구현할지, 스키마 초기화와 export/import만 구현할지
   - Recommendation: Phase 1은 `_migrate()` + `exportAll()` + `importAll()` 3개 함수만 구현. CRUD는 Phase 2에서 추가.

---

## Sources

### Primary (HIGH confidence)

- 코드 직접 분석: `pdfParser.js` (lines 75-144 `extractCostPageData`, lines 462-1100 `parsePdfToJSON`, lines 500-515 비용 페이지 감지)
- 코드 직접 분석: `main.js` (lines 47-86 `handlePrescriptionUpload`, catch 블록)
- 코드 직접 분석: `pdfPromptTemplate.js` (전체 — Vision API 프롬프트 스키마)
- 코드 직접 분석: `index.html` (lines 651-673 `.actions` 영역, lines 788-797 script 태그, line 853-866 localStorage 사용)
- `.planning/research/ARCHITECTURE.md` — localStorage 스키마, customerDB.js API 설계, 평당가 버그 분석
- `.planning/research/PITFALLS.md` — Pitfall 2 (평당가), Pitfall 3 (광고 페이지), Pitfall 6 (JSON 파싱)
- `.planning/PROJECT.md` — "처방전 구조", "홍보용 항목" 도메인 지식

### Secondary (MEDIUM confidence)

- MDN Web Docs — Blob API, FileReader API, localStorage (표준 브라우저 API)
- `.planning/research/SUMMARY.md` — Phase 1 범위 및 구현 노트

---

## Metadata

**Confidence breakdown:**

- Standard Stack: HIGH — 기존 코드에서 직접 확인된 라이브러리만 사용
- Architecture: HIGH — 코드 직접 분석으로 삽입점 확정
- Bug Fix (PARSE-01): HIGH — 버그 위치 line 97 확정, 수정 코드 제시
- Bug Fix (PARSE-02): HIGH — 현재 로직 분석, continue → break 1줄 변경
- Bug Fix (PARSE-03): MEDIUM — Vision API가 현재 미사용이므로 "JSON 파싱 실패" 시나리오는 주로 localStorage 읽기 실패 및 폴백 메시지 개선으로 범위 재정의됨
- Bug Fix (PARSE-04): MEDIUM — `계=홍보용` 정확한 텍스트 패턴 처방전 PDF 없이 코드로만 확인
- localStorage 인프라: HIGH — 스키마 설계 확정됨

**Research date:** 2026-03-25
**Valid until:** 2026-06-25 (안정적 도메인, 60일)
