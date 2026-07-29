/*
 * stack-viewer-window.js - Stack viewer debug window with live stack contents
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

export class StackViewerWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "stack-viewer",
      title: "Stack Viewer",
      defaultWidth: 280,
      defaultHeight: 400,
      minWidth: 280,
      minHeight: 250,
      maxWidth: 280,
    });
    this.wasmModule = wasmModule;
    this.previousSP = 0xff;
    this.returnAddresses = new Set(); // Track likely return addresses
  }

  renderContent() {
    return `
      <div class="stack-info">
        <span class="stack-sp-label">SP:</span>
        <span class="stack-sp-value">$FF</span>
        <span class="stack-depth-label">Depth:</span>
        <span class="stack-depth-value">0</span>
      </div>
      <div class="stack-depth-bar">
        <div class="stack-depth-fill"></div>
      </div>
      <div class="stack-call-stack" id="call-stack"></div>
      <div class="stack-header">
        <span class="stack-col-addr">Addr</span>
        <span class="stack-col-value">Value</span>
        <span class="stack-col-info">Info</span>
      </div>
      <div class="stack-content"></div>
    `;
  }

  onContentRendered() {
    this.spValueSpan = this.contentElement.querySelector(".stack-sp-value");
    this.depthValueSpan =
      this.contentElement.querySelector(".stack-depth-value");
    this.depthFill = this.contentElement.querySelector(".stack-depth-fill");
    this.contentDiv = this.contentElement.querySelector(".stack-content");
  }

  /**
   * Return address arithmetic, with no I/O.
   *
   * 6502 return addresses are pushed as addr-1 (JSR pushes PC+2, which points
   * at the last byte of the JSR).
   */
  returnAddressOf(lowByte, highByte) {
    const retAddr = ((highByte << 8) | lowByte) + 1;
    return retAddr > 0xffff ? null : retAddr;
  }

  /**
   * Pull the mnemonic out of an already-fetched disassembly line.
   *
   * This used to be an async method that disassembled one address per call —
   * two round-trips each, inside the render loop, once per return address on
   * the stack. A deep stack made that dozens of sequential round-trips per
   * tick. The disassembly for every return address is now fetched in one
   * batch and this just parses the result.
   */
  mnemonicOf(disasmStr) {
    const match = disasmStr && disasmStr.match(/:\s*[0-9A-F ]+\s+(\w+)/);
    return match ? match[1] : "???";
  }

  async isLikelyReturnAddress(sp, wasmModule) {
    if (sp >= 0xfe) return false; // Need at least 2 bytes

    const [low, high] = await wasmModule.batch([
      ['_peekMemory', 0x100 + sp + 1],
      ['_peekMemory', 0x100 + sp + 2],
    ]);
    const addr = ((high << 8) | low) + 1;

    return await wasmModule._isLikelyReturnAddress(addr & 0xffff);
  }

  async update(wasmModule) {
    if (!this.isVisible || !this.contentDiv) return;

    const sp = await wasmModule._getSP();
    const stackDepth = 0xff - sp;

    // Update SP display
    this.spValueSpan.textContent = `$${this.formatHex(sp, 2)}`;
    this.depthValueSpan.textContent = stackDepth.toString();

    // Update depth bar (max depth is 256 bytes)
    const depthPercent = (stackDepth / 256) * 100;
    this.depthFill.style.width = `${depthPercent}%`;

    // Color code depth bar
    if (depthPercent > 80) {
      this.depthFill.classList.add("danger");
      this.depthFill.classList.remove("warning");
    } else if (depthPercent > 60) {
      this.depthFill.classList.add("warning");
      this.depthFill.classList.remove("danger");
    } else {
      this.depthFill.classList.remove("warning", "danger");
    }

    // Batch-read all stack bytes upfront
    const batchCalls = [];
    for (let addr = 0x1ff; addr > 0x100 + sp; addr--) {
      batchCalls.push(['_peekMemory', addr]);
    }
    const stackBytes = stackDepth > 0 ? await wasmModule.batch(batchCalls) : [];
    // stackBytes[0] = value at $01FF, stackBytes[1] = value at $01FE, etc.

    // Also batch-read potential JSR check bytes
    const jsrCheckCalls = [];
    const jsrCheckAddrs = [];
    let idx = 0;
    for (let i = 0xff; i > sp; i--, idx++) {
      if (i > sp + 1) {
        const value = stackBytes[0xff - i];
        const prevValue = stackBytes[0xff - (i - 1)];
        const testAddr = ((value << 8) | prevValue) + 1;
        if (
          (testAddr >= 0x0800 && testAddr < 0xc000) ||
          (testAddr >= 0xd000 && testAddr <= 0xffff)
        ) {
          const beforeRet = testAddr - 3;
          if (beforeRet >= 0) {
            jsrCheckCalls.push(['_peekMemory', beforeRet]);
            jsrCheckAddrs.push({ i, testAddr, beforeRet });
          }
        }
      }
    }
    const jsrCheckResults = jsrCheckCalls.length > 0 ? await wasmModule.batch(jsrCheckCalls) : [];
    const jsrMap = new Map();
    for (let j = 0; j < jsrCheckAddrs.length; j++) {
      if (jsrCheckResults[j] === 0x20) {
        jsrMap.set(jsrCheckAddrs[j].i, true);
      }
    }

    // Disassemble every detected return address in ONE batch, rather than two
    // round-trips per address from inside the render loop below.
    const retAddrByIndex = new Map();
    const disasmCalls = [];
    const disasmIndexes = [];
    for (let i = 0xff; i > sp; i--) {
      if (i <= sp + 1 || !jsrMap.has(i)) continue;
      const retAddr = this.returnAddressOf(stackBytes[0xff - (i - 1)], stackBytes[0xff - i]);
      if (retAddr === null) continue;
      retAddrByIndex.set(i, retAddr);
      disasmIndexes.push(i);
      disasmCalls.push(['__callString', '_disassembleAt', retAddr]);
    }
    const disasmResults = disasmCalls.length > 0 ? await wasmModule.batch(disasmCalls) : [];
    const mnemonicByIndex = new Map();
    disasmIndexes.forEach((i, n) => {
      mnemonicByIndex.set(i, this.mnemonicOf(disasmResults[n]));
    });

    // Build the row data, then apply it in place — see _renderRows().
    const rows = [];
    let skipReturnAddr = false;

    for (let i = 0xff; i > sp; i--) {
      const addr = 0x100 + i;
      const value = stackBytes[0xff - i];
      const isSP = i === sp + 1; // Current top of stack
      const retAddr = retAddrByIndex.get(i);
      const isReturnAddr = retAddr !== undefined;

      const classes = ["stack-entry"];
      if (isSP) classes.push("stack-top");
      if (skipReturnAddr) {
        classes.push("return-addr-low");
        skipReturnAddr = false;
      } else if (isReturnAddr) {
        classes.push("return-addr-high");
        skipReturnAddr = true;
      }

      let infoStr = "";
      if (isReturnAddr) {
        infoStr = `→ $${this.formatHex(retAddr, 4)} (${mnemonicByIndex.get(i)})`;
      } else if (value >= 0x20 && value < 0x7f) {
        infoStr = `'${String.fromCharCode(value)}'`;
      }

      rows.push({
        className: classes.join(" "),
        addr: `$${this.formatHex(addr, 4)}`,
        value: `$${this.formatHex(value, 2)}`,
        info: infoStr,
      });
    }

    this._renderRows(rows);
    this.previousSP = sp;

    // Build call stack summary
    await this.updateCallStack(wasmModule, sp);
  }

  /**
   * Apply row data to the DOM, reusing the existing elements.
   *
   * This ran as `contentDiv.innerHTML = html` on every tick, which discards and
   * re-parses every row — a full style recalc, layout and paint for the window
   * (and, for a floating window, a backdrop re-blur) 15 times a second even
   * when a single byte changed. Rows are now created only when the stack depth
   * changes, and their text is written only where it differs.
   */
  _renderRows(rows) {
    if (!this._rowPool) this._rowPool = [];
    const pool = this._rowPool;

    if (rows.length === 0) {
      if (this.contentDiv.firstElementChild?.className !== "stack-empty") {
        this.contentDiv.replaceChildren();
        const empty = document.createElement("div");
        empty.className = "stack-empty";
        empty.textContent = "Stack is empty";
        this.contentDiv.appendChild(empty);
        pool.length = 0;
      }
      return;
    }

    // Depth changed — rebuild the pool. Cheap relative to doing it every tick.
    if (pool.length !== rows.length) {
      pool.length = 0;
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < rows.length; i++) {
        const row = document.createElement("div");
        const addrSpan = document.createElement("span");
        addrSpan.className = "stack-addr";
        const valueSpan = document.createElement("span");
        valueSpan.className = "stack-value";
        const infoSpan = document.createElement("span");
        infoSpan.className = "stack-info-text";
        row.append(addrSpan, valueSpan, infoSpan);
        fragment.appendChild(row);
        pool.push({ row, addrSpan, valueSpan, infoSpan, last: {} });
      }
      this.contentDiv.replaceChildren(fragment);
    }

    for (let i = 0; i < rows.length; i++) {
      const data = rows[i];
      const el = pool[i];
      const last = el.last;
      if (last.className !== data.className) {
        el.row.className = data.className;
        last.className = data.className;
      }
      if (last.addr !== data.addr) {
        el.addrSpan.textContent = data.addr;
        last.addr = data.addr;
      }
      if (last.value !== data.value) {
        el.valueSpan.textContent = data.value;
        last.value = data.value;
      }
      if (last.info !== data.info) {
        el.infoSpan.textContent = data.info;
        last.info = data.info;
      }
    }
  }

  /**
   * Build a call stack summary by walking the stack for return addresses.
   * Display: current_PC → caller → caller → ...
   */
  async updateCallStack(wasmModule, sp) {
    const callStackEl = this.contentElement.querySelector("#call-stack");
    if (!callStackEl) return;

    const [pc, count] = await wasmModule.batch([
      ['_getPC'],
      ['_getCallStack'],
    ]);

    if (count === 0) {
      callStackEl.innerHTML = "";
      return;
    }

    // Read packed CallStackEntry structs (4 bytes each: uint16_t returnAddr, uint16_t jsrTarget)
    const bufPtr = await wasmModule._getCallStackBuffer();
    const heap = await wasmModule.heapRead(bufPtr, count * 4);

    let stackHtml = '<span class="call-stack-label">Call:</span> ';
    stackHtml += `<span class="call-stack-addr">$${this.formatHex(pc, 4)}</span>`;

    for (let i = 0; i < count; i++) {
      const offset = i * 4;
      const retAddr = heap[offset] | (heap[offset + 1] << 8);
      const jsrTarget = heap[offset + 2] | (heap[offset + 3] << 8);
      stackHtml += ` ← <span class="call-stack-addr" title="Returns to $${this.formatHex(retAddr, 4)}">$${this.formatHex(jsrTarget, 4)}</span>`;
    }

    callStackEl.innerHTML = stackHtml;
  }
}
