/*
 * soft-switch-window.js - Soft switch monitor window displaying switch states and addresses
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { escapeHtml } from "../utils/string-utils.js";
import {
  CONDITION_CHANGES,
  CONDITION_EQUALS,
  describe,
  isRegister,
  parseByte,
} from "./switch-breakpoints.js";

/**
 * The machine's soft switches, live, with breakpoints on them.
 *
 * What is listed comes from the core (soft_switch_catalog.cpp), so each
 * machine shows the switches it has: a II+ has no 80COL, and only a IIgs has
 * NEWVIDEO and the registers beside it. A one-bit switch is a badge, lit when
 * on; a register is a byte. The dot at the start of a row sets a breakpoint
 * on it: on any change, or on a value, which for a register is a byte under a
 * mask. The core checks them after every instruction, so a stop names the
 * instruction that moved the switch, whatever moved it.
 */
export class SoftSwitchWindow extends BaseWindow {
  constructor(wasmModule, switchBreakpoints) {
    super({
      id: "soft-switches",
      title: "Soft Switches",
      minWidth: 345,
      minHeight: 200,
      maxWidth: 345,
      maxHeight: Infinity,
      defaultWidth: 345,
      defaultHeight: 500,
    });

    this.wasmModule = wasmModule;
    this.bps = switchBreakpoints;
    this.bps.onChange(() => this.onBreakpointsChanged());

    // Reference addresses (read-only status registers)
    this.statusRegisters = [
      { addr: "$C011", name: "RDLCBNK2", desc: "LC bank 2 selected" },
      { addr: "$C012", name: "RDLCRAM", desc: "LC RAM read enabled" },
      { addr: "$C013", name: "RDRAMRD", desc: "Aux RAM read" },
      { addr: "$C014", name: "RDRAMWRT", desc: "Aux RAM write" },
      { addr: "$C015", name: "RDCXROM", desc: "Internal $Cxxx ROM" },
      { addr: "$C016", name: "RDALTZP", desc: "Aux zero page" },
      { addr: "$C017", name: "RDC3ROM", desc: "Slot 3 ROM" },
      { addr: "$C018", name: "RD80STORE", desc: "80STORE enabled" },
      { addr: "$C019", name: "RDVBLBAR", desc: "Vertical blank" },
      { addr: "$C01A", name: "RDTEXT", desc: "Text mode" },
      { addr: "$C01B", name: "RDMIXED", desc: "Mixed mode" },
      { addr: "$C01C", name: "RDPAGE2", desc: "Page 2" },
      { addr: "$C01D", name: "RDHIRES", desc: "Hi-res mode" },
      { addr: "$C01E", name: "RDALTCHAR", desc: "Alt charset" },
      { addr: "$C01F", name: "RD80COL", desc: "80 column mode" },
    ];

    // Other I/O addresses (for reference)
    this.ioAddresses = [
      { addr: "$C010", name: "KBDSTRB", desc: "Clear keyboard strobe" },
      { addr: "$C030", name: "SPKR", desc: "Speaker toggle" },
      { addr: "$C040", name: "STROBE", desc: "Utility strobe" },
      { addr: "$C064", name: "PDL0", desc: "Paddle 0 (joystick X)" },
      { addr: "$C065", name: "PDL1", desc: "Paddle 1 (joystick Y)" },
      { addr: "$C066", name: "PDL2", desc: "Paddle 2" },
      { addr: "$C067", name: "PDL3", desc: "Paddle 3" },
      { addr: "$C070", name: "PTRIG", desc: "Paddle trigger" },
    ];

    // Slot I/O ranges
    this.slotRanges = [
      { range: "$C090-9F", slot: 1, desc: "Slot 1 I/O" },
      { range: "$C0A0-AF", slot: 2, desc: "Slot 2 I/O" },
      { range: "$C0B0-BF", slot: 3, desc: "Slot 3 I/O" },
      { range: "$C0C0-CF", slot: 4, desc: "Slot 4 I/O" },
      { range: "$C0D0-DF", slot: 5, desc: "Slot 5 I/O" },
      { range: "$C0E0-EF", slot: 6, desc: "Slot 6 I/O (Disk II)" },
      { range: "$C0F0-FF", slot: 7, desc: "Slot 7 I/O" },
    ];

    this._hitKey = null;
    this._hitCoreId = -1;
  }

  renderContent() {
    let html = '<div class="softswitch-content">';
    html += '<div class="switch-hit hidden" id="sw-hit"></div>';
    html += `
      <div class="switch-group switch-bp-group hidden" id="sw-bp-group">
        <div class="switch-group-title switch-bp-title">
          <span>Breakpoints</span>
          <button class="switch-bp-clear" id="sw-bp-clear" title="Remove every switch breakpoint">Clear</button>
        </div>
        <div class="switch-list" id="sw-bp-list"></div>
      </div>
      <div id="sw-groups"></div>
    `;

    // Add collapsible reference section
    html += `
      <div class="switch-group reference-section">
        <div class="switch-group-title collapsible" id="ref-toggle">
          ▶ I/O Reference
        </div>
        <div class="switch-list reference-list hidden" id="ref-content">
    `;

    html += '<div class="ref-subtitle">Status Registers ($C011-$C01F)</div>';
    for (const reg of this.statusRegisters) {
      html += `
        <div class="ref-item">
          <span class="ref-addr">${reg.addr}</span>
          <span class="ref-name">${reg.name}</span>
          <span class="ref-desc">${reg.desc}</span>
        </div>
      `;
    }

    html += '<div class="ref-subtitle">Other I/O</div>';
    for (const io of this.ioAddresses) {
      html += `
        <div class="ref-item">
          <span class="ref-addr">${io.addr}</span>
          <span class="ref-name">${io.name}</span>
          <span class="ref-desc">${io.desc}</span>
        </div>
      `;
    }

    html += '<div class="ref-subtitle">Slot I/O</div>';
    for (const slot of this.slotRanges) {
      html += `
        <div class="ref-item">
          <span class="ref-addr">${slot.range}</span>
          <span class="ref-name">Slot ${slot.slot}</span>
          <span class="ref-desc">${slot.desc}</span>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    html += "</div>";
    return html;
  }

  /** The switches, grouped as the catalog groups them. */
  renderSwitches() {
    const groups = new Map();
    for (const sw of this.bps.catalog) {
      if (!groups.has(sw.group)) groups.set(sw.group, []);
      groups.get(sw.group).push(sw);
    }

    let html = "";
    for (const [title, switches] of groups) {
      html += `
        <div class="switch-group">
          <div class="switch-group-title">${escapeHtml(title)}</div>
          <div class="switch-list">
      `;
      for (const sw of switches) {
        const readOnlyClass = sw.readOnly ? " read-only" : "";
        const value = isRegister(sw)
          ? `<span class="switch-value" data-value="${sw.key}">--</span>`
          : "";
        // A register's name is always lit: its value is what changes.
        const badgeClass = isRegister(sw) ? " active" : "";
        html += `
          <div class="switch-item${readOnlyClass}" data-key="${sw.key}">
            <button class="switch-bp-dot" data-key="${sw.key}"
                    title="Breakpoint on ${escapeHtml(sw.name)}"></button>
            <span class="switch-addr">${escapeHtml(sw.address)}</span>
            <span class="switch-badge${badgeClass}" data-badge="${sw.key}">${escapeHtml(sw.name)}</span>
            ${value}
            <span class="switch-desc">${escapeHtml(sw.desc)}</span>
          </div>
        `;
      }
      html += `
          </div>
        </div>
      `;
    }
    return html;
  }

  onContentRendered() {
    const toggle = this.contentElement.querySelector("#ref-toggle");
    const content = this.contentElement.querySelector("#ref-content");
    if (toggle && content) {
      toggle.addEventListener("click", () => {
        content.classList.toggle("hidden");
        toggle.textContent = content.classList.contains("hidden")
          ? "▶ I/O Reference"
          : "▼ I/O Reference";
      });
    }

    this.contentElement.querySelector("#sw-groups").addEventListener("click", (e) => {
      const dot = e.target.closest(".switch-bp-dot");
      if (dot) this.showBreakpointMenu(dot);
    });

    this.contentElement.querySelector("#sw-bp-clear").addEventListener("click", () => {
      for (const bp of [...this.bps.breakpoints]) this.bps.remove(bp);
    });

    const list = this.contentElement.querySelector("#sw-bp-list");
    list.addEventListener("change", (e) => {
      const index = Number(e.target.dataset.enable);
      if (!Number.isNaN(index)) this.bps.setEnabled(this.bps.breakpoints[index], e.target.checked);
    });
    list.addEventListener("click", (e) => {
      const remove = e.target.closest("[data-remove]");
      if (remove) this.bps.remove(this.bps.breakpoints[Number(remove.dataset.remove)]);
    });

    this.onBreakpointsChanged();
  }

  /** The catalog or the breakpoints changed: redraw what depends on them. */
  onBreakpointsChanged() {
    if (!this.contentElement) return;
    const groups = this.contentElement.querySelector("#sw-groups");
    const catalogKey = this.bps.catalog.map((sw) => sw.key).join(",");
    if (groups && catalogKey !== this._renderedCatalog) {
      this._renderedCatalog = catalogKey;
      groups.innerHTML = this.renderSwitches();
      this.cacheCells();
    }
    this.renderBreakpointList();
    this.markArmedRows();
  }

  // update() runs ~15x a second, so the cells are found once and only the
  // ones whose value moved are touched; restyling every badge every tick
  // repainted the whole window.
  cacheCells() {
    this.flagCells = [];
    this.registerCells = [];
    for (const sw of this.bps.catalog) {
      if (isRegister(sw)) {
        const el = this.contentElement.querySelector(`[data-value="${sw.key}"]`);
        if (el) this.registerCells.push({ source: sw.source, el, last: null });
      } else {
        const el = this.contentElement.querySelector(`[data-badge="${sw.key}"]`);
        if (el) this.flagCells.push({ bit: sw.bit, el });
      }
    }
    this.lastStateLow = null;
    this._hitKey = null;
  }

  renderBreakpointList() {
    const group = this.contentElement.querySelector("#sw-bp-group");
    const list = this.contentElement.querySelector("#sw-bp-list");
    if (!group || !list) return;
    group.classList.toggle("hidden", this.bps.breakpoints.length === 0);

    list.innerHTML = this.bps.breakpoints
      .map((bp, i) => {
        const sw = this.bps.switchFor(bp.key);
        const absent = !sw;
        const title = absent ? "Not on this machine" : "";
        const hits = bp.hits ? `<span class="switch-bp-hits">${bp.hits}</span>` : "";
        return `
          <div class="switch-item switch-bp-row${absent ? " absent" : ""}" title="${title}">
            <input type="checkbox" data-enable="${i}" ${bp.enabled ? "checked" : ""}
                   ${absent ? "disabled" : ""}>
            <span class="switch-bp-desc">${escapeHtml(describe(bp, sw))}</span>
            ${hits}
            <button class="switch-bp-remove" data-remove="${i}" title="Remove">×</button>
          </div>
        `;
      })
      .join("");
  }

  /** A filled dot on each switch with an enabled breakpoint. */
  markArmedRows() {
    for (const dot of this.contentElement.querySelectorAll(".switch-bp-dot")) {
      const armed = this.bps.forKey(dot.dataset.key).some((bp) => bp.enabled);
      dot.classList.toggle("armed", armed);
    }
  }

  // ---- The breakpoint menu on a switch ----

  showBreakpointMenu(dot) {
    this.hideBreakpointMenu();
    const sw = this.bps.switchFor(dot.dataset.key);
    if (!sw) return;
    const has = (spec) =>
      this.bps.forKey(sw.key).some(
        (bp) =>
          bp.condition === spec.condition &&
          (spec.condition === CONDITION_CHANGES || bp.value === spec.value),
      );
    const tick = (on) => `<span class="shortcut">${on ? "✓" : ""}</span>`;

    const menu = document.createElement("div");
    menu.className = "text-select-context-menu switch-bp-menu";
    let html = `
      <button class="context-menu-item" data-condition="${CONDITION_CHANGES}">
        Break when ${escapeHtml(sw.name)} changes ${tick(has({ condition: CONDITION_CHANGES }))}
      </button>
    `;
    if (isRegister(sw)) {
      // A value under a mask: NEWVIDEO & $80 = $80 is Super Hi-Res coming on,
      // whatever the other bits are doing.
      html += `
        <div class="switch-bp-form">
          <label>Value <input type="text" class="switch-bp-input" data-field="value"
                 maxlength="3" placeholder="$00" spellcheck="false"></label>
          <label>Mask <input type="text" class="switch-bp-input" data-field="mask"
                 maxlength="3" value="$FF" spellcheck="false"></label>
          <button class="switch-bp-add">Add</button>
        </div>
      `;
    } else {
      for (const on of [1, 0]) {
        html += `
          <button class="context-menu-item" data-condition="${CONDITION_EQUALS}" data-on="${on}">
            Break when it turns ${on ? "on" : "off"}
            ${tick(has({ condition: CONDITION_EQUALS, value: on }))}
          </button>
        `;
      }
    }
    menu.innerHTML = html;

    const rect = dot.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.left = `${rect.right + 4}px`;
    menu.style.top = `${rect.top}px`;
    menu.style.zIndex = "10000";

    menu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-condition]");
      if (item) {
        this.bps.toggle({
          key: sw.key,
          condition: item.dataset.condition,
          value: Number(item.dataset.on ?? 0),
        });
        this.hideBreakpointMenu();
        return;
      }
      if (e.target.closest(".switch-bp-add")) this.addRegisterBreakpoint(menu, sw);
    });
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.addRegisterBreakpoint(menu, sw);
      // The screen takes keys it is not meant to; these are the form's.
      e.stopPropagation();
    });

    document.body.appendChild(menu);
    // Keep it on the screen.
    const box = menu.getBoundingClientRect();
    if (box.right > window.innerWidth - 8) {
      menu.style.left = `${Math.max(8, rect.left - box.width - 4)}px`;
    }
    if (box.bottom > window.innerHeight - 8) {
      menu.style.top = `${Math.max(8, window.innerHeight - box.height - 8)}px`;
    }
    this._menu = menu;
    menu.querySelector('[data-field="value"]')?.focus();

    this._menuClose = (e) => {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "mousedown" && menu.contains(e.target)) return;
      this.hideBreakpointMenu();
    };
    setTimeout(() => {
      document.addEventListener("mousedown", this._menuClose);
      document.addEventListener("keydown", this._menuClose, true);
    }, 0);
  }

  addRegisterBreakpoint(menu, sw) {
    const valueInput = menu.querySelector('[data-field="value"]');
    const maskInput = menu.querySelector('[data-field="mask"]');
    const value = parseByte(valueInput.value);
    const mask = parseByte(maskInput.value);
    valueInput.classList.toggle("invalid", value === null);
    maskInput.classList.toggle("invalid", mask === null || mask === 0);
    if (value === null || mask === null || mask === 0) return;
    this.bps.add({ key: sw.key, condition: CONDITION_EQUALS, value: value & mask, mask });
    this.hideBreakpointMenu();
  }

  hideBreakpointMenu() {
    this._menu?.remove();
    this._menu = null;
    if (this._menuClose) {
      document.removeEventListener("mousedown", this._menuClose);
      document.removeEventListener("keydown", this._menuClose, true);
      this._menuClose = null;
    }
  }

  hide() {
    this.hideBreakpointMenu();
    super.hide();
  }

  /** The machine changed, and with it the switches it has. */
  onMachineChanged() {
    this.bps.loadCatalog();
  }

  // ---- Live state ----

  async update(wasmModule) {
    this.wasmModule = wasmModule;
    if (!this.flagCells) return;

    // One RPC in flight at a time: update() is fired from the render loop
    // without being awaited, so a slow round-trip would otherwise let requests
    // stack up faster than the Worker can answer them.
    if (this._updatePending) return;
    this._updatePending = true;

    const S = SoftSwitchWindow.UPDATE_BATCH;
    let results;
    const registers = this.registerCells;
    try {
      // The switch word, the registers (peeks, which disturb nothing) and
      // whether a switch breakpoint stopped the machine, in one batch.
      results = await wasmModule.batch([
        ["_isPaused"],
        ["_isSwitchBreakpointHit"],
        ["_getSwitchBreakpointHitId"],
        ["__callString", "_getSwitchHitText"],
        ["_getSoftSwitchState"],
        ...registers.map((cell) => ["_getSoftSwitchValue", cell.source]),
      ]);
    } finally {
      this._updatePending = false;
    }
    // The machine may have changed while the batch was out.
    if (registers !== this.registerCells) return;

    this.showHit(results[S.PAUSED] && results[S.HIT], results[S.HIT_ID], results[S.HIT_TEXT]);

    for (let i = 0; i < registers.length; i++) {
      const value = results[S.REGISTERS + i];
      const cell = registers[i];
      if (value === cell.last) continue;
      cell.last = value;
      cell.el.textContent = "$" + this.formatHex(value, 2);
    }

    // Nothing changed: skip the DOM entirely.
    const state = results[S.STATE];
    if (state === this.lastStateLow) return;
    const changed = this.lastStateLow === null ? ~0 : state ^ this.lastStateLow;
    this.lastStateLow = state;
    for (const { bit, el } of this.flagCells) {
      const mask = 1 << bit;
      if ((changed & mask) === 0) continue;
      el.classList.toggle("active", (state & mask) !== 0);
    }
  }

  static UPDATE_BATCH = {
    PAUSED: 0,
    HIT: 1,
    HIT_ID: 2,
    HIT_TEXT: 3,
    STATE: 4,
    REGISTERS: 5,
  };

  /** Say why the machine stopped, and on which switch, while it stays stopped. */
  showHit(hit, coreId, text) {
    const banner = this.contentElement.querySelector("#sw-hit");
    const bp = hit ? this.bps.findByCoreId(coreId) : null;
    const key = bp?.key ?? null;

    if (hit && coreId !== this._hitCoreId) {
      // A new stop, counted once however many times it is looked at.
      if (bp) {
        bp.hits = (bp.hits || 0) + 1;
        this.renderBreakpointList();
      }
    }
    this._hitCoreId = hit ? coreId : -1;

    if (banner) {
      banner.classList.toggle("hidden", !hit);
      if (hit) banner.textContent = `Stopped: ${text}`;
    }
    if (key === this._hitKey) return;
    if (this._hitKey) {
      this.contentElement
        .querySelector(`.switch-item[data-key="${this._hitKey}"]`)
        ?.classList.remove("hit");
    }
    this._hitKey = key;
    if (key) {
      const row = this.contentElement.querySelector(`.switch-item[data-key="${key}"]`);
      row?.classList.add("hit");
      row?.scrollIntoView({ block: "nearest" });
    }
  }
}
