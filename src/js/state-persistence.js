// State Persistence - Save and restore emulator state using IndexedDB
// Allows machine state to persist across browser sessions

const DB_NAME = "a2e-state-persistence";
const DB_VERSION = 1;
const STORE_NAME = "emulatorState";

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
      console.error("Failed to open state persistence database:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Save emulator state to IndexedDB
 * @param {Uint8Array} stateData - The serialized emulator state
 * @returns {Promise<void>}
 */
export async function saveStateToStorage(stateData) {
  try {
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const stateRecord = {
      id: "autosave",
      data: new Uint8Array(stateData),
      savedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(stateRecord);
      request.onsuccess = () => {
        console.log("Saved emulator state to storage");
        resolve();
      };
      request.onerror = () => {
        console.error("Failed to save emulator state:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error saving emulator state:", error);
  }
}

/**
 * Load emulator state from IndexedDB
 * @returns {Promise<Uint8Array | null>}
 */
export async function loadStateFromStorage() {
  try {
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get("autosave");
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log("Loaded emulator state from storage");
          resolve(new Uint8Array(result.data));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error("Failed to load emulator state:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error loading emulator state:", error);
    return null;
  }
}

/**
 * Clear saved emulator state from IndexedDB
 * @returns {Promise<void>}
 */
export async function clearStateFromStorage() {
  try {
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete("autosave");
      request.onsuccess = () => {
        console.log("Cleared emulator state from storage");
        resolve();
      };
      request.onerror = () => {
        console.error("Failed to clear emulator state:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error clearing emulator state:", error);
  }
}

/**
 * Check if there is a saved emulator state
 * @returns {Promise<boolean>}
 */
export async function hasSavedState() {
  try {
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get("autosave");
      request.onsuccess = () => {
        resolve(request.result != null);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error checking for saved state:", error);
    return false;
  }
}

/**
 * Get the timestamp of the last saved state
 * @returns {Promise<number | null>} Timestamp in milliseconds, or null if no saved state
 */
export async function getSavedStateTimestamp() {
  try {
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get("autosave");
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.savedAt : null);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error getting saved state timestamp:", error);
    return null;
  }
}
