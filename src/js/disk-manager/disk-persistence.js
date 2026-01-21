// Disk Persistence - Save and restore disk images using IndexedDB
// Allows disks to persist across browser sessions

const DB_NAME = "a2e-disk-persistence";
const DB_VERSION = 3;
const STORE_NAME = "disks";
const RECENT_STORE_NAME = "recentDisks";
const MAX_RECENT_DISKS = 10;

let db = null;

/**
 * Open the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open disk persistence database:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
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
    };
  });
}

/**
 * Save a disk image to IndexedDB
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {string} filename - The disk filename
 * @param {Uint8Array} data - The disk image data
 * @returns {Promise<void>}
 */
export async function saveDiskToStorage(driveNum, filename, data) {
  try {
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Store the disk data
    const diskRecord = {
      driveNum,
      filename,
      data: new Uint8Array(data), // Make a copy
      savedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(diskRecord);
      request.onsuccess = () => {
        console.log(`Saved disk to storage: drive ${driveNum + 1}, ${filename}`);
        resolve();
      };
      request.onerror = () => {
        console.error("Failed to save disk to storage:", request.error);
        reject(request.error);
      };
    });
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
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(driveNum);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log(`Loaded disk from storage: drive ${driveNum + 1}, ${result.filename}`);
          resolve({
            filename: result.filename,
            data: new Uint8Array(result.data),
          });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error("Failed to load disk from storage:", request.error);
        reject(request.error);
      };
    });
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
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(driveNum);
      request.onsuccess = () => {
        console.log(`Cleared disk from storage: drive ${driveNum + 1}`);
        resolve();
      };
      request.onerror = () => {
        console.error("Failed to clear disk from storage:", request.error);
        reject(request.error);
      };
    });
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
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => {
        resolve(request.result > 0);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error checking persisted disks:", error);
    return false;
  }
}

// ============================================================================
// Recent Disks Functions
// ============================================================================

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
    const database = await openDB();

    // First, check if this filename already exists for this drive and remove it
    const existingId = await findRecentDiskByFilename(database, driveNum, filename);
    if (existingId !== null) {
      await removeRecentDiskById(database, existingId);
    }

    // Add the new entry
    const transaction = database.transaction(RECENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RECENT_STORE_NAME);

    const diskRecord = {
      driveNum,
      filename,
      data: new Uint8Array(data),
      accessedAt: Date.now(),
    };

    await new Promise((resolve, reject) => {
      const request = store.add(diskRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Trim to MAX_RECENT_DISKS for this drive
    await trimRecentDisks(database, driveNum);

    console.log(`Added to recent disks (drive ${driveNum + 1}): ${filename}`);
  } catch (error) {
    console.error("Error adding to recent disks:", error);
  }
}

/**
 * Find a recent disk by filename for a specific drive
 * @param {IDBDatabase} database
 * @param {number} driveNum - Drive number (0 or 1)
 * @param {string} filename
 * @returns {Promise<number|null>} The record ID or null
 */
async function findRecentDiskByFilename(database, driveNum, filename) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RECENT_STORE_NAME, "readonly");
    const store = transaction.objectStore(RECENT_STORE_NAME);
    const index = store.index("filename");

    // Need to iterate to find matching driveNum and filename
    const request = index.openCursor(IDBKeyRange.only(filename));
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.driveNum === driveNum) {
          resolve(cursor.primaryKey);
        } else {
          cursor.continue();
        }
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove a recent disk by its ID
 * @param {IDBDatabase} database
 * @param {number} id
 * @returns {Promise<void>}
 */
async function removeRecentDiskById(database, id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RECENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RECENT_STORE_NAME);

    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Trim recent disks to MAX_RECENT_DISKS entries for a specific drive, removing oldest
 * @param {IDBDatabase} database
 * @param {number} driveNum - Drive number (0 or 1)
 * @returns {Promise<void>}
 */
async function trimRecentDisks(database, driveNum) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RECENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RECENT_STORE_NAME);
    const index = store.index("accessedAt");

    // Collect all records for this drive, sorted by accessedAt (ascending = oldest first)
    const records = [];
    const request = index.openCursor();

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.driveNum === driveNum) {
          records.push({ id: cursor.primaryKey, accessedAt: cursor.value.accessedAt });
        }
        cursor.continue();
      } else {
        // Delete excess entries for this drive
        if (records.length > MAX_RECENT_DISKS) {
          const deleteCount = records.length - MAX_RECENT_DISKS;
          // Records are already sorted by accessedAt (oldest first)
          for (let i = 0; i < deleteCount; i++) {
            store.delete(records[i].id);
          }
        }
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the list of recent disks for a specific drive, sorted by most recently accessed
 * @param {number} driveNum - Drive number (0 or 1)
 * @returns {Promise<Array<{id: number, filename: string, accessedAt: number}>>}
 */
export async function getRecentDisks(driveNum) {
  try {
    const database = await openDB();
    const transaction = database.transaction(RECENT_STORE_NAME, "readonly");
    const store = transaction.objectStore(RECENT_STORE_NAME);
    const index = store.index("accessedAt");

    return new Promise((resolve, reject) => {
      const results = [];
      // Open cursor in reverse (newest first)
      const request = index.openCursor(null, "prev");

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          // Only include entries for this drive
          if (cursor.value.driveNum === driveNum) {
            results.push({
              id: cursor.value.id,
              filename: cursor.value.filename,
              accessedAt: cursor.value.accessedAt,
            });
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
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
    const database = await openDB();
    const transaction = database.transaction(RECENT_STORE_NAME, "readonly");
    const store = transaction.objectStore(RECENT_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve({
            filename: result.filename,
            data: new Uint8Array(result.data),
          });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
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
    const database = await openDB();
    await removeRecentDiskById(database, id);
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
    const database = await openDB();
    const transaction = database.transaction(RECENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RECENT_STORE_NAME);

    return new Promise((resolve, reject) => {
      // Iterate through all records and delete those matching driveNum
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.driveNum === driveNum) {
            store.delete(cursor.primaryKey);
          }
          cursor.continue();
        } else {
          console.log(`Cleared recent disks for drive ${driveNum + 1}`);
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Error clearing recent disks:", error);
  }
}
