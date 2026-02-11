/*
 * file-explorer-tools.js - File Explorer window tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const fileExplorerTools = {
  /**
   * List files in a disk drive
   */
  listDiskFiles: async (args) => {
    const { drive = 0 } = args;

    if (drive !== 0 && drive !== 1) {
      throw new Error("drive must be 0 or 1");
    }

    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const feWindow = windowManager.getWindow("file-explorer-window");
    if (!feWindow) {
      throw new Error("File explorer window not found");
    }

    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Check if disk is inserted
    if (!wasmModule._isDiskInserted(drive)) {
      return {
        success: false,
        drive: drive,
        format: null,
        files: [],
        message: `No disk in drive ${drive + 1}`,
      };
    }

    // Get disk data
    const sizePtr = wasmModule._malloc(4);
    const dataPtr = wasmModule._getDiskSectorData(drive, sizePtr);
    const size = new Uint32Array(wasmModule.HEAPU8.buffer, sizePtr, 1)[0];
    wasmModule._free(sizePtr);

    if (!dataPtr || size === 0) {
      return {
        success: false,
        drive: drive,
        format: null,
        files: [],
        message: "Cannot read disk data",
      };
    }

    // Detect format and read catalog
    let format = null;
    let files = [];
    let volumeName = null;

    if (wasmModule._isProDOSFormat(dataPtr, size)) {
      format = "prodos";
      wasmModule._getProDOSVolumeInfo(dataPtr, size);
      volumeName = wasmModule.UTF8ToString(wasmModule._getProDOSVolumeName());

      const count = wasmModule._getProDOSCatalog(dataPtr, size);
      for (let i = 0; i < count; i++) {
        const fileType = wasmModule._getProDOSEntryFileType(i);
        const isDirectory = wasmModule._getProDOSEntryIsDirectory(i);

        files.push({
          filename: wasmModule.UTF8ToString(
            wasmModule._getProDOSEntryFilename(i),
          ),
          path: wasmModule.UTF8ToString(wasmModule._getProDOSEntryPath(i)),
          type: fileType,
          typeName: wasmModule.UTF8ToString(
            wasmModule._getProDOSEntryFileTypeName(i),
          ),
          isDirectory: isDirectory,
          isLocked: wasmModule._getProDOSEntryIsLocked(i),
          size: wasmModule._getProDOSEntryEOF(i),
          blocks: wasmModule._getProDOSEntryBlocksUsed(i),
          index: i,
        });
      }
    } else if (wasmModule._isDOS33Format(dataPtr, size)) {
      format = "dos33";

      const count = wasmModule._getDOS33Catalog(dataPtr, size);
      for (let i = 0; i < count; i++) {
        const fileType = wasmModule._getDOS33EntryFileType(i);

        files.push({
          filename: wasmModule.UTF8ToString(
            wasmModule._getDOS33EntryFilename(i),
          ),
          type: fileType,
          typeName: wasmModule.UTF8ToString(
            wasmModule._getDOS33EntryFileTypeName(i),
          ),
          isLocked: wasmModule._getDOS33EntryIsLocked(i),
          sectors: wasmModule._getDOS33EntrySectorCount(i),
          index: i,
        });
      }
    }

    return {
      success: true,
      drive: drive,
      format: format,
      volumeName: volumeName,
      fileCount: files.length,
      files: files,
      message: `Found ${files.length} file(s) on ${format ? format.toUpperCase() : "Unknown"} disk in drive ${drive + 1}`,
    };
  },

  /**
   * Get file content from disk
   */
  getDiskFileContent: async (args) => {
    const { drive = 0, filename, isBinary = true } = args;

    if (!filename) {
      throw new Error("filename parameter is required");
    }

    if (drive !== 0 && drive !== 1) {
      throw new Error("drive must be 0 or 1");
    }

    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Check if disk is inserted
    if (!wasmModule._isDiskInserted(drive)) {
      throw new Error(`No disk in drive ${drive + 1}`);
    }

    // Get disk data
    const sizePtr = wasmModule._malloc(4);
    const dataPtr = wasmModule._getDiskSectorData(drive, sizePtr);
    const size = new Uint32Array(wasmModule.HEAPU8.buffer, sizePtr, 1)[0];
    wasmModule._free(sizePtr);

    if (!dataPtr || size === 0) {
      throw new Error("Cannot read disk data");
    }

    // Detect format and find file
    let format = null;
    let fileIndex = -1;
    let fileData = null;

    if (wasmModule._isProDOSFormat(dataPtr, size)) {
      format = "prodos";
      const count = wasmModule._getProDOSCatalog(dataPtr, size);

      // Find file by name or path
      for (let i = 0; i < count; i++) {
        const name = wasmModule.UTF8ToString(
          wasmModule._getProDOSEntryFilename(i),
        );
        const path = wasmModule.UTF8ToString(
          wasmModule._getProDOSEntryPath(i),
        );

        if (name === filename || path === filename) {
          fileIndex = i;
          break;
        }
      }

      if (fileIndex === -1) {
        throw new Error(`File not found: ${filename}`);
      }

      // Read file
      const bytesRead = wasmModule._readProDOSFile(dataPtr, size, fileIndex);
      if (bytesRead === 0) {
        throw new Error("Failed to read file");
      }

      const bufPtr = wasmModule._getProDOSFileBuffer();
      fileData = new Uint8Array(bytesRead);
      fileData.set(new Uint8Array(wasmModule.HEAPU8.buffer, bufPtr, bytesRead));
    } else if (wasmModule._isDOS33Format(dataPtr, size)) {
      format = "dos33";
      const count = wasmModule._getDOS33Catalog(dataPtr, size);

      // Find file by name
      for (let i = 0; i < count; i++) {
        const name = wasmModule.UTF8ToString(
          wasmModule._getDOS33EntryFilename(i),
        );
        if (name === filename) {
          fileIndex = i;
          break;
        }
      }

      if (fileIndex === -1) {
        throw new Error(`File not found: ${filename}`);
      }

      // Read file
      const bytesRead = wasmModule._readDOS33File(dataPtr, size, fileIndex);
      if (bytesRead === 0) {
        throw new Error("Failed to read file");
      }

      const bufPtr = wasmModule._getDOS33FileBuffer();
      fileData = new Uint8Array(bytesRead);
      fileData.set(new Uint8Array(wasmModule.HEAPU8.buffer, bufPtr, bytesRead));
    } else {
      throw new Error("Unknown disk format");
    }

    // Return either base64 (binary) or plain text
    if (isBinary) {
      const base64 = btoa(String.fromCharCode(...fileData));
      return {
        success: true,
        filename: filename,
        drive: drive,
        format: format,
        size: fileData.length,
        isBinary: true,
        contentBase64: base64,
        message: `Read ${fileData.length} bytes from ${filename}`,
      };
    } else {
      // Decode as text (assuming ASCII/high-bit ASCII)
      let text = "";
      for (let i = 0; i < fileData.length; i++) {
        const byte = fileData[i];
        // Handle carriage return (0x0D) as newline
        if (byte === 0x0d) {
          text += "\n";
        } else if (byte === 0x00) {
          // Skip null bytes
          continue;
        } else {
          // Strip high bit for high-bit ASCII
          text += String.fromCharCode(byte & 0x7f);
        }
      }
      return {
        success: true,
        filename: filename,
        drive: drive,
        format: format,
        size: fileData.length,
        isBinary: false,
        content: text,
        message: `Read ${fileData.length} bytes from ${filename}`,
      };
    }
  },
};
