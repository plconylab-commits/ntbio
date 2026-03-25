/**
 * customerUI.js — 고객 자동완성, 폼 자동 채우기, 할인율 상태 관리, 고객 저장/삭제 UI
 * Phase 02-02: customerUI
 */
(function() {
  'use strict';

  // ── 클로저 상태 변수 ──────────────────────────────────────────────────────
  var _savedDiscount = 0;        // DB에 저장된 할인율
  var _currentCustomerId = null; // 현재 선택된 고객 ID
  var _acIndex = -1;             // 자동완성 키보드 네비게이션 인덱스
  var _deleteTimer = null;       // 삭제 확인 5초 자동 취소 타이머

  // ── CSS 주입 ──────────────────────────────────────────────────────────────
  function injectCustomerCSS() {
    if (document.getElementById('cust-css')) return;
    var style = document.createElement('style');
    style.id = 'cust-css';
    style.textContent = [
      '#custAutocomplete {',
      '  position:absolute; top:100%; left:0; width:100%; z-index:500;',
      '  background:#fff; border:1.5px solid var(--border);',
      '  border-radius:0 0 7px 7px; box-shadow:0 4px 12px rgba(0,0,0,.12);',
      '  max-height:200px; overflow-y:auto; display:none;',
      '}',
      '.cust-ac-item {',
      '  height:36px; padding:8px 11px; font-size:14px; font-weight:500;',
      '  display:flex; align-items:center; justify-content:space-between;',
      '  cursor:pointer;',
      '}',
      '.cust-ac-item:hover { background:var(--g-pale); }',
      '.cust-ac-item.active { background:var(--g-btn); color:#fff; }',
      '.cust-ac-badge { font-size:10px; color:var(--muted); }',
      '.cust-ac-item.active .cust-ac-badge { color:rgba(255,255,255,0.8); }',
      '.cust-ac-empty { color:var(--muted); font-style:italic; pointer-events:none; }',
      '.cust-ac-match { font-weight:700; }',
      '.cust-actions { display:flex; gap:8px; margin-top:8px; }',
      '.cust-save-btn {',
      '  flex:1; background:var(--g-btn); color:#fff; border:none;',
      '  border-radius:7px; padding:10px; font-size:14px; font-weight:700; cursor:pointer;',
      '}',
      '.cust-save-btn:hover { background:var(--g-dark); }',
      '.cust-del-btn {',
      '  min-width:72px; background:#fff0f0; color:var(--red);',
      '  border:1.5px solid #FFCDD2; border-radius:5px; padding:8px 12px;',
      '  font-size:14px; cursor:pointer;',
      '}',
      '.cust-del-confirm { display:flex; gap:4px; }',
      '.cust-del-yes {',
      '  background:var(--red); color:#fff; border:none;',
      '  border-radius:5px; padding:8px 12px; font-size:14px; cursor:pointer;',
      '}',
      '.cust-del-cancel {',
      '  background:#fff; color:var(--muted); border:1.5px solid var(--border);',
      '  border-radius:5px; padding:8px 10px; font-size:14px; cursor:pointer;',
      '}',
      '#discTempBadge {',
      '  position:absolute; top:0; right:0; font-size:10px; font-weight:700;',
      '  color:var(--red); background:var(--red-lt); padding:1px 4px;',
      '  border-radius:3px; display:none;',
      '}',
      '#discSaveLink {',
      '  display:none; font-size:14px; color:var(--g-btn);',
      '  text-decoration:underline; cursor:pointer; margin-top:2px;',
      '}',
      '.cust-history-pill {',
      '  font-size:10px; background:var(--g-pale); color:var(--g-mid);',
      '  border-radius:9px; padding:1px 6px; margin-left:6px; display:none;',
      '}',
      '.cust-ac-sub { font-size:11px; color:var(--muted); margin-left:5px; }',
      '.cust-fill-flash { transition:background 0.4s ease; }',
      '.cname-ac-open { border-color:var(--g-btn) !important; border-radius:7px 7px 0 0 !important; }',
      /* 고객 목록 패널 */
      '#custListOverlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:900; display:none; align-items:flex-start; justify-content:center; padding-top:60px; }',
      '#custListOverlay.on { display:flex; }',
      '#custListPanel { background:#fff; border-radius:14px; width:min(680px,95vw); max-height:75vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,.2); }',
      '#custListPanel .clp-head { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1.5px solid var(--border); }',
      '#custListPanel .clp-title { font-size:17px; font-weight:700; }',
      '#custListPanel .clp-close { background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted); line-height:1; }',
      '#custListSearch { width:100%; padding:10px 14px; border:none; border-bottom:1.5px solid var(--border); font-size:14px; outline:none; }',
      '#custListBody { overflow-y:auto; flex:1; }',
      '.cust-row { display:flex; align-items:center; padding:11px 18px; border-bottom:1px solid var(--border); cursor:pointer; gap:10px; }',
      '.cust-row:hover { background:var(--g-pale); }',
      '.cust-row-name { font-size:15px; font-weight:700; min-width:80px; }',
      '.cust-row-meta { font-size:13px; color:var(--muted); flex:1; }',
      '.cust-row-disc { font-size:13px; font-weight:600; color:var(--g-btn); white-space:nowrap; }',
      '.cust-row-hist { font-size:11px; color:#fff; background:var(--g-btn); border-radius:9px; padding:1px 7px; white-space:nowrap; }',
      '#custListEmpty { padding:40px; text-align:center; color:var(--muted); font-size:15px; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── 자동완성 렌더링 ────────────────────────────────────────────────────────
  function _highlightMatch(text, query) {
    var idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return _esc(text);
    return _esc(text.slice(0, idx)) +
      '<span class="cust-ac-match">' + _esc(text.slice(idx, idx + query.length)) + '</span>' +
      _esc(text.slice(idx + query.length));
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _renderAutocomplete(results, query) {
    var ac = document.getElementById('custAutocomplete');
    if (!ac) return;
    ac.innerHTML = '';
    if (!results || results.length === 0) {
      var emptyEl = document.createElement('div');
      emptyEl.className = 'cust-ac-item cust-ac-empty';
      emptyEl.textContent = '저장된 고객 없음';
      ac.appendChild(emptyEl);
    } else {
      results.forEach(function(customer) {
        var item = document.createElement('div');
        item.className = 'cust-ac-item';
        item.setAttribute('data-id', customer.id);
        var count = CustomerDB.countPrescriptions(customer.id);
        var badge = count > 0 ? '<span class="cust-ac-badge">' + count + '건</span>' : '';
        var sub = [customer.crop, customer.region].filter(Boolean).join(' / ');
        var subHtml = sub ? '<span class="cust-ac-sub">' + _esc(sub) + '</span>' : '';
        item.innerHTML = '<span class="cust-ac-name">' + _highlightMatch(customer.name, query) + '</span>' + subHtml + badge;
        item.addEventListener('mousedown', function(e) {
          e.preventDefault(); // blur 전에 클릭 처리
          _onAcItemClick(customer.id);
        });
        ac.appendChild(item);
      });
    }
    ac.style.display = 'block';
    var nameEl = document.getElementById('cName');
    if (nameEl) nameEl.classList.add('cname-ac-open');
    _acIndex = -1;
  }

  function _closeAutocomplete() {
    var ac = document.getElementById('custAutocomplete');
    if (ac) ac.style.display = 'none';
    var nameEl = document.getElementById('cName');
    if (nameEl) nameEl.classList.remove('cname-ac-open');
    _acIndex = -1;
  }

  function _onNameInput(e) {
    var key = e.key || e.keyCode;
    // 네비게이션 키는 keydown에서 처리
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === 'Escape') return;
    var query = (document.getElementById('cName') || {}).value || '';
    query = query.trim();
    if (query.length < 1) { _closeAutocomplete(); return; }
    var results = CustomerDB.search(query);
    _renderAutocomplete(results, query);
  }

  function _onNameKeydown(e) {
    var ac = document.getElementById('custAutocomplete');
    if (!ac || ac.style.display === 'none') return;
    var items = ac.querySelectorAll('.cust-ac-item:not(.cust-ac-empty)');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length === 0) return;
      if (_acIndex >= 0 && _acIndex < items.length) items[_acIndex].classList.remove('active');
      _acIndex = Math.min(_acIndex + 1, items.length - 1);
      items[_acIndex].classList.add('active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length === 0) return;
      if (_acIndex >= 0 && _acIndex < items.length) items[_acIndex].classList.remove('active');
      _acIndex = Math.max(_acIndex - 1, 0);
      items[_acIndex].classList.add('active');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_acIndex >= 0 && _acIndex < items.length) {
        var id = items[_acIndex].getAttribute('data-id');
        if (id) _onAcItemClick(id);
      }
    } else if (e.key === 'Escape') {
      _closeAutocomplete();
    }
  }

  function _onAcItemClick(id) {
    var customer = CustomerDB.findById(id);
    if (customer) _onCustomerSelect(customer);
  }

  // ── 고객 선택 및 폼 채우기 ──────────────────────────────────────────────────
  function _onCustomerSelect(customer) {
    _setVal('cName',   customer.name || '');
    _setVal('cPhone',  customer.phone || '');
    _setVal('cAddr',   customer.addr || '');
    _setVal('cRegion', customer.region || '');
    _setVal('cArea',   customer.area != null ? customer.area : '');

    // 작물 select
    var cropEl = document.getElementById('cCrop');
    if (cropEl && customer.crop) {
      var opt = Array.from(cropEl.options).find(function(o) { return o.value === customer.crop; });
      if (opt) cropEl.value = customer.crop;
    }

    // 할인율
    _setVal('gDisc', customer.discountRate != null ? customer.discountRate : 0);
    _savedDiscount = Number(customer.discountRate) || 0;
    _currentCustomerId = customer.id;

    _updateDiscountState('saved');

    // 기존 전역 함수 호출
    if (typeof applyGlobalDisc === 'function') applyGlobalDisc();
    if (typeof syncPrint === 'function') syncPrint();

    // 처방이력 배지
    _updateHistoryBadge(customer.id);

    // 폼 필드 flash 효과
    ['cName','cPhone','cAddr','cRegion','cArea','cCrop','gDisc'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.add('cust-fill-flash');
      el.style.background = 'var(--g-pale)';
      setTimeout(function() { el.style.background = ''; }, 400);
    });

    // 저장 버튼 라벨 변경
    var saveBtn = document.getElementById('custSaveBtn');
    if (saveBtn) saveBtn.textContent = '고객 정보 수정';

    // 삭제 버튼 표시
    var delBtn = document.getElementById('custDelBtn');
    if (delBtn) delBtn.style.display = '';

    _closeAutocomplete();
  }

  function _setVal(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val;
  }

  // ── 처방이력 배지 ────────────────────────────────────────────────────────
  function _updateHistoryBadge(customerId) {
    // 이름 기준으로 집계 — customerId 없이 저장된 이전 처방도 포함
    var nameEl = document.getElementById('cName');
    var name = nameEl ? nameEl.value.trim() : '';
    var count = name
      ? CustomerDB.searchPrescriptions({ name: name }).length
      : CustomerDB.countPrescriptions(customerId);
    var pill = document.getElementById('historyPill');
    if (!pill) return;
    if (count > 0) {
      pill.textContent = count + '건 처방이력';
      pill.style.display = 'inline';
    } else {
      pill.style.display = 'none';
    }
  }

  // ── 할인율 상태 관리 ──────────────────────────────────────────────────────
  function _updateDiscountState(state) {
    var discEl  = document.getElementById('gDisc');
    var badge   = document.getElementById('discTempBadge');
    var saveLink = document.getElementById('discSaveLink');
    if (!discEl) return;
    if (state === 'saved') {
      discEl.style.background    = '';
      discEl.style.borderColor   = '';
      if (badge)    badge.style.display    = 'none';
      if (saveLink) saveLink.style.display = 'none';
    } else if (state === 'temp') {
      discEl.style.background  = '#FFEBEE';
      discEl.style.borderColor = '#EF9A9A';
      if (badge)    badge.style.display    = '';
      if (saveLink) saveLink.style.display = '';
    }
  }

  function _onDiscInput() {
    if (!_currentCustomerId) return;
    var current = Number((document.getElementById('gDisc') || {}).value) || 0;
    _updateDiscountState(current === _savedDiscount ? 'saved' : 'temp');
  }

  function _onSaveDiscountAsDefault() {
    if (!_currentCustomerId) return;
    var disc = Number((document.getElementById('gDisc') || {}).value) || 0;
    var customer = CustomerDB.findById(_currentCustomerId);
    if (customer) {
      customer.discountRate = disc;
      CustomerDB.save(customer);
    }
    _savedDiscount = disc;
    _updateDiscountState('saved');
  }

  // ── 고객 저장 ────────────────────────────────────────────────────────────
  function _onSaveCustomer() {
    var name = ((document.getElementById('cName') || {}).value || '').trim();
    if (!name) { alert('고객명을 입력하세요.'); return; }

    var customer = {
      name:         name,
      phone:        ((document.getElementById('cPhone')  || {}).value || '').trim(),
      addr:         ((document.getElementById('cAddr')   || {}).value || '').trim(),
      region:       ((document.getElementById('cRegion') || {}).value || '').trim(),
      area:         Number((document.getElementById('cArea') || {}).value) || 0,
      crop:         (document.getElementById('cCrop')    || {}).value || '',
      discountRate: Number((document.getElementById('gDisc') || {}).value) || 0,
      memo:         ''
    };
    if (_currentCustomerId) customer.id = _currentCustomerId;

    var saveBtn = document.getElementById('custSaveBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.style.opacity = '0.6';
      saveBtn.style.pointerEvents = 'none';
      saveBtn.textContent = '저장 중…';
    }

    var saved = CustomerDB.save(customer);

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.opacity = '';
      saveBtn.style.pointerEvents = '';
      if (!saved) {
        saveBtn.textContent = _currentCustomerId ? '고객 정보 수정' : '고객 저장';
        return;
      }
    }
    if (!saved) return;

    _currentCustomerId = saved.id;
    _savedDiscount = saved.discountRate;
    _updateDiscountState('saved');

    if (saveBtn) {
      saveBtn.textContent = '고객 정보 수정';
      saveBtn.style.background = '#E0F5F5';
      setTimeout(function() { saveBtn.style.background = ''; }, 300);
    }

    // 삭제 버튼 표시
    var delBtn = document.getElementById('custDelBtn');
    if (delBtn) delBtn.style.display = '';
  }

  // ── 고객 삭제 (인라인 2단계 확인) ─────────────────────────────────────────
  function _onDeleteCustomer() {
    var delBtn = document.getElementById('custDelBtn');
    if (!delBtn) return;
    // 버튼 영역을 인라인 확인 UI로 전환
    delBtn.style.display = 'none';
    var actionsEl = delBtn.parentElement;

    var confirmEl = document.createElement('div');
    confirmEl.className = 'cust-del-confirm';
    confirmEl.id = 'custDelConfirm';
    confirmEl.innerHTML =
      '<span style="font-size:14px;color:var(--muted);align-self:center;white-space:nowrap;">정말 삭제?</span>' +
      '<button class="cust-del-yes" id="custDelYes">예, 삭제</button>' +
      '<button class="cust-del-cancel" id="custDelCancel">취소</button>';
    actionsEl.appendChild(confirmEl);

    document.getElementById('custDelYes').addEventListener('click', _confirmDelete);
    document.getElementById('custDelCancel').addEventListener('click', _cancelDelete);

    _deleteTimer = setTimeout(_cancelDelete, 5000);
  }

  function _confirmDelete() {
    if (_currentCustomerId) CustomerDB.delete(_currentCustomerId);
    _currentCustomerId = null;
    _savedDiscount = 0;
    _updateDiscountState('saved');

    var saveBtn = document.getElementById('custSaveBtn');
    if (saveBtn) saveBtn.textContent = '고객 저장';

    var pill = document.getElementById('historyPill');
    if (pill) pill.style.display = 'none';

    _cancelDelete();
    // 삭제 후 삭제 버튼 숨기기
    var delBtn = document.getElementById('custDelBtn');
    if (delBtn) delBtn.style.display = 'none';
  }

  function _cancelDelete() {
    clearTimeout(_deleteTimer);
    _deleteTimer = null;
    var confirmEl = document.getElementById('custDelConfirm');
    if (confirmEl && confirmEl.parentElement) confirmEl.parentElement.removeChild(confirmEl);
    var delBtn = document.getElementById('custDelBtn');
    if (delBtn && _currentCustomerId) delBtn.style.display = '';
  }

  // ── 고객 목록 패널 ────────────────────────────────────────────────────────
  function openCustomerList() {
    var overlay = document.getElementById('custListOverlay');
    if (!overlay) return;
    overlay.classList.add('on');
    _renderCustomerList('');
    var search = document.getElementById('custListSearch');
    if (search) { search.value = ''; setTimeout(function(){ search.focus(); }, 50); }
  }

  function closeCustomerList() {
    var overlay = document.getElementById('custListOverlay');
    if (overlay) overlay.classList.remove('on');
  }

  function _renderCustomerList(query) {
    var body = document.getElementById('custListBody');
    if (!body) return;
    var all = CustomerDB.list();
    var filtered = query.trim()
      ? all.filter(function(c){ return c.name && c.name.toLowerCase().includes(query.trim().toLowerCase()); })
      : all;

    if (!filtered.length) {
      body.innerHTML = '<div id="custListEmpty">저장된 고객이 없습니다.</div>';
      return;
    }
    body.innerHTML = filtered.map(function(c) {
      var meta = [c.crop, c.region, c.area ? c.area + '평' : ''].filter(Boolean).join(' · ');
      var hist = CustomerDB.countPrescriptions(c.id);
      var histHtml = hist > 0 ? '<span class="cust-row-hist">' + hist + '건</span>' : '';
      var discHtml = c.discountRate > 0 ? '<span class="cust-row-disc">' + c.discountRate + '%↓</span>' : '';
      return '<div class="cust-row" data-id="' + _esc(c.id) + '">' +
        '<span class="cust-row-name">' + _esc(c.name) + '</span>' +
        '<span class="cust-row-meta">' + _esc(meta) + '</span>' +
        discHtml + histHtml +
        '</div>';
    }).join('');

    Array.from(body.querySelectorAll('.cust-row')).forEach(function(row) {
      row.addEventListener('click', function() {
        var c = CustomerDB.findById(row.getAttribute('data-id'));
        if (c) { _onCustomerSelect(c); closeCustomerList(); }
      });
    });
  }

  // ── 초기화 ───────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    injectCustomerCSS();

    // #cName의 .fg 부모에 position:relative 추가 (이미 index.html에서 처리되나 fallback)
    var nameEl = document.getElementById('cName');
    if (nameEl && nameEl.parentElement) {
      var parent = nameEl.parentElement;
      if (!parent.style.position) parent.style.position = 'relative';
    }

    // 이벤트 리스너 등록
    if (nameEl) {
      nameEl.addEventListener('keyup',  _onNameInput);
      nameEl.addEventListener('keydown', _onNameKeydown);
      nameEl.addEventListener('blur', function() {
        setTimeout(_closeAutocomplete, 150);
      });
    }

    var discEl = document.getElementById('gDisc');
    if (discEl) discEl.addEventListener('input', _onDiscInput);

    var saveBtn = document.getElementById('custSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', _onSaveCustomer);

    var delBtn = document.getElementById('custDelBtn');
    if (delBtn) delBtn.addEventListener('click', _onDeleteCustomer);

    var discSaveLink = document.getElementById('discSaveLink');
    if (discSaveLink) discSaveLink.addEventListener('click', _onSaveDiscountAsDefault);

    var listBtn = document.getElementById('custListBtn');
    if (listBtn) listBtn.addEventListener('click', openCustomerList);

    var listClose = document.getElementById('custListClose');
    if (listClose) listClose.addEventListener('click', closeCustomerList);

    var listSearch = document.getElementById('custListSearch');
    if (listSearch) listSearch.addEventListener('input', function() { _renderCustomerList(listSearch.value); });

    var listOverlay = document.getElementById('custListOverlay');
    if (listOverlay) listOverlay.addEventListener('click', function(e) {
      if (e.target === listOverlay) closeCustomerList();
    });

    // 외부 클릭 닫기
    document.addEventListener('click', function(e) {
      var acEl = document.getElementById('custAutocomplete');
      var nameEl2 = document.getElementById('cName');
      if (!acEl || !nameEl2) return;
      if (!acEl.contains(e.target) && e.target !== nameEl2) {
        setTimeout(_closeAutocomplete, 150);
      }
    });
  });

  // ── 외부 API ──────────────────────────────────────────────────────────────
  window.CustomerUI = {
    getCurrentCustomerId: function() { return _currentCustomerId; },
    refreshHistoryBadge: function(customerId) { _updateHistoryBadge(customerId || _currentCustomerId); }
  };

})();
