---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: v1.1
status: In Progress
stopped_at: Completed 08-01-PLAN.md
last_updated: "2026-03-27T00:15:00.000Z"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 1
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-24)

**Core value:** 처방전 PDF(또는 기존 처방 데이터)를 불러오면 거래명세표가 자동으로 완성되어야 한다 — 최소한의 수작업으로.
**Current focus:** All 6 phases complete — milestone v1.0 done

## Current Position

Phase: 8 (in progress)
Plan: 1 complete

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
| Phase 01-pdf P01 | 15 | 2 tasks | 3 files |
| Phase 01-pdf P02 | 5 | 2 tasks | 2 files |
| Phase 02 P01 | 10 | 2 tasks | 1 files |
| Phase 02-db P02 | 5 | 2 tasks | 2 files |
| Phase 03-history P01 | 5 | 2 tasks | 3 files |
| Phase 03-history P02 | 3 | 1 tasks | 1 files |
| Phase 04-sales-history P01 | 8 | 2 tasks | 2 files |
| Phase 05-pdf P01 | 2 | 4 tasks | 1 files |

## Accumulated Context

### Roadmap Evolution

- Phase 6 added: 처방전↔거래명세표 대조 검토

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- 바닐라 JS 유지 — 빌드 없이 바로 실행, 기존 코드와 일관성
- 평당가: 최종 합계 행에서만 추출 — 복합형 처방전의 중간 행 평당가는 부분값
- localStorage로 고객 DB 시작 — 서버 없이 단독 실행 가능
- [Phase 01-pdf]: 합계 행 평당가(pyeongFromTotal) 우선, pyeongLastSeen fallback — 복합형 처방전 중간 행 덮어쓰기 버그 수정
- [Phase 01-pdf]: 비용 페이지 감지 후 break — 이후 광고/홍보 페이지 전체 파싱 차단
- [Phase 01-pdf]: 홍보용 항목 0원 처리: productRaw/productName/stageRaw 세 필드 모두 검사
- [Phase 01-pdf]: localStorage로 고객 DB 시작 — 서버 없이 단독 실행 가능, 추후 서버 DB로 이전 가능
- [Phase 01-pdf]: customerDB.js IIFE 패턴으로 window.CustomerDB 네임스페이스 노출 — 빌드 도구 없이 전역 접근 가능
- [Phase 02]: discountRate 0-100 정수 강제: save() 진입 시점에서 Math.max/min/round로 단일 처리
- [Phase 02]: CustomerDB.search(): 빈 쿼리 시 [] 반환, trim+toLowerCase로 공백·대소문자 무시
- [Phase 02-db]: customerUI.js: mousedown on ac items prevents blur-before-click race condition
- [Phase 02-db]: _savedDiscount closure variable tracks DB baseline for gDisc temp/saved state comparison
- [Phase 03-history]: 발행 시 자동 저장 trigger: saveInvoice() 직후 _savePrescrSnapshotSafe() 호출 — 별도 저장 버튼 불필요
- [Phase 03-history]: window.CustomerUI IIFE 안 DOMContentLoaded 밖 배치 — closure 접근 + DOM 불필요 조기 노출
- [Phase 03-history]: 템플릿 배너 버튼 이벤트: document click delegation 방식 — 동적 삽입 요소 이벤트 안전 처리
- [Phase 04-sales-history]: listTransactions statusFilter: 없으면 삭제됨 제외, 'unpaid'이면 미입금/일부입금만 포함
- [Phase 04-sales-history]: customerKey 로직을 customerDB.js 내부에 인라인 구현 — index.html 전역 함수 의존 없이 독립 동작
- [Phase 05-pdf]: ##TN## 저장 방식: addPage(연한회색) → pdf.setProperties(subject) 메타데이터로 이동 — 출력물 완전 불가시
- [Phase 05-pdf]: doPdf async 전환: .then() 체인 제거, .p-wrap별 개별 html2canvas 캡처로 다중 페이지 정확 분리
- [Phase 07-01]: select 안전 대입: .value= 직접 대입 대신 for-loop options 순회 — 옵션 미존재 시 기존 선택 유지
- [Phase 07-01]: AUTO-02 Method B: parseRxPdfCoords가 stages 배열만 반환하므로 stages.area 빈도 분석으로 totalArea 추론
- [Phase 07-01]: UX-01 toggleStageCard: 전체 재렌더 없이 DOM 직접 조작 → textarea 포커스 유지
- [Phase 08-01]: 분기 범위: lastQ<0이면 lastQ=3, year-=1 — 1월 기준 전년도 4분기 경계 처리
- [Phase 08-01]: 고객별 집계 payments.cancelled 제외: payments 배열 우선, paidAmount fallback으로 이중 데이터 구조 호환

### Pending Todos

None yet.

### Blockers/Concerns

- 고객명 매칭 기준 미결정: PDF `farmInfo.farmName`과 localStorage `name` 부분 매칭 수준 확인 필요 (예: "홍길동 농원" vs "홍길동")
- 처방이력 저장 trigger 미결정: 인쇄 버튼 vs 별도 저장 버튼 — UX 확인 필요
- discountRate 단위 통일 필요: 0~100 정수(%) 권장, 구현 전 확정

## Session Continuity

Last session: 2026-03-27T00:15:00.000Z
Stopped at: Completed 08-01-PLAN.md
Resume file: None
