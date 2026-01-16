// Disk Manager for Apple //e Emulator
// Handles disk image loading and drive status

export class DiskManager {
    constructor(wasmModule) {
        this.wasmModule = wasmModule;
        this.drives = [
            { input: null, insertBtn: null, blankBtn: null, ejectBtn: null, led: null, trackLabel: null, filename: null },
            { input: null, insertBtn: null, blankBtn: null, ejectBtn: null, led: null, trackLabel: null, filename: null }
        ];
        this.pendingEjectDrive = null;
        this.saveModal = null;
        this.saveFilenameInput = null;
    }

    init() {
        // Get canvas for focus management
        this.canvas = document.getElementById('screen');

        // Set up drive 1
        this.setupDrive(0, 'disk1');

        // Set up drive 2
        this.setupDrive(1, 'disk2');

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
        drive.insertBtn = container.querySelector('.disk-insert');
        drive.blankBtn = container.querySelector('.disk-blank');
        drive.ejectBtn = container.querySelector('.disk-eject');
        drive.led = container.querySelector('.disk-led');
        drive.nameLabel = container.querySelector('.disk-name');
        drive.trackLabel = container.querySelector('.disk-track');

        // Insert button click
        if (drive.insertBtn) {
            drive.insertBtn.addEventListener('click', () => {
                drive.input.click();
            });
        }

        // Blank disk button click
        if (drive.blankBtn) {
            drive.blankBtn.addEventListener('click', () => {
                this.insertBlankDisk(driveNum);
                this.refocusCanvas();
            });
        }

        // File input change
        if (drive.input) {
            drive.input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.loadDisk(driveNum, e.target.files[0]);
                }
                this.refocusCanvas();
            });
        }

        // Eject button click
        if (drive.ejectBtn) {
            drive.ejectBtn.addEventListener('click', () => {
                this.ejectDisk(driveNum);
                this.refocusCanvas();
            });
        }
    }

    setupDragDrop() {
        const displayContainer = document.getElementById('monitor-frame');
        if (!displayContainer) return;

        displayContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            displayContainer.classList.add('drag-over');
        });

        displayContainer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            displayContainer.classList.remove('drag-over');
        });

        displayContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            displayContainer.classList.remove('drag-over');

            if (e.dataTransfer.files.length > 0) {
                // Load into first empty drive, or drive 1 if both full
                const driveNum = !this.drives[0].filename ? 0 :
                                (!this.drives[1].filename ? 1 : 0);
                this.loadDisk(driveNum, e.dataTransfer.files[0]);
            }
        });
    }

    setupSaveModal() {
        this.saveModal = document.getElementById('save-disk-modal');
        this.saveFilenameInput = document.getElementById('save-disk-filename');
        const confirmBtn = document.getElementById('save-disk-confirm');
        const cancelBtn = document.getElementById('save-disk-cancel');
        const backdrop = this.saveModal?.querySelector('.modal-backdrop');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.handleSaveConfirm();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.handleSaveCancel();
            });
        }

        if (backdrop) {
            backdrop.addEventListener('click', () => {
                this.handleSaveCancel();
            });
        }

        // Handle Enter key in filename input
        if (this.saveFilenameInput) {
            this.saveFilenameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.handleSaveConfirm();
                } else if (e.key === 'Escape') {
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
        if (!defaultName.includes('.')) {
            defaultName += '.dsk';
        }

        if (this.saveFilenameInput) {
            this.saveFilenameInput.value = defaultName;
        }

        if (this.saveModal) {
            this.saveModal.classList.remove('hidden');
            // Focus the input and select the filename (without extension)
            if (this.saveFilenameInput) {
                this.saveFilenameInput.focus();
                const dotIndex = defaultName.lastIndexOf('.');
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
            this.saveModal.classList.add('hidden');
        }
        this.pendingEjectDrive = null;
    }

    async handleSaveConfirm() {
        if (this.pendingEjectDrive === null) return;

        const driveNum = this.pendingEjectDrive;
        const defaultFilename = this.saveFilenameInput?.value || `disk${driveNum + 1}.dsk`;

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
        if (drive.input) drive.input.value = '';
        if (drive.nameLabel) drive.nameLabel.textContent = 'No Disk';

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
            this.wasmModule.stringToUTF8(file.name, filenamePtr, file.name.length + 1);

            // Insert disk
            const success = this.wasmModule._insertDisk(driveNum, ptr, data.length, filenamePtr);

            // Free memory
            this.wasmModule._free(ptr);
            this.wasmModule._free(filenamePtr);

            if (success) {
                drive.filename = file.name;
                if (drive.ejectBtn) drive.ejectBtn.disabled = false;
                if (drive.nameLabel) drive.nameLabel.textContent = file.name;
                console.log(`Inserted disk in drive ${driveNum + 1}: ${file.name}`);
            } else {
                alert(`Failed to load disk image: ${file.name}`);
            }
        } catch (error) {
            console.error('Error loading disk:', error);
            alert('Error loading disk: ' + error.message);
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
        const filename = 'Blank Disk.woz';
        const filenamePtr = this.wasmModule._malloc(filename.length + 1);
        this.wasmModule.stringToUTF8(filename, filenamePtr, filename.length + 1);

        // Insert disk
        const success = this.wasmModule._insertDisk(driveNum, ptr, data.length, filenamePtr);

        // Free memory
        this.wasmModule._free(ptr);
        this.wasmModule._free(filenamePtr);

        if (success) {
            drive.filename = filename;
            if (drive.ejectBtn) drive.ejectBtn.disabled = false;
            if (drive.nameLabel) drive.nameLabel.textContent = filename;
        } else {
            alert('Failed to insert blank disk');
        }
    }

    createBlankWozDisk() {
        // WOZ2 format constants
        const NUM_TRACKS = 35;
        const BITS_PER_TRACK = 51200;  // Standard 5.25" track length in bits
        const BYTES_PER_TRACK = Math.ceil(BITS_PER_TRACK / 8);  // 6400 bytes
        const BLOCKS_PER_TRACK = Math.ceil(BYTES_PER_TRACK / 512);  // 13 blocks per track

        // Calculate file size
        // Header: 12 bytes
        // INFO chunk: 8 (header) + 60 (data) = 68 bytes
        // TMAP chunk: 8 (header) + 160 (data) = 168 bytes
        // TRKS chunk: 8 (header) + 1280 (track table) + track data
        const TRKS_TABLE_SIZE = 160 * 8;  // 160 track entries * 8 bytes each
        const TRACK_DATA_START_BLOCK = 3;  // Start track data at block 3 (after headers)
        const TRACK_DATA_SIZE = NUM_TRACKS * BLOCKS_PER_TRACK * 512;

        const headerSize = 12 + 68 + 168 + 8 + TRKS_TABLE_SIZE;
        const totalSize = TRACK_DATA_START_BLOCK * 512 + TRACK_DATA_SIZE;

        const data = new Uint8Array(totalSize);
        let offset = 0;

        // === WOZ2 Header (12 bytes) ===
        // Signature: "WOZ2"
        data[offset++] = 0x57;  // 'W'
        data[offset++] = 0x4F;  // 'O'
        data[offset++] = 0x5A;  // 'Z'
        data[offset++] = 0x32;  // '2'
        // High bit: 0xFF
        data[offset++] = 0xFF;
        // LF CR LF
        data[offset++] = 0x0A;
        data[offset++] = 0x0D;
        data[offset++] = 0x0A;
        // CRC32 (set to 0 for now - not validated by our loader)
        data[offset++] = 0x00;
        data[offset++] = 0x00;
        data[offset++] = 0x00;
        data[offset++] = 0x00;

        // === INFO Chunk ===
        // Chunk ID: "INFO"
        data[offset++] = 0x49;  // 'I'
        data[offset++] = 0x4E;  // 'N'
        data[offset++] = 0x46;  // 'F'
        data[offset++] = 0x4F;  // 'O'
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
        data[offset++] = BLOCKS_PER_TRACK & 0xFF;
        data[offset++] = (BLOCKS_PER_TRACK >> 8) & 0xFF;
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
        data[offset++] = 0x54;  // 'T'
        data[offset++] = 0x4D;  // 'M'
        data[offset++] = 0x41;  // 'A'
        data[offset++] = 0x50;  // 'P'
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
                data[offset++] = 0xFF;
            }
        }

        // === TRKS Chunk ===
        // Chunk ID: "TRKS"
        data[offset++] = 0x54;  // 'T'
        data[offset++] = 0x52;  // 'R'
        data[offset++] = 0x4B;  // 'K'
        data[offset++] = 0x53;  // 'S'
        // Chunk size: track table + track data
        const trksDataSize = TRKS_TABLE_SIZE;
        data[offset++] = trksDataSize & 0xFF;
        data[offset++] = (trksDataSize >> 8) & 0xFF;
        data[offset++] = (trksDataSize >> 16) & 0xFF;
        data[offset++] = (trksDataSize >> 24) & 0xFF;

        // Track table (160 entries, 8 bytes each)
        for (let t = 0; t < 160; t++) {
            if (t < NUM_TRACKS) {
                // Starting block for this track
                const startBlock = TRACK_DATA_START_BLOCK + (t * BLOCKS_PER_TRACK);
                data[offset++] = startBlock & 0xFF;
                data[offset++] = (startBlock >> 8) & 0xFF;
                // Block count
                data[offset++] = BLOCKS_PER_TRACK & 0xFF;
                data[offset++] = (BLOCKS_PER_TRACK >> 8) & 0xFF;
                // Bit count
                data[offset++] = BITS_PER_TRACK & 0xFF;
                data[offset++] = (BITS_PER_TRACK >> 8) & 0xFF;
                data[offset++] = (BITS_PER_TRACK >> 16) & 0xFF;
                data[offset++] = (BITS_PER_TRACK >> 24) & 0xFF;
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
            const trackStart = TRACK_DATA_START_BLOCK * 512 + (t * BLOCKS_PER_TRACK * 512);
            // Fill track with 0xFF (all 1s) - represents unformatted disk
            for (let b = 0; b < BLOCKS_PER_TRACK * 512; b++) {
                data[trackStart + b] = 0xFF;
            }
        }

        return data;
    }

    async ejectDisk(driveNum) {
        // Check if disk is modified
        const hasModifiedCheck = typeof this.wasmModule._isDiskModified === 'function';
        const isModified = hasModifiedCheck && this.wasmModule._isDiskModified(driveNum);
        const drive = this.drives[driveNum];

        if (isModified) {
            // Generate suggested filename
            let suggestedName = drive.filename || `disk${driveNum + 1}.woz`;
            // Ensure WOZ extension for blank disks
            if (suggestedName === 'Blank Disk.woz' || !suggestedName.includes('.')) {
                suggestedName = suggestedName.replace(/\.[^.]*$/, '') + '.woz';
            }

            // Go directly to OS save picker
            await this.saveDiskWithPicker(driveNum, suggestedName);
        }

        // Always eject after save attempt
        this.performEject(driveNum);
    }

    updateLEDs() {
        // Update drive activity LEDs and track display based on motor state
        if (!this.wasmModule._getDiskMotorOn) return;

        const selectedDrive = this.wasmModule._getSelectedDrive ? this.wasmModule._getSelectedDrive() : 0;

        for (let driveNum = 0; driveNum < 2; driveNum++) {
            const drive = this.drives[driveNum];

            // Update LED
            if (drive.led) {
                const motorOn = this.wasmModule._getDiskMotorOn(driveNum);
                if (motorOn && driveNum === selectedDrive) {
                    drive.led.classList.add('active');
                } else {
                    drive.led.classList.remove('active');
                }
            }

            // Update track display
            if (drive.trackLabel) {
                if (drive.filename && this.wasmModule._getDiskTrack) {
                    const track = this.wasmModule._getDiskTrack(driveNum);
                    drive.trackLabel.textContent = `T${track.toString().padStart(2, '0')}`;

                    // Highlight when motor is on and this drive is selected
                    const motorOn = this.wasmModule._getDiskMotorOn(driveNum);
                    if (motorOn && driveNum === selectedDrive) {
                        drive.trackLabel.classList.add('active');
                    } else {
                        drive.trackLabel.classList.remove('active');
                    }
                } else {
                    drive.trackLabel.textContent = 'T--';
                    drive.trackLabel.classList.remove('active');
                }
            }
        }
    }

    saveDisk(driveNum) {
        this.saveDiskAs(driveNum, this.drives[driveNum].filename || `disk${driveNum + 1}.dsk`);
    }

    async saveDiskWithPicker(driveNum, suggestedName) {
        const sizePtr = this.wasmModule._malloc(4);
        if (!sizePtr) {
            console.error('saveDiskWithPicker: failed to allocate size pointer');
            return false;
        }

        const dataPtr = this.wasmModule._getDiskData(driveNum, sizePtr);

        if (!dataPtr) {
            console.error('saveDiskWithPicker: _getDiskData returned null');
            this.wasmModule._free(sizePtr);
            return false;
        }

        // Read size from WASM memory (little-endian 32-bit value)
        const heap = this.wasmModule.HEAPU8;
        const size = heap[sizePtr] | (heap[sizePtr + 1] << 8) |
                     (heap[sizePtr + 2] << 16) | (heap[sizePtr + 3] << 24);

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
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: suggestedName,
                    types: [{
                        description: 'Disk Images',
                        accept: {
                            'application/octet-stream': ['.dsk', '.do', '.po', '.woz', '.nib']
                        }
                    }]
                });

                const writable = await handle.createWritable();
                await writable.write(dataCopy);
                await writable.close();

                console.log(`Saved disk from drive ${driveNum + 1} to: ${handle.name}`);
                return true;
            } catch (err) {
                // User cancelled the picker or other error
                if (err.name !== 'AbortError') {
                    console.error('Error saving disk:', err);
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
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    saveDiskAs(driveNum, filename) {
        const sizePtr = this.wasmModule._malloc(4);
        const dataPtr = this.wasmModule._getDiskData(driveNum, sizePtr);

        if (!dataPtr) {
            this.wasmModule._free(sizePtr);
            return;
        }

        // Read size from WASM memory (little-endian 32-bit value)
        const heap = this.wasmModule.HEAPU8;
        const size = heap[sizePtr] | (heap[sizePtr + 1] << 8) |
                     (heap[sizePtr + 2] << 16) | (heap[sizePtr + 3] << 24);

        if (size <= 0 || size > 10000000) {
            console.error(`saveDiskAs: invalid size ${size}`);
            this.wasmModule._free(sizePtr);
            return;
        }

        const data = new Uint8Array(this.wasmModule.HEAPU8.buffer, dataPtr, size);

        this.downloadFile(new Uint8Array(data), filename);

        this.wasmModule._free(sizePtr);
        console.log(`Saved disk from drive ${driveNum + 1} as: ${filename}`);
    }
}
