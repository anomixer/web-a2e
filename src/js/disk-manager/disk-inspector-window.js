/*
 * disk-inspector-window.js - See what is recorded on a disk, whatever its format
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import {
  parseOverview,
  parseTrackDetail,
  summarizeDisk,
  trackLabel,
  cellDeviation,
  cellMicroseconds,
  nibbleAtCell,
  firstNibbleInView,
  kindName,
  KIND,
  KIND_MASK,
  BAD,
  NO_SECTOR,
  DATA_STATE,
  QUARTER_TRACKS,
} from "./disk-inspector-data.js";

/*
 * The core reads every track the way the drive would (see
 * core/disk-image/disk_inspection.hpp) and this window draws the answer:
 *
 * - A platter, the disk seen from above with track 0 at the rim, every
 *   quarter track a ring and every ring coloured by what is recorded round
 *   it. It turns as the real one does while the motor runs, under a head
 *   that sits where the emulated head is.
 * - A strip, one track unrolled, nibble by nibble, with its sectors marked
 *   and, on a flux track, how long each cell took drawn over it.
 * - The sectors in the order they pass the head, each one's decoded bytes,
 *   and the raw nibbles, coloured by what they are part of.
 *
 * "Timing" recolours the platter by cell time rather than structure, which is
 * how a track written at more than one speed shows itself.
 */

const OVERVIEW_BUCKETS = 720; // Arcs per ring: a half degree each
// About six cells each: fine enough to zoom into, and averaged per pixel
// column when the strip shows more than that
const STRIP_TIMING_BUCKETS = 8192;
const REVOLUTION_MS = 200; // 300 RPM
const REFRESH_WHILE_WRITING_MS = 500; // Do not re-read a disk every frame
const TIMING_RANGE = 0.05; // A cell 5% off nominal takes the full colour

// Where things sit on the platter, as fractions of its radius
const DISK_EDGE = 0.985;
const BAND_OUTER = 0.95;
const BAND_INNER = 0.36;
const HUB_RING_OUTER = 0.25;
const HUB_HOLE = 0.19;
const INDEX_HOLE_RADIUS = 0.3;

const RING_WIDTH = (BAND_OUTER - BAND_INNER) / QUARTER_TRACKS;

// Far enough in to see a track's flux transitions one by one
const MAX_PLATTER_ZOOM = 600;
// Zoomed in this far, the tracks in view are read in full
const MAX_RINGS_IN_FULL = 48;
const MAX_CACHED_RINGS = 96;

export class DiskInspectorWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "disk-inspector",
      title: "Disk Inspector",
      defaultWidth: 980,
      defaultHeight: 660,
      minWidth: 640,
      minHeight: 460,
    });
    this.wasmModule = wasmModule;

    // Choices, kept in the window state
    this.drive = 0;
    this.mode = "structure";
    this.follow = true;
    this.selectedQt = 0;
    this.selectedSector = -1;
    this.tab = "sector";

    // What the core last said
    this.inserted = false;
    this.revision = -1;
    this.filename = "";
    this.overview = null;
    this.summary = summarizeDisk(null);
    this.detail = null;
    this.detailQt = -1;
    this.lastOverviewAt = 0;

    // The head
    this.headQt = 0;
    this.headActive = false;
    this.rotSample = 0;
    this.rotSampleAt = 0;
    this.rotation = 0;

    this.diskImage = null; // Offscreen canvas holding the drawn platter
    this.zoomLayer = null; // The same, for a zoomed view
    this.pv = { zoom: 1, cx: 0, cy: 0, rot: 0 }; // The platter's view
    this.ringCache = new Map(); // Tracks read in full, by quarter track
    this.ringPending = new Set();
    this.detailChain = Promise.resolve();
    this.dirty = true;
    this.hoverQt = -1;
    this.animFrame = null;
    this.fetching = false;

    this._animate = this._animate.bind(this);
  }

  renderContent() {
    return `
      <div class="dinsp">
        <div class="dinsp-toolbar">
          <div class="dinsp-seg" data-group="drive">
            <button data-value="0" class="active">Drive 1</button>
            <button data-value="1">Drive 2</button>
          </div>
          <div class="dinsp-disk">
            <span class="dinsp-filename">No disk</span>
            <span class="dinsp-chips"></span>
          </div>
          <div class="dinsp-seg" data-group="mode">
            <button data-value="structure" class="active">Structure</button>
            <button data-value="timing">Timing</button>
          </div>
          <label class="dinsp-check" title="Show the track the head is on">
            <input type="checkbox" class="dinsp-follow" checked />
            Follow head
          </label>
        </div>
        <div class="dinsp-body">
          <div class="dinsp-platter-panel">
            <div class="dinsp-platter-wrap">
              <canvas class="dinsp-platter" tabindex="0"></canvas>
              <div class="dinsp-empty" hidden>No disk in drive</div>
              <div class="dinsp-tooltip" hidden></div>
              <div class="dinsp-zoom" hidden>
                <button data-zoom="out" title="Zoom out (-)">&minus;</button>
                <span class="dinsp-zoom-level">1.0×</span>
                <button data-zoom="in" title="Zoom in (+)">+</button>
                <button data-zoom="fit" title="Whole disk (0)">Fit</button>
              </div>
            </div>
            <div class="dinsp-legend"></div>
          </div>
          <div class="dinsp-detail">
            <div class="dinsp-track-head">
              <span class="dinsp-track-title">Track 0</span>
              <span class="dinsp-track-meta"></span>
            </div>
            <div class="dinsp-strip-wrap">
              <canvas class="dinsp-strip"></canvas>
              <div class="dinsp-tooltip dinsp-strip-tip" hidden></div>
            </div>
            <div class="dinsp-hint">Scroll to zoom · drag to pan · double-click for the whole track</div>
            <div class="dinsp-sectors-label">Sectors, in the order they pass the head</div>
            <div class="dinsp-sectors"></div>
            <div class="dinsp-tabs">
              <button data-tab="sector" class="active">Sector data</button>
              <button data-tab="nibbles">Nibbles</button>
            </div>
            <div class="dinsp-tab-body">
              <div class="dinsp-sector-view"></div>
              <div class="dinsp-nibble-view" hidden></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    const q = (s) => this.contentElement.querySelector(s);
    this.el = {
      filename: q(".dinsp-filename"),
      chips: q(".dinsp-chips"),
      follow: q(".dinsp-follow"),
      platterWrap: q(".dinsp-platter-wrap"),
      platter: q(".dinsp-platter"),
      empty: q(".dinsp-empty"),
      tooltip: q(".dinsp-platter-wrap .dinsp-tooltip"),
      zoom: q(".dinsp-zoom"),
      zoomLevel: q(".dinsp-zoom-level"),
      legend: q(".dinsp-legend"),
      trackTitle: q(".dinsp-track-title"),
      trackMeta: q(".dinsp-track-meta"),
      stripWrap: q(".dinsp-strip-wrap"),
      strip: q(".dinsp-strip"),
      stripTip: q(".dinsp-strip-tip"),
      sectors: q(".dinsp-sectors"),
      sectorView: q(".dinsp-sector-view"),
      nibbleView: q(".dinsp-nibble-view"),
    };

    this.contentElement.querySelectorAll(".dinsp-seg").forEach((seg) => {
      seg.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        if (seg.dataset.group === "drive") this.setDrive(Number(btn.dataset.value));
        else this.setMode(btn.dataset.value);
      });
    });
    this.el.follow.addEventListener("change", () => {
      this.follow = this.el.follow.checked;
      if (this.follow) this.selectQuarterTrack(this.headQt);
    });
    this.contentElement.querySelector(".dinsp-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn) this.setTab(btn.dataset.tab);
    });
    this.el.sectors.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn) this.selectSector(Number(btn.dataset.index));
    });

    this.el.platter.addEventListener("mousemove", (e) => this._platterHover(e));
    this.el.platter.addEventListener("mouseleave", () => {
      this.el.tooltip.hidden = true;
      this.hoverQt = -1;
      this.dirty = true;
    });
    this.el.platter.addEventListener("mousedown", (e) => this._platterDown(e));
    this.el.platter.addEventListener("wheel", (e) => this._platterWheel(e), { passive: false });
    this.el.platter.addEventListener("dblclick", () => this.fitPlatter());
    this.el.zoom.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.zoom === "fit") this.fitPlatter();
      else this.zoomPlatter(btn.dataset.zoom === "in" ? 2 : 0.5);
      this.el.platter.focus();
    });
    this.el.platter.addEventListener("keydown", (e) => this._platterKey(e));
    this.el.strip.addEventListener("mousemove", (e) => this._stripHover(e));
    this.el.strip.addEventListener("mouseleave", () => {
      this.el.stripTip.hidden = true;
    });
    this.el.strip.addEventListener("mousedown", (e) => this._stripDown(e));
    this.el.strip.addEventListener("wheel", (e) => this._stripWheel(e), { passive: false });
    this.el.strip.addEventListener("dblclick", () => {
      this._resetStripView();
      this._drawStrip();
    });

    this.resizeObserver = new ResizeObserver(() => this._resize());
    this.resizeObserver.observe(this.el.platterWrap);
    this.resizeObserver.observe(this.el.stripWrap);

    // Colours come from the theme, so a theme change redraws
    this.themeObserver = new MutationObserver(() => {
      this._readColours();
      this.diskImage = null;
      this.zoomLayer = null;
      this.dirty = true;
      this._drawStrip();
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    this._readColours();
    this._renderLegend();
    this._syncControls();
  }

  // ---- Window lifecycle ---------------------------------------------------

  show() {
    super.show();
    this.revision = -1; // Read the disk afresh
    if (!this.animFrame) this.animFrame = requestAnimationFrame(this._animate);
  }

  hide() {
    super.hide();
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.animFrame = null;
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    super.destroy();
  }

  getState() {
    const state = super.getState();
    state.drive = this.drive;
    state.mode = this.mode;
    state.follow = this.follow;
    state.selectedQt = this.selectedQt;
    state.tab = this.tab;
    return state;
  }

  restoreState(state) {
    if (state.drive === 0 || state.drive === 1) this.drive = state.drive;
    if (state.mode === "structure" || state.mode === "timing") this.mode = state.mode;
    if (typeof state.follow === "boolean") this.follow = state.follow;
    if (Number.isInteger(state.selectedQt)) {
      this.selectedQt = Math.max(0, Math.min(QUARTER_TRACKS - 1, state.selectedQt));
    }
    if (state.tab === "sector" || state.tab === "nibbles") this.tab = state.tab;
    this._syncControls();
    super.restoreState(state);
  }

  // ---- Choices ------------------------------------------------------------

  setDrive(drive) {
    if (drive === this.drive) return;
    this.drive = drive;
    this.revision = -1;
    this.pv = { zoom: 1, cx: 0, cy: 0, rot: 0 };
    this._syncZoomLabel();
    this.detailQt = -1;
    this.selectedSector = -1;
    this._syncControls();
    if (this.onStateChange) this.onStateChange();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.diskImage = null;
    this.zoomLayer = null;
    this.dirty = true;
    this._syncControls();
    this._renderLegend();
    this._drawStrip();
    if (this.onStateChange) this.onStateChange();
  }

  setTab(tab) {
    this.tab = tab;
    this._syncControls();
    if (tab === "nibbles") this._renderNibbles();
    if (this.onStateChange) this.onStateChange();
  }

  selectQuarterTrack(qt) {
    qt = Math.max(0, Math.min(QUARTER_TRACKS - 1, qt));
    if (qt === this.selectedQt && this.detailQt === qt) return;
    this.selectedQt = qt;
    this.selectedSector = -1;
    this.dirty = true;
    this._fetchDetail();
  }

  selectSector(index) {
    this.selectedSector = index;
    this._renderSectors();
    this._renderSectorData();
    this._drawStrip();
    if (this.tab === "nibbles") this._renderNibbles();
  }

  _syncControls() {
    if (!this.el) return;
    this.contentElement.querySelectorAll(".dinsp-seg").forEach((seg) => {
      const current = seg.dataset.group === "drive" ? String(this.drive) : this.mode;
      seg.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("active", b.dataset.value === current);
      });
    });
    this.el.follow.checked = this.follow;
    this.contentElement.querySelectorAll(".dinsp-tabs button").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === this.tab);
    });
    this.el.sectorView.hidden = this.tab !== "sector";
    this.el.nibbleView.hidden = this.tab !== "nibbles";
  }

  // ---- Talking to the core --------------------------------------------------

  async update(wasm) {
    if (!this.isVisible || this.fetching) return;
    const [inserted, revision, rotation, headQt, motorOn, selected] = await wasm.batch([
      ["_isDiskInserted", this.drive],
      ["_getDiskRevision", this.drive],
      ["_getDiskRotation", this.drive],
      ["_getDiskHeadPosition", this.drive],
      ["_getDiskMotorOn", this.drive],
      ["_getSelectedDrive"],
    ]);

    this.headActive = Boolean(motorOn) && selected === this.drive && Boolean(inserted);
    this.rotSample = rotation / 65536;
    this.rotSampleAt = performance.now();
    if (!this.headActive) this.rotation = this.rotSample;
    if (headQt !== this.headQt) {
      this.headQt = headQt;
      this.dirty = true;
    }

    const now = performance.now();
    const changed = Boolean(inserted) !== this.inserted || revision !== this.revision;
    if (changed && (this.revision === -1 || now - this.lastOverviewAt > REFRESH_WHILE_WRITING_MS)) {
      this.fetching = true;
      try {
        this.inserted = Boolean(inserted);
        this.revision = revision;
        await this._fetchOverview();
        await this._fetchDetail();
      } finally {
        this.fetching = false;
      }
      return;
    }

    if (this.follow && this.inserted && headQt !== this.selectedQt) {
      this.selectQuarterTrack(headQt);
    }
  }

  async _readBuffer(call) {
    const wasm = this.wasmModule;
    const sizePtr = await wasm._malloc(4);
    if (!sizePtr) return null;
    try {
      const ptr = await call(sizePtr);
      if (!ptr) return null;
      const size = await wasm.heapDataViewU32(sizePtr);
      if (size <= 0 || size > 16 * 1024 * 1024) return null;
      return await wasm.heapRead(ptr, size);
    } finally {
      wasm._free(sizePtr);
    }
  }

  /**
   * One track in full. The core answers every track into the same buffer, so
   * reads are taken one at a time: two in flight could each copy out the
   * other's track.
   */
  _readTrackDetail(qt) {
    const drive = this.drive;
    const read = this.detailChain.then(async () => {
      const bytes = await this._readBuffer((sizePtr) =>
        this.wasmModule._getDiskTrackDetail(drive, qt, STRIP_TIMING_BUCKETS, sizePtr),
      );
      return bytes ? parseTrackDetail(bytes) : null;
    });
    this.detailChain = read.catch(() => null);
    return read;
  }

  async _fetchOverview() {
    this.lastOverviewAt = performance.now();
    if (!this.inserted) {
      this.overview = null;
      this.filename = "";
    } else {
      const bytes = await this._readBuffer((sizePtr) =>
        this.wasmModule._getDiskOverview(this.drive, OVERVIEW_BUCKETS, sizePtr),
      );
      this.overview = bytes ? parseOverview(bytes) : null;
      this.filename =
        (await this.wasmModule.callString("_getDiskFilename", this.drive)) || "";
    }
    this.summary = summarizeDisk(this.overview);
    this.diskImage = null;
    this.zoomLayer = null;
    // What was read in full may have changed with the disk
    this.ringCache.clear();
    this.dirty = true;
    this._renderHeader();
  }

  async _fetchDetail() {
    const qt = this.selectedQt;
    if (!this.inserted) {
      this.detail = null;
      this.detailQt = qt;
    } else {
      const detail = await this._readTrackDetail(qt);
      if (qt !== this.selectedQt) return; // Moved on while this was in flight
      const sameTrack = this.detailQt === qt;
      this.detail = detail;
      this.detailQt = qt;
      if (detail?.present && !this.ringCache.has(qt)) {
        this._cacheRing(qt, detail);
        this.zoomLayer = null;
        this.dirty = true;
      }
      // A re-read of the same track (the disk was written) keeps the zoom
      if (!sameTrack || !this.stripView || this.stripView.start + this.stripView.span > (this.detail?.bitCount || 0)) {
        this._resetStripView();
      }
    }
    if (this.detail && this.selectedSector >= this.detail.sectors.length) {
      this.selectedSector = -1;
    }
    if (this.selectedSector < 0 && this.detail?.sectors.length) {
      this.selectedSector = 0;
    }
    this._renderTrack();
  }

  // ---- Colours --------------------------------------------------------------

  _readColours() {
    const style = getComputedStyle(document.documentElement);
    const probe = document.createElement("canvas").getContext("2d");
    const rgb = (name, fallback) => {
      probe.fillStyle = fallback;
      probe.fillStyle = style.getPropertyValue(name).trim() || fallback;
      probe.fillRect(0, 0, 1, 1);
      const d = probe.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const dark = document.documentElement.dataset.theme !== "light";
    const c = {
      blue: rgb("--accent-blue", "#009ddc"),
      green: rgb("--accent-green", "#61bb46"),
      yellow: rgb("--accent-yellow", "#fdb827"),
      orange: rgb("--accent-orange", "#f5821f"),
      red: rgb("--accent-red", "#e03a3e"),
      purple: rgb("--accent-purple", "#963d97"),
      medium: rgb("--disk-medium", "#1a1308"),
      hub: rgb("--disk-hub-ring", "#d8d4c8"),
      edge: rgb("--disk-edge", "#000000"),
      muted: rgb("--text-muted", "#8b949e"),
      text: rgb("--text-primary", "#e6edf3"),
    };
    // Sync is the quiet part of a track: a dim version of the medium
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    c.sync = mix(c.medium, c.muted, dark ? 0.28 : 0.35);
    c.neutral = mix(c.medium, c.muted, 0.55);
    this.colours = c;
    this.kindColours = [];
    this.kindColours[KIND.NONE] = c.medium;
    this.kindColours[KIND.SYNC] = c.sync;
    this.kindColours[KIND.ADDR_PROLOGUE] = c.yellow;
    this.kindColours[KIND.ADDR] = c.blue;
    this.kindColours[KIND.ADDR_EPILOGUE] = c.yellow;
    this.kindColours[KIND.DATA_PROLOGUE] = c.orange;
    this.kindColours[KIND.DATA] = c.green;
    this.kindColours[KIND.DATA_EPILOGUE] = c.orange;
    this.kindColours[KIND.OTHER] = c.purple;
    this.kindColours[KIND.INVALID] = c.muted;
    this.mix = mix;
  }

  _kindColour(kind) {
    if (kind & BAD) return this.colours.red;
    return this.kindColours[kind & KIND_MASK] || this.colours.medium;
  }

  // Blue for a cell written fast, orange for slow, neutral for on time
  _timeColour(time) {
    if (!time) return null;
    const d = Math.max(-1, Math.min(1, cellDeviation(time) / TIMING_RANGE));
    const c = this.colours;
    return d < 0 ? this.mix(c.neutral, c.blue, -d) : this.mix(c.neutral, c.orange, d);
  }

  _renderLegend() {
    if (!this.el) return;
    const chip = (rgb, label) =>
      `<span class="dinsp-legend-item"><span class="dinsp-swatch" style="background:rgb(${rgb.join(",")})"></span>${label}</span>`;
    const c = this.colours;
    if (this.mode === "timing") {
      this.el.legend.innerHTML = `
        ${chip(c.blue, "Fast cells")}
        ${chip(c.neutral, "Nominal 3.91&micro;s")}
        ${chip(c.orange, "Slow cells")}
        <span class="dinsp-legend-note">Only flux tracks carry timing; bit tracks are dimmed</span>`;
    } else {
      this.el.legend.innerHTML = `
        ${chip(c.sync, "Sync")}
        ${chip(c.yellow, "Address marks")}
        ${chip(c.blue, "Address")}
        ${chip(c.orange, "Data marks")}
        ${chip(c.green, "Data")}
        ${chip(c.red, "Bad checksum")}
        ${chip(c.purple, "Unknown")}
        ${chip(c.muted, "Noise")}`;
    }
  }

  // ---- The platter ----------------------------------------------------------

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const wrap = this.el.platterWrap;
    const size = Math.max(100, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight)));
    this.el.platter.style.width = `${size}px`;
    this.el.platter.style.height = `${size}px`;
    const px = Math.round(size * dpr);
    if (this.el.platter.width !== px) {
      this.el.platter.width = px;
      this.el.platter.height = px;
      this.diskImage = null;
      this.zoomLayer = null;
    }
    this.dirty = true;

    const strip = this.el.strip;
    const w = Math.max(100, this.el.stripWrap.clientWidth);
    const h = this.el.stripWrap.clientHeight || 88;
    strip.style.width = `${w}px`;
    strip.style.height = `${h}px`;
    strip.width = Math.round(w * dpr);
    strip.height = Math.round(h * dpr);
    this._drawStrip();
  }

  // ---- Painting the disk ------------------------------------------------------

  /**
   * What is recorded at one point of one ring, and how long its cells took.
   * A track read in full while zoomed in is answered cell by cell; otherwise
   * the overview's arcs answer.
   */
  _sample(qt, t, a) {
    const ring = this.ringCache.get(qt);
    if (ring) {
      const cell = Math.min(ring.bitCount - 1, Math.floor(a * ring.bitCount));
      const time = ring.times.length
        ? ring.times[Math.min(ring.times.length - 1, Math.floor(a * ring.times.length))]
        : 0;
      return { kind: ring.kinds[cell], time };
    }
    const buckets = this.overview.buckets;
    const b = Math.min(buckets - 1, Math.floor(a * buckets));
    return { kind: t.kinds[b], time: t.times[b] };
  }

  /**
   * Paint the disk pixel by pixel from polar coordinates: every pixel in the
   * recording band finds its quarter track from its radius and its place
   * round the track from its angle.
   *
   * @param {number} size   Canvas size in pixels
   * @param {Object} view   {zoom, cx, cy, rot}: the part of the disk shown,
   *                        and which angle of it is at twelve o'clock
   * @returns {ImageData}
   */
  _paintDisk(ctx, size, view) {
    const img = ctx.createImageData(size, size);
    const px = img.data;
    const half = size / 2;
    const c = this.colours;
    const tracks = this.overview?.tracks;
    const timing = this.mode === "timing";
    const TWO_PI = Math.PI * 2;
    const { zoom, cx, cy, rot } = view;

    let seed = 12345;
    const noise = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let y = 0; y < size; y++) {
      const dy = ((y + 0.5 - half) / half) / zoom + cy;
      for (let x = 0; x < size; x++) {
        const dx = ((x + 0.5 - half) / half) / zoom + cx;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > DISK_EDGE || r < HUB_HOLE) continue; // transparent
        const o = (y * size + x) * 4;
        let rgb;
        let shade = 1;
        if (r > BAND_OUTER || r < BAND_INNER) {
          rgb = r < HUB_RING_OUTER ? c.hub : c.medium;
          if (r > BAND_OUTER) shade = 0.85;
        } else {
          const pos = (BAND_OUTER - r) / RING_WIDTH;
          let qt = Math.min(QUARTER_TRACKS - 1, Math.floor(pos));
          let t = tracks?.[qt];
          let bleed = false;
          if (tracks && (!t || !t.present)) {
            // A head reads a track from the quarter track either side of it,
            // so a disk recorded on half tracks is drawn as wide as it reads
            const near = tracks[qt - 1]?.present ? qt - 1 : tracks[qt + 1]?.present ? qt + 1 : -1;
            if (near >= 0) {
              qt = near;
              t = tracks[near];
              bleed = true;
            }
          }
          if (!t || !t.present) {
            rgb = c.medium;
          } else {
            // Angle from twelve o'clock, clockwise, as the fraction of a turn
            let a = Math.atan2(dx, -dy) / TWO_PI + rot;
            a -= Math.floor(a);
            const { kind, time } = this._sample(qt, t, a);
            if (timing) {
              const tc = t.flux ? this._timeColour(time) : null;
              rgb = tc || this.mix(c.medium, this._kindColour(kind), 0.22);
            } else if ((kind & KIND_MASK) === KIND.INVALID && !(kind & BAD)) {
              rgb = this.mix(c.medium, c.muted, 0.25 + noise() * 0.6);
            } else {
              rgb = this._kindColour(kind);
            }
          }
          if (bleed && rgb !== c.medium) rgb = this.mix(c.medium, rgb, 0.45);
          // A groove between whole tracks, so the rings read as tracks
          const inTrack = (pos / 4) % 1;
          if (inTrack < 0.06 || inTrack > 0.97) shade = 0.62;
        }
        px[o] = rgb[0] * shade;
        px[o + 1] = rgb[1] * shade;
        px[o + 2] = rgb[2] * shade;
        px[o + 3] = 255;
      }
    }
    return img;
  }

  /**
   * The whole disk, painted once into an offscreen canvas. Drawing that
   * rotated is one drawImage per frame, however much is on the disk.
   */
  _buildDiskImage() {
    const size = this.el.platter.width;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.putImageData(this._paintDisk(ctx, size, { zoom: 1, cx: 0, cy: 0, rot: 0 }), 0, 0);
    const half = size / 2;
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.beginPath();
    ctx.arc(half, half - INDEX_HOLE_RADIUS * half, 0.018 * half, 0, Math.PI * 2);
    ctx.fill();
    this.diskImage = canvas;
  }

  // ---- Zooming ------------------------------------------------------------------

  get zoomed() {
    return this.pv.zoom > 1.001;
  }

  // A point on the disk, in the view's frame, to a canvas pixel
  _toScreen(r, a, half) {
    const va = (a - this.pv.rot) * Math.PI * 2;
    const vx = r * Math.sin(va);
    const vy = -r * Math.cos(va);
    return {
      x: half + (vx - this.pv.cx) * this.pv.zoom * half,
      y: half + (vy - this.pv.cy) * this.pv.zoom * half,
      va,
    };
  }

  _clampView() {
    const v = this.pv;
    v.zoom = Math.max(1, Math.min(MAX_PLATTER_ZOOM, v.zoom));
    if (v.zoom <= 1.001) {
      v.zoom = 1;
      v.cx = 0;
      v.cy = 0;
      return;
    }
    const limit = 1;
    v.cx = Math.max(-limit, Math.min(limit, v.cx));
    v.cy = Math.max(-limit, Math.min(limit, v.cy));
  }

  /**
   * Zoom by a factor, keeping the point under (sx, sy) where it is. sx and sy
   * are -1 to 1 across the canvas; the centre when not given.
   */
  zoomPlatter(factor, sx = 0, sy = 0) {
    const v = this.pv;
    if (!this.zoomed) {
      // The view stops turning while zoomed: it holds the angle it had, and
      // the head moves round the disk instead
      v.rot = this.rotation;
    }
    const px = sx / v.zoom + v.cx;
    const py = sy / v.zoom + v.cy;
    v.zoom *= factor;
    this._clampView();
    if (this.zoomed) {
      v.cx = px - sx / v.zoom;
      v.cy = py - sy / v.zoom;
      this._clampView();
    }
    this.zoomLayer = null;
    this.dirty = true;
    this._syncZoomLabel();
  }

  fitPlatter() {
    this.pv.zoom = 1;
    this._clampView();
    this.zoomLayer = null;
    this.dirty = true;
    this._syncZoomLabel();
  }

  _syncZoomLabel() {
    if (!this.el?.zoomLevel) return;
    const z = this.pv.zoom;
    this.el.zoomLevel.textContent = `${z < 10 ? z.toFixed(1) : Math.round(z)}×`;
  }

  // Canvas-relative position of an event, -1 to 1 across
  _eventToView(e) {
    const rect = this.el.platter.getBoundingClientRect();
    return {
      sx: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      sy: ((e.clientY - rect.top) / rect.height) * 2 - 1,
    };
  }

  _platterWheel(e) {
    if (!this.inserted) return;
    e.preventDefault();
    const { sx, sy } = this._eventToView(e);
    this.zoomPlatter(Math.exp(-e.deltaY * 0.003), sx, sy);
  }

  _platterDown(e) {
    if (e.button !== 0) return;
    this.el.platter.focus();
    this.platterDrag = { x: e.clientX, y: e.clientY, cx: this.pv.cx, cy: this.pv.cy, moved: false };
    const move = (ev) => {
      const d = this.platterDrag;
      if (!d) return;
      const rect = this.el.platter.getBoundingClientRect();
      const mx = ev.clientX - d.x;
      const my = ev.clientY - d.y;
      if (Math.abs(mx) + Math.abs(my) > 3) d.moved = true;
      if (!d.moved || !this.zoomed) return;
      this.pv.cx = d.cx - (mx / (rect.width / 2)) / this.pv.zoom;
      this.pv.cy = d.cy - (my / (rect.height / 2)) / this.pv.zoom;
      this._clampView();
      this.zoomLayer = null;
      this.dirty = true;
    };
    const up = (ev) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const d = this.platterDrag;
      this.platterDrag = null;
      if (d && !d.moved) this._platterClick(ev);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  /**
   * Read in full the tracks a zoomed view shows, so they are drawn cell by
   * cell. Only when few enough rings are in view for that to be worth it.
   */
  _requestVisibleRings() {
    if (!this.zoomed || !this.overview) return;
    const v = this.pv;
    const reach = Math.SQRT2 / v.zoom;
    const centre = Math.hypot(v.cx, v.cy);
    const rMin = Math.max(BAND_INNER, centre - reach);
    const rMax = Math.min(BAND_OUTER, centre + reach);
    if (rMax <= rMin) return;
    const first = Math.max(0, Math.floor((BAND_OUTER - rMax) / RING_WIDTH) - 1);
    const last = Math.min(QUARTER_TRACKS - 1, Math.ceil((BAND_OUTER - rMin) / RING_WIDTH) + 1);
    if (last - first > MAX_RINGS_IN_FULL) return;
    for (let qt = first; qt <= last; qt++) {
      if (this.overview.tracks[qt]?.present && !this.ringCache.has(qt)) {
        this._queueRing(qt);
      }
    }
  }

  _queueRing(qt) {
    if (this.ringPending.has(qt)) return;
    this.ringPending.add(qt);
    const revision = this.revision;
    const drive = this.drive;
    this._readTrackDetail(qt).then((detail) => {
      this.ringPending.delete(qt);
      if (!detail || revision !== this.revision || drive !== this.drive) return;
      this._cacheRing(qt, detail);
      this.zoomLayer = null;
      this.dirty = true;
    });
  }

  // A track's nibbles as one kind per cell, which a pixel can look up directly
  _cacheRing(qt, detail) {
    if (!detail.present || !detail.bitCount) return;
    const kinds = new Uint8Array(detail.bitCount);
    const n = detail.nibbles;
    for (let i = 0; i < n.count; i++) {
      const start = n.start[i];
      const end = start + n.cells[i];
      kinds.fill(n.kind[i], start, Math.min(end, detail.bitCount));
      if (end > detail.bitCount) kinds.fill(n.kind[i], 0, end - detail.bitCount);
    }
    // Before the first nibble is the tail of the last one, round the track
    if (n.count) kinds.fill(n.kind[n.count - 1], 0, n.start[0]);
    if (this.ringCache.size >= MAX_CACHED_RINGS) {
      this.ringCache.delete(this.ringCache.keys().next().value);
    }
    this.ringCache.set(qt, { bitCount: detail.bitCount, kinds, times: detail.times, detail });
  }

  /**
   * The zoomed view: the part of the disk in view painted at full resolution,
   * then, close enough, each nibble's value along its ring and each flux
   * transition as a tick across it.
   */
  _buildZoomLayer() {
    const size = this.el.platter.width;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.putImageData(this._paintDisk(ctx, size, this.pv), 0, 0);
    const half = size / 2;
    const dpr = window.devicePixelRatio || 1;

    const hole = this._toScreen(INDEX_HOLE_RADIUS, 0, half);
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, 0.018 * half * this.pv.zoom, 0, Math.PI * 2);
    ctx.fill();

    const ringPx = RING_WIDTH * half * this.pv.zoom;
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace";
    for (const [qt, ring] of this.ringCache) {
      const r = BAND_OUTER - (qt + 0.5) * RING_WIDTH;
      const pxPerCell = (Math.PI * 2 * r * half * this.pv.zoom) / ring.bitCount;
      if (pxPerCell * 8 < 18 * dpr || ringPx < 10 * dpr) continue;
      const n = ring.detail.nibbles;
      const margin = 40 * dpr;
      const fontPx = Math.min(ringPx * 0.34, pxPerCell * 8 * 0.42, 15 * dpr);
      ctx.font = `${Math.round(fontPx)}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < n.count; i++) {
        const mid = this._toScreen(r, (n.start[i] + n.cells[i] / 2) / ring.bitCount, half);
        if (mid.x < -margin || mid.y < -margin || mid.x > size + margin || mid.y > size + margin) continue;

        // The boundary where the nibble starts, across the ring
        const start = n.start[i] / ring.bitCount;
        const a0 = this._toScreen(r - RING_WIDTH * 0.45, start, half);
        const a1 = this._toScreen(r + RING_WIDTH * 0.45, start, half);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath();
        ctx.moveTo(a0.x, a0.y);
        ctx.lineTo(a1.x, a1.y);
        ctx.stroke();

        // The value, along the ring and the right way up
        ctx.save();
        ctx.translate(mid.x, mid.y);
        let turn = mid.va;
        const up = ((turn % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (up > Math.PI / 2 && up < (Math.PI * 3) / 2) turn += Math.PI;
        ctx.rotate(turn);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillText(this.formatHex(n.value[i]), dpr * 0.8, dpr * 0.8 - ringPx * 0.2);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText(this.formatHex(n.value[i]), 0, -ringPx * 0.2);
        ctx.restore();

        // Each 1 is a flux transition; the cells past a nibble's eighth are 0
        if (pxPerCell >= 5 * dpr) {
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = Math.max(1, dpr);
          for (let k = 0; k < n.cells[i] && k < 8; k++) {
            if (!((n.value[i] >> (7 - k)) & 1)) continue;
            const a = (n.start[i] + k + 0.5) / ring.bitCount;
            const p0 = this._toScreen(r + RING_WIDTH * 0.02, a, half);
            const p1 = this._toScreen(r - RING_WIDTH * 0.38, a, half);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
        }
      }
    }
    this.zoomLayer = canvas;
    this._requestVisibleRings();
  }

  _animate(now) {
    this.animFrame = requestAnimationFrame(this._animate);
    if (!this.isVisible || !this.el) return;
    if (this.headActive) {
      const turned = (now - this.rotSampleAt) / REVOLUTION_MS;
      this.rotation = (this.rotSample + turned) % 1;
      this.dirty = true;
      this._drawStripHead();
    }
    if (this.dirty) this._drawPlatter();
  }

  _drawPlatter() {
    this.dirty = false;
    const canvas = this.el.platter;
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const half = size / 2;
    ctx.clearRect(0, 0, size, size);

    this.el.empty.hidden = this.inserted;
    this.el.zoom.hidden = !this.inserted;
    if (!this.inserted) {
      this.el.empty.textContent = `No disk in drive ${this.drive + 1}`;
      ctx.strokeStyle = `rgba(${this.colours.muted.join(",")},0.4)`;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = Math.max(1, size / 400);
      ctx.beginPath();
      ctx.arc(half, half, half * DISK_EDGE, 0, Math.PI * 2);
      ctx.arc(half, half, half * HUB_RING_OUTER, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const ringRadius = (qt) => BAND_OUTER - (qt + 0.5) * RING_WIDTH;
    const lw = Math.max(1, size / 500);
    const hc = this.headActive ? this.colours.yellow : this.colours.muted;

    if (this.zoomed) {
      if (!this.zoomLayer || this.zoomLayer.width !== size) this._buildZoomLayer();
      ctx.drawImage(this.zoomLayer, 0, 0);
      // Rings are circles about the disk's centre, wherever that now is
      const centre = this._toScreen(0, 0, half);
      const ring = (qt, colour, width) => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, ringRadius(qt) * half * this.pv.zoom, 0, Math.PI * 2);
        ctx.stroke();
      };
      if (this.hoverQt >= 0) ring(this.hoverQt, "rgba(255,255,255,0.35)", lw);
      ring(this.selectedQt, `rgba(${this.colours.text.join(",")},0.9)`, lw * 1.5);

      // The disk holds still and the head goes round it
      const inner = this._toScreen(ringRadius(this.headQt) - RING_WIDTH * 2.5, this.rotation, half);
      const at = this._toScreen(ringRadius(this.headQt), this.rotation, half);
      const outer = this._toScreen(DISK_EDGE, this.rotation, half);
      ctx.strokeStyle = `rgba(${hc.join(",")},0.8)`;
      ctx.lineWidth = Math.max(2, size / 300);
      ctx.beginPath();
      ctx.moveTo(outer.x, outer.y);
      ctx.lineTo(inner.x, inner.y);
      ctx.stroke();
      ctx.fillStyle = `rgb(${hc.join(",")})`;
      ctx.beginPath();
      ctx.arc(at.x, at.y, Math.max(4, size / 120), 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (!this.diskImage || this.diskImage.width !== size) this._buildDiskImage();

    // The data under the head is at twelve o'clock
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(-this.rotation * Math.PI * 2);
    ctx.drawImage(this.diskImage, -half, -half);
    ctx.restore();

    const ring = (qt, colour, width) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(half, half, ringRadius(qt) * half, 0, Math.PI * 2);
      ctx.stroke();
    };
    if (this.hoverQt >= 0) ring(this.hoverQt, "rgba(255,255,255,0.35)", lw);
    ring(this.selectedQt, `rgba(${this.colours.text.join(",")},0.9)`, lw * 1.5);

    // The head, on its carriage above the disk
    const hr = ringRadius(this.headQt) * half;
    ctx.fillStyle = `rgba(${hc.join(",")},0.35)`;
    ctx.fillRect(half - size * 0.012, 0, size * 0.024, half - hr);
    ctx.fillStyle = `rgb(${hc.join(",")})`;
    const hw = size * 0.034;
    const hh = size * 0.05;
    ctx.beginPath();
    ctx.moveTo(half - hw / 2, half - hr - hh);
    ctx.lineTo(half + hw / 2, half - hr - hh);
    ctx.lineTo(half + hw / 2, half - hr - hh * 0.3);
    ctx.lineTo(half, half - hr);
    ctx.lineTo(half - hw / 2, half - hr - hh * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  // Where a point on the platter is on the disk, allowing for the zoom and
  // the rotation
  _platterPoint(e) {
    const { sx, sy } = this._eventToView(e);
    const dx = sx / this.pv.zoom + this.pv.cx;
    const dy = sy / this.pv.zoom + this.pv.cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > BAND_OUTER || r < BAND_INNER) return null;
    const qt = Math.min(QUARTER_TRACKS - 1, Math.floor((BAND_OUTER - r) / RING_WIDTH));
    let a = Math.atan2(dx, -dy) / (Math.PI * 2) + (this.zoomed ? this.pv.rot : this.rotation);
    a = ((a % 1) + 1) % 1;
    return { qt, angle: a };
  }

  _platterHover(e) {
    if (this.platterDrag?.moved) return;
    const p = this.inserted ? this._platterPoint(e) : null;
    const tip = this.el.tooltip;
    if (!p) {
      tip.hidden = true;
      if (this.hoverQt !== -1) this.dirty = true;
      this.hoverQt = -1;
      return;
    }
    if (p.qt !== this.hoverQt) {
      this.hoverQt = p.qt;
      this.dirty = true;
    }
    const t = this.overview?.tracks[p.qt];
    let html = `<b>Track ${trackLabel(p.qt)}</b>`;
    const ring = this.ringCache.get(p.qt);
    if (!t || !t.present) {
      const near = [p.qt - 1, p.qt + 1].find((q) => this.overview?.tracks[q]?.present);
      html += near === undefined
        ? "<br>Nothing recorded"
        : `<br>Nothing recorded; the head picks up track ${trackLabel(near)} here`;
    } else if (ring) {
      // Read in full: say exactly which nibble
      const d = ring.detail;
      const cell = Math.floor(p.angle * d.bitCount);
      const i = nibbleAtCell(d.nibbles, cell);
      html += ` · <b>$${this.formatHex(d.nibbles.value[i])}</b> at cell ${cell.toLocaleString()}`;
      html += `<br>${kindName(d.nibbles.kind[i])}`;
      if (d.nibbles.sector[i] !== NO_SECTOR) html += `, sector ${d.sectors[d.nibbles.sector[i]].sector}`;
      const time = d.times.length ? d.times[Math.floor(p.angle * d.times.length)] : 0;
      if (d.flux && time) {
        const pct = cellDeviation(time) * 100;
        html += `<br>${cellMicroseconds(time).toFixed(2)}&micro;s cells (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
      }
    } else {
      const b = Math.min(this.overview.buckets - 1, Math.floor(p.angle * this.overview.buckets));
      html += `<br>${kindName(t.kinds[b])}`;
      if (t.sectors[b] !== NO_SECTOR) html += `, sector ${t.sectors[b]}`;
      if (t.flux && t.times[b]) {
        const pct = cellDeviation(t.times[b]) * 100;
        html += `<br>${cellMicroseconds(t.times[b]).toFixed(2)}&micro;s cells (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
      }
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const wrap = this.el.platterWrap.getBoundingClientRect();
    tip.style.left = `${Math.min(e.clientX - wrap.left + 14, wrap.width - 220)}px`;
    tip.style.top = `${Math.min(e.clientY - wrap.top + 14, wrap.height - 70)}px`;
  }

  _platterClick(e) {
    const p = this.inserted ? this._platterPoint(e) : null;
    if (!p) return;
    this._stopFollowing();
    this.selectQuarterTrack(p.qt);
    // Pick the sector under the pointer once the track has arrived
    const t = this.overview?.tracks[p.qt];
    if (t?.present) {
      const b = Math.floor(p.angle * this.overview.buckets);
      this.pendingSectorNumber = t.sectors[b] !== NO_SECTOR ? t.sectors[b] : -1;
    }
  }

  _platterKey(e) {
    const zoomKey = { "+": 1.5, "=": 1.5, "-": 1 / 1.5, _: 1 / 1.5 }[e.key];
    if (zoomKey !== undefined || e.key === "0") {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "0") this.fitPlatter();
      else this.zoomPlatter(zoomKey);
      return;
    }
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -4, PageDown: 4 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    this._stopFollowing();
    this.selectQuarterTrack(this.selectedQt + step);
  }

  _stopFollowing() {
    if (!this.follow) return;
    this.follow = false;
    this._syncControls();
  }

  // ---- The track ------------------------------------------------------------

  _renderHeader() {
    const s = this.summary;
    this.el.filename.textContent = this.inserted ? this.filename || "Untitled" : "No disk";
    this.el.filename.title = this.el.filename.textContent;
    if (!this.inserted || !this.overview) {
      this.el.chips.innerHTML = "";
      return;
    }
    const chips = [
      [s.format, ""],
      [`${s.tracks} tracks`, ""],
    ];
    if (s.sectors) {
      chips.push([`${s.good}/${s.sectors} sectors good`, s.bad ? "warn" : "ok"]);
    }
    if (s.bad) chips.push([`${s.bad} bad checksums`, "bad"]);
    if (s.nonStandardTracks) chips.push([`${s.nonStandardTracks} unknown`, "odd"]);
    if (s.fluxTracks) chips.push([`${s.fluxTracks} flux`, "flux"]);
    this.el.chips.innerHTML = chips
      .map(([text, cls]) => `<span class="dinsp-chip ${cls}">${text}</span>`)
      .join("");
  }

  _renderTrack() {
    const d = this.detail;
    const qt = this.selectedQt;
    this.el.trackTitle.textContent = `Track ${trackLabel(qt)}`;
    if (!this.inserted) {
      this.el.trackMeta.textContent = "";
    } else if (!d || !d.present) {
      this.el.trackMeta.textContent = "Nothing recorded on this quarter track";
    } else {
      const good = d.sectors.filter((s) => s.data === DATA_STATE.GOOD).length;
      const parts = [
        `${d.bitCount.toLocaleString()} cells`,
        `${d.nibbles.count.toLocaleString()} nibbles`,
        d.sectors.length ? `${d.sectors.length} sectors, ${good} good` : "no standard sectors",
      ];
      if (d.flux) parts.push("flux");
      this.el.trackMeta.textContent = parts.join(" · ");
    }

    if (this.pendingSectorNumber !== undefined && d) {
      const hit = d.sectors.findIndex((s) => s.sector === this.pendingSectorNumber);
      if (hit >= 0) this.selectedSector = hit;
      this.pendingSectorNumber = undefined;
    }

    this._renderSectors();
    this._renderSectorData();
    if (this.tab === "nibbles") this._renderNibbles();
    this._drawStrip();
  }

  // ---- The strip: one track unrolled, zoomable -----------------------------

  // Which cells the strip shows. Reset whenever a different track arrives,
  // since two tracks are rarely the same length.
  _resetStripView() {
    const bits = this.detail?.bitCount || 1;
    this.stripView = { start: 0, span: bits };
  }

  _cellToX(cell) {
    const v = this.stripView;
    return ((cell - v.start) / v.span) * this.el.strip.width;
  }

  _xToCell(clientX) {
    const rect = this.el.strip.getBoundingClientRect();
    const v = this.stripView;
    return v.start + ((clientX - rect.left) / rect.width) * v.span;
  }

  _clampStripView() {
    const bits = this.detail?.bitCount || 1;
    const v = this.stripView;
    // Down to about twenty cells across, which shows each one as a pulse
    v.span = Math.max(20, Math.min(bits, v.span));
    v.start = Math.max(0, Math.min(bits - v.span, v.start));
  }

  _stripWheel(e) {
    if (!this.detail?.present) return;
    e.preventDefault();
    const cell = this._xToCell(e.clientX);
    const factor = Math.exp(e.deltaY * 0.0025);
    const v = this.stripView;
    const fraction = (cell - v.start) / v.span;
    v.span *= factor;
    this._clampStripView();
    v.start = cell - fraction * v.span;
    this._clampStripView();
    this._drawStrip();
  }

  _drawStrip() {
    if (!this.el || !this.colours) return;
    const canvas = this.el.strip;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, W, H);
    const d = this.detail;
    const c = this.colours;
    const band = { top: Math.round(H * 0.3), bottom: Math.round(H * 0.92) };
    const bandH = band.bottom - band.top;

    ctx.fillStyle = `rgb(${c.medium.join(",")})`;
    ctx.fillRect(0, band.top, W, bandH);
    if (!d || !d.present || !d.bitCount) {
      this._stripBase = null;
      return;
    }
    if (!this.stripView) this._resetStripView();

    const n = d.nibbles;
    const v = this.stripView;
    const pxPerCell = W / v.span;
    const firstVisible = firstNibbleInView(n, v.start);
    const timing = this.mode === "timing" && d.flux;
    const rgb = (col) => `rgb(${col.join(",")})`;

    // Average timing per pixel column, from however many buckets it covers
    const columnTime = (x0, x1) => {
      const b0 = Math.floor(((v.start + (x0 / W) * v.span) / d.bitCount) * d.times.length);
      const b1 = Math.max(b0 + 1, Math.ceil(((v.start + (x1 / W) * v.span) / d.bitCount) * d.times.length));
      let sum = 0;
      let count = 0;
      for (let b = b0; b < b1 && b < d.times.length; b++) {
        if (d.times[b]) {
          sum += d.times[b];
          count++;
        }
      }
      return count ? sum / count : 0;
    };

    // The band: nibbles by what they are, or cells by how long they took
    const COLUMN = Math.max(1, Math.round(2 * dpr));
    if (timing) {
      for (let x = 0; x < W; x += COLUMN) {
        const col = this._timeColour(columnTime(x, x + COLUMN));
        if (!col) continue;
        ctx.fillStyle = rgb(col);
        ctx.fillRect(x, band.top, COLUMN, bandH);
      }
    } else {
      const first = firstVisible;
      for (let i = first; i < n.count; i++) {
        if (n.start[i] > v.start + v.span) break;
        const x = this._cellToX(n.start[i]);
        const w = Math.max(1, n.cells[i] * pxPerCell);
        ctx.fillStyle = rgb(this._kindColour(n.kind[i]));
        ctx.fillRect(x, band.top, w + 0.5, bandH);
      }
    }

    // Close enough to read: the nibble's value, then its cells as pulses
    const labelFont = `${Math.round(10 * dpr)}px ${
      getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace"
    }`;
    if (pxPerCell * 8 >= 22 * dpr) {
      const first = firstVisible;
      ctx.font = labelFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let i = first; i < n.count; i++) {
        if (n.start[i] > v.start + v.span) break;
        const x = this._cellToX(n.start[i]);
        const w = n.cells[i] * pxPerCell;
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(x, band.top, Math.max(1, dpr * 0.5), bandH);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(this.formatHex(n.value[i]), x + w / 2, band.top + 3 * dpr);
        if (pxPerCell >= 5 * dpr) {
          // Each 1 is a flux transition; a nibble's cells past eight are 0
          for (let k = 0; k < n.cells[i] && k < 8; k++) {
            if (!((n.value[i] >> (7 - k)) & 1)) continue;
            const px = x + (k + 0.5) * pxPerCell;
            ctx.fillRect(px - dpr * 0.5, band.top + bandH * 0.45, Math.max(1, dpr), bandH * 0.5);
          }
        }
      }
      ctx.textAlign = "left";
    }

    // Timing as a line: above the middle is slow, below it fast
    if (d.flux && d.times.length) {
      const mid = (band.top + band.bottom) / 2;
      const amp = bandH / 2 / TIMING_RANGE;
      ctx.lineWidth = Math.max(1, dpr);
      ctx.strokeStyle = timing ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.8)";
      ctx.beginPath();
      let started = false;
      for (let x = 0; x < W; x += COLUMN) {
        const t = columnTime(x, x + COLUMN);
        if (!t) continue;
        const dev = Math.max(-TIMING_RANGE, Math.min(TIMING_RANGE, cellDeviation(t)));
        const y = mid - dev * amp;
        if (started) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        started = true;
      }
      ctx.stroke();
    }

    // Sector labels above the band, the selected one outlined
    ctx.font = labelFont;
    ctx.textBaseline = "middle";
    d.sectors.forEach((s, i) => {
      const x = this._cellToX(n.start[s.addressNibble]);
      const bad = !s.addressOk || s.data === DATA_STATE.BAD;
      if (x >= -40 && x <= W) {
        const colour = bad ? c.red : i === this.selectedSector ? c.text : c.muted;
        ctx.fillStyle = rgb(colour);
        ctx.fillText(s.sector.toString(16).toUpperCase(), x + 2 * dpr, band.top / 2);
        ctx.fillRect(x, band.top * 0.2, Math.max(1, dpr), band.top * 0.8);
      }
      if (i === this.selectedSector) {
        // To the end of the data field's epilogue: prologue, the field, and
        // three more; or the address field's, when there is no data
        const dataLength = s.sectorsPerTrack === 13 ? 411 : 343;
        const endCell = s.data !== DATA_STATE.NONE
          ? n.start[(s.dataNibble + 3 + dataLength + 3) % n.count]
          : n.start[(s.addressNibble + 14) % n.count];
        const startCell = n.start[s.addressNibble];
        ctx.strokeStyle = rgb(c.text);
        ctx.lineWidth = Math.max(1, dpr * 1.5);
        const outline = (a, b) => {
          const x1 = this._cellToX(a);
          const x2 = this._cellToX(b);
          ctx.strokeRect(x1, band.top - 1, x2 - x1, bandH + 2);
        };
        if (endCell > startCell) {
          outline(startCell, endCell);
        } else {
          // Runs over the end of the track
          outline(startCell, d.bitCount);
          outline(0, endCell);
        }
      }
    });

    // How far in, when zoomed
    const zoom = d.bitCount / v.span;
    if (zoom > 1.05) {
      ctx.font = labelFont;
      ctx.textAlign = "right";
      ctx.fillStyle = rgb(c.muted);
      ctx.fillText(`×${zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}`, W - 4 * dpr, band.top / 2);
      ctx.textAlign = "left";
    }

    this._stripBase = ctx.getImageData(0, 0, W, H);
    this._drawStripHead();
  }

  // The head's place on the strip moves every frame, so it is drawn over a
  // saved copy of the rest rather than redrawing the track
  _drawStripHead() {
    if (!this._stripBase || !this.detail?.bitCount) return;
    const canvas = this.el.strip;
    const ctx = canvas.getContext("2d");
    ctx.putImageData(this._stripBase, 0, 0);
    if (!this.headActive || this.headQt !== this.selectedQt) return;
    const x = this._cellToX(this.rotation * this.detail.bitCount);
    if (x < 0 || x > canvas.width) return;
    ctx.fillStyle = `rgb(${this.colours.yellow.join(",")})`;
    ctx.fillRect(x - 1, 0, Math.max(2, window.devicePixelRatio || 1), canvas.height);
  }

  _stripNibble(e) {
    const d = this.detail;
    if (!d || !d.present) return -1;
    return nibbleAtCell(d.nibbles, Math.floor(this._xToCell(e.clientX)));
  }

  _stripHover(e) {
    if (this.stripDrag) {
      const rect = this.el.strip.getBoundingClientRect();
      const moved = e.clientX - this.stripDrag.x;
      if (Math.abs(moved) > 3) this.stripDrag.moved = true;
      this.stripView.start = this.stripDrag.start - (moved / rect.width) * this.stripView.span;
      this._clampStripView();
      this._drawStrip();
      return;
    }
    const i = this._stripNibble(e);
    const tip = this.el.stripTip;
    if (i < 0) {
      tip.hidden = true;
      return;
    }
    const d = this.detail;
    const n = d.nibbles;
    let html = `<b>$${this.formatHex(n.value[i])}</b> at cell ${n.start[i].toLocaleString()}, ${n.cells[i]} cells<br>${kindName(n.kind[i])}`;
    if (n.sector[i] !== NO_SECTOR) {
      html += `, sector ${d.sectors[n.sector[i]].sector}`;
    }
    if (d.flux && d.times.length) {
      const b = Math.floor((n.start[i] / d.bitCount) * d.times.length);
      const t = d.times[b];
      if (t) {
        const pct = cellDeviation(t) * 100;
        html += `<br>${cellMicroseconds(t).toFixed(2)}&micro;s cells (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
      }
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const wrap = this.el.stripWrap.getBoundingClientRect();
    const x = e.clientX - wrap.left;
    tip.style.left = `${Math.min(x + 12, wrap.width - 200)}px`;
    tip.style.top = `${e.clientY - wrap.top + 12}px`;
  }

  _stripDown(e) {
    if (e.button !== 0 || !this.stripView) return;
    this.stripDrag = { x: e.clientX, start: this.stripView.start, moved: false };
    const up = (ev) => {
      window.removeEventListener("mouseup", up);
      const drag = this.stripDrag;
      this.stripDrag = null;
      if (drag && !drag.moved) this._stripClick(ev);
    };
    window.addEventListener("mouseup", up);
  }

  _stripClick(e) {
    const i = this._stripNibble(e);
    if (i < 0) return;
    const sector = this.detail.nibbles.sector[i];
    if (sector !== NO_SECTOR) this.selectSector(sector);
    this.scrollToNibble = i;
    if (this.tab === "nibbles") this._renderNibbles();
  }

  _renderSectors() {
    const d = this.detail;
    if (!d || !d.sectors.length) {
      this.el.sectors.innerHTML = `<span class="dinsp-none">${
        d?.present ? "None in a standard format" : "No track"
      }</span>`;
      return;
    }
    this.el.sectors.innerHTML = d.sectors
      .map((s, i) => {
        let cls = "ok";
        let title = "Address and data good";
        if (!s.addressOk) {
          cls = "bad";
          title = "Address checksum failed";
        } else if (s.data === DATA_STATE.BAD) {
          cls = "bad";
          title = "Data checksum failed";
        } else if (s.data === DATA_STATE.NONE) {
          cls = "nodata";
          title = "Address field with no data field";
        } else if (s.data === DATA_STATE.UNVERIFIED) {
          cls = "unverified";
          title = "13-sector data, not decoded";
        }
        return `<button class="dinsp-sector ${cls}${i === this.selectedSector ? " active" : ""}" data-index="${i}" title="${title}">${s.sector.toString(16).toUpperCase()}</button>`;
      })
      .join("");
  }

  _renderSectorData() {
    const d = this.detail;
    const view = this.el.sectorView;
    const s = d?.sectors[this.selectedSector];
    if (!s) {
      view.innerHTML = `<div class="dinsp-none">${
        d?.present
          ? "No standard sectors on this track. The Nibbles tab shows what is recorded on it."
          : "Nothing to show."
      }</div>`;
      return;
    }
    const mark = (ok) => (ok ? `<span class="dinsp-good">good</span>` : `<span class="dinsp-bad">bad</span>`);
    const dataState = {
      [DATA_STATE.GOOD]: mark(true),
      [DATA_STATE.BAD]: mark(false),
      [DATA_STATE.NONE]: `<span class="dinsp-bad">missing</span>`,
      [DATA_STATE.UNVERIFIED]: "13-sector, not decoded",
    }[s.data];
    let html = `<div class="dinsp-sector-head">Sector ${s.sector} · track ${s.track} · volume ${s.volume} · address ${mark(s.addressOk)} · data ${dataState}</div>`;
    if (s.data === DATA_STATE.GOOD || s.data === DATA_STATE.BAD) {
      html += '<div class="dinsp-hex">';
      for (let row = 0; row < 16; row++) {
        let hex = "";
        let ascii = "";
        for (let col = 0; col < 16; col++) {
          const b = s.bytes[row * 16 + col];
          const cls = b === 0 ? "z" : b >= 0x80 ? "h" : "";
          hex += `<span class="${cls}">${this.formatHex(b)}</span> `;
          const ch = b & 0x7f;
          ascii += ch >= 0x20 && ch < 0x7f ? escapeHtml(String.fromCharCode(ch)) : ".";
        }
        html += `<div><span class="a">${this.formatHex(row * 16)}</span> ${hex}<span class="t">${ascii}</span></div>`;
      }
      html += "</div>";
    }
    view.innerHTML = html;
  }

  _renderNibbles() {
    const d = this.detail;
    const view = this.el.nibbleView;
    if (!d || !d.present || !d.nibbles.count) {
      view.innerHTML = '<div class="dinsp-none">Nothing recorded.</div>';
      return;
    }
    const n = d.nibbles;
    const sel = this.selectedSector;
    const PER_ROW = 32;
    let html = "";
    for (let row = 0; row < n.count; row += PER_ROW) {
      html += `<div data-row="${row}"><span class="a">${row.toString().padStart(4, "0")}</span>`;
      for (let i = row; i < Math.min(row + PER_ROW, n.count); i++) {
        const k = n.kind[i];
        let cls = `k${k & KIND_MASK}`;
        if (k & BAD) cls += " bad";
        if (sel >= 0 && n.sector[i] === sel) cls += " sel";
        html += `<span class="${cls}">${this.formatHex(n.value[i])}</span>`;
      }
      html += "</div>";
    }
    view.innerHTML = html;

    // Bring the selection, or the nibble clicked on the strip, into view
    let target = this.scrollToNibble;
    this.scrollToNibble = undefined;
    if (target === undefined && sel >= 0 && d.sectors[sel]) {
      target = d.sectors[sel].addressNibble;
    }
    if (target !== undefined) {
      const row = view.querySelector(`[data-row="${Math.floor(target / PER_ROW) * PER_ROW}"]`);
      if (row) {
        // Measured on screen: offsetTop is relative to whatever positioned
        // ancestor the row has, which is not this scrolling view
        const offset = row.getBoundingClientRect().top - view.getBoundingClientRect().top;
        view.scrollTop += offset - view.clientHeight / 3;
      }
    }
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
