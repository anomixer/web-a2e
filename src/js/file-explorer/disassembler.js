/**
 * 6502 Disassembler with Virtual Scrolling
 * Uses the C++ disassembler from the emulation core for structured data
 * JavaScript handles all rendering/formatting
 */

// Reference to the WASM module
let wasmModule = null;

// Virtual scroll configuration
const LINE_HEIGHT = 18;
const BUFFER_LINES = 20;

// Addressing modes (must match C++ enum)
const AddrMode = {
  IMP: 0, ACC: 1, IMM: 2, ZP: 3, ZPX: 4, ZPY: 5,
  ABS: 6, ABX: 7, ABY: 8, IND: 9, IZX: 10, IZY: 11,
  REL: 12, ZPI: 13, AIX: 14, ZPR: 15
};

// Instruction categories (must match C++ enum)
const Category = {
  BRANCH: 0, LOAD: 1, MATH: 2, STACK: 3, FLAG: 4, UNKNOWN: 5
};

// Category to CSS class mapping
const CATEGORY_CLASSES = {
  [Category.BRANCH]: 'dis-branch',
  [Category.LOAD]: 'dis-load',
  [Category.MATH]: 'dis-math',
  [Category.STACK]: 'dis-stack',
  [Category.FLAG]: 'dis-flag',
  [Category.UNKNOWN]: 'dis-unknown'
};

/**
 * Set the WASM module
 */
export function setWasmModule(module) {
  wasmModule = module;
}

/**
 * Format a byte as 2-digit hex
 */
function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Format a word as 4-digit hex
 */
function hexWord(w) {
  return w.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Format a clickable target address for branches/jumps
 */
function formatClickableTarget(target) {
  return `<span class="dis-target dis-clickable" data-target="${target}">$${hexWord(target)}</span>`;
}

/**
 * Format operand based on addressing mode
 * isBranch: if true, make targets clickable for navigation
 */
function formatOperand(mode, operand1, operand2, target, isBranch = false) {
  switch (mode) {
    case AddrMode.IMP:
      return '';
    case AddrMode.ACC:
      return '<span class="dis-register">A</span>';
    case AddrMode.IMM:
      return `<span class="dis-punct">#$</span><span class="dis-immediate">${hexByte(operand1)}</span>`;
    case AddrMode.ZP:
      return `<span class="dis-punct">$</span><span class="dis-address">${hexByte(operand1)}</span>`;
    case AddrMode.ZPX:
      return `<span class="dis-punct">$</span><span class="dis-address">${hexByte(operand1)}</span><span class="dis-punct">,</span><span class="dis-register">X</span>`;
    case AddrMode.ZPY:
      return `<span class="dis-punct">$</span><span class="dis-address">${hexByte(operand1)}</span><span class="dis-punct">,</span><span class="dis-register">Y</span>`;
    case AddrMode.ABS:
      if (isBranch) {
        return formatClickableTarget(target);
      }
      return `<span class="dis-punct">$</span><span class="dis-address">${hexWord(target)}</span>`;
    case AddrMode.ABX:
      return `<span class="dis-punct">$</span><span class="dis-address">${hexWord(target)}</span><span class="dis-punct">,</span><span class="dis-register">X</span>`;
    case AddrMode.ABY:
      return `<span class="dis-punct">$</span><span class="dis-address">${hexWord(target)}</span><span class="dis-punct">,</span><span class="dis-register">Y</span>`;
    case AddrMode.IND:
      return `<span class="dis-punct">($</span><span class="dis-address">${hexWord(target)}</span><span class="dis-punct">)</span>`;
    case AddrMode.IZX:
      return `<span class="dis-punct">($</span><span class="dis-address">${hexByte(operand1)}</span><span class="dis-punct">,</span><span class="dis-register">X</span><span class="dis-punct">)</span>`;
    case AddrMode.IZY:
      return `<span class="dis-punct">($</span><span class="dis-address">${hexByte(operand1)}</span><span class="dis-punct">),</span><span class="dis-register">Y</span>`;
    case AddrMode.REL:
      return formatClickableTarget(target);
    case AddrMode.ZPI:
      return `<span class="dis-punct">($</span><span class="dis-address">${hexByte(operand1)}</span><span class="dis-punct">)</span>`;
    case AddrMode.AIX:
      return `<span class="dis-punct">($</span><span class="dis-address">${hexWord(target)}</span><span class="dis-punct">,</span><span class="dis-register">X</span><span class="dis-punct">)</span>`;
    case AddrMode.ZPR:
      return `<span class="dis-punct">$</span><span class="dis-address">${hexByte(operand1)}</span><span class="dis-punct">,</span>${formatClickableTarget(target)}`;
    default:
      return '';
  }
}

/**
 * Format a single instruction to HTML
 */
function formatInstruction(instr) {
  // Handle ORG directive
  if (instr.isOrg) {
    return formatOrg(instr.address);
  }

  // Handle data bytes (non-code)
  if (instr.isData) {
    return formatDataLine(instr);
  }

  const catClass = CATEGORY_CLASSES[instr.category] || 'dis-mnemonic';

  // Address
  let html = `<span class="dis-addr">${hexWord(instr.address)}:</span> `;

  // Bytes
  html += `<span class="dis-bytes">${hexByte(instr.opcode)}`;
  if (instr.length >= 2) {
    html += ` ${hexByte(instr.operand1)}`;
  } else {
    html += '   ';
  }
  if (instr.length >= 3) {
    html += ` ${hexByte(instr.operand2)}`;
  } else {
    html += '   ';
  }
  html += '</span>';

  // Mnemonic
  html += `  <span class="${catClass}">${instr.mnemonic}</span>`;

  // Operand - make branch targets clickable
  const isBranch = instr.category === Category.BRANCH;
  const operand = formatOperand(instr.mode, instr.operand1, instr.operand2, instr.target, isBranch);
  if (operand) {
    html += ` ${operand}`;
  }

  return html;
}

/**
 * Format a data line (unvisited bytes)
 */
function formatDataLine(entry) {
  let html = `<span class="dis-addr">${hexWord(entry.address)}:</span> `;

  // Show bytes (up to 8 per line)
  const byteStrs = entry.bytes.map(b => hexByte(b));
  html += `<span class="dis-bytes">${byteStrs.join(' ').padEnd(23)}</span>`;

  // .BYTE directive
  html += `  <span class="dis-directive">.BYTE</span> `;
  html += `<span class="dis-data">${byteStrs.map(b => '$' + b).join(',')}</span>`;

  return html;
}

/**
 * Format ORG directive
 */
function formatOrg(address) {
  return `<span class="dis-directive">        ORG</span>   <span class="dis-punct">$</span><span class="dis-address">${hexWord(address)}</span>`;
}

/**
 * Build complete listing with code and data
 * Fills gaps between visited instructions with .BYTE data
 */
function buildCompleteListing(codeInstructions, rawData, baseAddress) {
  const lines = [];
  const dataLength = rawData.length;
  const endAddress = baseAddress + dataLength;

  // Build a map of address -> instruction for visited code
  const codeMap = new Map();
  const coveredAddresses = new Set();

  for (const instr of codeInstructions) {
    codeMap.set(instr.address, instr);
    // Mark all bytes covered by this instruction
    for (let i = 0; i < instr.length; i++) {
      coveredAddresses.add(instr.address + i);
    }
  }

  // Iterate through all addresses
  let addr = baseAddress;
  while (addr < endAddress) {
    if (codeMap.has(addr)) {
      // This is a visited code instruction
      const instr = codeMap.get(addr);
      lines.push(instr);
      addr += instr.length;
    } else if (coveredAddresses.has(addr)) {
      // This byte is part of a multi-byte instruction, skip it
      addr++;
    } else {
      // This is unvisited data - collect consecutive data bytes
      const dataBytes = [];
      const dataStart = addr;

      while (addr < endAddress &&
             !codeMap.has(addr) &&
             !coveredAddresses.has(addr) &&
             dataBytes.length < 8) {
        const offset = addr - baseAddress;
        dataBytes.push(rawData[offset]);
        addr++;
      }

      lines.push({
        isData: true,
        address: dataStart,
        bytes: dataBytes
      });
    }
  }

  return lines;
}

/**
 * Virtual scroll renderer
 */
class VirtualScrollRenderer {
  constructor(container, instructions) {
    this.container = container;
    this.instructions = instructions;
    this.lineHeight = LINE_HEIGHT;
    this.totalHeight = instructions.length * this.lineHeight;

    // Build address-to-line-index map for navigation
    this.addressToLine = new Map();
    for (let i = 0; i < instructions.length; i++) {
      const instr = instructions[i];
      if (instr.address !== undefined) {
        this.addressToLine.set(instr.address, i);
      }
    }

    this.scrollContainer = document.createElement('div');
    this.scrollContainer.className = 'virtual-scroll-container';
    this.scrollContainer.style.cssText = `
      height: 100%;
      overflow-y: auto;
      position: relative;
    `;

    this.spacer = document.createElement('div');
    this.spacer.style.cssText = `
      height: ${this.totalHeight}px;
      width: 1px;
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    `;

    this.content = document.createElement('pre');
    this.content.className = 'virtual-scroll-content';
    this.content.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      margin: 0;
      padding: 0 8px;
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1.5;
      white-space: pre;
    `;

    this.scrollContainer.appendChild(this.spacer);
    this.scrollContainer.appendChild(this.content);
    this.container.appendChild(this.scrollContainer);

    this.visibleStart = -1;
    this.visibleEnd = -1;
    this.resizeTimeout = null;
    this.highlightedLine = -1;

    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleClick = this.handleClick.bind(this);

    this.scrollContainer.addEventListener('scroll', this.handleScroll, { passive: true });
    this.content.addEventListener('click', this.handleClick);
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.scrollContainer);

    this.render();
  }

  handleScroll() {
    requestAnimationFrame(() => this.render());
  }

  handleResize() {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.visibleStart = -1;
      this.visibleEnd = -1;
      this.render();
    }, 16);
  }

  handleClick(event) {
    const target = event.target.closest('.dis-clickable');
    if (target) {
      const address = parseInt(target.dataset.target, 10);
      if (!isNaN(address)) {
        this.scrollToAddress(address);
      }
    }
  }

  scrollToAddress(address) {
    const lineIndex = this.addressToLine.get(address);
    if (lineIndex !== undefined) {
      // Highlight the target line
      this.highlightedLine = lineIndex;

      const scrollTop = lineIndex * this.lineHeight;
      // Center the target line in the viewport
      const viewportHeight = this.scrollContainer.clientHeight;
      const centeredScrollTop = Math.max(0, scrollTop - viewportHeight / 2 + this.lineHeight / 2);
      this.scrollContainer.scrollTop = centeredScrollTop;

      // Force re-render to show highlight
      this.visibleStart = -1;
      this.visibleEnd = -1;
      this.render();
    }
  }

  render() {
    const scrollTop = this.scrollContainer.scrollTop;
    const viewportHeight = this.scrollContainer.clientHeight;

    const startLine = Math.max(0, Math.floor(scrollTop / this.lineHeight) - BUFFER_LINES);
    const endLine = Math.min(
      this.instructions.length,
      Math.ceil((scrollTop + viewportHeight) / this.lineHeight) + BUFFER_LINES
    );

    if (startLine === this.visibleStart && endLine === this.visibleEnd) {
      return;
    }

    this.visibleStart = startLine;
    this.visibleEnd = endLine;

    const offsetTop = startLine * this.lineHeight;
    this.content.style.top = `${offsetTop}px`;

    // Render visible instructions
    const lines = [];
    for (let i = startLine; i < endLine; i++) {
      const line = formatInstruction(this.instructions[i]);
      if (i === this.highlightedLine) {
        lines.push(`<span class="dis-highlight">${line}</span>`);
      } else {
        lines.push(line);
      }
    }
    this.content.innerHTML = lines.join('\n');
  }

  destroy() {
    this.scrollContainer.removeEventListener('scroll', this.handleScroll);
    this.content.removeEventListener('click', this.handleClick);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
  }
}

// Store address map for small output click handling
let currentAddressMap = null;
let currentScrollContainer = null;
let currentPreElement = null;

/**
 * Handle clicks on branch targets in small output mode
 */
function handleSmallOutputClick(event) {
  const target = event.target.closest('.dis-clickable');
  if (target && currentAddressMap && currentScrollContainer && currentPreElement) {
    const address = parseInt(target.dataset.target, 10);
    if (!isNaN(address)) {
      const lineIndex = currentAddressMap.get(address);
      if (lineIndex !== undefined) {
        const lineHeight = LINE_HEIGHT;
        const scrollTop = lineIndex * lineHeight;
        const viewportHeight = currentScrollContainer.clientHeight;
        const centeredScrollTop = Math.max(0, scrollTop - viewportHeight / 2 + lineHeight / 2);
        currentScrollContainer.scrollTop = centeredScrollTop;

        // Highlight the target line
        highlightSmallOutputLine(lineIndex);
      }
    }
  }
}

/**
 * Highlight a line in small output mode
 */
function highlightSmallOutputLine(lineIndex) {
  if (!currentPreElement) return;

  // Remove any existing highlight
  const existing = currentPreElement.querySelector('.dis-highlight');
  if (existing) {
    existing.outerHTML = existing.innerHTML;
  }

  // Find and wrap the target line
  const html = currentPreElement.innerHTML;
  const lines = html.split('\n');
  if (lineIndex >= 0 && lineIndex < lines.length) {
    lines[lineIndex] = `<span class="dis-highlight">${lines[lineIndex]}</span>`;
    currentPreElement.innerHTML = lines.join('\n');
  }
}

let currentRenderer = null;

/**
 * Parse instruction data from WASM memory
 * Structure: 16 bytes per instruction
 * Layout: [address:2][target:2][length:1][opcode:1][op1:1][op2:1][mode:1][cat:1][mnem:4][pad:2]
 */
function parseInstructions(ptr, count) {
  const instructions = [];
  const heap = wasmModule.HEAPU8;

  for (let i = 0; i < count; i++) {
    const offset = ptr + i * 16;

    // Read mnemonic as string (4 chars, null-terminated)
    let mnemonic = '';
    for (let j = 0; j < 4; j++) {
      const c = heap[offset + 10 + j];
      if (c === 0) break;
      mnemonic += String.fromCharCode(c);
    }

    instructions.push({
      address: heap[offset] | (heap[offset + 1] << 8),
      target: heap[offset + 2] | (heap[offset + 3] << 8),
      length: heap[offset + 4],
      opcode: heap[offset + 5],
      operand1: heap[offset + 6],
      operand2: heap[offset + 7],
      mode: heap[offset + 8],
      category: heap[offset + 9],
      mnemonic: mnemonic
    });
  }

  return instructions;
}

/**
 * Disassemble binary data
 */
export async function disassemble(data, targetElement) {
  if (!targetElement) {
    throw new Error('Target element required');
  }
  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  if (currentRenderer) {
    currentRenderer.destroy();
    currentRenderer = null;
  }

  targetElement.innerHTML = '<pre><span class="dis-comment">; Disassembling...</span></pre>';

  // Parse DOS 3.3 header
  let baseAddress = 0;
  let codeData = data;

  if (data.length >= 4) {
    const headerAddr = data[0] | (data[1] << 8);
    const headerLen = data[2] | (data[3] << 8);
    if (headerLen > 0 && headerLen <= data.length - 4 && headerAddr >= 0x0800) {
      baseAddress = headerAddr;
      codeData = data.slice(4);
    }
  }

  // Copy data to WASM memory
  const dataPtr = wasmModule._malloc(codeData.length);
  wasmModule.HEAPU8.set(codeData, dataPtr);

  // Call C++ disassembler with flow analysis (recursive descent)
  const count = wasmModule._disassembleWithFlowAnalysis(dataPtr, codeData.length, baseAddress);
  wasmModule._free(dataPtr);

  if (count === 0) {
    targetElement.innerHTML = '<pre><span class="dis-comment">; No instructions</span></pre>';
    return;
  }

  // Get pointer to instruction array
  const instrPtr = wasmModule._getDisasmInstructions();
  const codeInstructions = parseInstructions(instrPtr, count);

  // Build complete listing with code and data gaps filled
  const listing = buildCompleteListing(codeInstructions, codeData, baseAddress);

  targetElement.innerHTML = '';

  // Build output lines with ORG at top
  const outputLines = [formatOrg(baseAddress)];

  // Build address map for navigation (used by both small and large outputs)
  const listingWithOrg = [{ isOrg: true, address: baseAddress }, ...listing];

  // Small output: render directly
  if (listing.length < 500) {
    const pre = document.createElement('pre');
    for (const entry of listing) {
      outputLines.push(formatInstruction(entry));
    }
    pre.innerHTML = outputLines.join('\n');
    targetElement.appendChild(pre);

    // Set up click handling for small output
    currentAddressMap = new Map();
    for (let i = 0; i < listingWithOrg.length; i++) {
      const entry = listingWithOrg[i];
      if (entry.address !== undefined) {
        currentAddressMap.set(entry.address, i);
      }
    }
    currentScrollContainer = targetElement;
    currentPreElement = pre;
    pre.addEventListener('click', handleSmallOutputClick);
    return;
  }

  // Large output: virtual scrolling
  currentAddressMap = null;
  currentScrollContainer = null;
  currentPreElement = null;
  currentRenderer = new VirtualScrollRenderer(targetElement, listingWithOrg);
}
