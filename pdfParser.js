/**
 * pdfParser.js  v4 — 페이지별 독립 파싱 · 키워드 Stage 분리
 * pdf.js 좌표 기반 처방전 텍스트 추출 — Vision AI 미사용, 브라우저에서 즉시 처리
 * 의존: prescriptionModel.js (calcRequiredQty), productMapper.js (findProduct)
 *
 * 핵심 알고리즘:
 *   1) 페이지별 독립 파싱: for(page) 안에서 Y좌표 그룹핑 — 페이지 간 Y 좌표 혼용 금지
 *   2) 행 내 아이템 → 화면 너비(w) 기반 공백 삽입으로 자연스러운 텍스트 조합
 *   3) 새 페이지 시작 → 무조건 새 stage 생성
 *   4) 좌측 열 텍스트가 STAGE_LABEL_RE 키워드로 시작 → 추가 stage 분리
 *   5) 우측 열 텍스트에 COUNT_UNITS 있으면 현재 stage의 제품으로 수집
 *   6) 좌측 다중 행 라벨 → '\n' 누적 → stageLabel
 */

const MAX_PAGES      = 8;
const LEFT_X_MAX     = 160;   // A4 scale=1.0 기준 좌측 열 최대 X (px)
const ROW_Y_MERGE    = 5;     // 같은 행으로 간주할 Y 허용 오차 (px)
const WORD_GAP_MIN   = 3;     // 이 px 이상 간격이면 공백 삽입

// 처방 수량 단위: 반드시 숫자 또는 "반" 뒤에 오는 포|병|봉|통|개 만 인식
// → "서귀포", "병원", "개인" 같은 단어 속 오인식 방지
const COUNT_UNITS_RE = /(\d|반)\s*(포|병|봉|통|개)/;

// stage 분리 키워드: 시비 방법·시기를 나타내는 단어로 시작하는 좌측 열 텍스트
// ^ 앵커: "수확:후" 같이 키워드가 아닌 상태어 오인식 방지
// → 좌측 열에서 이 패턴으로 시작하는 텍스트가 보이면 새 stage 시작
const STAGE_LABEL_RE = /^(관주|엽면|기비|밑거름|감사|토양|방제|추비|파종|이앙|정식|액비)/;

/* ─── 1. 행 아이템 → 자연스러운 텍스트 조합 ─────────────────────── */

/**
 * 같은 행의 아이템들을 X 정렬 후 인접 간격 기반으로 공백을 삽입해 문자열로 조합한다.
 * - gap <= WORD_GAP_MIN px → 붙이기 (파편화된 글자 복원)
 * - gap > WORD_GAP_MIN px  → 공백 삽입 (단어/열 구분)
 *
 * @param {{text:string, x:number, w:number}[]} items (X 정렬 완료 상태)
 * @returns {string}
 */
function joinRowText(items) {
  if (!items.length) return '';
  let out = items[0].text;
  for (let i = 1; i < items.length; i++) {
    const prev  = items[i - 1];
    const curr  = items[i];
    // w가 0이면 글자 수 × 6px로 추정 (한국어 평균 글리프 폭 근사)
    const prevW = prev.w > 0 ? prev.w : prev.text.length * 6;
    const gap   = curr.x - (prev.x + prevW);
    out += (gap > WORD_GAP_MIN ? ' ' : '') + curr.text;
  }
  return out.trim();
}

/* ─── 2. 페이지 로컬 아이템 → 행 그룹 (러닝 평균 Y) ────────────────── */

/**
 * 한 페이지 내 아이템을 러닝 평균 Y 기준으로 ROW_Y_MERGE 이내끼리 같은 행으로 묶는다.
 * 행 내 아이템은 X 오름차순으로 재정렬된다.
 * (페이지 간 Y 좌표 혼용 없음 — 페이지별 호출 전제)
 *
 * @param {{text,x,y,w}[]} items
 * @returns {{y:number, items:{text,x,w}[]}[]}
 */
function groupByRowsLocal(items) {
  const rows = [];
  for (const it of items) {
    if (!it.text.trim()) continue;

    // 뒤에서부터 Y 근접 행 탐색
    let matched = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (it.y - r.yMax > ROW_Y_MERGE * 4) break;  // 너무 멀면 탐색 중단
      if (Math.abs(it.y - r.yAvg) <= ROW_Y_MERGE) { matched = r; break; }
    }

    if (matched) {
      matched.items.push(it);
      matched.yAvg = matched.items.reduce((s, i) => s + i.y, 0) / matched.items.length;
      matched.yMax = Math.max(matched.yMax, it.y);
    } else {
      rows.push({ y: it.y, yAvg: it.y, yMax: it.y, items: [it] });
    }
  }

  // 각 행 내 X 정렬, 대표 Y 확정
  rows.forEach(row => {
    row.items.sort((a, b) => a.x - b.x);
    row.y = row.yAvg;
  });
  return rows;
}

/* ─── 3. 페이지 단위 stage 파싱 ──────────────────────────────────── */

/**
 * 한 PDF 페이지를 파싱해 stage 배열을 반환한다.
 *
 * 분리 규칙:
 *   - 페이지 시작 시 무조건 새 stage 생성 (이전 페이지와 격리)
 *   - 좌측 열 텍스트가 STAGE_LABEL_RE로 시작 → 현재 stage에 이미 내용이 있으면 새 stage 생성
 *   - 좌측 열 텍스트 (키워드 아니어도) → 현재 stage의 labelLines에 누적
 *   - 우측 열 텍스트에 COUNT_UNITS 있으면 현재 stage의 productTexts에 수집
 *
 * @param {PDFPageProxy} pdfPage
 * @param {number} pageNum
 * @returns {Promise<{labelLines:string[], productTexts:string[]}[]>}
 */
async function parsePdfPage(pdfPage, pageNum) {
  const vp = pdfPage.getViewport({ scale: 1.0 });
  const tc = await pdfPage.getTextContent();

  // 페이지 로컬 아이템 추출
  const items = [];
  tc.items.forEach(it => {
    if (!it.str.trim()) return;
    const [,,,, x, y] = pdfjsLib.Util.transform(vp.transform, it.transform);
    const w = Math.abs((it.width || 0) * (it.transform ? it.transform[0] : 1));
    items.push({ text: it.str, x: Math.round(x), y: Math.round(y), w: Math.round(w) });
  });

  if (!items.length) return [];

  // Y 오름차순, X 오름차순 정렬 (페이지 로컬)
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = groupByRowsLocal(items);

  // ── 페이지 시작 시 무조건 새 stage ──
  const stages = [];
  let cur = { labelLines: [], productTexts: [] };
  stages.push(cur);

  for (const row of rows) {
    const leftItems  = row.items.filter(it => it.x <  LEFT_X_MAX);
    const rightItems = row.items.filter(it => it.x >= LEFT_X_MAX);
    const leftText   = joinRowText(leftItems);
    const rightText  = joinRowText(rightItems);

    if (leftText) {
      // 좌측 키워드 감지 → 현재 stage에 이미 내용이 있으면 새 stage 생성
      const isNewStage = STAGE_LABEL_RE.test(leftText) &&
                         (cur.labelLines.length > 0 || cur.productTexts.length > 0);
      if (isNewStage) {
        cur = { labelLines: [], productTexts: [] };
        stages.push(cur);
      }
      cur.labelLines.push(leftText);
    }

    // 우측 열: 처방 수량 단위 포함 행 → 현재 stage에 수집
    if (rightText && COUNT_UNITS_RE.test(rightText)) {
      cur.productTexts.push(rightText);
    }
  }

  console.log(`[Parser] page ${pageNum}: ${stages.length}개 stage 블록, 아이템 ${items.length}개`);
  return stages;
}

/* ─── 4. 우측 행 → 제품 아이템 파싱 ─────────────────────────────── */

/**
 * joinRowText()로 조합된 행 텍스트에서 제품명·수량·단위·기준평수를 추출한다.
 *
 * ★ 핵심 규칙
 *   - 처방 수량 단위: 포|병|봉|통|개  → baseQty 추출 대상
 *   - 용량/규격 단위: kg|g|L|ml 등   → 절대 baseQty로 착각하지 않음 (제품명에 보존)
 *                                      예: "양자식물에너지(500ml) 3병 200평"
 *   - 반병|반봉|반통|반포|반개        → baseQty = 0.5
 *   - N평                            → baseArea
 *
 * @param {string} text
 * @returns {{originalName, mappedId, baseQty, unit, baseArea}}
 */
function parseProductRow(text) {
  const COUNT_UNITS = '포|병|봉|통|개';

  const halfM  = new RegExp(`반\\s*(${COUNT_UNITS})`).exec(text);
  const countM = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${COUNT_UNITS})`).exec(text);

  let baseQty = null, unit = '';
  if (halfM)       { baseQty = 0.5;                unit = halfM[1];  }
  else if (countM) { baseQty = Number(countM[1]);  unit = countM[2]; }

  const areaM    = text.match(/(\d+(?:\.\d+)?)\s*평/);
  const baseArea = areaM ? Number(areaM[1]) : null;

  // 제품명: 처방수량·평수 제거, 용량 규격(kg/g/L/ml)은 보존
  const namePart = text
    .replace(new RegExp(`반\\s*(${COUNT_UNITS})`, 'g'), '')
    .replace(new RegExp(`\\d+(?:\\.\\d+)?\\s*(${COUNT_UNITS})`, 'g'), '')
    .replace(/\d+(?:\.\d+)?\s*평/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    originalName: namePart || text,
    mappedId:     null,
    baseQty,
    unit,
    baseArea
  };
}

/* ─── 5. 메인 진입점 ─────────────────────────────────────────────── */

/**
 * PDF File → prescriptionModel 스키마 JSON
 * Vision API 없이 pdf.js 좌표 기반으로 즉시 처리 (1~2초 내)
 *
 * @param {File} pdfFile
 * @returns {Promise<object|null>}
 */
async function parsePdfToJSON(pdfFile) {
  try {
    console.log('[Parser] v4 시작 — 페이지별 독립 파싱 + 키워드 stage 분리');
    console.log('[Parser] 파일:', pdfFile?.name, '크기:', pdfFile?.size, 'bytes');

    // Safari DataCloneError 방지: File 객체 대신 순수 ArrayBuffer를 전달
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfDoc      = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages  = Math.min(pdfDoc.numPages, MAX_PAGES);

    console.log('[Parser] 총 페이지 수:', totalPages);

    // ── 페이지별 독립 파싱 ──
    const allRawStages = [];
    for (let p = 1; p <= totalPages; p++) {
      const page       = await pdfDoc.getPage(p);
      const pageStages = await parsePdfPage(page, p);
      allRawStages.push(...pageStages);
    }

    // ── 제품 없는 stage 제거 + prescriptionModel 스키마로 변환 ──
    const prescriptions = allRawStages
      .filter(s => s.productTexts.length > 0)
      .map(s => ({
        stageType:  '기타',
        stageLabel: s.labelLines.join('\n'),
        items: s.productTexts
          .map(text => parseProductRow(text))
          .filter(i => i.originalName.length > 1)
      }))
      .filter(p => p.items.length > 0);

    console.log('[Parser] 최종 처방 그룹 수:', prescriptions.length);

    if (prescriptions.length === 0) {
      // 폴백: 구조 인식 실패 → 전체 텍스트 단일 그룹
      console.warn('[Parser] stage 미감지 → 전체 텍스트 단일 그룹 폴백');
      // 전체 페이지 텍스트 재수집
      const allTexts = [];
      for (let p = 1; p <= totalPages; p++) {
        const page = await pdfDoc.getPage(p);
        const vp   = page.getViewport({ scale: 1.0 });
        const tc   = await page.getTextContent();
        const items = [];
        tc.items.forEach(it => {
          if (!it.str.trim()) return;
          const [,,,, x, y] = pdfjsLib.Util.transform(vp.transform, it.transform);
          const w = Math.abs((it.width || 0) * (it.transform ? it.transform[0] : 1));
          items.push({ text: it.str, x: Math.round(x), y: Math.round(y), w: Math.round(w) });
        });
        items.sort((a, b) => a.y - b.y || a.x - b.x);
        groupByRowsLocal(items).forEach(row => {
          const t = joinRowText(row.items);
          if (t) allTexts.push(t);
        });
      }

      if (allTexts.length === 0) {
        alert('처방전에서 텍스트를 추출할 수 없습니다.\n스캔 이미지 PDF는 지원되지 않습니다.');
        return null;
      }
      return {
        farmInfo: { farmName: null, cropName: null, totalArea: null },
        prescriptions: [{
          stageType:  '기타',
          stageLabel: '(자동 인식 불가 — 직접 입력)',
          items: allTexts
            .map(t => ({ originalName: t, mappedId: null, baseQty: null, unit: '', baseArea: null }))
            .filter(i => i.originalName.length > 1)
        }]
      };
    }

    return {
      farmInfo: { farmName: null, cropName: null, totalArea: null },
      prescriptions
    };

  } catch (e) {
    console.error('[Parser] ❌ 오류:', e);
    alert(`처방전 파싱 오류\n\n${e.name}: ${e.message}`);
    return null;
  }
}
