# Architecture Patterns

**Domain:** 비료 처방전 관리 웹앱 — 바닐라 JS SPA 확장
**Researched:** 2026-03-24
**Confidence:** HIGH (코드 직접 분석 기반)

---

## Current State (As-Is)

### 파일 구조

```
index.html          — 메인 UI (거래명세표, 입력 폼, 인쇄)
처방전.html          — 처방전 출력 UI
main.js             — 플로우 오케스트레이터 (PDF 업로드 진입점)
prescriptionModel.js — 데이터 팩토리 & 수량 계산 유틸리티
productDB.js        — 제품 DB (PRODUCT_DB 상수 배열)
productMapper.js    — 제품명 매핑 로직
pdfParser.js        — PDF 좌표 기반 텍스트 파서 (pdf.js 사용)
pdfPromptTemplate.js — Vision API 프롬프트 템플릿
uiController.js     — 검증 모달 UI & 장바구니 적용 로직
rxNormalizer.js     — 처방 행 정규화
```

### 데이터 흐름

```
[PDF 업로드]
  → pdfParser.parsePdfToJSON()
      → pdf.js 좌표 기반 파서 (1순위: 텍스트 레이어 있는 PDF)
      → Vision API + pdfPromptTemplate (2순위: 스캔 이미지 PDF)
  → prescriptionJSON { farmInfo, prescriptions, costData, rxRows }
  → main.js → DOM 폼에 직접 값 주입
  → uiController.openValidationModal() → 사용자 검토 → _applyToCart()
  → index.html의 거래명세표 렌더 함수 호출
```

### 현재 아키텍처 특징

- 전역 함수 기반 (모듈 시스템 없음)
- 상태: DOM 폼 값이 source of truth (localStorage 미사용)
- `<script src="xxx.js">` 순서 의존으로 모든 파일이 전역 스코프 공유
- 빌드 도구 없음, 브라우저에서 직접 실행

---

## 추가해야 할 데이터 레이어

### 대상 데이터

1. **고객 DB** — 농가명, 작물, 면적, 할인율, 연락처
2. **처방 이력** — 고객별 과거 처방전 목록 (재발행·템플릿 기반)
3. **거래/매출** — 발행된 거래명세표, 금액, 미수금

### 저장소 선택: localStorage

빌드 도구 없음 + 단독 실행 요건 → localStorage 사용. 서버 DB 전환 시 스토리지 어댑터 패턴으로 교체 가능하도록 분리.

---

## Recommended Architecture

### 설계 원칙: 전역 스코프 오염 최소화하는 네임스페이스 모듈

빌드 도구 없이 단일 전역 객체(`window.DB`)에 스토리지 레이어를 격리한다. 기존 코드를 건드리지 않고 새 파일 `customerDB.js`만 추가하면 된다.

```
[기존 파일들 — 변경 없음]
index.html
main.js
prescriptionModel.js
productDB.js
productMapper.js
pdfParser.js
pdfPromptTemplate.js
uiController.js
rxNormalizer.js

[신규 파일들]
customerDB.js       — 고객/처방이력/거래 CRUD (localStorage 어댑터)
salesDB.js          — 거래명세표 저장 & 매출 집계 (customerDB.js 의존)
customerUI.js       — 고객 검색/선택 모달 UI
salesUI.js          — 거래이력 조회 UI
```

### 컴포넌트 경계

| 컴포넌트 | 책임 | 기존 코드와의 관계 |
|----------|------|-------------------|
| `customerDB.js` | localStorage 읽기/쓰기, 스키마 버전 관리 | 기존 코드에서 단방향으로 호출됨 |
| `salesDB.js` | 거래명세표 저장, 미수금 추적, 매출 집계 | customerDB.js 참조 |
| `customerUI.js` | 고객 검색 모달, 기존 처방 불러오기 | index.html에 모달 삽입, main.js에 훅 추가 |
| `salesUI.js` | 이력 조회, 미수금 표시 | 별도 탭/페이지 |

### 기존 코드 수정 범위 (최소화)

`main.js`에 두 개의 훅만 추가:

```javascript
// 1. PDF 파싱 완료 후 — 고객 자동 매칭
async function handlePrescriptionUpload(pdfFile) {
  // ... 기존 코드 ...
  const fi = prescriptionJSON.farmInfo || {};
  // [신규] 고객 DB에서 농가명으로 검색
  if (fi.farmName && window.CustomerDB) {
    const match = window.CustomerDB.findByName(fi.farmName);
    if (match) applyCustomerDefaults(match); // 할인율 자동 적용
  }
  // ... 기존 코드 이어짐 ...
}

// 2. 거래명세표 발행 시 — 이력 저장
function issueInvoice() {
  // ... 기존 발행 로직 ...
  if (window.SalesDB) {
    window.SalesDB.saveTransaction(buildTransactionData());
  }
}
```

`index.html`에 스크립트 태그 4개 추가 (기존 태그들 뒤에):

```html
<script src="customerDB.js"></script>
<script src="salesDB.js"></script>
<script src="customerUI.js"></script>
<script src="salesUI.js"></script>
```

---

## localStorage 스키마 (Concrete)

### 키 구조

```
fertilizer_customers    — 고객 배열
fertilizer_prescriptions — 처방 이력 배열
fertilizer_transactions  — 거래명세표 배열
fertilizer_schema_version — "1"
```

### 스키마: 고객 (fertilizer_customers)

```json
[
  {
    "id": "c_1711234567890",
    "name": "홍길동",
    "crop": "천혜향",
    "area": 550,
    "discountRate": 0.15,
    "phone": "010-1234-5678",
    "memo": "",
    "createdAt": "2026-03-24T10:00:00.000Z",
    "updatedAt": "2026-03-24T10:00:00.000Z"
  }
]
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | `"c_" + Date.now()` |
| `name` | string | 농가명 (PDF farmName과 매칭용) |
| `crop` | string | 주요 작물 |
| `area` | number | 기본 평수 |
| `discountRate` | number | 공급가 할인율 (0.0 ~ 1.0, 예: 0.15 = 15% 할인) |
| `phone` | string | 연락처 |
| `memo` | string | 비고 |

### 스키마: 처방 이력 (fertilizer_prescriptions)

```json
[
  {
    "id": "rx_1711234567890",
    "customerId": "c_1711234567890",
    "date": "2026-03-24",
    "farmInfo": {
      "farmName": "홍길동",
      "cropName": "천혜향",
      "totalArea": 550
    },
    "prescriptions": [
      {
        "stageType": "관주",
        "stageLabel": "관주 1번\n3월-4월",
        "items": [
          {
            "originalName": "옥스팜(입상)",
            "mappedId": "oksfarm_granule",
            "baseArea": 550,
            "baseQty": 10,
            "unit": "포"
          }
        ]
      }
    ],
    "costData": {
      "totalCost": 850000,
      "unitPricePerPyeong": 1545
    },
    "sourceFile": "천혜향_550평_2026.pdf",
    "tags": ["천혜향", "550평"],
    "createdAt": "2026-03-24T10:00:00.000Z"
  }
]
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | `"rx_" + Date.now()` |
| `customerId` | string | customers 참조 (null 허용 — 미등록 농가) |
| `date` | string | YYYY-MM-DD |
| `farmInfo` | object | prescriptionJSON.farmInfo 그대로 |
| `prescriptions` | array | prescriptionJSON.prescriptions 그대로 |
| `costData` | object | prescriptionJSON.costData 그대로 |
| `sourceFile` | string | 원본 PDF 파일명 |
| `tags` | string[] | 검색용 태그 |

### 스키마: 거래명세표 (fertilizer_transactions)

```json
[
  {
    "id": "tx_1711234567890",
    "customerId": "c_1711234567890",
    "prescriptionId": "rx_1711234567890",
    "date": "2026-03-24",
    "items": [
      {
        "productId": "oksfarm_granule",
        "productName": "옥스팜(입상) 20kg",
        "qty": 10,
        "unit": "포",
        "retailPrice": 45000,
        "supplyPrice": 38250,
        "subtotal": 382500
      }
    ],
    "totalRetail": 450000,
    "totalSupply": 382500,
    "discountRate": 0.15,
    "unitPricePerPyeong": 1545,
    "totalArea": 550,
    "paidAmount": 0,
    "unpaidAmount": 382500,
    "status": "unpaid",
    "memo": "",
    "createdAt": "2026-03-24T10:00:00.000Z"
  }
]
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `status` | string | `"unpaid"` / `"partial"` / `"paid"` |
| `unpaidAmount` | number | `totalSupply - paidAmount` |
| `discountRate` | number | 발행 당시 적용 할인율 (히스토리 보존) |

### customerDB.js API 설계

```javascript
// window.CustomerDB 네임스페이스로 노출
window.CustomerDB = {
  // 고객 CRUD
  list()           → Customer[]
  findById(id)     → Customer | null
  findByName(name) → Customer | null  // 부분 매칭 허용
  save(customer)   → Customer          // create or update (id 유무로 판별)
  delete(id)       → void

  // 처방 이력
  listPrescriptions(customerId) → Prescription[]
  savePrescription(rx)          → Prescription
  findSimilarPrescriptions(crop, area) → Prescription[]  // 템플릿 검색

  // 내부
  _migrate()       → void  // 스키마 버전 업그레이드
  _getKey(entity)  → string  // "fertilizer_customers" 등
};
```

### 스키마 버전 마이그레이션 전략

```javascript
const SCHEMA_VERSION = 1;

function _migrate() {
  const stored = parseInt(localStorage.getItem('fertilizer_schema_version') || '0');
  if (stored === SCHEMA_VERSION) return;
  // v0 → v1: 기존 데이터 없음, 초기화만
  if (stored < 1) {
    localStorage.setItem('fertilizer_customers',     JSON.stringify([]));
    localStorage.setItem('fertilizer_prescriptions', JSON.stringify([]));
    localStorage.setItem('fertilizer_transactions',  JSON.stringify([]));
    localStorage.setItem('fertilizer_schema_version', String(SCHEMA_VERSION));
  }
}
```

이후 v2로 올릴 때는 `if (stored < 2)` 블록 추가 — 기존 데이터 변환 로직 삽입.

---

## 평당가 (unitPricePerPyeong) 버그 분석 및 해결책

### 버그 정확한 위치

`pdfParser.js`의 `extractCostPageData()` 함수 (lines 75-144).

**코드 (현재 버그 있음):**
```javascript
if (PYEONG_RE.test(text)) {
  const nums = parseNums(text, 100, 10_000_000);
  if (nums.length) unitPricePerPyeong = nums[nums.length - 1];  // ← 마지막으로 만나는 값으로 덮어씀
}
```

**문제:** `for (const row of rows)` 루프가 비용 페이지의 행을 위에서 아래로 순회한다. 천혜향 같은 복합형 처방전은 비용 요약 페이지에 여러 행에 걸쳐 평당가가 나타난다:

```
기비용   소매가 150,000  공급가 127,500  평당 231원
관주 1번  소매가 320,000  공급가 272,000  평당 495원
관주 2번  소매가 180,000  공급가 153,000  평당 278원
...
합계     소매가 850,000  공급가 722,500  평당 1,313원
```

현재 코드는 "평당"이 포함된 행을 만날 때마다 `unitPricePerPyeong`을 덮어쓴다. 마지막 행이 합계 행이면 우연히 맞을 수 있지만, 행 순서나 레이아웃에 따라 중간 값이 마지막이 될 수 있다.

### 해결책: 합계 행 우선 전략

**수정 방향:** "평당"이 포함된 행 중에서 합계/총액 행을 최우선으로 사용하고, 없으면 마지막 행을 fallback으로 사용한다.

```javascript
function extractCostPageData(rows) {
  const PYEONG_RE = /평\s*당|단\s*가/;
  const TOTAL_RE  = /합\s*계|총\s*액|총\s*계|총\s*금\s*액/;

  let totalCost          = null;
  let unitPricePerPyeong = null;
  let pyeongFromTotal    = null;  // 합계 행에서 추출한 평당가 (우선순위 최고)
  let pyeongLastSeen     = null;  // 평당 포함 행 중 마지막 값 (fallback)
  let supplySum          = 0;

  const parseNums = (text, min, max) =>
    (text.match(/[\d,]+/g) || [])
      .map(n => parseInt(n.replace(/,/g, ''), 10))
      .filter(n => n >= min && n <= max);

  for (const row of rows) {
    const text = joinRowText(row.items);

    // 평당 행 처리 — 합계 행과 일반 행 분리
    if (PYEONG_RE.test(text)) {
      const nums = parseNums(text, 100, 10_000_000);
      if (nums.length) {
        const val = nums[nums.length - 1];
        pyeongLastSeen = val;  // 항상 마지막 값 기록
        if (TOTAL_RE.test(text)) {
          pyeongFromTotal = val;  // 합계 행이면 별도 보존
        }
      }
    }

    // 합계/총액 행 → totalCost (기존 로직 유지)
    if (TOTAL_RE.test(text)) {
      const nums = parseNums(text, 10_000, 999_999_999);
      if (nums.length) {
        const mx = Math.max(...nums);
        if (!totalCost || mx > totalCost) totalCost = mx;
      }
    }

    // 공급가 행 (기존 로직 유지)
    if (/공\s*급\s*가/.test(text)) {
      const nums = parseNums(text, 100, 10_000_000);
      if (nums.length) supplySum += nums[nums.length - 1];
    }
  }

  // 평당가 최종 결정: 합계 행 > 마지막 평당 행
  unitPricePerPyeong = pyeongFromTotal || pyeongLastSeen;

  // ... totalCost 기존 fallback 로직 유지 ...

  return { totalCost, unitPricePerPyeong };
}
```

**핵심 변경:** `pyeongFromTotal`(합계 행의 평당가)과 `pyeongLastSeen`(마지막으로 본 평당가)을 분리 추적하여 합계 행이 있으면 그 값을 우선 사용한다.

### Vision API 경로의 평당가

`pdfPromptTemplate.js`의 현재 프롬프트는 처방 품목(prescriptions)만 추출하며 평당가를 스키마에 포함하지 않는다. Vision API 경로를 탈 때 `costData`는 null이 되므로 `main.js`가 `totalCost / totalArea` 역산을 시도한다.

Vision API가 비용 요약 페이지도 받는다면, 프롬프트에 `costData` 필드 추가가 가능하다. 그러나 현재 구조에서는 pdf.js 좌표 파서가 비용 페이지를 처리하므로, Vision API 경로는 이 버그와 무관하다.

---

## 파일 구조 분리 전략 (Migration Path)

### Phase 1: 신규 파일 추가만 (기존 코드 변경 없음)

```
[추가]
customerDB.js    — CustomerDB 네임스페이스
salesDB.js       — SalesDB 네임스페이스

[index.html 수정 — script 태그 2개 추가]
<script src="customerDB.js"></script>
<script src="salesDB.js"></script>
```

### Phase 2: main.js에 훅 추가 (최소 수정)

```javascript
// handlePrescriptionUpload() 안에 추가 (3줄)
const match = window.CustomerDB?.findByName(fi.farmName);
if (match) {
  document.getElementById('discountRate').value = match.discountRate;
}

// 처방전 파싱 완료 후 자동 저장 (3줄)
window.CustomerDB?.savePrescription({
  ...prescriptionJSON, customerId: match?.id || null
});
```

### Phase 3: UI 파일 추가

```
[추가]
customerUI.js    — 고객 선택 모달 (index.html에 삽입)
salesUI.js       — 거래이력 뷰 (별도 섹션 또는 탭)
```

### Phase 4: 평당가 버그 수정

`pdfParser.js`의 `extractCostPageData()` 함수만 수정 (위 해결책 적용). 나머지 파일 변경 없음.

---

## 아키텍처 패턴: 스토리지 어댑터

나중에 서버 DB로 이전할 때를 대비한 인터페이스 격리:

```javascript
// customerDB.js 내부 구조
const _storage = {
  get(key)        { return JSON.parse(localStorage.getItem(key) || '[]'); },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

// 나중에 서버 API로 교체 시:
// const _storage = {
//   get(key)        { return await fetch(`/api/${key}`).then(r => r.json()); },
//   set(key, value) { return fetch(`/api/${key}`, { method: 'PUT', body: JSON.stringify(value) }); }
// };
```

현재는 동기 localStorage, 이후 비동기 fetch로 교체해도 DB 레이어 내부만 바꾸면 된다.

---

## Component Boundaries

| 컴포넌트 | 책임 | 의존 | 노출 |
|----------|------|------|------|
| `prescriptionModel.js` | 처방전 JSON 스키마, 수량 계산 | 없음 | `createPrescription`, `calcRequiredQty` |
| `pdfParser.js` | PDF → JSON 파싱 | `prescriptionModel`, `productMapper`, `rxNormalizer`, pdf.js | `parsePdfToJSON` |
| `pdfPromptTemplate.js` | Vision API 프롬프트 | 없음 | `PDF_SYSTEM_PROMPT`, `buildPdfUserPrompt` |
| `productDB.js` | 제품 마스터 데이터 | 없음 | `PRODUCT_DB` |
| `productMapper.js` | 제품명 → DB 매핑 | `productDB` | `findProduct` |
| `rxNormalizer.js` | 처방 행 정규화 | 없음 | `normalizeStageLabel`, `STAGE_ALIASES` |
| `uiController.js` | 검증 모달 | `productDB`, `productMapper`, `prescriptionModel`, `rxNormalizer` | `openValidationModal` |
| `main.js` | 플로우 오케스트레이터 | 모두 | `handlePrescriptionUpload` |
| `customerDB.js` [신규] | 고객/처방/거래 CRUD | `window.localStorage` | `window.CustomerDB` |
| `salesDB.js` [신규] | 매출 집계 | `customerDB` | `window.SalesDB` |

---

## Scalability Considerations

이 앱은 사용자 1-2명, 데이터량 수백 건 규모. localStorage 5-10MB 한도 안에서 충분히 운영 가능.

| 데이터 | 건당 크기 | 100건 | 1000건 |
|--------|----------|-------|--------|
| 고객 | ~300 bytes | 30KB | 300KB |
| 처방 이력 | ~2KB | 200KB | 2MB |
| 거래명세표 | ~1KB | 100KB | 1MB |

1년 운영 기준 총 처방 수백 건 → 약 1MB 이내. localStorage 안전.

데이터가 10,000건 이상 축적되면 IndexedDB로 전환 권장 (어댑터 패턴으로 이관 비용 최소).

---

## Anti-Patterns to Avoid

### DOM을 데이터베이스로 사용하기
**현재 상태:** index.html 폼 값이 source of truth.
**문제:** 처방 이력 저장 시 DOM에서 값을 긁어오면 레이아웃 변경에 깨지기 쉽고 테스트 불가능.
**대신:** `buildTransactionData()` 같은 순수 함수를 만들어 DOM 읽기를 한 곳에 격리.

### 전역 상태 중복
**문제:** `window.CustomerDB`, `window.SalesDB`가 각자 localStorage를 직접 읽으면 캐시 불일치.
**대신:** `CustomerDB`를 단일 스토리지 게이트웨이로 사용, `SalesDB`는 `CustomerDB`를 통해서만 접근.

### 기존 파일 전면 재작성
**문제:** pdfParser.js (600+ 줄)을 리팩터링하면 기존 테스트 케이스가 없어 회귀 위험 큼.
**대신:** 핀포인트 수정(extractCostPageData만 변경), 나머지는 신규 파일로 추가.

---

## Sources

- 코드 직접 분석: `/pdfParser.js` (lines 75-144, 462-515)
- 코드 직접 분석: `/main.js` (lines 47-77 — 평당가 역산 로직)
- 코드 직접 분석: `/pdfPromptTemplate.js` (프롬프트 스키마)
- 코드 직접 분석: `/prescriptionModel.js` (데이터 팩토리)
- 프로젝트 문서: `/.planning/PROJECT.md`
- [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) — 동기 API, 5-10MB 한도
