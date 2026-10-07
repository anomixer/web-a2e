/*
 * video-standard.js - NTSC or PAL, chosen and remembered per machine
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/*
 * Apple sold the 8-bit machines in both standards, and software timed against
 * the beam is written for one of them: a demo made for a European //e jumps
 * between half-drawn screens on an NTSC one. The choice is kept per machine,
 * as the slot layout and the display settings are, and switching it does not
 * rebuild anything: the core times the running machine afresh and leaves its
 * memory, cards and disks as they are (Emulator::setVideoStandard).
 */

export const VIDEO_STANDARDS = [
  { id: "ntsc", label: "NTSC", note: "60Hz, 262 lines" },
  { id: "pal", label: "PAL", note: "50Hz, 312 lines" },
];

export const DEFAULT_STANDARD = "ntsc";

const STORAGE_PREFIX = "a2e-video-standard:";

/** A stored or passed-in value as one of the standards, or the default. */
export function normaliseStandard(value) {
  return VIDEO_STANDARDS.some((s) => s.id === value) ? value : DEFAULT_STANDARD;
}

/** The standard last chosen for a machine, or NTSC. */
export function loadRememberedStandard(machineKey) {
  try {
    return normaliseStandard(localStorage.getItem(STORAGE_PREFIX + machineKey));
  } catch {
    return DEFAULT_STANDARD; // Private windows are not an error here
  }
}

/** Remember a machine's standard for the next session. */
export function rememberStandard(machineKey, standard) {
  try {
    localStorage.setItem(STORAGE_PREFIX + machineKey, normaliseStandard(standard));
  } catch {
    // A preference we could not save is not worth interrupting anyone over.
  }
}

/** The standard a profile from the core is timed for. */
export function profileStandard(profile) {
  return profile?.timing?.standard === "pal" ? "pal" : "ntsc";
}

/**
 * Time the running machine for a standard. Returns whether the core took it:
 * a machine not made in PAL (the IIgs, for now) stays NTSC, and a core without
 * the export (an older build) leaves the machine alone.
 */
export async function applyStandard(wasmModule, standard) {
  if (!wasmModule?._setVideoStandard) return false;
  try {
    return !!(await wasmModule._setVideoStandard(normaliseStandard(standard) === "pal" ? 1 : 0));
  } catch (err) {
    console.warn("Could not set the video standard:", err);
    return false;
  }
}
