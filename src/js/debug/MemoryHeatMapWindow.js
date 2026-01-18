/**
 * MemoryHeatMapWindow - 256x256 visualization of memory access patterns
 */
import { DebugWindow } from "./DebugWindow.js";

// Memory region labels for hover info
const MEMORY_REGIONS = [
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

export class MemoryHeatMapWindow extends DebugWindow {
  constructor(wasmModule) {
    super({
      id: "memory-heatmap",
      title: "Memory Heat Map",
      defaultWidth: 340,
      defaultHeight: 400,
      minWidth: 300,
      minHeight: 350,
      defaultPosition: { x: 200, y: 200 },
    });
    this.wasmModule = wasmModule;
    this.isTracking = false;
    this.viewMode = "combined"; // combined, reads, writes
    this.decayEnabled = false;
    this.onJumpToAddress = null; // Callback for Memory Browser integration
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
      <div class="heatmap-canvas-container">
        <canvas class="heatmap-canvas" width="256" height="256"></canvas>
        <div class="heatmap-tooltip"></div>
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
    this.canvas = this.contentElement.querySelector(".heatmap-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.tooltip = this.contentElement.querySelector(".heatmap-tooltip");
    this.toggleBtn = this.contentElement.querySelector(".heatmap-toggle-btn");
    this.modeSelect = this.contentElement.querySelector(".heatmap-mode-select");
    this.decayCheck = this.contentElement.querySelector(".heatmap-decay-check");
    this.addrSpan = this.contentElement.querySelector(".heatmap-addr");
    this.regionSpan = this.contentElement.querySelector(".heatmap-region");
    this.countsSpan = this.contentElement.querySelector(".heatmap-counts");

    // Pre-allocate image data
    this.imageData = this.ctx.createImageData(256, 256);

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

    // Canvas hover for address info
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor(
        ((e.clientX - rect.left) / rect.width) * 256
      );
      const y = Math.floor(
        ((e.clientY - rect.top) / rect.height) * 256
      );
      const addr = y * 256 + x;
      this.showAddressInfo(addr);
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.addrSpan.textContent = "$----";
      this.regionSpan.textContent = "";
      this.countsSpan.textContent = "";
    });

    // Click to jump to Memory Browser
    this.canvas.addEventListener("click", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor(
        ((e.clientX - rect.left) / rect.width) * 256
      );
      const y = Math.floor(
        ((e.clientY - rect.top) / rect.height) * 256
      );
      const addr = y * 256 + x;
      if (this.onJumpToAddress) {
        this.onJumpToAddress(addr);
      }
    });
  }

  showAddressInfo(addr) {
    if (addr < 0 || addr > 0xffff) return;

    this.addrSpan.textContent = `$${this.formatHex(addr, 4)}`;

    // Find region
    for (const region of MEMORY_REGIONS) {
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

  getRegionForAddress(addr) {
    for (const region of MEMORY_REGIONS) {
      if (addr >= region.start && addr <= region.end) {
        return region.name;
      }
    }
    return "Unknown";
  }

  update(wasmModule) {
    if (!this.isVisible || !this.canvas) return;

    const readCountsPtr = wasmModule._getMemoryReadCounts();
    const writeCountsPtr = wasmModule._getMemoryWriteCounts();

    if (!readCountsPtr || !writeCountsPtr) return;

    const data = this.imageData.data;

    for (let addr = 0; addr < 65536; addr++) {
      const readCount = wasmModule.HEAPU8[readCountsPtr + addr];
      const writeCount = wasmModule.HEAPU8[writeCountsPtr + addr];

      const pixelIndex = addr * 4;

      let r = 0,
        g = 0,
        b = 0;

      switch (this.viewMode) {
        case "reads":
          // Blue for reads
          b = readCount;
          break;
        case "writes":
          // Red for writes
          r = writeCount;
          break;
        case "combined":
        default:
          // Blue for reads, red for writes, purple for both
          r = writeCount;
          b = readCount;
          // Add some green when both are active for purple tint
          if (readCount > 0 && writeCount > 0) {
            g = Math.min(readCount, writeCount) >> 1;
          }
          break;
      }

      data[pixelIndex] = r;
      data[pixelIndex + 1] = g;
      data[pixelIndex + 2] = b;
      data[pixelIndex + 3] = 255; // Alpha
    }

    this.ctx.putImageData(this.imageData, 0, 0);

    // Apply decay if enabled (reduces counts over time for real-time visualization)
    if (this.decayEnabled && this.isTracking) {
      wasmModule._decayMemoryTracking(2); // Decay by 2 each frame
    }
  }

  // Set callback for integration with Memory Browser
  setJumpCallback(callback) {
    this.onJumpToAddress = callback;
  }

  hide() {
    // Stop tracking when window is closed
    if (this.isTracking) {
      this.isTracking = false;
      this.toggleBtn.textContent = "Start";
      this.toggleBtn.classList.remove("active");
      this.wasmModule._enableMemoryTracking(false);
    }
    super.hide();
  }
}
