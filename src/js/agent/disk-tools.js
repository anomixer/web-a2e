/*
 * disk-tools.js - Disk drive operation tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { loadDiskFromData, insertBlankDisk } from "../disk-manager/disk-operations.js";
import { getRecentDisks, loadRecentDisk, clearRecentDisks } from "../disk-manager/disk-persistence.js";

export const diskTools = {
  /**
   * Insert a disk image into a drive by path
   */
  driveInsertDisc: async (args) => {
    const { driveNum = 1, path } = args;

    if (!path) {
      throw new Error("path parameter is required");
    }

    // Validate driveNum (1 or 2)
    if (driveNum !== 1 && driveNum !== 2) {
      throw new Error("driveNum must be 1 or 2");
    }

    // Validate disk format
    const supportedFormats = ['.dsk', '.do', '.po', '.nib', '.woz'];
    const extension = path.toLowerCase().match(/\.(dsk|do|po|nib|woz)$/);

    if (!extension) {
      throw new Error(
        `Unsupported disk format. Supported formats: ${supportedFormats.join(', ')}`
      );
    }

    // Convert to 0-based index
    const driveIndex = driveNum - 1;

    // Get disk manager and WASM module
    const diskManager = window.emulator?.diskManager;
    const wasmModule = window.emulator?.wasmModule;

    if (!diskManager) {
      throw new Error("Disk manager not available");
    }

    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Get drive state
    const drive = diskManager.drives[driveIndex];
    if (!drive) {
      throw new Error(`Drive ${driveNum} not found`);
    }

    try {
      // Call MCP tool to load disk image from filesystem
      const agentManager = window.emulator?.agentManager;
      if (!agentManager) {
        throw new Error("Agent manager not available");
      }

      const result = await agentManager.callMCPTool("load_disk_image", { path });

      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to load disk image");
      }

      // Decode base64 to Uint8Array
      const binaryString = atob(result.data);
      const data = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        data[i] = binaryString.charCodeAt(i);
      }

      // Use filename from MCP result
      const filename = result.filename;

      // Load disk using the disk operations helper
      return new Promise((resolve, reject) => {
        loadDiskFromData({
          wasmModule,
          drive,
          driveNum: driveIndex,
          filename,
          data,
          onSuccess: (loadedFilename) => {
            // Update UI
            diskManager.setDiskName(driveIndex, loadedFilename);

            // Notify if callback exists
            if (diskManager.onDiskLoaded) {
              diskManager.onDiskLoaded(driveIndex, loadedFilename);
            }

            resolve({
              success: true,
              drive: driveNum,
              filename: loadedFilename,
              size: data.length,
              message: `Disk inserted into drive ${driveNum}: ${loadedFilename}`,
            });
          },
          onError: (error) => {
            reject(new Error(`Failed to insert disk: ${error}`));
          },
        });
      });
    } catch (error) {
      throw new Error(`Error loading disk image: ${error.message}`);
    }
  },

  /**
   * Get list of recent disks for a drive
   */
  driveRecentsList: async (args) => {
    const { driveNum = 1 } = args;

    // Validate driveNum (1 or 2)
    if (driveNum !== 1 && driveNum !== 2) {
      throw new Error("driveNum must be 1 or 2");
    }

    // Convert to 0-based index
    const driveIndex = driveNum - 1;

    try {
      // Get recent disks from IndexedDB
      const recentDisks = await getRecentDisks(driveIndex);

      // Return list of filenames with access times
      const diskList = recentDisks.map(disk => ({
        filename: disk.filename,
        accessedAt: disk.accessedAt,
        id: disk.id,
      }));

      return {
        success: true,
        drive: driveNum,
        count: diskList.length,
        disks: diskList,
        message: `Found ${diskList.length} recent disk(s) for drive ${driveNum}`,
      };

    } catch (error) {
      throw new Error(`Error getting recent disks: ${error.message}`);
    }
  },

  /**
   * Insert a recent disk by name
   */
  driveInsertRecent: async (args) => {
    const { driveNum = 1, name } = args;

    if (!name) {
      throw new Error("name parameter is required");
    }

    // Validate driveNum (1 or 2)
    if (driveNum !== 1 && driveNum !== 2) {
      throw new Error("driveNum must be 1 or 2");
    }

    // Convert to 0-based index
    const driveIndex = driveNum - 1;

    // Get disk manager and WASM module
    const diskManager = window.emulator?.diskManager;
    const wasmModule = window.emulator?.wasmModule;

    if (!diskManager) {
      throw new Error("Disk manager not available");
    }

    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Get drive state
    const drive = diskManager.drives[driveIndex];
    if (!drive) {
      throw new Error(`Drive ${driveNum} not found`);
    }

    try {
      // Get recent disks list
      const recentDisks = await getRecentDisks(driveIndex);

      // Find the disk by filename
      const diskEntry = recentDisks.find(d => d.filename === name);
      if (!diskEntry) {
        throw new Error(`Disk "${name}" not found in recent list for drive ${driveNum}`);
      }

      // Load the disk data from IndexedDB
      const diskData = await loadRecentDisk(diskEntry.id);
      if (!diskData) {
        throw new Error(`Failed to load disk data for "${name}"`);
      }

      // Load disk using the disk operations helper
      return new Promise((resolve, reject) => {
        loadDiskFromData({
          wasmModule,
          drive,
          driveNum: driveIndex,
          filename: diskData.filename,
          data: diskData.data,
          onSuccess: (loadedFilename) => {
            // Update UI
            diskManager.setDiskName(driveIndex, loadedFilename);

            // Notify if callback exists
            if (diskManager.onDiskLoaded) {
              diskManager.onDiskLoaded(driveIndex, loadedFilename);
            }

            resolve({
              success: true,
              drive: driveNum,
              filename: loadedFilename,
              size: diskData.data.length,
              message: `Recent disk inserted into drive ${driveNum}: ${loadedFilename}`,
            });
          },
          onError: (error) => {
            reject(new Error(`Failed to insert disk: ${error}`));
          },
        });
      });

    } catch (error) {
      throw new Error(`Error inserting recent disk: ${error.message}`);
    }
  },

  /**
   * Load a recent disk by filename
   */
  driveLoadRecent: async (args) => {
    const { driveNum = 1, file } = args;

    if (!file) {
      throw new Error("file parameter is required");
    }

    // Validate driveNum (1 or 2)
    if (driveNum !== 1 && driveNum !== 2) {
      throw new Error("driveNum must be 1 or 2");
    }

    // Convert to 0-based index
    const driveIndex = driveNum - 1;

    // Get disk manager and WASM module
    const diskManager = window.emulator?.diskManager;
    const wasmModule = window.emulator?.wasmModule;

    if (!diskManager) {
      throw new Error("Disk manager not available");
    }

    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Get drive state
    const drive = diskManager.drives[driveIndex];
    if (!drive) {
      throw new Error(`Drive ${driveNum} not found`);
    }

    try {
      // Get recent disks list
      const recentDisks = await getRecentDisks(driveIndex);

      // Find the disk by filename
      const diskEntry = recentDisks.find(d => d.filename === file);
      if (!diskEntry) {
        throw new Error(`Disk "${file}" not found in recent list for drive ${driveNum}`);
      }

      // Load the disk data from IndexedDB
      const diskData = await loadRecentDisk(diskEntry.id);
      if (!diskData) {
        throw new Error(`Failed to load disk data for "${file}"`);
      }

      // Load disk using the disk operations helper
      return new Promise((resolve, reject) => {
        loadDiskFromData({
          wasmModule,
          drive,
          driveNum: driveIndex,
          filename: diskData.filename,
          data: diskData.data,
          onSuccess: (loadedFilename) => {
            // Update UI
            diskManager.setDiskName(driveIndex, loadedFilename);

            // Notify if callback exists
            if (diskManager.onDiskLoaded) {
              diskManager.onDiskLoaded(driveIndex, loadedFilename);
            }

            resolve({
              success: true,
              drive: driveNum,
              filename: loadedFilename,
              size: diskData.data.length,
              message: `Recent disk loaded into drive ${driveNum}: ${loadedFilename}`,
            });
          },
          onError: (error) => {
            reject(new Error(`Failed to insert disk: ${error}`));
          },
        });
      });

    } catch (error) {
      throw new Error(`Error loading recent disk: ${error.message}`);
    }
  },

  /**
   * Clear all recent disks for a drive
   */
  drivesClearRecent: async (args) => {
    const { driveNum = 1 } = args;

    // Validate driveNum (1 or 2)
    if (driveNum !== 1 && driveNum !== 2) {
      throw new Error("driveNum must be 1 or 2");
    }

    // Convert to 0-based index
    const driveIndex = driveNum - 1;

    try {
      // Clear recent disks from IndexedDB
      await clearRecentDisks(driveIndex);

      return {
        success: true,
        drive: driveNum,
        message: `Cleared all recent disks for drive ${driveNum}`,
      };

    } catch (error) {
      throw new Error(`Error clearing recent disks: ${error.message}`);
    }
  },

  /**
   * Eject a disk from a drive
   */
  diskDriveEject: async (args) => {
    const { driveNum = 1 } = args;

    // Validate driveNum (1 or 2)
    if (driveNum !== 1 && driveNum !== 2) {
      throw new Error("driveNum must be 1 or 2");
    }

    // Convert to 0-based index
    const driveIndex = driveNum - 1;

    // Get disk manager and WASM module
    const diskManager = window.emulator?.diskManager;
    const wasmModule = window.emulator?.wasmModule;

    if (!diskManager) {
      throw new Error("Disk manager not available");
    }

    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Check if a disk is inserted
    const isDiskInserted = await wasmModule._isDiskInserted(driveIndex);
    if (!isDiskInserted) {
      return {
        success: true,
        drive: driveNum,
        message: `No disk in drive ${driveNum}`,
      };
    }

    try {
      // Eject disk via WASM
      wasmModule._ejectDisk(driveIndex);

      // Update UI
      diskManager.setDiskName(driveIndex, null);

      // Notify if callback exists
      if (diskManager.onDiskEjected) {
        diskManager.onDiskEjected(driveIndex);
      }

      return {
        success: true,
        drive: driveNum,
        message: `Disk ejected from drive ${driveNum}`,
      };

    } catch (error) {
      throw new Error(`Error ejecting disk: ${error.message}`);
    }
  },

  /**
   * Insert a fresh blank, write-enabled WOZ disk into a drive. The disk is
   * unformatted (no DOS/ProDOS filesystem) — boot a system disk and INIT it,
   * or write to it with RWTS, to give it a filesystem.
   */
  driveInsertBlank: async (args = {}) => {
    const { driveNum = 1 } = args;

    if (driveNum !== 1 && driveNum !== 2) {
      throw new Error("driveNum must be 1 or 2");
    }

    const driveIndex = driveNum - 1;
    const diskManager = window.emulator?.diskManager;
    const wasmModule = window.emulator?.wasmModule;

    if (!diskManager) {
      throw new Error("Disk manager not available");
    }
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    const drive = diskManager.drives[driveIndex];
    if (!drive) {
      throw new Error(`Drive ${driveNum} not found`);
    }

    return new Promise((resolve, reject) => {
      insertBlankDisk({
        wasmModule,
        drive,
        driveNum: driveIndex,
        onSuccess: (filename) => {
          diskManager.setDiskName(driveIndex, filename);
          if (diskManager.onDiskLoaded) {
            diskManager.onDiskLoaded(driveIndex, filename);
          }
          resolve({
            success: true,
            drive: driveNum,
            filename,
            message: `Blank WOZ disk inserted into drive ${driveNum}`,
          });
        },
        onError: (error) => {
          reject(new Error(`Failed to insert blank disk: ${error}`));
        },
      });
    });
  },

  /**
   * Read the current (in-emulator, modifications included) disk image bytes for
   * a drive and return them base64-encoded. Pairs with the MCP `save_to`
   * `from: "disk"` source so the image is written to the filesystem without the
   * base64 passing through the LLM. Format matches the inserted image
   * (.woz / .dsk / .nib / etc.).
   */
  getDiskImageData: async (args = {}) => {
    const { driveNum = 1 } = args;

    if (driveNum !== 1 && driveNum !== 2) {
      throw new Error("driveNum must be 1 or 2");
    }

    const driveIndex = driveNum - 1;
    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    if (!(await wasmModule._isDiskInserted(driveIndex))) {
      throw new Error(`No disk in drive ${driveNum}`);
    }

    const sizePtr = await wasmModule._malloc(4);
    if (!sizePtr) {
      throw new Error("Failed to allocate size pointer");
    }

    let dataPtr;
    let size;
    try {
      dataPtr = await wasmModule._getDiskData(driveIndex, sizePtr);
      if (!dataPtr) {
        throw new Error("_getDiskData returned null");
      }
      size = await wasmModule.heapDataViewU32(sizePtr);
    } finally {
      await wasmModule._free(sizePtr);
    }

    if (size <= 0 || size > 10000000) {
      throw new Error(`Invalid disk image size: ${size}`);
    }

    // _getDiskData points into a C++-owned buffer — read only, do not free.
    const bytes = await wasmModule.heapRead(dataPtr, size);

    // Encode to base64 in chunks to avoid call-stack limits on large images.
    let binaryString = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binaryString += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    const contentBase64 = btoa(binaryString);

    // Suggested filename: current disk name, WOZ for blank/unnamed.
    const diskManager = window.emulator?.diskManager;
    let filename = diskManager?.drives?.[driveIndex]?.filename || `disk${driveNum}.woz`;
    if (filename === "Blank Disk.woz" || !filename.includes(".")) {
      filename = filename.replace(/\.[^.]*$/, "") + ".woz";
    }

    return {
      success: true,
      drive: driveNum,
      filename,
      size,
      isBinary: true,
      contentBase64,
      message: `Read ${size}-byte disk image from drive ${driveNum}`,
    };
  },
};
