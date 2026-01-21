// Disk Manager for Apple //e Emulator
// Main orchestrator for disk drive operations

import { DriveSounds } from "./drive-sounds.js";
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

export class DiskManager {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.drives = [
      {
        input: null,
        insertBtn: null,
        blankBtn: null,
        ejectBtn: null,
        recentBtn: null,
        recentDropdown: null,
        image: null,
        nameLabel: null,
        trackLabel: null,
        filename: null,
        lastTrack: -1,
      },
      {
        input: null,
        insertBtn: null,
        blankBtn: null,
        ejectBtn: null,
        recentBtn: null,
        recentDropdown: null,
        image: null,
        nameLabel: null,
        trackLabel: null,
        filename: null,
        lastTrack: -1,
      },
    ];

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
          loadDiskFromData(
            this.wasmModule,
            drive,
            driveNum,
            diskData.filename,
            diskData.data,
            (filename) => {
              this.setDiskName(driveNum, filename);
              if (this.onDiskLoaded) this.onDiskLoaded(driveNum, filename);
            },
            (error) => console.error(`Failed to restore disk in drive ${driveNum + 1}:`, error),
          );
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
    drive.recentBtn = container.querySelector(".disk-recent");
    drive.recentDropdown = container.querySelector(".recent-dropdown");
    drive.image = container.querySelector(".drive-image");
    drive.nameLabel = container.querySelector(".disk-name");
    drive.trackLabel = container.querySelector(".disk-track");

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
    await loadDisk(
      this.wasmModule,
      drive,
      driveNum,
      file,
      (filename) => {
        this.setDiskName(driveNum, filename);
        if (this.onDiskLoaded) this.onDiskLoaded(driveNum, filename);
      },
      (error) => alert(error),
    );
  }

  insertBlankDisk(driveNum) {
    const drive = this.drives[driveNum];
    insertBlankDisk(
      this.wasmModule,
      drive,
      driveNum,
      (filename) => this.setDiskName(driveNum, filename),
      (error) => alert(error),
    );
  }

  async ejectDisk(driveNum) {
    const drive = this.drives[driveNum];
    await ejectDisk(this.wasmModule, drive, driveNum, () =>
      this.setDiskName(driveNum, "No Disk"),
    );
  }

  performEject(driveNum) {
    const drive = this.drives[driveNum];
    performEject(this.wasmModule, drive, driveNum, () =>
      this.setDiskName(driveNum, "No Disk"),
    );
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

      // Update drive image based on state
      if (drive.image) {
        let imageSrc;
        if (hasDisk) {
          imageSrc = isActive
            ? "assets/drive-closed-light-on.png"
            : "assets/drive-closed.png";
        } else {
          imageSrc = isActive
            ? "assets/drive-open-light-on.png"
            : "assets/drive-open.png";
        }
        if (
          drive.image.src !== imageSrc &&
          !drive.image.src.endsWith(imageSrc)
        ) {
          drive.image.src = imageSrc;
        }
      }

      // Update track display and check for seek
      if (drive.trackLabel) {
        if (hasDisk && this.wasmModule._getDiskTrack) {
          const track = this.wasmModule._getDiskTrack(driveNum);
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
        } else {
          drive.trackLabel.textContent = "T--";
          drive.trackLabel.classList.remove("active");
          drive.lastTrack = -1;
        }
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

    const recentDisks = await getRecentDisks();

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
        await clearRecentDisks();
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
    loadDiskFromData(
      this.wasmModule,
      drive,
      driveNum,
      diskData.filename,
      diskData.data,
      (filename) => {
        this.setDiskName(driveNum, filename);
        if (this.onDiskLoaded) this.onDiskLoaded(driveNum, filename);
      },
      (error) => alert(error),
    );

    // Update access time by re-adding to recent list
    addToRecentDisks(diskData.filename, diskData.data);
  }
}
