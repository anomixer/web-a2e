/*
 * joystick-window.js - Virtual joystick and paddle configuration window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

export class JoystickWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: "joystick",
      title: "Joystick",
      defaultWidth: 260,
      defaultHeight: 380,
      minWidth: 240,
      minHeight: 380,
      defaultPosition: { x: 100, y: 150 },
    });
    this.wasmModule = wasmModule;
    this.isDraggingKnob = false;
    this.knobX = 0.5; // 0-1 range, 0.5 = center
    this.knobY = 0.5;
    this.button0Pressed = false;
    this.button1Pressed = false;
    this.gamepadHandler = null;
  }

  renderContent() {
    return `
      <div class="joystick-container">
        <div class="joystick-area-wrapper">
          <span class="joystick-axis-label joystick-axis-l">L</span>
          <span class="joystick-axis-label joystick-axis-r">R</span>
          <span class="joystick-axis-label joystick-axis-u">U</span>
          <span class="joystick-axis-label joystick-axis-d">D</span>
          <div class="joystick-area">
            <div class="joystick-ring joystick-ring-75"></div>
            <div class="joystick-ring joystick-ring-50"></div>
            <div class="joystick-ring joystick-ring-25"></div>
            <div class="joystick-crosshair"></div>
            <div class="joystick-home-dot"></div>
            <div class="joystick-knob"><div class="joystick-knob-highlight"></div></div>
          </div>
        </div>
        <div class="joystick-gauges">
          <div class="joystick-gauge-row">
            <span class="joystick-gauge-label">PDL0</span>
            <div class="joystick-gauge-track joystick-gauge-x-track">
              <div class="joystick-gauge-fill joystick-gauge-x-fill"></div>
            </div>
            <span class="joystick-gauge-value joystick-x-value">128</span>
          </div>
          <div class="joystick-gauge-row">
            <span class="joystick-gauge-label">PDL1</span>
            <div class="joystick-gauge-track joystick-gauge-y-track">
              <div class="joystick-gauge-fill joystick-gauge-y-fill"></div>
            </div>
            <span class="joystick-gauge-value joystick-y-value">128</span>
          </div>
        </div>
        <div class="joystick-buttons">
          <button class="joystick-btn joystick-btn-0" data-button="0">
            <span class="joystick-btn-led"></span>
            <span class="joystick-btn-label">PB0</span>
          </button>
          <button class="joystick-btn joystick-btn-1" data-button="1">
            <span class="joystick-btn-led"></span>
            <span class="joystick-btn-label">PB1</span>
          </button>
        </div>
        <div class="joystick-center-btn-container">
          <button class="joystick-center-btn" title="Center (reset to 128,128)">&#x2316;</button>
        </div>
        <div class="gamepad-section">
          <div class="gamepad-status-row">
            <label class="gamepad-toggle-label">
              <div class="gamepad-toggle-switch">
                <input type="checkbox" class="gamepad-toggle" />
                <span class="gamepad-toggle-slider"></span>
              </div>
              <span class="gamepad-toggle-text">Gamepad</span>
            </label>
            <span class="gamepad-status"><span class="gamepad-status-dot"></span><span class="gamepad-status-text">No controller</span></span>
          </div>
          <div class="gamepad-deadzone-row">
            <span class="gamepad-deadzone-label">Deadzone</span>
            <input type="range" class="gamepad-deadzone-slider" min="0" max="50" step="1" value="10" />
            <span class="gamepad-deadzone-value">0.10</span>
          </div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    this.joystickArea = this.contentElement.querySelector(".joystick-area");
    this.knobElement = this.contentElement.querySelector(".joystick-knob");
    this.xValueSpan = this.contentElement.querySelector(".joystick-x-value");
    this.yValueSpan = this.contentElement.querySelector(".joystick-y-value");
    this.xGaugeFill = this.contentElement.querySelector(".joystick-gauge-x-fill");
    this.yGaugeFill = this.contentElement.querySelector(".joystick-gauge-y-fill");
    this.button0Element = this.contentElement.querySelector(".joystick-btn-0");
    this.button1Element = this.contentElement.querySelector(".joystick-btn-1");
    this.centerBtn = this.contentElement.querySelector(".joystick-center-btn");

    // Gamepad UI elements
    this.gamepadToggle = this.contentElement.querySelector(".gamepad-toggle");
    this.gamepadStatusText = this.contentElement.querySelector(".gamepad-status-text");
    this.gamepadStatusDot = this.contentElement.querySelector(".gamepad-status-dot");
    this.gamepadDeadzoneSlider = this.contentElement.querySelector(".gamepad-deadzone-slider");
    this.gamepadDeadzoneValue = this.contentElement.querySelector(".gamepad-deadzone-value");

    this.setupJoystickEventListeners();
    this.setupGamepadEventListeners();
    this.updateKnobPosition();
    this.updatePaddleValues();

    // Watch for resize and update knob position
    this.resizeObserver = new ResizeObserver(() => {
      this.updateKnobPosition();
    });
    this.resizeObserver.observe(this.joystickArea);
  }

  setupJoystickEventListeners() {
    // Knob dragging
    this.knobElement.addEventListener("mousedown", (e) => {
      this.isDraggingKnob = true;
      this.knobElement.classList.add("dragging");
      e.preventDefault();
      e.stopPropagation();
    });

    // Also start drag when clicking anywhere in the joystick area
    this.joystickArea.addEventListener("mousedown", (e) => {
      if (
        e.target === this.joystickArea ||
        e.target.classList.contains("joystick-crosshair") ||
        e.target.classList.contains("joystick-ring") ||
        e.target.classList.contains("joystick-home-dot")
      ) {
        this.isDraggingKnob = true;
        this.knobElement.classList.add("dragging");
        this.updateKnobFromMouse(e);
        e.preventDefault();
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (this.isDraggingKnob) {
        this.updateKnobFromMouse(e);
      }
    });

    document.addEventListener("mouseup", () => {
      if (this.isDraggingKnob) {
        this.isDraggingKnob = false;
        this.knobElement.classList.remove("dragging");
        // Snap back to center when released
        this.knobX = 0.5;
        this.knobY = 0.5;
        this.updateKnobPosition();
        this.updatePaddleValues();
      }
    });

    // Button handling with mousedown/mouseup for proper hold behavior
    this.button0Element.addEventListener("mousedown", () => {
      this.button0Pressed = true;
      this.button0Element.classList.add("pressed");
      this.wasmModule._setButton(0, true);
    });

    this.button0Element.addEventListener("mouseup", () => {
      this.button0Pressed = false;
      this.button0Element.classList.remove("pressed");
      this.wasmModule._setButton(0, false);
    });

    this.button0Element.addEventListener("mouseleave", () => {
      if (this.button0Pressed) {
        this.button0Pressed = false;
        this.button0Element.classList.remove("pressed");
        this.wasmModule._setButton(0, false);
      }
    });

    this.button1Element.addEventListener("mousedown", () => {
      this.button1Pressed = true;
      this.button1Element.classList.add("pressed");
      this.wasmModule._setButton(1, true);
    });

    this.button1Element.addEventListener("mouseup", () => {
      this.button1Pressed = false;
      this.button1Element.classList.remove("pressed");
      this.wasmModule._setButton(1, false);
    });

    this.button1Element.addEventListener("mouseleave", () => {
      if (this.button1Pressed) {
        this.button1Pressed = false;
        this.button1Element.classList.remove("pressed");
        this.wasmModule._setButton(1, false);
      }
    });

    // Center button
    this.centerBtn.addEventListener("click", () => {
      this.knobX = 0.5;
      this.knobY = 0.5;
      this.updateKnobPosition();
      this.updatePaddleValues();
    });
  }

  updateKnobFromMouse(e) {
    const rect = this.joystickArea.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) / 2;

    // Calculate offset from center
    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;

    // Clamp to circle
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > radius) {
      dx = (dx / dist) * radius;
      dy = (dy / dist) * radius;
    }

    // Convert to 0-1 range
    this.knobX = Math.max(0, Math.min(1, 0.5 + dx / (radius * 2)));
    this.knobY = Math.max(0, Math.min(1, 0.5 + dy / (radius * 2)));

    this.updateKnobPosition();
    this.updatePaddleValues();
  }

  updateKnobPosition() {
    if (!this.joystickArea || !this.knobElement) return;

    const rect = this.joystickArea.getBoundingClientRect();
    const knobSize = 28;
    const areaSize = Math.min(rect.width, rect.height);
    const radius = areaSize / 2;
    const offsetX = (rect.width - areaSize) / 2;
    const offsetY = (rect.height - areaSize) / 2;

    // Convert 0-1 to position within the circular area
    const cx = offsetX + radius + (this.knobX - 0.5) * areaSize;
    const cy = offsetY + radius + (this.knobY - 0.5) * areaSize;

    this.knobElement.style.left = `${cx - knobSize / 2}px`;
    this.knobElement.style.top = `${cy - knobSize / 2}px`;
  }

  updatePaddleValues() {
    // Convert 0-1 range to 0-255 for paddle values
    const paddleX = Math.round(this.knobX * 255);
    const paddleY = Math.round(this.knobY * 255);

    // Update display
    if (this.xValueSpan) this.xValueSpan.textContent = paddleX.toString();
    if (this.yValueSpan) this.yValueSpan.textContent = paddleY.toString();

    // Update gauge bars
    const pctX = (paddleX / 255) * 100;
    const pctY = (paddleY / 255) * 100;
    if (this.xGaugeFill) this.xGaugeFill.style.width = `${pctX}%`;
    if (this.yGaugeFill) this.yGaugeFill.style.width = `${pctY}%`;

    // Send to emulator
    if (this.wasmModule._setPaddleValue) {
      this.wasmModule._setPaddleValue(0, paddleX);
      this.wasmModule._setPaddleValue(1, paddleY);
    }
  }

  setupGamepadEventListeners() {
    if (this.gamepadToggle) {
      // Restore persisted state
      const enabled = localStorage.getItem("gamepad-enabled") !== "false";
      this.gamepadToggle.checked = enabled;

      this.gamepadToggle.addEventListener("change", () => {
        if (this.gamepadHandler) {
          this.gamepadHandler.setEnabled(this.gamepadToggle.checked);
        }
      });
    }

    if (this.gamepadDeadzoneSlider) {
      // Restore persisted deadzone
      const dz = parseFloat(localStorage.getItem("gamepad-deadzone")) || 0.1;
      this.gamepadDeadzoneSlider.value = Math.round(dz * 100);
      this.gamepadDeadzoneValue.textContent = dz.toFixed(2);

      this.gamepadDeadzoneSlider.addEventListener("input", () => {
        const value = this.gamepadDeadzoneSlider.value / 100;
        this.gamepadDeadzoneValue.textContent = value.toFixed(2);
        if (this.gamepadHandler) {
          this.gamepadHandler.setDeadzone(value);
        }
      });
    }
  }

  /**
   * Called by GamepadHandler to move the knob from external input.
   * @param {number} normX - 0..1 position
   * @param {number} normY - 0..1 position
   */
  setExternalPosition(normX, normY) {
    this.knobX = normX;
    this.knobY = normY;
    this.updateKnobPosition();

    // Update value display and gauge bars (paddle values set by GamepadHandler)
    const paddleX = Math.round(normX * 255);
    const paddleY = Math.round(normY * 255);
    if (this.xValueSpan) this.xValueSpan.textContent = paddleX.toString();
    if (this.yValueSpan) this.yValueSpan.textContent = paddleY.toString();

    const pctX = (paddleX / 255) * 100;
    const pctY = (paddleY / 255) * 100;
    if (this.xGaugeFill) this.xGaugeFill.style.width = `${pctX}%`;
    if (this.yGaugeFill) this.yGaugeFill.style.width = `${pctY}%`;
  }

  /**
   * Called by GamepadHandler to reflect physical button state in the UI.
   * @param {number} button - 0 or 1
   * @param {boolean} pressed
   */
  setExternalButton(button, pressed) {
    const el = button === 0 ? this.button0Element : this.button1Element;
    if (!el) return;
    if (pressed) {
      el.classList.add("pressed");
    } else {
      el.classList.remove("pressed");
    }
  }

  /**
   * Called by GamepadHandler when connection state changes.
   * @param {string|null} name - Controller name or null if disconnected
   * @param {boolean} enabled - Whether gamepad input is enabled
   */
  updateGamepadStatus(name, enabled) {
    if (this.gamepadStatusText) {
      this.gamepadStatusText.textContent = name
        ? name.substring(0, 30)
        : "No controller";
    }
    if (this.gamepadStatusDot) {
      this.gamepadStatusDot.classList.toggle("connected", !!name);
    }
    if (this.gamepadToggle) {
      this.gamepadToggle.checked = enabled;
    }
  }

  update(wasmModule) {
    // No periodic update needed - values are set directly on drag
  }

  getState() {
    const baseState = super.getState();
    return {
      ...baseState,
      knobX: this.knobX,
      knobY: this.knobY,
    };
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.knobX !== undefined) this.knobX = state.knobX;
    if (state.knobY !== undefined) this.knobY = state.knobY;
    // Update visuals after restoring
    if (this.knobElement) {
      this.updateKnobPosition();
      this.updatePaddleValues();
    }
  }
}
