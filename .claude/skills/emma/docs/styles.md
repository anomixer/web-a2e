# Coding Style Guide

**Analyzed from**: main.js, string-utils.js, ui-controller.js, window-manager.js, base-window.js, basic-program-window.js, index.html

---

## JavaScript Style Conventions

### File Structure

**File headers**: Every file starts with a comment block:
```javascript
/*
 * filename.js - Brief description
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */
```

**Import organization**:
- ES6 imports at top
- Grouped by category (config, display, audio, debug, etc.)
- Destructured imports where appropriate
```javascript
import { VERSION } from "./config/version.js";
import { WebGLRenderer } from "./display/webgl-renderer.js";
import { InputHandler, TextSelection } from "./input/index.js";
```

**Export pattern**: Named exports preferred over default
```javascript
export class UIController { ... }
export function escapeHtml(text) { ... }
```

### Naming Conventions

**Classes**: PascalCase
```javascript
class AppleIIeEmulator { ... }
class WindowManager { ... }
class BaseWindow { ... }
```

**Functions/Methods**: camelCase
```javascript
async init() { ... }
updatePowerButton(isRunning) { ... }
setupMenus() { ... }
```

**Variables**: camelCase
```javascript
this.wasmModule = null;
const powerBtn = document.getElementById("btn-power");
let refreshing = false;
```

**Constants**: SCREAMING_SNAKE_CASE
```javascript
const REMINDER_DISMISS_DELAY_MS = 2000;
const NOTIFICATION_DISPLAY_MS = 3000;
const STATE_BUTTON_FLASH_MS = 600;
```

**Private/internal members**: Prefix with underscore
```javascript
this._windowsBeforeFullPage = null;
this._varAutoRefresh = false;
this._lastUpdateTime = now;
```

**Boolean variables**: Descriptive with "is", "has", "should" prefixes
```javascript
this.isFullPageMode = false;
this.running = false;
const driveSoundsEnabled = savedDriveSounds !== "false";
```

### Indentation and Formatting

**Indentation**: 2 spaces (not tabs)

**Braces**: K&R style (opening brace on same line)
```javascript
function init() {
  if (condition) {
    // code
  } else {
    // code
  }
}
```

**Else placement**: Same line as closing brace
```javascript
if (this.running) {
  this.stop();
} else {
  this.start();
}
```

**Switch statements**: Aligned and clear
```javascript
switch(toolName) {
  case 'showWindow':
    windowManager.showWindow(args.windowId);
    break;
  case 'loadBASICProgram':
    // ...
    break;
}
```

**Line length**: Generally kept under 100 characters, broken logically

**Semicolons**: Always used (not optional)

### Functions and Methods

**JSDoc comments** for public methods:
```javascript
/**
 * Update power button appearance based on running state
 * @param {boolean} isRunning - Whether the emulator is running
 */
updatePowerButton(isRunning) {
  // ...
}
```

**Parameter placement**:
- Short: same line
- Long/many: break to multiple lines with proper indentation
```javascript
// Short
constructor(wasmModule, inputHandler, isRunningCallback) { ... }

// Long - wrapped
const displaySettings = new DisplaySettingsWindow(
  this.renderer,
  this.wasmModule,
);
```

**Arrow functions**: Used for callbacks and short functions
```javascript
this.audioDriver.onFrameReady = (frameCount) => {
  this.renderFrame();
};

buttons.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    // ...
  });
});
```

**Function expressions vs declarations**: Classes use methods, standalone functions use `function` keyword
```javascript
// Standalone
function showUpdateNotification() { ... }

// Class method
updatePowerButton(isRunning) { ... }
```

### Conditionals and Loops

**Simple conditions**: Optional braces for single-line returns/continues
```javascript
if (!this.canvas) return;
if (savedState) return;
```

**Complex conditions**: Always use braces
```javascript
if (this.running) {
  this.stop();
  this.reminderController.showBasicReminder(false);
} else {
  this.start();
  this.reminderController.showBasicReminder(true);
}
```

**Ternary operator**: Used for simple assignments
```javascript
const bpClass = hasBp ? "has-bp" : "";
const marker = isError ? "!" : (hasBp ? "●" : "");
```

**forEach/map**: Preferred over for loops for arrays
```javascript
containers.forEach((container) => {
  const trigger = container.querySelector(".header-menu-trigger");
  // ...
});
```

### Strings

**Quotes**: Double quotes for strings
```javascript
const id = "basic-program";
const title = "Applesoft BASIC";
```

**Template literals**: Used for interpolation and multi-line strings
```javascript
const message = `Loaded ${lines.length} lines`;

const html = `
  <div class="basic-unified-container">
    <div class="basic-dbg-toolbar">
      ...
    </div>
  </div>
`;
```

**String concatenation**: Prefer template literals over `+`
```javascript
// Good
console.log(`Apple //e Emulator v${VERSION}`);

// Avoid
console.log("Apple //e Emulator v" + VERSION);
```

### Objects and Destructuring

**Object literals**: Clear formatting
```javascript
const config = {
  id: "basic-program",
  title: "Applesoft BASIC",
  defaultWidth: 700,
  defaultHeight: 500,
};
```

**Destructuring**: Used for clarity
```javascript
const { wasmModule, audioDriver, diskManager } = deps;
```

**Object property shorthand**: Used when appropriate
```javascript
return {
  x: this.currentX,
  y: this.currentY,
  width: this.currentWidth,
  visible: this.isVisible,
};
```

### Error Handling

**Try-catch**: Used for expected failures
```javascript
try {
  const saved = localStorage.getItem(this.storageKey);
  if (saved) {
    const state = JSON.parse(saved);
    // ...
  }
} catch (e) {
  console.warn('Could not load state:', e);
}
```

**Console logging**:
- `console.log()` for info
- `console.warn()` for warnings
- `console.error()` for errors
```javascript
console.log("Apple //e Emulator initialized");
console.warn("Could not save settings:", e.message);
console.error("Failed to initialize emulator:", error);
```

### Async/Await

**Async functions**: Preferred over raw promises
```javascript
async init() {
  try {
    this.wasmModule = await window.createA2EModule();
    this.wasmModule._init();
    // ...
  } catch (error) {
    console.error("Failed to initialize:", error);
  }
}
```

### Event Listeners

**Binding**: Store bound references for cleanup
```javascript
this.handleMouseDown = this.handleMouseDown.bind(this);
document.addEventListener("mousedown", this.handleMouseDown);
```

**Cleanup**: Remove listeners in destroy/cleanup methods
```javascript
destroy() {
  document.removeEventListener("mousemove", this.handleMouseMove);
  document.removeEventListener("mouseup", this.handleMouseUp);
}
```

**Event parameters**: Always include event parameter even if unused
```javascript
button.addEventListener("click", (e) => {
  e.preventDefault();
  // ...
});
```

### Special Patterns

**Optional chaining**: Used liberally
```javascript
const closeBtn = this.headerElement.querySelector(`.${this.cssClasses.close}`);
if (closeBtn) {
  closeBtn.addEventListener("click", () => this.hide());
}

// Or
closeBtn?.addEventListener("click", () => this.hide());
```

**Nullish coalescing**: Not commonly used, prefer explicit checks

**setTimeout/setInterval**: Used with arrow functions
```javascript
setTimeout(() => {
  this.insertBtn.textContent = "Load into Emulator";
  this.insertBtn.classList.remove(cssClass);
}, 1500);
```

**Guard clauses**: Early returns for validation
```javascript
if (!this.canvas) {
  console.error("Required DOM element not found: screen");
  return;
}
```

### Comments

**Section headers**: Clear dividers
```javascript
// ========================================
// Gutter Methods
// ========================================
```

**Inline comments**: Explain why, not what
```javascript
// Close header menus when opening sound popup
this.closeAllMenus();

// Force a complete re-render of the framebuffer from current video
// memory so the display shows the full screen after stepping/pausing
if (isPaused) {
  this.wasmModule._forceRenderFrame();
}
```

**TODO comments**: Not commonly used, prefer issues/tickets

---

## HTML Style Conventions

### Indentation

**Indentation**: 4 spaces (note: different from JavaScript's 2 spaces!)

### Structure

**DOCTYPE**: Lowercase
```html
<!doctype html>
```

**Semantic HTML5**: Used throughout
```html
<header>
<main>
<footer>
<nav>
<dialog>
```

**Attributes**: Lowercase, kebab-case
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<button id="btn-power" class="control-btn power-btn off">
```

**Quotes**: Always double quotes for attributes
```html
<div id="app" class="container" data-value="test">
```

**Self-closing tags**: Use `/>` with space before
```html
<meta charset="UTF-8" />
<link rel="manifest" href="/manifest.json" />
<input type="checkbox" id="mute-toggle" />
```

### Naming Conventions

**IDs**: kebab-case, descriptive prefixes
```html
<button id="btn-power">
<div id="file-menu-container">
<input id="volume-slider">
<canvas id="screen">
```

**Classes**: kebab-case, BEM-like structure
```html
<div class="header-menu-container">
<button class="header-menu-trigger">
<div class="header-menu-item">
<span class="menu-chevron">
```

**Data attributes**: kebab-case
```html
<button data-window="cpu">
<button data-theme="light">
<div data-index="0">
```

### SVG

**Inline SVG**: Used for icons
```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0" />
</svg>
```

**SVG attributes**: Lowercase with hyphens
```html
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round"
```

### Comments

**Section markers**: Clear dividers
```html
<!-- Power, Reset, Reboot (standalone top-level buttons) -->

<!-- File menu (state management) -->

<!-- Full page mode toolbar (auto-hiding) -->
```

**Commented code**: Kept minimal, properly marked
```html
<!--<span class="tagline">Apple II Enhanced Emulator</span>-->
```

### Accessibility

**ARIA attributes**: Used where appropriate
```html
<button aria-label="Sound Settings">
<span id="volume-value" aria-live="polite">50%</span>
```

**Title attributes**: Descriptive tooltips
```html
<button title="Power On">
<button title="Full Page Mode (Ctrl+Escape to exit)">
```

### Script and Style Tags

**Script placement**: At end of body
```html
<script src="/a2e.js"></script>
<script type="module" src="/src/js/main.js"></script>
```

**CSS links**: In head, grouped by purpose
```html
<link rel="stylesheet" href="/css/base.css" />
<link rel="stylesheet" href="/css/layout.css" />
<link rel="stylesheet" href="/css/monitor.css" />
```

---

## General Best Practices

1. **Consistency**: Match existing code style exactly
2. **Readability**: Code should be self-documenting
3. **No framework dependencies**: Vanilla ES6 only
4. **Performance**: Consider browser performance
5. **Accessibility**: Proper ARIA labels and keyboard navigation
6. **Mobile**: Responsive design considerations
7. **Security**: XSS prevention (escapeHtml utility)
8. **Error handling**: Graceful degradation
9. **Memory management**: Clean up listeners and resources
10. **Browser compatibility**: Modern browsers with WebAssembly support

---

## Quick Reference

**JavaScript**:
- 2-space indentation
- camelCase variables/functions
- PascalCase classes
- SCREAMING_SNAKE_CASE constants
- K&R brace style
- Double quotes
- Semicolons always
- JSDoc for public methods

**HTML**:
- 4-space indentation
- kebab-case IDs and classes
- Double quotes for attributes
- Self-closing tags with space before `/>`
- Semantic HTML5 elements
- Inline SVG for icons
