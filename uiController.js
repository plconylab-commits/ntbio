/**
 * uiController.js
 * 처방전 검증 모달 UI & 장바구니 적용 로직
 * 의존: productDB.js (PRODUCT_DB), productMapper.js (findProduct),
 *       prescriptionModel.js (calcRequiredQty)
 */

/* ───────────────────────────────────────────
   CSS 동적 삽입
   ─────────────────────────────────────────── */
(function injectValidationCSS() {
  if (document.getElementById('vld-css')) return;
  const style = document.createElement('style');
  style.id = 'vld-css';
  style.textContent = `
    #validationOverlay .modal {
      width: 95vw;
      max-width: 900px;
    }
    .vld-info {
      display: flex; gap: 16px; flex-wrap: wrap;
      margin-bottom: 14px; font-size: 14px; color: #555;
    }
    .vld-info b { color: #222; }
    .vld-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .vld-table th {
      background: #f5f5f5;
      padding: 8px 6px;
      border-bottom: 2px solid #ddd;
      text-align: left;
      white-space: nowrap;
    }
    .vld-table td {
      padding: 7px 6px;
      border-bottom: 1px solid #eee;
      vertical-align: middle;
    }
    .vld-row-red    { background: #fff0f0 !important; }
    .vld-row-yellow { background: #fffbe6 !important; }
    .vld-row-red td:nth-child(3)    { color: #c00; font-weight: 700; }
    .vld-row-yellow td:nth-child(3) { color: #b58900; font-weight: 600; }
    .vld-table select {
      width: 100%; padding: 4px; font-size: 12px;
      border: 1px solid #ccc; border-radius: 4px;
    }
    .vld-table input[type=number] {
      width: 70px; padding: 4px; text-align: right;
      border: 1px solid #ccc; border-radius: 4px; font-size: 13px;
    }
    .vld-apply-btn {
      display: block; width: 100%; margin-top: 16px;
      padding: 14px; font-size: 16px; font-weight: 700;
      color: #fff; background: var(--g-dark, #2A8A88);
      border: none; border-radius: 8px; cursor: pointer;
    }
    .vld-apply-btn:active { opacity: .85; }
    .vld-legend {
      display: flex; gap: 14px; margin-top: 10px; font-size: 12px; color: #777;
    }
    .vld-legend span::before {
      content: ''; display: inline-block;
      width: 12px; height: 12px; border-radius: 2px;
      margin-right: 4px; vertical-align: middle;
    }
    .vld-legend .lg-red::before    { background: #fff0f0; border: 1px solid #fcc; }
    .vld-legend .lg-yellow::before { background: #fffbe6; border: 1px solid #eed; }
  `;
  document.head.appendChild(style);
})();

/* ───────────────────────────────────────────
   검증 모달 열기
   ─────────────────────────────────────────── */

/**
 * @param {object} rx - prescriptionModel 스키마 형태의 JSON
 *   { farmInfo: { farmName, cropName, totalArea }, prescriptions: [...] }
 */
function openValidationModal(rx) {
  // 기존 오버레이 제거
  closeValidationModal();

  const fi = rx.farmInfo || {};
  const totalArea = fi.totalArea || 0;

  // ── 행 데이터 구성 ──
  const rows = [];
  (rx.prescriptions || []).forEach(entry => {
    (entry.items || []).forEach(item => {
      const match = findProduct(item.originalName);
      const finalQty = calcRequiredQty(totalArea, item.baseArea, item.baseQty);

      // 하이라이트 판별
      let rowClass = '';
      if (!match) {
        rowClass = 'vld-row-red';
      } else if (match.confidence < 0.9 || (item.baseQty > 0 && finalQty >= item.baseQty * 3)) {
        rowClass = 'vld-row-yellow';
      }

      rows.push({
        stageLabel: entry.stageLabel || entry.stage || '',
        stageType:  entry.stageType  || entry.type  || '',
        originalName: item.originalName,
        matchId: match ? match.id : '',
        matchName: match ? match.name : '미매칭',
        price: match ? match.price : 0,
        confidence: match ? match.confidence : 0,
        baseQty: item.baseQty,
        unit: item.unit,
        finalQty,
        size: match ? (PRODUCT_DB.find(p => p.id === match.id) || {}).size || '' : '',
        rowClass
      });
    });
  });

  // ── 드롭다운 옵션 HTML (PRODUCT_DB 전체) ──
  const optionsHTML = '<option value="">-- 미매칭 --</option>' +
    PRODUCT_DB.map(p =>
      `<option value="${p.id}" data-price="${p.price}" data-size="${p.size}">${p.name} (${p.size})</option>`
    ).join('');

  // ── 테이블 행 HTML ──
  const tbodyHTML = rows.map((r, i) => {
    const selHTML = optionsHTML.replace(
      r.matchId ? `value="${r.matchId}"` : 'value=""',
      (r.matchId ? `value="${r.matchId}"` : 'value=""') + ' selected'
    );
    const stageDisplay = r.stageLabel
      ? `<strong>${r.stageLabel}</strong><br><small style="color:#888;">(${r.stageType})</small>`
      : r.stageType;
    return `<tr class="${r.rowClass}" data-idx="${i}">
      <td>${stageDisplay}</td>
      <td>${r.originalName}</td>
      <td><select class="vld-sel" data-idx="${i}">${selHTML}</select></td>
      <td style="text-align:right">${r.baseQty} ${r.unit}</td>
      <td><input type="number" class="vld-qty" data-idx="${i}" value="${r.finalQty}" min="0"></td>
      <td class="vld-price" data-idx="${i}" style="text-align:right">₩${(r.price||0).toLocaleString()}</td>
    </tr>`;
  }).join('');

  // ── 모달 HTML ──
  const html = `
    <div class="overlay on" id="validationOverlay" onclick="_vldCloseOut(event)">
      <div class="modal">
        <div class="modal-hdr">
          <h2>처방전 검증</h2>
          <button class="modal-x" onclick="closeValidationModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="vld-info">
            <span>농가명: <b>${fi.farmName || '-'}</b></span>
            <span>작물: <b>${fi.cropName || '-'}</b></span>
            <span>전체 평수: <b>${totalArea ? totalArea + '평' : '-'}</b></span>
          </div>
          <div style="overflow-x:auto">
            <table class="vld-table">
              <thead><tr>
                <th>시기/목적</th><th>원본 제품명</th><th>매칭 제품</th>
                <th>기준 수량</th><th>최종 수량</th><th>단가</th>
              </tr></thead>
              <tbody>${tbodyHTML}</tbody>
            </table>
          </div>
          <div class="vld-legend">
            <span class="lg-red">매칭 실패</span>
            <span class="lg-yellow">확인 필요</span>
          </div>
          <button class="vld-apply-btn" onclick="_applyToCart()">명세표에 적용하기</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  // ── 드롭다운 변경 이벤트: 단가 업데이트 ──
  document.querySelectorAll('#validationOverlay .vld-sel').forEach(sel => {
    sel.addEventListener('change', function() {
      const idx = this.dataset.idx;
      const opt = this.selectedOptions[0];
      const price = opt ? Number(opt.dataset.price || 0) : 0;
      const size  = opt ? (opt.dataset.size || '') : '';
      const priceCell = document.querySelector(`.vld-price[data-idx="${idx}"]`);
      if (priceCell) priceCell.textContent = '₩' + price.toLocaleString();
      // 행 데이터 업데이트
      rows[idx].matchId = this.value;
      rows[idx].matchName = opt ? opt.textContent : '미매칭';
      rows[idx].price = price;
      rows[idx].size = size;
      // 하이라이트 업데이트
      const tr = this.closest('tr');
      tr.className = this.value ? '' : 'vld-row-red';
    });
  });

  // 내부 데이터 저장 (적용 시 사용)
  window._vldRows = rows;
}

/* ───────────────────────────────────────────
   장바구니에 적용
   ─────────────────────────────────────────── */
function _applyToCart() {
  const rows = window._vldRows || [];
  // 수량 입력값 반영
  document.querySelectorAll('#validationOverlay .vld-qty').forEach(inp => {
    const idx = Number(inp.dataset.idx);
    if (rows[idx]) rows[idx].finalQty = Number(inp.value) || 0;
  });

  rows.forEach(r => {
    if (!r.matchId || r.finalQty <= 0) return; // 미매칭이거나 수량 0이면 건너뜀
    const prod = PRODUCT_DB.find(p => p.id === r.matchId);
    if (!prod) return;

    cart.push({
      i: 'rx_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name: prod.name,
      size: prod.size || '',
      retail: prod.price,
      disc: 0,
      sp: prod.price,
      qty: Math.ceil(r.finalQty),
      gift: false,
      custom: true
    });
  });

  if (typeof render === 'function') render();
  closeValidationModal();
}

/* ───────────────────────────────────────────
   모달 닫기
   ─────────────────────────────────────────── */
function closeValidationModal() {
  const el = document.getElementById('validationOverlay');
  if (el) el.remove();
  window._vldRows = null;
}

function _vldCloseOut(e) {
  if (e.target.id === 'validationOverlay') closeValidationModal();
}
