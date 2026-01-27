// State Persistence - Save and restore emulator state using IndexedDB
// Allows machine state to persist across browser sessions

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME = "a2e-state-persistence";
const DB_VERSION = 1;
const STORE_NAME = "emulatorState";

const db = createDatabaseManager({
  dbName: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (event) => {
    const database = event.target.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  },
});

/**
 * Save emulator state to IndexedDB
 * @param {Uint8Array} stateData - The serialized emulator state
 * @returns {Promise<void>}
 */
export async function saveStateToStorage(stateData) {
  try {
    const stateRecord = {
      id: "autosave",
      data: new Uint8Array(stateData),
      savedAt: Date.now(),
    };

    await db.put(STORE_NAME, stateRecord);
    console.log("Saved emulator state to storage");
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
    const result = await db.get(STORE_NAME, "autosave");
    if (result) {
      console.log("Loaded emulator state from storage");
      return new Uint8Array(result.data);
    }
    return null;
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
    await db.remove(STORE_NAME, "autosave");
    console.log("Cleared emulator state from storage");
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
    const result = await db.get(STORE_NAME, "autosave");
    return result != null;
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
    const result = await db.get(STORE_NAME, "autosave");
    return result ? result.savedAt : null;
  } catch (error) {
    console.error("Error getting saved state timestamp:", error);
    return null;
  }
}
