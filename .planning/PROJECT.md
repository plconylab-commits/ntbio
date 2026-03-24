# 천연비료처방전 웹앱

## What This Is

천연바이오 비료회사 내부용 웹앱. 작물별 처방전을 작성·관리하고, 처방한 비료 품목과 수량을 자동으로 거래명세표에 연동한다. 기존에 한글 파일로 수작업하던 처방→청구 흐름을 반자동화하여 고객 대응 시간을 줄이는 것이 목적이다.

## Core Value

처방전 PDF(또는 기존 처방 데이터)를 불러오면 거래명세표가 자동으로 완성되어야 한다 — 최소한의 수작업으로.

## Requirements

### Validated

- ✓ 처방전 PDF → Vision API 파싱 → 장바구니 자동 입력 — 기존 구현
- ✓ 제품 DB(옥토팜, 옥스팜, 뉴천연팜 등) 관리 — 기존 구현
- ✓ 거래명세표 UI 및 인쇄 기능 — 기존 구현
- ✓ 고객 정보(이름, 작물, 면적) 자동 입력 — 기존 구현

### Active

- [ ] 평당평균가 파싱 버그 수정 — 천혜향처럼 여러 평당가가 있는 처방전에서 `합계=... 평당(...)` 최종값만 정확히 추출
- [ ] 고객 DB — 고객 정보, 처방이력, 할인율을 로컬 저장소 또는 서버에 저장
- [ ] 기존 고객 처방 불러오기 — 저장된 처방전을 불러와 수정 후 재발행
- [ ] 작물/평수 기반 처방 템플릿 — 새 고객도 유사한 처방전 찾아서 시작점으로 활용
- [ ] 고객별 할인율 관리 — 고객마다 다른 공급가 할인율 저장·자동 적용
- [ ] 거래이력 및 매출 관리 — 발행된 명세표 저장, 미수금 추적, 기간별 매출 집계

### Out of Scope

- 외부 공개 고객 포털 — 내부 업무용이므로 로그인/권한 시스템 불필요 (v1)
- 모바일 앱(네이티브) — 웹 반응형으로 충분
- 재고 관리 — 비료 재고 추적은 별도 시스템에서 관리

## Context

- **기존 코드**: `index.html`, `main.js`, `prescriptionModel.js`, `productDB.js`, `uiController.js` 등 단일 페이지 바닐라 JS 앱이 이미 구현되어 있음. `v20/` 폴더에 이전 버전 존재.
- **처방전 구조**: PDF 1~N페이지는 단계별 처방 표(단계명/제품/면적/수량/설명), 마지막 페이지 앞쪽은 비용 요약 표(소매가/공급가/수량/계), 맨 마지막 줄에 `합계=X원 평당(X원)`. 마지막 페이지 이후는 광고(무시).
- **처방전 두 종류**:
  - 단순형(수박 등): 1장 비용 요약, 단일 평당가
  - 복합형(천혜향 등): 기비용+월별 관주/엽면으로 여러 행, 각 행마다 평당가 + 최종 합계 평당가
- **평당가 버그**: AI 파서가 중간 행의 평당가를 잘못 인식함 → 비용 요약 페이지의 마지막 합계 행에서 추출해야 함
- **홍보용 항목**: 일부 제품은 `계=홍보용`으로 표기 — 금액 0으로 처리
- **회사**: 천연바이오 (1577-5963), 담당자 010-3704-5963
- **사용자**: 회사 내부 직원 1~2명

## Constraints

- **Tech Stack**: 바닐라 JS + HTML/CSS 단일 파일 구조 유지 — 빌드 도구 없이 브라우저에서 바로 실행
- **AI API**: Claude Vision API (현재 처방전 PDF 파싱에 사용 중)
- **데이터 저장**: 현재 로컬 상태만 — 고객 DB는 `localStorage` 또는 간단한 JSON 파일 기반으로 시작
- **인쇄**: 거래명세표 및 처방전 인쇄 기능 유지 필수

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 바닐라 JS 유지 | 빌드 없이 바로 실행, 기존 코드와 일관성 | — Pending |
| 평당가: 최종 합계 행에서만 추출 | 복합형 처방전의 중간 행 평당가는 부분값 | — Pending |
| localStorage로 고객 DB 시작 | 서버 없이 단독 실행 가능, 추후 서버 DB로 이전 가능 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 after initialization*
