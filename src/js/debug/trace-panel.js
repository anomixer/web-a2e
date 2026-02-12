/*
 * trace-panel.js - CPU instruction execution trace panel
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { getSymbolInfo } from "./symbols.js";

/**
 * Cached opcode mnemonics from WASM disassembler (populated on first use)
 */
let MNEMONICS = null;
let ADDR_MODES = null;

// AddrMode enum values matching disassembler.hpp
const MODE_IMP = 0;
const MODE_ACC = 1;
const MODE_IMM = 2;
const MODE_ZP  = 3;
const MODE_ZPX = 4;
const MODE_ZPY = 5;
const MODE_ABS = 6;
const MODE_ABX = 7;
const MODE_ABY = 8;
const MODE_IND = 9;
const MODE_IZX = 10;
const MODE_IZY = 11;
const MODE_REL = 12;
const MODE_ZPI = 13;
const MODE_AIX = 14;
const MODE_ZPR = 15;

function getMnemonicTable(wasmModule) {
  if (MNEMONICS) return MNEMONICS;
  MNEMONICS = new Array(256);
  for (let i = 0; i < 256; i++) {
    const ptr = wasmModule._getOpcodeMnemonic(i);
    MNEMONICS[i] = ptr ? wasmModule.UTF8ToString(ptr) : "???";
  }
  return MNEMONICS;
}

function getAddrModeTable(wasmModule) {
  if (ADDR_MODES) return ADDR_MODES;
  if (!wasmModule._getOpcodeAddressingMode) return null;
  ADDR_MODES = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    ADDR_MODES[i] = wasmModule._getOpcodeAddressingMode(i);
  }
  return ADDR_MODES;
}

/**
 * TracePanelWindow - Displays instruction trace from the WASM ring buffer
 * with virtual scrolling for performance.
 */
export class TracePanelWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "trace-panel",
      title: "Instruction Trace",
      minWidth: 480,
      minHeight: 300,
      defaultWidth: 680,
      defaultHeight: 400,
    });

    this.wasmModule = wasmModule;
    this.ROW_HEIGHT = 14;
    this.scrollTop = 0;
    this.filterAddr = null; // Optional filter by address range
    this.recording = false;
  }

  renderContent() {
    return `
      <div class="trace-panel-content">
        <div class="trace-toolbar">
          <label class="trace-toggle">
            <input type="checkbox" id="trace-enabled">
            <span>Record</span>
          </label>
          <button class="trace-clear-btn" id="trace-clear">Clear</button>
          <span class="trace-count" id="trace-count">0 entries</span>
        </div>
        <div class="trace-header">
          <span class="trace-col-cycle">Cycle</span>
          <span class="trace-col-pc">PC</span>
          <span class="trace-col-bytes">Bytes</span>
          <span class="trace-col-mnemonic">Mnem</span>
          <span class="trace-col-operand">Operand</span>
          <span class="trace-col-regs">A  X  Y  SP NV-BDIZC</span>
        </div>
        <div class="trace-scroll-container" id="trace-scroll">
          <div class="trace-scroll-spacer" id="trace-spacer"></div>
          <div class="trace-rows" id="trace-rows"></div>
        </div>
      </div>
    `;
  }

  setupContentEventListeners() {
    const enabledCheck = this.contentElement.querySelector("#trace-enabled");
    if (enabledCheck) {
      enabledCheck.addEventListener("change", () => {
        this.recording = enabledCheck.checked;
        if (this.wasmModule._setTraceEnabled) {
          this.wasmModule._setTraceEnabled(enabledCheck.checked);
        }
      });
    }

    const clearBtn = this.contentElement.querySelector("#trace-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (this.wasmModule._clearTrace) {
          this.wasmModule._clearTrace();
          this.renderVisibleRows();
        }
      });
    }

    const scrollContainer = this.contentElement.querySelector("#trace-scroll");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", () => {
        this.scrollTop = scrollContainer.scrollTop;
        this.renderVisibleRows();
      });
    }
  }

  create() {
    super.create();
    this.setupContentEventListeners();
  }

  update(wasmModule) {
    this.wasmModule = wasmModule;

    const countEl = this.contentElement.querySelector("#trace-count");
    if (countEl && this.wasmModule._getTraceCount) {
      const count = this.wasmModule._getTraceCount();
      countEl.textContent = `${count} entries`;

      // Auto-scroll to latest entry when recording
      if (this.recording && count > 0) {
        const container = this.contentElement.querySelector("#trace-scroll");
        if (container) {
          const totalHeight = count * this.ROW_HEIGHT;
          container.scrollTop = totalHeight - container.clientHeight;
          this.scrollTop = container.scrollTop;
        }
      }
    }

    this.renderVisibleRows();
  }

  formatOperand(mode, op1, op2, pc, len) {
    const b = this.hex2(op1);
    const w = this.hex2(op2) + this.hex2(op1);
    switch (mode) {
      case MODE_IMP: return "";
      case MODE_ACC: return "A";
      case MODE_IMM: return `#$${b}`;
      case MODE_ZP:  return `$${b}`;
      case MODE_ZPX: return `$${b},X`;
      case MODE_ZPY: return `$${b},Y`;
      case MODE_ABS: return `$${w}`;
      case MODE_ABX: return `$${w},X`;
      case MODE_ABY: return `$${w},Y`;
      case MODE_IND: return `($${w})`;
      case MODE_IZX: return `($${b},X)`;
      case MODE_IZY: return `($${b}),Y`;
      case MODE_REL: {
        const offset = op1 < 128 ? op1 : op1 - 256;
        const target = (pc + len + offset) & 0xFFFF;
        return `$${this.hex4(target)}`;
      }
      case MODE_ZPI: return `($${b})`;
      case MODE_AIX: return `($${w},X)`;
      case MODE_ZPR: {
        const offset = op2 < 128 ? op2 : op2 - 256;
        const target = (pc + len + offset) & 0xFFFF;
        return `$${b},$${this.hex4(target)}`;
      }
      default: return "";
    }
  }

  renderVisibleRows() {
    const container = this.contentElement.querySelector("#trace-scroll");
    const spacer = this.contentElement.querySelector("#trace-spacer");
    const rowsEl = this.contentElement.querySelector("#trace-rows");
    if (!container || !spacer || !rowsEl) return;
    if (!this.wasmModule._getTraceCount || !this.wasmModule._getTraceBuffer) return;

    const count = this.wasmModule._getTraceCount();
    const head = this.wasmModule._getTraceHead();
    const capacity = this.wasmModule._getTraceCapacity();
    const bufPtr = this.wasmModule._getTraceBuffer();

    if (!bufPtr || count === 0) {
      spacer.style.height = "0px";
      rowsEl.innerHTML = '<div class="trace-empty">No trace data</div>';
      return;
    }

    const totalHeight = count * this.ROW_HEIGHT;
    spacer.style.height = totalHeight + "px";

    const containerHeight = container.clientHeight;
    const firstVisible = Math.floor(this.scrollTop / this.ROW_HEIGHT);
    const visibleCount = Math.ceil(containerHeight / this.ROW_HEIGHT) + 1;
    const startIdx = Math.max(0, firstVisible);
    const endIdx = Math.min(count, startIdx + visibleCount);

    // TraceEntry is 16 bytes (packed struct):
    // uint16_t pc; uint8_t opcode, a, x, y, sp, p;
    // uint8_t operand1, operand2, instrLen, padding;
    // uint32_t cycle;
    const ENTRY_SIZE = 16;
    const heap = this.wasmModule.HEAPU8;
    const modes = getAddrModeTable(this.wasmModule);

    let html = "";
    rowsEl.style.transform = `translateY(${startIdx * this.ROW_HEIGHT}px)`;

    for (let i = startIdx; i < endIdx; i++) {
      // Ring buffer index: oldest entry is at head (if full), newest is at head-1
      let ringIdx;
      if (count < capacity) {
        ringIdx = i;
      } else {
        ringIdx = (head + i) % capacity;
      }

      const offset = bufPtr + ringIdx * ENTRY_SIZE;
      const pc = heap[offset] | (heap[offset + 1] << 8);
      const opcode = heap[offset + 2];
      const a = heap[offset + 3];
      const x = heap[offset + 4];
      const y = heap[offset + 5];
      const sp = heap[offset + 6];
      const p = heap[offset + 7];
      const op1 = heap[offset + 8];
      const op2 = heap[offset + 9];
      const len = heap[offset + 10];
      const cycle = heap[offset + 12] | (heap[offset + 13] << 8) |
                    (heap[offset + 14] << 16) | (heap[offset + 15] << 24);

      const mnemonic = getMnemonicTable(this.wasmModule)[opcode] || "???";
      let bytesStr = this.hex2(opcode);
      if (len >= 2) bytesStr += " " + this.hex2(op1);
      if (len >= 3) bytesStr += " " + this.hex2(op2);

      const mode = modes ? modes[opcode] : MODE_IMP;
      const operand = this.formatOperand(mode, op1, op2, pc, len);
      const flags = this.flagsStr(p);

      html += `<div class="trace-row">` +
        `<span class="trace-col-cycle">${(cycle >>> 0).toString()}</span>` +
        `<span class="trace-col-pc">${this.hex4(pc)}</span>` +
        `<span class="trace-col-bytes">${bytesStr.padEnd(8)}</span>` +
        `<span class="trace-col-mnemonic">${mnemonic}</span>` +
        `<span class="trace-col-operand">${operand}</span>` +
        `<span class="trace-col-regs">${this.hex2(a)} ${this.hex2(x)} ${this.hex2(y)} ${this.hex2(sp)} ${flags}</span>` +
        `</div>`;
    }

    rowsEl.innerHTML = html;
  }

  hex2(v) { return v.toString(16).toUpperCase().padStart(2, "0"); }
  hex4(v) { return v.toString(16).toUpperCase().padStart(4, "0"); }

  flagsStr(p) {
    return (
      ((p & 0x80) ? "N" : ".") +
      ((p & 0x40) ? "V" : ".") +
      "-" +
      ((p & 0x10) ? "B" : ".") +
      ((p & 0x08) ? "D" : ".") +
      ((p & 0x04) ? "I" : ".") +
      ((p & 0x02) ? "Z" : ".") +
      ((p & 0x01) ? "C" : ".")
    );
  }
}
