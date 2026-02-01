/**
 * MouseHandler - Browser mouse capture for Apple Mouse Interface Card
 *
 * Uses the Pointer Lock API to capture mouse movement and send deltas
 * to the WASM emulator. Click on the canvas to engage pointer lock;
 * press Escape to release it (browser default behavior).
 */
export class MouseHandler {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.canvas = null;
    this.enabled = false;
    this.locked = false;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onCanvasClick = this._onCanvasClick.bind(this);
  }

  init() {
    this.canvas = document.getElementById("screen");
    if (!this.canvas) return;

    document.addEventListener("pointerlockchange", this._onPointerLockChange);

    this.canvas.addEventListener("click", this._onCanvasClick);
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    if (this.locked) {
      document.exitPointerLock();
    }
  }

  _onCanvasClick(event) {
    if (!this.enabled || this.locked) return;
    if (!event.altKey) return;
    this.canvas.requestPointerLock();
  }

  _onPointerLockChange() {
    if (document.pointerLockElement === this.canvas) {
      this.locked = true;
      document.addEventListener("mousemove", this._onMouseMove);
      document.addEventListener("mousedown", this._onMouseDown);
      document.addEventListener("mouseup", this._onMouseUp);
    } else {
      this.locked = false;
      document.removeEventListener("mousemove", this._onMouseMove);
      document.removeEventListener("mousedown", this._onMouseDown);
      document.removeEventListener("mouseup", this._onMouseUp);
    }
  }

  _onMouseMove(event) {
    if (!this.enabled || !this.locked) return;
    const dx = event.movementX;
    const dy = event.movementY;
    if (dx !== 0 || dy !== 0) {
      this.wasmModule._mouseMove(dx, dy);
    }
  }

  _onMouseDown(event) {
    if (!this.enabled || !this.locked) return;
    if (event.button === 0) {
      this.wasmModule._mouseButton(1);
    }
  }

  _onMouseUp(event) {
    if (!this.enabled || !this.locked) return;
    if (event.button === 0) {
      this.wasmModule._mouseButton(0);
    }
  }

  destroy() {
    this.disable();
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    if (this.canvas) {
      this.canvas.removeEventListener("click", this._onCanvasClick);
    }
  }
}
