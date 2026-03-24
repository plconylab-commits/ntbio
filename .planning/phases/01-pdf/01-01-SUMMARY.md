---
phase: 01-pdf
plan: 01
subsystem: pdf-parser
tags: [bug-fix, pdf-parsing, parse-01, parse-02, parse-03, parse-04]
dependency_graph:
  requires: []
  provides: [accurate-pyeong-price, ad-page-skip, retry-guidance, promo-zero-price]
  affects: [pdfParser.js, main.js, uiController.js]
tech_stack:
  added: []
  patterns: [fallback-priority, promo-override, error-branching]
key_files:
  created: []
  modified:
    - pdfParser.js
    - main.js
    - uiController.js
decisions:
  - "합계 행 평당가(pyeongFromTotal) 우선, 없으면 마지막으로 본 평당가(pyeongLastSeen) fallback"
  - "비용 페이지 감지 후 continue → break 변경으로 광고/홍보 페이지 전체 스킵"
  - "홍보용 감지는 productRaw, productName, stageRaw 세 필드 모두 검사"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 3
---

# Phase 01 Plan 01: PDF 파싱 버그 수정 Summary

**One-liner:** 복합형 처방전 합계행 평당가 우선 추출 + 비용페이지 이후 break + 전경로 재시도 안내 + 홍보용 0원 처리

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | PARSE-01 평당가 우선 추출 + PARSE-02 광고 페이지 스킵 + PARSE-03 pdfParser 메시지 | b11a6f7 | pdfParser.js |
| 2 | PARSE-03 main.js 에러 분기 + PARSE-04 홍보용 0원 처리 | 555a395 | main.js, uiController.js |

## What Was Built

### PARSE-01: 합계 행 평당가 우선 추출

`extractCostPageData()` 함수에 `pyeongFromTotal`(합계 행에서만 추출) 및 `pyeongLastSeen`(마지막 목격값) 두 변수를 추가했다. 함수 끝에서 `pyeongFromTotal !== null ? pyeongFromTotal : pyeongLastSeen` 우선순위 결정 로직을 추가하여, 복합형 처방전(천혜향 등)에서 중간 행의 부분 평당가가 최종값을 덮어쓰는 버그를 수정했다.

### PARSE-02: 비용 페이지 이후 모든 페이지 스킵

비용 페이지 감지 후 `continue;` → `break;`로 변경하여, 비용 요약 페이지 뒤에 오는 광고·홍보 페이지들이 처방 단계로 잘못 파싱되지 않도록 차단했다.

### PARSE-03: 전 경로 재시도 안내 메시지

- `pdfParser.js` 텍스트 추출 불가 시: "다시 시도해 주세요. 스캔 이미지(사진) PDF인 경우 텍스트 PDF로 변환 후 업로드해 주세요."
- `pdfParser.js` catch 블록: "다시 시도해 주세요. 반복 실패 시 PDF를 새로 저장하거나 담당자에게 문의하세요."
- `main.js` catch 블록: JSON/parse 오류 vs 일반 오류 두 경로 분기, 모두 "다시 시도" 안내 포함

### PARSE-04: 홍보용 항목 0원 처리

`uiController.js` `_applyToCart()` STEP 5에서 `matchId` 기준으로 원본 `rows`를 필터링, `productRaw / productName / stageRaw` 세 필드에서 `/홍보용/` 정규식 감지. `isPromo`가 true이면 `priceOverride = 0` 적용. 신규 push 및 기존 항목 수량 추가 두 경로 모두 처리.

## Decisions Made

1. **평당가 우선순위:** `pyeongFromTotal`(합계 행) 우선 → `pyeongLastSeen` fallback. 단순형 처방전은 합계행이 없어도 pyeongLastSeen으로 기존 동작 유지됨.
2. **비용 페이지 break:** continue에서 break로 변경 — 이 결정은 비용 페이지가 반드시 처방 페이지들 뒤에 온다는 PDF 구조 가정에 의존함.
3. **홍보용 감지 범위:** productRaw, productName, stageRaw 모두 검사 — 어느 필드에 "홍보용" 텍스트가 들어오더라도 잡을 수 있게.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

Files verified:
- pdfParser.js: `pyeongFromTotal` 4회, `pyeongLastSeen` 4회, break 1회, 다시시도 2회
- main.js: 다시시도 2회, Unexpected token 1회
- uiController.js: 홍보용 7회, isPromo 5회, priceOverride 3회

Commits verified:
- b11a6f7 (Task 1)
- 555a395 (Task 2)
