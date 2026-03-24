# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-24)

**Core value:** 처방전 PDF(또는 기존 처방 데이터)를 불러오면 거래명세표가 자동으로 완성되어야 한다 — 최소한의 수작업으로.
**Current focus:** Phase 1 — PDF 파싱 수정 + 기반 인프라

## Current Position

Phase: 1 of 4 (PDF 파싱 수정 + 기반 인프라)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-24 — ROADMAP.md initialized

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- 바닐라 JS 유지 — 빌드 없이 바로 실행, 기존 코드와 일관성
- 평당가: 최종 합계 행에서만 추출 — 복합형 처방전의 중간 행 평당가는 부분값
- localStorage로 고객 DB 시작 — 서버 없이 단독 실행 가능

### Pending Todos

None yet.

### Blockers/Concerns

- 고객명 매칭 기준 미결정: PDF `farmInfo.farmName`과 localStorage `name` 부분 매칭 수준 확인 필요 (예: "홍길동 농원" vs "홍길동")
- 처방이력 저장 trigger 미결정: 인쇄 버튼 vs 별도 저장 버튼 — UX 확인 필요
- discountRate 단위 통일 필요: 0~100 정수(%) 권장, 구현 전 확정

## Session Continuity

Last session: 2026-03-24
Stopped at: ROADMAP.md and STATE.md created. Ready to plan Phase 1.
Resume file: None
