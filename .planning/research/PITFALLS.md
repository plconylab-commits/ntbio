# Domain Pitfalls

**Domain:** 비료 처방전 관리 웹앱 (Vanilla JS, localStorage, Vision API, 인쇄)
**Researched:** 2026-03-24
**Confidence:** HIGH (코드 직접 분석 기반)

---

## Critical Pitfalls

### Pitfall 1: localStorage 데이터 무손실 전제

**What goes wrong:**
localStorage는 브라우저 캐시 삭제, 시크릿 모드 전환, Chrome "사이트 데이터 삭제", OS 재설치, 브라우저 업데이트 시 경고 없이 전체 소거된다. 고객 DB와 거래이력을 여기에만 저장하면 수년치 처방이력이 한 번의 브라우저 클릭으로 사라질 수 있다.

**Why it happens:**
localStorage는 영구 저장이 아니라 "브라우저가 허락하는 동안 보관"이다. Chrome은 사용자가 "방문 기록 삭제 → 쿠키 및 사이트 데이터" 체크 시 localStorage를 함께 삭제한다. 또한 용량 한도는 도메인당 5~10MB로 수백 건 처방이력이 쌓이면 QuotaExceededError가 발생한다.

**Consequences:**
- 고객 DB 전체 소실 (복구 불가)
- 거래이력 소실 → 미수금 추적 불가
- 처방 템플릿 소실

**Prevention:**
1. **자동 JSON 내보내기 — 필수 구현.** 데이터 변경 시마다 또는 앱 시작/종료 시 자동으로 JSON 파일을 `downloads/` 폴더에 저장하도록 `Blob` + `URL.createObjectURL` 패턴을 제공한다.
2. **수동 백업 버튼** — 상단 고정 위치에 "전체 데이터 내보내기(JSON)" 버튼 배치.
3. **가져오기 버튼** — 백업 JSON을 재로드해 localStorage를 복원.
4. **저장 용량 모니터링** — `JSON.stringify(allData).length`를 상시 확인, 4MB 초과 시 경고.
5. **장기적으로는 IndexedDB 이전** — localStorage보다 용량(수백 MB)이 크고 트랜잭션 지원. 단, API 복잡도가 높으므로 초기에는 localStorage + 자동 내보내기 조합으로 충분.

**Detection:**
QuotaExceededError 예외가 발생하거나 데이터 저장 후 재로드 시 null이 반환되면 즉시 위험 신호.

---

### Pitfall 2: 복합형 처방전의 평당가 중간값 오인식

**What goes wrong:**
천혜향처럼 기비용 + 월별 관주/엽면으로 여러 비용 행이 있는 처방전에서, AI 또는 pdf.js 파서가 중간 행의 평당가(부분합)를 최종 평당가로 잘못 반환한다. 이미 PROJECT.md에 "평당가 버그"로 등록된 알려진 문제다.

**Why it happens:**
`extractCostPageData()`는 `합계|총액` 정규식으로 마지막 합계 행을 찾으나, 처방전에 따라 중간 소계 행도 "합계"로 표기될 수 있다. 또한 Vision API 응답에서 비용 페이지를 처방 페이지로 오인하면 cost 데이터 자체가 누락된다.

**현재 코드의 취약점 (pdfParser.js 기준):**
- `COST_PAGE_MIN_HITS = 1` — 키워드 1개만 있어도 비용 페이지로 판정. 처방 페이지에 "계"나 "평당" 단어가 한 번만 들어있어도 오탐 가능.
- `PYEONG_RE = /평\s*당|단\s*가/` — "단가"가 표 헤더에 쓰인 처방 페이지에서도 매치될 수 있음.
- 마지막 합계 행을 확정적으로 선택하는 앵커가 없음 — 여러 합계 행 중 어느 것이 최종인지 순서 기반으로만 추정.

**Consequences:**
평당가가 실제의 1/N (N = 처방 단계 수) 으로 계산되어 거래명세표 금액이 과소 계상.

**Prevention:**
1. **최종 합계 행 앵커 패턴 추가.** 처방전에서 "합계" 행이 마지막 행에 위치한다는 규칙을 활용 — 비용 페이지의 행 배열을 역순으로 탐색해 첫 번째 `합계|총액` 매치만 채택.
2. **홍보용(0원) 항목 명시적 필터링.** `계=홍보용` 또는 `홍보용` 텍스트가 포함된 행은 금액 0으로 처리하고 평당가 계산에서 제외.
3. **Vision API 보조 경로 유지.** pdf.js 파서 실패 시 Vision API 경로로 폴백하는 이중 파이프라인이 이미 설계됨 — 이 경로를 유지하고 비용 페이지 전용 프롬프트 추가 검토.
4. **검증 모달에서 평당가 명시적 확인.** 자동 추출한 평당가를 검증 모달에 크게 표시하고 사용자가 수정할 수 있게 한다 (현재 구현 일부 존재 — 완성 필요).

**Detection:**
총 공급가 합계 ÷ 평수로 역산한 평당가와 추출된 평당가를 비교해 20% 이상 차이 나면 경고 표시.

---

### Pitfall 3: 광고(홍보) 페이지 처방 데이터 혼입

**What goes wrong:**
처방전 PDF의 마지막 N페이지는 제품 홍보 내용이다. Vision API가 이 페이지들을 처방 항목으로 오인식하면 존재하지 않는 제품이 장바구니에 추가된다.

**Why it happens:**
홍보 페이지에도 표 형식, 제품명, 수량처럼 보이는 텍스트가 있어 AI가 처방 항목으로 분류할 수 있다.

**Consequences:**
장바구니에 유효하지 않은 제품 행 추가 → 사용자가 수동으로 제거해야 함 → 처방전 자동화의 가치 감소.

**Prevention:**
1. **페이지 수 제한 유지 (`MAX_PAGES = 8`).** 현재 코드에 이미 구현됨. 처방전이 8페이지를 넘는 경우가 생기면 이 상수를 조정해야 하나, 무조건 늘리면 홍보 페이지 혼입 위험 증가.
2. **비용 페이지 이후 페이지 무시.** 비용 페이지(`detectCostPage()` 양성 반응)가 감지되면 그 이후 페이지는 파싱 대상에서 제외한다.
3. **Vision API 프롬프트에 "홍보 페이지 무시" 명령 추가.** 현재 `PDF_SYSTEM_PROMPT`에는 광고 페이지에 대한 명시적 지시가 없음 — "마지막 페이지 이후 광고/홍보 내용은 무시할 것" 문구 추가.

---

## Moderate Pitfalls

### Pitfall 4: 한글 텍스트 인코딩 및 OCR 오인식

**What goes wrong:**
pdf.js로 PDF를 추출할 때 한글 폰트 임베딩 방식에 따라 텍스트가 깨지거나 공백이 과도하게 삽입된다. 특히 한컴오피스(HWP → PDF 변환)로 만든 처방전에서 자소 분리(ㅎ ㅏ ㄴ 글 → "한글" 대신 개별 자모로 추출)가 발생할 수 있다.

**Why it happens:**
한글 PDF는 CIDFont 또는 Type1 폰트로 임베딩되는데, pdf.js의 Unicode 매핑이 불완전한 경우 ToUnicode CMap이 없으면 글자를 읽지 못한다.

**현재 코드의 대응:**
`OCR_FIXES` 맵에서 `mlr → ml`, `㎖ → ml`, `㎏ → kg` 등 OCR 오인식 단위를 보정함. 하지만 한글 자모 분리에 대한 보정은 없음.

**Prevention:**
1. **Vision API 경로 우선 적용.** pdf.js 텍스트 추출 실패 시 Vision API (이미지 기반) 경로로 자동 폴백. 이미지 기반 파싱은 폰트 임베딩 문제에 영향 없음.
2. **제품명 매핑에 퍼지 매칭 추가.** `productMapper.js`에서 정확한 문자열 매칭 외에 편집 거리(Levenshtein) 기반 유사도 매칭을 보조 수단으로 사용.
3. **`원문 보존` 원칙 유지.** 현재 `originalName`에 원문을 항상 보존하는 설계는 올바름 — 매핑 실패 시에도 원문으로 사용자가 확인 가능.

### Pitfall 5: 인쇄 레이아웃 CSS 불안정성

**What goes wrong:**
한국어 웹 환경에서 `@media print` 적용 시 자주 발생하는 문제들:
- `page-break-after: always` / `break-after: page`가 Chrome과 Safari에서 다르게 동작
- A4 세로/가로 전환 시 실제 출력 크기와 화면 미리보기 크기 불일치
- 한글 글꼴 fallback이 인쇄 시 다른 폰트로 렌더링 → 줄바꿈 위치 변경 → 표 셀 높이 틀어짐
- `table-layout: fixed`와 `width: 100%` 조합이 인쇄 시 열 너비를 예측 불가하게 만들 수 있음

**현재 코드의 현황:**
- `처방전.html`의 인쇄 CSS: `@page{size:A4 landscape;margin:0;}`, `page-break-after:always`
- `print-compact` 클래스로 자동 축소 구현 — 글꼴 크기와 padding을 강제 축소
- `.rx-table{table-layout:fixed}` 인쇄 시 적용

**Prevention:**
1. **`break-inside: avoid`를 테이블 행에 적용.** 처방 항목이 페이지 경계에서 잘리지 않도록 `tr { break-inside: avoid; }` 추가.
2. **인쇄 미리보기와 실제 출력 검증 주기적 수행.** Chrome의 `Ctrl+P` 미리보기가 실제 인쇄와 다른 경우가 있음 — 실제 PDF 내보내기로 확인.
3. **웹 폰트 인쇄 강제.** `@media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }` 추가로 색상과 배경 인쇄 강제.
4. **`margin: 0` on `@page` 주의.** 프린터 하드웨어 여백(약 5mm)이 내용을 잘라낼 수 있음. `margin: 10mm` 이상으로 안전 여백 확보 권장.
5. **가로 인쇄(`landscape`) 고정 확인.** 거래명세표는 가로 인쇄가 맞으나, 처방전 자체는 세로(`portrait`)가 적합할 수 있음 — 각 문서 종류별로 `@page` 규칙 분리 고려.

### Pitfall 6: Vision API 응답이 JSON이 아닌 텍스트 반환

**What goes wrong:**
현재 프롬프트가 JSON 순수 출력을 강제하나, LLM은 여전히 다음과 같은 형태로 응답할 수 있다:
- 코드 블록(` ```json ... ``` `)으로 감쌈
- "다음은 결과입니다:" 같은 전치 문장 추가
- JSON 앞뒤에 공백 또는 BOM 문자 포함

**Why it happens:**
프롬프트 제약은 확률적 억제이지 보장이 아님. 특히 여러 페이지 이미지를 동시에 전달할 때 모델이 각 페이지에 대한 주석을 먼저 출력하려는 경향이 있음.

**Prevention:**
1. **JSON 파싱 전처리 강화.** `JSON.parse()` 호출 전에: 코드 블록 마커(` ``` `) 제거, 첫 번째 `{`부터 마지막 `}` 사이만 추출(`text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)`), 앞뒤 공백 trim.
2. **파싱 실패 시 사용자 알림 + 원문 표시.** `try/catch`로 JSON 파싱 실패를 잡고, 원문 응답을 모달에 표시해 사용자가 수동으로 복사해 입력할 수 있는 경로 제공.
3. **응답 검증 레이어.** 파싱 성공 후에도 `prescriptions` 배열이 있는지, 각 item에 `originalName`이 있는지 확인.

---

## Minor Pitfalls

### Pitfall 7: 제품 DB 업데이트와 처방이력 불일치

**What goes wrong:**
`productDB.js`에서 제품명이나 ID가 변경되면, 과거 처방이력에 저장된 `mappedId`가 유효하지 않게 된다.

**Prevention:**
제품 DB 변경 시 `id` 필드는 절대 변경하지 않는다. 제품명 표기 변경은 별도의 `displayName` 필드로 처리하고 `id`는 고정.

### Pitfall 8: 평수 계산의 기준 평수 vs 총 평수 혼동

**What goes wrong:**
처방전에 "200평 기준" 수량이 적혀있는데 실제 고객 농가가 550평이면 수량을 2.75배 해야 한다. 이 변환이 누락되면 실제 사용량보다 훨씬 적은 수량이 발주된다.

**현재 코드:**
`prescriptionModel.js`의 `calcRequiredQty()`가 이 변환을 담당한다. 이 로직이 반드시 장바구니 적용 경로에서 호출되는지 확인 필요.

**Prevention:**
검증 모달에서 기준 평수와 실제 평수, 배율을 명시적으로 표시 → 사용자가 수량 변환 결과를 확인 후 적용.

### Pitfall 9: 단일 HTML 파일 구조의 유지보수 복잡도

**What goes wrong:**
`index.html`과 `처방전.html` 에 CSS, HTML, 인라인 스크립트가 혼재하면 기능 추가 시 예상치 못한 전역 변수 충돌이 발생한다.

**Prevention:**
새 기능(고객 DB, 템플릿 시스템) 추가 시 별도 `.js` 파일로 분리하고 `<script src="...">` 태그로 포함. 전역 함수명은 네임스페이스 접두사(예: `CustomerDB.`, `Template.`)로 충돌 방지.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| 고객 DB 구현 | localStorage 데이터 소실 (Pitfall 1) | 자동 JSON 내보내기 첫날 구현 |
| 평당가 버그 수정 | 복합형 처방전 중간 소계 행 오인식 (Pitfall 2) | 역순 탐색 + 검증 모달 확인 강제 |
| 처방 템플릿 | 제품 DB ID 불일치 (Pitfall 7) | ID 불변 원칙 문서화 |
| 거래이력 저장 | 5~10MB 용량 한도 초과 (Pitfall 1) | 저장 전 용량 체크 + 경고 |
| 인쇄 기능 유지 | 한글 폰트 fallback으로 표 레이아웃 틀어짐 (Pitfall 5) | 실제 프린터 출력 테스트 |
| Vision API 통합 | JSON 아닌 응답 반환 (Pitfall 6) | 파싱 전처리 강화 |
| 홍보 페이지 처리 | 광고 페이지 처방 데이터 혼입 (Pitfall 3) | 비용 페이지 이후 무시 로직 |

---

## Sources

- 코드 직접 분석: `pdfParser.js`, `pdfPromptTemplate.js`, `rxNormalizer.js`, `main.js`, `uiController.js`, `처방전.html` (confidence: HIGH)
- `PROJECT.md` 의 "평당가 버그" 및 "처방전 구조" 컨텍스트 (confidence: HIGH)
- localStorage 브라우저 동작: MDN Web Docs — Storage quotas and eviction criteria (confidence: HIGH)
- 한글 PDF 텍스트 추출 이슈: pdf.js GitHub issues (confidence: MEDIUM — 일반적 알려진 문제)
- Chrome @media print 동작: CSS Paged Media spec + chromium 이슈 (confidence: MEDIUM)
