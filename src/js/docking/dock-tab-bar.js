/*
 * dock-tab-bar.js - Tab bar management for dock leaf nodes
 *
 * Renders tabs, handles click-to-switch, drag-to-reorder within
 * the bar, and drag-to-undock when pulled outside.
 */

const UNDOCK_THRESHOLD = 20; // px outside tab bar to trigger undock

export class DockTabBar {
  constructor() {
    this._dragState = null;
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);

    // Callbacks set by DockManager
    this.onTabActivated = null;    // (nodeId, windowId) => void
    this.onTabReordered = null;    // (nodeId, windowId, newIndex) => void
    this.onTabUndocked = null;     // (nodeId, windowId, clientX, clientY) => void
    this.onTabClosed = null;       // (nodeId, windowId) => void
  }

  /**
   * Render tabs into a leaf's tab bar element.
   * @param {DockNode} node - The leaf node
   * @param {HTMLElement} tabBarEl - The .dock-tab-bar element
   * @param {WindowManager} windowManager - For getting window titles
   */
  renderTabs(node, tabBarEl, windowManager) {
    tabBarEl.innerHTML = '';

    // Show/hide tab bar based on window count
    if (node.windowIds.length <= 1) {
      tabBarEl.classList.add('single-tab');
    } else {
      tabBarEl.classList.remove('single-tab');
    }

    node.windowIds.forEach((wid, i) => {
      const tab = document.createElement('button');
      tab.className = 'dock-tab';
      if (i === node.activeTabIndex) {
        tab.classList.add('active');
      }
      tab.dataset.windowId = wid;
      tab.dataset.nodeId = String(node.id);

      // Get window title
      const win = windowManager.getWindow(wid);

      const label = document.createElement('span');
      label.className = 'dock-tab-label';
      label.textContent = win ? win.title : wid;
      tab.appendChild(label);

      const closeBtn = document.createElement('span');
      closeBtn.className = 'dock-tab-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Close';
      closeBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onTabClosed) {
          this.onTabClosed(node.id, wid);
        }
      });
      tab.appendChild(closeBtn);

      // Click to activate (on the tab itself, not the close button)
      tab.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.dock-tab-close')) return;
        e.preventDefault();
        e.stopPropagation();

        // Activate tab immediately
        if (this.onTabActivated) {
          this.onTabActivated(node.id, wid);
        }

        // Start potential drag
        this._startDrag(e, node, wid, tab, tabBarEl);
      });

      tabBarEl.appendChild(tab);
    });
  }

  _startDrag(e, node, windowId, tabEl, tabBarEl) {
    this._dragState = {
      node,
      windowId,
      tabEl,
      tabBarEl,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
    };

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  _handleMouseMove(e) {
    if (!this._dragState) return;
    const { startX, startY, tabBarEl, node, windowId, tabEl } = this._dragState;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!this._dragState.hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      this._dragState.hasMoved = true;
      tabEl.classList.add('dragging');
    }

    if (!this._dragState.hasMoved) return;

    // Check if dragged outside tab bar vertically (undock)
    const barRect = tabBarEl.getBoundingClientRect();
    if (e.clientY < barRect.top - UNDOCK_THRESHOLD || e.clientY > barRect.bottom + UNDOCK_THRESHOLD) {
      this._cleanup();
      if (this.onTabUndocked) {
        this.onTabUndocked(node.id, windowId, e.clientX, e.clientY);
      }
      return;
    }

    // Tab reordering within the bar
    const tabs = [...tabBarEl.querySelectorAll('.dock-tab')];
    const currentIndex = tabs.indexOf(tabEl);
    for (let i = 0; i < tabs.length; i++) {
      if (i === currentIndex) continue;
      const otherRect = tabs[i].getBoundingClientRect();
      const otherCenter = otherRect.left + otherRect.width / 2;
      if (
        (i < currentIndex && e.clientX < otherCenter) ||
        (i > currentIndex && e.clientX > otherCenter)
      ) {
        if (this.onTabReordered) {
          this.onTabReordered(node.id, windowId, i);
        }
        break;
      }
    }
  }

  _handleMouseUp() {
    this._cleanup();
  }

  _cleanup() {
    if (this._dragState) {
      this._dragState.tabEl.classList.remove('dragging');
      this._dragState = null;
    }
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
  }

  destroy() {
    this._cleanup();
  }
}
