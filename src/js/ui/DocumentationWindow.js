/**
 * DocumentationWindow - Moveable help & documentation window
 * Extends BaseWindow for drag/resize functionality
 */

import { BaseWindow } from "./BaseWindow.js";

export class DocumentationWindow extends BaseWindow {
  constructor() {
    super({
      id: "documentation-window",
      title: "Help & Documentation",
      minWidth: 500,
      minHeight: 400,
      defaultWidth: 750,
      defaultHeight: 550,
      defaultPosition: { x: 80, y: 40 },
    });

    this.navButtons = null;
    this.sections = null;
  }

  /**
   * Override to add custom class for documentation styling
   */
  create() {
    super.create();
    this.element.classList.add("documentation-window");

    // Set up F1 keyboard shortcut
    document.addEventListener("keydown", (e) => {
      if (e.key === "F1") {
        e.preventDefault();
        this.toggle();
      }
    });

    // Set up help button
    const helpButton = document.getElementById("btn-help");
    if (helpButton) {
      helpButton.addEventListener("click", () => this.toggle());
    }
  }

  /**
   * Render the documentation content
   */
  renderContent() {
    return `
      <div class="documentation-layout">
        <nav class="documentation-nav">
          <button data-section="getting-started" class="active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Getting Started
          </button>
          <button data-section="install">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Install App
          </button>
          <button data-section="keyboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <line x1="6" y1="8" x2="6.01" y2="8"/>
              <line x1="10" y1="8" x2="10.01" y2="8"/>
              <line x1="14" y1="8" x2="14.01" y2="8"/>
              <line x1="18" y1="8" x2="18.01" y2="8"/>
              <line x1="8" y1="12" x2="8.01" y2="12"/>
              <line x1="12" y1="12" x2="12.01" y2="12"/>
              <line x1="16" y1="12" x2="16.01" y2="12"/>
              <line x1="7" y1="16" x2="17" y2="16"/>
            </svg>
            Keyboard
          </button>
          <button data-section="display">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            Display
          </button>
          <button data-section="disks">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="6" width="20" height="12" rx="2"/>
              <rect x="5" y="9" width="10" height="1.5" rx="0.5"/>
              <circle cx="18" cy="12" r="1.5"/>
            </svg>
            Disk Drives
          </button>
          <button data-section="file-explorer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            File Explorer
          </button>
          <button data-section="state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            State
          </button>
          <button data-section="sound">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
            Sound
          </button>
          <button data-section="debug">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v2M12 16v2M6 12h2M16 12h2"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Debug Tools
          </button>
          <button data-section="tips">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            Tips
          </button>
        </nav>
        <div class="documentation-body">
          ${this.renderSections()}
        </div>
      </div>
    `;
  }

  /**
   * Render all documentation sections
   */
  renderSections() {
    return `
      <!-- Getting Started Section -->
      <section id="doc-getting-started" class="documentation-section active">
        <h3>Getting Started</h3>
        <p>Welcome to the Apple //e Emulator! This web-based emulator faithfully recreates the Apple //e Enhanced computer from 1983, allowing you to run classic Apple II software directly in your browser.</p>

        <h4>Quick Start</h4>
        <ol class="quick-start-list">
          <li>Click the <strong>Power</strong> button to turn on the emulator</li>
          <li>Click on the screen to give it keyboard focus</li>
          <li>Insert a disk image using the <strong>Insert</strong> button on either drive</li>
          <li>Type <kbd>PR#6</kbd> and press <kbd>Return</kbd> to boot from drive 1</li>
        </ol>

        <h4>What is the Apple //e?</h4>
        <p>The Apple //e (Enhanced) was Apple's most popular Apple II model, released in 1983. It featured 128KB of RAM with auxiliary memory, 80-column text display, double hi-res graphics (560x192), and ran thousands of educational, productivity, and entertainment programs.</p>

        <h4>Emulated Hardware</h4>
        <ul>
          <li><strong>CPU:</strong> 65C02 processor at 1.023 MHz (cycle-accurate)</li>
          <li><strong>Memory:</strong> 128KB RAM (64KB main + 64KB auxiliary)</li>
          <li><strong>Video:</strong> All Apple //e display modes including Double Hi-Res</li>
          <li><strong>Storage:</strong> Two Disk II floppy drives</li>
          <li><strong>Audio:</strong> Speaker with accurate timing</li>
          <li><strong>ROM:</strong> Apple //e Enhanced ROM set</li>
        </ul>

        <div class="info-box tip">
          <p><strong>Tip:</strong> Press <kbd>F1</kbd> at any time to open this help window. All windows can be moved and resized.</p>
        </div>
      </section>

      <!-- Install App Section -->
      <section id="doc-install" class="documentation-section">
        <h3>Install as App</h3>
        <p>This emulator is a Progressive Web App (PWA) that can be installed on your device for offline use and a native app-like experience.</p>

        <h4>Chrome / Edge (Desktop)</h4>
        <ol class="quick-start-list">
          <li>Click the <strong>install icon</strong> in the address bar (right side)</li>
          <li>Or click the <strong>three dots menu</strong> (⋮) and select "Install Apple //e Emulator"</li>
          <li>Click <strong>Install</strong> in the dialog</li>
          <li>The app will open in its own window and appear in your applications</li>
        </ol>

        <h4>Chrome (Android)</h4>
        <ol class="quick-start-list">
          <li>Tap the <strong>three dots menu</strong> (⋮)</li>
          <li>Select <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></li>
          <li>Tap <strong>Install</strong> to confirm</li>
          <li>The app icon will appear on your home screen</li>
        </ol>

        <h4>Safari (iOS / macOS)</h4>
        <ol class="quick-start-list">
          <li>Tap the <strong>Share button</strong> (square with arrow)</li>
          <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
          <li>Tap <strong>Add</strong> to confirm</li>
          <li>The app will appear on your home screen</li>
        </ol>

        <h4>Firefox</h4>
        <p>Firefox supports PWAs on Android. On desktop, you can bookmark the page for quick access, though full PWA installation is not yet supported.</p>

        <h4>Benefits of Installing</h4>
        <ul>
          <li><strong>Offline Use:</strong> Run the emulator without an internet connection</li>
          <li><strong>Own Window:</strong> Opens in a dedicated window without browser UI</li>
          <li><strong>Quick Access:</strong> Launch from your taskbar, dock, or home screen</li>
          <li><strong>Auto Updates:</strong> Automatically receives updates when online</li>
          <li><strong>Full Screen:</strong> Better fullscreen experience</li>
        </ul>

        <h4>Automatic Updates</h4>
        <p>The emulator automatically checks for updates when you open it while connected to the internet. When a new version is available, you'll see a brief notification and the page will refresh with the latest version.</p>
        <p>You can also manually check for updates using the <strong>refresh button</strong> in the toolbar, which clears the cache and reloads the latest version.</p>

        <div class="info-box info">
          <p><strong>Note:</strong> Your saved state, disk images, and settings are preserved across updates.</p>
        </div>
      </section>

      <!-- Keyboard Reference Section -->
      <section id="doc-keyboard" class="documentation-section">
        <h3>Keyboard Reference</h3>
        <p>The Apple //e keyboard is mapped to your modern keyboard. Some keys have special mappings to match the original layout.</p>

        <h4>Basic Keys</h4>
        <table class="key-table">
          <thead>
            <tr><th>Your Keyboard</th><th>Apple //e Key</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td><kbd>Enter</kbd></td><td>Return</td><td>Confirm input, run commands</td></tr>
            <tr><td><kbd>Backspace</kbd></td><td>Delete</td><td>Delete character left</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Escape</td><td>Cancel, exit menus</td></tr>
            <tr><td><kbd>Tab</kbd></td><td>Tab</td><td>Tab character</td></tr>
            <tr><td><kbd>&#8592;</kbd> <kbd>&#8594;</kbd> <kbd>&#8593;</kbd> <kbd>&#8595;</kbd></td><td>Arrow Keys</td><td>Cursor movement, game controls</td></tr>
          </tbody>
        </table>

        <h4>Special Keys</h4>
        <table class="key-table">
          <thead>
            <tr><th>Your Keyboard</th><th>Apple //e Key</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td><kbd>Alt</kbd> (Left)</td><td>Open Apple (&#63743;)</td><td>Modifier key, joystick button 0</td></tr>
            <tr><td><kbd>Alt</kbd> (Right) / <kbd>Win</kbd></td><td>Closed Apple</td><td>Modifier key, joystick button 1</td></tr>
            <tr><td><kbd>Ctrl</kbd></td><td>Control</td><td>Control key modifier</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>Pause/Break</kbd></td><td>Reset</td><td>Warm reset (Ctrl+Reset)</td></tr>
          </tbody>
        </table>

        <h4>Control Key Combinations</h4>
        <table class="key-table">
          <thead>
            <tr><th>Combination</th><th>Function</th></tr>
          </thead>
          <tbody>
            <tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd></td><td>Break - stop running program</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Pause output (Ctrl+Q to resume)</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>G</kbd></td><td>Bell (beep)</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>Reset</kbd></td><td>Warm reset (keeps memory)</td></tr>
          </tbody>
        </table>

        <h4>Emulator Shortcuts</h4>
        <table class="key-table">
          <thead>
            <tr><th>Shortcut</th><th>Function</th></tr>
          </thead>
          <tbody>
            <tr><td><kbd>F1</kbd></td><td>Open/close this Help window</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>Escape</kbd></td><td>Exit full page mode</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>V</kbd></td><td>Paste text into emulator</td></tr>
          </tbody>
        </table>

        <h4>Debugger Shortcuts</h4>
        <table class="key-table">
          <thead>
            <tr><th>Shortcut</th><th>Function</th></tr>
          </thead>
          <tbody>
            <tr><td><kbd>F5</kbd></td><td>Run / Continue execution</td></tr>
            <tr><td><kbd>F10</kbd></td><td>Step Over (skip subroutine calls)</td></tr>
            <tr><td><kbd>F11</kbd></td><td>Step Into (single instruction)</td></tr>
          </tbody>
        </table>

        <h4>Text Selection & Copy</h4>
        <p>You can select and copy text directly from the emulator screen:</p>
        <ul>
          <li>Click and drag on the screen to select text</li>
          <li>Selected text is automatically copied when you release the mouse</li>
          <li>Use <kbd>Ctrl</kbd>+<kbd>C</kbd> (or <kbd>Cmd</kbd>+<kbd>C</kbd> on Mac) while selecting</li>
        </ul>

        <h4>Paste Support</h4>
        <p>You can paste text into the emulator using <kbd>Ctrl</kbd>+<kbd>V</kbd>. The emulator will type the text character by character at the appropriate speed. This is useful for entering BASIC programs.</p>
      </section>

      <!-- Display Settings Section -->
      <section id="doc-display" class="documentation-section">
        <h3>Display Settings</h3>
        <p>Click the <strong>Display</strong> button to open the Display Settings window with extensive CRT simulation options.</p>

        <h4>Display Modes</h4>
        <ul>
          <li><strong>Color:</strong> Full NTSC artifact color rendering</li>
          <li><strong>Green:</strong> Classic green phosphor monochrome</li>
          <li><strong>Amber:</strong> Amber phosphor monochrome</li>
          <li><strong>White:</strong> White phosphor monochrome</li>
        </ul>

        <h4>CRT Effects</h4>
        <ul>
          <li><strong>Screen Curvature:</strong> Simulate curved CRT glass</li>
          <li><strong>Overscan:</strong> Add border/overscan area</li>
          <li><strong>Scanlines:</strong> Horizontal CRT scanline effect</li>
          <li><strong>Shadow Mask:</strong> RGB phosphor dot pattern</li>
          <li><strong>Phosphor Glow:</strong> Bloom/glow around bright pixels</li>
          <li><strong>Vignette:</strong> Darker corners effect</li>
          <li><strong>RGB Offset:</strong> Chromatic aberration</li>
          <li><strong>Flicker:</strong> CRT refresh flicker simulation</li>
        </ul>

        <h4>Analog Effects</h4>
        <ul>
          <li><strong>Static:</strong> Random noise/grain</li>
          <li><strong>Jitter:</strong> Random pixel displacement</li>
          <li><strong>H-Sync:</strong> Horizontal sync distortion</li>
          <li><strong>Scan Beam:</strong> Moving scan line effect</li>
          <li><strong>Ambient:</strong> Screen surface reflection</li>
          <li><strong>Burn-in:</strong> Phosphor persistence</li>
        </ul>

        <h4>Image Quality</h4>
        <ul>
          <li><strong>Brightness:</strong> Overall brightness level</li>
          <li><strong>Contrast:</strong> Contrast adjustment</li>
          <li><strong>Saturation:</strong> Color saturation (color mode only)</li>
        </ul>

        <h4>Rendering Options</h4>
        <ul>
          <li><strong>Sharp Pixels:</strong> Nearest-neighbor scaling (crisp pixels)</li>
          <li><strong>NTSC Fringing:</strong> Color fringing on hi-res graphics edges</li>
        </ul>

        <h4>Resizing the Display</h4>
        <p>Drag any corner of the monitor frame to resize. The 4:3 aspect ratio is maintained. A lock icon appears when using custom sizing - click it to return to auto-fit mode.</p>

        <h4>Full Page Mode</h4>
        <p>Click the <strong>fullscreen button</strong> for an immersive experience. Press <kbd>Ctrl</kbd>+<kbd>Escape</kbd> to exit.</p>

        <h4>Character Set</h4>
        <p>Toggle between US and UK character sets using the switch on the monitor bezel. The UK set replaces some symbols with British variants.</p>
      </section>

      <!-- Disk Drives Section -->
      <section id="doc-disks" class="documentation-section">
        <h3>Disk Drives</h3>
        <p>The emulator includes two Disk II floppy drives, just like a real Apple //e system.</p>

        <h4>Supported Formats</h4>
        <div class="format-list">
          <div class="format-item"><code>.DSK</code><span>DOS 3.3 sector order (140KB)</span></div>
          <div class="format-item"><code>.DO</code><span>DOS order (same as .DSK)</span></div>
          <div class="format-item"><code>.PO</code><span>ProDOS sector order (140KB)</span></div>
          <div class="format-item"><code>.NIB</code><span>Nibble format (232KB)</span></div>
          <div class="format-item"><code>.WOZ</code><span>WOZ format with copy protection</span></div>
        </div>

        <h4>Drive Controls</h4>
        <ul>
          <li><strong>Insert:</strong> Load a disk image from your computer</li>
          <li><strong>Recent:</strong> Quick access to recently used disks (per drive)</li>
          <li><strong>Blank:</strong> Create a new formatted blank disk</li>
          <li><strong>Eject:</strong> Remove the disk (prompts to save if modified)</li>
        </ul>

        <h4>Drive Information</h4>
        <ul>
          <li><strong>Filename:</strong> Shown on the drive (scrolls if long)</li>
          <li><strong>Track:</strong> Current head position (T00-T34)</li>
          <li><strong>LED:</strong> Glows when drive is active</li>
        </ul>

        <h4>Drag and Drop</h4>
        <p>You can drag disk image files directly onto a drive to insert them.</p>

        <h4>Booting from Disk</h4>
        <ul>
          <li>Type <kbd>PR#6</kbd> and press <kbd>Return</kbd> to boot from Drive 1</li>
          <li>Or use the <strong>Reboot</strong> button for a cold boot</li>
          <li>Many games auto-boot when inserted and the machine is reset</li>
        </ul>

        <h4>Saving Modified Disks</h4>
        <p>When you eject a disk that has been modified, you'll be prompted to save it. You can also use the File Explorer to export disks.</p>

        <h4>Disk Persistence</h4>
        <p>Disk contents are automatically saved in your browser's storage. When you return to the emulator, your disks will be exactly as you left them.</p>

        <div class="info-box tip">
          <p><strong>Tip:</strong> The Recent disks list is maintained separately for each drive, making it easy to quickly swap disks for multi-disk software.</p>
        </div>
      </section>

      <!-- File Explorer Section -->
      <section id="doc-file-explorer" class="documentation-section">
        <h3>File Explorer</h3>
        <p>The File Explorer lets you browse the contents of disk images and view files without running programs.</p>

        <h4>Opening the File Explorer</h4>
        <p>Click the <strong>folder icon</strong> in the toolbar. Select which drive to browse using the drive selector at the top.</p>

        <h4>Supported Disk Formats</h4>
        <ul>
          <li><strong>DOS 3.3:</strong> Standard Apple II DOS catalog browsing</li>
          <li><strong>ProDOS:</strong> Full directory navigation with subdirectories</li>
          <li><strong>WOZ:</strong> Catalog extraction from WOZ format disks</li>
        </ul>

        <h4>File Types</h4>
        <ul>
          <li><strong>A (Applesoft BASIC):</strong> Displayed with full detokenization, indentation, and syntax highlighting</li>
          <li><strong>I (Integer BASIC):</strong> Detokenized and formatted</li>
          <li><strong>B (Binary):</strong> Disassembled as 6502 machine code with:
            <ul>
              <li>Recursive descent flow analysis</li>
              <li>Clickable jump/branch targets</li>
              <li>Symbol tooltips (ROM routines, zero page, I/O)</li>
              <li>Operand highlighting</li>
            </ul>
          </li>
          <li><strong>T (Text):</strong> Plain text display</li>
          <li><strong>Other:</strong> Hex dump view</li>
        </ul>

        <h4>Navigation</h4>
        <ul>
          <li>Click file/folder names to open them</li>
          <li>Use the breadcrumb path for ProDOS directory navigation</li>
          <li>Click addresses in disassembly to jump to targets</li>
          <li>Use the back button to return to the catalog</li>
        </ul>

        <h4>Disk Information</h4>
        <p>The header shows disk format, volume name, and free space (for ProDOS disks).</p>

        <div class="info-box tip">
          <p><strong>Tip:</strong> The File Explorer uses virtual scrolling for large files, so even massive disassemblies load instantly.</p>
        </div>
      </section>

      <!-- State Management Section -->
      <section id="doc-state" class="documentation-section">
        <h3>State Management</h3>
        <p>The emulator automatically saves your session so you can pick up exactly where you left off.</p>

        <h4>What Gets Saved</h4>
        <ul>
          <li><strong>CPU State:</strong> All registers (A, X, Y, SP, PC) and flags</li>
          <li><strong>Memory:</strong> Full 128KB RAM (main + auxiliary)</li>
          <li><strong>Language Card:</strong> 16KB Language Card RAM</li>
          <li><strong>Soft Switches:</strong> All memory banking and display modes</li>
          <li><strong>Disk Drives:</strong> Complete disk images with modifications</li>
          <li><strong>Settings:</strong> Display, sound, and window positions</li>
        </ul>

        <h4>Auto-Save</h4>
        <p>When enabled (default), state is saved every 5 seconds while the emulator is running. Auto-save also triggers when:</p>
        <ul>
          <li>You switch to another tab or window</li>
          <li>You close the browser</li>
          <li>You power off the emulator</li>
        </ul>

        <h4>State Controls</h4>
        <p>Click the <strong>floppy disk icon</strong> in the toolbar to access:</p>
        <ul>
          <li><strong>Auto-Save Toggle:</strong> Enable/disable automatic saving</li>
          <li><strong>Save Now:</strong> Immediately save current state</li>
          <li><strong>Restore:</strong> Load the last saved state</li>
          <li><strong>Last Saved:</strong> Shows when state was last saved</li>
        </ul>

        <h4>How Restore Works</h4>
        <p>Restoring performs a complete power cycle and then loads the saved state. This ensures a clean restoration with no leftover state from the current session.</p>

        <div class="info-box tip">
          <p><strong>Tip:</strong> State is preserved even if your browser crashes. Just return to the emulator and click Restore to continue.</p>
        </div>
      </section>

      <!-- Sound Section -->
      <section id="doc-sound" class="documentation-section">
        <h3>Sound Settings</h3>
        <p>Click the <strong>speaker icon</strong> in the toolbar to access audio controls.</p>

        <h4>Audio Controls</h4>
        <ul>
          <li><strong>Volume Slider:</strong> Adjust master volume (0-100%)</li>
          <li><strong>Mute Toggle:</strong> Quickly mute/unmute all sound</li>
          <li><strong>Drive Sounds:</strong> Enable/disable disk drive sound effects</li>
        </ul>

        <h4>Sound Sources</h4>
        <ul>
          <li><strong>Speaker:</strong> The Apple II's built-in speaker for music and sound effects</li>
          <li><strong>Disk Seek:</strong> Stepper motor sounds when the drive head moves</li>
          <li><strong>Disk Motor:</strong> Spinning motor sound when drive is active</li>
        </ul>

        <h4>Audio Technology</h4>
        <p>The emulator uses the Web Audio API with an AudioWorklet for real-time audio synthesis. Audio timing drives the emulator's frame rate, ensuring accurate 1.023 MHz CPU timing.</p>

        <div class="info-box info">
          <p><strong>Note:</strong> Some browsers require a user interaction (click) before audio can play. Click anywhere on the page if you don't hear sound initially.</p>
        </div>
      </section>

      <!-- Debug Tools Section -->
      <section id="doc-debug" class="documentation-section">
        <h3>Debug Tools</h3>
        <p>Professional debugging tools for software development, reverse engineering, and exploration. Access via the <strong>Debug</strong> menu in the toolbar.</p>

        <h4>CPU Debugger</h4>
        <ul>
          <li><strong>Registers:</strong> Live view of A, X, Y, SP, PC</li>
          <li><strong>Flags:</strong> N, V, B, D, I, Z, C status flags</li>
          <li><strong>Disassembly:</strong> Scrolling disassembly around PC</li>
          <li><strong>Breakpoints:</strong> Click addresses to set/clear (persisted)</li>
          <li><strong>Controls:</strong> Run, Pause, Step, Step Over, Step Out</li>
        </ul>

        <h4>Memory Browser</h4>
        <ul>
          <li>Full 64KB hex dump with ASCII column</li>
          <li>Quick jump buttons for key memory regions</li>
          <li>Direct address entry for navigation</li>
          <li>Changed bytes highlighted with fade animation</li>
          <li>Search for hex byte sequences</li>
        </ul>

        <h4>Memory Heat Map</h4>
        <ul>
          <li>256x256 visualization of memory access</li>
          <li>Left panel: Main RAM + ROM</li>
          <li>Right panel: Auxiliary RAM</li>
          <li>View modes: Combined, Reads only, Writes only</li>
          <li>Click to jump to address in Memory Browser</li>
        </ul>

        <h4>Memory Map</h4>
        <ul>
          <li>Visual representation of memory bank configuration</li>
          <li>Shows which banks are active for each region</li>
          <li>Displays read/write bank status</li>
          <li>Color-coded legend</li>
        </ul>

        <h4>Soft Switches</h4>
        <ul>
          <li><strong>Display:</strong> TEXT, MIXED, PAGE2, HIRES, 80COL, ALTCHAR, DHIRES</li>
          <li><strong>Memory:</strong> 80STORE, RAMRD, RAMWRT, INTCXROM, ALTZP, SLOTC3ROM</li>
          <li><strong>Language Card:</strong> LCRAM, LCBANK2, LCWRITE, LCPREWRT</li>
          <li><strong>I/O:</strong> Annunciators, buttons, cassette</li>
        </ul>

        <h4>Stack Viewer</h4>
        <p>Visual representation of the 6502 stack showing return addresses and saved values.</p>

        <h4>Zero Page Watch</h4>
        <ul>
          <li>Predefined watch groups: BASIC, Screen, Graphics, DOS, System</li>
          <li>Add custom watch addresses</li>
          <li>Live value updates</li>
        </ul>

        <h4>Disk Drive Monitor</h4>
        <ul>
          <li>Quarter track position</li>
          <li>Phase (stepper motor position)</li>
          <li>Nibble position on track</li>
          <li>Motor status and read/write mode</li>
        </ul>

        <div class="info-box tip">
          <p><strong>Tip:</strong> All debug windows can be moved and resized. Their positions are saved between sessions.</p>
        </div>
      </section>

      <!-- Tips Section -->
      <section id="doc-tips" class="documentation-section">
        <h3>Tips & Troubleshooting</h3>

        <h4>Getting Software</h4>
        <p>Search for "Apple II disk images" to find archives of classic software. Popular archives include:</p>
        <ul>
          <li>Asimov Apple II Archive</li>
          <li>What Is The Apple IIGS?</li>
          <li>Internet Archive Apple II Library</li>
        </ul>

        <h4>Common BASIC Commands</h4>
        <div class="info-box tip">
          <p>
            <code>CATALOG</code> - List files on disk<br>
            <code>RUN filename</code> - Run a BASIC program<br>
            <code>LOAD filename</code> - Load a program into memory<br>
            <code>LIST</code> - Show program listing<br>
            <code>NEW</code> - Clear current program<br>
            <code>PR#6</code> - Boot from disk in slot 6
          </p>
        </div>

        <h4>Keyboard Not Working?</h4>
        <p>Click directly on the monitor screen to give it keyboard focus. The emulator needs focus to receive keyboard input.</p>

        <h4>No Sound?</h4>
        <ul>
          <li>Check that the volume is turned up in Sound Settings</li>
          <li>Check that your system volume is not muted</li>
          <li>Click anywhere on the page - browsers require user interaction before playing audio</li>
        </ul>

        <h4>Disk Won't Boot?</h4>
        <ul>
          <li>Make sure the emulator is powered on</li>
          <li>Try typing <kbd>PR#6</kbd> and pressing Return</li>
          <li>Try the Reboot button for a cold start</li>
          <li>Check that the disk is a bootable system disk</li>
        </ul>

        <h4>Performance Issues?</h4>
        <ul>
          <li>Disable some CRT effects in Display Settings</li>
          <li>Close unused debug windows</li>
          <li>Try a different browser (Chrome recommended)</li>
        </ul>

        <h4>Saving Your Work</h4>
        <ul>
          <li>State auto-saves every 5 seconds by default</li>
          <li>Modified disks are saved when ejected</li>
          <li>Export disks via File Explorer for backup</li>
        </ul>

        <h4>Release Notes</h4>
        <p>Click <strong>"Release Notes"</strong> in the footer to see the version history and recent changes.</p>

        <div class="info-box info">
          <p><strong>Need more help?</strong> The Apple II has extensive documentation available online. Search for "Apple II Reference Manual" or "Applesoft BASIC Programming Guide" for detailed information.</p>
        </div>
      </section>
    `;
  }

  /**
   * Called after content is rendered - set up nav button handlers
   */
  onContentRendered() {
    this.navButtons = this.contentElement.querySelectorAll(
      ".documentation-nav button"
    );
    this.sections = this.contentElement.querySelectorAll(
      ".documentation-section"
    );

    // Navigation button clicks
    this.navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const sectionId = btn.dataset.section;
        this.showSection(sectionId);
      });
    });
  }

  /**
   * Show a specific section by ID
   * @param {string} sectionId - The section ID to show (without 'doc-' prefix)
   */
  showSection(sectionId) {
    // Update nav button active states
    this.navButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === sectionId);
    });

    // Show/hide sections
    this.sections.forEach((section) => {
      const isTarget = section.id === `doc-${sectionId}`;
      section.classList.toggle("active", isTarget);
    });
  }
}
