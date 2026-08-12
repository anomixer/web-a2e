/*
 * disk-operations.js - Disk image loading and management operations
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import {
  saveDiskToStorage,
  clearDiskFromStorage,
  addToRecentDisks,
} from "./disk-persistence.js";
import { showChoicePrompt, showConfirm } from "../ui/confirm.js";

/**
 * Fingerprint the disk image as the emulator would currently serialise it.
 *
 * `_isDiskModified` only records that a write happened at some point, which is
 * not the same question as whether the image differs from the one that went in.
 * Software rewrites sectors with identical content routinely, and that should
 * not produce a save prompt. Comparing a fingerprint taken at insert with one
 * taken at eject answers the question actually being asked.
 *
 * Both fingerprints come from `_getDiskData`, so they are produced by the same
 * serialiser and are directly comparable — the raw file bytes are not, since a
 * DSK is re-encoded on the way in.
 *
 * @param {Object} wasmModule - The WASM module
 * @param {number} driveNum - Drive number (0 or 1)
 * @returns {Promise<string|null>} Fingerprint, or null if the image is unreadable
 */
export async function fingerprintDisk(wasmModule, driveNum) {
  const sizePtr = await wasmModule._malloc(4);
  if (!sizePtr) return null;

  try {
    const dataPtr = await wasmModule._getDiskData(driveNum, sizePtr);
    if (!dataPtr) return null;

    const size = await wasmModule.heapDataViewU32(sizePtr);
    if (size <= 0 || size > 10000000) return null;

    const bytes = await wasmModule.heapRead(dataPtr, size);

    // FNV-1a. Not cryptographic — it only has to catch a disk that changed,
    // and a collision would at worst skip a save prompt for an image whose
    // every byte hashed identically.
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193);
    }
    return `${size}:${(hash >>> 0).toString(16)}`;
  } finally {
    await wasmModule._free(sizePtr);
  }
}

/**
 * Helper to insert a disk into WASM with proper memory management
 * @param {Object} wasmModule - The WASM module
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {Uint8Array} data - The disk image data
 * @param {string} filename - The disk filename
 * @returns {boolean} True if successful
 */
async function insertDiskToWasm(wasmModule, driveNum, data, filename) {
  // Allocate memory for disk data
  const dataPtr = await wasmModule._malloc(data.length);
  await wasmModule.heapWrite(dataPtr, data);

  // Allocate string for filename
  const filenamePtr = await wasmModule._malloc(filename.length + 1);
  await wasmModule.stringToUTF8(filename, filenamePtr, filename.length + 1);

  // Insert disk
  const success = await wasmModule._insertDisk(driveNum, dataPtr, data.length, filenamePtr);

  // Free memory
  await wasmModule._free(dataPtr);
  await wasmModule._free(filenamePtr);

  return success;
}

/**
 * Load a disk image from a file into a drive
 * @param {Object} options
 * @param {Object} options.wasmModule - The WASM module
 * @param {Object} options.drive - The drive state object
 * @param {number} options.driveNum - Drive number (0 or 1)
 * @param {File} options.file - The file to load
 * @param {Function} [options.onSuccess] - Callback on successful load
 * @param {Function} [options.onError] - Callback on error
 */
export async function loadDisk({ wasmModule, drive, driveNum, file, onSuccess, onError }) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const success = await insertDiskToWasm(wasmModule, driveNum, data, file.name);

    if (success) {
      drive.filename = file.name;
      if (drive.ejectBtn) drive.ejectBtn.disabled = false;
      if (drive.browseBtn) drive.browseBtn.disabled = false;
      drive.baselineFingerprint = await fingerprintDisk(wasmModule, driveNum);
      console.log(`Inserted disk in drive ${driveNum + 1}: ${file.name}`);

      // Save to IndexedDB for persistence across sessions
      await saveDiskToStorage(driveNum, file.name, data);

      // Add to recent disks list for this drive
      await addToRecentDisks(driveNum, file.name, data);

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
 * @param {Object} options
 * @param {Object} options.wasmModule - The WASM module
 * @param {Object} options.drive - The drive state object
 * @param {number} options.driveNum - Drive number (0 or 1)
 * @param {string} options.filename - The disk filename
 * @param {Uint8Array} options.data - The disk image data
 * @param {Function} [options.onSuccess] - Callback on successful load
 * @param {Function} [options.onError] - Callback on error
 */
export async function loadDiskFromData({ wasmModule, drive, driveNum, filename, data, onSuccess, onError }) {
  try {
    const success = await insertDiskToWasm(wasmModule, driveNum, data, filename);

    if (success) {
      drive.filename = filename;
      if (drive.ejectBtn) drive.ejectBtn.disabled = false;
      if (drive.browseBtn) drive.browseBtn.disabled = false;
      drive.baselineFingerprint = await fingerprintDisk(wasmModule, driveNum);
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
 * @param {Object} options
 * @param {Object} options.wasmModule - The WASM module
 * @param {Object} options.drive - The drive state object
 * @param {number} options.driveNum - Drive number (0 or 1)
 * @param {Function} [options.onSuccess] - Callback on successful insert
 * @param {Function} [options.onError] - Callback on error
 */
export async function insertBlankDisk({ wasmModule, drive, driveNum, onSuccess, onError }) {
  const filename = "Blank Disk.woz";

  // Use the WASM function to create and insert a blank disk
  const success = await wasmModule._insertBlankDisk(driveNum);

  if (success) {
    drive.filename = filename;
    if (drive.ejectBtn) drive.ejectBtn.disabled = false;
    drive.baselineFingerprint = await fingerprintDisk(wasmModule, driveNum);
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
 * @param {Object} options
 * @param {Object} options.wasmModule - The WASM module
 * @param {Object} options.drive - The drive state object
 * @param {number} options.driveNum - Drive number (0 or 1)
 * @param {Function} [options.onEject] - Callback after ejection
 */
export function performEject({ wasmModule, drive, driveNum, onEject }) {
  wasmModule._ejectDisk(driveNum);

  drive.filename = null;
  drive.baselineFingerprint = null;
  if (drive.ejectBtn) drive.ejectBtn.disabled = true;
  if (drive.browseBtn) drive.browseBtn.disabled = true;
  if (drive.input) drive.input.value = "";

  // Clear from IndexedDB
  clearDiskFromStorage(driveNum);

  console.log(`Ejected disk from drive ${driveNum + 1}`);
  if (onEject) onEject();
}

/**
 * Eject a disk, prompting to save if modified
 * @param {Object} options
 * @param {Object} options.wasmModule - The WASM module
 * @param {Object} options.drive - The drive state object
 * @param {number} options.driveNum - Drive number (0 or 1)
 * @param {Function} [options.onEject] - Callback after ejection
 */
export async function ejectDisk({ wasmModule, drive, driveNum, onEject }) {
  // Two gates, cheap one first. `_isDiskModified` says whether anything was
  // ever written; the fingerprint says whether the image actually differs from
  // the one that went in. Only the second is the question worth prompting over,
  // but it costs a serialisation, so it is only asked when a write did happen.
  const hasModifiedCheck = typeof wasmModule._isDiskModified === "function";
  let isModified = hasModifiedCheck && await wasmModule._isDiskModified(driveNum);

  if (isModified && drive.baselineFingerprint) {
    const current = await fingerprintDisk(wasmModule, driveNum);
    if (current && current === drive.baselineFingerprint) {
      console.log(
        `Drive ${driveNum + 1} was written to but its contents are unchanged — ejecting without saving`,
      );
      isModified = false;
    }
  }

  if (isModified) {
    // Suggest the name the disk came in under. The format dialog puts the
    // right extension on it for whichever format is chosen there, so there is
    // nothing to decide about the extension here.
    const suggestedName = drive.filename || `disk${driveNum + 1}`;

    // Ask for format and name, then the OS save picker
    await saveDiskWithPicker(wasmModule, driveNum, suggestedName);
  }

  // Always eject after save attempt
  performEject({ wasmModule, drive, driveNum, onEject });
}

/**
 * Save disk data using the File System Access API
 * @param {Object} wasmModule - The WASM module
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {string} suggestedName - Suggested filename
 * @returns {Promise<boolean>} True if saved successfully
 */
export async function saveDiskWithPicker(wasmModule, driveNum, suggestedName) {
  const choice = await chooseSaveFormat(wasmModule, driveNum, suggestedName);
  if (!choice) {
    console.log(`Save cancelled for drive ${driveNum + 1}`);
    return false;
  }

  const dataCopy = await exportDiskAs(wasmModule, driveNum, choice.format);
  if (!dataCopy) {
    await showConfirm(
      `This disk cannot be saved as ${SAVE_FORMATS[choice.format].label}.`,
      "OK",
    );
    return false;
  }

  const extensions = SAVE_FORMATS[choice.format].extensions;

  // Try to use File System Access API (modern browsers)
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: choice.name,
        types: [
          {
            description: SAVE_FORMATS[choice.format].label,
            accept: { "application/octet-stream": extensions },
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
  }

  // No File System Access API (Safari, Firefox). The format dialog already
  // collected the name, so a download is all that is left.
  downloadFile(dataCopy, choice.name);
  return true;
}

/**
 * The formats a disk can be saved as, in the order the dialog offers them.
 * Keyed by the format id the WASM layer uses (a2e::DiskSaveFormat).
 */
export const SAVE_FORMATS = {
  0: {
    label: "DOS 3.3 order",
    hint: ".dsk",
    extensions: [".dsk", ".do"],
    defaultExtension: ".dsk",
  },
  1: {
    label: "ProDOS order",
    hint: ".po",
    extensions: [".po"],
    defaultExtension: ".po",
  },
  2: {
    label: "WOZ",
    hint: ".woz",
    extensions: [".woz"],
    defaultExtension: ".woz",
  },
};

/**
 * Swap a filename's extension for the one a format uses, leaving a name that
 * already carries a correct extension for that format alone (.do stays .do).
 */
export function nameForFormat(filename, format) {
  const spec = SAVE_FORMATS[format];
  if (!spec) return filename;

  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot).toLowerCase() : "";

  if (spec.extensions.includes(extension)) return filename;
  return base + spec.defaultExtension;
}

/**
 * Ask which format to save in, defaulting to the one the image came from so
 * saving without thinking about it never re-encodes the disk.
 *
 * Formats the disk cannot honour are offered but disabled: a copy-protected
 * WOZ has no sector representation, and silently omitting the option would
 * look like the emulator had simply forgotten how to write .dsk files.
 *
 * @returns {Promise<{format: number, name: string}|null>} null if cancelled
 */
async function chooseSaveFormat(wasmModule, driveNum, suggestedName) {
  const formats = [0, 1, 2];

  let nativeFormat = 0;
  if (typeof wasmModule._getDiskNativeFormat === "function") {
    nativeFormat = await wasmModule._getDiskNativeFormat(driveNum);
  }

  const available = {};
  for (const format of formats) {
    available[format] =
      typeof wasmModule._canSaveDiskAs === "function"
        ? await wasmModule._canSaveDiskAs(driveNum, format)
        : true;
  }

  // A disk that cannot be saved in its own format is not a disk at all
  if (!formats.some((format) => available[format])) return null;
  if (!available[nativeFormat]) {
    nativeFormat = formats.find((format) => available[format]);
  }

  const choices = formats.map((format) => ({
    value: String(format),
    label: SAVE_FORMATS[format].label,
    hint: available[format]
      ? SAVE_FORMATS[format].hint
      : "not possible for this disk",
    disabled: !available[format],
  }));

  const result = await showChoicePrompt({
    message: `Save the disk in drive ${driveNum + 1} as:`,
    defaultValue: nameForFormat(suggestedName, nativeFormat),
    choices,
    selected: String(nativeFormat),
    confirmLabel: "Save",
    onChoiceChange: (value, currentName) =>
      nameForFormat(currentName, Number(value)),
  });

  if (!result) return null;
  return { format: Number(result.value), name: result.name };
}

/**
 * Read a drive's image out of WASM in a given format.
 * @returns {Promise<Uint8Array|null>} null if the conversion is not possible
 */
async function exportDiskAs(wasmModule, driveNum, format) {
  const sizePtr = await wasmModule._malloc(4);
  if (!sizePtr) {
    console.error("exportDiskAs: failed to allocate size pointer");
    return null;
  }

  try {
    const dataPtr =
      typeof wasmModule._getDiskDataAs === "function"
        ? await wasmModule._getDiskDataAs(driveNum, format, sizePtr)
        : await wasmModule._getDiskData(driveNum, sizePtr);

    if (!dataPtr) {
      console.error(`exportDiskAs: no data for drive ${driveNum} format ${format}`);
      return null;
    }

    const size = await wasmModule.heapDataViewU32(sizePtr);
    if (size <= 0 || size > 10000000) {
      console.error(`exportDiskAs: invalid size ${size}`);
      return null;
    }

    return await wasmModule.heapRead(dataPtr, size);
  } finally {
    await wasmModule._free(sizePtr);
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
