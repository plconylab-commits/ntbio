/**
 * pdfParser.js  v14 — pageTitle/stageLabel 분리 + splitCompositeRow 연동 + blockUsage 구조화
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
const PAGE_TITLE_Y_GAP   = 60;    // v16: 첫 좌측 아이템이 다음 좌측 아이템과 이 px 이상 떨어지면 pageTitle 후보
const WORD_GAP_MIN       = 3;     // 이 px 이상 간격이면 공백 삽입

// 처방 수량 단위: 반드시 숫자 또는 "반" 뒤에 오는 포|병|봉|통|개 만 인식
// → "서귀포", "병원", "개인" 같은 단어 속 오인식 방지
// v7: COUNT_UNITS_RE 는 하위 호환 목적으로만 유지 (우측 행 수집 필터로는 미사용)
const COUNT_UNITS_RE = /(\d|반)\s*(포|병|봉|통|개)/;

// v15: 좌측 열에서 완전히 제거할 테이블 헤더/구조 텍스트 패턴
// 이런 텍스트는 단계명이 아니라 PDF 표 구조 행에서 온 것
const LEFT_TABLE_HEADER_RE = /^(시기\s*[\/\/]?\s*단계|처방\s*단계|단계명?|시기명?|품\s*목|규\s*격|수\s*량|제품명?|용\s*량|사용량|물량\s*[\/\/]?\s*평수|합\s*계|소\s*계|비\s*고|구\s*분|내\s*용|번호|No\.)$/i;

// ─── 비용 페이지 감지 키워드 ────────────────────────────────────────────────
const COST_PAGE_KEYWORDS  = ['소매가','공급가','단가','합계','총액','금액','평당'];
const COST_PAGE_MIN_HITS  = 2;   // 이 개수 이상의 키워드가 있어야 비용 페이지로 판정 ('계' 제거 — 발효계분 등 오탐 방지)

/**
 * 페이지 행 텍스트 배열을 받아 '비용 요약 페이지'인지 판별한다.
 * @param {string[]} rowTexts  — joinRowText(row.items) 결과 배열
 * @returns {boolean}
 */
function detectCostPage(rowTexts) {
  const allText = rowTexts.join(' ');
  const hits = COST_PAGE_KEYWORDS.filter(kw => allText.includes(kw)).length;
  return hits >= COST_PAGE_MIN_HITS;
}

/**
 * 비용 페이지에서 totalCost(합계 금액)와 unitPricePerPyeong(평당 단가)를 추출한다.
 *
 * 완화된 추출 규칙:
 *  - '소매가' 또는 '공급가' 단어가 하나만 있는 행도 숫자를 수집한다.
 *  - 공급가 행 숫자들의 합산을 totalCost 후보로 사용한다.
 *  - 합계/총액 행의 최대 숫자를 우선한다.
 *
 * @param {{ items: object[], y: number }[]} rows  — groupByRowsLocal 결과
 * @returns {{ totalCost: number|null, unitPricePerPyeong: number|null }}
 */
function extractCostPageData(rows) {
  const PYEONG_RE    = /평\s*당|단\s*가/;  // "평당" 또는 "단가" 행 → 단가 추출
  const TOTAL_RE     = /합\s*계|총\s*액|총\s*계|총\s*금\s*액/;
  const RETAIL_RE    = /소\s*매\s*가/;   // 소매가 행 → 숫자 수집
  const SUPPLY_RE    = /공\s*급\s*가/;   // 공급가 행 → 숫자 수집 + 누산

  let totalCost          = null;
  let unitPricePerPyeong = null;
  let supplySum          = 0;   // 공급가 행 숫자 누산
  let pyeongFromTotal    = null;  // PARSE-01: 합계 행에서 추출한 평당가 (최우선)
  let pyeongLastSeen     = null;  // PARSE-01: 마지막으로 본 평당가 (fallback)

  // 숫자 추출 헬퍼 (쉼표 제거 후 정수 변환)
  const parseNums = (text, min, max) =>
    (text.match(/[\d,]+/g) || [])
      .map(n => parseInt(n.replace(/,/g, ''), 10))
      .filter(n => n >= min && n <= max);

  for (const row of rows) {
    const text = joinRowText(row.items);

    // ── 평당 단가 행 ─────────────────────────────────────────────
    // PARSE-01: 합계 행의 평당가(pyeongFromTotal)를 우선, 그 외는 pyeongLastSeen에 보관
    if (PYEONG_RE.test(text)) {
      const nums = parseNums(text, 100, 10_000_000);
      if (nums.length) {
        const val = nums[nums.length - 1];
        pyeongLastSeen = val;
        if (TOTAL_RE.test(text)) {
          pyeongFromTotal = val;
        }
      }
    }

    // ── 합계/총액 행 → totalCost 최우선 ─────────────────────────
    if (TOTAL_RE.test(text)) {
      const nums = parseNums(text, 10_000, 999_999_999);
      if (nums.length) {
        const mx = Math.max(...nums);
        if (!totalCost || mx > totalCost) totalCost = mx;
      }
    }

    // ── 공급가 행: '소매가' 또는 '공급가' 단어 하나만으로도 추출 ──
    // 단일 행 숫자 → 해당 제품의 단가로 간주, 합산해 총비용 후보 산출
    if (SUPPLY_RE.test(text)) {
      const nums = parseNums(text, 100, 10_000_000);
      if (nums.length) supplySum += nums[nums.length - 1]; // 공급가(맨 오른쪽 숫자)
    }

    // ── 소매가 행: 단독으로도 숫자 수집 (totalCost 후보) ────────
    if (RETAIL_RE.test(text) && !SUPPLY_RE.test(text)) {
      const nums = parseNums(text, 10_000, 999_999_999);
      if (nums.length) {
        const mx = Math.max(...nums);
        if (!totalCost || mx > totalCost) totalCost = mx;
      }
    }
  }

  // 공급가 누산이 합계 행보다 크면 공급가 합계를 우선
  if (supplySum > 0 && (!totalCost || supplySum > totalCost * 0.5)) {
    // 합계 행이 없거나, 누산값이 합계의 50% 이상이면 누산값 채택
    if (!totalCost) totalCost = supplySum;
  }

  // 합계 행도 없고 공급가 누산도 없으면 큰 숫자(≥ 50,000) 중 최대값을 후보로
  if (!totalCost) {
    let maxNum = 0;
    for (const row of rows) {
      const text = joinRowText(row.items);
      const nums = parseNums(text, 50_000, 100_000_000);
      if (nums.length) maxNum = Math.max(maxNum, ...nums);
    }
    if (maxNum > 0) totalCost = maxNum;
  }

  // PARSE-01: 합계 행 평당가 우선, 없으면 마지막으로 본 평당가 사용
  unitPricePerPyeong = pyeongFromTotal !== null ? pyeongFromTotal : pyeongLastSeen;
  return { totalCost, unitPricePerPyeong };
}

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

/**
 * 블록 내 모든 lines[]에서 월 정보를 추출한다.
 * "3월-4월", "3~5월", "3-4월", "3월" 등을 인식한다.
 *
 * @param {string[]} lines - stageBlock.lines 배열
 * @returns {string}  예: "3월", "3-5월", "" (없으면 빈 문자열)
 */
function _extractMonthInfoFromLines(lines) {
  if (!lines || !lines.length) return '';
  const full = lines.join(' ');
  const months = [];

  // 패턴 A: N월-M월 / N월~M월 / N월 (월 앞에 숫자)
  const RE_A = /(\d{1,2})\s*월(?:\s*[-~]\s*(\d{1,2})\s*월)?/g;
  let m;
  while ((m = RE_A.exec(full)) !== null) {
    const s = parseInt(m[1], 10);
    if (s < 1 || s > 12) continue;
    if (m[2]) {
      const e = parseInt(m[2], 10);
      months.push((e >= 1 && e <= 12) ? `${s}-${e}월` : `${s}월`);
    } else {
      months.push(`${s}월`);
    }
  }

  // 패턴 B: N-M월? / N~M월? (월이 끝에만 붙거나 생략, 예: "3-4월", "3~5", "3-4")
  // 단, 숫자 범위만 있는 경우(월 없음)는 앞뒤 맥락에 월/달/시기가 있어야 인정
  const fullHasMonthCtx = /월|달|시기|개월/.test(full);
  const RE_B = /(\d{1,2})\s*[-~]\s*(\d{1,2})\s*(월)?/g;
  while ((m = RE_B.exec(full)) !== null) {
    const s = parseInt(m[1], 10), e = parseInt(m[2], 10);
    if (s < 1 || s > 12 || e < 1 || e > 12) continue;
    // 월 자 없이 숫자-숫자만 있으면 월 맥락이 있어야 허용
    if (!m[3] && !fullHasMonthCtx) continue;
    const label = `${s}-${e}월`;
    // 중복 방지
    if (!months.includes(label) && !months.includes(`${s}월`)) {
      months.push(label);
    }
  }

  return months.join(', ');
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
    let   costData         = null; // 비용 페이지 데이터 (감지 시 설정)

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

      // ── 비용 페이지 감지 → 스킵 (처방 단계 파싱에서 제외) ──────────
      // '소매가' 또는 '공급가' 단어 하나만 있어도 비용 관련 페이지로 간주
      // (기존 hitCount >= 3 → 완화: 핵심 가격 키워드 1개 이상 OR 전체 2개 이상)
      {
        const rawRows = items.map(it => it.text.trim()).filter(s => s.length > 0);
        const allText = rawRows.join(' ');
        const hasPriceKw   = /소\s*매\s*가|공\s*급\s*가/.test(allText);  // 핵심 가격 키워드
        const hasNumericKw = /(?:평\s*당|단\s*가)\D{0,5}\d{3,}/.test(allText);  // 평당·단가 + 숫자 근접
        const hitCount     = COST_PAGE_KEYWORDS.filter(k => allText.includes(k)).length;
        if (hasPriceKw || hasNumericKw || hitCount >= COST_PAGE_MIN_HITS) {
          console.log(`[Parser] page ${p} → 비용 페이지 감지 (hit:${hitCount}, priceKw:${hasPriceKw}, numKw:${hasNumericKw}), 이후 모든 페이지 스킵 (break)`);
          costData = extractCostPageData(rows);
          console.log('[Parser] costData:', costData);
          break; // 비용 페이지 이후 광고/홍보 페이지 포함 모든 페이지 스킵 (PARSE-02)
        }
      }

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

      // ── v14: pageTitle 분리 (전체 폭을 차지하는 상단 행 감지) ──────
      // 페이지 상단에서 좌측+우측 열 모두를 가로지르는 긴 텍스트 = pageTitle
      // (예: "천혜향 뿌리활착+뿌리활력+작물활성 영양생장+생식생장")
      let pageTitle = '';
      const pageTitleRows = [];
      if (rows.length > 0) {
        // 상단 3행까지 검사
        for (let ri = 0; ri < Math.min(3, rows.length); ri++) {
          const r = rows[ri];
          const xMin = Math.min(...r.items.map(it => it.x));
          const xMax = Math.max(...r.items.map(it => it.x + it.w));
          // 좌측 열 시작(x<50) ~ 우측 열(x>effectiveLeftXMax+50) 을 모두 포함하면 전체 폭 행
          if (xMin < 50 && xMax > effectiveLeftXMax + 50) {
            const titleText = joinRowText(r.items).trim();
            // 제품 행(수량+단위)이나 헤더(품목/규격)가 아닌지 확인
            if (titleText.length > 3 && !COUNT_UNITS_RE.test(titleText) && !/^(품\s*목|규\s*격|월\s*\/?\s*일)/.test(titleText)) {
              pageTitleRows.push(ri);
              pageTitle = pageTitle ? pageTitle + ' ' + titleText : titleText;
            }
          } else {
            break; // 전체폭이 아닌 행이 나오면 타이틀 탐색 중단
          }
        }
      }

      // v16: Y-gap 기반 pageTitle 감지 (xMin/xMax 방식 실패 시 fallback)
      // 문제: extractRxPdfCoords가 it.w를 저장하지 않아 xMax 계산이 항상 NaN
      // 해결: 페이지 첫 번째 좌측 아이템이 두 번째 좌측 아이템과 PAGE_TITLE_Y_GAP 이상
      //       떨어져 있으면 페이지 제목으로 인식 (예: "천혜향 꽃+피기전 토양+관주...")
      if (!pageTitle && rows.length >= 2) {
        const leftItemsSorted = rows
          .flatMap(r => r.items.filter(it => it.x < effectiveLeftXMax))
          .sort((a, b) => a.y - b.y);
        if (leftItemsSorted.length >= 2) {
          const firstY    = leftItemsSorted[0].y;
          const gapToNext = leftItemsSorted[1].y - firstY;
          if (gapToNext > PAGE_TITLE_Y_GAP) {
            const candidateRowIdx = rows.findIndex(r =>
              r.items.some(it => it.x < effectiveLeftXMax && Math.abs(it.y - firstY) < ROW_Y_MERGE)
            );
            if (candidateRowIdx >= 0 && !pageTitleRows.includes(candidateRowIdx)) {
              const candidateRow = rows[candidateRowIdx];
              // 우측 아이템이 없어야 pageTitle (제품 행과 구별)
              const hasRightItems = candidateRow.items.some(it => it.x >= effectiveLeftXMax);
              if (!hasRightItems) {
                const candidateText = joinRowText(candidateRow.items).trim();
                // 10자 이상 + 수량 단위 없음 = pageTitle 후보
                // ("관주(1번)" 같은 짧은 단계명 제외, 긴 설명 텍스트만 포함)
                if (candidateText.length > 10 && !COUNT_UNITS_RE.test(candidateText)) {
                  pageTitleRows.push(candidateRowIdx);
                  pageTitle = candidateText;
                  console.log(`[Parser v16] page ${p} pageTitle (Y-gap방식): "${pageTitle}" (gap=${gapToNext}px)`);
                }
              }
            }
          }
        }
      }

      // pageTitle 행은 leftRows/rightRows에서 제외
      const filteredRows = rows.filter((_, ri) => !pageTitleRows.includes(ri));
      if (pageTitle) {
        console.log(`[Parser v14] page ${p} pageTitle: "${pageTitle}"`);
      }

      const leftRows  = [];  // { y, text } — 시기/목적 열 (stage 라벨)

      // v7: 우측 행을 COUNT_UNITS_RE 필터 없이 모두 수집한다.
      //     분류는 classifyRightRow() 에게 위임.
      // rightRowsLegacy: 하위 호환용 — 기존 COUNT_UNITS_RE 필터 유지
      const rightRowsAll    = [];  // v7: 모든 우측 행 { y, text, kind }
      const rightRowsLegacy = [];  // 하위 호환: COUNT_UNITS_RE 통과한 행만

      for (const row of filteredRows) {
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

        // v15: 테이블 헤더/구조 텍스트는 단계명 후보에서 완전히 제거
        if (lt) {
          if (LEFT_TABLE_HEADER_RE.test(lt.trim())) {
            console.log(`[Parser v15] 좌측 헤더 행 제거: "${lt}" (y=${row.y})`);
          } else {
            leftRows.push({ y: row.y, text: lt });
          }
        }
        if (rt) {
          // v14: splitCompositeRow로 복합 행 분리 (제품+사용법 동시 포함 행)
          const split = splitCompositeRow(rt);
          if (split.parts.length > 1) {
            // 복합 행: 각 파트를 별도 행으로 등록
            for (const part of split.parts) {
              if (part.type !== 'skip') {
                rightRowsAll.push({ y: row.y, text: part.text, kind: part.type, splitFrom: rt });
              }
            }
            // 레거시: 원본 텍스트로 등록
            if (COUNT_UNITS_RE.test(rt)) rightRowsLegacy.push({ y: row.y, text: rt });
          } else {
            // 단일 행: 기존 로직
            const kind = classifyRightRow(rt);
            if (kind !== 'skip') {
              rightRowsAll.push({ y: row.y, text: rt, kind });
            }
            if (COUNT_UNITS_RE.test(rt)) rightRowsLegacy.push({ y: row.y, text: rt });
          }
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
            // v15: 현재 블록에 stage_core가 아직 없으면 무조건 새 블록 시작
            // 이유: 페이지 제목·헤더 등 pre-stage 노이즈 행이 gap < STAGE_Y_GAP으로
            //       첫 stage_core와 잘못 병합되는 것을 방지
            const curHasCore = curBlock && curBlock.rowTypes.includes('stage_core');
            startNew = !curHasCore || gap > STAGE_Y_GAP;
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

      // stage_core가 없는 고아 블록(note만으로 구성)
      // v15: yGap ≤ LEFT_CELL_MAX_GAP 이면 직전 블록에 병합 (같은 셀 연속 텍스트)
      //      yGap >  LEFT_CELL_MAX_GAP 이면 폐기 (풋터/회사명/하단 노이즈)
      for (let i = stageBlocks.length - 1; i >= 1; i--) {
        const sb = stageBlocks[i];
        if (!sb.rowTypes.includes('stage_core')) {
          const prev = stageBlocks[i - 1];
          const yGap = sb.yMin - prev.yMax;
          if (yGap <= LEFT_CELL_MAX_GAP) {
            // 가까운 고아 → 직전 블록에 병합 (기존 동작 유지)
            prev.lines.push(...sb.lines);
            prev.rowTypes.push(...sb.rowTypes);
            prev.yMax = Math.max(prev.yMax, sb.yMax);
            prev.rowspanRows += sb.rowspanRows;
            prev.trace.push(`  [orphan-merge] 직전 블록에 병합 (gap=${yGap}, y=${sb.yMin}~${sb.yMax})`);
            prev.trace.push(...sb.trace);
          } else {
            // 멀리 떨어진 고아 → 풋터/회사명 등 노이즈, 폐기
            console.log(`[Parser v15] 먼 고아 블록 폐기 (gap=${yGap}): "${sb.lines.join(' ')}"`);
          }
          stageBlocks.splice(i, 1);
        }
      }

      // v15: stage_core 없는 첫 번째 블록 → pageTitle 보충으로 활용 후 제거
      // Fix 3에 의해 첫 stage_core가 항상 새 블록을 시작하므로, stageBlocks[0]이
      // note/date만으로 구성된 경우 = 페이지 제목 또는 표 구조 행
      if (stageBlocks.length >= 1 && !stageBlocks[0].rowTypes.includes('stage_core')) {
        const orphan = stageBlocks.shift(); // blockProducts 선언 전이므로 안전하게 제거
        const orphanText = orphan.lines.filter(t => t.trim()).join(' ').trim();
        if (orphanText && !LEFT_TABLE_HEADER_RE.test(orphanText)) {
          // 테이블 헤더가 아닌 텍스트(페이지 제목 등)는 pageTitle 보충으로 활용
          pageTitle = pageTitle ? pageTitle + ' ' + orphanText : orphanText;
          console.log(`[Parser v15] 고아 첫 블록 → pageTitle 보충: "${orphanText}"`);
        } else {
          console.log(`[Parser v15] 고아 첫 블록 → 테이블 헤더로 판단, 폐기: "${orphanText}"`);
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
      // v14: usage 행을 row-level map으로 관리 (제품별 인라인 사용법 매핑 가능)
      const blockUsage    = stageBlocks.map(() => []);   // {y, text, splitFrom?}[]
      const blockFirstProductY = stageBlocks.map(() => null);
      // v14: 제품 행에서 분리된 인라인 사용법 → 해당 제품과 1:1 연결
      const blockInlineUsage = stageBlocks.map(() => ({})); // { productText: usageText }

      // 선행 블록 찾기 헬퍼
      function findBlockIdx(y) {
        let best = 0;
        for (let i = 0; i < stageBlocks.length; i++) {
          if (stageBlocks[i].yMin <= y) best = i;
        }
        return best;
      }

      // 하위 호환: rightRowsLegacy 배정
      for (const rr of rightRowsLegacy) {
        blockProducts[findBlockIdx(rr.y)].push(rr.text);
      }

      // v14: product/usage 행 배정 (splitFrom 있으면 인라인 연결)
      for (const rr of rightRowsAll) {
        const bIdx = findBlockIdx(rr.y);
        if (rr.kind === 'product') {
          blockProductsV7[bIdx].push(rr.text);
          if (blockFirstProductY[bIdx] === null) blockFirstProductY[bIdx] = rr.y;
          // splitFrom이 있으면 인라인 사용법 연결
          if (rr.splitFrom) {
            // 같은 splitFrom에서 온 usage 파트 찾기
            const usageSibling = rightRowsAll.find(
              r => r.splitFrom === rr.splitFrom && r.kind === 'usage' && r.y === rr.y
            );
            if (usageSibling) {
              blockInlineUsage[bIdx][rr.text] = usageSibling.text;
            }
          }
        } else if (rr.kind === 'usage') {
          blockUsage[bIdx].push({ y: rr.y, text: rr.text, splitFrom: rr.splitFrom || null });
        }
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

        // v14: usage 행에서 사용방법 파싱 (row-level map)
        let usageContext = null;
        const usageEntries = usageTexts;  // [{y, text, splitFrom}]
        if (usageEntries.length > 0) {
          // 첫 번째 usage 행 파싱 (블록 레벨 폴백)
          const firstUsageText = typeof usageEntries[0] === 'string' ? usageEntries[0] : usageEntries[0].text;
          usageContext = normalizeUsage(firstUsageText);
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
          leftCellClean:  label,
          // v14: 페이지 상단 타이틀 (stageLabel과 분리)
          pageTitle:      pageTitle || ''
        });

        // ── v14: RxRow 생성 (정규화 파이프라인 + 인라인/블록 사용법) ──
        const inlineMap = blockInlineUsage[idx] || {};
        const blockUsageRaw = usageEntries.length > 0
          ? (typeof usageEntries[0] === 'string' ? usageEntries[0] : usageEntries[0].text)
          : null;
        prodsV7.forEach((productRaw, productIdx) => {
          const rxRow = buildRxRow({
            stageRaw:       label,
            productRaw,
            sourcePage:     p,
            sourceBlock:    idx,
            fallbackArea,
            usageContext,
            inlineUsageRaw: inlineMap[productRaw] || null,
            blockUsageRaw:  blockUsageRaw
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
              // 블록 내 모든 행에서 월 정보 추출 (상단 행뿐 아니라 하단 날짜 행도 포함)
              monthInfo:      _extractMonthInfoFromLines(sb.lines),
              pageTitle:      pageTitle || '',    // v14: 페이지 상단 타이틀 (stageLabel과 분리)
              sourcePage:     p,
              pageGroup:      1000 + p,
              parseTrace:     sb.trace || [],
              stages:         [],
              headerProducts: headerProds.length ? headerProds : undefined
            };
            pageRxGroups.push(curRxGroup);
          }

          const stageMonthInfo = _extractMonthInfoFromLines(sb.lines);
          // 하위 단계에서 월 정보 발견 시 상위 그룹에도 병합 (그룹 헤더가 없을 수 있으므로)
          if (stageMonthInfo && curRxGroup && !curRxGroup.monthInfo) {
            curRxGroup.monthInfo = stageMonthInfo;
          }
          curRxGroup.stages.push({
            stageName:     role === 'stage' ? label : null,
            stageLabel:    label,             // Y 최상단 stage_core 텍스트
            stageLabelFull: labelFull,        // 전체 정제 텍스트
            leftCellLines: sb.lines,
            monthInfo:     stageMonthInfo,    // 이 단계의 월 정보
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
        alert('처방전에서 텍스트를 추출할 수 없습니다.\n\n다시 시도해 주세요.\n스캔 이미지(사진) PDF인 경우 텍스트 PDF로 변환 후 업로드해 주세요.');
        return null;
      }
      return {
        farmInfo:      { farmName: null, cropName: null, totalArea: null },
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
        rxRows:      [],
        rxGroups:    [],
        allRxGroups: [],
        costData:    costData,
        success:     true
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
      rxGroups:      allRxGroups,        // v9 하위 호환 키 유지
      allRxGroups:   allRxGroups,        // UI에서 기대하는 그룹 데이터
      costData:      costData,           // 비용 페이지 데이터 (없으면 null)
      success:       true
    };

  } catch (e) {
    console.error('[Parser] ❌ 오류:', e);
    alert(`처방전 파싱 중 오류가 발생했습니다.\n\n다시 시도해 주세요.\n반복 실패 시 PDF를 새로 저장하거나 담당자에게 문의하세요.`);
    return null;
  }
}
