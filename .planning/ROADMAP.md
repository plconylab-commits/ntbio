# Roadmap: 천연비료처방전 웹앱

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-03-27)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–6) — SHIPPED 2026-03-27</summary>

- [x] **Phase 1: PDF 파싱 수정 + 기반 인프라** — 2/2 plans — completed 2026-03-24
- [x] **Phase 2: 고객 DB + 할인율** — 2/2 plans — completed 2026-03-25
- [x] **Phase 3: 처방이력 + 템플릿** — 2/2 plans — completed 2026-03-25
- [x] **Phase 4: 거래이력 + 미수금 + 매출** — 2/2 plans — completed 2026-03-25
- [x] **Phase 5: 거래명세표 인쇄/PDF 버그 수정** — 1/1 plan — completed 2026-03-26
- [x] **Phase 6: 처방전↔거래명세표 대조 검토** — 2/2 plans — completed 2026-03-27

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

## Active Milestone: v1.1

### Phase 7: 처방전 자동 기입 + 단계 UI 개선

**Goal:** 처방전 불러오기 시 고객이름·평수·작물이 거래명세표와 처방전 양쪽에 자동 기입되고, 처방전 단계가 현재 단계 중심으로 접힌다
**Requirements:** AUTO-01~02, UX-01
**Plans:** 1 plan

Plans:
- [x] 07-01-PLAN.md — AUTO-01 cCrop select 안전대입 + AUTO-02 bArea 주입 + UX-01 stage-card 접힘 — completed 2026-03-27

### Phase 8: 매출 집계

**Goal:** 기간별 매출 합계와 고객별 총 거래금액·미수금을 조회할 수 있다
**Requirements:** SALE-04~05
**Plans:** 0 plans — start with `/gsd:plan-phase 8`

### Phase 9: 평당가 페이지 + 이미지 첨부

**Goal:** 처방전에 평당가가 있으면 거래명세표에 평당가 페이지가 자동 추가되고, 이미지를 업로드·저장해서 거래명세표에 포함할 수 있다
**Requirements:** PRICE-01, ATTACH-01~02
**Plans:** 0 plans — start with `/gsd:plan-phase 9`

---

## Backlog

### Phase 999.1: 거래명세표 처방전 PDF 업로드 오류 (BACKLOG)

**Goal:** 거래명세표 화면에서 처방전 PDF를 업로드할 때 발생하는 오류 원인 파악 및 설계 재검토
**Plans:** 0 plans — promote with `/gsd:review-backlog` when ready

### Phase 999.2: 클라우드 동기화 (BACKLOG)

**Goal:** 여러 장소에서 동일한 데이터를 공유할 수 있도록 localStorage를 클라우드 DB로 이전
**Plans:** 0 plans — promote with `/gsd:review-backlog` when ready

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. PDF 파싱 수정 + 기반 인프라 | v1.0 | 2/2 | ✅ Complete | 2026-03-24 |
| 2. 고객 DB + 할인율 | v1.0 | 2/2 | ✅ Complete | 2026-03-25 |
| 3. 처방이력 + 템플릿 | v1.0 | 2/2 | ✅ Complete | 2026-03-25 |
| 4. 거래이력 + 미수금 + 매출 | v1.0 | 2/2 | ✅ Complete | 2026-03-25 |
| 5. 거래명세표 인쇄/PDF 버그 수정 | v1.0 | 1/1 | ✅ Complete | 2026-03-26 |
| 6. 처방전↔거래명세표 대조 검토 | v1.0 | 2/2 | ✅ Complete | 2026-03-27 |
| 7. 처방전 자동 기입 + 단계 UI 개선 | v1.1 | 1/1 | ✅ Complete | 2026-03-27 |
| 8. 매출 집계 | v1.1 | 0/? | 🔲 Planned | — |
| 9. 평당가 페이지 + 이미지 첨부 | v1.1 | 0/? | 🔲 Planned | — |
