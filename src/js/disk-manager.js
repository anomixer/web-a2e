// Disk Manager for Apple //e Emulator
// Handles disk image loading and drive status

export class DiskManager {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.drives = [
      {
        input: null,
        insertBtn: null,
        blankBtn: null,
        ejectBtn: null,
        image: null,
        trackLabel: null,
        filename: null,
        lastTrack: -1,
      },
      {
        input: null,
        insertBtn: null,
        blankBtn: null,
        ejectBtn: null,
        image: null,
        trackLabel: null,
        filename: null,
        lastTrack: -1,
      },
    ];
    this.pendingEjectDrive = null;
    this.saveModal = null;
    this.saveFilenameInput = null;

    // Seek sound synthesis
    this.audioContext = null;
    this.seekSoundEnabled = true;
    this.seekVolume = 0.3;
    // Seek sound parameters
    this.seekPrimaryFreq = 2200;
    this.seekSecondaryFreq = 3800;
    this.seekBodyFreq = 1200;
    this.seekDecay = 350;
    this.seekClickDecay = 1200;

    // Motor sound
    this.motorSoundEnabled = true;
    this.motorVolume = 0.15;
    this.motorRunning = false;
    this.motorOscillator = null;
    this.motorGain = null;
    this.motorNoiseSource = null;
    this.motorNoiseGain = null;
    // Motor sound parameters (adjustable)
    this.motorFreq = 55;
    this.motorFilterFreq = 129;
    this.whirFreq = 499;
    this.whirQ = 1.5;
    this.swishFreq = 1917;
    this.swishLFOFreq = 2.69;
    this.swishQ = 2.37;
    // Swish sound (disk rubbing against jacket)
    this.swishNoiseSource = null;
    this.swishLFO = null;
    this.swishGain = null;
    this.swishVolumeGain = null;
    this.swishLFOGain = null;
    this.swishLFOOffset = null;
    // Store filter references for live updates
    this.motorOscFilter = null;
    this.motorNoiseFilter = null;
    this.swishFilter = null;
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
    const backdrop = this.saveModal?.querySelector(".modal-backdrop");

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

    if (backdrop) {
      backdrop.addEventListener("click", () => {
        this.handleSaveCancel();
      });
    }

    // Handle Enter key in filename input
    if (this.saveFilenameInput) {
      this.saveFilenameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this.handleSaveConfirm();
        } else if (e.key === "Escape") {
          this.handleSaveCancel();
        }
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
      this.saveModal.classList.remove("hidden");
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
    if (this.saveModal) {
      this.saveModal.classList.add("hidden");
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
    const saved = await this.saveDiskWithPicker(driveNum, defaultFilename);

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

  performEject(driveNum) {
    const drive = this.drives[driveNum];

    this.wasmModule._ejectDisk(driveNum);

    drive.filename = null;
    if (drive.ejectBtn) drive.ejectBtn.disabled = true;
    if (drive.input) drive.input.value = "";
    this.setDiskName(driveNum, "No Disk");

    console.log(`Ejected disk from drive ${driveNum + 1}`);
  }

  async loadDisk(driveNum, file) {
    const drive = this.drives[driveNum];

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      // Allocate memory in WASM
      const ptr = this.wasmModule._malloc(data.length);
      this.wasmModule.HEAPU8.set(data, ptr);

      // Allocate string for filename
      const filenamePtr = this.wasmModule._malloc(file.name.length + 1);
      this.wasmModule.stringToUTF8(
        file.name,
        filenamePtr,
        file.name.length + 1,
      );

      // Insert disk
      const success = this.wasmModule._insertDisk(
        driveNum,
        ptr,
        data.length,
        filenamePtr,
      );

      // Free memory
      this.wasmModule._free(ptr);
      this.wasmModule._free(filenamePtr);

      if (success) {
        drive.filename = file.name;
        if (drive.ejectBtn) drive.ejectBtn.disabled = false;
        this.setDiskName(driveNum, file.name);
        console.log(`Inserted disk in drive ${driveNum + 1}: ${file.name}`);
      } else {
        alert(`Failed to load disk image: ${file.name}`);
      }
    } catch (error) {
      console.error("Error loading disk:", error);
      alert("Error loading disk: " + error.message);
    }
  }

  insertBlankDisk(driveNum) {
    const drive = this.drives[driveNum];

    // Create a blank WOZ2 format disk image
    const data = this.createBlankWozDisk();

    // Allocate memory in WASM
    const ptr = this.wasmModule._malloc(data.length);
    this.wasmModule.HEAPU8.set(data, ptr);

    // Allocate string for filename
    const filename = "Blank Disk.woz";
    const filenamePtr = this.wasmModule._malloc(filename.length + 1);
    this.wasmModule.stringToUTF8(filename, filenamePtr, filename.length + 1);

    // Insert disk
    const success = this.wasmModule._insertDisk(
      driveNum,
      ptr,
      data.length,
      filenamePtr,
    );

    // Free memory
    this.wasmModule._free(ptr);
    this.wasmModule._free(filenamePtr);

    if (success) {
      drive.filename = filename;
      if (drive.ejectBtn) drive.ejectBtn.disabled = false;
      this.setDiskName(driveNum, filename);
    } else {
      alert("Failed to insert blank disk");
    }
  }

  createBlankWozDisk() {
    // WOZ2 format constants
    const NUM_TRACKS = 35;
    const BITS_PER_TRACK = 51200; // Standard 5.25" track length in bits
    const BYTES_PER_TRACK = Math.ceil(BITS_PER_TRACK / 8); // 6400 bytes
    const BLOCKS_PER_TRACK = Math.ceil(BYTES_PER_TRACK / 512); // 13 blocks per track

    // Calculate file size
    // Header: 12 bytes
    // INFO chunk: 8 (header) + 60 (data) = 68 bytes
    // TMAP chunk: 8 (header) + 160 (data) = 168 bytes
    // TRKS chunk: 8 (header) + 1280 (track table) + track data
    const TRKS_TABLE_SIZE = 160 * 8; // 160 track entries * 8 bytes each
    const TRACK_DATA_START_BLOCK = 3; // Start track data at block 3 (after headers)
    const TRACK_DATA_SIZE = NUM_TRACKS * BLOCKS_PER_TRACK * 512;

    const headerSize = 12 + 68 + 168 + 8 + TRKS_TABLE_SIZE;
    const totalSize = TRACK_DATA_START_BLOCK * 512 + TRACK_DATA_SIZE;

    const data = new Uint8Array(totalSize);
    let offset = 0;

    // === WOZ2 Header (12 bytes) ===
    // Signature: "WOZ2"
    data[offset++] = 0x57; // 'W'
    data[offset++] = 0x4f; // 'O'
    data[offset++] = 0x5a; // 'Z'
    data[offset++] = 0x32; // '2'
    // High bit: 0xFF
    data[offset++] = 0xff;
    // LF CR LF
    data[offset++] = 0x0a;
    data[offset++] = 0x0d;
    data[offset++] = 0x0a;
    // CRC32 (set to 0 for now - not validated by our loader)
    data[offset++] = 0x00;
    data[offset++] = 0x00;
    data[offset++] = 0x00;
    data[offset++] = 0x00;

    // === INFO Chunk ===
    // Chunk ID: "INFO"
    data[offset++] = 0x49; // 'I'
    data[offset++] = 0x4e; // 'N'
    data[offset++] = 0x46; // 'F'
    data[offset++] = 0x4f; // 'O'
    // Chunk size: 60 bytes (little-endian)
    data[offset++] = 60;
    data[offset++] = 0;
    data[offset++] = 0;
    data[offset++] = 0;
    // INFO version: 2
    data[offset++] = 2;
    // Disk type: 1 = 5.25"
    data[offset++] = 1;
    // Write protected: 0 = not write protected
    data[offset++] = 0;
    // Synchronized: 0
    data[offset++] = 0;
    // Cleaned: 1
    data[offset++] = 1;
    // Creator (32 bytes): "A2E Emulator"
    const creator = "A2E Emulator";
    for (let i = 0; i < 32; i++) {
      data[offset++] = i < creator.length ? creator.charCodeAt(i) : 0x20;
    }
    // Disk sides: 1
    data[offset++] = 1;
    // Boot sector format: 0 = unknown
    data[offset++] = 0;
    // Optimal bit timing: 32 (4 microseconds)
    data[offset++] = 32;
    // Compatible hardware: 0
    data[offset++] = 0;
    data[offset++] = 0;
    // Required RAM: 0
    data[offset++] = 0;
    data[offset++] = 0;
    // Largest track: blocks per track
    data[offset++] = BLOCKS_PER_TRACK & 0xff;
    data[offset++] = (BLOCKS_PER_TRACK >> 8) & 0xff;
    // FLUX block (WOZ 2.1): 0
    data[offset++] = 0;
    data[offset++] = 0;
    // Largest FLUX track (WOZ 2.1): 0
    data[offset++] = 0;
    data[offset++] = 0;
    // Reserved (10 bytes to reach 60 total)
    for (let i = 0; i < 10; i++) {
      data[offset++] = 0;
    }

    // === TMAP Chunk ===
    // Chunk ID: "TMAP"
    data[offset++] = 0x54; // 'T'
    data[offset++] = 0x4d; // 'M'
    data[offset++] = 0x41; // 'A'
    data[offset++] = 0x50; // 'P'
    // Chunk size: 160 bytes
    data[offset++] = 160;
    data[offset++] = 0;
    data[offset++] = 0;
    data[offset++] = 0;
    // Quarter-track mapping (160 entries)
    // All quarter-tracks within a whole track map to that track
    for (let qt = 0; qt < 160; qt++) {
      const track = Math.floor(qt / 4);
      if (track < NUM_TRACKS) {
        // Map to the whole track index
        data[offset++] = track;
      } else {
        // Beyond track 34: no track (0xFF)
        data[offset++] = 0xff;
      }
    }

    // === TRKS Chunk ===
    // Chunk ID: "TRKS"
    data[offset++] = 0x54; // 'T'
    data[offset++] = 0x52; // 'R'
    data[offset++] = 0x4b; // 'K'
    data[offset++] = 0x53; // 'S'
    // Chunk size: track table + track data
    const trksDataSize = TRKS_TABLE_SIZE;
    data[offset++] = trksDataSize & 0xff;
    data[offset++] = (trksDataSize >> 8) & 0xff;
    data[offset++] = (trksDataSize >> 16) & 0xff;
    data[offset++] = (trksDataSize >> 24) & 0xff;

    // Track table (160 entries, 8 bytes each)
    for (let t = 0; t < 160; t++) {
      if (t < NUM_TRACKS) {
        // Starting block for this track
        const startBlock = TRACK_DATA_START_BLOCK + t * BLOCKS_PER_TRACK;
        data[offset++] = startBlock & 0xff;
        data[offset++] = (startBlock >> 8) & 0xff;
        // Block count
        data[offset++] = BLOCKS_PER_TRACK & 0xff;
        data[offset++] = (BLOCKS_PER_TRACK >> 8) & 0xff;
        // Bit count
        data[offset++] = BITS_PER_TRACK & 0xff;
        data[offset++] = (BITS_PER_TRACK >> 8) & 0xff;
        data[offset++] = (BITS_PER_TRACK >> 16) & 0xff;
        data[offset++] = (BITS_PER_TRACK >> 24) & 0xff;
      } else {
        // Empty track entry
        for (let i = 0; i < 8; i++) {
          data[offset++] = 0;
        }
      }
    }

    // Pad to block boundary (block 3)
    while (offset < TRACK_DATA_START_BLOCK * 512) {
      data[offset++] = 0;
    }

    // Track data - fill with sync bytes (0xFF with timing bits)
    // For an unformatted disk, we fill with alternating 1s and 0s
    // that represent a "blank" magnetic surface
    for (let t = 0; t < NUM_TRACKS; t++) {
      const trackStart =
        TRACK_DATA_START_BLOCK * 512 + t * BLOCKS_PER_TRACK * 512;
      // Fill track with 0xFF (all 1s) - represents unformatted disk
      for (let b = 0; b < BLOCKS_PER_TRACK * 512; b++) {
        data[trackStart + b] = 0xff;
      }
    }

    return data;
  }

  async ejectDisk(driveNum) {
    // Check if disk is modified
    const hasModifiedCheck =
      typeof this.wasmModule._isDiskModified === "function";
    const isModified =
      hasModifiedCheck && this.wasmModule._isDiskModified(driveNum);
    const drive = this.drives[driveNum];

    if (isModified) {
      // Generate suggested filename
      let suggestedName = drive.filename || `disk${driveNum + 1}.woz`;
      // Ensure WOZ extension for blank disks
      if (suggestedName === "Blank Disk.woz" || !suggestedName.includes(".")) {
        suggestedName = suggestedName.replace(/\.[^.]*$/, "") + ".woz";
      }

      // Go directly to OS save picker
      await this.saveDiskWithPicker(driveNum, suggestedName);
    }

    // Always eject after save attempt
    this.performEject(driveNum);
  }

  updateLEDs() {
    // Update drive images and track display based on motor state
    if (!this.wasmModule._getDiskMotorOn) return;

    const selectedDrive = this.wasmModule._getSelectedDrive
      ? this.wasmModule._getSelectedDrive()
      : 0;

    // Check if any motor is running for motor sound
    const anyMotorOn =
      this.wasmModule._getDiskMotorOn(0) || this.wasmModule._getDiskMotorOn(1);
    if (anyMotorOn && !this.motorRunning) {
      this.startMotorSound();
    } else if (!anyMotorOn && this.motorRunning) {
      this.stopMotorSound();
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
            ? "assets/drive-closed-light-on.jpg"
            : "assets/drive-closed.jpg";
        } else {
          imageSrc = isActive
            ? "assets/drive-open-light-on.jpg"
            : "assets/drive-open.jpg";
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
            this.playSeekSound();
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

  /**
   * Initialize audio context for seek sounds (lazily created)
   */
  initAudioContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (
          window.AudioContext || window.webkitAudioContext
        )();
      } catch (e) {
        console.warn("Could not create audio context for seek sounds:", e);
        this.seekSoundEnabled = false;
      }
    }
    return this.audioContext;
  }

  /**
   * Play a synthesized disk drive seek/step sound
   * Models the mechanical "thunk" of a Disk II stepper motor
   */
  playSeekSound() {
    if (!this.seekSoundEnabled) return;

    const ctx = this.initAudioContext();
    if (!ctx || ctx.state === "suspended") return;

    const now = ctx.currentTime;
    const duration = 0.025; // 25ms for the full sound
    const sampleRate = ctx.sampleRate;
    const bufferSize = Math.ceil(sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // Use configurable parameters
    const primaryFreq = this.seekPrimaryFreq;
    const secondaryFreq = this.seekSecondaryFreq;
    const bodyFreq = this.seekBodyFreq;
    const decay = this.seekDecay;
    const clickDecay = this.seekClickDecay;

    for (let i = 0; i < bufferSize; i++) {
      const t = i / sampleRate;

      // Very fast exponential decay - metallic tick
      const envelope = Math.exp(-t * decay);

      // Sharp initial transient/click
      const clickEnv = Math.exp(-t * clickDecay);
      const click = clickEnv * (Math.random() * 2 - 1) * 0.4;

      // Primary high-pitched tick
      const tick = Math.sin(2 * Math.PI * primaryFreq * t) * 0.5;

      // Higher harmonic for metallic character
      const harmonic = Math.sin(2 * Math.PI * secondaryFreq * t) * 0.25;

      // Lower body resonance (decays faster)
      const bodyEnv = Math.exp(-t * (decay + 150));
      const body = bodyEnv * Math.sin(2 * Math.PI * bodyFreq * t) * 0.3;

      // Combine components
      data[i] = envelope * (tick + harmonic) + body * envelope + click;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Add a low-pass filter to tame the very highest frequencies
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 6000;
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.value = this.seekVolume * 0.8;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration);
  }

  /**
   * Enable or disable seek sounds
   */
  setSeekSoundEnabled(enabled) {
    this.seekSoundEnabled = enabled;
  }

  /**
   * Set seek sound volume (0.0 - 1.0)
   */
  setSeekVolume(volume) {
    this.seekVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Start the motor spinning sound
   * Creates a layered sound with:
   * - Low frequency hum (motor)
   * - Filtered noise (mechanical whir)
   * - Rhythmic swish (disk rubbing against jacket at 300 RPM = 5 Hz)
   */
  startMotorSound() {
    if (!this.motorSoundEnabled || this.motorRunning) return;

    const ctx = this.initAudioContext();
    if (!ctx || ctx.state === "suspended") return;

    this.motorRunning = true;

    // Layer 1: Low frequency motor hum
    this.motorOscillator = ctx.createOscillator();
    this.motorOscillator.type = "sawtooth";
    this.motorOscillator.frequency.value = this.motorFreq;

    // Filter the oscillator to soften it
    this.motorOscFilter = ctx.createBiquadFilter();
    this.motorOscFilter.type = "lowpass";
    this.motorOscFilter.frequency.value = this.motorFilterFreq;
    this.motorOscFilter.Q.value = 1;

    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = this.motorVolume * 0.5;

    this.motorOscillator.connect(this.motorOscFilter);
    this.motorOscFilter.connect(this.motorGain);
    this.motorGain.connect(ctx.destination);

    // Layer 2: Filtered noise for mechanical whir
    const noiseBufferSize = ctx.sampleRate * 2; // 2 seconds of noise
    const noiseBuffer = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseBufferSize; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    this.motorNoiseSource = ctx.createBufferSource();
    this.motorNoiseSource.buffer = noiseBuffer;
    this.motorNoiseSource.loop = true;

    // Bandpass filter for the "whir" character
    this.motorNoiseFilter = ctx.createBiquadFilter();
    this.motorNoiseFilter.type = "bandpass";
    this.motorNoiseFilter.frequency.value = this.whirFreq;
    this.motorNoiseFilter.Q.value = this.whirQ;

    this.motorNoiseGain = ctx.createGain();
    this.motorNoiseGain.gain.value = this.motorVolume * 0.25;

    this.motorNoiseSource.connect(this.motorNoiseFilter);
    this.motorNoiseFilter.connect(this.motorNoiseGain);
    this.motorNoiseGain.connect(ctx.destination);

    // Layer 3: Rhythmic "swish" - disk rubbing against jacket
    this.swishNoiseSource = ctx.createBufferSource();
    this.swishNoiseSource.buffer = noiseBuffer; // Reuse noise buffer
    this.swishNoiseSource.loop = true;

    // Bandpass filter for swish character (higher, breathier)
    this.swishFilter = ctx.createBiquadFilter();
    this.swishFilter.type = "bandpass";
    this.swishFilter.frequency.value = this.swishFreq;
    this.swishFilter.Q.value = this.swishQ;

    // LFO to modulate the swish amplitude
    this.swishLFO = ctx.createOscillator();
    this.swishLFO.type = "sine";
    this.swishLFO.frequency.value = this.swishLFOFreq;

    // Scale and offset the LFO (0 to 1 range instead of -1 to 1)
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5; // Scale to 0.5

    const lfoOffset = ctx.createConstantSource();
    lfoOffset.offset.value = 0.5; // Offset to center at 0.5

    // Combine LFO with offset for 0-1 modulation
    this.swishGain = ctx.createGain();
    this.swishGain.gain.value = 0; // Will be modulated by LFO

    // Create a gain node for the final swish volume
    this.swishVolumeGain = ctx.createGain();
    this.swishVolumeGain.gain.value = this.motorVolume * 0.4;

    // Connect swish audio path
    this.swishNoiseSource.connect(this.swishFilter);
    this.swishFilter.connect(this.swishGain);
    this.swishGain.connect(this.swishVolumeGain);
    this.swishVolumeGain.connect(ctx.destination);

    // Connect LFO to modulate swish gain
    this.swishLFO.connect(lfoGain);
    lfoGain.connect(this.swishGain.gain);
    lfoOffset.connect(this.swishGain.gain);

    // Start all layers
    this.motorOscillator.start();
    this.motorNoiseSource.start();
    this.swishNoiseSource.start();
    this.swishLFO.start();
    lfoOffset.start();

    // Store references for cleanup
    this.swishLFOGain = lfoGain;
    this.swishLFOOffset = lfoOffset;
  }

  /**
   * Update motor sound parameters while running
   */
  updateMotorSoundParams() {
    if (!this.motorRunning) return;

    // Update oscillator frequency
    if (this.motorOscillator) {
      this.motorOscillator.frequency.value = this.motorFreq;
    }
    // Update motor filter
    if (this.motorOscFilter) {
      this.motorOscFilter.frequency.value = this.motorFilterFreq;
    }
    // Update whir filter
    if (this.motorNoiseFilter) {
      this.motorNoiseFilter.frequency.value = this.whirFreq;
      this.motorNoiseFilter.Q.value = this.whirQ;
    }
    // Update swish filter
    if (this.swishFilter) {
      this.swishFilter.frequency.value = this.swishFreq;
      this.swishFilter.Q.value = this.swishQ;
    }
    // Update swish LFO
    if (this.swishLFO) {
      this.swishLFO.frequency.value = this.swishLFOFreq;
    }
    // Update volumes
    if (this.motorGain) this.motorGain.gain.value = this.motorVolume * 0.5;
    if (this.motorNoiseGain)
      this.motorNoiseGain.gain.value = this.motorVolume * 0.25;
    if (this.swishVolumeGain)
      this.swishVolumeGain.gain.value = this.motorVolume * 0.4;
  }

  /**
   * Stop the motor spinning sound
   */
  stopMotorSound() {
    if (!this.motorRunning) return;

    this.motorRunning = false;

    // Fade out quickly to avoid clicks
    const ctx = this.audioContext;
    if (ctx) {
      const now = ctx.currentTime;
      const fadeTime = 0.15;

      if (this.motorGain) {
        this.motorGain.gain.setValueAtTime(this.motorGain.gain.value, now);
        this.motorGain.gain.linearRampToValueAtTime(0, now + fadeTime);
      }
      if (this.motorNoiseGain) {
        this.motorNoiseGain.gain.setValueAtTime(
          this.motorNoiseGain.gain.value,
          now,
        );
        this.motorNoiseGain.gain.linearRampToValueAtTime(0, now + fadeTime);
      }
      if (this.swishVolumeGain) {
        this.swishVolumeGain.gain.setValueAtTime(
          this.swishVolumeGain.gain.value,
          now,
        );
        this.swishVolumeGain.gain.linearRampToValueAtTime(0, now + fadeTime);
      }

      // Stop oscillators after fade
      setTimeout(
        () => {
          if (this.motorOscillator) {
            try {
              this.motorOscillator.stop();
            } catch (e) {}
            this.motorOscillator = null;
          }
          if (this.motorNoiseSource) {
            try {
              this.motorNoiseSource.stop();
            } catch (e) {}
            this.motorNoiseSource = null;
          }
          if (this.swishNoiseSource) {
            try {
              this.swishNoiseSource.stop();
            } catch (e) {}
            this.swishNoiseSource = null;
          }
          if (this.swishLFO) {
            try {
              this.swishLFO.stop();
            } catch (e) {}
            this.swishLFO = null;
          }
          if (this.swishLFOOffset) {
            try {
              this.swishLFOOffset.stop();
            } catch (e) {}
            this.swishLFOOffset = null;
          }
          this.motorGain = null;
          this.motorNoiseGain = null;
          this.swishGain = null;
          this.swishVolumeGain = null;
          this.swishLFOGain = null;
        },
        fadeTime * 1000 + 50,
      );
    }
  }

  /**
   * Enable or disable motor sound
   */
  setMotorSoundEnabled(enabled) {
    this.motorSoundEnabled = enabled;
    if (!enabled) {
      this.stopMotorSound();
    }
  }

  /**
   * Set motor sound volume (0.0 - 1.0)
   */
  setMotorVolume(volume) {
    this.motorVolume = Math.max(0, Math.min(1, volume));
    // Update live if motor is running
    if (this.motorRunning) {
      if (this.motorGain) this.motorGain.gain.value = this.motorVolume * 0.5;
      if (this.motorNoiseGain)
        this.motorNoiseGain.gain.value = this.motorVolume * 0.25;
      if (this.swishVolumeGain)
        this.swishVolumeGain.gain.value = this.motorVolume * 0.4;
    }
  }

  async saveDiskWithPicker(driveNum, suggestedName) {
    const sizePtr = this.wasmModule._malloc(4);
    if (!sizePtr) {
      console.error("saveDiskWithPicker: failed to allocate size pointer");
      return false;
    }

    const dataPtr = this.wasmModule._getDiskData(driveNum, sizePtr);

    if (!dataPtr) {
      console.error("saveDiskWithPicker: _getDiskData returned null");
      this.wasmModule._free(sizePtr);
      return false;
    }

    // Read size from WASM memory (little-endian 32-bit value)
    const heap = this.wasmModule.HEAPU8;
    const size =
      heap[sizePtr] |
      (heap[sizePtr + 1] << 8) |
      (heap[sizePtr + 2] << 16) |
      (heap[sizePtr + 3] << 24);

    if (size <= 0 || size > 10000000) {
      console.error(`saveDiskWithPicker: invalid size ${size}`);
      this.wasmModule._free(sizePtr);
      return false;
    }

    const data = new Uint8Array(this.wasmModule.HEAPU8.buffer, dataPtr, size);

    // Create a copy of the data since the WASM buffer may become invalid
    const dataCopy = new Uint8Array(data);

    this.wasmModule._free(sizePtr);

    // Try to use File System Access API (modern browsers)
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [
            {
              description: "Disk Images",
              accept: {
                "application/octet-stream": [
                  ".dsk",
                  ".do",
                  ".po",
                  ".woz",
                  ".nib",
                ],
              },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(dataCopy);
        await writable.close();

        console.log(`Saved disk from drive ${driveNum + 1} to: ${handle.name}`);
        return true;
      } catch (err) {
        // User cancelled the picker or other error
        if (err.name !== "AbortError") {
          console.error("Error saving disk:", err);
        }
        return false;
      }
    } else {
      // Fallback for browsers without File System Access API
      this.downloadFile(dataCopy, suggestedName);
      return true;
    }
  }

  downloadFile(data, filename) {
    const blob = new Blob([data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
