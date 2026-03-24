---
phase: 1
slug: pdf
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | 없음 — 바닐라 JS (브라우저 앱). Node.js 스크립트로 단위 검증 |
| **Config file** | none |
| **Quick run command** | `node -e "require('./pdfParser.js')" 2>&1` |
| **Full suite command** | `node .planning/phases/01-pdf/validate.js 2>&1` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node -e "require('./pdfParser.js')" 2>&1`
- **After every plan wave:** Run `node .planning/phases/01-pdf/validate.js 2>&1`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| PARSE-01 fix | 01 | 1 | PARSE-01 | grep | `grep -c "pyeongFromTotal" pdfParser.js` → ≥1 | ⬜ pending |
| PARSE-02 fix | 01 | 1 | PARSE-02 | grep | `grep -c "break" pdfParser.js` → isCostPage 이후 break 존재 | ⬜ pending |
| PARSE-03 fix | 01 | 1 | PARSE-03 | grep | `grep -c "재시도" main.js` or `grep -c "retry" main.js` → ≥1 | ⬜ pending |
| PARSE-04 fix | 01 | 1 | PARSE-04 | grep | `grep -c "홍보용" uiController.js` → ≥1 | ⬜ pending |
| localStorage init | 01 | 1 | infra | grep | `grep -c "fertilizer_customers" customerDB.js` → ≥1 | ⬜ pending |
| JSON export/import | 01 | 1 | infra | grep | `grep -c "exportAll\|importAll" customerDB.js` → ≥2 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pdfParser.js` — 파일 직접 수정 (no test framework needed, grep verification)

*Existing vanilla JS infrastructure — no test framework to install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 복합형 처방전 평당가 정확성 | PARSE-01 | 실제 PDF 업로드 필요 | 천혜향(550평) PDF 업로드 → 평당가 확인 |
| 광고 페이지 스킵 | PARSE-02 | 실제 PDF 필요 | 광고 페이지 포함 PDF 업로드 → 광고 내용 없음 확인 |
| JSON export/import 버튼 | infra | 브라우저 UI 필요 | 버튼 클릭 → JSON 파일 다운로드/업로드 작동 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
