---
phase: 05-pdf
plan: 01
subsystem: ui
tags: [print, pdf, css, jspdf, html2canvas, pdfjs]

# Dependency graph
requires:
  - phase: 04-sales-history
    provides: salesHistoryUI.js, customerDB transaction tracking
provides:
  - PRINT-01: 구버전 거래명세표 PDF 업로드 안내 메시지 + Vision AI 차단
  - PRINT-02: @media print CSS — .p-wrap/p-footer-tbl page-break 규칙
  - PRINT-03: ##TN## 데이터를 PDF setProperties 메타데이터에 저장
  - PRINT-04: doPdf() async 변환 + .p-wrap 단위 개별 html2canvas 캡처
affects: [future-print, future-pdf-import]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PDF 메타데이터(subject 필드)에 데이터 저장 — 출력물에 보이지 않음"
    - ".p-wrap 단위 개별 html2canvas 캡처로 다중 페이지 경계 정확히 일치"
    - "reader.onload async function 패턴으로 순차 비동기 PDF 처리"

key-files:
  created: []
  modified:
    - index.html

key-decisions:
  - "pdf.addPage() 기반 ##TN## 삽입 제거 → pdf.setProperties(subject) 사용 — 출력물에 보이지 않도록"
  - "단일 캔버스 슬라이싱 방식 폐기 → .p-wrap별 개별 html2canvas 캡처 — 페이지 경계 정확히 일치"
  - "onPdfSelected reader.onload를 async function으로 변경 — await pdfjsLib.getDocument 메타데이터 조회 가능"
  - "combined = compact + metaText.replace 패턴 — 텍스트 레이어와 메타데이터 양쪽 ##TN## 체크 하위호환"
  - ".p-wrap min-height:254mm를 @media print 전용으로 이동 — 화면 렌더링 영향 없음"

patterns-established:
  - "PDF 비가시 데이터: pdf.setProperties()로 메타데이터 저장, pdfDoc.getMetadata()로 읽기"
  - "다중 페이지 PDF: querySelectorAll('.p-wrap')로 페이지 요소 순회, 각 wrap per-page 캡처"

requirements-completed: [PRINT-01, PRINT-02, PRINT-03, PRINT-04]

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 5 Plan 01: 거래명세표 인쇄/PDF 버그 수정 Summary

**4가지 인쇄/PDF 버그 수정: 구버전 안내, 푸터 분리 방지, ##TN## 메타데이터 이동, 다중 페이지 .p-wrap별 캡처**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T02:19:05Z
- **Completed:** 2026-03-26T02:21:22Z
- **Tasks:** 4
- **Files modified:** 1

## Accomplishments

- 구버전 거래명세표 PDF 업로드 시 안내 메시지 표시 + Vision AI 호출 차단
- @media print CSS에 page-break-inside:avoid 규칙 추가로 푸터가 표와 같은 페이지 유지
- ##TN## 데이터를 addPage 대신 PDF setProperties(subject)에 저장 — 출력물에 완전히 불가시
- doPdf()를 async function으로 변환, .p-wrap별 개별 html2canvas 캡처로 페이지 경계 정확 일치

## Task Commits

1. **Task 1: PRINT-01 — 구버전 거래명세표 PDF 안내 메시지** - `fd0f23d` (fix)
2. **Task 2: PRINT-02 — 인쇄 시 푸터 같은 페이지 유지 CSS** - `01d0af3` (fix)
3. **Task 3: PRINT-03 — ##TN## 코드 PDF 메타데이터로 이동** - `0f834e0` (fix)
4. **Task 4: PRINT-04 — 다중 페이지 .p-wrap별 개별 캡처** - `790aaf3` (fix)

## Files Created/Modified

- `/Users/glen/천연비료처방전/천연비료처방전/index.html` — onPdfSelected(), @media print CSS, doPdf() 수정

## Decisions Made

- **##TN## 저장 방식 변경:** `addPage()` + 연한 회색 텍스트 방식은 인쇄 시 노출 가능 → `pdf.setProperties({subject})` 메타데이터로 이동. 출력물에 완전히 불가시
- **메타데이터 fallback 추가:** 신규 PDF(메타데이터 기반) + 구형 PDF(텍스트 레이어) 모두 지원하는 `combined` 변수 체크 패턴 도입
- **doPdf async 리팩토링:** `.then()` 체인 → `async/await` 전환으로 코드 가독성 향상 및 for 루프 내 await 지원
- **min-height 이동:** `.p-wrap`의 `min-height:254mm`를 `@media print` 전용으로 이동 — 화면 렌더링에는 불필요

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 인쇄/PDF 4가지 버그 모두 수정 완료
- Phase 5 완료 — Phase 6(클라우드 동기화) 또는 다음 계획으로 진행 가능

---
*Phase: 05-pdf*
*Completed: 2026-03-26*
