---
phase: 6
slug: prescription-invoice-cross-check
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js + vm.runInContext (기존 프로젝트 패턴 — `rxNormalizer.v14.test.js` 참조) |
| **Config file** | 없음 — `node [파일명].test.js` 직접 실행 |
| **Quick run command** | `node rxCompareUI.test.js` |
| **Full suite command** | `node rxNormalizer.v14.test.js && node rxCompareUI.test.js` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node rxCompareUI.test.js`
- **After every plan wave:** Run `node rxNormalizer.v14.test.js && node rxCompareUI.test.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 0 | D-07, D-06, D-11, D-13 | unit stubs | `node rxCompareUI.test.js` | ❌ Wave 0 | ⬜ pending |
| 6-02-01 | 02 | 1 | D-07 퍼지 매칭 | unit | `node rxCompareUI.test.js` | ❌ Wave 0 | ⬜ pending |
| 6-02-02 | 02 | 1 | D-06 diff 분류 | unit | `node rxCompareUI.test.js` | ❌ Wave 0 | ⬜ pending |
| 6-02-03 | 02 | 1 | D-11 수량 오차 0 | unit | `node rxCompareUI.test.js` | ❌ Wave 0 | ⬜ pending |
| 6-02-04 | 02 | 1 | D-13 평당가 요약 계산 | unit | `node rxCompareUI.test.js` | ❌ Wave 0 | ⬜ pending |
| 6-03-01 | 03 | 2 | D-03 카트 불변 | manual | DOM 의존 — 수동 확인 | — | ⬜ pending |
| 6-03-02 | 03 | 2 | D-01~D-05 UI 통합 | manual | 브라우저 열고 비교 버튼 클릭 | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `rxCompareUI.test.js` — D-07 퍼지 매칭, D-06 4가지 diff row 분류, D-11 수량 오차 0, D-13 평당가 계산 unit test stubs

*기존 `rxNormalizer.v14.test.js` 패턴 참고하여 작성 (Node.js + IIFE export 방식)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 비교 후 카트 변경 없음 | D-03 | DOM + 전역 `cart` 변수 의존 | 처방전 PDF 업로드 → 비교 완료 → `cart` 배열 길이·내용 동일 확인 |
| "처방전 비교" 버튼 → 모달 오픈 | D-01, D-02 | 브라우저 DOM 의존 | 버튼 클릭 → `rxCompareOverlay` 표시 확인 |
| 빈 카트 시 toast 표시 + 모달 미오픈 | D-02 | DOM 의존 | 카트 비운 후 버튼 클릭 → 모달 미표시, toast 확인 |
| 일치 항목 토글 정상 동작 | D-06 | DOM 의존 | `일치 항목 보기` 클릭 → 행 표시/숨기기 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
