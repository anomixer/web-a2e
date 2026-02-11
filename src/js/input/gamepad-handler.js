/*
 * gamepad-handler.js - Physical game controller support via Gamepad API
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const STORAGE_KEY_ENABLED = "gamepad-enabled";
const STORAGE_KEY_DEADZONE = "gamepad-deadzone";
const DEFAULT_DEADZONE = 0.1;

export class GamepadHandler {
  constructor(wasmModule, joystickWindow) {
    this.wasmModule = wasmModule;
    this.joystickWindow = joystickWindow;
    this.enabled = localStorage.getItem(STORAGE_KEY_ENABLED) !== "false";
    this.deadzone = parseFloat(localStorage.getItem(STORAGE_KEY_DEADZONE)) || DEFAULT_DEADZONE;
    this.gamepadIndex = null;
    this.rafId = null;

    // Track previous button state to detect edges
    this.prevButtons = [false, false];

    this._onConnected = this._onConnected.bind(this);
    this._onDisconnected = this._onDisconnected.bind(this);
    this._poll = this._poll.bind(this);

    window.addEventListener("gamepadconnected", this._onConnected);
    window.addEventListener("gamepaddisconnected", this._onDisconnected);

    // Check if a gamepad is already connected
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        this.gamepadIndex = gamepads[i].index;
        this._notifyWindow();
        if (this.enabled) {
          this._startPolling();
        }
        break;
      }
    }
  }

  _onConnected(e) {
    this.gamepadIndex = e.gamepad.index;
    this._notifyWindow();
    if (this.enabled) {
      this._startPolling();
    }
  }

  _onDisconnected(e) {
    if (this.gamepadIndex === e.gamepad.index) {
      this.gamepadIndex = null;
      this._notifyWindow();
    }
  }

  _notifyWindow() {
    if (this.joystickWindow && this.joystickWindow.updateGamepadStatus) {
      const gp = this._getGamepad();
      this.joystickWindow.updateGamepadStatus(gp ? gp.id : null, this.enabled);
    }
  }

  _getGamepad() {
    if (this.gamepadIndex === null) return null;
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    return gamepads[this.gamepadIndex] || null;
  }

  _applyDeadzone(value) {
    if (Math.abs(value) < this.deadzone) return 0;
    // Rescale so the range beyond deadzone maps to 0..1
    const sign = value > 0 ? 1 : -1;
    return sign * (Math.abs(value) - this.deadzone) / (1 - this.deadzone);
  }

  _poll() {
    const gp = this._getGamepad();
    if (!gp) {
      this.rafId = null;
      return;
    }
    if (this.enabled) {
      // Left stick axes (0 = X, 1 = Y), range -1..1
      const rawX = gp.axes[0] || 0;
      const rawY = gp.axes[1] || 0;
      const adjX = this._applyDeadzone(rawX);
      const adjY = this._applyDeadzone(rawY);

      // Map -1..1 to 0..1
      const normX = (adjX + 1) / 2;
      const normY = (adjY + 1) / 2;

      // Map to 0-255 for paddle values
      const paddleX = Math.round(normX * 255);
      const paddleY = Math.round(normY * 255);

      if (this.wasmModule._setPaddleValue) {
        this.wasmModule._setPaddleValue(0, paddleX);
        this.wasmModule._setPaddleValue(1, paddleY);
      }

      // Update the joystick window knob to reflect controller position
      if (this.joystickWindow) {
        this.joystickWindow.setExternalPosition(normX, normY);
      }

      // Buttons 0 and 1 (A/B on standard controllers)
      for (let i = 0; i < 2; i++) {
        const pressed = gp.buttons[i] ? gp.buttons[i].pressed : false;
        if (pressed !== this.prevButtons[i]) {
          this.prevButtons[i] = pressed;
          if (this.wasmModule._setButton) {
            this.wasmModule._setButton(i, pressed);
          }
          if (this.joystickWindow) {
            this.joystickWindow.setExternalButton(i, pressed);
          }
        }
      }
    }

    this.rafId = requestAnimationFrame(this._poll);
  }

  _startPolling() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(this._poll);
  }

  _stopPolling() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  start() {
    if (this.enabled && this.gamepadIndex !== null) {
      this._startPolling();
    }
  }

  stop() {
    this._stopPolling();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem(STORAGE_KEY_ENABLED, enabled);
    this._notifyWindow();
    if (enabled && this.gamepadIndex !== null) {
      this._startPolling();
    } else if (!enabled) {
      this._stopPolling();
    }
  }

  setDeadzone(value) {
    this.deadzone = Math.max(0, Math.min(0.5, value));
    localStorage.setItem(STORAGE_KEY_DEADZONE, this.deadzone);
  }

  isConnected() {
    return this._getGamepad() !== null;
  }

  destroy() {
    this.stop();
    window.removeEventListener("gamepadconnected", this._onConnected);
    window.removeEventListener("gamepaddisconnected", this._onDisconnected);
  }
}
