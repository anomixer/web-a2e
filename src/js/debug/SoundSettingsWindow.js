import { DebugWindow } from "./DebugWindow.js";

/**
 * SoundSettingsWindow - Disk drive sound effect tuning
 */
export class SoundSettingsWindow extends DebugWindow {
  constructor(diskManager) {
    super({
      id: "sound-settings",
      title: "Sound Settings",
      minWidth: 240,
      minHeight: 300,
      defaultWidth: 280,
      defaultHeight: 520,
      defaultPosition: { x: 340, y: 60 },
    });

    this.diskManager = diskManager;
    this.storageKey = "a2e-sound-settings";

    // Default values
    this.defaults = {
      // Enable toggles
      seekEnabled: true,
      motorEnabled: true,
      // Seek sound
      seekVolume: 30,
      seekPrimaryFreq: 2200,
      seekSecondaryFreq: 3800,
      seekBodyFreq: 1200,
      seekDecay: 350,
      seekClickDecay: 1200,
      // Motor sound
      motorVolume: 15,
      motorFreq: 55,
      motorFilterFreq: 129,
      // Mechanical whir
      whirFreq: 499,
      whirQ: 150,
      // Swish
      swishFreq: 1917,
      swishLFOFreq: 269, // Displayed as 2.69 Hz (value / 100)
      swishQ: 237,
    };

    // Current values - load from storage or use defaults
    this.settings = this.loadSettings();

    // Slider configs - grouped more compactly
    this.sliderConfigs = [
      {
        section: "Seek (Stepper)",
        sliders: [
          { id: "seekVolume", label: "Vol", min: 0, max: 100, unit: "%" },
          { id: "seekPrimaryFreq", label: "Freq 1", min: 500, max: 5000, unit: "Hz" },
          { id: "seekSecondaryFreq", label: "Freq 2", min: 1000, max: 8000, unit: "Hz" },
          { id: "seekBodyFreq", label: "Body", min: 200, max: 3000, unit: "Hz" },
          { id: "seekDecay", label: "Decay", min: 50, max: 800, unit: "" },
          { id: "seekClickDecay", label: "Click", min: 200, max: 3000, unit: "" },
        ],
      },
      {
        section: "Motor",
        sliders: [
          { id: "motorVolume", label: "Vol", min: 0, max: 50, unit: "%" },
          { id: "motorFreq", label: "Freq", min: 20, max: 120, unit: "Hz" },
          { id: "motorFilterFreq", label: "Filter", min: 50, max: 500, unit: "Hz" },
        ],
      },
      {
        section: "Whir",
        sliders: [
          { id: "whirFreq", label: "Freq", min: 200, max: 2000, unit: "Hz" },
          { id: "whirQ", label: "Q", min: 50, max: 500, unit: "/100" },
        ],
      },
      {
        section: "Swish",
        sliders: [
          { id: "swishFreq", label: "Freq", min: 500, max: 5000, unit: "Hz" },
          { id: "swishLFOFreq", label: "LFO", min: 100, max: 1000, unit: "/100" },
          { id: "swishQ", label: "Q", min: 20, max: 300, unit: "/100" },
        ],
      },
    ];
  }

  renderContent() {
    // Compact inline styles for this window
    const styles = `
      <style>
        .ss-content { font-size: 11px; }
        .ss-toggles { padding: 8px; background: var(--color-surface); position: sticky; top: 0; z-index: 1; border-bottom: 1px solid var(--color-border); }
        .ss-toggle-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .ss-toggle-row:last-child { margin-bottom: 0; }
        .ss-toggle-label { font-size: 11px; font-weight: 500; }
        .ss-toggle { position: relative; width: 36px; height: 20px; }
        .ss-toggle input { opacity: 0; width: 0; height: 0; }
        .ss-toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--color-border); border-radius: 10px; transition: 0.2s; }
        .ss-toggle-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; border-radius: 50%; transition: 0.2s; }
        .ss-toggle input:checked + .ss-toggle-slider { background-color: var(--color-accent, #4a9eff); }
        .ss-toggle input:checked + .ss-toggle-slider:before { transform: translateX(16px); }
        .ss-buttons { display: flex; gap: 4px; margin-bottom: 8px; padding: 6px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
        .ss-buttons button { flex: 1; padding: 4px 8px; font-size: 10px; }
        .ss-section { margin-bottom: 2px; }
        .ss-title { font-weight: 600; font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; padding: 1px 0; border-bottom: 1px solid var(--color-border); }
        .ss-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 8px; }
        .ss-item { display: flex; flex-direction: column; gap: 1px; }
        .ss-label { display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text-secondary); }
        .ss-val { font-family: var(--font-mono); color: var(--color-text); }
        .ss-item input[type="range"] { width: 100%; height: 14px; margin: 0; }
        .ss-reset { margin-top: 8px; text-align: center; }
        .ss-reset button { font-size: 10px; padding: 4px 12px; }
        .ss-section.disabled { opacity: 0.5; pointer-events: none; }
      </style>
    `;

    let html = styles + '<div class="ss-content">';

    // Enable/disable toggles at top (sticky)
    html += `
      <div class="ss-toggles">
        <div class="ss-toggle-row">
          <span class="ss-toggle-label">Seek Sound</span>
          <label class="ss-toggle">
            <input type="checkbox" id="ss-seek-enabled" ${this.settings.seekEnabled ? "checked" : ""}>
            <span class="ss-toggle-slider"></span>
          </label>
        </div>
        <div class="ss-toggle-row">
          <span class="ss-toggle-label">Motor Sound</span>
          <label class="ss-toggle">
            <input type="checkbox" id="ss-motor-enabled" ${this.settings.motorEnabled ? "checked" : ""}>
            <span class="ss-toggle-slider"></span>
          </label>
        </div>
      </div>`;

    // Test buttons
    html += `
      <div class="ss-buttons">
        <button id="ss-test-seek" class="settings-btn">Seek</button>
        <button id="ss-test-motor-start" class="settings-btn">Motor On</button>
        <button id="ss-test-motor-stop" class="settings-btn">Motor Off</button>
      </div>`;

    for (const section of this.sliderConfigs) {
      html += `<div class="ss-section">
        <div class="ss-title">${section.section}</div>
        <div class="ss-grid">`;

      for (const slider of section.sliders) {
        const value = this.settings[slider.id];
        const displayValue = this.formatValue(slider, value);
        html += `
          <div class="ss-item">
            <div class="ss-label">
              <span>${slider.label}</span>
              <span class="ss-val" id="ss-val-${slider.id}">${displayValue}</span>
            </div>
            <input type="range" id="ss-${slider.id}" min="${slider.min}" max="${slider.max}" value="${value}">
          </div>`;
      }

      html += "</div></div>";
    }

    // Reset button
    html += `
      <div class="ss-reset">
        <button id="ss-reset" class="settings-btn">Reset</button>
      </div>`;

    html += "</div>";
    return html;
  }

  formatValue(slider, value) {
    if (slider.unit === "/100") {
      return (value / 100).toFixed(2);
    }
    return `${value}${slider.unit}`;
  }

  setupContentEventListeners() {
    // Set up toggle listeners
    const seekEnabledToggle = this.contentElement.querySelector("#ss-seek-enabled");
    if (seekEnabledToggle) {
      seekEnabledToggle.addEventListener("change", (e) => {
        this.settings.seekEnabled = e.target.checked;
        this.applySettings();
        this.saveSettings();
      });
    }

    const motorEnabledToggle = this.contentElement.querySelector("#ss-motor-enabled");
    if (motorEnabledToggle) {
      motorEnabledToggle.addEventListener("change", (e) => {
        this.settings.motorEnabled = e.target.checked;
        this.applySettings();
        this.saveSettings();
      });
    }

    // Set up slider listeners
    for (const section of this.sliderConfigs) {
      for (const slider of section.sliders) {
        const input = this.contentElement.querySelector(`#ss-${slider.id}`);
        const valueSpan = this.contentElement.querySelector(`#ss-val-${slider.id}`);

        if (input) {
          input.addEventListener("input", (e) => {
            const value = parseInt(e.target.value, 10);
            this.settings[slider.id] = value;
            if (valueSpan) valueSpan.textContent = this.formatValue(slider, value);
            this.applySettings();
            this.saveSettings();
          });
        }
      }
    }

    // Test buttons
    const testSeekBtn = this.contentElement.querySelector("#ss-test-seek");
    if (testSeekBtn) {
      testSeekBtn.addEventListener("click", () => {
        if (this.diskManager) {
          // Temporarily enable for test
          const wasEnabled = this.diskManager.seekSoundEnabled;
          this.diskManager.seekSoundEnabled = true;
          this.diskManager.playSeekSound();
          this.diskManager.seekSoundEnabled = wasEnabled;
        }
      });
    }

    const testMotorStartBtn = this.contentElement.querySelector("#ss-test-motor-start");
    if (testMotorStartBtn) {
      testMotorStartBtn.addEventListener("click", () => {
        if (this.diskManager) {
          // Temporarily enable for test
          const wasEnabled = this.diskManager.motorSoundEnabled;
          this.diskManager.motorSoundEnabled = true;
          this.diskManager.stopMotorSound();
          this.diskManager.motorRunning = false;
          this.diskManager.startMotorSound();
          this.diskManager.motorSoundEnabled = wasEnabled;
        }
      });
    }

    const testMotorStopBtn = this.contentElement.querySelector("#ss-test-motor-stop");
    if (testMotorStopBtn) {
      testMotorStopBtn.addEventListener("click", () => {
        if (this.diskManager) {
          this.diskManager.stopMotorSound();
        }
      });
    }

    // Reset button
    const resetBtn = this.contentElement.querySelector("#ss-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => this.resetToDefaults());
    }
  }

  create() {
    super.create();
    this.setupContentEventListeners();
    this.applySettings();
  }

  applySettings() {
    if (!this.diskManager) return;

    // Apply enabled/disabled state
    this.diskManager.setSeekSoundEnabled(this.settings.seekEnabled);
    this.diskManager.setMotorSoundEnabled(this.settings.motorEnabled);

    // Apply seek sound settings
    this.diskManager.seekVolume = this.settings.seekVolume / 100;
    this.diskManager.seekPrimaryFreq = this.settings.seekPrimaryFreq;
    this.diskManager.seekSecondaryFreq = this.settings.seekSecondaryFreq;
    this.diskManager.seekBodyFreq = this.settings.seekBodyFreq;
    this.diskManager.seekDecay = this.settings.seekDecay;
    this.diskManager.seekClickDecay = this.settings.seekClickDecay;

    // Apply motor sound settings
    this.diskManager.motorVolume = this.settings.motorVolume / 100;
    this.diskManager.motorFreq = this.settings.motorFreq;
    this.diskManager.motorFilterFreq = this.settings.motorFilterFreq;
    this.diskManager.whirFreq = this.settings.whirFreq;
    this.diskManager.whirQ = this.settings.whirQ / 100;
    this.diskManager.swishFreq = this.settings.swishFreq;
    this.diskManager.swishLFOFreq = this.settings.swishLFOFreq / 100;
    this.diskManager.swishQ = this.settings.swishQ / 100;

    // Update live motor sound if running
    if (this.diskManager.motorRunning) {
      this.diskManager.updateMotorSoundParams();
    }
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle any new settings
        return { ...this.defaults, ...parsed };
      }
    } catch (e) {
      console.warn("Failed to load sound settings:", e);
    }
    return { ...this.defaults };
  }

  saveSettings() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch (e) {
      console.warn("Failed to save sound settings:", e);
    }
  }

  resetToDefaults() {
    this.settings = { ...this.defaults };
    this.updateAllControls();
    this.applySettings();
    this.saveSettings();
  }

  updateAllControls() {
    // Update toggles
    const seekEnabledToggle = this.contentElement.querySelector("#ss-seek-enabled");
    if (seekEnabledToggle) {
      seekEnabledToggle.checked = this.settings.seekEnabled;
    }

    const motorEnabledToggle = this.contentElement.querySelector("#ss-motor-enabled");
    if (motorEnabledToggle) {
      motorEnabledToggle.checked = this.settings.motorEnabled;
    }

    // Update sliders
    for (const section of this.sliderConfigs) {
      for (const slider of section.sliders) {
        const input = this.contentElement.querySelector(`#ss-${slider.id}`);
        const valueSpan = this.contentElement.querySelector(`#ss-val-${slider.id}`);

        if (input) {
          input.value = this.settings[slider.id];
        }
        if (valueSpan) {
          valueSpan.textContent = this.formatValue(slider, this.settings[slider.id]);
        }
      }
    }
  }

  // Keep for backwards compatibility
  updateAllSliders() {
    this.updateAllControls();
  }

  update() {
    // No dynamic updates needed
  }
}
