# Code Review and Improvement Plan

## Executive Summary

This document outlines findings from a comprehensive code review of the Apple //e Browser Emulator project. The codebase is well-architected overall with clean separation between the C++ emulator core and JavaScript frontend. However, there are several areas that would benefit from refactoring.

---

## 1. Code Duplication Issues

### HIGH PRIORITY: IndexedDB Database Wrapper Pattern

**Files affected:**
- `src/js/state-persistence.js` (183 lines)
- `src/js/disk-manager/disk-persistence.js` (444 lines)

**Problem:** Both files have nearly identical database handling patterns:
- Identical `openDB()` function with identical error handling and caching logic
- Same transaction creation pattern repeated throughout
- Same Promise-wrapping pattern for database operations (12 instances in disk-persistence.js)

**Recommendation:** Extract a shared IndexedDB utility module:
```
src/js/utils/
  indexeddb-helper.js  # Shared database wrapper
```

**Estimated savings:** ~200 lines of code

---

### MEDIUM PRIORITY: Filename Parsing Functions

**Files affected:**
- `src/js/file-explorer/dos33.js` (lines 94-102)
- `src/js/file-explorer/prodos.js` (lines 246-254)

**Problem:** Nearly identical `parseFilename()` functions with minor differences in high-bit stripping.

**Recommendation:** Create shared utility in `src/js/file-explorer/utils.js`

---

### MEDIUM PRIORITY: Duplicate escapeHtml()

**Files affected:**
- `src/js/file-explorer/file-viewer.js` (lines 480-485)
- `src/js/file-explorer/index.js` (lines 714-720)

**Recommendation:** Move to shared utility module

---

### MEDIUM PRIORITY: WASM Memory Allocation Pattern

**File:** `src/js/disk-manager/disk-operations.js`

**Problem:** 12-line block for WASM memory allocation/deallocation repeated in `loadDisk()` and `loadDiskFromData()`.

**Recommendation:** Extract helper function:
```javascript
function withWasmMemory(wasmModule, data, filename, callback) {
  // Handle allocation, call callback, free memory
}
```

---

### LOW PRIORITY: Block Reading Loops in ProDOS

**File:** `src/js/file-explorer/prodos.js`

**Problem:** `readSaplingFile()` and `readTreeFile()` share similar block-reading loop patterns.

---

## 2. Unused Code

### REMOVE: formatAddressWithSymbol()

**File:** `src/js/debug/symbols.js` (line 346)

**Status:** Exported but never imported or called anywhere in the codebase.

**Action:** Delete this function.

---

## 3. Code Smells

### CRITICAL: Massive Functions

| File | Function | Lines | Issue |
|------|----------|-------|-------|
| `src/js/main.js` | `setupControls()` | 216-495 (~280 lines) | Handles ALL UI control setup |
| `src/js/main.js` | `init()` | 52-214 (~160 lines) | Initializes 12+ subsystems |
| `src/js/file-explorer/index.js` | `showFileContents()` | 516-665 (~150 lines) | Mixed concerns |

**Recommendation:** Split `setupControls()` into focused methods:
```javascript
setupPowerControls()
setupDriveControls()
setupSoundControls()
setupDisplayControls()
setupDebugMenuControls()
setupStateControls()
```

---

### HIGH: God Class - AppleIIeEmulator

**File:** `src/js/main.js`

**Problem:** Manages 13+ subsystems directly:
- renderer, audioDriver, inputHandler, diskManager, fileExplorer
- windowManager, displaySettings, textSelection, monitorResizer
- reminderController, documentationDialog, + UI events

**Recommendation:** Introduce facade/coordinator pattern:
```
src/js/
  emulator/
    core.js           # Minimal core coordination
    ui-controller.js  # UI event handling
    subsystems.js     # Subsystem initialization
```

---

### HIGH: Magic Numbers Throughout

**Priority locations:**

| File | Line | Value | Suggested Constant |
|------|------|-------|-------------------|
| `main.js` | 164 | `5000` | `AUTO_SAVE_INTERVAL_MS` |
| `main.js` | 249 | `2000` | `REMINDER_DISMISS_DELAY_MS` |
| `main.js` | 679 | `3000` | `NOTIFICATION_DISPLAY_MS` |
| `audio-driver.js` | 10 | `48000` | `SAMPLE_RATE` |
| `audio-driver.js` | 11 | `128` | `AUDIO_BUFFER_SIZE` |
| `audio-driver.js` | 155 | `1023000` | `CYCLES_PER_SECOND` |
| `file-viewer.js` | 1006 | `16` | `HEX_DUMP_BYTES_PER_ROW` |
| `MemoryBrowserWindow.js` | 51-52 | `16, 28` | `BYTES_PER_ROW`, `VISIBLE_ROWS` |

**Recommendation:** Create constants file:
```
src/js/constants/
  timing.js     # Timing-related constants
  display.js    # Display/UI constants
  emulation.js  # Emulation parameters
```

---

### HIGH: Functions with Too Many Parameters

| File | Function | Params | Issue |
|------|----------|--------|-------|
| `disk-operations.js:79` | `loadDiskFromData()` | 7 | Should use options object |
| `disk-operations.js:19` | `loadDisk()` | 6 | Should use options object |
| `MemoryHeatMapWindow.js:251` | `updateCanvas()` | 6 | Pass context object |
| `input-handler.js:122` | `_handleRawKeyDown()` | 6 | Use event object |
| `mmu.cpp:50` | `loadROM()` | 6 | Use struct |

**Recommendation:** Refactor to use options objects:
```javascript
// Before
loadDiskFromData(wasmModule, drive, driveNum, filename, data, onSuccess, onError)

// After
loadDiskFromData({ wasmModule, drive, driveNum, filename, data, callbacks })
```

---

### HIGH: Poor Error Handling

**Silent failures that should be logged:**

| File | Lines | Issue |
|------|-------|-------|
| `file-explorer/index.js` | 721-731 | `catch (e) { // Ignore storage errors }` |
| `file-explorer/index.js` | 735-751 | `catch (e) { // Ignore storage errors }` |
| `debug/ZeroPageWatchWindow.js` | 75-89 | Empty `catch { }` blocks |
| `debug/CPUDebuggerWindow.js` | 186-190 | Warn-only catch, hides issues |

**Recommendation:** Implement consistent error handling:
```javascript
// Create error utility
function logStorageError(operation, error) {
  console.warn(`Storage ${operation} failed:`, error);
  // Optional: report to error tracking
}
```

---

### MEDIUM: Deep Nesting

**Files with 4+ levels of nesting:**
- `src/js/file-explorer/index.js` lines 410-444 (ProDOS path logic)
- `src/js/file-explorer/index.js` lines 516-665 (file content detection)
- `src/core/video/video.cpp` lines 51-97 (video mode selection)
- `src/core/mmu/mmu.cpp` lines 84-150 (address range checks)

**Recommendation:** Use early returns and extract helper functions.

---

### MEDIUM: Tight Coupling

**Issues:**
1. All subsystems receive full `wasmModule` reference instead of specific interfaces
2. Direct DOM queries scattered throughout business logic
3. `FileExplorerWindow` mixes window management, file operations, and viewing concerns

**Recommendation:** Introduce interface abstractions:
```javascript
// Instead of passing wasmModule everywhere
class DiskInterface {
  constructor(wasmModule) { this._wasm = wasmModule; }
  insertDisk(drive, data, filename) { ... }
  ejectDisk(drive) { ... }
}
```

---

### MEDIUM: Missing Documentation

**Complex logic needing comments:**
- `file-explorer/index.js:410-443` - ProDOS path filtering
- `file-explorer/index.js:605-613` - Fake DOS 3.3 header creation
- `audio-driver.js:69-96` - Fallback timing mechanism
- `debug/MemoryHeatMapWindow.js` - Color mapping algorithm

---

## 4. Structural Improvements

### Proposed New Directory Structure

```
src/js/
  constants/
    timing.js
    display.js
    emulation.js
  utils/
    indexeddb-helper.js
    dom-helpers.js
    error-handler.js
    string-utils.js        # escapeHtml, parseFilename, etc.
  emulator/
    core.js               # Simplified coordinator
    ui-controller.js      # UI event handling
    subsystem-manager.js  # Subsystem lifecycle
  interfaces/
    disk-interface.js     # Abstraction over WASM disk ops
    memory-interface.js   # Abstraction over WASM memory ops
```

---

## 5. Implementation Priority

### Phase 1: Quick Wins (Low Risk, High Impact)
1. [ ] Remove unused `formatAddressWithSymbol()` function
2. [ ] Add constants for magic numbers in main.js and audio-driver.js
3. [ ] Add logging to silent catch blocks
4. [ ] Extract `escapeHtml()` to shared utility

### Phase 2: Consolidation (Medium Risk, High Impact)
1. [ ] Create IndexedDB helper module and refactor persistence files
2. [ ] Split `setupControls()` into focused methods
3. [ ] Refactor functions with 6+ parameters to use options objects
4. [ ] Create shared file-explorer utilities (parseFilename, etc.)

### Phase 3: Architecture (Higher Risk, Long-term Benefit)
1. [ ] Extract UI controller from AppleIIeEmulator
2. [ ] Create interface abstractions for WASM operations
3. [ ] Split FileExplorerWindow into separate concerns
4. [ ] Add JSDoc documentation to complex functions

---

## 6. Metrics Summary

| Category | Issues Found | Priority |
|----------|-------------|----------|
| Duplicated Code | 6 patterns | HIGH |
| Unused Code | 1 function | LOW |
| Long Functions | 3 functions 150+ lines | CRITICAL |
| Magic Numbers | 15+ instances | HIGH |
| Too Many Params | 5 functions | MEDIUM |
| Poor Error Handling | 4 locations | HIGH |
| Deep Nesting | 4 locations | MEDIUM |
| God Classes | 2 classes | HIGH |

**Estimated total refactoring:** 200-300 lines of code reduction through consolidation, plus significant maintainability improvements.

---

## 7. Testing Considerations

Before refactoring:
1. Ensure disk image loading/saving works across all formats
2. Verify state persistence (save/restore) functionality
3. Test all debug windows open and update correctly
4. Confirm audio timing remains accurate
5. Test file explorer navigation for both DOS 3.3 and ProDOS

After each phase:
- Run through full manual test of affected features
- Verify no regressions in emulation accuracy
