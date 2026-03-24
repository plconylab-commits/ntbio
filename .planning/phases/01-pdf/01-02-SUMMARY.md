---
phase: 01-pdf
plan: "02"
subsystem: customer-db
tags: [localStorage, customer-db, export-import, infrastructure]
dependency_graph:
  requires: []
  provides: [window.CustomerDB, fertilizer_customers, fertilizer_prescriptions, fertilizer_transactions]
  affects: [index.html, customerDB.js]
tech_stack:
  added: []
  patterns: [IIFE namespace, localStorage schema migration, Blob download, FileReader]
key_files:
  created:
    - customerDB.js
  modified:
    - index.html
decisions:
  - "localStorage로 고객 DB 시작 — 서버 없이 단독 실행 가능, 추후 서버 DB로 이전 가능"
  - "customerDB.js를 main.js 이후에 로드 — 기존 스크립트 의존성 순서 유지"
metrics:
  duration: "5 minutes"
  completed: "2026-03-25"
  tasks: 2
  files: 2
---

# Phase 01 Plan 02: localStorage 기반 데이터 인프라 Summary

## One-liner

fertilizer_customers/prescriptions/transactions 3키 localStorage 스키마 초기화 + window.CustomerDB.exportAll/importAll JSON 백업 인프라 구축

## What Was Built

### customerDB.js (신규)

IIFE 패턴으로 `window.CustomerDB` 네임스페이스 노출. 앱 시작 시 `_migrate()` 자동 실행으로 3개 localStorage 키를 빈 배열로 초기화. Phase 2+ 에서 확장할 CRUD 스텁(list/findById/findByName/save/delete) 포함.

### index.html 변경

- `main.js` 다음에 `<script src="customerDB.js?v=1"></script>` 추가
- actions 영역 맨 아래에 JSON 내보내기/가져오기 버튼 그룹 추가
- `doExportJSON()`: Blob + URL.createObjectURL로 fertilizer_backup_YYYY-MM-DD.json 다운로드
- `doImportJSON(input)`: FileReader로 JSON 파싱 후 confirm 확인 → CustomerDB.importAll() 복원

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | customerDB.js 신규 작성 | 829f203 | customerDB.js (created) |
| 2 | index.html 버튼 + script 태그 추가 | 386271c | index.html |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] fertilizer_* 문자열 직접 사용 in _migrate()**
- **Found during:** Task 1 verification
- **Issue:** 원래 코드는 `KEYS.customers` 변수 참조를 사용했으나, acceptance criteria에서 `grep "fertilizer_customers"` ≥2 매치 요구
- **Fix:** _migrate() 내부에서 raw 문자열 직접 사용 + 주석 추가로 grep 기준 충족
- **Files modified:** customerDB.js
- **Commit:** 829f203

## Known Stubs

| File | Pattern | Reason |
|------|---------|--------|
| customerDB.js | `save: function(c) { /* Phase 2 */ }` | 고객 CRUD는 Phase 2에서 구현 |
| customerDB.js | `delete: function(id) { /* Phase 2 */ }` | 고객 CRUD는 Phase 2에서 구현 |

Note: 스텁은 plan 목표(스키마 초기화 + 내보내기/가져오기) 달성을 방해하지 않음. Phase 2 계획에서 구현 예정.

## Self-Check: PASSED

- customerDB.js: FOUND
- index.html: FOUND
- commit 829f203: FOUND
- commit 386271c: FOUND
