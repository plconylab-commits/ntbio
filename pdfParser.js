/**
 * pdfParser.js  v5 — 상태 기계(State Machine) 패턴
 * pdf.js 좌표 기반 처방전 텍스트 추출 — Vision AI 미사용, 브라우저에서 즉시 처리
 * 의존: prescriptionModel.js (calcRequiredQty), productMapper.js (findProduct)
 *
 * 핵심 알고리즘 (State Machine):
 *   1) stages[] 배열과 currentStage 변수로 상태 추적
 *   2) 새 페이지 시작 → 무조건 새 stage 생성 (페이지 간 데이터 격리)
 *   3) 행 텍스트에 키워드 포함 → 이전 stage 저장 + 새 stage 생성
 *   4) 그 외 행 → 현재 stage에 제품/라벨 누적
 *   5) 모든 페이지 처리 후 마지막 stage 저장
 */

const MAX_PAGES      = 8;
const LEFT_X_MAX     = 160;   // A4 scale=1.0 기준 좌측 열 최대 X (px)
const ROW_Y_MERGE    = 5;     // 같은 행으로 간주할 Y 허용 오차 (px)
const WORD_GAP_MIN   = 3;     // 이 px 이상 간격이면 공백 삽입

// 처방 수량 단위: 반드시 숫자 또는 "반" 뒤에 오는 포|병|봉|통|개 만 인식
// → "서귀포", "병원", "개인" 같은 단어 속 오인식 방지
const COUNT_UNITS_RE = /(\d|반)\s*(포|병|봉|통|개)/;

// stage 강제 분리 키워드: 이 단어 중 하나라도 행 텍스트에 포함되면 무조건 새 stage 생성
// (관주, 엽면, 감사, 수확, 기비, 추비 — 사용자 지정 목록)
const STAGE_KEYWORDS_RE = /관주|엽면|감사|수확|기비|추비/;

/* ─── 1. 행 아이템 → 자연스러운 텍스트 조합 ─────────────────────── */

/**
 * 같은 행의 아이템들을 X 정렬 후 인접 간격 기반으로 공백을 삽입해 문자열로 조합한다.
 * - gap <= WORD_GAP_MIN px → 붙이기 (파편화된 글자 복원)
 * - gap > WORD_GAP_MIN px  → 공백 삽입 (단어/열 구분)
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

/**
 * 행 텍스트에서 stage 타입을 자동 감지한다.
 */
function detectStageType(text) {
  if (/관주/.test(text)) return '관주';
  if (/엽면/.test(text)) return '엽면';
  if (/기비|밑거름|토양/.test(text)) return '기비';
  if (/감사|수확/.test(text)) return '감사비료';
  if (/추비/.test(text)) return '추비';
  return '기타';
}

/* ─── 4. 우측 행 → 제품 아이템 파싱 ─────────────────────────────── */

/**
 * joinRowText()로 조합된 행 텍스트에서 제품명·수량·단위·기준평수를 추출한다.
 *
 * ★ 핵심 규칙
 *   - 처방 수량 단위: 포|병|봉|통|개  → baseQty 추출 대상
 *   - 용량/규격 단위: kg|g|L|ml 등   → 절대 baseQty로 착각하지 않음 (제품명에 보존)
 *   - 반병|반봉|반통|반포|반개        → baseQty = 0.5
 *   - N평                            → baseArea
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

/* ─── 5. 메인 진입점 — 상태 기계 ────────────────────────────────── */

/**
 * PDF File → prescriptionModel 스키마 JSON
 * Vision API 없이 pdf.js 좌표 기반으로 즉시 처리 (1~2초 내)
 *
 * @param {File} pdfFile
 * @returns {Promise<object|null>}
 */
async function parsePdfToJSON(pdfFile) {
  try {
    console.log('[Parser] v5 시작 — 상태 기계(State Machine) 패턴');
    console.log('[Parser] 파일:', pdfFile?.name, '크기:', pdfFile?.size, 'bytes');

    // ── 상태 기계 변수 초기화 ──────────────────────────────────────
    let stages       = [];
    let currentStage = null;

    // ── PDF 로드 (Safari DataCloneError 방지: 순수 ArrayBuffer 전달) ──
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfDoc      = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages  = Math.min(pdfDoc.numPages, MAX_PAGES);

    console.log('[Parser] 총 페이지 수:', totalPages);

    // ── 페이지 순회 ──────────────────────────────────────────────
    for (let p = 1; p <= totalPages; p++) {

      // ── [트리거 1] 새 페이지 시작 → 무조건 새 stage 생성 ──────
      if (currentStage && currentStage.items.length > 0) {
        stages.push(currentStage);
      }
      currentStage = { stageType: '기타', stageLabel: '', items: [] };
      console.log(`새로운 단계 분리됨 (페이지 전환 → page ${p}):`, `${p}페이지`);

      // 페이지 텍스트 아이템 추출
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

      // Y 오름차순 → X 오름차순 정렬 (페이지 로컬)
      items.sort((a, b) => a.y - b.y || a.x - b.x);
      const rows = groupByRowsLocal(items);

      // ── 행 순회 ────────────────────────────────────────────────
      for (const row of rows) {
        const leftItems  = row.items.filter(it => it.x <  LEFT_X_MAX);
        const rightItems = row.items.filter(it => it.x >= LEFT_X_MAX);
        const leftText   = joinRowText(leftItems);
        const rightText  = joinRowText(rightItems);
        // 좌측 우선, 없으면 전체 행 텍스트로 키워드 판별
        const checkText  = leftText || joinRowText(row.items);

        // ── [트리거 2] 키워드 감지 → 새 stage 생성 ───────────────
        if (checkText && STAGE_KEYWORDS_RE.test(checkText)) {
          // 기존 stage에 제품이 있으면 저장
          if (currentStage && currentStage.items.length > 0) {
            stages.push(currentStage);
          }
          // 새 stage 생성
          const stageType  = detectStageType(checkText);
          const stageLabel = leftText || checkText;
          currentStage = { stageType, stageLabel, items: [] };
          console.log('새로운 단계 분리됨:', currentStage.stageLabel);

        } else {
          // ── [라벨 누적] 비 트리거 좌측 열 텍스트 → stageLabel 에 추가 ──
          if (leftText && currentStage) {
            currentStage.stageLabel +=
              (currentStage.stageLabel ? '\n' : '') + leftText;
          }
        }

        // ── [제품 수집] 우측 열에 처방 단위 포함 → items 에 담기 ──
        if (rightText && COUNT_UNITS_RE.test(rightText)) {
          // currentStage 가 없으면 기본 바구니 생성
          if (!currentStage) {
            currentStage = { stageType: '기타', stageLabel: '기본 처방', items: [] };
            console.log('새로운 단계 분리됨:', currentStage.stageLabel);
          }
          const product = parseProductRow(rightText);
          if (product.originalName.length > 1) {
            currentStage.items.push(product);
          }
        }
      }
    }

    // ── [마지막 처리] 남은 stage 저장 ─────────────────────────────
    if (currentStage && currentStage.items.length > 0) {
      stages.push(currentStage);
      console.log('마지막 단계 저장됨:', currentStage.stageLabel);
    }

    console.log('[Parser] 최종 처방 그룹 수:', stages.length);

    // ── 빈 stage 제거 + prescriptionModel 스키마 변환 ─────────────
    const prescriptions = stages
      .filter(s => s.items.length > 0)
      .map(s => ({
        stageType:  s.stageType,
        stageLabel: s.stageLabel.trim(),
        items:      s.items.filter(i => i.originalName.length > 1)
      }))
      .filter(p => p.items.length > 0);

    if (prescriptions.length === 0) {
      // ── 폴백: 텍스트는 있으나 구조 인식 실패 ──────────────────
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
