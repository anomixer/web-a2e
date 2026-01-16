import { DebugWindow } from './DebugWindow.js';

/**
 * CPUDebuggerWindow - CPU registers, disassembly, breakpoints, memory viewer
 */
export class CPUDebuggerWindow extends DebugWindow {
  constructor(wasmModule) {
    super({
      id: 'cpu-debugger',
      title: 'CPU Debugger',
      minWidth: 280,
      minHeight: 350,
      defaultWidth: 320,
      defaultHeight: 480,
      defaultPosition: { x: window.innerWidth - 340, y: 60 }
    });

    this.wasmModule = wasmModule;
    this.breakpoints = new Map();
    this.memoryViewAddress = 0;
    this.bytesPerRow = 8;

    // Memory quick navigation areas
    this.memoryAreas = [
      { name: 'ZP', addr: 0x0000, desc: 'Zero Page' },
      { name: 'Stack', addr: 0x0100, desc: 'Stack' },
      { name: 'Text1', addr: 0x0400, desc: 'Text Page 1' },
      { name: 'Text2', addr: 0x0800, desc: 'Text Page 2' },
      { name: 'HiRes1', addr: 0x2000, desc: 'HiRes Page 1' },
      { name: 'HiRes2', addr: 0x4000, desc: 'HiRes Page 2' },
      { name: 'I/O', addr: 0xC000, desc: 'I/O Space' },
      { name: 'ROM', addr: 0xD000, desc: 'ROM' }
    ];
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

        <!-- Memory Viewer -->
        <div class="cpu-memory">
          <h4>Memory</h4>
          <div class="cpu-mem-quicknav" id="memory-nav"></div>
          <div class="cpu-mem-controls">
            <input type="text" id="memory-addr" placeholder="$0000" value="0000">
            <button id="memory-go">Go</button>
          </div>
          <div class="cpu-mem-dump" id="memory-dump"></div>
        </div>
      </div>
    `;
  }

  /**
   * Set up event listeners after content is rendered
   */
  setupContentEventListeners() {
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

    // Step Over and Step Out - just do single step for now (same as step)
    const stepOverBtn = this.contentElement.querySelector('#dbg-step-over');
    const stepOutBtn = this.contentElement.querySelector('#dbg-step-out');
    if (stepOverBtn) {
      stepOverBtn.addEventListener('click', () => {
        this.wasmModule._stepInstruction();
      });
    }
    if (stepOutBtn) {
      stepOutBtn.addEventListener('click', () => {
        this.wasmModule._stepInstruction();
      });
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

    // Memory navigation quick buttons
    const navContainer = this.contentElement.querySelector('#memory-nav');
    if (navContainer) {
      this.memoryAreas.forEach(area => {
        const btn = document.createElement('button');
        btn.className = 'memory-nav-btn';
        btn.textContent = area.name;
        btn.title = area.desc;
        btn.addEventListener('click', () => {
          this.memoryViewAddress = area.addr;
          const addrInput = this.contentElement.querySelector('#memory-addr');
          if (addrInput) addrInput.value = this.formatHex(area.addr, 4);
          this.updateMemoryView();
        });
        navContainer.appendChild(btn);
      });
    }

    // Memory address go button
    const memAddrInput = this.contentElement.querySelector('#memory-addr');
    const memGoBtn = this.contentElement.querySelector('#memory-go');
    if (memGoBtn && memAddrInput) {
      memGoBtn.addEventListener('click', () => this.goToMemoryAddress());
      memAddrInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.goToMemoryAddress();
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
      this.wasmModule._addBreakpoint(addr);
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
      this.wasmModule._removeBreakpoint(addr);
      this.updateBreakpointList();
      this.updateDisassembly();
    }
  }

  /**
   * Go to memory address from input
   */
  goToMemoryAddress() {
    const input = this.contentElement.querySelector('#memory-addr');
    if (!input) return;

    const addr = parseInt(input.value, 16);
    if (!isNaN(addr) && addr >= 0 && addr <= 0xFFFF) {
      this.memoryViewAddress = addr;
      this.updateMemoryView();
    }
  }

  /**
   * Update all window content
   */
  update(wasmModule) {
    this.wasmModule = wasmModule;
    this.updateRegisters();
    this.updateFlags();
    this.updateDisassembly();
    this.updateMemoryView();
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
   * Update disassembly view
   */
  updateDisassembly() {
    const view = this.contentElement.querySelector('#disasm-view');
    if (!view) return;

    view.innerHTML = '';
    const pc = this.wasmModule._getPC();
    let addr = Math.max(0, pc - 12);

    // Show ~12 instructions
    for (let i = 0; i < 12; i++) {
      const line = document.createElement('div');
      line.className = 'cpu-disasm-line';

      if (addr === pc) {
        line.classList.add('current');
      }
      if (this.breakpoints.has(addr)) {
        line.classList.add('breakpoint');
      }

      // Get disassembly from WASM
      const disasm = this.wasmModule.UTF8ToString(
        this.wasmModule._disassembleAt(addr)
      );

      // Parse: "AAAA: BB BB BB  MMM OPERAND"
      const addrPart = disasm.substring(0, 4);
      const bytesPart = disasm.substring(6, 14);
      const instrPart = disasm.substring(16);

      const addrSpan = document.createElement('span');
      addrSpan.className = 'cpu-disasm-addr';
      addrSpan.textContent = addrPart;

      const bytesSpan = document.createElement('span');
      bytesSpan.className = 'cpu-disasm-bytes';
      bytesSpan.textContent = bytesPart;

      const instrSpan = document.createElement('span');
      instrSpan.className = 'cpu-disasm-instr';
      instrSpan.textContent = instrPart;

      line.appendChild(addrSpan);
      line.appendChild(bytesSpan);
      line.appendChild(instrSpan);

      // Click to toggle breakpoint
      const clickAddr = addr;
      line.addEventListener('click', () => {
        if (this.breakpoints.has(clickAddr)) {
          this.removeBreakpoint(clickAddr);
        } else {
          this.addBreakpoint(clickAddr);
        }
      });

      view.appendChild(line);

      // Advance to next instruction
      const opcode = this.wasmModule._readMemory(addr);
      addr += this.getInstructionLength(opcode);
      if (addr > 0xFFFF) break;
    }
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
   * Update memory view
   */
  updateMemoryView() {
    const dump = this.contentElement.querySelector('#memory-dump');
    if (!dump) return;

    let html = '';
    const rowCount = 12;

    for (let row = 0; row < rowCount; row++) {
      const addr = (this.memoryViewAddress + row * this.bytesPerRow) & 0xFFFF;
      html += `<div class="cpu-mem-row"><span class="cpu-mem-addr">${this.formatHex(addr, 4)}:</span><span class="cpu-mem-bytes">`;

      let ascii = '';
      for (let col = 0; col < this.bytesPerRow; col++) {
        const byteAddr = (addr + col) & 0xFFFF;
        const byte = this.wasmModule._readMemory(byteAddr);
        const isNonZero = byte !== 0;
        html += `<span class="cpu-mem-byte${isNonZero ? ' non-zero' : ''}">${this.formatHex(byte)}</span>`;
        ascii += (byte >= 0x20 && byte < 0x7F) ? String.fromCharCode(byte) : '.';
      }
      html += `</span><span class="cpu-mem-ascii">${ascii}</span></div>`;
    }

    dump.innerHTML = html;
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
