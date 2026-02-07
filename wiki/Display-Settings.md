# Display Settings

The Display Settings window controls all visual effects applied to the emulator screen. Open it from **View > Display** in the toolbar.

Every setting is a percentage slider (0-100%) unless otherwise noted. All settings are saved to localStorage and restored automatically on reload. Click **Reset to Defaults** at the bottom of the window to return every setting to its initial value.

---

## Table of Contents

- [CRT Effects](#crt-effects)
- [Analog Effects](#analog-effects)
- [Image Controls](#image-controls)
- [Rendering Options](#rendering-options)
- [NTSC Effects](#ntsc-effects)
- [How the Shader Pipeline Works](#how-the-shader-pipeline-works)

---

## CRT Effects

These settings simulate the physical characteristics of a cathode-ray tube monitor.

| Setting | Description |
|---------|-------------|
| **Screen Curvature** | Barrel distortion that bows the image outward, mimicking the curved glass of a CRT. At 0% the screen is perfectly flat. |
| **Screen Border** | Adds a dark border (overscan area) around the display content, simulating the bezel masking seen on real monitors. |
| **Scanlines** | Horizontal dark lines between each row of pixels. Reproduces the visible gap between phosphor rows on a real CRT. |
| **Shadow Mask** | A repeating RGB dot pattern overlaid on the image, simulating the aperture grille or shadow mask that separates red, green, and blue phosphor dots. |
| **Phosphor Glow** | Bloom effect around bright pixels. Simulates the way phosphor coating bleeds light outward on a real tube. |
| **Vignette** | Darkens the corners and edges of the screen, reproducing the natural brightness falloff at the periphery of a CRT. |
| **RGB Offset** | Chromatic aberration -- shifts the red, green, and blue colour channels slightly apart, simulating convergence errors in the electron guns. |
| **Flicker** | Random frame-to-frame brightness variation, reproducing the subtle luminance instability of analog displays. |

## Analog Effects

These settings simulate signal-path imperfections and environmental characteristics of vintage displays.

| Setting | Description |
|---------|-------------|
| **Static Noise** | Random grain overlaid on the image, like a slightly noisy video signal. |
| **Jitter** | Random per-pixel horizontal displacement, simulating timing instability in the video signal. |
| **Horizontal Sync** | Periodic horizontal distortion bands that slide across the screen, mimicking sync issues in the composite video signal. |
| **Glowing Line** | A bright horizontal scan beam that sweeps down the screen, reproducing the visible raster scan of a real CRT's electron beam. |
| **Ambient Light** | Simulates room light reflecting off the glass surface of the monitor. Adds a subtle lightening to the screen. |
| **Burn In** | Phosphor persistence -- bright areas leave a fading afterimage. The emulator maintains a separate framebuffer that accumulates and decays burn-in over time. |

## Image Controls

Basic picture adjustments that apply on top of all CRT and analog effects.

| Setting | Default | Description |
|---------|---------|-------------|
| **Brightness** | 100% | Overall luminance. Maps to a 0.5-1.5 multiplier in the shader. |
| **Contrast** | 100% | Difference between dark and light areas. Also maps to a 0.5-1.5 range. |
| **Saturation** | 100% | Colour intensity. At 0% the image is greyscale; at 200% colours are vivid. |

## Rendering Options

| Setting | Description |
|---------|-------------|
| **Display Mode** | Dropdown with four choices: **Color** (full NTSC colour), **Green** (green phosphor monochrome), **Amber** (amber phosphor), or **White** (white phosphor). Monochrome modes bypass NTSC colour artifacts and render a single-channel image tinted to match the selected phosphor colour. |
| **Sharp Pixels** | Toggle. When enabled, the WebGL texture uses nearest-neighbour filtering instead of bilinear interpolation, producing crisp pixel edges with no smoothing. When disabled (default), pixels are softly blended. |

## NTSC Effects

These shader-based effects simulate characteristics of the NTSC composite video encoding used by the Apple IIe.

| Setting | Description |
|---------|-------------|
| **Color Bleed** | Vertical inter-scanline colour blending. Simulates the way CRT phosphor rows overlap slightly, causing colour from one scanline to bleed into its neighbours. |
| **NTSC Fringing** | Colour fringing at sharp horizontal edges. Reproduces the magenta/cyan fringes caused by NTSC chroma bandwidth limiting, visible on real hardware at transitions between black and white pixels. |

## How the Shader Pipeline Works

The display passes through a multi-stage WebGL shader pipeline:

1. **Source texture** -- The C++ video renderer produces a 560x384 RGBA framebuffer (double the native 280x192 resolution). This is uploaded to a WebGL texture each frame.

2. **CRT fragment shader** (`crt.glsl`) -- Applies curvature, scanlines, shadow mask, phosphor glow, vignette, chromatic aberration, flicker, static noise, jitter, horizontal sync, glowing line, ambient light, colour bleed, NTSC fringing, monochrome tinting, screen border, and rounded corners in a single pass.

3. **Burn-in pass** (`burnin.glsl`) -- A separate framebuffer accumulates bright pixel values over time and decays them, creating the phosphor persistence effect. This texture is blended back into the main image during the CRT pass.

4. **Edge overlay pass** (`edge.glsl`) -- Draws a subtle highlight around the screen border to simulate light catching the edge of the CRT glass.

All shader parameters are set as WebGL uniforms and update in real time as you drag the sliders. An animated `time` uniform drives effects like static noise, flicker, jitter, and the glowing scan line.

Settings are stored in `localStorage` under the key `a2e-display-settings` as a JSON object. They persist across sessions and are independent of save states.
