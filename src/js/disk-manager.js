// Disk Manager for Apple //e Emulator
// Handles disk image loading and drive status

export class DiskManager {
    constructor(wasmModule) {
        this.wasmModule = wasmModule;
        this.drives = [
            { input: null, insertBtn: null, ejectBtn: null, led: null, filename: null },
            { input: null, insertBtn: null, ejectBtn: null, led: null, filename: null }
        ];
    }

    init() {
        // Set up drive 1
        this.setupDrive(0, 'disk1');

        // Set up drive 2
        this.setupDrive(1, 'disk2');

        // Set up drag and drop on the display
        this.setupDragDrop();
    }

    setupDrive(driveNum, elementId) {
        const container = document.getElementById(elementId);
        if (!container) return;

        const drive = this.drives[driveNum];
        drive.input = container.querySelector(`#${elementId}-input`);
        drive.insertBtn = container.querySelector('.disk-insert');
        drive.ejectBtn = container.querySelector('.disk-eject');
        drive.led = container.querySelector('.disk-led');
        drive.nameLabel = container.querySelector('.disk-name');

        // Insert button click
        if (drive.insertBtn) {
            drive.insertBtn.addEventListener('click', () => {
                drive.input.click();
            });
        }

        // File input change
        if (drive.input) {
            drive.input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.loadDisk(driveNum, e.target.files[0]);
                }
            });
        }

        // Eject button click
        if (drive.ejectBtn) {
            drive.ejectBtn.addEventListener('click', () => {
                this.ejectDisk(driveNum);
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

    ejectDisk(driveNum) {
        const drive = this.drives[driveNum];

        // Check if disk is modified
        // TODO: Prompt to save if modified

        this.wasmModule._ejectDisk(driveNum);

        drive.filename = null;
        if (drive.ejectBtn) drive.ejectBtn.disabled = true;
        if (drive.input) drive.input.value = '';
        if (drive.nameLabel) drive.nameLabel.textContent = 'No Disk';

        console.log(`Ejected disk from drive ${driveNum + 1}`);
    }

    updateLEDs() {
        // Update drive activity LEDs based on motor state
        if (!this.wasmModule._getDiskMotorOn) return;

        for (let driveNum = 0; driveNum < 2; driveNum++) {
            const drive = this.drives[driveNum];
            if (!drive.led) continue;

            const motorOn = this.wasmModule._getDiskMotorOn(driveNum);
            if (motorOn) {
                drive.led.classList.add('active');
            } else {
                drive.led.classList.remove('active');
            }
        }
    }

    saveDisk(driveNum) {
        const sizePtr = this.wasmModule._malloc(4);
        const dataPtr = this.wasmModule._getDiskData(driveNum, sizePtr);

        if (!dataPtr) {
            this.wasmModule._free(sizePtr);
            return;
        }

        const size = this.wasmModule.HEAPU32[sizePtr >> 2];
        const data = new Uint8Array(this.wasmModule.HEAPU8.buffer, dataPtr, size);

        // Create download
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.drives[driveNum].filename || `disk${driveNum + 1}.dsk`;
        a.click();
        URL.revokeObjectURL(url);

        this.wasmModule._free(sizePtr);
    }
}
