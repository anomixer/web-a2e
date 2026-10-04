/*
 * switch-breakpoints.js - Breakpoints on soft switches and machine registers
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// The core holds a switch breakpoint as a source, a mask, a condition and a
// value (MachineDebug::addSwitchBreakpoint). The user holds it as a switch
// they can name, so that is what is kept and saved: a key from the core's
// catalog (soft_switch_catalog.cpp), which is the same key on every machine
// that has the switch. A breakpoint on PAGE2 set on a //e is still a
// breakpoint on PAGE2 on a IIgs; one on NEWVIDEO waits, unapplied, on a
// machine without it.

export const CONDITION_CHANGES = "change";
export const CONDITION_EQUALS = "equals";

const CORE_CONDITION = { [CONDITION_CHANGES]: 0, [CONDITION_EQUALS]: 1 };

const hex2 = (value) => "$" + (value & 0xff).toString(16).toUpperCase().padStart(2, "0");

/** True for a register (a byte at an I/O address) rather than a one-bit switch. */
export function isRegister(sw) {
  return sw.source !== 0;
}

/**
 * The arguments for _addSwitchBreakpoint, from a breakpoint and the catalog
 * entry for its switch.
 *
 * A switch's value is 1 for on; a register's is a byte under its mask.
 */
export function toCoreArgs(bp, sw) {
  const condition = CORE_CONDITION[bp.condition] ?? 0;
  if (isRegister(sw)) {
    const mask = (bp.mask ?? 0xff) & 0xff;
    return [sw.source, mask, condition, (bp.value ?? 0) & mask];
  }
  // The bits all sit in the low half of the word, so a 32-bit mask reaches
  // every one; >>> 0 keeps bit 31 from making it negative.
  const mask = (1 << sw.bit) >>> 0;
  return [0, mask, condition, bp.value ? mask : 0];
}

/** "PAGE2 changes", "TEXT on", "NEWVIDEO & $80 = $80". */
export function describe(bp, sw) {
  const name = sw?.name ?? bp.key.toUpperCase();
  if (bp.condition === CONDITION_CHANGES) return `${name} changes`;
  if (!sw || !isRegister(sw)) return `${name} ${bp.value ? "on" : "off"}`;
  const mask = (bp.mask ?? 0xff) & 0xff;
  const value = (bp.value ?? 0) & mask;
  return mask === 0xff
    ? `${name} = ${hex2(value)}`
    : `${name} & ${hex2(mask)} = ${hex2(value)}`;
}

/** Whether two breakpoints ask the same thing, so one is not added twice. */
export function sameBreakpoint(a, b) {
  if (a.key !== b.key || a.condition !== b.condition) return false;
  if (a.condition === CONDITION_CHANGES) return true;
  return (a.value ?? 0) === (b.value ?? 0) && (a.mask ?? 0xff) === (b.mask ?? 0xff);
}

/**
 * Parse a byte as the debugger writes one: "$C1", "C1", "0xC1".
 * @returns {number|null}
 */
export function parseByte(text) {
  const t = String(text ?? "").trim().replace(/^(\$|0x)/i, "");
  if (!/^[0-9a-f]{1,2}$/i.test(t)) return null;
  return parseInt(t, 16);
}

/** What localStorage holds back to breakpoints, dropping anything malformed. */
export function parseSaved(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const item of data) {
    if (!item || typeof item.key !== "string") continue;
    if (item.condition !== CONDITION_CHANGES && item.condition !== CONDITION_EQUALS) continue;
    const bp = {
      key: item.key,
      condition: item.condition,
      value: Number(item.value) & 0xff,
      mask: item.mask === undefined ? 0xff : Number(item.mask) & 0xff,
      enabled: item.enabled !== false,
    };
    if (!out.some((existing) => sameBreakpoint(existing, bp))) out.push(bp);
  }
  return out;
}

/**
 * The user's switch breakpoints, and keeping the core in step with them.
 *
 * Only enabled breakpoints on switches the running machine has are handed to
 * the core; the rest are kept and shown. apply() hands over the lot afresh,
 * which is what a machine switch or a restored state needs.
 */
export class SwitchBreakpointManager {
  static STORAGE_KEY = "a2e-switch-breakpoints";

  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.catalog = [];
    this.breakpoints = [];
    // The core's id for each breakpoint it holds, both ways.
    this.coreIds = new Map();
    this.listeners = [];
    try {
      this.breakpoints = parseSaved(localStorage.getItem(SwitchBreakpointManager.STORAGE_KEY));
    } catch {
      this.breakpoints = [];
    }
    for (const bp of this.breakpoints) bp.hits = 0;
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  _notify() {
    for (const fn of this.listeners) fn();
  }

  /** The catalog entry for a key on the running machine, or undefined. */
  switchFor(key) {
    return this.catalog.find((sw) => sw.key === key);
  }

  /** Fetch the running machine's switches from the core and re-arm. */
  async loadCatalog() {
    try {
      const json = await this.wasmModule.callString("_getSoftSwitchCatalogJSON");
      this.catalog = JSON.parse(json);
    } catch (e) {
      console.warn("Could not read the soft switch catalog:", e);
      this.catalog = [];
    }
    await this.apply();
    this._notify();
  }

  /** Hand every enabled breakpoint the machine can hold to the core, afresh. */
  async apply() {
    this.coreIds.clear();
    try {
      this.wasmModule._clearSwitchBreakpoints();
      for (const bp of this.breakpoints) await this._arm(bp);
    } catch (e) {
      console.warn("Could not apply switch breakpoints:", e);
    }
  }

  async _arm(bp) {
    if (!bp.enabled) return;
    const sw = this.switchFor(bp.key);
    if (!sw) return;
    const id = await this.wasmModule._addSwitchBreakpoint(...toCoreArgs(bp, sw));
    if (id >= 0) this.coreIds.set(bp, id);
  }

  _disarm(bp) {
    const id = this.coreIds.get(bp);
    if (id === undefined) return;
    this.wasmModule._removeSwitchBreakpoint(id);
    this.coreIds.delete(bp);
  }

  /** The breakpoint the core reports by this id, or null. */
  findByCoreId(id) {
    for (const [bp, coreId] of this.coreIds) if (coreId === id) return bp;
    return null;
  }

  /** Breakpoints on one switch. */
  forKey(key) {
    return this.breakpoints.filter((bp) => bp.key === key);
  }

  /** Whether the running machine can hold this breakpoint. */
  isApplicable(bp) {
    return this.switchFor(bp.key) !== undefined;
  }

  async add({ key, condition, value = 0, mask = 0xff }) {
    const bp = { key, condition, value: value & 0xff, mask: mask & 0xff, enabled: true, hits: 0 };
    if (this.breakpoints.some((existing) => sameBreakpoint(existing, bp))) return false;
    this.breakpoints.push(bp);
    await this._arm(bp);
    this.save();
    this._notify();
    return true;
  }

  /** Add it, or take it away if the same one is already there. */
  async toggle(spec) {
    const existing = this.breakpoints.find((bp) =>
      sameBreakpoint(bp, { mask: 0xff, value: 0, ...spec }),
    );
    if (existing) this.remove(existing);
    else await this.add(spec);
  }

  remove(bp) {
    const index = this.breakpoints.indexOf(bp);
    if (index < 0) return;
    this._disarm(bp);
    this.breakpoints.splice(index, 1);
    this.save();
    this._notify();
  }

  async setEnabled(bp, enabled) {
    if (bp.enabled === enabled) return;
    bp.enabled = enabled;
    if (enabled) await this._arm(bp);
    else this._disarm(bp);
    this.save();
    this._notify();
  }

  save() {
    try {
      const data = this.breakpoints.map(({ key, condition, value, mask, enabled }) => ({
        key,
        condition,
        value,
        mask,
        enabled,
      }));
      localStorage.setItem(SwitchBreakpointManager.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save switch breakpoints:", e);
    }
  }
}
