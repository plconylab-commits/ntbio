/**
 * uiController.js  v3
 * 처방전 검증 모달 UI & 장바구니 적용 로직
 * 의존: productDB.js (PRODUCT_DB), productMapper.js (findProduct, findProductWithSize),
 *       prescriptionModel.js (calcRequiredQty), rxNormalizer.js (normalizeStageLabel)
 *
 * v2 변경 사항:
 *   - RxRow 스키마 지원 (rxRows 배열 → 확장 컬럼 표시)
 *   - 일괄 작업 바: cc→ml 변환 / 단계명 정규화 / 경고행 필터 / 빈 용량 채우기
 *   - 컬럼 확장: 단계명원문·정규화 / 제품원문·정규화 / 용량 / 기준평수 / 처방수량 / 최종수량 / 경고
 *   - 적용 전 사람 검토 강제 (자동 적용 없음)
 *   - 원문 손실 없음: originalText 항상 보존
 */

/* ───────────────────────────────────────────
   CSS 동적 삽입
   ─────────────────────────────────────────── */
function injectValidationCSS() {
  if (document.getElementById('vld-css')) return;
  const style = document.createElement('style');
  style.id = 'vld-css';
  style.textContent = `
    /* ── 모달 컨테이너 ── */
    #validationOverlay .modal {
      width: 98vw; max-width: 1100px;
      max-height: 90vh;
      display: flex; flex-direction: column; overflow: hidden;
    }
    #validationOverlay .modal-hdr { flex-shrink: 0; }
    #validationOverlay .modal-body {
      flex: 1 1 auto; overflow-y: auto;
      padding: 12px 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
    #validationOverlay .vld-footer {
      flex-shrink: 0; padding: 12px 16px 16px;
      border-top: 1px solid #eee; background: #fff;
    }

    /* ── 농가 정보 행 ── */
    .vld-info {
      display: flex; gap: 16px; flex-wrap: wrap;
      font-size: 14px; color: #555; flex-shrink: 0;
    }
    .vld-info b { color: #222; }

    /* ── 일괄 작업 바 ── */
    .vld-bulk-bar {
      display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
      padding: 8px 10px; background: #f7f7f7;
      border: 1px solid #e0e0e0; border-radius: 6px;
      flex-shrink: 0;
    }
    .vld-bulk-bar label {
      font-size: 12px; color: #555; font-weight: 600;
      margin-right: 4px;
    }
    .vld-bulk-btn {
      font-size: 12px; padding: 4px 10px;
      border: 1.5px solid var(--teal, #2A8A88);
      border-radius: 4px; background: #fff;
      color: var(--teal, #2A8A88); cursor: pointer;
      white-space: nowrap;
    }
    .vld-bulk-btn:hover { background: var(--teal-light, #e8f5f5); }
    .vld-bulk-btn.active { background: var(--teal, #2A8A88); color: #fff; }
    .vld-filter-count {
      font-size: 11px; color: #999; margin-left: 6px;
    }

    /* ── 범례 ── */
    .vld-legend {
      display: flex; gap: 14px; font-size: 12px; color: #777;
      flex-shrink: 0;
    }
    .vld-legend span::before {
      content: ''; display: inline-block;
      width: 12px; height: 12px; border-radius: 2px;
      margin-right: 4px; vertical-align: middle;
    }
    .vld-legend .lg-red::before    { background: #fff0f0; border: 1px solid #fcc; }
    .vld-legend .lg-yellow::before { background: #fffbe6; border: 1px solid #eed; }
    .vld-legend .lg-green::before  { background: #f0fff4; border: 1px solid #9e9; }

    /* ── 테이블 래퍼 ── */
    .vld-table-wrap {
      flex: 1 1 auto; overflow: auto;
      border: 1px solid #eee; border-radius: 6px;
    }
    .vld-table {
      width: 100%; border-collapse: collapse; font-size: 12px;
      min-width: 900px;
    }
    .vld-table thead th {
      position: sticky; top: 0; z-index: 1;
      background: #f5f5f5;
    }
    .vld-table th {
      padding: 7px 6px; border-bottom: 2px solid #ddd;
      text-align: left; white-space: nowrap; font-size: 11px;
    }
    .vld-table td {
      padding: 5px 6px; border-bottom: 1px solid #eee;
      vertical-align: top;
    }

    /* ── 행 색상 ── */
    .vld-row-red    { background: #fff0f0 !important; }
    .vld-row-yellow { background: #fffbe6 !important; }
    .vld-row-green  { background: #f0fff4 !important; }

    /* ── 입력 요소 ── */
    .vld-stage-label {
      width: 100%; min-width: 90px; font-size: 11px;
      padding: 3px 5px; border: 1px solid #ddd; border-radius: 4px;
      resize: vertical; font-family: inherit; line-height: 1.4;
      min-height: 34px; max-height: 100px; overflow-y: auto;
    }
    .vld-stage-norm {
      width: 100%; min-width: 80px; font-size: 11px;
      padding: 3px 5px; border: 1px solid #c8e6c9; border-radius: 4px;
      background: #f9fffe; font-family: inherit;
    }
    .vld-prod-name {
      width: 100%; font-size: 11px;
      padding: 3px 5px; border: 1px solid #ddd; border-radius: 4px;
    }
    .vld-pkg-input {
      width: 72px; font-size: 11px;
      padding: 3px 5px; border: 1px solid #ddd; border-radius: 4px;
    }
    .vld-area-input {
      width: 60px; font-size: 11px; text-align: right;
      padding: 3px 5px; border: 1px solid #ddd; border-radius: 4px;
    }
    .vld-table select {
      width: 100%; padding: 4px; font-size: 11px;
      border: 1px solid #ccc; border-radius: 4px;
    }
    .vld-table input[type=number] {
      width: 60px; padding: 4px; text-align: right;
      border: 1px solid #ccc; border-radius: 4px; font-size: 12px;
    }

    /* ── confidence 뱃지 ── */
    .conf-badge {
      display: inline-block; padding: 1px 5px;
      border-radius: 10px; font-size: 10px; font-weight: 700;
      white-space: nowrap;
    }
    .conf-high   { background: #d4edda; color: #155724; }
    .conf-medium { background: #fff3cd; color: #856404; }
    .conf-low    { background: #f8d7da; color: #721c24; }

    /* ── 경고 아이콘 ── */
    .warn-icon {
      cursor: pointer; font-size: 13px;
      position: relative; display: inline-block;
    }
    .warn-icon .warn-tip {
      display: none; position: absolute; z-index: 100;
      bottom: 120%; left: 0; white-space: pre-wrap;
      background: #333; color: #fff; font-size: 11px;
      padding: 6px 8px; border-radius: 4px;
      min-width: 200px; max-width: 320px;
      box-shadow: 0 2px 8px rgba(0,0,0,.3);
    }
    .warn-icon:hover .warn-tip { display: block; }

    /* ── 숨겨진 행 ── */
    .vld-row-hidden { display: none; }

    /* ── 선택형 셀 병합 UI ── */
    .vld-group-hdr-row { cursor: pointer; user-select: none; }
    .vld-group-hdr-row.cell-selected td {
      background: #b3e8e3 !important;
      outline: 2px solid #2A8A88; outline-offset: -2px;
    }
    #vld-cell-menu {
      position: fixed; z-index: 9999;
      background: #fff; border: 1px solid #ccc;
      border-radius: 8px; padding: 6px 8px;
      box-shadow: 0 4px 18px rgba(0,0,0,.18);
      display: none; gap: 6px; align-items: center;
    }
    #vld-cell-menu.visible { display: flex; }
    #vld-cell-menu button {
      font-size: 12px; padding: 5px 12px;
      border-radius: 5px; cursor: pointer;
      border: 1.5px solid #2A8A88;
      background: #fff; color: #2A8A88; white-space: nowrap;
    }
    #vld-cell-menu button:hover { background: #e8f5f5; }
    #vld-cell-menu button:disabled {
      border-color: #ccc; color: #bbb; cursor: not-allowed; background: #fafafa;
    }
    #vld-cell-menu .menu-info { font-size: 11px; color: #888; margin-right: 2px; }

    /* ── 2계층: 그룹 헤더 행 ── */
    .vld-group-hdr-row td {
      background: #e6f4f4 !important;
      padding: 8px 12px !important;
      font-weight: 700; font-size: 13px;
      border-top: 2px solid #2A8A88;
      color: #1a6060;
    }
    .vld-group-type-badge {
      display: inline-block;
      background: #2A8A88; color: #fff;
      padding: 1px 8px; border-radius: 10px;
      font-size: 11px; margin-right: 8px;
      vertical-align: middle;
    }
    /* ── 2계층: 하위 단계 헤더 행 ── */
    .vld-stage-hdr-row td {
      background: #f5f9f9 !important;
      padding: 4px 12px 4px 24px !important;
      font-weight: 600; font-size: 11px;
      border-left: 3px solid #74c0bc;
      color: #446;
    }

    /* ── 원문 토글 ── */
    .orig-text {
      font-size: 10px; color: #aaa;
      max-width: 140px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
      display: block; cursor: help;
    }

    /* ── 적용 버튼 ── */
    .vld-apply-btn {
      display: block; width: 100%;
      padding: 14px; font-size: 16px; font-weight: 700;
      color: #fff; background: var(--g-dark, #2A8A88);
      border: none; border-radius: 8px; cursor: pointer;
    }
    .vld-apply-btn:active { opacity: .85; }
    .vld-apply-btn:disabled {
      background: #bbb; cursor: not-allowed;
    }

    /* ── 고객 정보 바 ── */
    .vld-customer-bar {
      display: flex; flex-wrap: wrap; gap: 8px 14px;
      padding: 11px 14px; background: #eef7f6;
      border: 1px solid #b8dedc; border-radius: 8px;
      margin-bottom: 10px; align-items: center;
    }
    .vld-customer-bar .vld-cust-label {
      font-size: 12px; font-weight: 700; color: #2a8a88; white-space: nowrap;
    }
    .vld-customer-bar .vld-cust-field {
      display: flex; align-items: center; gap: 5px;
    }
    .vld-cust-inp {
      padding: 5px 10px; border: 1px solid #c0d8d8; border-radius: 6px;
      font-size: 13px; min-width: 90px;
    }
    .vld-cust-inp:focus { outline: none; border-color: #2a8a88; }
    .vld-cust-addr { min-width: 200px; }
  `;
  document.head.appendChild(style);
}

/* ───────────────────────────────────────────
   내부 상태
   ─────────────────────────────────────────── */

/** @type {Array<VldRow>} — 검증 모달이 현재 표시 중인 행 데이터 */
window._vldRows = null;

/** 경고 행만 보기 토글 상태 */
window._vldShowWarningsOnly = false;

/** 선택형 셀 병합 UI 상태 */
window._vldRxGroups  = null;         // live mutable rxGroups (cellId 포함)
window._vldCellSel   = new Set();    // 현재 선택된 cellId Set
window._vldLastCell  = null;         // shift+click 기준점

/* ───────────────────────────────────────────
   헬퍼: confidence 뱃지
   ─────────────────────────────────────────── */
function _confBadge(conf) {
  const pct = Math.round((conf || 0) * 100);
  const cls = pct >= 90 ? 'conf-high' : pct >= 60 ? 'conf-medium' : 'conf-low';
  return `<span class="conf-badge ${cls}">${pct}%</span>`;
}

/* ───────────────────────────────────────────
   헬퍼: 경고 아이콘 (툴팁)
   ─────────────────────────────────────────── */
function _warnIcon(warnings) {
  if (!warnings || !warnings.length) return '';
  const tip = warnings.join('\n');
  return `<span class="warn-icon">⚠️<span class="warn-tip">${tip.replace(/</g,'&lt;')}</span></span>`;
}

/* ───────────────────────────────────────────
   RxRow → VldRow 변환
   검증 모달 내부에서 편집·표시에 사용하는 평탄화된 형태
   ─────────────────────────────────────────── */
function _rxRowToVldRow(rxRow, totalArea) {
  // 제품 매칭: 용량 제거 후 이름 우선, 없으면 원문
  const nameForMatch = rxRow.productName || rxRow.originalText || '';
  // findProductWithSize가 있으면 2단계 매칭, 없으면 기존 findProduct
  const match = (typeof findProductWithSize === 'function')
    ? findProductWithSize(nameForMatch, rxRow.packageSizeRaw || '')
    : findProduct(nameForMatch);

  const dosageQty = rxRow.dosageQty;
  const baseArea  = rxRow.baseArea;
  const finalQty  = calcRequiredQty(totalArea, baseArea, dosageQty) || 0;

  let rowClass = '';
  if (!match) {
    rowClass = 'vld-row-red';
  } else if (match.confidence < 0.9 || (dosageQty > 0 && finalQty >= dosageQty * 5)) {
    rowClass = 'vld-row-yellow';
  } else if (match.confidence >= 0.95 && dosageQty > 0) {
    rowClass = 'vld-row-green';
  }

  return {
    // origin
    originalText:     rxRow.originalText || '',
    sourcePage:       rxRow.sourcePage,
    // stage (편집 가능)
    stageRaw:         rxRow.stageRaw || '',
    stageNormalized:  rxRow.stageNormalized || '',
    stageType:        rxRow.stageType || '',
    // product (편집 가능)
    productRaw:       rxRow.productRaw || rxRow.originalText || '',
    productName:      rxRow.productName || '',
    matchId:          match ? match.id : '',
    matchName:        match ? match.name : '미매칭',
    price:            match ? match.price : 0,
    confidence:       match ? match.confidence : 0,
    // package size (편집 가능)
    packageSizeRaw:   rxRow.packageSizeRaw || '',
    packageSizeValue: rxRow.packageSizeValue,
    packageSizeUnit:  rxRow.packageSizeUnit || '',
    packageSizeMl:    rxRow.packageSizeMl,
    // dosage
    dosageRaw:        rxRow.dosageRaw || '',
    dosageQty,
    dosageUnit:       rxRow.dosageUnit || '',
    // area (편집 가능)
    baseAreaRaw:      rxRow.baseAreaRaw || '',
    baseArea,
    // usage
    applicationMethod: rxRow.applicationMethod || '',
    note:             rxRow.note || '',
    // computed
    finalQty,
    size:             match ? (PRODUCT_DB.find(p => p.id === match.id) || {}).size || '' : '',
    rowClass,
    // quality
    warnings:         [...(rxRow.warnings || [])],
    parseLog:         rxRow.parseLog || []
  };
}

/* ───────────────────────────────────────────
   prescriptions 형식 → VldRow 변환 (하위 호환)
   ─────────────────────────────────────────── */
function _legacyEntryToVldRows(entry, totalArea) {
  return (entry.items || []).map(item => {
    const match    = findProduct(item.originalName);
    const finalQty = calcRequiredQty(totalArea, item.baseArea, item.baseQty) || 0;
    let rowClass = '';
    if (!match)                              rowClass = 'vld-row-red';
    else if (match.confidence < 0.9)         rowClass = 'vld-row-yellow';

    return {
      originalText:     item.originalName,
      sourcePage:       entry.sourcePage,
      stageRaw:         entry.stageLabel || '',
      stageNormalized:  entry.stageLabel || '',
      stageType:        entry.stageType  || '',
      productRaw:       item.originalName,
      productName:      item.originalName,
      matchId:          match ? match.id : '',
      matchName:        match ? match.name : '미매칭',
      price:            match ? match.price : 0,
      confidence:       match ? match.confidence : 0,
      packageSizeRaw:   '', packageSizeValue: null, packageSizeUnit: '', packageSizeMl: null,
      dosageRaw:        item.baseQty != null ? `${item.baseQty}${item.unit}` : '',
      dosageQty:        item.baseQty,
      dosageUnit:       item.unit || '',
      baseAreaRaw:      item.baseArea ? `${item.baseArea}평` : '',
      baseArea:         item.baseArea || null,
      applicationMethod:'',
      note:             '',
      finalQty,
      size:             match ? (PRODUCT_DB.find(p => p.id === match.id) || {}).size || '' : '',
      rowClass,
      warnings:         [],
      parseLog:         []
    };
  });
}

/* ───────────────────────────────────────────
   rxGroups(2계층) → VldRow[] 변환
   groupHeader/stage 구분 sentinel 행을 포함해 평탄화한다.
   ─────────────────────────────────────────── */
function _buildVldRowsFromRxGroups(rxGroups, totalArea) {
  const rows = [];

  rxGroups.forEach(group => {
    const productCount = group.stages.reduce(
      (sum, s) => sum + (s.rxRows || []).length + (!(s.rxRows||[]).length ? (s.items||[]).length : 0), 0
    );

    // ── 그룹 헤더 sentinel (테이블에 구분선 행으로 렌더됨) ──────────
    // monthInfo: 그룹 자체 + 모든 하위 단계에서 추출한 월 정보 합산
    const allMonthInfos = [group.monthInfo || ''];
    group.stages.forEach(s => { if (s.monthInfo) allMonthInfos.push(s.monthInfo); });
    const groupMonthInfo = [...new Set(allMonthInfos.join(', ').split(',').map(s => s.trim()).filter(Boolean))].join(', ');

    rows.push({
      _rowKind:      'group-header',
      _cellId:       group.cellId,        // 선택형 병합용 ID
      _merged:       group.merged || false,
      _groupHeader:  group.groupHeader,
      _groupType:    group.groupType,
      _monthInfo:    groupMonthInfo,      // 시기 정보 (pdfParser에서 추출)
      _sourcePage:   group.sourcePage,
      _productCount: productCount
    });

    group.stages.forEach(stage => {
      // ── 하위 단계 헤더 (stageName이 있을 때만) ────────────────────
      if (stage.stageName) {
        rows.push({
          _rowKind:    'stage-header',
          _stageName:  stage.stageName,
          _stageType:  stage.stageType,
          _stageOrder: stage.stageOrder
        });
      }

      // ── 제품 행: rxRows 우선 ──────────────────────────────────────
      const rxRowList = stage.rxRows || [];
      if (rxRowList.length > 0) {
        rxRowList.forEach(rxRow => {
          const vldRow = _rxRowToVldRow(rxRow, totalArea);
          vldRow._rowKind     = 'product';
          vldRow._groupHeader = group.groupHeader;
          vldRow._groupType   = group.groupType;
          vldRow._stageName   = stage.stageName;
          rows.push(vldRow);
        });
      } else {
        // ── 폴백: legacy items ─────────────────────────────────────
        const legacyRows = _legacyEntryToVldRows({
          stageType:  stage.stageType,
          stageLabel: stage.stageLabel || group.groupHeader,
          items:      stage.items || [],
          sourcePage: group.sourcePage
        }, totalArea);
        legacyRows.forEach(lr => {
          lr._rowKind     = 'product';
          lr._groupHeader = group.groupHeader;
          lr._groupType   = group.groupType;
          lr._stageName   = stage.stageName;
          rows.push(lr);
        });
      }
    });
  });

  return rows;
}

/* ───────────────────────────────────────────
   검증 모달 열기
   ─────────────────────────────────────────── */

/**
 * @param {object} rx - parsePdfToJSON() 반환값
 *   { farmInfo, prescriptions, rxRows? }
 */
function openValidationModal(rx) {
  closeValidationModal();
  injectValidationCSS();

  const fi = rx.farmInfo || {};
  const _areaEl = document.getElementById('cArea');
  const totalArea = Number(fi.totalArea) || (_areaEl ? Number(_areaEl.value) || 0 : 0);

  // ── 행 데이터 구성: rxGroups(2계층) → rxRows(flat) → prescriptions(레거시) ──
  let rows;
  if (rx.rxGroups && rx.rxGroups.length > 0) {
    rows = _buildVldRowsFromRxGroups(rx.rxGroups, totalArea);
  } else if (rx.rxRows && rx.rxRows.length > 0) {
    rows = rx.rxRows.map(r => _rxRowToVldRow(r, totalArea));
  } else {
    rows = [];
    (rx.prescriptions || []).forEach(entry => {
      rows.push(..._legacyEntryToVldRows(entry, totalArea));
    });
  }

  if (!rows.length) {
    alert('처방전에서 인식된 제품이 없습니다.');
    return;
  }

  // ── 상태 초기화 ──
  window._vldRows              = rows;
  window._vldShowWarningsOnly  = false;
  window._vldTotalArea         = totalArea;
  window._vldCellSel           = new Set();
  window._vldLastCell          = null;

  // cellId 부여 (없을 경우) 후 live reference 저장
  if (rx.rxGroups && rx.rxGroups.length > 0) {
    rx.rxGroups.forEach((g, i) => { if (!g.cellId) g.cellId = `g${i}`; });
    window._vldRxGroups = rx.rxGroups;
  } else {
    window._vldRxGroups = null;
  }

  // ── 드롭다운 옵션 HTML ──
  const optionsHTML = '<option value="">-- 미매칭 --</option>' +
    PRODUCT_DB.map(p =>
      `<option value="${p.id}" data-price="${p.price}" data-size="${p.size||''}">${p.name} (${p.size||''})</option>`
    ).join('');

  // 파일명에서 고객명·작물·평수 파싱 → 폼 즉시 반영 (pdfParser는 표지 이미지라 항상 null 반환)
  (function(filename) {
    if (!filename) return;
    const base = filename.replace(/\.pdf$/i, '');
    const areaM = base.match(/\((\d+)평\)/);
    const cropM = base.match(/^([가-힣]+)/);
    const nameMs = [...base.matchAll(/([가-힣]{2,6})님/g)];
    const parsedName = nameMs.length ? nameMs[nameMs.length - 1][1] : null;
    const parsedCrop = cropM ? cropM[1] : null;
    const parsedArea = areaM ? parseInt(areaM[1], 10) : null;
    if (parsedName) { const el = document.getElementById('cName'); if (el) el.value = parsedName; }
    if (parsedArea) { const el = document.getElementById('cArea'); if (el) el.value = parsedArea; }
    if (parsedCrop) {
      const el = document.getElementById('cCrop');
      if (el) {
        el.value = parsedCrop;
        if (!el.value || el.value === '') {
          for (let i = 0; i < el.options.length; i++) {
            if (el.options[i].text.includes(parsedCrop) || parsedCrop.includes(el.options[i].text)) { el.selectedIndex = i; break; }
          }
        }
      }
    }
  })(rx._sourceFilename);

  // 파일명 파싱 결과를 fi에도 반영 (모달 헤더 표시용)
  if (!fi.farmName) fi.farmName = document.getElementById('cName')?.value || null;
  if (!fi.cropName) {
    const sel = document.getElementById('cCrop');
    fi.cropName = sel ? (sel.options[sel.selectedIndex]?.text || sel.value || null) : null;
  }

  // ── 모달 렌더 ──
  _renderValidationModal(fi, totalArea, optionsHTML);
}

/* ───────────────────────────────────────────
   모달 DOM 생성 (헤더/바디/푸터 분리)
   ─────────────────────────────────────────── */
function _renderValidationModal(fi, totalArea, optionsHTML) {
  const rows = window._vldRows || [];
  const warningCount = rows.filter(r => r.warnings && r.warnings.length).length;

  // 고객 정보: 현재 입력 필드 값 (수정 가능하게 pre-fill)
  const _cName  = document.getElementById('cName')?.value  || '';
  const _cPhone = document.getElementById('cPhone')?.value || '';
  const _cAddr  = document.getElementById('cAddr')?.value  || '';

  const html = `
    <div class="overlay on" id="validationOverlay" onclick="_vldCloseOut(event)">
      <div class="modal">

        <!-- 헤더 -->
        <div class="modal-hdr" style="flex-shrink:0;">
          <h2>처방전 검증 <span style="font-size:13px;font-weight:400;color:#888;">(${rows.length}개 제품)</span></h2>
          <button class="modal-x" onclick="closeValidationModal()">✕</button>
        </div>

        <!-- 플로팅 셀 병합 메뉴 (position:fixed, 선택 시 표시) -->
        <div id="vld-cell-menu">
          <span class="menu-info" id="vld-menu-info"></span>
          <button id="vld-btn-merge"  onclick="_vldMergeSel()">셀 합치기</button>
          <button id="vld-btn-split"  onclick="_vldSplitSel()">셀 나누기</button>
          <button onclick="_vldClearCellSel()">선택 해제</button>
        </div>

        <!-- 본문 -->
        <div class="modal-body">

          <!-- 농가 정보 -->
          <div class="vld-info">
            <span>농가명: <b>${fi.farmName || '-'}</b></span>
            <span>작물: <b>${fi.cropName || '-'}</b></span>
            <span>전체 평수: <b>${totalArea ? totalArea + '평' : '-'}</b></span>
            <span style="color:#e67e22;">※ 적용 전 반드시 검토하세요</span>
          </div>

          <!-- 고객 정보 확인/수정 -->
          <div class="vld-customer-bar">
            <div class="vld-cust-field">
              <span class="vld-cust-label">고객명</span>
              <input id="vld-cust-name" class="vld-cust-inp" value="${_cName.replace(/"/g,'&quot;')}" placeholder="고객명">
            </div>
            <div class="vld-cust-field">
              <span class="vld-cust-label">연락처</span>
              <input id="vld-cust-phone" class="vld-cust-inp" value="${_cPhone.replace(/"/g,'&quot;')}" placeholder="010-0000-0000">
            </div>
            <div class="vld-cust-field">
              <span class="vld-cust-label">주소</span>
              <input id="vld-cust-addr" class="vld-cust-inp vld-cust-addr" value="${_cAddr.replace(/"/g,'&quot;')}" placeholder="주소">
            </div>
          </div>

          <!-- 일괄 작업 바 -->
          <div class="vld-bulk-bar">
            <label>일괄:</label>
            <button class="vld-bulk-btn" onclick="_vldBulkCcToMl()">cc→ml 통일</button>
            <button class="vld-bulk-btn" onclick="_vldBulkNormalizeStage()">단계명 정규화</button>
            <button class="vld-bulk-btn" onclick="_vldBulkFillSize()">빈 용량 자동채우기</button>
            <button class="vld-bulk-btn" id="vldWarnToggle"
              onclick="_vldToggleWarnings()"
              ${window._vldShowWarningsOnly ? 'class="vld-bulk-btn active"' : ''}>
              ⚠️ 경고행만 보기
              <span class="vld-filter-count">${warningCount}건</span>
            </button>
          </div>

          <!-- 범례 -->
          <div class="vld-legend">
            <span class="lg-red">매칭 실패</span>
            <span class="lg-yellow">확인 필요</span>
            <span class="lg-green">정상</span>
          </div>

          <!-- 테이블 -->
          <div class="vld-table-wrap">
            <table class="vld-table">
              <thead><tr>
                <th style="min-width:80px;">단계명<br><small style="font-weight:400;color:#aaa;">원문</small></th>
                <th style="min-width:80px;">단계명<br><small style="font-weight:400;color:#9b7fd4;">정규화</small></th>
                <th style="min-width:100px;">제품 원문</th>
                <th style="min-width:90px;">제품명<br><small style="font-weight:400;color:#aaa;">(용량 제거 후)</small></th>
                <th style="min-width:140px;">매칭 제품</th>
                <th style="min-width:65px;">용량</th>
                <th style="min-width:75px;">처방수량</th>
                <th style="min-width:55px;">기준평수</th>
                <th style="min-width:60px;">최종수량</th>
                <th style="min-width:55px;">단가</th>
                <th style="min-width:50px;">신뢰도</th>
                <th style="min-width:30px;">경고</th>
              </tr></thead>
              <tbody id="vldTbody">
                ${_buildTbodyHtml(rows, optionsHTML)}
              </tbody>
            </table>
          </div>

        </div>

        <!-- 푸터 -->
        <div class="vld-footer">
          <!-- 시기별 평당가 요약 테이블 -->
          <div id="vld-group-summary" style="margin-bottom:10px;"></div>

          <!-- 운송비/지원금 + 최종 평당가 -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;padding:8px 10px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
            <span style="font-size:12px;font-weight:700;color:#555;">📦 운송비/지원금</span>
            <input id="vld-shipping" type="number" value="0" step="1000"
              style="width:110px;padding:5px 8px;border:1.5px solid #cbd5e1;border-radius:5px;font-size:13px;text-align:right;"
              placeholder="0 (음수=지원)"
              oninput="_recalcVldUnitPrice()">
            <span style="font-size:11px;color:#94a3b8;">양수 = 농가 부담 / 음수 = 회사 지원</span>
            <span id="vld-unitprice-display" style="margin-left:auto;font-size:13px;font-weight:700;color:#1d4ed8;"></span>
          </div>
          <button class="vld-apply-btn" onclick="_applyToCart()">
            ✅ 검토 완료 — 명세표에 적용하기
          </button>
        </div>

      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  _bindTableEvents();

  // 전역 optionsHTML 저장 (리렌더 시 사용)
  window._vldOptionsHTML = optionsHTML;
  window._vldFarmInfo    = { fi, totalArea };

  // 모달 열림 직후 평당가 초기 계산
  setTimeout(_recalcVldUnitPrice, 50);
}

/* ───────────────────────────────────────────
   tbody HTML 생성
   ─────────────────────────────────────────── */
function _buildTbodyHtml(rows, optionsHTML) {
  const showOnly = window._vldShowWarningsOnly;

  // ── 사전 패스: 그룹별 소계 (finalQty × price) 계산 ────────────────
  const _groupSubtotals = {};
  let _curGIdx = -1;
  rows.forEach((r, i) => {
    if (r._rowKind === 'group-header') { _curGIdx = i; _groupSubtotals[i] = 0; }
    else if (r._rowKind === 'product' && _curGIdx >= 0) {
      _groupSubtotals[_curGIdx] += (r.finalQty || 0) * (r.price || 0);
    }
  });

  return rows.map((r, i) => {
    // ── 2계층: 그룹 헤더 행 ──────────────────────────────────────────
    if (r._rowKind === 'group-header') {
      const selCls  = (window._vldCellSel || new Set()).has(r._cellId) ? ' cell-selected' : '';
      const badge   = `<span class="vld-group-type-badge">${r._groupType || '기타'}</span>`;
      const pgInfo  = r._sourcePage ? `<span style="color:#999;font-size:11px;margin-left:8px;">p.${r._sourcePage}</span>` : '';
      const cnt     = `<span style="color:#888;font-size:11px;margin-left:10px;">제품 ${r._productCount}개</span>`;
      const mergeMk = r._merged ? `<span style="font-size:10px;color:#e67e22;margin-left:8px;">🔗병합됨</span>` : '';
      const txt     = (r._groupHeader || '').replace(/\n/g, ' / ').replace(/</g,'&lt;');

      // 그룹 소계 + 시기별 평당가 배지
      const _tArea = window._vldTotalArea || 0;
      const sub = _groupSubtotals[i] || 0;
      const subPerPyeong = (sub > 0 && _tArea > 0) ? Math.round(sub / _tArea) : 0;
      const subBadge = sub > 0
        ? `<span style="margin-left:8px;padding:2px 10px;background:#ecfdf5;color:#065f46;border-radius:8px;font-size:12px;font-weight:700;border:1px solid #6ee7b7;">` +
          `₩${sub.toLocaleString()}` +
          (subPerPyeong > 0 ? ` · 평당 ₩${subPerPyeong.toLocaleString()}` : '') +
          `</span>`
        : '';

      // 월 정보: _monthInfo(pdfParser 추출) 우선, 없으면 헤더 텍스트에서 즉석 파싱
      let monthInfo = r._monthInfo || '';
      if (!monthInfo) {
        const src = r._groupHeader || '';
        const _months = [];
        let _mm;
        // 패턴 A: "3월", "3월-4월"
        const _RE_A = /(\d{1,2})\s*월(?:\s*[-~]\s*(\d{1,2})\s*월)?/g;
        while ((_mm = _RE_A.exec(src)) !== null) {
          const s = parseInt(_mm[1], 10);
          if (s < 1 || s > 12) continue;
          _months.push(_mm[2] ? `${s}-${parseInt(_mm[2],10)}월` : `${s}월`);
        }
        // 패턴 B: "3-4월", "3~5월"
        const _RE_B = /(\d{1,2})\s*[-~]\s*(\d{1,2})\s*월/g;
        while ((_mm = _RE_B.exec(src)) !== null) {
          const s = parseInt(_mm[1], 10), e = parseInt(_mm[2], 10);
          if (s < 1 || s > 12 || e < 1 || e > 12) continue;
          const lbl = `${s}-${e}월`;
          if (!_months.includes(lbl)) _months.push(lbl);
        }
        monthInfo = _months.join(', ');
      }
      const monthBadge = monthInfo
        ? `<span style="margin-left:8px;padding:2px 9px;background:#dbeafe;color:#1d4ed8;border-radius:10px;font-size:12px;font-weight:700;border:1px solid #93c5fd;">📅 시기: ${monthInfo}</span>`
        : '';
      // 월 정보 있으면 헤더 행 배경색·상단 보더를 파란 계열로 강조
      const rowBg = monthInfo
        ? 'background:#f0f7ff;border-top:3px solid #3b82f6;'
        : 'border-top:2px solid #e5e7eb;';
      return `<tr class="vld-group-hdr-row${selCls}" data-cell-id="${r._cellId||''}" style="${rowBg}">
        <td colspan="12">${badge}${txt}${monthBadge}${subBadge}${pgInfo}${cnt}${mergeMk}</td></tr>`;
    }
    // ── 2계층: 하위 단계 헤더 행 ────────────────────────────────────
    if (r._rowKind === 'stage-header') {
      const order = r._stageOrder ? ` (${r._stageOrder}번째)` : '';
      return `<tr class="vld-stage-hdr-row"><td colspan="12">↳ ${(r._stageName||'').replace(/</g,'&lt;')}${order}</td></tr>`;
    }

    const hidden = showOnly && (!r.warnings || !r.warnings.length) ? 'vld-row-hidden' : '';

    // 매칭 드롭다운: 현재 매칭 id 선택
    const selHTML = (optionsHTML || window._vldOptionsHTML || '').replace(
      r.matchId ? `value="${r.matchId}"` : 'value=""',
      (r.matchId ? `value="${r.matchId}"` : 'value=""') + ' selected'
    );

    const labelVal = (r.stageRaw || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const normVal  = (r.stageNormalized || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const pkgVal   = (r.packageSizeRaw  || '');
    const areaVal  = r.baseArea != null ? r.baseArea : '';

    return `<tr class="${r.rowClass} ${hidden}" data-idx="${i}">
      <!-- 단계명 원문 -->
      <td>
        <textarea class="vld-stage-label" data-idx="${i}" rows="2">${labelVal}</textarea>
        <small class="orig-text" title="${r.originalText || ''}">${r.sourcePage ? `p.${r.sourcePage}` : ''}</small>
      </td>
      <!-- 단계명 정규화 -->
      <td>
        <input class="vld-stage-norm" type="text" data-idx="${i}" value="${normVal}">
      </td>
      <!-- 제품 원문 -->
      <td>
        <span class="orig-text" style="max-width:none;white-space:normal;" title="${(r.productRaw||'').replace(/"/g,'&quot;')}">${r.productRaw||''}</span>
      </td>
      <!-- 제품명 (용량 제거 후) -->
      <td>
        <input class="vld-prod-name" type="text" data-idx="${i}" value="${(r.productName||'').replace(/"/g,'&quot;')}">
      </td>
      <!-- 매칭 제품 -->
      <td><select class="vld-sel" data-idx="${i}">${selHTML}</select></td>
      <!-- 용량 -->
      <td>
        <input class="vld-pkg-input" type="text" data-idx="${i}" value="${pkgVal}"
          placeholder="예) 1L"
          title="${r.packageSizeMl != null ? r.packageSizeMl + 'ml' : ''}">
      </td>
      <!-- 처방수량 -->
      <td style="white-space:nowrap;">
        <input type="number" class="vld-dosage" data-idx="${i}"
          value="${r.dosageQty != null ? r.dosageQty : ''}"
          min="0" step="0.5" style="width:48px;">
        <span style="font-size:11px;color:#666;">${r.dosageUnit || ''}</span>
      </td>
      <!-- 기준 평수 -->
      <td>
        <input class="vld-area-input" type="number" data-idx="${i}"
          value="${areaVal}" min="0" step="50" placeholder="-">
      </td>
      <!-- 최종 수량 -->
      <td>
        <input type="number" class="vld-qty" data-idx="${i}"
          value="${r.finalQty}" min="0">
      </td>
      <!-- 단가 -->
      <td class="vld-price" data-idx="${i}" style="text-align:right;white-space:nowrap;">
        ₩${(r.price||0).toLocaleString()}
      </td>
      <!-- 신뢰도 -->
      <td style="text-align:center;">${_confBadge(r.confidence)}</td>
      <!-- 경고 -->
      <td style="text-align:center;">${_warnIcon(r.warnings)}</td>
    </tr>`;
  }).join('');
}

/* ───────────────────────────────────────────
   이벤트 바인딩 (모달 생성 후 1회)
   ─────────────────────────────────────────── */
function _bindTableEvents() {
  const overlay = document.getElementById('validationOverlay');
  if (!overlay) return;

  // ── 매칭 드롭다운 변경 ──
  overlay.querySelectorAll('.vld-sel').forEach(sel => {
    sel.addEventListener('change', function() {
      const idx  = Number(this.dataset.idx);
      const opt  = this.selectedOptions[0];
      const rows = window._vldRows;
      if (!rows || !rows[idx]) return;
      rows[idx].matchId   = this.value;
      rows[idx].matchName = opt ? opt.textContent.split(' (')[0] : '미매칭';
      rows[idx].price     = opt ? Number(opt.dataset.price || 0) : 0;
      rows[idx].size      = opt ? (opt.dataset.size || '') : '';
      // 단가 셀 즉시 업데이트
      const pCell = overlay.querySelector(`.vld-price[data-idx="${idx}"]`);
      if (pCell) pCell.textContent = '₩' + rows[idx].price.toLocaleString();
      // 하이라이트 갱신
      const tr = this.closest('tr');
      if (tr) tr.className = (this.value ? '' : 'vld-row-red');
      // 평당가 재계산
      _recalcVldUnitPrice();
    });
  });

  // ── 기준 평수 변경 → 최종 수량 재계산 ──
  overlay.querySelectorAll('.vld-area-input').forEach(inp => {
    inp.addEventListener('input', function() {
      const idx  = Number(this.dataset.idx);
      const rows = window._vldRows;
      if (!rows || !rows[idx]) return;
      rows[idx].baseArea = Number(this.value) || null;
      _recalcFinalQty(idx);
    });
  });

  // ── 처방 수량 변경 → 최종 수량 재계산 ──
  overlay.querySelectorAll('.vld-dosage').forEach(inp => {
    inp.addEventListener('input', function() {
      const idx  = Number(this.dataset.idx);
      const rows = window._vldRows;
      if (!rows || !rows[idx]) return;
      rows[idx].dosageQty = Number(this.value) || null;
      _recalcFinalQty(idx);
    });
  });

  // ── 셀 선택 클릭 이벤트 (최초 1회 등록) ──
  _bindCellClickEvents();
}

/* ═══════════════════════════════════════════
   선택형 셀 병합 UI
   ═══════════════════════════════════════════ */

/* ── 선택 토글 ─────────────────────────────── */
function _vldToggleCellSel(cellId) {
  const sel = window._vldCellSel;
  sel.has(cellId) ? sel.delete(cellId) : sel.add(cellId);
  _vldRefreshSelUI();
}

/* ── 범위 선택 (Shift+클릭) ─────────────────── */
function _vldRangeSelect(fromId, toId) {
  const groups = window._vldRxGroups;
  if (!groups) return;
  const ids  = groups.map(g => g.cellId);
  const from = ids.indexOf(fromId), to = ids.indexOf(toId);
  if (from < 0 || to < 0) return;
  const lo = Math.min(from, to), hi = Math.max(from, to);
  window._vldCellSel = new Set(ids.slice(lo, hi + 1));
  _vldRefreshSelUI();
}

/* ── 전체 선택 해제 ────────────────────────── */
function _vldClearCellSel() {
  window._vldCellSel  = new Set();
  window._vldLastCell = null;
  _vldRefreshSelUI();
}

/* ── 선택 상태를 DOM에 반영 + 플로팅 메뉴 갱신 ── */
function _vldRefreshSelUI() {
  const sel    = window._vldCellSel || new Set();
  const groups = window._vldRxGroups || [];

  // 행 하이라이트 갱신
  document.querySelectorAll('.vld-group-hdr-row[data-cell-id]').forEach(tr => {
    tr.classList.toggle('cell-selected', sel.has(tr.dataset.cellId));
  });

  // 플로팅 메뉴
  const menu     = document.getElementById('vld-cell-menu');
  const infoEl   = document.getElementById('vld-menu-info');
  const btnMerge = document.getElementById('vld-btn-merge');
  const btnSplit = document.getElementById('vld-btn-split');
  if (!menu) return;

  if (!sel.size) { menu.classList.remove('visible'); return; }

  const selArr = groups.filter(g => sel.has(g.cellId));

  // 연속 여부 검사
  const indices   = selArr.map(g => groups.indexOf(g)).sort((a,b)=>a-b);
  const isConsec  = indices.length > 1 && indices.every((v,i) => i === 0 || v === indices[i-1]+1);
  const isMerged  = selArr.length === 1 && selArr[0].merged;

  infoEl.textContent = `${sel.size}개 선택`;
  btnMerge.disabled  = !(selArr.length >= 2 && isConsec);
  btnSplit.disabled  = !isMerged;

  // 메뉴 위치: 마지막 선택 행 기준
  const lastId  = [...sel].pop();
  const lastTr  = document.querySelector(`.vld-group-hdr-row[data-cell-id="${lastId}"]`);
  if (lastTr) {
    const rect = lastTr.getBoundingClientRect();
    menu.style.top  = `${rect.bottom + 6}px`;
    menu.style.left = `${rect.left}px`;
  }
  menu.classList.add('visible');
}

/* ── 선택된 셀들을 병합 ──────────────────────
   - 선택된 RxGroup들을 첫 번째 그룹으로 합침
   - rawCells에 원본 스냅샷 저장 (되돌리기용)
   ─────────────────────────────────────────── */
function _vldMergeSel() {
  const groups  = window._vldRxGroups;
  if (!groups) return;
  const selArr  = groups.filter(g => window._vldCellSel.has(g.cellId))
                        .sort((a, b) => groups.indexOf(a) - groups.indexOf(b));
  if (selArr.length < 2) return;

  // 연속 확인 (이미 버튼 disabled로 막지만 이중 방어)
  const indices = selArr.map(g => groups.indexOf(g));
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i-1] + 1) {
      alert('연속된 셀만 병합할 수 있습니다.');
      return;
    }
  }

  const first = selArr[0];
  const rest  = selArr.slice(1);

  // 원본 스냅샷 (아직 없으면 first 자신도 포함)
  if (!first._rawCells) {
    first._rawCells = [JSON.parse(JSON.stringify({ ...first, _rawCells: undefined }))];
  }

  rest.forEach(g => {
    // 스냅샷 보존
    first._rawCells.push(JSON.parse(JSON.stringify({ ...g, _rawCells: undefined })));
    // 헤더 병합
    first.groupHeader += '\n' + g.groupHeader;
    // stages 병합
    first.stages.push(...g.stages);
    // groups 배열에서 제거
    const idx = groups.indexOf(g);
    if (idx >= 0) groups.splice(idx, 1);
  });

  first.merged = true;
  _vldClearCellSel();
  _vldRerender();
}

/* ── 선택된 병합 셀을 분리 ──────────────────── */
function _vldSplitSel() {
  const groups = window._vldRxGroups;
  if (!groups) return;
  const selArr = groups.filter(g => window._vldCellSel.has(g.cellId));
  if (selArr.length !== 1) return;
  const g = selArr[0];
  if (!g.merged || !g._rawCells || g._rawCells.length < 2) return;

  const idx = groups.indexOf(g);
  // rawCells 복원: cellId는 원본 것을 재사용
  const restored = g._rawCells.map(rc => ({ ...rc }));
  groups.splice(idx, 1, ...restored);

  _vldClearCellSel();
  _vldRerender();
}

/* ── tbody 재렌더 (데이터 변경 후 호출) ───────── */
function _vldRerender() {
  const totalArea = window._vldTotalArea || 0;
  const rows = window._vldRxGroups
    ? _buildVldRowsFromRxGroups(window._vldRxGroups, totalArea)
    : (window._vldRows || []);
  window._vldRows = rows;
  const tbody = document.getElementById('vldTbody');
  if (tbody) tbody.innerHTML = _buildTbodyHtml(rows, window._vldOptionsHTML);
  _bindTableEvents();
}

/* ── click 이벤트 위임 (그룹 헤더 행 선택) ───── */
// _bindTableEvents() 내부에서 한 번만 등록되도록 플래그 사용
let _cellClickBound = false;
function _bindCellClickEvents() {
  if (_cellClickBound) return;
  _cellClickBound = true;
  document.addEventListener('click', e => {
    const menu = document.getElementById('vld-cell-menu');
    const hdrRow = e.target.closest('.vld-group-hdr-row[data-cell-id]');

    if (!hdrRow) {
      // 메뉴 자체 클릭이면 무시
      if (menu && menu.contains(e.target)) return;
      _vldClearCellSel();
      return;
    }

    const cellId = hdrRow.dataset.cellId;
    if (!cellId) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey && window._vldLastCell) {
      _vldRangeSelect(window._vldLastCell, cellId);
    } else if (e.ctrlKey || e.metaKey) {
      _vldToggleCellSel(cellId);
    } else {
      window._vldCellSel = new Set([cellId]);
      _vldRefreshSelUI();
    }
    window._vldLastCell = cellId;
  });
}

/* ───────────────────────────────────────────
   최종 수량 재계산
   ─────────────────────────────────────────── */
function _recalcFinalQty(idx) {
  const rows = window._vldRows;
  if (!rows || !rows[idx]) return;
  const r = rows[idx];
  const totalArea = window._vldTotalArea || 0;
  const newQty = calcRequiredQty(totalArea, r.baseArea, r.dosageQty) || 0;
  r.finalQty = newQty;
  const overlay = document.getElementById('validationOverlay');
  if (!overlay) return;
  const qtyInp = overlay.querySelector(`.vld-qty[data-idx="${idx}"]`);
  if (qtyInp) qtyInp.value = newQty;
}

/* ───────────────────────────────────────────
   평당가 실시간 재계산
   공식: (제품총합 - 할인액 + 운송비) / 총면적
   ─────────────────────────────────────────── */
function _recalcVldUnitPrice() {
  const rows      = window._vldRows || [];
  const totalArea = window._vldTotalArea || 0;
  if (!totalArea) return;

  const shipping = Number(document.getElementById('vld-shipping')?.value || 0);
  const discPct  = Number(document.getElementById('gDisc')?.value || 0);

  // ── 시기(그룹)별 소계 수집 ─────────────────────────────────────────
  const groupBreakdown = []; // { label, monthInfo, sub }
  let curGroup = null;
  rows.forEach(r => {
    if (r._rowKind === 'group-header') {
      curGroup = { label: r._groupHeader || '', monthInfo: r._monthInfo || '', sub: 0 };
      groupBreakdown.push(curGroup);
    } else if (r._rowKind === 'product' && curGroup) {
      curGroup.sub += (r.finalQty || 0) * (r.price || 0);
    }
  });

  // ── 전체 합계 ─────────────────────────────────────────────────────
  const totalProductCost = groupBreakdown.reduce((s, g) => s + g.sub, 0);
  const discAmt  = Math.round(totalProductCost * discPct / 100);
  const finalCost = totalProductCost - discAmt + shipping;
  const unitPrice = totalArea > 0 ? Math.round(finalCost / totalArea) : 0;

  console.log(
    `[VLD] 평당가: (${totalProductCost.toLocaleString()} - ${discAmt.toLocaleString()} + ${shipping.toLocaleString()}) / ${totalArea}평 = ${unitPrice.toLocaleString()}원`
  );

  // ── 시기별 요약 테이블 렌더 ──────────────────────────────────────
  const summaryEl = document.getElementById('vld-group-summary');
  if (summaryEl && groupBreakdown.length > 0) {
    const sumOfSubs = groupBreakdown.reduce((s, g) => s + g.sub, 0);
    const rows_html = groupBreakdown
      .filter(g => g.sub > 0)
      .map(g => {
        const pp = Math.round(g.sub / totalArea);
        const pct = sumOfSubs > 0 ? Math.round(g.sub / sumOfSubs * 100) : 0;
        const label = (g.monthInfo || g.label || '').replace(/\n/g, ' / ').replace(/</g, '&lt;');
        return `<tr>
          <td style="padding:3px 8px;color:#374151;">${label}</td>
          <td style="padding:3px 8px;text-align:right;font-weight:700;color:#065f46;">₩${g.sub.toLocaleString()}</td>
          <td style="padding:3px 8px;text-align:right;color:#1d4ed8;">₩${pp.toLocaleString()}/평</td>
          <td style="padding:3px 8px;text-align:right;">
            <div style="display:inline-flex;align-items:center;gap:4px;">
              <div style="width:${Math.max(pct,2)}px;max-width:60px;height:8px;background:#3b82f6;border-radius:4px;"></div>
              <span style="font-size:11px;color:#64748b;">${pct}%</span>
            </div>
          </td>
        </tr>`;
      }).join('');

    // 합계 행 + 외부 unitPrice와 비교 검증
    const extUnitPriceEl = ['unitPrice','unit-price','pricePerPyeong','pyeongPrice']
      .map(id => document.getElementById(id)).find(el => el);
    const extVal = extUnitPriceEl ? Number(extUnitPriceEl.value) || 0 : 0;
    const diffAmt = extVal > 0 ? unitPrice - extVal : 0;
    const matchIcon = extVal > 0
      ? (Math.abs(diffAmt) < 10 ? '✅' : diffAmt > 0 ? '⬆️' : '⬇️')
      : '';
    const matchNote = extVal > 0
      ? `<span style="font-size:11px;color:${Math.abs(diffAmt)<10?'#16a34a':'#dc2626'};">${matchIcon} PDF 평당가 ₩${extVal.toLocaleString()}와 ${Math.abs(diffAmt)<10?'일치':'차이 ₩'+Math.abs(diffAmt).toLocaleString()}</span>`
      : '';

    summaryEl.innerHTML = `
      <div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        <div style="background:#f1f5f9;padding:5px 10px;font-size:11px;font-weight:700;color:#475569;letter-spacing:.5px;">
          📊 시기별 비용 분석 (총 ${totalArea}평 기준)
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <th style="padding:4px 8px;text-align:left;font-weight:600;color:#64748b;">시기/단계</th>
              <th style="padding:4px 8px;text-align:right;font-weight:600;color:#64748b;">소계</th>
              <th style="padding:4px 8px;text-align:right;font-weight:600;color:#64748b;">평당</th>
              <th style="padding:4px 8px;text-align:right;font-weight:600;color:#64748b;">비중</th>
            </tr>
          </thead>
          <tbody>${rows_html}</tbody>
          <tfoot>
            <tr style="background:#f0f9ff;border-top:2px solid #bfdbfe;">
              <td style="padding:5px 8px;font-weight:700;color:#1e40af;">합계${discPct>0?` (할인 ${discPct}%)`:''}${shipping?` + 운송비 ₩${shipping.toLocaleString()}`:''}
              </td>
              <td style="padding:5px 8px;text-align:right;font-weight:700;color:#1e40af;">₩${finalCost.toLocaleString()}</td>
              <td style="padding:5px 8px;text-align:right;font-weight:900;color:#1d4ed8;font-size:14px;">₩${unitPrice.toLocaleString()}/평</td>
              <td style="padding:5px 8px;text-align:right;">${matchNote}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }

  // ── 상단 표시줄 업데이트 ─────────────────────────────────────────
  const disp = document.getElementById('vld-unitprice-display');
  if (disp) {
    disp.textContent = unitPrice > 0
      ? `⚡ 최종 평당가 ₩${unitPrice.toLocaleString()}`
      : '';
  }

  // ── 외부 unitPrice 입력창에 주입 ────────────────────────────────
  const UNIT_PRICE_IDS = ['unitPrice', 'unit-price', 'pricePerPyeong', 'pyeongPrice'];
  for (const id of UNIT_PRICE_IDS) {
    const el = document.getElementById(id);
    if (el) { el.value = unitPrice; break; }
  }
}

/* ───────────────────────────────────────────
   일괄 작업: cc→ml 통일
   ─────────────────────────────────────────── */
function _vldBulkCcToMl() {
  const rows = window._vldRows;
  if (!rows) return;
  let count = 0;
  const overlay = document.getElementById('validationOverlay');
  rows.forEach((r, i) => {
    if (!r.packageSizeRaw) return;
    // "500cc" → "500ml", "1000cc" → "1000ml" (수치는 그대로, cc는 1:1 = ml)
    const updated = r.packageSizeRaw.replace(/(\d+(?:\.\d+)?)\s*cc/g, '$1ml');
    if (updated !== r.packageSizeRaw) {
      r.packageSizeRaw = updated;
      count++;
      // DOM 업데이트
      if (overlay) {
        const inp = overlay.querySelector(`.vld-pkg-input[data-idx="${i}"]`);
        if (inp) inp.value = updated;
      }
    }
  });
  alert(`cc→ml 변환 완료: ${count}개 행 수정`);
}

/* ───────────────────────────────────────────
   일괄 작업: 단계명 일괄 정규화
   ─────────────────────────────────────────── */
function _vldBulkNormalizeStage() {
  const rows = window._vldRows;
  if (!rows) return;
  if (typeof normalizeStageLabel !== 'function') {
    alert('rxNormalizer.js가 로드되지 않았습니다.');
    return;
  }
  let count = 0;
  const overlay = document.getElementById('validationOverlay');
  rows.forEach((r, i) => {
    const raw = r.stageRaw;
    if (!raw) return;
    const norm = normalizeStageLabel(raw);
    if (norm.normalized !== r.stageNormalized) {
      r.stageNormalized = norm.normalized;
      count++;
      if (overlay) {
        const inp = overlay.querySelector(`.vld-stage-norm[data-idx="${i}"]`);
        if (inp) inp.value = norm.normalized;
      }
    }
  });
  alert(`단계명 정규화 완료: ${count}개 행 업데이트`);
}

/* ───────────────────────────────────────────
   일괄 작업: 빈 용량 자동채우기 (매칭된 제품 DB size 사용)
   ─────────────────────────────────────────── */
function _vldBulkFillSize() {
  const rows = window._vldRows;
  if (!rows) return;
  let count = 0;
  const overlay = document.getElementById('validationOverlay');
  rows.forEach((r, i) => {
    if (r.packageSizeRaw) return;   // 이미 있으면 건드리지 않음
    if (!r.matchId) return;
    const prod = PRODUCT_DB.find(p => p.id === r.matchId);
    if (!prod || !prod.size) return;
    r.packageSizeRaw = prod.size;
    count++;
    if (overlay) {
      const inp = overlay.querySelector(`.vld-pkg-input[data-idx="${i}"]`);
      if (inp) inp.value = prod.size;
    }
  });
  alert(`빈 용량 채우기 완료: ${count}개 행 업데이트`);
}

/* ───────────────────────────────────────────
   일괄 작업: 경고 행만 보기 토글
   ─────────────────────────────────────────── */
function _vldToggleWarnings() {
  window._vldShowWarningsOnly = !window._vldShowWarningsOnly;
  const overlay = document.getElementById('validationOverlay');
  if (!overlay) return;
  const rows = window._vldRows || [];
  rows.forEach((r, i) => {
    const tr = overlay.querySelector(`tr[data-idx="${i}"]`);
    if (!tr) return;
    const hasWarn = r.warnings && r.warnings.length > 0;
    if (window._vldShowWarningsOnly && !hasWarn) {
      tr.classList.add('vld-row-hidden');
    } else {
      tr.classList.remove('vld-row-hidden');
    }
  });
  // 버튼 상태 갱신
  const btn = document.getElementById('vldWarnToggle');
  if (btn) btn.classList.toggle('active', window._vldShowWarningsOnly);
}

/* ───────────────────────────────────────────
   장바구니에 적용
   ─────────────────────────────────────────── */
// ─── 제품 행 여부 판별 (메타/헤더 행 제외) ───────────────────────────────────
const _VLD_META_RE = /거래명세표|입금표|공급받는자|공급자\s*보관|^\s*등록\s*$|^번호\s+\d|귀\s*하|사업장\s*소재지|업\s*태|종\s*목|대표전화|팩\s*스|결제금액|합계금액|원칙으로\s*합니다|기타무역업|수출입업/;
function _isProductVldRow(r) {
  if (r.rowType === 'header' || r.rowType === 'meta') return false;
  const name = (r.productName || r.productRaw || r.stageRaw || '').trim();
  if (!name) return false;
  if (_VLD_META_RE.test(name)) return false;
  // 수량/매칭/처방 정보가 전혀 없으면 제품 행이 아님
  if (!r.finalQty && !r.dosageQty && !r.matchId && !(r.rowType === 'product')) return false;
  return true;
}

function _applyToCart() {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 0: 메타/헤더 행 최종 필터 (제품 행만 남김)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const allRows = window._vldRows || [];
  const rows    = allRows.filter(_isProductVldRow);
  const metaSkipped = allRows.length - rows.length;
  if (metaSkipped > 0) {
    console.log(`[_applyToCart] 메타/헤더 행 ${metaSkipped}개 제외 (rows[0]="${(allRows[0]?.productName||allRows[0]?.productRaw||'?')}")`);
  }

  const overlay = document.getElementById('validationOverlay');

  // ── 고객 정보 동기화: vld-cust-* → cName/cPhone/cAddr ──
  if (overlay) {
    const custName  = overlay.querySelector('#vld-cust-name');
    const custPhone = overlay.querySelector('#vld-cust-phone');
    const custAddr  = overlay.querySelector('#vld-cust-addr');
    if (custName?.value.trim())  document.getElementById('cName').value = custName.value.trim();
    if (custPhone?.value.trim()) {
      document.getElementById('cPhone').value = custPhone.value.trim();
      if (typeof fmtPhone === 'function') fmtPhone(document.getElementById('cPhone'), 'cPhone');
    }
    if (custAddr?.value.trim())  document.getElementById('cAddr').value = custAddr.value.trim();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: DOM → rows 강제 전체 동기화 (change 이벤트 없이 버튼만 눌러도 반영)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (overlay) {
    // ① 매칭 제품 셀렉터 (matchId / price) ← 이전에 누락돼 있던 핵심 항목
    overlay.querySelectorAll('.vld-sel').forEach(sel => {
      const idx = Number(sel.dataset.idx);
      if (!rows[idx]) return;
      const opt = sel.selectedOptions[0];
      rows[idx].matchId   = sel.value;
      rows[idx].matchName = opt ? opt.textContent.split(' (')[0] : '미매칭';
      rows[idx].price     = opt ? Number(opt.dataset.price || 0) : 0;
      rows[idx].size      = opt ? (opt.dataset.size  || '') : '';
    });
    // ② 최종 수량 (직접 입력 오버라이드)
    overlay.querySelectorAll('.vld-qty').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (rows[idx]) rows[idx].finalQty = Number(inp.value) || 0;
    });
    // ③ 기준 평수
    overlay.querySelectorAll('.vld-area-input').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (rows[idx]) rows[idx].baseArea = Number(inp.value) || null;
    });
    // ④ 처방 수량
    overlay.querySelectorAll('.vld-dosage').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (rows[idx]) rows[idx].dosageQty = Number(inp.value) || null;
    });
    // ⑤ 제품명 / 용량 / 단계명
    overlay.querySelectorAll('.vld-prod-name').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (rows[idx]) rows[idx].productName = inp.value;
    });
    overlay.querySelectorAll('.vld-pkg-input').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (rows[idx]) rows[idx].packageSizeRaw = inp.value;
    });
    overlay.querySelectorAll('.vld-stage-label').forEach(ta => {
      const idx = Number(ta.dataset.idx);
      if (rows[idx]) rows[idx].stageRaw = ta.value;
    });
    overlay.querySelectorAll('.vld-stage-norm').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (rows[idx]) rows[idx].stageNormalized = inp.value;
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: 동기화 후 rows 상태 진단 로그
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.group('[_applyToCart] DOM→rows 동기화 완료');
  console.table(rows.map((r, i) => ({
    idx:         i,
    productName: r.productName || '',
    matchId:     r.matchId     || '(없음)',
    finalQty:    r.finalQty    ?? '?',
    dosageQty:   r.dosageQty   ?? '?',
    baseArea:    r.baseArea    ?? '?',
    price:       r.price       ?? 0,
  })));
  console.groupEnd();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3: 미매칭 행 경고 (조용히 닫지 않음)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const unmatchedRows = rows.filter(r => !r.matchId && (r.dosageQty > 0 || r.finalQty > 0));
  if (unmatchedRows.length > 0) {
    const ok = confirm(
      `${unmatchedRows.length}개 행이 아직 미매칭 상태입니다.\n` +
      `미매칭 행은 장바구니에 추가되지 않습니다.\n\n계속 적용하시겠습니까?`
    );
    if (!ok) return;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4: matchId 기준 수량 합산 (소수점 합산 후 Math.ceil 1회)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const mergedMap  = {};
  const matchUnits = {};
  rows.forEach(r => {
    if (!r.matchId || !r.finalQty || r.finalQty <= 0) return;
    mergedMap[r.matchId]  = (mergedMap[r.matchId] || 0) + r.finalQty;
    matchUnits[r.matchId] = r.dosageUnit || matchUnits[r.matchId] || '';
  });

  console.log('[_applyToCart] mergedMap:', mergedMap,
    '| 합산 항목 수:', Object.keys(mergedMap).length);

  // mergedMap이 비면 즉시 원인 표시 후 리턴 (모달 닫지 않음)
  if (Object.keys(mergedMap).length === 0) {
    const reasons = rows.map((r, i) => {
      if (!r.matchId)              return `행${i}: matchId 없음 (${r.productName || '?'})`;
      if (!(r.finalQty > 0))       return `행${i}: finalQty=${r.finalQty} (0 또는 NaN)`;
      return null;
    }).filter(Boolean).slice(0, 6).join('\n');
    alert(
      '❌ 추가된 제품이 없습니다.\n\n' +
      '원인 (최대 6개):\n' + (reasons || '모든 행이 건너뛰어졌습니다.') + '\n\n' +
      '▶ matchId가 없으면 드롭다운에서 제품을 선택하세요.\n' +
      '▶ finalQty가 0이면 수량을 입력하세요.'
    );
    return; // ← 모달을 닫지 않음
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 5: 장바구니에 적용
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let addedCount   = 0;
  let skippedCount = 0;

  console.log('[_applyToCart] cart.push 전 cart.length =', (typeof cart !== 'undefined' ? cart.length : 'cart 없음'));

  Object.entries(mergedMap).forEach(([matchId, totalRaw]) => {
    const totalQty = Math.ceil(totalRaw);
    const prod     = (typeof PRODUCT_DB !== 'undefined')
                       ? PRODUCT_DB.find(p => p.id === matchId)
                       : null;
    if (!prod) {
      console.warn(`[_applyToCart] matchId="${matchId}" → PRODUCT_DB에 없음 (스킵)`);
      skippedCount++;
      return;
    }

    // PARSE-04: 홍보용 항목 금액 0원 처리
    // mergedMap의 matchId에 해당하는 원본 행에서 홍보용 여부 확인
    const sourceRows = rows.filter(r => r.matchId === matchId);
    const isPromo = sourceRows.some(r =>
      /홍보용/.test(r.productRaw || '') ||
      /홍보용/.test(r.productName || '') ||
      /홍보용/.test(r.stageRaw || '')
    );
    const priceOverride = isPromo ? 0 : (prod.price || 0);

    const existing = cart.find(c => c.name === prod.name && c.size === (prod.size || ''));
    if (existing) {
      existing.qty += totalQty;
      if (isPromo) { existing.retail = 0; existing.sp = 0; }
      console.log(`[_applyToCart] 기존 항목 수량 추가: "${prod.name}" +${totalQty} → ${existing.qty}${isPromo ? ' (홍보용 0원)' : ''}`);
    } else {
      cart.push({
        i:      'rx_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name:   prod.name,
        size:   prod.size   || '',
        retail: priceOverride,
        disc:   0,
        sp:     priceOverride,
        qty:    totalQty,
        gift:   false,
        custom: true
      });
      console.log(`[_applyToCart] 신규 push: "${prod.name}" qty=${totalQty}${isPromo ? ' (홍보용 0원)' : ''}`);
    }
    addedCount++;
  });

  console.log('[_applyToCart] cart.push 후 cart.length =', cart.length,
    '| 추가:', addedCount, '| 스킵:', skippedCount);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 6: UI 갱신 + 결과 피드백
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (addedCount === 0) {
    // PRODUCT_DB에 매칭 실패 — 모달 닫지 않음
    alert(
      '❌ 추가된 제품이 없습니다. (matchId / finalQty를 확인하세요)\n\n' +
      `mergedMap 항목 수: ${Object.keys(mergedMap).length}\n` +
      `PRODUCT_DB 미발견으로 스킵: ${skippedCount}개\n\n` +
      '콘솔(F12)에서 [_applyToCart] 로그를 확인하세요.'
    );
    return; // ← 모달 열어둠
  }

  // 성공 시: render → 정렬 → 인쇄 동기화 → 모달 닫기
  if (typeof sortCart  === 'function') sortCart();
  if (typeof render    === 'function') render();
  // PRICE-01: 평당가 전역 저장 — 검증 모달 완료 시 최신값으로 갱신
  (function(){
    const areaEl = document.getElementById('cArea');
    const totalArea = areaEl ? parseFloat(areaEl.value) || 0 : 0;
    if (totalArea > 0) {
      const finalCost = cart.filter(c => !c.gift).reduce((s, c) => s + c.sp * c.qty, 0);
      const calcedPrice = Math.round(finalCost / totalArea);
      if (typeof window._invoiceUnitPrice !== 'undefined') {
        window._invoiceUnitPrice = calcedPrice;
      }
    }
  })();
  if (typeof syncPrint === 'function') syncPrint();

  if (cart.length === 0) {
    alert('⚠ render() 후에도 cart가 비어 있습니다. 콘솔 로그를 확인하세요.');
  }

  closeValidationModal();

  // 요약 토스트 or alert
  const msg = `✅ ${addedCount}개 제품 명세표에 추가됨` +
              (skippedCount > 0 ? `\n(DB 미발견으로 ${skippedCount}개 스킵)` : '');
  if (typeof showToast === 'function') {
    showToast(msg);
  } else {
    // showToast 없으면 잠깐 떴다 사라지는 인라인 알림 생성
    const toast = document.createElement('div');
    toast.textContent = msg;
    Object.assign(toast.style, {
      position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
      background:'#2a8a88', color:'#fff', padding:'12px 24px', borderRadius:'10px',
      fontWeight:'700', fontSize:'15px', zIndex:'99999', pointerEvents:'none',
      boxShadow:'0 4px 16px rgba(0,0,0,.3)'
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}

/* ───────────────────────────────────────────
   모달 닫기
   ─────────────────────────────────────────── */
function closeValidationModal() {
  const el = document.getElementById('validationOverlay');
  if (el) el.remove();
  window._vldRows             = null;
  window._vldShowWarningsOnly = false;
  window._vldOptionsHTML      = null;
  window._vldFarmInfo         = null;
  window._vldTotalArea        = null;
  window._vldRxGroups         = null;
  window._vldCellSel          = new Set();
  window._vldLastCell         = null;
  _cellClickBound             = false;   // 다음 모달 열 때 재등록
}

function _vldCloseOut(e) {
  if (e.target.id === 'validationOverlay') closeValidationModal();
}
