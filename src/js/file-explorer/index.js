/*
 * index.js - File explorer window for browsing Apple II disk images
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * FileExplorerWindow - Browse and view contents of Apple II disk images
 * Extends BaseWindow to inherit drag/resize/show/hide functionality
 */

import { BaseWindow } from "../windows/base-window.js";
import {
  formatFileContents,
  formatFileSize,
  formatHexDump,
  formatMerlinFile,
  checkIsMerlinFile,
  setFileViewerWasm,
} from "./file-viewer.js";
import { disassemble, setWasmModule } from "./disassembler.js";
import { escapeHtml } from "../utils/string-utils.js";

// File type description tables (UI display only - parsing logic is in C++)
const DOS33_FILE_DESCRIPTIONS = {
  0x00: "Text",
  0x01: "Integer BASIC",
  0x02: "Applesoft BASIC",
  0x04: "Binary",
  0x08: "Type S",
  0x10: "Relocatable",
  0x20: "Type a",
  0x40: "Type b",
};

const PASCAL_FILE_DESCRIPTIONS = {
  0: "Volume",
  1: "Bad Blocks",
  2: "Code",
  3: "Text",
  4: "Info",
  5: "Data",
  6: "Graphics",
  7: "Photo",
  8: "Secure Dir",
};

const PRODOS_FILE_DESCRIPTIONS = {
  0x00: "Unknown",
  0x01: "Bad Block",
  0x04: "Text",
  0x06: "Binary",
  0x0f: "Directory",
  0x19: "AppleWorks DB",
  0x1a: "AppleWorks WP",
  0x1b: "AppleWorks SS",
  0xb0: "Source Code",
  0xb3: "GS/OS App",
  0xbf: "Document",
  0xc0: "Packed HiRes",
  0xc1: "HiRes Picture",
  0xe0: "ShrinkIt Archive",
  0xef: "Pascal",
  0xf0: "Command",
  0xfa: "Integer BASIC",
  0xfb: "Integer Vars",
  0xfc: "Applesoft BASIC",
  0xfd: "Applesoft Vars",
  0xfe: "Relocatable",
  0xff: "System",
};

export class FileExplorerWindow extends BaseWindow {
  constructor(wasmModule) {
    // Configure BaseWindow with file explorer specific settings
    super({
      id: "file-explorer-window",
      title: "File Explorer",
      minWidth: 400,
      minHeight: 300,
      defaultWidth: 700,
      defaultHeight: 500,
      defaultPosition: { x: 150, y: 100 },
      storageKey: "a2e-file-explorer",
    });

    this.wasmModule = wasmModule;

    // Initialize the disassembler and file viewer with the WASM module
    setWasmModule(wasmModule);
    setFileViewerWasm(wasmModule);

    // Content state
    this.sourceType = "floppy"; // 'floppy' or 'hd'
    this.selectedDrive = 0;
    this.catalog = [];
    this.selectedFile = null;
    this.diskDataPtr = 0; // Pointer to disk data in WASM heap
    this.diskDataSize = 0; // Size of disk data
    this.diskFormat = null; // 'dos33' | 'prodos' | 'pascal' | null
    this.currentPath = ""; // Current directory path for ProDOS navigation
    this.directoryStack = []; // Stack of {path, startBlock} for HD navigation
    this.binaryViewMode = "asm"; // 'asm', 'hex', or 'merlin'
    this.textViewMode = "text"; // 'text' or 'merlin'
    this.currentFileData = null; // Cache for current file data
    this.basicLineNumToIndex = null; // For BASIC GOTO/GOSUB navigation
    this.basicOriginalHtml = null; // Original unhighlighted BASIC content

    // Hex view dynamic column state
    this.hexDisplayState = null; // { data, baseAddress, maxBytes }
    this.hexResizeObserver = null;
    this.hexBytesPerRow = 16;

    // Bind handlers
    this.handleBasicLineClick = this.handleBasicLineClick.bind(this);
  }

  /**
   * Override renderContent to provide file explorer specific content
   */
  renderContent() {
    return `
      <div class="fe-toolbar">
        <div class="fe-source-selector hidden">
          <button class="fe-source-btn active" data-source="floppy">Floppy</button>
          <button class="fe-source-btn" data-source="hd">HD</button>
        </div>
        <div class="fe-drive-selector">
          <label>Drive:</label>
          <button class="fe-drive-btn active" data-drive="0">1</button>
          <button class="fe-drive-btn" data-drive="1">2</button>
        </div>
        <button class="fe-refresh-btn" title="Refresh catalog">Refresh</button>
        <span class="fe-disk-info"></span>
      </div>
      <div class="fe-content">
        <div class="fe-catalog-panel">
          <div class="fe-panel-header">Catalog</div>
          <div class="fe-path-bar hidden"></div>
          <div class="fe-catalog-list"></div>
        </div>
        <div class="fe-file-panel">
          <div class="fe-panel-header">
            <span class="fe-file-title">Select a file</span>
            <span class="fe-file-info"></span>
            <div class="fe-view-toggle hidden">
              <button class="fe-view-btn active" data-view="asm" title="DISASSEMBLE">Disassemble</button>
              <button class="fe-view-btn" data-view="hex" title="Hex dump">HEX</button>
              <button class="fe-view-btn" data-view="merlin" title="Merlin source">MERLIN</button>
            </div>
            <div class="fe-text-view-toggle hidden">
              <button class="fe-view-btn active" data-view="text" title="Plain text">TEXT</button>
              <button class="fe-view-btn" data-view="merlin" title="Merlin source">MERLIN</button>
            </div>
          </div>
          <div class="fe-asm-legend hidden">
            <span class="dis-branch">Jump/Branch</span>
            <span class="dis-load">Load/Store</span>
            <span class="dis-math">Math/Logic</span>
            <span class="dis-stack">Stack/Reg</span>
            <span class="dis-address">Address</span>
            <span class="dis-immediate">Immediate</span>
            <span class="dis-data">Data</span>
          </div>
          <div class="fe-hex-legend hidden">
            <span class="hex-legend-printable">Printable</span>
            <span class="hex-legend-control">Control</span>
            <span class="hex-legend-highbit">High Bit</span>
            <span class="hex-legend-zero">Zero</span>
          </div>
          <div class="fe-file-content"></div>
        </div>
      </div>
    `;
  }

  /**
   * Called after the window is created - set up file explorer specific event listeners
   */
  onContentRendered() {
    // Load saved settings
    this.loadSettings();

    // Source selector (Floppy / HD)
    const sourceSelector = this.element.querySelector(".fe-source-selector");
    const sourceBtns = this.element.querySelectorAll(".fe-source-btn");
    sourceBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const newSource = btn.dataset.source;
        if (newSource === this.sourceType) return;
        sourceBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.sourceType = newSource;
        this.selectedDrive = 0;
        this.updateDriveButtons();
        this.loadDisk();
      });
    });

    // Drive selector
    const driveBtns = this.element.querySelectorAll(".fe-drive-btn");
    driveBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        driveBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.selectedDrive = parseInt(btn.dataset.drive, 10);
        this.loadDisk();
      });
    });

    // Refresh button
    const refreshBtn = this.element.querySelector(".fe-refresh-btn");
    refreshBtn.addEventListener("click", () => this.loadDisk());

    // Catalog item selection
    const catalogList = this.element.querySelector(".fe-catalog-list");
    catalogList.addEventListener("click", (e) => {
      const item = e.target.closest(".fe-catalog-item");
      if (item) {
        // Check for parent directory navigation
        if (item.dataset.action === "parent") {
          const parts = this.currentPath.split("/");
          parts.pop();
          this.navigateToPath(parts.join("/"));
          return;
        }
        const index = parseInt(item.dataset.index, 10);
        if (!isNaN(index)) {
          this.selectFile(index);
        }
      }
    });

    // Path bar breadcrumb navigation (ProDOS)
    const pathBar = this.element.querySelector(".fe-path-bar");
    pathBar.addEventListener("click", (e) => {
      const pathItem = e.target.closest(".fe-path-item");
      if (pathItem && !pathItem.matches(":last-child")) {
        const path = pathItem.dataset.path || "";
        this.navigateToPath(path);
      }
    });

    // View toggle for binary files
    const viewToggle = this.element.querySelector(".fe-view-toggle");
    viewToggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".fe-view-btn");
      if (btn) {
        const view = btn.dataset.view;
        if (view !== this.binaryViewMode) {
          this._binaryViewManuallySet = true;
          this.binaryViewMode = view;
          viewToggle
            .querySelectorAll(".fe-view-btn")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.showFileContents();
        }
      }
    });

    // View toggle for text files (TEXT/MERLIN)
    const textViewToggle = this.element.querySelector(".fe-text-view-toggle");
    textViewToggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".fe-view-btn");
      if (btn) {
        const view = btn.dataset.view;
        if (view !== this.textViewMode) {
          this._textViewManuallySet = true;
          this.textViewMode = view;
          textViewToggle
            .querySelectorAll(".fe-view-btn")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.showFileContents();
        }
      }
    });

    // Resize observer for dynamic hex column count
    this.setupHexResizeObserver();
  }

  /**
   * Override show to also load the disk
   */
  show() {
    super.show();
    this.updateSourceSelector();
    this.updateDriveButtons();
    this.loadDisk();
  }

  /**
   * Show the source selector only when SmartPort card is installed
   */
  updateSourceSelector() {
    const sourceSelector = this.element.querySelector(".fe-source-selector");
    const wasm = this.wasmModule;
    const hasSmartPort = wasm._isSmartPortCardInstalled && wasm._isSmartPortCardInstalled();
    sourceSelector.classList.toggle("hidden", !hasSmartPort);
    // Sync button active state
    sourceSelector.querySelectorAll(".fe-source-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.source === this.sourceType);
    });
  }

  /**
   * Update drive button labels based on source type
   */
  updateDriveButtons() {
    const driveBtns = this.element.querySelectorAll(".fe-drive-btn");
    const label = this.element.querySelector(".fe-drive-selector label");
    if (this.sourceType === "hd") {
      label.textContent = "Device:";
    } else {
      label.textContent = "Drive:";
    }
    driveBtns.forEach((btn) => {
      btn.classList.toggle("active", parseInt(btn.dataset.drive, 10) === this.selectedDrive);
    });
  }

  /**
   * Open the file explorer showing a specific hard drive device
   */
  showHardDrive(deviceNum) {
    this.sourceType = "hd";
    this.selectedDrive = deviceNum;
    this.show();
  }

  /**
   * Open the file explorer showing a specific floppy drive
   */
  showFloppyDisk(driveNum) {
    this.sourceType = "floppy";
    this.selectedDrive = driveNum;
    this.show();
  }

  loadDisk() {
    if (this.sourceType === "hd") {
      this.loadHardDrive();
      return;
    }
    this.loadFloppyDisk();
  }

  loadHardDrive() {
    const wasm = this.wasmModule;
    const diskInfo = this.element.querySelector(".fe-disk-info");
    const catalogList = this.element.querySelector(".fe-catalog-list");

    // Check if HD image is inserted
    if (!wasm._isSmartPortImageInserted(this.selectedDrive)) {
      diskInfo.textContent = "No image inserted";
      catalogList.innerHTML = '<div class="fe-empty">No image in device</div>';
      this.catalog = [];
      this.diskDataPtr = 0;
      this.diskDataSize = 0;
      this.diskFormat = null;
      this.clearFileView();
      return;
    }

    // Get block data pointer (raw ProDOS blocks, skipping any 2IMG header)
    const sizePtr = wasm._malloc(4);
    const dataPtr = wasm._getSmartPortBlockData(this.selectedDrive, sizePtr);
    const size = new Uint32Array(wasm.HEAPU8.buffer, sizePtr, 1)[0];
    wasm._free(sizePtr);

    if (!dataPtr || size === 0) {
      const filenamePtr = wasm._getSmartPortImageFilename(this.selectedDrive);
      const filename = filenamePtr ? wasm.UTF8ToString(filenamePtr) : "Hard Drive";
      diskInfo.textContent = filename;
      catalogList.innerHTML =
        '<div class="fe-empty">Cannot read block data</div>';
      this.catalog = [];
      this.diskDataPtr = 0;
      this.diskDataSize = 0;
      this.diskFormat = null;
      this.clearFileView();
      return;
    }

    this.diskDataPtr = dataPtr;
    this.diskDataSize = size;

    // Get filename
    const filenamePtr = wasm._getSmartPortImageFilename(this.selectedDrive);
    const filename = filenamePtr ? wasm.UTF8ToString(filenamePtr) : "Unknown";

    // HD images - try ProDOS first, then Pascal
    if (wasm._isProDOSFormat(dataPtr, size)) {
      this.diskFormat = "prodos";
      wasm._getProDOSVolumeInfo(dataPtr, size);
      const volumeName = wasm.UTF8ToString(wasm._getProDOSVolumeName());
      this.volumeInfo = { volumeName };
      diskInfo.textContent = `${filename} (ProDOS: ${volumeName})`;

      this.currentPath = "";
      this.directoryStack = [];
      this.loadProDOSDirectory(2, "");
    } else if (wasm._isPascalFormat(dataPtr, size)) {
      this.diskFormat = "pascal";
      wasm._getPascalVolumeInfo(dataPtr, size);
      const volumeName = wasm.UTF8ToString(wasm._getPascalVolumeName());
      this.volumeInfo = { volumeName };
      diskInfo.textContent = `${filename} (Pascal: ${volumeName})`;

      this.loadPascalCatalog();
    } else {
      this.diskFormat = null;
      diskInfo.textContent = `${filename} (Unknown format)`;
      catalogList.innerHTML = '<div class="fe-empty">Not a ProDOS volume</div>';
      this.catalog = [];
      this.clearFileView();
      return;
    }

    this.selectedFile = null;
    this.clearFileView();
  }

  loadFloppyDisk() {
    const wasm = this.wasmModule;
    const diskInfo = this.element.querySelector(".fe-disk-info");
    const catalogList = this.element.querySelector(".fe-catalog-list");

    // Check if disk is inserted
    if (!wasm._isDiskInserted(this.selectedDrive)) {
      diskInfo.textContent = "No disk inserted";
      catalogList.innerHTML = '<div class="fe-empty">No disk in drive</div>';
      this.catalog = [];
      this.diskDataPtr = 0;
      this.diskDataSize = 0;
      this.diskFormat = null;
      this.clearFileView();
      return;
    }

    // Get disk sector data pointer (stays in WASM heap)
    const sizePtr = wasm._malloc(4);
    const dataPtr = wasm._getDiskSectorData(this.selectedDrive, sizePtr);
    const size = new Uint32Array(wasm.HEAPU8.buffer, sizePtr, 1)[0];
    wasm._free(sizePtr);

    if (!dataPtr || size === 0) {
      const filenamePtr = wasm._getDiskFilename(this.selectedDrive);
      const filename = filenamePtr ? wasm.UTF8ToString(filenamePtr) : "Disk";
      diskInfo.textContent = filename;
      catalogList.innerHTML =
        '<div class="fe-empty">Cannot read sector data<br><small>Copy-protected or non-standard disk format</small></div>';
      this.catalog = [];
      this.diskDataPtr = 0;
      this.diskDataSize = 0;
      this.diskFormat = null;
      this.clearFileView();
      return;
    }

    this.diskDataPtr = dataPtr;
    this.diskDataSize = size;

    // Get filename
    const filenamePtr = wasm._getDiskFilename(this.selectedDrive);
    const filename = filenamePtr ? wasm.UTF8ToString(filenamePtr) : "Unknown";

    // Check disk format using WASM - try ProDOS first, then DOS 3.3
    if (wasm._isProDOSFormat(dataPtr, size)) {
      this.diskFormat = "prodos";
      wasm._getProDOSVolumeInfo(dataPtr, size);
      const volumeName = wasm.UTF8ToString(wasm._getProDOSVolumeName());
      this.volumeInfo = { volumeName };
      diskInfo.textContent = `${filename} (ProDOS: ${volumeName})`;

      // Read ProDOS catalog via WASM
      const count = wasm._getProDOSCatalog(dataPtr, size);
      this.catalog = [];
      for (let i = 0; i < count; i++) {
        this.catalog.push({
          filename: wasm.UTF8ToString(wasm._getProDOSEntryFilename(i)),
          path: wasm.UTF8ToString(wasm._getProDOSEntryPath(i)),
          fileType: wasm._getProDOSEntryFileType(i),
          fileTypeName: wasm.UTF8ToString(wasm._getProDOSEntryFileTypeName(i)),
          fileTypeDescription:
            PRODOS_FILE_DESCRIPTIONS[wasm._getProDOSEntryFileType(i)] ||
            "Unknown",
          storageType: wasm._getProDOSEntryStorageType(i),
          eof: wasm._getProDOSEntryEOF(i),
          auxType: wasm._getProDOSEntryAuxType(i),
          blocksUsed: wasm._getProDOSEntryBlocksUsed(i),
          isLocked: wasm._getProDOSEntryIsLocked(i),
          isDirectory: wasm._getProDOSEntryIsDirectory(i),
          _wasmIndex: i,
        });
      }

      // Reset to root directory and render
      this.currentPath = "";
      this.renderProDOSCatalog();
    } else if (wasm._isPascalFormat(dataPtr, size)) {
      this.diskFormat = "pascal";
      wasm._getPascalVolumeInfo(dataPtr, size);
      const volumeName = wasm.UTF8ToString(wasm._getPascalVolumeName());
      this.volumeInfo = { volumeName };
      diskInfo.textContent = `${filename} (Pascal: ${volumeName})`;

      this.loadPascalCatalog();
    } else if (wasm._isDOS33Format(dataPtr, size)) {
      this.diskFormat = "dos33";
      diskInfo.textContent = `${filename} (DOS 3.3)`;

      // Read DOS 3.3 catalog via WASM
      const count = wasm._getDOS33Catalog(dataPtr, size);
      this.catalog = [];
      for (let i = 0; i < count; i++) {
        this.catalog.push({
          filename: wasm.UTF8ToString(wasm._getDOS33EntryFilename(i)),
          fileType: wasm._getDOS33EntryFileType(i),
          fileTypeName: wasm.UTF8ToString(wasm._getDOS33EntryFileTypeName(i)),
          fileTypeDescription:
            DOS33_FILE_DESCRIPTIONS[wasm._getDOS33EntryFileType(i)] ||
            "Unknown",
          isLocked: wasm._getDOS33EntryIsLocked(i),
          sectorCount: wasm._getDOS33EntrySectorCount(i),
          _wasmIndex: i,
        });
      }

      // Render catalog
      if (this.catalog.length === 0) {
        catalogList.innerHTML = '<div class="fe-empty">Disk is empty</div>';
      } else {
        catalogList.innerHTML = this.catalog
          .map(
            (entry, index) => `
          <div class="fe-catalog-item" data-index="${index}">
            <span class="fe-file-type ${entry.isLocked ? "locked" : ""}">${entry.isLocked ? "*" : " "}${entry.fileTypeName}</span>
            <span class="fe-file-name">${escapeHtml(entry.filename)}</span>
            <span class="fe-file-sectors">${entry.sectorCount}</span>
          </div>
        `,
          )
          .join("");
      }
    } else {
      this.diskFormat = null;
      diskInfo.textContent = `${filename} (Unknown format)`;
      catalogList.innerHTML = '<div class="fe-empty">Unknown disk format</div>';
      this.catalog = [];
      this.clearFileView();
      return;
    }

    this.selectedFile = null;
    this.clearFileView();
  }

  /**
   * Load a single ProDOS directory on-demand (for HD mode).
   * For floppies, the full catalog is small enough to load at once.
   */
  loadProDOSDirectory(startBlock, path) {
    const wasm = this.wasmModule;
    const catalogList = this.element.querySelector(".fe-catalog-list");

    // Allocate path string in WASM heap
    const pathBytes = new TextEncoder().encode(path);
    const pathPtr = wasm._malloc(pathBytes.length + 1);
    wasm.HEAPU8.set(pathBytes, pathPtr);
    wasm.HEAPU8[pathPtr + pathBytes.length] = 0;

    const count = wasm._getProDOSDirectory(
      this.diskDataPtr,
      this.diskDataSize,
      startBlock,
      pathPtr,
    );
    wasm._free(pathPtr);

    this.catalog = [];
    for (let i = 0; i < count; i++) {
      this.catalog.push({
        filename: wasm.UTF8ToString(wasm._getProDOSEntryFilename(i)),
        path: wasm.UTF8ToString(wasm._getProDOSEntryPath(i)),
        fileType: wasm._getProDOSEntryFileType(i),
        fileTypeName: wasm.UTF8ToString(wasm._getProDOSEntryFileTypeName(i)),
        fileTypeDescription:
          PRODOS_FILE_DESCRIPTIONS[wasm._getProDOSEntryFileType(i)] ||
          "Unknown",
        storageType: wasm._getProDOSEntryStorageType(i),
        eof: wasm._getProDOSEntryEOF(i),
        auxType: wasm._getProDOSEntryAuxType(i),
        blocksUsed: wasm._getProDOSEntryBlocksUsed(i),
        isLocked: wasm._getProDOSEntryIsLocked(i),
        isDirectory: wasm._getProDOSEntryIsDirectory(i),
        keyPointer: wasm._getProDOSEntryKeyPointer(i),
        _wasmIndex: i,
      });
    }

    this.currentPath = path;
    this.selectedFile = null;
    this.clearFileView();
    this.renderProDOSCatalog();
  }

  /**
   * Load and render the Pascal catalog (flat directory, no subdirectories)
   */
  loadPascalCatalog() {
    const wasm = this.wasmModule;
    const catalogList = this.element.querySelector(".fe-catalog-list");
    const pathBar = this.element.querySelector(".fe-path-bar");

    // Hide path bar (Pascal has no subdirectories)
    pathBar.classList.add("hidden");
    pathBar.innerHTML = "";

    const count = wasm._getPascalCatalog(this.diskDataPtr, this.diskDataSize);
    this.catalog = [];
    for (let i = 0; i < count; i++) {
      this.catalog.push({
        filename: wasm.UTF8ToString(wasm._getPascalEntryFilename(i)),
        fileType: wasm._getPascalEntryFileType(i),
        fileTypeName: wasm.UTF8ToString(wasm._getPascalEntryFileTypeName(i)),
        fileTypeDescription:
          PASCAL_FILE_DESCRIPTIONS[wasm._getPascalEntryFileType(i)] || "Unknown",
        fileSize: wasm._getPascalEntryFileSize(i),
        blocksUsed: wasm._getPascalEntryBlocksUsed(i),
        _wasmIndex: i,
      });
    }

    if (this.catalog.length === 0) {
      catalogList.innerHTML = '<div class="fe-empty">Disk is empty</div>';
    } else {
      catalogList.innerHTML = this.catalog
        .map(
          (entry, index) => `
          <div class="fe-catalog-item" data-index="${index}">
            <span class="fe-file-type">${entry.fileTypeName}</span>
            <span class="fe-file-name">${escapeHtml(entry.filename)}</span>
            <span class="fe-file-sectors">${entry.blocksUsed}</span>
          </div>
        `,
        )
        .join("");
    }
  }

  /**
   * Render the ProDOS catalog for the current directory.
   * For HD mode: catalog contains only current directory entries (loaded on-demand).
   * For floppy mode: catalog contains full tree, filtered by currentPath.
   */
  renderProDOSCatalog() {
    const catalogList = this.element.querySelector(".fe-catalog-list");
    const pathBar = this.element.querySelector(".fe-path-bar");

    // Show/hide path bar based on whether we're in a subdirectory
    if (this.currentPath) {
      pathBar.classList.remove("hidden");
      const parts = this.currentPath.split("/");
      let pathHtml = `<span class="fe-path-item" data-path="">/${this.volumeInfo.volumeName}</span>`;
      let builtPath = "";
      for (const part of parts) {
        builtPath += (builtPath ? "/" : "") + part;
        pathHtml += `/<span class="fe-path-item" data-path="${escapeHtml(builtPath)}">${escapeHtml(part)}</span>`;
      }
      pathBar.innerHTML = pathHtml;
    } else {
      pathBar.classList.add("hidden");
      pathBar.innerHTML = "";
    }

    // For HD mode, catalog already contains just the current directory's entries.
    // For floppy mode, we filter the full catalog by path.
    let entriesInPath;
    if (this.sourceType === "hd") {
      entriesInPath = this.catalog;
    } else {
      entriesInPath = this.catalog.filter((entry) => {
        if (this.currentPath === "") {
          return !entry.path.includes("/");
        } else {
          const prefix = this.currentPath + "/";
          if (!entry.path.startsWith(prefix)) return false;
          const remainder = entry.path.slice(prefix.length);
          return !remainder.includes("/");
        }
      });
    }

    if (entriesInPath.length === 0) {
      catalogList.innerHTML = '<div class="fe-empty">Directory is empty</div>';
    } else {
      // Sort: directories first, then files, alphabetically
      entriesInPath.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.filename.localeCompare(b.filename);
      });

      // Add parent directory entry if in subdirectory
      let html = "";
      if (this.currentPath) {
        html += `
          <div class="fe-catalog-item fe-directory fe-parent-dir" data-action="parent">
            <span class="fe-file-type">DIR</span>
            <span class="fe-file-name">..</span>
            <span class="fe-file-sectors"></span>
          </div>
        `;
      }

      html += entriesInPath
        .map((entry, idx) => {
          const catalogIndex = this.catalog.indexOf(entry);
          const isDir = entry.isDirectory;
          return `
          <div class="fe-catalog-item ${isDir ? "fe-directory" : ""}" data-index="${catalogIndex}" ${isDir ? 'data-action="enter"' : ""}>
            <span class="fe-file-type ${entry.isLocked ? "locked" : ""}">${entry.isLocked ? "*" : " "}${isDir ? "DIR" : entry.fileTypeName}</span>
            <span class="fe-file-name">${escapeHtml(entry.filename)}${isDir ? "/" : ""}</span>
            <span class="fe-file-sectors">${entry.blocksUsed}</span>
          </div>
        `;
        })
        .join("");

      catalogList.innerHTML = html;
    }
  }

  /**
   * Navigate to a directory path (ProDOS)
   */
  navigateToPath(path) {
    if (this.sourceType === "hd") {
      // On-demand: find the startBlock for this path
      if (path === "") {
        // Going back to root
        this.directoryStack = [];
        this.loadProDOSDirectory(2, "");
      } else if (path.split("/").length < this.currentPath.split("/").length) {
        // Going up: find the matching stack entry
        const depth = path === "" ? 0 : path.split("/").length;
        this.directoryStack = this.directoryStack.slice(0, depth);
        const stackEntry = this.directoryStack[depth - 1];
        this.loadProDOSDirectory(stackEntry.startBlock, path);
      }
      // Going into a subdirectory is handled in selectFile()
      return;
    }

    // Floppy mode: just re-render with path filter
    this.currentPath = path;
    this.selectedFile = null;
    this.clearFileView();
    this.renderProDOSCatalog();
  }

  selectFile(index) {
    if (index < 0 || index >= this.catalog.length) return;

    const entry = this.catalog[index];

    // If it's a directory, navigate into it
    if (entry.isDirectory) {
      if (this.sourceType === "hd") {
        // On-demand: push current state and load subdirectory
        this.directoryStack.push({
          path: entry.path,
          startBlock: entry.keyPointer,
        });
        this.loadProDOSDirectory(entry.keyPointer, entry.path);
      } else {
        this.navigateToPath(entry.path);
      }
      return;
    }

    // Update selection UI - compare with data-index attribute since items may be filtered
    const items = this.element.querySelectorAll(".fe-catalog-item");
    items.forEach((item) => {
      const itemIndex = parseInt(item.dataset.index, 10);
      item.classList.toggle("selected", itemIndex === index);
    });

    this.selectedFile = entry;
    this._binaryViewManuallySet = false;
    this._textViewManuallySet = false;
    this.binaryViewMode = "asm";
    this.textViewMode = "text";
    this.showFileContents();
  }

  showFileContents() {
    const titleEl = this.element.querySelector(".fe-file-title");
    const infoEl = this.element.querySelector(".fe-file-info");
    const contentEl = this.element.querySelector(".fe-file-content");
    const viewToggle = this.element.querySelector(".fe-view-toggle");
    const textViewToggle = this.element.querySelector(".fe-text-view-toggle");
    const asmLegend = this.element.querySelector(".fe-asm-legend");
    const hexLegend = this.element.querySelector(".fe-hex-legend");

    if (!this.selectedFile || !this.diskDataPtr) {
      this.clearFileView();
      return;
    }

    // Display filename (with path for ProDOS)
    const displayName =
      this.diskFormat === "prodos" && this.selectedFile.path
        ? this.selectedFile.path
        : this.selectedFile.filename;
    titleEl.textContent = displayName;

    // Format file size info based on disk format
    let sizeInfo;
    if (this.diskFormat === "pascal") {
      sizeInfo = `${this.selectedFile.fileSize} bytes (${this.selectedFile.blocksUsed} blocks)`;
    } else if (this.diskFormat === "prodos") {
      sizeInfo = formatFileSize(this.selectedFile.blocksUsed * 2); // ProDOS uses 512-byte blocks
    } else {
      sizeInfo = formatFileSize(this.selectedFile.sectorCount);
    }
    infoEl.textContent = `${this.selectedFile.fileTypeDescription} - ${sizeInfo}`;

    // Determine if this is a binary file based on disk format
    // DOS 3.3: fileType 0x04 is Binary
    // ProDOS: fileType 0x06 (BIN) or 0xFF (SYS) are binary
    // Pascal: fileType 2 (CODE) is binary
    let isBinary, isText;
    if (this.diskFormat === "pascal") {
      isBinary = this.selectedFile.fileType === 2; // CODE
      isText = this.selectedFile.fileType === 3;   // TEXT
    } else if (this.diskFormat === "prodos") {
      isBinary =
        this.selectedFile.fileType === 0x06 ||
        this.selectedFile.fileType === 0xff;
      isText = this.selectedFile.fileType === 0x04;
    } else {
      isBinary = this.selectedFile.fileType === 0x04;
      isText = this.selectedFile.fileType === 0x00;
    }

    // Show/hide view toggles based on file type
    viewToggle.classList.toggle("hidden", !isBinary);
    textViewToggle.classList.toggle("hidden", !isText);

    // Sync toggle button active states with current view modes
    viewToggle.querySelectorAll(".fe-view-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === this.binaryViewMode);
    });
    textViewToggle.querySelectorAll(".fe-view-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === this.textViewMode);
    });

    // Show/hide ASM legend based on binary file and view mode
    const showAsmLegend = isBinary && this.binaryViewMode === "asm";
    asmLegend.classList.toggle("hidden", !showAsmLegend);

    // Show/hide hex legend (shown for binary hex mode; also set later for unmapped types)
    const showHexLegend = isBinary && this.binaryViewMode === "hex";
    hexLegend.classList.toggle("hidden", !showHexLegend);

    // Read file data (cache it for view switching)
    try {
      const wasm = this.wasmModule;

      // Only re-read if we don't have cached data or file changed
      const cacheKey =
        this.diskFormat === "prodos" && this.selectedFile.path
          ? this.selectedFile.path
          : this.selectedFile.filename;

      if (!this.currentFileData || this.currentFileData.filename !== cacheKey) {
        // Read file via WASM
        const wasmIdx = this.selectedFile._wasmIndex;
        let bytesRead;

        if (this.diskFormat === "pascal") {
          bytesRead = wasm._readPascalFile(
            this.diskDataPtr,
            this.diskDataSize,
            wasmIdx,
          );
          const bufPtr = wasm._getPascalFileBuffer();
          const fileData = new Uint8Array(bytesRead);
          fileData.set(new Uint8Array(wasm.HEAPU8.buffer, bufPtr, bytesRead));
          this.currentFileData = {
            filename: cacheKey,
            data: fileData,
            fileType: this.selectedFile.fileType,
          };
        } else if (this.diskFormat === "prodos") {
          bytesRead = wasm._readProDOSFile(
            this.diskDataPtr,
            this.diskDataSize,
            wasmIdx,
          );
          const bufPtr = wasm._getProDOSFileBuffer();
          const fileData = new Uint8Array(bytesRead);
          fileData.set(new Uint8Array(wasm.HEAPU8.buffer, bufPtr, bytesRead));
          this.currentFileData = {
            filename: cacheKey,
            data: fileData,
            fileType: this.selectedFile.fileType,
          };
        } else {
          bytesRead = wasm._readDOS33File(
            this.diskDataPtr,
            this.diskDataSize,
            wasmIdx,
          );
          const bufPtr = wasm._getDOS33FileBuffer();
          const fileData = new Uint8Array(bytesRead);
          fileData.set(new Uint8Array(wasm.HEAPU8.buffer, bufPtr, bytesRead));
          this.currentFileData = {
            filename: cacheKey,
            data: fileData,
            fileType: this.selectedFile.fileType,
          };
        }
      }

      const fileData = this.currentFileData.data;

      // Handle binary files with view toggle
      if (isBinary) {
        // Get binary info - ProDOS stores address in auxType, DOS 3.3 in file header
        let info;
        let displayData;

        if (this.diskFormat === "pascal") {
          info = {
            address: 0,
            length: this.selectedFile.fileSize,
          };
          displayData = fileData; // Pascal binary data doesn't have header
        } else if (this.diskFormat === "prodos") {
          info = {
            address: this.selectedFile.auxType,
            length: this.selectedFile.eof,
          };
          displayData = fileData; // ProDOS binary data doesn't have header
        } else {
          // DOS 3.3 binary files have a 4-byte header: 2 bytes address, 2 bytes length
          if (fileData.length >= 4) {
            info = {
              address: fileData[0] | (fileData[1] << 8),
              length: fileData[2] | (fileData[3] << 8),
            };
          }
          displayData = info ? fileData.slice(4) : fileData; // DOS 3.3 has 4-byte header
        }

        // Clear BASIC navigation state for binary files
        this.basicLineNumToIndex = null;
        this.basicOriginalHtml = null;

        // Auto-detect Merlin source for binary files on first load
        if (!this._binaryViewManuallySet && checkIsMerlinFile(displayData)) {
          this.binaryViewMode = "merlin";
          viewToggle.querySelectorAll(".fe-view-btn").forEach((b) => {
            b.classList.toggle("active", b.dataset.view === "merlin");
          });
        }

        // Update legend visibility after possible auto-detection
        asmLegend.classList.toggle(
          "hidden",
          !(isBinary && this.binaryViewMode === "asm"),
        );
        hexLegend.classList.toggle(
          "hidden",
          !(isBinary && this.binaryViewMode === "hex"),
        );

        if (this.binaryViewMode === "merlin") {
          // Show Merlin source view
          this.hexDisplayState = null;
          const merlinResult = formatMerlinFile(displayData);
          contentEl.className = "fe-file-content merlin";
          contentEl.innerHTML = `<pre>${merlinResult.content}</pre>`;
        } else if (this.binaryViewMode === "hex") {
          // Show hex dump with dynamic column count
          contentEl.className = "fe-file-content hex";
          this.hexDisplayState = {
            data: displayData,
            baseAddress: info?.address || 0,
            maxBytes: 0,
          };
          this.hexBytesPerRow = this.calculateBytesPerRow();
          const hexContent = formatHexDump(
            displayData,
            info?.address || 0,
            0,
            this.hexBytesPerRow,
          );
          contentEl.innerHTML = `<pre>${hexContent}</pre>`;
        } else {
          // Show disassembly (async) - progressive rendering to avoid freezing
          this.hexDisplayState = null;
          contentEl.className = "fe-file-content asm";
          contentEl.innerHTML = "<pre>Disassembling...</pre>";

          // Create compatible data format for the disassembler.
          // The disassembler expects DOS 3.3 binary format: 4-byte header + data
          // Header: bytes 0-1 = load address (little-endian), bytes 2-3 = length (little-endian)
          // DOS 3.3 binary files already have this header, but ProDOS BIN files store
          // address/length in the file's aux_type field, not in the file data itself.
          // We create a synthetic header for ProDOS files so the disassembler works uniformly.
          let dataForDisasm;
          if (this.diskFormat === "prodos" || this.diskFormat === "pascal") {
            // Create header: 2 bytes address + 2 bytes length + actual data
            dataForDisasm = new Uint8Array(4 + fileData.length);
            dataForDisasm[0] = info.address & 0xff;
            dataForDisasm[1] = (info.address >> 8) & 0xff;
            dataForDisasm[2] = info.length & 0xff;
            dataForDisasm[3] = (info.length >> 8) & 0xff;
            dataForDisasm.set(fileData, 4);
          } else {
            dataForDisasm = fileData;
          }

          // Pass contentEl for progressive rendering
          disassemble(dataForDisasm, contentEl).catch((e) => {
            contentEl.className = "fe-file-content error";
            contentEl.innerHTML = `<div class="fe-error">Error disassembling: ${e.message}</div>`;
          });
        }
      } else {
        // Non-binary files - use formatFileContents with mapped file type
        let viewerFileType;
        if (this.diskFormat === "pascal") {
          viewerFileType = wasm._mapPascalFileType(this.selectedFile.fileType);
        } else if (this.diskFormat === "prodos") {
          viewerFileType = wasm._mapProDOSFileType(this.selectedFile.fileType);
        } else {
          viewerFileType = this.selectedFile.fileType;
        }

        // If mapFileTypeForViewer returns -1, use hex dump
        if (viewerFileType === -1) {
          contentEl.className = "fe-file-content hex";
          hexLegend.classList.remove("hidden");
          textViewToggle.classList.add("hidden");
          this.hexDisplayState = {
            data: fileData,
            baseAddress: 0,
            maxBytes: 0,
          };
          this.hexBytesPerRow = this.calculateBytesPerRow();
          const hexContent = formatHexDump(fileData, 0, 0, this.hexBytesPerRow);
          contentEl.innerHTML = `<pre>${hexContent}</pre>`;
          this.basicLineNumToIndex = null;
          this.basicOriginalHtml = null;
          return;
        }

        // For text files, auto-detect Merlin source on first load
        if (
          isText &&
          !this._textViewManuallySet &&
          checkIsMerlinFile(fileData)
        ) {
          this.textViewMode = "merlin";
          textViewToggle.querySelectorAll(".fe-view-btn").forEach((b) => {
            b.classList.toggle("active", b.dataset.view === "merlin");
          });
        }

        // Handle text file Merlin view
        if (isText && this.textViewMode === "merlin") {
          this.hexDisplayState = null;
          this.basicLineNumToIndex = null;
          this.basicOriginalHtml = null;
          const merlinResult = formatMerlinFile(fileData);
          contentEl.className = "fe-file-content merlin";
          contentEl.innerHTML = `<pre>${merlinResult.content}</pre>`;
          return;
        }

        // ProDOS and Pascal files don't have the 2-byte length header that DOS 3.3 files have
        this.hexDisplayState = null;
        const hasLengthHeader = this.diskFormat === "dos33";
        const formatted = formatFileContents(fileData, viewerFileType, {
          hasLengthHeader,
        });
        contentEl.className = `fe-file-content ${formatted.format}`;
        // BASIC files output HTML with syntax highlighting, others need escaping
        if (formatted.isHtml) {
          contentEl.innerHTML = `<pre>${formatted.content}</pre>`;
          // Set up BASIC line navigation if available
          if (formatted.lineNumToIndex) {
            this.basicLineNumToIndex = formatted.lineNumToIndex;
            this.basicOriginalHtml = formatted.content; // Store original for highlight restoration
            contentEl
              .querySelector("pre")
              .addEventListener("click", this.handleBasicLineClick);
          } else {
            this.basicOriginalHtml = null;
          }
        } else {
          contentEl.innerHTML = `<pre>${escapeHtml(formatted.content)}</pre>`;
          this.basicLineNumToIndex = null;
          this.basicOriginalHtml = null;
        }
      }
    } catch (e) {
      contentEl.className = "fe-file-content error";
      contentEl.innerHTML = `<div class="fe-error">Error reading file: ${e.message}</div>`;
    }
  }

  handleBasicLineClick(event) {
    const target = event.target.closest(".bas-lineref");
    if (!target || !this.basicLineNumToIndex || !this.basicOriginalHtml) return;

    const targetLineNum = parseInt(target.dataset.targetLine, 10);
    if (isNaN(targetLineNum)) return;

    const lineIndex = this.basicLineNumToIndex.get(targetLineNum);
    if (lineIndex === undefined) return;

    const contentEl = this.element.querySelector(".fe-file-content");
    const pre = contentEl.querySelector("pre");
    if (!pre) return;

    // Always rebuild from original HTML to avoid corruption from previous highlights
    const lines = this.basicOriginalHtml.split("\n");
    if (lineIndex >= 0 && lineIndex < lines.length) {
      lines[lineIndex] =
        `<span class="bas-highlight">${lines[lineIndex]}</span>`;
      pre.innerHTML = lines.join("\n");

      // Scroll to the target line
      const lineHeight = 18;
      const scrollTop = lineIndex * lineHeight;
      const viewportHeight = contentEl.clientHeight;
      const centeredScrollTop = Math.max(
        0,
        scrollTop - viewportHeight / 2 + lineHeight / 2,
      );
      contentEl.scrollTop = centeredScrollTop;
    }
  }

  /**
   * Set up ResizeObserver to dynamically adjust hex column count
   */
  setupHexResizeObserver() {
    const contentEl = this.element.querySelector(".fe-file-content");
    if (!contentEl) return;

    this.hexResizeObserver = new ResizeObserver(() => {
      if (!this.hexDisplayState || !contentEl.classList.contains("hex")) return;

      const bytesPerRow = this.calculateBytesPerRow();
      if (bytesPerRow !== this.hexBytesPerRow) {
        this.hexBytesPerRow = bytesPerRow;
        this.rerenderHex();
      }
    });

    this.hexResizeObserver.observe(contentEl);
  }

  /**
   * Calculate optimal bytes per row based on available width
   */
  calculateBytesPerRow() {
    const contentEl = this.element.querySelector(".fe-file-content");
    if (!contentEl) return 16;

    // Create a test element to measure monospace character width
    const testPre = document.createElement("pre");
    testPre.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;margin:0;padding:0;font-family:var(--font-mono);font-size:11px";
    testPre.textContent = "0000000000";
    contentEl.appendChild(testPre);
    const charWidth = testPre.getBoundingClientRect().width / 10;
    const emWidth = parseFloat(getComputedStyle(testPre).fontSize);
    contentEl.removeChild(testPre);

    if (charWidth === 0) return 16;

    // Available width inside the content element (minus padding and scrollbar)
    const style = getComputedStyle(contentEl);
    const padding =
      (parseFloat(style.paddingLeft) || 0) +
      (parseFloat(style.paddingRight) || 0);
    const availableWidth = contentEl.clientWidth - padding;

    // Fixed parts per line (in pixels):
    // Address: 4 chars, separator ":": 1 char + 0.5em margin, space: 1 char
    // ASCII separators: 2 × (1 char + 0.4em margin on each side)
    const fixedPx = 6 * charWidth + 0.5 * emWidth + 1.6 * emWidth;

    // Per byte: 3 chars hex ("XX ") + 1 char ASCII = 4 chars
    const perBytePx = 4 * charWidth;

    // First estimate without group gaps
    let bytesPerRow = Math.floor((availableWidth - fixedPx) / perBytePx);

    // Refine: account for group gaps (0.75em each, between every 8-byte group)
    const groupGapWidth = 0.75 * emWidth;
    const gapCount = Math.max(0, Math.floor((bytesPerRow - 1) / 8));
    bytesPerRow = Math.floor(
      (availableWidth - fixedPx - gapCount * groupGapWidth) / perBytePx,
    );

    return Math.max(1, Math.min(64, bytesPerRow));
  }

  /**
   * Re-render hex dump with current bytesPerRow
   */
  rerenderHex() {
    const contentEl = this.element.querySelector(".fe-file-content");
    if (!contentEl || !this.hexDisplayState) return;

    const { data, baseAddress, maxBytes } = this.hexDisplayState;
    const hexContent = formatHexDump(
      data,
      baseAddress,
      maxBytes,
      this.hexBytesPerRow,
    );
    contentEl.innerHTML = `<pre>${hexContent}</pre>`;
  }

  clearFileView() {
    const titleEl = this.element.querySelector(".fe-file-title");
    const infoEl = this.element.querySelector(".fe-file-info");
    const contentEl = this.element.querySelector(".fe-file-content");
    const viewToggle = this.element.querySelector(".fe-view-toggle");
    const textViewToggle = this.element.querySelector(".fe-text-view-toggle");
    const asmLegend = this.element.querySelector(".fe-asm-legend");
    const hexLegend = this.element.querySelector(".fe-hex-legend");

    titleEl.textContent = "Select a file";
    infoEl.textContent = "";
    contentEl.innerHTML = "";
    contentEl.className = "fe-file-content";
    viewToggle.classList.add("hidden");
    textViewToggle.classList.add("hidden");
    asmLegend.classList.add("hidden");
    hexLegend.classList.add("hidden");
    this.currentFileData = null;
    this.basicLineNumToIndex = null;
    this.basicOriginalHtml = null;
    this.hexDisplayState = null;
    this.textViewMode = "text";
    this.binaryViewMode = "asm";
  }
}
