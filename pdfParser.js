/**
 * pdfParser.js
 * PDF → Base64 이미지 변환 후 OpenAI Vision API(gpt-4o)로 표준 JSON 추출
 * 의존: pdfPromptTemplate.js (PDF_SYSTEM_PROMPT, buildPdfUserPrompt)
 */

/**
 * PDF File 객체를 페이지별 Base64 JPEG 이미지 배열로 변환
 * @param {File} pdfFile - 사용자가 업로드한 PDF 파일
 * @param {number} scale - 렌더링 배율 (기본 2.0, 낮추면 저화질)
 * @returns {Promise<string[]>} Base64 data URL 배열 (각 페이지)
 */
async function pdfToBase64Images(pdfFile, scale = 2.0) {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.8));
  }

  return images;
}

/**
 * Base64 이미지 배열을 OpenAI Vision API에 전송해 처방전 JSON 반환
 * @param {string[]} base64Images - pdfToBase64Images() 반환값
 * @returns {Promise<object>} prescriptionModel 스키마 형태의 JSON
 */
async function callVisionAPI(base64Images) {
  const apiKey = localStorage.getItem('openai_api_key');
  if (!apiKey) {
    alert('우측 상단 설정에서 API 키를 먼저 입력해 주세요.');
    return null;
  }

  console.log('[Vision] API 호출 시작 — 이미지 수:', base64Images.length);

  // 이미지 파트 구성 (페이지마다 image_url 메시지 추가)
  const imageContents = base64Images.map(b64 => ({
    type: 'image_url',
    image_url: { url: b64, detail: 'high' }
  }));

  // 마지막에 텍스트 지시 추가 (이미지는 image_url 파트, 지시문은 text 파트로 분리)
  const userContent = [
    ...imageContents,
    { type: 'text', text: buildPdfUserPrompt() }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PDF_SYSTEM_PROMPT },
        { role: 'user',   content: userContent }
      ],
      max_tokens: 4096,
      temperature: 0
    })
  });

  console.log('[Vision] 응답 상태:', response.status);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API 오류 (${response.status}): ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || '';

  console.log('[Vision] 원본 응답 (첫 300자):', raw.substring(0, 300));

  // 마크다운 코드 블록 제거 (```json ... ``` 또는 ``` ... ```)
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  console.log('[Vision] 파싱 시도 (첫 300자):', cleaned.substring(0, 300));

  const parsed = JSON.parse(cleaned);
  console.log('[Vision] 파싱 성공 — prescriptions 수:', parsed?.prescriptions?.length);
  return parsed;
}



/**
 * PDF File 객체를 처방전 표준 JSON으로 변환 (메인 진입점)
 * @param {File} pdfFile - 사용자가 업로드한 PDF 파일
 * @returns {Promise<object|null>} prescriptionModel 스키마 JSON, 실패 시 null
 */
async function parsePdfToJSON(pdfFile) {
  try {
    console.log('[Parser] 시작 — 파일 타입:', typeof pdfFile, pdfFile instanceof File ? '(File 객체 ✓)' : '(File 아님 ✗)');
    console.log('[Parser] pdfFile:', pdfFile);

    const images = await pdfToBase64Images(pdfFile, 2.0);
    console.log('[Parser] 이미지 변환 완료 — 페이지 수:', images.length);

    const result = await callVisionAPI(images);
    console.log('[Parser] 최종 결과:', result);
    return result;
  } catch (e) {
    console.error('[Parser] ❌ 오류 전체:', e);
    console.error('[Parser] 오류 위치(stack):', e.stack);
    alert(`처방전 분석 중 오류가 발생했습니다.\n\n${e.name}: ${e.message}`);
    return null;
  }
}
