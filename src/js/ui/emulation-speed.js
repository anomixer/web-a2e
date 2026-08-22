/*
 * emulation-speed.js - User-selectable CPU speed
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * The core already scales emulation by an integer multiplier: the audio
 * worklet asks for a fixed number of samples and the emulator runs
 * `samples * CYCLES_PER_SAMPLE * multiplier` cycles to produce them. Audio
 * therefore keeps pacing the machine at higher speeds, and one frame in N is
 * what reaches the renderer — the display stays at 60fps while the machine
 * inside runs faster. Sound rises in pitch along with the machine, exactly as
 * an accelerator card does on real hardware.
 *
 * The multiplier is a host preference, not machine state: it is not part of a
 * save state and it survives reset, so a reboot does not silently drop the
 * user back to 1 MHz.
 */

const STORAGE_KEY = "emulation-speed";

/** Real //e clock, in MHz. */
export const BASE_CLOCK_MHZ = 1.023;

/** Selectable multipliers. The core clamps to 8, so nothing above it. */
export const SPEED_OPTIONS = [1, 2, 4, 8];

export const DEFAULT_SPEED = 1;

/**
 * Snap an arbitrary value to a supported multiplier.
 * Anything unparseable becomes the default rather than throwing — this runs on
 * localStorage contents, which a user can edit.
 */
export function clampSpeed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SPEED;
  let best = SPEED_OPTIONS[0];
  for (const option of SPEED_OPTIONS) {
    if (Math.abs(option - n) < Math.abs(best - n)) best = option;
  }
  return best;
}

/** "4x" */
export function speedLabel(multiplier) {
  return `${clampSpeed(multiplier)}x`;
}

/** "4.09 MHz" */
export function clockLabel(multiplier) {
  return `${(BASE_CLOCK_MHZ * clampSpeed(multiplier)).toFixed(2)} MHz`;
}

export function loadStoredSpeed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? DEFAULT_SPEED : clampSpeed(raw);
  } catch {
    return DEFAULT_SPEED;
  }
}

export function storeSpeed(multiplier) {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampSpeed(multiplier)));
  } catch {
    /* private browsing — the speed still applies for this session */
  }
}

/**
 * Owns the selected speed and pushes it into WASM.
 *
 * Paste temporarily boosts the multiplier itself and restores what it found,
 * so while a boost is live the baseline is handed to InputHandler rather than
 * written to WASM — otherwise restorePasteSpeed() would put the old speed back
 * the moment the paste finished.
 */
export class EmulationSpeed {
  constructor({ wasmModule, inputHandler = null } = {}) {
    this.wasmModule = wasmModule;
    this.inputHandler = inputHandler;
    this.multiplier = loadStoredSpeed();
    /** @type {Array<(multiplier: number) => void>} */
    this.listeners = [];
  }

  /** Register a listener; it fires immediately with the current speed. */
  onChange(callback) {
    this.listeners.push(callback);
    callback(this.multiplier);
  }

  /** Push the current speed into WASM (startup, or after a state import). */
  apply() {
    if (this.inputHandler?.setBaseSpeed) {
      this.inputHandler.setBaseSpeed(this.multiplier);
    } else {
      this.wasmModule?._setSpeedMultiplier?.(this.multiplier);
    }
  }

  setSpeed(multiplier, { persist = true } = {}) {
    const next = clampSpeed(multiplier);
    this.multiplier = next;
    if (persist) storeSpeed(next);
    this.apply();
    for (const listener of this.listeners) listener(next);
  }
}
