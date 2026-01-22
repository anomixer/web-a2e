/**
 * FileExplorerWindow - Browse and view contents of Apple II disk images
 */

import { isDOS33, readCatalog, readFile, parseVTOC, getBinaryFileInfo } from './dos33.js';
import { isProDOS, readCatalog as readProDOSCatalog, readFile as readProDOSFile, parseVolumeInfo, mapFileTypeForViewer, getBinaryFileInfo as getProDOSBinaryInfo } from './prodos.js';
import { formatFileContents, formatFileSize, formatHexDump } from './file-viewer.js';
import { disassemble, setWasmModule } from './disassembler.js';
import { escapeHtml } from '../utils/string-utils.js';

export class FileExplorerWindow {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.element = null;
    this.isVisible = false;

    // Initialize the disassembler with the WASM module
    setWasmModule(wasmModule);

    // Window state
    this.currentX = 150;
    this.currentY = 100;
    this.currentWidth = 700;
    this.currentHeight = 500;

    // Drag state
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };

    // Resize state
    this.isResizing = false;
    this.resizeStart = { x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 };
    this.resizeDirection = null;

    // Content state
    this.selectedDrive = 0;
    this.catalog = [];
    this.selectedFile = null;
    this.diskData = null;
    this.diskFormat = null; // 'dos33' | 'prodos' | null
    this.currentPath = ''; // Current directory path for ProDOS navigation
    this.binaryViewMode = 'asm'; // 'asm' or 'hex'
    this.currentFileData = null; // Cache for current file data
    this.basicLineNumToIndex = null; // For BASIC GOTO/GOSUB navigation
    this.basicOriginalHtml = null; // Original unhighlighted BASIC content

    // Bind handlers
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleBasicLineClick = this.handleBasicLineClick.bind(this);
  }

  create() {
    this.element = document.createElement('div');
    this.element.id = 'file-explorer-window';
    this.element.className = 'file-explorer-window hidden';
    this.element.style.width = `${this.currentWidth}px`;
    this.element.style.height = `${this.currentHeight}px`;
    this.element.style.left = `${this.currentX}px`;
    this.element.style.top = `${this.currentY}px`;

    this.element.innerHTML = `
      <div class="fe-header">
        <span class="fe-title">File Explorer</span>
        <button class="fe-close" title="Close">&times;</button>
      </div>
      <div class="fe-toolbar">
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
              <button class="fe-view-btn active" data-view="asm" title="Disassembly">ASM<span class="fe-experimental">experimental</span></button>
              <button class="fe-view-btn" data-view="hex" title="Hex dump">HEX</button>
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
          <div class="fe-file-content"></div>
        </div>
      </div>
      <div class="fe-resize-handle se" data-direction="se"></div>
      <div class="fe-resize-handle e" data-direction="e"></div>
      <div class="fe-resize-handle s" data-direction="s"></div>
    `;

    document.body.appendChild(this.element);
    this.setupEventListeners();
    this.loadSettings();
  }

  setupEventListeners() {
    // Close button
    const closeBtn = this.element.querySelector('.fe-close');
    closeBtn.addEventListener('click', () => this.hide());

    // Header drag
    const header = this.element.querySelector('.fe-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.fe-close')) return;
      this.startDrag(e);
    });

    // Drive selector
    const driveBtns = this.element.querySelectorAll('.fe-drive-btn');
    driveBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        driveBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedDrive = parseInt(btn.dataset.drive, 10);
        this.loadDisk();
      });
    });

    // Refresh button
    const refreshBtn = this.element.querySelector('.fe-refresh-btn');
    refreshBtn.addEventListener('click', () => this.loadDisk());

    // Catalog item selection
    const catalogList = this.element.querySelector('.fe-catalog-list');
    catalogList.addEventListener('click', (e) => {
      const item = e.target.closest('.fe-catalog-item');
      if (item) {
        // Check for parent directory navigation
        if (item.dataset.action === 'parent') {
          const parts = this.currentPath.split('/');
          parts.pop();
          this.navigateToPath(parts.join('/'));
          return;
        }
        const index = parseInt(item.dataset.index, 10);
        if (!isNaN(index)) {
          this.selectFile(index);
        }
      }
    });

    // Path bar breadcrumb navigation (ProDOS)
    const pathBar = this.element.querySelector('.fe-path-bar');
    pathBar.addEventListener('click', (e) => {
      const pathItem = e.target.closest('.fe-path-item');
      if (pathItem && !pathItem.matches(':last-child')) {
        const path = pathItem.dataset.path || '';
        this.navigateToPath(path);
      }
    });

    // Resize handles
    const resizeHandles = this.element.querySelectorAll('.fe-resize-handle');
    resizeHandles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => this.startResize(e, handle.dataset.direction));
    });

    // Global mouse events for drag/resize
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);

    // Bring to front on click
    this.element.addEventListener('mousedown', () => this.bringToFront());

    // View toggle for binary files
    const viewToggle = this.element.querySelector('.fe-view-toggle');
    viewToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.fe-view-btn');
      if (btn) {
        const view = btn.dataset.view;
        if (view !== this.binaryViewMode) {
          this.binaryViewMode = view;
          viewToggle.querySelectorAll('.fe-view-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.showFileContents();
        }
      }
    });
  }

  startDrag(e) {
    this.isDragging = true;
    this.dragOffset = {
      x: e.clientX - this.currentX,
      y: e.clientY - this.currentY,
    };
    this.element.classList.add('dragging');
    e.preventDefault();
  }

  startResize(e, direction) {
    this.isResizing = true;
    this.resizeDirection = direction;
    this.resizeStart = {
      x: e.clientX,
      y: e.clientY,
      width: this.currentWidth,
      height: this.currentHeight,
      left: this.currentX,
      top: this.currentY,
    };
    this.element.classList.add('resizing');
    e.preventDefault();
    e.stopPropagation();
  }

  handleMouseDown(e) {
    // Handled by specific listeners
  }

  handleMouseMove(e) {
    if (this.isDragging) {
      this.currentX = e.clientX - this.dragOffset.x;
      this.currentY = e.clientY - this.dragOffset.y;

      // Keep in viewport
      this.currentX = Math.max(0, Math.min(this.currentX, window.innerWidth - 100));
      this.currentY = Math.max(0, Math.min(this.currentY, window.innerHeight - 50));

      this.element.style.left = `${this.currentX}px`;
      this.element.style.top = `${this.currentY}px`;
    }

    if (this.isResizing) {
      const dx = e.clientX - this.resizeStart.x;
      const dy = e.clientY - this.resizeStart.y;
      const dir = this.resizeDirection;

      let newWidth = this.resizeStart.width;
      let newHeight = this.resizeStart.height;
      let newLeft = this.resizeStart.left;
      let newTop = this.resizeStart.top;

      if (dir.includes('e')) newWidth = Math.max(400, this.resizeStart.width + dx);
      if (dir.includes('s')) newHeight = Math.max(300, this.resizeStart.height + dy);
      if (dir.includes('w')) {
        newWidth = Math.max(400, this.resizeStart.width - dx);
        newLeft = this.resizeStart.left + (this.resizeStart.width - newWidth);
      }
      if (dir.includes('n')) {
        newHeight = Math.max(300, this.resizeStart.height - dy);
        newTop = this.resizeStart.top + (this.resizeStart.height - newHeight);
      }

      this.currentWidth = newWidth;
      this.currentHeight = newHeight;
      this.currentX = newLeft;
      this.currentY = newTop;

      this.element.style.width = `${newWidth}px`;
      this.element.style.height = `${newHeight}px`;
      this.element.style.left = `${newLeft}px`;
      this.element.style.top = `${newTop}px`;
    }
  }

  handleMouseUp() {
    if (this.isDragging || this.isResizing) {
      this.isDragging = false;
      this.isResizing = false;
      this.element.classList.remove('dragging', 'resizing');
      this.saveSettings();
    }
  }

  bringToFront() {
    // Simple z-index bump
    this.element.style.zIndex = '10001';
  }

  show() {
    this.isVisible = true;
    this.element.classList.remove('hidden');
    this.bringToFront();
    this.loadDisk();
  }

  hide() {
    this.isVisible = false;
    this.element.classList.add('hidden');
    this.saveSettings();
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  loadDisk() {
    const diskInfo = this.element.querySelector('.fe-disk-info');
    const catalogList = this.element.querySelector('.fe-catalog-list');

    // Check if disk is inserted
    if (!this.wasmModule._isDiskInserted(this.selectedDrive)) {
      diskInfo.textContent = 'No disk inserted';
      catalogList.innerHTML = '<div class="fe-empty">No disk in drive</div>';
      this.catalog = [];
      this.diskData = null;
      this.diskFormat = null;
      this.clearFileView();
      return;
    }

    // Get disk sector data (raw sector data regardless of disk format)
    const sizePtr = this.wasmModule._malloc(4);
    const dataPtr = this.wasmModule._getDiskSectorData(this.selectedDrive, sizePtr);
    const size = new Uint32Array(this.wasmModule.HEAPU8.buffer, sizePtr, 1)[0];
    this.wasmModule._free(sizePtr);

    if (!dataPtr || size === 0) {
      // Get filename to show in error
      const filenamePtr = this.wasmModule._getDiskFilename(this.selectedDrive);
      const filename = filenamePtr ? this.wasmModule.UTF8ToString(filenamePtr) : 'Disk';
      diskInfo.textContent = filename;
      catalogList.innerHTML = '<div class="fe-empty">Cannot read sector data<br><small>WOZ format disks are not supported</small></div>';
      this.catalog = [];
      this.diskData = null;
      this.diskFormat = null;
      this.clearFileView();
      return;
    }

    // Copy disk data (create our own copy since WASM memory can move)
    this.diskData = new Uint8Array(size);
    this.diskData.set(new Uint8Array(this.wasmModule.HEAPU8.buffer, dataPtr, size));

    // Get filename
    const filenamePtr = this.wasmModule._getDiskFilename(this.selectedDrive);
    const filename = filenamePtr ? this.wasmModule.UTF8ToString(filenamePtr) : 'Unknown';

    // Debug: Log disk info
    console.log('File Explorer - Disk data:', {
      filename,
      size,
      expectedSize: 143360,
      firstBytes: Array.from(this.diskData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '),
      // VTOC is at track 17, sector 0 = offset (17 * 16 + 0) * 256 = 69632
      vtocOffset: 17 * 16 * 256,
      vtocBytes: Array.from(this.diskData.slice(17 * 16 * 256, 17 * 16 * 256 + 16)).map(b => b.toString(16).padStart(2, '0')).join(' '),
    });

    // Check disk format - try ProDOS first, then DOS 3.3
    if (isProDOS(this.diskData)) {
      this.diskFormat = 'prodos';
      this.volumeInfo = parseVolumeInfo(this.diskData);
      diskInfo.textContent = `${filename} (ProDOS: ${this.volumeInfo.volumeName})`;

      // Read ProDOS catalog
      this.catalog = readProDOSCatalog(this.diskData);

      // Reset to root directory and render
      this.currentPath = '';
      this.renderProDOSCatalog();
    } else if (isDOS33(this.diskData)) {
      this.diskFormat = 'dos33';
      const vtoc = parseVTOC(this.diskData);
      diskInfo.textContent = `${filename} (Vol ${vtoc.volumeNumber})`;

      // Read DOS 3.3 catalog
      this.catalog = readCatalog(this.diskData);

      // Render catalog
      if (this.catalog.length === 0) {
        catalogList.innerHTML = '<div class="fe-empty">Disk is empty</div>';
      } else {
        catalogList.innerHTML = this.catalog.map((entry, index) => `
          <div class="fe-catalog-item" data-index="${index}">
            <span class="fe-file-type ${entry.isLocked ? 'locked' : ''}">${entry.isLocked ? '*' : ' '}${entry.fileTypeName}</span>
            <span class="fe-file-name">${escapeHtml(entry.filename)}</span>
            <span class="fe-file-sectors">${entry.sectorCount}</span>
          </div>
        `).join('');
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
   * Render the ProDOS catalog for the current directory path
   */
  renderProDOSCatalog() {
    const catalogList = this.element.querySelector('.fe-catalog-list');
    const pathBar = this.element.querySelector('.fe-path-bar');

    // Show/hide path bar based on whether we're in a subdirectory
    if (this.currentPath) {
      pathBar.classList.remove('hidden');
      // Build clickable breadcrumb path
      const parts = this.currentPath.split('/');
      let pathHtml = `<span class="fe-path-item" data-path="">/${this.volumeInfo.volumeName}</span>`;
      let builtPath = '';
      for (const part of parts) {
        builtPath += (builtPath ? '/' : '') + part;
        pathHtml += `/<span class="fe-path-item" data-path="${escapeHtml(builtPath)}">${escapeHtml(part)}</span>`;
      }
      pathBar.innerHTML = pathHtml;
    } else {
      pathBar.classList.add('hidden');
      pathBar.innerHTML = '';
    }

    // Get entries in current directory
    const entriesInPath = this.catalog.filter(entry => {
      if (this.currentPath === '') {
        // Root: show entries without a path separator (direct children)
        return !entry.path.includes('/');
      } else {
        // Subdirectory: show entries whose path starts with currentPath/
        // and have exactly one more component
        const prefix = this.currentPath + '/';
        if (!entry.path.startsWith(prefix)) return false;
        const remainder = entry.path.slice(prefix.length);
        return !remainder.includes('/');
      }
    });

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
      let html = '';
      if (this.currentPath) {
        html += `
          <div class="fe-catalog-item fe-directory fe-parent-dir" data-action="parent">
            <span class="fe-file-type">DIR</span>
            <span class="fe-file-name">..</span>
            <span class="fe-file-sectors"></span>
          </div>
        `;
      }

      html += entriesInPath.map(entry => {
        const originalIndex = this.catalog.indexOf(entry);
        const isDir = entry.isDirectory;
        return `
          <div class="fe-catalog-item ${isDir ? 'fe-directory' : ''}" data-index="${originalIndex}" ${isDir ? 'data-action="enter"' : ''}>
            <span class="fe-file-type ${entry.isLocked ? 'locked' : ''}">${entry.isLocked ? '*' : ' '}${isDir ? 'DIR' : entry.fileTypeName}</span>
            <span class="fe-file-name">${escapeHtml(entry.filename)}${isDir ? '/' : ''}</span>
            <span class="fe-file-sectors">${entry.blocksUsed}</span>
          </div>
        `;
      }).join('');

      catalogList.innerHTML = html;
    }
  }

  /**
   * Navigate to a directory path (ProDOS)
   */
  navigateToPath(path) {
    this.currentPath = path;
    this.selectedFile = null;
    this.clearFileView();
    this.renderProDOSCatalog();
  }

  selectFile(index) {
    if (index < 0 || index >= this.catalog.length) return;

    const entry = this.catalog[index];

    // If it's a directory, navigate into it instead of selecting
    if (entry.isDirectory) {
      this.navigateToPath(entry.path);
      return;
    }

    // Update selection UI - compare with data-index attribute since items may be filtered
    const items = this.element.querySelectorAll('.fe-catalog-item');
    items.forEach((item) => {
      const itemIndex = parseInt(item.dataset.index, 10);
      item.classList.toggle('selected', itemIndex === index);
    });

    this.selectedFile = entry;
    this.showFileContents();
  }

  showFileContents() {
    const titleEl = this.element.querySelector('.fe-file-title');
    const infoEl = this.element.querySelector('.fe-file-info');
    const contentEl = this.element.querySelector('.fe-file-content');
    const viewToggle = this.element.querySelector('.fe-view-toggle');
    const asmLegend = this.element.querySelector('.fe-asm-legend');

    if (!this.selectedFile || !this.diskData) {
      this.clearFileView();
      return;
    }

    // Display filename (with path for ProDOS)
    const displayName = this.diskFormat === 'prodos' && this.selectedFile.path
      ? this.selectedFile.path
      : this.selectedFile.filename;
    titleEl.textContent = displayName;

    // Format file size info based on disk format
    const sizeInfo = this.diskFormat === 'prodos'
      ? formatFileSize(this.selectedFile.blocksUsed * 2) // ProDOS uses 512-byte blocks
      : formatFileSize(this.selectedFile.sectorCount);
    infoEl.textContent = `${this.selectedFile.fileTypeDescription} - ${sizeInfo}`;

    // Determine if this is a binary file based on disk format
    // DOS 3.3: fileType 0x04 is Binary
    // ProDOS: fileType 0x06 (BIN) or 0xFF (SYS) are binary
    const isBinary = this.diskFormat === 'prodos'
      ? (this.selectedFile.fileType === 0x06 || this.selectedFile.fileType === 0xFF)
      : this.selectedFile.fileType === 0x04;

    // Show/hide view toggle based on file type (only for binary files)
    viewToggle.classList.toggle('hidden', !isBinary);

    // Show/hide ASM legend based on binary file and view mode
    const showLegend = isBinary && this.binaryViewMode === 'asm';
    asmLegend.classList.toggle('hidden', !showLegend);

    // Read file data (cache it for view switching)
    try {
      // Only re-read if we don't have cached data or file changed
      const cacheKey = this.diskFormat === 'prodos' && this.selectedFile.path
        ? this.selectedFile.path
        : this.selectedFile.filename;

      if (!this.currentFileData || this.currentFileData.filename !== cacheKey) {
        // Use appropriate read function based on disk format
        const fileData = this.diskFormat === 'prodos'
          ? readProDOSFile(this.diskData, this.selectedFile)
          : readFile(this.diskData, this.selectedFile);

        this.currentFileData = {
          filename: cacheKey,
          data: fileData,
          fileType: this.selectedFile.fileType,
        };
      }

      const fileData = this.currentFileData.data;

      // Handle binary files with view toggle
      if (isBinary) {
        // Get binary info - ProDOS stores address in auxType, DOS 3.3 in file header
        let info;
        let displayData;

        if (this.diskFormat === 'prodos') {
          info = getProDOSBinaryInfo(this.selectedFile);
          displayData = fileData; // ProDOS binary data doesn't have header
        } else {
          info = getBinaryFileInfo(fileData);
          displayData = info ? fileData.slice(4) : fileData; // DOS 3.3 has 4-byte header
        }

        // Clear BASIC navigation state for binary files
        this.basicLineNumToIndex = null;
        this.basicOriginalHtml = null;

        if (this.binaryViewMode === 'hex') {
          // Show hex dump
          const hexContent = formatHexDump(displayData, info?.address || 0);
          contentEl.className = 'fe-file-content hex';
          contentEl.innerHTML = `<pre>${escapeHtml(hexContent)}</pre>`;
        } else {
          // Show disassembly (async) - progressive rendering to avoid freezing
          contentEl.className = 'fe-file-content asm';
          contentEl.innerHTML = '<pre>Disassembling...</pre>';

          // For ProDOS, create a fake DOS 3.3-style header for disassembler
          let dataForDisasm;
          if (this.diskFormat === 'prodos') {
            // Create header: 2 bytes address + 2 bytes length + actual data
            dataForDisasm = new Uint8Array(4 + fileData.length);
            dataForDisasm[0] = info.address & 0xFF;
            dataForDisasm[1] = (info.address >> 8) & 0xFF;
            dataForDisasm[2] = info.length & 0xFF;
            dataForDisasm[3] = (info.length >> 8) & 0xFF;
            dataForDisasm.set(fileData, 4);
          } else {
            dataForDisasm = fileData;
          }

          // Pass contentEl for progressive rendering
          disassemble(dataForDisasm, contentEl).catch(e => {
            contentEl.className = 'fe-file-content error';
            contentEl.innerHTML = `<div class="fe-error">Error disassembling: ${e.message}</div>`;
          });
        }
      } else {
        // Non-binary files - use formatFileContents with mapped file type
        const viewerFileType = this.diskFormat === 'prodos'
          ? mapFileTypeForViewer(this.selectedFile.fileType)
          : this.selectedFile.fileType;

        // If mapFileTypeForViewer returns -1, use hex dump
        if (viewerFileType === -1) {
          const hexContent = formatHexDump(fileData);
          contentEl.className = 'fe-file-content hex';
          contentEl.innerHTML = `<pre>${escapeHtml(hexContent)}</pre>`;
          this.basicLineNumToIndex = null;
          this.basicOriginalHtml = null;
          return;
        }

        // ProDOS BASIC files don't have the 2-byte length header that DOS 3.3 files have
        const hasLengthHeader = this.diskFormat !== 'prodos';
        const formatted = formatFileContents(fileData, viewerFileType, { hasLengthHeader });
        contentEl.className = `fe-file-content ${formatted.format}`;
        // BASIC files output HTML with syntax highlighting, others need escaping
        if (formatted.isHtml) {
          contentEl.innerHTML = `<pre>${formatted.content}</pre>`;
          // Set up BASIC line navigation if available
          if (formatted.lineNumToIndex) {
            this.basicLineNumToIndex = formatted.lineNumToIndex;
            this.basicOriginalHtml = formatted.content; // Store original for highlight restoration
            contentEl.querySelector('pre').addEventListener('click', this.handleBasicLineClick);
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
      contentEl.className = 'fe-file-content error';
      contentEl.innerHTML = `<div class="fe-error">Error reading file: ${e.message}</div>`;
    }
  }

  handleBasicLineClick(event) {
    const target = event.target.closest('.bas-lineref');
    if (!target || !this.basicLineNumToIndex || !this.basicOriginalHtml) return;

    const targetLineNum = parseInt(target.dataset.targetLine, 10);
    if (isNaN(targetLineNum)) return;

    const lineIndex = this.basicLineNumToIndex.get(targetLineNum);
    if (lineIndex === undefined) return;

    const contentEl = this.element.querySelector('.fe-file-content');
    const pre = contentEl.querySelector('pre');
    if (!pre) return;

    // Always rebuild from original HTML to avoid corruption from previous highlights
    const lines = this.basicOriginalHtml.split('\n');
    if (lineIndex >= 0 && lineIndex < lines.length) {
      lines[lineIndex] = `<span class="bas-highlight">${lines[lineIndex]}</span>`;
      pre.innerHTML = lines.join('\n');

      // Scroll to the target line
      const lineHeight = 18;
      const scrollTop = lineIndex * lineHeight;
      const viewportHeight = contentEl.clientHeight;
      const centeredScrollTop = Math.max(0, scrollTop - viewportHeight / 2 + lineHeight / 2);
      contentEl.scrollTop = centeredScrollTop;
    }
  }

  clearFileView() {
    const titleEl = this.element.querySelector('.fe-file-title');
    const infoEl = this.element.querySelector('.fe-file-info');
    const contentEl = this.element.querySelector('.fe-file-content');
    const viewToggle = this.element.querySelector('.fe-view-toggle');
    const asmLegend = this.element.querySelector('.fe-asm-legend');

    titleEl.textContent = 'Select a file';
    infoEl.textContent = '';
    contentEl.innerHTML = '';
    contentEl.className = 'fe-file-content';
    viewToggle.classList.add('hidden');
    asmLegend.classList.add('hidden');
    this.currentFileData = null;
    this.basicLineNumToIndex = null;
    this.basicOriginalHtml = null;
  }

  saveSettings() {
    try {
      localStorage.setItem('a2e-file-explorer', JSON.stringify({
        x: this.currentX,
        y: this.currentY,
        width: this.currentWidth,
        height: this.currentHeight,
        visible: this.isVisible,
      }));
    } catch (e) {
      console.warn('Failed to save file explorer settings:', e.message);
    }
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('a2e-file-explorer');
      if (saved) {
        const state = JSON.parse(saved);
        this.currentX = state.x || this.currentX;
        this.currentY = state.y || this.currentY;
        this.currentWidth = state.width || this.currentWidth;
        this.currentHeight = state.height || this.currentHeight;

        this.element.style.left = `${this.currentX}px`;
        this.element.style.top = `${this.currentY}px`;
        this.element.style.width = `${this.currentWidth}px`;
        this.element.style.height = `${this.currentHeight}px`;
      }
    } catch (e) {
      console.warn('Failed to load file explorer settings:', e.message);
    }
  }

  destroy() {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
