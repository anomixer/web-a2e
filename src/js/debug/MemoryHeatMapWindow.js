/**
 * MemoryHeatMapWindow - Dual 256x256 visualization of memory access patterns
 * Left: Main RAM + ROM, Right: Auxiliary RAM (banked memory)
 */
import { DebugWindow } from "./DebugWindow.js";

// Memory region labels for main memory
const MAIN_MEMORY_REGIONS = [
  { name: "Zero Page", start: 0x0000, end: 0x00ff },
  { name: "Stack", start: 0x0100, end: 0x01ff },
  { name: "Input Buffer", start: 0x0200, end: 0x02ff },
  { name: "Vectors/Data", start: 0x0300, end: 0x03ff },
  { name: "Text Page 1", start: 0x0400, end: 0x07ff },
  { name: "Text Page 2", start: 0x0800, end: 0x0bff },
  { name: "Free RAM", start: 0x0c00, end: 0x1fff },
  { name: "HiRes Page 1", start: 0x2000, end: 0x3fff },
  { name: "HiRes Page 2", start: 0x4000, end: 0x5fff },
  { name: "Free RAM", start: 0x6000, end: 0x95ff },
  { name: "DOS 3.3", start: 0x9600, end: 0xbfff },
  { name: "I/O Space", start: 0xc000, end: 0xc0ff },
  { name: "Slot ROMs", start: 0xc100, end: 0xcfff },
  { name: "ROM/LC RAM", start: 0xd000, end: 0xffff },
];

// Memory region labels for auxiliary memory
const AUX_MEMORY_REGIONS = [
  { name: "Aux Zero Page", start: 0x0000, end: 0x00ff },
  { name: "Aux Stack", start: 0x0100, end: 0x01ff },
  { name: "Aux $0200", start: 0x0200, end: 0x03ff },
  { name: "Aux Text Page 1", start: 0x0400, end: 0x07ff },
  { name: "Aux Text Page 2", start: 0x0800, end: 0x0bff },
  { name: "Aux RAM", start: 0x0c00, end: 0x1fff },
  { name: "Aux HiRes Page 1", start: 0x2000, end: 0x3fff },
  { name: "Aux HiRes Page 2", start: 0x4000, end: 0x5fff },
  { name: "Aux RAM", start: 0x6000, end: 0xbfff },
  { name: "Aux $C000-$FFFF", start: 0xc000, end: 0xffff },
];

export class MemoryHeatMapWindow extends DebugWindow {
  constructor(wasmModule) {
    super({
      id: "memory-heatmap",
      title: "Memory Heat Map",
      defaultWidth: 580,
      defaultHeight: 420,
      minWidth: 500,
      minHeight: 380,
      defaultPosition: { x: 200, y: 200 },
    });
    this.wasmModule = wasmModule;
    this.isTracking = false;
    this.viewMode = "combined"; // combined, reads, writes
    this.decayEnabled = false;
    this.onJumpToAddress = null; // Callback for Memory Browser integration
    this.activeCanvas = "main"; // Which canvas is being hovered
  }

  renderContent() {
    return `
      <div class="heatmap-toolbar">
        <button class="heatmap-toggle-btn">Start</button>
        <button class="heatmap-clear-btn">Clear</button>
        <select class="heatmap-mode-select">
          <option value="combined">Combined</option>
          <option value="reads">Reads Only</option>
          <option value="writes">Writes Only</option>
        </select>
        <label class="heatmap-decay-label">
          <input type="checkbox" class="heatmap-decay-check" />
          Decay
        </label>
      </div>
      <div class="heatmap-dual-container">
        <div class="heatmap-panel">
          <div class="heatmap-panel-title">Main RAM + ROM</div>
          <div class="heatmap-canvas-container">
            <canvas class="heatmap-canvas heatmap-canvas-main" width="256" height="256"></canvas>
          </div>
        </div>
        <div class="heatmap-panel">
          <div class="heatmap-panel-title">Auxiliary RAM</div>
          <div class="heatmap-canvas-container">
            <canvas class="heatmap-canvas heatmap-canvas-aux" width="256" height="256"></canvas>
          </div>
        </div>
      </div>
      <div class="heatmap-legend">
        <span class="heatmap-legend-item"><span class="legend-color reads"></span> Reads</span>
        <span class="heatmap-legend-item"><span class="legend-color writes"></span> Writes</span>
        <span class="heatmap-legend-item"><span class="legend-color both"></span> Both</span>
      </div>
      <div class="heatmap-info">
        <span class="heatmap-addr">$0000</span>
        <span class="heatmap-region">Zero Page</span>
        <span class="heatmap-counts">R: 0 W: 0</span>
      </div>
    `;
  }

  onContentRendered() {
    this.canvasMain = this.contentElement.querySelector(".heatmap-canvas-main");
    this.canvasAux = this.contentElement.querySelector(".heatmap-canvas-aux");
    this.ctxMain = this.canvasMain.getContext("2d");
    this.ctxAux = this.canvasAux.getContext("2d");
    this.toggleBtn = this.contentElement.querySelector(".heatmap-toggle-btn");
    this.modeSelect = this.contentElement.querySelector(".heatmap-mode-select");
    this.decayCheck = this.contentElement.querySelector(".heatmap-decay-check");
    this.addrSpan = this.contentElement.querySelector(".heatmap-addr");
    this.regionSpan = this.contentElement.querySelector(".heatmap-region");
    this.countsSpan = this.contentElement.querySelector(".heatmap-counts");

    // Pre-allocate image data for both canvases
    this.imageDataMain = this.ctxMain.createImageData(256, 256);
    this.imageDataAux = this.ctxAux.createImageData(256, 256);

    this.setupHeatmapEventListeners();
  }

  setupHeatmapEventListeners() {
    // Toggle tracking
    this.toggleBtn.addEventListener("click", () => {
      this.isTracking = !this.isTracking;
      this.toggleBtn.textContent = this.isTracking ? "Stop" : "Start";
      this.toggleBtn.classList.toggle("active", this.isTracking);
      this.wasmModule._enableMemoryTracking(this.isTracking);
    });

    // Clear tracking data
    this.contentElement
      .querySelector(".heatmap-clear-btn")
      .addEventListener("click", () => {
        this.wasmModule._clearMemoryTracking();
      });

    // View mode selection
    this.modeSelect.addEventListener("change", (e) => {
      this.viewMode = e.target.value;
    });

    // Decay toggle
    this.decayCheck.addEventListener("change", (e) => {
      this.decayEnabled = e.target.checked;
    });

    // Canvas hover for main memory
    this.canvasMain.addEventListener("mousemove", (e) => {
      this.activeCanvas = "main";
      const addr = this.getAddressFromEvent(e, this.canvasMain);
      this.showAddressInfo(addr, MAIN_MEMORY_REGIONS, "Main");
    });

    // Canvas hover for aux memory
    this.canvasAux.addEventListener("mousemove", (e) => {
      this.activeCanvas = "aux";
      const addr = this.getAddressFromEvent(e, this.canvasAux);
      this.showAddressInfo(addr, AUX_MEMORY_REGIONS, "Aux");
    });

    this.canvasMain.addEventListener("mouseleave", () => this.clearAddressInfo());
    this.canvasAux.addEventListener("mouseleave", () => this.clearAddressInfo());

    // Click to jump to Memory Browser
    this.canvasMain.addEventListener("click", (e) => {
      const addr = this.getAddressFromEvent(e, this.canvasMain);
      if (this.onJumpToAddress) {
        this.onJumpToAddress(addr);
      }
    });

    this.canvasAux.addEventListener("click", (e) => {
      const addr = this.getAddressFromEvent(e, this.canvasAux);
      if (this.onJumpToAddress) {
        this.onJumpToAddress(addr);
      }
    });
  }

  getAddressFromEvent(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 256);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 256);
    return y * 256 + x;
  }

  clearAddressInfo() {
    this.addrSpan.textContent = "$----";
    this.regionSpan.textContent = "";
    this.countsSpan.textContent = "";
  }

  showAddressInfo(addr, regions, prefix) {
    if (addr < 0 || addr > 0xffff) return;

    this.addrSpan.textContent = `${prefix} $${this.formatHex(addr, 4)}`;

    // Find region
    for (const region of regions) {
      if (addr >= region.start && addr <= region.end) {
        this.regionSpan.textContent = region.name;
        break;
      }
    }

    // Get counts from WASM memory
    const readCountsPtr = this.wasmModule._getMemoryReadCounts();
    const writeCountsPtr = this.wasmModule._getMemoryWriteCounts();

    if (readCountsPtr && writeCountsPtr) {
      const readCount = this.wasmModule.HEAPU8[readCountsPtr + addr];
      const writeCount = this.wasmModule.HEAPU8[writeCountsPtr + addr];
      this.countsSpan.textContent = `R: ${readCount} W: ${writeCount}`;
    }
  }

  update(wasmModule) {
    if (!this.isVisible || !this.canvasMain || !this.canvasAux) return;

    const readCountsPtr = wasmModule._getMemoryReadCounts();
    const writeCountsPtr = wasmModule._getMemoryWriteCounts();
    const mainRAMPtr = wasmModule._getMainRAM();
    const auxRAMPtr = wasmModule._getAuxRAM();
    const systemROMPtr = wasmModule._getSystemROM();

    if (!readCountsPtr || !writeCountsPtr) return;

    // Update main memory canvas
    this.updateCanvas(
      this.imageDataMain,
      this.ctxMain,
      readCountsPtr,
      writeCountsPtr,
      mainRAMPtr,
      systemROMPtr
    );

    // Update aux memory canvas
    this.updateCanvasAux(
      this.imageDataAux,
      this.ctxAux,
      readCountsPtr,
      writeCountsPtr,
      auxRAMPtr
    );

    // Apply decay if enabled
    if (this.decayEnabled && this.isTracking) {
      wasmModule._decayMemoryTracking(2);
    }
  }

  updateCanvas(imageData, ctx, readCountsPtr, writeCountsPtr, mainRAMPtr, systemROMPtr) {
    const data = imageData.data;
    const wasmModule = this.wasmModule;

    for (let addr = 0; addr < 65536; addr++) {
      const readCount = wasmModule.HEAPU8[readCountsPtr + addr];
      const writeCount = wasmModule.HEAPU8[writeCountsPtr + addr];

      // Get memory content for background brightness
      let memValue = 0;
      if (mainRAMPtr && addr < 0xC000) {
        memValue = wasmModule.HEAPU8[mainRAMPtr + addr];
      } else if (systemROMPtr && addr >= 0xC000) {
        memValue = wasmModule.HEAPU8[systemROMPtr + (addr - 0xC000)];
      }

      const pixelIndex = addr * 4;
      const bgLevel = memValue >> 4; // 0-15 background level

      let r = bgLevel,
        g = bgLevel,
        b = bgLevel;

      switch (this.viewMode) {
        case "reads":
          b = Math.min(255, bgLevel + readCount);
          break;
        case "writes":
          r = Math.min(255, bgLevel + writeCount);
          break;
        case "combined":
        default:
          r = Math.min(255, bgLevel + writeCount);
          b = Math.min(255, bgLevel + readCount);
          if (readCount > 0 && writeCount > 0) {
            g = Math.min(255, bgLevel + (Math.min(readCount, writeCount) >> 1));
          }
          break;
      }

      data[pixelIndex] = r;
      data[pixelIndex + 1] = g;
      data[pixelIndex + 2] = b;
      data[pixelIndex + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  updateCanvasAux(imageData, ctx, readCountsPtr, writeCountsPtr, auxRAMPtr) {
    const data = imageData.data;
    const wasmModule = this.wasmModule;

    for (let addr = 0; addr < 65536; addr++) {
      // Note: tracking counts are for the main address space
      // Aux memory accesses happen when RAMRD/RAMWRT are set
      // For now, show aux memory content with dimmed tracking overlay
      const readCount = wasmModule.HEAPU8[readCountsPtr + addr];
      const writeCount = wasmModule.HEAPU8[writeCountsPtr + addr];

      // Get aux memory content
      let memValue = 0;
      if (auxRAMPtr) {
        memValue = wasmModule.HEAPU8[auxRAMPtr + addr];
      }

      const pixelIndex = addr * 4;
      const bgLevel = memValue >> 4;

      let r = bgLevel,
        g = bgLevel,
        b = bgLevel;

      // Apply tracking overlay (dimmed since tracking is address-based, not bank-specific)
      switch (this.viewMode) {
        case "reads":
          b = Math.min(255, bgLevel + (readCount >> 1));
          break;
        case "writes":
          r = Math.min(255, bgLevel + (writeCount >> 1));
          break;
        case "combined":
        default:
          r = Math.min(255, bgLevel + (writeCount >> 1));
          b = Math.min(255, bgLevel + (readCount >> 1));
          if (readCount > 0 && writeCount > 0) {
            g = Math.min(255, bgLevel + (Math.min(readCount, writeCount) >> 2));
          }
          break;
      }

      data[pixelIndex] = r;
      data[pixelIndex + 1] = g;
      data[pixelIndex + 2] = b;
      data[pixelIndex + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  setJumpCallback(callback) {
    this.onJumpToAddress = callback;
  }

  hide() {
    if (this.isTracking) {
      this.isTracking = false;
      this.toggleBtn.textContent = "Start";
      this.toggleBtn.classList.remove("active");
      this.wasmModule._enableMemoryTracking(false);
    }
    super.hide();
  }
}
