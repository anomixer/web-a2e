/**
 * BreakpointManager - Manages all breakpoint types including
 * execution breakpoints, conditional breakpoints, and watchpoints.
 */
export class BreakpointManager {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.breakpoints = new Map(); // address -> BreakpointEntry
    this.tempBreakpoint = null;
    this.listeners = [];

    this.load();
  }

  static STORAGE_KEY = "a2e-breakpoints-v2";

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
   * Add an execution breakpoint
   */
  add(address, opts = {}) {
    if (this.breakpoints.has(address)) return;

    const entry = {
      address,
      enabled: opts.enabled !== false,
      condition: opts.condition || null,
      conditionRules: opts.conditionRules || null,
      hitCount: 0,
      hitTarget: opts.hitTarget || 0,
      isTemp: false,
      type: opts.type || "exec", // 'exec' | 'read' | 'write' | 'readwrite'
    };

    this.breakpoints.set(address, entry);

    if (entry.type === "exec") {
      this._syncWasmAdd(address, entry.enabled);
    } else {
      this._syncWatchpointAdd(entry);
    }

    this.save();
    this._notify();
  }

  /**
   * Remove a breakpoint
   */
  remove(address) {
    const entry = this.breakpoints.get(address);
    if (!entry) return;

    this.breakpoints.delete(address);

    if (entry.type === "exec") {
      this._syncWasmRemove(address);
    } else {
      this._syncWatchpointRemove(address);
    }

    this.save();
    this._notify();
  }

  /**
   * Toggle a breakpoint on/off at address
   */
  toggle(address) {
    if (this.breakpoints.has(address)) {
      this.remove(address);
    } else {
      this.add(address);
    }
  }

  /**
   * Enable/disable a breakpoint
   */
  setEnabled(address, enabled) {
    const entry = this.breakpoints.get(address);
    if (!entry) return;

    entry.enabled = enabled;

    if (entry.type === "exec") {
      try {
        this.wasmModule._enableBreakpoint(address, enabled);
      } catch (e) {
        /* ignore */
      }
    }

    this.save();
    this._notify();
  }

  /**
   * Set condition on a breakpoint
   */
  setCondition(address, condition) {
    const entry = this.breakpoints.get(address);
    if (!entry) return;
    entry.condition = condition || null;
    this.save();
    this._notify();
  }

  /**
   * Set the structured rule tree on a breakpoint (for Rule Builder persistence)
   */
  setConditionRules(address, rules) {
    const entry = this.breakpoints.get(address);
    if (!entry) return;
    entry.conditionRules = rules || null;
    this.save();
    this._notify();
  }

  /**
   * Set hit target on a breakpoint
   */
  setHitTarget(address, target) {
    const entry = this.breakpoints.get(address);
    if (!entry) return;
    entry.hitTarget = target;
    this.save();
    this._notify();
  }

  /**
   * Reset hit counts on all breakpoints
   */
  resetHitCounts() {
    for (const entry of this.breakpoints.values()) {
      entry.hitCount = 0;
    }
    this._notify();
  }

  /**
   * Get a breakpoint entry
   */
  get(address) {
    return this.breakpoints.get(address) || null;
  }

  /**
   * Check if an address has a breakpoint
   */
  has(address) {
    return this.breakpoints.has(address);
  }

  /**
   * Get all breakpoints
   */
  getAll() {
    return this.breakpoints;
  }

  /**
   * Get breakpoints of a specific type
   */
  getByType(type) {
    const result = [];
    for (const entry of this.breakpoints.values()) {
      if (entry.type === type) result.push(entry);
    }
    return result;
  }

  /**
   * Set a temporary breakpoint (for step over/out/run to cursor)
   */
  setTemp(address) {
    this.clearTemp();
    this.tempBreakpoint = address;
    try {
      this.wasmModule._addBreakpoint(address);
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Sync temp breakpoint state from C++ (step over/out sets it in C++)
   */
  syncTemp(address) {
    this.tempBreakpoint = address;
  }

  /**
   * Clear the temporary breakpoint
   */
  clearTemp() {
    if (this.tempBreakpoint !== null) {
      if (!this.breakpoints.has(this.tempBreakpoint)) {
        try {
          this.wasmModule._removeBreakpoint(this.tempBreakpoint);
        } catch (e) {
          /* ignore */
        }
      }
      this.tempBreakpoint = null;
    }
    // Also clear C++ temp breakpoint
    try {
      this.wasmModule._clearTempBreakpoint();
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Check if temp breakpoint was hit (call in update loop)
   */
  checkTemp(pc) {
    // Check C++ temp breakpoint first
    try {
      if (this.wasmModule._isTempBreakpointHit()) {
        this.tempBreakpoint = null;
        return true;
      }
    } catch (e) {
      /* ignore */
    }
    if (this.tempBreakpoint !== null && pc === this.tempBreakpoint) {
      this.clearTemp();
      return true;
    }
    return false;
  }

  /**
   * Evaluate whether a breakpoint should actually fire.
   * Returns true if we should stay paused, false if we should resume.
   */
  shouldBreak(address) {
    const entry = this.breakpoints.get(address);
    if (!entry || !entry.enabled) return false;

    // Increment hit count
    entry.hitCount++;

    // Check hit target
    if (entry.hitTarget > 0 && entry.hitCount < entry.hitTarget) {
      return false;
    }

    // Evaluate condition
    if (entry.condition) {
      try {
        const result = this.evaluateCondition(entry.condition);
        if (!result) return false;
      } catch (e) {
        // If condition evaluation fails, break anyway
        console.warn("Breakpoint condition error:", e.message);
      }
    }

    return true;
  }

  /**
   * Evaluate a breakpoint condition expression via C++ evaluator.
   */
  evaluateCondition(expr) {
    const exprPtr = this.wasmModule._malloc(expr.length + 1);
    this.wasmModule.stringToUTF8(expr, exprPtr, expr.length + 1);
    const result = this.wasmModule._evaluateCondition(exprPtr);
    this.wasmModule._free(exprPtr);
    return result;
  }

  /**
   * Evaluate an expression and return the raw numeric value.
   * Used by watch expressions.
   */
  evaluateValue(expr) {
    const exprPtr = this.wasmModule._malloc(expr.length + 1);
    this.wasmModule.stringToUTF8(expr, exprPtr, expr.length + 1);
    const result = this.wasmModule._evaluateExpression(exprPtr);
    this.wasmModule._free(exprPtr);
    return result;
  }

  // ---- WASM sync helpers ----

  _syncWasmAdd(address, enabled) {
    try {
      this.wasmModule._addBreakpoint(address);
      if (!enabled) {
        this.wasmModule._enableBreakpoint(address, false);
      }
    } catch (e) {
      /* ignore */
    }
  }

  _syncWasmRemove(address) {
    try {
      this.wasmModule._removeBreakpoint(address);
    } catch (e) {
      /* ignore */
    }
  }

  _syncWatchpointAdd(entry) {
    if (this.wasmModule._addWatchpoint) {
      try {
        const typeMap = { read: 1, write: 2, readwrite: 3 };
        this.wasmModule._addWatchpoint(
          entry.address,
          entry.address,
          typeMap[entry.type] || 3,
        );
      } catch (e) {
        /* ignore */
      }
    }
  }

  _syncWatchpointRemove(address) {
    if (this.wasmModule._removeWatchpoint) {
      try {
        this.wasmModule._removeWatchpoint(address);
      } catch (e) {
        /* ignore */
      }
    }
  }

  // ---- Persistence ----

  save() {
    try {
      const data = [];
      for (const [addr, entry] of this.breakpoints) {
        if (entry.isTemp) continue;
        data.push({
          address: addr,
          enabled: entry.enabled,
          condition: entry.condition,
          conditionRules: entry.conditionRules,
          hitTarget: entry.hitTarget,
          type: entry.type,
        });
      }
      localStorage.setItem(
        BreakpointManager.STORAGE_KEY,
        JSON.stringify(data),
      );
    } catch (e) {
      console.warn("Failed to save breakpoints:", e);
    }
  }

  load() {
    try {
      // Try new format first
      const saved = localStorage.getItem(BreakpointManager.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        for (const entry of data) {
          this.add(entry.address, {
            enabled: entry.enabled,
            condition: entry.condition,
            conditionRules: entry.conditionRules,
            hitTarget: entry.hitTarget,
            type: entry.type,
          });
        }
        return;
      }

      // Fall back to old format
      const oldSaved = localStorage.getItem("a2e-breakpoints");
      if (oldSaved) {
        const addresses = JSON.parse(oldSaved);
        for (const addr of addresses) {
          this.add(addr);
        }
        // Migrate to new format
        this.save();
        localStorage.removeItem("a2e-breakpoints");
      }
    } catch (e) {
      console.warn("Failed to load breakpoints:", e);
    }
  }
}
