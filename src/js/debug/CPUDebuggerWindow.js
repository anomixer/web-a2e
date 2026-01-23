import { DebugWindow } from './DebugWindow.js';
import { getSymbolInfo, getCategoryClass } from './symbols.js';

/**
 * CPUDebuggerWindow - CPU registers, disassembly, and breakpoints
 */
export class CPUDebuggerWindow extends DebugWindow {
  constructor(wasmModule) {
    super({
      id: 'cpu-debugger',
      title: 'CPU Debugger',
      minWidth: 320,
      minHeight: 400,
      defaultWidth: 380,
      defaultHeight: 550,
      defaultPosition: { x: window.innerWidth - 400, y: 60 }
    });

    this.wasmModule = wasmModule;
    this.breakpoints = new Map();
    this.lastPC = null;
    this.disasmCache = [];  // Cache of {addr, disasm, len} for current view
    this.disasmStartAddr = 0;
    this.tempBreakpoint = null;  // Temporary breakpoint for step over/out

    // Load saved breakpoints
    this.loadBreakpoints();
  }

  /**
   * Storage key for breakpoints
   */
  static STORAGE_KEY = 'a2e-breakpoints';

  /**
   * Load breakpoints from localStorage
   */
  loadBreakpoints() {
    try {
      const saved = localStorage.getItem(CPUDebuggerWindow.STORAGE_KEY);
      if (saved) {
        const addresses = JSON.parse(saved);
        for (const addr of addresses) {
          this.breakpoints.set(addr, { enabled: true });
          // Sync with WASM if available
          if (this.wasmModule._addBreakpoint) {
            try {
              this.wasmModule._addBreakpoint(addr);
            } catch (e) {
              console.warn('Failed to restore breakpoint in WASM:', e);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load breakpoints from storage:', e);
    }
  }

  /**
   * Save breakpoints to localStorage
   */
  saveBreakpoints() {
    try {
      const addresses = Array.from(this.breakpoints.keys());
      localStorage.setItem(CPUDebuggerWindow.STORAGE_KEY, JSON.stringify(addresses));
    } catch (e) {
      console.warn('Failed to save breakpoints to storage:', e);
    }
  }

  renderContent() {
    return `
      <div class="cpu-debugger-content">
        <!-- Toolbar -->
        <div class="cpu-toolbar">
          <button class="dbg-btn" id="dbg-run" title="Run (F5)">▶Run</button>
          <button class="dbg-btn" id="dbg-pause" title="Pause">⏸Pause</button>
          <button class="dbg-btn" id="dbg-step" title="Step (F11)">→Step</button>
          <button class="dbg-btn" id="dbg-step-over" title="Step Over (F10)">↷Over</button>
          <button class="dbg-btn" id="dbg-step-out" title="Step Out">↑Out</button>
        </div>

        <!-- CPU State -->
        <div class="cpu-registers">
          <h4>Registers</h4>
          <div class="cpu-register-grid">
            <div class="cpu-register"><label>A</label><span id="reg-a">00</span></div>
            <div class="cpu-register"><label>X</label><span id="reg-x">00</span></div>
            <div class="cpu-register"><label>Y</label><span id="reg-y">00</span></div>
            <div class="cpu-register"><label>SP</label><span id="reg-sp">FF</span></div>
            <div class="cpu-register"><label>PC</label><span id="reg-pc">0000</span></div>
          </div>
          <div class="cpu-flags" id="flags">
            <span class="flag" id="flag-n" title="Negative">N</span>
            <span class="flag" id="flag-v" title="Overflow">V</span>
            <span class="flag separator">-</span>
            <span class="flag" id="flag-b" title="Break">B</span>
            <span class="flag" id="flag-d" title="Decimal">D</span>
            <span class="flag" id="flag-i" title="Interrupt">I</span>
            <span class="flag" id="flag-z" title="Zero">Z</span>
            <span class="flag" id="flag-c" title="Carry">C</span>
          </div>
          <div class="cpu-cycles">
            <span class="label">Cycles:</span>
            <span class="value" id="cycle-count">0</span>
          </div>
        </div>

        <!-- Disassembly -->
        <div class="cpu-disassembly">
          <h4>Disassembly</h4>
          <div class="cpu-disasm-view" id="disasm-view"></div>
        </div>

        <!-- Breakpoints -->
        <div class="cpu-breakpoints">
          <h4>Breakpoints</h4>
          <div class="cpu-bp-list" id="breakpoint-list"></div>
          <div class="cpu-bp-add">
            <input type="text" id="breakpoint-input" placeholder="$XXXX">
            <button id="breakpoint-add-btn">Add</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Set up event listeners after content is rendered
   */
  setupContentEventListeners() {
    // Test: log ALL mousedowns on content
    this.contentElement.addEventListener('mousedown', (e) => {
      console.log('Content mousedown:', e.target.tagName, e.target.className);
    });

    // Disassembly click handler using event delegation with mousedown
    const disasmView = this.contentElement.querySelector('#disasm-view');
    console.log('Setting up disasm click handler, view found:', !!disasmView);
    if (disasmView) {
      disasmView.addEventListener('mousedown', (e) => {
        console.log('Disasm view mousedown, target:', e.target.tagName, e.target.className);
        const line = e.target.closest('.cpu-disasm-line');
        if (line && line.dataset.addr) {
          const addr = parseInt(line.dataset.addr, 16);
          console.log('Disasm mousedown on addr:', addr.toString(16));
          e.preventDefault();
          e.stopPropagation();
          this.toggleBreakpoint(addr);
        }
      });
    }

    // Debug control buttons
    const runBtn = this.contentElement.querySelector('#dbg-run');
    const pauseBtn = this.contentElement.querySelector('#dbg-pause');
    const stepBtn = this.contentElement.querySelector('#dbg-step');

    if (runBtn) {
      runBtn.addEventListener('click', () => {
        this.wasmModule._setPaused(false);
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.wasmModule._setPaused(true);
      });
    }

    if (stepBtn) {
      stepBtn.addEventListener('click', () => {
        this.wasmModule._stepInstruction();
      });
    }

    // Step Over - step over JSR instructions
    const stepOverBtn = this.contentElement.querySelector('#dbg-step-over');
    if (stepOverBtn) {
      stepOverBtn.addEventListener('click', () => this.stepOver());
    }

    // Step Out - run until RTS returns
    const stepOutBtn = this.contentElement.querySelector('#dbg-step-out');
    if (stepOutBtn) {
      stepOutBtn.addEventListener('click', () => this.stepOut());
    }

    // Breakpoint add
    const bpInput = this.contentElement.querySelector('#breakpoint-input');
    const bpAddBtn = this.contentElement.querySelector('#breakpoint-add-btn');
    if (bpAddBtn && bpInput) {
      bpAddBtn.addEventListener('click', () => this.addBreakpointFromInput());
      bpInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.addBreakpointFromInput();
      });
    }
  }

  /**
   * Override create to set up content event listeners
   */
  create() {
    super.create();
    this.setupContentEventListeners();
  }

  /**
   * Add breakpoint from input field
   */
  addBreakpointFromInput() {
    const input = this.contentElement.querySelector('#breakpoint-input');
    if (!input) return;

    const addr = parseInt(input.value, 16);
    if (!isNaN(addr) && addr >= 0 && addr <= 0xFFFF) {
      this.addBreakpoint(addr);
      input.value = '';
    }
  }

  /**
   * Add a breakpoint
   */
  addBreakpoint(addr) {
    if (!this.breakpoints.has(addr)) {
      this.breakpoints.set(addr, { enabled: true });
      if (this.wasmModule._addBreakpoint) {
        try {
          this.wasmModule._addBreakpoint(addr);
        } catch (e) {
          console.warn('Failed to add breakpoint in WASM:', e);
        }
      }
      this.saveBreakpoints();
      this.updateBreakpointList();
      this.updateDisassembly();
    }
  }

  /**
   * Remove a breakpoint
   */
  removeBreakpoint(addr) {
    if (this.breakpoints.has(addr)) {
      this.breakpoints.delete(addr);
      if (this.wasmModule._removeBreakpoint) {
        try {
          this.wasmModule._removeBreakpoint(addr);
        } catch (e) {
          console.warn('Failed to remove breakpoint in WASM:', e);
        }
      }
      this.saveBreakpoints();
      this.updateBreakpointList();
      this.updateDisassembly();
    }
  }

  /**
   * Toggle a breakpoint at the given address
   */
  toggleBreakpoint(addr) {
    console.log('Toggle breakpoint at:', addr.toString(16), 'exists:', this.breakpoints.has(addr));
    if (this.breakpoints.has(addr)) {
      this.removeBreakpoint(addr);
    } else {
      this.addBreakpoint(addr);
    }
    console.log('Breakpoints now:', Array.from(this.breakpoints.keys()).map(a => a.toString(16)));
  }

  /**
   * Step Over - if current instruction is JSR, run until it returns
   * Otherwise, just do a single step
   */
  stepOver() {
    const pc = this.wasmModule._getPC();
    const opcode = this.wasmModule._peekMemory(pc);

    // JSR opcode is 0x20
    if (opcode === 0x20) {
      // Set temporary breakpoint at instruction after JSR (PC + 3)
      const returnAddr = (pc + 3) & 0xFFFF;
      this.setTempBreakpoint(returnAddr);
      this.wasmModule._setPaused(false);
    } else {
      // Not a JSR, just single step
      this.wasmModule._stepInstruction();
    }
  }

  /**
   * Step Out - run until the current subroutine returns
   * Reads return address from stack and sets breakpoint there
   */
  stepOut() {
    const sp = this.wasmModule._getSP();
    // Stack is at $0100-$01FF, return address is at SP+1 (low) and SP+2 (high)
    // The 6502 pushes PCH first, then PCL, so:
    // $0100+SP+1 = PCL, $0100+SP+2 = PCH
    const pcl = this.wasmModule._peekMemory(0x0100 + ((sp + 1) & 0xFF));
    const pch = this.wasmModule._peekMemory(0x0100 + ((sp + 2) & 0xFF));
    // RTS adds 1 to the address, so the actual return is (pch:pcl) + 1
    const returnAddr = ((pch << 8) | pcl) + 1;

    if (returnAddr > 0 && returnAddr <= 0xFFFF) {
      this.setTempBreakpoint(returnAddr & 0xFFFF);
      this.wasmModule._setPaused(false);
    } else {
      // Invalid return address (probably not in a subroutine), just step
      this.wasmModule._stepInstruction();
    }
  }

  /**
   * Set a temporary breakpoint that will be auto-removed when hit
   */
  setTempBreakpoint(addr) {
    // Remove any existing temp breakpoint
    this.clearTempBreakpoint();

    this.tempBreakpoint = addr;
    if (this.wasmModule._addBreakpoint) {
      try {
        this.wasmModule._addBreakpoint(addr);
      } catch (e) {
        console.warn('Failed to add temp breakpoint:', e);
      }
    }
  }

  /**
   * Clear the temporary breakpoint
   */
  clearTempBreakpoint() {
    if (this.tempBreakpoint !== null) {
      // Only remove from WASM if it's not also a user breakpoint
      if (!this.breakpoints.has(this.tempBreakpoint)) {
        if (this.wasmModule._removeBreakpoint) {
          try {
            this.wasmModule._removeBreakpoint(this.tempBreakpoint);
          } catch (e) {
            console.warn('Failed to remove temp breakpoint:', e);
          }
        }
      }
      this.tempBreakpoint = null;
    }
  }

  /**
   * Update all window content
   */
  update(wasmModule) {
    this.wasmModule = wasmModule;

    // Check if we hit a temporary breakpoint
    if (this.tempBreakpoint !== null) {
      const pc = this.wasmModule._getPC();
      if (pc === this.tempBreakpoint) {
        this.clearTempBreakpoint();
      }
    }

    this.updateRegisters();
    this.updateFlags();
    this.updateDisassembly();
  }

  /**
   * Update CPU register display
   */
  updateRegisters() {
    const regs = [
      { id: 'reg-a', fn: '_getA', digits: 2 },
      { id: 'reg-x', fn: '_getX', digits: 2 },
      { id: 'reg-y', fn: '_getY', digits: 2 },
      { id: 'reg-sp', fn: '_getSP', digits: 2 },
      { id: 'reg-pc', fn: '_getPC', digits: 4 },
      { id: 'cycle-count', fn: '_getTotalCycles', digits: 0 }
    ];

    regs.forEach(({ id, fn, digits }) => {
      const elem = this.contentElement.querySelector(`#${id}`);
      if (elem && this.wasmModule[fn]) {
        const value = this.wasmModule[fn]();
        elem.textContent = digits > 0 ? this.formatHex(value, digits) : value.toString();
      }
    });
  }

  /**
   * Update CPU flags display
   */
  updateFlags() {
    const p = this.wasmModule._getP();
    const flags = [
      { id: 'flag-n', bit: 0x80 },
      { id: 'flag-v', bit: 0x40 },
      { id: 'flag-b', bit: 0x10 },
      { id: 'flag-d', bit: 0x08 },
      { id: 'flag-i', bit: 0x04 },
      { id: 'flag-z', bit: 0x02 },
      { id: 'flag-c', bit: 0x01 }
    ];

    flags.forEach(({ id, bit }) => {
      const elem = this.contentElement.querySelector(`#${id}`);
      if (elem) {
        elem.classList.toggle('active', (p & bit) !== 0);
      }
    });
  }

  /**
   * Find a good starting address for disassembly that aligns with instruction boundaries.
   * Scans forward from a safe distance back to find valid instruction starts.
   */
  findDisasmStartAddress(pc, instructionsBefore) {
    // Start from further back and scan forward to find instruction boundaries
    const maxLookback = instructionsBefore * 3 + 10;  // Max bytes to look back
    let startAddr = Math.max(0, pc - maxLookback);

    // Build a list of instruction addresses by scanning forward
    const addresses = [];
    let addr = startAddr;
    while (addr <= pc + 100 && addr <= 0xFFFF) {
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
    const view = this.contentElement.querySelector('#disasm-view');
    if (!view) return;

    const pc = this.wasmModule._getPC();
    const totalLines = 20;  // Total instructions to show
    const linesBefore = 6;  // Instructions to show before PC

    // Find aligned start address
    const startAddr = this.findDisasmStartAddress(pc, linesBefore);

    view.innerHTML = '';
    let addr = startAddr;
    let pcLineElement = null;

    // Disassemble instructions
    for (let i = 0; i < totalLines && addr <= 0xFFFF; i++) {
      const line = document.createElement('div');
      line.className = 'cpu-disasm-line';
      line.dataset.addr = addr.toString(16);

      const isCurrent = addr === pc;
      if (isCurrent) {
        line.classList.add('current');
        pcLineElement = line;
      }
      if (this.breakpoints.has(addr)) {
        line.classList.add('breakpoint');
      }

      // Breakpoint gutter
      const gutterSpan = document.createElement('span');
      gutterSpan.className = 'cpu-disasm-gutter';
      if (this.breakpoints.has(addr)) {
        gutterSpan.innerHTML = '<span class="bp-dot"></span>';
      } else if (isCurrent) {
        gutterSpan.innerHTML = '<span class="pc-arrow">▶</span>';
      }

      // Get disassembly from WASM
      const disasm = this.wasmModule.UTF8ToString(
        this.wasmModule._disassembleAt(addr)
      );

      // Parse: "AAAA: BB BB BB  MMM OPERAND"
      const addrPart = disasm.substring(0, 4);
      const bytesPart = disasm.substring(6, 14).trim();
      const instrPart = disasm.substring(16);

      const addrSpan = document.createElement('span');
      addrSpan.className = 'cpu-disasm-addr';
      addrSpan.textContent = addrPart;

      const bytesSpan = document.createElement('span');
      bytesSpan.className = 'cpu-disasm-bytes';
      bytesSpan.textContent = bytesPart;

      const instrSpan = document.createElement('span');
      instrSpan.className = 'cpu-disasm-instr';
      instrSpan.innerHTML = this.symbolizeInstruction(instrPart);

      line.appendChild(gutterSpan);
      line.appendChild(addrSpan);
      line.appendChild(bytesSpan);
      line.appendChild(instrSpan);

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
        pcLineElement.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    }

    this.lastPC = pc;
  }

  /**
   * Update breakpoint list
   */
  updateBreakpointList() {
    const list = this.contentElement.querySelector('#breakpoint-list');
    if (!list) return;

    list.innerHTML = '';
    for (const [addr, bp] of this.breakpoints) {
      const item = document.createElement('div');
      item.className = 'cpu-bp-item';
      item.innerHTML = `
        <span class="bp-addr">${this.formatAddr(addr)}</span>
        <button title="Remove">×</button>
      `;

      item.querySelector('button').addEventListener('click', () => {
        this.removeBreakpoint(addr);
      });

      list.appendChild(item);
    }
  }

  /**
   * Replace addresses in instruction text with symbolic names when known,
   * and wrap constants in spans for colorization.
   * Handles formats like: "$XXXX", "$XXXX,X", "#$XX", "($XXXX)", etc.
   */
  symbolizeInstruction(instrText) {
    // First, wrap immediate constants (#$XX or #$XXXX) in spans
    let result = instrText.replace(/#\$([0-9A-Fa-f]{2,4})/g, (match) => {
      return `<span class="cpu-disasm-const">${match}</span>`;
    });

    // Then replace $XXXX patterns (4-digit hex addresses) with symbols
    result = result.replace(/\$([0-9A-Fa-f]{4})(?![0-9A-Fa-f])/g, (match, hexAddr) => {
      const addr = parseInt(hexAddr, 16);
      const info = getSymbolInfo(addr);
      if (info) {
        const cssClass = getCategoryClass(info.category);
        return `<span class="cpu-disasm-symbol ${cssClass}" title="${info.desc}">${info.name}</span>`;
      }
      return match; // Keep original if no symbol found
    });

    // Also handle 2-digit zero page addresses that have symbols
    result = result.replace(/\$([0-9A-Fa-f]{2})(?![0-9A-Fa-f])/g, (match, hexAddr) => {
      const addr = parseInt(hexAddr, 16);
      const info = getSymbolInfo(addr);
      if (info) {
        const cssClass = getCategoryClass(info.category);
        return `<span class="cpu-disasm-symbol ${cssClass}" title="${info.desc}">${info.name}</span>`;
      }
      return match;
    });

    return result;
  }

  /**
   * Get instruction length for a given opcode
   */
  getInstructionLength(opcode) {
    const lengths = [
      1, 2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3,
      2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3,
      3, 2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3,
      2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3,
      1, 2, 1, 1, 1, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3,
      2, 2, 2, 1, 1, 2, 2, 2, 1, 3, 1, 1, 1, 3, 3, 3,
      1, 2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3,
      2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3,
      2, 2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3,
      2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3,
      2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3,
      2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3,
      2, 2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3,
      2, 2, 2, 1, 1, 2, 2, 2, 1, 3, 1, 1, 1, 3, 3, 3,
      2, 2, 1, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3,
      2, 2, 2, 1, 1, 2, 2, 2, 1, 3, 1, 1, 1, 3, 3, 3
    ];
    return lengths[opcode] || 1;
  }
}
