/**
 * productMapper.js  v2
 * PDF 추출 텍스트 → 제품 DB 매칭 엔진
 * 의존: productDB.js (PRODUCT_DB)
 *
 * v2 변경 사항:
 *   - OCR 오타 사전 추가 (_ocrFix)
 *   - 용량 제거 후 1차 매칭 → 용량으로 2차 검증하는 findProductWithSize() 추가
 *   - confidence 세분화: 1.0 / 0.95 / 0.9 / 0.7 / 0.5
 */

/* ───────────────────────────────────────────
   OCR 오타 사전
   자주 발생하는 OCR 인식 오류 쌍을 나열한다.
   key: 오타 패턴 (정규식 소스), value: 정정 텍스트
   ─────────────────────────────────────────── */
const OCR_TYPO_MAP = {
  // 한글 자모 오인식
  '쎄':    '세',    // 실렌에쎄 → 실렌에세 (없지만 보험용)
  '팜0':   '팜오',  // 옥토팜0 → 옥토팜오 (숫자 0 ↔ 오)
  '뿌리': '뿌리',   // 정규형 유지 (중복 방지용)
  // 영문/숫자 혼동
  'gb2':   'gb2',   // 대소문자 통일은 _normalizeText에서 처리
  'fa3':   'fa3',
  'ck1':   'ck1',
  // 자주 쓰이는 브랜드 약칭 오타
  '옥스팜': '옥스팜',
  '옥토팜': '옥토팜',
  '딥루트': '딥루트',
  '파이또': '파이토',   // ㅗ ↔ ㅛ 오인식
  '파이트':  '파이토',
  '풀빅':   '풀빅',
  '깔조아': '깔조아',
  '딱하나': '딱하나로',
  '엘크로': '엘크로',
  '생명픽': '생명픽스',
  '스테비': '스테비팜',
  '칼슘오': '칼슘오래가지오',
  '오래가': '오래가지오',
  '엠비올': '엠비올',
};

/* ───────────────────────────────────────────
   텍스트 정규화 — 비교 전 공백·특수문자·대소문자 통일
   ─────────────────────────────────────────── */
function _normalizeText(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[+\-\(\)（）\[\]·.,]/g, '')
    .replace(/쎄/g, '세')
    .replace(/파이또/g, '파이토')
    .replace(/파이트(?!칼)/g, '파이토');  // "파이트칼"은 "파이토칼"로 → 다음 문자가 칼이 아닐 때만
}

/* ───────────────────────────────────────────
   OCR 오타 보정 (정규화 전 적용)
   ─────────────────────────────────────────── */
function _applyOcrFix(s) {
  if (!s) return s;
  let out = s;
  // 알려진 오타 패턴 치환
  out = out.replace(/파이또/g, '파이토');
  out = out.replace(/파이트(?!칼)/g, '파이토');
  out = out.replace(/쎄/g, '세');
  return out;
}

/* ───────────────────────────────────────────
   findProduct(originalName)
   기존 인터페이스 유지 — 원문 이름으로 매칭
   ─────────────────────────────────────────── */

/**
 * PDF에서 추출한 원본 이름으로 제품을 찾는다.
 *
 * @param {string} originalName - PDF 원본 텍스트
 * @returns {{ id:string, name:string, price:number, confidence:number } | null}
 *
 * 매칭 우선순위:
 *   1) exact   (1.0) — 정식명칭 완전 일치
 *   2) alias   (0.95) — aliases 중 하나와 완전 일치
 *   3) ocr     (0.9) — OCR 오타 보정 후 재시도
 *   4) contains (0.7) — 정식명칭/alias가 입력을 포함하거나 역포함
 *   5) token   (0.5) — 영문·숫자 토큰(2자+)이 모두 일치
 */
function findProduct(originalName) {
  if (!originalName) return null;

  // OCR 보정 후 정규화
  const fixed = _applyOcrFix(originalName);
  const input = _normalizeText(fixed);
  if (!input) return null;

  // ── 1) exact: 정식명칭 완전 일치 ──────────────────────────────────
  for (const p of PRODUCT_DB) {
    if (_normalizeText(p.name) === input) {
      return { id: p.id, name: p.name, price: p.price, confidence: 1.0 };
    }
  }

  // ── 2) alias: 별칭 완전 일치 ──────────────────────────────────────
  for (const p of PRODUCT_DB) {
    for (const alias of p.aliases) {
      if (_normalizeText(alias) === input) {
        return { id: p.id, name: p.name, price: p.price, confidence: 0.95 };
      }
    }
  }

  // ── 3) OCR 보정 후 재시도 — 원문과 다른 경우에만 ──────────────────
  if (fixed !== originalName) {
    const inputOcr = _normalizeText(fixed);
    for (const p of PRODUCT_DB) {
      if (_normalizeText(p.name) === inputOcr) {
        return { id: p.id, name: p.name, price: p.price, confidence: 0.9 };
      }
      for (const alias of p.aliases) {
        if (_normalizeText(alias) === inputOcr) {
          return { id: p.id, name: p.name, price: p.price, confidence: 0.9 };
        }
      }
    }
  }

  // ── 4) contains: 포함 일치 ────────────────────────────────────────
  for (const p of PRODUCT_DB) {
    const normName = _normalizeText(p.name);
    if (normName.includes(input) || input.includes(normName)) {
      return { id: p.id, name: p.name, price: p.price, confidence: 0.7 };
    }
    for (const alias of p.aliases) {
      const normAlias = _normalizeText(alias);
      if (normAlias.includes(input) || input.includes(normAlias)) {
        return { id: p.id, name: p.name, price: p.price, confidence: 0.7 };
      }
    }
  }

  // ── 5) token: 영문·숫자 토큰 일치 ───────────────────────────────
  const tokens = input.match(/[a-z0-9]{2,}/g);
  if (tokens && tokens.length > 0) {
    for (const p of PRODUCT_DB) {
      const normName = _normalizeText(p.name);
      if (tokens.every(t => normName.includes(t))) {
        return { id: p.id, name: p.name, price: p.price, confidence: 0.5 };
      }
    }
  }

  return null;
}

/* ───────────────────────────────────────────
   findProductWithSize(productName, packageSizeRaw)
   v2 신규 — 용량 제거 후 이름으로 1차 매칭,
   DB의 size 필드로 2차 검증 후 confidence 조정
   ─────────────────────────────────────────── */

/**
 * 제품명(용량 제거 후)과 패키지 용량으로 2단계 매칭을 수행한다.
 *
 * @param {string} productName    - 용량 제거 후 제품명 (예: "파이토", "딥루트")
 * @param {string} packageSizeRaw - 패키지 용량 원문 (예: "1L", "10L", "500ml")
 * @returns {{ id:string, name:string, price:number, confidence:number, sizeMatch:boolean } | null}
 */
function findProductWithSize(productName, packageSizeRaw) {
  if (!productName) return null;

  // ── 1차: 이름으로 후보 수집 (confidence ≥ 0.5 모두) ──────────────
  const candidates = [];

  const fixed = _applyOcrFix(productName);
  const input  = _normalizeText(fixed);
  if (!input) return null;

  for (const p of PRODUCT_DB) {
    const normName = _normalizeText(p.name);

    // exact match (이름에서 용량 제거)
    // DB 이름 예: "파이토", size: "1L" → 검색어 "파이토" → 완전 일치
    const nameWithoutSize = normName.replace(/\d+(?:\.\d+)?\s*(ml|l|g|kg|cc)/gi, '').replace(/\s+/g,'');

    let conf = 0;
    if (normName === input || nameWithoutSize === input)           conf = 1.0;
    else if (p.aliases.some(a => _normalizeText(a) === input))     conf = 0.95;
    else if (normName.includes(input) || input.includes(normName)) conf = 0.7;
    else {
      // alias contains
      for (const alias of p.aliases) {
        const na = _normalizeText(alias);
        if (na.includes(input) || input.includes(na)) { conf = 0.7; break; }
      }
    }
    // token fallback
    if (!conf) {
      const tokens = input.match(/[a-z0-9]{2,}/g);
      if (tokens && tokens.length && tokens.every(t => normName.includes(t))) conf = 0.5;
    }

    if (conf > 0) candidates.push({ p, conf });
  }

  if (!candidates.length) return null;

  // ── 2차: 용량으로 후보 필터링 → confidence 조정 ──────────────────
  if (packageSizeRaw && packageSizeRaw.trim()) {
    const normSize = packageSizeRaw.trim().toLowerCase()
      .replace(/\s+/g,'')
      .replace(/cc/g, 'ml');   // cc → ml 정규화

    // DB size도 동일 방식으로 정규화
    const sizeMatches = candidates.filter(({ p }) => {
      const dbSize = (p.size || '').toLowerCase().replace(/\s+/g,'').replace(/cc/g,'ml');
      return dbSize === normSize;
    });

    if (sizeMatches.length > 0) {
      // 용량 일치: confidence 보너스 +0.05 (최대 1.0)
      const best = sizeMatches.reduce((a, b) => a.conf >= b.conf ? a : b);
      const boosted = Math.min(1.0, best.conf + 0.05);
      return {
        id:         best.p.id,
        name:       best.p.name,
        price:      best.p.price,
        confidence: Math.round(boosted * 100) / 100,
        sizeMatch:  true
      };
    }
    // 용량 불일치: confidence -0.1 페널티 (최저 0.3)
    // — 이름은 맞아 보이지만 용량이 달라서 신뢰도 낮춤
    const best = candidates.reduce((a, b) => a.conf >= b.conf ? a : b);
    const penalized = Math.max(0.3, best.conf - 0.1);
    return {
      id:         best.p.id,
      name:       best.p.name,
      price:      best.p.price,
      confidence: Math.round(penalized * 100) / 100,
      sizeMatch:  false
    };
  }

  // 용량 정보 없으면 1차 결과 그대로 반환
  const best = candidates.reduce((a, b) => a.conf >= b.conf ? a : b);
  return {
    id:         best.p.id,
    name:       best.p.name,
    price:      best.p.price,
    confidence: best.conf,
    sizeMatch:  null   // 검증 불가
  };
}
