/*
 * basic-breakpoint-manager.js - BASIC line and statement breakpoint management
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { peek, readWord } from "../utils/wasm-memory.js";

/**
 * BasicBreakpointManager - Manages BASIC line and statement breakpoints
 * Syncs breakpoints with C++ via WASM interface and persists to localStorage
 *
 * Breakpoints are keyed by "lineNumber:statementIndex" strings.
 * statementIndex -1 means whole-line breakpoint, 0+ means a specific statement.
 */
export class BasicBreakpointManager {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    // Key: "line:stmt" string, Value: { lineNumber, statementIndex, enabled, hitCount }
    this.breakpoints = new Map();
    this.listeners = [];
    this.steppingMode = null; // null | 'line' | 'statement'
    this.lastCurlin = null;
    this.lastTxtptr = null;

    this.load();
  }

  static STORAGE_KEY = "a2e-basic-breakpoints";

  static _key(lineNumber, statementIndex) {
    return `${lineNumber}:${statementIndex}`;
  }

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
   * Add a breakpoint on a BASIC line/statement
   * @param {number} lineNumber - use -1 for condition-only rules (no line)
   * @param {number} statementIndex - -1 for whole line, 0+ for specific statement
   */
  add(lineNumber, statementIndex = -1) {
    const key = BasicBreakpointManager._key(lineNumber, statementIndex);
    if (this.breakpoints.has(key)) return;

    this.breakpoints.set(key, {
      lineNumber,
      statementIndex,
      enabled: true,
      hitCount: 0,
      condition: null,
      conditionRules: null,
    });

    // Only sync line breakpoints to WASM; condition-only rules use the conditional break flag
    if (lineNumber >= 0) {
      this._syncWasmAdd(lineNumber, statementIndex);
    }
    this._syncConditionRulesToWasm();
    this.save();
    this._notify();
  }

  /**
   * Add a condition-only rule (not tied to a line).
   * Uses a unique auto-incrementing ID as the statementIndex for keying.
   */
  addConditionRule(condition, conditionRules) {
    // Find a unique statementIndex for condition-only rules
    let id = 0;
    for (const entry of this.breakpoints.values()) {
      if (entry.lineNumber === -1 && entry.statementIndex >= id) {
        id = entry.statementIndex + 1;
      }
    }
    const key = BasicBreakpointManager._key(-1, id);
    this.breakpoints.set(key, {
      lineNumber: -1,
      statementIndex: id,
      enabled: true,
      hitCount: 0,
      condition: condition || null,
      conditionRules: conditionRules || null,
    });
    this._syncConditionRulesToWasm();
    this.save();
    this._notify();
  }

  /**
   * Remove a breakpoint
   */
  remove(lineNumber, statementIndex = -1) {
    const key = BasicBreakpointManager._key(lineNumber, statementIndex);
    if (!this.breakpoints.has(key)) return;

    this.breakpoints.delete(key);
    if (lineNumber >= 0) {
      this._syncWasmRemove(lineNumber, statementIndex);
    }
    this._syncConditionRulesToWasm();
    this.save();
    this._notify();
  }

  /**
   * Remove all breakpoints for a given line (whole-line and all statement BPs)
   */
  removeAllForLine(lineNumber) {
    const toRemove = [];
    for (const [key, entry] of this.breakpoints) {
      if (entry.lineNumber === lineNumber) {
        toRemove.push(entry);
      }
    }
    for (const entry of toRemove) {
      const key = BasicBreakpointManager._key(entry.lineNumber, entry.statementIndex);
      this.breakpoints.delete(key);
      this._syncWasmRemove(entry.lineNumber, entry.statementIndex);
    }
    if (toRemove.length > 0) {
      this.save();
      this._notify();
    }
  }

  /**
   * Toggle a breakpoint on a line/statement
   */
  toggle(lineNumber, statementIndex = -1) {
    const key = BasicBreakpointManager._key(lineNumber, statementIndex);
    if (this.breakpoints.has(key)) {
      this.remove(lineNumber, statementIndex);
    } else {
      this.add(lineNumber, statementIndex);
    }
  }

  /**
   * Enable/disable a breakpoint
   */
  setEnabled(lineNumber, statementIndex, enabled) {
    const key = BasicBreakpointManager._key(lineNumber, statementIndex);
    const entry = this.breakpoints.get(key);
    if (!entry) return;

    entry.enabled = enabled;
    if (lineNumber >= 0) {
      if (enabled) {
        this._syncWasmAdd(lineNumber, statementIndex);
      } else {
        this._syncWasmRemove(lineNumber, statementIndex);
      }
    }
    this._syncConditionRulesToWasm();
    this.save();
    this._notify();
  }

  /**
   * Check if a specific breakpoint exists
   */
  has(lineNumber, statementIndex = -1) {
    return this.breakpoints.has(BasicBreakpointManager._key(lineNumber, statementIndex));
  }

  /**
   * Check if any breakpoint exists for a given line (whole-line or any statement)
   */
  hasAnyForLine(lineNumber) {
    for (const entry of this.breakpoints.values()) {
      if (entry.lineNumber === lineNumber) return true;
    }
    return false;
  }

  /**
   * Get all breakpoints for a specific line
   * @returns {Array<{statementIndex, enabled}>}
   */
  getForLine(lineNumber) {
    const result = [];
    for (const entry of this.breakpoints.values()) {
      if (entry.lineNumber === lineNumber) {
        result.push({ statementIndex: entry.statementIndex, enabled: entry.enabled });
      }
    }
    return result;
  }

  /**
   * Get breakpoint entry by key
   */
  get(lineNumber, statementIndex = -1) {
    return this.breakpoints.get(BasicBreakpointManager._key(lineNumber, statementIndex)) || null;
  }

  /**
   * Get all breakpoints
   */
  getAll() {
    return this.breakpoints;
  }

  /**
   * Get sorted list of unique breakpoint line numbers
   */
  getLineNumbers() {
    const lineSet = new Set();
    for (const entry of this.breakpoints.values()) {
      lineSet.add(entry.lineNumber);
    }
    return [...lineSet].sort((a, b) => a - b);
  }

  /**
   * Set condition on a breakpoint
   */
  setCondition(lineNumber, statementIndex, condition) {
    const key = BasicBreakpointManager._key(lineNumber, statementIndex);
    const entry = this.breakpoints.get(key);
    if (!entry) return;
    entry.condition = condition || null;
    // Re-sync condition-only rules to C++ when their expression changes
    if (lineNumber === -1) {
      this._syncConditionRulesToWasm();
    }
    this.save();
    this._notify();
  }

  /**
   * Set the structured rule tree on a breakpoint (for Rule Builder persistence)
   */
  setConditionRules(lineNumber, statementIndex, rules) {
    const key = BasicBreakpointManager._key(lineNumber, statementIndex);
    const entry = this.breakpoints.get(key);
    if (!entry) return;
    entry.conditionRules = rules || null;
    this.save();
    this._notify();
  }

  /**
   * Evaluate whether a breakpoint should actually fire.
   * Returns true if we should stay paused, false if we should resume.
   */
  shouldBreak(lineNumber, statementIndex) {
    const key = BasicBreakpointManager._key(lineNumber, statementIndex);
    const entry = this.breakpoints.get(key);
    if (!entry || !entry.enabled) return false;

    entry.hitCount++;

    if (entry.condition) {
      try {
        const result = this.evaluateCondition(entry.condition);
        if (!result) return false;
      } catch (e) {
        console.warn("BASIC breakpoint condition error:", e.message);
      }
    }

    return true;
  }

  /**
   * Check if any enabled condition-only rules exist
   */
  hasConditionOnlyRules() {
    for (const entry of this.breakpoints.values()) {
      if (entry.lineNumber === -1 && entry.enabled && entry.condition) return true;
    }
    return false;
  }

  /**
   * Sync all condition-only rules to C++ for native evaluation at $D820
   */
  _syncConditionRulesToWasm() {
    try {
      this.wasmModule._clearBasicConditionRules();
      for (const entry of this.breakpoints.values()) {
        if (entry.lineNumber !== -1 || !entry.enabled || !entry.condition) continue;
        const exprPtr = this.wasmModule._malloc(entry.condition.length + 1);
        this.wasmModule.stringToUTF8(entry.condition, exprPtr, entry.condition.length + 1);
        this.wasmModule._addBasicConditionRule(entry.statementIndex, exprPtr);
        this.wasmModule._free(exprPtr);
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Evaluate a condition expression via C++ evaluator.
   */
  evaluateCondition(expr) {
    const exprPtr = this.wasmModule._malloc(expr.length + 1);
    this.wasmModule.stringToUTF8(expr, exprPtr, expr.length + 1);
    const result = this.wasmModule._evaluateCondition(exprPtr);
    this.wasmModule._free(exprPtr);
    return result;
  }

  /**
   * Get all breakpoint entries sorted by line then statement
   */
  getAllEntries() {
    const entries = [...this.breakpoints.values()];
    entries.sort((a, b) => {
      if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber;
      return a.statementIndex - b.statementIndex;
    });
    return entries;
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
    this._syncConditionRulesToWasm();
    this.save();
    this._notify();
  }

  /**
   * Start line stepping mode
   */
  startLineStep() {
    this.steppingMode = "line";
    this.lastCurlin = this._getCurlin();
  }

  /**
   * Start statement stepping mode
   */
  startStatementStep() {
    this.steppingMode = "statement";
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
   */
  checkStepBreak() {
    if (!this.steppingMode) return false;

    const curlin = this._getCurlin();
    const isRunning = !this._isDirectMode();

    if (this.steppingMode === "line") {
      if (curlin !== this.lastCurlin && isRunning) {
        this.lastCurlin = curlin;
        this.steppingMode = null;
        return true;
      }
      if (!isRunning && this.lastCurlin !== null) {
        this.steppingMode = null;
        return true;
      }
    } else if (this.steppingMode === "statement") {
      const txtptr = this._getTxtptr();
      if (txtptr !== this.lastTxtptr) {
        this.lastTxtptr = txtptr;
        this.steppingMode = null;
        return true;
      }
      if (!isRunning) {
        this.steppingMode = null;
        return true;
      }
    }

    return false;
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

  _getCurlin() {
    return readWord(this.wasmModule, 0x75);
  }

  _isDirectMode() {
    return peek(this.wasmModule, 0x76) === 0xff;
  }

  _getTxtptr() {
    return readWord(this.wasmModule, 0x7a);
  }

  // ---- WASM sync helpers ----

  _syncWasmAdd(lineNumber, statementIndex) {
    try {
      this.wasmModule._addBasicBreakpoint(lineNumber, statementIndex);
    } catch (e) {
      /* ignore */
    }
  }

  _syncWasmRemove(lineNumber, statementIndex) {
    try {
      this.wasmModule._removeBasicBreakpoint(lineNumber, statementIndex);
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
    this._syncConditionRulesToWasm();
  }

  clearFromWasm() {
    try {
      this.wasmModule._clearBasicBreakpoints();
    } catch (e) {
      /* ignore */
    }
  }

  syncToWasm() {
    for (const entry of this.breakpoints.values()) {
      if (entry.enabled) {
        this._syncWasmAdd(entry.lineNumber, entry.statementIndex);
      }
    }
  }

  // ---- Persistence ----

  save() {
    try {
      const data = [];
      for (const entry of this.breakpoints.values()) {
        data.push({
          lineNumber: entry.lineNumber,
          statementIndex: entry.statementIndex,
          enabled: entry.enabled,
          condition: entry.condition,
          conditionRules: entry.conditionRules,
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
          // Backward compat: missing statementIndex defaults to -1 (whole line)
          const stmtIdx = entry.statementIndex !== undefined ? entry.statementIndex : -1;
          const key = BasicBreakpointManager._key(entry.lineNumber, stmtIdx);
          this.breakpoints.set(key, {
            lineNumber: entry.lineNumber,
            statementIndex: stmtIdx,
            enabled: entry.enabled,
            hitCount: 0,
            condition: entry.condition || null,
            conditionRules: entry.conditionRules || null,
          });
          if (entry.enabled && entry.lineNumber >= 0) {
            this._syncWasmAdd(entry.lineNumber, stmtIdx);
          }
        }
        // Sync condition-only rules to C++ after loading all entries
        this._syncConditionRulesToWasm();
      }
    } catch (e) {
      console.warn("Failed to load BASIC breakpoints:", e);
    }
  }
}
