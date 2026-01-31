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
  }

  /**
   * Check if temp breakpoint was hit (call in update loop)
   */
  checkTemp(pc) {
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
   * Evaluate a breakpoint condition expression.
   * Supports:
   *   Register comparisons: A==#$FF, X>=#$10
   *   Memory reads: PEEK($00)==#$42
   *   Flag checks: C==1, Z==0
   *   Combinators: &&, ||
   */
  evaluateCondition(expr) {
    const tokens = this._tokenize(expr);
    return this._parseOr(tokens, { pos: 0 });
  }

  _tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      if (expr[i] === " " || expr[i] === "\t") {
        i++;
        continue;
      }
      // Two-char operators
      if (i + 1 < expr.length) {
        const two = expr.substring(i, i + 2);
        if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
          tokens.push(two);
          i += 2;
          continue;
        }
      }
      // Single-char operators
      if (["<", ">", "(", ")", "+", "-", "*"].includes(expr[i])) {
        tokens.push(expr[i]);
        i++;
        continue;
      }
      // Hex literal: #$XX or $XXXX
      if (
        expr[i] === "#" &&
        i + 1 < expr.length &&
        expr[i + 1] === "$"
      ) {
        let num = "";
        i += 2;
        while (i < expr.length && /[0-9A-Fa-f]/.test(expr[i])) {
          num += expr[i++];
        }
        tokens.push({ type: "num", value: parseInt(num, 16) });
        continue;
      }
      if (expr[i] === "$") {
        let num = "";
        i++;
        while (i < expr.length && /[0-9A-Fa-f]/.test(expr[i])) {
          num += expr[i++];
        }
        tokens.push({ type: "num", value: parseInt(num, 16) });
        continue;
      }
      // Decimal literal
      if (/[0-9]/.test(expr[i])) {
        let num = "";
        while (i < expr.length && /[0-9]/.test(expr[i])) {
          num += expr[i++];
        }
        tokens.push({ type: "num", value: parseInt(num, 10) });
        continue;
      }
      // Identifiers: A, X, Y, SP, PC, P, C, Z, N, V, D, I, PEEK, DEEK
      if (/[A-Za-z_]/.test(expr[i])) {
        let id = "";
        while (i < expr.length && /[A-Za-z0-9_]/.test(expr[i])) {
          id += expr[i++];
        }
        tokens.push({ type: "id", value: id.toUpperCase() });
        continue;
      }
      // Unknown char, skip
      i++;
    }
    return tokens;
  }

  _parseOr(tokens, ctx) {
    let left = this._parseAnd(tokens, ctx);
    while (ctx.pos < tokens.length && tokens[ctx.pos] === "||") {
      ctx.pos++;
      const right = this._parseAnd(tokens, ctx);
      left = left || right;
    }
    return left;
  }

  _parseAnd(tokens, ctx) {
    let left = this._parseComparison(tokens, ctx);
    while (ctx.pos < tokens.length && tokens[ctx.pos] === "&&") {
      ctx.pos++;
      const right = this._parseComparison(tokens, ctx);
      left = left && right;
    }
    return left;
  }

  _parseComparison(tokens, ctx) {
    const left = this._parseExpr(tokens, ctx);
    if (ctx.pos < tokens.length) {
      const op = tokens[ctx.pos];
      if (["==", "!=", ">=", "<=", ">", "<"].includes(op)) {
        ctx.pos++;
        const right = this._parseExpr(tokens, ctx);
        switch (op) {
          case "==":
            return left === right;
          case "!=":
            return left !== right;
          case ">=":
            return left >= right;
          case "<=":
            return left <= right;
          case ">":
            return left > right;
          case "<":
            return left < right;
        }
      }
    }
    return !!left; // Truthy if no comparison
  }

  _parseExpr(tokens, ctx) {
    let val = this._parseAtom(tokens, ctx);
    while (ctx.pos < tokens.length) {
      const op = tokens[ctx.pos];
      if (op === "+" || op === "-" || op === "*") {
        ctx.pos++;
        const right = this._parseAtom(tokens, ctx);
        if (op === "+") val += right;
        else if (op === "-") val -= right;
        else val *= right;
      } else break;
    }
    return val;
  }

  _parseAtom(tokens, ctx) {
    if (ctx.pos >= tokens.length) return 0;
    const t = tokens[ctx.pos];

    // Number literal
    if (typeof t === "object" && t.type === "num") {
      ctx.pos++;
      return t.value;
    }

    // Parenthesized expression
    if (t === "(") {
      ctx.pos++;
      const val = this._parseOr(tokens, ctx);
      if (ctx.pos < tokens.length && tokens[ctx.pos] === ")") {
        ctx.pos++;
      }
      return val;
    }

    // Identifier
    if (typeof t === "object" && t.type === "id") {
      ctx.pos++;
      const id = t.value;

      // PEEK(addr) - read byte
      if (id === "PEEK" && ctx.pos < tokens.length && tokens[ctx.pos] === "(") {
        ctx.pos++;
        const addr = this._parseOr(tokens, ctx);
        if (ctx.pos < tokens.length && tokens[ctx.pos] === ")") ctx.pos++;
        return this.wasmModule._peekMemory(addr & 0xffff);
      }

      // DEEK(addr) - read 16-bit word (little-endian)
      if (id === "DEEK" && ctx.pos < tokens.length && tokens[ctx.pos] === "(") {
        ctx.pos++;
        const addr = this._parseOr(tokens, ctx);
        if (ctx.pos < tokens.length && tokens[ctx.pos] === ")") ctx.pos++;
        const lo = this.wasmModule._peekMemory(addr & 0xffff);
        const hi = this.wasmModule._peekMemory((addr + 1) & 0xffff);
        return (hi << 8) | lo;
      }

      // Registers
      switch (id) {
        case "A":
          return this.wasmModule._getA();
        case "X":
          return this.wasmModule._getX();
        case "Y":
          return this.wasmModule._getY();
        case "SP":
          return this.wasmModule._getSP();
        case "PC":
          return this.wasmModule._getPC();
        case "P":
          return this.wasmModule._getP();
        // Individual flags
        case "C":
          return this.wasmModule._getP() & 0x01 ? 1 : 0;
        case "Z":
          return this.wasmModule._getP() & 0x02 ? 1 : 0;
        case "I":
          return this.wasmModule._getP() & 0x04 ? 1 : 0;
        case "D":
          return this.wasmModule._getP() & 0x08 ? 1 : 0;
        case "B":
          return this.wasmModule._getP() & 0x10 ? 1 : 0;
        case "V":
          return this.wasmModule._getP() & 0x40 ? 1 : 0;
        case "N":
          return this.wasmModule._getP() & 0x80 ? 1 : 0;
      }

      return 0; // Unknown identifier
    }

    // Fallback
    ctx.pos++;
    return 0;
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
