/*
 * disk-library-window.js - Disk library window for loading bundled disk images
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { showToast } from "../ui/toast.js";
import { createDatabaseManager } from "../utils/indexeddb-helper.js";
import { loadDiskFromData } from "./disk-operations.js";
import {
  saveDiskToStorage,
  addToRecentDisks,
} from "./disk-persistence.js";
import {
  saveImageToStorage,
  addToRecentImages,
} from "./hard-drive-persistence.js";

const CACHE_STORE = "images";

const cacheDb = createDatabaseManager({
  dbName: "a2e-disk-library-cache",
  version: 1,
  onUpgrade: (event) => {
    const database = event.target.result;
    if (!database.objectStoreNames.contains(CACHE_STORE)) {
      database.createObjectStore(CACHE_STORE, { keyPath: "id" });
    }
  },
});

const FLOPPY_ICON = `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
  <path d="M2 1.5A1.5 1.5 0 0 1 3.5 0h9A1.5 1.5 0 0 1 14 1.5v13A1.5 1.5 0 0 1 12.5 16h-9A1.5 1.5 0 0 1 2 14.5v-13zM5 1v3h6V1H5zm6.5 7a3.5 3.5 0 1 0-7 0 3.5 3.5 0 0 0 7 0zM8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>
</svg>`;

const HARDDRIVE_ICON = `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
  <path d="M1 4.5A1.5 1.5 0 0 1 2.5 3h11A1.5 1.5 0 0 1 15 4.5v2A1.5 1.5 0 0 1 13.5 8h-11A1.5 1.5 0 0 1 1 6.5v-2zm0 5A1.5 1.5 0 0 1 2.5 8h11A1.5 1.5 0 0 1 15 9.5v2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 11.5v-2zM12 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm0 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>
</svg>`;

export class DiskLibraryWindow extends BaseWindow {
  constructor() {
    super({
      id: "disk-library",
      title: "Disk Library",
      minWidth: 340,
      minHeight: 100,
      maxWidth: 340,
      defaultWidth: 340,
      defaultHeight: 300,
      defaultPosition: { x: 150, y: 400 },
      resizeDirections: [],
    });

    this._library = [];
    this._diskManager = null;
    this._hardDriveManager = null;
    this._loading = new Set();
  }

  setManagers(diskManager, hardDriveManager) {
    this._diskManager = diskManager;
    this._hardDriveManager = hardDriveManager;
  }

  renderContent() {
    return `<div class="disk-library-list"><div class="disk-library-loading">Loading library...</div></div>`;
  }

  onContentRendered() {
    this._loadLibrary();
  }

  async _loadLibrary() {
    try {
      const resp = await fetch("/disks/library.json");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this._library = await resp.json();
      this._renderLibrary();
    } catch (err) {
      console.error("Failed to load disk library:", err);
      const list = this.contentElement.querySelector(".disk-library-list");
      if (list) {
        list.innerHTML = `<div class="disk-library-empty">No disks available</div>`;
      }
    }
  }

  _renderLibrary() {
    const list = this.contentElement.querySelector(".disk-library-list");
    if (!list) return;

    list.innerHTML = "";

    for (const entry of this._library) {
      const card = document.createElement("div");
      card.className = "disk-library-card";
      card.dataset.id = entry.id;

      const icon = entry.type === "hard-drive" ? HARDDRIVE_ICON : FLOPPY_ICON;
      const isFloppy = entry.type === "floppy";

      let buttonsHTML;
      if (isFloppy) {
        buttonsHTML = `
          <button class="disk-library-load" data-target="d1" title="Load into Drive 1">D1</button>
          <button class="disk-library-load" data-target="d2" title="Load into Drive 2">D2</button>`;
      } else {
        buttonsHTML = `
          <button class="disk-library-load" data-target="hd0" title="Load into Device 1">Dev 1</button>
          <button class="disk-library-load" data-target="hd1" title="Load into Device 2">Dev 2</button>`;
      }

      card.innerHTML = `
        <div class="disk-library-card-header">
          <span class="disk-library-icon">${icon}</span>
          <span class="disk-library-name">${entry.name}</span>
          <span class="disk-library-size">${entry.size}</span>
        </div>
        <div class="disk-library-card-body">
          <span class="disk-library-desc">${entry.description}</span>
          <div class="disk-library-actions">${buttonsHTML}</div>
        </div>`;

      // Wire up load buttons
      card.querySelectorAll(".disk-library-load").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this._handleLoad(entry, btn.dataset.target, btn);
        });
      });

      list.appendChild(card);
    }

    this._fitToContent();
  }

  async _handleLoad(entry, target, btn) {
    const loadKey = `${entry.id}-${target}`;
    if (this._loading.has(loadKey)) return;

    // Check SmartPort for hard drive images
    if (entry.type === "hard-drive") {
      if (!this._hardDriveManager || !this._hardDriveManager.isSmartPortInstalled()) {
        showToast("SmartPort card is not installed. Configure it in the Expansion Slots window.", "warning");
        return;
      }
    }

    this._loading.add(loadKey);
    const originalText = btn.textContent;
    btn.textContent = "...";
    btn.disabled = true;

    try {
      const data = await this._getImageData(entry);

      if (entry.type === "floppy") {
        const driveNum = target === "d1" ? 0 : 1;
        this._loadFloppy(driveNum, entry, data);
      } else {
        const deviceNum = target === "hd0" ? 0 : 1;
        this._loadHardDrive(deviceNum, entry, data);
      }

      // Flash checkmark
      btn.textContent = "\u2713";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 800);
    } catch (err) {
      console.error(`Failed to load ${entry.file}:`, err);
      showToast(`Failed to load ${entry.name}`, "error");
      btn.textContent = originalText;
      btn.disabled = false;
    } finally {
      this._loading.delete(loadKey);
    }
  }

  async _getImageData(entry) {
    // Try loading from IndexedDB cache first
    try {
      const cached = await cacheDb.get(CACHE_STORE, entry.id);
      if (cached) {
        return new Uint8Array(cached.data);
      }
    } catch (err) {
      console.warn("Library cache read failed, fetching from server:", err);
    }

    // Cache miss — fetch from server
    const resp = await fetch(`/disks/${entry.file}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Store in cache for next time
    try {
      await cacheDb.put(CACHE_STORE, {
        id: entry.id,
        file: entry.file,
        data: arrayBuffer,
      });
    } catch (err) {
      console.warn("Library cache write failed:", err);
    }

    return data;
  }

  _loadFloppy(driveNum, entry, data) {
    if (!this._diskManager) return;

    const drive = this._diskManager.drives[driveNum];

    loadDiskFromData({
      wasmModule: this._diskManager.wasmModule,
      drive,
      driveNum,
      filename: entry.file,
      data,
      onSuccess: (filename) => {
        this._diskManager.setDiskName(driveNum, filename);
        if (this._diskManager.onDiskLoaded) {
          this._diskManager.onDiskLoaded(driveNum, filename);
        }
      },
      onError: (error) => showToast(error, "error"),
    });

    // Persist for session restore
    saveDiskToStorage(driveNum, entry.file, data);
    addToRecentDisks(driveNum, entry.file, data);
  }

  _loadHardDrive(deviceNum, entry, data) {
    if (!this._hardDriveManager) return;

    this._hardDriveManager.loadImageFromData(deviceNum, entry.file, data);

    // Persist for session restore
    saveImageToStorage(deviceNum, entry.file, data);
    addToRecentImages(deviceNum, entry.file, data);
  }

  _fitToContent() {
    if (!this.element) return;
    this.element.style.height = "auto";
    const newHeight = this.element.offsetHeight;
    this.element.style.height = `${newHeight}px`;
    this.currentHeight = newHeight;
    this.minHeight = newHeight;
    this.maxHeight = newHeight;
  }
}
