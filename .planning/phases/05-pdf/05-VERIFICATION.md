---
phase: 05-pdf
verified: 2026-03-26T03:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 5: 거래명세표 인쇄/PDF 버그 수정 Verification Report

**Phase Goal:** 거래명세표의 인쇄·PDF 저장이 정확하게 동작하고, 구버전 PDF도 불러올 수 있다
**Verified:** 2026-03-26T03:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ##TN## 마커 없는 구버전 거래명세표 PDF 업로드 시 '구버전 거래명세표' 안내 메시지가 표시된다 | ✓ VERIFIED | `index.html:2510-2512` — `/거래명세표/.test(text)` 감지 후 `showToast('구버전 거래명세표는 자동 불러오기를 지원하지 않습니다...')` + `return` |
| 2 | 14행 이하 제품 인쇄 시 푸터가 표와 같은 페이지에 출력된다 | ✓ VERIFIED | `index.html:343-345` — `@media print` 안에 `.p-footer-tbl{page-break-inside:avoid;break-inside:avoid;}` + `.p-wrap{page-break-inside:avoid;break-inside:avoid;page-break-after:always;...}` |
| 3 | 브라우저 인쇄(window.print)에서 ##TN## 데이터가 보이지 않는다 | ✓ VERIFIED | `doPrint()`는 `window.print()`만 호출(line 1575). DOM에 ##TN## 별도 요소 없음. 구 addPage+회색텍스트 방식 완전 제거 확인 (`grep 240,240` 결과 없음) |
| 4 | PDF 저장 시 ##TN## 데이터가 별도 페이지 대신 PDF 메타데이터에 저장된다 | ✓ VERIFIED | `index.html:1636-1646` — `pdf.setProperties({title, subject: tnFull, keywords: 'TN_DATA'})` 호출. `pdf.addPage()` 는 `.p-wrap` 순회용(line 1607)만 남아있고 ##TN## 관련 addPage 완전 제거 |
| 5 | 15행 이상 제품일 때 각 페이지에 헤더+표+푸터가 완전히 반복된다 | ✓ VERIFIED | `index.html:1599-1613` — `clone.querySelectorAll('.p-wrap')` 로 각 wrap을 개별 `html2canvas` 캡처, `for` 루프에서 `pdf.addPage()` 후 별도 이미지 삽입. 단일 캔버스 슬라이싱(`while remaining`) 완전 제거 |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `index.html` | onPdfSelected 구버전 안내, @media print 푸터 고정, ##TN## 숨김, 다중 페이지 CSS | ✓ VERIFIED | 파일 실존. 4개 버그 수정 코드 모두 존재. 2471행 이상의 substantive 구현 확인 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `onPdfSelected()` | `showToast` | ##TN## 없고 거래명세표 텍스트 감지 시 안내 메시지 | ✓ WIRED | `index.html:2509-2512` — `/거래명세표/.test(text)\|\|/거래명세표/.test(compact)` → `showToast('구버전 거래명세표...')` |
| `doPdf()` | `pdf.setProperties` | ##TN## 데이터를 PDF custom properties에 저장 | ✓ WIRED | `index.html:1638-1645` — `_tnLines.length>0` 조건 후 `pdf.setProperties({subject: tnFull, keywords: 'TN_DATA'})` |
| `@media print` | `.p-wrap` | `page-break-inside:avoid` keeps footer with table | ✓ WIRED | `index.html:344` — `@media print { .p-wrap{page-break-inside:avoid;break-inside:avoid;page-break-after:always;...} }` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `index.html` / `onPdfSelected` | `combined` (##TN## 체크용) | `compact` (PDF 텍스트) + `metaText` (PDF metadata Subject 필드) | Yes — `pdfjsLib.getDocument({data}).promise` + `pdfDoc.getMetadata()` 로 실제 PDF에서 추출 | ✓ FLOWING |
| `index.html` / `doPdf` | `wraps` (.p-wrap 목록) | `clone.querySelectorAll('.p-wrap')` — buildPrintDoc이 생성한 실제 DOM 노드 | Yes — cart 기반으로 buildPrintDoc이 실제 행 생성 | ✓ FLOWING |
| `index.html` / `doPdf` | `_tnLines` | `cart`, `document.getElementById(...)` — 화면 폼 값 | Yes — 실제 고객정보 + 카트 데이터 인코딩 | ✓ FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — 인쇄/PDF 동작은 브라우저 렌더링과 window.print()/jsPDF에 의존하므로 CLI 명령으로 검증 불가. Human Verification 항목으로 위임.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PRINT-01 | 05-01-PLAN.md | 구버전 외부 거래명세표 PDF 업로드 시 올바르게 안내 | ✓ SATISFIED | `index.html:2509-2512` 감지+안내+Vision AI 차단 |
| PRINT-02 | 05-01-PLAN.md | 인쇄 시 푸터가 페이지 경계에서 잘리지 않음 | ✓ SATISFIED | `index.html:342-350` `@media print` CSS 규칙 |
| PRINT-03 | 05-01-PLAN.md | PDF 저장 및 인쇄 시 ##TN## 코드 페이지 미노출 | ✓ SATISFIED | `index.html:1636-1646` setProperties 메타데이터 저장, addPage 방식 제거 확인 |
| PRINT-04 | 05-01-PLAN.md | 2페이지 이상 시 각 페이지 헤더·표·푸터 완전 반복 | ✓ SATISFIED | `index.html:1599-1613` .p-wrap별 개별 html2canvas 캡처 |

**Orphaned requirements check:** REQUIREMENTS.md Traceability 표에서 PRINT-01~04가 Phase 5로 매핑됨. 추가 orphaned 요건 없음.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `index.html` | 2535 | `console.log('[PDF] 전체길이...')` — 디버그 로그 | ℹ️ Info | 프로덕션 코드에 디버그 출력이 남아 있으나 기능에는 영향 없음 |

디버그 로그 외 stub, placeholder, 빈 반환, 하드코딩 빈 배열 등 블로커 패턴 없음.

---

### Human Verification Required

#### 1. 구버전 거래명세표 PDF 업로드 안내 메시지

**Test:** ##TN## 마커가 없고 "거래명세표" 텍스트를 포함한 실제 PDF 파일을 업로드한다.
**Expected:** 빨간색 토스트 메시지 "구버전 거래명세표는 자동 불러오기를 지원하지 않습니다. 앱에서 직접 입력해 주세요."가 표시되고, Vision AI 호출이 발생하지 않는다.
**Why human:** 실제 PDF 파일과 브라우저 렌더링 필요. `showToast(..., true)`의 빨간색 에러 스타일도 시각 확인 필요.

#### 2. 14행 이하 인쇄 시 푸터 위치

**Test:** 14개 이하 제품을 카트에 담고 인쇄 미리보기를 연다.
**Expected:** 합계/서명란(푸터)이 표 바로 아래, 같은 페이지에 붙어 출력된다. 푸터만 단독으로 2페이지에 나타나지 않는다.
**Why human:** `page-break-inside:avoid` 동작은 브라우저 인쇄 엔진 의존. 실제 인쇄 미리보기로만 확인 가능.

#### 3. PDF 저장 시 ##TN## 메타데이터 저장 및 재임포트

**Test:** 제품 5개를 담고 PDF 저장을 한다. 저장된 PDF를 다시 업로드한다.
**Expected (저장):** 생성된 PDF 출력물에 ##TN## 코드 페이지가 없다. Adobe Reader 등에서 Document Properties > Description 탭의 Subject 필드에 ##TN##... 문자열이 있다.
**Expected (재임포트):** 저장된 PDF를 업로드하면 고객 정보와 제품 목록이 정확히 복원된다.
**Why human:** PDF 생성은 jsPDF + html2canvas 브라우저 실행 필요. 메타데이터 확인은 PDF 뷰어 도구 필요.

#### 4. 15행 이상 다중 페이지 PDF 생성

**Test:** 15개 이상 제품을 카트에 담고 PDF 저장을 한다.
**Expected:** 생성된 PDF가 2페이지 이상이며, 각 페이지에 헤더(회사명/고객정보) + 표(제품목록) + 푸터(합계/서명란)가 완전히 포함된다. 페이지 중간에서 행이 잘리지 않는다.
**Why human:** html2canvas + jsPDF 렌더링은 실제 브라우저 실행 필요. 페이지 레이아웃 정확성은 시각 검사만 가능.

---

### Gaps Summary

갭 없음. 4개 요건(PRINT-01~04) 모두 index.html에 substantive 구현이 존재하고, key link 3개 모두 wired 확인. 구 addPage+회색텍스트 방식 및 단일캔버스 슬라이싱 방식이 완전 제거된 것도 확인. 브라우저/인쇄 특성상 자동화 검증이 불가한 4개 항목을 Human Verification으로 위임.

---

_Verified: 2026-03-26T03:00:00Z_
_Verifier: Claude (gsd-verifier)_
