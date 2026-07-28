/*
 * url-params.js - Parse media-loading parameters from the page URL
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * Supported parameters, mapping the query key to the target unit.
 *
 * Floppies are drives 0/1 of the Disk II in slot 6; hard drives are the two
 * SmartPort block devices. `disk` and `disk1` are synonyms so links read
 * naturally whether or not a second drive is involved.
 */
const FLOPPY_KEYS = { disk: 0, disk1: 0, disk2: 1 };
const HARD_DRIVE_KEYS = { hd: 0, hd1: 0, hd2: 1 };

/** Extensions the core recognises, floppy and block device alike. */
const IMAGE_EXTENSION = /\.(dsk|do|po|nib|woz|2mg|hdv)$/i;

/** Per-unit size ceilings, generous enough for real images but not unbounded. */
export const MAX_FLOPPY_BYTES = 8 * 1024 * 1024;
export const MAX_HARD_DRIVE_BYTES = 64 * 1024 * 1024;

/**
 * Resolve a user-supplied media URL, rejecting anything we should not fetch.
 *
 * Only http/https survive. A relative path is resolved against the page, which
 * keeps `?disk=/demos/lode-runner.dsk` working for images hosted alongside the
 * emulator. Everything else — `javascript:`, `data:`, `file:`, `blob:` — is
 * refused: these params come from links that other people hand out, so the
 * scheme has to be one we are happy for a stranger's URL to use.
 *
 * @param {string} raw - The raw parameter value
 * @param {string} base - Absolute URL of the page, used to resolve relatives
 * @returns {string|null} Absolute http(s) URL, or null if unusable
 */
export function resolveMediaUrl(raw, base) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed, base);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.href;
}

/**
 * Derive a filename for an image fetched from a URL.
 *
 * The core picks the image class from the extension, falling back to content
 * sniffing that only recognises WOZ magic and the exact 143360-byte .dsk size.
 * Plenty of share-friendly URLs carry no filename at all — Google Drive's
 * `download?id=...` being the example in the issue — so callers can override
 * with `&name=`, which is the only way to load a .nib or a .2mg from one of
 * those.
 *
 * @param {string} url - Absolute URL the image came from
 * @param {string} [override] - Explicit filename from the `name` parameter
 * @param {string} [fallback] - Name to use when nothing better is available
 * @returns {string}
 */
export function filenameFromUrl(url, override, fallback = "URL Disk") {
  if (typeof override === "string" && override.trim()) {
    // Strip any path so `name=` cannot smuggle a directory into the UI label.
    return override.trim().split(/[\\/]/).pop() || fallback;
  }

  try {
    const { pathname } = new URL(url);
    const base = decodeURIComponent(pathname.split("/").pop() || "");
    // Only take the basename when it looks like an image. A path such as
    // `/download?id=...` would otherwise label the drive "download", which is
    // no more use to the core than the fallback and reads worse in the UI.
    if (base && IMAGE_EXTENSION.test(base)) return base;
  } catch {
    /* fall through to the fallback */
  }

  return fallback;
}

/**
 * Parse the media parameters out of a query string.
 *
 * Unknown parameters are ignored rather than reported — the app has other
 * reasons to carry query state, and a link should not warn about them.
 *
 * @param {string} search - The query string, with or without a leading "?"
 * @param {string} base - Absolute URL of the page, for resolving relative paths
 * @returns {{floppies: Array<{unit: number, url: string, filename: string}>,
 *            hardDrives: Array<{unit: number, url: string, filename: string}>,
 *            errors: string[]}}
 */
export function parseMediaParams(search, base) {
  const params = new URLSearchParams(search);
  const nameOverride = params.get("name") || undefined;

  const floppies = [];
  const hardDrives = [];
  const errors = [];

  const collect = (keys, target, fallbackPrefix) => {
    const seen = new Set();
    for (const [key, unit] of Object.entries(keys)) {
      const raw = params.get(key);
      if (raw === null) continue;

      // `disk` and `disk1` are the same drive; first one wins so a link with
      // both does not load twice into one drive.
      if (seen.has(unit)) continue;

      const url = resolveMediaUrl(raw, base);
      if (!url) {
        errors.push(`Ignored ?${key}= — not a usable http(s) URL`);
        continue;
      }

      seen.add(unit);
      target.push({
        unit,
        url,
        // Only a single-unit link can safely claim the shared `name` override.
        filename: filenameFromUrl(url, nameOverride, `${fallbackPrefix} ${unit + 1}`),
      });
    }
  };

  collect(FLOPPY_KEYS, floppies, "URL Disk");
  collect(HARD_DRIVE_KEYS, hardDrives, "URL Drive");

  // `name` is unambiguous only when it has one image to describe. With several,
  // fall back to per-URL names so the wrong label cannot end up on a drive.
  const total = floppies.length + hardDrives.length;
  if (nameOverride && total > 1) {
    for (const item of [...floppies, ...hardDrives]) {
      item.filename = filenameFromUrl(item.url, undefined, "URL Disk");
    }
    errors.push("Ignored ?name= — it is only applied when one image is loaded");
  }

  return { floppies, hardDrives, errors };
}

/**
 * Does this look like a path on someone's own machine rather than a web URL?
 *
 * A pasted `/Users/me/Downloads/x.dsk` resolves as a relative URL and the dev
 * server answers with its own index.html, so the failure surfaces as a corrupt
 * disk image rather than as the mistake it is. Detecting the shape lets the
 * error say what actually went wrong. This only ever adds an explanation to a
 * fetch that already failed, so a site genuinely serving files from such a path
 * is not blocked by it.
 *
 * @param {string} url - Absolute URL, already resolved
 * @returns {boolean}
 */
export function looksLikeLocalPath(url) {
  let pathname;
  try {
    ({ pathname } = new URL(url));
  } catch {
    return false;
  }

  return (
    /^\/(Users|home|root|mnt|media|var|tmp)\//i.test(pathname) ||
    /^\/[A-Za-z]:/.test(pathname) || // Windows drive letter, e.g. C:\disks
    pathname.includes("\\")
  );
}

/**
 * @param {{floppies: Array, hardDrives: Array}} parsed
 * @returns {boolean} True when the URL asks for any media at all
 */
export function hasMediaParams(parsed) {
  return parsed.floppies.length > 0 || parsed.hardDrives.length > 0;
}
