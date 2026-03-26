/**
 * rxCompare.test.js
 * Unit tests for rxCompare.js pure comparison logic
 * Run: node rxCompare.test.js
 */

const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(__dirname + '/rxCompare.js', 'utf-8');
const ctx = vm.createContext({ console, module: {}, exports: {}, window: {} });
vm.runInContext(code, ctx);

// Extract exported functions from context
const { normalizeForMatch, fuzzyMatch, buildDiffRows, calcCartPricePerPyeong, extractRxItems } = ctx;

let passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${desc}`); }
}
function section(name) { console.log(`\n-- ${name} --`); }

// =============================================================================
// 1. normalizeForMatch
// =============================================================================
section('normalizeForMatch');

assert("normalizeForMatch('옥토팜 (발효계분)') === '옥토팜발효계분'",
  normalizeForMatch('옥토팜 (발효계분)') === '옥토팜발효계분');

assert("normalizeForMatch('  미생물 골드 3호  ') === '미생물골드3호'",
  normalizeForMatch('  미생물 골드 3호  ') === '미생물골드3호');

assert("normalizeForMatch('') === ''",
  normalizeForMatch('') === '');

assert("normalizeForMatch(null) === ''",
  normalizeForMatch(null) === '');

assert("normalizeForMatch(undefined) === ''",
  normalizeForMatch(undefined) === '');

assert("normalizeForMatch('옥토팜(발효계분)') === '옥토팜발효계분'",
  normalizeForMatch('옥토팜(발효계분)') === '옥토팜발효계분');

// =============================================================================
// 2. fuzzyMatch
// =============================================================================
section('fuzzyMatch');

assert("fuzzyMatch('옥토팜발효계분', '옥토팜(발효계분)') === true (contains after normalize)",
  fuzzyMatch('옥토팜발효계분', '옥토팜(발효계분)') === true);

assert("fuzzyMatch('미생물골드', '칼슘비료') === false",
  fuzzyMatch('미생물골드', '칼슘비료') === false);

assert("fuzzyMatch('옥토팜', '옥토팜발효계분') === true (shorter included in longer)",
  fuzzyMatch('옥토팜', '옥토팜발효계분') === true);

assert("fuzzyMatch('', 'anything') === false",
  fuzzyMatch('', 'anything') === false);

assert("fuzzyMatch('anything', '') === false",
  fuzzyMatch('anything', '') === false);

assert("fuzzyMatch('미생물골드3호', '미생물골드') === true",
  fuzzyMatch('미생물골드3호', '미생물골드') === true);

// =============================================================================
// 3. buildDiffRows
// =============================================================================
section('buildDiffRows — match status');

{
  const rxItems = [{ name: '옥토팜', rawName: '옥토팜', qty: 2 }];
  const cartItems = [{ name: '옥토팜', qty: 2, sp: 5000 }];
  const rows = buildDiffRows(rxItems, cartItems);
  assert('identical items returns 1 row', rows.length === 1);
  assert('status is match', rows[0].status === 'match');
  assert('rxQty === 2', rows[0].rxQty === 2);
  assert('cartQty === 2', rows[0].cartQty === 2);
}

section('buildDiffRows — qty-diff status');

{
  const rxItems = [{ name: '미생물골드', rawName: '미생물 골드', qty: 3 }];
  const cartItems = [{ name: '미생물골드', qty: 5, sp: 3000 }];
  const rows = buildDiffRows(rxItems, cartItems);
  assert('qty-diff: 1 row returned', rows.length === 1);
  assert('status is qty-diff', rows[0].status === 'qty-diff');
  assert('diff === -2 (3 - 5)', rows[0].diff === -2);
}

section('buildDiffRows — rx-only status');

{
  const rxItems = [{ name: '칼슘비료', rawName: '칼슘 비료', qty: 1 }];
  const cartItems = [];
  const rows = buildDiffRows(rxItems, cartItems);
  assert('rx-only: 1 row returned', rows.length === 1);
  assert('status is rx-only', rows[0].status === 'rx-only');
  assert('cartName is null', rows[0].cartName === null);
}

section('buildDiffRows — cart-only status');

{
  const rxItems = [];
  const cartItems = [{ name: '뉴천연팜', qty: 2, sp: 8000 }];
  const rows = buildDiffRows(rxItems, cartItems);
  assert('cart-only: 1 row returned', rows.length === 1);
  assert('status is cart-only', rows[0].status === 'cart-only');
  assert('rxName is null', rows[0].rxName === null);
  assert('cartAmount === 16000', rows[0].cartAmount === 16000);
}

section('buildDiffRows — no matching name returns unmatched');

{
  const rxItems = [{ name: '완전다른제품', rawName: '완전 다른 제품', qty: 1 }];
  const cartItems = [{ name: '전혀무관제품', qty: 1, sp: 1000 }];
  const rows = buildDiffRows(rxItems, cartItems);
  assert('unmatched: 2 rows (rx-only + cart-only)', rows.length === 2);
  const statuses = rows.map(r => r.status);
  assert('contains rx-only', statuses.includes('rx-only'));
  assert('contains cart-only', statuses.includes('cart-only'));
}

section('buildDiffRows — 1:1 greedy matching prevents duplicates');

{
  // '옥토팜발효계분' is more specific than '옥토팜' — should match '옥토팜발효계분' first
  const rxItems = [
    { name: '옥토팜발효계분', rawName: '옥토팜 (발효계분)', qty: 2 },
    { name: '옥토팜', rawName: '옥토팜', qty: 1 },
  ];
  const cartItems = [
    { name: '옥토팜(발효계분)', qty: 2, sp: 5000 },
    { name: '옥토팜특별', qty: 1, sp: 6000 },
  ];
  const rows = buildDiffRows(rxItems, cartItems);
  assert('greedy: 2 rows total', rows.length === 2);
  // Both should match (not left as rx-only due to duplicate match issue)
  const matchOrDiff = rows.filter(r => r.status === 'match' || r.status === 'qty-diff');
  assert('both rx items matched (no duplicate claims)', matchOrDiff.length === 2);
}

section('buildDiffRows — zero tolerance on qty diff (D-11)');

{
  const rxItems = [{ name: '비료A', rawName: '비료A', qty: 5 }];
  const cartItems = [{ name: '비료A', qty: 6, sp: 1000 }];
  const rows = buildDiffRows(rxItems, cartItems);
  assert('1 unit diff is qty-diff (zero tolerance)', rows[0].status === 'qty-diff');
}

// =============================================================================
// 4. calcCartPricePerPyeong
// =============================================================================
section('calcCartPricePerPyeong');

assert('calcCartPricePerPyeong([{sp:1000,qty:2},{sp:500,qty:3}], 10) === 350',
  calcCartPricePerPyeong([{ sp: 1000, qty: 2 }, { sp: 500, qty: 3 }], 10) === 350);

assert('calcCartPricePerPyeong([], 10) === 0',
  calcCartPricePerPyeong([], 10) === 0);

assert('calcCartPricePerPyeong(cart, 0) === null',
  calcCartPricePerPyeong([{ sp: 1000, qty: 1 }], 0) === null);

assert('calcCartPricePerPyeong(cart, null) === null',
  calcCartPricePerPyeong([{ sp: 1000, qty: 1 }], null) === null);

assert('calcCartPricePerPyeong(cart, -1) === null',
  calcCartPricePerPyeong([{ sp: 1000, qty: 1 }], -1) === null);

// =============================================================================
// 5. extractRxItems
// =============================================================================
section('extractRxItems');

{
  const pJson = {
    farmInfo: { totalArea: 1000, farmName: '테스트농원', cropName: '수박' },
    rxRows: [
      { productName: '옥토팜', productRaw: '옥토팜 원문', dosageQty: 2, baseArea: 500 },
      { productName: '미생물골드', productRaw: '미생물골드 원문', dosageQty: 1, baseArea: 1000 },
      { productName: '', dosageQty: 2, baseArea: 500 },     // no productName — should be filtered
      { productName: '홍보용', dosageQty: 0, baseArea: 500 }, // dosageQty <= 0 — should be filtered
    ]
  };
  const items = extractRxItems(pJson);
  assert('extractRxItems filters rows with no productName or dosageQty<=0', items.length === 2);
  assert('first item name is 옥토팜', items[0].name === '옥토팜');
  assert('first item rawName is preserved', items[0].rawName === '옥토팜 원문');
  // calcRequiredQty(1000, 500, 2) = Math.ceil((1000/500)*2) = 4
  assert('finalQty uses calcRequiredQty logic: ceil(1000/500)*2 = 4', items[0].qty === 4);
  // calcRequiredQty(1000, 1000, 1) = 1
  assert('second item qty = 1 (area same as base)', items[1].qty === 1);
}

{
  // totalArea null — falls back to dosageQty
  const pJson = {
    farmInfo: { totalArea: null },
    rxRows: [
      { productName: '칼슘비료', productRaw: '칼슘 비료', dosageQty: 3, baseArea: 500 },
    ]
  };
  const items = extractRxItems(pJson);
  assert('null totalArea: qty falls back to dosageQty', items[0].qty === 3);
}

// =============================================================================
// Summary
// =============================================================================
console.log(`\n=============================`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log(`=============================`);
if (failed > 0) process.exit(1);
