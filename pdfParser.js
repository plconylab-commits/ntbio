/**
 * pdfParser.js
 * pdf.js 좌표 기반 처방전 텍스트 추출 — Vision AI 미사용, 브라우저에서 즉시 처리
 * 의존: prescriptionModel.js (calcRequiredQty), productMapper.js (findProduct)
 *
 * 핵심 알고리즘:
 *   1) getTextContent()로 각 아이템의 X·Y 좌표 추출
 *   2) Y 근접 아이템 → 같은 행으로 묶기
 *   3) X < LEFT_X_MAX 행 = 시기/목적 열(좌측), 나머지 = 제품 열(우측)
 *   4) Y 간격이 STAGE_Y_GAP 이상 벌어진 좌측 텍스트 덩어리 = 새 처방 그룹
 */

const MAX_PAGES   = 8;
const LEFT_X_MAX  = 160;  // A4 scale=1.0 기준 좌측 열 최대 X (px)
const ROW_Y_MERGE = 10;   // 같은 행으로 간주할 Y 허용 오차 (px)
const STAGE_Y_GAP = 28;   // 좌측 텍스트 그룹 사이 최소 Y 간격 (px)

/* ─── 1. PDF → 좌표 아이템 배열 ──────────────────────────────────── */

/**
 * PDF File에서 텍스트와 좌표를 추출한다.
 * @param {File} pdfFile
 * @returns {Promise<{text:string, x:number, y:number, page:number}[]>}
 */
async function extractPdfItems(pdfFile) {
  const buf    = await pdfFile.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
  const items  = [];

  for (let p = 1; p <= Math.min(pdfDoc.numPages, MAX_PAGES); p++) {
    const page = await pdfDoc.getPage(p);
    const vp   = page.getViewport({ scale: 1.0 });
    const tc   = await page.getTextContent();

    tc.items.forEach(it => {
      if (!it.str.trim()) return;
      // pdf.js 변환 행렬 적용 → 화면 좌표 (Y: 위=0)
      const [,,,, x, y] = pdfjsLib.Util.transform(vp.transform, it.transform);
      items.push({ text: it.str.trim(), x: Math.round(x), y: Math.round(y), page: p });
    });
  }

  // 위→아래(y 오름차순), 좌→우(x 오름차순) 정렬
  items.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  console.log(`[Parser] 페이지 수: ${Math.min(pdfDoc.numPages, MAX_PAGES)}, 아이템 수: ${items.length}`);
  return items;
}

/* ─── 2. 아이템 → 행 그룹 ────────────────────────────────────────── */

/**
 * Y 좌표가 ROW_Y_MERGE 이내인 아이템을 같은 행으로 묶는다.
 * @param {{text,x,y,page}[]} items
 * @returns {{y:number, page:number, items:{text,x}[]}[]}
 */
function groupByRows(items) {
  const rows = [];
  for (const it of items) {
    const last = rows[rows.length - 1];
    if (last && last.page === it.page && Math.abs(it.y - last.y) <= ROW_Y_MERGE) {
      last.items.push(it);
    } else {
      rows.push({ y: it.y, page: it.page, items: [it] });
    }
  }
  return rows;
}

/* ─── 3. 행 → 처방 그룹 ─────────────────────────────────────────── */

/**
 * 좌측 열(x < LEFT_X_MAX) 텍스트 덩어리를 처방 그룹으로 묶고
 * 해당 Y 범위에 속하는 우측 열 텍스트를 제품 행으로 매핑한다.
 *
 * @param {{y,page,items}[]} rows
 * @returns {{stageLabel:string, rightRows:string[][]}[]}
 */
function buildPrescriptionGroups(rows) {
  // 좌측/우측 아이템 분리
  const leftItems  = [];
  const rightItems = [];

  for (const row of rows) {
    for (const it of row.items) {
      const bucket = it.x < LEFT_X_MAX ? leftItems : rightItems;
      bucket.push({ y: row.y, page: row.page, text: it.text });
    }
  }

  // 좌측 아이템을 Y 간격 기준으로 stage block 묶기
  const stageBlocks = [];
  let cur = null;
  for (const li of leftItems) {
    if (!cur || li.page !== cur.page || (li.y - cur.yMax) > STAGE_Y_GAP) {
      cur = { texts: [], yMin: li.y, yMax: li.y, page: li.page };
      stageBlocks.push(cur);
    }
    cur.texts.push(li.text);
    cur.yMax = li.y;
  }

  console.log('[Parser] 감지된 좌측 stage 블록 수:', stageBlocks.length);

  // 각 stage block에 우측 행 매핑 (다음 블록 시작 Y 미만까지)
  const groups = stageBlocks.map((sb, idx) => {
    const nextSb = stageBlocks[idx + 1];
    const yEnd   = (nextSb && nextSb.page === sb.page) ? nextSb.yMin : Infinity;

    const matched = rightItems.filter(
      ri => ri.page === sb.page && ri.y >= sb.yMin - ROW_Y_MERGE && ri.y < yEnd
    );

    // 우측 아이템을 같은 Y끼리 다시 묶기(= 하나의 제품 행)
    const rightRows = [];
    let lastRR = null;
    for (const ri of matched) {
      if (!lastRR || Math.abs(ri.y - lastRR.y) > ROW_Y_MERGE) {
        lastRR = { y: ri.y, texts: [] };
        rightRows.push(lastRR);
      }
      lastRR.texts.push(ri.text);
    }

    return {
      stageLabel: sb.texts.join('\n'),   // 줄바꿈 그대로 보존
      rightRows:  rightRows.map(r => r.texts)
    };
  });

  return groups.filter(g => g.rightRows.length > 0);
}

/* ─── 4. 우측 행 → 제품 아이템 파싱 ─────────────────────────────── */

/**
 * 제품 행 텍스트(여러 열 합산)에서 제품명·수량·단위·기준평수를 추출한다.
 *
 * ★ 핵심 규칙
 *   - 처방 수량 단위: 포|병|봉|통|개  → baseQty 추출 대상
 *   - 용량/규격 단위: kg|g|L|ml 등   → 절대 baseQty로 착각하지 않음
 *                                      제품 규격 힌트로만 사용 (originalName에 보존)
 *   - 반병|반봉|반통|반포|반개       → baseQty = 0.5 (무조건)
 *   - N평                            → baseArea
 *
 * @param {string[]} texts - 같은 행의 텍스트 목록
 * @returns {{originalName,mappedId,baseQty,unit,baseArea}}
 */
function parseProductRow(texts) {
  const line = texts.join(' ');

  // ── 1. 처방 수량 단위 목록 (용량·규격 단위 kg/g/L/ml 등은 포함 안 함) ──
  // 이 단위만 baseQty 추출 대상으로 허용
  const COUNT_UNITS = '포|병|봉|통|개';

  // ── 2. 반+처방단위 우선 처리 (0.5) ──────────────────────────────
  const halfRe = new RegExp(`반\\s*(${COUNT_UNITS})`);
  const halfM  = halfRe.exec(line);

  // ── 3. 숫자+처방단위 패턴 (kg/g/L/ml 등 용량 단위는 제외) ────────
  const countRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${COUNT_UNITS})`);
  const countM  = countRe.exec(line);

  let baseQty = null, unit = '';
  if (halfM)       { baseQty = 0.5;                unit = halfM[1];  }
  else if (countM) { baseQty = Number(countM[1]);  unit = countM[2]; }

  // ── 4. 기준 평수 추출 ─────────────────────────────────────────────
  const areaM   = line.match(/(\d+(?:\.\d+)?)\s*평/);
  const baseArea = areaM ? Number(areaM[1]) : null;

  // ── 5. 제품명 추출 ────────────────────────────────────────────────
  // · 처방수량(N포/반병 등)과 평수(N평)는 제거
  // · kg/g/L/ml 등 용량 규격은 제품명의 일부이므로 절대 제거 안 함
  //   예: "양자식물에너지(500ml) 3병 200평" → originalName = "양자식물에너지(500ml)"
  const namePart = line
    .replace(new RegExp(`반\\s*(${COUNT_UNITS})`, 'g'), '')
    .replace(new RegExp(`\\d+(?:\\.\\d+)?\\s*(${COUNT_UNITS})`, 'g'), '')
    .replace(/\d+(?:\.\d+)?\s*평/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    originalName: namePart || texts[0] || '',
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
    console.log('[Parser] 시작 ─ pdf.js 좌표 기반 파싱');
    console.log('[Parser] 파일:', pdfFile?.name, '크기:', pdfFile?.size, 'bytes');

    const items  = await extractPdfItems(pdfFile);
    const rows   = groupByRows(items);
    const groups = buildPrescriptionGroups(rows);

    if (groups.length === 0) {
      // 좌측 그룹 미감지 → 전체 텍스트를 하나의 그룹으로 폴백
      console.warn('[Parser] 좌측 그룹 미감지 → 전체 텍스트 단일 그룹 폴백');
      const allTexts = rows.map(r => r.items.map(i => i.text).join(' ')).filter(Boolean);
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
      items: g.rightRows
        .map(parseProductRow)
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
