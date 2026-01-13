// Debugger UI for Apple //e Emulator

export class Debugger {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.breakpoints = new Map(); // address -> enabled
    this.memoryViewAddress = 0;
  }

  init() {
    this.setupControls();
    this.setupBreakpoints();
    this.setupMemoryViewer();
  }

  setupControls() {
    // Run button
    document.getElementById("dbg-run").addEventListener("click", () => {
      this.wasmModule._setPaused(false);
    });

    // Pause button
    document.getElementById("dbg-pause").addEventListener("click", () => {
      this.wasmModule._setPaused(true);
    });

    // Step button
    document.getElementById("dbg-step").addEventListener("click", () => {
      this.wasmModule._stepInstruction();
      this.refresh();
    });

    // Step over button
    document.getElementById("dbg-step-over").addEventListener("click", () => {
      // Get current instruction
      const pc = this.wasmModule._getPC();
      const opcode = this.wasmModule._readMemory(pc);

      // If it's a JSR, set breakpoint after it and run
      if (opcode === 0x20) {
        // JSR
        const returnAddr = pc + 3;
        this.wasmModule._addBreakpoint(returnAddr);
        this.wasmModule._setPaused(false);
      } else {
        // Otherwise just step
        this.wasmModule._stepInstruction();
      }
      this.refresh();
    });

    // Step out button
    document.getElementById("dbg-step-out").addEventListener("click", () => {
      // Set breakpoint on RTS/RTI and run
      // This is a simplified approach - real step-out would track the stack
      this.wasmModule._setPaused(false);
      this.refresh();
    });
  }

  setupBreakpoints() {
    const addBtn = document.getElementById("bp-add-btn");
    const addrInput = document.getElementById("bp-address");

    addBtn.addEventListener("click", () => {
      const addrStr = addrInput.value.replace(/^\$/, "");
      const address = parseInt(addrStr, 16);

      if (!isNaN(address) && address >= 0 && address <= 0xffff) {
        this.addBreakpoint(address);
        addrInput.value = "";
      }
    });

    addrInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        addBtn.click();
      }
    });
  }

  setupMemoryViewer() {
    const gotoBtn = document.getElementById("mem-goto");
    const addrInput = document.getElementById("mem-address");

    gotoBtn.addEventListener("click", () => {
      const addrStr = addrInput.value.replace(/^\$/, "");
      const address = parseInt(addrStr, 16);

      if (!isNaN(address) && address >= 0 && address <= 0xffff) {
        this.memoryViewAddress = address & 0xfff0; // Align to 16 bytes
        this.updateMemoryView();
      }
    });

    addrInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        gotoBtn.click();
      }
    });
  }

  addBreakpoint(address) {
    this.breakpoints.set(address, true);
    this.wasmModule._addBreakpoint(address);
    this.updateBreakpointList();
  }

  removeBreakpoint(address) {
    this.breakpoints.delete(address);
    this.wasmModule._removeBreakpoint(address);
    this.updateBreakpointList();
  }

  toggleBreakpoint(address) {
    const enabled = !this.breakpoints.get(address);
    this.breakpoints.set(address, enabled);
    this.wasmModule._enableBreakpoint(address, enabled);
    this.updateBreakpointList();
  }

  updateBreakpointList() {
    const list = document.getElementById("breakpoint-list");
    list.innerHTML = "";

    for (const [address, enabled] of this.breakpoints) {
      const item = document.createElement("div");
      item.className = "breakpoint-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = enabled;
      checkbox.addEventListener("change", () => this.toggleBreakpoint(address));

      const addrSpan = document.createElement("span");
      addrSpan.className = "bp-addr";
      addrSpan.textContent =
        "$" + address.toString(16).toUpperCase().padStart(4, "0");

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "X";
      removeBtn.addEventListener("click", () => this.removeBreakpoint(address));

      item.appendChild(checkbox);
      item.appendChild(addrSpan);
      item.appendChild(removeBtn);
      list.appendChild(item);
    }
  }

  refresh() {
    this.updateRegisters();
    this.updateFlags();
    this.updateDisassembly();
    this.updateMemoryView();
    this.updateSoftSwitches();
    this.updateDiskStatus();
  }

  updateRegisters() {
    const format = (val) => val.toString(16).toUpperCase().padStart(2, "0");
    const format16 = (val) => val.toString(16).toUpperCase().padStart(4, "0");

    document.getElementById("reg-a").textContent = format(
      this.wasmModule._getA(),
    );
    document.getElementById("reg-x").textContent = format(
      this.wasmModule._getX(),
    );
    document.getElementById("reg-y").textContent = format(
      this.wasmModule._getY(),
    );
    document.getElementById("reg-sp").textContent = format(
      this.wasmModule._getSP(),
    );
    document.getElementById("reg-pc").textContent = format16(
      this.wasmModule._getPC(),
    );

    // Cycle count
    const cycles = this.wasmModule._getTotalCycles();
    document.getElementById("cycle-count").textContent = cycles.toString();
  }

  updateFlags() {
    const p = this.wasmModule._getP();

    const flags = {
      "flag-n": (p & 0x80) !== 0,
      "flag-v": (p & 0x40) !== 0,
      "flag-b": (p & 0x10) !== 0,
      "flag-d": (p & 0x08) !== 0,
      "flag-i": (p & 0x04) !== 0,
      "flag-z": (p & 0x02) !== 0,
      "flag-c": (p & 0x01) !== 0,
    };

    for (const [id, active] of Object.entries(flags)) {
      const elem = document.getElementById(id);
      if (elem) {
        elem.classList.toggle("active", active);
      }
    }
  }

  updateDisassembly() {
    const view = document.getElementById("disasm-view");
    view.innerHTML = "";

    const pc = this.wasmModule._getPC();
    let addr = Math.max(0, pc - 10);

    // Show ~20 instructions
    for (let i = 0; i < 20; i++) {
      const line = document.createElement("div");
      line.className = "disasm-line";

      if (addr === pc) {
        line.classList.add("current");
      }

      if (this.breakpoints.has(addr)) {
        line.classList.add("breakpoint");
      }

      // Address
      const addrSpan = document.createElement("span");
      addrSpan.className = "disasm-addr";
      addrSpan.textContent =
        "$" + addr.toString(16).toUpperCase().padStart(4, "0");

      // Get instruction bytes
      const opcode = this.wasmModule._readMemory(addr);
      const bytesSpan = document.createElement("span");
      bytesSpan.className = "disasm-bytes";
      bytesSpan.textContent = opcode
        .toString(16)
        .toUpperCase()
        .padStart(2, "0");

      // Disassembly
      const instrSpan = document.createElement("span");
      instrSpan.className = "disasm-instruction";
      const disasm = this.wasmModule.UTF8ToString(
        this.wasmModule._disassembleAt(addr),
      );
      instrSpan.textContent = disasm.substring(6); // Skip address prefix

      line.appendChild(addrSpan);
      line.appendChild(bytesSpan);
      line.appendChild(instrSpan);

      // Click to toggle breakpoint
      line.addEventListener("click", () => {
        if (this.breakpoints.has(addr)) {
          this.removeBreakpoint(addr);
        } else {
          this.addBreakpoint(addr);
        }
        this.updateDisassembly();
      });

      view.appendChild(line);

      // Advance to next instruction (simplified - assume all are 1-3 bytes)
      addr += this.getInstructionLength(opcode);
      if (addr > 0xffff) break;
    }
  }

  getInstructionLength(opcode) {
    // Simplified instruction length table
    // Actual length depends on addressing mode
    const lengths = {
      // Implied/Accumulator: 1 byte
      0x00: 2,
      0x08: 1,
      0x18: 1,
      0x28: 1,
      0x38: 1,
      0x40: 1,
      0x48: 1,
      0x58: 1,
      0x60: 1,
      0x68: 1,
      0x78: 1,
      0x88: 1,
      0x8a: 1,
      0x98: 1,
      0x9a: 1,
      0xa8: 1,
      0xaa: 1,
      0xb8: 1,
      0xba: 1,
      0xc8: 1,
      0xca: 1,
      0xd8: 1,
      0xe8: 1,
      0xea: 1,
      0xf8: 1,

      // Absolute: 3 bytes
      0x0c: 3,
      0x0d: 3,
      0x0e: 3,
      0x19: 3,
      0x1c: 3,
      0x1d: 3,
      0x1e: 3,
      0x20: 3,
      0x2c: 3,
      0x2d: 3,
      0x2e: 3,
      0x39: 3,
      0x3c: 3,
      0x3d: 3,
      0x3e: 3,
      0x4c: 3,
      0x4d: 3,
      0x4e: 3,
      0x59: 3,
      0x5d: 3,
      0x5e: 3,
      0x6c: 3,
      0x6d: 3,
      0x6e: 3,
      0x79: 3,
      0x7c: 3,
      0x7d: 3,
      0x7e: 3,
      0x8c: 3,
      0x8d: 3,
      0x8e: 3,
      0x99: 3,
      0x9c: 3,
      0x9d: 3,
      0x9e: 3,
      0xac: 3,
      0xad: 3,
      0xae: 3,
      0xb9: 3,
      0xbc: 3,
      0xbd: 3,
      0xbe: 3,
      0xcc: 3,
      0xcd: 3,
      0xce: 3,
      0xd9: 3,
      0xdd: 3,
      0xde: 3,
      0xec: 3,
      0xed: 3,
      0xee: 3,
      0xf9: 3,
      0xfd: 3,
      0xfe: 3,
    };

    return lengths[opcode] || 2; // Default to 2 bytes
  }

  updateMemoryView() {
    const view = document.getElementById("memory-dump");
    let html = "";

    // Show 16 rows of 16 bytes each
    for (let row = 0; row < 16; row++) {
      const addr = (this.memoryViewAddress + row * 16) & 0xffff;

      // Address
      html += `<span class="mem-addr">${addr.toString(16).toUpperCase().padStart(4, "0")}:</span> `;

      // Hex bytes
      let ascii = "";
      for (let col = 0; col < 16; col++) {
        const byteAddr = (addr + col) & 0xffff;
        const byte = this.wasmModule._readMemory(byteAddr);
        html += `<span class="mem-byte">${byte.toString(16).toUpperCase().padStart(2, "0")}</span> `;

        // ASCII representation
        ascii += byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : ".";
      }

      html += `<span class="mem-ascii">${ascii}</span>\n`;
    }

    view.innerHTML = html;
  }

  updateSoftSwitches() {
    const state = this.wasmModule._getSoftSwitchState();

    const switches = {
      "sw-text": (state & (1 << 0)) !== 0,
      "sw-mixed": (state & (1 << 1)) !== 0,
      "sw-page2": (state & (1 << 2)) !== 0,
      "sw-hires": (state & (1 << 3)) !== 0,
      "sw-80col": (state & (1 << 4)) !== 0,
      "sw-80store": (state & (1 << 5)) !== 0,
      "sw-ramrd": (state & (1 << 6)) !== 0,
      "sw-ramwrt": (state & (1 << 7)) !== 0,
      "sw-altzp": (state & (1 << 8)) !== 0,
      "sw-lcram": (state & (1 << 9)) !== 0,
      "sw-lcbnk2": (state & (1 << 10)) !== 0,
    };

    for (const [id, active] of Object.entries(switches)) {
      const elem = document.getElementById(id);
      if (elem) {
        elem.classList.toggle("active", active);
      }
    }
  }

  updateDiskStatus() {
    // Check if disk functions are available
    if (!this.wasmModule._getDiskTrack) {
      return;
    }

    const formatHex = (val) =>
      "$" + val.toString(16).toUpperCase().padStart(2, "0");

    // Update each drive
    for (let drive = 0; drive < 2; drive++) {
      const container = document.getElementById(`drive${drive + 1}-status`);
      if (!container) continue;

      const quarterTrack = this.wasmModule._getDiskHeadPosition(drive);
      const track = this.wasmModule._getDiskTrack(drive);
      const phase = this.wasmModule._getDiskPhase(drive);
      const motorOn = this.wasmModule._getDiskMotorOn(drive);
      const writeMode = this.wasmModule._getDiskWriteMode(drive);
      const nibblePos = this.wasmModule._getCurrentNibblePosition(drive);
      const inserted = this.wasmModule._isDiskInserted(drive);

      const diskInserted = container.querySelector(".disk-inserted");
      const qTrack = container.querySelector(".quarter-track");
      const trackEl = container.querySelector(".track");
      const phaseEl = container.querySelector(".phase");
      const nibblePosEl = container.querySelector(".nibble-pos");
      const motorEl = container.querySelector(".motor");
      const modeEl = container.querySelector(".mode");

      if (diskInserted)
        diskInserted.textContent = inserted ? "Disk Inserted" : "No Disk";
      if (qTrack) qTrack.textContent = quarterTrack;
      if (trackEl) trackEl.textContent = track;
      if (phaseEl) phaseEl.textContent = phase;
      if (nibblePosEl) nibblePosEl.textContent = nibblePos;
      if (motorEl) {
        motorEl.textContent = motorOn ? "Motor ON" : "Motor OFF";
        motorEl.classList.toggle("on", motorOn);
      }
      if (modeEl) modeEl.textContent = writeMode ? "Write Mode" : "Read Mode";
    }

    // Selected drive
    const selDriveEl = document.getElementById("sel-drive");
    if (selDriveEl) {
      const selDrive = this.wasmModule._getSelectedDrive();
      selDriveEl.textContent = selDrive + 1;
    }

    // Last byte - use dedicated function to avoid side effects
    const lastByteEl = document.getElementById("last-disk-byte");
    if (lastByteEl) {
      const lastByte = this.wasmModule._getLastDiskByte();
      lastByteEl.textContent = formatHex(lastByte);
    }
  }
}
