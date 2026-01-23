/**
 * JoystickWindow - Virtual joystick/paddle control
 */
import { DebugWindow } from "./DebugWindow.js";

export class JoystickWindow extends DebugWindow {
  constructor(wasmModule) {
    super({
      id: "joystick",
      title: "Joystick",
      defaultWidth: 240,
      defaultHeight: 280,
      minWidth: 200,
      minHeight: 240,
      defaultPosition: { x: 100, y: 150 },
    });
    this.wasmModule = wasmModule;
    this.isDraggingKnob = false;
    this.knobX = 0.5; // 0-1 range, 0.5 = center
    this.knobY = 0.5;
    this.button0Pressed = false;
    this.button1Pressed = false;
  }

  renderContent() {
    return `
      <div class="joystick-container">
        <div class="joystick-area">
          <div class="joystick-crosshair"></div>
          <div class="joystick-knob"></div>
        </div>
        <div class="joystick-values">
          <div class="joystick-value-row">
            <span class="joystick-label">X:</span>
            <span class="joystick-value joystick-x-value">128</span>
          </div>
          <div class="joystick-value-row">
            <span class="joystick-label">Y:</span>
            <span class="joystick-value joystick-y-value">128</span>
          </div>
        </div>
        <div class="joystick-buttons">
          <button class="joystick-btn joystick-btn-0" data-button="0">Button 0</button>
          <button class="joystick-btn joystick-btn-1" data-button="1">Button 1</button>
        </div>
        <div class="joystick-center-btn-container">
          <button class="joystick-center-btn">Center</button>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    this.joystickArea = this.contentElement.querySelector(".joystick-area");
    this.knobElement = this.contentElement.querySelector(".joystick-knob");
    this.xValueSpan = this.contentElement.querySelector(".joystick-x-value");
    this.yValueSpan = this.contentElement.querySelector(".joystick-y-value");
    this.button0Element = this.contentElement.querySelector(".joystick-btn-0");
    this.button1Element = this.contentElement.querySelector(".joystick-btn-1");
    this.centerBtn = this.contentElement.querySelector(".joystick-center-btn");

    this.setupJoystickEventListeners();
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
      e.preventDefault();
      e.stopPropagation();
    });

    // Also start drag when clicking anywhere in the joystick area
    this.joystickArea.addEventListener("mousedown", (e) => {
      if (e.target === this.joystickArea || e.target.classList.contains("joystick-crosshair")) {
        this.isDraggingKnob = true;
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
      this.isDraggingKnob = false;
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
    const knobRadius = 12; // Half of knob size
    const padding = 4;

    // Calculate position within the area, accounting for knob radius
    let x = (e.clientX - rect.left - knobRadius) / (rect.width - knobRadius * 2);
    let y = (e.clientY - rect.top - knobRadius) / (rect.height - knobRadius * 2);

    // Clamp to 0-1 range
    this.knobX = Math.max(0, Math.min(1, x));
    this.knobY = Math.max(0, Math.min(1, y));

    this.updateKnobPosition();
    this.updatePaddleValues();
  }

  updateKnobPosition() {
    if (!this.joystickArea || !this.knobElement) return;

    const rect = this.joystickArea.getBoundingClientRect();
    const knobSize = 24;

    // Position knob within the area
    const maxX = rect.width - knobSize;
    const maxY = rect.height - knobSize;

    const left = this.knobX * maxX;
    const top = this.knobY * maxY;

    this.knobElement.style.left = `${left}px`;
    this.knobElement.style.top = `${top}px`;
  }

  updatePaddleValues() {
    // Convert 0-1 range to 0-255 for paddle values
    const paddleX = Math.round(this.knobX * 255);
    const paddleY = Math.round(this.knobY * 255);

    // Update display
    if (this.xValueSpan) this.xValueSpan.textContent = paddleX.toString();
    if (this.yValueSpan) this.yValueSpan.textContent = paddleY.toString();

    // Send to emulator
    if (this.wasmModule._setPaddleValue) {
      this.wasmModule._setPaddleValue(0, paddleX);
      this.wasmModule._setPaddleValue(1, paddleY);
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
