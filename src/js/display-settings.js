// Display Settings Manager for Apple //e Emulator
// Handles CRT effects via WebGL shader

export class DisplaySettings {
  constructor(renderer) {
    this.renderer = renderer;
    this.panel = null;

    // Default values (percentages 0-100 for UI, converted to shader values)
    this.defaults = {
      curvature: 0,
      scanlines: 0,
      shadowMask: 0,
      phosphorGlow: 0,
      vignette: 0,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      rgbOffset: 0,
      flicker: 0,
      // New cool-retro-term effects
      staticNoise: 0,
      jitter: 0,
      horizontalSync: 0,
      glowingLine: 0,
      ambientLight: 0,
      burnIn: 0,
      overscan: 0,
      sharpPixels: true,
    };

    // Current values
    this.settings = { ...this.defaults };

    // Slider elements
    this.sliders = {};
    this.valueDisplays = {};
  }

  init() {
    this.panel = document.getElementById("display-panel");

    // Set up panel toggle button
    const displayBtn = document.getElementById("btn-display");
    if (displayBtn) {
      displayBtn.addEventListener("click", () => this.togglePanel());
    }

    // Set up close button
    const closeBtn = document.getElementById("display-panel-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.hidePanel());
    }

    // Set up reset button
    const resetBtn = document.getElementById("display-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => this.resetToDefaults());
    }

    // Set up all sliders
    this.setupSlider("curvature", "curvature", (v) => v / 100);
    this.setupSlider("scanlines", "scanlineIntensity", (v) => v / 100);
    this.setupSlider("shadowMask", "shadowMask", (v) => v / 100);
    this.setupSlider("phosphorGlow", "glowIntensity", (v) => v / 100);
    this.setupSlider("vignette", "vignette", (v) => v / 100);
    this.setupSlider("brightness", "brightness", (v) => v / 100);
    this.setupSlider("contrast", "contrast", (v) => v / 100);
    this.setupSlider("saturation", "saturation", (v) => v / 100);
    this.setupSlider("rgbOffset", "rgbOffset", (v) => v / 100);
    this.setupSlider("flicker", "flicker", (v) => v / 100);
    // New cool-retro-term effects
    this.setupSlider("staticNoise", "staticNoise", (v) => v / 100);
    this.setupSlider("jitter", "jitter", (v) => v / 100);
    this.setupSlider("horizontalSync", "horizontalSync", (v) => v / 100);
    this.setupSlider("glowingLine", "glowingLine", (v) => v / 100);
    this.setupSlider("ambientLight", "ambientLight", (v) => v / 100);
    this.setupSlider("burnIn", "burnIn", (v) => v / 100);
    this.setupSlider("overscan", "overscan", (v) => v / 100);

    // Set up toggle for sharp pixels (nearest neighbor filtering)
    this.setupToggle("sharpPixels");

    // Load saved settings from localStorage
    this.loadSettings();

    // Apply initial settings
    this.applyAllSettings();
  }

  setupSlider(settingName, shaderParam, convertFn) {
    const slider = document.getElementById(`setting-${settingName}`);
    const valueDisplay = document.getElementById(`value-${settingName}`);

    if (slider && valueDisplay) {
      this.sliders[settingName] = { slider, shaderParam, convertFn };
      this.valueDisplays[settingName] = valueDisplay;

      slider.addEventListener("input", (e) => {
        const value = parseInt(e.target.value, 10);
        this.settings[settingName] = value;
        this.updateValueDisplay(settingName);
        this.applyToRenderer(settingName);
        this.saveSettings();
      });
    }
  }

  setupToggle(settingName) {
    const toggle = document.getElementById(`setting-${settingName}`);
    if (toggle) {
      this.toggles = this.toggles || {};
      this.toggles[settingName] = toggle;

      toggle.addEventListener("change", (e) => {
        this.settings[settingName] = e.target.checked;
        this.applyToggleToRenderer(settingName);
        this.saveSettings();
      });
    }
  }

  applyToggleToRenderer(settingName) {
    if (!this.renderer) return;

    if (settingName === "sharpPixels") {
      this.renderer.setNearestFilter(this.settings.sharpPixels);
    }
  }

  updateValueDisplay(name) {
    const value = this.settings[name];
    const display = this.valueDisplays[name];
    if (display) {
      display.textContent = `${value}%`;
    }
  }

  applyToRenderer(name) {
    if (!this.renderer) return;

    const sliderInfo = this.sliders[name];
    if (sliderInfo) {
      const shaderValue = sliderInfo.convertFn(this.settings[name]);
      this.renderer.setParam(sliderInfo.shaderParam, shaderValue);
    }
  }

  applyAllSettings() {
    // Update all slider positions and value displays
    for (const name of Object.keys(this.settings)) {
      const sliderInfo = this.sliders[name];
      if (sliderInfo && sliderInfo.slider) {
        sliderInfo.slider.value = this.settings[name];
      }
      this.updateValueDisplay(name);
      this.applyToRenderer(name);
    }

    // Update all toggles
    if (this.toggles) {
      for (const name of Object.keys(this.toggles)) {
        const toggle = this.toggles[name];
        if (toggle) {
          toggle.checked = this.settings[name];
        }
        this.applyToggleToRenderer(name);
      }
    }
  }

  resetToDefaults() {
    this.settings = { ...this.defaults };
    this.applyAllSettings();
    this.saveSettings();
  }

  saveSettings() {
    try {
      localStorage.setItem(
        "a2e-display-settings",
        JSON.stringify(this.settings),
      );
    } catch (e) {
      console.warn("Could not save display settings:", e);
    }
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem("a2e-display-settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new settings
        this.settings = { ...this.defaults, ...parsed };
      }
    } catch (e) {
      console.warn("Could not load display settings:", e);
    }
  }

  togglePanel() {
    if (this.panel) {
      this.panel.classList.toggle("hidden");
    }
  }

  showPanel() {
    if (this.panel) {
      this.panel.classList.remove("hidden");
    }
  }

  hidePanel() {
    if (this.panel) {
      this.panel.classList.add("hidden");
    }
    // Refocus canvas for keyboard input
    const canvas = document.getElementById("screen");
    if (canvas) {
      setTimeout(() => canvas.focus(), 0);
    }
  }

  isVisible() {
    return this.panel && !this.panel.classList.contains("hidden");
  }
}
