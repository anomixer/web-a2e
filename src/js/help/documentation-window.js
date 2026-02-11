/*
 * documentation-window.js - Help and documentation window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * DocumentationWindow - Moveable help & documentation window
 * Extends BaseWindow for drag/resize functionality
 */

import { BaseWindow } from "../windows/base-window.js";

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

    // Set up help button (inside help menu dropdown)
    const helpButton = document.getElementById("btn-help");
    if (helpButton) {
      helpButton.addEventListener("click", () => {
        this.toggle();
        // Close the help menu dropdown
        const menuContainer = helpButton.closest(".header-menu-container");
        if (menuContainer) menuContainer.classList.remove("open");
      });
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
          <button data-section="smartport">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="4" y="2" width="16" height="20" rx="2"/>
              <line x1="8" y1="6" x2="16" y2="6"/>
              <circle cx="12" cy="14" r="3"/>
            </svg>
            SmartPort
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
          <button data-section="dev">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
            Dev Tools
          </button>
          <button data-section="agent">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM6 16l.75 2.25L9 19l-2.25.75L6 22l-.75-2.25L3 19l2.25-.75L6 16zM18 16l.75 2.25L21 19l-2.25.75L18 22l-.75-2.25L15 19l2.25-.75L18 16z"/>
            </svg>
            AI Agent
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
          <li><strong>Storage:</strong> Two Disk II floppy drives, SmartPort hard drives</li>
          <li><strong>Audio:</strong> Speaker with accurate timing, Mockingboard (dual AY-3-8910)</li>
          <li><strong>Expansion:</strong> Mockingboard, Mouse Card, Thunderclock Plus, SmartPort</li>
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
            <tr><td><kbd>Ctrl</kbd>+<kbd>\`</kbd></td><td>Open window switcher</td></tr>
            <tr><td><kbd>Option</kbd>+<kbd>Tab</kbd></td><td>Cycle to next window</td></tr>
            <tr><td><kbd>Option</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd></td><td>Cycle to previous window</td></tr>
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
            <tr><td><kbd>Shift</kbd>+<kbd>F11</kbd></td><td>Step Out (run until current subroutine returns)</td></tr>
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
        <p>Open from <strong>View &gt; Display</strong> to access extensive CRT simulation options.</p>

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
        <p>Toggle between US and UK character sets using the switch in the screen window header. The UK set replaces some symbols with British variants.</p>
      </section>

      <!-- Disk Drives Section -->
      <section id="doc-disks" class="documentation-section">
        <h3>Disk Drives</h3>
        <p>The emulator includes two Disk II floppy drives, just like a real Apple //e system. Open from <strong>View &gt; Disk Drives</strong>.</p>

        <h4>Supported Formats</h4>
        <div class="format-list">
          <div class="format-item"><code>.DSK</code><span>DOS 3.3 sector order (140KB)</span></div>
          <div class="format-item"><code>.DO</code><span>DOS order (same as .DSK)</span></div>
          <div class="format-item"><code>.PO</code><span>ProDOS sector order (140KB)</span></div>
          <div class="format-item"><code>.WOZ</code><span>WOZ format with copy protection</span></div>
        </div>

        <h4>Drive Controls</h4>
        <ul>
          <li><strong>Insert:</strong> Load a disk image from your computer</li>
          <li><strong>Recent:</strong> Quick access to recently used disks (per drive)</li>
          <li><strong>Blank:</strong> Create a new formatted blank disk</li>
          <li><strong>Eject:</strong> Remove the disk (prompts to save if modified)</li>
          <li><strong>Browse:</strong> Open the file explorer to view disk contents</li>
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

      <!-- SmartPort Drives Section -->
      <section id="doc-smartport" class="documentation-section">
        <h3>SmartPort Drives</h3>
        <p>The emulator supports SmartPort hard drive emulation, providing high-capacity storage. Open from <strong>View &gt; SmartPort Drives</strong>.</p>

        <h4>Supported Formats</h4>
        <div class="format-list">
          <div class="format-item"><code>.HDV</code><span>Hard disk volume image</span></div>
          <div class="format-item"><code>.PO</code><span>ProDOS order image</span></div>
          <div class="format-item"><code>.2MG</code><span>Universal disk image (2IMG)</span></div>
        </div>

        <h4>Device Controls</h4>
        <ul>
          <li><strong>Insert:</strong> Load a SmartPort image from your computer</li>
          <li><strong>Recent:</strong> Quick access to recently used images (per device)</li>
          <li><strong>Eject:</strong> Remove the image (prompts to save if modified)</li>
          <li><strong>Browse:</strong> Open the file explorer to view image contents</li>
        </ul>

        <h4>Setup</h4>
        <p>The SmartPort card must be installed in an expansion slot before images can be loaded. Configure this in <strong>View &gt; Expansion Slots</strong>.</p>

        <h4>Activity LED</h4>
        <p>Each device has an LED indicator that glows green when the drive is being accessed.</p>

        <div class="info-box tip">
          <p><strong>Tip:</strong> SmartPort drives provide much larger storage than floppy disks and are commonly used with ProDOS.</p>
        </div>
      </section>

      <!-- File Explorer Section -->
      <section id="doc-file-explorer" class="documentation-section">
        <h3>File Explorer</h3>
        <p>The File Explorer lets you browse the contents of disk images and view files without running programs.</p>

        <h4>Opening the File Explorer</h4>
        <p>Open from <strong>View &gt; File Explorer</strong> or click the <strong>folder icon</strong> in the toolbar. Select which drive to browse using the drive selector at the top.</p>

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
        <p>The emulator automatically saves your session so you can pick up exactly where you left off. You also have 5 manual save slots for organizing different states.</p>

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
        <p>Toggle auto-save on or off from the <strong>File</strong> menu.</p>

        <h4>Save States Window</h4>
        <p>Open the Save States window from <strong>File &gt; Save States...</strong> to manage all your saved states in one place.</p>

        <h4>Autosave Slot</h4>
        <p>The top row shows the current autosave with a screenshot thumbnail and timestamp. Use the <strong>Load</strong> button to restore it, or <strong>DL</strong> to download it as a file. This slot updates automatically while the window is open.</p>

        <h4>Manual Slots (1&ndash;5)</h4>
        <p>Below the autosave are 5 numbered slots for manual saves. Each slot has:</p>
        <ul>
          <li><strong>Save:</strong> Capture the current emulator state with a screenshot thumbnail</li>
          <li><strong>Load:</strong> Restore the emulator to this saved state</li>
          <li><strong>Clear:</strong> Delete the saved state from this slot</li>
          <li><strong>DL:</strong> Download the state as an <code>.a2state</code> file</li>
        </ul>

        <h4>Load from File</h4>
        <p>Click <strong>Load from File...</strong> at the bottom of the Save States window to restore a previously downloaded <code>.a2state</code> file. The file is validated before loading.</p>

        <h4>How Restore Works</h4>
        <p>Restoring any state (autosave, slot, or file) performs a complete power cycle and then loads the saved state. This ensures a clean restoration with no leftover state from the current session.</p>

        <div class="info-box tip">
          <p><strong>Tip:</strong> Use slots to save before difficult parts of a game, or to keep multiple program states. Download slots to back up important states or transfer them to another device.</p>
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
          <li><strong>Mockingboard:</strong> Dual AY-3-8910 sound chips for rich stereo music and sound</li>
          <li><strong>Disk Seek:</strong> Stepper motor sounds when the drive head moves</li>
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

        <h4>CPU Debugger Overview</h4>
        <p>The CPU Debugger provides full control over 65C02 execution with registers, disassembly, breakpoints, watch expressions, and beam position breakpoints. Open it from <strong>Debug &gt; CPU Debugger</strong>.</p>

        <h4>Execution Controls</h4>
        <table class="key-table">
          <thead>
            <tr><th>Button</th><th>Shortcut</th><th>Function</th></tr>
          </thead>
          <tbody>
            <tr><td>Run</td><td><kbd>F5</kbd></td><td>Resume execution (or continue from breakpoint)</td></tr>
            <tr><td>Pause</td><td></td><td>Pause execution immediately</td></tr>
            <tr><td>Step</td><td><kbd>F11</kbd></td><td>Execute one instruction, stepping into subroutines</td></tr>
            <tr><td>Step Over</td><td><kbd>F10</kbd></td><td>Execute one instruction, skipping over JSR calls</td></tr>
            <tr><td>Step Out</td><td><kbd>Shift</kbd>+<kbd>F11</kbd></td><td>Run until the current subroutine returns (RTS/RTI)</td></tr>
          </tbody>
        </table>

        <h4>Registers &amp; Flags</h4>
        <p>The top panel displays all CPU registers and status flags in real time.</p>
        <ul>
          <li><strong>Registers:</strong> A, X, Y (accumulator and index), SP (stack pointer), PC (program counter) &mdash; all shown in hexadecimal</li>
          <li><strong>Flags:</strong> N (negative), V (overflow), B (break), D (decimal), I (interrupt disable), Z (zero), C (carry) &mdash; active flags are highlighted</li>
          <li><strong>Editing:</strong> Double-click any register value while paused to enter a new hex value</li>
        </ul>

        <h4>Cycle &amp; Beam Position</h4>
        <ul>
          <li><strong>CYC:</strong> Total CPU cycle count since power-on</li>
          <li><strong>IRQ / NMI / EDGE:</strong> Indicators for pending interrupt requests</li>
          <li><strong>SCAN:</strong> Current scanline (0&ndash;261), <strong>H:</strong> horizontal position, <strong>COL:</strong> column (0&ndash;39)</li>
          <li><strong>FCYC:</strong> Cycle within the current frame</li>
          <li>A badge shows the beam region: <strong>VISIBLE</strong>, <strong>HBLANK</strong>, or <strong>VBL</strong></li>
        </ul>

        <h4>Disassembly View</h4>
        <p>The scrollable disassembly view shows decoded 65C02 instructions around the current PC.</p>
        <ul>
          <li><strong>Go to Address:</strong> Enter a hex address or symbol name in the input field and click <strong>Go</strong> to jump the disassembly view</li>
          <li><strong>Follow PC:</strong> Click <strong>Follow PC</strong> to re-center the view on the current program counter. When the CPU is running, the view automatically follows PC</li>
          <li><strong>Click a line:</strong> Toggle an execution breakpoint at that address</li>
          <li><strong>Ctrl+Click</strong> (or <strong>Cmd+Click</strong>): Toggle a bookmark on that line (highlighted in yellow)</li>
          <li><strong>Double-click a line:</strong> Add or edit an inline comment that appears next to the instruction</li>
          <li><strong>Right-click a line:</strong> Context menu with <em>Run to Cursor</em>, <em>Go to Address</em>, and <em>Toggle Breakpoint</em></li>
        </ul>
        <p>Branch and jump instructions are color-coded. When symbols are loaded, known addresses are annotated with their symbol names.</p>

        <h4>Symbol Import</h4>
        <p>Click <strong>Import Symbols</strong> in the disassembly toolbar to load a symbol file. Supported formats:</p>
        <ul>
          <li><code>.dbg</code> &mdash; cc65 debug info files</li>
          <li><code>.sym</code> &mdash; Symbol table files (label = address)</li>
          <li><code>.labels</code> &mdash; Label files (address label)</li>
          <li><code>.map</code> &mdash; Map files</li>
          <li><code>.txt</code> &mdash; Plain text symbol lists</li>
        </ul>
        <p>Once imported, symbols appear in the disassembly as annotations and can be used in the address input field.</p>

        <h4>Breakpoints Tab</h4>
        <p>The Breakpoints tab lets you manage all breakpoints. Click <strong>Add</strong> to create a new breakpoint.</p>
        <ul>
          <li><strong>Type:</strong> Choose from <em>Exec</em> (execution), <em>Read</em> (memory read), <em>Write</em> (memory write), or <em>R/W</em> (read or write)</li>
          <li><strong>Address:</strong> Enter a hex address (e.g., <code>FF69</code>) or a symbol name if symbols are loaded</li>
          <li><strong>Conditions:</strong> Optionally add a condition expression. Click the condition cell to open the Rule Builder, or type expressions directly:
            <ul>
              <li><code>A==#$FF</code> &mdash; break when accumulator equals $FF</li>
              <li><code>X&gt;#$10</code> &mdash; break when X register exceeds $10</li>
              <li><code>PEEK($00)==#$42</code> &mdash; break when zero page location $00 equals $42</li>
            </ul>
          </li>
          <li><strong>Hit Count:</strong> Set a hit count target &mdash; the breakpoint only fires after being hit that many times</li>
          <li><strong>Enable/Disable:</strong> Use the checkbox to temporarily disable a breakpoint without deleting it</li>
          <li><strong>Remove:</strong> Click the &times; button to delete a breakpoint</li>
        </ul>
        <p>Breakpoints are persisted to localStorage and survive page reloads.</p>

        <h4>Watch Tab</h4>
        <p>The Watch tab monitors values in real time, highlighting changes. Click <strong>Add Watch</strong> and choose a source:</p>
        <ul>
          <li><strong>Register:</strong> Watch A, X, Y, SP, PC, or P (status byte)</li>
          <li><strong>Flag:</strong> Watch individual status flags (N, V, B, D, I, Z, C)</li>
          <li><strong>Byte:</strong> Watch a memory byte &mdash; displays as <code>PEEK($addr)</code></li>
          <li><strong>Word:</strong> Watch a 16-bit value (little-endian) &mdash; displays as <code>DEEK($addr)</code></li>
        </ul>
        <p>When a watched value changes, it briefly highlights to draw attention. Watch entries are persisted between sessions.</p>

        <h4>Beam Breakpoints Tab</h4>
        <p>Beam breakpoints pause execution based on the CRT beam position rather than the program counter. This is useful for debugging display timing and raster effects.</p>
        <ul>
          <li><strong>VBL Start:</strong> Break at the start of vertical blanking (scanline 192)</li>
          <li><strong>HBLANK:</strong> Break at the start of each horizontal blanking period</li>
          <li><strong>Scanline:</strong> Break when the beam reaches a specific scanline (0&ndash;261)</li>
          <li><strong>Column:</strong> Break when the beam reaches a specific column (0&ndash;39)</li>
          <li><strong>Scan+Col:</strong> Break at a specific scanline <em>and</em> column combination</li>
        </ul>
        <p>Use the <strong>Enable</strong> checkbox to activate or deactivate beam breakpoints. When hit, the breakpoint row highlights briefly.</p>

        <h4>Memory Browser</h4>
        <ul>
          <li>Full 64KB hex dump with ASCII column</li>
          <li>Quick jump buttons for key memory regions</li>
          <li>Direct address entry for navigation</li>
          <li>Changed bytes highlighted with fade animation</li>
          <li>Search for hex byte sequences</li>
          <li>Click any byte to edit its value</li>
        </ul>

        <h4>Memory Heat Map</h4>
        <ul>
          <li>256&times;256 visualization of memory access</li>
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

        <h4>Mockingboard Monitor</h4>
        <p>Open from <strong>Debug &gt; Mockingboard</strong> to inspect the dual AY-3-8910 sound chips:</p>
        <ul>
          <li>Channel-centric view with inline waveforms</li>
          <li>AY-3-8910 and VIA 6522 register states</li>
          <li>Level meters for each channel</li>
          <li>Per-channel mute controls</li>
        </ul>

        <h4>Mouse Card Monitor</h4>
        <p>Open from <strong>Debug &gt; Mouse Card</strong> to inspect the Apple Mouse Interface Card:</p>
        <ul>
          <li>PIA registers and protocol activity</li>
          <li>Position, mode, and interrupt state</li>
        </ul>

        <div class="info-box tip">
          <p><strong>Tip:</strong> All debug windows can be moved and resized. Their positions and settings are saved between sessions.</p>
        </div>
      </section>

      <!-- Dev Tools Section -->
      <section id="doc-dev" class="documentation-section">
        <h3>Dev Tools</h3>
        <p>Development tools for writing and testing software. Access via the <strong>Dev</strong> menu in the toolbar.</p>

        <h4>Applesoft BASIC Window</h4>
        <p>Write, edit, debug, and load Applesoft BASIC programs. Open from <strong>Dev &gt; Applesoft BASIC</strong>.</p>

        <h5>Editor Features</h5>
        <ul>
          <li><strong>New:</strong> Clear the editor and start a new program</li>
          <li><strong>Syntax Highlighting:</strong> BASIC keywords, line numbers, strings, and comments are color-coded</li>
          <li><strong>Autocomplete:</strong> Type to see suggestions for BASIC commands</li>
        </ul>

        <h5>Debugger Controls</h5>
        <ul>
          <li><strong>Run:</strong> Execute the BASIC program</li>
          <li><strong>Pause:</strong> Pause execution</li>
          <li><strong>Step:</strong> Step through one BASIC line at a time</li>
        </ul>

        <h5>Program Operations</h5>
        <ul>
          <li><strong>Read:</strong> Read the current BASIC program from emulator memory into the editor</li>
          <li><strong>Write:</strong> Type the program into the running emulator</li>
          <li><strong>Format:</strong> Auto-format the program text</li>
          <li><strong>Renum:</strong> Renumber BASIC line numbers</li>
        </ul>

        <h5>File Operations</h5>
        <ul>
          <li><strong>New:</strong> Start a new program</li>
          <li><strong>Open:</strong> Open a BASIC program file from your computer</li>
          <li><strong>Save:</strong> Save the current program to a file</li>
        </ul>

        <div class="info-box warning">
          <p><strong>Note:</strong> The Read and Write buttons require the emulator to be powered on.</p>
        </div>

        <h4>Assembler</h4>
        <p>Write 65C02 assembly code using Merlin-style syntax. Open from <strong>Dev &gt; Assembler</strong>.</p>

        <h5>Editor Features</h5>
        <ul>
          <li><strong>Syntax Highlighting:</strong> Opcodes, directives, labels, operands, and comments</li>
          <li><strong>Column Guides:</strong> Visual guides for Merlin's column-based format (Label, Opcode, Operand, Comment)</li>
          <li><strong>Tab Navigation:</strong> Press Tab to jump between columns</li>
          <li><strong>Live Validation:</strong> Syntax errors shown as you type</li>
          <li><strong>Breakpoints:</strong> Click the gutter or press <kbd>F9</kbd> to toggle breakpoints</li>
        </ul>

        <h5>File Operations</h5>
        <table class="key-table">
          <thead>
            <tr><th>Button</th><th>Shortcut</th><th>Function</th></tr>
          </thead>
          <tbody>
            <tr><td>New</td><td><kbd>Ctrl/⌘</kbd>+<kbd>N</kbd></td><td>Start a new file</td></tr>
            <tr><td>Open</td><td><kbd>Ctrl/⌘</kbd>+<kbd>O</kbd></td><td>Open a .s, .asm, or .a65 file</td></tr>
            <tr><td>Save</td><td><kbd>Ctrl/⌘</kbd>+<kbd>S</kbd></td><td>Save current file</td></tr>
          </tbody>
        </table>

        <h5>Assembly &amp; Loading</h5>
        <ul>
          <li><strong>Assemble:</strong> Click or press <kbd>Ctrl/⌘</kbd>+<kbd>Enter</kbd> to assemble the code</li>
          <li><strong>Write:</strong> After successful assembly, click Write to copy the machine code into emulator memory (requires emulator to be powered on)</li>
          <li><strong>ORG Directive:</strong> Your code must include an <code>ORG</code> directive before any instructions</li>
        </ul>

        <h5>ROM Routines Reference</h5>
        <p>Press <kbd>F2</kbd> or click <strong>ROM</strong> to open the ROM routines panel:</p>
        <ul>
          <li>Search and browse Apple II ROM routines</li>
          <li>View input/output requirements and examples</li>
          <li>Insert EQU definitions or JSR calls directly into your code</li>
        </ul>

        <h5>Output Panels</h5>
        <ul>
          <li><strong>Symbols:</strong> Lists all defined labels and their addresses</li>
          <li><strong>Hex Output:</strong> Shows assembled machine code bytes</li>
        </ul>
      </section>

      <!-- AI Agent Section -->
      <section id="doc-agent" class="documentation-section">
        <h3>AI Agent</h3>
        <p>The AI Agent integration allows LLMs like Claude to control the emulator through natural language commands. The agent can show/hide windows, manage disks, read/write BASIC programs, and inspect emulator state in real time using the AG-UI protocol over an MCP server.</p>

        <h4>Connection Status</h4>
        <p>The agent connection status is shown by a sparkle icon in the toolbar header:</p>
        <table class="key-table">
          <thead>
            <tr><th>Icon</th><th>Status</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><svg viewBox="0 0 24 24" width="20" height="20" fill="#6e7681"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM6 16l.75 2.25L9 19l-2.25.75L6 22l-.75-2.25L3 19l2.25-.75L6 16zM18 16l.75 2.25L21 19l-2.25.75L18 22l-.75-2.25L15 19l2.25-.75L18 16z"/></svg></td>
              <td>Disconnected</td>
              <td>MCP server is not running or not reachable</td>
            </tr>
            <tr>
              <td><svg viewBox="0 0 24 24" width="20" height="20" fill="#FDBE34"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM6 16l.75 2.25L9 19l-2.25.75L6 22l-.75-2.25L3 19l2.25-.75L6 16zM18 16l.75 2.25L21 19l-2.25.75L18 22l-.75-2.25L15 19l2.25-.75L18 16z"/></svg></td>
              <td>Connected</td>
              <td>Agent is connected and ready to receive commands</td>
            </tr>
            <tr>
              <td><svg viewBox="0 0 24 24" width="20" height="20" fill="#E5504F"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM6 16l.75 2.25L9 19l-2.25.75L6 22l-.75-2.25L3 19l2.25-.75L6 16zM18 16l.75 2.25L21 19l-2.25.75L18 22l-.75-2.25L15 19l2.25-.75L18 16z"/></svg></td>
              <td>Interrupted</td>
              <td>Connection error or server unavailable</td>
            </tr>
          </tbody>
        </table>
        <p>Click the sparkle icon to open the agent connection panel and view detailed status information.</p>

        <h4>Setting Up the MCP Server</h4>
        <p>The AI Agent uses the Model Context Protocol (MCP) to communicate with LLM clients like Claude Code. Configure your MCP client to connect to the emulator's agent server.</p>
        <p>Add the following to your MCP configuration file (e.g., <code>~/.claude/mcp.json</code>):</p>
        <pre><code>{
  "mcpServers": {
    "appleii-agent": {
      "command": "node",
      "args": [
        "/path/to/mcp/appleii-agent/src/index.js"
      ]
    }
  }
}</code></pre>
        <p>The server listens on <code>http://localhost:3033</code> by default.</p>

        <h4>Example Prompts</h4>

        <h5>Window Management</h5>
        <ul>
          <li><strong>Show a window:</strong> "Show the CPU debugger window"</li>
          <li><strong>Hide a window:</strong> "Hide the disk drives window"</li>
          <li><strong>Focus a window:</strong> "Bring the BASIC program window to the front"</li>
        </ul>

        <h5>Disk Management</h5>
        <ul>
          <li><strong>Insert from filesystem:</strong> "Load ~/Documents/Apple_II/ProDOS_2_4_2.dsk into drive 1"</li>
          <li><strong>List recent disks:</strong> "What disks are in the recent list for drive 1?"</li>
          <li><strong>Load from recent:</strong> "Insert the disk named Zork_1.dsk from recent disks into drive 2"</li>
          <li><strong>Eject a disk:</strong> "Eject the disk from drive 1"</li>
        </ul>

        <h5>BASIC Programs</h5>
        <ul>
          <li><strong>Read from memory:</strong> "Load the BASIC program from memory and show it in the editor"</li>
          <li><strong>Write to memory:</strong> "Write this BASIC program to emulator memory: 10 PRINT \"HELLO\" 20 GOTO 10"</li>
          <li><strong>Get listing:</strong> "What BASIC program is currently in memory?"</li>
          <li><strong>Save to file:</strong> "Save the BASIC program from the editor to ~/Documents/myprogram.bas"</li>
        </ul>

        <h5>Assembly Programs</h5>
        <ul>
          <li><strong>Get status:</strong> "What's the status of the assembler?" or "Get the assembly origin address"</li>
          <li><strong>Execute program:</strong> "Run the assembled program" or "Execute the code at the origin"</li>
          <li><strong>Execute at address:</strong> "Execute the code at $0800" or "Run code at address 2048"</li>
          <li><strong>Set PC without executing:</strong> "Set PC to $0800 but don't execute yet"</li>
        </ul>

        <h5>Emulator Control</h5>
        <ul>
          <li><strong>Power on:</strong> "Turn on the emulator" or "Power on the Apple //e"</li>
          <li><strong>Power off:</strong> "Turn off the emulator" or "Power off"</li>
          <li><strong>Reboot:</strong> "Reboot the emulator" or "Do a cold reset"</li>
          <li><strong>Warm reset:</strong> "Send Ctrl+Reset to the emulator" or "Press Ctrl+Reset"</li>
          <li><strong>Break program:</strong> "Send Ctrl+C to the emulator" or "Stop the running program"</li>
        </ul>

        <div class="info-box info">
          <p><strong>Note:</strong> The MCP server must be running for the agent to connect. The server starts automatically when your MCP client connects.</p>
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
          <li>Use <strong>File &gt; Save States...</strong> to save to manual slots or download states</li>
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
