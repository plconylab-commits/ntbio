# Milestones

## v1.0 — 천연비료처방전 MVP

**Shipped:** 2026-03-27
**Phases:** 1–6 | **Plans:** 11 | **Timeline:** 17 days (2026-03-10 → 2026-03-27)
**Requirements:** 29/31 complete (SALE-04/05 deferred)

### Delivered

처방전 PDF 파싱·거래명세표 자동 완성 기반 위에 고객 DB, 처방이력, 거래이력·미수금, 인쇄/PDF 버그 수정, 처방전↔거래명세표 diff 대조 기능을 바닐라 JS + localStorage 구조로 구축.

### Key Accomplishments

1. PDF 파싱 4종 버그 수정 — 복합형 처방전 평당가 정확 추출, 광고 페이지 스킵, 홍보용 항목 0원 처리
2. 고객 DB — CustomerDB.js CRUD + customerUI.js 자동완성·할인율·처방이력 배지
3. 처방이력 + 템플릿 — 발행 시 자동 스냅샷, 이력 필터링·불러오기, 면적 비례 수량 조정
4. 거래이력 + 미수금 — salesHistoryUI.js 매출 집계 오버레이, 납부 기록, 미수금 목록
5. 인쇄/PDF 4종 버그 수정 — 구버전 PDF, 푸터 분리 방지, ##TN## 숨김, 다중 페이지
6. 처방전↔거래명세표 대조 — rxCompare.js(퍼지 매칭·43 tests) + rxCompareUI.js(diff 모달)

### Known Gaps

- **SALE-04**: 기간별(월/분기) 매출 합계 조회 — 미구현
- **SALE-05**: 고객별 총 거래금액 및 미수금 조회 — 미구현

### Archive

- `.planning/milestones/v1.0-ROADMAP.md` — 전체 로드맵 아카이브
- `.planning/milestones/v1.0-REQUIREMENTS.md` — 요구사항 아카이브

---
