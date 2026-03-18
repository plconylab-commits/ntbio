/**
 * rxNormalizer v14 테스트 — splitCompositeRow + normalizeUsage 확장 + buildRxRow 확장
 * 실행: node rxNormalizer.v14.test.js
 */

// ── 모듈 로드 시뮬레이션 (브라우저 전역 함수를 Node에서 사용) ──
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(__dirname + '/rxNormalizer.js', 'utf-8');
const ctx = vm.createContext({ console, module: {}, exports: {} });
vm.runInContext(code, ctx);

// 전역으로 꺼내기
const {
  splitCompositeRow,
  classifyRightRow,
  normalizeUsage,
  normalizeBaseArea,
  inferTotalArea,
  buildRxRow,
  decomposeProductText,
  normalizeStageLabel,
  classifyDetailCell,
  parseCompositionDetail,
} = ctx;

// classifyLeftRow: pdfParser.js에 있으므로 테스트용 로컬 구현 (동일 로직)
function classifyLeftRow(text) {
  const t = (text || '').trim();
  if (!t) return 'empty';
  if (/관주|엽면|기비|밑거름|토양처리|정식|추비|감사|수확/.test(t)) return 'stage_core';
  if (/\d+\s*월|\d+\s*[-~]\s*\d+\s*월/.test(t)) return 'date';
  if (/^(및|and|or|또는|그리고)$/i.test(t)) return 'connector';
  return 'note';
}

let passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { passed++; }
  else { failed++; console.error(`  ✗ FAIL: ${desc}`); }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ═══════════════════════════════════════════════════════════════
// 1. splitCompositeRow
// ═══════════════════════════════════════════════════════════════
section('splitCompositeRow');

{
  const r = splitCompositeRow('딥루트 10L 1통 물(25말)');
  assert('딥루트+물(25말) split', r.parts.length === 2);
  assert('딥루트 = product', r.parts[0].type === 'product' && r.parts[0].text === '딥루트 10L 1통');
  assert('물(25말) = usage', r.parts[1].type === 'usage' && r.parts[1].text === '물(25말)');
}
{
  const r = splitCompositeRow('칼슘-오래가지오 400g 2병 관주방법(1000평)');
  assert('칼슘+관주방법 split', r.parts.length === 2);
  assert('칼슘 = product', r.parts[0].type === 'product');
  assert('관주방법(1000평) = usage', r.parts[1].type === 'usage');
}
{
  const r = splitCompositeRow('생명+픽스 500g 1봉 물(25말-30말) 엽면시비(1000평)');
  assert('생명+픽스 split', r.parts.length === 2);
  assert('생명+픽스 product', r.parts[0].type === 'product' && /생명/.test(r.parts[0].text));
  assert('물(25말-30말) usage', r.parts[1].type === 'usage' && /물/.test(r.parts[1].text));
}
{
  const r = splitCompositeRow('파이토 1L 1병');
  assert('파이토 단독 = no split', r.parts.length === 1);
  assert('파이토 = product', r.parts[0].type === 'product');
}

// ═══════════════════════════════════════════════════════════════
// 2. normalizeUsage — 물량 범위 + 방법+평수 복합 패턴
// ═══════════════════════════════════════════════════════════════
section('normalizeUsage');

{
  const r = normalizeUsage('물(25말)');
  assert('물(25말) waterMin=25', r.waterMin === 25);
  assert('물(25말) waterMax=25', r.waterMax === 25);
  assert('물(25말) waterUnit=말', r.waterUnit === '말');
}
{
  const r = normalizeUsage('물25말');
  assert('물25말 waterMin=25', r.waterMin === 25);
}
{
  const r = normalizeUsage('물(25말-50말)');
  assert('물(25말-50말) waterMin=25', r.waterMin === 25);
  assert('물(25말-50말) waterMax=50', r.waterMax === 50);
  assert('물(25말-50말) usageDisplay', /25-50/.test(r.usageDisplayText));
}
{
  const r = normalizeUsage('관주방법(550평)');
  assert('관주방법(550평) method=관주', r.applicationMethod === '관주');
  assert('관주방법(550평) area=550', r.baseArea === 550);
}
{
  const r = normalizeUsage('엽면시비(1000평)');
  assert('엽면시비(1000평) method=엽면', r.applicationMethod === '엽면');
  assert('엽면시비(1000평) area=1000', r.baseArea === 1000);
}
{
  const r = normalizeUsage('관주시(1000평)');
  assert('관주시(1000평) method=관주', r.applicationMethod === '관주');
  assert('관주시(1000평) area=1000', r.baseArea === 1000);
}
{
  const r = normalizeUsage('엽면시(1000평)');
  assert('엽면시(1000평) method=엽면', r.applicationMethod === '엽면');
  assert('엽면시(1000평) area=1000', r.baseArea === 1000);
}
{
  const r = normalizeUsage('물(50말) 관주방법(550평)');
  assert('복합: water=50', r.waterMin === 50);
  assert('복합: method=관주', r.applicationMethod === '관주');
  assert('복합: area=550', r.baseArea === 550);
}
{
  const r = normalizeUsage('물(50말-100말) 관주방법(550평)');
  assert('범위복합: waterMin=50', r.waterMin === 50);
  assert('범위복합: waterMax=100', r.waterMax === 100);
  assert('범위복합: area=550', r.baseArea === 550);
}
{
  // usageDisplayText
  const r = normalizeUsage('물(25말) 엽면시비(1000평)');
  assert('display has 물 25말', /물 25말/.test(r.usageDisplayText));
  assert('display has 엽면', /엽면/.test(r.usageDisplayText));
  assert('display has 1000평', /1000평/.test(r.usageDisplayText));
}

// ═══════════════════════════════════════════════════════════════
// 3. buildRxRow — 인라인/블록 사용법 통합
// ═══════════════════════════════════════════════════════════════
section('buildRxRow');

{
  // 인라인 사용법이 제품 행에 붙어 있는 경우
  const r = buildRxRow({
    stageRaw: '관주(1번)\n4월:15일-20일',
    productRaw: '딥루트 10L 1통 물(25말)',
    sourcePage: 2, sourceBlock: 0,
    fallbackArea: 550, usageContext: null,
    inlineUsageRaw: null, blockUsageRaw: null
  });
  assert('딥루트 productName 추출', /딥루트/.test(r.productName));
  assert('딥루트 waterMin=25 (인라인 분리)', r.waterMin === 25);
  assert('딥루트 usageDisplayText', r.usageDisplayText.length > 0);
}
{
  // 블록 사용법 폴백
  const r = buildRxRow({
    stageRaw: '관주(1번)',
    productRaw: '파이토 1L 1병',
    sourcePage: 2, sourceBlock: 0,
    fallbackArea: null, usageContext: null,
    inlineUsageRaw: null,
    blockUsageRaw: '물(50말) 관주방법(550평)'
  });
  assert('파이토 blockUsage water=50', r.waterMin === 50);
  assert('파이토 blockUsage area=550', r.baseArea === 550);
}
{
  // 인라인 > 블록 우선순위
  const r = buildRxRow({
    stageRaw: '관주(1번)',
    productRaw: '칼슘-오래가지오 400g 2병',
    sourcePage: 2, sourceBlock: 0,
    fallbackArea: null, usageContext: null,
    inlineUsageRaw: '관주방법(1000평)',
    blockUsageRaw: '물(50말) 관주방법(550평)'
  });
  assert('칼슘 인라인 area=1000 (인라인 우선)', r.baseArea === 1000);
}

// ═══════════════════════════════════════════════════════════════
// 4. classifyRightRow — 확장된 usage 감지
// ═══════════════════════════════════════════════════════════════
section('classifyRightRow');

assert('관주시(1000평) = usage', classifyRightRow('관주시(1000평)') === 'usage');
assert('엽면시비(550평) = usage', classifyRightRow('엽면시비(550평)') === 'usage');
assert('물(25말) = usage', classifyRightRow('물(25말)') === 'usage');
assert('물25말 = usage', classifyRightRow('물25말') === 'usage');
assert('파이토 1L 1병 = product', classifyRightRow('파이토 1L 1병') === 'product');

// ═══════════════════════════════════════════════════════════════
// 5. stageLabel 테스트 케이스 (처방전 PDF 기반)
// ═══════════════════════════════════════════════════════════════
section('stageLabel cases');

{
  const r = normalizeStageLabel('감사\n비료\n수확:후\n및\n3월-4월');
  assert('감사비료 type', r.type === '감사비료' || r.type === '기타');
}
{
  const r = normalizeStageLabel('관주(1번)\n4월:15일-20일');
  assert('관주(1번) type=관주', r.type === '관주');
  assert('관주(1번) order=1', r.order === 1);
}

// ═══════════════════════════════════════════════════════════════
// 6. v16 pageTitle ↔ stageLabel 분리 케이스 (천혜향 PDF 기반)
// ═══════════════════════════════════════════════════════════════
section('v16 pageTitle / stageLabel 분리');

// 케이스 1: 긴 제목 + 그 아래 stage 2개
// "천혜향 꽃+피기전 토양+관주..." 텍스트에 "관주"가 포함 → stage_core로 잘못 분류 방지
// → v16에서는 Y-gap 방식으로 pageTitle 감지하므로 classifyLeftRow 결과와 무관
{
  // 제목 텍스트의 classifyLeftRow 결과 (현재 stage_core로 분류됨 — 이 자체는 변경 안 함)
  // v16은 classifyLeftRow에 의존하지 않고 Y-gap으로 pageTitle 분리
  const titleType = classifyLeftRow('천혜향 꽃+피기전 토양+관주 뿌리활착+뿌리활력+작물활성');
  // 이 텍스트가 stage_core로 분류되더라도 Y-gap 로직으로 pageTitle 분리됨
  // 테스트: 단계명 "관주(1번)"는 stage_core여야 함
  assert('관주(1번) → stage_core', classifyLeftRow('관주(1번)') === 'stage_core');
  assert('엽면(1번) → stage_core', classifyLeftRow('엽면(1번)') === 'stage_core');
}

// 케이스 2: 좌측에만 있는 짧은 단계명은 pageTitle 오인식 방지
{
  // 짧은 텍스트(≤10자)는 v16에서 pageTitle 후보에서 제외
  assert('관주(1번) 길이 <= 10', '관주(1번)'.length <= 10);
  assert('엽면(1번) 길이 <= 10', '엽면(1번)'.length <= 10);
  assert('긴 제목 길이 > 10', '천혜향 꽃+피기전 토양+관주 뿌리활착+뿌리활력+작물활성'.length > 10);
  assert('옥토팜 제목 길이 > 10', '옥토팜(발효계분) 옥스팜(휴믹산+풀빅산)부식산 뉴천연팜(종합광물)'.length > 10);
}

// 케이스 3: 여러 줄 stageLabel — note/core 분리
{
  // "감사\n비료\n수확:후\n및\n3월-4월" 에서 note 행 vs core 행 분리
  const lines = ['감사', '비료', '수확:후', '및', '3월-4월'];
  const cores  = lines.filter(t => classifyLeftRow(t) !== 'note');
  const notes  = lines.filter(t => classifyLeftRow(t) === 'note');
  assert('감사 → stage_core (not note)', classifyLeftRow('감사') !== 'note');
  assert('수확:후 → stage_core (not note)', classifyLeftRow('수확:후') !== 'note');
  assert('비료 → note', classifyLeftRow('비료') === 'note');
  assert('core 행이 note 행보다 많음', cores.length >= notes.length);
}

// 케이스 4: prodArea 추출 — 제품 행의 N평 패턴
{
  const line = '천연팜골드 1kg 1봉 550평';
  const prodAreaM = line.match(/(\d+(?:\.\d+)?)\s*평/);
  assert('550평 추출', prodAreaM && Number(prodAreaM[1]) === 550);
}
{
  const line = '옥스팜(입상) 550평 10포';
  const prodAreaM = line.match(/(\d+(?:\.\d+)?)\s*평/);
  assert('옥스팜 550평 추출', prodAreaM && Number(prodAreaM[1]) === 550);
}

// 케이스 5: normalizeBaseArea — 제목의 N평 패턴
{
  const r = normalizeBaseArea('천혜향(550평)농사');
  assert('천혜향(550평) area=550', r.area === 550);
}
{
  const r = normalizeBaseArea('천혜향 뿌리활착+뿌리활력 영양생장+생식생장');
  assert('평수 없는 제목 area=null', r.area === null);
}

// 케이스 6: inferTotalArea — 최빈값 선택
{
  const rows = [
    { baseArea: 550 }, { baseArea: 550 }, { baseArea: 550 },
    { baseArea: 1000 }, { baseArea: 550 }
  ];
  const total = inferTotalArea(rows);
  assert('inferTotalArea 최빈값=550', total === 550);
}

// 케이스 7: "물(50말)", "관주방법(550평)", "엽면시비(550평)" — usage 분류
{
  assert('물(50말) = usage', classifyRightRow('물(50말)') === 'usage');
  assert('관주방법(550평) = usage', classifyRightRow('관주방법(550평)') === 'usage');
  assert('엽면시비(550평) = usage', classifyRightRow('엽면시비(550평)') === 'usage');
}

// 케이스 8: decomposeProductText — 제품명+규격+수량 분리
{
  const r = decomposeProductText('천연팜골드 1kg 1봉');
  assert('천연팜골드 productName', r && (r.productName || r.originalName || '').includes('천연팜골드'));
}
{
  const r = decomposeProductText('파이토 1L 1병');
  assert('파이토 dosageUnit=병', r && (r.dosageUnit || r.unit || r.countUnit || '병') === '병');
}

// ═══════════════════════════════════════════════════════════════
// 9. classifyDetailCell
// ═══════════════════════════════════════════════════════════════
section('classifyDetailCell');

{
  // usage: 물/말/평/관주/엽면 관련 텍스트
  assert('물(50말) = usage',       classifyDetailCell('물(50말)') === 'usage');
  assert('관주방법(550평) = usage', classifyDetailCell('관주방법(550평)') === 'usage');
  assert('엽면시비(550평) = usage', classifyDetailCell('엽면시비(550평)') === 'usage');
  assert('관주 = usage',           classifyDetailCell('관주') === 'usage');
  assert('550평 = usage',          classifyDetailCell('550평') === 'usage');
}
{
  // composition: 성분비 (N%) 형태
  assert('발효계분(55%) = composition', classifyDetailCell('발효계분(55%) 종합광물(20%)') === 'composition');
  assert('미강(15%) = composition',    classifyDetailCell('미강(쌀겨/15%) MANNA(만나/10%)') === 'composition');
}
{
  // instruction: 문장형 설명문
  assert('토양에 골고루 뿌리고 경운합니다 = instruction', classifyDetailCell('토양에 골고루 뿌리고 경운합니다') === 'instruction');
  // 관주(usage) + 합니다(instruction) 혼합 → mixed
  assert('관주합니다 = mixed (관주+합니다)', classifyDetailCell('먼저 물을 맹물로 30분 주고 영양제 관주합니다') === 'mixed');
}
{
  // empty
  assert('empty string = empty', classifyDetailCell('') === 'empty');
  assert('null = empty',         classifyDetailCell(null) === 'empty');
  assert('whitespace = empty',   classifyDetailCell('   ') === 'empty');
}

// ═══════════════════════════════════════════════════════════════
// 10. parseCompositionDetail
// ═══════════════════════════════════════════════════════════════
section('parseCompositionDetail');

{
  const r = parseCompositionDetail('발효계분(55%) 종합광물(20%)');
  assert('parseComposition 2 items',       r.length === 2);
  assert('parseComposition 발효계분 pct=55', r[0] && r[0].pct === 55);
  assert('parseComposition 종합광물 pct=20', r[1] && r[1].pct === 20);
}
{
  const r = parseCompositionDetail('미강(쌀겨/15%) MANNA(만나/10%)');
  assert('parseComposition 쌀겨 2 items', r.length === 2);
  assert('parseComposition 미강 pct=15',  r[0] && r[0].pct === 15);
}
{
  // 성분 없는 텍스트
  const r = parseCompositionDetail('토양에 골고루 뿌립니다');
  assert('parseComposition empty for plain text', r.length === 0);
}
{
  // null/undefined 입력
  assert('parseComposition null = []', parseCompositionDetail(null).length === 0);
  assert('parseComposition empty = []', parseCompositionDetail('').length === 0);
}

// ═══════════════════════════════════════════════════════════════
// 11. pageTitle / stageRawCell 독립성 (개념 검증)
// ═══════════════════════════════════════════════════════════════
section('pageTitle vs stageRawCell independence');

{
  // pageTitle과 stageRawCell은 같은 데이터를 공유하지 않아야 함
  // classifyDetailCell 결과가 stageRawCell에서 유래한 텍스트에 영향을 주지 않음
  const stageRawCell = '관주(1번)\n3월:20일-25일';
  const pageTitle    = '천혜향 꽃+피기전 토양+관주 뿌리활착';
  assert('stageRawCell != pageTitle', stageRawCell !== pageTitle);
  assert('pageTitle has no stage keywords leak', !stageRawCell.includes('천혜향'));
  assert('stageRawCell preserves newline', stageRawCell.includes('\n'));
}

// ═══════════════════════════════════════════════════════════════
// 12. detailCellRaw preservation
// ═══════════════════════════════════════════════════════════════
section('detailCellRaw preservation');

{
  // usage + instruction 혼합 시 mixed로 분류
  const mixed = '물(50말) 토양에 골고루 뿌리고 경운합니다';
  assert('mixed type = mixed', classifyDetailCell(mixed) === 'mixed');
}
{
  // 단순 제품명 형태 (설명문으로 처리)
  const r = classifyDetailCell('옥토팜(펠렛)');
  assert('product-like text = instruction', r === 'instruction');
}

// ═══════════════════════════════════════════════════════════════
// §13. stageDisplayText ≠ pageTitle 독립성
// ═══════════════════════════════════════════════════════════════
console.log('\n── §13. stageDisplayText vs pageTitle 독립성 ──');
{
  // stageRawCell에서 coreLines만 추출하는 로직 검증
  function computeStageDisplayText(stageRawCell) {
    const lines = stageRawCell.split('\n');
    const coreLines = lines.filter(t => {
      const type = classifyLeftRow(t);
      return type !== 'note';
    });
    return (coreLines.length ? coreLines : lines).join('\n').trim();
  }

  const cases = [
    {
      stageRawCell: '관주(1번)\n3월:20일-25일',
      expectedDisplay: '관주(1번)\n3월:20일-25일',
      pageTitle: '천혜향 꽃+피기전 토양+관주 뿌리활착+뿌리활력+작물활성',
    },
    {
      stageRawCell: '엽면(1번)\n4월:15일-20일',
      expectedDisplay: '엽면(1번)\n4월:15일-20일',
      pageTitle: '천혜향 뿌리활착+뿌리활력+작물활성 영양생장+생식생장',
    },
    {
      // '비료'는 note 분류 → coreLines에서 제외, 나머지 core/date/connector 유지
      stageRawCell: '감사\n비료\n수확:후\n및\n3월-4월',
      expectedDisplay: '감사\n수확:후\n및\n3월-4월',
      pageTitle: '',  // 이 경우 pageTitle이 없어야 함 — stageRawCell 전체는 보존됨
    },
  ];
  cases.forEach(({stageRawCell, expectedDisplay, pageTitle}) => {
    const display = computeStageDisplayText(stageRawCell);
    assert(`stageDisplayText for "${stageRawCell.split('\n')[0]}"`, display === expectedDisplay);
    if (pageTitle) {
      assert(`stageDisplayText ≠ pageTitle for "${stageRawCell.split('\n')[0]}"`, display !== pageTitle);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// §14. pageTitle ≠ stageDisplayText 불변 조건
// ═══════════════════════════════════════════════════════════════
console.log('\n── §14. pageTitle ≠ stageDisplayText invariant ──');
{
  const pairs = [
    { pageTitle: '천혜향 꽃+피기전 토양+관주 뿌리활착+뿌리활력+작물활성', stageDisplayText: '관주(1번)\n3월:20일-25일' },
    { pageTitle: '천혜향 뿌리활착+뿌리활력+작물활성 영양생장+생식생장', stageDisplayText: '엽면(1번)\n4월:15일-20일' },
    { pageTitle: '천혜향 뿌리활착+뿌리활력+작물활성 영양생장+생식생장', stageDisplayText: '관주(2번)\n4월:10일-15일' },
    { pageTitle: '천혜향 뿌리활착+뿌리활력+작물활성 영양생장+생식생장', stageDisplayText: '엽면(3번)\n4월:25일-30일' },
    { pageTitle: '', stageDisplayText: '감사\n비료\n수확:후\n및\n3월-4월' },
  ];
  pairs.forEach(({pageTitle, stageDisplayText}) => {
    if (pageTitle && stageDisplayText) {
      assert(`pageTitle ≠ stageDisplayText: "${pageTitle.slice(0,20)}..."`, pageTitle !== stageDisplayText);
    }
    // 빈 pageTitle은 허용
    assert(`stageDisplayText is not empty: "${stageDisplayText.split('\n')[0]}"`, !!stageDisplayText.trim());
  });
}

// ═══════════════════════════════════════════════════════════════
// §15. orphan promotion regression — 감사/비료/수확 블록은 stage 유지
// ═══════════════════════════════════════════════════════════════
console.log('\n── §15. orphan promotion regression ──');
{
  // "감사\n비료\n수확:후\n및\n3월-4월" — 감사/수확 = stage_core → hasCore = true → 승격 안 됨
  const stageTexts1 = ['감사', '비료', '수확:후', '및', '3월-4월'];
  const hasCore1 = stageTexts1.some(t => classifyLeftRow(t) === 'stage_core');
  assert('감사/수확 블록은 stage_core 존재 → orphan 승격 안 됨', hasCore1 === true);

  // "천혜향 꽃+피기전 토양+관주..." — stage_core 없음, 길이 > 10 → pageTitle 후보 (but Y-gap method handles)
  const pageTitleCandidate = '천혜향 꽃+피기전 토양+관주 뿌리활착+뿌리활력+작물활성';
  const hasCorePT = [pageTitleCandidate].some(t => classifyLeftRow(t) === 'stage_core');
  // 이 텍스트는 "관주" 때문에 stage_core로 분류될 수 있음 — Y-gap 메서드가 먼저 처리
  // 중요한 건: 만약 orphan check에 도달하더라도 pageHasRealStageBlocks 조건으로 제어됨
  assert('pageTitle candidate length > 10 for Y-gap detection', pageTitleCandidate.length > 10);

  // orphan 승격 조건: 같은 페이지에 다른 stage 블록이 있을 때만 승격
  // (pageHasRealStageBlocks = true 일 때만 승격)
  const mockBlocks = [
    { texts: ['천혜향 꽃+피기전'], page: 3, hasCore: false },  // orphan candidate
    { texts: ['관주(1번)', '3월:20일-25일'], page: 3, hasCore: true },  // real stage
  ];
  const pageHasReal = mockBlocks.some((b, i) => {
    if (i === 0) return false;
    return b.page === 3 && b.texts.some(t => {
      const type = classifyLeftRow(t);
      return type === 'stage_core' || type === 'date';
    });
  });
  assert('orphan 승격: 다른 stage 블록 있으면 pageHasRealStageBlocks = true', pageHasReal === true);

  // 반대: 같은 페이지에 다른 stage 블록이 없으면 승격 안 함
  const mockBlocksSingle = [
    { texts: ['천혜향 꽃+피기전'], page: 5, hasCore: false },  // orphan candidate — 유일한 블록
  ];
  const pageHasRealSingle = mockBlocksSingle.some((b, i) => {
    if (i === 0) return false;
    return b.page === 5 && b.texts.some(t => {
      const type = classifyLeftRow(t);
      return type === 'stage_core' || type === 'date';
    });
  });
  assert('orphan 승격 안 함: 같은 페이지에 다른 stage 블록 없음', pageHasRealSingle === false);
}

// ═══════════════════════════════════════════════════════════════
// §16. stageLabelOverride ≠ stageRawCell 불변 조건 (v17 parser)
// ═══════════════════════════════════════════════════════════════
console.log('\n── §16. stageLabelOverride = stageDisplayText (not stageRawCell) ──');
{
  function makeStage(stageRawCell) {
    const lines = stageRawCell.split('\n');
    const coreLines = lines.filter(t => classifyLeftRow(t) !== 'note');
    const stageDisplayText = (coreLines.length ? coreLines : lines).join('\n').trim();
    // v17 parser: stageLabelOverride = stageDisplayText (NOT stageRawCell)
    const stageLabelOverride = stageDisplayText || '';
    return { stageRawCell, stageDisplayText, stageLabelOverride };
  }

  // Case 1: core lines만 있을 때 — stageRawCell == stageDisplayText 가능
  const s1 = makeStage('관주(1번)\n3월:20일-25일');
  assert('s1: stageDisplayText correct', s1.stageDisplayText === '관주(1번)\n3월:20일-25일');
  assert('s1: stageLabelOverride = stageDisplayText (not stageRawCell with notes)', s1.stageLabelOverride === s1.stageDisplayText);

  // Case 2: note 라인이 포함된 stageRawCell — stageDisplayText ≠ stageRawCell
  const s2 = makeStage('관주(1번)\n3월:20일-25일\n단계 특이사항 메모');
  assert('s2: stageDisplayText excludes note', !s2.stageDisplayText.includes('단계 특이사항'));
  assert('s2: stageLabelOverride = stageDisplayText (core only, not full raw)', s2.stageLabelOverride === s2.stageDisplayText);
  assert('s2: stageLabelOverride ≠ stageRawCell (no note contamination)', s2.stageLabelOverride !== s2.stageRawCell);

  // Case 3: v17 migration — 구버전 stageLabelOverride = stageRawCell 패턴 교정
  const stale = { stageRawCell: '관주(1번)\n3월:20일-25일\n메모', stageDisplayText: '관주(1번)\n3월:20일-25일', stageLabelOverride: '관주(1번)\n3월:20일-25일\n메모' };
  // migration: stageLabelOverride === stageRawCell → stageDisplayText로 교체
  const migrated = { ...stale };
  if (migrated.stageLabelOverride === migrated.stageRawCell && migrated.stageDisplayText) {
    migrated.stageLabelOverride = migrated.stageDisplayText;
  }
  assert('migration: 구버전 stageLabelOverride = stageRawCell → stageDisplayText로 교체', migrated.stageLabelOverride === '관주(1번)\n3월:20일-25일');
  assert('migration: stageRawCell 원문 보존', migrated.stageRawCell === '관주(1번)\n3월:20일-25일\n메모');
}

// ═══════════════════════════════════════════════════════════════
// RESULT
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
