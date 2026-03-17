/**
 * rxNormalizer.js  v1
 * 처방전 PDF 파싱 정규화 레이어
 * Pipeline: 원문 → [extract] → [normalize] → [validate] → RxRow
 * 의존: 없음 (순수 함수 — 브라우저/Node 모두 동작)
 *
 * 섹션 구성:
 *   0. 상수 및 정규식 정의
 *   1. normalizePackageSize(rawText)   — 용량 텍스트 파싱 (1L, 500ml, 20kg …)
 *   2. extractPackageSizes(text)        — 텍스트에서 용량 패턴 전체 추출
 *   3. normalizeDosage(text)            — 처방 수량 파싱 (1포, 반병 …)
 *   4. normalizeBaseArea(text)          — 기준 평수 파싱 (550평 …)
 *   5. normalizeUsage(rawText)          — 사용방법 행 파싱 (물25말, 관주방법 …)
 *   6. normalizeStageLabel(raw)         — 단계 라벨 분류 (관주1차, 엽면2차 …)
 *   6b. buildNormalizedStageLabel(...)  — 표준 단계 문자열 조립
 *   7. decomposeProductText(rawText)    — 제품 행 분해 (이름·용량·수량·평수)
 *   8. classifyRightRow(text)           — 우측 행 종류 분류
 *   9. buildRxRow(params)               — 완성된 RxRow 객체 생성
 *  10. inferTotalArea(rxRows)           — 빈도 분석으로 총 평수 추정
 */

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 0: 상수 및 정규식 (Constants & Regexes)
 * ═══════════════════════════════════════════════════════════════════════ */

/** 처방 수량 단위 (포/병/봉/통/개) */
const RX_DOSAGE_UNITS = '포|병|봉|통|개';

/**
 * 처방 수량 패턴: 숫자(소수점 포함) + 단위
 * 예: "1포", "2.5병", "10통"
 */
const RX_DOSAGE_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${RX_DOSAGE_UNITS})`);

/**
 * 반(0.5) 수량 패턴
 * 예: "반포", "반 병", "반봉"
 */
const RX_HALF_RE = new RegExp(`반\\s*(${RX_DOSAGE_UNITS})`);

/**
 * 기준 평수 패턴
 * 예: "550평", "1000평", "25.5평"
 */
const RX_AREA_RE = /(\d+(?:\.\d+)?)\s*평/;

/**
 * 물 희석량 패턴: 숫자 + 단위(말/통/L/ℓ/리터)
 * 예: "물25말", "3통", "20L"
 */
const RX_WATER_RE = /(\d+(?:\.\d+)?)\s*(말|통|L|ℓ|리터)/;

/**
 * 제품 용량 패턴: 숫자 + 용량 단위
 * 예: "1L", "500ml", "20kg", "1000cc"
 * NOTE: mlr, ML, mL, ℓ 등 OCR 오인식 변형도 포함
 */
const RX_PKG_SIZE_RE = /(\d+(?:\.\d+)?)\s*(cc|ml|mL|ML|㎖|mlr|ℓ|L|g|kg|㎏)/;

/**
 * OCR 오인식 단위 보정 맵
 * 키: OCR이 잘못 읽은 문자 → 값: 정규 단위
 * NOTE: cc는 1cc = 1ml 이므로 ml 로 대체 (수치 그대로 유지)
 */
const OCR_FIXES = {
  'mlr': 'ml',
  'ML':  'ml',
  'mL':  'ml',
  '㎖':  'ml',
  'ℓ':   'L',
  '㎏':  'kg',
  'cc':  'ml'   // 1cc = 1ml (수치 변환 없음)
};

/**
 * STAGE_ALIASES: 단계 라벨 분류 규칙 배열
 * 순서 중요: 더 구체적인 패턴을 먼저 배치
 *
 * 각 규칙 구조:
 *   re:       인식 정규식
 *   type:     '관주' | '엽면' | '토양' | '정식' | '추비' | '기타'
 *   orderFn:  (match) => 순서 번호 (1차, 2차 …) — 해당 type에서 사용
 *   timingFn: (match) => 타이밍 문자열 — 정식/기타 type에서 사용
 */
const STAGE_ALIASES = [
  // ── 관주 (토양 관주 시비) ──────────────────────────────────────────
  // "관주(1번)", "관주(2회)", "관주(3차)" — 괄호 포함
  { re: /관주\s*[\(\（]?\s*(\d+)\s*(번|회|차)[\)\）]?/, type: '관주', orderFn: m => Number(m[1]) },
  // "관주1차", "관주2번", "관주3회" — 괄호 없음
  { re: /관주\s*(\d+)\s*(차|번|회)/,                    type: '관주', orderFn: m => Number(m[1]) },
  // "관주1", "관주2" — 숫자만
  { re: /관주\s*(\d+)/,                                  type: '관주', orderFn: m => Number(m[1]) },
  // "관주" — 단독
  { re: /^관주$/,                                         type: '관주', orderFn: () => 1 },

  // ── 엽면 (잎에 뿌리는 시비) ───────────────────────────────────────
  // "엽면(1번)", "엽면(2회)" — 괄호 포함
  { re: /엽면\s*[\(\（]?\s*(\d+)\s*(번|회|차)[\)\）]?/, type: '엽면', orderFn: m => Number(m[1]) },
  // "엽면시비1회", "엽면시비2차" — 시비 포함
  { re: /엽면\s*시비?\s*(\d+)\s*(회|차)/,               type: '엽면', orderFn: m => Number(m[1]) },
  // "엽면1", "엽면2" — 숫자만
  { re: /엽면\s*(\d+)/,                                  type: '엽면', orderFn: m => Number(m[1]) },
  // "엽면" — 단독
  { re: /^엽면$/,                                         type: '엽면', orderFn: () => 1 },

  // ── 토양/기비 (기본 밑거름 시비) ──────────────────────────────────
  // "기비", "밑거름", "토양처리", "기본시비"
  { re: /기비|밑거름|토양\s*처리|기본\s*시비/,           type: '토양', orderFn: () => 0 },

  // ── 정식 (모종 심기 전후 처리) ────────────────────────────────────
  // "정식+당일", "정식당일"
  { re: /정식\s*[\+\＋]?\s*당일|정식당일/,               type: '정식', timingFn: () => '정식 당일' },
  // "정식 후 7일", "정식후14일"
  { re: /정식\s*후\s*(\d+)\s*일/,                        type: '정식', timingFn: m => `정식 후 ${m[1]}일` },
  // "정식 전"
  { re: /정식\s*전/,                                      type: '정식', timingFn: () => '정식 전' },

  // ── 추비 (웃거름 시비) ────────────────────────────────────────────
  { re: /추비/,                                           type: '추비', orderFn: () => 0 },

  // ── 기타 (감사비료/수확 후) ───────────────────────────────────────
  // "감사", "수확 후", "수확:후"
  { re: /감사|수확\s*[:：]?\s*후/,                       type: '기타', timingFn: () => '수확 후' }
];

/**
 * 설명 행 감지 정규식
 * 이 패턴이 있는 행은 제품 행이 아닌 설명/안내 행으로 처리
 */
const DESCRIPTION_ROW_RE = /관주방법|엽면방법|사용방법|희석|배율|주의|비고|안내/;

/**
 * 목적/효능 키워드 목록
 * 단계 라벨에서 이 키워드들을 추출해 purpose 배열에 저장
 */
const PURPOSE_KEYWORDS = [
  '세균', '바이러스', '예방', '뿌리발근', '활착',
  '가스제거', '염류', '광합성', '냉해', '저온',
  '왁스층', '잎두께', '수확', '토양개량', '활성'
];

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 1: normalizePackageSize(rawText)
 * 용량 텍스트를 파싱해 수치·단위·ml 환산값을 반환한다.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 제품 용량 문자열을 파싱한다.
 *
 * @param {string} rawText  예: "1L", "500ml", "1000cc", "20kg", "500mL", "1mlr"
 * @returns {{
 *   raw: string,
 *   value: number|null,
 *   unit: string|null,
 *   ml: number|null,
 *   warnings: string[],
 *   parseLog: string[]
 * }}
 */
function normalizePackageSize(rawText) {
  const warnings = [];
  const parseLog = [];

  if (!rawText || !rawText.trim()) {
    return { raw: rawText || '', value: null, unit: null, ml: null, warnings: ['용량 텍스트 비어 있음'], parseLog };
  }

  const trimmed = rawText.trim();
  const m = RX_PKG_SIZE_RE.exec(trimmed);

  if (!m) {
    warnings.push(`용량 형식 미인식: "${trimmed}"`);
    return { raw: trimmed, value: null, unit: null, ml: null, warnings, parseLog };
  }

  const value = Number(m[1]);
  let unit = m[2];
  parseLog.push(`원본 단위: "${unit}"`);

  // OCR 오인식 보정
  if (OCR_FIXES[unit]) {
    parseLog.push(`OCR 보정: "${unit}" → "${OCR_FIXES[unit]}"`);
    unit = OCR_FIXES[unit];
  }

  // ml 환산
  // cc → ml (1:1), ml → ml (그대로), L → ml (*1000), 나머지 → null
  let ml = null;
  if (unit === 'ml') {
    ml = value;
    parseLog.push(`ml 환산: ${value}ml`);
  } else if (unit === 'L') {
    ml = value * 1000;
    parseLog.push(`ml 환산: ${value}L × 1000 = ${ml}ml`);
  }
  // g, kg는 ml 환산 불가 (밀도 모름) → ml = null 유지

  return { raw: trimmed, value, unit, ml, warnings, parseLog };
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 2: extractPackageSizes(text)
 * 텍스트에서 용량 패턴을 모두 추출한다 (전역 검색).
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 텍스트에서 용량 패턴을 모두 찾아 원본 문자열 배열로 반환한다.
 *
 * @param {string} text  예: "파이토 1L 500ml 제품"
 * @returns {string[]}  예: ["1L", "500ml"]
 */
function extractPackageSizes(text) {
  if (!text) return [];
  // 전역 플래그(g)로 모든 일치 추출
  const globalRe = new RegExp(RX_PKG_SIZE_RE.source, 'g');
  const matches = [];
  let m;
  while ((m = globalRe.exec(text)) !== null) {
    matches.push(m[0]);  // 일치한 전체 문자열 (예: "1L", "500ml")
  }
  return matches;
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 3: normalizeDosage(text)
 * 제품 행 텍스트에서 처방 수량을 파싱한다.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 처방 수량 파싱 (반 우선, 그 다음 숫자).
 *
 * @param {string} text  제품 행 전체 텍스트 예: "파이토 1L 1병 550평"
 * @returns {{
 *   raw: string,
 *   qty: number|null,
 *   unit: string,
 *   warnings: string[],
 *   parseLog: string[]
 * }}
 */
function normalizeDosage(text) {
  const warnings = [];
  const parseLog = [];

  if (!text || !text.trim()) {
    return { raw: text || '', qty: null, unit: '', warnings: ['처방 텍스트 비어 있음'], parseLog };
  }

  // 반포/반병/반봉/반통/반개 우선 확인
  const halfM = RX_HALF_RE.exec(text);
  if (halfM) {
    parseLog.push(`반(0.5) 수량 인식: "${halfM[0]}"`);
    return { raw: halfM[0], qty: 0.5, unit: halfM[1], warnings, parseLog };
  }

  // 숫자 + 단위 패턴
  const countM = RX_DOSAGE_RE.exec(text);
  if (countM) {
    const qty = Number(countM[1]);
    parseLog.push(`수량 인식: "${countM[0]}" → qty=${qty}, unit="${countM[2]}"`);
    return { raw: countM[0], qty, unit: countM[2], warnings, parseLog };
  }

  // 인식 실패
  warnings.push(`처방 수량 미인식: "${text}"`);
  return { raw: text, qty: null, unit: '', warnings, parseLog };
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 4: normalizeBaseArea(text)
 * 텍스트에서 기준 평수를 파싱한다.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 텍스트에서 기준 평수(N평) 패턴을 파싱한다.
 *
 * @param {string} text  예: "550평", "파이토 1L 1병 550평"
 * @returns {{
 *   raw: string,
 *   area: number|null,
 *   warnings: string[]
 * }}
 */
function normalizeBaseArea(text) {
  const warnings = [];

  if (!text || !text.trim()) {
    return { raw: text || '', area: null, warnings };
  }

  const m = RX_AREA_RE.exec(text);
  if (m) {
    return { raw: m[0], area: Number(m[1]), warnings };
  }

  // 평수 없음 — 경고 없이 반환 (평수는 선택 사항)
  return { raw: '', area: null, warnings };
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 5: normalizeUsage(rawText)
 * 사용방법/주의사항 행을 파싱한다.
 * 예: "물25말+200평 관주", "관주방법(550평)"
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 사용방법 행을 파싱해 물 희석량·평수·시용방법·비고를 추출한다.
 *
 * @param {string} rawText  예: "물25말+200평 관주" 또는 "관주방법(550평)"
 * @returns {{
 *   usageRaw: string,
 *   waterAmountRaw: string,
 *   waterAmountValue: number|null,
 *   waterAmountUnit: string,
 *   baseArea: number|null,
 *   applicationMethod: string,
 *   note: string,
 *   warnings: string[],
 *   parseLog: string[]
 * }}
 */
function normalizeUsage(rawText) {
  const warnings = [];
  const parseLog = [];

  const result = {
    usageRaw: rawText || '',
    waterAmountRaw: '',
    waterAmountValue: null,
    waterAmountUnit: '',
    // v14: 물량 범위 (waterMin === waterMax이면 단일값)
    waterMin: null,
    waterMax: null,
    waterUnit: '',
    baseArea: null,
    applicationMethod: '',
    note: '',
    usageDisplayText: '',
    warnings,
    parseLog
  };

  if (!rawText || !rawText.trim()) {
    warnings.push('사용방법 텍스트 비어 있음');
    return result;
  }

  let remaining = rawText.trim();

  // ── 1단계: 물 희석량 추출 (범위 지원) ──────────────────────────────
  // 1-a: 물(25말-50말) 또는 물(25말~50말) 범위 패턴
  const rangeM = remaining.match(/물\s*\(?\s*(\d+(?:\.\d+)?)\s*(말|통|L|ℓ|리터)\s*[-~]\s*(\d+(?:\.\d+)?)\s*(?:말|통|L|ℓ|리터)?\s*\)?/);
  if (rangeM) {
    result.waterMin = Number(rangeM[1]);
    result.waterMax = Number(rangeM[3]);
    result.waterUnit = rangeM[2];
    result.waterAmountRaw = rangeM[0];
    result.waterAmountValue = result.waterMin;
    result.waterAmountUnit = result.waterUnit;
    remaining = remaining.replace(rangeM[0], '').trim();
    parseLog.push(`물 희석량(범위): ${result.waterMin}-${result.waterMax}${result.waterUnit}`);
  }
  // 1-b: 물(25말) 또는 물25말 단일 패턴
  if (result.waterMin === null) {
    const singleM = remaining.match(/물\s*\(?\s*(\d+(?:\.\d+)?)\s*(말|통|L|ℓ|리터)\s*\)?/);
    if (singleM) {
      result.waterMin = Number(singleM[1]);
      result.waterMax = result.waterMin;
      result.waterUnit = singleM[2];
      result.waterAmountRaw = singleM[0];
      result.waterAmountValue = result.waterMin;
      result.waterAmountUnit = result.waterUnit;
      remaining = remaining.replace(singleM[0], '').trim();
      parseLog.push(`물 희석량: ${result.waterMin}${result.waterUnit}`);
    }
  }
  // 1-c: 기존 RX_WATER_RE 폴백 (물 키워드 없이 숫자+단위만)
  if (result.waterMin === null) {
    const waterM = RX_WATER_RE.exec(remaining);
    if (waterM) {
      result.waterMin = Number(waterM[1]);
      result.waterMax = result.waterMin;
      result.waterUnit = waterM[2];
      result.waterAmountRaw = waterM[0];
      result.waterAmountValue = result.waterMin;
      result.waterAmountUnit = waterM[2];
      remaining = remaining.replace(/물\s*/, '').replace(waterM[0], '').trim();
      parseLog.push(`물 희석량(폴백): ${waterM[1]}${waterM[2]}`);
    }
  }

  // ── 2단계: 방법+평수 복합 패턴 우선 추출 ──────────────────────────
  // 관주방법(550평), 엽면시비(1000평), 관주시(1000평), 엽면시(1000평)
  const methodAreaM = remaining.match(/(관주방법|엽면방법|관주시비|엽면시비|관주시|엽면시|엽면시비|관주|엽면)\s*\(?\s*(\d+(?:\.\d+)?)\s*평\s*\)?/);
  if (methodAreaM) {
    const raw = methodAreaM[1];
    result.applicationMethod = /관주/.test(raw) ? '관주' : /엽면/.test(raw) ? '엽면' : '토양';
    result.baseArea = Number(methodAreaM[2]);
    remaining = remaining.replace(methodAreaM[0], '').trim();
    parseLog.push(`방법+평수: ${result.applicationMethod}(${result.baseArea}평)`);
  }

  // 2-b: 평수만 (방법 없이)
  if (result.baseArea === null) {
    const areaM = RX_AREA_RE.exec(remaining);
    if (areaM) {
      result.baseArea = Number(areaM[1]);
      parseLog.push(`기준 평수: "${areaM[0]}" → ${areaM[1]}평`);
      remaining = remaining.replace(areaM[0], '').trim();
    }
  }

  // ── 3단계: 시용방법 감지 (아직 미설정인 경우) ──────────────────────
  if (!result.applicationMethod) {
    if (/관주/.test(remaining))      { result.applicationMethod = '관주'; parseLog.push('시용방법: 관주'); }
    else if (/엽면/.test(remaining)) { result.applicationMethod = '엽면'; parseLog.push('시용방법: 엽면'); }
    else if (/토양/.test(remaining)) { result.applicationMethod = '토양'; parseLog.push('시용방법: 토양'); }
  }

  // ── 4단계: 나머지 → note ──────────────────────────────────────────
  const cleaned = remaining
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  result.note = cleaned;

  // ── 5단계: usageDisplayText 생성 ──────────────────────────────────
  const parts = [];
  if (result.waterMin !== null) {
    parts.push(result.waterMin === result.waterMax
      ? `물 ${result.waterMin}${result.waterUnit}`
      : `물 ${result.waterMin}-${result.waterMax}${result.waterUnit}`);
  }
  if (result.applicationMethod) parts.push(result.applicationMethod);
  if (result.baseArea !== null) parts.push(`${result.baseArea}평`);
  if (cleaned) parts.push(cleaned);
  result.usageDisplayText = parts.join(' / ') || rawText;

  return result;
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 6: normalizeStageLabel(raw)
 * 단계 라벨 원문을 분류·정규화한다.
 * 예: "관주\n1차", "엽면방법(550평)", "감사\n비료\n수확:후\n및\n3월-4월"
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 단계 라벨 원문을 분석해 type·order·timing·purpose 등을 추출한다.
 *
 * @param {string} raw  stage 블록의 줄 합산 텍스트 (줄바꿈 포함 가능)
 * @returns {{
 *   raw: string,
 *   normalized: string,
 *   type: string,
 *   order: number,
 *   timing: string,
 *   purpose: string[],
 *   isDescriptionRow: boolean,
 *   warnings: string[],
 *   parseLog: string[]
 * }}
 */
function normalizeStageLabel(raw) {
  const warnings = [];
  const parseLog = [];

  const base = {
    raw,
    normalized: raw || '',
    type: '기타',
    order: 0,
    timing: '',
    purpose: [],
    isDescriptionRow: false,
    warnings,
    parseLog
  };

  if (!raw || !raw.trim()) {
    warnings.push('단계 라벨 비어 있음');
    return base;
  }

  // 줄바꿈을 공백으로 합산해 분석용 단일 텍스트 생성
  const flat = raw.replace(/\n/g, ' ').trim();

  // ── 1단계: 설명 행 여부 확인 ──────────────────────────────────────
  if (DESCRIPTION_ROW_RE.test(flat)) {
    parseLog.push(`설명 행 감지: "${flat}"`);
    base.isDescriptionRow = true;
    base.normalized = flat;
    return base;
  }

  // ── 2단계: 목적/효능 키워드 추출 ─────────────────────────────────
  for (const kw of PURPOSE_KEYWORDS) {
    if (flat.includes(kw)) {
      base.purpose.push(kw);
      parseLog.push(`목적 키워드: "${kw}"`);
    }
  }

  // ── 3단계: STAGE_ALIASES 순서대로 매칭 ───────────────────────────
  let matched = false;
  for (const alias of STAGE_ALIASES) {
    const m = alias.re.exec(flat);
    if (m) {
      base.type = alias.type;
      if (alias.orderFn)  base.order  = alias.orderFn(m);
      if (alias.timingFn) base.timing = alias.timingFn(m);
      parseLog.push(`STAGE_ALIAS 매칭: re=${alias.re}, type="${base.type}", order=${base.order}, timing="${base.timing}"`);
      matched = true;
      break;
    }
  }

  if (!matched) {
    parseLog.push(`STAGE_ALIAS 미매칭 — 기타로 분류: "${flat}"`);
  }

  // ── 4단계: 정규화 라벨 조립 ──────────────────────────────────────
  base.normalized = buildNormalizedStageLabel({
    type:   base.type,
    order:  base.order,
    timing: base.timing,
    raw:    flat
  });

  return base;
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 6b: buildNormalizedStageLabel({ type, order, timing, raw })
 * 분류된 단계 정보로 표준 라벨 문자열을 조립한다.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 단계 분류 결과로 표준 라벨 문자열을 생성한다.
 *
 * @param {{ type: string, order: number, timing: string, raw: string }} param
 * @returns {string}  예: "관주 1차", "엽면 2차", "토양(기비)", "정식 후 7일"
 */
function buildNormalizedStageLabel({ type, order, timing, raw }) {
  switch (type) {
    case '관주':
      return order > 0 ? `관주 ${order}차` : '관주';

    case '엽면':
      return order > 0 ? `엽면 ${order}차` : '엽면';

    case '토양':
      return '토양(기비)';

    case '추비':
      return '추비';

    case '정식':
      return timing || '정식';

    case '기타':
    default:
      // raw 텍스트 정리: 구분자를 공백으로 치환, 공백 정규화
      return (raw || '')
        .replace(/[:：]/g, ' ')   // 콜론 → 공백
        .replace(/[+＋]/g, ' ')   // 플러스 → 공백
        .replace(/\s+/g, ' ')     // 연속 공백 → 단일 공백
        .trim();
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 7: decomposeProductText(rawText)
 * 제품 행 텍스트를 이름·용량·수량·평수로 분해한다.
 * 예: "파이토 1L 1병 550평" → { productName:"파이토", packageSize:{1L}, dosage:{1,병}, baseArea:550 }
 *
 * 추출 순서:
 *   1. 처방 수량 (반 우선 → 숫자 count)
 *   2. 기준 평수
 *   3. 용량 (전체 추출 후 첫 번째 사용)
 *   4. 나머지 → 제품명
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 제품 행 텍스트를 분해한다.
 *
 * @param {string} rawText  예: "파이토 1L 1병 550평"
 * @returns {{
 *   productRaw: string,
 *   productName: string,
 *   packageSize: { raw, value, unit, ml, warnings, parseLog },
 *   dosage: { raw, qty, unit, warnings, parseLog },
 *   baseAreaRaw: string,
 *   baseArea: number|null,
 *   warnings: string[],
 *   parseLog: string[]
 * }}
 */
function decomposeProductText(rawText) {
  const warnings = [];
  const parseLog = [];

  const emptyPkgSize = { raw: '', value: null, unit: null, ml: null, warnings: [], parseLog: [] };
  const emptyDosage  = { raw: '', qty: null, unit: '', warnings: [], parseLog: [] };

  if (!rawText || !rawText.trim()) {
    warnings.push('제품 텍스트 비어 있음');
    return {
      productRaw: rawText || '',
      productName: '',
      packageSize: emptyPkgSize,
      dosage: emptyDosage,
      baseAreaRaw: '',
      baseArea: null,
      warnings,
      parseLog
    };
  }

  let remaining = rawText.trim();
  parseLog.push(`원본: "${remaining}"`);

  // ── 1단계: 처방 수량 추출 (반 우선, 그 다음 숫자) ─────────────────
  // ★ dosage.qty != null인 경우만 텍스트에서 제거 (미인식 시 raw=전체텍스트 → 제품명 삭제 방지)
  const dosage = normalizeDosage(remaining);
  if (dosage.qty != null && dosage.raw) {
    parseLog.push(`수량 추출: "${dosage.raw}"`);
    remaining = remaining.replace(dosage.raw, '').trim();
  }
  if (dosage.warnings.length) warnings.push(...dosage.warnings);

  // ── 2단계: 기준 평수 추출 ─────────────────────────────────────────
  const areaResult = normalizeBaseArea(remaining);
  let baseAreaRaw = '';
  let baseArea    = null;
  if (areaResult.area !== null) {
    baseAreaRaw = areaResult.raw;
    baseArea    = areaResult.area;
    parseLog.push(`평수 추출: "${areaResult.raw}" → ${areaResult.area}평`);
    remaining = remaining.replace(areaResult.raw, '').trim();
  }

  // ── 3단계: 용량 전체 추출 → 첫 번째 사용 ─────────────────────────
  const allSizes = extractPackageSizes(remaining);
  let packageSize = emptyPkgSize;

  if (allSizes.length > 0) {
    // 첫 번째 용량을 정규화
    packageSize = normalizePackageSize(allSizes[0]);
    parseLog.push(`용량 추출: "${allSizes[0]}" (전체 발견: ${allSizes.join(', ')})`);
    warnings.push(...packageSize.warnings);

    // 발견된 모든 용량 패턴 제거
    for (const sz of allSizes) {
      remaining = remaining.replace(sz, '').trim();
    }
  }

  // ── 4단계: 나머지 → 제품명 정리 ─────────────────────────────────
  const productName = remaining
    .replace(/\(\s*\)/g, '')  // 빈 괄호 제거 (용량 제거 후 남은 "()" 처리)
    .replace(/\s+/g, ' ')     // 연속 공백 → 단일 공백
    .trim();

  if (productName.length < 2) {
    warnings.push(`제품명이 너무 짧음 (${productName.length}자): "${productName}" — 원문: "${rawText}"`);
  }

  parseLog.push(`최종 제품명: "${productName}"`);

  return {
    productRaw: rawText,
    productName,
    packageSize,
    dosage,
    baseAreaRaw,
    baseArea,
    warnings,
    parseLog
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 8: classifyRightRow(text)
 * 우측 열 행을 종류별로 분류한다.
 * 반환값: 'product' | 'usage' | 'description' | 'skip'
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 우측 열 한 행의 텍스트를 분류한다.
 *
 * 분류 기준:
 *   skip        — 비어 있거나 1자 이하
 *   product     — 처방 수량 단위 (포/병/봉/통/개) 또는 반(반포 등) 포함
 *   usage       — 물 희석량, 관주방법/엽면방법/희석/배율 포함; 또는 평수+방법
 *   description — 그 외 (설명, 비고 등)
 *
 * @param {string} text
 * @returns {'product'|'usage'|'description'|'skip'}
 */
function classifyRightRow(text) {
  if (!text || text.trim().length <= 1) return 'skip';

  const t = text.trim();

  // 처방 수량 단위 포함 → 제품 행
  if (RX_DOSAGE_RE.test(t) || RX_HALF_RE.test(t)) {
    return 'product';
  }

  // 물 희석량 또는 관주방법/엽면방법/엽면시비/관주시/엽면시/희석/배율 포함 → 사용방법 행
  if (RX_WATER_RE.test(t) || /관주방법|엽면방법|엽면시비|관주시비|관주시\s*\(|엽면시\s*\(|희석|배율/.test(t)) {
    return 'usage';
  }
  // 물(숫자) 또는 물숫자말 패턴도 사용방법
  if (/물\s*[\(\d]\s*\d+\s*(말|통|L|ℓ|리터)/.test(t)) {
    return 'usage';
  }

  // 평수 + 방법/방식/요령 → 사용방법 행
  if (RX_AREA_RE.test(t) && /방법|방식|요령/.test(t)) {
    return 'usage';
  }

  return 'description';
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 8.5: splitCompositeRow(text)   — v14 추가
 * 한 줄에 제품+사용법이 복합으로 붙어 있으면 분리한다.
 * 예: "딥루트 10L 1통 물(25말)" → product:"딥루트 10L 1통" + usage:"물(25말)"
 * ═══════════════════════════════════════════════════════════════════════ */
function splitCompositeRow(text) {
  if (!text || !text.trim()) return { parts: [], originalText: text || '' };
  const t = text.trim();

  // 사용법 시작 마커 패턴 (제품 데이터 뒤에 올 수 있는 사용법 시작점)
  const usageMarkers = [
    /\s+(물\s*\(\s*\d)/,                            // "물(25말)"
    /\s+(물\s*\d+\s*(?:말|통|L|ℓ|리터))/,            // "물25말"
    /\s+(관주방법|엽면방법|관주시비|엽면시비)\s*\(?/,   // "관주방법(550평)"
    /\s+(관주시|엽면시)\s*\(/,                        // "관주시(1000평)"
    /\s+(\d+평)\s+(관주|엽면|토양)/,                  // "550평 관주"
    /\s+(물\s*\(\s*\d+\s*(?:말|통|L|ℓ|리터)\s*[-~]\s*\d+)/, // "물(25말-50말)"
  ];

  for (const re of usageMarkers) {
    const m = t.match(re);
    if (m && m.index > 0) {
      const productPart = t.slice(0, m.index).trim();
      const usagePart   = t.slice(m.index).trim();
      // 제품 부분이 최소 길이 있어야 (빈 분리 방지)
      if (productPart.length >= 2) {
        return {
          originalText: t,
          parts: [
            { type: 'product', text: productPart },
            { type: 'usage',   text: usagePart }
          ]
        };
      }
    }
  }

  // 분리 불필요 → 단일 분류
  const kind = classifyRightRow(t);
  return { parts: [{ type: kind, text: t }], originalText: t };
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 9: buildRxRow(params)
 * 모든 파싱 결과를 하나의 완성된 RxRow 객체로 조립한다.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 완성된 RxRow 객체를 생성한다.
 *
 * @param {{
 *   stageRaw:     string,          — 단계 라벨 원문 (줄바꿈 포함 가능)
 *   productRaw:   string,          — 제품 행 원문
 *   sourcePage:   number,          — 원본 페이지 번호
 *   sourceBlock:  number,          — 페이지 내 블록 인덱스
 *   fallbackArea: number|null,     — stage 라벨 또는 usage 행에서 추출한 폴백 평수
 *   usageContext: object|null      — normalizeUsage 결과 (선택)
 * }} params
 *
 * @returns {{
 *   // 원본 출처
 *   originalText: string,
 *   sourcePage: number,
 *   sourceBlock: number,
 *   // 단계
 *   stageRaw: string,
 *   stageNormalized: string,
 *   stageType: string,
 *   stageOrder: number,
 *   stageTiming: string,
 *   stagePurpose: string[],
 *   // 제품
 *   productRaw: string,
 *   productName: string,
 *   mappedId: null,
 *   mappedName: null,
 *   // 용량
 *   packageSizeRaw: string,
 *   packageSizeValue: number|null,
 *   packageSizeUnit: string|null,
 *   packageSizeMl: number|null,
 *   // 처방 수량
 *   dosageRaw: string,
 *   dosageQty: number|null,
 *   dosageUnit: string,
 *   // 기준 평수
 *   baseAreaRaw: string,
 *   baseArea: number|null,
 *   // 사용방법
 *   usageRaw: string,
 *   waterAmountRaw: string,
 *   waterAmountValue: number|null,
 *   waterAmountUnit: string,
 *   applicationMethod: string,
 *   note: string,
 *   // 품질
 *   confidence: number,
 *   warnings: string[],
 *   parseLog: string[]
 * }}
 */
function buildRxRow({ stageRaw, productRaw, sourcePage, sourceBlock, fallbackArea, usageContext,
                      inlineUsageRaw, blockUsageRaw }) {
  const warnings = [];
  const parseLog = [];

  // ── 단계 라벨 정규화 ────────────────────────────────────────────────
  const stage = normalizeStageLabel(stageRaw || '');
  warnings.push(...stage.warnings);
  parseLog.push(...stage.parseLog.map(l => `[stage] ${l}`));

  // ── v14: 인라인 사용법 분리 (제품 행 안에 사용법이 붙어 있으면 분리) ──
  let effectiveProductRaw = productRaw || '';
  let effectiveInlineUsage = inlineUsageRaw || null;
  if (!effectiveInlineUsage && effectiveProductRaw) {
    const split = splitCompositeRow(effectiveProductRaw);
    if (split.parts.length > 1) {
      effectiveProductRaw = split.parts.find(p => p.type === 'product')?.text || effectiveProductRaw;
      const usagePart = split.parts.find(p => p.type === 'usage');
      if (usagePart) {
        effectiveInlineUsage = usagePart.text;
        parseLog.push(`[split] 복합행 분리: 제품="${effectiveProductRaw}" / 사용법="${effectiveInlineUsage}"`);
      }
    }
  }

  // ── 제품 행 분해 (사용법 분리 후 순수 제품 텍스트만) ────────────────
  const decomp = decomposeProductText(effectiveProductRaw);
  warnings.push(...decomp.warnings);
  parseLog.push(...decomp.parseLog.map(l => `[decomp] ${l}`));

  // ── v14: 사용법 결정 (우선순위: 인라인 > usageContext > 블록 > stage.type) ──
  // baseArea 결정보다 먼저 실행해야 effectiveUsage.baseArea를 폴백으로 사용 가능
  let effectiveUsage = usageContext;
  if (effectiveInlineUsage) {
    const inlineParsed = normalizeUsage(effectiveInlineUsage);
    if (inlineParsed.waterAmountValue || inlineParsed.baseArea || inlineParsed.applicationMethod) {
      effectiveUsage = inlineParsed;
      parseLog.push(`[usage] 인라인 사용법 적용: "${effectiveInlineUsage}"`);
    }
  }
  if (!effectiveUsage && blockUsageRaw) {
    effectiveUsage = normalizeUsage(blockUsageRaw);
    parseLog.push(`[usage] 블록 사용법 적용: "${blockUsageRaw}"`);
  }

  // ── 기준 평수 결정 ────────────────────────────────────────────────
  // 우선순위: 제품 행 평수 > effectiveUsage 평수 > fallbackArea
  let baseArea    = decomp.baseArea;
  let baseAreaRaw = decomp.baseAreaRaw;

  if (baseArea === null && effectiveUsage && effectiveUsage.baseArea !== null) {
    baseArea    = effectiveUsage.baseArea;
    baseAreaRaw = `(usage: ${effectiveUsage.baseArea}평)`;
    parseLog.push(`[area] usage 폴백: ${effectiveUsage.baseArea}평`);
  }
  if (baseArea === null && fallbackArea !== null) {
    baseArea    = fallbackArea;
    baseAreaRaw = `(fallback: ${fallbackArea}평)`;
    parseLog.push(`[area] fallbackArea 폴백: ${fallbackArea}평`);
  }
  if (baseArea === null) {
    warnings.push('기준 평수 없음 — 별도 입력 필요');
  }

  // 시용방법 결정
  let applicationMethod = '';
  if (effectiveUsage && effectiveUsage.applicationMethod) {
    applicationMethod = effectiveUsage.applicationMethod;
  } else if (stage.type === '관주') {
    applicationMethod = '관주';
  } else if (stage.type === '엽면') {
    applicationMethod = '엽면';
  }

  // ── 신뢰도 계산 ──────────────────────────────────────────────────
  // 기본 신뢰도 1.0 에서 항목별 감점
  let confidence = 1.0;

  if (decomp.dosage.qty === null) {
    confidence -= 0.3;
    parseLog.push('[confidence] -0.3: 처방 수량 미인식');
  }
  if (decomp.productName.length < 2) {
    confidence -= 0.4;
    parseLog.push('[confidence] -0.4: 제품명 너무 짧음');
  }
  if (baseArea === null) {
    // 경고만, 신뢰도 감점 없음
    parseLog.push('[confidence] 기준 평수 없음 (감점 없음)');
  }
  if (decomp.packageSize.warnings.length > 0) {
    confidence -= 0.1;
    parseLog.push('[confidence] -0.1: 용량 파싱 경고');
  }

  confidence = Math.max(0, Math.round(confidence * 10) / 10);

  // ── RxRow 조립 ───────────────────────────────────────────────────
  return {
    // 원본 출처
    originalText: productRaw || '',
    sourcePage:   sourcePage   || null,
    sourceBlock:  sourceBlock  || 0,

    // 단계 정보
    stageRaw:        stage.raw,
    stageNormalized: stage.normalized,
    stageType:       stage.type,
    stageOrder:      stage.order,
    stageTiming:     stage.timing,
    stagePurpose:    stage.purpose,

    // 제품 기본 정보
    productRaw:  decomp.productRaw,
    productName: decomp.productName,
    mappedId:    null,   // productMapper.js 에서 채움
    mappedName:  null,   // productMapper.js 에서 채움

    // 제품 용량
    packageSizeRaw:   decomp.packageSize.raw,
    packageSizeValue: decomp.packageSize.value,
    packageSizeUnit:  decomp.packageSize.unit,
    packageSizeMl:    decomp.packageSize.ml,

    // 처방 수량
    dosageRaw:  decomp.dosage.raw,
    dosageQty:  decomp.dosage.qty,
    dosageUnit: decomp.dosage.unit,

    // 기준 평수
    baseAreaRaw,
    baseArea,

    // 사용방법 (인라인 > usageContext > 블록 폴백)
    usageRaw:          effectiveUsage ? (effectiveUsage.usageRaw         || '') : '',
    waterAmountRaw:    effectiveUsage ? (effectiveUsage.waterAmountRaw   || '') : '',
    waterAmountValue:  effectiveUsage ? (effectiveUsage.waterAmountValue || null) : null,
    waterAmountUnit:   effectiveUsage ? (effectiveUsage.waterAmountUnit  || '') : '',
    applicationMethod,
    note:              effectiveUsage ? (effectiveUsage.note             || '') : '',
    // v14: 확장 사용법 필드
    waterMin:          effectiveUsage ? (effectiveUsage.waterMin         || null) : null,
    waterMax:          effectiveUsage ? (effectiveUsage.waterMax         || null) : null,
    waterUnit:         effectiveUsage ? (effectiveUsage.waterUnit        || '') : '',
    usageDisplayText:  effectiveUsage ? (effectiveUsage.usageDisplayText || '') : '',
    inlineUsageRaw:    effectiveInlineUsage || '',
    blockUsageRaw:     blockUsageRaw || '',

    // 품질 지표
    confidence,
    warnings,
    parseLog
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * SECTION 10: inferTotalArea(rxRows)
 * 모든 RxRow 의 baseArea 빈도를 분석해 농가 총 평수를 추정한다.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * RxRow 배열에서 baseArea 빈도를 집계해 가장 많이 등장하는 값을 반환한다.
 *
 * 처방전에서 "N평 기준 X포" 패턴으로 파싱된 baseArea 중
 * 가장 자주 등장하는 값 = 해당 농가의 실제 총 평수로 간주한다.
 *
 * @param {Array<{baseArea: number|null}>} rxRows
 * @returns {number|null}  추정 총 평수, 또는 데이터 부족 시 null
 */
function inferTotalArea(rxRows) {
  if (!rxRows || !rxRows.length) return null;

  const freq = {};
  for (const row of rxRows) {
    if (row.baseArea !== null && row.baseArea !== undefined) {
      freq[row.baseArea] = (freq[row.baseArea] || 0) + 1;
    }
  }

  const entries = Object.entries(freq);
  if (!entries.length) return null;

  // 빈도 내림차순 정렬 → 최다 빈도 값 반환
  entries.sort((a, b) => b[1] - a[1]);
  return Number(entries[0][0]);
}
