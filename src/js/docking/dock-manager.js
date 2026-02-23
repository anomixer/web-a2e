/*
 * dock-manager.js - Orchestrator for the ImGui-style docking system
 *
 * Owns the DockTree, DockLayout, DockOverlay, and DockTabBar.
 * Hooks into BaseWindow drag callbacks for dock/undock lifecycle.
 * Integrates with WindowManager for paneled window tracking.
 */

import { DockNode } from './dock-node.js';
import { DockTree } from './dock-tree.js';
import { DockLayout } from './dock-layout.js';
import { DockOverlay } from './dock-overlay.js';
import { DockTabBar } from './dock-tab-bar.js';
import { PRESETS } from './dock-presets.js';

const STORAGE_KEY = 'a2e-dock-layout';
const STORAGE_KEY_ACTIVE = 'a2e-dock-active-preset';

function presetStorageKey(name) {
  return `a2e-dock-preset-${name}`;
}

export class DockManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.tree = new DockTree(null);
    this.layout = null;
    this.overlay = null;
    this.tabBar = new DockTabBar();
    this.container = null;
    this._activePreset = null;

    this._resizeObserver = null;
    this._dragWindowId = null; // window currently being dragged over dock space

    // Wire tab bar callbacks
    this.tabBar.onTabActivated = (nodeId, windowId) => this._onTabActivated(nodeId, windowId);
    this.tabBar.onTabReordered = (nodeId, windowId, newIndex) => this._onTabReordered(nodeId, windowId, newIndex);
    this.tabBar.onTabUndocked = (nodeId, windowId, cx, cy) => this._onTabUndocked(nodeId, windowId, cx, cy);
    this.tabBar.onTabClosed = (nodeId, windowId) => this._onTabClosed(nodeId, windowId);
  }

  /**
   * Initialize the docking system.
   */
  init() {
    this.container = document.getElementById('dock-space');
    if (!this.container) {
      // Create dock space if it doesn't exist
      const main = document.querySelector('main');
      this.container = document.createElement('div');
      this.container.id = 'dock-space';
      this.container.className = 'dock-space';
      main.appendChild(this.container);
    }

    this.layout = new DockLayout(this.container);
    this.overlay = new DockOverlay(this.container);

    // Layout engine callbacks
    this.layout.onRecalculate = () => {
      this.layout.recalculate(this.tree);
      this._updateAllContentSizes();
    };
    this.layout.onSplitterDragEnd = () => this.saveState();

    // ResizeObserver for container resize
    this._resizeObserver = new ResizeObserver(() => {
      if (this.tree.root) {
        this.layout.recalculate(this.tree);
        this._updateAllContentSizes();
      }
    });
    this._resizeObserver.observe(this.container);

    // Hook into all registered windows for drag callbacks
    this._hookWindowDragCallbacks();

    // Restore the last active preset and its saved state
    this._activePreset = localStorage.getItem(STORAGE_KEY_ACTIVE) || null;
    this._loadState();

    // Rebuild dock (sets empty class if no tree, or renders docked windows)
    this._rebuildDock();
  }

  /**
   * Hook drag callbacks on all windows in the window manager.
   */
  _hookWindowDragCallbacks() {
    for (const [id, win] of this.windowManager.windows) {
      this._hookWindow(win);
    }
  }

  _hookWindow(win) {
    win.onDragMove = (x, y) => this._handleWindowDragMove(win, x, y);
    win.onDragEnd = (x, y) => this._handleWindowDragEnd(win, x, y);
  }

  /**
   * Check if a window is currently docked.
   */
  isDocked(windowId) {
    if (!this.tree.root) return false;
    return this.tree.findLeafContaining(windowId) !== null;
  }

  /**
   * Activate a tab for a docked window (used by menu toggle).
   */
  activateTab(windowId) {
    const leaf = this.tree.findLeafContaining(windowId);
    if (!leaf) return;
    const idx = leaf.windowIds.indexOf(windowId);
    if (idx === -1) return;
    leaf.activeTabIndex = idx;
    this._refreshLeafContent(leaf);
    this._renderTabBar(leaf);
    this.saveState();
  }

  // --- Docking ---

  /**
   * Dock a floating window into the tree at the given position.
   */
  dockWindow(windowId, hit) {
    const win = this.windowManager.getWindow(windowId);
    if (!win) return;

    // Detach content from floating window shell
    win.detachContent();

    if (!this.tree.root) {
      // Empty dock — create root leaf
      this.tree.root = DockNode.leaf([windowId]);
    } else if (hit.type === 'tab') {
      const leaf = this.tree.findNodeById(hit.nodeId);
      if (leaf && leaf.isLeaf) {
        this.tree.addTab(leaf, windowId);
      }
    } else if (hit.type === 'split') {
      const leaf = this.tree.findNodeById(hit.nodeId);
      if (leaf && leaf.isLeaf) {
        this.tree.splitNode(leaf, hit.direction, windowId);
      }
    } else if (hit.type === 'root-edge') {
      if (hit.direction === 'center') {
        // Drop on empty space — create root leaf
        this.tree.root = DockNode.leaf([windowId]);
      } else {
        // Wrap existing root in a split
        const newLeaf = DockNode.leaf([windowId]);
        const oldRoot = this.tree.root;
        let splitDir, childA, childB;
        switch (hit.direction) {
          case 'left':
            splitDir = 'h'; childA = newLeaf; childB = oldRoot;
            break;
          case 'right':
            splitDir = 'h'; childA = oldRoot; childB = newLeaf;
            break;
          case 'top':
            splitDir = 'v'; childA = newLeaf; childB = oldRoot;
            break;
          case 'bottom':
            splitDir = 'v'; childA = oldRoot; childB = newLeaf;
            break;
        }
        this.tree.root = DockNode.split(splitDir, 0.7, childA, childB);
        // Fix: new root needs proper parent pointers
        DockTree._rebuildParents(this.tree.root, null);
      }
    }

    this._rebuildDock();
    this.saveState();
  }

  /**
   * Undock a window from the tree and return it to floating.
   */
  undockWindow(windowId, clientX, clientY) {
    const win = this.windowManager.getWindow(windowId);
    if (!win) return;

    const leaf = this.tree.findLeafContaining(windowId);
    if (!leaf) return;

    // Remove from tree
    this.tree.removeTab(leaf, windowId);

    // Reattach content to floating window
    win.reattachContent();
    win.isVisible = true;

    // Position at mouse
    if (clientX !== undefined && clientY !== undefined) {
      const newX = clientX - 100; // offset from mouse
      const newY = clientY - 15;
      win.element.style.left = `${newX}px`;
      win.element.style.top = `${newY}px`;
      win.currentX = newX;
      win.currentY = newY;
      win.element.classList.remove('hidden');
    } else {
      win.show();
    }

    this._rebuildDock();
    this.windowManager.bringToFront(windowId);
    this.saveState();
    this.windowManager.saveState();
  }

  // --- Drag-to-dock handlers ---

  _handleWindowDragMove(win, x, y) {
    if (this.isDocked(win.id)) return;

    const containerRect = this.container.getBoundingClientRect();
    const inDock = (
      x >= containerRect.left && x <= containerRect.right &&
      y >= containerRect.top && y <= containerRect.bottom
    );

    if (inDock) {
      if (!this._dragWindowId) {
        this._dragWindowId = win.id;
        this.overlay.activate();
      }
      this.overlay.hitTest(x, y, this.tree, this.layout);
    } else if (this._dragWindowId === win.id) {
      this.overlay.deactivate();
      this._dragWindowId = null;
    }
  }

  _handleWindowDragEnd(win, x, y) {
    if (this._dragWindowId !== win.id) return;

    const hit = this.overlay.hitTest(x, y, this.tree, this.layout);
    this.overlay.deactivate();
    this._dragWindowId = null;

    if (hit) {
      this.dockWindow(win.id, hit);
    }
  }

  // --- Tab bar callbacks ---

  _onTabActivated(nodeId, windowId) {
    const node = this.tree.findNodeById(nodeId);
    if (!node || !node.isLeaf) return;
    const idx = node.windowIds.indexOf(windowId);
    if (idx === -1) return;
    node.activeTabIndex = idx;
    this._refreshLeafContent(node);
    this._renderTabBar(node);
    this.saveState();
  }

  _onTabReordered(nodeId, windowId, newIndex) {
    const node = this.tree.findNodeById(nodeId);
    if (!node || !node.isLeaf) return;
    const oldIndex = node.windowIds.indexOf(windowId);
    if (oldIndex === -1 || oldIndex === newIndex) return;

    // Move window ID to new position
    node.windowIds.splice(oldIndex, 1);
    node.windowIds.splice(newIndex, 0, windowId);

    // Keep active tab following the moved window
    node.activeTabIndex = node.windowIds.indexOf(windowId);

    this._renderTabBar(node);
    this.saveState();
  }

  _onTabUndocked(nodeId, windowId, clientX, clientY) {
    this.undockWindow(windowId, clientX, clientY);

    // Transfer drag to the floating window so user continues dragging
    const win = this.windowManager.getWindow(windowId);
    if (win) {
      win.isDragging = true;
      win.element.classList.add('dragging');
      win.dragOffset = { x: 100, y: 15 };
    }
  }

  _onTabClosed(nodeId, windowId) {
    const win = this.windowManager.getWindow(windowId);
    if (!win) return;

    const leaf = this.tree.findLeafContaining(windowId);
    if (!leaf) return;

    // Remove from tree
    this.tree.removeTab(leaf, windowId);

    // Reattach content to floating window shell but keep it hidden
    win.reattachContent();
    win.isVisible = false;
    win.element.classList.add('hidden');

    this._rebuildDock();
    this.saveState();
    this.windowManager.saveState();
  }

  // --- DOM management ---

  _rebuildDock() {
    this.layout.rebuild(this.tree, this.windowManager);
    this._updatePaneledWindows();

    // Toggle empty class — controls background and pointer-events in CSS
    this.container.classList.toggle('empty', !this.tree.root);

    if (!this.tree.root) return;

    // Place content and render tab bars
    const leaves = this.tree.getAllLeaves();
    for (const leaf of leaves) {
      this._refreshLeafContent(leaf);
      this._renderTabBar(leaf);
    }
  }

  _refreshLeafContent(leaf) {
    const el = this.layout.getLeafElement(leaf.id);
    if (!el) return;

    const contentArea = el.querySelector('.dock-leaf-content');
    if (!contentArea) return;

    // Remove current content (don't return to BaseWindow — it stays detached)
    while (contentArea.firstChild) {
      contentArea.removeChild(contentArea.firstChild);
    }

    // Insert active window's content
    const activeWid = leaf.activeWindowId;
    if (activeWid) {
      const win = this.windowManager.getWindow(activeWid);
      if (win && win.contentElement) {
        contentArea.appendChild(win.contentElement);
      }
    }
  }

  _renderTabBar(leaf) {
    const el = this.layout.getLeafElement(leaf.id);
    if (!el) return;
    const tabBarEl = el.querySelector('.dock-tab-bar');
    if (!tabBarEl) return;
    this.tabBar.renderTabs(leaf, tabBarEl, this.windowManager);
  }

  _updatePaneledWindows() {
    const dockedIds = this.tree.getAllDockedWindowIds();
    this.windowManager.setPaneledWindows(dockedIds);

    // Set isVisible = true on active tab windows so their update() runs,
    // and false on inactive tabs so they don't waste cycles
    for (const leaf of this.tree.getAllLeaves()) {
      const activeWid = leaf.activeWindowId;
      for (const wid of leaf.windowIds) {
        const win = this.windowManager.getWindow(wid);
        if (win) {
          win.isVisible = (wid === activeWid);
        }
      }
    }
  }

  _updateAllContentSizes() {
    // Content areas auto-fill via CSS flex, no manual sizing needed
  }

  // --- Presets ---

  /**
   * Load a preset layout by name.
   * Uses saved customization if available, otherwise falls back to factory default.
   * @param {'play'|'code'|'debug'} presetName
   */
  loadPreset(presetName) {
    const presetFactory = PRESETS[presetName];
    if (!presetFactory) return;

    // Save current layout before switching
    this._saveCurrentPresetState();

    // Undock all current windows
    this._undockAll();

    // Try to load saved customization for this preset
    let loaded = false;
    try {
      const saved = localStorage.getItem(presetStorageKey(presetName));
      if (saved) {
        const data = JSON.parse(saved);
        this.tree = DockTree.deserialize(data);
        const validIds = new Set(this.windowManager.windows.keys());
        this.tree.validate(validIds);
        if (this.tree.root) {
          loaded = true;
        }
      }
    } catch (e) {
      // Fall through to factory default
    }

    if (!loaded) {
      // Build new tree from factory preset
      this.tree = presetFactory();
      const validIds = new Set(this.windowManager.windows.keys());
      this.tree.validate(validIds);
    }

    // Dock windows (detach from floating shells) and hide all others
    const dockedIds = this.tree.getAllDockedWindowIds();
    for (const [id, win] of this.windowManager.windows) {
      if (dockedIds.has(id)) {
        win.detachContent();
      } else if (win.isVisible) {
        win.hide();
      }
    }

    this._activePreset = presetName;
    this._rebuildDock();
    this.saveState();
    this.windowManager.saveState();
  }

  /**
   * Undock all windows and clear the tree.
   */
  _undockAll() {
    if (!this.tree.root) return;
    const dockedIds = this.tree.getAllDockedWindowIds();
    for (const wid of dockedIds) {
      const win = this.windowManager.getWindow(wid);
      if (win && win._isPaneled) {
        win.reattachContent();
        win.isVisible = true;
        win.element.classList.remove('hidden');
      }
    }
    this.tree = new DockTree(null);
    this._rebuildDock();
  }

  // --- Persistence ---

  /**
   * Save the current dock tree to the active preset's storage slot.
   */
  saveState() {
    try {
      const data = this.tree.serialize();
      // Save to the current preset slot
      if (this._activePreset) {
        if (data) {
          localStorage.setItem(presetStorageKey(this._activePreset), JSON.stringify(data));
        } else {
          localStorage.removeItem(presetStorageKey(this._activePreset));
        }
        localStorage.setItem(STORAGE_KEY_ACTIVE, this._activePreset);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE);
      }
      // Also save to the general key for init-time restore
      if (data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to save dock layout:', e);
    }
  }

  /**
   * Save current preset state before switching away.
   */
  _saveCurrentPresetState() {
    if (this._activePreset && this.tree.root) {
      try {
        const data = this.tree.serialize();
        if (data) {
          localStorage.setItem(presetStorageKey(this._activePreset), JSON.stringify(data));
        }
      } catch (e) {
        // Ignore save errors during switch
      }
    }
  }

  _loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const data = JSON.parse(saved);
      this.tree = DockTree.deserialize(data);

      // Validate window IDs
      const validIds = new Set(this.windowManager.windows.keys());
      this.tree.validate(validIds);

      // Detach content for all docked windows
      const dockedIds = this.tree.getAllDockedWindowIds();
      for (const wid of dockedIds) {
        const win = this.windowManager.getWindow(wid);
        if (win) {
          win.detachContent();
        }
      }
    } catch (e) {
      console.warn('Failed to load dock layout:', e);
      this.tree = new DockTree(null);
    }
  }

  /**
   * Clear saved state and undock all windows.
   */
  clearState() {
    this._undockAll();
    this._activePreset = null;
    localStorage.removeItem(STORAGE_KEY_ACTIVE);
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Clean up everything.
   */
  destroy() {
    this._undockAll();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    if (this.layout) {
      this.layout.destroy();
    }
    if (this.overlay) {
      this.overlay.destroy();
    }
    if (this.tabBar) {
      this.tabBar.destroy();
    }
  }
}
