// Disk Persistence - Save and restore disk images using IndexedDB
// Allows disks to persist across browser sessions

const DB_NAME = "a2e-disk-persistence";
const DB_VERSION = 1;
const STORE_NAME = "disks";

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
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "driveNum" });
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
