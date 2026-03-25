---
phase: 04-sales-history
plan: 01
subsystem: data-layer
tags: [localStorage, transactions, CustomerDB, mirror-write]
dependency_graph:
  requires: []
  provides: [CustomerDB.saveTransaction, CustomerDB.updateTransaction, CustomerDB.listTransactions, CustomerDB.getCustomerSummary, fertilizer_transactions mirror]
  affects: [index.html saveInvoice, index.html addPayment, index.html removePayment, customerDB.js]
tech_stack:
  added: []
  patterns: [upsert by id, statusFilter enum, customerKey inline, typeof guard]
key_files:
  created: []
  modified:
    - customerDB.js
    - index.html
decisions:
  - "listTransactions statusFilter: 없으면 '삭제됨' 제외, 'unpaid'이면 미입금/일부입금만 포함"
  - "customerId 필드를 totals 바로 앞에 삽입하여 record 구조 최소 변경"
  - "typeof 가드로 CustomerDB/CustomerUI 미로드 시 안전 처리"
metrics:
  duration_minutes: 8
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 2
---

# Phase 04 Plan 01: 거래 데이터 레이어 Summary

거래 CRUD 4개 메서드(saveTransaction/updateTransaction/listTransactions/getCustomerSummary)를 CustomerDB에 추가하고, saveInvoice/addPayment/removePayment에 customerId + fertilizer_transactions 미러 쓰기를 연결.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | CustomerDB 거래 CRUD 메서드 추가 | 8a61986 | customerDB.js |
| 2 | saveInvoice/addPayment/removePayment 미러 쓰기 | 422c11a | index.html |

## What Was Built

**Task 1 — customerDB.js:**

- `saveTransaction(record)`: fertilizer_transactions에 레코드를 upsert (id 기준 덮어쓰기/추가)
- `updateTransaction(record)`: saveTransaction 위임 — addPayment/removePayment 납부 상태 동기화용
- `listTransactions(opts)`: name+phone 필터, dateFrom/dateTo 기간 필터, statusFilter('unpaid') 지원, 최신순 정렬
- `getCustomerSummary(name, phone)`: 고객별 totalAmount/totalPaid/unpaid/count 집계

**Task 2 — index.html:**

- `saveInvoice()`: record에 `customerId` 필드 추가 (CustomerUI.getCurrentCustomerId 활용, typeof 가드 포함)
- `saveInvoice()`: `pushToServer` 호출 직후 `CustomerDB.saveTransaction(record)` 미러 쓰기
- `addPayment()`: `pushToServer` 호출 직후 `CustomerDB.updateTransaction(inv)` 동기화
- `removePayment()`: `pushToServer` 호출 직후 `CustomerDB.updateTransaction(inv)` 동기화

## Decisions Made

- listTransactions의 statusFilter: 값이 없으면 '삭제됨'만 제외(전체), 'unpaid'이면 미입금/일부입금만 포함 — Plan 02 매출 UI의 두 가지 주요 조회 패턴 지원
- customerKey 로직을 customerDB.js 내부에 인라인으로 구현 — index.html 전역 함수 의존 없이 독립 동작
- customerId 필드를 record 내 totals 바로 앞에 배치 — 기존 구조 최소 수정

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — 모든 메서드가 실제 localStorage를 읽고 쓰도록 구현됨.

## Self-Check: PASSED

- customerDB.js: saveTransaction/updateTransaction/listTransactions/getCustomerSummary 4개 메서드 존재 확인
- index.html: customerId 필드, CustomerDB.saveTransaction(1회), CustomerDB.updateTransaction(2회) 존재 확인
- 커밋 8a61986, 422c11a 존재 확인
