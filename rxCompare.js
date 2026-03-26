/**
 * rxCompare.js
 * Pure comparison logic: fuzzy string matching, diff row classification, price-per-pyeong calculation
 * No DOM dependencies — fully testable in Node.js via vm.runInContext
 *
 * Exports (browser): window.RxCompare = { normalizeForMatch, fuzzyMatch, buildDiffRows, calcCartPricePerPyeong, extractRxItems }
 * Exports (Node vm context): bare function declarations hoisted to ctx object
 *
 * Usage (browser): window.RxCompare.buildDiffRows(rxItems, cartItems)
 * Usage (test):    const { buildDiffRows } = ctx;  // after vm.runInContext
 */

/* eslint-disable no-unused-vars */

/**
 * Normalize a product name for fuzzy matching.
 * Strips whitespace, parentheses, and special characters; lowercases.
 * Preserves Korean (가-힣), English letters, and digits.
 *
 * @param {string|null|undefined} str
 * @returns {string}
 */
function normalizeForMatch(str) {
  return (str || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
}

/**
 * Fuzzy match two product names using bidirectional substring containment.
 * Both names are normalized before comparison.
 * Returns true if either normalized name contains the other.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function fuzzyMatch(a, b) {
  var na = normalizeForMatch(a);
  var nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Inline calcRequiredQty to avoid dependency on prescriptionModel.js in test/browser context.
 * Mirrors prescriptionModel.js calcRequiredQty exactly.
 *
 * @param {number|null} totalArea
 * @param {number|null} baseArea
 * @param {number} baseQty
 * @returns {number}
 */
function _calcRequiredQty(totalArea, baseArea, baseQty) {
  if (!baseArea || !totalArea) return baseQty;
  return Math.ceil((totalArea / baseArea) * baseQty);
}

/**
 * Extract comparison items from a prescriptionJSON object.
 * Filters out rows with no productName or dosageQty <= 0.
 * Calculates finalQty using inline calcRequiredQty logic.
 *
 * @param {Object} prescriptionJSON
 * @param {Object} prescriptionJSON.farmInfo
 * @param {number|null} prescriptionJSON.farmInfo.totalArea
 * @param {Array} prescriptionJSON.rxRows
 * @returns {Array<{name: string, rawName: string, qty: number, baseQty: number, baseArea: number}>}
 */
function extractRxItems(prescriptionJSON) {
  var totalArea = (prescriptionJSON.farmInfo && prescriptionJSON.farmInfo.totalArea) || null;
  var rows = prescriptionJSON.rxRows || [];
  return rows
    .filter(function(r) {
      return r.productName && ((r.dosageQty || 0) > 0 || (r.baseQty || 0) > 0);
    })
    .map(function(r) {
      var baseQty = r.dosageQty || r.baseQty || 0;
      return {
        name:     r.productName,
        rawName:  r.productRaw || r.originalText || '',
        qty:      _calcRequiredQty(totalArea, r.baseArea, baseQty),
        baseQty:  baseQty,
        baseArea: r.baseArea,
      };
    });
}

/**
 * Build diff rows by comparing prescription items (rxItems) with cart items (cartItems).
 *
 * Uses 1:1 greedy matching:
 *   1. Sort rxItems by normalized name length DESC (more specific names matched first).
 *   2. For each rxItem, find the best (longest-normalized-name) unmatched cart item.
 *   3. Unmatched rxItems get status 'rx-only'; unmatched cartItems get 'cart-only'.
 *
 * Row status values:
 *   'match'     — fuzzy name match + exact qty equality (D-11: zero tolerance)
 *   'qty-diff'  — fuzzy name match but qty differs
 *   'rx-only'   — rxItem has no matching cartItem
 *   'cart-only' — cartItem has no matching rxItem
 *
 * @param {Array<{name: string, rawName: string, qty: number}>} rxItems
 * @param {Array<{name: string, qty: number, sp: number}>} cartItems
 * @returns {Array<Object>}
 */
function buildDiffRows(rxItems, cartItems) {
  // Sort rx items: longer normalized name first (more specific = matched first)
  var rxSorted = rxItems.slice().sort(function(a, b) {
    return normalizeForMatch(b.name).length - normalizeForMatch(a.name).length;
  });

  var cartUsed = [];
  var rows = [];

  // Pass 1: match each rx item to best available cart item
  for (var ri = 0; ri < rxSorted.length; ri++) {
    var rx = rxSorted[ri];
    var bestIdx = -1;
    var bestLen = 0;

    for (var ci = 0; ci < cartItems.length; ci++) {
      if (cartUsed.indexOf(ci) !== -1) continue;
      if (fuzzyMatch(rx.name, cartItems[ci].name)) {
        var len = normalizeForMatch(cartItems[ci].name).length;
        if (len > bestLen) {
          bestLen = len;
          bestIdx = ci;
        }
      }
    }

    if (bestIdx >= 0) {
      cartUsed.push(bestIdx);
      var cartItem = cartItems[bestIdx];
      var status = (rx.qty === cartItem.qty) ? 'match' : 'qty-diff';
      rows.push({
        status:      status,
        rxName:      rx.rawName || rx.name,
        rxQty:       rx.qty,
        cartName:    cartItem.name,
        cartQty:     cartItem.qty,
        cartAmount:  (cartItem.sp || 0) * (cartItem.qty || 0),
        diff:        rx.qty - cartItem.qty,
      });
    } else {
      rows.push({
        status:     'rx-only',
        rxName:     rx.rawName || rx.name,
        rxQty:      rx.qty,
        cartName:   null,
        cartQty:    null,
        cartAmount: null,
        diff:       null,
      });
    }
  }

  // Pass 2: remaining cart items not matched = cart-only
  for (var ci2 = 0; ci2 < cartItems.length; ci2++) {
    if (cartUsed.indexOf(ci2) !== -1) continue;
    var ci2Item = cartItems[ci2];
    rows.push({
      status:     'cart-only',
      rxName:     null,
      rxQty:      null,
      cartName:   ci2Item.name,
      cartQty:    ci2Item.qty,
      cartAmount: (ci2Item.sp || 0) * (ci2Item.qty || 0),
      diff:       null,
    });
  }

  return rows;
}

/**
 * Calculate the price-per-pyeong for the current cart.
 * Returns rounded integer: sum(sp * qty) / area
 * Returns null if area is falsy or <= 0.
 *
 * @param {Array<{sp: number, qty: number}>} cartItems
 * @param {number|null} area  — total area in pyeong
 * @returns {number|null}
 */
function calcCartPricePerPyeong(cartItems, area) {
  if (!area || area <= 0) return null;
  var total = cartItems.reduce(function(sum, item) {
    return sum + (item.sp || 0) * (item.qty || 0);
  }, 0);
  return Math.round(total / area);
}

// Expose to browser (window namespace) and vm test context
if (typeof window !== 'undefined') {
  window.RxCompare = {
    normalizeForMatch:      normalizeForMatch,
    fuzzyMatch:             fuzzyMatch,
    buildDiffRows:          buildDiffRows,
    calcCartPricePerPyeong: calcCartPricePerPyeong,
    extractRxItems:         extractRxItems,
  };
}
