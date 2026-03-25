/**
 * customerDB.js — localStorage 기반 고객/처방/거래 데이터 관리
 * Phase 1: 스키마 초기화 + JSON 내보내기/가져오기
 * Phase 2+: 고객 CRUD, 처방이력 저장 등 확장
 */
(function() {
  'use strict';

  var SCHEMA_VERSION = 1;
  var KEYS = {
    customers:     'fertilizer_customers',
    prescriptions: 'fertilizer_prescriptions',
    transactions:  'fertilizer_transactions',
    version:       'fertilizer_schema_version'
  };

  /** 스키마 마이그레이션 — 앱 시작 시 자동 실행 */
  function _migrate() {
    var stored = parseInt(localStorage.getItem(KEYS.version) || '0', 10);
    if (stored >= SCHEMA_VERSION) return;
    if (stored < 1) {
      // v0 → v1: 신규 설치 — 빈 배열로 초기화
      // 키: fertilizer_customers, fertilizer_prescriptions, fertilizer_transactions
      if (!localStorage.getItem('fertilizer_customers'))
        localStorage.setItem('fertilizer_customers',     JSON.stringify([]));
      if (!localStorage.getItem('fertilizer_prescriptions'))
        localStorage.setItem('fertilizer_prescriptions', JSON.stringify([]));
      if (!localStorage.getItem('fertilizer_transactions'))
        localStorage.setItem('fertilizer_transactions',  JSON.stringify([]));
      localStorage.setItem(KEYS.version, String(SCHEMA_VERSION));
    }
    console.log('[CustomerDB] 스키마 초기화 완료 (v' + SCHEMA_VERSION + ')');
  }

  /** localStorage JSON 안전 읽기 */
  function _get(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch(e) { console.error('[CustomerDB] read error:', key, e); return []; }
  }

  /** localStorage JSON 쓰기 */
  function _set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  window.CustomerDB = {
    // Phase 2에서 구현할 CRUD 스텁
    list:       function() { return _get(KEYS.customers); },
    findById:   function(id) { return _get(KEYS.customers).find(function(c) { return c.id === id; }) || null; },
    findByName: function(name) { return _get(KEYS.customers).find(function(c) { return c.name && c.name.includes(name); }) || null; },
    save: function(customer) {
      if (!customer || !customer.name || !customer.name.trim()) return null;
      customer.discountRate = Math.max(0, Math.min(100, Math.round(Number(customer.discountRate) || 0)));
      var now = new Date().toISOString();
      var list = _get(KEYS.customers);
      if (customer.id) {
        var idx = -1;
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === customer.id) { idx = i; break; }
        }
        if (idx !== -1) {
          var updated = Object.assign({}, list[idx], customer, { updatedAt: now });
          list[idx] = updated;
          _set(KEYS.customers, list);
          return updated;
        }
      }
      var newCustomer = Object.assign({}, customer, {
        id: 'c_' + Date.now(),
        createdAt: now,
        updatedAt: now
      });
      list.push(newCustomer);
      _set(KEYS.customers, list);
      return newCustomer;
    },
    delete: function(id) {
      var list = _get(KEYS.customers);
      _set(KEYS.customers, list.filter(function(c) { return c.id !== id; }));
    },

    /** 이름 부분 검색 — 1자 이상이면 실행, 대소문자 무시 */
    search: function(query) {
      if (!query || !query.trim()) return [];
      var q = query.trim().toLowerCase();
      return _get(KEYS.customers).filter(function(c) {
        return c.name && c.name.toLowerCase().includes(q);
      });
    },

    /** 해당 고객의 처방이력 건수 반환 */
    countPrescriptions: function(customerId) {
      if (!customerId) return 0;
      return _get(KEYS.prescriptions).filter(function(p) {
        return p.customerId === customerId;
      }).length;
    },

    /** 처방이력 스냅샷 저장 */
    savePrescrSnapshot: function(snapshot) {
      if (!snapshot || !snapshot.items || !snapshot.items.length) return null;
      snapshot.id = 'p_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      snapshot.savedAt = new Date().toISOString();
      try {
        var list = _get(KEYS.prescriptions);
        list.push(snapshot);
        _set(KEYS.prescriptions, list);
        return snapshot;
      } catch(e) {
        console.error('[CustomerDB] 저장 실패:', e);
        return null;
      }
    },

    /** 고객별 또는 전체 이력 조회 (최신순) */
    listPrescriptions: function(customerId) {
      var all = _get(KEYS.prescriptions);
      if (customerId) {
        all = all.filter(function(p) { return p.customerId === customerId; });
      }
      return all.sort(function(a, b) { return b.savedAt.localeCompare(a.savedAt); });
    },

    /** 복합 필터 검색 — name, crop, dateFrom, dateTo */
    searchPrescriptions: function(opts) {
      opts = opts || {};
      var list = _get(KEYS.prescriptions);
      if (opts.name) {
        var n = opts.name.trim().toLowerCase();
        list = list.filter(function(p) { return p.customer && p.customer.name && p.customer.name.toLowerCase().includes(n); });
      }
      if (opts.crop) {
        list = list.filter(function(p) { return p.customer && p.customer.crop === opts.crop; });
      }
      if (opts.dateFrom) {
        list = list.filter(function(p) { return p.savedAt >= opts.dateFrom; });
      }
      if (opts.dateTo) {
        list = list.filter(function(p) { return p.savedAt <= opts.dateTo + 'T23:59:59'; });
      }
      return list.sort(function(a, b) { return b.savedAt.localeCompare(a.savedAt); });
    },

    /** 작물별 검색 — 템플릿 추천용 */
    searchPrescriptionsByCrop: function(crop) {
      if (!crop) return [];
      return _get(KEYS.prescriptions).filter(function(p) {
        return p.customer && p.customer.crop === crop;
      }).sort(function(a, b) { return b.savedAt.localeCompare(a.savedAt); });
    },

    /** 개별 처방이력 삭제 */
    deletePrescription: function(id) {
      var list = _get(KEYS.prescriptions);
      _set(KEYS.prescriptions, list.filter(function(p) { return p.id !== id; }));
    },

    /** 전체 데이터 내보내기 — JSON 객체 반환 */
    exportAll: function() {
      return {
        version:       SCHEMA_VERSION,
        exportedAt:    new Date().toISOString(),
        customers:     _get(KEYS.customers),
        prescriptions: _get(KEYS.prescriptions),
        transactions:  _get(KEYS.transactions)
      };
    },

    /** 전체 데이터 가져오기 — JSON 객체 입력 */
    importAll: function(data) {
      if (!data || typeof data.version === 'undefined') {
        throw new Error('유효하지 않은 백업 파일입니다.');
      }
      _set(KEYS.customers,     Array.isArray(data.customers)     ? data.customers     : []);
      _set(KEYS.prescriptions, Array.isArray(data.prescriptions) ? data.prescriptions : []);
      _set(KEYS.transactions,  Array.isArray(data.transactions)  ? data.transactions  : []);
      console.log('[CustomerDB] 데이터 가져오기 완료');
    },

    /** 내부 테스트용 */
    _migrate: _migrate,
    _KEYS: KEYS
  };

  // 앱 시작 시 스키마 초기화
  _migrate();
})();
