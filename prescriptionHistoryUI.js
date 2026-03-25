/**
 * prescriptionHistoryUI.js — 처방이력 모달 + 템플릿 추천 배너 + 면적 비례 조정
 * Phase 03-02: 처방이력 UI
 */
(function() {
  'use strict';

  // ── 1. CSS 주입 ──────────────────────────────────────────────────────────
  function _injectHistoryCSS() {
    if (document.getElementById('hist-css')) return;
    var style = document.createElement('style');
    style.id = 'hist-css';
    style.textContent = [
      '#historyOverlay {',
      '  position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:900;',
      '  display:none; align-items:flex-start; justify-content:center; padding-top:60px;',
      '}',
      '#historyOverlay.on { display:flex; }',
      '#historyPanel {',
      '  background:#fff; border-radius:14px; width:min(720px,95vw);',
      '  max-height:75vh; display:flex; flex-direction:column; overflow:hidden;',
      '  box-shadow:0 8px 32px rgba(0,0,0,.2);',
      '}',
      '.hist-head {',
      '  display:flex; align-items:center; justify-content:space-between;',
      '  padding:16px 20px; border-bottom:1.5px solid var(--border);',
      '}',
      '.hist-title { font-size:17px; font-weight:700; }',
      '.hist-close {',
      '  background:none; border:none; font-size:22px; cursor:pointer;',
      '  color:var(--muted); line-height:1;',
      '}',
      '.hist-filters {',
      '  padding:12px 20px; display:flex; gap:10px; flex-wrap:wrap;',
      '  border-bottom:1.5px solid var(--border);',
      '}',
      '.hist-filter-input {',
      '  flex:1; min-width:120px; padding:8px 12px;',
      '  border:1.5px solid var(--border); border-radius:7px; font-size:13px;',
      '  box-sizing:border-box;',
      '}',
      '.hist-body { overflow-y:auto; flex:1; }',
      '.hist-item {',
      '  padding:14px 18px; border-bottom:1px solid var(--border); cursor:pointer;',
      '}',
      '.hist-item:hover { background:var(--g-pale); }',
      '.hist-item-head {',
      '  display:flex; justify-content:space-between; align-items:center;',
      '}',
      '.hist-item-name { font-size:15px; font-weight:700; }',
      '.hist-item-date { font-size:12px; color:var(--muted); }',
      '.hist-item-meta { font-size:13px; color:var(--muted); margin-top:4px; }',
      '.hist-item-total { font-size:14px; font-weight:600; color:var(--g-btn); margin-top:4px; }',
      '.hist-empty { padding:40px; text-align:center; color:var(--muted); font-size:15px; }',
      '#tmplBanner {',
      '  background:var(--g-pale); border:1.5px solid var(--g-btn);',
      '  border-radius:10px; padding:12px 16px; margin-bottom:10px; display:none;',
      '}',
      '.tmpl-banner-text { font-size:13px; color:#333; margin-bottom:8px; }',
      '.tmpl-banner-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }',
      '.tmpl-use-btn {',
      '  background:var(--g-btn); color:#fff; border:none;',
      '  border-radius:7px; padding:8px 16px; font-size:13px; font-weight:700; cursor:pointer;',
      '}',
      '.tmpl-skip-btn {',
      '  background:none; border:1.5px solid var(--border);',
      '  border-radius:7px; padding:8px 12px; font-size:13px; color:var(--muted); cursor:pointer;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── 2. 모달 HTML 생성 ────────────────────────────────────────────────────
  function _createHistoryModal() {
    if (document.getElementById('historyOverlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'historyOverlay';
    overlay.innerHTML = [
      '<div id="historyPanel">',
      '  <div class="hist-head">',
      '    <span class="hist-title">처방이력</span>',
      '    <button class="hist-close" id="histClose">&times;</button>',
      '  </div>',
      '  <div class="hist-filters">',
      '    <input class="hist-filter-input" id="histFilterName" placeholder="고객명">',
      '    <select class="hist-filter-input" id="histFilterCrop">',
      '      <option value="">전체 작물</option>',
      '    </select>',
      '    <input class="hist-filter-input" id="histFilterFrom" type="date" title="시작일">',
      '    <input class="hist-filter-input" id="histFilterTo" type="date" title="종료일">',
      '  </div>',
      '  <div class="hist-body" id="histBody"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
  }

  // ── 3. 작물 필터 옵션 채우기 ─────────────────────────────────────────────
  function _populateCropFilter() {
    var cCrop = document.getElementById('cCrop');
    var histFilterCrop = document.getElementById('histFilterCrop');
    if (!cCrop || !histFilterCrop) return;
    // 기존 "전체 작물" 옵션만 유지, 나머지 초기화
    histFilterCrop.innerHTML = '<option value="">전체 작물</option>';
    Array.from(cCrop.options).forEach(function(opt) {
      if (!opt.value) return; // 빈 value(placeholder) 제외
      var newOpt = document.createElement('option');
      newOpt.value = opt.value;
      newOpt.textContent = opt.textContent;
      histFilterCrop.appendChild(newOpt);
    });
  }

  // ── 4. 모달 열기/닫기 ────────────────────────────────────────────────────
  function _openHistoryModal(filterCrop) {
    var overlay = document.getElementById('historyOverlay');
    if (!overlay) return;
    _populateCropFilter();
    if (filterCrop) {
      var cropSel = document.getElementById('histFilterCrop');
      if (cropSel) cropSel.value = filterCrop;
    }
    overlay.classList.add('on');
    _renderHistoryList();
  }

  function _closeHistoryModal() {
    var overlay = document.getElementById('historyOverlay');
    if (overlay) overlay.classList.remove('on');
  }

  // ── 5. 이력 목록 렌더링 ──────────────────────────────────────────────────
  function _renderHistoryList() {
    var body = document.getElementById('histBody');
    if (!body) return;

    var name     = ((document.getElementById('histFilterName') || {}).value || '').trim();
    var crop     = (document.getElementById('histFilterCrop') || {}).value || '';
    var dateFrom = (document.getElementById('histFilterFrom') || {}).value || '';
    var dateTo   = (document.getElementById('histFilterTo')   || {}).value || '';

    var results = CustomerDB.searchPrescriptions({ name: name, crop: crop, dateFrom: dateFrom, dateTo: dateTo });

    if (!results || results.length === 0) {
      body.innerHTML = '<div class="hist-empty">처방이력이 없습니다.</div>';
      return;
    }

    body.innerHTML = results.map(function(p) {
      var dateStr = p.savedAt ? _formatDate(p.savedAt) : '';
      var meta = [
        (p.customer && p.customer.crop) || '',
        (p.customer && p.customer.area) ? (p.customer.area + '평') : '',
        (p.items && p.items.length) ? (p.items.length + '개 품목') : ''
      ].filter(Boolean).join(' · ');
      var total = (p.totals && p.totals.grandTotal) ? p.totals.grandTotal.toLocaleString() + '원' : '';
      return [
        '<div class="hist-item" data-id="' + _esc(p.id) + '">',
        '  <div class="hist-item-head">',
        '    <span class="hist-item-name">' + _esc((p.customer && p.customer.name) || '(이름 없음)') + '</span>',
        '    <span class="hist-item-date">' + _esc(dateStr) + '</span>',
        '  </div>',
        meta ? ('  <div class="hist-item-meta">' + _esc(meta) + '</div>') : '',
        total ? ('  <div class="hist-item-total">합계: ' + total + '</div>') : '',
        '</div>'
      ].join('');
    }).join('');

    // 클릭 이벤트 — results 배열로 직접 참조
    Array.from(body.querySelectorAll('.hist-item')).forEach(function(el, idx) {
      el.addEventListener('click', function() {
        _onHistoryItemClick(results[idx]);
      });
    });
  }

  // ── 6. 이력 항목 클릭 ────────────────────────────────────────────────────
  function _onHistoryItemClick(snapshot) {
    _loadSnapshotIntoCart(snapshot);
    _closeHistoryModal();
  }

  // ── 7. 스냅샷 불러오기 (HIST-02 핵심) ───────────────────────────────────
  function _loadSnapshotIntoCart(snapshot) {
    // 원본 보호 — deep copy 사용
    var copy = JSON.parse(JSON.stringify(snapshot));

    // cart 교체 (전역 cart 변수에 직접 할당)
    cart = copy.items.map(function(item, idx) {
      return {
        i:      'hist_' + Date.now() + '_' + idx,
        name:   item.name,
        size:   item.size,
        retail: item.retail,
        sp:     item.sp,
        qty:    item.qty,
        disc:   item.retail > 0 ? Math.round((1 - item.sp / item.retail) * 100) : 0,
        gift:   item.gift || false,
        custom: true
      };
    });

    // 폼 필드 채우기
    _setVal('cName',   (copy.customer && copy.customer.name)   || '');
    _setVal('cRegion', (copy.customer && copy.customer.region) || '');
    _setVal('cArea',   (copy.customer && copy.customer.area)   || '');
    _setVal('gDisc',   copy.discountRate || 0);

    // 작물 select 값 설정
    var cropEl = document.getElementById('cCrop');
    if (cropEl && copy.customer && copy.customer.crop) {
      cropEl.value = copy.customer.crop;
    }

    // 전역 함수 호출
    if (typeof applyGlobalDisc === 'function') applyGlobalDisc();
    if (typeof render          === 'function') render();
    if (typeof syncPrint       === 'function') syncPrint();

    // 토스트
    if (typeof showToast === 'function') showToast('처방이력 불러옴 — 수정 후 재발행 가능');
  }

  // ── 8. 면적 비례 조정 (TMPL-02) ─────────────────────────────────────────
  function _scaleItemsByArea(items, sourceArea, newArea) {
    if (!sourceArea || sourceArea <= 0 || !newArea || newArea <= 0) return items;
    var ratio = newArea / sourceArea;
    return items.map(function(item) {
      return Object.assign({}, item, { qty: Math.max(1, Math.round(item.qty * ratio)) });
    });
  }

  // ── 9. 템플릿 배너 표시/숨기기 (TMPL-01) ─────────────────────────────────
  var _currentTmplSnapshot = null;

  function _showTmplBanner(snapshot) {
    _currentTmplSnapshot = snapshot;
    var banner = document.getElementById('tmplBanner');
    if (!banner) return;
    var textEl = document.getElementById('tmplBannerText');
    if (textEl) {
      var dateStr = snapshot.savedAt ? new Date(snapshot.savedAt).toLocaleDateString('ko-KR') : '';
      textEl.textContent = (
        ((snapshot.customer && snapshot.customer.name) || '(이름 없음)') + '님의 ' +
        ((snapshot.customer && snapshot.customer.crop) || '') + ' 처방 (' + dateStr + ') — ' +
        ((snapshot.items && snapshot.items.length) || 0) + '개 품목'
      );
    }
    banner.style.display = 'block';
  }

  function _hideTmplBanner() {
    var banner = document.getElementById('tmplBanner');
    if (banner) banner.style.display = 'none';
    _currentTmplSnapshot = null;
  }

  // ── 10. 템플릿 사용 ──────────────────────────────────────────────────────
  function _onUseTmpl(snapshot) {
    var currentArea = parseFloat(((document.getElementById('cArea') || {}).value)) || 0;
    var sourceArea  = (snapshot.customer && snapshot.customer.area) || 0;

    var scaledItems;
    if (currentArea > 0 && sourceArea > 0) {
      scaledItems = _scaleItemsByArea(snapshot.items, sourceArea, currentArea);
    } else {
      scaledItems = snapshot.items;
      if (typeof showToast === 'function') showToast('면적 미입력 — 수량 비례 조정 건너뜀');
    }

    // 원본 보호 deep copy 후 items를 scaledItems로 교체
    var copy = JSON.parse(JSON.stringify(snapshot));
    copy.items = scaledItems;

    cart = copy.items.map(function(item, idx) {
      return {
        i:      'hist_' + Date.now() + '_' + idx,
        name:   item.name,
        size:   item.size,
        retail: item.retail,
        sp:     item.sp,
        qty:    item.qty,
        disc:   item.retail > 0 ? Math.round((1 - item.sp / item.retail) * 100) : 0,
        gift:   item.gift || false,
        custom: true
      };
    });

    // 템플릿 사용: 제품 목록만 교체 — 고객 정보(이름/주소/면적/할인율)는 현재 입력값 유지
    if (typeof applyGlobalDisc === 'function') applyGlobalDisc();
    if (typeof render          === 'function') render();
    if (typeof syncPrint       === 'function') syncPrint();

    if (typeof showToast === 'function') showToast('템플릿 제품 불러옴 — 수정 후 발행하세요');
    _hideTmplBanner();
  }

  // ── 11. cCrop change 이벤트 ──────────────────────────────────────────────
  function _onCropChange() {
    var crop = ((document.getElementById('cCrop') || {}).value || '').trim();
    if (!crop) { _hideTmplBanner(); return; }
    var matches = CustomerDB.searchPrescriptionsByCrop(crop);
    if (matches.length > 0) {
      _showTmplBanner(matches[0]);
    } else {
      _hideTmplBanner();
    }
  }

  // ── 유틸 ─────────────────────────────────────────────────────────────────
  function _setVal(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val;
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _formatDate(isoStr) {
    try {
      var d = new Date(isoStr);
      return d.getFullYear() + '.' +
        String(d.getMonth() + 1).padStart(2, '0') + '.' +
        String(d.getDate()).padStart(2, '0');
    } catch(e) { return isoStr || ''; }
  }

  // ── 12. DOMContentLoaded 초기화 ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    _injectHistoryCSS();
    _createHistoryModal();

    // 템플릿 배너 HTML을 #ordList 앞에 삽입
    var ordList = document.getElementById('ordList');
    if (ordList && !document.getElementById('tmplBanner')) {
      var tmplBanner = document.createElement('div');
      tmplBanner.id = 'tmplBanner';
      tmplBanner.style.display = 'none';
      tmplBanner.innerHTML = [
        '<div class="tmpl-banner-text" id="tmplBannerText"></div>',
        '<div class="tmpl-banner-actions">',
        '  <button class="tmpl-use-btn" id="tmplUseBtn">이 처방 사용</button>',
        '  <a href="#" id="tmplOtherLink" style="font-size:13px;color:var(--g-btn);align-self:center;">다른 이력 보기</a>',
        '  <button class="tmpl-skip-btn" id="tmplSkipBtn">건너뛰기</button>',
        '</div>'
      ].join('');
      ordList.parentElement.insertBefore(tmplBanner, ordList);
    }

    // 이벤트 연결 — 모달
    var histClose = document.getElementById('histClose');
    if (histClose) histClose.addEventListener('click', _closeHistoryModal);

    var histOverlay = document.getElementById('historyOverlay');
    if (histOverlay) histOverlay.addEventListener('click', function(e) {
      if (e.target === histOverlay) _closeHistoryModal();
    });

    // 필터 이벤트 (debounce 200ms for text input)
    var debounceTimer = null;
    var histFilterName = document.getElementById('histFilterName');
    if (histFilterName) {
      histFilterName.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(_renderHistoryList, 200);
      });
    }

    var histFilterCrop = document.getElementById('histFilterCrop');
    if (histFilterCrop) histFilterCrop.addEventListener('change', _renderHistoryList);

    var histFilterFrom = document.getElementById('histFilterFrom');
    if (histFilterFrom) histFilterFrom.addEventListener('change', _renderHistoryList);

    var histFilterTo = document.getElementById('histFilterTo');
    if (histFilterTo) histFilterTo.addEventListener('change', _renderHistoryList);

    // historyPill 클릭 — 이력 모달 열기
    var historyPill = document.getElementById('historyPill');
    if (historyPill) historyPill.addEventListener('click', function() {
      _openHistoryModal();
    });

    // cCrop change — 템플릿 배너
    var cCropEl = document.getElementById('cCrop');
    if (cCropEl) cCropEl.addEventListener('change', _onCropChange);

    // 템플릿 배너 버튼 이벤트 (동적 삽입 후 document delegation 방식)
    document.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'tmplUseBtn') {
        if (_currentTmplSnapshot) _onUseTmpl(_currentTmplSnapshot);
      } else if (e.target && e.target.id === 'tmplSkipBtn') {
        _hideTmplBanner();
      } else if (e.target && e.target.id === 'tmplOtherLink') {
        e.preventDefault();
        if (_currentTmplSnapshot && _currentTmplSnapshot.customer) {
          _openHistoryModal(_currentTmplSnapshot.customer.crop);
        } else {
          _openHistoryModal();
        }
      }
    });
  });

  // ── 13. 공개 API ─────────────────────────────────────────────────────────
  window.PrescriptionHistoryUI = {
    openModal:  _openHistoryModal,
    closeModal: _closeHistoryModal
  };

})();
