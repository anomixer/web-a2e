/*
 * hard-drive-persistence.js - Hard drive image persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME = "a2e-hd-persistence";
const DB_VERSION = 1;
const STORE_NAME = "images";
const RECENT_STORE_NAME = "recentImages";
const MAX_RECENT_IMAGES = 10;

const db = createDatabaseManager({
  dbName: DB_NAME,
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

export async function saveImageToStorage(deviceNum, filename, data) {
  try {
    const record = {
      deviceNum,
      filename,
      data: new Uint8Array(data),
      savedAt: Date.now(),
    };
    await db.put(STORE_NAME, record);
    console.log(`Saved HD image to storage: device ${deviceNum + 1}, ${filename}`);
  } catch (error) {
    console.error("Error saving HD image to storage:", error);
  }
}

export async function loadImageFromStorage(deviceNum) {
  try {
    const result = await db.get(STORE_NAME, deviceNum);
    if (result) {
      console.log(`Loaded HD image from storage: device ${deviceNum + 1}, ${result.filename}`);
      return {
        filename: result.filename,
        data: new Uint8Array(result.data),
      };
    }
    return null;
  } catch (error) {
    console.error("Error loading HD image from storage:", error);
    return null;
  }
}

export async function clearImageFromStorage(deviceNum) {
  try {
    await db.remove(STORE_NAME, deviceNum);
    console.log(`Cleared HD image from storage: device ${deviceNum + 1}`);
  } catch (error) {
    console.error("Error clearing HD image from storage:", error);
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

export async function addToRecentImages(deviceNum, filename, data) {
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
    console.log(`Added to recent HD images (device ${deviceNum + 1}): ${filename}`);
  } catch (error) {
    console.error("Error adding to recent HD images:", error);
  }
}

export async function getRecentImages(deviceNum) {
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
    console.error("Error getting recent HD images:", error);
    return [];
  }
}

export async function loadRecentImage(id) {
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
    console.error("Error loading recent HD image:", error);
    return null;
  }
}

export async function clearRecentImages(deviceNum) {
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
    console.log(`Cleared recent HD images for device ${deviceNum + 1}`);
  } catch (error) {
    console.error("Error clearing recent HD images:", error);
  }
}
