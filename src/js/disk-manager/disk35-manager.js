/*
 * disk35-manager.js - A IIgs's 3.5" drives
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createImageStore } from "./hard-drive-persistence.js";
import { showToast } from "../ui/toast.js";
import { DiskSurfaceRenderer, THREE_AND_A_HALF } from "./disk-surface-renderer.js";

/*
 * The two 3.5" drives on a IIgs's IWM. An 800K or 400K block image, a 2MG
 * holding one, or a 3.5" WOZ goes in; the core encodes a block image onto the
 * disk as the drive would record it and decodes it back when it is saved, so
 * what comes out is the format that went in.
 *
 * Unlike the SmartPort's units these are drives the machine controls: GS/OS
 * ejects a disk itself (the Finder's Eject, or an installer asking for the
 * next disk). The core keeps an ejected disk until the host has dealt with
 * it, and this puts it into Recent, changes and all, so nothing written to it
 * is lost however it left the drive.
 */

const store = createImageStore("a2e-35-persistence", "3.5\"");

const DRIVES = 2;

async function readHeap(wasm, exportFn, drive) {
  const sizePtr = await wasm._malloc(4);
  try {
    const dataPtr = await wasm[exportFn](drive, sizePtr);
    const size = await wasm.heapDataViewU32(sizePtr);
    if (!dataPtr || size <= 0) return null;
    return await wasm.heapRead(dataPtr, size);
  } finally {
    wasm._free(sizePtr);
  }
}

export class Disk35Manager {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.drives = Array.from({ length: DRIVES }, () => ({
      filename: null,
      trackAccessCounts: new Array(80).fill(0),
      maxAccessCount: 0,
    }));
    /** Set by main.js so the surfaces are not drawn while nobody can see them */
    this.windowVisible = false;
    this.activeDropdown = null;
    this.canvas = null;
    /** @type {boolean} The URL names media, so restore nothing at all */
    this.skipRestore = false;
    this.isRunningCallback = null;
  }

  init() {
    this.canvas = document.getElementById("screen");
    for (let i = 0; i < DRIVES; i++) this._setupDrive(i);
    document.addEventListener("click", (e) => {
      if (this.activeDropdown && !e.target.closest("#disk35-drives .recent-container")) {
        this.closeRecentDropdown();
      }
    });
  }

  _setupDrive(driveNum) {
    const container = document.getElementById(`d35-drive${driveNum}`);
    if (!container) return;
    const drive = this.drives[driveNum];
    drive.input = container.querySelector(`#d35-drive${driveNum}-input`);
    drive.ejectBtn = container.querySelector(".disk-eject");
    drive.nameLabel = container.querySelector(".disk-name");
    drive.trackLabel = container.querySelector(".disk-track");
    drive.recentDropdown = container.querySelector(".recent-dropdown");
    const canvas = container.querySelector(".disk-surface");
    if (canvas) drive.surface = new DiskSurfaceRenderer(canvas, THREE_AND_A_HALF);

    container.querySelector(".disk-insert")?.addEventListener("click", async () => {
      if (!(await this.hasDrives())) {
        showToast("Only a IIgs has 3.5\" drives. Switch machine to use one.", "warning");
        return;
      }
      drive.input?.click();
    });
    drive.input?.addEventListener("change", (e) => {
      if (e.target.files.length > 0) this.loadImage(driveNum, e.target.files[0]);
      e.target.value = "";
      this.refocusCanvas();
    });
    container.querySelector(".disk-recent")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleRecentDropdown(driveNum);
    });
    drive.ejectBtn?.addEventListener("click", () => {
      this.ejectImage(driveNum);
      this.refocusCanvas();
    });
  }

  async hasDrives() {
    return !!(this.wasmModule._has35Drives && (await this.wasmModule._has35Drives()));
  }

  refocusCanvas() {
    if (this.canvas) setTimeout(() => this.canvas.focus(), 0);
  }

  async _insert(driveNum, data, filename) {
    const wasm = this.wasmModule;
    const dataPtr = await wasm._malloc(data.length);
    await wasm.heapWrite(dataPtr, data);
    const nameBytes = filename.length * 3 + 1;
    const namePtr = await wasm._malloc(nameBytes);
    await wasm.stringToUTF8(filename, namePtr, nameBytes);
    const ok = await wasm._insert35Disk(driveNum, dataPtr, data.length, namePtr);
    wasm._free(dataPtr);
    wasm._free(namePtr);
    return ok;
  }

  async loadImage(driveNum, file) {
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      if (await this.loadImageFromData(driveNum, file.name, data)) {
        await store.saveImageToStorage(driveNum, file.name, data);
        await store.addToRecentImages(driveNum, file.name, data);
      }
    } catch (error) {
      console.error("Error loading 3.5\" disk:", error);
      showToast(`Error loading 3.5" disk: ${error.message}`, "error");
    }
  }

  /** Insert without persisting: a restore, a recent, or a link. */
  async loadImageFromData(driveNum, filename, data) {
    const ok = await this._insert(driveNum, data, filename);
    if (ok) {
      const drive = this.drives[driveNum];
      drive.filename = filename;
      drive.trackAccessCounts.fill(0);
      drive.maxAccessCount = 0;
      this.updateDriveUI(driveNum);
    } else {
      showToast(
        `${filename} is not a 3.5" disk: an 800K or 400K image, a 2MG holding one, or a 3.5" WOZ.`,
        "error",
      );
    }
    return ok;
  }

  async ejectImage(driveNum) {
    const drive = this.drives[driveNum];
    if (!drive.filename) return;
    if (await this.wasmModule._is35DiskModified(driveNum)) {
      const data = await readHeap(this.wasmModule, "_export35Disk", driveNum);
      if (data) await this._offerSave(drive.filename, data);
    }
    this.wasmModule._eject35Disk(driveNum);
    drive.filename = null;
    this.updateDriveUI(driveNum);
    store.clearImageFromStorage(driveNum);
  }

  async _offerSave(filename, data) {
    const blob = new Blob([data], { type: "application/octet-stream" });
    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: "3.5\" Disk Image",
            accept: { "application/octet-stream": [".po", ".2mg", ".dsk", ".hdv", ".img", ".woz"] },
          }],
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
    } catch (error) {
      if (error.name !== "AbortError") console.error("Error saving 3.5\" disk:", error);
    }
  }

  /**
   * A disk the machine ejected: into Recent as it now is, and the drive's
   * saved image forgotten, since the drive is empty.
   */
  async _takeEjected(driveNum) {
    const drive = this.drives[driveNum];
    const filename = drive.filename || `disk${driveNum + 1}.po`;
    const data = await readHeap(this.wasmModule, "_export35Ejected", driveNum);
    this.wasmModule._clear35Ejected(driveNum);
    if (data) await store.addToRecentImages(driveNum, filename, data);
    drive.filename = null;
    this.updateDriveUI(driveNum);
    store.clearImageFromStorage(driveNum);
    showToast(`${filename} ejected from 3.5" drive ${driveNum + 1}. It is in Recent.`, "info", 3000);
  }

  updateDriveUI(driveNum) {
    const drive = this.drives[driveNum];
    if (drive.nameLabel) {
      drive.nameLabel.textContent = drive.filename || "No Disk";
      drive.nameLabel.title = drive.filename || "";
    }
    if (drive.ejectBtn) drive.ejectBtn.disabled = !drive.filename;
    if (!drive.filename) {
      if (drive.trackLabel) {
        drive.trackLabel.textContent = "T--";
        drive.trackLabel.classList.remove("active");
      }
      drive.surface?.reset();
    }
  }

  /**
   * The disks turning, the head's track and side, and a disk the machine
   * ejected. ~15 times a second from the render loop: one batched round
   * trip, and nothing at all when no disk is in either drive.
   */
  async updateLEDs() {
    if (this._updatePending) return;
    const anyMounted = this.drives.some((d) => d.filename);
    const running = this.isRunningCallback ? this.isRunningCallback() : true;
    if (!anyMounted || !running) {
      if (this.windowVisible) this._drawSurfaces([false, false]);
      return;
    }
    let state;
    this._updatePending = true;
    try {
      state = await this.wasmModule.batch([
        ["_is35MotorOn", 0],
        ["_is35MotorOn", 1],
        ["_get35DiskTrack", 0],
        ["_get35DiskTrack", 1],
        ["_get35DiskSide", 0],
        ["_get35DiskSide", 1],
        ["_has35Ejected", 0],
        ["_has35Ejected", 1],
      ]);
    } finally {
      this._updatePending = false;
    }
    for (let i = 0; i < DRIVES; i++) {
      const drive = this.drives[i];
      if (state[6 + i] && drive.filename) {
        await this._takeEjected(i);
        continue;
      }
      if (!drive.filename) continue;
      const spinning = !!state[i];
      drive.track = state[2 + i];
      drive.side = state[4 + i];
      // Where the head has been, warming the tracks it reads.
      if (spinning) {
        const count = ++drive.trackAccessCounts[drive.track];
        if (count > drive.maxAccessCount) drive.maxAccessCount = count;
      }
      if (drive.trackLabel) {
        const text = `T${String(drive.track).padStart(2, "0")} S${drive.side}`;
        if (drive.trackLabel.textContent !== text) drive.trackLabel.textContent = text;
        drive.trackLabel.classList.toggle("active", spinning);
      }
      drive.spinning = spinning;
    }
    if (this.windowVisible) this._drawSurfaces(this.drives.map((d) => !!d.spinning));
  }

  _drawSurfaces(spinning) {
    const now = performance.now();
    this.drives.forEach((drive, i) => {
      drive.surface?.update({
        hasDisk: !!drive.filename,
        isActive: spinning[i] && !!drive.filename,
        isWriteMode: false,
        quarterTrack: drive.track ?? 0,
        track: drive.track ?? 0,
        trackAccessCounts: drive.trackAccessCounts,
        maxAccessCount: drive.maxAccessCount,
        diskColor: null,
        timestamp: now,
      });
    });
  }

  /** Put back the disks from the last visit, into drives that are empty. */
  async restoreImages() {
    if (this.skipRestore || !(await this.hasDrives())) return;
    for (let driveNum = 0; driveNum < DRIVES; driveNum++) {
      if (await this.wasmModule._is35DiskInserted(driveNum)) continue;
      const saved = await store.loadImageFromStorage(driveNum);
      if (saved) await this.loadImageFromData(driveNum, saved.filename, saved.data);
    }
  }

  /** The UI from the core: after a state restore or a change of machine. */
  async syncWithEmulatorState() {
    const has = await this.hasDrives();
    for (let driveNum = 0; driveNum < DRIVES; driveNum++) {
      let filename = null;
      if (has && (await this.wasmModule._is35DiskInserted(driveNum))) {
        filename = (await this.wasmModule.callString("_get35DiskFilename", driveNum)) || "Restored Disk";
      }
      this.drives[driveNum].filename = filename;
      this.updateDriveUI(driveNum);
    }
  }

  // ===== Recent =====

  async toggleRecentDropdown(driveNum) {
    const dropdown = this.drives[driveNum].recentDropdown;
    if (!dropdown) return;
    if (this.activeDropdown && this.activeDropdown !== dropdown) this.closeRecentDropdown();
    if (dropdown.classList.contains("open")) {
      this.closeRecentDropdown();
      return;
    }
    await this._populateRecent(driveNum);
    dropdown.classList.add("open");
    this.activeDropdown = dropdown;
  }

  closeRecentDropdown() {
    this.activeDropdown?.classList.remove("open");
    this.activeDropdown = null;
    this.refocusCanvas();
  }

  async _populateRecent(driveNum) {
    const dropdown = this.drives[driveNum].recentDropdown;
    const recent = await store.getRecentImages(driveNum);
    dropdown.innerHTML = "";
    const item = (text, className, onClick) => {
      const el = document.createElement("div");
      el.className = className;
      el.textContent = text;
      el.title = text;
      if (onClick) {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onClick();
        });
      }
      dropdown.appendChild(el);
    };
    if (recent.length === 0) {
      item("No recent disks", "recent-item empty");
      return;
    }
    for (const entry of recent) {
      item(entry.filename, "recent-item", () => this._loadRecent(driveNum, entry.id));
    }
    const separator = document.createElement("div");
    separator.className = "recent-separator";
    dropdown.appendChild(separator);
    item("Clear Recent", "recent-item recent-clear", async () => {
      await store.clearRecentImages(driveNum);
      this.closeRecentDropdown();
    });
  }

  async _loadRecent(driveNum, id) {
    this.closeRecentDropdown();
    if (!(await this.hasDrives())) {
      showToast("Only a IIgs has 3.5\" drives. Switch machine to use one.", "warning");
      return;
    }
    const saved = await store.loadRecentImage(id);
    if (!saved) return;
    if (await this.loadImageFromData(driveNum, saved.filename, saved.data)) {
      await store.saveImageToStorage(driveNum, saved.filename, saved.data);
      await store.addToRecentImages(driveNum, saved.filename, saved.data);
    }
  }
}
