/*
 * sound-settings.js - The sound preferences the menu and the sound popup share
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/*
 * Each of these is a host preference, not machine state: none is in a save
 * state, and a machine switch keeps them. The Mockingboard's three live in the
 * core as statics shared by every card, so they survive the core rebuilding
 * itself as another machine; they are pushed in once at startup and again
 * whenever they change.
 */

/** The chips a Mockingboard can carry, in the order the menu lists them. */
export const MOCKINGBOARD_CHIPS = [
  { id: "ay", label: "AY-3-8910" },
  { id: "ym", label: "YM2149F" },
];

const KEYS = {
  phaseLock: "a2e-mockingboard-phase-lock",
  mono: "a2e-mockingboard-mono",
  chip: "a2e-mockingboard-chip",
  driveSounds: "a2e-drive-sounds",
  printerSounds: "a2e-printer-sounds",
};

/** The core's number for a chip: 0 the AY-3-8910, 1 the YM2149F. */
export function chipCode(chip) {
  return chip === "ym" ? 1 : 0;
}

/** A stored chip, or the AY-3-8910 the card was sold with. */
export function parseChip(value) {
  return MOCKINGBOARD_CHIPS.some((c) => c.id === value) ? value : "ay";
}

function readFlag(key) {
  try {
    // Every one of these is on until it is turned off.
    return localStorage.getItem(key) !== "false";
  } catch {
    return true;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // A private window: the setting still applies for this visit.
  }
}

export class SoundSettings {
  /**
   * @param {object} deps
   * @param {object} deps.wasmModule - the WASM proxy
   * @param {object} deps.diskManager - for the drive sounds
   */
  constructor({ wasmModule, diskManager }) {
    this.wasmModule = wasmModule;
    this.diskManager = diskManager;
    this.phaseLock = readFlag(KEYS.phaseLock);
    this.mono = readFlag(KEYS.mono);
    this.driveSounds = readFlag(KEYS.driveSounds);
    let chip = null;
    try {
      chip = localStorage.getItem(KEYS.chip);
    } catch {
      chip = null;
    }
    this.chip = parseChip(chip);
  }

  /** Push every setting into the core and the drives. */
  apply() {
    this.wasmModule._setMockingboardPhaseLock(this.phaseLock);
    this.wasmModule._setMockingboardMono(this.mono);
    this.wasmModule._setMockingboardChip(chipCode(this.chip));
    this.diskManager.setSeekSoundEnabled(this.driveSounds);
    this.diskManager.setMotorSoundEnabled(this.driveSounds);
  }

  /**
   * Mockingboard Phase Lock: a song that mirrors its notes to both chips can
   * leave them half a cycle apart, and on speakers close together the two
   * sides then cancel. Off plays the chips apart, as a real card does.
   */
  setPhaseLock(on) {
    this.phaseLock = on;
    write(KEYS.phaseLock, on);
    this.wasmModule._setMockingboardPhaseLock(on);
  }

  /** Mockingboard Mono: both chips mixed and played on both sides. */
  setMono(on) {
    this.mono = on;
    write(KEYS.mono, on);
    this.wasmModule._setMockingboardMono(on);
  }

  /**
   * The chip on the card: the original AY-3-8910, or Yamaha's pin-compatible
   * YM2149F, whose envelopes step half as far twice as often and whose fixed
   * levels sit on a different curve. Every Mockingboard follows it.
   */
  setChip(chip) {
    this.chip = parseChip(chip);
    write(KEYS.chip, this.chip);
    this.wasmModule._setMockingboardChip(chipCode(this.chip));
  }

  setDriveSounds(on) {
    this.driveSounds = on;
    write(KEYS.driveSounds, on);
    this.diskManager.setSeekSoundEnabled(on);
    this.diskManager.setMotorSoundEnabled(on);
  }

  /** PrinterSound reads its flag live from localStorage, so it is only kept. */
  get printerSounds() {
    return readFlag(KEYS.printerSounds);
  }

  setPrinterSounds(on) {
    write(KEYS.printerSounds, on);
  }
}
