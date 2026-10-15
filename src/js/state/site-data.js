/*
 * site-data.js - Everything the emulator keeps in the browser, and clearing it
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/*
 * File › Reset Defaults has to clear everything a visit leaves behind, or a
 * bad disk image or a stale cached file comes straight back after it and the
 * only remedy is the browser's own "clear site data". So every database the
 * app opens is named here, and anything else called "a2e-..." that the
 * browser reports is cleared too, in case a database is added and this list
 * is not told.
 */
export const APP_DATABASES = [
  "a2e-state-persistence", // save states and the autosave
  "a2e-disk-persistence", // 5.25" disks in the drives, and their recents
  "a2e-35-persistence", // a IIgs's 3.5" disks, and their recents
  "a2e-hd-persistence", // SmartPort images, and their recents
  "a2e-disk-library-cache", // disks fetched from the library
  "a2e-printer-pages", // the print browser's pages
];

/** The databases to delete: the known ones, and any other a2e- one the browser lists. */
export async function databasesToDelete(idb = globalThis.indexedDB) {
  const names = new Set(APP_DATABASES);
  try {
    if (idb?.databases) {
      for (const { name } of await idb.databases()) {
        if (name?.startsWith("a2e-")) names.add(name);
      }
    }
  } catch {
    // Not every browser lists its databases; the known ones are enough.
  }
  return [...names];
}

/**
 * Delete one database. Settles whatever happens, because a reset that stops
 * halfway is worse than one that tries everything. A delete another tab is
 * blocking completes when that tab lets go, which every connection this app
 * opens does at once (indexeddb-helper.js closes on versionchange).
 */
function deleteDatabase(idb, name) {
  return new Promise((resolve) => {
    let request;
    try {
      request = idb.deleteDatabase(name);
    } catch {
      resolve();
      return;
    }
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => console.warn(`Deleting ${name} is waiting for another tab`);
  });
}

/**
 * Clear everything the emulator stores: localStorage, sessionStorage, every
 * database, the service worker and its caches. The caller reloads afterwards.
 */
export async function clearSiteData() {
  try {
    localStorage.clear();
  } catch {
    // Storage blocked: nothing there to clear.
  }
  try {
    sessionStorage.clear();
  } catch {
    // As above.
  }

  if (globalThis.indexedDB) {
    const names = await databasesToDelete();
    await Promise.all(names.map((name) => deleteDatabase(indexedDB, name)));
  }

  // A service worker, from an installed app or an older version that
  // registered one in every tab, serves cached files until it is removed.
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(registrations.map((r) => r.unregister()));
  } catch {
    // No service workers in this context.
  }
  try {
    if (globalThis.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache storage unavailable.
  }
}
