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

function insertImageToWasm(wasmModule, deviceNum, data, filename) {
  const dataPtr = wasmModule._malloc(data.length);
  wasmModule.HEAPU8.set(data, dataPtr);

  const filenamePtr = wasmModule._malloc(filename.length + 1);
  wasmModule.stringToUTF8(filename, filenamePtr, filename.length + 1);

  const success = wasmModule._insertSmartPortImage(deviceNum, dataPtr, data.length, filenamePtr);

  wasmModule._free(dataPtr);
  wasmModule._free(filenamePtr);

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

    // Save modal
    this.saveModal = null;
    this.saveFilenameInput = null;
    this.pendingEjectDevice = null;
  }

  init() {
    this.canvas = document.getElementById("screen");

    for (let i = 0; i < 2; i++) {
      this.setupDevice(i);
    }

    this.setupSaveModal();

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
    device.nameLabel = container.querySelector(".hd-name");
    device.ledEl = container.querySelector(".hd-led");
    device.infoLabel = container.querySelector(".hd-info");

    if (device.insertBtn) {
      device.insertBtn.addEventListener("click", () => {
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
      device.recentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
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

  setupSaveModal() {
    this.saveModal = document.getElementById("save-hd-modal");
    this.saveFilenameInput = document.getElementById("save-hd-filename");
    const confirmBtn = document.getElementById("save-hd-confirm");
    const cancelBtn = document.getElementById("save-hd-cancel");

    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => this.handleSaveConfirm());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => this.handleSaveCancel());
    }
    if (this.saveModal) {
      this.saveModal.addEventListener("click", (e) => {
        if (e.target === this.saveModal) this.handleSaveCancel();
      });
      this.saveModal.addEventListener("cancel", (e) => {
        e.preventDefault();
        this.handleSaveCancel();
      });
    }
    if (this.saveFilenameInput) {
      this.saveFilenameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.handleSaveConfirm();
      });
    }
  }

  refocusCanvas() {
    if (this.canvas) setTimeout(() => this.canvas.focus(), 0);
  }

  async loadImage(deviceNum, file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      const success = insertImageToWasm(this.wasmModule, deviceNum, data, file.name);

      if (success) {
        this.devices[deviceNum].filename = file.name;
        this.updateDeviceUI(deviceNum);
        console.log(`Inserted HD image in device ${deviceNum + 1}: ${file.name}`);
        await saveImageToStorage(deviceNum, file.name, data);
        await addToRecentImages(deviceNum, file.name, data);
      } else {
        console.error(`Failed to load HD image: ${file.name}`);
        alert(`Failed to load hard drive image: ${file.name}`);
      }
    } catch (error) {
      console.error("Error loading HD image:", error);
      alert("Error loading hard drive image: " + error.message);
    }
  }

  loadImageFromData(deviceNum, filename, data) {
    const success = insertImageToWasm(this.wasmModule, deviceNum, data, filename);
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

    // Check if modified
    if (this.wasmModule._isSmartPortImageModified &&
        this.wasmModule._isSmartPortImageModified(deviceNum)) {
      this.showSaveModal(deviceNum);
      return;
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

  showSaveModal(deviceNum) {
    this.pendingEjectDevice = deviceNum;
    let defaultName = this.devices[deviceNum].filename || `harddrive${deviceNum + 1}.hdv`;
    if (!defaultName.includes(".")) defaultName += ".hdv";

    if (this.saveFilenameInput) this.saveFilenameInput.value = defaultName;
    if (this.saveModal) {
      this.saveModal.showModal();
      if (this.saveFilenameInput) {
        this.saveFilenameInput.focus();
        const dotIndex = defaultName.lastIndexOf(".");
        if (dotIndex > 0) {
          this.saveFilenameInput.setSelectionRange(0, dotIndex);
        } else {
          this.saveFilenameInput.select();
        }
      }
    }
  }

  hideSaveModal() {
    if (this.saveModal && this.saveModal.open) this.saveModal.close();
    this.pendingEjectDevice = null;
  }

  async handleSaveConfirm() {
    if (this.pendingEjectDevice === null) return;
    const deviceNum = this.pendingEjectDevice;
    const filename = this.saveFilenameInput?.value || `harddrive${deviceNum + 1}.hdv`;
    this.hideSaveModal();

    // Export and save via file picker
    try {
      const sizePtr = this.wasmModule._malloc(4);
      const dataPtr = this.wasmModule._getSmartPortImageData(deviceNum, sizePtr);
      const size = new DataView(this.wasmModule.HEAPU8.buffer).getUint32(sizePtr, true);
      this.wasmModule._free(sizePtr);

      if (dataPtr && size > 0) {
        const data = new Uint8Array(this.wasmModule.HEAPU8.buffer, dataPtr, size);
        const blob = new Blob([data], { type: "application/octet-stream" });

        if (window.showSaveFilePicker) {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: "Hard Drive Image", accept: { "application/octet-stream": [".hdv", ".po", ".2mg"] } }],
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

    this.performEject(deviceNum);
  }

  handleSaveCancel() {
    if (this.pendingEjectDevice === null) return;
    const deviceNum = this.pendingEjectDevice;
    this.hideSaveModal();
    this.performEject(deviceNum);
  }

  updateDeviceUI(deviceNum) {
    const device = this.devices[deviceNum];
    if (device.nameLabel) {
      device.nameLabel.textContent = device.filename || "No Image";
    }
    if (device.ejectBtn) {
      device.ejectBtn.disabled = !device.filename;
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

  updateLEDs() {
    if (!this.wasmModule._getSmartPortActivity) return;

    const hasActivity = this.wasmModule._getSmartPortActivity(0);
    const isWrite = this.wasmModule._getSmartPortActivityWrite(0);

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

  syncWithEmulatorState() {
    for (let deviceNum = 0; deviceNum < 2; deviceNum++) {
      const hasDisk = this.wasmModule._isSmartPortImageInserted &&
                      this.wasmModule._isSmartPortImageInserted(deviceNum);
      if (hasDisk) {
        const filenamePtr = this.wasmModule._getSmartPortImageFilename(deviceNum);
        let filename = "Restored Image";
        if (filenamePtr) {
          filename = this.wasmModule.UTF8ToString(filenamePtr);
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
