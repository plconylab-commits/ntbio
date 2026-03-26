---
status: partial
phase: 05-pdf
source: [05-VERIFICATION.md]
started: 2026-03-26T00:00:00.000Z
updated: 2026-03-26T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. 구버전 거래명세표 PDF 업로드 안내 메시지
expected: 빨간색 토스트 메시지 "구버전 거래명세표는 자동 불러오기를 지원하지 않습니다. 앱에서 직접 입력해 주세요." 표시, Vision AI 미호출
result: [pending]

### 2. 14행 이하 인쇄 시 푸터 위치
expected: 합계/서명란이 표 바로 아래 같은 페이지에 출력됨 — 푸터가 단독으로 2페이지에 넘어가지 않음
result: [pending]

### 3. PDF 저장 시 ##TN## 메타데이터 저장 및 재임포트
expected: PDF 출력물에 ##TN## 코드 페이지 없음, PDF 재업로드 시 고객정보+제품목록 복원됨
result: [pending]

### 4. 15행 이상 다중 페이지 PDF 생성
expected: 각 페이지에 헤더+표+푸터 완전 반복, 페이지 중간 행 잘림 없음
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
