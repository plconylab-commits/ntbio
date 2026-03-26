/**
 * rxCompareUI.js
 * Comparison modal UI: opens a modal overlay, handles PDF upload,
 * shows loading state, and renders the diff table.
 *
 * Dependencies (must load before this file):
 *   - rxCompare.js  → window.RxCompare
 *   - pdfParser.js  → parsePdfToJSON()
 *   - index.html globals: cart (read-only), showToast()
 *
 * Exports: window.RxCompareUI = { openCompareModal }
 */

(function () {
  'use strict';

  /* ────────────────────────────────────────────────
   * Internal helpers
   * ──────────────────────────────────────────────── */

  function _closeModal() {
    var el = document.getElementById('rxCompareOverlay');
    if (el) el.remove();
  }

  /* ────────────────────────────────────────────────
   * _showResults(prescriptionJSON)
   * Called after parsePdfToJSON succeeds.
   * Replaces modal body with summary row + diff table.
   * ──────────────────────────────────────────────── */
  function _showResults(prescriptionJSON) {
    var body = document.getElementById('rxCompareBody');
    if (!body) return;

    // Extract rx items and build diff rows
    var rxItems  = RxCompare.extractRxItems(prescriptionJSON);
    var diffRows = RxCompare.buildDiffRows(rxItems, cart);

    // Determine area: try prescriptionJSON first, then fall back to UI field
    var area = null;
    if (prescriptionJSON.farmInfo && prescriptionJSON.farmInfo.totalArea) {
      area = prescriptionJSON.farmInfo.totalArea;
    } else {
      var areaEl = document.getElementById('cArea');
      if (areaEl) {
        var parsed = parseFloat(areaEl.value);
        if (!isNaN(parsed) && parsed > 0) area = parsed;
      }
    }

    // Pyeongdanga values
    var cartPpyeong = RxCompare.calcCartPricePerPyeong(cart, area);
    var rxPpyeong   = (prescriptionJSON.costData && prescriptionJSON.costData.unitPricePerPyeong)
                      ? prescriptionJSON.costData.unitPricePerPyeong
                      : null;

    // ── Summary row ──
    var summaryParts = [];

    if (rxPpyeong != null) {
      summaryParts.push('처방전 평당가: ' + rxPpyeong.toLocaleString('ko-KR') + '원');
    } else {
      summaryParts.push('처방전 평당가: 확인불가');
    }

    if (area == null || area <= 0) {
      summaryParts.push('카트 면적 미입력');
    } else if (cartPpyeong != null) {
      summaryParts.push('카트 공급가 합계 ÷ 면적: ' + cartPpyeong.toLocaleString('ko-KR') + '원');
      if (rxPpyeong != null) {
        var diff = cartPpyeong - rxPpyeong;
        summaryParts.push('차이: ' + (diff >= 0 ? '+' : '') + diff.toLocaleString('ko-KR') + '원');
      }
    }

    var summaryHtml = '<div id="rxCmpSummary" style="background:var(--g-pale,#E0F5F5);border:1px solid var(--border,#B2DFDE);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:14px;font-weight:700;line-height:1.6;">' +
      summaryParts.join('&nbsp;&nbsp;/&nbsp;&nbsp;') +
      '</div>';

    // ── Diff table ──
    var matchRows    = diffRows.filter(function(r) { return r.status === 'match'; });
    var nonMatchRows = diffRows.filter(function(r) { return r.status !== 'match'; });
    var matchCount   = matchRows.length;

    var tableHtml = '';

    if (diffRows.length === 0 || (matchRows.length === diffRows.length)) {
      // All matched or empty
      tableHtml = '<div style="text-align:center;padding:24px 0;font-size:15px;color:var(--g-dark,#2A8A88);font-weight:700;">차이 없음 — 모든 품목이 일치합니다.</div>';
    } else {
      // Toggle button (only if there are match rows)
      var toggleHtml = '';
      if (matchCount > 0) {
        toggleHtml = '<button id="rxCmpToggle" onclick="(function(){' +
          'var rows=document.querySelectorAll(\'.rxcmp-row-match\');' +
          'var btn=document.getElementById(\'rxCmpToggle\');' +
          'var hidden=rows[0]&&rows[0].style.display===\'none\';' +
          'for(var i=0;i<rows.length;i++){rows[i].style.display=hidden?\'table-row\':\'none\';}' +
          'btn.textContent=hidden?\'일치 항목 숨기기 (' + matchCount + '건)\':\'일치 항목 보기 (' + matchCount + '건)\';' +
          '})()" style="margin-bottom:10px;background:#f0f0f0;border:1px solid var(--border,#B2DFDE);border-radius:6px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">' +
          '일치 항목 보기 (' + matchCount + '건)</button>';
      }

      var thead = '<thead><tr>' +
        '<th style="width:48px;font-size:12px;font-weight:700;background:#f0f0f0;padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);">상태</th>' +
        '<th style="font-size:12px;font-weight:700;background:#f0f0f0;padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);">품목명</th>' +
        '<th style="width:72px;font-size:12px;font-weight:700;background:#f0f0f0;padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);text-align:center;">처방 수량</th>' +
        '<th style="width:72px;font-size:12px;font-weight:700;background:#f0f0f0;padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);text-align:center;">카트 수량</th>' +
        '<th style="width:64px;font-size:12px;font-weight:700;background:#f0f0f0;padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);text-align:center;">차이</th>' +
        '<th style="width:80px;font-size:12px;font-weight:700;background:#f0f0f0;padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);text-align:right;">금액 비교</th>' +
        '</tr></thead>';

      // Build rows: non-match first, then match (hidden by default)
      var tbodyRows = '';

      function _rowHtml(row, hidden) {
        var bg, icon, textColor;
        switch (row.status) {
          case 'match':
            bg = 'var(--g-pale,#E0F5F5)'; icon = '✓'; textColor = 'var(--muted,#666666)';
            break;
          case 'qty-diff':
            bg = 'var(--yellow,#FFF9C4)'; icon = '△'; textColor = '#1A1A1A';
            break;
          case 'rx-only':
            bg = 'var(--red-lt,#FFEBEE)'; icon = '✗'; textColor = 'var(--red,#C62828)';
            break;
          case 'cart-only':
            bg = 'var(--red-lt,#FFEBEE)'; icon = '✗'; textColor = 'var(--red,#C62828)';
            break;
          default:
            bg = '#FFF3E0'; icon = '?'; textColor = 'var(--orange,#E65100)';
        }

        var displayStyle = hidden ? 'display:none;' : '';
        var rowClass = 'rxcmp-row-' + (row.status === 'qty-diff' ? 'qtydiff' : row.status);

        // 품목명 cell content
        var itemName = '';
        if (row.status === 'rx-only') {
          itemName = row.rxName || '—';
        } else if (row.status === 'cart-only') {
          itemName = row.cartName || '—';
        } else {
          // match or qty-diff: show both names if different
          itemName = row.rxName || '—';
        }

        // 차이 column
        var diffCell = '—';
        if (row.status === 'qty-diff' && row.diff != null) {
          diffCell = (row.diff > 0 ? '+' : '') + row.diff;
        }

        // 금액 비교 column
        var amountCell = '—';
        if (row.cartAmount != null && row.cartAmount > 0) {
          amountCell = row.cartAmount.toLocaleString('ko-KR');
        }

        var rxQtyCell   = (row.rxQty   != null) ? row.rxQty   : '—';
        var cartQtyCell = (row.cartQty  != null) ? row.cartQty : '—';

        return '<tr class="' + rowClass + '" style="' + displayStyle + 'background:' + bg + ';color:' + textColor + ';min-height:36px;">' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);font-size:14px;text-align:center;font-weight:700;">' + icon + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);font-size:14px;">' + _escHtml(itemName) + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);font-size:14px;text-align:center;">' + rxQtyCell + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);font-size:14px;text-align:center;">' + cartQtyCell + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);font-size:14px;text-align:center;">' + diffCell + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--border,#B2DFDE);font-size:14px;text-align:right;">' + amountCell + '</td>' +
          '</tr>';
      }

      // Non-match rows first (visible)
      for (var i = 0; i < nonMatchRows.length; i++) {
        tbodyRows += _rowHtml(nonMatchRows[i], false);
      }
      // Match rows (hidden by default)
      for (var j = 0; j < matchRows.length; j++) {
        tbodyRows += _rowHtml(matchRows[j], true);
      }

      tableHtml = toggleHtml +
        '<table style="border-collapse:collapse;width:100%;">' +
        thead +
        '<tbody>' + tbodyRows + '</tbody>' +
        '</table>';
    }

    // ── Close button at bottom ──
    var closeBtn = '<div style="text-align:center;margin-top:18px;">' +
      '<button onclick="(function(){var el=document.getElementById(\'rxCompareOverlay\');if(el)el.remove();})()" ' +
      'style="background:var(--g-btn,#35a09e);color:#fff;border:none;border-radius:7px;padding:9px 28px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;">닫기</button>' +
      '</div>';

    body.innerHTML = summaryHtml + tableHtml + closeBtn;
  }

  /* ────────────────────────────────────────────────
   * _onRxFileSelected(input)
   * Called when user picks a PDF from the file input.
   * ──────────────────────────────────────────────── */
  function _onRxFileSelected(input) {
    var file = input.files && input.files[0];
    if (!file) return;

    var body = document.getElementById('rxCompareBody');
    if (!body) return;

    // Show loading state
    body.innerHTML =
      '<div style="text-align:center;padding:40px 0;font-size:15px;color:var(--g-dark,#2A8A88);">' +
      '<div style="font-size:28px;margin-bottom:12px;">⏳</div>' +
      '<div style="font-weight:700;">처방전 분석 중...</div>' +
      '</div>';

    // Reset file input value so same file can be re-selected
    input.value = '';

    // Async parse
    (async function () {
      var json = null;
      try {
        json = await parsePdfToJSON(file);
      } catch (err) {
        json = null;
      }

      if (!json || !json.rxRows || json.rxRows.length === 0) {
        body.innerHTML = _uploadZoneHtml(true);
        _attachFileInputListener();
        return;
      }

      _showResults(json);
    })();
  }

  /* ────────────────────────────────────────────────
   * _uploadZoneHtml(showError)
   * Returns HTML for the initial upload zone inside modal body.
   * ──────────────────────────────────────────────── */
  function _uploadZoneHtml(showError) {
    var errorHtml = '';
    if (showError) {
      errorHtml = '<div style="color:var(--red,#C62828);font-size:13px;margin-bottom:12px;font-weight:700;">' +
        '처방전 PDF를 읽지 못했습니다. 파일을 확인하고 다시 시도하세요.' +
        '</div>';
    }
    return '<div id="rxCmpUploadZone" style="text-align:center;padding:40px 24px;">' +
      errorHtml +
      '<div style="font-size:17px;font-weight:700;margin-bottom:8px;">처방전 PDF를 선택하세요</div>' +
      '<div style="font-size:13px;color:var(--muted,#666);margin-bottom:20px;line-height:1.6;">' +
        '비교할 처방전 PDF 파일을 업로드하면<br>현재 카트와 자동으로 대조합니다.' +
      '</div>' +
      '<button id="rxCmpSelectBtn" onclick="document.getElementById(\'rxComparePdfInput\').click()" ' +
        'style="background:var(--g-btn,#3AACAA);color:#fff;border:none;border-radius:7px;padding:11px 24px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;">' +
        '📂&nbsp; 처방전 PDF 선택' +
      '</button>' +
      '<input type="file" id="rxComparePdfInput" accept=".pdf" style="display:none">' +
      '</div>';
  }

  /* ────────────────────────────────────────────────
   * _attachFileInputListener()
   * Wire the file input inside the modal to _onRxFileSelected.
   * Must be called after upload zone HTML is inserted into DOM.
   * ──────────────────────────────────────────────── */
  function _attachFileInputListener() {
    var inp = document.getElementById('rxComparePdfInput');
    if (inp) {
      inp.onchange = function () { _onRxFileSelected(this); };
    }
  }

  /* ────────────────────────────────────────────────
   * _escHtml(str)
   * Minimal HTML escaping to prevent XSS in dynamic content.
   * ──────────────────────────────────────────────── */
  function _escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ────────────────────────────────────────────────
   * openCompareModal()
   * Public entry point — called by toolbar button.
   * ──────────────────────────────────────────────── */
  function openCompareModal() {
    // D-02: Empty cart guard
    if (!cart || cart.length === 0) {
      showToast('카트가 비어있습니다. 거래명세표에 제품을 먼저 추가하세요.', true);
      return;
    }

    // Remove any existing modal to prevent duplicates
    var prev = document.getElementById('rxCompareOverlay');
    if (prev) prev.remove();

    // Create overlay
    var overlay = document.createElement('div');
    overlay.id = 'rxCompareOverlay';

    overlay.innerHTML =
      '<style>' +
        '#rxCompareOverlay{position:fixed;inset:0;background:rgba(0,0,0,.48);z-index:9900;display:flex;align-items:center;justify-content:center;}' +
        '#rxCompareModal{background:#fff;border-radius:14px;width:min(600px,94vw);max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.3);}' +
        '#rxCmpHdr{background:var(--g-dark,#2A8A88);color:#fff;border-radius:14px 14px 0 0;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;}' +
        '#rxCmpHdr h2{margin:0;font-size:16px;font-weight:700;}' +
        '#rxCmpClose{border:none;background:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;}' +
        '#rxCompareBody{padding:20px 18px 18px;}' +
        '.rxcmp-row-match td{color:var(--muted,#666);}' +
      '</style>' +
      '<div id="rxCompareModal">' +
        '<div id="rxCmpHdr">' +
          '<h2>📊 처방전↔거래명세표 비교</h2>' +
          '<button id="rxCmpClose" onclick="(function(){var el=document.getElementById(\'rxCompareOverlay\');if(el)el.remove();})()" title="닫기">✕</button>' +
        '</div>' +
        '<div id="rxCompareBody">' +
          _uploadZoneHtml(false) +
        '</div>' +
      '</div>';

    // Click-outside closes modal
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closeModal();
    });

    document.body.appendChild(overlay);

    // Wire the file input
    _attachFileInputListener();
  }

  /* ────────────────────────────────────────────────
   * Public namespace
   * ──────────────────────────────────────────────── */
  window.RxCompareUI = { openCompareModal: openCompareModal };

})();
