/**
 * pdfParser.js  v13 — 절대 규칙: stageLabel = 좌측 셀 전체 텍스트(최상단 우선), 제품 Y 정렬 제거
 * pdf.js 좌표 기반 처방전 텍스트 추출 — Vision AI 미사용, 브라우저에서 즉시 처리
 * 의존: prescriptionModel.js (calcRequiredQty), productMapper.js (findProduct),
 *       rxNormalizer.js (classifyRightRow, buildRxRow, inferTotalArea, normalizeUsage)
 *
 * 핵심 알고리즘:
 *   1) 페이지별 독립 처리 (페이지 간 Y 좌표 혼용 완전 차단)
 *   2) 좌측 열(x < LEFT_X_MAX) 행들을 Y 간격(STAGE_Y_GAP) 기준으로 stage 블록 분리
 *      → 키워드 방식 불사용: 우측 설명문 "관주방법(550평)" 등 오인식 원천 차단
 *   3) 우측 열(x >= LEFT_X_MAX) 모든 행 수집 → classifyRightRow()로 분류
 *      → 'product' 행: buildRxRow() 로 RxRow 생성 (v7 신규)
 *      → 'usage'   행: normalizeUsage() 로 사용방법 파싱 (v7 신규)
 *      → 'description'/'skip' 행: 무시
 *   4) 블록 내 여러 라벨 행 → '\n' 누적 → stageLabel (수확:후, 및, 날짜 포함)
 *   5) 후처리: inferTotalArea(allRxRows) 로 총 평수 추정 (v7 신규)
 *
 * 분석 근거 (천혜향 550평 PDF page2):
 *   LEFT  y=96  "옥토팜(발효계분"  →  stage1 (gap=127px 이후 stage2)
 *   LEFT  y=223 "감사" / y=259 "비료" / y=294 "수확:후" / y=329 "및" / y=366 "3월-4월"
 *              → 내부 간격 35-37px < 50px → 하나의 stage2 블록
 *   RIGHT y=294 "옥스팜(입상) 550평 10포" → 선행블록 stage2 배정 ✓
 *
 * v7 변경 사항:
 *   - 우측 행 수집 방식: COUNT_UNITS_RE 필터 제거 → 전체 수집 후 classifyRightRow() 분류
 *   - blockUsage 배열 추가: usage 행도 블록에 배정
 *   - buildRxRow() 사용: 제품 행마다 완성된 RxRow 생성
 *   - allRxRows 누적 후 inferTotalArea() 호출
 *   - 반환값에 rxRows 추가 (prescriptions 기존 형식 유지 — 하위 호환)
 */

const MAX_PAGES          = 8;
const LEFT_X_MAX         = 160;   // A4 scale=1.0 기준 좌측 열 최대 X (px)
const ROW_Y_MERGE        = 8;     // 같은 행으로 간주할 Y 허용 오차 (px)
const STAGE_Y_GAP        = 60;    // stage_core 행이 새 블록을 시작하는 Y 간격 (px) — v11: 50→60 (+20%)
const LEFT_CELL_MAX_GAP  = 120;   // non-core 행(note/date 등)을 현재 블록에 병합하는 최대 Y 간격 (px)
const WORD_GAP_MIN       = 3;     // 이 px 이상 간격이면 공백 삽입

// 처방 수량 단위: 반드시 숫자 또는 "반" 뒤에 오는 포|병|봉|통|개 만 인식
// → "서귀포", "병원", "개인" 같은 단어 속 오인식 방지
// v7: COUNT_UNITS_RE 는 하위 호환 목적으로만 유지 (우측 행 수집 필터로는 미사용)
const COUNT_UNITS_RE = /(\d|반)\s*(포|병|봉|통|개)/;

/* ─── 1. 행 아이템 → 자연스러운 텍스트 조합 ─────────────────────── */

/**
 * 같은 행의 아이템들을 X 정렬 후 인접 간격 기반으로 공백을 삽입해 문자열로 조합한다.
 */
function joinRowText(items) {
  if (!items.length) return '';
  let out = items[0].text;
  for (let i = 1; i < items.length; i++) {
    const prev  = items[i - 1];
    const curr  = items[i];
    const prevW = prev.w > 0 ? prev.w : prev.text.length * 6;
    const gap   = curr.x - (prev.x + prevW);
    out += (gap > WORD_GAP_MIN ? ' ' : '') + curr.text;
  }
  return out.trim();
}

/* ─── 2. 페이지 로컬 아이템 → 행 그룹 (러닝 평균 Y) ────────────────── */

/**
 * 한 페이지 내 아이템을 러닝 평균 Y 기준으로 ROW_Y_MERGE 이내끼리 같은 행으로 묶는다.
 */
function groupByRowsLocal(items) {
  const rows = [];
  for (const it of items) {
    if (!it.text.trim()) continue;
    let matched = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (it.y - r.yMax > ROW_Y_MERGE * 4) break;
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
  rows.forEach(row => {
    row.items.sort((a, b) => a.x - b.x);
    row.y = row.yAvg;
  });
  return rows;
}

/* ─── 3. 키워드 → stage 타입 자동 분류 ──────────────────────────── */

function detectStageType(text) {
  if (/관주/.test(text)) return '관주';
  if (/엽면/.test(text)) return '엽면';
  if (/기비|밑거름|토양/.test(text)) return '기비';
  if (/감사|수확/.test(text)) return '감사비료';
  if (/추비/.test(text)) return '추비';
  return '기타';
}

/* ─── 3b-1. 제품 헤더 블록 감지 ─────────────────────────────────── */

/**
 * 좌측 블록이 "제품명 나열 헤더" 인지 판별한다.
 * 조건: 수량 없이 "한글단어(" 패턴이 2개 이상 등장 → 제품 alias 목록으로 간주
 *
 * 예) "옥토팜(발효계분)\n옥스팜(휴믹산+풀빅산)부식산\n뉴천연팜(종합광물)" → true
 *     "관주1차"  → false
 */
function isProductHeaderBlock(lines) {
  const text = lines.join(' ');
  // 수량 단위(포/병 등)가 있으면 일반 제품 행 → false
  if (/(\d|반)\s*(포|병|봉|통|개)/.test(text)) return false;
  // 한글/영문 단어 + "(" 패턴이 2개 이상
  const hits = text.match(/[가-힣A-Za-z][가-힣A-Za-z0-9]*\s*\(/g) || [];
  return hits.length >= 2;
}

/**
 * 헤더 블록에서 각 행 텍스트를 headerProducts[] 로 추출한다.
 */
function extractHeaderProductNames(lines) {
  return lines.map(l => l.trim()).filter(l => l.length > 1);
}

/**
 * stageBlock에서 그룹 헤더용 단축 라벨을 결정한다.
 *
 * 절대 규칙 (v13):
 *   병합된 좌측 셀 내에 여러 줄이 있어도 무조건 가장 상단(Y 최소) stage_core 행을 사용.
 *   제품과 수평이 맞는 행이 있더라도 완전히 무시 — 오직 최상단 우선.
 *   stage_core 행이 없으면 첫 번째 행(topmost)으로 fallback.
 *
 * ※ 처방 단계의 표시 라벨(stageLabel)은 _cleanLeftCellText()의 전체 결과를 사용한다.
 *   이 함수는 그룹 타입 감지·rxGroup 헤더에만 사용된다.
 *
 * @param {object} sb - stageBlock 객체
 */
function _primaryStageLabel(sb) {
  const lines    = sb.lines    || [];
  const rowTypes = sb.rowTypes || [];
  const lineYs   = sb.lineYs  || [];

  // 가장 상단(Y 최소) stage_core 행 탐색
  let minY = Infinity, minIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const y = lineYs[i] !== undefined ? lineYs[i] : i;
    if (rowTypes[i] === 'stage_core' && y < minY) { minY = y; minIdx = i; }
  }
  if (minIdx < 0) minIdx = 0; // fallback: 첫 행 (topmost)

  // 해당 행 + 직후 괄호 행 결합 ("옥토팜\n(발효계분)" → "옥토팜(발효계분)")
  let label = lines[minIdx] ? lines[minIdx].trim() : '';
  for (let i = minIdx + 1; i < lines.length; i++) {
    if (/^\(/.test(lines[i].trim())) label += lines[i].trim();
    else break;
  }
  return label;
}

/**
 * 좌측 셀 lines[] → 사람이 읽기 좋은 단일 문자열 정리
 *   "옥토팜\n(발효계분)"  → "옥토팜(발효계분)"   ← 괄호 줄바꿈 결합
 *   "감사\n비료"          → "감사 비료"           ← 연속 note/connector 공백 병합
 *   "관주 1번\n3월-4월"   → "관주 1번\n3월-4월"  ← 날짜는 개행 유지
 */
function _cleanLeftCellText(lines) {
  if (!lines || !lines.length) return '';
  const out = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    // "(" 로 시작하면 직전 줄 끝에 이어 붙이기 (괄호 줄바꿈 재결합)
    if (out.length > 0 && /^\(/.test(t)) {
      out[out.length - 1] += t;
      continue;
    }
    const type = classifyLeftRow(t);
    // date 행: 개행 구분 유지
    if (type === 'date') { out.push(t); continue; }
    // note/connector 이고 직전 줄이 note 계열이면 공백 병합
    if (type === 'note' || type === 'connector') {
      if (out.length > 0) {
        const prevType = classifyLeftRow(out[out.length - 1].split('\n').pop());
        if (prevType === 'note' || prevType === 'connector' || prevType === 'stage_core') {
          out[out.length - 1] += ' ' + t;
          continue;
        }
      }
    }
    out.push(t);
  }
  return out.join('\n').trim();
}

/* ─── 3b. 2계층 블록 역할 분류 ──────────────────────────────────── */

/**
 * stageBlock이 상위 그룹 헤더인지 하위 단계인지 구분한다.
 *   'stage' : 관주/엽면이 명시된 하위 시비 단계
 *   'group' : 상위 시기/목적 블록 (감사, 수확, 기비, 정식, note-only 등)
 */
function classifyBlockRole(sb) {
  const coreLines = (sb.lines || []).filter((_, i) => (sb.rowTypes || [])[i] === 'stage_core');
  if (!coreLines.length) return 'group';
  return coreLines.some(l => /관주|엽면/.test(l)) ? 'stage' : 'group';
}

/** 그룹 헤더 라벨로 그룹 타입을 분류한다. */
function detectGroupType(label) {
  if (/감사|수확/.test(label))        return '감사비료';
  if (/기비|밑거름|토양/.test(label)) return '기비';
  if (/정식/.test(label))             return '정식';
  if (/추비/.test(label))             return '추비';
  if (/관주/.test(label))             return '관주';
  if (/엽면/.test(label))             return '엽면';
  return '기타';
}

/** 단계 라벨에서 순서 번호(1번, 2차, 3회)를 추출한다. */
function extractStageOrder(label) {
  const m = (label || '').match(/(\d+)\s*(번|차|회)/);
  return m ? Number(m[1]) : null;
}

/* ─── 3c. 좌측 행 타입 분류 ────────────────────────────────────── */

/**
 * 좌측 열 한 행의 텍스트를 의미적으로 분류한다.
 *
 * @param {string} text
 * @returns {'stage_core'|'date'|'connector'|'note'|'empty'}
 *
 * stage_core  → 새로운 처방 단계 시작 (관주, 엽면, 기비, 감사, 정식, 추비 등)
 * date        → 날짜/시기 표현 ("3월-4월", "2024.03.01" 등)
 * connector   → 단순 연결어 ("및", "와", "+", "~")
 * note        → 단계명 연속 텍스트 ("감사", "비료" 처럼 단독으로는 stage 키워드 아님)
 * empty       → 빈 셀 (rowspan 후보)
 */
function classifyLeftRow(text) {
  if (!text || !text.trim()) return 'empty';
  const t = text.trim();

  // ── stage_core: rxNormalizer.STAGE_ALIASES 매칭 (전역 배열 사용) ──
  if (typeof STAGE_ALIASES !== 'undefined') {
    for (const rule of STAGE_ALIASES) {
      if (rule.re.test(t)) return 'stage_core';
    }
  } else {
    // rxNormalizer 미로드 시 fallback 키워드
    if (/관주|엽면|기비|밑거름|토양처리|정식|추비|감사|수확/.test(t)) return 'stage_core';
  }

  // ── date: 월/날짜 표현 ──────────────────────────────────────────
  if (/\d+\s*월|\d{4}\s*[.\-\/]\s*\d{1,2}|\d+\s*[-~]\s*\d+\s*월/.test(t)) return 'date';

  // ── connector: 짧은 연결어 ───────────────────────────────────────
  if (/^(및|와|과|또는|[+\/~&])$/.test(t)) return 'connector';

  // ── note: 그 외 (단계명의 연속 텍스트, 예: "비료", "후보정" 등) ──
  return 'note';
}

/* ─── 4. 우측 행 → 제품 아이템 파싱 (하위 호환 레거시) ───────────── */

/**
 * joinRowText()로 조합된 행 텍스트에서 제품명·수량·단위·기준평수를 추출한다.
 *
 * ★ v7: 이 함수는 하위 호환 prescriptions 배열(items) 생성을 위해 유지된다.
 *        새 파이프라인에서는 buildRxRow() 를 사용한다.
 *
 * ★ 처방 수량 단위: 포|병|봉|통|개  (용량 단위 kg/g/L/ml 는 제품명에 보존)
 * ★ 반병|반봉|반통|반포|반개 → baseQty = 0.5
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

  const namePart = text
    .replace(new RegExp(`반\\s*(${COUNT_UNITS})`, 'g'), '')
    .replace(new RegExp(`\\d+(?:\\.\\d+)?\\s*(${COUNT_UNITS})`, 'g'), '')
    .replace(/\d+(?:\.\d+)?\s*평/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { originalName: namePart || text, mappedId: null, baseQty, unit, baseArea };
}

/* ─── 5. 메인 진입점 ─────────────────────────────────────────────── */

/**
 * PDF File → prescriptionModel 스키마 JSON
 *
 * v7 반환 형식:
 * {
 *   farmInfo:      { farmName, cropName, totalArea }    — 기존과 동일
 *   prescriptions: [ { stageType, stageLabel, items[], sourcePage, pageGroup, pageType } ]
 *                                                       — 기존과 동일 (하위 호환)
 *   rxRows:        [ RxRow, … ]                         — v7 신규: 정규화된 처방 행 배열
 * }
 *
 * @param {File} pdfFile
 * @returns {Promise<object|null>}
 */
async function parsePdfToJSON(pdfFile) {
  try {
    console.log('[Parser] v7 시작 — 정규화 파이프라인 + 행 분류');
    console.log('[Parser] 파일:', pdfFile?.name, '크기:', pdfFile?.size, 'bytes');

    // Safari DataCloneError 방지: File 객체 대신 순수 ArrayBuffer 전달
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfDoc      = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages  = Math.min(pdfDoc.numPages, MAX_PAGES);

    console.log('[Parser] 총 페이지 수:', totalPages);

    const allPrescriptions = [];
    const allRxRows        = [];  // v7 신규: 모든 페이지의 RxRow 누적
    const allRxGroups      = [];  // v9 신규: 2계층 그룹 (groupHeader > stages)

    // ── 페이지별 독립 처리 ──────────────────────────────────────────
    // v11: 첫 번째 페이지(p=1)는 표지('사용방법'/'농가명' 텍스트 포함)로 간주해 스킵
    const START_PAGE = 2;
    for (let p = START_PAGE; p <= totalPages; p++) {
      const page = await pdfDoc.getPage(p);
      const vp   = page.getViewport({ scale: 1.0 });
      const tc   = await page.getTextContent();

      // 아이템 추출 (페이지 로컬 좌표)
      const items = [];
      tc.items.forEach(it => {
        if (!it.str.trim()) return;
        const [,,,, x, y] = pdfjsLib.Util.transform(vp.transform, it.transform);
        const w = Math.abs((it.width || 0) * (it.transform ? it.transform[0] : 1));
        items.push({ text: it.str, x: Math.round(x), y: Math.round(y), w: Math.round(w) });
      });

      if (!items.length) continue;
      items.sort((a, b) => a.y - b.y || a.x - b.x);
      const rows = groupByRowsLocal(items);

      // ── 좌측/우측 열 분리 ────────────────────────────────────────
      // 적응형 열 경계 감지: 아이템 x좌표 분포를 보고 자동으로 경계 결정
      // 기본값 LEFT_X_MAX(160)에서 좌측 아이템이 너무 적으면 더 넓은 범위로 재시도
      let effectiveLeftXMax = LEFT_X_MAX;
      {
        const allX = rows.flatMap(r => r.items.map(it => it.x));
        if (allX.length > 0) {
          // 전체 폭의 25~40% 구간에서 x밀도가 낮은 곳을 경계로 감지
          const maxX = Math.max(...allX);
          if (maxX > 0) {
            const lo = Math.round(maxX * 0.2), hi = Math.round(maxX * 0.45);
            // 해당 범위에서 x값이 가장 적은 구간을 12px 슬라이딩 윈도우로 탐색
            let bestX = LEFT_X_MAX, bestGap = Infinity;
            for (let cx = lo; cx <= hi; cx += 4) {
              const cnt = allX.filter(x => x >= cx && x < cx + 12).length;
              if (cnt < bestGap) { bestGap = cnt; bestX = cx + 6; }
            }
            if (bestX > LEFT_X_MAX && bestGap === 0) {
              effectiveLeftXMax = bestX;
              console.log(`[Parser] page ${p} 적응형 열 경계: ${bestX}px`);
            }
          }
        }
      }

      const leftRows  = [];  // { y, text } — 시기/목적 열 (stage 라벨)

      // v7: 우측 행을 COUNT_UNITS_RE 필터 없이 모두 수집한다.
      //     분류는 classifyRightRow() 에게 위임.
      // rightRowsLegacy: 하위 호환용 — 기존 COUNT_UNITS_RE 필터 유지
      const rightRowsAll    = [];  // v7: 모든 우측 행 { y, text, kind }
      const rightRowsLegacy = [];  // 하위 호환: COUNT_UNITS_RE 통과한 행만

      for (const row of rows) {
        const leftItems  = row.items.filter(it => it.x <  effectiveLeftXMax);
        const rightItems = row.items.filter(it => it.x >= effectiveLeftXMax);
        const lt = joinRowText(leftItems);
        const rt = joinRowText(rightItems);

        // ── v8: split-row 감지 ────────────────────────────────────
        // 같은 행에 좌우 텍스트가 모두 있고, 좌측이 stage_core가 아닌데
        // 합쳤을 때 제품 행으로 분류되면 → 좌(제품명) + 우(수량)가
        // 열 경계에 걸쳐 분리된 것 → 합쳐서 우측 제품 행으로 처리
        if (lt && rt) {
          const ltType = classifyLeftRow(lt);
          if (ltType !== 'stage_core') {
            const combined = (lt + ' ' + rt).trim();
            const combinedKind = classifyRightRow(combined);
            if (combinedKind === 'product') {
              rightRowsAll.push({ y: row.y, text: combined, kind: 'product', splitMerged: true });
              if (COUNT_UNITS_RE.test(combined)) rightRowsLegacy.push({ y: row.y, text: combined });
              console.log(`[Parser v8] split-row 병합: "${combined}" (y=${row.y})`);
              continue;   // lt를 leftRows에 넣지 않고 이 행 처리 완료
            }
          }
        }

        if (lt) leftRows.push({ y: row.y, text: lt });
        if (rt) {
          const kind = classifyRightRow(rt);
          if (kind !== 'skip') {
            rightRowsAll.push({ y: row.y, text: rt, kind });
          }
          if (COUNT_UNITS_RE.test(rt)) rightRowsLegacy.push({ y: row.y, text: rt });
        }
      }

      // ── v9: 괄호 행 병합 ─────────────────────────────────────────
      // PDF 추출에서 "옥토팜", "(", "발효계분", ")" 가 별도 행으로 쪼개지는 경우:
      // "(" 로 시작하는 leftRow → 직전 행에 append 하여 재결합
      for (let i = leftRows.length - 1; i >= 1; i--) {
        if (/^\(/.test(leftRows[i].text.trim())) {
          leftRows[i - 1].text += leftRows[i].text.trim();
          leftRows.splice(i, 1);
        }
      }

      // product/usage 행 분리
      const productRowsAll = rightRowsAll.filter(r => r.kind === 'product');
      const usageRowsAll   = rightRowsAll.filter(r => r.kind === 'usage');

      if (!leftRows.length && !rightRowsAll.length) continue;

      // ── 좌측 행 → 행 타입 분류 기반 stage 블록 구성 (v8) ───────────
      //
      // v7(이전): Y-gap(50px)만으로 새 블록 결정
      //   → 문제: "감사"(y=223) "비료"(y=259) 처럼 한 셀 내 줄 사이 gap이
      //            50px를 넘으면 강제로 두 블록 분리 → 제품 오배정
      //
      // v8(현재): classifyLeftRow()로 stage_core / note / date / connector / empty 분류
      //   → stage_core만 STAGE_Y_GAP 기준 새 블록
      //   → note/date/connector는 LEFT_CELL_MAX_GAP(120px) 이내면 현재 블록 병합
      //   → empty(빈 셀)는 rowspan 후보: 현재 블록 rowspanRows 카운터만 증가
      //
      // trace[] 는 배정 결정 과정을 기록해 검증 모달에서 "원문 셀 보기"에 활용

      const stageBlocks = [];  // { lines[], rowTypes[], yMin, yMax, rowspanRows, trace[] }
      let curBlock = null;

      for (const lr of leftRows) {
        const rowType = classifyLeftRow(lr.text);
        const gap     = curBlock ? (lr.y - curBlock.yMax) : Infinity;

        // ── 빈 셀(empty): rowspan 후보 ────────────────────────────
        // 현재 블록에 rowspan 카운터만 증가, 제품 배정 yMin은 유지
        if (rowType === 'empty') {
          if (curBlock) {
            curBlock.rowspanRows++;
            curBlock.trace.push(`  [rowspan?] y=${lr.y} gap=${Math.round(gap)}px — 빈 좌측 셀, 위 블록 rowspan 후보`);
          }
          continue;
        }

        // ── 새 블록 시작 여부 결정 ────────────────────────────────
        let startNew = !curBlock;
        if (!startNew) {
          if (rowType === 'stage_core') {
            // stage_core 는 STAGE_Y_GAP 초과 시 새 블록
            startNew = gap > STAGE_Y_GAP;
          } else {
            // note / date / connector 는 LEFT_CELL_MAX_GAP 초과 시만 강제 분리
            // 그 이내면 같은 셀의 연속 텍스트로 병합
            startNew = gap > LEFT_CELL_MAX_GAP;
          }
        }

        if (startNew) {
          curBlock = {
            lines:        [lr.text],
            rowTypes:     [rowType],
            lineYs:       [lr.y],   // v11: 각 행의 Y좌표 (topmost stageLabel 선택에 사용)
            yMin:         lr.y,
            yMax:         lr.y,
            rowspanRows:  1,
            trace:        [`[new:${rowType}] y=${lr.y} gap=${Math.round(gap)}px — "${lr.text}"`]
          };
          stageBlocks.push(curBlock);
          console.log(`[Parser v11] 새 블록 (page ${p}, y=${lr.y}, gap=${Math.round(gap)}px, type=${rowType}):`, lr.text);
        } else {
          curBlock.lines.push(lr.text);
          curBlock.rowTypes.push(rowType);
          curBlock.lineYs.push(lr.y);
          curBlock.yMax = lr.y;
          curBlock.rowspanRows++;
          curBlock.trace.push(`  [merge:${rowType}] y=${lr.y} gap=${Math.round(gap)}px — "${lr.text}"`);
        }
      }

      // stage_core가 없는 고아 블록(note만으로 구성) → 직전 블록에 병합
      for (let i = stageBlocks.length - 1; i >= 1; i--) {
        const sb = stageBlocks[i];
        if (!sb.rowTypes.includes('stage_core')) {
          const prev = stageBlocks[i - 1];
          prev.lines.push(...sb.lines);
          prev.rowTypes.push(...sb.rowTypes);
          prev.yMax = Math.max(prev.yMax, sb.yMax);
          prev.rowspanRows += sb.rowspanRows;
          prev.trace.push(`  [orphan-merge] 직전 블록에 병합 (y=${sb.yMin}~${sb.yMax})`);
          prev.trace.push(...sb.trace);
          stageBlocks.splice(i, 1);
        }
      }

      // 좌측 열 없이 제품만 있는 페이지 → 이름 없는 단일 블록
      if (!stageBlocks.length && rightRowsAll.length > 0) {
        stageBlocks.push({ lines: [], rowTypes: [], yMin: 0, yMax: 0, rowspanRows: 0, trace: ['[no-left] product-only page'] });
      }
      if (!stageBlocks.length) continue;

      // ── 우측 행(제품/usage) → 마지막 선행 블록(yMin ≤ 행 Y) 배정 ──
      // nearest-midpoint 대신 사용: 동일 Y 행 경계에서 오배정 방지
      const blockProducts = stageBlocks.map(() => []);  // 하위 호환 (레거시 행)
      const blockProductsV7 = stageBlocks.map(() => []); // v7 product 행
      const blockUsage    = stageBlocks.map(() => []);   // v7 usage 행
      // v12: 블록별 첫 번째 제품 행 Y (stageLabel Y 정렬에 사용)
      const blockFirstProductY = stageBlocks.map(() => null);

      // 하위 호환: rightRowsLegacy 배정
      for (const rr of rightRowsLegacy) {
        let bestIdx = 0;
        for (let i = 0; i < stageBlocks.length; i++) {
          if (stageBlocks[i].yMin <= rr.y) bestIdx = i;
        }
        blockProducts[bestIdx].push(rr.text);
      }

      // v7: product 행 배정 + v12: 첫 제품 Y 기록
      for (const rr of productRowsAll) {
        let bestIdx = 0;
        for (let i = 0; i < stageBlocks.length; i++) {
          if (stageBlocks[i].yMin <= rr.y) bestIdx = i;
        }
        blockProductsV7[bestIdx].push(rr.text);
        if (blockFirstProductY[bestIdx] === null) blockFirstProductY[bestIdx] = rr.y; // v12
      }

      // v7: usage 행 배정
      for (const rr of usageRowsAll) {
        let bestIdx = 0;
        for (let i = 0; i < stageBlocks.length; i++) {
          if (stageBlocks[i].yMin <= rr.y) bestIdx = i;
        }
        blockUsage[bestIdx].push(rr.text);
      }

      // ── 블록 → prescription 변환 ─────────────────────────────────
      stageBlocks.forEach((sb, idx) => {
        const prods       = blockProducts[idx];       // 하위 호환
        const prodsV7     = blockProductsV7[idx];     // v7
        const usageTexts  = blockUsage[idx];          // v7

        // 하위 호환: 레거시 행이 없으면 v7 product 행으로 대체
        const effectiveProds = prods.length > 0 ? prods : prodsV7;

        // ── v9: 제품 없는 블록 처리 ────────────────────────────────
        if (!effectiveProds.length) {
          const noStageCore = !(sb.rowTypes || []).includes('stage_core');
          if (noStageCore) {
            // ── Case A: 제품 헤더 블록 (수량 없이 제품명 2개 이상 나열) ──
            // 예: "옥토팜(발효계분)\n옥스팜(휴믹산+풀빅산)\n뉴천연팜(종합광물)"
            // → 다음 rxGroup 의 headerProducts 로 연결 보존
            if (isProductHeaderBlock(sb.lines)) {
              sb._isHeaderBlock  = true;
              sb._headerProducts = extractHeaderProductNames(sb.lines);
              sb.trace && sb.trace.push(`[product-header] 제품 나열 헤더 감지: ${sb._headerProducts.join(' / ')}`);
              console.log(`[Parser v9] product-header block (page ${p}):`, sb._headerProducts);
              return; // prescription 미생성, headerProducts로만 보존
            }
            // ── Case B: 기존 rescue (dosage 있는 라벨 행) ────────────────
            if (idx + 1 < stageBlocks.length) {
              const rescuable = sb.lines.filter(l => classifyRightRow(l) === 'product' || COUNT_UNITS_RE.test(l));
              if (rescuable.length) {
                blockProductsV7[idx + 1].unshift(...rescuable);
                blockProducts[idx + 1].unshift(...rescuable.filter(l => COUNT_UNITS_RE.test(l)));
                sb.trace && sb.trace.push(`[rescue→${idx+1}] 제품 ${rescuable.length}개 이관`);
              }
            }
          }
          return;
        }

        // v13: stageLabel 표시용 = 좌측 셀 전체 정제 텍스트 (최상단이 자연스럽게 제일 위)
        //      primaryLabel = 최상단 stage_core 행 (타입 감지·rxGroup 헤더용)
        const label        = _cleanLeftCellText(sb.lines); // 전체 정제 텍스트
        const primaryLabel = _primaryStageLabel(sb);       // 최상단 단축 라벨 (타입/그룹용)

        // ★ stage 라벨에서 기준 평수 추출 (예: "관주방법(550평)" → 550)
        // 제품 행에 평수가 없을 때 폴백으로 사용
        const labelAreaM    = label.match(/(\d+(?:\.\d+)?)\s*평/);
        const labelBaseArea = labelAreaM ? Number(labelAreaM[1]) : null;

        // v7: usage 행에서 첫 번째 사용방법 파싱 (폴백 평수 추가 확보)
        let usageContext = null;
        if (usageTexts.length > 0) {
          usageContext = normalizeUsage(usageTexts[0]);
        }

        // v7: fallbackArea 결정 — stage 라벨 평수 우선, 없으면 usage 평수
        let fallbackArea = labelBaseArea;
        if (fallbackArea === null && usageContext && usageContext.baseArea !== null) {
          fallbackArea = usageContext.baseArea;
        }

        // ── 하위 호환: prescriptions.items (기존 형식 유지) ──────────
        const items = effectiveProds
          .map(t => {
            const parsed = parseProductRow(t);
            // 제품 행에 baseArea가 없으면 stage 라벨의 평수를 폴백으로 사용
            if (parsed.baseArea === null && labelBaseArea !== null) {
              parsed.baseArea = labelBaseArea;
            }
            return parsed;
          })
          .filter(i => i.originalName.length > 1);
        if (!items.length) return;

        // v13: 타입 감지는 primaryLabel(최상단 stage_core) 우선, fallback full text
        const sType = detectStageType(primaryLabel || label);
        allPrescriptions.push({
          stageType:  sType,
          // v13: stageLabel = 좌측 셀 전체 정제 텍스트 (최상단이 자연스럽게 제일 위에 위치)
          //      사용자가 보는 셀 표시 내용과 일치시킴
          stageLabel: label,
          stageLabelFull: label,    // 동일 (하위 호환)
          items,
          // ★ 페이지 추적 메타데이터 — 처방전.html 단계 정렬·복원에 필요
          sourcePage: p,
          pageGroup:  1000 + p,   // 페이지 기반 그룹 번호 (처방전.html 관례)
          pageType:   sType,
          // v8+: 병합 셀 추론 메타데이터
          rowspanRows:    sb.rowspanRows || 1,
          stageRowTypes:  sb.rowTypes    || [],
          parseTrace:     sb.trace       || [],
          // v11: leftCell 원문 및 정제 텍스트
          leftCellLines:  sb.lines       || [],
          leftCellClean:  label
        });

        // ── v7: RxRow 생성 (정규화 파이프라인) ───────────────────────
        prodsV7.forEach((productRaw, productIdx) => {
          const rxRow = buildRxRow({
            stageRaw:    label,
            productRaw,
            sourcePage:  p,
            sourceBlock: idx,
            fallbackArea,
            usageContext
          });
          // v8: trace 붙이기
          rxRow.parseTrace = sb.trace || [];
          allRxRows.push(rxRow);
        });
      });

      // ── v11: 2계층 그룹화 (페이지별 독립, page for 루프 안에서 실행) ──────
      // ★ 버그 수정: 이전 코드가 for(p) 루프 밖에 놓여 stageBlocks 스코프 오류 발생
      // 이제 각 페이지 처리 직후 실행되어 curRxGroup이 페이지별로 초기화됨
      {
        let curRxGroup = null;
        const pageRxGroups = [];

        for (let idx = 0; idx < stageBlocks.length; idx++) {
          const sb           = stageBlocks[idx];
          const label        = _primaryStageLabel(sb); // v13: 최상단 stage_core (topmost)
          const labelFull    = _cleanLeftCellText(sb.lines);    // 전체 정제 텍스트
          const role         = classifyBlockRole(sb);
          const blockRxRows  = allRxRows.filter(r => r.sourcePage === p && r.sourceBlock === idx);
          const blockLegacy  = blockProducts[idx] || [];

          if (!blockRxRows.length && !blockLegacy.length) continue; // 제품 없는 블록 스킵

          if (role === 'group' || !curRxGroup) {
            // ── 직전 headerBlock들을 이 그룹에 연결 ─────────────────────
            const headerProds = [];
            for (let j = 0; j < idx; j++) {
              if (stageBlocks[j]._isHeaderBlock && !stageBlocks[j]._consumed) {
                headerProds.push(...(stageBlocks[j]._headerProducts || []));
                stageBlocks[j]._consumed = true;
              }
            }
            curRxGroup = {
              groupHeader:    label,
              groupType:      detectGroupType(label),
              sourcePage:     p,
              pageGroup:      1000 + p,
              parseTrace:     sb.trace || [],
              stages:         [],
              headerProducts: headerProds.length ? headerProds : undefined
            };
            pageRxGroups.push(curRxGroup);
          }

          curRxGroup.stages.push({
            stageName:     role === 'stage' ? label : null,
            stageLabel:    label,             // Y 최상단 stage_core 텍스트
            stageLabelFull: labelFull,        // 전체 정제 텍스트
            leftCellLines: sb.lines,
            stageType:     role === 'stage' ? detectStageType(label) : detectGroupType(label),
            stageOrder:    role === 'stage' ? extractStageOrder(label) : null,
            rxRows:        blockRxRows,
            items:         blockLegacy,
            parseTrace:    sb.trace || []
          });
        }

        allRxGroups.push(...pageRxGroups.filter(g =>
          g.stages.some(s => s.rxRows.length > 0 || s.items.length > 0)
        ));
        console.log(`[Parser] page ${p} — stageBlocks:${stageBlocks.length} rxGroups:${pageRxGroups.length}`);
      }
    } // ← for(p) 페이지 루프 종료

    if (allPrescriptions.length === 0) {
      // ── 폴백: 구조 인식 실패 → 전체 텍스트 단일 그룹 ─────────────
      console.warn('[Parser] stage 미감지 → 전체 텍스트 단일 그룹 폴백');
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
      if (!allTexts.length) {
        alert('처방전에서 텍스트를 추출할 수 없습니다.\n스캔 이미지 PDF는 지원되지 않습니다.');
        return null;
      }
      return {
        farmInfo: { farmName: null, cropName: null, totalArea: null },
        prescriptions: [{
          stageType:  '기타',
          stageLabel: '(자동 인식 불가 — 직접 입력)',
          sourcePage: null,
          pageGroup:  null,
          pageType:   '',
          items: allTexts
            .map(t => ({ originalName: t, mappedId: null, baseQty: null, unit: '', baseArea: null }))
            .filter(i => i.originalName.length > 1)
        }],
        rxRows: []
      };
    }

    // ── v7: inferTotalArea를 allRxRows 기반으로 수행 ──────────────────
    // allRxRows 가 없으면 기존 allPrescriptions 기반 빈도 분석으로 폴백
    let inferredArea = null;

    if (allRxRows.length > 0) {
      // v7: rxNormalizer.inferTotalArea 사용
      inferredArea = inferTotalArea(allRxRows);
    }

    if (inferredArea === null) {
      // 폴백: 기존 prescriptions.items.baseArea 빈도 분석
      const areaFreq = {};
      allPrescriptions.forEach(pr =>
        pr.items.forEach(i => {
          if (i.baseArea) areaFreq[i.baseArea] = (areaFreq[i.baseArea] || 0) + 1;
        })
      );
      const sorted = Object.entries(areaFreq).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) inferredArea = Number(sorted[0][0]);
    }

    console.log('[Parser] 최종 RxGroup 수:', allRxGroups.length,
      '/ 총 stages:', allRxGroups.reduce((s, g) => s + g.stages.length, 0));

    return {
      farmInfo:      { farmName: null, cropName: null, totalArea: inferredArea },
      prescriptions: allPrescriptions,   // 하위 호환 유지
      rxRows:        allRxRows,          // v7 flat rows
      rxGroups:      allRxGroups         // v9 2계층 구조
    };

  } catch (e) {
    console.error('[Parser] ❌ 오류:', e);
    alert(`처방전 파싱 오류\n\n${e.name}: ${e.message}`);
    return null;
  }
}
