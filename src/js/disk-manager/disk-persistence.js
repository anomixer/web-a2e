/*
 * disk-persistence.js - Disk image persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME = "a2e-disk-persistence";
const DB_VERSION = 3;
const STORE_NAME = "disks";
const RECENT_STORE_NAME = "recentDisks";
const MAX_RECENT_DISKS = 10;

const db = createDatabaseManager({
  dbName: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (event) => {
    const database = event.target.result;
    const oldVersion = event.oldVersion;

    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "driveNum" });
    }

    // v2: Add recent disks store
    if (!database.objectStoreNames.contains(RECENT_STORE_NAME)) {
      const recentStore = database.createObjectStore(RECENT_STORE_NAME, {
        keyPath: "id",
        autoIncrement: true,
      });
      recentStore.createIndex("filename", "filename", { unique: false });
      recentStore.createIndex("accessedAt", "accessedAt", { unique: false });
      recentStore.createIndex("driveNum", "driveNum", { unique: false });
    } else if (oldVersion < 3) {
      // v3: Add driveNum index to existing store
      const transaction = event.target.transaction;
      const recentStore = transaction.objectStore(RECENT_STORE_NAME);
      if (!recentStore.indexNames.contains("driveNum")) {
        recentStore.createIndex("driveNum", "driveNum", { unique: false });
      }
    }
  },
});

/**
 * Save a disk image to IndexedDB
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {string} filename - The disk filename
 * @param {Uint8Array} data - The disk image data
 * @returns {Promise<void>}
 */
export async function saveDiskToStorage(driveNum, filename, data) {
  try {
    const diskRecord = {
      driveNum,
      filename,
      data: new Uint8Array(data),
      savedAt: Date.now(),
    };

    await db.put(STORE_NAME, diskRecord);
    console.log(`Saved disk to storage: drive ${driveNum + 1}, ${filename}`);
  } catch (error) {
    console.error("Error saving disk to storage:", error);
  }
}

/**
 * Load a disk image from IndexedDB
 * @param {number} driveNum - Drive number (0 or 1)
 * @returns {Promise<{filename: string, data: Uint8Array} | null>}
 */
export async function loadDiskFromStorage(driveNum) {
  try {
    const result = await db.get(STORE_NAME, driveNum);
    if (result) {
      console.log(`Loaded disk from storage: drive ${driveNum + 1}, ${result.filename}`);
      return {
        filename: result.filename,
        data: new Uint8Array(result.data),
      };
    }
    return null;
  } catch (error) {
    console.error("Error loading disk from storage:", error);
    return null;
  }
}

/**
 * Remove a disk from IndexedDB storage
 * @param {number} driveNum - Drive number (0 or 1)
 * @returns {Promise<void>}
 */
export async function clearDiskFromStorage(driveNum) {
  try {
    await db.remove(STORE_NAME, driveNum);
    console.log(`Cleared disk from storage: drive ${driveNum + 1}`);
  } catch (error) {
    console.error("Error clearing disk from storage:", error);
  }
}

/**
 * Check if there are any persisted disks
 * @returns {Promise<boolean>}
 */
export async function hasPersistedDisks() {
  try {
    const count = await db.count(STORE_NAME);
    return count > 0;
  } catch (error) {
    console.error("Error checking persisted disks:", error);
    return false;
  }
}

// ============================================================================
// Recent Disks Functions
// ============================================================================

/**
 * Find a recent disk by filename for a specific drive
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {string} filename
 * @returns {Promise<number|null>} The record ID or null
 */
async function findRecentDiskByFilename(driveNum, filename) {
  let foundId = null;

  await db.iterate(
    RECENT_STORE_NAME,
    { indexName: "filename", range: IDBKeyRange.only(filename) },
    (value, cursor) => {
      if (value.driveNum === driveNum) {
        foundId = cursor.primaryKey;
        return false; // Stop iteration
      }
    }
  );

  return foundId;
}

/**
 * Trim recent disks to MAX_RECENT_DISKS entries for a specific drive
 * @param {number} driveNum - Drive number (0 or 1)
 * @returns {Promise<void>}
 */
async function trimRecentDisks(driveNum) {
  // Collect all records for this drive
  const records = [];

  await db.iterate(
    RECENT_STORE_NAME,
    { indexName: "accessedAt" },
    (value, cursor) => {
      if (value.driveNum === driveNum) {
        records.push({ id: cursor.primaryKey, accessedAt: value.accessedAt });
      }
    }
  );

  // Delete excess entries (oldest first since sorted by accessedAt)
  if (records.length > MAX_RECENT_DISKS) {
    const deleteCount = records.length - MAX_RECENT_DISKS;
    for (let i = 0; i < deleteCount; i++) {
      await db.remove(RECENT_STORE_NAME, records[i].id);
    }
  }
}

/**
 * Add a disk to the recent disks list for a specific drive
 * If the disk already exists (same filename for same drive), update its access time
 * Maintains a maximum of MAX_RECENT_DISKS entries per drive
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {string} filename - The disk filename
 * @param {Uint8Array} data - The disk image data
 * @returns {Promise<void>}
 */
export async function addToRecentDisks(driveNum, filename, data) {
  try {
    // Check if this filename already exists for this drive and remove it
    const existingId = await findRecentDiskByFilename(driveNum, filename);
    if (existingId !== null) {
      await db.remove(RECENT_STORE_NAME, existingId);
    }

    // Add the new entry
    const diskRecord = {
      driveNum,
      filename,
      data: new Uint8Array(data),
      accessedAt: Date.now(),
    };

    await db.add(RECENT_STORE_NAME, diskRecord);

    // Trim to MAX_RECENT_DISKS for this drive
    await trimRecentDisks(driveNum);

    console.log(`Added to recent disks (drive ${driveNum + 1}): ${filename}`);
  } catch (error) {
    console.error("Error adding to recent disks:", error);
  }
}

/**
 * Get the list of recent disks for a specific drive, sorted by most recently accessed
 * @param {number} driveNum - Drive number (0 or 1)
 * @returns {Promise<Array<{id: number, filename: string, accessedAt: number}>>}
 */
export async function getRecentDisks(driveNum) {
  try {
    const results = [];

    await db.iterate(
      RECENT_STORE_NAME,
      { indexName: "accessedAt", direction: "prev" },
      (value) => {
        if (value.driveNum === driveNum) {
          results.push({
            id: value.id,
            filename: value.filename,
            accessedAt: value.accessedAt,
          });
        }
      }
    );

    return results;
  } catch (error) {
    console.error("Error getting recent disks:", error);
    return [];
  }
}

/**
 * Load a recent disk by its ID
 * @param {number} id - The record ID
 * @returns {Promise<{filename: string, data: Uint8Array} | null>}
 */
export async function loadRecentDisk(id) {
  try {
    const result = await db.get(RECENT_STORE_NAME, id);
    if (result) {
      return {
        filename: result.filename,
        data: new Uint8Array(result.data),
      };
    }
    return null;
  } catch (error) {
    console.error("Error loading recent disk:", error);
    return null;
  }
}

/**
 * Remove a disk from the recent list
 * @param {number} id - The record ID
 * @returns {Promise<void>}
 */
export async function removeRecentDisk(id) {
  try {
    await db.remove(RECENT_STORE_NAME, id);
    console.log(`Removed recent disk with id: ${id}`);
  } catch (error) {
    console.error("Error removing recent disk:", error);
  }
}

/**
 * Clear all recent disks for a specific drive
 * @param {number} driveNum - Drive number (0 or 1)
 * @returns {Promise<void>}
 */
export async function clearRecentDisks(driveNum) {
  try {
    // Collect IDs to delete
    const idsToDelete = [];

    await db.iterate(RECENT_STORE_NAME, {}, (value, cursor) => {
      if (value.driveNum === driveNum) {
        idsToDelete.push(cursor.primaryKey);
      }
    });

    // Delete them
    for (const id of idsToDelete) {
      await db.remove(RECENT_STORE_NAME, id);
    }

    console.log(`Cleared recent disks for drive ${driveNum + 1}`);
  } catch (error) {
    console.error("Error clearing recent disks:", error);
  }
}
