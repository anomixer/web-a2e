/**
 * Release notes data generated from git history
 * Run: git log --pretty=format:"%h|%ad|%s" --date=short
 */

export const RELEASE_NOTES = [
  { hash: "44405e3", date: "2026-01-23", message: "Convert help to moveable window with comprehensive documentation and PWA install guide" },
  { hash: "4861d6c", date: "2026-01-23", message: "Add release notes page and automatic update checking" },
  { hash: "702d9e7", date: "2026-01-23", message: "Fix keyboard, debugger, and DHGR rendering issues" },
  { hash: "9a0e20e", date: "2026-01-23", message: "Enhance disassembler with categorized symbols and tooltips" },
  { hash: "8c7cedf", date: "2026-01-23", message: "Improve debug UI: fix dropdowns, heat map colors, add Memory Map window" },
  { hash: "a07b23e", date: "2026-01-23", message: "Simplify toolbar buttons to icon-only style" },
  { hash: "44f58bd", date: "2026-01-23", message: "Add service worker update button and improve caching strategy" },
  { hash: "5de8fe7", date: "2026-01-23", message: "Fix DSK disk corruption and improve BASIC viewer indentation" },
  { hash: "85e8f7b", date: "2026-01-22", message: "Add PWA support for offline functionality" },
  { hash: "0c5c34e", date: "2026-01-22", message: "Add version display and WOZ disk file explorer support" },
  { hash: "729b23b", date: "2026-01-22", message: "Refactor: Phase 3 architecture improvements" },
  { hash: "656b57c", date: "2026-01-22", message: "Refactor: Phase 2 code consolidation" },
  { hash: "1958e94", date: "2026-01-22", message: "Refactor: Phase 1 code cleanup from review" },
  { hash: "0deaf06", date: "2026-01-22", message: "Make file explorer window semi-transparent with blur" },
  { hash: "3952b62", date: "2026-01-22", message: "Add folder navigation for ProDOS disks in file explorer" },
  { hash: "82046a0", date: "2026-01-22", message: "Fix BASIC detokenization for ProDOS files" },
  { hash: "78eaf35", date: "2026-01-22", message: "Add ProDOS disk image support to file explorer" },
  { hash: "6cbb83c", date: "2026-01-22", message: "Add spacing around operators in BASIC view" },
  { hash: "c63206a", date: "2026-01-22", message: "Fix BASIC line navigation highlighting accuracy" },
  { hash: "9847775", date: "2026-01-22", message: "Add highlighted navigation for disassembler and BASIC" },
  { hash: "62219f3", date: "2026-01-22", message: "Add clickable jump targets and first-visit power reminder" },
  { hash: "9fe5dba", date: "2026-01-22", message: "Add recursive descent disassembly with flow analysis" },
  { hash: "19d96a6", date: "2026-01-22", message: "Refactor disassembler to return structured data" },
  { hash: "7fda977", date: "2026-01-22", message: "Add C++ disassembler with virtual scrolling for file explorer" },
  { hash: "37498e0", date: "2026-01-22", message: "Add File Explorer window for browsing DOS 3.3 disk contents" },
  { hash: "b682cf2", date: "2026-01-22", message: "Change full page exit from Escape to Ctrl+Escape" },
  { hash: "7784920", date: "2026-01-22", message: "Update drives button to show green when visible, grey when hidden" },
  { hash: "0b05e51", date: "2026-01-22", message: "Fix monochrome mode to bypass NTSC artifact coloring" },
  { hash: "170f0a2", date: "2026-01-22", message: "Add monochrome display mode (green, amber, white)" },
  { hash: "b687816", date: "2026-01-22", message: "Hide power reminder when restoring state" },
  { hash: "7587e5e", date: "2026-01-22", message: "Add state persistence with auto-save and documentation updates" },
  { hash: "066be1d", date: "2026-01-21", message: "Fix Disk II stepper motor timing to match real hardware" },
  { hash: "86ce2c5", date: "2026-01-21", message: "Add softswitch implementation comparison with AppleWin" },
  { hash: "6b30855", date: "2026-01-21", message: "Add per-drive recent disks lists" },
  { hash: "9711f76", date: "2026-01-21", message: "Fix Recent button to match other disk drive buttons" },
  { hash: "88b4061", date: "2026-01-21", message: "Improve recent disks dropdown and add clear option" },
  { hash: "5af33e8", date: "2026-01-21", message: "Fix Double Lo-Res color palette mapping" },
  { hash: "9ded311", date: "2026-01-21", message: "Fix 65C02 CPU emulation bugs and add Klaus functional tests" },
  { hash: "ad8bb3b", date: "2026-01-20", message: "Update documentation with recent disks and persistence features" },
  { hash: "4f0802b", date: "2026-01-20", message: "Add recent disks feature with dropdown menu" },
  { hash: "411aab0", date: "2026-01-20", message: "Fill alternating patterns in Hi-Res mode for continuous colored lines" },
  { hash: "7e62565", date: "2026-01-20", message: "Improve Hi-Res and DHGR rendering documentation" },
  { hash: "9b65b39", date: "2026-01-20", message: "Add disk persistence across browser sessions" },
  { hash: "da2a134", date: "2026-01-20", message: "Move NTSC color fringing from C++ to shader" },
  { hash: "be1a7c2", date: "2026-01-20", message: "Update color palette to new values" },
  { hash: "8da1c48", date: "2026-01-20", message: "Add BASIC reminder for users without disk images" },
  { hash: "4a576a5", date: "2026-01-20", message: "Drive image tweaks" },
  { hash: "2f79df4", date: "2026-01-20", message: "Fix window resize behavior and drives initialization" },
  { hash: "022a068", date: "2026-01-20", message: "Add smooth slide animation for disk drives toggle" },
  { hash: "17467a7", date: "2026-01-20", message: "Replace resize reminder with grab handle texture in bottom-right corner" },
  { hash: "77190af", date: "2026-01-19", message: "Fix breakpoint clicks, Help button styling, and documentation colors" },
  { hash: "1b49d05", date: "2026-01-19", message: "Fix breakpoint click using event delegation" },
  { hash: "b5e5e4b", date: "2026-01-19", message: "Add debug logging for breakpoint click" },
  { hash: "a8369cf", date: "2026-01-19", message: "Fix breakpoint toggle on disassembly click" },
  { hash: "17bc08e", date: "2026-01-19", message: "Improve CPU debugger disassembly view" },
  { hash: "016f626", date: "2026-01-19", message: "Add Help & Documentation modal with F1 shortcut" },
  { hash: "3faf9ab", date: "2026-01-19", message: "Fix window position/size persistence for hidden windows" },
  { hash: "9c60ab9", date: "2026-01-19", message: "Add color fringing toggle for HGR graphics" },
  { hash: "326f3be", date: "2026-01-19", message: "Prevent Ctrl+C from reaching emulator when copying selection" },
  { hash: "905e6d2", date: "2026-01-19", message: "Fix text selection tracking when mouse leaves canvas" },
  { hash: "111bc7d", date: "2026-01-19", message: "Fix TextSelection memory leak and code quality issues" },
  { hash: "9bbf2af", date: "2026-01-19", message: "Extract MonitorResizer and ReminderController from main.js" },
  { hash: "147b517", date: "2026-01-19", message: "Consolidate code, improve error handling, and convert modal to dialog" },
  { hash: "a6dab70", date: "2026-01-19", message: "Add mute/unmute methods, utility modules, and accessibility improvements" },
  { hash: "50972bc", date: "2026-01-19", message: "Refactor CSS into modular files and remove unused styles" },
  { hash: "fdff954", date: "2026-01-19", message: "Add responsive mobile layout and virtual keyboard support" },
  { hash: "d2b057e", date: "2026-01-19", message: "Add floating reminders for resize and disk drives toggle" },
  { hash: "c24c7c8", date: "2026-01-19", message: "Add mouse-based screen resizing with 4:3 aspect ratio lock" },
  { hash: "406e2e2", date: "2026-01-19", message: "Add disk drives show/hide toggle and clean up debug menu" },
  { hash: "b52e51c", date: "2026-01-18", message: "Fix UK/US character set toggle persistence and logic" },
  { hash: "042cb39", date: "2026-01-18", message: "Add UK/US character set switch and text selection feature" },
  { hash: "06dd366", date: "2026-01-18", message: "Fix power reminder positioning during window resize" },
  { hash: "391a467", date: "2026-01-18", message: "Add professional debug tools and full-page mode" },
  { hash: "6c76cbd", date: "2026-01-18", message: "Move keyboard mapping from JavaScript to C++ core" },
  { hash: "c444877", date: "2026-01-18", message: "Refactor disk-manager into modules and move WOZ creation to C++ core" },
  { hash: "6ddda3d", date: "2026-01-18", message: "Switch drive images from SVG to JPG and add drive numbers" },
  { hash: "8f722be", date: "2026-01-18", message: "Add labels to control buttons and floating power-on reminder" },
  { hash: "a3a08a6", date: "2026-01-18", message: "Add comprehensive soft switch support and fix drive light state" },
  { hash: "1351688", date: "2026-01-17", message: "Add sound popup with volume, mute, and drive sounds controls" },
  { hash: "b2125af", date: "2026-01-17", message: "Add scrolling animation for long disk filenames" },
  { hash: "d41818c", date: "2026-01-17", message: "Add clangd configuration with compile_commands.json support" },
  { hash: "131cd6b", date: "2026-01-16", message: "Fix Enhanced character ROM rendering and add sound settings" },
  { hash: "fc2b5bb", date: "2026-01-16", message: "New drives images" },
  { hash: "7922fff", date: "2026-01-16", message: "Fix flash character rendering and add disk seek sound" },
  { hash: "f8a6d4a", date: "2026-01-16", message: "Add volume slider with persistent setting" },
  { hash: "0c70b72", date: "2026-01-16", message: "Add non-side-effecting peekMemory for debugger" },
  { hash: "3d6bda5", date: "2026-01-16", message: "Improve display settings layout and update defaults" },
  { hash: "090c29f", date: "2026-01-16", message: "Fix debug window minimum size enforcement on state restore" },
  { hash: "285572b", date: "2026-01-16", message: "Convert display settings to movable window" },
  { hash: "ca69792", date: "2026-01-16", message: "Refocus canvas after button clicks for keyboard input" },
  { hash: "d36d9cc", date: "2026-01-16", message: "Add debug window buttons and CSS styling" },
  { hash: "00ed20e", date: "2026-01-16", message: "Add debug window system with viewport constraint on resize" },
  { hash: "362be20", date: "2026-01-16", message: "Enhance debugger disassembler with full opcode display" },
  { hash: "4665929", date: "2026-01-15", message: "Fix $C800-$CFFF expansion ROM space handling" },
  { hash: "01792d1", date: "2026-01-15", message: "Fix CXXX ROM space handling for INTCXROM soft switch" },
  { hash: "d8eb16a", date: "2026-01-15", message: "Fix 80STORE memory banking for display pages" },
  { hash: "05b7f87", date: "2026-01-15", message: "Fix Language Card write behavior for prewrite reset" },
  { hash: "8fb2e39", date: "2026-01-15", message: "Fix Language Card double-read requirement and 6502 RMW timing" },
  { hash: "0de049d", date: "2026-01-15", message: "Fix soft switch read side effects for $C000-$C00F" },
  { hash: "7d49c60", date: "2026-01-15", message: "Fix DHR mode detection, 80-col text, and add paste functionality" },
  { hash: "d85361c", date: "2026-01-15", message: "Fix WOZ disk write/read timing and add disk export functionality" },
  { hash: "6623f4e", date: "2026-01-15", message: "Latest" },
  { hash: "cf10ed9", date: "2026-01-15", message: "Video updates to get hi and double res working" },
  { hash: "b11e1aa", date: "2026-01-15", message: "Update .gitignore to exclude build artifacts and local config" },
  { hash: "fd430a9", date: "2026-01-15", message: "UI improvements: 4:3 monitor ratio and floating panels" },
  { hash: "8a3db82", date: "2026-01-14", message: "Working on fixing hi-res and double hi-res mode" },
  { hash: "b2d21eb", date: "2026-01-14", message: "Latest" },
  { hash: "fff4d2f", date: "2026-01-14", message: "Latest" },
  { hash: "8617426", date: "2026-01-13", message: "Dark theme for disk drive buttons and add blank disk option" },
  { hash: "feeb8a9", date: "2026-01-13", message: "Add power indicator light to monitor frame" },
  { hash: "c7ac5a7", date: "2026-01-13", message: "Fix hi-res graphics artifact color rendering" },
  { hash: "f99611f", date: "2026-01-13", message: "UI improvements and keyboard fixes" },
  { hash: "af95d8c", date: "2026-01-13", message: "Fix Language Card switch handling - disk boot now works" },
  { hash: "11dcedc", date: "2026-01-13", message: "Working on getting the disk controller working" },
  { hash: "905ed04", date: "2026-01-05", message: "Apple //e emulator with audio-driven frame sync" },
];

/**
 * Group release notes by date
 */
export function groupByDate(notes) {
  const grouped = {};
  for (const note of notes) {
    if (!grouped[note.date]) {
      grouped[note.date] = [];
    }
    grouped[note.date].push(note);
  }
  return grouped;
}

/**
 * Format date for display
 */
export function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
