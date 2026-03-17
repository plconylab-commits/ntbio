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
  buildRxRow,
  decomposeProductText,
  normalizeStageLabel,
} = ctx;

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
// RESULT
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
