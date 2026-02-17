/*
 * hard-drive-manager.js - Hard drive image management
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import {
  saveImageToStorage,
  loadImageFromStorage,
  clearImageFromStorage,
  addToRecentImages,
  getRecentImages,
  loadRecentImage,
  clearRecentImages,
} from "./hard-drive-persistence.js";
import { showToast } from "../ui/toast.js";
import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const CACHE_STORE = "images";

const libraryCacheDb = createDatabaseManager({
  dbName: "a2e-disk-library-cache",
  version: 1,
  onUpgrade: (event) => {
    const database = event.target.result;
    if (!database.objectStoreNames.contains(CACHE_STORE)) {
      database.createObjectStore(CACHE_STORE, { keyPath: "id" });
    }
  },
});

async function insertImageToWasm(wasmModule, deviceNum, data, filename) {
  const dataPtr = await wasmModule._malloc(data.length);
  await wasmModule.heapWrite(dataPtr, data);

  const filenamePtr = await wasmModule._malloc(filename.length + 1);
  await wasmModule.stringToUTF8(filename, filenamePtr, filename.length + 1);

  const success = await wasmModule._insertSmartPortImage(deviceNum, dataPtr, data.length, filenamePtr);

  await wasmModule._free(dataPtr);
  await wasmModule._free(filenamePtr);

  return success;
}

export class HardDriveManager {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.devices = [
      { filename: null, ejectBtn: null, nameLabel: null, input: null, activityFrames: 0 },
      { filename: null, ejectBtn: null, nameLabel: null, input: null, activityFrames: 0 },
    ];
    this.canvas = null;
    this.activeDropdown = null;
    this.fileExplorer = null;
  }

  init() {
    this.canvas = document.getElementById("screen");

    for (let i = 0; i < 2; i++) {
      this.setupDevice(i);
    }

    document.addEventListener("click", (e) => {
      if (this.activeDropdown && !e.target.closest(".hd-recent-container")) {
        this.closeRecentDropdown();
      }
    });

    this.restoreImages();
  }

  setupDevice(deviceNum) {
    const container = document.getElementById(`hd-device${deviceNum}`);
    if (!container) return;

    const device = this.devices[deviceNum];
    device.input = container.querySelector(`#hd-device${deviceNum}-input`);
    device.insertBtn = container.querySelector(".hd-insert");
    device.recentBtn = container.querySelector(".hd-recent");
    device.recentDropdown = container.querySelector(".hd-recent-dropdown");
    device.ejectBtn = container.querySelector(".hd-eject");
    device.browseBtn = container.querySelector(".hd-browse");
    device.nameLabel = container.querySelector(".hd-name");
    device.ledEl = container.querySelector(".hd-led");
    device.infoLabel = container.querySelector(".hd-info");

    if (device.browseBtn) {
      device.browseBtn.addEventListener("click", () => {
        if (this.fileExplorer) {
          this.fileExplorer.showHardDrive(deviceNum);
        }
        this.refocusCanvas();
      });
    }

    if (device.insertBtn) {
      device.insertBtn.addEventListener("click", async () => {
        if (!await this.isSmartPortInstalled()) {
          showToast("SmartPort card is not installed. Configure it in the Expansion Slots window before loading SmartPort images.", "warning");
          return;
        }
        device.input?.click();
      });
    }

    if (device.input) {
      device.input.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
          this.loadImage(deviceNum, e.target.files[0]);
        }
        this.refocusCanvas();
      });
    }

    if (device.recentBtn) {
      device.recentBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!await this.isSmartPortInstalled()) {
          showToast("SmartPort card is not installed. Configure it in the Expansion Slots window before loading SmartPort images.", "warning");
          return;
        }
        this.toggleRecentDropdown(deviceNum);
      });
    }

    if (device.ejectBtn) {
      device.ejectBtn.addEventListener("click", () => {
        this.ejectImage(deviceNum);
        this.refocusCanvas();
      });
    }
  }

  async isSmartPortInstalled() {
    return this.wasmModule._isSmartPortCardInstalled &&
           await this.wasmModule._isSmartPortCardInstalled();
  }

  refocusCanvas() {
    if (this.canvas) setTimeout(() => this.canvas.focus(), 0);
  }

  async loadImage(deviceNum, file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      const success = await insertImageToWasm(this.wasmModule, deviceNum, data, file.name);

      if (success) {
        this.devices[deviceNum].filename = file.name;
        this.updateDeviceUI(deviceNum);
        console.log(`Inserted HD image in device ${deviceNum + 1}: ${file.name}`);
        await saveImageToStorage(deviceNum, file.name, data);
        await addToRecentImages(deviceNum, file.name, data);
      } else {
        console.error(`Failed to load HD image: ${file.name}`);
        showToast(`Failed to load SmartPort image: ${file.name}`, "error");
      }
    } catch (error) {
      console.error("Error loading HD image:", error);
      showToast("Error loading hard drive image: " + error.message, "error");
    }
  }

  async loadImageFromData(deviceNum, filename, data) {
    const success = await insertImageToWasm(this.wasmModule, deviceNum, data, filename);
    if (success) {
      this.devices[deviceNum].filename = filename;
      this.updateDeviceUI(deviceNum);
      console.log(`Restored HD image in device ${deviceNum + 1}: ${filename}`);
    }
    return success;
  }

  async ejectImage(deviceNum) {
    const device = this.devices[deviceNum];
    if (!device.filename) return;

    // If modified, show host save dialog directly
    if (this.wasmModule._isSmartPortImageModified &&
        await this.wasmModule._isSmartPortImageModified(deviceNum)) {
      let filename = device.filename || `harddrive${deviceNum + 1}.hdv`;
      if (!filename.includes(".")) filename += ".hdv";

      try {
        const sizePtr = await this.wasmModule._malloc(4);
        const dataPtr = await this.wasmModule._getSmartPortImageData(deviceNum, sizePtr);
        const size = await this.wasmModule.heapDataViewU32(sizePtr);
        await this.wasmModule._free(sizePtr);

        if (dataPtr && size > 0) {
          const data = await this.wasmModule.heapRead(dataPtr, size);
          const blob = new Blob([data], { type: "application/octet-stream" });

          if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
              suggestedName: filename,
              types: [{ description: "SmartPort Image", accept: { "application/octet-stream": [".hdv", ".po", ".2mg"] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
          } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
          }
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Error saving HD image:", error);
        }
      }
    }

    this.performEject(deviceNum);
  }

  performEject(deviceNum) {
    if (this.wasmModule._ejectSmartPortImage) {
      this.wasmModule._ejectSmartPortImage(deviceNum);
    }
    this.devices[deviceNum].filename = null;
    this.updateDeviceUI(deviceNum);
    clearImageFromStorage(deviceNum);
    console.log(`Ejected HD image from device ${deviceNum + 1}`);
  }

  updateDeviceUI(deviceNum) {
    const device = this.devices[deviceNum];
    if (device.nameLabel) {
      device.nameLabel.textContent = device.filename || "No Image";
    }
    if (device.ejectBtn) {
      device.ejectBtn.disabled = !device.filename;
    }
    if (device.browseBtn) {
      device.browseBtn.disabled = !device.filename;
    }
    this.updateDeviceInfo(deviceNum);
  }

  updateDeviceInfo(deviceNum) {
    const device = this.devices[deviceNum];
    if (!device.infoLabel) return;

    if (!device.filename || !this.wasmModule._isSmartPortImageInserted) {
      device.infoLabel.textContent = "";
      return;
    }

    // We don't have a direct way to get block count from JS;
    // it's shown as the filename for now
    device.infoLabel.textContent = "";
  }

  async updateLEDs() {
    if (!this.wasmModule._getSmartPortActivity) return;

    const hasActivity = await this.wasmModule._getSmartPortActivity(0);
    const isWrite = await this.wasmModule._getSmartPortActivityWrite(0);

    for (let i = 0; i < 2; i++) {
      const device = this.devices[i];

      if (hasActivity && device.filename) {
        device.activityFrames = 3;
        device.lastWrite = isWrite;
      }

      if (device.activityFrames > 0) {
        if (device.ledEl) {
          device.ledEl.classList.add("active");
        }
        if (!hasActivity) {
          device.activityFrames--;
        }
      } else {
        if (device.ledEl) {
          device.ledEl.classList.remove("active", "write");
        }
      }
    }

    if (hasActivity) {
      this.wasmModule._clearSmartPortActivity();
    }
  }

  async restoreImages() {
    for (let deviceNum = 0; deviceNum < 2; deviceNum++) {
      try {
        const imageData = await loadImageFromStorage(deviceNum);
        if (imageData) {
          this.loadImageFromData(deviceNum, imageData.filename, imageData.data);
        }
      } catch (error) {
        console.error(`Error restoring HD image for device ${deviceNum + 1}:`, error);
      }
    }
  }

  async syncWithEmulatorState() {
    for (let deviceNum = 0; deviceNum < 2; deviceNum++) {
      const hasDisk = this.wasmModule._isSmartPortImageInserted &&
                      await this.wasmModule._isSmartPortImageInserted(deviceNum);
      if (hasDisk) {
        const filenamePtr = await this.wasmModule._getSmartPortImageFilename(deviceNum);
        let filename = "Restored Image";
        if (filenamePtr) {
          filename = await this.wasmModule.UTF8ToString(filenamePtr);
        }
        this.devices[deviceNum].filename = filename;
      } else {
        this.devices[deviceNum].filename = null;
      }
      this.updateDeviceUI(deviceNum);
    }
  }

  // Recent images dropdown

  async toggleRecentDropdown(deviceNum) {
    const device = this.devices[deviceNum];
    if (!device.recentDropdown) return;

    if (this.activeDropdown && this.activeDropdown !== device.recentDropdown) {
      this.closeRecentDropdown();
    }

    if (device.recentDropdown.classList.contains("open")) {
      this.closeRecentDropdown();
    } else {
      await this.populateRecentDropdown(deviceNum);
      device.recentDropdown.classList.add("open");
      this.activeDropdown = device.recentDropdown;
    }
  }

  closeRecentDropdown() {
    if (this.activeDropdown) {
      this.activeDropdown.classList.remove("open");
      this.activeDropdown = null;
    }
    this.refocusCanvas();
  }

  async populateRecentDropdown(deviceNum) {
    const device = this.devices[deviceNum];
    if (!device.recentDropdown) return;

    const recent = await getRecentImages(deviceNum);
    device.recentDropdown.innerHTML = "";

    if (recent.length === 0) {
      const emptyItem = document.createElement("div");
      emptyItem.className = "recent-item empty";
      emptyItem.textContent = "No recent images";
      device.recentDropdown.appendChild(emptyItem);
    } else {
      for (const img of recent) {
        const item = document.createElement("div");
        item.className = "recent-item";
        item.textContent = img.filename;
        item.title = img.filename;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          this.loadRecentImageInDevice(deviceNum, img.id);
        });
        device.recentDropdown.appendChild(item);
      }

      const separator = document.createElement("div");
      separator.className = "recent-separator";
      device.recentDropdown.appendChild(separator);

      const clearItem = document.createElement("div");
      clearItem.className = "recent-item recent-clear";
      clearItem.textContent = "Clear Recent";
      clearItem.addEventListener("click", async (e) => {
        e.stopPropagation();
        await clearRecentImages(deviceNum);
        this.closeRecentDropdown();
      });
      device.recentDropdown.appendChild(clearItem);
    }

    // Append library section
    await this._appendLibrarySection(device.recentDropdown, deviceNum);
  }

  async _getLibraryImageData(entry) {
    try {
      const cached = await libraryCacheDb.get(CACHE_STORE, entry.id);
      if (cached) return new Uint8Array(cached.data);
    } catch (err) {
      console.warn("Library cache read failed:", err);
    }

    const resp = await fetch(`/disks/${entry.file}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    try {
      await libraryCacheDb.put(CACHE_STORE, {
        id: entry.id,
        file: entry.file,
        data: arrayBuffer,
      });
    } catch (err) {
      console.warn("Library cache write failed:", err);
    }

    return data;
  }

  async _appendLibrarySection(dropdown, deviceNum) {
    try {
      const resp = await fetch("/disks/library.json");
      if (!resp.ok) return;
      const library = await resp.json();
      const entries = library.filter((e) => e.type === "hard-drive");
      if (entries.length === 0) return;

      const separator = document.createElement("div");
      separator.className = "recent-separator";
      dropdown.appendChild(separator);

      const label = document.createElement("div");
      label.className = "recent-section-label";
      dropdown.appendChild(label);
      label.textContent = "Library";

      for (const entry of entries) {
        const item = document.createElement("div");
        item.className = "recent-item";
        item.textContent = entry.name;
        item.title = entry.description || entry.name;
        item.addEventListener("click", async (e) => {
          e.stopPropagation();
          this.closeRecentDropdown();
          try {
            const data = await this._getLibraryImageData(entry);
            this.loadImageFromData(deviceNum, entry.file, data);
            await saveImageToStorage(deviceNum, entry.file, data);
            await addToRecentImages(deviceNum, entry.file, data);
          } catch (err) {
            console.error(`Failed to load ${entry.file}:`, err);
            showToast(`Failed to load ${entry.name}`, "error");
          }
        });
        dropdown.appendChild(item);
      }
    } catch (err) {
      console.error("Failed to load library:", err);
    }
  }

  async loadRecentImageInDevice(deviceNum, imageId) {
    this.closeRecentDropdown();

    const imageData = await loadRecentImage(imageId);
    if (!imageData) {
      console.error("Failed to load recent HD image");
      return;
    }

    this.loadImageFromData(deviceNum, imageData.filename, imageData.data);
    await saveImageToStorage(deviceNum, imageData.filename, imageData.data);
    await addToRecentImages(deviceNum, imageData.filename, imageData.data);
  }
}
