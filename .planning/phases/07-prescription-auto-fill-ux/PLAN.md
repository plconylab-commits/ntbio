---
phase: 07-prescription-auto-fill-ux
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - main.js
  - index.html
  - 처방전.html
autonomous: true
requirements:
  - AUTO-01
  - AUTO-02
  - UX-01

must_haves:
  truths:
    - "처방전 PDF를 index.html에 업로드하면 #cName·#cArea·#cCrop이 자동으로 채워진다"
    - "처방전.html에서 외부 처방전 PDF를 불러오면 #bArea가 자동으로 채워진다"
    - "처방전.html 단계 목록은 초기 로드 시 첫 번째 단계만 열리고 나머지는 접혀 있다"
    - "단계 헤더를 클릭하면 해당 단계가 토글된다"
    - "isOpen 플래그는 localStorage 직렬화에 포함되지 않는다"
  artifacts:
    - path: "main.js"
      provides: "cCrop select for-loop 패턴 교체 (main.js:38-40)"
      contains: "for.*options.*cropName"
    - path: "index.html"
      provides: "applyRxPdfEmbed cCrop select for-loop 패턴 교체 (~line 2407)"
      contains: "for.*options.*d.cr"
    - path: "처방전.html"
      provides: "AUTO-02 bArea 주입 + UX-01 stage-body.collapsed CSS + toggleStageCard()"
      contains: "stage-body.collapsed"
  key_links:
    - from: "pdfParser.js parseRxPdfCoords()"
      to: "처방전.html onRxPdfSelected() parsed.length > 0 블록"
      via: "farmInfo.totalArea → bArea 주입"
      pattern: "bArea.*value.*inferredArea|totalArea"
    - from: "처방전.html makeCard()"
      to: ".stage-body div"
      via: "stages[si].isOpen 조건부 collapsed 클래스"
      pattern: "stage-body.*collapsed"
    - from: "처방전.html toggleStageCard()"
      to: "#stageCard_{id} .stage-body"
      via: "classList.toggle('collapsed')"
      pattern: "classList.toggle.*collapsed"
---

<objective>
처방전 불러오기 시 고객이름·평수·작물을 거래명세표와 처방전 양쪽에 자동 기입하고, 처방전 단계 카드를 현재 단계 포커스 방식으로 개선한다.

Purpose: 처방전 PDF를 열 때마다 고객명·작물·평수를 수동으로 다시 입력하는 불필요한 중복 작업을 제거하고, 단계 목록이 모두 펼쳐진 채로 표시되어 스크롤이 길어지는 UX 문제를 해결한다.
Output: main.js (AUTO-01 cCrop select fix), index.html (AUTO-01 cCrop select fix in applyRxPdfEmbed), 처방전.html (AUTO-02 bArea 주입 + UX-01 stage-body collapsed 구현)
</objective>

<execution_context>
@/Users/glen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/glen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/07-prescription-auto-fill-ux/07-RESEARCH.md
</context>

<interfaces>
<!-- Key contracts extracted from codebase. Executor should use these directly. -->

From main.js (handlePrescriptionUpload, 현재 구현 — AUTO-01 Vision AI 경로):
```javascript
// lines 31-44 현재 구현 — cropName은 select에 직접 .value 대입 (버그)
const fi = prescriptionJSON.farmInfo || {};
if (fi.farmName) { document.getElementById('cName').value = fi.farmName; }
if (fi.cropName) { document.getElementById('cCrop').value = fi.cropName; }  // ← 버그: select 직접 대입
if (fi.totalArea) { document.getElementById('cArea').value = fi.totalArea; }
```

From index.html (applyRxPdfEmbed, ~line 2402-2408 — AUTO-01 ##RX## 경로):
```javascript
function applyRxPdfEmbed(d){
  document.getElementById('cName').value = d.n || '';
  document.getElementById('cRegion').value = d.rg || '';
  document.getElementById('cArea').value = d.ar || '';
  document.getElementById('cCrop').value = d.cr || '';  // ← 버그: select 직접 대입
  // ...
}
```

From 처방전.html (onRxPdfSelected, parsed.length > 0 블록 — AUTO-02 GAP):
```javascript
if (parsed.length > 0) {
  stageIdCnt = 0;
  stages = parsed.map(s => ({ ...s, id: ++stageIdCnt }));
  // ← 여기에 farmInfo.totalArea → bArea 주입 없음 (GAP)
  _normalizeStageProductKeys(stages);
  _autoCartFromStages(stages);
  syncGroupOrder();
  renderStages();
  // ...
}
```

From pdfParser.js (parseRxPdfCoords 반환 구조):
```javascript
// farmName/cropName은 항상 null. totalArea는 빈도분석 추론값 (있을 수도 없을 수도 있음)
return {
  farmInfo: { farmName: null, cropName: null, totalArea: inferredArea },
  // ...
}
```

From 처방전.html (makeCard 반환 HTML — UX-01 수정 대상):
```javascript
// line ~1626-1633 현재 구조 (항상 열림)
return `<div class="stage-card" id="stageCard_${st.id}">
  <div class="stage-head">
    ...
  </div>
  <div class="stage-body">
    ...
  </div>
</div>`;
```

From 처방전.html (_saveRxStages 직렬화 맵):
```javascript
// stages.map(s => ({ type, month, pageGroup, ... })) — isOpen 없음 (유지해야 함)
```

From 처방전.html (CSS — month-group 기존 패턴):
```css
/* line 143 — 기존 */
.month-group-body.collapsed { display: none; }
/* 추가 필요 */
.stage-body.collapsed { display: none; }
```

Field ID 매핑:
- index.html: #cName, #cArea, #cCrop (select), #cRegion
- 처방전.html: #bName, #bArea, #bCrop (select), #bRegion
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: AUTO-01 — cCrop select 안전 대입 (main.js + index.html)</name>
  <files>main.js, index.html</files>
  <action>
두 파일에서 `#cCrop` select 요소에 `.value = cropValue` 직접 대입하는 코드를 for-loop 패턴으로 교체한다.

**main.js (lines 37-40):**
현재:
```javascript
if (fi.cropName) {
  const el = document.getElementById('cCrop');
  if (el) el.value = fi.cropName;
}
```
교체:
```javascript
if (fi.cropName) {
  const el = document.getElementById('cCrop');
  if (el) {
    for (let i = 0; i < el.options.length; i++) {
      if (el.options[i].value === fi.cropName) { el.selectedIndex = i; break; }
    }
  }
}
```

**index.html (applyRxPdfEmbed 함수, ~line 2407):**
현재:
```javascript
document.getElementById('cCrop').value = d.cr || '';
```
교체:
```javascript
if (d.cr) {
  const sel = document.getElementById('cCrop');
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === d.cr) { sel.selectedIndex = i; break; }
    }
  }
}
```

주의: `d.cr`이 없으면 기존 선택을 건드리지 않는다 (빈 문자열로 덮어쓰지 않음). main.js의 `fi.farmName` / `fi.totalArea` 주입 로직(if 조건부 guard)은 이미 올바르므로 건드리지 않는다.
  </action>
  <verify>
코드 검사: main.js에 `for.*options.*cropName` 또는 `el.options\[i\].value.*cropName` 패턴이 존재하는지 확인.
index.html에 `for.*options.*d\.cr` 또는 `sel.options\[i\].value.*d\.cr` 패턴이 존재하는지 확인.
직접 대입 `el.value = fi.cropName` 또는 `.value = d.cr` 패턴이 제거되었는지 확인.
  </verify>
  <done>main.js와 index.html 양쪽에서 cCrop select 값을 for-loop으로 안전하게 설정한다. 옵션에 없는 작물명일 때 기존 선택을 변경하지 않는다. (AUTO-01)</done>
</task>

<task type="auto">
  <name>Task 2: AUTO-02 — 처방전.html 외부 PDF 경로 bArea 자동 주입</name>
  <files>처방전.html</files>
  <action>
`onRxPdfSelected` 함수의 `parsed.length > 0` 블록에서 `stages = parsed.map(...)` 직후, `_normalizeStageProductKeys(stages)` 이전에 farmInfo.totalArea를 #bArea와 rxData.area에 주입하는 코드를 추가한다.

pdfParser.js의 `parseRxPdfCoords`는 `{ farmInfo: { farmName: null, cropName: null, totalArea: inferredArea }, ... }` 를 반환한다. 해당 함수는 처방전.html 내 `onRxPdfSelected` 에서 직접 호출되지 않고, `extractRxPdfCoords(pdfDoc)` → `parseRxPdfCoords(items)` 경로로 호출된다. `parsed` 변수가 이미 stages 배열이므로 farmInfo는 별도로 접근해야 한다.

실제 코드를 확인하면 `parseRxPdfCoords`가 stages 배열만 반환하는지, farmInfo도 함께 반환하는지 확인 후 아래 두 가지 중 적절한 방법을 사용한다:

**방법 A (parseRxPdfCoords가 { stages, farmInfo } 반환할 경우):**
```javascript
const { stages: parsedStages, farmInfo: parsedFarmInfo } = parseRxPdfCoords(items);
// ...
if (parsedFarmInfo && parsedFarmInfo.totalArea) {
  document.getElementById('bArea').value = parsedFarmInfo.totalArea;
  rxData.area = String(parsedFarmInfo.totalArea);
}
```

**방법 B (parseRxPdfCoords가 stages 배열만 반환할 경우 — 현재 구조):**
pdfParser.js를 직접 수정하지 않고, `parsePdfToJSON` 대신 `extractRxPdfCoords` 수준에서 직접 area를 추론할 수 없다. 이 경우 stages 배열 자체에서 area를 추론한다:
```javascript
if (parsed.length > 0) {
  stageIdCnt = 0;
  stages = parsed.map(s => ({ ...s, id: ++stageIdCnt }));

  // AUTO-02: 단계 area 빈도 분석으로 totalArea 추론 → bArea 자동 기입
  const areaFreq = {};
  stages.forEach(s => { if (s.area) areaFreq[s.area] = (areaFreq[s.area] || 0) + 1; });
  const inferredArea = Object.entries(areaFreq).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (inferredArea) {
    const bAreaEl = document.getElementById('bArea');
    if (bAreaEl && !bAreaEl.value) { bAreaEl.value = inferredArea; }
    if (!rxData.area) rxData.area = String(inferredArea);
  }

  _normalizeStageProductKeys(stages);
  // ...
}
```

주의: `bAreaEl.value`가 이미 사용자가 입력한 값이면 덮어쓰지 않는다 (`!bAreaEl.value` 조건). `rxData.area`도 기존 값이 있으면 유지한다 (`!rxData.area` 조건). farmName/cropName은 pdfParser.js가 표지 스킵으로 null을 반환하므로 bName/bCrop 주입은 하지 않는다 (빈 문자열로 기존 값을 지우는 것을 방지).

실제 코드 구조를 Read로 확인한 후 방법 A 또는 B 중 맞는 것을 적용한다.
  </action>
  <verify>
코드 검사: 처방전.html의 `parsed.length > 0` 블록 내에 `bArea` 관련 주입 코드가 존재하는지 확인.
`if.*bArea\|bAreaEl` 패턴이 `parsed.length > 0` 블록 안에 있는지 확인.
  </verify>
  <done>외부 처방전 PDF를 처방전.html에서 불러올 때, 단계에서 추론한 평수가 #bArea 입력 필드에 자동으로 채워진다. 기존 값이 있으면 덮어쓰지 않는다. (AUTO-02)</done>
</task>

<task type="auto">
  <name>Task 3: UX-01 — stage-card 접힘/펼침 (처방전.html)</name>
  <files>처방전.html</files>
  <action>
세 가지 변경을 처방전.html에 적용한다.

**1. CSS 추가** — `.month-group-body.collapsed { display: none; }` 가 있는 CSS 블록(line ~143) 바로 다음에 추가:
```css
.stage-body.collapsed { display: none; }
.stage-head { cursor: pointer; user-select: none; }
```
주의: `.stage-head`에 이미 다른 스타일이 있으면 `cursor:pointer`와 `user-select:none`만 추가 속성으로 넣는다.

**2. makeCard() 수정** — `stage-head` div에 onclick 추가, `stage-body` div에 조건부 collapsed 클래스 추가:
현재:
```javascript
return `<div class="stage-card" id="stageCard_${st.id}">
  <div class="stage-head">
    ...
  </div>
  <div class="stage-body">
```
교체:
```javascript
const isCollapsed = !st.isOpen;
return `<div class="stage-card" id="stageCard_${st.id}">
  <div class="stage-head" onclick="toggleStageCard(${si})">
    ...
  </div>
  <div class="stage-body${isCollapsed ? ' collapsed' : ''}">
```
주의: `st.isOpen`이 undefined이면 `!undefined === true` → collapsed. 즉, isOpen을 명시적으로 true로 세팅한 단계만 열린다.

**3. renderStages() 수정** — stages가 처음 렌더될 때(첫 번째 단계만 열림) 기본값 설정:
`renderStages()` 함수 내 `stages.length` 가 0이 아닌 경우의 처리 시작부에 추가:
```javascript
// UX-01: 첫 렌더 시 isOpen 초기화 — isOpen이 아직 없는 stages만 기본값 적용
if (stages.length > 0 && stages[0].isOpen === undefined) {
  stages[0].isOpen = true;
  // 나머지는 undefined → makeCard에서 collapsed 처리
}
```
주의: 사용자가 토글한 상태는 isOpen이 이미 true/false로 설정되어 있으므로 이 블록에서 덮어쓰지 않는다.

**4. toggleStageCard() 함수 추가** — renderStages() 함수 바로 아래에 추가:
```javascript
function toggleStageCard(si) {
  if (si < 0 || si >= stages.length) return;
  stages[si].isOpen = !stages[si].isOpen;
  // 전체 재렌더 대신 직접 DOM 조작 (포커스·스크롤 유지)
  const body = document.querySelector(`#stageCard_${stages[si].id} .stage-body`);
  if (body) body.classList.toggle('collapsed', !stages[si].isOpen);
}
```

**5. _saveRxStages() 직렬화 확인** — stages.map(s => ({...})) 블록에 isOpen이 포함되지 않는지 확인. 포함되어 있으면 제거한다. (런타임 전용 플래그이므로 영속화 불필요)

이미 _saveRxStages의 직렬화 맵에는 isOpen이 없음을 코드 검토에서 확인했다. 변경 불필요하면 스킵.
  </action>
  <verify>
코드 검사:
1. 처방전.html CSS 블록에 `.stage-body.collapsed { display: none; }` 존재 확인
2. makeCard() 반환 문자열에 `onclick="toggleStageCard(` 존재 확인
3. makeCard() 반환 문자열에 `isCollapsed ? ' collapsed' : ''` 패턴 존재 확인
4. `function toggleStageCard` 함수 존재 확인
5. _saveRxStages 직렬화 맵에 `isOpen` 없음 확인
  </verify>
  <done>처방전.html 단계 목록이 초기 로드 시 첫 번째 단계만 펼쳐지고 나머지는 접혀 있다. 단계 헤더 클릭으로 해당 단계가 토글된다. 토글은 전체 재렌더 없이 DOM 직접 조작으로 처리되어 편집 중인 textarea의 포커스가 유지된다. (UX-01)</done>
</task>

</tasks>

<verification>
세 가지 요구사항이 각각 독립적으로 검증 가능하다:

AUTO-01: index.html에서 처방전 PDF를 업로드했을 때 (Vision AI 경로 또는 ##RX## embed 경로 모두) #cCrop select가 올바른 옵션으로 선택된다. 작물명이 select 옵션에 없는 경우 선택이 변경되지 않는다.

AUTO-02: 처방전.html에서 외부 처방전 PDF를 불러왔을 때 단계에서 추론한 평수가 #bArea에 자동으로 채워진다.

UX-01: 처방전.html에서 단계가 2개 이상일 때, 첫 번째 단계만 열리고 나머지는 접혀 있다. 단계 헤더를 클릭하면 해당 단계가 열리거나 닫힌다. 열려 있는 단계의 textarea에 입력 중 다른 단계 헤더를 클릭해도 포커스가 유지된다.
</verification>

<success_criteria>
- main.js: cCrop select 대입이 for-loop 패턴으로 교체됨
- index.html: applyRxPdfEmbed의 cCrop 대입이 for-loop 패턴으로 교체됨
- 처방전.html: 외부 PDF 불러오기 후 #bArea에 추론 평수가 자동 기입됨 (기존 값 있으면 유지)
- 처방전.html: 단계 카드가 초기 로드 시 첫 번째만 열리고 나머지는 접힘
- 처방전.html: toggleStageCard() 함수가 DOM 직접 조작으로 포커스 유지하며 토글
- _saveRxStages() 직렬화에 isOpen 포함되지 않음
</success_criteria>

<output>
After completion, create `.planning/phases/07-prescription-auto-fill-ux/07-01-SUMMARY.md`
</output>
