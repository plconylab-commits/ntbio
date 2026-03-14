/**
 * pdfParser.js  v3 — Y-merge · X-sort · joinRowText · multi-line label
 * pdf.js 좌표 기반 처방전 텍스트 추출 — Vision AI 미사용, 브라우저에서 즉시 처리
 * 의존: prescriptionModel.js (calcRequiredQty), productMapper.js (findProduct)
 *
 * 핵심 알고리즘:
 *   1) getTextContent()로 X·Y 좌표 + 화면 너비(w) 추출
 *   2) 러닝 평균 Y 기반으로 ROW_Y_MERGE(5px) 이내 아이템을 같은 행으로 묶기
 *   3) 행 내 아이템 X 오름차순 정렬 → 인접 간격 기반 공백 삽입으로 자연스럽게 조합
 *   4) X < LEFT_X_MAX 행 = 시기/목적 열(좌측), 나머지 = 제품 열(우측)
 *   5) Y 간격 STAGE_Y_GAP 이상 → 새 처방 그룹
 *   6) 좌측 다중 행 라벨 → '\n'으로 누적 → stageLabel
 */

const MAX_PAGES      = 8;
const LEFT_X_MAX     = 160;   // A4 scale=1.0 기준 좌측 열 최대 X (px)
const ROW_Y_MERGE    = 5;     // 같은 행으로 간주할 Y 허용 오차 (px)
const STAGE_Y_GAP    = 50;    // 좌측 그룹 사이 최소 Y 간격 (px)
const WORD_GAP_MIN   = 3;     // 이 px 이상 간격이면 공백 삽입
// 처방 수량 단위: 반드시 숫자 또는 "반" 뒤에 오는 포|병|봉|통|개 만 인식
// → "서귀포", "병원", "개인" 같은 단어 속 오인식 방지
const COUNT_UNITS_RE = /(\d|반)\s*(포|병|봉|통|개)/;

/* ─── 1. PDF → 좌표 아이템 배열 ──────────────────────────────────── */

/**
 * PDF File에서 텍스트·좌표·화면 너비를 추출한다.
 * @param {File} pdfFile
 * @returns {Promise<{text:string, x:number, y:number, w:number, page:number}[]>}
 */
async function extractPdfItems(pdfFile) {
  // Safari DataCloneError 방지: File 객체 대신 순수 ArrayBuffer를 전달
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdfDoc      = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const items  = [];

  for (let p = 1; p <= Math.min(pdfDoc.numPages, MAX_PAGES); p++) {
    const page = await pdfDoc.getPage(p);
    const vp   = page.getViewport({ scale: 1.0 });
    const tc   = await page.getTextContent();

    tc.items.forEach(it => {
      if (!it.str.trim()) return;
      // pdf.js 변환 행렬 → 화면 좌표 (Y: 위=0)
      const [,,,, x, y] = pdfjsLib.Util.transform(vp.transform, it.transform);
      // 화면 너비: advance width × 텍스트 행렬의 x 스케일(transform[0])
      const w = Math.abs((it.width || 0) * (it.transform ? it.transform[0] : 1));
      items.push({
        text: it.str,         // 원본 보존 (trim은 joinRowText에서 일괄 처리)
        x:    Math.round(x),
        y:    Math.round(y),
        w:    Math.round(w),
        page: p
      });
    });
  }

  // 위→아래(y 오름차순), 좌→우(x 오름차순) 정렬
  items.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  console.log(`[Parser] 페이지: ${Math.min(pdfDoc.numPages, MAX_PAGES)}, 아이템: ${items.length}개`);
  return items;
}

/* ─── 2. 아이템 → 행 그룹 (러닝 평균 Y 기반) ────────────────────── */

/**
 * 러닝 평균 Y를 기준으로 ROW_Y_MERGE 이내 아이템을 같은 행으로 묶는다.
 * 묶인 행 내 아이템은 X 오름차순으로 재정렬된다.
 *
 * @param {{text,x,y,w,page}[]} items
 * @returns {{y:number, yAvg:number, page:number, items:{text,x,w}[]}[]}
 */
function groupByRows(items) {
  const rows = [];

  for (const it of items) {
    if (!it.text.trim()) continue;

    // 뒤에서부터 같은 페이지·Y 근접 행 탐색
    let matched = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.page !== it.page)              break;  // 페이지 바뀌면 중단
      if (it.y - r.yMax > ROW_Y_MERGE * 4) break;  // 너무 멀면 탐색 중단
      if (Math.abs(it.y - r.yAvg) <= ROW_Y_MERGE) { matched = r; break; }
    }

    if (matched) {
      matched.items.push(it);
      // 러닝 평균 Y 갱신
      matched.yAvg = matched.items.reduce((s, i) => s + i.y, 0) / matched.items.length;
      matched.yMax = Math.max(matched.yMax, it.y);
    } else {
      rows.push({
        page: it.page,
        y:    it.y,
        yAvg: it.y,
        yMax: it.y,
        items: [it]
      });
    }
  }

  // 각 행 내 X 정렬, 대표 Y 확정
  rows.forEach(row => {
    row.items.sort((a, b) => a.x - b.x);
    row.y = row.yAvg;
  });

  return rows;
}

/* ─── 3. 행 아이템 → 자연스러운 텍스트 조합 ─────────────────────── */

/**
 * 같은 행의 아이템들을 X 정렬 후 인접 간격 기반으로 공백을 삽입해 문자열로 조합한다.
 * - 인접 아이템 간격 <= WORD_GAP_MIN → 붙이기 (파편화된 글자 복원)
 * - 간격 > WORD_GAP_MIN              → 공백 삽입 (단어/열 구분)
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

/* ─── 4. 행 → 처방 그룹 ─────────────────────────────────────────── */

/**
 * 좌측 열 텍스트 덩어리를 처방 그룹으로 묶고
 * 해당 그룹에 가장 가까운 우측 열 제품 행을 배정한다.
 *
 * ★ 좌측 다중 행 라벨: 같은 그룹 내 여러 행 → '\n' 누적 → stageLabel
 *
 * @param {{y,yAvg,page,items}[]} rows
 * @returns {{stageLabel:string, rightTexts:string[]}[]}
 */
function buildPrescriptionGroups(rows) {
  const leftRows  = [];  // { y, page, text }
  const rightRows = [];  // { y, page, text }

  for (const row of rows) {
    const leftItems  = row.items.filter(it => it.x <  LEFT_X_MAX);
    const rightItems = row.items.filter(it => it.x >= LEFT_X_MAX);

    // ── 좌측: 행 내 아이템을 공백 조합해 1개 텍스트로 ──
    if (leftItems.length > 0) {
      const text = joinRowText(leftItems);
      if (text) leftRows.push({ y: row.y, page: row.page, text });
    }

    // ── 우측: 처방 수량 단위(포·병·봉·통·개) 포함 행만 수집 ──
    if (rightItems.length > 0) {
      const text = joinRowText(rightItems);
      if (text && COUNT_UNITS_RE.test(text)) {
        rightRows.push({ y: row.y, page: row.page, text });
      }
    }
  }

  // ── 좌측 행을 Y 간격 기준으로 stage block 묶기 ──
  const stageBlocks = [];
  let cur = null;
  for (const lr of leftRows) {
    if (!cur || lr.page !== cur.page || (lr.y - cur.yMax) > STAGE_Y_GAP) {
      cur = { labelLines: [], yMin: lr.y, yMax: lr.y, page: lr.page };
      stageBlocks.push(cur);
    }
    cur.labelLines.push(lr.text);
    cur.yMax = lr.y;
  }

  console.log('[Parser] 감지된 좌측 stage 블록 수:', stageBlocks.length);
  if (stageBlocks.length === 0) return [];

  // ── 각 우측 행을 nearest-midpoint 방식으로 stage block에 배정 ──
  const blockProducts = stageBlocks.map(() => []);

  for (const rr of rightRows) {
    let bestIdx = -1, bestDist = Infinity;
    stageBlocks.forEach((sb, idx) => {
      if (sb.page !== rr.page) return;
      const mid  = (sb.yMin + sb.yMax) / 2;
      const dist = Math.abs(rr.y - mid);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    });
    if (bestIdx >= 0) blockProducts[bestIdx].push(rr.text);
  }

  return stageBlocks.map((sb, idx) => ({
    stageLabel: sb.labelLines.join('\n'),   // 다중 행 라벨 줄바꿈 누적
    rightTexts: blockProducts[idx]
  })).filter(g => g.rightTexts.length > 0);
}

/* ─── 5. 우측 행 → 제품 아이템 파싱 ─────────────────────────────── */

/**
 * 이미 joinRowText()로 조합된 행 텍스트에서 제품명·수량·단위·기준평수를 추출한다.
 *
 * ★ 핵심 규칙
 *   - 처방 수량 단위: 포|병|봉|통|개  → baseQty 추출 대상
 *   - 용량/규격 단위: kg|g|L|ml 등   → 절대 baseQty로 착각하지 않음 (제품명에 보존)
 *                                      예: "양자식물에너지(500ml) 3병 200평"
 *   - 반병|반봉|반통|반포|반개        → baseQty = 0.5
 *   - N평                            → baseArea
 *
 * @param {string} text - joinRowText()로 조합된 행 텍스트
 * @returns {{originalName, mappedId, baseQty, unit, baseArea}}
 */
function parseProductRow(text) {
  const COUNT_UNITS = '포|병|봉|통|개';

  // ── 반+처방단위 우선 처리 (0.5) ──
  const halfM  = new RegExp(`반\\s*(${COUNT_UNITS})`).exec(text);
  // ── 숫자+처방단위 (kg/g/L/ml 등 용량 단위 제외) ──
  const countM = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${COUNT_UNITS})`).exec(text);

  let baseQty = null, unit = '';
  if (halfM)       { baseQty = 0.5;                unit = halfM[1];  }
  else if (countM) { baseQty = Number(countM[1]);  unit = countM[2]; }

  // ── 기준 평수 ──
  const areaM    = text.match(/(\d+(?:\.\d+)?)\s*평/);
  const baseArea = areaM ? Number(areaM[1]) : null;

  // ── 제품명: 처방수량·평수 제거, 용량 규격(kg/g/L/ml)은 보존 ──
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

/* ─── 6. 메인 진입점 ─────────────────────────────────────────────── */

/**
 * PDF File → prescriptionModel 스키마 JSON
 * Vision API 없이 pdf.js 좌표 기반으로 즉시 처리 (1~2초 내)
 *
 * @param {File} pdfFile
 * @returns {Promise<object|null>}
 */
async function parsePdfToJSON(pdfFile) {
  try {
    console.log('[Parser] 시작 ─ v3 (Y-merge·X-sort·joinRowText·multi-line label)');
    console.log('[Parser] 파일:', pdfFile?.name, '크기:', pdfFile?.size, 'bytes');

    const items  = await extractPdfItems(pdfFile);
    const rows   = groupByRows(items);
    const groups = buildPrescriptionGroups(rows);

    if (groups.length === 0) {
      // 좌측 그룹 미감지 → 전체 텍스트를 하나의 그룹으로 폴백
      console.warn('[Parser] 좌측 그룹 미감지 → 전체 텍스트 단일 그룹 폴백');
      const allTexts = rows.map(r => joinRowText(r.items)).filter(Boolean);
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

    const prescriptions = groups.map(g => ({
      stageType:  '기타',
      stageLabel: g.stageLabel,
      items: g.rightTexts
        .map(text => parseProductRow(text))
        .filter(i => i.originalName.length > 1)
    })).filter(p => p.items.length > 0);

    console.log('[Parser] 최종 처방 그룹 수:', prescriptions.length);
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
