/*
 * smartport-tools.js - SmartPort hard drive operation tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import {
  getRecentImages,
  loadRecentImage,
  clearRecentImages,
  saveImageToStorage,
  addToRecentImages,
} from "../disk-manager/hard-drive-persistence.js";

function requireSmartPort() {
  const wasmModule = window.emulator?.wasmModule;
  if (!wasmModule) {
    throw new Error("WASM module not available");
  }
  if (!wasmModule._isSmartPortCardInstalled ||
      !wasmModule._isSmartPortCardInstalled()) {
    throw new Error(
      "SmartPort card is not installed. Use slotsInstallCard to install it in a compatible slot."
    );
  }
  return wasmModule;
}

export const smartportTools = {
  /**
   * Insert a SmartPort image into a device by path
   */
  smartportInsertImage: async (args) => {
    const { deviceNum = 1, path } = args;

    if (!path) {
      throw new Error("path parameter is required");
    }

    if (deviceNum !== 1 && deviceNum !== 2) {
      throw new Error("deviceNum must be 1 or 2");
    }

    const supportedFormats = [".hdv", ".po", ".2mg"];
    const extension = path.toLowerCase().match(/\.(hdv|po|2mg)$/);

    if (!extension) {
      throw new Error(
        `Unsupported SmartPort format. Supported formats: ${supportedFormats.join(", ")}`
      );
    }

    const deviceIndex = deviceNum - 1;

    requireSmartPort();

    const hardDriveManager = window.emulator?.hardDriveManager;
    if (!hardDriveManager) {
      throw new Error("Hard drive manager not available");
    }

    try {
      const agentManager = window.emulator?.agentManager;
      if (!agentManager) {
        throw new Error("Agent manager not available");
      }

      const result = await agentManager.callMCPTool("load_smartport_image", { path });

      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to load SmartPort image");
      }

      const binaryString = atob(result.data);
      const data = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        data[i] = binaryString.charCodeAt(i);
      }

      const filename = result.filename;

      const success = hardDriveManager.loadImageFromData(deviceIndex, filename, data);
      if (!success) {
        throw new Error("Failed to insert SmartPort image into emulator");
      }

      await saveImageToStorage(deviceIndex, filename, data);
      await addToRecentImages(deviceIndex, filename, data);

      return {
        success: true,
        device: deviceNum,
        filename: filename,
        size: data.length,
        message: `SmartPort image inserted into device ${deviceNum}: ${filename}`,
      };
    } catch (error) {
      throw new Error(`Error loading SmartPort image: ${error.message}`);
    }
  },

  /**
   * Get list of recent images for a device
   */
  smartportRecentsList: async (args) => {
    const { deviceNum = 1 } = args;

    if (deviceNum !== 1 && deviceNum !== 2) {
      throw new Error("deviceNum must be 1 or 2");
    }

    const deviceIndex = deviceNum - 1;

    try {
      const recentImages = await getRecentImages(deviceIndex);

      const imageList = recentImages.map(img => ({
        filename: img.filename,
        accessedAt: img.accessedAt,
        id: img.id,
      }));

      return {
        success: true,
        device: deviceNum,
        count: imageList.length,
        images: imageList,
        message: `Found ${imageList.length} recent image(s) for device ${deviceNum}`,
      };
    } catch (error) {
      throw new Error(`Error getting recent images: ${error.message}`);
    }
  },

  /**
   * Insert a recent image by name
   */
  smartportInsertRecent: async (args) => {
    const { deviceNum = 1, name } = args;

    if (!name) {
      throw new Error("name parameter is required");
    }

    if (deviceNum !== 1 && deviceNum !== 2) {
      throw new Error("deviceNum must be 1 or 2");
    }

    const deviceIndex = deviceNum - 1;

    requireSmartPort();

    const hardDriveManager = window.emulator?.hardDriveManager;
    if (!hardDriveManager) {
      throw new Error("Hard drive manager not available");
    }

    try {
      const recentImages = await getRecentImages(deviceIndex);

      const imageEntry = recentImages.find(img => img.filename === name);
      if (!imageEntry) {
        throw new Error(`Image "${name}" not found in recent list for device ${deviceNum}`);
      }

      const imageData = await loadRecentImage(imageEntry.id);
      if (!imageData) {
        throw new Error(`Failed to load image data for "${name}"`);
      }

      const success = hardDriveManager.loadImageFromData(deviceIndex, imageData.filename, imageData.data);
      if (!success) {
        throw new Error("Failed to insert SmartPort image into emulator");
      }

      await saveImageToStorage(deviceIndex, imageData.filename, imageData.data);
      await addToRecentImages(deviceIndex, imageData.filename, imageData.data);

      return {
        success: true,
        device: deviceNum,
        filename: imageData.filename,
        size: imageData.data.length,
        message: `Recent image inserted into device ${deviceNum}: ${imageData.filename}`,
      };
    } catch (error) {
      throw new Error(`Error inserting recent image: ${error.message}`);
    }
  },

  /**
   * Clear all recent images for a device
   */
  smartportClearRecent: async (args) => {
    const { deviceNum = 1 } = args;

    if (deviceNum !== 1 && deviceNum !== 2) {
      throw new Error("deviceNum must be 1 or 2");
    }

    const deviceIndex = deviceNum - 1;

    try {
      await clearRecentImages(deviceIndex);

      return {
        success: true,
        device: deviceNum,
        message: `Cleared all recent images for device ${deviceNum}`,
      };
    } catch (error) {
      throw new Error(`Error clearing recent images: ${error.message}`);
    }
  },
};
