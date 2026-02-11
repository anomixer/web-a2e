/*
 * state-persistence.js - State persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

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
 * @param {string|null} [thumbnail] - Optional data URL of screenshot thumbnail
 * @param {string|null} [preview] - Optional data URL of high-res preview
 * @returns {Promise<void>}
 */
export async function saveStateToStorage(stateData, thumbnail, preview) {
  try {
    const stateRecord = {
      id: "autosave",
      data: stateData,
      savedAt: Date.now(),
      thumbnail: thumbnail || null,
      preview: preview || null,
    };

    await db.put(STORE_NAME, stateRecord);
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

/**
 * Get autosave summary info (without loading full state data)
 * @returns {Promise<{savedAt: number, thumbnail: string|null}|null>}
 */
export async function getAutosaveInfo() {
  try {
    const result = await db.get(STORE_NAME, "autosave");
    if (result) {
      return {
        savedAt: result.savedAt,
        thumbnail: result.thumbnail || null,
        preview: result.preview || null,
      };
    }
    return null;
  } catch (error) {
    console.error("Error getting autosave info:", error);
    return null;
  }
}

// --- Save State Slots ---

const SLOT_COUNT = 5;

function slotKey(slotNumber) {
  return `slot-${slotNumber}`;
}

/**
 * Save emulator state to a numbered slot
 * @param {number} slotNumber - Slot number (1-5)
 * @param {Uint8Array} stateData - The serialized emulator state
 * @param {string|null} thumbnail - Data URL of screenshot thumbnail
 * @param {string|null} [preview] - Optional data URL of high-res preview
 * @returns {Promise<void>}
 */
export async function saveStateToSlot(slotNumber, stateData, thumbnail, preview) {
  try {
    const record = {
      id: slotKey(slotNumber),
      data: new Uint8Array(stateData),
      savedAt: Date.now(),
      thumbnail: thumbnail || null,
      preview: preview || null,
    };
    await db.put(STORE_NAME, record);
  } catch (error) {
    console.error(`Error saving state to slot ${slotNumber}:`, error);
  }
}

/**
 * Load emulator state from a numbered slot
 * @param {number} slotNumber - Slot number (1-5)
 * @returns {Promise<{data: Uint8Array, savedAt: number, thumbnail: string|null}|null>}
 */
export async function loadStateFromSlot(slotNumber) {
  try {
    const result = await db.get(STORE_NAME, slotKey(slotNumber));
    if (result) {
      return {
        data: new Uint8Array(result.data),
        savedAt: result.savedAt,
        thumbnail: result.thumbnail || null,
      };
    }
    return null;
  } catch (error) {
    console.error(`Error loading state from slot ${slotNumber}:`, error);
    return null;
  }
}

/**
 * Clear a numbered slot
 * @param {number} slotNumber - Slot number (1-5)
 * @returns {Promise<void>}
 */
export async function clearSlot(slotNumber) {
  try {
    await db.remove(STORE_NAME, slotKey(slotNumber));
  } catch (error) {
    console.error(`Error clearing slot ${slotNumber}:`, error);
  }
}

/**
 * Get summary info for all 5 slots (without loading full state data)
 * @returns {Promise<Array<{slotNumber: number, savedAt: number, thumbnail: string|null}|null>>}
 */
export async function getAllSlotInfo() {
  const slots = [];
  for (let i = 1; i <= SLOT_COUNT; i++) {
    try {
      const result = await db.get(STORE_NAME, slotKey(i));
      if (result) {
        slots.push({
          slotNumber: i,
          savedAt: result.savedAt,
          thumbnail: result.thumbnail || null,
          preview: result.preview || null,
        });
      } else {
        slots.push(null);
      }
    } catch (error) {
      slots.push(null);
    }
  }
  return slots;
}
