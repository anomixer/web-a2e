/*
 * display-settings-window.js - Display settings window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

/**
 * DisplaySettingsWindow - CRT display effects and settings
 */
export class DisplaySettingsWindow extends BaseWindow {
  constructor(renderer, wasmModule) {
    super({
      id: "display-settings",
      title: "Display Settings",
      minWidth: 260,
      minHeight: 300,
      defaultWidth: 300,
      defaultHeight: 500,
      defaultPosition: { x: 20, y: 60 },
    });

    this.renderer = renderer;
    this.wasmModule = wasmModule;

    // Monochrome mode options
    this.monochromeModes = [
      { value: 0, label: "Color" },
      { value: 1, label: "Green" },
      { value: 2, label: "Amber" },
      { value: 3, label: "White" },
    ];

    // Default values (percentages 0-100 for UI, converted to shader values)
    this.defaults = {
      curvature: 20,
      scanlines: 20,
      shadowMask: 100,
      phosphorGlow: 0,
      vignette: 0,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      rgbOffset: 0,
      flicker: 0,
      staticNoise: 0,
      jitter: 0,
      horizontalSync: 0,
      glowingLine: 0,
      ambientLight: 0,
      burnIn: 0,
      overscan: 0,
      sharpPixels: false,
      // NTSC fringing (shader-based)
      ntscFringing: 50,
      // Monochrome mode (0=color, 1=green, 2=amber, 3=white)
      monochromeMode: 0,
    };

    // Current values
    this.settings = { ...this.defaults };

    // Slider info for rendering
    this.sliderConfigs = [
      {
        section: "CRT Effects",
        sliders: [
          { id: "curvature", label: "Screen Curvature", param: "curvature" },
          { id: "overscan", label: "Screen Border", param: "overscan" },
          { id: "scanlines", label: "Scanlines", param: "scanlineIntensity" },
          { id: "shadowMask", label: "Shadow Mask", param: "shadowMask" },
          {
            id: "phosphorGlow",
            label: "Phosphor Glow",
            param: "glowIntensity",
          },
          { id: "vignette", label: "Vignette", param: "vignette" },
          { id: "rgbOffset", label: "RGB Offset", param: "rgbOffset" },
          { id: "flicker", label: "Flicker", param: "flicker" },
        ],
      },
      {
        section: "Analog Effects",
        sliders: [
          { id: "staticNoise", label: "Static Noise", param: "staticNoise" },
          { id: "jitter", label: "Jitter", param: "jitter" },
          {
            id: "horizontalSync",
            label: "Horizontal Sync",
            param: "horizontalSync",
          },
          { id: "glowingLine", label: "Glowing Line", param: "glowingLine" },
          { id: "ambientLight", label: "Ambient Light", param: "ambientLight" },
          { id: "burnIn", label: "Burn In", param: "burnIn" },
        ],
      },
      {
        section: "Image",
        sliders: [
          { id: "brightness", label: "Brightness", param: "brightness" },
          { id: "contrast", label: "Contrast", param: "contrast" },
          { id: "saturation", label: "Saturation", param: "saturation" },
        ],
      },
    ];
  }

  renderContent() {
    let html = '<div class="display-settings-content">';

    for (const section of this.sliderConfigs) {
      html += `<div class="settings-section">
        <div class="settings-section-title">${section.section}</div>`;

      for (const slider of section.sliders) {
        html += `
          <div class="setting-row">
            <label title="${slider.label}">${slider.label}</label>
            <input type="range" id="ds-${slider.id}" min="0" max="100" value="${this.settings[slider.id]}">
            <span class="setting-value" id="ds-val-${slider.id}">${this.settings[slider.id]}%</span>
          </div>`;
      }

      html += "</div>";
    }

    // Rendering section with monochrome mode and sharp pixels
    html += `
      <div class="settings-section">
        <div class="settings-section-title">Rendering</div>
        <div class="setting-row">
          <label>Display Mode</label>
          <select id="ds-monochromeMode" class="settings-select">
            ${this.monochromeModes
              .map(
                (mode) =>
                  `<option value="${mode.value}" ${this.settings.monochromeMode === mode.value ? "selected" : ""}>${mode.label}</option>`,
              )
              .join("")}
          </select>
        </div>
        <div class="setting-row toggle-row">
          <label>Sharp Pixels</label>
          <label class="toggle">
            <input type="checkbox" id="ds-sharpPixels" ${this.settings.sharpPixels ? "checked" : ""}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>`;

    // NTSC Fringing slider (shader-based)
    html += `
      <div class="settings-section">
        <div class="settings-section-title">NTSC Effects</div>
        <div class="setting-row">
          <label title="NTSC color fringing at edges (magenta/cyan)">NTSC Fringing</label>
          <input type="range" id="ds-ntscFringing" min="0" max="100" value="${this.settings.ntscFringing}">
          <span class="setting-value" id="ds-val-ntscFringing">${this.settings.ntscFringing}%</span>
        </div>
      </div>`;

    // Reset button
    html += `
      <div class="settings-actions">
        <button id="ds-reset" class="settings-btn">Reset to Defaults</button>
      </div>`;

    html += "</div>";
    return html;
  }

  setupContentEventListeners() {
    // Set up slider listeners
    for (const section of this.sliderConfigs) {
      for (const slider of section.sliders) {
        const input = this.contentElement.querySelector(`#ds-${slider.id}`);
        const valueSpan = this.contentElement.querySelector(
          `#ds-val-${slider.id}`,
        );

        if (input) {
          input.addEventListener("input", (e) => {
            const value = parseInt(e.target.value, 10);
            this.settings[slider.id] = value;
            if (valueSpan) valueSpan.textContent = `${value}%`;
            this.applyToRenderer(slider.param, value / 100);
            this.saveSettings();
          });
        }
      }
    }

    // Monochrome mode dropdown
    const monochromeSelect =
      this.contentElement.querySelector("#ds-monochromeMode");
    if (monochromeSelect) {
      monochromeSelect.addEventListener("change", (e) => {
        const value = parseInt(e.target.value, 10);
        this.settings.monochromeMode = value;
        // Tell emulator core to use monochrome rendering (bypasses NTSC artifacts)
        if (this.wasmModule && this.wasmModule._setMonochrome) {
          this.wasmModule._setMonochrome(value !== 0);
        }
        // Tell shader which phosphor color to use
        this.applyToRenderer("monochromeMode", value);
        this.saveSettings();
      });
    }

    // Sharp pixels toggle
    const sharpToggle = this.contentElement.querySelector("#ds-sharpPixels");
    if (sharpToggle) {
      sharpToggle.addEventListener("change", (e) => {
        this.settings.sharpPixels = e.target.checked;
        if (this.renderer) {
          this.renderer.setNearestFilter(this.settings.sharpPixels);
        }
        this.saveSettings();
      });
    }

    // NTSC Fringing slider (shader-based)
    const ntscInput = this.contentElement.querySelector("#ds-ntscFringing");
    const ntscValueSpan = this.contentElement.querySelector(
      "#ds-val-ntscFringing",
    );
    if (ntscInput) {
      ntscInput.addEventListener("input", (e) => {
        const value = parseInt(e.target.value, 10);
        this.settings.ntscFringing = value;
        if (ntscValueSpan) ntscValueSpan.textContent = `${value}%`;
        this.applyToRenderer("ntscFringing", value / 100);
        this.saveSettings();
      });
    }

    // Reset button
    const resetBtn = this.contentElement.querySelector("#ds-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => this.resetToDefaults());
    }
  }

  create() {
    super.create();
    this.loadSettings();
    this.setupContentEventListeners();
    // applyAllSettings() is called by main.js after initialization
  }

  applyToRenderer(param, value) {
    if (this.renderer) {
      this.renderer.setParam(param, value);
    }
  }

  applyNTSCSettings() {
    const input = this.contentElement.querySelector("#ds-ntscFringing");
    const valueSpan = this.contentElement.querySelector("#ds-val-ntscFringing");

    if (input) {
      input.value = this.settings.ntscFringing;
    }
    if (valueSpan) {
      valueSpan.textContent = `${this.settings.ntscFringing}%`;
    }
    this.applyToRenderer("ntscFringing", this.settings.ntscFringing / 100);
  }

  applyAllSettings() {
    // Apply all slider values to renderer and update UI
    for (const section of this.sliderConfigs) {
      for (const slider of section.sliders) {
        const input = this.contentElement.querySelector(`#ds-${slider.id}`);
        const valueSpan = this.contentElement.querySelector(
          `#ds-val-${slider.id}`,
        );

        if (input) {
          input.value = this.settings[slider.id];
        }
        if (valueSpan) {
          valueSpan.textContent = `${this.settings[slider.id]}%`;
        }
        this.applyToRenderer(slider.param, this.settings[slider.id] / 100);
      }
    }

    // Apply monochrome mode
    const monochromeSelect =
      this.contentElement.querySelector("#ds-monochromeMode");
    if (monochromeSelect) {
      monochromeSelect.value = this.settings.monochromeMode;
    }
    // Tell emulator core to use monochrome rendering (bypasses NTSC artifacts)
    if (this.wasmModule && this.wasmModule._setMonochrome) {
      this.wasmModule._setMonochrome(this.settings.monochromeMode !== 0);
    }
    // Tell shader which phosphor color to use
    this.applyToRenderer("monochromeMode", this.settings.monochromeMode);

    // Apply sharp pixels
    const sharpToggle = this.contentElement.querySelector("#ds-sharpPixels");
    if (sharpToggle) {
      sharpToggle.checked = this.settings.sharpPixels;
    }
    if (this.renderer) {
      this.renderer.setNearestFilter(this.settings.sharpPixels);
    }

    // Apply NTSC fringing settings (shader-based)
    this.applyNTSCSettings();
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
        this.settings = { ...this.defaults, ...parsed };
      }
    } catch (e) {
      console.warn("Could not load display settings:", e);
    }
  }

  update() {
    // No dynamic updates needed for display settings
  }
}
