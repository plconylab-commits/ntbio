/**
 * prescriptionModel.js
 * 처방전 데이터 모델 & 수량 계산 유틸리티
 */

/* ───────────────────────────────────────────
   1. 팩토리 함수 — 표준 JSON 스키마 생성
   ─────────────────────────────────────────── */

/** 처방전 최상위 객체 생성 */
function createPrescription(farmName, cropName, totalArea) {
  return {
    farmInfo: {
      farmName:  farmName  || '',
      cropName:  cropName  || '',
      totalArea: Number(totalArea) || 0
    },
    prescriptions: []
  };
}

/** 처방 항목(시기별 그룹) 생성 */
function createPrescriptionEntry(stageType, stageLabel) {
  return {
    stageType:  stageType  || '기타',  // 표준 카테고리: 토양 | 관주 | 엽면 | 기타
    stageLabel: stageLabel || '',      // 원본 텍스트 (예: "감사비료 수확:후 및 3월 4월")
    items: []
  };
}

/** 개별 품목 생성 */
function createItem(originalName, baseArea, baseQty, unit) {
  return {
    originalName: originalName || '',
    mappedId:     null,
    baseArea:     Number(baseArea) || 0,
    baseQty:      Number(baseQty)  || 0,
    unit:         unit || ''
  };
}

/* ───────────────────────────────────────────
   2. 수량 계산 유틸리티
   ─────────────────────────────────────────── */

/**
 * 최종 필요 수량 계산
 * @param {number} totalArea - 전체 평수
 * @param {number} baseArea  - 기준 평수
 * @param {number} baseQty   - 기준 수량
 * @returns {number} 최종 필요 수량 (올림 처리)
 *
 * 예외: baseArea가 0이거나 falsy이면
 *       전체 평수 = 기준 평수로 간주 → baseQty 그대로 반환
 */
function calcRequiredQty(totalArea, baseArea, baseQty) {
  // baseArea 또는 totalArea가 미입력(0/null)이면 비율 계산 불가 → baseQty 그대로 반환
  if (!baseArea || !totalArea) return baseQty;
  return Math.ceil((totalArea / baseArea) * baseQty);
}
