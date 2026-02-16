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

  async analyzeReturnAddress(lowByte, highByte) {
    // Return addresses on 6502 are pushed as addr-1 (JSR pushes PC+2, which points to last byte of JSR)
    const retAddr = ((highByte << 8) | lowByte) + 1;

    if (retAddr > 0xffff) return null;

    // Try to disassemble the instruction at the return address
    const disasmPtr = await this.wasmModule._disassembleAt(retAddr);
    if (disasmPtr) {
      const disasmStr = await this.wasmModule.UTF8ToString(disasmPtr);
      // Extract just the instruction mnemonic
      const match = disasmStr.match(/:\s*[0-9A-F ]+\s+(\w+)/);
      if (match) {
        return {
          addr: retAddr,
          instr: match[1],
        };
      }
    }
    return { addr: retAddr, instr: "???" };
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

    // Build stack view (from top of stack down to SP)
    let html = "";
    let skipReturnAddr = false;

    for (let i = 0xff; i > sp; i--) {
      const addr = 0x100 + i;
      const value = stackBytes[0xff - i];
      const isSP = i === sp + 1; // Current top of stack

      // Try to detect return addresses (pairs of bytes)
      let returnInfo = null;
      let isReturnAddr = false;

      if (i > sp + 1 && jsrMap.has(i)) {
        const prevValue = stackBytes[0xff - (i - 1)];
        isReturnAddr = true;
        returnInfo = await this.analyzeReturnAddress(prevValue, value);
      }

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
      if (isReturnAddr && returnInfo) {
        infoStr = `→ $${this.formatHex(returnInfo.addr, 4)} (${returnInfo.instr})`;
      } else if (value >= 0x20 && value < 0x7f) {
        infoStr = `'${String.fromCharCode(value)}'`;
      }

      html += `
        <div class="${classes.join(" ")}">
          <span class="stack-addr">$${this.formatHex(addr, 4)}</span>
          <span class="stack-value">$${this.formatHex(value, 2)}</span>
          <span class="stack-info-text">${infoStr}</span>
        </div>
      `;
    }

    // Add empty stack marker if stack is empty
    if (stackDepth === 0) {
      html = '<div class="stack-empty">Stack is empty</div>';
    }

    this.contentDiv.innerHTML = html;
    this.previousSP = sp;

    // Build call stack summary
    await this.updateCallStack(wasmModule, sp);
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
