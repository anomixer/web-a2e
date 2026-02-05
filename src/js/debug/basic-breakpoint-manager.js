/*
 * basic-breakpoint-manager.js - BASIC line breakpoint management
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * BasicBreakpointManager - Manages BASIC line breakpoints
 * Syncs breakpoints with C++ via WASM interface and persists to localStorage
 */
export class BasicBreakpointManager {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.breakpoints = new Map(); // lineNumber -> { enabled, hitCount }
    this.listeners = [];
    this.steppingMode = null; // null | 'line' | 'statement'
    this.lastCurlin = null;
    this.lastTxtptr = null;

    this.load();
  }

  static STORAGE_KEY = "a2e-basic-breakpoints";

  /**
   * Add a change listener
   */
  onChange(fn) {
    this.listeners.push(fn);
  }

  _notify() {
    for (const fn of this.listeners) fn();
  }

  /**
   * Add a breakpoint on a BASIC line number
   */
  add(lineNumber) {
    if (this.breakpoints.has(lineNumber)) return;

    this.breakpoints.set(lineNumber, {
      enabled: true,
      hitCount: 0,
    });

    this._syncWasmAdd(lineNumber);
    this.save();
    this._notify();
  }

  /**
   * Remove a breakpoint
   */
  remove(lineNumber) {
    if (!this.breakpoints.has(lineNumber)) return;

    this.breakpoints.delete(lineNumber);
    this._syncWasmRemove(lineNumber);
    this.save();
    this._notify();
  }

  /**
   * Toggle a breakpoint on a line
   */
  toggle(lineNumber) {
    if (this.breakpoints.has(lineNumber)) {
      this.remove(lineNumber);
    } else {
      this.add(lineNumber);
    }
  }

  /**
   * Enable/disable a breakpoint
   */
  setEnabled(lineNumber, enabled) {
    const entry = this.breakpoints.get(lineNumber);
    if (!entry) return;

    entry.enabled = enabled;
    if (enabled) {
      this._syncWasmAdd(lineNumber);
    } else {
      this._syncWasmRemove(lineNumber);
    }
    this.save();
    this._notify();
  }

  /**
   * Check if a line has a breakpoint
   */
  has(lineNumber) {
    return this.breakpoints.has(lineNumber);
  }

  /**
   * Get breakpoint entry for a line
   */
  get(lineNumber) {
    return this.breakpoints.get(lineNumber) || null;
  }

  /**
   * Get all breakpoints
   */
  getAll() {
    return this.breakpoints;
  }

  /**
   * Get sorted list of breakpoint line numbers
   */
  getLineNumbers() {
    return [...this.breakpoints.keys()].sort((a, b) => a - b);
  }

  /**
   * Clear all breakpoints
   */
  clear() {
    this.breakpoints.clear();
    try {
      this.wasmModule._clearBasicBreakpoints();
    } catch (e) {
      /* ignore */
    }
    this.save();
    this._notify();
  }

  /**
   * Start line stepping mode
   */
  startLineStep() {
    this.steppingMode = "line";
    // Capture current CURLIN so we can detect when it changes
    this.lastCurlin = this._getCurlin();
  }

  /**
   * Start statement stepping mode
   */
  startStatementStep() {
    this.steppingMode = "statement";
    // Capture current TXTPTR
    this.lastTxtptr = this._getTxtptr();
  }

  /**
   * Stop stepping
   */
  stopStepping() {
    this.steppingMode = null;
    this.lastCurlin = null;
    this.lastTxtptr = null;
  }

  /**
   * Check if we should break due to stepping
   * Returns true if we should pause
   */
  checkStepBreak() {
    if (!this.steppingMode) return false;

    // Check if BASIC is actually running
    const runmod = this._getRunmod();
    const curlin = this._getCurlin();

    if (this.steppingMode === "line") {
      // Break if line changed, or if BASIC stopped running (runmod=0)
      if (curlin !== this.lastCurlin && curlin !== 0xffff) {
        console.log(`Step break: CURLIN changed from ${this.lastCurlin} to ${curlin}`);
        this.lastCurlin = curlin;
        this.steppingMode = null;
        return true;
      }
      // If BASIC stopped running (error or END), stop stepping
      if (runmod === 0 && this.lastCurlin !== 0xffff) {
        console.log("Step break: BASIC stopped running");
        this.steppingMode = null;
        return true;
      }
    } else if (this.steppingMode === "statement") {
      const txtptr = this._getTxtptr();
      if (txtptr !== this.lastTxtptr) {
        console.log(`Step break: TXTPTR changed from ${this.lastTxtptr} to ${txtptr}`);
        this.lastTxtptr = txtptr;
        this.steppingMode = null;
        return true;
      }
      // If BASIC stopped running, stop stepping
      if (runmod === 0) {
        console.log("Step break: BASIC stopped running (stmt)");
        this.steppingMode = null;
        return true;
      }
    }

    return false;
  }

  /**
   * Get RUNMOD flag (non-zero = BASIC is running)
   */
  _getRunmod() {
    try {
      return this.wasmModule._peekMemory(0x9d);
    } catch (e) {
      return 0;
    }
  }

  /**
   * Check if a BASIC breakpoint was hit
   */
  isBreakpointHit() {
    try {
      return this.wasmModule._isBasicBreakpointHit();
    } catch (e) {
      return false;
    }
  }

  /**
   * Get the line number where breakpoint was hit
   */
  getBreakLine() {
    try {
      return this.wasmModule._getBasicBreakLine();
    } catch (e) {
      return 0;
    }
  }

  /**
   * Get current BASIC line number (CURLIN)
   */
  _getCurlin() {
    try {
      const low = this.wasmModule._peekMemory(0x75);
      const high = this.wasmModule._peekMemory(0x76);
      return (high << 8) | low;
    } catch (e) {
      return 0xffff;
    }
  }

  /**
   * Get current text pointer (TXTPTR)
   */
  _getTxtptr() {
    try {
      const low = this.wasmModule._peekMemory(0x7a);
      const high = this.wasmModule._peekMemory(0x7b);
      return (high << 8) | low;
    } catch (e) {
      return 0;
    }
  }

  // ---- WASM sync helpers ----

  _syncWasmAdd(lineNumber) {
    try {
      this.wasmModule._addBasicBreakpoint(lineNumber);
    } catch (e) {
      /* ignore */
    }
  }

  _syncWasmRemove(lineNumber) {
    try {
      this.wasmModule._removeBasicBreakpoint(lineNumber);
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Re-sync all breakpoints to WASM after state import
   */
  resyncToWasm() {
    this.clearFromWasm();
    this.syncToWasm();
  }

  /**
   * Clear all breakpoints from WASM (but keep JS state)
   */
  clearFromWasm() {
    try {
      this.wasmModule._clearBasicBreakpoints();
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Sync all enabled breakpoints to WASM
   */
  syncToWasm() {
    for (const [lineNumber, entry] of this.breakpoints) {
      if (entry.enabled) {
        this._syncWasmAdd(lineNumber);
      }
    }
  }

  // ---- Persistence ----

  save() {
    try {
      const data = [];
      for (const [lineNumber, entry] of this.breakpoints) {
        data.push({
          lineNumber,
          enabled: entry.enabled,
        });
      }
      localStorage.setItem(
        BasicBreakpointManager.STORAGE_KEY,
        JSON.stringify(data),
      );
    } catch (e) {
      console.warn("Failed to save BASIC breakpoints:", e);
    }
  }

  load() {
    try {
      const saved = localStorage.getItem(BasicBreakpointManager.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        for (const entry of data) {
          this.breakpoints.set(entry.lineNumber, {
            enabled: entry.enabled,
            hitCount: 0,
          });
          if (entry.enabled) {
            this._syncWasmAdd(entry.lineNumber);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load BASIC breakpoints:", e);
    }
  }
}
