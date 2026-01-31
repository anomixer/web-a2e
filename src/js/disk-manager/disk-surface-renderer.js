// Disk Surface Renderer
// Canvas-based top-down 5.25" floppy disk visualization (no sleeve)

const CANVAS_W = 280;
const CANVAS_H = 240;
const CENTER_X = 140;
const CENTER_Y = 115;
const OUTER_RADIUS = 105;
const HUB_HOLE_RADIUS = 28;      // large center hole (~27% of disk)
const HUB_RING_INNER = 28;       // white reinforcement ring starts at hole edge
const HUB_RING_OUTER = 34;       // ring is ~6px wide
const TRACK_OUTER = OUTER_RADIUS - 3;   // outermost track position
const TRACK_INNER = HUB_RING_OUTER + 4; // innermost track position (just outside hub ring)
const NUM_TRACKS = 35;
const NUM_SECTORS = 16;
const TRACK_RANGE = TRACK_OUTER - TRACK_INNER;
const INDEX_HOLE_RADIUS = 4;
const INDEX_HOLE_DIST = (HUB_RING_INNER + HUB_RING_OUTER) / 2; // centered in hub ring
const RPM_RAD_PER_MS = Math.PI / 100; // 300 RPM
const PX_RATIO = 2; // backing store scale for sharper rendering

export class DiskSurfaceRenderer {
  constructor(canvas) {
    this.canvas = canvas;

    // Set high-res backing store; CSS sizes the element
    canvas.width = CANVAS_W * PX_RATIO;
    canvas.height = CANVAS_H * PX_RATIO;

    this.ctx = canvas.getContext('2d');
    this.ctx.scale(PX_RATIO, PX_RATIO);

    // Rotation state
    this.angle = 0;
    this.lastTimestamp = 0;
    this.motorOn = false;
    this.angularVelocity = 0;
    this.spinning = false;

    // Previous state for dirty checking
    this._prev = {};

    this._drawEmpty();
  }

  update(state) {
    const {
      hasDisk, isActive, isWriteMode, quarterTrack, track,
      trackAccessCounts, maxAccessCount, diskColor, timestamp
    } = state;

    // Rotation physics
    const dt = this.lastTimestamp > 0 ? timestamp - this.lastTimestamp : 0;
    this.lastTimestamp = timestamp;

    if (isActive && hasDisk) {
      this.motorOn = true;
      this.spinning = true;
      this.angularVelocity = RPM_RAD_PER_MS;
    } else if (this.motorOn) {
      this.motorOn = false;
      this._prev = {};
    }

    if (this.spinning && dt > 0) {
      if (!this.motorOn) {
        this.angularVelocity *= Math.pow(0.5, dt / 600);
        if (this.angularVelocity < RPM_RAD_PER_MS * 0.005) {
          this.angularVelocity = 0;
          this.spinning = false;
        }
      }
      this.angle += this.angularVelocity * dt;
    }

    if (!hasDisk) {
      if (this._prev.hasDisk !== false) {
        this._drawEmpty();
        this._prev = { hasDisk: false };
      }
      return;
    }

    if (!this.spinning) {
      if (
        this._prev.hasDisk === true &&
        this._prev.quarterTrack === quarterTrack &&
        this._prev.track === track &&
        this._prev.isActive === isActive &&
        this._prev.isWriteMode === isWriteMode &&
        this._prev.maxAccessCount === maxAccessCount &&
        this._prev.diskColor === diskColor
      ) {
        return;
      }
    }

    this._prev = {
      hasDisk: true, quarterTrack, track, isActive,
      isWriteMode, maxAccessCount, diskColor
    };

    this._drawDisk(state);
  }

  reset() {
    this.angle = 0;
    this.lastTimestamp = 0;
    this.motorOn = false;
    this.angularVelocity = 0;
    this.spinning = false;
    this._prev = {};
    this._drawEmpty();
  }

  // ---- Drawing ----

  _drawEmpty() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Ghost disk — faint outline of the platter
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, OUTER_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Ghost sector lines
    const TWO_PI = Math.PI * 2;
    ctx.save();
    ctx.translate(CENTER_X, CENTER_Y);
    for (let s = 0; s < NUM_SECTORS; s++) {
      const a = (s / NUM_SECTORS) * TWO_PI;
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * TRACK_INNER, Math.sin(a) * TRACK_INNER);
      ctx.lineTo(Math.cos(a) * TRACK_OUTER, Math.sin(a) * TRACK_OUTER);
      ctx.stroke();
    }
    ctx.restore();

    // Ghost hub ring
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_OUTER, 0, Math.PI * 2);
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_INNER, TWO_PI, 0, true);
    ctx.fillStyle = 'rgba(210,208,200,0.08)';
    ctx.fill();

    // Ghost center hole
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_HOLE_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Arm guide line (12 o'clock)
    ctx.beginPath();
    ctx.moveTo(CENTER_X, CENTER_Y - HUB_RING_OUTER);
    ctx.lineTo(CENTER_X, CENTER_Y - OUTER_RADIUS - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _drawDisk(state) {
    const {
      isActive, isWriteMode, quarterTrack,
      trackAccessCounts, maxAccessCount, diskColor
    } = state;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 1. Magnetic medium — dark brown disk
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, OUTER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1308';
    ctx.fill();

    // Subtle edge
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 2. Accessed track rings only (rotated with disk)
    ctx.save();
    ctx.translate(CENTER_X, CENTER_Y);
    ctx.rotate(this.angle);
    this._drawAccessedTracks(ctx, trackAccessCounts, maxAccessCount);

    // 3. Sector lines (rotated)
    this._drawSectorLines(ctx);
    ctx.restore();

    // 5. Head arm (static, 12 o'clock)
    this._drawHeadArm(ctx, quarterTrack);

    // 6. Head glow
    if (isActive) {
      this._drawHeadGlow(ctx, quarterTrack, isWriteMode);
    }

    // 7. Hub ring + center hole
    this._drawHub(ctx);

    // 8. Index hole — punched through the hub ring, rotates with disk
    this._drawIndexHole(ctx);
  }

  _drawAccessedTracks(ctx, trackAccessCounts, maxAccessCount) {
    if (!trackAccessCounts || maxAccessCount === 0) return;

    const logMax = Math.log(maxAccessCount + 1);

    for (let t = 0; t < NUM_TRACKS; t++) {
      const count = trackAccessCounts[t];
      if (count === 0) continue;

      // Track 0 = outermost, track 34 = innermost
      const outerR = TRACK_OUTER - (t * TRACK_RANGE / NUM_TRACKS);
      const innerR = TRACK_OUTER - ((t + 1) * TRACK_RANGE / NUM_TRACKS);

      const intensity = Math.log(count + 1) / logMax;
      const r = Math.round(40 + 215 * intensity);
      const g = Math.round(60 + 80 * intensity - 40 * intensity * intensity);
      const b = Math.round(100 - 80 * intensity);
      const a = 0.3 + 0.55 * intensity;

      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.beginPath();
      ctx.arc(0, 0, outerR - 0.5, 0, Math.PI * 2);
      ctx.arc(0, 0, innerR + 0.5, Math.PI * 2, 0, true);
      ctx.fill();
    }
  }

  _drawSectorLines(ctx) {
    const TWO_PI = Math.PI * 2;

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    for (let s = 0; s < NUM_SECTORS; s++) {
      const a = (s / NUM_SECTORS) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * TRACK_INNER, Math.sin(a) * TRACK_INNER);
      ctx.lineTo(Math.cos(a) * TRACK_OUTER, Math.sin(a) * TRACK_OUTER);
      ctx.stroke();
    }
  }

  _drawIndexHole(ctx) {
    // Red parallelogram across the hub ring, rotates with disk
    const outerR = HUB_RING_OUTER;
    const innerR = HUB_RING_INNER;
    const outerHalf = 1.5;   // shorter side (next to disk)
    const innerHalf = 2.5;   // slightly longer side (next to center hole)

    ctx.save();
    ctx.translate(CENTER_X, CENTER_Y);
    ctx.rotate(this.angle);

    ctx.beginPath();
    ctx.moveTo(outerR, -outerHalf);
    ctx.lineTo(outerR,  outerHalf);
    ctx.lineTo(innerR,  innerHalf);
    ctx.lineTo(innerR, -innerHalf);
    ctx.closePath();

    ctx.fillStyle = 'rgba(200,30,30,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,10,10,0.6)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.restore();
  }

  _drawHeadArm(ctx, quarterTrack) {
    const trackPos = quarterTrack / 4;
    const headR = TRACK_OUTER - (trackPos * TRACK_RANGE / NUM_TRACKS);

    ctx.beginPath();
    ctx.moveTo(CENTER_X, CENTER_Y - HUB_RING_OUTER - 2);
    ctx.lineTo(CENTER_X, CENTER_Y - headR - 2);
    ctx.strokeStyle = 'rgba(140,135,130,0.5)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'butt';
    ctx.stroke();

    // Head tip
    ctx.fillStyle = 'rgba(160,155,150,0.7)';
    ctx.fillRect(CENTER_X - 3, CENTER_Y - headR - 2, 6, 4);
  }

  _drawHeadGlow(ctx, quarterTrack, isWriteMode) {
    const trackPos = quarterTrack / 4;
    const headR = TRACK_OUTER - (trackPos * TRACK_RANGE / NUM_TRACKS);

    ctx.fillStyle = isWriteMode
      ? 'rgba(255,180,40,0.6)'
      : 'rgba(60,220,80,0.6)';
    ctx.fillRect(CENTER_X - 4, CENTER_Y - headR - 3, 8, 6);
  }

  _drawHub(ctx) {
    // White reinforcement hub ring
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_OUTER, 0, Math.PI * 2);
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_INNER, Math.PI * 2, 0, true);
    ctx.fillStyle = 'rgba(210,208,200,0.85)';
    ctx.fill();

    // Ring edge lines
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_OUTER, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_INNER, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Center hole — see through to background
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_HOLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#161b22';
    ctx.fill();

    // Hole edge
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  _tintColor(hex, strength) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    const br = 0x88, bg = 0x85, bb = 0x80;
    r = Math.round(r * strength + br * (1 - strength));
    g = Math.round(g * strength + bg * (1 - strength));
    b = Math.round(b * strength + bb * (1 - strength));
    return `rgb(${r},${g},${b})`;
  }
}
