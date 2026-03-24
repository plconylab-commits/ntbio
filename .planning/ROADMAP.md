# Roadmap: 천연비료처방전 웹앱

## Overview

기존 처방전 PDF 파싱 + 거래명세표 UI 위에 고객 DB, 처방이력, 할인율 관리, 매출 추적을 추가하는 마일스톤이다. 평당가 파싱 버그를 먼저 수정해 데이터 정확성을 확보하고, 고객 레코드를 기반으로 이력 저장 → 템플릿 활용 → 미수금/매출 집계 순서로 쌓아간다. 바닐라 JS + localStorage 구조를 유지하며 새 파일을 추가하는 방식으로 회귀 위험을 최소화한다.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: PDF 파싱 수정 + 기반 인프라** - 평당가 버그 수정 및 localStorage 스키마/JSON export 기반 구축
- [ ] **Phase 2: 고객 DB + 할인율** - 고객 자동완성, 할인율 저장/자동 적용, JSON 백업
- [ ] **Phase 3: 처방이력 + 템플릿** - 발행 시 자동 저장, 이력 불러오기, 유사 처방 템플릿 추천
- [ ] **Phase 4: 거래이력 + 미수금 + 매출** - 납부 기록, 미수금 목록, 기간별 매출 집계

## Phase Details

### Phase 1: PDF 파싱 수정 + 기반 인프라
**Goal**: 처방전 파싱이 정확하고, 이후 모든 데이터 저장의 기반 스키마가 준비된다
**Depends on**: Nothing (first phase)
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04
**Success Criteria** (what must be TRUE):
  1. 복합형 처방전(천혜향 등)을 파싱하면 최종 합계 행의 평당가만 추출된다 — 중간 소계 행 평당가가 덮어쓰지 않는다
  2. 광고/홍보 이미지 페이지가 포함된 PDF를 업로드해도 처방 항목에 광고 내용이 나타나지 않는다
  3. Vision API 응답이 JSON이 아닌 형태로 오더라도 앱이 멈추지 않고 사용자에게 재시도 안내 메시지를 보여준다
  4. `계=홍보용` 항목은 거래명세표 합계에 0원으로 반영된다
  5. localStorage에 `fertilizer_customers`, `fertilizer_prescriptions`, `fertilizer_transactions` 키가 초기화되고 JSON 전체 내보내기/가져오기 버튼이 작동한다
**Plans:** 1/2 plans executed
Plans:
- [x] 01-01-PLAN.md — PDF 파싱 버그 4건 수정 (PARSE-01~04)
- [ ] 01-02-PLAN.md — localStorage 기반 인프라 + JSON 내보내기/가져오기

### Phase 2: 고객 DB + 할인율
**Goal**: 고객 정보를 저장하고 재사용할 수 있으며, 고객별 할인율이 자동으로 적용된다
**Depends on**: Phase 1
**Requirements**: CUST-01, CUST-02, CUST-03, CUST-04, CUST-05, DISC-01, DISC-02
**Success Criteria** (what must be TRUE):
  1. 고객 이름을 입력하면 저장된 고객 목록이 드롭다운으로 표시되고, 선택하면 이름/작물/면적/연락처가 폼에 자동 채워진다
  2. 기존 고객을 선택하면 저장된 할인율이 할인율 필드에 자동으로 적용된다
  3. 할인율을 세션 중 임시로 바꿔도 저장 버튼을 누르지 않으면 기존 고객 기본값이 변경되지 않는다
  4. 고객 DB 전체를 JSON 파일로 내보낼 수 있고, 그 파일을 가져오면 데이터가 복원된다
  5. 특정 고객을 선택했을 때 그 고객의 처방이력 건수를 볼 수 있다
**Plans**: TBD
**UI hint**: yes

### Phase 3: 처방이력 + 템플릿
**Goal**: 발행한 처방전이 자동으로 저장되고, 저장된 이력을 재사용하거나 새 처방의 시작점으로 쓸 수 있다
**Depends on**: Phase 2
**Requirements**: HIST-01, HIST-02, HIST-03, TMPL-01, TMPL-02
**Success Criteria** (what must be TRUE):
  1. 거래명세표를 인쇄하거나 저장하면 처방 스냅샷이 자동으로 localStorage에 기록된다 — 원본은 이후 수정되지 않는다
  2. 처방이력 목록에서 과거 처방을 선택하면 장바구니와 고객 정보가 복원되어 수정 후 새 명세표로 발행할 수 있다
  3. 처방이력을 고객명, 작물, 날짜 조건으로 필터링해서 찾을 수 있다
  4. 같은 작물의 기존 처방을 새 처방의 템플릿으로 지정하면, 새 고객 작물 입력 시 추천 배너가 나타난다
  5. 템플릿에서 불러온 처방 항목의 수량이 새 고객의 면적에 맞게 자동으로 비례 조정된다
**Plans**: TBD
**UI hint**: yes

### Phase 4: 거래이력 + 미수금 + 매출
**Goal**: 발행된 거래명세표의 납부 상태를 추적하고 기간별 매출을 집계할 수 있다
**Depends on**: Phase 3
**Requirements**: SALE-01, SALE-02, SALE-03, SALE-04, SALE-05
**Success Criteria** (what must be TRUE):
  1. 발행된 거래명세표 카드에서 납부 금액과 날짜를 입력할 수 있고, 잔액과 납부 상태(미납/부분납/완납)가 자동으로 갱신된다
  2. 미수금 목록 화면에서 납부 완료되지 않은 거래 전체를 조회할 수 있다
  3. 기간(이번 달 / 지난 달 / 직접 입력)을 선택하면 해당 기간의 매출 합계가 표시된다
  4. 특정 고객을 선택하면 총 거래금액과 현재 미수금 잔액을 볼 수 있다
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. PDF 파싱 수정 + 기반 인프라 | 1/2 | In Progress|  |
| 2. 고객 DB + 할인율 | 0/TBD | Not started | - |
| 3. 처방이력 + 템플릿 | 0/TBD | Not started | - |
| 4. 거래이력 + 미수금 + 매출 | 0/TBD | Not started | - |
