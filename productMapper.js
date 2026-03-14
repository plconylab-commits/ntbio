/**
 * productMapper.js
 * PDF 추출 텍스트 → 제품 DB 매칭 엔진
 * 의존: productDB.js (PRODUCT_DB)
 */

/**
 * 텍스트 정규화 — 비교 전 공백·특수문자·대소문자 통일
 */
function _normalizeText(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[+\-\(\)（）\[\]·.,]/g, '')
    .replace(/쎄/g, '세');
}

/**
 * PDF에서 추출한 원본 이름으로 제품을 찾는다.
 *
 * @param {string} originalName - PDF 원본 텍스트
 * @returns {{ id:string, name:string, price:number, confidence:number } | null}
 *
 * 매칭 우선순위:
 *   1) exact  (1.0) — 정식명칭 완전 일치
 *   2) alias  (0.9) — aliases 중 하나와 완전 일치
 *   3) contains (0.7) — 정식명칭/alias가 입력을 포함하거나 역포함
 *   4) token  (0.5) — 영문·숫자 토큰(2자+)이 모두 일치
 */
function findProduct(originalName) {
  if (!originalName) return null;
  const input = _normalizeText(originalName);
  if (!input) return null;

  // ── 1) exact: 정식명칭 완전 일치 ──
  for (const p of PRODUCT_DB) {
    if (_normalizeText(p.name) === input) {
      return { id: p.id, name: p.name, price: p.price, confidence: 1.0 };
    }
  }

  // ── 2) alias: 별칭 완전 일치 ──
  for (const p of PRODUCT_DB) {
    for (const alias of p.aliases) {
      if (_normalizeText(alias) === input) {
        return { id: p.id, name: p.name, price: p.price, confidence: 0.9 };
      }
    }
  }

  // ── 3) contains: 포함 일치 ──
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

  // ── 4) token: 영문·숫자 토큰 일치 ──
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
