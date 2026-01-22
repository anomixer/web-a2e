/**
 * FileExplorerWindow - Browse and view contents of Apple II disk images
 */

import { isDOS33, readCatalog, readFile, parseVTOC, getBinaryFileInfo } from './dos33.js';
import { formatFileContents, formatFileSize, formatHexDump } from './file-viewer.js';
import { disassemble } from './disassembler.js';

export class FileExplorerWindow {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.element = null;
    this.isVisible = false;

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
    this.binaryViewMode = 'asm'; // 'asm' or 'hex'
    this.currentFileData = null; // Cache for current file data

    // Bind handlers
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
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
        const index = parseInt(item.dataset.index, 10);
        this.selectFile(index);
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

    // Check if DOS 3.3
    if (!isDOS33(this.diskData)) {
      diskInfo.textContent = `${filename} (Not DOS 3.3)`;
      catalogList.innerHTML = '<div class="fe-empty">Not a DOS 3.3 disk</div>';
      this.catalog = [];
      this.clearFileView();
      return;
    }

    // Parse VTOC for disk info
    const vtoc = parseVTOC(this.diskData);
    diskInfo.textContent = `${filename} (Vol ${vtoc.volumeNumber})`;

    // Read catalog
    this.catalog = readCatalog(this.diskData);

    // Render catalog
    if (this.catalog.length === 0) {
      catalogList.innerHTML = '<div class="fe-empty">Disk is empty</div>';
    } else {
      catalogList.innerHTML = this.catalog.map((entry, index) => `
        <div class="fe-catalog-item" data-index="${index}">
          <span class="fe-file-type ${entry.isLocked ? 'locked' : ''}">${entry.isLocked ? '*' : ' '}${entry.fileTypeName}</span>
          <span class="fe-file-name">${this.escapeHtml(entry.filename)}</span>
          <span class="fe-file-sectors">${entry.sectorCount}</span>
        </div>
      `).join('');
    }

    this.selectedFile = null;
    this.clearFileView();
  }

  selectFile(index) {
    if (index < 0 || index >= this.catalog.length) return;

    // Update selection UI
    const items = this.element.querySelectorAll('.fe-catalog-item');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === index);
    });

    this.selectedFile = this.catalog[index];
    this.showFileContents();
  }

  showFileContents() {
    const titleEl = this.element.querySelector('.fe-file-title');
    const infoEl = this.element.querySelector('.fe-file-info');
    const contentEl = this.element.querySelector('.fe-file-content');
    const viewToggle = this.element.querySelector('.fe-view-toggle');

    if (!this.selectedFile || !this.diskData) {
      this.clearFileView();
      return;
    }

    titleEl.textContent = this.selectedFile.filename;
    infoEl.textContent = `${this.selectedFile.fileTypeDescription} - ${formatFileSize(this.selectedFile.sectorCount)}`;

    // Show/hide view toggle based on file type (only for binary files)
    const isBinary = this.selectedFile.fileType === 0x04;
    viewToggle.classList.toggle('hidden', !isBinary);

    // Read file data (cache it for view switching)
    try {
      // Only re-read if we don't have cached data or file changed
      if (!this.currentFileData || this.currentFileData.filename !== this.selectedFile.filename) {
        this.currentFileData = {
          filename: this.selectedFile.filename,
          data: readFile(this.diskData, this.selectedFile),
          fileType: this.selectedFile.fileType,
        };
      }

      const fileData = this.currentFileData.data;

      // Handle binary files with view toggle
      if (isBinary) {
        const info = getBinaryFileInfo(fileData);

        if (this.binaryViewMode === 'hex') {
          // Show hex dump
          const displayData = info ? fileData.slice(4) : fileData;
          const hexContent = formatHexDump(displayData, info?.address || 0);
          contentEl.className = 'fe-file-content hex';
          contentEl.innerHTML = `<pre>${this.escapeHtml(hexContent)}</pre>`;
        } else {
          // Show disassembly (async)
          contentEl.className = 'fe-file-content text';
          contentEl.innerHTML = '<pre>Disassembling...</pre>';

          disassemble(fileData).then(content => {
            // Only update if this file is still selected
            if (this.selectedFile && this.currentFileData?.filename === this.selectedFile.filename) {
              contentEl.innerHTML = `<pre>${this.escapeHtml(content)}</pre>`;
            }
          }).catch(e => {
            contentEl.className = 'fe-file-content error';
            contentEl.innerHTML = `<div class="fe-error">Error disassembling: ${e.message}</div>`;
          });
        }
      } else {
        // Non-binary files - use formatFileContents
        const formatted = formatFileContents(fileData, this.selectedFile.fileType);
        contentEl.className = `fe-file-content ${formatted.format}`;
        contentEl.innerHTML = `<pre>${this.escapeHtml(formatted.content)}</pre>`;
      }
    } catch (e) {
      contentEl.className = 'fe-file-content error';
      contentEl.innerHTML = `<div class="fe-error">Error reading file: ${e.message}</div>`;
    }
  }

  clearFileView() {
    const titleEl = this.element.querySelector('.fe-file-title');
    const infoEl = this.element.querySelector('.fe-file-info');
    const contentEl = this.element.querySelector('.fe-file-content');
    const viewToggle = this.element.querySelector('.fe-view-toggle');

    titleEl.textContent = 'Select a file';
    infoEl.textContent = '';
    contentEl.innerHTML = '';
    contentEl.className = 'fe-file-content';
    viewToggle.classList.add('hidden');
    this.currentFileData = null;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
      // Ignore storage errors
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
      // Ignore storage errors
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
