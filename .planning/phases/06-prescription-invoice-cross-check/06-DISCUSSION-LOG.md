# Phase 6: 처방전↔거래명세표 대조 검토 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the Q&A.

**Date:** 2026-03-27
**Phase:** 06-처방전↔거래명세표-대조-검토
**Mode:** discuss
**Areas analyzed:** 입력 방식, 대조 표시 방식, 매칭 기준, 비교 범위

---

## Areas Discussed

### 입력 방식

| Question | Options Presented | Selected |
|----------|------------------|---------|
| 두 파일을 어떻게 제공하나요? | 카트+처방전 PDF 업로드 / 이전 처방이력에서 선택 / 두 파일 업로드 | **카트+처방전 PDF 업로드** |
| 대조용 처방전 PDF 업로드 진입 방식 | 툴바에 처방전 비교 버튼 수동 추가 / 기존 PDF 업로드 버튼 활용 | **툴바에 처방전 비교 버튼 수동 추가** |
| 비교 버튼 클릭 시 어떤 UI로 진입? | 모달 표시 + 파일 업로드 / 직접 파일 선택만 | **모달 표시 + 파일 업로드** |

### 대조 표시 방식

| Question | Options Presented | Selected |
|----------|------------------|---------|
| 비교 결과를 어디에 어떻게 표시? | 모달 안에 diff 테이블 / 인라인 강조 | **모달 안에 diff 테이블** |
| diff 테이블 필수 구성요소 | 일치 항목 / 차이 항목(수량 다름) / 외에만 있는 항목 / 평당 중복 항목 | **일치 항목, 차이 항목, 외에만 있는 항목** (평당 항목은 미결 → 비교범위에서 요약 1줄로 결정) |

### 매칭 기준

| Question | Options Presented | Selected |
|----------|------------------|---------|
| 처방전 품목명 ↔ 거래명세표 품목명 연결 방법 | 퍼지 문자열 매칭 / 사용자 직접 매칭 / exact match | **퍼지 문자열 매칭** |
| 매칭 모호 시 처리 | 미매칭 항목으로 표시 / 매칭 시도 안 함 | **미매칭 항목으로 표시** |

### 비교 범위

| Question | Options Presented | Selected |
|----------|------------------|---------|
| 비교 대상 항목 | 품목명(유무) / 수량(차이) / 금액(평당가 vs 공급가) | **품목명, 수량, 금액** |
| 수량 허용 오차 | 이상이면 모두 차이표시 / 10% 오차 허용 | **이상이면 모두 차이표시 (오차 없음)** |
| 금액 비교 기준 | 전체 합계 평당가 비교 / 항목별 단가×수량 비교 | **항목별 단가×수량 비교** |

---

## No Corrections

All selections followed recommended defaults.

---

## Deferred Ideas

- 사용자 매핑 편집 UI — 복잡도 높음
- 비교 결과로 카트 자동 수정 — 현재는 표시만
- 처방이력에서 선택해서 비교하는 방식
