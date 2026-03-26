# Requirements: 천연비료처방전 웹앱

**Defined:** 2026-03-24
**Core Value:** 처방전 PDF(또는 기존 처방 데이터)를 불러오면 거래명세표가 자동으로 완성되어야 한다 — 최소한의 수작업으로.

## v1 Requirements

### PDF 파싱 개선

- [x] **PARSE-01**: 복합형 처방전(천혜향 등 여러 기간/평당가 포함)에서 마지막 합계 행의 `합계=... 평당(...)` 값을 정확히 추출한다
- [x] **PARSE-02**: 광고/홍보 페이지(처방 내용 없는 이미지 페이지)를 자동으로 건너뛴다
- [x] **PARSE-03**: Vision API 응답에서 JSON 파싱 실패 시 재시도 또는 명확한 오류 메시지를 표시한다
- [x] **PARSE-04**: 홍보용(`계=홍보용`) 항목을 금액 0으로 처리하여 합계에서 제외한다

### 고객 DB

- [x] **CUST-01**: 고객 정보(이름, 작물, 면적, 할인율, 연락처)를 localStorage에 저장한다
- [x] **CUST-02**: 거래명세표 작성 시 고객 이름 자동완성으로 기존 고객을 빠르게 선택한다
- [x] **CUST-03**: 기존 고객 선택 시 할인율이 자동으로 적용된다
- [x] **CUST-04**: 고객 DB를 JSON 파일로 내보내기/가져오기 할 수 있다 (데이터 백업)
- [x] **CUST-05**: 고객별 처방이력 목록을 볼 수 있다

### 처방이력 저장

- [x] **HIST-01**: 거래명세표 발행(인쇄/저장) 시 처방 스냅샷이 자동으로 저장된다
- [x] **HIST-02**: 저장된 처방이력을 불러와 수정 후 재발행할 수 있다 (원본 유지, 복사본 편집)
- [x] **HIST-03**: 처방이력은 고객, 작물, 날짜로 검색·필터링할 수 있다

### 처방 템플릿

- [x] **TMPL-01**: 저장된 처방이력에서 유사 처방(같은 작물, 비슷한 면적)을 검색해 새 처방의 시작점으로 사용한다
- [x] **TMPL-02**: 처방 항목(제품, 수량)을 불러온 뒤 면적에 맞게 수량을 자동 비례 조정한다

### 할인율 관리

- [x] **DISC-01**: 고객별 기본 할인율을 저장하고 고객 선택 시 자동 적용한다
- [x] **DISC-02**: 세션 내에서 임시로 할인율을 변경해도 저장된 기본값은 덮어쓰지 않는다 (별도 저장 확인 필요)

### 거래이력 및 매출

- [x] **SALE-01**: 발행된 거래명세표(고객, 날짜, 금액, 품목)를 저장한다
- [x] **SALE-02**: 거래별 납부 여부(납부완료/미납)를 기록한다
- [x] **SALE-03**: 미납 거래를 목록으로 조회한다 (미수금 관리)
- [ ] **SALE-04**: 기간별(월/분기) 매출 합계를 조회한다
- [ ] **SALE-05**: 고객별 총 거래금액 및 미수금을 조회한다

### 거래명세표 인쇄/PDF

- [ ] **PRINT-01**: 구버전 외부 거래명세표 PDF(##TN## 마커 없음)를 업로드하면 올바르게 불러온다
- [ ] **PRINT-02**: 인쇄 시 푸터(합계/서명란)가 페이지 경계에서 잘리거나 다음 페이지로 단독 넘어가지 않는다
- [ ] **PRINT-03**: PDF 저장 및 인쇄 시 ##TN## 데이터 코드 페이지가 출력물에 나타나지 않는다
- [ ] **PRINT-04**: 제품이 많아 2페이지 이상 필요할 때 각 페이지에 헤더·표·푸터가 포함된 완전한 양식이 반복된다

## v2 Requirements

### 고급 기능

- **SYNC-01**: Google Apps Script를 통한 클라우드 자동 백업
- **REPORT-01**: 매출 차트(월별 추이) 시각화
- **MULTI-01**: 여러 기기 간 데이터 동기화
- **NOTIF-01**: 미수금 알림 (발행 후 X일 경과 시)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 로그인/권한 시스템 | 내부 1-2인 사용, 불필요한 복잡도 |
| 모바일 네이티브 앱 | 웹 반응형으로 충분 |
| 재고 관리 | 별도 시스템에서 처리 |
| 외부 고객 포털 | 내부 업무용 도구 |
| 실시간 다중 사용자 | localStorage 기반, v1은 단일 기기 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PARSE-01 | Phase 1 | Complete |
| PARSE-02 | Phase 1 | Complete |
| PARSE-03 | Phase 1 | Complete |
| PARSE-04 | Phase 1 | Complete |
| CUST-01 | Phase 2 | Complete |
| CUST-02 | Phase 2 | Complete |
| CUST-03 | Phase 2 | Complete |
| CUST-04 | Phase 2 | Complete |
| CUST-05 | Phase 2 | Complete |
| DISC-01 | Phase 2 | Complete |
| DISC-02 | Phase 2 | Complete |
| HIST-01 | Phase 3 | Complete |
| HIST-02 | Phase 3 | Complete |
| HIST-03 | Phase 3 | Complete |
| TMPL-01 | Phase 3 | Complete |
| TMPL-02 | Phase 3 | Complete |
| SALE-01 | Phase 4 | Complete |
| SALE-02 | Phase 4 | Complete |
| SALE-03 | Phase 4 | Complete |
| SALE-04 | Phase 4 | Pending |
| SALE-05 | Phase 4 | Pending |
| PRINT-01 | Phase 5 | Pending |
| PRINT-02 | Phase 5 | Pending |
| PRINT-03 | Phase 5 | Pending |
| PRINT-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after initial definition*
