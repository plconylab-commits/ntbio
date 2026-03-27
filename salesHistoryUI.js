/**
 * salesHistoryUI.js — 매출 집계 오버레이 + 고객별 요약 배지
 * Phase 04-02: 매출 집계 UI + 고객별 요약 UI
 */
(function() {
  'use strict';

  // ── 1. CSS 주입 ──────────────────────────────────────────────────────────
  function _injectSalesCSS() {
    if (document.getElementById('sales-css')) return;
    var style = document.createElement('style');
    style.id = 'sales-css';
    style.textContent = [
      '.sales-overlay {',
      '  position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9000;',
      '  display:none; align-items:center; justify-content:center;',
      '}',
      '.sales-overlay.on { display:flex; }',
      '.sales-panel {',
      '  background:#fff; max-width:480px; width:90%; max-height:80vh;',
      '  overflow-y:auto; border-radius:14px; padding:24px; position:relative;',
      '  box-shadow:0 8px 32px rgba(0,0,0,.2);',
      '}',
      '.sales-panel h3 { font-size:18px; font-weight:700; margin-bottom:16px; }',
      '.sales-period-btns { display:flex; gap:8px; flex-wrap:wrap; }',
      '.sales-period-btn {',
      '  padding:8px 16px; border-radius:7px; border:1.5px solid var(--border);',
      '  cursor:pointer; font-weight:600; font-family:inherit; font-size:13px;',
      '  background:#fff; color:var(--text); transition:all .15s;',
      '}',
      '.sales-period-btn.active {',
      '  background:var(--g-btn); color:#fff; border-color:var(--g-btn);',
      '}',
      '.sales-stat-card {',
      '  display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:16px 0;',
      '}',
      '.sales-stat-item {',
      '  text-align:center; padding:12px; background:#f5f5f5; border-radius:8px;',
      '}',
      '.sales-stat-label { font-size:12px; color:var(--muted); }',
      '.sales-stat-value { font-size:18px; font-weight:700; margin-top:4px; }',
      '.sales-stat-value.unpaid { color:#C62828; }',
      '.sales-date-range {',
      '  display:none; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;',
      '}',
      '.sales-date-range.on { display:flex; }',
      '.sales-date-range input[type="date"] {',
      '  padding:7px 10px; border:1.5px solid var(--border); border-radius:7px;',
      '  font-family:inherit; font-size:13px; flex:1; min-width:120px;',
      '}',
      '.sales-date-range .sales-query-btn {',
      '  padding:8px 14px; background:var(--g-btn); color:#fff; border:none;',
      '  border-radius:7px; font-family:inherit; font-size:13px; font-weight:700;',
      '  cursor:pointer;',
      '}',
      '.sales-close-btn {',
      '  position:absolute; top:12px; right:16px; background:none; border:none;',
      '  font-size:22px; cursor:pointer; color:var(--muted); line-height:1;',
      '}',
      '.cust-sales-badge {',
      '  display:none; font-size:12px; margin-top:4px; padding:4px 10px;',
      '  background:#FFF3E0; border-radius:5px; color:#E65100; font-weight:600;',
      '  width:100%;',
      '}',
      '.cust-sales-badge.has-unpaid { background:#FFEBEE; color:#C62828; }',
      '.cust-summary-overlay {',
      '  position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9001;',
      '  display:none; align-items:center; justify-content:center;',
      '}',
      '.cust-summary-overlay.on { display:flex; }',
      '.cust-summary-panel {',
      '  background:#fff; max-width:560px; width:92%; max-height:82vh;',
      '  overflow-y:auto; border-radius:14px; padding:24px; position:relative;',
      '  box-shadow:0 8px 32px rgba(0,0,0,.2);',
      '}',
      '.cust-summary-panel h3 { font-size:18px; font-weight:700; margin-bottom:16px; }',
      '.cust-summary-table { width:100%; border-collapse:collapse; font-size:13px; }',
      '.cust-summary-table th {',
      '  text-align:left; padding:6px 8px; border-bottom:2px solid var(--border);',
      '  font-weight:700; color:var(--muted); font-size:12px;',
      '}',
      '.cust-summary-table td { padding:7px 8px; border-bottom:1px solid #f0f0f0; }',
      '.cust-summary-table tr:last-child td { border-bottom:none; }',
      '.cust-summary-unpaid { color:#C62828; font-weight:700; }',
      '.cust-summary-empty { text-align:center; color:var(--muted); padding:32px 0; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── 2. 기간 계산 유틸 ────────────────────────────────────────────────────
  function _dateStr(d) {
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + dd;
  }

  function _thisMonthRange() {
    var now = new Date();
    var from = new Date(now.getFullYear(), now.getMonth(), 1);
    var to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: _dateStr(from), to: _dateStr(to) };
  }

  function _lastMonthRange() {
    var now = new Date();
    var from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var to   = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: _dateStr(from), to: _dateStr(to) };
  }

  function _thisQuarterRange() {
    var now = new Date();
    var q = Math.floor(now.getMonth() / 3);
    var from = new Date(now.getFullYear(), q * 3, 1);
    var to   = new Date(now.getFullYear(), q * 3 + 3, 0);
    return { from: _dateStr(from), to: _dateStr(to) };
  }

  function _lastQuarterRange() {
    var now = new Date();
    var q = Math.floor(now.getMonth() / 3);
    var lastQ = q - 1;
    var year = now.getFullYear();
    if (lastQ < 0) { lastQ = 3; year -= 1; }
    var from = new Date(year, lastQ * 3, 1);
    var to   = new Date(year, lastQ * 3 + 3, 0);
    return { from: _dateStr(from), to: _dateStr(to) };
  }

  // ── 3. 매출 집계 오버레이 ────────────────────────────────────────────────
  function _calcPeriodSales(dateFrom, dateTo) {
    var history = (typeof getInvoiceHistory === 'function') ? getInvoiceHistory() : [];
    var filtered = history.filter(function(h) {
      if (h.status === '삭제됨') return false;
      var date = h.savedAt ? h.savedAt.slice(0, 10) : '';
      return date >= dateFrom && date <= dateTo;
    });
    var count = filtered.length;
    var total = 0;
    var paid  = 0;
    filtered.forEach(function(h) {
      var grandTotal = (h.totals && h.totals.grandTotal) ? h.totals.grandTotal : 0;
      var paidAmt    = h.paidAmount || 0;
      total += grandTotal;
      paid  += paidAmt;
    });
    return {
      count:    count,
      total:    total,
      paid:     paid,
      unpaid:   total - paid,
      invoices: filtered
    };
  }

  var _overlay = null;
  var _statCard = null;
  var _dateRangeEl = null;
  var _dateFromInput = null;
  var _dateToInput = null;
  var _activePeriod = 'this';

  function _createSalesOverlay() {
    if (document.getElementById('salesOverlay')) {
      _overlay     = document.getElementById('salesOverlay');
      _statCard    = document.getElementById('salesStatCard');
      _dateRangeEl = document.getElementById('salesDateRange');
      _dateFromInput = document.getElementById('salesDateFrom');
      _dateToInput   = document.getElementById('salesDateTo');
      return;
    }

    _overlay = document.createElement('div');
    _overlay.id = 'salesOverlay';
    _overlay.className = 'sales-overlay';
    _overlay.innerHTML = [
      '<div class="sales-panel">',
      '  <button class="sales-close-btn" id="salesCloseBtn">✕</button>',
      '  <h3>매출 집계</h3>',
      '  <div class="sales-period-btns">',
      '    <button class="sales-period-btn active" data-period="this">이번 달</button>',
      '    <button class="sales-period-btn" data-period="last">지난 달</button>',
      '    <button class="sales-period-btn" data-period="custom">직접 입력</button>',
      '    <button class="sales-period-btn" data-period="thisQ">이번 분기</button>',
      '    <button class="sales-period-btn" data-period="lastQ">지난 분기</button>',
      '  </div>',
      '  <div class="sales-date-range" id="salesDateRange">',
      '    <input type="date" id="salesDateFrom">',
      '    <span>~</span>',
      '    <input type="date" id="salesDateTo">',
      '    <button class="sales-query-btn" id="salesQueryBtn">조회</button>',
      '  </div>',
      '  <div class="sales-stat-card" id="salesStatCard">',
      '    <div class="sales-stat-item">',
      '      <div class="sales-stat-label">거래 건수</div>',
      '      <div class="sales-stat-value" id="salesCount">-</div>',
      '    </div>',
      '    <div class="sales-stat-item">',
      '      <div class="sales-stat-label">총 매출</div>',
      '      <div class="sales-stat-value" id="salesTotal">-</div>',
      '    </div>',
      '    <div class="sales-stat-item">',
      '      <div class="sales-stat-label">입금액</div>',
      '      <div class="sales-stat-value" id="salesPaid">-</div>',
      '    </div>',
      '    <div class="sales-stat-item">',
      '      <div class="sales-stat-label">미수금</div>',
      '      <div class="sales-stat-value unpaid" id="salesUnpaid">-</div>',
      '      <a id="salesUnpaidLink" href="#" style="display:none;font-size:11px;color:#C62828;text-decoration:underline;margin-top:2px;">전체 목록 보기 →</a>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(_overlay);

    _statCard      = document.getElementById('salesStatCard');
    _dateRangeEl   = document.getElementById('salesDateRange');
    _dateFromInput = document.getElementById('salesDateFrom');
    _dateToInput   = document.getElementById('salesDateTo');

    // 오버레이 배경 클릭 닫기
    _overlay.addEventListener('click', function(e) {
      if (e.target === _overlay) _closeSalesPanel();
    });

    // 닫기 버튼
    document.getElementById('salesCloseBtn').addEventListener('click', _closeSalesPanel);

    // 기간 버튼
    _overlay.querySelectorAll('.sales-period-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _overlay.querySelectorAll('.sales-period-btn').forEach(function(b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        _activePeriod = btn.getAttribute('data-period');

        if (_activePeriod === 'custom') {
          _dateRangeEl.classList.add('on');
        } else {
          _dateRangeEl.classList.remove('on');
          var range;
          if (_activePeriod === 'this')       range = _thisMonthRange();
          else if (_activePeriod === 'last')  range = _lastMonthRange();
          else if (_activePeriod === 'thisQ') range = _thisQuarterRange();
          else if (_activePeriod === 'lastQ') range = _lastQuarterRange();
          if (range) _renderSalesStats(range.from, range.to);
        }
      });
    });

    // 직접 입력 조회 버튼
    document.getElementById('salesQueryBtn').addEventListener('click', function() {
      var from = _dateFromInput.value;
      var to   = _dateToInput.value;
      if (!from || !to) { return; }
      if (from > to) { from = [to, to = from][0]; } // swap
      _renderSalesStats(from, to);
    });
  }

  function _fmt(n) {
    return (typeof comma === 'function') ? comma(n) : String(n);
  }

  function _renderSalesStats(dateFrom, dateTo) {
    var result = _calcPeriodSales(dateFrom, dateTo);
    document.getElementById('salesCount').textContent  = result.count + '건';
    document.getElementById('salesTotal').textContent  = _fmt(result.total) + '원';
    document.getElementById('salesPaid').textContent   = _fmt(result.paid) + '원';
    document.getElementById('salesUnpaid').textContent = _fmt(result.unpaid) + '원';
    var unpaidLink = document.getElementById('salesUnpaidLink');
    if (unpaidLink) {
      if (result.unpaid > 0) {
        unpaidLink.style.display = 'block';
        unpaidLink.onclick = function(e) {
          e.preventDefault();
          _closeSalesPanel();
          if (typeof openAllUnpaid === 'function') openAllUnpaid();
        };
      } else {
        unpaidLink.style.display = 'none';
      }
    }
  }

  function openSalesPanel() {
    _createSalesOverlay();
    // 이번 달 기본 선택 초기화
    _overlay.querySelectorAll('.sales-period-btn').forEach(function(b) {
      b.classList.remove('active');
    });
    var thisBtn = _overlay.querySelector('[data-period="this"]');
    if (thisBtn) thisBtn.classList.add('active');
    _dateRangeEl.classList.remove('on');
    _activePeriod = 'this';
    var range = _thisMonthRange();
    _renderSalesStats(range.from, range.to);
    _overlay.classList.add('on');
  }

  function _closeSalesPanel() {
    if (_overlay) _overlay.classList.remove('on');
  }

  function _buildCustomerAggregates() {
    var history = (typeof getInvoiceHistory === 'function') ? getInvoiceHistory() : [];
    var fmtKey = (typeof customerKey === 'function')
      ? customerKey
      : function(n, p) { return (n.trim() + '|' + p.replace(/\D/g, '')).toLowerCase(); };
    var map = {};
    history.forEach(function(h) {
      if (h.status === '삭제됨') return;
      var key = fmtKey(h.customer.name, h.customer.phone);
      if (!map[key]) {
        map[key] = {
          name: h.customer.name,
          phone: h.customer.phone,
          region: h.customer.region || '',
          count: 0, total: 0, paid: 0
        };
      }
      var entry = map[key];
      entry.count++;
      entry.total += (h.totals && h.totals.grandTotal) || 0;
      var paidAmt = h.payments
        ? h.payments.filter(function(p) { return !p.cancelled; })
                    .reduce(function(s, p) { return s + p.amount; }, 0)
        : (h.paidAmount || 0);
      entry.paid += paidAmt;
    });
    return Object.keys(map).map(function(k) {
      var e = map[k];
      e.unpaid = e.total - e.paid;
      return e;
    }).sort(function(a, b) { return b.unpaid - a.unpaid; });
  }

  var _custSummaryOverlay = null;

  function openCustomerSummaryPanel() {
    if (!_custSummaryOverlay) {
      _custSummaryOverlay = document.createElement('div');
      _custSummaryOverlay.id = 'custSummaryOverlay';
      _custSummaryOverlay.className = 'cust-summary-overlay';
      _custSummaryOverlay.innerHTML = [
        '<div class="cust-summary-panel">',
        '  <button class="sales-close-btn" id="custSummaryCloseBtn">✕</button>',
        '  <h3>고객별 집계</h3>',
        '  <div id="custSummaryBody"></div>',
        '</div>'
      ].join('\n');
      document.body.appendChild(_custSummaryOverlay);
      _custSummaryOverlay.addEventListener('click', function(e) {
        if (e.target === _custSummaryOverlay) _custSummaryOverlay.classList.remove('on');
      });
      document.getElementById('custSummaryCloseBtn').addEventListener('click', function() {
        _custSummaryOverlay.classList.remove('on');
      });
    }

    var rows = _buildCustomerAggregates();
    var body = document.getElementById('custSummaryBody');

    if (!rows.length) {
      body.innerHTML = '<div class="cust-summary-empty">거래 이력이 없습니다.</div>';
    } else {
      var html = [
        '<table class="cust-summary-table">',
        '<thead><tr>',
        '<th>고객명</th><th>지역</th><th>거래</th><th>총 매출</th><th>미수금</th>',
        '</tr></thead><tbody>'
      ];
      rows.forEach(function(r) {
        var unpaidClass = r.unpaid > 0 ? ' class="cust-summary-unpaid"' : '';
        html.push(
          '<tr>',
          '<td>' + r.name + '</td>',
          '<td>' + (r.region || '-') + '</td>',
          '<td>' + r.count + '건</td>',
          '<td>' + _fmt(r.total) + '원</td>',
          '<td' + unpaidClass + '>' + _fmt(r.unpaid) + '원</td>',
          '</tr>'
        );
      });
      html.push('</tbody></table>');
      body.innerHTML = html.join('');
    }

    _custSummaryOverlay.classList.add('on');
  }

  // ── 4. 고객별 요약 배지 ──────────────────────────────────────────────────
  function _ensureBadge() {
    if (document.getElementById('custSalesBadge')) return document.getElementById('custSalesBadge');
    var badge = document.createElement('div');
    badge.id = 'custSalesBadge';
    badge.className = 'cust-sales-badge';

    // #unpaidBadge 부모 버튼 뒤에 삽입
    var unpaidBadgeEl = document.getElementById('unpaidBadge');
    if (unpaidBadgeEl) {
      var unpaidBtn = unpaidBadgeEl.closest('button') || unpaidBadgeEl.parentElement;
      if (unpaidBtn && unpaidBtn.parentElement) {
        unpaidBtn.parentElement.insertBefore(badge, unpaidBtn.nextSibling);
        return badge;
      }
    }
    // fallback: cust-bar 내 첫 번째 위치에 삽입
    var custBar = document.querySelector('.cust-bar');
    if (custBar) custBar.appendChild(badge);
    else document.body.appendChild(badge);
    return badge;
  }

  function _updateCustomerSummary() {
    var nameEl  = document.getElementById('cName');
    var phoneEl = document.getElementById('cPhone');
    var badge   = _ensureBadge();

    var name  = nameEl  ? nameEl.value.trim()  : '';
    var phone = phoneEl ? phoneEl.value.trim() : '';

    if (!name || !phone) {
      badge.style.display = 'none';
      return;
    }

    var history = (typeof getInvoiceHistory === 'function') ? getInvoiceHistory() : [];
    var fmt = (typeof customerKey === 'function') ? customerKey : function(n, p) { return (n + '|' + p).toLowerCase(); };

    var invoices = history.filter(function(h) {
      return h.status !== '삭제됨' && fmt(h.customer.name, h.customer.phone) === fmt(name, phone);
    });

    if (!invoices.length) {
      badge.style.display = 'none';
      return;
    }

    var count  = invoices.length;
    var total  = 0;
    var paid   = 0;
    invoices.forEach(function(h) {
      var grandTotal = (h.totals && h.totals.grandTotal) ? h.totals.grandTotal : 0;
      var paidAmt    = h.paidAmount || 0;
      total += grandTotal;
      paid  += paidAmt;
    });
    var unpaid = total - paid;

    badge.textContent = '거래 ' + count + '건 | 총 ' + _fmt(total) + '원 | 미수금 ' + _fmt(unpaid) + '원';
    badge.classList.toggle('has-unpaid', unpaid > 0);
    badge.style.display = 'block';
  }

  // ── 5. DOMContentLoaded ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    _injectSalesCSS();

    var cNameEl  = document.getElementById('cName');
    var cPhoneEl = document.getElementById('cPhone');

    if (cNameEl)  cNameEl.addEventListener('change',  _updateCustomerSummary);
    if (cPhoneEl) cPhoneEl.addEventListener('change', _updateCustomerSummary);

    // 자동완성 항목 클릭 시 프로그래밍적 값 설정 후 change 미발화 보완 (delegation)
    document.addEventListener('click', function(e) {
      var target = e.target;
      while (target && target !== document) {
        if (target.classList && target.classList.contains('cust-ac-item')) {
          setTimeout(_updateCustomerSummary, 200);
          break;
        }
        target = target.parentElement;
      }
    });
  });

  // ── 6. 공개 API ──────────────────────────────────────────────────────────
  window.SalesHistoryUI = {
    openSalesPanel:             openSalesPanel,
    updateCustomerSummary:      _updateCustomerSummary,
    openCustomerSummaryPanel:   openCustomerSummaryPanel
  };

})();
