---
phase: 3
slug: history
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — vanilla JS, browser manual verification |
| **Config file** | none |
| **Quick run command** | open browser console, check localStorage |
| **Full suite command** | manual UAT in browser |
| **Estimated runtime** | ~2 minutes |

---

## Sampling Rate

- **After every task commit:** Open app in browser, verify localStorage key `fertilizer_prescriptions`
- **After every plan wave:** Manual browser UAT of all wave features
- **Before `/gsd:verify-work`:** Full manual test of all 5 success criteria
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | HIST-01 | manual | `localStorage.getItem('fertilizer_prescriptions')` in console | ✅ | ⬜ pending |
| 3-01-02 | 01 | 1 | HIST-02 | manual | Load history modal, select past record | ✅ | ⬜ pending |
| 3-01-03 | 01 | 1 | HIST-03 | manual | Filter history by name/crop/date | ✅ | ⬜ pending |
| 3-02-01 | 02 | 2 | TMPL-01 | manual | Observe template banner on crop input | ✅ | ⬜ pending |
| 3-02-02 | 02 | 2 | TMPL-02 | manual | Verify quantity scaling by area ratio | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No test framework — vanilla JS project. All verification is manual via browser console and UI interaction.*

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 인쇄/저장 시 스냅샷 자동 기록 | HIST-01 | No test runner in project | Print/save invoice → check `JSON.parse(localStorage.getItem('fertilizer_prescriptions'))` in console |
| 과거 처방 불러오기 | HIST-02 | UI interaction required | Open history modal → select record → verify cart and customer restored |
| 이력 필터링 | HIST-03 | UI interaction required | Enter filter values → verify only matching records shown |
| 템플릿 추천 배너 | TMPL-01 | UI interaction required | Enter crop name matching existing history → verify banner appears |
| 수량 비례 조정 | TMPL-02 | Math calculation required | Load template → change area → verify quantities scale correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
