/**
 * 6502 Disassembler with Virtual Scrolling
 * Uses the C++ disassembler from the emulation core for high performance
 * Implements virtual scrolling for efficient display of large disassemblies
 */

// Reference to the WASM module (set during initialization)
let wasmModule = null;

// Virtual scroll configuration
const LINE_HEIGHT = 18; // pixels per line (matches CSS line-height: 1.5 at 12px font)
const BUFFER_LINES = 20; // extra lines above/below viewport

/**
 * Set the WASM module for the disassembler
 * @param {Object} module - The WASM module instance
 */
export function setWasmModule(module) {
  wasmModule = module;
}

/**
 * Virtual scroll renderer class
 */
class VirtualScrollRenderer {
  constructor(container, lines) {
    this.container = container;
    this.lines = lines;
    this.lineHeight = LINE_HEIGHT;
    this.totalHeight = lines.length * this.lineHeight;

    // Create the structure
    this.scrollContainer = document.createElement('div');
    this.scrollContainer.className = 'virtual-scroll-container';
    this.scrollContainer.style.cssText = `
      height: 100%;
      overflow-y: auto;
      position: relative;
    `;

    // Spacer to create correct scroll height
    this.spacer = document.createElement('div');
    this.spacer.style.cssText = `
      height: ${this.totalHeight}px;
      width: 1px;
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    `;

    // Content area for visible lines
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

    // State
    this.visibleStart = 0;
    this.visibleEnd = 0;
    this.lastViewportHeight = 0;
    this.resizeTimeout = null;

    // Bind handlers
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);

    // Attach scroll handler
    this.scrollContainer.addEventListener('scroll', this.handleScroll, { passive: true });

    // Use ResizeObserver for efficient resize handling
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.scrollContainer);

    // Initial render
    this.render();
  }

  handleScroll() {
    requestAnimationFrame(() => this.render());
  }

  handleResize(entries) {
    // Debounce resize to avoid excessive re-renders during drag
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(() => {
      // Force re-render on resize by invalidating cached range
      this.visibleStart = -1;
      this.visibleEnd = -1;
      this.render();
    }, 16); // ~60fps debounce
  }

  render() {
    const scrollTop = this.scrollContainer.scrollTop;
    const viewportHeight = this.scrollContainer.clientHeight;

    // Calculate visible range
    const startLine = Math.max(0, Math.floor(scrollTop / this.lineHeight) - BUFFER_LINES);
    const endLine = Math.min(
      this.lines.length,
      Math.ceil((scrollTop + viewportHeight) / this.lineHeight) + BUFFER_LINES
    );

    // Skip if range hasn't changed
    if (startLine === this.visibleStart && endLine === this.visibleEnd) {
      return;
    }

    this.visibleStart = startLine;
    this.visibleEnd = endLine;

    // Position content at the right scroll offset
    const offsetTop = startLine * this.lineHeight;
    this.content.style.top = `${offsetTop}px`;

    // Render only visible lines
    const visibleLines = this.lines.slice(startLine, endLine);
    this.content.innerHTML = visibleLines.join('\n');
  }

  destroy() {
    this.scrollContainer.removeEventListener('scroll', this.handleScroll);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
  }
}

// Track current renderer for cleanup
let currentRenderer = null;

/**
 * Disassemble binary data using the C++ core disassembler with virtual scrolling
 * @param {Uint8Array} data - Binary data (including 4-byte header for DOS 3.3 binary files)
 * @param {HTMLElement} targetElement - Element to render into
 * @returns {Promise<void>}
 */
export async function disassemble(data, targetElement) {
  if (!targetElement) {
    throw new Error('Target element required for disassembly');
  }

  if (!wasmModule) {
    throw new Error('WASM module not initialized. Call setWasmModule first.');
  }

  // Clean up previous renderer
  if (currentRenderer) {
    currentRenderer.destroy();
    currentRenderer = null;
  }

  // Show loading indicator
  targetElement.innerHTML = '<pre><span class="dis-comment">; Disassembling...</span></pre>';

  // Parse the 4-byte header (for DOS 3.3 binary files)
  // Header: 2 bytes load address (little endian), 2 bytes length (little endian)
  let baseAddress = 0;
  let codeData = data;

  if (data.length >= 4) {
    const headerAddr = data[0] | (data[1] << 8);
    const headerLen = data[2] | (data[3] << 8);

    // Check if this looks like a valid DOS 3.3 binary header
    // The length should be close to the actual data size minus header
    if (headerLen > 0 && headerLen <= data.length - 4 && headerAddr >= 0x0800) {
      baseAddress = headerAddr;
      codeData = data.slice(4);
    }
  }

  // Allocate WASM memory and copy data
  const dataPtr = wasmModule._malloc(codeData.length);
  wasmModule.HEAPU8.set(codeData, dataPtr);

  // Call the C++ disassembler with HTML output
  const resultPtr = wasmModule._disassembleRawData(dataPtr, codeData.length, baseAddress, true);
  const html = wasmModule.UTF8ToString(resultPtr);

  // Free allocated memory
  wasmModule._free(dataPtr);

  // Split into lines for virtual scrolling
  const lines = html.split('\n').filter(line => line.length > 0);

  // Clear container
  targetElement.innerHTML = '';

  // For small outputs, just render directly (no virtual scroll overhead)
  if (lines.length < 500) {
    const pre = document.createElement('pre');
    pre.innerHTML = html;
    targetElement.appendChild(pre);
    return;
  }

  // Use virtual scrolling for large outputs
  currentRenderer = new VirtualScrollRenderer(targetElement, lines);
}
