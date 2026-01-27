/**
 * MemoryBrowserWindow - Scrollable 64KB memory viewer
 */
import { BaseWindow } from "../windows/base-window.js";

// Memory region definitions for Apple II
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

// Quick jump buttons
const QUICK_JUMPS = [
  { label: "ZP", addr: 0x0000, title: "Zero Page ($0000)" },
  { label: "Stack", addr: 0x0100, title: "Stack ($0100)" },
  { label: "Text1", addr: 0x0400, title: "Text Page 1 ($0400)" },
  { label: "Text2", addr: 0x0800, title: "Text Page 2 ($0800)" },
  { label: "HiRes1", addr: 0x2000, title: "HiRes Page 1 ($2000)" },
  { label: "HiRes2", addr: 0x4000, title: "HiRes Page 2 ($4000)" },
  { label: "I/O", addr: 0xc000, title: "I/O Space ($C000)" },
  { label: "ROM", addr: 0xd000, title: "ROM / Language Card ($D000)" },
  { label: "Vectors", addr: 0xfff0, title: "Vectors ($FFF0)" },
  { label: "DOS", addr: 0x9600, title: "DOS 3.3 ($9600)" },
];

export class MemoryBrowserWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "memory-browser",
      title: "Memory Browser",
      defaultWidth: 520,
      defaultHeight: 520,
      minWidth: 400,
      minHeight: 300,
      defaultPosition: { x: 150, y: 150 },
    });
    this.wasmModule = wasmModule;
    this.baseAddress = 0x0000;
    this.bytesPerRow = 16;
    this.visibleRows = 28;
    this.previousMemory = new Uint8Array(65536);
    this.changedBytes = new Set();
    this.changeTimestamps = new Map();
    this.editingAddress = null;
  }

  renderContent() {
    return `
      <div class="mem-browser-toolbar">
        <div class="mem-browser-jumps">
          ${QUICK_JUMPS.map(
            (j) =>
              `<button class="mem-jump-btn" data-addr="${j.addr}" title="${j.title}">${j.label}</button>`
          ).join("")}
        </div>
        <div class="mem-browser-nav">
          <input type="text" class="mem-addr-input" placeholder="Address" maxlength="4" />
          <button class="mem-go-btn" title="Go to address">Go</button>
          <input type="text" class="mem-search-input" placeholder="Search hex" maxlength="16" />
          <button class="mem-search-btn" title="Search for bytes">Find</button>
        </div>
      </div>
      <div class="mem-browser-region">Region: <span class="mem-region-name">Zero Page</span></div>
      <div class="mem-browser-header">
        <span class="mem-addr-col">Addr</span>
        ${Array.from({ length: 16 }, (_, i) => `<span class="mem-hex-hdr">${i.toString(16).toUpperCase()}</span>`).join("")}
        <span class="mem-ascii-hdr">ASCII</span>
      </div>
      <div class="mem-browser-scroll-container">
        <div class="mem-browser-content"></div>
        <div class="mem-browser-scrollbar">
          <div class="mem-scrollbar-track">
            <div class="mem-scrollbar-thumb"></div>
          </div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    this.contentDiv = this.contentElement.querySelector(".mem-browser-content");
    this.scrollContainer = this.contentElement.querySelector(
      ".mem-browser-scroll-container"
    );
    this.scrollbarThumb = this.contentElement.querySelector(
      ".mem-scrollbar-thumb"
    );
    this.regionNameSpan =
      this.contentElement.querySelector(".mem-region-name");
    this.addrInput = this.contentElement.querySelector(".mem-addr-input");
    this.searchInput = this.contentElement.querySelector(".mem-search-input");

    this.setupScrolling();
    this.setupContentEventListeners();
  }

  setupScrolling() {
    // Mouse wheel scrolling - explicitly non-passive since we need preventDefault()
    this.scrollContainer.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * this.bytesPerRow * 4;
      this.scrollToAddress(this.baseAddress + delta);
    }, { passive: false });

    // Scrollbar dragging
    let isDragging = false;
    let dragStartY = 0;
    let dragStartAddr = 0;

    this.scrollbarThumb.addEventListener("mousedown", (e) => {
      isDragging = true;
      dragStartY = e.clientY;
      dragStartAddr = this.baseAddress;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const trackHeight =
        this.scrollbarThumb.parentElement.offsetHeight -
        this.scrollbarThumb.offsetHeight;
      const deltaY = e.clientY - dragStartY;
      const maxAddress = 0x10000 - this.bytesPerRow * this.visibleRows;
      const newAddr = Math.round(
        dragStartAddr + (deltaY / trackHeight) * maxAddress
      );
      this.scrollToAddress(newAddr);
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });

    // Track click
    this.scrollbarThumb.parentElement.addEventListener("click", (e) => {
      if (e.target === this.scrollbarThumb) return;
      const rect = this.scrollbarThumb.parentElement.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const trackHeight = rect.height;
      const maxAddress = 0x10000 - this.bytesPerRow * this.visibleRows;
      const newAddr = Math.round((clickY / trackHeight) * maxAddress);
      this.scrollToAddress(newAddr);
    });
  }

  setupContentEventListeners() {
    // Quick jump buttons
    this.contentElement.querySelectorAll(".mem-jump-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const addr = parseInt(btn.dataset.addr, 10);
        this.scrollToAddress(addr);
      });
    });

    // Go button
    this.contentElement
      .querySelector(".mem-go-btn")
      .addEventListener("click", () => {
        this.goToAddress();
      });

    // Address input enter key
    this.addrInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.goToAddress();
      }
    });

    // Search button
    this.contentElement
      .querySelector(".mem-search-btn")
      .addEventListener("click", () => {
        this.searchBytes();
      });

    // Search input enter key
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.searchBytes();
      }
    });

    // Byte click to edit
    this.contentDiv.addEventListener("click", (e) => {
      const byteSpan = e.target.closest(".mem-byte");
      if (byteSpan && byteSpan.dataset.addr) {
        this.startEditByte(parseInt(byteSpan.dataset.addr, 10));
      }
    });
  }

  goToAddress() {
    const input = this.addrInput.value.trim();
    let addr = parseInt(input, 16);
    if (isNaN(addr)) {
      addr = parseInt(input, 10);
    }
    if (!isNaN(addr) && addr >= 0 && addr <= 0xffff) {
      this.scrollToAddress(addr);
    }
  }

  searchBytes() {
    const input = this.searchInput.value.trim().replace(/\s/g, "");
    if (input.length === 0 || input.length % 2 !== 0) return;

    const bytes = [];
    for (let i = 0; i < input.length; i += 2) {
      const byte = parseInt(input.substr(i, 2), 16);
      if (isNaN(byte)) return;
      bytes.push(byte);
    }

    // Search from current position + 1
    const startAddr = this.baseAddress + 1;
    for (let i = 0; i < 65536; i++) {
      const addr = (startAddr + i) & 0xffff;
      let found = true;
      for (let j = 0; j < bytes.length; j++) {
        if (this.wasmModule._peekMemory((addr + j) & 0xffff) !== bytes[j]) {
          found = false;
          break;
        }
      }
      if (found) {
        this.scrollToAddress(addr);
        return;
      }
    }
  }

  scrollToAddress(addr) {
    // Align to row boundary and clamp
    addr = Math.floor(addr / this.bytesPerRow) * this.bytesPerRow;
    addr = Math.max(0, Math.min(addr, 0x10000 - this.bytesPerRow * this.visibleRows));
    this.baseAddress = addr;
    this.updateScrollbar();
    this.updateRegionName();
  }

  updateScrollbar() {
    const maxAddress = 0x10000 - this.bytesPerRow * this.visibleRows;
    const thumbHeight = Math.max(
      20,
      (this.visibleRows * this.bytesPerRow * 100) / 65536
    );
    const thumbPosition = (this.baseAddress / maxAddress) * (100 - thumbHeight);
    this.scrollbarThumb.style.height = `${thumbHeight}%`;
    this.scrollbarThumb.style.top = `${thumbPosition}%`;
  }

  updateRegionName() {
    const addr = this.baseAddress;
    for (const region of MEMORY_REGIONS) {
      if (addr >= region.start && addr <= region.end) {
        this.regionNameSpan.textContent = region.name;
        return;
      }
    }
    this.regionNameSpan.textContent = "Unknown";
  }

  startEditByte(addr) {
    const currentValue = this.wasmModule._peekMemory(addr);
    const newValueStr = prompt(
      `Edit $${this.formatHex(addr, 4)}\nCurrent value: $${this.formatHex(currentValue, 2)}`,
      this.formatHex(currentValue, 2)
    );
    if (newValueStr !== null) {
      const newValue = parseInt(newValueStr, 16);
      if (!isNaN(newValue) && newValue >= 0 && newValue <= 255) {
        this.wasmModule._writeMemory(addr, newValue);
      }
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
    if (!this.isVisible || !this.contentDiv) return;

    const now = Date.now();
    const fadeTime = 1000; // Changed bytes highlight fade time

    // Build the memory view
    let html = "";
    for (let row = 0; row < this.visibleRows; row++) {
      const rowAddr = this.baseAddress + row * this.bytesPerRow;
      if (rowAddr >= 0x10000) break;

      html += `<div class="mem-row"><span class="mem-addr">${this.formatAddr(rowAddr)}</span>`;

      // Hex bytes
      for (let col = 0; col < this.bytesPerRow; col++) {
        const addr = rowAddr + col;
        if (addr >= 0x10000) break;

        const value = wasmModule._peekMemory(addr);
        const prevValue = this.previousMemory[addr];

        // Track changes
        if (value !== prevValue) {
          this.changedBytes.add(addr);
          this.changeTimestamps.set(addr, now);
          this.previousMemory[addr] = value;
        }

        // Check if recently changed
        let changeClass = "";
        if (this.changeTimestamps.has(addr)) {
          const elapsed = now - this.changeTimestamps.get(addr);
          if (elapsed < fadeTime) {
            changeClass = " changed";
          } else {
            this.changeTimestamps.delete(addr);
          }
        }

        const nonZeroClass = value !== 0 ? " non-zero" : "";
        html += `<span class="mem-byte${changeClass}${nonZeroClass}" data-addr="${addr}">${this.formatHex(value, 2)}</span>`;
      }

      // ASCII representation
      html += '<span class="mem-ascii">';
      for (let col = 0; col < this.bytesPerRow; col++) {
        const addr = rowAddr + col;
        if (addr >= 0x10000) break;

        const value = wasmModule._peekMemory(addr);
        const char =
          value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : ".";
        html += char;
      }
      html += "</span></div>";
    }

    this.contentDiv.innerHTML = html;
  }

  // Allow external code to jump to a specific address
  jumpToAddress(addr) {
    this.scrollToAddress(addr);
  }
}
