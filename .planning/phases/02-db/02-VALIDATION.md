---
phase: 2
slug: db
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | 없음 — 바닐라 JS (브라우저 앱). grep 기반 단위 검증 |
| **Config file** | none |
| **Quick run command** | `node -e "require('./customerDB.js')" 2>&1` |
| **Full suite command** | `grep -c "CustomerDB.save\|CustomerDB.delete\|CustomerDB.search\|CustomerDB.countPrescriptions" customerDB.js` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** `node -e "require('./customerDB.js')" 2>&1`
- **After every plan wave:** grep 검증 스크립트
- **Before `/gsd:verify-work`:** 브라우저에서 자동완성 직접 테스트
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| CustomerDB.save() | 02-01 | 1 | CUST-01 | grep | `grep -c "save(" customerDB.js` → ≥1 실제 구현 | ⬜ pending |
| CustomerDB.delete() | 02-01 | 1 | CUST-01 | grep | `grep -c "delete(" customerDB.js` → ≥1 실제 구현 | ⬜ pending |
| CustomerDB.search() | 02-01 | 1 | CUST-02 | grep | `grep -c "search(" customerDB.js` → ≥1 | ⬜ pending |
| CustomerDB.countPrescriptions() | 02-01 | 1 | CUST-05 | grep | `grep -c "countPrescriptions" customerDB.js` → ≥1 | ⬜ pending |
| discountRate 단위 확정 | 02-01 | 1 | DISC-01 | grep | `grep -c "discountRate" customerDB.js` → ≥1 | ⬜ pending |
| customerUI.js 자동완성 | 02-02 | 1 | CUST-02 | grep | `grep -c "autocomplete\|dropdown" customerUI.js` → ≥1 | ⬜ pending |
| 폼 자동 채우기 | 02-02 | 1 | CUST-02 | grep | `grep -c "cName\|cCrop\|cArea" customerUI.js` → ≥3 | ⬜ pending |
| 할인율 자동 적용 | 02-02 | 1 | CUST-03, DISC-01 | grep | `grep -c "gDisc\|sessionDiscount" customerUI.js` → ≥1 | ⬜ pending |
| 임시 할인율 분리 | 02-02 | 1 | DISC-02 | grep | `grep -c "savedDiscount\|sessionDiscount\|tempDiscount" customerUI.js` → ≥1 | ⬜ pending |
| 처방이력 건수 표시 | 02-02 | 1 | CUST-05 | grep | `grep -c "countPrescriptions" customerUI.js` → ≥1 | ⬜ pending |
| customerUI.js index.html 연결 | 02-02 | 1 | CUST-02 | grep | `grep -c "customerUI.js" index.html` → ≥1 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `customerUI.js` — 신규 파일 (Wave 0에서 빈 파일 생성 후 wave 1에서 구현)

*No test framework installation needed — vanilla JS.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 자동완성 드롭다운 표시 | CUST-02 | 브라우저 UI 필요 | #cName 입력 → 드롭다운 나타남 확인 |
| 고객 선택 시 폼 자동 채움 | CUST-02 | 브라우저 UI 필요 | 드롭다운에서 고객 선택 → 작물/면적 채워짐 확인 |
| 임시 할인율 변경 불저장 | DISC-02 | 브라우저 UX 필요 | 할인율 변경 → 저장 안 함 → 다시 선택 → 원래 할인율 복원 확인 |
| 처방이력 건수 표시 | CUST-05 | 브라우저 UI 필요 | 기존 처방 있는 고객 선택 → 건수 표시 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
