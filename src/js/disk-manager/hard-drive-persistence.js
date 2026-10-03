/*
 * hard-drive-persistence.js - Block image persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_VERSION = 1;
const STORE_NAME = "images";
const RECENT_STORE_NAME = "recentImages";
const MAX_RECENT_IMAGES = 10;

/*
 * The image in each unit and the recent images, in a database of their own.
 * The SmartPort's units and the IIgs's 3.5" drives each have one, so the two
 * kinds of drive keep their own images and their own recents.
 */
export function createImageStore(dbName, label) {
  const db = createDatabaseManager({
    dbName,
    version: DB_VERSION,
    onUpgrade: (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "deviceNum" });
      }

      if (!database.objectStoreNames.contains(RECENT_STORE_NAME)) {
        const recentStore = database.createObjectStore(RECENT_STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        recentStore.createIndex("filename", "filename", { unique: false });
        recentStore.createIndex("accessedAt", "accessedAt", { unique: false });
        recentStore.createIndex("deviceNum", "deviceNum", { unique: false });
      }
    },
  });

  async function saveImageToStorage(deviceNum, filename, data) {
    try {
      const record = {
        deviceNum,
        filename,
        data: new Uint8Array(data),
        savedAt: Date.now(),
      };
      await db.put(STORE_NAME, record);
      console.log(`Saved ${label} image to storage: device ${deviceNum + 1}, ${filename}`);
    } catch (error) {
      console.error(`Error saving ${label} image to storage:`, error);
    }
  }

  async function loadImageFromStorage(deviceNum) {
    try {
      const result = await db.get(STORE_NAME, deviceNum);
      if (result) {
        console.log(`Loaded ${label} image from storage: device ${deviceNum + 1}, ${result.filename}`);
        return {
          filename: result.filename,
          data: new Uint8Array(result.data),
        };
      }
      return null;
    } catch (error) {
      console.error(`Error loading ${label} image from storage:`, error);
      return null;
    }
  }

  async function clearImageFromStorage(deviceNum) {
    try {
      await db.remove(STORE_NAME, deviceNum);
      console.log(`Cleared ${label} image from storage: device ${deviceNum + 1}`);
    } catch (error) {
      console.error(`Error clearing ${label} image from storage:`, error);
    }
  }

  async function findRecentByFilename(deviceNum, filename) {
    let foundId = null;
    await db.iterate(
      RECENT_STORE_NAME,
      { indexName: "filename", range: IDBKeyRange.only(filename) },
      (value, cursor) => {
        if (value.deviceNum === deviceNum) {
          foundId = cursor.primaryKey;
          return false;
        }
      }
    );
    return foundId;
  }

  async function trimRecentImages(deviceNum) {
    const records = [];
    await db.iterate(
      RECENT_STORE_NAME,
      { indexName: "accessedAt" },
      (value, cursor) => {
        if (value.deviceNum === deviceNum) {
          records.push({ id: cursor.primaryKey, accessedAt: value.accessedAt });
        }
      }
    );
    if (records.length > MAX_RECENT_IMAGES) {
      const deleteCount = records.length - MAX_RECENT_IMAGES;
      for (let i = 0; i < deleteCount; i++) {
        await db.remove(RECENT_STORE_NAME, records[i].id);
      }
    }
  }

  async function addToRecentImages(deviceNum, filename, data) {
    try {
      const existingId = await findRecentByFilename(deviceNum, filename);
      if (existingId !== null) {
        await db.remove(RECENT_STORE_NAME, existingId);
      }
      const record = {
        deviceNum,
        filename,
        data: new Uint8Array(data),
        accessedAt: Date.now(),
      };
      await db.add(RECENT_STORE_NAME, record);
      await trimRecentImages(deviceNum);
      console.log(`Added to recent ${label} images (device ${deviceNum + 1}): ${filename}`);
    } catch (error) {
      console.error(`Error adding to recent ${label} images:`, error);
    }
  }

  async function getRecentImages(deviceNum) {
    try {
      const results = [];
      await db.iterate(
        RECENT_STORE_NAME,
        { indexName: "accessedAt", direction: "prev" },
        (value) => {
          if (value.deviceNum === deviceNum) {
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
      console.error(`Error getting recent ${label} images:`, error);
      return [];
    }
  }

  async function loadRecentImage(id) {
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
      console.error(`Error loading recent ${label} image:`, error);
      return null;
    }
  }

  async function clearRecentImages(deviceNum) {
    try {
      const idsToDelete = [];
      await db.iterate(RECENT_STORE_NAME, {}, (value, cursor) => {
        if (value.deviceNum === deviceNum) {
          idsToDelete.push(cursor.primaryKey);
        }
      });
      for (const id of idsToDelete) {
        await db.remove(RECENT_STORE_NAME, id);
      }
      console.log(`Cleared recent ${label} images for device ${deviceNum + 1}`);
    } catch (error) {
      console.error(`Error clearing recent ${label} images:`, error);
    }
  }

  return {
    saveImageToStorage,
    loadImageFromStorage,
    clearImageFromStorage,
    addToRecentImages,
    getRecentImages,
    loadRecentImage,
    clearRecentImages,
  };
}

const hardDrives = createImageStore("a2e-hd-persistence", "HD");
export const {
  saveImageToStorage,
  loadImageFromStorage,
  clearImageFromStorage,
  addToRecentImages,
  getRecentImages,
  loadRecentImage,
  clearRecentImages,
} = hardDrives;
