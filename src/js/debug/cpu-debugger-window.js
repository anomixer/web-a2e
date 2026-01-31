import { BaseWindow } from "../windows/base-window.js";
import {
  getSymbolInfo,
  getCategoryClass,
  ALL_SYMBOLS,
} from "./symbols.js";
import { BreakpointManager } from "./breakpoint-manager.js";
import { LabelManager } from "./label-manager.js";

/**
 * CPUDebuggerWindow - CPU registers, disassembly, and breakpoints
 */
export class CPUDebuggerWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "cpu-debugger",
      title: "CPU Debugger",
      minWidth: 420,
      minHeight: 400,
      defaultWidth: 500,
      defaultHeight: 600,
      defaultPosition: { x: window.innerWidth - 480, y: 60 },
    });

    this.wasmModule = wasmModule;
    this.bpManager = new BreakpointManager(wasmModule);
    this.labelManager = new LabelManager();
    this.lastPC = null;
    this.disasmCache = []; // Cache of {addr, disasm, len} for current view
    this.disasmStartAddr = 0;
    this.disasmViewAddress = null; // When set, overrides PC-centered view
    this.previousRegisters = {}; // For change highlighting
    this.profileEnabled = false; // When true, shows heat overlay in disassembly
    this.watchExpressions = []; // Array of expression strings
    this.loadWatchExpressions();
    this.bookmarks = []; // Array of addresses
    this.loadBookmarks();

    // Re-render breakpoint list when breakpoints change
    this.bpManager.onChange(() => {
      this.updateBreakpointList();
      this.updateDisassembly();
    });
  }

  renderContent() {
    return `
      <div class="cpu-dbg">
        <div class="cpu-dbg-toolbar">
          <div class="cpu-dbg-btn-group">
            <button class="cpu-dbg-btn cpu-btn-run" id="dbg-run" title="Continue (F5)">▶ Run</button>
            <button class="cpu-dbg-btn cpu-btn-pause" id="dbg-pause" title="Pause">⏸ Pause</button>
          </div>
          <span class="cpu-dbg-sep"></span>
          <div class="cpu-dbg-btn-group">
            <button class="cpu-dbg-btn" id="dbg-step" title="Step Into (F11)">Step</button>
            <button class="cpu-dbg-btn" id="dbg-step-over" title="Step Over (F10)">Over</button>
            <button class="cpu-dbg-btn" id="dbg-step-out" title="Step Out (Shift+F11)">Out</button>
          </div>
          <span class="cpu-dbg-status" id="dbg-status">PAUSED</span>
        </div>

        <div class="cpu-dbg-state">
          <div class="cpu-dbg-regs">
            <div class="cpu-dbg-reg"><span class="reg-label">A</span><span class="reg-value" id="reg-a">00</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">X</span><span class="reg-value" id="reg-x">00</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">Y</span><span class="reg-value" id="reg-y">00</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">SP</span><span class="reg-value" id="reg-sp">FF</span></div>
            <div class="cpu-dbg-reg reg-wide"><span class="reg-label">PC</span><span class="reg-value" id="reg-pc">0000</span></div>
          </div>
          <div class="cpu-dbg-status-row">
            <div class="cpu-flags" id="flags">
              <span class="flag" id="flag-n" title="Negative">N</span>
              <span class="flag" id="flag-v" title="Overflow">V</span>
              <span class="flag separator">-</span>
              <span class="flag" id="flag-b" title="Break">B</span>
              <span class="flag" id="flag-d" title="Decimal">D</span>
              <span class="flag" id="flag-i" title="Interrupt Disable">I</span>
              <span class="flag" id="flag-z" title="Zero">Z</span>
              <span class="flag" id="flag-c" title="Carry">C</span>
            </div>
            <div class="cpu-dbg-meta">
              <span class="cpu-dbg-cycles"><span class="meta-dim">CYC</span> <span id="cycle-count">0</span></span>
              <span class="irq-indicator" id="irq-pending" title="IRQ Pending">IRQ</span>
              <span class="irq-indicator" id="nmi-pending" title="NMI Pending">NMI</span>
              <span class="irq-indicator" id="nmi-edge" title="NMI Edge Detected">EDGE</span>
            </div>
          </div>
        </div>

        <div class="cpu-dbg-disasm">
          <div class="cpu-dbg-disasm-bar">
            <input type="text" id="disasm-goto-input" placeholder="Address / Symbol" spellcheck="false">
            <button class="cpu-dbg-bar-btn" id="disasm-goto-btn" title="Go to address">Go</button>
            <button class="cpu-dbg-bar-btn" id="disasm-goto-pc" title="Follow PC">PC</button>
            <button class="cpu-dbg-bar-btn" id="disasm-import-sym" title="Import symbol file">Sym</button>
          </div>
          <div class="cpu-disasm-view" id="disasm-view"></div>
        </div>

        <div class="cpu-dbg-panel">
          <div class="cpu-dbg-panel-header">
            <span class="cpu-dbg-panel-title">Breakpoints</span>
            <div class="cpu-dbg-panel-controls">
              <select id="bp-type-select" title="Breakpoint type">
                <option value="exec">Exec</option>
                <option value="read">Read</option>
                <option value="write">Write</option>
                <option value="readwrite">R/W</option>
              </select>
              <input type="text" id="breakpoint-input" placeholder="$XXXX" spellcheck="false">
              <button class="cpu-dbg-add-btn" id="breakpoint-add-btn" title="Add breakpoint">+</button>
            </div>
          </div>
          <div class="cpu-bp-list" id="breakpoint-list"></div>
        </div>

        <div class="cpu-dbg-panel">
          <div class="cpu-dbg-panel-header">
            <span class="cpu-dbg-panel-title">Watch</span>
            <div class="cpu-dbg-panel-controls">
              <input type="text" id="watch-input" placeholder="PEEK($00), A*2, DEEK($36)" spellcheck="false">
              <button class="cpu-dbg-add-btn" id="watch-add-btn" title="Add watch">+</button>
            </div>
          </div>
          <div class="cpu-watch-list" id="watch-list"></div>
        </div>
      </div>
    `;
  }

  /**
   * Set up event listeners after content is rendered
   */
  setupContentEventListeners() {
    // Disassembly click handler using event delegation with mousedown
    const disasmView = this.contentElement.querySelector("#disasm-view");
    if (disasmView) {
      disasmView.addEventListener("mousedown", (e) => {
        const line = e.target.closest(".cpu-disasm-line");
        if (line && line.dataset.addr) {
          const addr = parseInt(line.dataset.addr, 16);
          e.preventDefault();
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey) {
            this.toggleBookmark(addr);
          } else {
            this.bpManager.toggle(addr);
          }
        }
      });

      // Context menu for run to cursor
      disasmView.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const line = e.target.closest(".cpu-disasm-line");
        if (line && line.dataset.addr) {
          const addr = parseInt(line.dataset.addr, 16);
          this.showDisasmContextMenu(e.clientX, e.clientY, addr);
        }
      });
    }

    // Debug control buttons
    const runBtn = this.contentElement.querySelector("#dbg-run");
    const pauseBtn = this.contentElement.querySelector("#dbg-pause");
    const stepBtn = this.contentElement.querySelector("#dbg-step");

    if (runBtn) {
      runBtn.addEventListener("click", () => {
        this.wasmModule._setPaused(false);
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener("click", () => {
        this.bpManager.clearTemp();
        this.wasmModule._setPaused(true);
      });
    }

    if (stepBtn) {
      stepBtn.addEventListener("click", () => {
        this.bpManager.clearTemp();
        this.wasmModule._stepInstruction();
      });
    }

    // Step Over - step over JSR instructions
    const stepOverBtn = this.contentElement.querySelector("#dbg-step-over");
    if (stepOverBtn) {
      stepOverBtn.addEventListener("click", () => this.stepOver());
    }

    // Step Out - run until RTS returns
    const stepOutBtn = this.contentElement.querySelector("#dbg-step-out");
    if (stepOutBtn) {
      stepOutBtn.addEventListener("click", () => this.stepOut());
    }

    // Goto address in disassembly
    const gotoInput = this.contentElement.querySelector("#disasm-goto-input");
    const gotoBtn = this.contentElement.querySelector("#disasm-goto-btn");
    const gotoPcBtn = this.contentElement.querySelector("#disasm-goto-pc");

    if (gotoBtn && gotoInput) {
      const doGoto = () => {
        const text = gotoInput.value.trim();
        if (!text) return;
        const addr = this.resolveAddress(text);
        if (addr !== null) {
          this.disasmViewAddress = addr;
          this.updateDisassembly();
        }
      };
      gotoBtn.addEventListener("click", doGoto);
      gotoInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") doGoto();
      });
      gotoInput.addEventListener("keydown", (e) => e.stopPropagation());
    }

    if (gotoPcBtn) {
      gotoPcBtn.addEventListener("click", () => {
        this.disasmViewAddress = null;
        this.updateDisassembly();
      });
    }

    // Import symbols button
    const importSymBtn = this.contentElement.querySelector("#disasm-import-sym");
    if (importSymBtn) {
      importSymBtn.addEventListener("click", () => this.importSymbolFile());
    }

    // Double-click disassembly line to add/edit comment
    if (disasmView) {
      disasmView.addEventListener("dblclick", (e) => {
        const line = e.target.closest(".cpu-disasm-line");
        if (line && line.dataset.addr) {
          const addr = parseInt(line.dataset.addr, 16);
          this.editInlineComment(addr);
        }
      });
    }

    // Breakpoint add
    const bpInput = this.contentElement.querySelector("#breakpoint-input");
    const bpAddBtn = this.contentElement.querySelector("#breakpoint-add-btn");
    if (bpAddBtn && bpInput) {
      bpAddBtn.addEventListener("click", () => this.addBreakpointFromInput());
      bpInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.addBreakpointFromInput();
      });
      bpInput.addEventListener("keydown", (e) => e.stopPropagation());
    }

    // Breakpoint list event delegation (survives DOM rebuilds)
    const bpList = this.contentElement.querySelector("#breakpoint-list");
    if (bpList) {
      bpList.addEventListener("mousedown", (e) => {
        const removeBtn = e.target.closest(".bp-remove");
        if (removeBtn) {
          e.stopPropagation();
          e.preventDefault();
          const item = removeBtn.closest(".cpu-bp-item");
          if (item && item.dataset.addr) {
            this.bpManager.remove(parseInt(item.dataset.addr, 10));
          }
          return;
        }
        const checkbox = e.target.closest(".bp-enable input");
        if (checkbox) {
          // Let the checkbox handle its own change event
          return;
        }
      });
      bpList.addEventListener("change", (e) => {
        const checkbox = e.target.closest(".bp-enable input");
        if (checkbox) {
          const item = checkbox.closest(".cpu-bp-item");
          if (item && item.dataset.addr) {
            this.bpManager.setEnabled(
              parseInt(item.dataset.addr, 10),
              checkbox.checked,
            );
          }
        }
      });
      bpList.addEventListener("dblclick", (e) => {
        const item = e.target.closest(".cpu-bp-item");
        if (item && item.dataset.addr) {
          e.stopPropagation();
          this.editBreakpointCondition(parseInt(item.dataset.addr, 10));
        }
      });
    }

    // Watch expression add
    const watchInput = this.contentElement.querySelector("#watch-input");
    const watchAddBtn = this.contentElement.querySelector("#watch-add-btn");
    if (watchAddBtn && watchInput) {
      const addWatch = () => {
        const expr = watchInput.value.trim();
        if (expr) {
          this.watchExpressions.push(expr);
          this.saveWatchExpressions();
          this.updateWatchList();
          watchInput.value = "";
        }
      };
      watchAddBtn.addEventListener("click", addWatch);
      watchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") addWatch();
      });
      watchInput.addEventListener("keydown", (e) => e.stopPropagation());
    }

    // Watch list event delegation (survives DOM rebuilds from updateWatchList)
    const watchList = this.contentElement.querySelector("#watch-list");
    if (watchList) {
      watchList.addEventListener("mousedown", (e) => {
        const removeBtn = e.target.closest(".watch-remove");
        if (removeBtn) {
          e.stopPropagation();
          e.preventDefault();
          const item = removeBtn.closest(".cpu-watch-item");
          if (item && item.dataset.index !== undefined) {
            const idx = parseInt(item.dataset.index, 10);
            this.watchExpressions.splice(idx, 1);
            this.saveWatchExpressions();
            this.updateWatchList();
          }
        }
      });
    }
  }

  /**
   * Override create to set up content event listeners
   */
  create() {
    super.create();
    this.setupContentEventListeners();
    this.setupKeyboardShortcuts();
    this.setupRegisterEditing();
  }

  destroy() {
    this.removeKeyboardShortcuts();
    super.destroy();
  }

  setupKeyboardShortcuts() {
    this._keyHandler = (e) => {
      if (!this.isVisible) return;

      switch (e.key) {
        case "F5":
          e.preventDefault();
          e.stopPropagation();
          this.wasmModule._setPaused(false);
          break;
        case "F10":
          e.preventDefault();
          e.stopPropagation();
          this.stepOver();
          break;
        case "F11":
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            this.stepOut();
          } else {
            this.bpManager.clearTemp();
            this.wasmModule._stepInstruction();
          }
          break;
      }
    };
    document.addEventListener("keydown", this._keyHandler, { capture: true });
  }

  removeKeyboardShortcuts() {
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler, {
        capture: true,
      });
      this._keyHandler = null;
    }
  }

  /**
   * Add breakpoint from input field
   */
  addBreakpointFromInput() {
    const input = this.contentElement.querySelector("#breakpoint-input");
    const typeSelect = this.contentElement.querySelector("#bp-type-select");
    if (!input) return;

    const text = input.value.trim();
    const addr = this.resolveAddress(text) ?? parseInt(text, 16);
    const type = typeSelect ? typeSelect.value : "exec";

    if (!isNaN(addr) && addr >= 0 && addr <= 0xffff) {
      this.bpManager.add(addr, { type });
      input.value = "";
    }
  }

  /**
   * Resolve an address from hex string or symbol name
   * @returns {number|null} Address or null if invalid
   */
  resolveAddress(text) {
    // Try hex: $XXXX, 0xXXXX, or plain hex
    const hexMatch = text.match(/^\$?(?:0x)?([0-9A-Fa-f]{1,4})$/);
    if (hexMatch) {
      return parseInt(hexMatch[1], 16);
    }

    // Try label manager first (user labels + imported symbols)
    const labelAddr = this.labelManager.resolveByName(text);
    if (labelAddr !== null) return labelAddr;

    // Try built-in symbol name lookup (case-insensitive)
    const upper = text.toUpperCase();
    for (const [addr, info] of Object.entries(ALL_SYMBOLS)) {
      if (info.name.toUpperCase() === upper) {
        return parseInt(addr);
      }
    }

    return null;
  }

  // Breakpoint management is delegated to this.bpManager (BreakpointManager)

  /**
   * Step Over - if current instruction is JSR, run until it returns
   * Otherwise, just do a single step
   */
  stepOver() {
    this.bpManager.clearTemp();
    const pc = this.wasmModule._getPC();
    const opcode = this.wasmModule._peekMemory(pc);

    if (opcode === 0x20) {
      // JSR - set breakpoint at instruction after JSR (PC + 3)
      const returnAddr = (pc + 3) & 0xffff;
      this.bpManager.setTemp(returnAddr);
      this.wasmModule._setPaused(false);
    } else if (opcode === 0x00) {
      // BRK - treat like JSR but with PC+2 as return address
      const returnAddr = (pc + 2) & 0xffff;
      this.bpManager.setTemp(returnAddr);
      this.wasmModule._setPaused(false);
    } else {
      // Not a JSR/BRK, just single step
      this.wasmModule._stepInstruction();
    }
  }

  /**
   * Step Out - run until the current subroutine returns
   * Reads return address from stack and sets breakpoint there
   */
  stepOut() {
    this.bpManager.clearTemp();
    const sp = this.wasmModule._getSP();
    // Stack is at $0100-$01FF, return address is at SP+1 (low) and SP+2 (high)
    // The 6502 pushes PCH first, then PCL, so:
    // $0100+SP+1 = PCL, $0100+SP+2 = PCH
    const pcl = this.wasmModule._peekMemory(0x0100 + ((sp + 1) & 0xff));
    const pch = this.wasmModule._peekMemory(0x0100 + ((sp + 2) & 0xff));
    // RTS adds 1 to the address, so the actual return is (pch:pcl) + 1
    const returnAddr = ((pch << 8) | pcl) + 1;

    if (returnAddr > 0 && returnAddr <= 0xffff) {
      this.bpManager.setTemp(returnAddr & 0xffff);
      this.wasmModule._setPaused(false);
    } else {
      // Invalid return address (probably not in a subroutine), just step
      this.wasmModule._stepInstruction();
    }
  }

  /**
   * Show context menu on disassembly line
   */
  showDisasmContextMenu(x, y, addr) {
    // Remove existing menu
    this.hideDisasmContextMenu();

    const menu = document.createElement("div");
    menu.className = "cpu-disasm-context-menu";
    menu.innerHTML = `
      <div class="ctx-item" data-action="run-to">Run to $${this.formatHex(addr, 4)}</div>
      <div class="ctx-item" data-action="goto">Go to $${this.formatHex(addr, 4)}</div>
      <div class="ctx-item" data-action="toggle-bp">${this.bpManager.has(addr) ? "Remove" : "Set"} Breakpoint</div>
    `;
    menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      z-index: 10000;
      background: rgba(22, 27, 34, 0.95);
      border: 1px solid rgba(48, 54, 61, 0.6);
      border-radius: 4px;
      padding: 4px 0;
      font-family: var(--font-mono);
      font-size: 11px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      min-width: 160px;
    `;

    menu.querySelectorAll(".ctx-item").forEach((item) => {
      item.style.cssText = `
        padding: 6px 12px;
        color: var(--text-secondary);
        cursor: pointer;
      `;
      item.addEventListener("mouseenter", () => {
        item.style.background = "rgba(88, 166, 255, 0.2)";
        item.style.color = "var(--text-primary)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
        item.style.color = "var(--text-secondary)";
      });
      item.addEventListener("click", () => {
        const action = item.dataset.action;
        if (action === "run-to") {
          this.runToCursor(addr);
        } else if (action === "goto") {
          this.disasmViewAddress = addr;
          this.updateDisassembly();
        } else if (action === "toggle-bp") {
          this.bpManager.toggle(addr);
        }
        this.hideDisasmContextMenu();
      });
    });

    document.body.appendChild(menu);
    this._contextMenu = menu;

    // Close on click anywhere else
    this._contextMenuClose = () => this.hideDisasmContextMenu();
    setTimeout(() => {
      document.addEventListener("mousedown", this._contextMenuClose);
    }, 0);
  }

  hideDisasmContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
    if (this._contextMenuClose) {
      document.removeEventListener("mousedown", this._contextMenuClose);
      this._contextMenuClose = null;
    }
  }

  /**
   * Run to cursor - set temp breakpoint and resume
   */
  runToCursor(addr) {
    this.bpManager.setTemp(addr);
    this.wasmModule._setPaused(false);
  }

  /**
   * Update all window content
   */
  update(wasmModule) {
    this.wasmModule = wasmModule;

    const pc = this.wasmModule._getPC();
    const isPaused = this.wasmModule._isPaused();

    // Update status indicator
    const statusEl = this.contentElement.querySelector("#dbg-status");
    if (statusEl) {
      if (isPaused) {
        statusEl.textContent = "PAUSED";
        statusEl.classList.remove("running");
      } else {
        statusEl.textContent = "RUNNING";
        statusEl.classList.add("running");
      }
    }

    // Check temp breakpoint
    this.bpManager.checkTemp(pc);

    // Check if a watchpoint was hit - evaluate conditions/hit counts
    if (isPaused && this.wasmModule._isWatchpointHit && this.wasmModule._isWatchpointHit()) {
      const wpAddr = this.wasmModule._getWatchpointAddress();
      if (!this.bpManager.shouldBreak(wpAddr)) {
        // Condition not met or hit target not reached - resume
        this.wasmModule._setPaused(false);
        return;
      }
    }

    // Check conditional breakpoint evaluation
    if (isPaused && this.wasmModule._isBreakpointHit && this.wasmModule._isBreakpointHit()) {
      const bpAddr = this.wasmModule._getBreakpointAddress();
      if (!this.bpManager.shouldBreak(bpAddr)) {
        // Condition not met - resume execution
        this.wasmModule._setPaused(false);
        return;
      }
    }

    // If PC changed, snap disassembly back to follow PC
    if (this.lastPC !== null && pc !== this.lastPC) {
      this.disasmViewAddress = null;
    }

    this.updateRegisters();
    this.updateFlags();
    this.updateIRQState();
    this.updateDisassembly();
    this.updateWatchList();
  }

  /**
   * Register definitions for display and editing
   */
  static REGISTER_DEFS = [
    { id: "reg-a", fn: "_getA", setFn: "_setRegA", digits: 2 },
    { id: "reg-x", fn: "_getX", setFn: "_setRegX", digits: 2 },
    { id: "reg-y", fn: "_getY", setFn: "_setRegY", digits: 2 },
    { id: "reg-sp", fn: "_getSP", setFn: "_setRegSP", digits: 2 },
    { id: "reg-pc", fn: "_getPC", setFn: "_setRegPC", digits: 4 },
    { id: "cycle-count", fn: "_getTotalCycles", setFn: null, digits: 0 },
  ];

  /**
   * Update CPU register display
   */
  updateRegisters() {
    CPUDebuggerWindow.REGISTER_DEFS.forEach(({ id, fn, digits }) => {
      const elem = this.contentElement.querySelector(`#${id}`);
      if (elem && this.wasmModule[fn]) {
        // Don't update if we're currently editing this register
        if (elem.dataset.editing === "true") return;
        const value = this.wasmModule[fn]();
        const text =
          digits > 0 ? this.formatHex(value, digits) : value.toString();

        // Highlight changes
        const prevVal = this.previousRegisters[id];
        if (prevVal !== undefined && prevVal !== text) {
          elem.classList.remove("changed");
          // Force reflow to restart animation
          void elem.offsetWidth;
          elem.classList.add("changed");
        }
        this.previousRegisters[id] = text;

        elem.textContent = text;
      }
    });
  }

  /**
   * Set up register editing - click a register value to edit it
   */
  setupRegisterEditing() {
    CPUDebuggerWindow.REGISTER_DEFS.forEach(({ id, setFn, digits }) => {
      if (!setFn) return; // Skip non-editable registers like cycle count
      const elem = this.contentElement.querySelector(`#${id}`);
      if (!elem) return;

      elem.style.cursor = "pointer";
      elem.title = "Click to edit";

      elem.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (!this.wasmModule._isPaused()) return;
        if (elem.dataset.editing === "true") return;

        const currentValue = elem.textContent;
        elem.dataset.editing = "true";

        const input = document.createElement("input");
        input.type = "text";
        input.value = currentValue;
        input.maxLength = digits;
        input.className = "cpu-reg-edit-input";
        input.style.cssText = `
          width: ${digits * 8 + 8}px;
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 600;
          color: var(--accent-green);
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid var(--accent-blue);
          border-radius: 2px;
          padding: 0 2px;
          text-align: center;
          outline: none;
        `;

        elem.textContent = "";
        elem.appendChild(input);
        input.focus();
        input.select();

        const commit = () => {
          const val = parseInt(input.value, 16);
          const maxVal = digits === 4 ? 0xffff : 0xff;
          if (!isNaN(val) && val >= 0 && val <= maxVal) {
            this.wasmModule[setFn](val);
          }
          elem.dataset.editing = "false";
          input.remove();
          this.updateRegisters();
          this.updateDisassembly();
        };

        const cancel = () => {
          elem.dataset.editing = "false";
          input.remove();
          this.updateRegisters();
        };

        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            commit();
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            cancel();
          }
          ev.stopPropagation();
        });
        input.addEventListener("blur", commit);
      });
    });
  }

  /**
   * Update CPU flags display
   */
  updateFlags() {
    const p = this.wasmModule._getP();
    const flags = [
      { id: "flag-n", bit: 0x80 },
      { id: "flag-v", bit: 0x40 },
      { id: "flag-b", bit: 0x10 },
      { id: "flag-d", bit: 0x08 },
      { id: "flag-i", bit: 0x04 },
      { id: "flag-z", bit: 0x02 },
      { id: "flag-c", bit: 0x01 },
    ];

    flags.forEach(({ id, bit }) => {
      const elem = this.contentElement.querySelector(`#${id}`);
      if (elem) {
        elem.classList.toggle("active", (p & bit) !== 0);
      }
    });
  }

  /**
   * Update IRQ/NMI state indicators
   */
  updateIRQState() {
    const indicators = [
      { id: "irq-pending", fn: "_isIRQPending" },
      { id: "nmi-pending", fn: "_isNMIPending" },
      { id: "nmi-edge", fn: "_isNMIEdge" },
    ];

    indicators.forEach(({ id, fn }) => {
      const elem = this.contentElement.querySelector(`#${id}`);
      if (elem && this.wasmModule[fn]) {
        elem.classList.toggle("active", this.wasmModule[fn]());
      }
    });
  }

  /**
   * Find a good starting address for disassembly that aligns with instruction boundaries.
   * Scans forward from a safe distance back to find valid instruction starts.
   */
  findDisasmStartAddress(pc, instructionsBefore) {
    // Start from further back and scan forward to find instruction boundaries
    const maxLookback = instructionsBefore * 3 + 10; // Max bytes to look back
    let startAddr = Math.max(0, pc - maxLookback);

    // Build a list of instruction addresses by scanning forward
    const addresses = [];
    let addr = startAddr;
    while (addr <= pc + 100 && addr <= 0xffff) {
      addresses.push(addr);
      const opcode = this.wasmModule._peekMemory(addr);
      addr += this.getInstructionLength(opcode);
    }

    // Find where PC falls in our list
    const pcIndex = addresses.indexOf(pc);
    if (pcIndex === -1) {
      // PC not aligned - find closest address before PC
      for (let i = addresses.length - 1; i >= 0; i--) {
        if (addresses[i] <= pc) {
          const startIndex = Math.max(0, i - instructionsBefore);
          return addresses[startIndex];
        }
      }
      return Math.max(0, pc - 20);
    }

    // Return address that gives us instructionsBefore lines before PC
    const startIndex = Math.max(0, pcIndex - instructionsBefore);
    return addresses[startIndex];
  }

  /**
   * Update disassembly view
   */
  updateDisassembly() {
    const view = this.contentElement.querySelector("#disasm-view");
    if (!view) return;

    const pc = this.wasmModule._getPC();
    const totalLines = 24; // Total instructions to show
    const linesBefore = 6; // Instructions to show before center

    // Cache profiling data if enabled
    this._profileMax = 0;
    this._profilePtr = 0;
    if (this.profileEnabled && this.wasmModule._getProfileCycles) {
      this._profilePtr = this.wasmModule._getProfileCycles();
      if (this._profilePtr) {
        // Find max for normalization by scanning a quick sample
        const heap32 = new Uint32Array(this.wasmModule.HEAPU8.buffer);
        const baseIdx = this._profilePtr >> 2;
        let max = 0;
        // Sample the profile to find max
        for (let i = 0; i < 65536; i += 64) {
          const v = heap32[baseIdx + i];
          if (v > max) max = v;
        }
        this._profileMax = max;
      }
    }

    // Use custom view address or PC
    const centerAddr =
      this.disasmViewAddress !== null ? this.disasmViewAddress : pc;

    // Find aligned start address
    const startAddr = this.findDisasmStartAddress(centerAddr, linesBefore);

    view.innerHTML = "";
    let addr = startAddr;
    let pcLineElement = null;

    // Disassemble instructions
    for (let i = 0; i < totalLines && addr <= 0xffff; i++) {
      // Check for label at this address - show on its own line
      const labelInfo = this.labelManager.getLabel(addr);
      if (labelInfo && labelInfo.name) {
        const labelLine = document.createElement("div");
        labelLine.className = "cpu-disasm-label-line";
        labelLine.textContent = labelInfo.name + ":";
        view.appendChild(labelLine);
      }

      const line = document.createElement("div");
      line.className = "cpu-disasm-line";
      line.dataset.addr = addr.toString(16);

      const isCurrent = addr === pc;
      if (isCurrent) {
        line.classList.add("current");
        pcLineElement = line;
      }
      if (this.bpManager.has(addr)) {
        line.classList.add("breakpoint");
      }

      // Heat overlay from profiling
      if (this.profileEnabled && this._profileMax > 0) {
        const heat = this.getHeatLevel(addr);
        if (heat > 0) line.classList.add("heat-" + heat);
      }

      // Breakpoint gutter
      const gutterSpan = document.createElement("span");
      gutterSpan.className = "cpu-disasm-gutter";
      const isBookmarked = this.bookmarks.includes(addr);
      if (isBookmarked) {
        line.classList.add("bookmarked");
      }

      if (this.bpManager.has(addr)) {
        gutterSpan.innerHTML = '<span class="bp-dot"></span>';
      } else if (isCurrent) {
        gutterSpan.innerHTML = '<span class="pc-arrow">▶</span>';
      } else if (isBookmarked) {
        gutterSpan.innerHTML = '<span class="bm-star">★</span>';
      }

      // Get disassembly from WASM
      const disasm = this.wasmModule.UTF8ToString(
        this.wasmModule._disassembleAt(addr),
      );

      // Parse: "AAAA: BB BB BB  MMM OPERAND"
      const addrPart = disasm.substring(0, 4);
      const bytesPart = disasm.substring(6, 14).trim();
      const instrPart = disasm.substring(16);

      const addrSpan = document.createElement("span");
      addrSpan.className = "cpu-disasm-addr";
      addrSpan.textContent = addrPart;

      const bytesSpan = document.createElement("span");
      bytesSpan.className = "cpu-disasm-bytes";
      bytesSpan.textContent = bytesPart;

      const instrSpan = document.createElement("span");
      instrSpan.className = "cpu-disasm-instr";

      // Split mnemonic from operand for proper column alignment and color coding
      const spaceIdx = instrPart.indexOf(" ");
      const mnemonic = spaceIdx >= 0 ? instrPart.substring(0, spaceIdx) : instrPart;
      const operandStr = spaceIdx >= 0 ? instrPart.substring(spaceIdx + 1) : "";

      const mnemonicSpan = document.createElement("span");
      mnemonicSpan.className = "cpu-disasm-mnemonic";
      if (CPUDebuggerWindow.FLOW_MNEMONICS.has(mnemonic)) {
        mnemonicSpan.classList.add("flow");
      }
      mnemonicSpan.textContent = mnemonic;
      instrSpan.appendChild(mnemonicSpan);

      if (operandStr) {
        const operandSpan = document.createElement("span");
        operandSpan.className = "cpu-disasm-operand";
        operandSpan.innerHTML = this.symbolizeInstruction(operandStr);
        instrSpan.appendChild(operandSpan);
      }

      line.appendChild(gutterSpan);
      line.appendChild(addrSpan);
      line.appendChild(bytesSpan);
      line.appendChild(instrSpan);

      // Inline comment
      if (labelInfo && labelInfo.comment) {
        const commentSpan = document.createElement("span");
        commentSpan.className = "cpu-disasm-comment";
        commentSpan.textContent = "; " + labelInfo.comment;
        line.appendChild(commentSpan);
      }

      view.appendChild(line);

      // Advance to next instruction
      const opcode = this.wasmModule._peekMemory(addr);
      addr += this.getInstructionLength(opcode);
    }

    // Scroll to keep PC visible
    if (pcLineElement) {
      const viewRect = view.getBoundingClientRect();
      const lineRect = pcLineElement.getBoundingClientRect();

      // Check if line is outside visible area
      if (lineRect.top < viewRect.top || lineRect.bottom > viewRect.bottom) {
        pcLineElement.scrollIntoView({ block: "center", behavior: "auto" });
      }
    }

    this.lastPC = pc;
  }

  /**
   * Type icon map for breakpoint list display
   */
  /**
   * Control flow mnemonics - colored differently in disassembly
   * to help developers track execution flow at a glance.
   */
  static FLOW_MNEMONICS = new Set([
    "JMP", "JSR", "RTS", "RTI", "BRK",
    "BPL", "BMI", "BVC", "BVS", "BCC", "BCS", "BNE", "BEQ", "BRA",
  ]);

  static BP_TYPE_ICONS = {
    exec: "●",
    read: "R",
    write: "W",
    readwrite: "RW",
  };

  static BP_TYPE_TITLES = {
    exec: "Execution breakpoint",
    read: "Read watchpoint",
    write: "Write watchpoint",
    readwrite: "Read/Write watchpoint",
  };

  /**
   * Update breakpoint list with rich UI
   */
  updateBreakpointList() {
    const list = this.contentElement.querySelector("#breakpoint-list");
    if (!list) return;

    list.innerHTML = "";
    const allBps = this.bpManager.getAll();

    for (const [addr, entry] of allBps) {
      if (entry.isTemp) continue;

      const item = document.createElement("div");
      item.className = "cpu-bp-item";
      item.dataset.addr = addr;
      if (!entry.enabled) item.classList.add("disabled");

      const typeIcon = CPUDebuggerWindow.BP_TYPE_ICONS[entry.type] || "●";
      const typeTitle = CPUDebuggerWindow.BP_TYPE_TITLES[entry.type] || "";
      const typeClass = entry.type === "exec" ? "bp-type-exec" : "bp-type-watch";

      // Symbol name for address
      const symbolInfo = getSymbolInfo(addr);
      const label = symbolInfo ? symbolInfo.name : "";

      let html = `
        <span class="bp-enable" title="Toggle enable">
          <input type="checkbox" ${entry.enabled ? "checked" : ""}>
        </span>
        <span class="bp-type ${typeClass}" title="${typeTitle}">${typeIcon}</span>
        <span class="bp-addr">${this.formatAddr(addr)}</span>
      `;

      if (label) {
        html += `<span class="bp-label" title="${label}">${label}</span>`;
      }

      if (entry.condition) {
        html += `<span class="bp-cond" title="Condition: ${entry.condition}">if</span>`;
      }

      if (entry.hitCount > 0 || entry.hitTarget > 0) {
        const hitText = entry.hitTarget > 0
          ? `${entry.hitCount}/${entry.hitTarget}`
          : `${entry.hitCount}`;
        html += `<span class="bp-hits" title="Hit count">${hitText}</span>`;
      }

      html += `<button class="bp-remove" title="Remove">×</button>`;

      item.innerHTML = html;
      list.appendChild(item);
    }
  }

  /**
   * Edit condition on a breakpoint via prompt
   */
  editBreakpointCondition(addr) {
    const entry = this.bpManager.get(addr);
    if (!entry) return;

    const condition = prompt(
      `Condition for breakpoint at $${this.formatHex(addr, 4)}:\n` +
      `Examples: A==#$FF, PEEK($00)==#$42, C==1 && X>=#$10`,
      entry.condition || ""
    );

    if (condition !== null) {
      this.bpManager.setCondition(addr, condition);
    }
  }

  /**
   * Import a symbol file via file picker
   */
  importSymbolFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".dbg,.sym,.txt,.labels,.map";
    input.addEventListener("change", () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const count = this.labelManager.importSymbolFile(reader.result, file.name);
        this.updateDisassembly();
        console.log(`Imported ${count} symbols from ${file.name}`);
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /**
   * Edit inline comment at an address
   */
  editInlineComment(addr) {
    const labelInfo = this.labelManager.getLabel(addr);
    const currentComment = labelInfo ? labelInfo.comment : "";

    const comment = prompt(
      `Comment for $${this.formatHex(addr, 4)}:`,
      currentComment
    );

    if (comment !== null) {
      if (comment === "" && labelInfo && !labelInfo.name) {
        // No comment and no label - remove the entry
        this.labelManager.removeLabel(addr);
      } else {
        this.labelManager.setComment(addr, comment);
      }
      this.updateDisassembly();
    }
  }

  // ---- Watch Expressions ----

  static WATCH_STORAGE_KEY = "a2e-watch-expressions";

  loadWatchExpressions() {
    try {
      const saved = localStorage.getItem(CPUDebuggerWindow.WATCH_STORAGE_KEY);
      if (saved) this.watchExpressions = JSON.parse(saved);
    } catch (e) { /* ignore */ }
  }

  saveWatchExpressions() {
    try {
      localStorage.setItem(
        CPUDebuggerWindow.WATCH_STORAGE_KEY,
        JSON.stringify(this.watchExpressions),
      );
    } catch (e) { /* ignore */ }
  }

  updateWatchList() {
    const list = this.contentElement.querySelector("#watch-list");
    if (!list) return;

    list.innerHTML = "";
    for (let i = 0; i < this.watchExpressions.length; i++) {
      const expr = this.watchExpressions[i];
      let valueStr;
      try {
        const value = this.bpManager.evaluateCondition(expr);
        if (typeof value === "boolean") {
          valueStr = value ? "true" : "false";
        } else {
          valueStr = `$${this.formatHex(value & 0xffff, value > 0xff ? 4 : 2)} (${value})`;
        }
      } catch (e) {
        valueStr = `err: ${e.message}`;
      }

      const item = document.createElement("div");
      item.className = "cpu-watch-item";
      item.dataset.index = i;
      item.innerHTML = `
        <span class="watch-expr" title="${expr}">${expr}</span>
        <span class="watch-value">${valueStr}</span>
        <button class="watch-remove" title="Remove">×</button>
      `;

      list.appendChild(item);
    }
  }

  // ---- Address Bookmarks ----

  static BOOKMARK_STORAGE_KEY = "a2e-bookmarks";

  loadBookmarks() {
    try {
      const saved = localStorage.getItem(CPUDebuggerWindow.BOOKMARK_STORAGE_KEY);
      if (saved) this.bookmarks = JSON.parse(saved);
    } catch (e) { /* ignore */ }
  }

  saveBookmarks() {
    try {
      localStorage.setItem(
        CPUDebuggerWindow.BOOKMARK_STORAGE_KEY,
        JSON.stringify(this.bookmarks),
      );
    } catch (e) { /* ignore */ }
  }

  toggleBookmark(addr) {
    const idx = this.bookmarks.indexOf(addr);
    if (idx >= 0) {
      this.bookmarks.splice(idx, 1);
    } else {
      this.bookmarks.push(addr);
    }
    this.saveBookmarks();
    this.updateDisassembly();
  }

  /**
   * Look up a symbol name for an address. User labels take priority,
   * then imported labels, then built-in symbols.
   */
  lookupSymbol(addr) {
    const label = this.labelManager.getLabel(addr);
    if (label && label.name) {
      return { name: label.name, desc: label.comment || label.name, category: "user" };
    }
    return getSymbolInfo(addr);
  }

  symbolizeInstruction(instrText) {
    // First, wrap immediate constants (#$XX or #$XXXX) in spans
    let result = instrText.replace(/#\$([0-9A-Fa-f]{2,4})/g, (match) => {
      return `<span class="cpu-disasm-const">${match}</span>`;
    });

    // Then replace $XXXX patterns (4-digit hex addresses) with symbols
    result = result.replace(
      /\$([0-9A-Fa-f]{4})(?![0-9A-Fa-f])/g,
      (match, hexAddr) => {
        const addr = parseInt(hexAddr, 16);
        const info = this.lookupSymbol(addr);
        if (info) {
          const cssClass = info.category === "user" ? "cpu-disasm-user-label" : getCategoryClass(info.category);
          return `<span class="cpu-disasm-symbol ${cssClass}" data-tooltip="${info.desc}">${info.name}</span>`;
        }
        return match;
      },
    );

    // Also handle 2-digit zero page addresses that have symbols
    result = result.replace(
      /\$([0-9A-Fa-f]{2})(?![0-9A-Fa-f])/g,
      (match, hexAddr) => {
        const addr = parseInt(hexAddr, 16);
        const info = this.lookupSymbol(addr);
        if (info) {
          const cssClass = info.category === "user" ? "cpu-disasm-user-label" : getCategoryClass(info.category);
          return `<span class="cpu-disasm-symbol ${cssClass}" data-tooltip="${info.desc}">${info.name}</span>`;
        }
        return match;
      },
    );

    return result;
  }

  /**
   * Get heat level (1-5) for an address from profiling data
   */
  getHeatLevel(addr) {
    if (!this._profilePtr || this._profileMax === 0) return 0;
    const heap32 = new Uint32Array(this.wasmModule.HEAPU8.buffer);
    const value = heap32[(this._profilePtr >> 2) + addr];
    if (value === 0) return 0;
    const ratio = value / this._profileMax;
    if (ratio > 0.6) return 5;
    if (ratio > 0.3) return 4;
    if (ratio > 0.1) return 3;
    if (ratio > 0.02) return 2;
    return 1;
  }

  /**
   * Get instruction length for a given opcode
   */
  getInstructionLength(opcode) {
    const lengths = [
      1, 2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1,
      3, 1, 1, 3, 3, 3, 3, 3, 2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2,
      2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3, 1, 2, 1, 1, 1, 2, 2, 2, 1, 2, 1,
      1, 3, 3, 3, 3, 2, 2, 2, 1, 1, 2, 2, 2, 1, 3, 1, 1, 1, 3, 3, 3, 1, 2, 1, 1,
      2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3,
      3, 3, 3, 2, 2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2,
      2, 2, 1, 3, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3,
      3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3, 2, 2, 1, 1, 2, 2, 2, 2,
      1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 1, 2, 2, 2, 1, 3, 1, 1, 1, 3, 3, 3, 2,
      2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 1, 2, 2, 2, 1, 3,
      1, 1, 1, 3, 3, 3,
    ];
    return lengths[opcode] || 1;
  }
}
