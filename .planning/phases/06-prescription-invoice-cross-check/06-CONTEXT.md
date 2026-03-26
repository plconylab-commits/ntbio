# Phase 6: 처방전↔거래명세표 대조 검토 - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

처방전 PDF와 현재 거래명세표 카트를 대조하여 품목 유무·수량 차이·금액 차이를 자동으로 검출하고 모달 diff 테이블로 표시한다.
새 화면 추가 없음 — 기존 `index.html` 거래명세표 안에서 동작한다.
처방전 작성, 인쇄, PDF 저장 등은 이 phase에 포함되지 않는다.
</domain>

<decisions>
## Implementation Decisions

### 입력 방식
- **D-01:** 거래명세표 툴바에 "처방전 비교" 버튼을 수동 추가한다.
- **D-02:** 버튼 클릭 → 모달이 뜨고 → 처방전 PDF 업로드 → 카트와 비교 시작.
- **D-03:** 현재 카트(거래명세표 상태)가 invoice 역할 — 카트는 덮어쓰지 않는다.
- **D-04:** 기존 `pdfFileInput` 버튼은 건드리지 않는다 (별도 file input 사용).

### 대조 표시 방식
- **D-05:** 비교 결과는 업로드 모달 안에서 diff 테이블로 표시 (카트 테이블에 인라인 표시 없음).
- **D-06:** diff 테이블 행 구성:
  - **일치 행 (✓):** 품목명 매칭되고 수량 동일 — 회색 (축소 표시 가능)
  - **수량 차이 행 (△):** 품목명 매칭되지만 수량 다름 — 노란색 강조
  - **한쪽에만 있는 행 (✗):** 처방전에만 있거나 카트에만 있는 품목 — 빨간색 강조
  - **미매칭 행 (?):** 자동 매칭 실패 — 회색/주황색으로 "미확인" 표시

### 매칭 기준
- **D-07:** 퍼지 문자열 매칭 — 소문자화 + 특수문자/공백 제거 후 포함여부(contains) 확인.
- **D-08:** 매칭 모호 시 "미매칭 항목"으로 표시; 사용자가 수동으로 확인.
- **D-09:** 사용자 매핑 편집 UI는 이 phase 범위 밖 (deferred).

### 비교 범위
- **D-10:** 비교 대상: 품목명 유무, 수량(qty), 항목별 단가 × 수량.
- **D-11:** 수량 허용 오차 없음 — 1개라도 차이나면 차이 행으로 표시.
- **D-12:** 금액 비교: 카트 `sp × qty` vs 처방전 쪽 금액(costData 또는 품목별 단가 역산).
  - 처방전 PDF에 항목별 단가가 없는 경우 금액 비교는 skip (표시 없음).
- **D-13:** 전체 평당가 요약(처방전 평당가 vs 카트 공급가 합계 ÷ 면적)은 diff 테이블 상단 1줄 요약으로 포함.

### Claude's Discretion
- diff 테이블 정확한 컬럼 구성(처방전 수량 / 카트 수량 / 차이 등)
- 퍼지 매칭 알고리즘 세부(토큰화 방식, 최소 유사도 임계값)
- 모달 크기·스타일
- 일치 행의 기본 표시/숨김 여부
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements are fully captured in decisions above.

### 참고할 기존 코드 파일
- `index.html` §2470–2530 — onPdfSelected() PDF 종류 감지 분기 (##RX##, ##TN##, 거래명세표)
- `index.html` §932 — `let cart=[]` 카트 데이터 구조
- `index.html` §1750–1780 — goToPrescription() 카트→처방전 데이터 전달 구조
- `main.js` — handlePrescriptionUpload(), parsePdfToJSON() 처방전 PDF 파싱 진입점
- `pdfParser.js` — Vision API 호출 및 처방전 JSON 파싱 로직
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parsePdfToJSON()` (`main.js`) — 처방전 PDF → JSON 변환. Phase 6에서 재사용 가능; 단, 결과를 카트에 적용하지 않고 비교 로직으로 전달해야 함.
- `extractPdfText()` (`index.html`) — PDF 텍스트 추출 (pdf.js 기반). 종류 감지에 활용 중.
- `applyRxPdfEmbed()` — ##RX## 임베드 처방전 파싱. 비교 기준 데이터 추출에 참고 가능.
- 기존 모달 패턴 (`_openOldInvConfirmModal` 등) — 모달 구조 참고.

### Established Patterns
- IIFE + `window.XXX` 네임스페이스 노출 패턴 — 새 모듈(예: `rxCompareUI.js`) 작성 시 동일 패턴 사용.
- `showToast()` — 사용자 피드백 알림.
- 바닐라 JS + 빌드 도구 없음 — 모든 스크립트는 `<script src="...">` 직접 포함.

### Integration Points
- `index.html` 툴바 버튼 영역 (`<div class="btn-row">` 또는 유사한 버튼 그룹) — "처방전 비교" 버튼 추가.
- `onPdfSelected()` 분기 — 비교 모달의 file input은 별도 핸들러로 처리 (기존 onPdfSelected와 충돌 없도록).
- `cart` 전역 변수 — 비교 시 읽기 전용으로 참조.
- `parsePdfToJSON()` 반환 JSON (`prescriptionJSON`) — 처방전 품목명·수량·costData 추출 기준.
</code_context>

<specifics>
## Specific Ideas

- 비교 결과는 카트를 변경하지 않는다 — 모달에서 확인만 하고 닫는다.
- 퍼지 매칭에서 "미매칭"인 경우도 사용자가 눈으로 보고 판단하기 쉽도록 처방전 원문과 카트 품목명을 나란히 표시.
- 수량 비교는 처방전 `finalQty`(면적 보정 후 수량) 기준 vs 카트 `qty` 기준.
</specifics>

<deferred>
## Deferred Ideas

- 사용자 매핑 편집 UI (드래그 또는 선택으로 수동 연결) — 복잡도 높음, 별도 phase
- 비교 결과로 카트 자동 수정 기능 — 현재는 표시만
- 처방이력에서 선택해서 비교하는 방식 — 이번 phase는 PDF 업로드 방식만

None — discussion stayed within phase scope
</deferred>

---

*Phase: 06-prescription-invoice-cross-check*
*Context gathered: 2026-03-27*
