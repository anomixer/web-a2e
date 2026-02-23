/*
 * dock-layout.js - Recursive layout engine for the dock tree
 *
 * Computes pixel rects for each node and creates/positions DOM elements
 * (leaves, splitters) inside the dock space container. All elements use
 * position: absolute for pure pixel-math layout.
 */

const SPLITTER_SIZE = 4;
const MIN_RATIO = 0.05;
const MAX_RATIO = 0.95;

export class DockLayout {
  constructor(container) {
    this.container = container;
    this.leafElements = new Map();   // nodeId → DOM element
    this.splitterElements = new Map(); // nodeId → DOM element (keyed by parent split node ID)
    this._rects = new Map();         // nodeId → { x, y, w, h }
    this._splitterDrag = null;

    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
  }

  /**
   * Rebuild DOM elements and compute layout for the entire tree.
   */
  rebuild(tree, windowManager) {
    this._clearDOM();
    if (!tree.root) return;

    const rect = {
      x: 0, y: 0,
      w: this.container.clientWidth,
      h: this.container.clientHeight,
    };

    this._layoutNode(tree.root, rect, windowManager);
  }

  /**
   * Recalculate positions without rebuilding DOM (e.g., during splitter drag).
   */
  recalculate(tree) {
    if (!tree.root) return;
    const rect = {
      x: 0, y: 0,
      w: this.container.clientWidth,
      h: this.container.clientHeight,
    };
    this._recalcNode(tree.root, rect);
  }

  /**
   * Get the computed rect for a node.
   */
  getRect(nodeId) {
    return this._rects.get(nodeId);
  }

  /**
   * Get the leaf DOM element for a node.
   */
  getLeafElement(nodeId) {
    return this.leafElements.get(nodeId);
  }

  _clearDOM() {
    for (const el of this.leafElements.values()) {
      el.remove();
    }
    for (const el of this.splitterElements.values()) {
      el.remove();
    }
    this.leafElements.clear();
    this.splitterElements.clear();
    this._rects.clear();
  }

  /**
   * Compute child rects for a split node.
   * @returns {{ rectA, rectSplitter, rectB }}
   */
  _computeChildRects(node, rect) {
    const isH = node.splitDirection === 'h';
    const totalSize = isH ? rect.w : rect.h;
    const sizeA = Math.round(totalSize * node.splitRatio - SPLITTER_SIZE / 2);
    const sizeB = totalSize - sizeA - SPLITTER_SIZE;

    if (isH) {
      return {
        rectA: { x: rect.x, y: rect.y, w: sizeA, h: rect.h },
        rectSplitter: { x: rect.x + sizeA, y: rect.y, w: SPLITTER_SIZE, h: rect.h },
        rectB: { x: rect.x + sizeA + SPLITTER_SIZE, y: rect.y, w: sizeB, h: rect.h },
      };
    }
    return {
      rectA: { x: rect.x, y: rect.y, w: rect.w, h: sizeA },
      rectSplitter: { x: rect.x, y: rect.y + sizeA, w: rect.w, h: SPLITTER_SIZE },
      rectB: { x: rect.x, y: rect.y + sizeA + SPLITTER_SIZE, w: rect.w, h: sizeB },
    };
  }

  _layoutNode(node, rect, windowManager) {
    this._rects.set(node.id, { ...rect });

    if (node.isLeaf) {
      this._createLeafElement(node, rect, windowManager);
      return;
    }

    const { rectA, rectSplitter, rectB } = this._computeChildRects(node, rect);
    this._createSplitterElement(node, rectSplitter);
    this._layoutNode(node.childA, rectA, windowManager);
    this._layoutNode(node.childB, rectB, windowManager);
  }

  _recalcNode(node, rect) {
    this._rects.set(node.id, { ...rect });

    if (node.isLeaf) {
      const el = this.leafElements.get(node.id);
      if (el) {
        this._positionElement(el, rect);
      }
      return;
    }

    const { rectA, rectSplitter, rectB } = this._computeChildRects(node, rect);

    const splEl = this.splitterElements.get(node.id);
    if (splEl) {
      this._positionElement(splEl, rectSplitter);
    }

    this._recalcNode(node.childA, rectA);
    this._recalcNode(node.childB, rectB);
  }

  _createLeafElement(node, rect, windowManager) {
    const el = document.createElement('div');
    el.className = 'dock-leaf';
    el.dataset.nodeId = String(node.id);

    // Tab bar (single-tab class is managed by DockTabBar.renderTabs)
    const tabBar = document.createElement('div');
    tabBar.className = 'dock-tab-bar';
    el.appendChild(tabBar);

    // Content area
    const content = document.createElement('div');
    content.className = 'dock-leaf-content';
    el.appendChild(content);

    this._positionElement(el, rect);
    this.container.appendChild(el);
    this.leafElements.set(node.id, el);
  }

  _createSplitterElement(node, rect) {
    const el = document.createElement('div');
    const isH = node.splitDirection === 'h';
    el.className = `dock-splitter dock-splitter-${isH ? 'h' : 'v'}`;
    el.dataset.nodeId = String(node.id);

    this._positionElement(el, rect);
    this.container.appendChild(el);
    this.splitterElements.set(node.id, el);

    // Splitter drag
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._startSplitterDrag(node, e);
    });
  }

  _positionElement(el, rect) {
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
  }

  // --- Splitter drag ---

  _startSplitterDrag(node, e) {
    const isH = node.splitDirection === 'h';

    this._splitterDrag = {
      node,
      isH,
      startPos: isH ? e.clientX : e.clientY,
      startRatio: node.splitRatio,
      containerOffset: isH
        ? this.container.getBoundingClientRect().left
        : this.container.getBoundingClientRect().top,
    };

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
    document.body.classList.add('dock-splitter-dragging');
    if (isH) {
      document.body.style.cursor = 'col-resize';
    } else {
      document.body.style.cursor = 'row-resize';
    }
  }

  _handleMouseMove(e) {
    if (!this._splitterDrag) return;
    const { node, isH, containerOffset } = this._splitterDrag;

    const parentRect = this._rects.get(node.id);
    if (!parentRect) return;

    const totalSize = isH ? parentRect.w : parentRect.h;
    const parentStart = isH ? parentRect.x : parentRect.y;
    const mousePos = (isH ? e.clientX : e.clientY) - containerOffset;
    const relPos = mousePos - parentStart;

    let newRatio = (relPos + SPLITTER_SIZE / 2) / totalSize;
    newRatio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, newRatio));
    node.splitRatio = newRatio;

    // Recalculate layout from root
    if (this.onRecalculate) {
      this.onRecalculate();
    }
  }

  _handleMouseUp() {
    if (!this._splitterDrag) return;
    this._splitterDrag = null;
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.body.classList.remove('dock-splitter-dragging');
    document.body.style.cursor = '';

    if (this.onSplitterDragEnd) {
      this.onSplitterDragEnd();
    }
  }

  /**
   * Clean up all DOM elements and event listeners.
   */
  destroy() {
    this._clearDOM();
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
  }
}
