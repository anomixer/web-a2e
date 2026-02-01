import { BaseWindow } from "../windows/base-window.js";
import { getSymbolInfo } from "./symbols.js";

/**
 * Cached opcode mnemonics from WASM disassembler (populated on first use)
 */
let MNEMONICS = null;

function getMnemonicTable(wasmModule) {
  if (MNEMONICS) return MNEMONICS;
  MNEMONICS = new Array(256);
  for (let i = 0; i < 256; i++) {
    const ptr = wasmModule._getOpcodeMnemonic(i);
    MNEMONICS[i] = ptr ? wasmModule.UTF8ToString(ptr) : "???";
  }
  return MNEMONICS;
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
      defaultWidth: 580,
      defaultHeight: 400,
      defaultPosition: { x: 60, y: window.innerHeight - 460 },
    });

    this.wasmModule = wasmModule;
    this.ROW_HEIGHT = 14;
    this.scrollTop = 0;
    this.filterAddr = null; // Optional filter by address range
  }

  renderContent() {
    return `
      <div class="trace-panel-content">
        <div class="trace-toolbar">
          <label class="trace-toggle">
            <input type="checkbox" id="trace-enabled">
            <span>Record</span>
          </label>
          <button class="dbg-btn" id="trace-clear">Clear</button>
          <span class="trace-count" id="trace-count">0 entries</span>
        </div>
        <div class="trace-header">
          <span class="trace-col-cycle">Cycle</span>
          <span class="trace-col-pc">PC</span>
          <span class="trace-col-bytes">Bytes</span>
          <span class="trace-col-instr">Instruction</span>
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
    }

    this.renderVisibleRows();
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

      const flags = this.flagsStr(p);

      html += `<div class="trace-row">` +
        `<span class="trace-col-cycle">${(cycle >>> 0).toString()}</span>` +
        `<span class="trace-col-pc">${this.hex4(pc)}</span>` +
        `<span class="trace-col-bytes">${bytesStr.padEnd(8)}</span>` +
        `<span class="trace-col-instr">${mnemonic}</span>` +
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
