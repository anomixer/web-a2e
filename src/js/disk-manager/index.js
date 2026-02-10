/*
 * index.js - Disk manager subsystem initialization and exports
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { DriveSounds } from "./drive-sounds.js";
import { showToast } from "../ui/toast.js";
import { DiskSurfaceRenderer } from "./disk-surface-renderer.js";
import {
  loadDisk,
  loadDiskFromData,
  insertBlankDisk,
  ejectDisk,
  performEject,
  saveDiskWithPicker,
} from "./disk-operations.js";
import {
  loadDiskFromStorage,
  getRecentDisks,
  loadRecentDisk,
  addToRecentDisks,
  clearRecentDisks,
} from "./disk-persistence.js";

/**
 * Create a new drive state object with default values
 * @returns {Object} Drive state object
 */
function createDriveState() {
  return {
    input: null,
    insertBtn: null,
    blankBtn: null,
    ejectBtn: null,
    browseBtn: null,
    recentBtn: null,
    recentDropdown: null,
    nameLabel: null,
    trackLabel: null,
    filename: null,
    lastTrack: -1,
    surfaceRenderer: null,
    trackAccessCounts: null,
    lastHeadPosition: -1,
    maxAccessCount: 0,
    lastDecayTime: 0,
  };
}

export class DiskManager {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.drives = [createDriveState(), createDriveState()];

    // Save modal state
    this.pendingEjectDrive = null;
    this.saveModal = null;
    this.saveFilenameInput = null;

    // Canvas for focus management
    this.canvas = null;

    // Active recent disks dropdown
    this.activeDropdown = null;

    // Drive sounds
    this.sounds = new DriveSounds();

    // Callback for when a disk is loaded
    this.onDiskLoaded = null;

    // File explorer reference (set by main.js)
    this.fileExplorer = null;

    // Set by main.js so surface rendering can be skipped when hidden
    this.drivesWindowVisible = true;
  }

  init() {
    // Get canvas for focus management
    this.canvas = document.getElementById("screen");

    // Set up drive 1
    this.setupDrive(0, "disk1");

    // Set up drive 2
    this.setupDrive(1, "disk2");

    // Set up drag and drop on the display
    this.setupDragDrop();

    // Set up save modal
    this.setupSaveModal();

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (this.activeDropdown && !e.target.closest(".recent-container")) {
        this.closeRecentDropdown();
      }
    });

    // Restore any persisted disks from previous session
    this.restoreDisks();
  }

  /**
   * Restore disks from IndexedDB that were inserted in a previous session
   */
  async restoreDisks() {
    for (let driveNum = 0; driveNum < 2; driveNum++) {
      try {
        const diskData = await loadDiskFromStorage(driveNum);
        if (diskData) {
          const drive = this.drives[driveNum];
          loadDiskFromData({
            wasmModule: this.wasmModule,
            drive,
            driveNum,
            filename: diskData.filename,
            data: diskData.data,
            onSuccess: (filename) => {
              this.setDiskName(driveNum, filename);
              if (this.onDiskLoaded) this.onDiskLoaded(driveNum, filename);
            },
            onError: (error) =>
              console.error(
                `Failed to restore disk in drive ${driveNum + 1}:`,
                error,
              ),
          });
        }
      } catch (error) {
        console.error(`Error restoring disk for drive ${driveNum + 1}:`, error);
      }
    }
  }

  refocusCanvas() {
    if (this.canvas) {
      setTimeout(() => this.canvas.focus(), 0);
    }
  }

  setupDrive(driveNum, elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;

    const drive = this.drives[driveNum];
    drive.input = container.querySelector(`#${elementId}-input`);
    drive.insertBtn = container.querySelector(".disk-insert");
    drive.blankBtn = container.querySelector(".disk-blank");
    drive.ejectBtn = container.querySelector(".disk-eject");
    drive.browseBtn = container.querySelector(".disk-browse");
    drive.recentBtn = container.querySelector(".disk-recent");
    drive.recentDropdown = container.querySelector(".recent-dropdown");
    drive.nameLabel = container.querySelector(".disk-name");
    drive.trackLabel = container.querySelector(".disk-track");
    const surfaceCanvas = container.querySelector(".disk-surface");
    if (surfaceCanvas) {
      drive.surfaceRenderer = new DiskSurfaceRenderer(surfaceCanvas);
      drive.trackAccessCounts = new Uint32Array(35);
    }

    // Insert button click
    if (drive.insertBtn) {
      drive.insertBtn.addEventListener("click", () => {
        drive.input.click();
      });
    }

    // Blank disk button click
    if (drive.blankBtn) {
      drive.blankBtn.addEventListener("click", () => {
        this.insertBlankDisk(driveNum);
        this.refocusCanvas();
      });
    }

    // Recent button click
    if (drive.recentBtn) {
      drive.recentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleRecentDropdown(driveNum);
      });
    }

    // File input change
    if (drive.input) {
      drive.input.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
          this.loadDisk(driveNum, e.target.files[0]);
        }
        this.refocusCanvas();
      });
    }

    // Eject button click
    if (drive.ejectBtn) {
      drive.ejectBtn.addEventListener("click", () => {
        this.ejectDisk(driveNum);
        this.refocusCanvas();
      });
    }

    // Browse button click
    if (drive.browseBtn) {
      drive.browseBtn.addEventListener("click", () => {
        if (this.fileExplorer) {
          this.fileExplorer.showFloppyDisk(driveNum);
        }
        this.refocusCanvas();
      });
    }
  }

  setupDragDrop() {
    const displayContainer = document.getElementById("monitor-frame");
    if (!displayContainer) return;

    displayContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      displayContainer.classList.add("drag-over");
    });

    displayContainer.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      displayContainer.classList.remove("drag-over");
    });

    displayContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      displayContainer.classList.remove("drag-over");

      if (e.dataTransfer.files.length > 0) {
        // Load into first empty drive, or drive 1 if both full
        const driveNum = !this.drives[0].filename
          ? 0
          : !this.drives[1].filename
            ? 1
            : 0;
        this.loadDisk(driveNum, e.dataTransfer.files[0]);
      }
    });
  }

  setupSaveModal() {
    this.saveModal = document.getElementById("save-disk-modal");
    this.saveFilenameInput = document.getElementById("save-disk-filename");
    const confirmBtn = document.getElementById("save-disk-confirm");
    const cancelBtn = document.getElementById("save-disk-cancel");

    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        this.handleSaveConfirm();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        this.handleSaveCancel();
      });
    }

    // Handle click on backdrop (::backdrop) to close
    if (this.saveModal) {
      this.saveModal.addEventListener("click", (e) => {
        // Close if clicking on the dialog itself (backdrop area)
        if (e.target === this.saveModal) {
          this.handleSaveCancel();
        }
      });

      // Handle native cancel event (Escape key)
      this.saveModal.addEventListener("cancel", (e) => {
        e.preventDefault(); // Prevent default close to handle our own logic
        this.handleSaveCancel();
      });
    }

    // Handle Enter key in filename input
    if (this.saveFilenameInput) {
      this.saveFilenameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this.handleSaveConfirm();
        }
        // Escape is now handled by native dialog cancel event
      });
    }
  }

  showSaveModal(driveNum) {
    const drive = this.drives[driveNum];
    this.pendingEjectDrive = driveNum;

    // Set default filename based on current disk name
    let defaultName = drive.filename || `disk${driveNum + 1}.dsk`;
    // Ensure it has an extension
    if (!defaultName.includes(".")) {
      defaultName += ".dsk";
    }

    if (this.saveFilenameInput) {
      this.saveFilenameInput.value = defaultName;
    }

    if (this.saveModal) {
      this.saveModal.showModal();
      // Focus the input and select the filename (without extension)
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
    if (this.saveModal && this.saveModal.open) {
      this.saveModal.close();
    }
    this.pendingEjectDrive = null;
  }

  async handleSaveConfirm() {
    if (this.pendingEjectDrive === null) return;

    const driveNum = this.pendingEjectDrive;
    const defaultFilename =
      this.saveFilenameInput?.value || `disk${driveNum + 1}.dsk`;

    this.hideSaveModal();

    // Try to save with file picker
    const saved = await saveDiskWithPicker(
      this.wasmModule,
      driveNum,
      defaultFilename,
    );

    // Always eject after save attempt (user may have cancelled picker)
    this.performEject(driveNum);

    if (saved) {
      console.log(`Disk saved successfully`);
    }
  }

  handleSaveCancel() {
    if (this.pendingEjectDrive === null) return;

    const driveNum = this.pendingEjectDrive;
    this.hideSaveModal();
    this.performEject(driveNum);
  }

  /**
   * Set the disk name label with scrolling animation if the name is too long
   */
  setDiskName(driveNum, name) {
    const drive = this.drives[driveNum];
    if (!drive.nameLabel) return;

    // Create inner span for the text if it doesn't exist
    let textSpan = drive.nameLabel.querySelector(".disk-name-text");
    if (!textSpan) {
      textSpan = document.createElement("span");
      textSpan.className = "disk-name-text";
      drive.nameLabel.innerHTML = "";
      drive.nameLabel.appendChild(textSpan);
    }

    // Set the text
    textSpan.textContent = name;

    // Remove scrolling class initially
    drive.nameLabel.classList.remove("scrolling");

    // Check if text overflows after a brief delay to allow rendering
    requestAnimationFrame(() => {
      const containerWidth = drive.nameLabel.offsetWidth;
      const textWidth = textSpan.offsetWidth;

      if (textWidth > containerWidth) {
        // Calculate scroll distance (negative to scroll left)
        const scrollDistance = containerWidth - textWidth;

        // Calculate duration based on text length (roughly 40px per second)
        const duration = Math.max(3, Math.abs(scrollDistance) / 40);

        // Set CSS custom properties for the animation
        drive.nameLabel.style.setProperty(
          "--scroll-distance",
          `${scrollDistance}px`,
        );
        drive.nameLabel.style.setProperty("--scroll-duration", `${duration}s`);

        // Enable scrolling
        drive.nameLabel.classList.add("scrolling");
      }
    });
  }

  // Disk operations - delegate to disk-operations module

  async loadDisk(driveNum, file) {
    const drive = this.drives[driveNum];
    await loadDisk({
      wasmModule: this.wasmModule,
      drive,
      driveNum,
      file,
      onSuccess: (filename) => {
        this.setDiskName(driveNum, filename);
        if (this.onDiskLoaded) this.onDiskLoaded(driveNum, filename);
      },
      onError: (error) => showToast(error, "error"),
    });
  }

  insertBlankDisk(driveNum) {
    const drive = this.drives[driveNum];
    insertBlankDisk({
      wasmModule: this.wasmModule,
      drive,
      driveNum,
      onSuccess: (filename) => this.setDiskName(driveNum, filename),
      onError: (error) => showToast(error, "error"),
    });
  }

  async ejectDisk(driveNum) {
    const drive = this.drives[driveNum];
    await ejectDisk({
      wasmModule: this.wasmModule,
      drive,
      driveNum,
      onEject: () => {
        this.setDiskName(driveNum, "No Disk");
        this._resetDriveVisuals(driveNum);
      },
    });
  }

  performEject(driveNum) {
    const drive = this.drives[driveNum];
    performEject({
      wasmModule: this.wasmModule,
      drive,
      driveNum,
      onEject: () => {
        this.setDiskName(driveNum, "No Disk");
        this._resetDriveVisuals(driveNum);
      },
    });
  }

  // Drive state and LED updates

  updateLEDs() {
    // Update drive images and track display based on motor state
    if (!this.wasmModule._getDiskMotorOn) return;

    const selectedDrive = this.wasmModule._getSelectedDrive
      ? this.wasmModule._getSelectedDrive()
      : 0;

    // Check if any motor is running for motor sound
    const anyMotorOn =
      this.wasmModule._getDiskMotorOn(0) || this.wasmModule._getDiskMotorOn(1);
    if (anyMotorOn && !this.sounds.motorRunning) {
      this.sounds.startMotorSound();
    } else if (!anyMotorOn && this.sounds.motorRunning) {
      this.sounds.stopMotorSound();
    }

    for (let driveNum = 0; driveNum < 2; driveNum++) {
      const drive = this.drives[driveNum];
      const motorOn = this.wasmModule._getDiskMotorOn(driveNum);
      const isActive = motorOn && driveNum === selectedDrive;
      const hasDisk = drive.filename !== null;

      // Update track display and check for seek
      let track = 0;
      let quarterTrack = 0;
      let isWriteMode = false;
      if (drive.trackLabel) {
        if (hasDisk && this.wasmModule._getDiskTrack) {
          track = this.wasmModule._getDiskTrack(driveNum);
          drive.trackLabel.textContent = `T${track.toString().padStart(2, "0")}`;

          // Check for track change and play seek sound (only on whole track changes)
          if (isActive && drive.lastTrack >= 0 && track !== drive.lastTrack) {
            this.sounds.playSeekSound();
          }
          drive.lastTrack = track;

          // Highlight when motor is on and this drive is selected
          if (isActive) {
            drive.trackLabel.classList.add("active");
          } else {
            drive.trackLabel.classList.remove("active");
          }

          // Update heatmap tracking
          if (isActive && drive.trackAccessCounts) {
            const clampedTrack = Math.min(track, 34);
            drive.trackAccessCounts[clampedTrack]++;
            if (drive.trackAccessCounts[clampedTrack] > drive.maxAccessCount) {
              drive.maxAccessCount = drive.trackAccessCounts[clampedTrack];
            }
          }

          // Decay track highlights every 200ms
          const now = performance.now();
          if (drive.trackAccessCounts && now - drive.lastDecayTime > 100) {
            drive.lastDecayTime = now;
            let newMax = 0;
            for (let t = 0; t < 35; t++) {
              if (drive.trackAccessCounts[t] > 0) {
                drive.trackAccessCounts[t] = Math.floor(
                  drive.trackAccessCounts[t] * 0.8,
                );
                if (drive.trackAccessCounts[t] > newMax) {
                  newMax = drive.trackAccessCounts[t];
                }
              }
            }
            drive.maxAccessCount = newMax;
          }

          // Get head position
          if (this.wasmModule._getDiskHeadPosition) {
            quarterTrack = this.wasmModule._getDiskHeadPosition(driveNum);
            drive.lastHeadPosition = quarterTrack;
          }

          // Get write mode
          if (this.wasmModule._getDiskWriteMode) {
            isWriteMode = this.wasmModule._getDiskWriteMode(driveNum);
          }
        } else {
          drive.trackLabel.textContent = "T--";
          drive.trackLabel.classList.remove("active");
          drive.lastTrack = -1;
        }
      }

      // Update surface renderer (skip when window is hidden)
      if (drive.surfaceRenderer && this.drivesWindowVisible) {
        const diskColor =
          hasDisk && drive.filename
            ? this._getStickerColor(drive.filename)
            : null;

        drive.surfaceRenderer.update({
          hasDisk,
          isActive,
          isWriteMode,
          quarterTrack,
          track,
          trackAccessCounts: drive.trackAccessCounts,
          maxAccessCount: drive.maxAccessCount,
          diskColor,
          timestamp: performance.now(),
        });
      }
    }
  }

  // Sound control - delegate to DriveSounds

  setSeekSoundEnabled(enabled) {
    this.sounds.setSeekSoundEnabled(enabled);
  }

  setSeekVolume(volume) {
    this.sounds.setSeekVolume(volume);
  }

  setMotorSoundEnabled(enabled) {
    this.sounds.setMotorSoundEnabled(enabled);
  }

  setMotorVolume(volume) {
    this.sounds.setMotorVolume(volume);
  }

  setMasterVolume(volume) {
    this.sounds.setMasterVolume(volume);
  }

  // Recent disks dropdown

  /**
   * Toggle the recent disks dropdown for a drive
   */
  async toggleRecentDropdown(driveNum) {
    const drive = this.drives[driveNum];
    if (!drive.recentDropdown) return;

    // Close any other open dropdown
    if (this.activeDropdown && this.activeDropdown !== drive.recentDropdown) {
      this.closeRecentDropdown();
    }

    if (drive.recentDropdown.classList.contains("open")) {
      this.closeRecentDropdown();
    } else {
      await this.populateRecentDropdown(driveNum);
      drive.recentDropdown.classList.add("open");
      this.activeDropdown = drive.recentDropdown;
    }
  }

  /**
   * Close the currently open dropdown
   */
  closeRecentDropdown() {
    if (this.activeDropdown) {
      this.activeDropdown.classList.remove("open");
      this.activeDropdown = null;
    }
    this.refocusCanvas();
  }

  /**
   * Populate the recent disks dropdown
   */
  async populateRecentDropdown(driveNum) {
    const drive = this.drives[driveNum];
    if (!drive.recentDropdown) return;

    const recentDisks = await getRecentDisks(driveNum);

    drive.recentDropdown.innerHTML = "";

    if (recentDisks.length === 0) {
      const emptyItem = document.createElement("div");
      emptyItem.className = "recent-item empty";
      emptyItem.textContent = "No recent disks";
      drive.recentDropdown.appendChild(emptyItem);
    } else {
      for (const disk of recentDisks) {
        const item = document.createElement("div");
        item.className = "recent-item";
        item.textContent = disk.filename;
        item.title = disk.filename;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          this.loadRecentDiskInDrive(driveNum, disk.id);
        });
        drive.recentDropdown.appendChild(item);
      }

      // Add separator and clear option
      const separator = document.createElement("div");
      separator.className = "recent-separator";
      drive.recentDropdown.appendChild(separator);

      const clearItem = document.createElement("div");
      clearItem.className = "recent-item recent-clear";
      clearItem.textContent = "Clear Recent";
      clearItem.addEventListener("click", async (e) => {
        e.stopPropagation();
        await clearRecentDisks(driveNum);
        this.closeRecentDropdown();
      });
      drive.recentDropdown.appendChild(clearItem);
    }
  }

  /**
   * Load a recent disk into a drive
   */
  async loadRecentDiskInDrive(driveNum, diskId) {
    this.closeRecentDropdown();

    const diskData = await loadRecentDisk(diskId);
    if (!diskData) {
      console.error("Failed to load recent disk");
      return;
    }

    const drive = this.drives[driveNum];
    loadDiskFromData({
      wasmModule: this.wasmModule,
      drive,
      driveNum,
      filename: diskData.filename,
      data: diskData.data,
      onSuccess: (filename) => {
        this.setDiskName(driveNum, filename);
        if (this.onDiskLoaded) this.onDiskLoaded(driveNum, filename);
      },
      onError: (error) => showToast(error, "error"),
    });

    // Update access time by re-adding to recent list
    addToRecentDisks(driveNum, diskData.filename, diskData.data);
  }

  /**
   * Sync UI with emulator state after a state restore
   * This updates the drive displays to show any disks loaded from the state snapshot
   */
  syncWithEmulatorState() {
    for (let driveNum = 0; driveNum < 2; driveNum++) {
      const drive = this.drives[driveNum];
      const hasDisk = this.wasmModule._isDiskInserted(driveNum);

      if (hasDisk) {
        // Get filename from emulator
        const filenamePtr = this.wasmModule._getDiskFilename(driveNum);
        let filename = "Restored Disk";
        if (filenamePtr) {
          filename = this.wasmModule.UTF8ToString(filenamePtr);
        }

        drive.filename = filename;
        if (drive.ejectBtn) drive.ejectBtn.disabled = false;
        if (drive.browseBtn) drive.browseBtn.disabled = false;
        this.setDiskName(driveNum, filename);
        console.log(`Synced drive ${driveNum + 1}: ${filename}`);
      } else {
        // No disk in drive
        drive.filename = null;
        if (drive.ejectBtn) drive.ejectBtn.disabled = true;
        if (drive.browseBtn) drive.browseBtn.disabled = true;
        if (drive.input) drive.input.value = "";
        this.setDiskName(driveNum, "No Disk");
      }
    }
  }

  // Visual enhancement methods

  /**
   * Reset visual enhancements for a drive on eject
   */
  _resetDriveVisuals(driveNum) {
    const drive = this.drives[driveNum];

    // Reset track access data
    if (drive.trackAccessCounts) {
      drive.trackAccessCounts.fill(0);
      drive.maxAccessCount = 0;
      drive.lastHeadPosition = -1;
    }

    // Reset surface renderer
    if (drive.surfaceRenderer) {
      drive.surfaceRenderer.reset();
    }
  }

  /**
   * Derive a sticker color from a filename hash
   * Returns one of 8 vintage label colors
   */
  _getStickerColor(filename) {
    const colors = [
      "#f5f0d0", // cream
      "#e8d8a0", // manila
      "#c8e6c0", // pale green
      "#b8d4e8", // pale blue
      "#f0c0c8", // pink
      "#f0e8a0", // yellow
      "#d0c8e8", // lavender
      "#f0ece8", // white
    ];
    let hash = 0;
    for (let i = 0; i < filename.length; i++) {
      hash = ((hash << 5) - hash + filename.charCodeAt(i)) | 0;
    }
    return colors[Math.abs(hash) % colors.length];
  }
}
