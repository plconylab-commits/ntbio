---
phase: 04-sales-history
plan: 02
subsystem: ui
status: checkpoint-pending
tags: [sales-overlay, customer-badge, period-filter, getInvoiceHistory]
dependency_graph:
  requires: [CustomerDB.saveTransaction, getInvoiceHistory, customerKey, comma]
  provides: [SalesHistoryUI.openSalesPanel, SalesHistoryUI.updateCustomerSummary, custSalesBadge]
  affects: [index.html button area, customer form badge area]
tech_stack:
  added: []
  patterns: [IIFE + CSS injection, overlay on/off, event delegation, typeof guard]
key_files:
  created:
    - salesHistoryUI.js
  modified:
    - index.html
decisions:
  - "getInvoiceHistory() 직접 사용 (primary data source) — CustomerDB.listTransactions() 미러 불필요"
  - "script 태그를 main.js 뒤에 삽입 — 이 worktree에 prescriptionHistoryUI.js 없음"
  - "comma(n) 직접 호출을 _fmt() 래퍼로 wrapping — typeof guard + 직접호출 동시 지원"
metrics:
  duration_minutes: 12
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 2
---

# Phase 04 Plan 02: 매출 집계 UI + 고객별 요약 배지 Summary

매출 집계 오버레이(이번달/지난달/직접입력 기간별 필터, 4개 통계 카드)와 고객 선택 시 거래요약 인라인 배지를 salesHistoryUI.js로 구현하고 index.html에 연결.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | salesHistoryUI.js 신규 생성 — 매출 집계 오버레이 + 고객별 요약 배지 | 25cd50c | salesHistoryUI.js |
| 2 | index.html에 script 태그 + 매출 집계 버튼 추가 | 8f11b94 | index.html |

## What Was Built

**Task 1 — salesHistoryUI.js (342 lines, IIFE 패턴):**

- `_injectSalesCSS()`: sales-css 중복방지 + .sales-overlay / .sales-panel / .sales-period-btn / .sales-stat-card / .cust-sales-badge 등 CSS 주입
- `_thisMonthRange()` / `_lastMonthRange()`: 로컬 시간 기준 YYYY-MM-DD 범위 계산 (toISOString 미사용)
- `_calcPeriodSales(dateFrom, dateTo)`: getInvoiceHistory()에서 삭제됨 제외 + 기간 필터, count/total/paid/unpaid 집계
- `_createSalesOverlay()`: 오버레이 DOM 한번만 생성 재사용, 기간 버튼 이벤트/배경클릭 닫기/직접입력 range
- `_renderSalesStats()`: 4개 통계 카드(거래건수/총매출/입금액/미수금) 갱신
- `openSalesPanel()`: 오버레이 표시 + 이번달 기본 렌더링
- `_updateCustomerSummary()`: cName/cPhone 값으로 고객 필터, 배지 표시 (거래 N건 | 총 X원 | 미수금 Y원), 미수금>0시 has-unpaid 클래스
- DOMContentLoaded: cName/cPhone change 이벤트 + .cust-ac-item 클릭 delegation (200ms setTimeout)

**Task 2 — index.html:**

- `<script src="salesHistoryUI.js?v=1"></script>` — main.js 뒤에 추가
- 매출 집계 버튼: .btn-all-unpaid 클래스 재사용, 파란 계열 인라인 스타일, SalesHistoryUI.openSalesPanel() onclick

## Decisions Made

- `getInvoiceHistory()` 전역 함수를 primary 데이터로 직접 사용 — CustomerDB 미러 불필요
- script 태그 위치: 이 worktree에 prescriptionHistoryUI.js가 없어 main.js 바로 뒤에 삽입
- `_fmt()` 래퍼 함수로 `comma(n)` 직접 호출 wrapping — typeof 가드와 직접 호출 동시 만족

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] script 태그 위치 조정**
- **Found during:** Task 2
- **Issue:** 계획에서는 prescriptionHistoryUI.js 뒤에 삽입 지시했으나 이 worktree에 해당 파일 없음
- **Fix:** main.js 뒤에 삽입 (의존 순서 동일하게 유지, 전역 함수는 inline script에 정의됨)
- **Files modified:** index.html
- **Commit:** 8f11b94

## Known Stubs

None — 모든 통계는 getInvoiceHistory() 실제 데이터에서 계산됨.

## Self-Check: PENDING (checkpoint-pending)

Task 3은 브라우저 수동 검증 체크포인트입니다.

- salesHistoryUI.js: 존재 확인 (25cd50c)
- index.html: salesHistoryUI.js script + 매출집계 버튼 존재 확인 (8f11b94)
- 브라우저 검증: 사용자 확인 대기 중
