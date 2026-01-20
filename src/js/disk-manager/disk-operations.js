// Disk Operations - Load, save, and eject disk images
// Handles WASM memory allocation and file system interactions

import {
  saveDiskToStorage,
  clearDiskFromStorage,
  addToRecentDisks,
} from "./disk-persistence.js";

/**
 * Load a disk image from a file into a drive
 * @param {Object} wasmModule - The WASM module
 * @param {Object} drive - The drive state object
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {File} file - The file to load
 * @param {Function} onSuccess - Callback on successful load
 * @param {Function} onError - Callback on error
 */
export async function loadDisk(
  wasmModule,
  drive,
  driveNum,
  file,
  onSuccess,
  onError,
) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Allocate memory in WASM
    const ptr = wasmModule._malloc(data.length);
    wasmModule.HEAPU8.set(data, ptr);

    // Allocate string for filename
    const filenamePtr = wasmModule._malloc(file.name.length + 1);
    wasmModule.stringToUTF8(file.name, filenamePtr, file.name.length + 1);

    // Insert disk
    const success = wasmModule._insertDisk(driveNum, ptr, data.length, filenamePtr);

    // Free memory
    wasmModule._free(ptr);
    wasmModule._free(filenamePtr);

    if (success) {
      drive.filename = file.name;
      if (drive.ejectBtn) drive.ejectBtn.disabled = false;
      console.log(`Inserted disk in drive ${driveNum + 1}: ${file.name}`);

      // Save to IndexedDB for persistence across sessions
      saveDiskToStorage(driveNum, file.name, data);

      // Add to recent disks list
      addToRecentDisks(file.name, data);

      if (onSuccess) onSuccess(file.name);
    } else {
      const msg = `Failed to load disk image: ${file.name}`;
      console.error(msg);
      if (onError) onError(msg);
    }
  } catch (error) {
    console.error("Error loading disk:", error);
    if (onError) onError("Error loading disk: " + error.message);
  }
}

/**
 * Load a disk image from raw data (used for restoring from persistence)
 * @param {Object} wasmModule - The WASM module
 * @param {Object} drive - The drive state object
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {string} filename - The disk filename
 * @param {Uint8Array} data - The disk image data
 * @param {Function} onSuccess - Callback on successful load
 * @param {Function} onError - Callback on error
 */
export function loadDiskFromData(
  wasmModule,
  drive,
  driveNum,
  filename,
  data,
  onSuccess,
  onError,
) {
  try {
    // Allocate memory in WASM
    const ptr = wasmModule._malloc(data.length);
    wasmModule.HEAPU8.set(data, ptr);

    // Allocate string for filename
    const filenamePtr = wasmModule._malloc(filename.length + 1);
    wasmModule.stringToUTF8(filename, filenamePtr, filename.length + 1);

    // Insert disk
    const success = wasmModule._insertDisk(driveNum, ptr, data.length, filenamePtr);

    // Free memory
    wasmModule._free(ptr);
    wasmModule._free(filenamePtr);

    if (success) {
      drive.filename = filename;
      if (drive.ejectBtn) drive.ejectBtn.disabled = false;
      console.log(`Restored disk in drive ${driveNum + 1}: ${filename}`);
      if (onSuccess) onSuccess(filename);
    } else {
      const msg = `Failed to restore disk image: ${filename}`;
      console.error(msg);
      if (onError) onError(msg);
    }
  } catch (error) {
    console.error("Error restoring disk:", error);
    if (onError) onError("Error restoring disk: " + error.message);
  }
}

/**
 * Insert a blank WOZ disk into a drive
 * @param {Object} wasmModule - The WASM module
 * @param {Object} drive - The drive state object
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {Function} onSuccess - Callback on successful insert
 * @param {Function} onError - Callback on error
 */
export function insertBlankDisk(wasmModule, drive, driveNum, onSuccess, onError) {
  const filename = "Blank Disk.woz";

  // Use the WASM function to create and insert a blank disk
  const success = wasmModule._insertBlankDisk(driveNum);

  if (success) {
    drive.filename = filename;
    if (drive.ejectBtn) drive.ejectBtn.disabled = false;
    console.log(`Inserted blank disk in drive ${driveNum + 1}`);
    if (onSuccess) onSuccess(filename);
  } else {
    const msg = "Failed to insert blank disk";
    console.error(msg);
    if (onError) onError(msg);
  }
}

/**
 * Perform the actual disk ejection
 * @param {Object} wasmModule - The WASM module
 * @param {Object} drive - The drive state object
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {Function} onEject - Callback after ejection
 */
export function performEject(wasmModule, drive, driveNum, onEject) {
  wasmModule._ejectDisk(driveNum);

  drive.filename = null;
  if (drive.ejectBtn) drive.ejectBtn.disabled = true;
  if (drive.input) drive.input.value = "";

  // Clear from IndexedDB
  clearDiskFromStorage(driveNum);

  console.log(`Ejected disk from drive ${driveNum + 1}`);
  if (onEject) onEject();
}

/**
 * Eject a disk, prompting to save if modified
 * @param {Object} wasmModule - The WASM module
 * @param {Object} drive - The drive state object
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {Function} onEject - Callback after ejection
 */
export async function ejectDisk(wasmModule, drive, driveNum, onEject) {
  // Check if disk is modified
  const hasModifiedCheck = typeof wasmModule._isDiskModified === "function";
  const isModified = hasModifiedCheck && wasmModule._isDiskModified(driveNum);

  if (isModified) {
    // Generate suggested filename
    let suggestedName = drive.filename || `disk${driveNum + 1}.woz`;
    // Ensure WOZ extension for blank disks
    if (suggestedName === "Blank Disk.woz" || !suggestedName.includes(".")) {
      suggestedName = suggestedName.replace(/\.[^.]*$/, "") + ".woz";
    }

    // Go directly to OS save picker
    await saveDiskWithPicker(wasmModule, driveNum, suggestedName);
  }

  // Always eject after save attempt
  performEject(wasmModule, drive, driveNum, onEject);
}

/**
 * Save disk data using the File System Access API
 * @param {Object} wasmModule - The WASM module
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {string} suggestedName - Suggested filename
 * @returns {Promise<boolean>} True if saved successfully
 */
export async function saveDiskWithPicker(wasmModule, driveNum, suggestedName) {
  const sizePtr = wasmModule._malloc(4);
  if (!sizePtr) {
    console.error("saveDiskWithPicker: failed to allocate size pointer");
    return false;
  }

  const dataPtr = wasmModule._getDiskData(driveNum, sizePtr);

  if (!dataPtr) {
    console.error("saveDiskWithPicker: _getDiskData returned null");
    wasmModule._free(sizePtr);
    return false;
  }

  // Read size from WASM memory (little-endian 32-bit value)
  const heap = wasmModule.HEAPU8;
  const size =
    heap[sizePtr] |
    (heap[sizePtr + 1] << 8) |
    (heap[sizePtr + 2] << 16) |
    (heap[sizePtr + 3] << 24);

  if (size <= 0 || size > 10000000) {
    console.error(`saveDiskWithPicker: invalid size ${size}`);
    wasmModule._free(sizePtr);
    return false;
  }

  const data = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, size);

  // Create a copy of the data since the WASM buffer may become invalid
  const dataCopy = new Uint8Array(data);

  wasmModule._free(sizePtr);

  // Try to use File System Access API (modern browsers)
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [
          {
            description: "Disk Images",
            accept: {
              "application/octet-stream": [".dsk", ".do", ".po", ".woz", ".nib"],
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
    downloadFile(dataCopy, suggestedName);
    return true;
  }
}

/**
 * Download file using traditional blob/anchor approach
 * @param {Uint8Array} data - The file data
 * @param {string} filename - The filename
 */
export function downloadFile(data, filename) {
  const blob = new Blob([data], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
