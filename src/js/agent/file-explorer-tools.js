/*
 * file-explorer-tools.js - File Explorer window tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

/**
 * Read a file's raw bytes from a disk image mounted in the given drive.
 * Shared by getDiskFileContent (which encodes to base64/text for the LLM) and
 * directLoadFileAt (which writes straight to emulator memory, no base64).
 * Returns { format, bytes } where bytes is a Uint8Array copy.
 * @param {object} wasmModule - WASM proxy
 * @param {number} drive - 0 or 1
 * @param {string} filename - file name or full ProDOS path
 */
export async function readDiskFileBytes(wasmModule, drive, filename) {
  if (drive !== 0 && drive !== 1) {
    throw new Error("drive must be 0 or 1");
  }
  if (!filename) {
    throw new Error("filename parameter is required");
  }
  if (!(await wasmModule._isDiskInserted(drive))) {
    throw new Error(`No disk in drive ${drive + 1}`);
  }

  // Get disk data
  const sizePtr = await wasmModule._malloc(4);
  const dataPtr = await wasmModule._getDiskSectorData(drive, sizePtr);
  const size = (await wasmModule.heapReadU32(sizePtr, 1))[0];
  await wasmModule._free(sizePtr);

  if (!dataPtr || size === 0) {
    throw new Error("Cannot read disk data");
  }

  let format = null;
  let fileIndex = -1;
  let bytes = null;

  if (await wasmModule._isProDOSFormat(dataPtr, size)) {
    format = "prodos";
    const count = await wasmModule._getProDOSCatalog(dataPtr, size);
    for (let i = 0; i < count; i++) {
      const name = await wasmModule.UTF8ToString(
        await wasmModule._getProDOSEntryFilename(i),
      );
      const path = await wasmModule.UTF8ToString(
        await wasmModule._getProDOSEntryPath(i),
      );
      if (name === filename || path === filename) {
        fileIndex = i;
        break;
      }
    }
    if (fileIndex === -1) {
      throw new Error(`File not found: ${filename}`);
    }
    const bytesRead = await wasmModule._readProDOSFile(dataPtr, size, fileIndex);
    if (bytesRead === 0) {
      throw new Error("Failed to read file");
    }
    bytes = await wasmModule.heapRead(
      await wasmModule._getProDOSFileBuffer(),
      bytesRead,
    );
  } else if (await wasmModule._isDOS33Format(dataPtr, size)) {
    format = "dos33";
    const count = await wasmModule._getDOS33Catalog(dataPtr, size);
    for (let i = 0; i < count; i++) {
      const name = await wasmModule.UTF8ToString(
        await wasmModule._getDOS33EntryFilename(i),
      );
      if (name === filename) {
        fileIndex = i;
        break;
      }
    }
    if (fileIndex === -1) {
      throw new Error(`File not found: ${filename}`);
    }
    const bytesRead = await wasmModule._readDOS33File(dataPtr, size, fileIndex);
    if (bytesRead === 0) {
      throw new Error("Failed to read file");
    }
    bytes = await wasmModule.heapRead(
      await wasmModule._getDOS33FileBuffer(),
      bytesRead,
    );
  } else {
    throw new Error("Unknown disk format");
  }

  return { format, bytes };
}

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
    if (!await wasmModule._isDiskInserted(drive)) {
      return {
        success: false,
        drive: drive,
        format: null,
        files: [],
        message: `No disk in drive ${drive + 1}`,
      };
    }

    // Get disk data
    const sizePtr = await wasmModule._malloc(4);
    const dataPtr = await wasmModule._getDiskSectorData(drive, sizePtr);
    const size = (await wasmModule.heapReadU32(sizePtr, 1))[0];
    await wasmModule._free(sizePtr);

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

    if (await wasmModule._isProDOSFormat(dataPtr, size)) {
      format = "prodos";
      await wasmModule._getProDOSVolumeInfo(dataPtr, size);
      volumeName = await wasmModule.UTF8ToString(await wasmModule._getProDOSVolumeName());

      const count = await wasmModule._getProDOSCatalog(dataPtr, size);
      for (let i = 0; i < count; i++) {
        const fileType = await wasmModule._getProDOSEntryFileType(i);
        const isDirectory = await wasmModule._getProDOSEntryIsDirectory(i);

        files.push({
          filename: await wasmModule.UTF8ToString(
            await wasmModule._getProDOSEntryFilename(i),
          ),
          path: await wasmModule.UTF8ToString(await wasmModule._getProDOSEntryPath(i)),
          type: fileType,
          typeName: await wasmModule.UTF8ToString(
            await wasmModule._getProDOSEntryFileTypeName(i),
          ),
          isDirectory: isDirectory,
          isLocked: await wasmModule._getProDOSEntryIsLocked(i),
          size: await wasmModule._getProDOSEntryEOF(i),
          blocks: await wasmModule._getProDOSEntryBlocksUsed(i),
          index: i,
        });
      }
    } else if (await wasmModule._isDOS33Format(dataPtr, size)) {
      format = "dos33";

      const count = await wasmModule._getDOS33Catalog(dataPtr, size);
      for (let i = 0; i < count; i++) {
        const fileType = await wasmModule._getDOS33EntryFileType(i);

        files.push({
          filename: await wasmModule.UTF8ToString(
            await wasmModule._getDOS33EntryFilename(i),
          ),
          type: fileType,
          typeName: await wasmModule.UTF8ToString(
            await wasmModule._getDOS33EntryFileTypeName(i),
          ),
          isLocked: await wasmModule._getDOS33EntryIsLocked(i),
          sectors: await wasmModule._getDOS33EntrySectorCount(i),
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

    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Read the file's raw bytes (shared with directLoadFileAt)
    const { format, bytes: fileData } = await readDiskFileBytes(
      wasmModule,
      drive,
      filename,
    );

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
