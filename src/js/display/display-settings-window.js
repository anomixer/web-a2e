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
      minHeight: 240,
      defaultWidth: 300,
      // Sized for the collapsed window. Opening Advanced grows it to fit.
      defaultHeight: 330,
    });

    this.renderer = renderer;
    this.wasmModule = wasmModule;

    // Monitor presets. Each names a real thing a //e was plugged into, and
    // sets the whole picture in one go — the sliders underneath are the
    // advanced view of whatever the preset just chose.
    //
    // Presets deliberately do not touch brightness, contrast, saturation or the
    // bezel. Those are the user's own calibration and framing, not properties
    // of the monitor being imitated, and silently resetting them when someone
    // switches preset would be obnoxious.
    this.monitorPresets = [
      {
        id: "flat",
        label: "Pixel Exact",
        description: "No CRT simulation — sharp square pixels.",
        values: {
          curvature: 0, overscan: 0, scanlines: 0, beamBloom: 60,
          shadowMask: 0, maskType: 0, phosphorGlow: 0, vignette: 0,
          rgbOffset: 0, flicker: 0, staticNoise: 0, jitter: 0,
          horizontalSync: 0, glowingLine: 0, ambientLight: 0, burnIn: 0,
          colorBleed: 0, ntscFringing: 0, monochromeMode: 0, sharpPixels: true,
        },
      },
      {
        id: "composite",
        label: "Composite Color",
        description: "Colour TV or composite monitor — soft, with artefact fringing.",
        values: {
          curvature: 20, overscan: 0, scanlines: 30, beamBloom: 60,
          // A consumer colour set used a dot triad, not a grille.
          shadowMask: 30, maskType: 1, phosphorGlow: 15, vignette: 20,
          rgbOffset: 6, flicker: 0, staticNoise: 0, jitter: 0,
          horizontalSync: 0, glowingLine: 0, ambientLight: 0, burnIn: 10,
          colorBleed: 80, ntscFringing: 60, monochromeMode: 0, sharpPixels: false,
        },
      },
      {
        id: "rgb",
        label: "RGB Monitor",
        description: "Separate colour signals — sharp, no composite artefacts.",
        values: {
          curvature: 10, overscan: 0, scanlines: 22, beamBloom: 45,
          shadowMask: 22, maskType: 0, phosphorGlow: 8, vignette: 12,
          rgbOffset: 0, flicker: 0, staticNoise: 0, jitter: 0,
          horizontalSync: 0, glowingLine: 0, ambientLight: 0, burnIn: 5,
          // No encoding to decode, so no fringing and almost no chroma bleed.
          colorBleed: 15, ntscFringing: 0, monochromeMode: 0, sharpPixels: true,
        },
      },
      {
        id: "green",
        label: "Monochrome Green",
        description: "P1 phosphor — long persistence, no mask.",
        values: {
          curvature: 20, overscan: 0, scanlines: 32, beamBloom: 70,
          // A monochrome tube has one continuous phosphor coating and no
          // aperture at all — a mask exists only to keep three beams apart.
          shadowMask: 0, maskType: 0, phosphorGlow: 28, vignette: 25,
          rgbOffset: 0, flicker: 0, staticNoise: 0, jitter: 0,
          horizontalSync: 0, glowingLine: 0, ambientLight: 0, burnIn: 40,
          colorBleed: 25, ntscFringing: 0, monochromeMode: 1, sharpPixels: false,
        },
      },
      {
        id: "amber",
        label: "Monochrome Amber",
        description: "P3 phosphor — the warmer of the two mono tubes.",
        values: {
          curvature: 20, overscan: 0, scanlines: 32, beamBloom: 70,
          shadowMask: 0, maskType: 0, phosphorGlow: 25, vignette: 25,
          rgbOffset: 0, flicker: 0, staticNoise: 0, jitter: 0,
          horizontalSync: 0, glowingLine: 0, ambientLight: 0, burnIn: 35,
          colorBleed: 25, ntscFringing: 0, monochromeMode: 2, sharpPixels: false,
        },
      },
    ];

    // Monochrome mode options
    this.maskTypes = [
      { value: 0, label: "Aperture Grille" },
      { value: 1, label: "Shadow Mask" },
    ];

    this.monochromeModes = [
      { value: 0, label: "Color" },
      { value: 1, label: "Green" },
      { value: 2, label: "Amber" },
      { value: 3, label: "White" },
    ];

    // Default values (percentages 0-100 for UI, converted to shader values)
    // All effects off by default except basic image adjustments
    this.defaults = {
      // "flat" reproduces what this window has always shipped with — every
      // effect off — so existing users see no change until they pick a monitor.
      preset: "flat",
      curvature: 0,
      scanlines: 0,
      // Beam bloom is a property of the spot, not an effect of its own: it only
      // shows through the scanline comb, so it ships on rather than at zero.
      beamBloom: 60,
      shadowMask: 0,
      // 0 = aperture grille (stripes), 1 = shadow mask (dot triad)
      maskType: 0,
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
      // Color bleed (vertical inter-scanline blending)
      colorBleed: 0,
      // NTSC fringing (shader-based)
      ntscFringing: 0,
      // Monochrome mode (0=color, 1=green, 2=amber, 3=white)
      monochromeMode: 0,
      // Bezel
      screenInset: 0,
      bezelSpillReach: 66,
      bezelSpillIntensity: 31,
      bezelColor: "#c8b89a",
    };

    // Current values
    this.settings = { ...this.defaults };

    // Slider info for rendering. `advanced` sections live behind the
    // disclosure; Image stays visible because it is calibration, not
    // simulation, and is the thing people reach for most often.
    this.sliderConfigs = [
      {
        section: "Image",
        advanced: false,
        sliders: [
          { id: "brightness", label: "Brightness", param: "brightness" },
          { id: "contrast", label: "Contrast", param: "contrast" },
          { id: "saturation", label: "Saturation", param: "saturation" },
        ],
      },
      {
        section: "CRT Effects",
        advanced: true,
        sliders: [
          { id: "curvature", label: "Screen Curvature", param: "curvature" },
          { id: "overscan", label: "Screen Border", param: "overscan" },
          { id: "scanlines", label: "Scanlines", param: "scanlineIntensity" },
          { id: "beamBloom", label: "Beam Bloom", param: "beamBloom" },
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
        advanced: true,
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
        section: "Bezel",
        advanced: true,
        sliders: [
          { id: "screenInset", label: "Bezel Width", param: "screenInset" },
          { id: "bezelSpillReach", label: "Spill Reach", param: "bezelSpillReach" },
          { id: "bezelSpillIntensity", label: "Spill Intensity", param: "bezelSpillIntensity" },
        ],
      },
    ];
  }

  renderContent() {
    let html = '<div class="display-settings-content">';

    // Monitor preset — the primary control. Everything below it is the
    // detail of whatever this chooses.
    html += `
      <div class="settings-section">
        <div class="settings-section-title">Monitor</div>
        <select id="ds-preset" class="settings-select">
          ${this.monitorPresets
            .map(
              (p) =>
                `<option value="${p.id}" ${this.settings.preset === p.id ? "selected" : ""}>${p.label}</option>`,
            )
            .join("")}
          <option value="custom" ${this.settings.preset === "custom" ? "selected" : ""}>Custom</option>
        </select>
        <div class="preset-description" id="ds-preset-description">${this._presetDescription()}</div>
      </div>`;

    html += this._renderSliderSections(false);

    // Everything else is folded away. These are the knobs behind the preset,
    // not the everyday controls.
    html += `
      <div class="settings-section advanced-section">
        <div class="settings-section-title collapsible" id="ds-advanced-toggle">▶ Advanced</div>
        <div class="advanced-content hidden" id="ds-advanced-content">`;

    html += this._renderSliderSections(true);
    html += this._renderRenderingSection();
    html += this._renderNTSCSection();

    html += `
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

  /**
   * Description line for the currently selected preset.
   */
  _presetDescription() {
    const preset = this.monitorPresets.find((p) => p.id === this.settings.preset);
    return preset ? preset.description : "Hand-tuned settings.";
  }

  /**
   * Render the slider sections matching the requested `advanced` flag.
   */
  _renderSliderSections(advanced) {
    let html = "";

    for (const section of this.sliderConfigs) {
      if (Boolean(section.advanced) !== advanced) continue;

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

      // Add color picker to the Bezel section
      if (section.section === "Bezel") {
        html += `
          <div class="setting-row">
            <label title="Bezel Color">Bezel Color</label>
            <input type="color" id="ds-bezelColor" value="${this.settings.bezelColor}">
          </div>`;
      }

      html += "</div>";
    }

    return html;
  }

  /**
   * Rendering section: mask geometry, phosphor colour, filtering.
   */
  _renderRenderingSection() {
    return `
      <div class="settings-section">
        <div class="settings-section-title">Rendering</div>
        <div class="setting-row">
          <label>Mask Type</label>
          <select id="ds-maskType" class="settings-select">
            ${this.maskTypes
              .map(
                (t) =>
                  `<option value="${t.value}" ${this.settings.maskType === t.value ? "selected" : ""}>${t.label}</option>`,
              )
              .join("")}
          </select>
        </div>
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
  }

  /**
   * NTSC section: the composite-specific shader effects.
   */
  _renderNTSCSection() {
    return `
      <div class="settings-section">
        <div class="settings-section-title">NTSC Effects</div>
        <div class="setting-row">
          <label title="Vertical inter-scanline color blending (CRT phosphor overlap)">Color Bleed</label>
          <input type="range" id="ds-colorBleed" min="0" max="100" value="${this.settings.colorBleed}">
          <span class="setting-value" id="ds-val-colorBleed">${this.settings.colorBleed}%</span>
        </div>
        <div class="setting-row">
          <label title="NTSC color fringing at edges (magenta/cyan)">NTSC Fringing</label>
          <input type="range" id="ds-ntscFringing" min="0" max="100" value="${this.settings.ntscFringing}">
          <span class="setting-value" id="ds-val-ntscFringing">${this.settings.ntscFringing}%</span>
        </div>
      </div>`;
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
            this._markCustom(slider.id);
            this.saveSettings();
          });
        }
      }
    }

    // Bezel color picker
    const colorPicker = this.contentElement.querySelector("#ds-bezelColor");
    if (colorPicker) {
      colorPicker.addEventListener("input", (e) => {
        this.settings.bezelColor = e.target.value;
        this.applyBezelColor(e.target.value);
        this.saveSettings();
      });
    }

    // Monitor preset
    const presetSelect = this.contentElement.querySelector("#ds-preset");
    if (presetSelect) {
      presetSelect.addEventListener("change", (e) => {
        this.applyPreset(e.target.value);
      });
    }

    // Advanced disclosure
    const advToggle = this.contentElement.querySelector("#ds-advanced-toggle");
    const advContent = this.contentElement.querySelector("#ds-advanced-content");
    if (advToggle && advContent) {
      advToggle.addEventListener("click", () => {
        const hidden = advContent.classList.toggle("hidden");
        advToggle.textContent = hidden ? "\u25B6 Advanced" : "\u25BC Advanced";
        this._fitHeightToContent();
      });
    }

    // Mask type dropdown
    const maskSelect = this.contentElement.querySelector("#ds-maskType");
    if (maskSelect) {
      maskSelect.addEventListener("change", (e) => {
        const value = parseInt(e.target.value, 10);
        this.settings.maskType = value;
        this.applyToRenderer("maskType", value);
        this._markCustom("maskType");
        this.saveSettings();
      });
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
        this._markCustom("monochromeMode");
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
        this._markCustom("sharpPixels");
        this.saveSettings();
      });
    }

    // Color Bleed slider (shader-based)
    const colorBleedInput =
      this.contentElement.querySelector("#ds-colorBleed");
    const colorBleedValueSpan = this.contentElement.querySelector(
      "#ds-val-colorBleed",
    );
    if (colorBleedInput) {
      colorBleedInput.addEventListener("input", (e) => {
        const value = parseInt(e.target.value, 10);
        this.settings.colorBleed = value;
        if (colorBleedValueSpan)
          colorBleedValueSpan.textContent = `${value}%`;
        this.applyToRenderer("colorBleed", value / 100);
        this._markCustom("colorBleed");
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
        this._markCustom("ntscFringing");
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

  /**
   * Adopt a monitor preset, or "custom" to keep the current values.
   *
   * Selecting "custom" explicitly is a no-op on purpose: it is the label for
   * settings the user has already hand-tuned, so choosing it must not throw
   * that work away.
   */
  applyPreset(id) {
    this.settings.preset = id;

    const preset = this.monitorPresets.find((p) => p.id === id);
    if (preset) {
      Object.assign(this.settings, preset.values);
    }

    this.applyAllSettings();
    this.saveSettings();
  }

  /**
   * Note that a setting was changed by hand.
   *
   * Switching the label to "Custom" rather than leaving a preset selected
   * matters: a preset name that no longer describes what is on screen is worse
   * than no name at all. The values are left exactly as the user set them —
   * only the label changes.
   */
  _markCustom(changedKey) {
    const preset = this.monitorPresets.find((p) => p.id === this.settings.preset);

    // A change that does not contradict the preset — brightness, bezel — leaves
    // the preset intact, because the preset never claimed to set it.
    if (preset && !(changedKey in preset.values)) return;
    if (this.settings.preset === "custom") return;

    this.settings.preset = "custom";
    this._syncPresetUI();
  }

  /**
   * Reclaim dead space when the window opens collapsed.
   */
  show() {
    super.show();
    requestAnimationFrame(() => {
      const advContent = this.contentElement?.querySelector("#ds-advanced-content");
      if (advContent && advContent.classList.contains("hidden")) {
        this._fitHeightToContent({ shrinkOnly: true });
      }
    });
  }

  /**
   * Grow or shrink the window to fit its content.
   *
   * Called when the disclosure toggles, so collapsing does not leave a tall
   * empty box and expanding does not bury the sliders behind a scrollbar.
   * On open it is shrink-only and only while collapsed: with the disclosure
   * shut there is nothing to scroll to, so trailing empty space is pure waste,
   * but growing the window would override a size the user chose themselves.
   */
  _fitHeightToContent({ shrinkOnly = false } = {}) {
    const inner = this.contentElement?.querySelector(".display-settings-content");
    if (!this.element || !inner) return;

    const headerHeight = this.headerElement ? this.headerElement.offsetHeight : 0;
    const style = getComputedStyle(this.contentElement);
    const padding =
      parseFloat(style.paddingTop || 0) + parseFloat(style.paddingBottom || 0);

    const desired = Math.ceil(inner.scrollHeight + headerHeight + padding);
    const available = window.innerHeight - this.currentY - 12;
    let height = Math.max(this.minHeight, Math.min(desired, available));
    if (shrinkOnly) height = Math.min(height, this.currentHeight);
    if (height === this.currentHeight) return;

    this.element.style.height = `${height}px`;
    this.currentHeight = height;

    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Push the current preset id into the select and description line.
   */
  _syncPresetUI() {
    const select = this.contentElement?.querySelector("#ds-preset");
    if (select) select.value = this.settings.preset;

    const description = this.contentElement?.querySelector("#ds-preset-description");
    if (description) description.textContent = this._presetDescription();
  }

  applyBezelColor(hex) {
    if (!this.renderer) return;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    this.renderer.setParam("surroundColor", [r, g, b]);
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

    // Apply bezel color
    const colorPicker = this.contentElement.querySelector("#ds-bezelColor");
    if (colorPicker) colorPicker.value = this.settings.bezelColor;
    this.applyBezelColor(this.settings.bezelColor);

    // Apply mask type
    const maskTypeSelect = this.contentElement.querySelector("#ds-maskType");
    if (maskTypeSelect) {
      maskTypeSelect.value = this.settings.maskType;
    }
    this.applyToRenderer("maskType", this.settings.maskType);

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

    // Apply color bleed settings (shader-based)
    {
      const input = this.contentElement.querySelector("#ds-colorBleed");
      const valueSpan = this.contentElement.querySelector("#ds-val-colorBleed");
      if (input) input.value = this.settings.colorBleed;
      if (valueSpan)
        valueSpan.textContent = `${this.settings.colorBleed}%`;
      this.applyToRenderer("colorBleed", this.settings.colorBleed / 100);
    }

    // Apply NTSC fringing settings (shader-based)
    this.applyNTSCSettings();

    this._syncPresetUI();
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
