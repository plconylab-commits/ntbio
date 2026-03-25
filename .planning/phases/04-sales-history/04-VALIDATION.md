---
phase: 4
slug: sales-history
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | manual browser + console checks (no build tools / no test runner) |
| **Config file** | none |
| **Quick run command** | `open http://localhost:8765` — visual smoke test |
| **Full suite command** | manual checklist below |
| **Estimated runtime** | ~5 minutes manual |

---

## Sampling Rate

- **After every task commit:** Check browser console for errors
- **After every plan wave:** Run full manual checklist
- **Before `/gsd:verify-work`:** All checklist items must pass
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | SALE-01 | manual | browser: 거래명세표 저장 후 납부 입력 | ✅ | ⬜ pending |
| 4-01-02 | 01 | 1 | SALE-02 | manual | browser: 미수금 목록 오버레이 열기 | ✅ | ⬜ pending |
| 4-02-01 | 02 | 2 | SALE-03 | manual | browser: 기간 필터 매출 집계 | ✅ | ⬜ pending |
| 4-02-02 | 02 | 2 | SALE-04 | manual | browser: 고객별 미수금 요약 | ✅ | ⬜ pending |
| 4-02-03 | 02 | 2 | SALE-05 | manual | browser: JSON exportAll에 transactions 포함 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements (vanilla JS, no test runner).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 납부 금액 입력 후 잔액 갱신 | SALE-01 | DOM 인터랙션 | 거래명세표 저장 → 납부금액 입력 → 잔액/상태 확인 |
| 미수금 목록 표시 | SALE-02 | DOM 오버레이 | 미수금 버튼 클릭 → 미납 거래 목록 확인 |
| 기간별 매출 집계 | SALE-03 | 날짜 필터 UI | 이번달 선택 → 합계 금액 확인 |
| 고객별 미수금 | SALE-04 | 고객 선택 UI | 고객 선택 → 거래금액/미수금 잔액 확인 |
| localStorage 백업 | SALE-05 | exportAll JSON | JSON 내보내기 → transactions 배열 내용 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
