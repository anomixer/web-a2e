/*
 * release-notes.js - Release notes content data
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * Curated release notes organized by week
 */

export const RELEASE_NOTES = [
  {
    week: "February 12, 2026",
    features: [
      {
        title: "Expansion Slots redesign",
        description:
          "Redesigned the Expansion Slots window with a drag-and-drop card tray and motherboard layout for intuitive slot management.",
      },
      {
        title: "Joystick window redesign",
        description:
          "Redesigned the joystick window with a circular pad, gauge bars, and LED-style buttons for a more tactile feel.",
      },
      {
        title: "Update badge on Help button",
        description:
          "Service worker updates now show a badge on the Help button instead of auto-reloading the page.",
      },
    ],
    fixes: [
      {
        title: "SmartPort ProDOS boot",
        description:
          "Fixed SmartPort card breaking ProDOS floppy boot and slow agent text input speed.",
      },
      {
        title: "SmartPort crash on empty drive",
        description:
          "Fixed a crash when booting with a SmartPort card installed but no disk image loaded.",
      },
      {
        title: "Window state persistence",
        description:
          "Fixed slot config and disk drives window state not persisting across browser refresh.",
      },
      {
        title: "Slot config UX",
        description:
          "Merged the slot config warning into the Apply button and fixed window sizing issues.",
      },
      {
        title: "Window centering",
        description:
          "Windows now center in the viewport when no saved position exists instead of appearing at origin.",
      },
      {
        title: "CRT static noise",
        description:
          "Reduced CRT static noise block size for a finer grain effect.",
      },
    ],
  },
  {
    week: "February 9, 2026",
    features: [
      {
        title: "BASIC tokenizer in WASM",
        description:
          "Moved the Applesoft BASIC tokenizer from JavaScript to C++ WebAssembly for faster and more accurate tokenization. Fixed detokenizer spacing for numbers and variables.",
      },
      {
        title: "Assembler symbol integration",
        description:
          "Assembler symbols are now automatically loaded into the CPU debugger, so breakpoints and disassembly show your label names. Added a Debug button to the assembler toolbar.",
      },
      {
        title: "Instruction Trace window",
        description:
          "New debug window that records a full disassembled instruction trace with auto-scroll, clear, and column-aligned display.",
      },
      {
        title: "Disk Library",
        description:
          "Added a Disk Library window for one-click loading of bundled disk images, cached locally in IndexedDB for instant access.",
      },
      {
        title: "SmartPort hard drive UI",
        description:
          "SmartPort Drives window now uses a side-by-side layout with drive separators. Added toast notifications and slot validation.",
      },
      {
        title: "Browse button on floppy drives",
        description:
          "Floppy disk drives now have a Browse button that opens the File Explorer for the inserted disk.",
      },
      {
        title: "Custom confirm dialogs",
        description:
          "Replaced all native browser confirm() dialogs with styled in-app modals that match the emulator theme.",
      },
      {
        title: "CSS bundling via Vite",
        description:
          "Moved all CSS into src/css/ so Vite can bundle and minify stylesheets for production builds.",
      },
    ],
    fixes: [
      {
        title: "Warm reset behavior",
        description:
          "Warm reset (Ctrl+Reset) now resets soft switches and stops the disk motor like real hardware, while preserving memory contents.",
      },
      {
        title: "Disk II write support",
        description:
          "Fixed Disk II write failures by correctly converting the level signal to flux transitions.",
      },
      {
        title: "Disk drives window layout",
        description:
          "Fixed Browse button styling, widened the drives window to fit content, and constrained it to the viewport after resize.",
      },
      {
        title: "Cold reset cleanup",
        description:
          "Clearing stale frame sync and BASIC state on cold reset to prevent ghost state from previous sessions.",
      },
    ],
  },
  {
    week: "February 2, 2026",
    features: [
      {
        title: "65C02 assembler editor",
        description:
          "Full-featured assembler with syntax highlighting, gutter line numbers, breakpoints, validation, error display, ROM routine reference panel, and file save/load.",
      },
      {
        title: "BASIC debugger",
        description:
          "Added breakpoints, statement-level stepping, variable inspection and editing, runtime error detection, and line highlighting for Applesoft BASIC programs.",
      },
      {
        title: "SmartPort expansion card",
        description:
          "New SmartPort hard drive controller supporting two ProDOS block devices with a self-built ROM. Includes pulsing LED activity indicator and hard drive file browsing.",
      },
      {
        title: "Light and dark themes",
        description:
          "Added light, dark, and system-follow theme support. All accent colors are derived from the six-stripe Apple rainbow logo palette.",
      },
      {
        title: "Save States window",
        description:
          "New save states manager with an autosave slot and five manual save slots, including high-res hover previews of each state.",
      },
      {
        title: "Mouse Interface Card",
        description:
          "Apple Mouse Interface Card emulation using the AppleWin PIA command protocol, with a dedicated debug window showing PIA registers and position.",
      },
      {
        title: "Per-scanline raster rendering",
        description:
          "Video output is now rendered scanline-by-scanline with sub-scanline precision and a 2-cycle pipeline delay, enabling accurate raster bar effects.",
      },
      {
        title: "Mockingboard improvements",
        description:
          "Unified channel-centric debug window with inline waveforms, level meters, per-channel mute, and MAME-aligned PSG audio engine.",
      },
      {
        title: "Window management",
        description:
          "Added window switcher overlay (Ctrl+`), Option+Tab cycling, focused window highlighting, viewport-lock for the screen, and auto-hiding toolbar in full-page mode.",
      },
      {
        title: "Canvas-based disk surface",
        description:
          "Replaced disk drive PNG images with real-time canvas-rendered disk surfaces showing track position and read/write activity.",
      },
      {
        title: "Core logic moved to WASM",
        description:
          "Migrated debug evaluation, filesystem parsing, BASIC detokenization, screen text extraction, and input handling from JavaScript to C++ WebAssembly.",
      },
      {
        title: "Beam position breakpoints",
        description:
          "CPU debugger can now break at specific scanline and horizontal beam positions, with wildcard support and a multi-beam tab panel.",
      },
      {
        title: "Dev menu",
        description:
          "New Dev menu grouping the Assembler and BASIC Program windows, with a dedicated category in the window switcher.",
      },
      {
        title: "Color bleed CRT effect",
        description:
          "Added a color bleed shader parameter for more authentic CRT monitor appearance.",
      },
      {
        title: "Merlin source viewer",
        description:
          "File Explorer can now display Merlin assembler source files from disk images.",
      },
    ],
    fixes: [
      {
        title: "Disk II accuracy",
        description:
          "Replaced the nibble-at-a-time disk model with a P6 ROM-driven Logic State Sequencer for cycle-accurate disk emulation.",
      },
      {
        title: "Speaker audio quality",
        description:
          "Fixed speaker pitch drift on subsequent beeps and audio mixing clipping when speaker and Mockingboard play simultaneously.",
      },
      {
        title: "AY-3-8910 sound chip",
        description:
          "Fixed noise LFSR polynomial, envelope timing, period-zero handling, PSG phase cancellation, and aligned output with MAME reference.",
      },
      {
        title: "Double Low-Res rendering",
        description:
          "Fixed color rendering using wrong palette and missing auxiliary memory nibble rotation.",
      },
      {
        title: "Paste performance",
        description:
          "Replaced slow keyboard-paste BASIC loading with instant direct memory insertion. Fixed paste queue setTimeout violations.",
      },
      {
        title: "Theme consistency",
        description:
          "Fixed hardcoded dark-theme colors in CPU Debugger and BASIC Program windows.",
      },
    ],
  },
  {
    week: "January 26, 2026",
    features: [
      {
        title: "Expansion card architecture",
        description:
          "Added a pluggable expansion card system matching real Apple IIe hardware, with an Expansion Slots configuration UI for managing cards in slots 1-7.",
      },
      {
        title: "Thunderclock Plus",
        description:
          "ProDOS-compatible real-time clock card that provides the current date and time to software. Configurable for slot 5 or 7.",
      },
      {
        title: "Dropdown menus",
        description:
          "Replaced header buttons with grouped dropdown menus (File, View, Debug, Dev, Help) for a cleaner toolbar.",
      },
      {
        title: "Emulation speed multiplier",
        description:
          "Adjustable speed control for fast-forwarding through slow operations like BASIC program loading and disk access.",
      },
      {
        title: "Mockingboard waveform scope",
        description:
          "Split Mockingboard window into detail and scope views with real-time waveform visualization and channel muting.",
      },
      {
        title: "Stereo audio output",
        description:
          "Mockingboard now outputs in stereo with proper PSG channel separation between left and right speakers.",
      },
      {
        title: "Viewport-lock for screen",
        description:
          "Screen window can be locked to fill the browser viewport, with proper aspect ratio enforcement.",
      },
      {
        title: "Window option persistence",
        description:
          "All window toggle states, view modes, and mute settings are now saved between sessions via localStorage.",
      },
    ],
    fixes: [
      {
        title: "VIA 6522 timer interrupts",
        description:
          "Fixed timer interrupt handling on mode transitions and ensured timers always decrement for proper Mockingboard detection.",
      },
      {
        title: "Mockingboard audio clipping",
        description:
          "Fixed audio timing, clipping, and output normalization issues in the Mockingboard sound engine.",
      },
      {
        title: "PSG register timing",
        description:
          "Added timestamped PSG register writes for cycle-accurate audio, with proper bipolar AC-coupled output.",
      },
      {
        title: "Window positioning",
        description:
          "Constrained all windows to visible viewport bounds and computed sensible default positions.",
      },
      {
        title: "NTSC fringing in monochrome",
        description:
          "Monochrome display modes now correctly skip NTSC color artifact rendering.",
      },
    ],
  },
  {
    week: "January 19, 2026",
    features: [
      {
        title: "Mockingboard sound card",
        description:
          "Dual AY-3-8910 PSG chips with VIA 6522 timers, providing stereo music and sound effects for supported software.",
      },
      {
        title: "BASIC Program window",
        description:
          "Load Applesoft BASIC programs directly into emulator memory with IntelliSense autocomplete for keywords, variables, and line numbers.",
      },
      {
        title: "Drag-to-move",
        description:
          "Monitor and disk drives can now be repositioned by dragging, with viewport constraint to keep everything on screen.",
      },
      {
        title: "Recent disks",
        description:
          "Per-drive recent disks dropdown menus with clear option, so frequently used disk images are always one click away.",
      },
      {
        title: "Disk persistence",
        description:
          "Inserted disk images and any modifications are preserved across browser sessions automatically.",
      },
      {
        title: "Joystick window",
        description:
          "Floating joystick window for paddle and joystick input with snap-back-to-center behavior.",
      },
      {
        title: "CRT shader enhancements",
        description:
          "Added rounded corners, edge highlights, and color fringing toggle for more realistic CRT monitor appearance.",
      },
      {
        title: "Help system",
        description:
          "Comprehensive help window (F1) with documentation, plus release notes page with automatic update checking.",
      },
    ],
    fixes: [
      {
        title: "65C02 CPU compliance",
        description:
          "Fixed CPU emulation bugs discovered by Klaus Dormann's 65C02 functional test suite.",
      },
      {
        title: "Double Lo-Res colors",
        description:
          "Corrected the color palette mapping for Double Lo-Res graphics mode.",
      },
      {
        title: "Disk II stepper motor",
        description:
          "Fixed stepper motor timing to match real hardware quarter-track behavior.",
      },
      {
        title: "Hi-Res color rendering",
        description:
          "Fixed alternating fill patterns for continuous colored lines and artifact color accuracy.",
      },
      {
        title: "DSK disk corruption",
        description:
          "Fixed a bug that corrupted DSK disk images during write operations.",
      },
      {
        title: "Keyboard and DHGR",
        description:
          "Fixed keyboard input issues and Double Hi-Res rendering problems.",
      },
    ],
  },
  {
    week: "January 12, 2026",
    features: [
      {
        title: "File Explorer",
        description:
          "Browse the contents of DOS 3.3 and ProDOS disk images, view BASIC listings with syntax formatting, and disassemble binary files with recursive descent flow analysis.",
      },
      {
        title: "C++ disassembler",
        description:
          "New disassembler running in WebAssembly with virtual scrolling, categorized symbols, clickable jump targets, and tooltips.",
      },
      {
        title: "Monochrome display modes",
        description:
          "Green, amber, and white phosphor display modes that bypass NTSC artifact coloring for a classic terminal look.",
      },
      {
        title: "Debug window system",
        description:
          "Movable, resizable debug windows with viewport constraints, minimum size enforcement, and state persistence. Includes Memory Map, heat map, and soft switch monitor.",
      },
      {
        title: "Display settings window",
        description:
          "Converted display settings to a movable window with improved layout, brightness, contrast, saturation, and CRT effect controls.",
      },
      {
        title: "Text selection",
        description:
          "Select and copy text directly from the emulator screen with Ctrl+C support and proper Apple II screen code conversion.",
      },
      {
        title: "Full-page mode",
        description:
          "Expand the emulator to fill the entire browser window, exit with Ctrl+Escape.",
      },
      {
        title: "Mobile layout",
        description:
          "Responsive layout with virtual keyboard support for mobile devices.",
      },
      {
        title: "PWA support",
        description:
          "Progressive Web App with offline functionality, service worker caching, and an update notification button.",
      },
      {
        title: "UK/US character set",
        description:
          "Toggle between UK and US character ROMs with persistent setting.",
      },
      {
        title: "Sound controls",
        description:
          "Volume slider, mute toggle, and disk drive seek sound with persistent settings.",
      },
      {
        title: "State persistence",
        description:
          "Auto-save emulator state on exit and restore on reload, including all window positions and sizes.",
      },
    ],
    fixes: [
      {
        title: "Memory banking",
        description:
          "Fixed Language Card write behavior, double-read requirement, 80STORE banking, and expansion ROM space handling ($C800-$CFFF).",
      },
      {
        title: "Soft switches",
        description:
          "Fixed read side effects for $C000-$C00F, INTCXROM handling, and comprehensive soft switch support.",
      },
      {
        title: "WOZ disk timing",
        description:
          "Fixed WOZ disk write/read timing and added disk image export functionality.",
      },
      {
        title: "Hi-Res and Double Hi-Res",
        description:
          "Fixed DHR mode detection, 80-column text rendering, and hi-res graphics artifact colors.",
      },
      {
        title: "Character ROM",
        description:
          "Fixed Enhanced character ROM rendering and flash character display.",
      },
    ],
  },
  {
    week: "January 5, 2026",
    features: [
      {
        title: "Initial release",
        description:
          "Apple //e emulator with cycle-accurate 65C02 CPU, audio-driven frame sync at 60Hz, Disk II controller with DSK/DO/PO/NIB/WOZ support, WebGL rendering, and CRT shader effects.",
      },
    ],
    fixes: [],
  },
];
