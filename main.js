/**
 * main.js
 * 전체 플로우 오케스트레이터
 * 의존: prescriptionModel.js, productDB.js, productMapper.js,
 *       pdfParser.js, pdfPromptTemplate.js, uiController.js
 *
 * 플로우:
 *   [PDF 업로드] → pdfToBase64Images() → callVisionAPI() →
 *   openValidationModal() → [사용자 검증] → _applyToCart() → render()
 */

/**
 * 처방전 PDF 업로드 처리 — 메인 진입점
 * index.html의 onPdfSelected()에서 처방전 PDF 감지 시 호출
 *
 * @param {File} pdfFile - 사용자가 업로드한 PDF File 객체
 */
async function handlePrescriptionUpload(pdfFile) {
  try {
    // 1. PDF → Base64 이미지 변환 후 Vision API 호출 → 표준 JSON
    const prescriptionJSON = await parsePdfToJSON(pdfFile);

    if (!prescriptionJSON || !prescriptionJSON.prescriptions) {
      alert('처방전 데이터를 변환할 수 없습니다.');
      return;
    }

    // 2. 고객 정보 자동 입력 (farmInfo → index.html 폼)
    const fi = prescriptionJSON.farmInfo || {};
    if (fi.farmName) {
      const el = document.getElementById('cName');
      if (el) el.value = fi.farmName;
    }
    if (fi.cropName) {
      const el = document.getElementById('cCrop');
      if (el) el.value = fi.cropName;
    }
    if (fi.totalArea) {
      const el = document.getElementById('cArea');
      if (el) el.value = fi.totalArea;
    }

    // 3. 검증 모달 열기 — 사용자가 확인/수정 후 [적용] 클릭
    openValidationModal(prescriptionJSON);

  } catch (err) {
    console.error('처방전 처리 오류:', err);
    alert('처방전 처리 중 오류가 발생했습니다: ' + err.message);
  }
}

/**
 * 테스트용: mock 데이터로 전체 플로우 실행
 * 브라우저 콘솔에서 testFullFlow() 호출하여 테스트
 */
function testFullFlow() {
  handlePrescriptionUpload('(테스트 PDF 텍스트)');
}
