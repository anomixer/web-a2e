// Service Worker for Apple //e Emulator
// Enables offline functionality by caching app assets

// Replaced at build time with the app version from src/js/config/version.js by
// the stamp-service-worker-version plugin in vite.config.js — do not rely on
// the literal below in production, and do not hand-bump it.
//
// It has to change whenever a stable-named precached asset changes, because
// those are served cache-first and their URLs never change. It used to be a
// hand-maintained number, which meant 1.1.12 shipped a rewritten crt.glsl that
// returning browsers carried on ignoring. Tying it to the release version makes
// that automatic. The value here is only what the dev server sees.
const CACHE_VERSION = "dev";
const CACHE_NAME = `a2e-cache-v${CACHE_VERSION}`;

// Files that should always be fetched fresh (network-first).
// index.html is included so a redeploy is always picked up even if the cache
// version was not bumped: a cache-first index.html can otherwise pin a browser
// to a stale build (and its stale hashed bundle) indefinitely. Offline still
// works because network-first falls back to the cache on fetch failure.
const NETWORK_FIRST_FILES = ["/", "/index.html", "/a2e.js", "/a2e.wasm"];

// Assets to cache on install.
//
// Only paths that genuinely exist in the build output, and only stable ones.
// This list previously named ten /css/*.css files that Vite does not emit — it
// bundles every stylesheet into one hashed /assets/main-<hash>.css — so the
// install always failed. cache.addAll() rejects if a SINGLE entry 404s, which
// meant one stale path silently disabled offline support entirely.
//
// Two rules keep that from recurring:
//   1. Hashed bundles are never listed here. They are discovered from
//      index.html at install time by findHashedAssets(), so a new build's
//      hashes need no edit to this file.
//   2. Precaching is per-entry and tolerant (see precache()), so a missing
//      asset costs that one asset instead of all offline support.
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  // Emulator core. emulator-worker.js was missing and is not optional: the
  // whole emulator runs inside it.
  "/a2e.js",
  "/a2e.wasm",
  "/audio-worklet.js",
  "/emulator-worker.js",
  // Fetched at runtime by WebGLRenderer.init(), which throws without them —
  // so an offline launch failed before drawing anything. Cached under their
  // bare paths; loadShader() asks for them with a ?v= cache buster, which the
  // lookup below deliberately ignores.
  "/shaders/vertex.glsl",
  "/shaders/crt.glsl",
  "/shaders/burnin.glsl",
  "/shaders/edge.glsl",
  // Chrome images referenced from CSS/markup rather than the bundle graph.
  "/assets/apple-logo.png",
  "/assets/drive-open.png",
  "/assets/drive-closed.png",
  "/assets/drive-open-light-on.png",
  "/assets/drive-closed-light-on.png",
  // Disk library index, so the library UI is browsable offline. The disk
  // images themselves are deliberately left to on-demand caching.
  "/disks/library.json",
];

/**
 * Find this build's hashed bundle URLs by reading index.html.
 *
 * Vite emits /assets/main-<hash>.js, the lazy chunks and the single bundled
 * stylesheet, all with content hashes that change every build. Hard-coding them
 * is what rotted this list in the first place; parsing the document that
 * references them cannot go stale.
 */
async function findHashedAssets() {
  try {
    const response = await fetch("/index.html", { cache: "no-store" });
    if (!response.ok) return [];
    const html = await response.text();
    const urls = new Set();
    const pattern = /(?:src|href)="(\/assets\/[^"]+)"/g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      urls.add(match[1]);
    }
    return [...urls];
  } catch (error) {
    console.warn("[SW] Could not read index.html for hashed assets:", error);
    return [];
  }
}

/**
 * Cache each asset independently so one failure cannot fail the install.
 */
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  const hashed = await findHashedAssets();
  const assets = [...PRECACHE_ASSETS, ...hashed];

  const results = await Promise.allSettled(
    assets.map((asset) => cache.add(asset)),
  );

  const failed = assets.filter((_, i) => results[i].status === "rejected");
  if (failed.length) {
    console.warn("[SW] Could not precache:", failed);
  }
  console.log(
    `[SW] Precached ${assets.length - failed.length}/${assets.length} assets ` +
      `(${hashed.length} hashed)`,
  );
}

// Install event - cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    // Activate immediately without waiting, even if some assets could not be
    // cached — a partial cache still beats no service worker.
    precache().then(() => self.skipWaiting()),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log("[SW] Deleting old cache:", name);
              return caches.delete(name);
            }),
        );
      })
      .then(() => {
        // Take control of all pages immediately
        return self.clients.claim();
      }),
  );
});

// Check if URL should use network-first strategy
function isNetworkFirst(url) {
  // Explicit network-first files
  if (
    NETWORK_FIRST_FILES.some(
      (file) => url.pathname === file || url.pathname.endsWith(file),
    )
  ) {
    return true;
  }
  // Also use network-first for Vite JS bundles (they have hashed names)
  if (url.pathname.includes("/assets/") && url.pathname.endsWith(".js")) {
    return true;
  }
  return false;
}

// Fetch event - serve from cache, fall back to network
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Skip cross-origin requests (fonts, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Use network-first for critical files (WASM, core JS)
  if (isNetworkFirst(url)) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            // Update cache with fresh response
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed, try cache as fallback
          return caches.match(event.request);
        }),
    );
    return;
  }

  // Cache-first for other assets.
  //
  // Shaders are requested with a ?v=<app version> cache buster but precached
  // under their bare path, so their lookup has to ignore the query string.
  // That cannot serve a stale shader: the cache name carries the app version
  // too, so a release starts from an empty cache.
  const matchOptions = url.pathname.endsWith(".glsl")
    ? { ignoreSearch: true }
    : undefined;

  event.respondWith(
    caches.match(event.request, matchOptions).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response
        return cachedResponse;
      }

      // Not in cache - fetch from network
      return fetch(event.request)
        .then((networkResponse) => {
          // Don't cache non-successful responses
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          // Cache the new response for future use
          // Clone because response can only be consumed once
          const responseToCache = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            // Cache JS bundles and other assets dynamically
            if (shouldCache(event.request.url)) {
              cache.put(event.request, responseToCache);
            }
          });

          return networkResponse;
        })
        .catch((error) => {
          console.error("[SW] Fetch failed:", error);
          // Could return an offline fallback page here
          throw error;
        });
    }),
  );
});

// Determine if a URL should be cached dynamically
function shouldCache(url) {
  // Cache JS and CSS bundles (Vite generates hashed names). CSS was omitted
  // here, so the one stylesheet the app has was never cached by either path —
  // an offline launch came up unstyled.
  if (url.includes("/assets/") && (url.endsWith(".js") || url.endsWith(".css"))) {
    return true;
  }
  // Cache images
  if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
    return true;
  }
  // Cache WASM
  if (url.endsWith(".wasm")) {
    return true;
  }
  // Cache shaders — fetched at runtime during renderer init
  if (url.endsWith(".glsl")) {
    return true;
  }
  return false;
}

// Listen for messages from the main app
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
