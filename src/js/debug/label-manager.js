/*
 * label-manager.js - User-defined label and imported symbol management
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * LabelManager - Manages user-defined labels, imported symbols, and inline comments.
 * Provides a unified lookup layer on top of the built-in symbols.js data.
 */
export class LabelManager {
  constructor() {
    this.userLabels = new Map();     // address -> {name, comment}
    this.importedLabels = new Map(); // address -> {name, source}
    this.listeners = [];

    this.load();
  }

  static STORAGE_KEY = "a2e-user-labels";

  onChange(fn) {
    this.listeners.push(fn);
  }

  _notify() {
    for (const fn of this.listeners) fn();
  }

  /**
   * Add or update a user label
   */
  addLabel(address, name, comment = "") {
    this.userLabels.set(address, { name, comment });
    this.save();
    this._notify();
  }

  /**
   * Remove a user label
   */
  removeLabel(address) {
    if (this.userLabels.delete(address)) {
      this.save();
      this._notify();
    }
  }

  /**
   * Set inline comment for an address
   */
  setComment(address, comment) {
    const existing = this.userLabels.get(address);
    if (existing) {
      existing.comment = comment;
    } else {
      this.userLabels.set(address, { name: "", comment });
    }
    this.save();
    this._notify();
  }

  /**
   * Get label info for an address. User labels take priority over imports.
   * @returns {object|null} {name, comment, source} or null
   */
  getLabel(address) {
    const user = this.userLabels.get(address);
    if (user && user.name) {
      return { name: user.name, comment: user.comment || "", source: "user" };
    }

    const imported = this.importedLabels.get(address);
    if (imported) {
      return { name: imported.name, comment: "", source: imported.source };
    }

    // Check for comment-only user entry
    if (user && user.comment) {
      return { name: "", comment: user.comment, source: "user" };
    }

    return null;
  }

  /**
   * Resolve an address by label name (case-insensitive)
   * @returns {number|null}
   */
  resolveByName(name) {
    const upper = name.toUpperCase();

    for (const [addr, info] of this.userLabels) {
      if (info.name && info.name.toUpperCase() === upper) return addr;
    }

    for (const [addr, info] of this.importedLabels) {
      if (info.name.toUpperCase() === upper) return addr;
    }

    return null;
  }

  /**
   * Import a symbol file. Supports ca65 .dbg, Merlin, ACME, and generic formats.
   * @param {string} text File content
   * @param {string} source Descriptive source name (e.g. filename)
   */
  importSymbolFile(text, source = "import") {
    const lines = text.split(/\r?\n/);
    let count = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("*")) continue;

      let match;

      // ca65 .dbg format: sym	name="LABEL",addrsize=absolute,scope=0,def=123,ref=...,val=0xXXXX,type=lab
      match = trimmed.match(/^sym\s.*name="([^"]+)".*val=(0x[0-9A-Fa-f]+)/);
      if (match) {
        const name = match[1];
        const addr = parseInt(match[2], 16);
        if (addr >= 0 && addr <= 0xffff) {
          this.importedLabels.set(addr, { name, source });
          count++;
        }
        continue;
      }

      // Merlin format: LABEL EQU $XXXX
      match = trimmed.match(/^(\w+)\s+EQU\s+\$([0-9A-Fa-f]{1,4})/i);
      if (match) {
        const name = match[1];
        const addr = parseInt(match[2], 16);
        if (addr >= 0 && addr <= 0xffff) {
          this.importedLabels.set(addr, { name, source });
          count++;
        }
        continue;
      }

      // ACME format: LABEL = $XXXX  or  !addr LABEL = $XXXX
      match = trimmed.match(/^(?:!addr\s+)?(\w+)\s*=\s*\$([0-9A-Fa-f]{1,4})/i);
      if (match) {
        const name = match[1];
        const addr = parseInt(match[2], 16);
        if (addr >= 0 && addr <= 0xffff) {
          this.importedLabels.set(addr, { name, source });
          count++;
        }
        continue;
      }

      // Generic: $XXXX LABEL  or  XXXX LABEL
      match = trimmed.match(/^\$?([0-9A-Fa-f]{2,4})\s+(\w+)/);
      if (match) {
        const addr = parseInt(match[1], 16);
        const name = match[2];
        if (addr >= 0 && addr <= 0xffff && !/^[0-9A-Fa-f]+$/.test(name)) {
          this.importedLabels.set(addr, { name, source });
          count++;
        }
        continue;
      }
    }

    this._notify();
    return count;
  }

  /**
   * Clear all imported labels
   */
  clearImported() {
    this.importedLabels.clear();
    this._notify();
  }

  /**
   * Export user labels as text (generic format)
   */
  exportLabels() {
    const lines = [];
    for (const [addr, info] of this.userLabels) {
      if (!info.name) continue;
      const hex = addr.toString(16).toUpperCase().padStart(4, "0");
      let line = `$${hex} ${info.name}`;
      if (info.comment) line += `  ; ${info.comment}`;
      lines.push(line);
    }
    return lines.join("\n");
  }

  // ---- Persistence ----

  save() {
    try {
      const data = [];
      for (const [addr, info] of this.userLabels) {
        data.push({ address: addr, name: info.name, comment: info.comment });
      }
      localStorage.setItem(LabelManager.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save labels:", e);
    }
  }

  load() {
    try {
      const saved = localStorage.getItem(LabelManager.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        for (const entry of data) {
          this.userLabels.set(entry.address, {
            name: entry.name || "",
            comment: entry.comment || "",
          });
        }
      }
    } catch (e) {
      console.warn("Failed to load labels:", e);
    }
  }
}
