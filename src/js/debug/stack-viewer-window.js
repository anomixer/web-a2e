/**
 * StackViewerWindow - Dedicated stack visualization
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
      defaultPosition: { x: 250, y: 250 },
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

  analyzeReturnAddress(lowByte, highByte) {
    // Return addresses on 6502 are pushed as addr-1 (JSR pushes PC+2, which points to last byte of JSR)
    const retAddr = ((highByte << 8) | lowByte) + 1;

    if (retAddr > 0xffff) return null;

    // Try to disassemble the instruction at the return address
    const disasm = this.wasmModule._disassembleAt(retAddr);
    if (disasm) {
      const disasmStr = this.wasmModule.UTF8ToString(disasm);
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

  isLikelyReturnAddress(sp, wasmModule) {
    if (sp >= 0xfe) return false; // Need at least 2 bytes

    const low = wasmModule._peekMemory(0x100 + sp + 1);
    const high = wasmModule._peekMemory(0x100 + sp + 2);
    const addr = ((high << 8) | low) + 1;

    return wasmModule._isLikelyReturnAddress(addr & 0xffff);
  }

  update(wasmModule) {
    if (!this.isVisible || !this.contentDiv) return;

    const sp = wasmModule._getSP();
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

    // Build stack view (from top of stack down to SP)
    let html = "";
    let i = 0xff;
    let skipReturnAddr = false;

    while (i > sp) {
      const addr = 0x100 + i;
      const value = wasmModule._peekMemory(addr);
      const isSP = i === sp + 1; // Current top of stack

      // Try to detect return addresses (pairs of bytes)
      let returnInfo = null;
      let isReturnAddr = false;

      if (i > sp + 1) {
        // Check if this could be the high byte of a return address
        const prevValue = wasmModule._peekMemory(0x100 + i - 1);
        const testAddr = ((value << 8) | prevValue) + 1;

        // Heuristic: return addresses typically point to ROM or program area
        if (
          (testAddr >= 0x0800 && testAddr < 0xc000) ||
          (testAddr >= 0xd000 && testAddr <= 0xffff)
        ) {
          // Check if the instruction before the return address was a JSR
          const beforeRet = testAddr - 3;
          if (beforeRet >= 0) {
            const possibleJSR = wasmModule._peekMemory(beforeRet);
            if (possibleJSR === 0x20) {
              // JSR opcode
              isReturnAddr = true;
              returnInfo = this.analyzeReturnAddress(prevValue, value);
            }
          }
        }
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

      i--;
    }

    // Add empty stack marker if stack is empty
    if (stackDepth === 0) {
      html = '<div class="stack-empty">Stack is empty</div>';
    }

    this.contentDiv.innerHTML = html;
    this.previousSP = sp;

    // Build call stack summary
    this.updateCallStack(wasmModule, sp);
  }

  /**
   * Build a call stack summary by walking the stack for return addresses.
   * Display: current_PC → caller → caller → ...
   */
  updateCallStack(wasmModule, sp) {
    const callStackEl = this.contentElement.querySelector("#call-stack");
    if (!callStackEl) return;

    const pc = wasmModule._getPC();
    const count = wasmModule._getCallStack();

    if (count === 0) {
      callStackEl.innerHTML = "";
      return;
    }

    // Read packed CallStackEntry structs (4 bytes each: uint16_t returnAddr, uint16_t jsrTarget)
    const bufPtr = wasmModule._getCallStackBuffer();
    const heap = wasmModule.HEAPU8;

    let stackHtml = '<span class="call-stack-label">Call:</span> ';
    stackHtml += `<span class="call-stack-addr">$${this.formatHex(pc, 4)}</span>`;

    for (let i = 0; i < count; i++) {
      const offset = bufPtr + i * 4;
      const retAddr = heap[offset] | (heap[offset + 1] << 8);
      const jsrTarget = heap[offset + 2] | (heap[offset + 3] << 8);
      stackHtml += ` ← <span class="call-stack-addr" title="Returns to $${this.formatHex(retAddr, 4)}">$${this.formatHex(jsrTarget, 4)}</span>`;
    }

    callStackEl.innerHTML = stackHtml;
  }
}
