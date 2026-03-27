---
phase: 07-prescription-auto-fill-ux
plan: "01"
subsystem: prescription-ux
tags: [auto-fill, ux, select-fix, stage-collapse, pdf-parse]
dependency_graph:
  requires: []
  provides: [AUTO-01, AUTO-02, UX-01]
  affects: [main.js, index.html, 처방전.html]
tech_stack:
  added: []
  patterns: [for-loop select matching, frequency analysis area inference, isOpen runtime flag, DOM direct manipulation]
key_files:
  created: []
  modified:
    - main.js
    - index.html
    - 처방전.html
decisions:
  - "select 안전 대입: .value= 직접 대입 대신 for-loop으로 options 순회 → 옵션 미존재 시 기존 선택 유지"
  - "AUTO-02 추론 방식: parseRxPdfCoords가 stages 배열만 반환하므로 Method B 선택 — stages.area 빈도 분석"
  - "UX-01 toggleStageCard: 전체 재렌더 없이 DOM 직접 조작 → textarea 포커스 유지"
  - "isOpen 직렬화 제외: runtime 전용 플래그, localStorage 영속화 불필요"
  - "합치기/삭제 버튼 stopPropagation: stage-head onclick과 충돌 방지"
metrics:
  duration_minutes: 15
  completed_date: "2026-03-27"
  tasks_completed: 3
  files_modified: 3
---

# Phase 7 Plan 01: Auto-Fill + UX Stage Collapse Summary

처방전 PDF 불러오기 시 cCrop select 안전 대입, bArea 자동 주입, 처방전 단계 카드 초기 접힘/토글 구현.

## What Was Built

### Task 1: AUTO-01 — cCrop select 안전 대입 (main.js + index.html)

`#cCrop` select 요소에 `.value =` 직접 대입 시 옵션에 없는 값이면 선택이 초기화되는 버그를 수정했다.

- **main.js** (handlePrescriptionUpload): `fi.cropName` → `el.options[i].value` 비교 for-loop으로 교체
- **index.html** (applyRxPdfEmbed): `d.cr` 직접 대입 → for-loop 패턴으로 교체. `d.cr`이 없으면 기존 선택 건드리지 않음

### Task 2: AUTO-02 — 처방전.html 외부 PDF 경로 bArea 자동 주입

`parseRxPdfCoords`가 stages 배열만 반환하는 구조(Method B)를 확인 후, stages의 `s.area` 필드 빈도 분석으로 totalArea를 추론해 `#bArea`에 자동 기입한다.

- `onRxPdfSelected`의 `parsed.length > 0` 블록에 추가
- 기존 `bAreaEl.value` 값이 있으면 덮어쓰지 않음
- `rxData.area`도 기존 값 있으면 유지

### Task 3: UX-01 — stage-card 접힘/펼침

5개 변경을 처방전.html에 적용했다:

1. CSS: `.stage-body.collapsed { display: none; }` + `.stage-head { cursor:pointer; user-select:none; }` 추가
2. makeCard(): `stage-head`에 `onclick="toggleStageCard(${si})"` 추가, `stage-body`에 `isCollapsed` 조건부 collapsed 클래스
3. makeCard(): 합치기/삭제 버튼에 `event.stopPropagation()` 추가 (헤더 클릭 이벤트 전파 방지)
4. renderStages(): 첫 렌더 시 `stages[0].isOpen === undefined`인 경우만 `stages[0].isOpen = true` 설정
5. `toggleStageCard(si)`: DOM 직접 조작으로 `.stage-body` collapsed 토글 (포커스 유지)
6. `_saveRxStages()`: isOpen 미포함 확인 — 변경 없음

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] 합치기/삭제 버튼 stopPropagation 추가**
- **Found during:** Task 3
- **Issue:** stage-head에 onclick="toggleStageCard()" 추가 시, 하위 버튼(합치기, 삭제) 클릭이 헤더 onclick도 함께 발동할 수 있음
- **Fix:** 두 버튼에 `event.stopPropagation()` 추가
- **Files modified:** 처방전.html
- **Commit:** 156a3ea

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | a1bfbb7 | fix(07-01): AUTO-01 cCrop select 안전 대입 — for-loop 패턴으로 교체 |
| 2 | d74c85a | feat(07-01): AUTO-02 외부 처방전 PDF bArea 자동 주입 |
| 3 | 156a3ea | feat(07-01): UX-01 단계 카드 접힘/펼침 구현 |

## Known Stubs

None — all three features are fully wired to production code paths.

## Self-Check: PASSED

- main.js for-loop pattern: FOUND (line 40)
- index.html for-loop pattern: FOUND (lines 2408-2413)
- 처방전.html bArea injection: FOUND (lines 4745-4752)
- 처방전.html .stage-body.collapsed CSS: FOUND (line 144)
- 처방전.html toggleStageCard(): FOUND (line 1761)
- _saveRxStages: isOpen NOT present — CORRECT
