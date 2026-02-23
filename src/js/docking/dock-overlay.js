/*
 * dock-overlay.js - Drag-to-dock overlay with drop zone indicators
 *
 * Shows visual indicators when a floating window is dragged over the
 * dock space. Provides 5 zones per leaf (center + L/R/T/B) plus
 * 4 root edge zones. Renders a semi-transparent preview rectangle.
 */

const EDGE_ZONE_SIZE = 60;   // px from container edge for root zones
const ZONE_RATIO = 0.25;     // fraction of leaf for directional zones

export class DockOverlay {
  constructor(container) {
    this.container = container;
    this._previewEl = null;
    this._active = false;

    this._createPreviewElement();
  }

  _createPreviewElement() {
    this._previewEl = document.createElement('div');
    this._previewEl.className = 'dock-drop-preview hidden';
    this.container.appendChild(this._previewEl);
  }

  /**
   * Activate the overlay during a drag operation.
   */
  activate() {
    this._active = true;
    this._previewEl.classList.remove('hidden');
  }

  /**
   * Deactivate and hide the overlay.
   */
  deactivate() {
    this._active = false;
    this._previewEl.classList.add('hidden');
  }

  /**
   * Test which drop zone the mouse is over.
   * @param {number} clientX
   * @param {number} clientY
   * @param {DockTree} tree
   * @param {DockLayout} layout
   * @returns {{ type: 'tab'|'split'|'root-edge', nodeId: number|null, direction: string|null } | null}
   */
  hitTest(clientX, clientY, tree, layout) {
    if (!this._active) return null;

    const containerRect = this.container.getBoundingClientRect();
    const x = clientX - containerRect.left;
    const y = clientY - containerRect.top;
    const cw = containerRect.width;
    const ch = containerRect.height;

    // Check if inside container at all
    if (x < 0 || y < 0 || x > cw || y > ch) {
      this._hidePreview();
      return null;
    }

    // Root edge zones (when there's content in the tree)
    if (tree.root) {
      if (x < EDGE_ZONE_SIZE) {
        const hit = { type: 'root-edge', nodeId: null, direction: 'left' };
        this._showPreview({ x: 0, y: 0, w: cw * 0.3, h: ch });
        return hit;
      }
      if (x > cw - EDGE_ZONE_SIZE) {
        const hit = { type: 'root-edge', nodeId: null, direction: 'right' };
        this._showPreview({ x: cw * 0.7, y: 0, w: cw * 0.3, h: ch });
        return hit;
      }
      if (y < EDGE_ZONE_SIZE) {
        const hit = { type: 'root-edge', nodeId: null, direction: 'top' };
        this._showPreview({ x: 0, y: 0, w: cw, h: ch * 0.3 });
        return hit;
      }
      if (y > ch - EDGE_ZONE_SIZE) {
        const hit = { type: 'root-edge', nodeId: null, direction: 'bottom' };
        this._showPreview({ x: 0, y: ch * 0.7, w: cw, h: ch * 0.3 });
        return hit;
      }
    }

    // Check leaf zones
    const leaves = tree.getAllLeaves();
    for (const leaf of leaves) {
      const rect = layout.getRect(leaf.id);
      if (!rect) continue;

      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        // Inside this leaf — determine zone
        const lx = (x - rect.x) / rect.w; // 0-1 within leaf
        const ly = (y - rect.y) / rect.h;

        let hit;
        if (lx < ZONE_RATIO && lx < ly && lx < (1 - ly)) {
          hit = { type: 'split', nodeId: leaf.id, direction: 'left' };
          this._showPreview({ x: rect.x, y: rect.y, w: rect.w * 0.5, h: rect.h });
        } else if (lx > (1 - ZONE_RATIO) && (1 - lx) < ly && (1 - lx) < (1 - ly)) {
          hit = { type: 'split', nodeId: leaf.id, direction: 'right' };
          this._showPreview({ x: rect.x + rect.w * 0.5, y: rect.y, w: rect.w * 0.5, h: rect.h });
        } else if (ly < ZONE_RATIO && ly < lx && ly < (1 - lx)) {
          hit = { type: 'split', nodeId: leaf.id, direction: 'top' };
          this._showPreview({ x: rect.x, y: rect.y, w: rect.w, h: rect.h * 0.5 });
        } else if (ly > (1 - ZONE_RATIO) && (1 - ly) < lx && (1 - ly) < (1 - lx)) {
          hit = { type: 'split', nodeId: leaf.id, direction: 'bottom' };
          this._showPreview({ x: rect.x, y: rect.y + rect.h * 0.5, w: rect.w, h: rect.h * 0.5 });
        } else {
          // Center zone — merge as tab
          hit = { type: 'tab', nodeId: leaf.id, direction: null };
          this._showPreview(rect);
        }

        return hit;
      }
    }

    // Empty dock space — full area drop
    if (!tree.root) {
      const hit = { type: 'root-edge', nodeId: null, direction: 'center' };
      this._showPreview({ x: 0, y: 0, w: cw, h: ch });
      return hit;
    }

    this._hidePreview();
    return null;
  }

  _showPreview(rect) {
    this._previewEl.classList.remove('hidden');
    this._previewEl.style.left = `${rect.x}px`;
    this._previewEl.style.top = `${rect.y}px`;
    this._previewEl.style.width = `${rect.w}px`;
    this._previewEl.style.height = `${rect.h}px`;
  }

  _hidePreview() {
    this._previewEl.classList.add('hidden');
  }

  destroy() {
    if (this._previewEl && this._previewEl.parentNode) {
      this._previewEl.remove();
    }
  }
}
