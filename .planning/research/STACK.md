# Technology Stack

**Project:** 천연비료처방전 — 고객 DB / 템플릿 / 할인율 / 매출 추적 마일스톤
**Researched:** 2026-03-24
**Constraint:** 빌드 도구 없음, 브라우저 직접 실행, 바닐라 JS 기존 구조 유지

---

## Recommended Stack

### Core Runtime (변경 없음)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vanilla JS (ES2020+) | 브라우저 내장 | 앱 로직 전체 | 빌드 없이 실행, 기존 코드 일관성 |
| HTML5 / CSS3 | 브라우저 내장 | UI 렌더링 | 현재 구조 유지 |
| Noto Sans KR | Google Fonts CDN | 한국어 폰트 | 현재 사용 중 |

---

### 데이터 지속성 — 핵심 결정

**결론: localStorage를 primary store로 사용한다.**

IndexedDB나 파일 기반 JSON이 아닌 localStorage를 선택하는 이유는 아래 비교에서 설명한다.

#### localStorage vs IndexedDB vs 로컬 JSON 파일 — 상세 비교

| 기준 | localStorage | IndexedDB | JSON 파일 (File API) |
|------|-------------|-----------|----------------------|
| **용량** | ~5–10MB (브라우저별 차이) | 수GB (디스크의 약 60%) | 제한 없음 |
| **API 복잡도** | 매우 단순 (key/value 동기) | 복잡 (비동기, cursor, transaction) | 읽기: File API, 쓰기: 불가 |
| **빌드 없이 사용** | 즉시 | 즉시 | 읽기만 가능, 저장 불가 |
| **쿼리/검색** | 불가 (전체 파싱 필요) | 인덱스 쿼리 가능 | 불가 |
| **데이터 영속성** | 사용자가 캐시 지울 때까지 유지 | 동일 | 파일에 영구 저장 |
| **JSON import/export** | 직접 구현 쉬움 | 직접 구현 가능 | 파일 자체가 JSON |
| **기존 코드 통합** | 2줄 추가로 연동 | 100~200줄 래퍼 필요 | 쓰기 불가로 부적합 |

**이 앱의 실제 데이터 규모 추정:**
- 고객 수: 50–200명
- 처방이력: 고객당 평균 10건 → 최대 2,000건
- 명세표 1건: ~1–3KB (JSON)
- 전체 예상 크기: **2–6MB** → localStorage 5–10MB 범위 내

**localStorage를 선택하는 이유:**

1. **규모가 맞다.** 수백 명의 고객, 수천 건의 처방이력은 5MB를 초과하지 않는다. 초과할 경우 가장 오래된 처방이력을 아카이브 내보내기로 처리하면 된다.

2. **기존 코드와 즉시 통합된다.** 현재 uiController.js는 localStorage를 이미 사용한다(`rxCostData`). 동일한 패턴으로 `customerDB`, `invoiceHistory` 키를 추가하면 신규 래퍼 코드가 없다.

3. **IndexedDB의 복잡성이 이 앱에 불필요하다.** IndexedDB는 오프라인 우선 앱, 수만 건 이상의 레코드, 또는 복잡한 쿼리가 필요할 때 가치가 있다. 이 앱의 "검색"은 고객 이름 필터 정도이며 배열 `.filter()`로 충분하다.

4. **JSON 파일 방식은 쓰기가 불가능하다.** 브라우저 File System Access API(`showSaveFilePicker`)는 사용자 제스처마다 피커를 띄워야 하므로 자동 저장에 부적합하다. 읽기 전용 초기 데이터 로딩(`productDB.js` 같은 코드베이스 내장 방식)에만 적합하다.

**localStorage 한계 대응 전략:**

- **5MB 한계 접근 시**: 처방이력을 날짜 기준으로 월별 키로 분리 (`invoices_2026_03`) → 키당 ~200KB로 관리
- **백업/이전**: JSON export/import 기능을 UI에 제공 → 사용자가 수동으로 파일로 내보내 보관
- **데이터 손실 위험**: localStorage는 브라우저 설정 초기화 시 삭제됨 → 정기 내보내기 버튼을 명세표 헤더에 상시 노출

---

### Google Apps Script 연동 (선택적 강화)

현재 `apps-script-invoice.js`가 이미 구현되어 있다. 이는 Google Sheets를 백엔드로 사용하는 REST API 패턴이다.

**권장 아키텍처: localStorage primary + GAS sync secondary**

```
[브라우저 localStorage] ← primary read/write
        ↓ (명세표 저장 시)
[Google Apps Script] ← 클라우드 백업 + 미수금 조회 용
```

이유: 오프라인에서도 동작해야 하고, 기존 GAS 코드가 이미 존재한다. localStorage에 먼저 쓰고, 네트워크 있을 때 GAS에 동기화하는 패턴은 구현 비용이 낮다.

GAS는 **데이터 백업과 다기기 공유**에만 사용하고, localStorage가 항상 source of truth다.

---

### 데이터 스키마 설계 (localStorage 키 구조)

```javascript
// 고객 마스터
localStorage['cnb_customers'] = JSON.stringify([
  {
    id: 'cust_001',               // crypto.randomUUID() 또는 timestamp ID
    name: '홍길동 농원',
    crop: '천혜향',
    area: 1200,                   // 평수
    discountRate: 10,             // % (공급가 기준 할인율)
    phone: '010-xxxx-xxxx',
    memo: '',
    createdAt: '2026-01-15',
    updatedAt: '2026-03-20'
  }
])

// 처방/명세표 이력 — 월별 분리
localStorage['cnb_invoices_2026_03'] = JSON.stringify([
  {
    id: 'inv_1711234567890',
    customerId: 'cust_001',
    customerName: '홍길동 농원',
    crop: '천혜향',
    area: 1200,
    discountRate: 10,
    items: [...],                 // 장바구니 아이템 배열
    totalRetail: 350000,
    totalSupply: 315000,
    unitPricePerPyeong: 263,
    issuedAt: '2026-03-20',
    paidAt: null,                 // null = 미수금
    memo: ''
  }
])

// 처방 템플릿
localStorage['cnb_templates'] = JSON.stringify([
  {
    id: 'tmpl_001',
    name: '천혜향 기비 기본형',
    crop: '천혜향',
    stageType: '기비',
    items: [...],
    usageCount: 12,
    updatedAt: '2026-03-01'
  }
])
```

---

### 라이브러리 — 외부 의존성 최소화 원칙

**이 앱은 추가 라이브러리가 필요 없다.** 아래는 근거다.

| 필요 기능 | 라이브러리 사용 시 | 바닐라 대안 | 결정 |
|----------|-----------------|------------|------|
| 고객 검색/필터 | Fuse.js, Lunr | `Array.filter()` + `includes()` | 바닐라 |
| 날짜 처리 | date-fns, Luxon | `Date` + `Intl.DateTimeFormat` | 바닐라 |
| 차트(매출 그래프) | Chart.js | CSS bar chart 또는 SVG | 바닐라 (단, 매출 시각화 복잡 시 Chart.js CDN 허용) |
| 데이터 내보내기 | xlsx | `Blob` + `URL.createObjectURL` + CSV | 바닐라 |
| 모달/UI 컴포넌트 | 불필요 | 기존 모달 패턴 재사용 | 바닐라 |

**Chart.js 예외 조건:** 기간별 매출 집계를 막대/선 그래프로 시각화하는 요구가 명확해지면 Chart.js 4.x CDN (`https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js`)을 추가한다. 빌드 없이 CDN으로 바로 사용 가능하다.

---

### PDF 파싱 개선 — Claude Vision API

현재 구조: PDF → base64 이미지 → Claude Vision API → JSON

**평당가 파싱 버그 대응 전략 (두 가지 옵션):**

| 방법 | 설명 | 권장 |
|------|------|------|
| **프롬프트 엔지니어링** | `pdfPromptTemplate.js`의 프롬프트에 "비용 요약 페이지의 맨 마지막 합계 행에서만 평당가를 추출하라" 명시 | 1순위 |
| **후처리(post-processing)** | AI 응답 JSON을 받은 후 `rxNormalizer.js`에서 `costData.unitPricePerPyeong` 재계산: `totalCost / totalArea` | 2순위 fallback |

**권장:** 두 방법을 모두 적용한다. 프롬프트로 AI를 안내하고, 파싱 결과를 `rxNormalizer.js`에서 검증한다. AI가 중간 행 평당가를 반환하면 `totalCost / totalArea`로 덮어쓴다.

현재 `main.js` 53–54줄에 이미 역산 로직이 있으나 조건부로만 실행된다. 이를 항상 검증 단계로 격상시키는 것이 올바른 접근이다.

---

## 채택하지 않는 기술 — 이유 명시

| 기술 | 채택 안 하는 이유 |
|------|-----------------|
| **React / Vue / Svelte** | 빌드 도구 필요, 기존 바닐라 코드와 혼재 불가, 오버엔지니어링 |
| **IndexedDB (직접 사용)** | API 복잡도 대비 이 앱 규모에서 얻는 이점 없음 |
| **Dexie.js** (IndexedDB 래퍼) | CDN으로 사용 가능하나 localStorage로 충분한 규모에서 불필요한 의존성 |
| **PouchDB** | 오프라인 sync + CouchDB 연동 목적 — 이 앱의 요구와 불일치 |
| **Firebase / Supabase** | 서버 비용, 설정 복잡도, 인터넷 의존성 — 내부 단독 실행 앱에 부적합 |
| **JSON 파일 쓰기 (File System Access API)** | 저장 시마다 사용자 피커 필요 — 자동 저장 불가 |
| **SQLite (via WASM)** | 2025년 기준 `@sqlite.org/sqlite-wasm` 사용 가능하나 WASM 바이너리 로딩, OPFS 설정 복잡성이 이 규모에서 불필요 |

---

## 마이그레이션 경로 (미래 대비)

현재 localStorage 구조를 유지하면서 향후 서버 DB로 이전하는 경로:

```
현재: localStorage 직접 접근
→ 1단계: storageService.js 추상화 레이어 도입
          (get/set/query를 통해 localStorage 래핑)
→ 2단계: GAS sync 추가 (이미 apps-script-invoice.js 존재)
→ 3단계: (필요 시) 서버 DB로 storageService 구현 교체
```

추상화 레이어를 처음부터 만들면 나중에 storage 교체 시 UI 코드 수정 없이 가능하다.

---

## 설치 / 추가 파일

빌드 도구 없으므로 `npm install` 없음. 신규 파일만 추가한다.

```
신규 파일 (기존 구조에 추가):
  customerDB.js      — 고객 CRUD + localStorage 읽기/쓰기
  templateDB.js      — 처방 템플릿 CRUD
  invoiceDB.js       — 명세표 저장/조회/미수금 추적
  storageService.js  — localStorage 추상화 레이어 (선택, 권장)

index.html에 추가할 <script> 태그:
  <script src="customerDB.js"></script>
  <script src="templateDB.js"></script>
  <script src="invoiceDB.js"></script>
  <script src="storageService.js"></script>
```

---

## Sources

- 기존 코드 직접 분석: `apps-script-invoice.js`, `uiController.js`, `productDB.js`, `main.js`
- `.planning/PROJECT.md` — 제약조건 및 요구사항 확인
- MDN Web Docs — localStorage: `https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage` (HIGH confidence, standard API)
- MDN Web Docs — IndexedDB: `https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API` (HIGH confidence, standard API)
- Storage Quota: Chrome 브라우저에서 localStorage는 origin당 5–10MB, IndexedDB는 디스크 여유 공간의 최대 60% (HIGH confidence, 브라우저 공식 문서 기반)
