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
 * 처방전 파일명에서 고객명·작물·평수 파싱 (farmInfo fallback)
 * pdfParser는 표지가 이미지여서 항상 null 반환 → 파일명이 신뢰할 수 있는 대안
 *
 * 예) "수박(1000평)청주(오송)김영국님(4월3일).pdf"
 *   → { farmName: "김영국", cropName: "수박", totalArea: 1000 }
 *
 * 예) "천혜향(550평)농사 송한천장로님(3월10일).pdf"
 *   → { farmName: "송한천장로", cropName: "천혜향", totalArea: 550 }
 */
function _parseFilenameInfo(filename) {
  const base = filename.replace(/\.pdf$/i, '');
  const result = { farmName: null, cropName: null, totalArea: null };

  // 평수: 첫 번째 (숫자평) 패턴
  const areaMatch = base.match(/\((\d+)평\)/);
  if (areaMatch) result.totalArea = parseInt(areaMatch[1], 10);

  // 작물: 맨 앞 한글 연속 (첫 '(' 앞)
  const cropMatch = base.match(/^([가-힣]+)/);
  if (cropMatch) result.cropName = cropMatch[1];

  // 고객명: 한글 2~6자 + '님' 패턴 중 마지막 (e.g. 김영국님, 송한천장로님)
  const nameMatches = [...base.matchAll(/([가-힣]{2,6})님/g)];
  if (nameMatches.length > 0) {
    result.farmName = nameMatches[nameMatches.length - 1][1];
  }

  return result;
}

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

    // parsePdfToJSON이 null 반환 시 → 이미 에러 알림을 보여줬으므로 조용히 종료
    if (!prescriptionJSON) return;

    // 파일명을 JSON에 포함 → openValidationModal에서 farmName/cropName fallback에 사용
    prescriptionJSON._sourceFilename = pdfFile.name;

    if (!prescriptionJSON.prescriptions || prescriptionJSON.prescriptions.length === 0) {
      alert('처방전에서 처방 항목을 찾을 수 없습니다.\nAI가 처방 그룹을 인식하지 못했을 수 있습니다.');
      return;
    }

    // 2. 고객 정보 자동 입력 (farmInfo → index.html 폼)
    // pdfParser는 표지가 이미지라 farmName/cropName을 항상 null로 반환 → 파일명에서 fallback 파싱
    const fi = prescriptionJSON.farmInfo || {};
    const fb = _parseFilenameInfo(pdfFile.name);  // fallback: 파일명 파싱
    const farmName = fi.farmName || fb.farmName;
    const cropName = fi.cropName || fb.cropName;
    const totalArea = fi.totalArea || fb.totalArea;

    if (farmName) {
      const el = document.getElementById('cName');
      if (el) el.value = farmName;
    }
    if (cropName) {
      const el = document.getElementById('cCrop');
      if (el) {
        // select.value 직접 대입 (일치하는 옵션 없으면 자동으로 무시됨)
        el.value = cropName;
        // 일치 실패 시 옵션 텍스트 부분 매칭
        if (!el.value || el.value === '') {
          for (let i = 0; i < el.options.length; i++) {
            if (el.options[i].text.includes(cropName) || cropName.includes(el.options[i].text)) {
              el.selectedIndex = i; break;
            }
          }
        }
      }
    }
    if (totalArea) {
      const el = document.getElementById('cArea');
      if (el) el.value = totalArea;
    }

    // 3. 비용 데이터에서 평당 단가 자동 입력
    const cd = prescriptionJSON.costData;
    console.log('[main] costData:', cd);
    if (cd) {
      let unitPrice = cd.unitPricePerPyeong || 0;
      // unitPricePerPyeong 없을 경우 totalCost / totalArea 로 직접 계산
      if (!unitPrice && cd.totalCost && fi.totalArea) {
        unitPrice = Math.round(cd.totalCost / fi.totalArea);
        console.log('[main] 평당 단가 역산:', cd.totalCost, '÷', fi.totalArea, '=', unitPrice);
      }
      if (unitPrice) {
        // ID 후보: 'unitPrice', 'unit-price', 'pricePerPyeong', 'pyeongPrice'
        const UNIT_PRICE_IDS = ['unitPrice', 'unit-price', 'pricePerPyeong', 'pyeongPrice'];
        let injected = false;
        for (const id of UNIT_PRICE_IDS) {
          const el = document.getElementById(id);
          if (el) {
            el.value = unitPrice;
            console.log(`[main] 평당 단가 자동 입력 → #${id}:`, unitPrice, '원/평');
            injected = true;
            break;
          }
        }
        if (!injected) {
          console.warn('[main] 평당 단가 입력창을 찾지 못함. 확인된 ID 후보:', UNIT_PRICE_IDS, '| 계산된 값:', unitPrice);
        }
        // PRICE-01: 평당가 전역 저장 — syncPrint()가 페이지 주입에 사용
        window._invoiceUnitPrice = unitPrice;
      } else {
        console.warn('[main] costData 있으나 평당 단가 계산 불가:', cd);
      }
    } else {
      console.log('[main] costData 없음 — 비용 페이지 미감지 또는 PDF에 금액 정보 없음');
    }

    // 4. 검증 모달 열기 — 사용자가 확인/수정 후 [적용] 클릭
    openValidationModal(prescriptionJSON);

  } catch (err) {
    console.error('처방전 처리 오류:', err);
    const msg = err.message || '';
    if (msg.includes('JSON') || msg.includes('parse') || msg.includes('Unexpected token')) {
      alert('처방전 파싱에 실패했습니다.\n\n다시 시도해 주세요.\n반복 실패 시 PDF를 새로 저장하거나 담당자에게 문의하세요.');
    } else {
      alert('처방전 처리 중 오류가 발생했습니다.\n\n다시 시도해 주세요.\n' + msg);
    }
  }
}

/**
 * 테스트용: mock 데이터로 전체 플로우 실행
 * 브라우저 콘솔에서 testFullFlow() 호출하여 테스트
 */
function testFullFlow() {
  handlePrescriptionUpload('(테스트 PDF 텍스트)');
}
