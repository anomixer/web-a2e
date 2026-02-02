/*
 * cpu-debugger-window.js - CPU debugger with registers, disassembly, and breakpoints
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

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
      defaultHeight: 660,
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
    this.previousWatchValues = {}; // For watch change highlighting
    this.profileEnabled = false; // When true, shows heat overlay in disassembly
    this.watchExpressions = []; // Array of expression strings
    this.loadWatchExpressions();
    this.bookmarks = []; // Array of addresses
    this.loadBookmarks();
    this.beamBreakpoints = []; // Array of { id, scanline, hPos, enabled, mode }
    this.loadBeamBreakpoints();
    this.activeTab = "breakpoints"; // Active tab panel (breakpoints, watch, beam)
    this._hitBpAddr = -1; // Address of the breakpoint/watchpoint that triggered a pause
    this._lastHitBpAddr = -2; // Previous value for change detection

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
          <div class="cpu-dbg-scanline-row">
            <span class="scanline-item"><span class="scanline-label">SCAN</span> <span class="scanline-value" id="scan-line">0</span></span>
            <span class="scanline-item"><span class="scanline-label">H</span> <span class="scanline-value" id="scan-hpos">0</span></span>
            <span class="scanline-item"><span class="scanline-label">COL</span> <span class="scanline-value" id="scan-col">--</span></span>
            <span class="scanline-item"><span class="scanline-label">FCYC</span> <span class="scanline-value" id="scan-fcyc">0</span></span>
            <span class="scanline-badge" id="scan-badge">VISIBLE</span>
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

        <div class="cpu-dbg-tabs">
          <div class="cpu-dbg-tab-bar">
            <button class="cpu-dbg-tab active" data-tab="breakpoints">Breakpoints <span class="cpu-dbg-tab-count" id="bp-tab-count">0</span></button>
            <button class="cpu-dbg-tab" data-tab="watch">Watch <span class="cpu-dbg-tab-count" id="watch-tab-count">0</span></button>
            <button class="cpu-dbg-tab" data-tab="beam">Beam <span class="cpu-dbg-tab-count" id="beam-tab-count">0</span></button>
          </div>
          <div class="cpu-dbg-tab-content active" data-tab="breakpoints">
            <div class="cpu-dbg-tab-toolbar">
              <select id="bp-source-select" title="Breakpoint source">
                <option value="addr">Addr</option>
                <option value="switch">Switch</option>
              </select>
              <select id="bp-type-select" title="Breakpoint type">
                <option value="exec">Exec</option>
                <option value="read">Read</option>
                <option value="write">Write</option>
                <option value="readwrite">R/W</option>
              </select>
              <input type="text" id="breakpoint-input" placeholder="$XXXX" spellcheck="false">
              <select id="bp-switch-select" title="Soft switch" style="display:none"></select>
              <button class="cpu-dbg-add-btn" id="breakpoint-add-btn" title="Add breakpoint">+</button>
            </div>
            <div class="cpu-bp-list" id="breakpoint-list"></div>
          </div>
          <div class="cpu-dbg-tab-content" data-tab="watch">
            <div class="cpu-dbg-tab-toolbar">
              <select id="watch-source-select" title="Watch source type">
                <option value="reg">Register</option>
                <option value="flag">Flag</option>
                <option value="byte">Byte</option>
                <option value="word">Word</option>
              </select>
              <select id="watch-detail-reg" class="watch-detail-control active" title="Register">
                <option value="A">A</option>
                <option value="X">X</option>
                <option value="Y">Y</option>
                <option value="SP">SP</option>
                <option value="PC">PC</option>
                <option value="P">P</option>
              </select>
              <select id="watch-detail-flag" class="watch-detail-control" title="Flag">
                <option value="N">N</option>
                <option value="V">V</option>
                <option value="B">B</option>
                <option value="D">D</option>
                <option value="I">I</option>
                <option value="Z">Z</option>
                <option value="C">C</option>
              </select>
              <input type="text" id="watch-detail-addr" class="watch-detail-control" placeholder="$0000" spellcheck="false">
              <button class="cpu-dbg-add-btn" id="watch-add-btn" title="Add watch">+</button>
            </div>
            <div class="cpu-watch-list" id="watch-list"></div>
          </div>
          <div class="cpu-dbg-tab-content" data-tab="beam">
            <div class="cpu-dbg-tab-toolbar">
              <select id="beam-mode-select" title="Beam breakpoint type">
                <option value="vbl">VBL Start</option>
                <option value="hblank">HBLANK</option>
                <option value="scanline">Scanline</option>
                <option value="column">Column</option>
                <option value="scancol">Scan + Col</option>
              </select>
              <input type="text" id="beam-scan-input" class="beam-input" placeholder="Row" maxlength="3" style="display:none">
              <input type="text" id="beam-col-input" class="beam-input" placeholder="Col" maxlength="2" style="display:none">
              <button class="cpu-dbg-add-btn" id="beam-add-btn" title="Add beam breakpoint">+</button>
            </div>
            <div class="cpu-beam-list" id="beam-list"></div>
          </div>
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

    // Breakpoint source mode switching (addr/switch)
    const bpSourceSelect = this.contentElement.querySelector("#bp-source-select");
    const bpTypeSelect = this.contentElement.querySelector("#bp-type-select");
    const bpSwitchSelect = this.contentElement.querySelector("#bp-switch-select");

    if (bpSourceSelect && bpSwitchSelect) {
      // Populate soft switch dropdown with optgroups
      for (const group of CPUDebuggerWindow.SOFT_SWITCH_GROUPS) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = group.category;
        for (const sw of group.switches) {
          const option = document.createElement("option");
          option.value = `${sw.start}:${sw.end}:${sw.name}`;
          const startHex = sw.start.toString(16).toUpperCase();
          const endHex = sw.end.toString(16).toUpperCase();
          const range = sw.start === sw.end ? `$${startHex}` : `$${startHex}-${endHex}`;
          option.textContent = `${sw.name} (${range})`;
          option.title = sw.desc;
          optgroup.appendChild(option);
        }
        bpSwitchSelect.appendChild(optgroup);
      }

      bpSourceSelect.addEventListener("change", () => {
        const isSwitch = bpSourceSelect.value === "switch";
        const bpInput = this.contentElement.querySelector("#breakpoint-input");
        if (bpInput) bpInput.style.display = isSwitch ? "none" : "";
        bpSwitchSelect.style.display = isSwitch ? "" : "none";

        if (isSwitch) {
          // Hide Exec option, auto-select R/W
          if (bpTypeSelect) {
            const execOption = bpTypeSelect.querySelector('option[value="exec"]');
            if (execOption) execOption.style.display = "none";
            if (bpTypeSelect.value === "exec") bpTypeSelect.value = "readwrite";
          }
        } else {
          // Show Exec option again
          if (bpTypeSelect) {
            const execOption = bpTypeSelect.querySelector('option[value="exec"]');
            if (execOption) execOption.style.display = "";
          }
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
        const editBtn = e.target.closest(".bp-edit");
        if (editBtn) {
          e.stopPropagation();
          e.preventDefault();
          const item = editBtn.closest(".cpu-bp-item");
          if (item && item.dataset.addr) {
            this.editBreakpointCondition(parseInt(item.dataset.addr, 10));
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

    // Watch source/detail switching
    const watchSourceSelect = this.contentElement.querySelector("#watch-source-select");
    const watchDetailReg = this.contentElement.querySelector("#watch-detail-reg");
    const watchDetailFlag = this.contentElement.querySelector("#watch-detail-flag");
    const watchDetailAddr = this.contentElement.querySelector("#watch-detail-addr");
    const watchAddBtn = this.contentElement.querySelector("#watch-add-btn");

    if (watchSourceSelect) {
      watchSourceSelect.addEventListener("change", () => {
        const source = watchSourceSelect.value;
        if (watchDetailReg) watchDetailReg.classList.toggle("active", source === "reg");
        if (watchDetailFlag) watchDetailFlag.classList.toggle("active", source === "flag");
        if (watchDetailAddr) watchDetailAddr.classList.toggle("active", source === "byte" || source === "word");
      });
    }

    if (watchAddBtn) {
      watchAddBtn.addEventListener("click", () => this.addWatchFromForm());
    }

    if (watchDetailAddr) {
      watchDetailAddr.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.addWatchFromForm();
      });
      watchDetailAddr.addEventListener("keydown", (e) => e.stopPropagation());
    }

    // Tab switching
    const tabBar = this.contentElement.querySelector(".cpu-dbg-tab-bar");
    if (tabBar) {
      tabBar.addEventListener("click", (e) => {
        const tab = e.target.closest(".cpu-dbg-tab");
        if (!tab) return;
        const tabName = tab.dataset.tab;
        tabBar.querySelectorAll(".cpu-dbg-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        tab.classList.remove("hit-alert");
        this.contentElement.querySelectorAll(".cpu-dbg-tab-content").forEach((c) => {
          c.classList.toggle("active", c.dataset.tab === tabName);
        });
        this.activeTab = tabName;
        if (this.onStateChange) this.onStateChange();
      });
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
    this.setupBeamBreakTabEvents();
    this.updateBreakpointList();
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
    const sourceSelect = this.contentElement.querySelector("#bp-source-select");
    const typeSelect = this.contentElement.querySelector("#bp-type-select");
    const type = typeSelect ? typeSelect.value : "exec";

    if (sourceSelect && sourceSelect.value === "switch") {
      // Switch mode: parse the switch dropdown value
      const switchSelect = this.contentElement.querySelector("#bp-switch-select");
      if (!switchSelect || !switchSelect.value) return;

      const parts = switchSelect.value.split(":");
      const startAddr = parseInt(parts[0], 10);
      const endAddr = parseInt(parts[1], 10);
      const name = parts.slice(2).join(":");

      if (!isNaN(startAddr) && !isNaN(endAddr)) {
        this.bpManager.add(startAddr, {
          type,
          endAddress: endAddr,
          name,
        });
      }
    } else {
      // Address mode: parse the text input
      const input = this.contentElement.querySelector("#breakpoint-input");
      if (!input) return;

      const text = input.value.trim();
      const addr = this.resolveAddress(text) ?? parseInt(text, 16);

      if (!isNaN(addr) && addr >= 0 && addr <= 0xffff) {
        this.bpManager.add(addr, { type });
        input.value = "";
      }
    }
  }

  /**
   * Build expression string from the watch form and add it
   */
  addWatchFromForm() {
    const source = this.contentElement.querySelector("#watch-source-select")?.value;
    if (!source) return;

    let expr = null;
    if (source === "reg") {
      expr = this.contentElement.querySelector("#watch-detail-reg")?.value;
    } else if (source === "flag") {
      expr = this.contentElement.querySelector("#watch-detail-flag")?.value;
    } else if (source === "byte" || source === "word") {
      const addrInput = this.contentElement.querySelector("#watch-detail-addr");
      if (!addrInput) return;
      const text = addrInput.value.trim();
      if (!text) return;
      const addr = this.resolveAddress(text);
      if (addr === null) return;
      const hexAddr = "$" + this.formatHex(addr, 4);
      expr = source === "byte" ? `PEEK(${hexAddr})` : `DEEK(${hexAddr})`;
      addrInput.value = "";
    }

    if (expr) {
      this.watchExpressions.push(expr);
      this.saveWatchExpressions();
      this.updateWatchList();
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
    const tempAddr = this.wasmModule._stepOver();
    if (tempAddr) {
      this.bpManager.syncTemp(tempAddr);
    }
  }

  /**
   * Step Out - run until the current subroutine returns
   * Reads return address from stack and sets breakpoint there
   */
  stepOut() {
    this.bpManager.clearTemp();
    const tempAddr = this.wasmModule._stepOut();
    if (tempAddr) {
      this.bpManager.syncTemp(tempAddr);
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
      background: var(--glass-bg-solid);
      border: 1px solid var(--glass-border);
      border-radius: 4px;
      padding: 4px 0;
      font-family: var(--font-mono);
      font-size: 11px;
      box-shadow: var(--shadow-md);
      min-width: 160px;
    `;

    menu.querySelectorAll(".ctx-item").forEach((item) => {
      item.style.cssText = `
        padding: 6px 12px;
        color: var(--text-secondary);
        cursor: pointer;
      `;
      item.addEventListener("mouseenter", () => {
        item.style.background = "var(--accent-blue-bg-strong)";
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

    // Check if a watchpoint was hit - evaluate conditions/hit counts (range-aware)
    if (isPaused && this.wasmModule._isWatchpointHit && this.wasmModule._isWatchpointHit()) {
      const wpAddr = this.wasmModule._getWatchpointAddress();
      const entry = this.bpManager.findByAddress(wpAddr);
      if (entry) {
        if (!this.bpManager.shouldBreakEntry(entry)) {
          // Condition not met or hit target not reached - resume
          this.wasmModule._setPaused(false);
          return;
        }
        this._hitBpAddr = entry.address;
      } else if (!this.bpManager.shouldBreak(wpAddr)) {
        // Fallback for direct-address match
        this.wasmModule._setPaused(false);
        return;
      } else {
        this._hitBpAddr = wpAddr;
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
      this._hitBpAddr = bpAddr;
    }

    // Clear hit address when running
    if (!isPaused) {
      this._hitBpAddr = -1;
    }

    // If PC changed, snap disassembly back to follow PC
    if (this.lastPC !== null && pc !== this.lastPC) {
      this.disasmViewAddress = null;
    }

    this.updateRegisters();
    this.updateFlags();
    this.updateIRQState();
    if (isPaused) {
      this.updateScanline();
    }
    this.updateDisassembly();
    this.updateWatchList();
    this.updateBreakpointHitHighlight();
    this.updateBeamHitHighlight();
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
          background: var(--input-bg-deeper);
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
   * Set up beam breakpoint tab events
   */
  setupBeamBreakTabEvents() {
    const modeSelect = this.contentElement.querySelector("#beam-mode-select");
    const scanInput = this.contentElement.querySelector("#beam-scan-input");
    const colInput = this.contentElement.querySelector("#beam-col-input");
    const addBtn = this.contentElement.querySelector("#beam-add-btn");
    if (!modeSelect) return;

    const updateInputVisibility = () => {
      const mode = modeSelect.value;
      if (scanInput) scanInput.style.display = (mode === "scanline" || mode === "scancol") ? "" : "none";
      if (colInput) colInput.style.display = (mode === "column" || mode === "scancol") ? "" : "none";
    };

    modeSelect.addEventListener("change", updateInputVisibility);
    updateInputVisibility();

    if (addBtn) {
      addBtn.addEventListener("click", () => this.addBeamBreakpointFromForm());
    }

    const onInputKey = (e) => {
      if (e.key === "Enter") this.addBeamBreakpointFromForm();
      e.stopPropagation();
    };
    if (scanInput) scanInput.addEventListener("keydown", onInputKey);
    if (colInput) colInput.addEventListener("keydown", onInputKey);

    // Event delegation on beam list for checkboxes and remove buttons
    const beamList = this.contentElement.querySelector("#beam-list");
    if (beamList) {
      beamList.addEventListener("mousedown", (e) => {
        const removeBtn = e.target.closest(".beam-remove");
        if (removeBtn) {
          e.stopPropagation();
          e.preventDefault();
          const item = removeBtn.closest(".cpu-beam-item");
          if (item && item.dataset.id) {
            this.removeBeamBreakpoint(parseInt(item.dataset.id, 10));
          }
          return;
        }
      });
      beamList.addEventListener("change", (e) => {
        const checkbox = e.target.closest(".beam-enable input");
        if (checkbox) {
          const item = checkbox.closest(".cpu-beam-item");
          if (item && item.dataset.id) {
            this.enableBeamBreakpoint(parseInt(item.dataset.id, 10), checkbox.checked);
          }
        }
      });
    }
  }

  /**
   * Add a beam breakpoint from the toolbar form
   */
  addBeamBreakpointFromForm() {
    const modeSelect = this.contentElement.querySelector("#beam-mode-select");
    const scanInput = this.contentElement.querySelector("#beam-scan-input");
    const colInput = this.contentElement.querySelector("#beam-col-input");
    if (!modeSelect) return;

    const mode = modeSelect.value;
    let scanline = -1;
    let hPos = -1;

    switch (mode) {
      case "vbl":
        scanline = 192;
        hPos = 0;
        break;
      case "hblank":
        scanline = -1;
        hPos = 0;
        break;
      case "scanline": {
        const n = parseInt(scanInput?.value, 10);
        if (isNaN(n) || n < 0 || n > 261) return;
        scanline = n;
        hPos = -1;
        break;
      }
      case "column": {
        const c = parseInt(colInput?.value, 10);
        if (isNaN(c) || c < 0 || c > 39) return;
        scanline = -1;
        hPos = c + 25;
        break;
      }
      case "scancol": {
        const n = parseInt(scanInput?.value, 10);
        const c = parseInt(colInput?.value, 10);
        if (isNaN(n) || n < 0 || n > 261 || isNaN(c) || c < 0 || c > 39) return;
        scanline = n;
        hPos = c + 25;
        break;
      }
    }

    const id = this.wasmModule._addBeamBreakpoint(scanline, hPos);
    if (id < 0) return; // full

    this.beamBreakpoints.push({ id, scanline, hPos, enabled: true, mode });
    this.saveBeamBreakpoints();
    this.updateBeamList();
  }

  /**
   * Remove a beam breakpoint by ID
   */
  removeBeamBreakpoint(id) {
    this.wasmModule._removeBeamBreakpoint(id);
    this.beamBreakpoints = this.beamBreakpoints.filter((bp) => bp.id !== id);
    this.saveBeamBreakpoints();
    this.updateBeamList();
  }

  /**
   * Enable/disable a beam breakpoint by ID
   */
  enableBeamBreakpoint(id, enabled) {
    this.wasmModule._enableBeamBreakpoint(id, enabled);
    const bp = this.beamBreakpoints.find((b) => b.id === id);
    if (bp) bp.enabled = enabled;
    this.saveBeamBreakpoints();
    this.updateBeamList();
  }

  /**
   * Render the beam breakpoint list and update the tab badge
   */
  updateBeamList() {
    const list = this.contentElement.querySelector("#beam-list");
    if (!list) return;

    list.innerHTML = "";
    const isPaused = this.wasmModule._isPaused();
    const hitId = (isPaused && this.wasmModule._isBeamBreakpointHit && this.wasmModule._isBeamBreakpointHit())
      ? this.wasmModule._getBeamBreakpointHitId()
      : -1;

    for (const bp of this.beamBreakpoints) {
      const item = document.createElement("div");
      item.className = "cpu-beam-item";
      item.dataset.id = bp.id;
      if (!bp.enabled) item.classList.add("disabled");
      if (bp.id === hitId) item.classList.add("hit");

      const { typeLabel, typeClass, detail } = this.getBeamBreakpointDisplay(bp);

      item.innerHTML = `
        <span class="beam-enable"><input type="checkbox" ${bp.enabled ? "checked" : ""}></span>
        <span class="beam-type ${typeClass}">${typeLabel}</span>
        <span class="beam-detail">${detail}</span>
        <button class="beam-remove" title="Remove">×</button>
      `;
      list.appendChild(item);
    }

    if (this.beamBreakpoints.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cpu-dbg-empty-state";
      empty.textContent = "Add beam breakpoints to pause at specific raster positions.";
      list.appendChild(empty);
    }

    // Update tab badge count
    const badge = this.contentElement.querySelector("#beam-tab-count");
    if (badge) {
      badge.textContent = this.beamBreakpoints.length;
      badge.classList.toggle("has-items", this.beamBreakpoints.length > 0);
    }
  }

  /**
   * Highlight the breakpoint/watchpoint that triggered a pause
   */
  updateBreakpointHitHighlight() {
    const addr = this._hitBpAddr;
    if (addr === this._lastHitBpAddr) return;
    this._lastHitBpAddr = addr;

    const list = this.contentElement.querySelector("#breakpoint-list");
    if (list) {
      let hitItem = null;
      const items = list.querySelectorAll(".cpu-bp-item");
      for (const item of items) {
        const isHit = parseInt(item.dataset.addr, 10) === addr;
        if (isHit && !item.classList.contains("hit")) {
          item.classList.remove("hit");
          void item.offsetWidth; // force reflow to restart animation
          hitItem = item;
        }
        item.classList.toggle("hit", isHit);
      }
      if (hitItem) {
        hitItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    // Pulse tab header if breakpoints panel is not active
    this._pulseTabHeader("breakpoints", addr >= 0);
  }

  /**
   * Lightweight hit highlight update — toggles .hit class without rebuilding DOM
   */
  updateBeamHitHighlight() {
    const list = this.contentElement.querySelector("#beam-list");
    if (!list) return;

    const isPaused = this.wasmModule._isPaused();
    const hitId = (isPaused && this.wasmModule._isBeamBreakpointHit && this.wasmModule._isBeamBreakpointHit())
      ? this.wasmModule._getBeamBreakpointHitId()
      : -1;

    if (hitId === this._lastBeamHitId) return;
    this._lastBeamHitId = hitId;

    const items = list.querySelectorAll(".cpu-beam-item");
    for (const item of items) {
      const id = parseInt(item.dataset.id, 10);
      item.classList.toggle("hit", id === hitId);
    }

    // Pulse tab header if beam panel is not active
    this._pulseTabHeader("beam", hitId >= 0);
  }

  /**
   * Pulse a tab header to draw attention when its panel is not active
   */
  _pulseTabHeader(tabName, isHit) {
    const tab = this.contentElement.querySelector(`.cpu-dbg-tab[data-tab="${tabName}"]`);
    if (!tab) return;

    if (isHit && this.activeTab !== tabName) {
      if (!tab.classList.contains("hit-alert")) {
        tab.classList.add("hit-alert");
      }
    }
    // hit-alert is cleared only when the user clicks the tab
  }

  /**
   * Get display info for a beam breakpoint
   */
  getBeamBreakpointDisplay(bp) {
    const modeMap = {
      vbl: { typeLabel: "VBL", typeClass: "beam-type-vbl", detail: "Scanline 192" },
      hblank: { typeLabel: "HBL", typeClass: "beam-type-hbl", detail: "HPos 0" },
      scanline: { typeLabel: "SCAN", typeClass: "beam-type-scan", detail: `Row ${bp.scanline}` },
      column: { typeLabel: "COL", typeClass: "beam-type-col", detail: `Col ${bp.hPos - 25}` },
      scancol: { typeLabel: "S+C", typeClass: "beam-type-sc", detail: `Row ${bp.scanline}, Col ${bp.hPos - 25}` },
    };
    return modeMap[bp.mode] || { typeLabel: "?", typeClass: "", detail: `Scan ${bp.scanline}, HPos ${bp.hPos}` };
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
   * Update scanline / beam position display
   */
  updateScanline() {
    const frameCycle = this.wasmModule._getFrameCycle();
    const scanline = this.wasmModule._getBeamScanline();
    const hPos = this.wasmModule._getBeamHPos();
    const col = this.wasmModule._getBeamColumn();
    const inVBL = this.wasmModule._isInVBL();
    const inHBLANK = this.wasmModule._isInHBLANK();

    const scanEl = this.contentElement.querySelector("#scan-line");
    const hPosEl = this.contentElement.querySelector("#scan-hpos");
    const colEl = this.contentElement.querySelector("#scan-col");
    const fcycEl = this.contentElement.querySelector("#scan-fcyc");
    const badgeEl = this.contentElement.querySelector("#scan-badge");

    if (scanEl) scanEl.textContent = scanline;
    if (hPosEl) hPosEl.textContent = hPos;
    if (colEl) colEl.textContent = col >= 0 ? col.toString().padStart(2, "0") : "--";
    if (fcycEl) fcycEl.textContent = frameCycle;

    if (badgeEl) {
      if (inVBL) {
        badgeEl.textContent = "VBL";
        badgeEl.className = "scanline-badge scanline-badge-vbl";
      } else if (inHBLANK) {
        badgeEl.textContent = "HBLANK";
        badgeEl.className = "scanline-badge scanline-badge-hblank";
      } else {
        badgeEl.textContent = "VISIBLE";
        badgeEl.className = "scanline-badge scanline-badge-visible";
      }
    }

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

    // Scroll to keep PC visible only while running — when paused, let user scroll freely
    if (pcLineElement && !this.wasmModule._isPaused()) {
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

  static SOFT_SWITCH_GROUPS = [
    { category: "Display", switches: [
      { name: "TEXT",    start: 0xC050, end: 0xC051, desc: "Text/Graphics mode" },
      { name: "MIXED",   start: 0xC052, end: 0xC053, desc: "Mixed text+graphics" },
      { name: "PAGE2",   start: 0xC054, end: 0xC055, desc: "Display page 2" },
      { name: "HIRES",   start: 0xC056, end: 0xC057, desc: "Hi-res graphics" },
      { name: "80COL",   start: 0xC00C, end: 0xC00D, desc: "80-column display" },
      { name: "ALTCHAR", start: 0xC00E, end: 0xC00F, desc: "Alt charset (MouseText)" },
    ]},
    { category: "Memory Banking", switches: [
      { name: "80STORE", start: 0xC000, end: 0xC001, desc: "PAGE2 selects aux memory" },
      { name: "RAMRD",   start: 0xC002, end: 0xC003, desc: "Read from aux RAM" },
      { name: "RAMWRT",  start: 0xC004, end: 0xC005, desc: "Write to aux RAM" },
      { name: "INTCXROM",start: 0xC006, end: 0xC007, desc: "$Cxxx ROM source" },
      { name: "ALTZP",   start: 0xC008, end: 0xC009, desc: "Aux zero page/stack" },
      { name: "SLOTC3ROM", start: 0xC00A, end: 0xC00B, desc: "Slot 3 ROM" },
    ]},
    { category: "Language Card", switches: [
      { name: "LANGCARD", start: 0xC080, end: 0xC08F, desc: "Language card control" },
    ]},
    { category: "Annunciators", switches: [
      { name: "AN0", start: 0xC058, end: 0xC059, desc: "Annunciator 0" },
      { name: "AN1", start: 0xC05A, end: 0xC05B, desc: "Annunciator 1" },
      { name: "AN2", start: 0xC05C, end: 0xC05D, desc: "Annunciator 2" },
      { name: "AN3", start: 0xC05E, end: 0xC05F, desc: "Annunciator 3 / DHIRES" },
    ]},
    { category: "I/O", switches: [
      { name: "KBD",     start: 0xC000, end: 0xC000, desc: "Keyboard data" },
      { name: "KBDSTRB", start: 0xC010, end: 0xC010, desc: "Clear keyboard strobe" },
      { name: "SPKR",    start: 0xC030, end: 0xC030, desc: "Speaker toggle" },
      { name: "PTRIG",   start: 0xC070, end: 0xC070, desc: "Paddle trigger" },
    ]},
    { category: "Status Registers", switches: [
      { name: "RDLCBNK2",  start: 0xC011, end: 0xC011, desc: "LC bank 2 status" },
      { name: "RDLCRAM",   start: 0xC012, end: 0xC012, desc: "LC RAM read status" },
      { name: "RDRAMRD",   start: 0xC013, end: 0xC013, desc: "RAMRD status" },
      { name: "RDRAMWRT",  start: 0xC014, end: 0xC014, desc: "RAMWRT status" },
      { name: "RDCXROM",   start: 0xC015, end: 0xC015, desc: "INTCXROM status" },
      { name: "RDALTZP",   start: 0xC016, end: 0xC016, desc: "ALTZP status" },
      { name: "RDC3ROM",   start: 0xC017, end: 0xC017, desc: "SLOTC3ROM status" },
      { name: "RD80STORE", start: 0xC018, end: 0xC018, desc: "80STORE status" },
      { name: "RDVBL",     start: 0xC019, end: 0xC019, desc: "Vertical blank status" },
      { name: "RDTEXT",    start: 0xC01A, end: 0xC01A, desc: "TEXT mode status" },
      { name: "RDMIXED",   start: 0xC01B, end: 0xC01B, desc: "MIXED mode status" },
      { name: "RDPAGE2",   start: 0xC01C, end: 0xC01C, desc: "PAGE2 status" },
      { name: "RDHIRES",   start: 0xC01D, end: 0xC01D, desc: "HIRES mode status" },
      { name: "RDALTCHAR", start: 0xC01E, end: 0xC01E, desc: "ALTCHAR status" },
      { name: "RD80COL",   start: 0xC01F, end: 0xC01F, desc: "80COL status" },
    ]},
  ];

  /**
   * Update breakpoint list with rich UI
   */
  updateBreakpointList() {
    const list = this.contentElement.querySelector("#breakpoint-list");
    if (!list) return;

    list.innerHTML = "";
    const allBps = this.bpManager.getAll();
    let count = 0;

    for (const [addr, entry] of allBps) {
      if (entry.isTemp) continue;
      count++;

      const item = document.createElement("div");
      item.className = "cpu-bp-item";
      item.dataset.addr = addr;
      if (!entry.enabled) item.classList.add("disabled");
      if (addr === this._hitBpAddr) item.classList.add("hit");

      const typeIcon = CPUDebuggerWindow.BP_TYPE_ICONS[entry.type] || "●";
      const typeTitle = CPUDebuggerWindow.BP_TYPE_TITLES[entry.type] || "";
      const typeClass = entry.type === "exec" ? "bp-type-exec" : "bp-type-watch";

      // Check if this is a named soft switch breakpoint with a range
      const isRange = entry.endAddress != null && entry.endAddress !== entry.address;
      const hasName = !!entry.name;

      let html = `
        <span class="bp-enable" title="Toggle enable">
          <input type="checkbox" ${entry.enabled ? "checked" : ""}>
        </span>
        <span class="bp-type ${typeClass}" title="${typeTitle}">${typeIcon}</span>
      `;

      if (hasName) {
        const startHex = this.formatHex(entry.address, 4);
        const endHex = this.formatHex(entry.endAddress, 4);
        const rangeStr = isRange ? `$${startHex}-${endHex}` : `$${startHex}`;
        html += `<span class="bp-name" title="${rangeStr}">${entry.name}</span>`;
        html += `<span class="bp-range">${rangeStr}</span>`;
      } else {
        html += `<span class="bp-addr">${this.formatAddr(addr)}</span>`;
        // Symbol name for address
        const symbolInfo = getSymbolInfo(addr);
        const label = symbolInfo ? symbolInfo.name : "";
        if (label) {
          html += `<span class="bp-label" title="${label}">${label}</span>`;
        }
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

      html += `<button class="bp-edit" title="Edit condition">if&#8230;</button>`;
      html += `<button class="bp-remove" title="Remove">×</button>`;

      item.innerHTML = html;
      list.appendChild(item);
    }

    if (count === 0) {
      const empty = document.createElement("div");
      empty.className = "cpu-dbg-empty-state";
      empty.textContent = "Click a disassembly line to toggle a breakpoint, or add one above.";
      list.appendChild(empty);
    }

    // Update tab badge count
    const badge = this.contentElement.querySelector("#bp-tab-count");
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle("has-items", count > 0);
    }
  }

  /**
   * Set the Rule Builder window reference
   */
  setRuleBuilder(ruleBuilderWindow) {
    this.ruleBuilder = ruleBuilderWindow;
  }

  /**
   * Edit condition on a breakpoint via Rule Builder or prompt fallback
   */
  editBreakpointCondition(addr) {
    const entry = this.bpManager.get(addr);
    if (!entry) return;

    if (this.ruleBuilder) {
      this.ruleBuilder.editBreakpoint(addr, entry);
    } else {
      // Fallback to prompt if Rule Builder not wired
      const condition = prompt(
        `Condition for breakpoint at $${this.formatHex(addr, 4)}:\n` +
        `Examples: A==#$FF, PEEK($00)==#$42, C==1 && X>=#$10`,
        entry.condition || ""
      );
      if (condition !== null) {
        this.bpManager.setCondition(addr, condition);
      }
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

  static REGISTER_NAMES = new Set(["A", "X", "Y", "SP", "PC", "P"]);

  static FLAG_LABELS = {
    N: "Negative",
    V: "Overflow",
    B: "Break",
    D: "Decimal",
    I: "Interrupt",
    Z: "Zero",
    C: "Carry",
  };

  /**
   * Build a friendly display label and type icon for a watch expression
   */
  getWatchLabel(expr) {
    // Register: single token like "A", "X", "PC"
    if (CPUDebuggerWindow.REGISTER_NAMES.has(expr)) {
      return { icon: "R", iconClass: "watch-icon-reg", label: expr };
    }
    // Flag: single letter N/V/B/D/I/Z/C
    if (CPUDebuggerWindow.FLAG_LABELS[expr]) {
      return { icon: "F", iconClass: "watch-icon-flag", label: CPUDebuggerWindow.FLAG_LABELS[expr] };
    }
    // PEEK($XXXX) → byte
    const peekMatch = expr.match(/^PEEK\(\$([0-9A-Fa-f]{1,4})\)$/);
    if (peekMatch) {
      return { icon: "B", iconClass: "watch-icon-byte", label: `$${peekMatch[1].toUpperCase()} byte` };
    }
    // DEEK($XXXX) → word
    const deekMatch = expr.match(/^DEEK\(\$([0-9A-Fa-f]{1,4})\)$/);
    if (deekMatch) {
      return { icon: "W", iconClass: "watch-icon-word", label: `$${deekMatch[1].toUpperCase()} word` };
    }
    // Legacy / custom expression
    return { icon: "E", iconClass: "watch-icon-expr", label: expr };
  }

  /**
   * Format a watch value for display — always shows hex + decimal
   */
  formatWatchValue(expr, value) {
    // Flags: show 0/1 plus set/clear label
    if (CPUDebuggerWindow.FLAG_LABELS[expr]) {
      return value ? "1 (set)" : "0 (clear)";
    }
    // Word values (DEEK)
    if (/^DEEK\(/.test(expr)) {
      return `$${this.formatHex(value & 0xffff, 4)} (${value & 0xffff})`;
    }
    // Byte values and registers
    if (value >= 0 && value <= 0xff) {
      return `$${this.formatHex(value & 0xff, 2)} (${value & 0xff})`;
    }
    return `$${this.formatHex(value & 0xffff, 4)} (${value & 0xffff})`;
  }

  updateWatchList() {
    const list = this.contentElement.querySelector("#watch-list");
    if (!list) return;

    // Check if DOM structure matches expressions (needs full rebuild if not)
    const existingItems = list.querySelectorAll(".cpu-watch-item");
    const needsRebuild = existingItems.length !== this.watchExpressions.length;

    if (needsRebuild) {
      list.innerHTML = "";
      this.previousWatchValues = {};

      for (let i = 0; i < this.watchExpressions.length; i++) {
        const expr = this.watchExpressions[i];
        let valueStr;
        try {
          const value = this.bpManager.evaluateValue(expr);
          valueStr = this.formatWatchValue(expr, value);
          this.previousWatchValues[i] = valueStr;
        } catch (e) {
          valueStr = `err: ${e.message}`;
          this.previousWatchValues[i] = valueStr;
        }

        const { icon, iconClass, label } = this.getWatchLabel(expr);
        const item = document.createElement("div");
        item.className = "cpu-watch-item";
        item.dataset.index = i;
        item.innerHTML = `
          <span class="watch-type-icon ${iconClass}" title="${expr}">${icon}</span>
          <span class="watch-expr" title="${expr}">${label}</span>
          <span class="watch-value">${valueStr}</span>
          <button class="watch-remove" title="Remove">×</button>
        `;
        list.appendChild(item);
      }

      if (this.watchExpressions.length === 0) {
        const empty = document.createElement("div");
        empty.className = "cpu-dbg-empty-state";
        empty.textContent = "Add watch expressions to monitor values during execution.";
        list.appendChild(empty);
      }
    } else {
      // In-place value update with change highlighting
      for (let i = 0; i < this.watchExpressions.length; i++) {
        const expr = this.watchExpressions[i];
        const item = existingItems[i];
        const valueEl = item.querySelector(".watch-value");
        if (!valueEl) continue;

        let valueStr;
        try {
          const value = this.bpManager.evaluateValue(expr);
          valueStr = this.formatWatchValue(expr, value);
        } catch (e) {
          valueStr = `err: ${e.message}`;
        }

        const prevVal = this.previousWatchValues[i];
        if (prevVal !== undefined && prevVal !== valueStr) {
          valueEl.classList.remove("changed");
          void valueEl.offsetWidth; // force reflow to restart animation
          valueEl.classList.add("changed");
        }
        this.previousWatchValues[i] = valueStr;
        valueEl.textContent = valueStr;
      }
    }

    // Update tab badge count
    const badge = this.contentElement.querySelector("#watch-tab-count");
    if (badge) {
      badge.textContent = this.watchExpressions.length;
      badge.classList.toggle("has-items", this.watchExpressions.length > 0);
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

  // ---- Beam Breakpoint Persistence ----

  static BEAM_STORAGE_KEY = "a2e-beam-breakpoints";

  loadBeamBreakpoints() {
    try {
      const saved = localStorage.getItem(CPUDebuggerWindow.BEAM_STORAGE_KEY);
      if (!saved) return;
      const data = JSON.parse(saved);
      for (const bp of data) {
        const id = this.wasmModule._addBeamBreakpoint(bp.scanline, bp.hPos);
        if (id < 0) continue;
        if (!bp.enabled) {
          this.wasmModule._enableBeamBreakpoint(id, false);
        }
        this.beamBreakpoints.push({
          id,
          scanline: bp.scanline,
          hPos: bp.hPos,
          enabled: bp.enabled,
          mode: bp.mode,
        });
      }
    } catch (e) { /* ignore */ }
  }

  saveBeamBreakpoints() {
    try {
      const data = this.beamBreakpoints.map((bp) => ({
        scanline: bp.scanline,
        hPos: bp.hPos,
        enabled: bp.enabled,
        mode: bp.mode,
      }));
      localStorage.setItem(
        CPUDebuggerWindow.BEAM_STORAGE_KEY,
        JSON.stringify(data),
      );
    } catch (e) { /* ignore */ }
  }

  /**
   * Re-push all beam breakpoints from JS state to C++.
   * Called after state import since importState() calls reset() which
   * clears all WASM-side beam breakpoints.
   */
  resyncBeamToWasm() {
    if (this.wasmModule._clearAllBeamBreakpoints) {
      this.wasmModule._clearAllBeamBreakpoints();
    }
    for (const bp of this.beamBreakpoints) {
      const newId = this.wasmModule._addBeamBreakpoint(bp.scanline, bp.hPos);
      if (newId >= 0) {
        bp.id = newId;
        if (!bp.enabled) {
          this.wasmModule._enableBeamBreakpoint(newId, false);
        }
      }
    }
    this.updateBeamList();
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

  getState() {
    const base = super.getState();
    base.activeTab = this.activeTab;
    return base;
  }

  restoreState(state) {
    if (state.activeTab) {
      this.activeTab = state.activeTab;
    }
    super.restoreState(state);
    // Apply tab selection to DOM after restoreState calls show()
    if (this.contentElement && this.activeTab) {
      const tabBar = this.contentElement.querySelector(".cpu-dbg-tab-bar");
      if (tabBar) {
        tabBar.querySelectorAll(".cpu-dbg-tab").forEach((t) => {
          t.classList.toggle("active", t.dataset.tab === this.activeTab);
        });
        this.contentElement.querySelectorAll(".cpu-dbg-tab-content").forEach((c) => {
          c.classList.toggle("active", c.dataset.tab === this.activeTab);
        });
      }
    }
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
