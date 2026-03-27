---
phase: 09-price-page-image-attach
plan: 02
subsystem: ui
tags: [print, invoice, vanilla-js, indexeddb, image-attach]

# Dependency graph
requires:
  - 09-01 (window._invoiceUnitPrice, _appendPricePageIfNeeded, syncPrint hook pattern)
provides:
  - IndexedDB v2 attachImages object store
  - _attachedImages 전역 캐시 배열
  - _idbSaveImage/_idbLoadImages/_idbDeleteImage CRUD 함수
  - onImgSelected() / openImgManager() / deleteAttachedImage() / closeImgManager()
  - _appendImagePagesIfNeeded() — syncPrint() 실행마다 이미지 페이지 조건부 주입
  - 이미지 첨부/관리 버튼 UI + imgManagerOverlay HTML
affects: [print, syncPrint, clearAll, indexeddb]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IndexedDB oldVersion guard: e.oldVersion < N 으로 각 버전 업그레이드 분기"
    - "syncPrint() 추가 페이지 주입 패턴 확장: _appendPricePageIfNeeded 직후 _appendImagePagesIfNeeded 호출"
    - "FileReader.readAsDataURL → IDB put → 캐시 push → syncPrint() 패턴"

key-files:
  created: []
  modified:
    - index.html

key-decisions:
  - "IDB_VER 1→2, oldVersion < 1/2 guard 분기: invoices store 기존 생성 로직 보호하면서 attachImages store 추가"
  - "_appendImagePagesIfNeeded를 _appendPricePageIfNeeded 직후에 호출: 평당가 페이지 다음에 이미지 페이지가 오는 순서 보장"
  - "openImgManager()가 overlay(id='overlay') display를 block으로 설정: 기존 overlay 클릭 아웃 (closeOut) 재활용"

patterns-established:
  - "syncPrint() 확장 패턴: innerHTML 대입 → _appendPricePageIfNeeded → _appendImagePagesIfNeeded 순서"

requirements-completed: [ATTACH-01, ATTACH-02]

# Metrics
duration: 15min
completed: 2026-03-27
---

# Phase 09 Plan 02: 이미지 첨부 전체 플로우 Summary

**IndexedDB v2 attachImages store + _attachedImages 캐시 + CRUD 함수 3개 + 업로드/관리 핸들러 + syncPrint() 이미지 페이지 주입으로 jpg/png 첨부 → 인쇄/PDF 자동 포함 + 세션 유지 전체 플로우 구현**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-27T00:40:00Z
- **Completed:** 2026-03-27T00:55:00Z
- **Tasks:** 2 (+ checkpoint)
- **Files modified:** 1

## Accomplishments

- index.html IDB_VER 1→2, onupgradeneeded에 `attachImages` store 추가 (oldVersion < 2 guard)
- `let _attachedImages = []` 전역 캐시 선언, `clearAll()`에 초기화 추가
- `_idbSaveImage` / `_idbLoadImages` / `_idbDeleteImage` 함수 3개 구현
- DOMContentLoaded에서 `_idbLoadImages()` 초기 로드 → `_attachedImages` 복원 → `syncPrint()`
- `onImgSelected()`: 5MB 초과 경고, FileReader base64 변환, IDB 저장, 캐시 push, syncPrint()
- `openImgManager()`: IDB에서 최신 목록 로드, 오버레이 표시
- `deleteAttachedImage()`: IDB 삭제 + 캐시 필터 + syncPrint() + 목록 갱신
- `closeImgManager()`: 오버레이 닫기
- `_appendImagePagesIfNeeded()`: 이미지별 `.p-img-page` 페이지 printDoc 끝에 주입
- `syncPrint()` 내 `_appendPricePageIfNeeded()` 직후 `_appendImagePagesIfNeeded(_attachedImages)` 호출
- 이미지 첨부/첨부 관리 버튼 act-row UI 추가
- `imgManagerOverlay` + `imgManagerList` HTML 추가

## Task Commits

1. **Task 1: IDB v2 + CRUD + cache** - `f7ffffd` (feat)
2. **Task 2: 업로드 핸들러 + syncPrint 확장 + 관리 오버레이 + UI** - `eea2346` (feat)

## Files Created/Modified

- `index.html` - IDB v2 업그레이드, 이미지 CRUD, 업로드/관리 핸들러, syncPrint 확장, UI 버튼, 오버레이 HTML

## Decisions Made

- IDB_VER 1→2 + `oldVersion < 1` / `oldVersion < 2` 분기: 기존 invoices store 생성 로직을 보호하면서 새 attachImages store 추가
- `_appendImagePagesIfNeeded`를 `_appendPricePageIfNeeded` 직후에 호출: 평당가 페이지 → 이미지 페이지 순서 보장
- `openImgManager()`가 `id="overlay"` display를 block으로 설정: 기존 closeOut() 클릭 아웃 메커니즘 재활용

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None - 모든 데이터 흐름이 실제 IDB와 연결됨.

## User Setup Required

None - no external service configuration required.

## Checkpoint: Awaiting Human Verification

브라우저에서 아래 시나리오를 수동으로 확인해야 한다:

1. **PRICE-01:** 처방전 PDF 업로드 → 검증 모달 → [적용] → printDoc 하단 "평당가 안내" 페이지 확인
2. **ATTACH-01:** "이미지 첨부" 버튼 → jpg 선택 → printDoc에 "첨부 이미지 1" 페이지 추가 확인
3. **ATTACH-02:** 페이지 새로고침 → 이미지 페이지 여전히 존재 확인
4. **관리:** "첨부 관리" 버튼 → 오버레이 목록 → 삭제 → printDoc에서도 제거 확인
5. **clearAll:** 전체 초기화 → 평당가/이미지 페이지 없음 확인
6. **5MB 초과:** 경고 alert 표시 확인

---
*Phase: 09-price-page-image-attach*
*Completed: 2026-03-27*
