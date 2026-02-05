/*
 * window-switcher.js - App-switcher style window overlay (Ctrl+`)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const WINDOW_CATEGORIES = [
  {
    label: 'System',
    windows: [
      { id: 'screen-window', title: 'Screen' },
      { id: 'disk-drives', title: 'Disk Drives' },
      { id: 'save-states', title: 'Save States' },
    ],
  },
  {
    label: 'Hardware',
    windows: [
      { id: 'display-settings', title: 'Display Settings' },
      { id: 'joystick', title: 'Joystick' },
      { id: 'slot-configuration', title: 'Expansion Slots' },
      { id: 'mockingboard-debug', title: 'Mockingboard' },
      { id: 'mouse-card-debug', title: 'Mouse Card' },
    ],
  },
  {
    label: 'Debug',
    windows: [
      { id: 'cpu-debugger', title: 'CPU Debugger' },
      { id: 'rule-builder', title: 'Rule Builder' },
      { id: 'soft-switches', title: 'Soft Switches' },
      { id: 'memory-browser', title: 'Memory Browser' },
      { id: 'memory-heatmap', title: 'Memory Heat Map' },
      { id: 'memory-map', title: 'Memory Map' },
      { id: 'stack-viewer', title: 'Stack Viewer' },
      { id: 'zeropage-watch', title: 'Zero Page Watch' },
    ],
  },
  {
    label: 'Dev',
    windows: [
      { id: 'basic-program', title: 'Applesoft BASIC' },
      { id: 'assembler-editor', title: 'Assembler' },
    ],
  },
  {
    label: 'Help',
    windows: [
      { id: 'documentation-window', title: 'Documentation' },
      { id: 'release-notes', title: 'Release Notes' },
    ],
  },
];

export class WindowSwitcher {
  /**
   * @param {import('../windows/window-manager.js').WindowManager} windowManager
   */
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.isOpen = false;
    this.backdrop = null;
    this.items = [];
    this.selectedIndex = 0;
    this._handleKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * Build the backdrop and panel DOM (hidden initially).
   */
  create() {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'window-switcher-backdrop hidden';
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });

    this.panel = document.createElement('div');
    this.panel.className = 'window-switcher-panel';
    this.backdrop.appendChild(this.panel);

    document.body.appendChild(this.backdrop);
  }

  /**
   * Open the switcher overlay.
   */
  open() {
    if (this.isOpen) return;
    this.isOpen = true;

    this._buildList();
    this.backdrop.classList.remove('hidden');
    document.addEventListener('keydown', this._handleKeyDown);
  }

  /**
   * Close the switcher overlay.
   */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    this.backdrop.classList.add('hidden');
    document.removeEventListener('keydown', this._handleKeyDown);

    // Refocus the emulator canvas
    const canvas = document.getElementById('screen');
    if (canvas) setTimeout(() => canvas.focus(), 0);
  }

  /**
   * Toggle the switcher open/closed.
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  // --- Private ---

  /**
   * Build the full item list from categories and current visibility state.
   */
  _buildList() {
    this.panel.innerHTML = '';
    this.items = [];

    // Header
    const header = document.createElement('div');
    header.className = 'window-switcher-header';
    header.innerHTML = `
      <span class="window-switcher-title">Windows</span>
      <span class="window-switcher-hints">
        <kbd>Tab</kbd> navigate
        <kbd>Enter</kbd> select
        <kbd>Esc</kbd> close
      </span>
    `;
    this.panel.appendChild(header);

    // Find the highest z-index visible window to pre-select
    let bestIndex = -1;
    let bestZ = -1;

    for (const category of WINDOW_CATEGORIES) {
      const group = document.createElement('div');
      group.className = 'window-switcher-group';

      const label = document.createElement('div');
      label.className = 'window-switcher-group-label';
      label.textContent = category.label;
      group.appendChild(label);

      for (const entry of category.windows) {
        const win = this.windowManager.getWindow(entry.id);
        const isVisible = win ? win.isVisible : false;

        const btn = document.createElement('button');
        btn.className = 'window-switcher-item';
        btn.dataset.windowId = entry.id;

        const titleSpan = document.createElement('span');
        titleSpan.className = 'window-switcher-item-title';
        titleSpan.textContent = entry.title;
        btn.appendChild(titleSpan);

        const dot = document.createElement('span');
        dot.className = 'window-switcher-dot' + (isVisible ? ' visible' : '');
        btn.appendChild(dot);

        btn.addEventListener('click', () => {
          this.selectedIndex = this.items.indexOf(btn);
          this._selectCurrent();
        });

        btn.addEventListener('mouseenter', () => {
          this.selectedIndex = this.items.indexOf(btn);
          this._updateHighlight();
        });

        group.appendChild(btn);

        const idx = this.items.length;
        this.items.push(btn);

        if (isVisible && win && (win.zIndex || 0) > bestZ) {
          bestZ = win.zIndex || 0;
          bestIndex = idx;
        }
      }

      this.panel.appendChild(group);
    }

    // Pre-select the topmost visible window, or the first item
    this.selectedIndex = bestIndex >= 0 ? bestIndex : 0;
    this._updateHighlight();
  }

  /**
   * Update the selection highlight to match this.selectedIndex.
   */
  _updateHighlight() {
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].classList.toggle('selected', i === this.selectedIndex);
    }
    // Scroll into view if needed
    const current = this.items[this.selectedIndex];
    if (current) {
      current.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Activate the currently selected window and close the switcher.
   */
  _selectCurrent() {
    const btn = this.items[this.selectedIndex];
    if (!btn) return;

    const windowId = btn.dataset.windowId;
    this.windowManager.showWindow(windowId);
    this.close();
  }

  /**
   * Handle keyboard navigation inside the switcher.
   */
  _handleKeyDown(e) {
    switch (e.key) {
      case 'ArrowDown':
      case 'Tab':
        if (e.key === 'Tab' && e.shiftKey) {
          // Shift+Tab goes up
          e.preventDefault();
          this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
          this._updateHighlight();
          return;
        }
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
        this._updateHighlight();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
        this._updateHighlight();
        break;

      case 'Enter':
        e.preventDefault();
        this._selectCurrent();
        break;

      case 'Escape':
        e.preventDefault();
        this.close();
        break;

      default:
        break;
    }
  }
}
