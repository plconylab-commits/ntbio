# Phase 6: 처방전↔거래명세표 대조 검토 - Research

**Researched:** 2026-03-27
**Domain:** Vanilla JS fuzzy string matching, modal UI, PDF data extraction, diff table rendering
**Confidence:** HIGH (all key findings from direct source code inspection)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** 거래명세표 툴바에 "처방전 비교" 버튼을 수동 추가한다.
**D-02:** 버튼 클릭 → 모달이 뜨고 → 처방전 PDF 업로드 → 카트와 비교 시작.
**D-03:** 현재 카트(거래명세표 상태)가 invoice 역할 — 카트는 덮어쓰지 않는다.
**D-04:** 기존 `pdfFileInput` 버튼은 건드리지 않는다 (별도 file input 사용).
**D-05:** 비교 결과는 업로드 모달 안에서 diff 테이블로 표시 (카트 테이블에 인라인 표시 없음).
**D-06:** diff 테이블 행 구성:
  - 일치 행 (✓): 품목명 매칭되고 수량 동일 — 회색 (축소 표시 가능)
  - 수량 차이 행 (△): 품목명 매칭되지만 수량 다름 — 노란색 강조
  - 한쪽에만 있는 행 (✗): 처방전에만 있거나 카트에만 있는 품목 — 빨간색 강조
  - 미매칭 행 (?): 자동 매칭 실패 — 회색/주황색으로 "미확인" 표시
**D-07:** 퍼지 문자열 매칭 — 소문자화 + 특수문자/공백 제거 후 포함여부(contains) 확인.
**D-08:** 매칭 모호 시 "미매칭 항목"으로 표시; 사용자가 수동으로 확인.
**D-09:** 사용자 매핑 편집 UI는 이 phase 범위 밖 (deferred).
**D-10:** 비교 대상: 품목명 유무, 수량(qty), 항목별 단가 × 수량.
**D-11:** 수량 허용 오차 없음 — 1개라도 차이나면 차이 행으로 표시.
**D-12:** 금액 비교: 카트 `sp × qty` vs 처방전 쪽 금액(costData 또는 품목별 단가 역산). 처방전 PDF에 항목별 단가가 없는 경우 금액 비교는 skip.
**D-13:** 전체 평당가 요약(처방전 평당가 vs 카트 공급가 합계 ÷ 면적)은 diff 테이블 상단 1줄 요약으로 포함.

### Claude's Discretion
- diff 테이블 정확한 컬럼 구성(처방전 수량 / 카트 수량 / 차이 등)
- 퍼지 매칭 알고리즘 세부(토큰화 방식, 최소 유사도 임계값)
- 모달 크기·스타일
- 일치 행의 기본 표시/숨김 여부

### Deferred Ideas (OUT OF SCOPE)
- 사용자 매핑 편집 UI (드래그 또는 선택으로 수동 연결) — 복잡도 높음, 별도 phase
- 비교 결과로 카트 자동 수정 기능 — 현재는 표시만
- 처방이력에서 선택해서 비교하는 방식 — 이번 phase는 PDF 업로드 방식만
</user_constraints>

---

## Summary

Phase 6은 기존 `index.html` 거래명세표 도구에 처방전 PDF 비교 기능을 추가하는 작업이다. 새로운 파일(`rxCompareUI.js`)을 만들고, 기존 `parsePdfToJSON()` 파이프라인을 재사용해 처방전을 파싱한 뒤, 카트(`cart[]`)와 비교해 diff 테이블을 모달로 표시한다.

핵심 기술 도전은 세 가지다: (1) PDF 파싱 결과(`rxRows[].finalQty`)와 카트 아이템(`cart[].qty`)을 한국어 제품명 기준으로 퍼지 매칭, (2) 매칭 결과를 4가지 상태(일치/수량차이/한쪽만/미매칭)로 분류하는 diff 로직, (3) 기존 모달 패턴(`_openOldInvConfirmModal` 스타일)을 따른 overlay DOM 생성.

모든 코드는 바닐라 JS + 빌드 도구 없음 원칙을 따른다. 새 스크립트는 IIFE + `window.RxCompareUI` 네임스페이스 패턴으로 작성하고 `index.html`에 `<script src="rxCompareUI.js">` 태그로 직접 포함한다.

**Primary recommendation:** `parsePdfToJSON(file)`을 그대로 호출하되 `_applyToCart()`를 호출하지 않는 별도 경로로 처방전을 파싱하고, `rxRows[].finalQty + productName`을 카트 `qty + name`에 매칭해 diff 테이블을 생성한다.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS (ES2020) | — | 전체 로직 | 프로젝트 일관성, 빌드 없음 |
| pdf.js (pdfjsLib) | 이미 로드됨 | PDF 텍스트 추출 | 기존 `extractPdfText()` 의존 |
| Google Vision API | 이미 로드됨 | 스캔 처방전 → JSON | `parsePdfToJSON()` 내부에서 사용 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| IIFE module pattern | — | 네임스페이스 격리 | 새 파일(`rxCompareUI.js`) 작성 시 |
| `window.RxCompareUI` | — | 전역 인터페이스 노출 | `index.html`에서 버튼 핸들러로 호출 |

**Installation:** 설치 불필요. 새 파일 `rxCompareUI.js` 를 프로젝트 루트에 생성하고 `index.html` 에 `<script src="rxCompareUI.js"></script>` 추가.

---

## Architecture Patterns

### Recommended Project Structure

```
(기존 구조 유지)
├── index.html          # 툴바 버튼 + <script src> 추가만
├── rxCompareUI.js      # 신규: 비교 모달 전체 (IIFE, window.RxCompareUI 노출)
└── ... (기존 파일 무수정)
```

### Pattern 1: IIFE + window 네임스페이스 (기존 패턴 그대로)

**What:** 전역 충돌 없이 모듈을 노출하는 기존 패턴

**When to use:** 모든 신규 JS 파일 작성 시

**Example:**
```javascript
// rxCompareUI.js
(function() {
  'use strict';

  function openCompareModal() {
    // 모달 생성 로직
  }

  window.RxCompareUI = { openCompareModal };
})();
```

### Pattern 2: DOM 기반 동적 오버레이 모달 (기존 `_openOldInvConfirmModal` 스타일)

**What:** `document.createElement('div')` + innerHTML 로 overlay 생성, `document.body.appendChild()`

**When to use:** 비교 모달 구현 시. 기존 `.overlay`/`.modal` CSS 클래스 재활용 가능.

**Example (기존 패턴 참고):**
```javascript
// Source: index.html §3190-3239 (_openOldInvConfirmModal)
function _openRxCompareModal() {
  const prev = document.getElementById('rxCompareOverlay');
  if (prev) prev.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rxCompareOverlay';
  overlay.innerHTML = `
    <style>
      #rxCompareOverlay { position:fixed; inset:0; background:rgba(0,0,0,.48);
        z-index:9900; display:flex; align-items:center; justify-content:center; }
      .rxcmp-box { background:#fff; border-radius:14px; width:min(700px,96vw);
        max-height:90vh; overflow-y:auto; }
    </style>
    <div class="rxcmp-box">...</div>`;
  document.body.appendChild(overlay);
}
```

### Pattern 3: 별도 file input으로 PDF 업로드 (D-04 준수)

**What:** 기존 `pdfFileInput` 과 완전히 별개인 hidden file input을 모달 내부에 배치

**When to use:** 비교 모달에서 처방전 PDF 수신 시. 기존 `onPdfSelected()` 분기를 건드리지 않는다.

**Example:**
```javascript
// 모달 내부 input (모달 HTML에 포함)
`<input type="file" id="rxCmpFileInput" accept=".pdf" style="display:none"
  onchange="window.RxCompareUI._onRxFileSelected(this)">`
```

### Pattern 4: parsePdfToJSON() 재사용 — 카트 적용 없이

**What:** `parsePdfToJSON(file)`은 `prescriptionJSON`을 반환만 하고 카트를 건드리지 않는다. `handlePrescriptionUpload()`가 카트에 적용하는 역할. Phase 6는 `parsePdfToJSON()` 만 직접 호출한다.

**Key data path:**
```
parsePdfToJSON(file)
  → prescriptionJSON.rxRows[]         — 처방전 품목 배열 (RxRow 객체)
  → prescriptionJSON.farmInfo.totalArea — 전체 평수
  → prescriptionJSON.costData           — 평당가·합계 (있을 때)

각 RxRow 핵심 필드:
  .productName   — 정규화된 제품명 (매칭 기준)
  .productRaw    — 원문 (표시용)
  .dosageQty     — 처방 원래 수량 (기준 평수 기준)
  .baseArea      — 기준 평수
  finalQty = calcRequiredQty(totalArea, baseArea, dosageQty)
             — 면적 보정 후 최종 수량 (D-SPECs의 비교 기준)

카트 아이템 핵심 필드:
  .name   — 제품명
  .qty    — 수량
  .sp     — 공급가(원)
  .retail — 소비자가(원)
```

### Pattern 5: 퍼지 매칭 알고리즘 (D-07 구현)

**What:** 소문자화 + 특수문자·공백 제거 후 `contains` 방향 확인

**Recommended implementation:**
```javascript
function normalizeForMatch(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^가-힣a-z0-9]/g, '');  // 한글+영문+숫자만 유지
}

function fuzzyMatch(rxName, cartName) {
  const rx   = normalizeForMatch(rxName);
  const cart = normalizeForMatch(cartName);
  if (!rx || !cart) return false;
  // 짧은 쪽이 긴 쪽에 포함되면 매칭 (D-07: contains 방식)
  return rx.includes(cart) || cart.includes(rx);
}
```

**Pitfall:** 동명이품(예: "옥토팜" vs "옥토팜 발효계분")이 모두 매칭될 수 있음. 먼저 더 긴 문자열(더 구체적인) 매칭을 우선해야 중복 매칭 방지 가능.

**Recommended matching strategy:**
1. 처방전 rxRows를 `productName` 기준으로 정렬(긴 것 우선)
2. 카트 아이템 각각에 대해 매칭 시도
3. 이미 매칭된 rxRow는 재사용하지 않음(1:1 그리디 매칭)
4. 매칭 실패 시 → "미매칭(?) 행"

### Pattern 6: diff 분류 로직

```javascript
// 매칭 결과로 4가지 row type 결정
function classifyDiffRow(rxRow, cartItem) {
  if (!rxRow && cartItem)  return 'cart-only';   // ✗ 카트에만 있음
  if (rxRow && !cartItem)  return 'rx-only';     // ✗ 처방전에만 있음
  if (!rxRow && !cartItem) return 'unmatched';   // ? 자동 매칭 실패
  const rxQty   = calcRequiredQty(totalArea, rxRow.baseArea, rxRow.dosageQty);
  const cartQty = cartItem.qty;
  if (rxQty === cartQty)   return 'match';       // ✓ 일치
  return 'qty-diff';                             // △ 수량 차이
}
```

### Anti-Patterns to Avoid

- **기존 `onPdfSelected()` 수정:** 별도 file input + 별도 핸들러 사용 (D-04)
- **카트 직접 수정:** 비교는 읽기 전용, 카트 변경 금지 (D-03)
- **`handlePrescriptionUpload()` 재호출:** `_applyToCart()`가 연쇄 호출됨 — 대신 `parsePdfToJSON(file)` 직접 호출
- **`openValidationModal()` 재호출:** 검증 모달은 카트 적용 전용 — 비교 전용 모달과 혼용 금지

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF → 처방전 JSON 파싱 | 별도 파서 | `parsePdfToJSON(file)` in `main.js` | 기존 Vision API + pdfParser.js 파이프라인 완성형 |
| 수량 역산 | 직접 계산 | `calcRequiredQty(totalArea, baseArea, dosageQty)` in `prescriptionModel.js` | 면적 보정 로직 이미 구현됨 |
| 사용자 피드백 토스트 | alert/confirm | `showToast(msg, isError)` in `index.html` | 기존 UX 일관성 |
| 동적 모달 | 별도 라이브러리 | DOM createElement + `_openOldInvConfirmModal` 패턴 | 기존 패턴 완성형 |

---

## Data Flow (처방전 비교 전체 경로)

```
[툴바 "처방전 비교" 버튼 클릭]
  ↓
RxCompareUI.openCompareModal()   — 모달 DOM 생성 + append
  ↓
[사용자: 처방전 PDF 파일 선택]
  ↓  #rxCmpFileInput onchange
RxCompareUI._onRxFileSelected(input)
  ↓
parsePdfToJSON(file)              — main.js, Vision API or pdfParser.js
  → prescriptionJSON { rxRows[], farmInfo, costData }
  ↓
_buildDiffData(prescriptionJSON, cart)
  ↓
  1) totalArea = prescriptionJSON.farmInfo.totalArea (or infer from rxRows)
  2) rxItems = rxRows.map(r => { name: r.productName, qty: calcRequiredQty(...) })
  3) fuzzyMatch(rxItems, cart)
     → matchedPairs[]
     → rxOnly[]   (처방전에만 있는 항목)
     → cartOnly[] (카트에만 있는 항목)
  ↓
_renderDiffTable(diffData)        — 4가지 row type으로 테이블 렌더
  ↓
[사용자: 모달 확인 후 닫기]      — 카트 불변
```

---

## Common Pitfalls

### Pitfall 1: `parsePdfToJSON()` 가 카트를 건드리지 않는지 확인
**What goes wrong:** `handlePrescriptionUpload()` 를 호출하면 `openValidationModal()` → `_applyToCart()` 가 실행되어 현재 카트가 처방전으로 교체됨 (D-03 위반).
**Why it happens:** `main.js` 의 `handlePrescriptionUpload()` 는 파싱 + 카트 적용의 통합 함수.
**How to avoid:** `parsePdfToJSON(file)` 만 직접 호출. `handlePrescriptionUpload()` 호출 금지.
**Warning signs:** 비교 클릭 후 카트 내용이 바뀌는 경우.

### Pitfall 2: 기존 `onPdfSelected()` 분기가 비교 file input을 가로채는 경우
**What goes wrong:** 모달 내 file input이 `onPdfSelected()`에 연결되어 있으면 처방전 파싱 후 카트가 교체됨.
**Why it happens:** 개발 중 실수로 기존 `pdfFileInput`의 `onchange` 핸들러를 재사용하는 경우.
**How to avoid:** 새 file input의 `onchange`를 `window.RxCompareUI._onRxFileSelected(this)` 전용 핸들러로 독립 연결. `id="rxCmpFileInput"` 사용 (기존 `pdfFileInput`과 다른 ID).

### Pitfall 3: parsePdfToJSON 로딩 중 모달 UI 반응 없음
**What goes wrong:** Vision API 호출은 수초~수십초 소요. 로딩 표시 없으면 사용자가 여러 번 클릭하거나 모달이 멈춘 것으로 착각.
**How to avoid:** 파일 선택 즉시 버튼 disable + "분석 중..." 텍스트 표시. 완료 후 `disabled` 해제 및 결과 렌더.

### Pitfall 4: `rxRows`가 비어있는 경우 처리
**What goes wrong:** `parsePdfToJSON()`이 성공하더라도 `rxRows` 배열이 비거나 `finalQty`가 0인 행이 섞임.
**Why it happens:** 처방전 구조가 단순하거나 임베드(`##RX##`) 처방전인 경우 `rxRows`가 달라짐.
**How to avoid:** `rxRows`가 비면 `prescriptions[].items`를 fallback으로 사용 가능. `finalQty <= 0` 행은 매칭에서 제외.

### Pitfall 5: `##RX##` 임베드 처방전은 pdfParser가 아닌 `applyRxPdfEmbed()`로 처리
**What goes wrong:** `parsePdfToJSON()` 은 Vision API를 호출하지 않고 직접 처방전을 파싱한다고 가정하지만, 실제로 `extractPdfText()`로 텍스트를 뽑는 과정이 없다.
**Why it happens:** `onPdfSelected()` 에서 `##RX##` 감지 분기는 `parsePdfToJSON()` 호출 전에 `return` 해버림. 그러나 비교 모달에서는 이 감지 로직이 없다.
**How to avoid:** 비교 모달의 `_onRxFileSelected()` 에서도 `##RX##` 감지 → `applyRxPdfEmbed` 의 JSON 구조를 처방전 비교 데이터로 변환하는 경로를 추가하거나, Vision API 경로만 지원(스캔 처방전만)하고 `##RX##` 처방전은 scope 밖으로 명시.

### Pitfall 6: `totalArea` 가 null인 경우 `finalQty` 계산 실패
**What goes wrong:** `calcRequiredQty(null, baseArea, dosageQty)` 는 `baseQty`(면적 보정 없음)를 그대로 반환한다. 처방전에 면적 정보가 없으면 수량 비교가 틀릴 수 있다.
**How to avoid:** `totalArea` null 시 `dosageQty`를 비교 수량으로 사용하고, 모달 상단에 "면적 정보 없음 — 처방 원본 수량으로 비교" 경고를 표시.

### Pitfall 7: 중복 매칭 (한 처방전 항목이 여러 카트 아이템에 매칭)
**What goes wrong:** "옥토팜" 이 카트의 "옥토팜(발효계분)" 과 "옥토팜 특별배합" 에 모두 매칭.
**How to avoid:** 1:1 그리디 매칭 — 더 긴 문자열(구체적인 이름)을 우선 매칭하고, 이미 매칭된 항목은 제외. 중복 매칭 발생 시 "미매칭(?) 행"으로 처리하는 것보다 가장 높은 유사도 매칭을 선택.

---

## Code Examples

### 처방전 rxRows에서 비교용 아이템 추출
```javascript
// Source: rxNormalizer.js SECTION 9 (RxRow 구조), prescriptionModel.js calcRequiredQty
function extractRxItems(prescriptionJSON) {
  const totalArea = prescriptionJSON.farmInfo?.totalArea || null;
  const rows = prescriptionJSON.rxRows || [];
  return rows
    .filter(r => r.productName && (r.dosageQty > 0 || r.baseQty > 0))
    .map(r => ({
      name:    r.productName,
      rawName: r.productRaw || r.originalText || '',
      qty:     calcRequiredQty(totalArea, r.baseArea, r.dosageQty),
      baseQty: r.dosageQty,    // 원처방 수량 (표시용)
      baseArea: r.baseArea,
    }));
}
```

### 카트 공급가 합계 ÷ 면적 (D-13 평당가 계산)
```javascript
// Source: index.html §932 (cart 구조: .sp, .qty)
function calcCartPricePerPyeong(cart, area) {
  if (!area || area <= 0) return null;
  const total = cart.reduce((sum, item) => sum + (item.sp || 0) * (item.qty || 0), 0);
  return Math.round(total / area);
}
```

### diff 테이블 컬럼 구성 (Claude's Discretion 활용)

추천 컬럼:

| 컬럼 | 내용 |
|------|------|
| 상태 | ✓ / △ / ✗ / ? 아이콘 |
| 품목명 (처방전) | `rxRow.productRaw` 또는 `productName` |
| 처방 수량 | `finalQty` (면적 보정 후) |
| 카트 품목명 | `cartItem.name` |
| 카트 수량 | `cartItem.qty` |
| 차이 | `finalQty - cartItem.qty` (0이면 빈 칸) |
| 비고 | 금액 차이(가능 시), 미매칭 원문 |

### 일치 행 기본 숨김 (Claude's Discretion)
```javascript
// 기본값: 일치 행 숨김 (diff 집중)
let showMatched = false;
function toggleMatchedRows() {
  showMatched = !showMatched;
  document.querySelectorAll('.rxcmp-row-match').forEach(el => {
    el.style.display = showMatched ? '' : 'none';
  });
}
// 테이블 상단에 "일치 항목 표시/숨기기" 토글 버튼
```

---

## Integration Points (검증된 코드 위치)

| 통합 지점 | 파일 | 위치 | 비고 |
|-----------|------|------|------|
| 툴바 버튼 추가 | `index.html` | §685-711 (`<div class="actions">`) | `act-row` div 안에 추가 |
| 새 file input 추가 | `index.html` | §686-687 (`pdfFileInput` 근처) | hidden input 추가 |
| `<script>` 태그 추가 | `index.html` | 기존 `<script src="...">` 아래 | `rxCompareUI.js` 로드 |
| `parsePdfToJSON()` 호출 | `main.js` | 전역 함수, `index.html`에서 접근 가능 | `await parsePdfToJSON(file)` |
| `calcRequiredQty()` 호출 | `prescriptionModel.js` | 전역 함수 | `calcRequiredQty(totalArea, baseArea, dosageQty)` |
| `showToast()` 호출 | `index.html` | 전역 함수 | 로딩/오류 피드백 |
| `cart` 읽기 | `index.html` | `let cart=[]` §932 | 읽기 전용 참조 |

---

## Runtime State Inventory

> 이 phase는 순수 신규 기능 추가(새 파일 + 버튼 추가)로 rename/refactor가 아님.

없음 — 기존 데이터 마이그레이션 불필요. `cart`는 런타임 메모리 상태이고 비교 시 읽기 전용.

---

## Environment Availability

Step 2.6: SKIPPED — 이 phase는 기존 pdf.js + Vision API를 재사용하는 코드 추가 작업. 신규 외부 의존성 없음.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js + vm.runInContext (기존 테스트 패턴) |
| Config file | 없음 — `node [파일명].test.js` 직접 실행 |
| Quick run command | `node rxCompareUI.test.js` |
| Full suite command | `node rxNormalizer.v14.test.js && node rxCompareUI.test.js` |

### Phase Requirements → Test Map

| 요구사항 | 동작 | 테스트 유형 | 자동화 명령 | 파일 존재? |
|---------|------|-----------|-----------|----------|
| D-07 퍼지 매칭 | 소문자+특수문자 제거 후 contains | unit | `node rxCompareUI.test.js` | ❌ Wave 0 |
| D-06 diff 분류 | 4가지 row type (match/qty-diff/rx-only/cart-only) | unit | `node rxCompareUI.test.js` | ❌ Wave 0 |
| D-11 수량 허용 오차 0 | qty 1개 차이도 차이 행 | unit | `node rxCompareUI.test.js` | ❌ Wave 0 |
| D-13 평당가 요약 | cart sp×qty 합계 ÷ area 계산 | unit | `node rxCompareUI.test.js` | ❌ Wave 0 |
| D-03 카트 불변 | 비교 후 cart 변경 없음 | manual | 수동 확인 (DOM 의존) | — |

### Wave 0 Gaps

- [ ] `rxCompareUI.test.js` — 퍼지 매칭, diff 분류, 평당가 계산 unit tests

---

## Open Questions

1. **`##RX##` 임베드 처방전의 비교 지원 여부**
   - What we know: `##RX##` 처방전은 `onPdfSelected()`에서 `parsePdfToJSON()` 전에 처리됨. `applyRxPdfEmbed(d)` 는 다른 JSON 구조(`d.st[]` — 단계별 배열) 반환.
   - What's unclear: Phase 6에서 `##RX##` 처방전도 비교 모달에서 지원해야 하는지, 스캔 처방전(Vision API 경로)만 지원하는지.
   - Recommendation: 범위를 "스캔 처방전(Vision API 경로)만"으로 명시하고, `##RX##` 처방전은 "지원되지 않는 형식" 토스트로 처리. 필요 시 나중에 확장.

2. **금액 비교 데이터 가용성 (D-12)**
   - What we know: `costData`에는 `totalCost`(합계)와 `unitPricePerPyeong`(평당가)만 있음. 항목별 단가는 `rxRows`에 없음.
   - What's unclear: 처방전 PDF에서 항목별 단가가 파싱되는 경우가 실제로 존재하는지.
   - Recommendation: 항목별 금액 비교는 현실적으로 "건너뜀"으로 처리하고, 평당가 요약(D-13)에 집중. D-12의 "항목별 단가 역산"은 카트의 `sp`와 처방전의 `costData.totalCost / rxItems.length` 로 근사하거나 skip.

---

## Sources

### Primary (HIGH confidence)
- `index.html` §686-711 — 툴바 actions 영역 직접 확인
- `index.html` §2469-2530 — `onPdfSelected()` PDF 분기 로직 직접 확인
- `index.html` §3190-3239 — `_openOldInvConfirmModal()` 모달 패턴 직접 확인
- `main.js` §1-100 — `handlePrescriptionUpload()`, `parsePdfToJSON()` 흐름 직접 확인
- `pdfParser.js` §1-80 — PDF 파싱 파이프라인 직접 확인
- `rxNormalizer.js` §1005-1062 — `RxRow` 객체 필드 직접 확인
- `prescriptionModel.js` §56-60 — `calcRequiredQty()` 직접 확인
- `uiController.js` §313, §395 — `finalQty` 계산 경로 직접 확인

### Secondary (MEDIUM confidence)
- `rxNormalizer.v14.test.js` — Node.js `vm.createContext` 기반 테스트 패턴 확인 (기존 테스트 인프라)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 프로젝트 전체 코드베이스 직접 검사, 바닐라 JS + 빌드 없음 확인
- Architecture: HIGH — `_openOldInvConfirmModal`, IIFE 패턴, `parsePdfToJSON` 재사용 경로 모두 소스에서 검증
- Pitfalls: HIGH — `handlePrescriptionUpload()` 호출 금지, 별도 file input 분리, `##RX##` 처리 경로 모두 소스 코드에서 직접 확인

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (코드베이스 안정적, 30일 유효)
