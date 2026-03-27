# Phase 9: 평당가 페이지 + 이미지 첨부 - Research

**Researched:** 2026-03-27
**Domain:** 바닐라 JS — 거래명세표 추가 페이지 주입(평당가), 이미지 업로드/저장/인쇄
**Confidence:** HIGH (코드 직접 분석, 외부 라이브러리 무관)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRICE-01 | 처방전 불러오기 시 평당가 데이터가 있으면 거래명세표에 평당가 페이지 자동 추가 | `prescriptionJSON.costData.unitPricePerPyeong`은 이미 존재. `syncPrint()`의 `.p-wrap` 생성 로직에 추가 페이지만 주입하면 됨 |
| ATTACH-01 | jpg/png 이미지 업로드 → 거래명세표에 포함 (인쇄 시 출력) | `doPdf()`는 `.p-wrap`별 html2canvas 캡처. 이미지 페이지도 `.p-wrap`으로 추가하면 자동 포함 |
| ATTACH-02 | 업로드한 이미지 저장·관리 (저장해두고 재사용) | `IndexedDB('NTBioInvoices', v1)` 이미 존재. 이미지는 base64로 별도 store에 저장 권장 |
</phase_requirements>

---

## Summary

Phase 9는 두 독립 기능으로 나뉜다.

**PRICE-01 (평당가 페이지):** `prescriptionJSON.costData.unitPricePerPyeong`은 pdfParser.js가 이미 추출하고, main.js가 이를 처리한다. 단, index.html에 `#unitPrice` / `#pricePerPyeong` ID를 가진 입력창이 **현재 없다** — uiController.js와 main.js가 이 ID들을 찾으려 하지만 DOM에 존재하지 않는다. 평당가 데이터는 uiController.js의 `_recalcVldUnitPrice()`가 검증 모달에서 계산하며, 적용 시 `_applyToCart()`를 통해 cart에 들어간다. 따라서 PRICE-01 구현은: (1) 평당가를 저장할 변수(`window._lastUnitPrice` 또는 전역 변수)를 관리하고, (2) `syncPrint()`에서 이 값이 있을 때 마지막 `.p-wrap`으로 평당가 요약 페이지를 주입하는 것으로 완성된다.

**ATTACH-01/02 (이미지 첨부):** IndexedDB(`NTBioInvoices`)가 이미 존재하며 거래이력을 저장 중이다. 이미지는 `data:image/...;base64,...` 형태로 별도 IndexedDB object store(`attachImages`)에 저장하는 것이 최적이다 — localStorage는 5-10MB 제한으로 이미지 저장 불가. `doPdf()`는 `printDoc` 안의 `.p-wrap`을 순서대로 캡처하므로, 이미지 페이지도 `.p-wrap`으로 추가하면 인쇄/PDF 모두 자동 포함된다. 이미지 저장·관리 UI는 기존 actions 도구 모음(`.actions` div)에 버튼을 추가하는 것이 일관성을 유지한다.

**Primary recommendation:** 평당가는 전역 변수 하나 + `syncPrint()` 확장으로 구현. 이미지는 IndexedDB 새 store + `.p-wrap` 주입 패턴으로 구현. 두 기능 모두 기존 인쇄/PDF 플로우를 건드리지 않고 `.p-wrap` 추가만으로 작동한다.

---

## Standard Stack

### Core
| 파일 | 역할 | 수정 범위 |
|------|------|----------|
| `index.html` | 거래명세표 UI + `syncPrint()` + `doPdf()` + IndexedDB | 평당가 페이지 주입 + 이미지 업로드 버튼 + 이미지 p-wrap |
| `main.js` | Vision AI 처방전 처리 후 costData 처리 | `unitPricePerPyeong` → 전역 변수 저장 경로 추가 |
| `uiController.js` | `_recalcVldUnitPrice()` → `_applyToCart()` | 적용 시 `unitPrice` 값을 전역에 기록하는 1줄 추가 |

### Supporting
| 파일 | 역할 | 관련성 |
|------|------|-------|
| `rxCompare.js` | `calcCartPricePerPyeong(cartItems, area)` | 평당가 직접 계산 재사용 가능 (area × cart 합계) |
| `rxCompareUI.js` | `rxPpyeong` 표시 | 참조용 — 이 페이즈에서 수정 불필요 |

### Don't Hand-Roll
| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 이미지 대용량 저장 | localStorage 직렬화 | IndexedDB (`attachImages` store) | localStorage는 5-10MB 제한, 이미지 1장이 수 MB일 수 있음 |
| PDF 이미지 페이지 | jsPDF에 이미지 직접 삽입 | 기존 `.p-wrap` + html2canvas 캡처 패턴 유지 | `doPdf()`는 이미 `.p-wrap` 반복 캡처 — 패턴 일관성 유지 |
| 평당가 계산 | 새로 구현 | `RxCompare.calcCartPricePerPyeong(cart, area)` 또는 `_recalcVldUnitPrice()` 결과값 | 이미 완성된 검증 로직이 있음 |

---

## Architecture Patterns

### 현재 인쇄 문서 구조

```
#printDoc (div.print-doc)
  └── div.p-wrap              ← 거래명세표 페이지 1
  └── div.p-wrap.p-page-break ← 거래명세표 페이지 2 (14개 초과 시)
  ...
```

CSS: `.p-wrap { page-break-after: always }`, `.p-wrap:last-child { page-break-after: auto }`
PDF: `doPdf()`가 `clone.querySelectorAll('.p-wrap')`을 순회하며 각각 `html2canvas` → `pdf.addPage()`

`syncPrint()` 함수가 `document.getElementById('printDoc').innerHTML = pages.map(...).join('')`으로 전체를 재생성한다. 따라서 추가 페이지 삽입은 이 함수의 끝에서 `.innerHTML`에 append하면 된다.

### Pattern 1: 평당가 페이지 주입 (PRICE-01)

**What:** `syncPrint()` 실행 후 조건부로 평당가 `.p-wrap`을 `printDoc`에 추가
**When to use:** `window._invoiceUnitPrice > 0` 일 때만

```javascript
// syncPrint() 끝, innerHTML 설정 직후에 추가
// 전역: let _invoiceUnitPrice = 0;  (index.html 최상단)

function _appendPricePageIfNeeded() {
  const unitPrice = window._invoiceUnitPrice || 0;
  if (!unitPrice) return;
  const area = parseFloat(document.getElementById('cArea').value) || 0;
  const supply = cart.filter(c => !c.gift).reduce((s, c) => s + c.sp * c.qty, 0);
  const name = document.getElementById('cName').value.trim() || '고객명';
  const crop = document.getElementById('cCrop').value || '';

  const html = `<div class="p-wrap p-page-break p-price-page">
    <div class="p-title">평당가 안내</div>
    <div style="padding:20px;font-size:14px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:10px;font-weight:700;border:1px solid #ccc;">고객명</td>
            <td style="padding:10px;border:1px solid #ccc;">${name} / ${crop}</td></tr>
        <tr><td style="padding:10px;font-weight:700;border:1px solid #ccc;">농사 면적</td>
            <td style="padding:10px;border:1px solid #ccc;">${area}평</td></tr>
        <tr><td style="padding:10px;font-weight:700;border:1px solid #ccc;">공급가 합계</td>
            <td style="padding:10px;border:1px solid #ccc;">${supply.toLocaleString()}원</td></tr>
        <tr style="background:#E0F5F5;">
            <td style="padding:12px;font-weight:900;font-size:16px;border:3px solid #35a09e;">평당가</td>
            <td style="padding:12px;font-weight:900;font-size:18px;color:#35a09e;border:3px solid #35a09e;">${unitPrice.toLocaleString()}원/평</td></tr>
      </table>
    </div>
  </div>`;
  document.getElementById('printDoc').insertAdjacentHTML('beforeend', html);
}
```

### Pattern 2: 평당가 값 전달 경로

**두 가지 진입 경로:**

**경로 A — Vision AI 처방전 업로드 (main.js)**
```
handlePrescriptionUpload(file)
  → prescriptionJSON.costData.unitPricePerPyeong  (pdfParser 추출값)
  → main.js 51-81행: unitPrice 계산
  → 현재: UNIT_PRICE_IDS DOM 요소 탐색 → 못 찾음 (요소 없음)
  → 수정: window._invoiceUnitPrice = unitPrice;  // 추가
  → syncPrint() 호출 시 평당가 페이지 자동 추가
```

**경로 B — 검증 모달 완료 (uiController.js)**
```
_applyToCart()
  → 현재: cart 업데이트 + syncPrint()
  → 수정: window._invoiceUnitPrice = 계산된 unitPrice;  // _recalcVldUnitPrice 결과
  → syncPrint()가 평당가 페이지 주입
```

`_invoiceUnitPrice`는 `clearAll()` 시 0으로 초기화.

### Pattern 3: 이미지 저장 (ATTACH-02 — IndexedDB)

**기존 IndexedDB 구조:**
```javascript
const IDB_NAME = 'NTBioInvoices';
const IDB_VER  = 1;  // v2로 업그레이드하여 attachImages store 추가
```

**버전 업그레이드 패턴 (기존 코드 참조):**
```javascript
const IDB_VER = 2;  // 1 → 2

req.onupgradeneeded = (e) => {
  const db = e.target.result;
  // 기존 store: 'invoices' (oldVersion=1일 때 이미 생성됨)
  if (e.oldVersion < 2) {
    // 이미지 첨부 store 추가
    db.createObjectStore('attachImages', { keyPath: 'id' });
  }
};
```

이미지 레코드 구조:
```javascript
{
  id: 'img_' + Date.now(),  // 고유 키
  name: '파일명.jpg',         // 원본 파일명
  dataUrl: 'data:image/jpeg;base64,...',  // base64 데이터 URL
  savedAt: new Date().toISOString(),
  memo: ''  // 선택적 메모
}
```

### Pattern 4: 이미지 업로드 UI 진입점

기존 `.actions` 도구 모음 (index.html line 685) 패턴에 맞춰:
```html
<!-- 기존 act-row 뒤에 추가 -->
<div class="act-row">
  <input type="file" id="imgFileInput" accept="image/jpeg,image/png" style="display:none"
    onchange="onImgSelected(this)" multiple>
  <button class="btn-all-unpaid" onclick="document.getElementById('imgFileInput').click()"
    style="background:#FFF3E0;color:#E65100;border-color:#E65100;">
    🖼 이미지 첨부
  </button>
  <button class="btn-all-unpaid" onclick="openImgManager()"
    style="background:#F3E5F5;color:#6A1B9A;border-color:#6A1B9A;">
    📁 첨부 관리
  </button>
</div>
```

### Pattern 5: 이미지 페이지 주입 (ATTACH-01)

`syncPrint()` 끝에서 저장된 이미지들을 `.p-wrap`으로 추가:
```javascript
function _appendImagePagesIfNeeded(attachedImages) {
  attachedImages.forEach((img, idx) => {
    const html = `<div class="p-wrap p-page-break p-img-page">
      <div class="p-title">첨부 이미지 ${idx + 1}</div>
      <div style="padding:10px;text-align:center;">
        <img src="${img.dataUrl}" style="max-width:100%;max-height:220mm;object-fit:contain;">
        ${img.memo ? `<div style="margin-top:8px;font-size:12px;">${img.memo}</div>` : ''}
      </div>
    </div>`;
    document.getElementById('printDoc').insertAdjacentHTML('beforeend', html);
  });
}
```

### Anti-Patterns to Avoid

- **syncPrint() 내부에서 비동기 IndexedDB 호출:** `syncPrint()`는 동기 함수다. IndexedDB 읽기는 비동기이므로, 이미지 목록을 메모리에 미리 캐시(`let _attachedImages = []`)한 후 `syncPrint()`는 캐시를 사용해야 한다.
- **이미지를 localStorage에 저장:** 5-10MB 한계. 1개의 고해상도 사진만으로도 초과 가능.
- **doPdf() 수정:** `doPdf()`는 `printDoc` 안의 모든 `.p-wrap`을 자동으로 처리한다. 별도 수정 불필요.
- **`syncPrint()` 완전 재작성:** `syncPrint()`는 현재 `innerHTML = ...`로 전체를 교체한다. 평당가/이미지 페이지는 항상 이 교체 이후에 `insertAdjacentHTML('beforeend', ...)`로 추가해야 한다. 순서를 잘못 잡으면 덮어씌워진다.

---

## Key Findings: 평당가 데이터 흐름 (PRICE-01 상세)

### 데이터 소스

1. **pdfParser.js `extractCostPageData()`:** PDF 비용 페이지에서 `{ totalCost, unitPricePerPyeong }` 추출. 합계 행 우선(`pyeongFromTotal`), fallback은 마지막으로 본 값(`pyeongLastSeen`).

2. **rxNormalizer.js `normalizeCostData()`:** 추출값이 없으면 `totalCost / farmInfo.totalArea`로 자동 계산.

3. **parsePdfToJSON() 반환값 구조:**
   ```javascript
   {
     farmInfo: { farmName, cropName, totalArea },
     costData: { totalCost, unitPricePerPyeong },  // null 가능
     rxRows: [...],
     prescriptions: [...]
   }
   ```

4. **처방전.html `rxData.extractedUnitPrice`:** 처방전.html은 자체 pdfParser 복사본을 통해 `extractedUnitPrice`를 `rxData`에 저장하고 localStorage를 통해 index.html로 전달 — 그러나 현재 index.html은 이 값을 처리하지 않는다.

5. **uiController.js `_recalcVldUnitPrice()`:** 검증 모달에서 cart × 평수로 실시간 계산한 최종 평당가. `_applyToCart()` 이후 가장 신뢰할 수 있는 값.

### 현재 index.html에 `unitPrice` DOM 요소가 없음 — 중요

main.js(62행)와 uiController.js(1174행)가 `['unitPrice','unit-price','pricePerPyeong','pyeongPrice']` ID를 탐색하지만, index.html에는 해당 ID를 가진 요소가 없다. 즉, 현재 평당가는 index.html 측에서 어디에도 저장되지 않는다. PRICE-01 구현은 전역 변수를 통한 값 보존이 필요하다.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 이미지 크기 제한 검사 | 커스텀 byte 계산 | `file.size > 5 * 1024 * 1024` 간단 체크 | 브라우저 File API |
| 이미지 base64 변환 | FileReader 복잡 구현 | `URL.createObjectURL` + canvas resize 또는 단순 `FileReader.readAsDataURL` | 표준 Web API |
| 이미지 페이지 레이아웃 | 새 CSS 체계 | `.p-wrap` CSS 재사용 (`page-break-after: always` 이미 설정됨) | 인쇄 동작 검증 완료 |

---

## Common Pitfalls

### Pitfall 1: syncPrint() 후 innerHTML 재교체
**What goes wrong:** `syncPrint()` 내부 `document.getElementById('printDoc').innerHTML = ...`이 평당가/이미지 페이지를 덮어씀
**Why it happens:** `syncPrint()`는 전체를 재생성. cart 변경마다 호출됨 (`oninput="syncPrint()"`)
**How to avoid:** `_appendPricePageIfNeeded()`와 `_appendImagePagesIfNeeded()`를 `syncPrint()` 함수 마지막에 직접 호출. 또는 `syncPrint()` 끝에 `_refreshExtraPages()` 단일 호출.
**Warning signs:** 인쇄 미리보기에서 평당가 페이지가 보였다가 사라지는 현상

### Pitfall 2: IndexedDB 비동기 + syncPrint() 동기 충돌
**What goes wrong:** `syncPrint()` 내에서 IndexedDB를 읽으면 이미지 로드 전에 렌더 완료
**Why it happens:** IndexedDB는 항상 비동기 (request 패턴)
**How to avoid:** 이미지 목록을 `let _attachedImages = []`로 캐시. IndexedDB에서 읽은 후 캐시 업데이트 + `syncPrint()` 재호출 패턴 사용
**Warning signs:** PDF에 이미지 페이지가 없거나 빈 페이지로 출력

### Pitfall 3: 이미지 용량이 IndexedDB 한도 초과
**What goes wrong:** 대용량 이미지(>50MB 누적)에서 IndexedDB `QuotaExceededError`
**Why it happens:** 브라우저별 IndexedDB 용량 한도 (Chrome: 디스크 여유공간의 ~60%, Safari: 1GB)
**How to avoid:** 업로드 시 `file.size > 5MB`이면 경고 또는 canvas를 이용한 리사이즈 후 저장. 실제 농업 현장 사진 JPG는 대부분 2-4MB.
**Warning signs:** `openImgManager()`에서 저장 후 이미지가 사라지거나 오류 발생

### Pitfall 4: 이미지 페이지 `p-page-break` + `p-wrap:last-child` CSS 충돌
**What goes wrong:** 마지막 `.p-wrap:last-child { page-break-after: auto }` 규칙이 이미지 페이지에 적용되어 페이지 분리가 깨짐
**Why it happens:** 이미지 페이지가 마지막 `.p-wrap`이 됨
**How to avoid:** 이 CSS는 이미 의도적으로 마지막 페이지 뒤에 빈 페이지 없애는 용도. 올바른 동작이므로 그대로 유지.

### Pitfall 5: 평당가 값 clearAll 후 잔류
**What goes wrong:** `clearAll()` 후 새 거래 작성 시 이전 평당가 페이지가 계속 붙음
**Why it happens:** 전역 변수 초기화 누락
**How to avoid:** `clearAll()` 함수에 `window._invoiceUnitPrice = 0; _attachedImages = [];` 추가

---

## Code Examples

### IndexedDB 이미지 저장 패턴
```javascript
// Source: 기존 index.html IndexedDB 패턴 (line 856-916) 확장

function _idbSaveImage(imgRecord) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);  // IDB_VER을 2로 올린 상태
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('attachImages', 'readwrite');
      tx.objectStore('attachImages').put(imgRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function _idbLoadImages() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('attachImages', 'readonly');
      const all = tx.objectStore('attachImages').getAll();
      all.onsuccess = () => resolve(all.result || []);
      all.onerror = () => reject(all.error);
    };
    req.onerror = () => reject(req.error);
  });
}
```

### 이미지 업로드 핸들러
```javascript
function onImgSelected(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  files.forEach(file => {
    if (file.size > 5 * 1024 * 1024) {
      alert(`${file.name}: 5MB 이하 이미지만 첨부 가능합니다.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const record = {
        id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name: file.name,
        dataUrl: e.target.result,
        savedAt: new Date().toISOString(),
        memo: ''
      };
      _idbSaveImage(record).then(() => {
        _attachedImages.push(record);
        syncPrint();
      });
    };
    reader.readAsDataURL(file);
  });
  input.value = '';  // 동일 파일 재업로드 허용
}
```

### syncPrint() 확장 패턴
```javascript
function syncPrint() {
  // ... 기존 코드 전체 유지 ...
  document.getElementById('printDoc').innerHTML = pages.map((pg, idx) => `...`).join('');

  // ── 추가 페이지 주입 (기존 코드 변경 없음) ──
  _appendPricePageIfNeeded();
  _appendImagePagesIfNeeded(_attachedImages);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage 이미지 저장 | IndexedDB binary store | IndexedDB 도입 (Phase 4) | 대용량 가능 |
| 단일 p-wrap | 다중 p-wrap (cart 14개 초과) | Phase 5 | 추가 페이지 패턴 확립 |

---

## Environment Availability

Step 2.6: SKIPPED (외부 의존성 없음 — 브라우저 내장 IndexedDB, FileReader, html2canvas, jsPDF 모두 기존에 로드됨)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js 내장 `assert` + `vm` (rxCompare.test.js, rxNormalizer.v14.test.js 패턴) |
| Config file | 없음 (직접 실행) |
| Quick run command | `node rxCompare.test.js` |
| Full suite command | `node rxCompare.test.js && node rxNormalizer.v14.test.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICE-01 | `unitPricePerPyeong > 0`일 때 `syncPrint()` 후 `.p-wrap.p-price-page` 존재 | DOM 테스트 (브라우저) | 자동화 불가 — DOM 의존 | manual-only |
| ATTACH-01 | `_attachedImages` 있을 때 `.p-wrap.p-img-page` 생성됨 | DOM 테스트 (브라우저) | 자동화 불가 — DOM + IndexedDB 의존 | manual-only |
| ATTACH-02 | `_idbSaveImage` / `_idbLoadImages` 왕복 저장·복원 | 단위 테스트 (Node vm) — IndexedDB mock 필요 | 부분 자동화 가능 | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** 브라우저에서 수동 확인 (인쇄 미리보기 + PDF 출력)
- **Per wave merge:** 브라우저 전체 플로우 확인
- **Phase gate:** PRICE-01/ATTACH-01/02 시나리오 체크리스트 통과

### Wave 0 Gaps
- 없음 — 이 페이즈 로직은 DOM/브라우저 의존성이 강해 기존 Node vm 테스트 패턴으로 커버 불가. 수동 검증이 주요 검증 방법.

---

## Open Questions

1. **평당가 값 우선순위: Vision AI 경로 vs. 검증 모달 경계값**
   - What we know: 두 경로 모두 `unitPricePerPyeong`을 생성. Vision AI 경로는 PDF 추출값, 검증 모달은 실시간 계산값.
   - What's unclear: PDF 추출값(main.js)과 모달 계산값(uiController.js)이 충돌할 때 무엇을 우선해야 하나?
   - Recommendation: 마지막으로 설정된 값을 사용. 검증 모달 완료 시 덮어쓰는 방향이 더 사용자 의도에 부합.

2. **이미지 세션 범위: 현재 거래 한정 vs. 영구 저장**
   - What we know: ATTACH-02는 "저장해두고 재사용"을 요구. IndexedDB는 브라우저 세션 유지됨.
   - What's unclear: 이미지가 특정 고객/거래에 귀속되어야 하나, 아니면 전역 갤러리인가?
   - Recommendation: 전역 갤러리로 시작. `savedAt` 기준 최신 5개만 관리 UI에 표시. 고객 귀속은 복잡도 증가 대비 효용이 낮음.

3. **평당가 페이지가 처방전.html의 `generateCostPageHtml()`과 중복되는지**
   - What we know: 처방전.html에 이미 평당가 페이지(`generateCostPageHtml()`)가 있어 처방전 출력에 포함됨. 거래명세표(index.html)에는 없음.
   - What's unclear: 거래명세표의 평당가 페이지 디자인을 처방전.html과 통일해야 하나?
   - Recommendation: 처방전.html 디자인을 참조하되 거래명세표 스타일(`.p-wrap` CSS)에 맞게 조정. 두 파일은 독립적으로 인쇄됨.

---

## Sources

### Primary (HIGH confidence)
- `index.html` — `syncPrint()`, `doPdf()`, IndexedDB 구현 (line 856-916), `.p-wrap` CSS (line 346-352) 직접 분석
- `uiController.js` — `_recalcVldUnitPrice()`, `_applyToCart()` 직접 분석
- `pdfParser.js` — `extractCostPageData()` 반환 구조 (`unitPricePerPyeong`) 직접 분석
- `main.js` — `handlePrescriptionUpload()` costData 처리 경로 직접 분석
- `처방전.html` — `generateCostPageHtml()` 평당가 페이지 구조 참조

### Secondary (MEDIUM confidence)
- IndexedDB upgrade pattern — MDN Web API 표준 패턴 (기존 코드에서 v1 구현이 확인됨)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 모든 코드 직접 분석, 외부 라이브러리 무관
- Architecture: HIGH — `syncPrint()` / `doPdf()` 플로우 완전 이해
- Pitfalls: HIGH — 실제 코드에서 발생 가능한 충돌 지점 확인됨

**Research date:** 2026-03-27
**Valid until:** 이 프로젝트는 바닐라 JS + 빌드 없음 — 코드가 변경되지 않는 한 영구 유효
