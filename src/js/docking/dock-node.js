/*
 * dock-node.js - Binary tree node for ImGui-style docking
 *
 * Each node is either a split (divides space between two children)
 * or a leaf (holds one or more tabbed windows).
 */

let _nextNodeId = 1;

export class DockNode {
  constructor() {
    this.id = _nextNodeId++;
    this.type = 'leaf'; // 'split' or 'leaf'

    // Split properties
    this.splitDirection = null; // 'h' (horizontal) or 'v' (vertical)
    this.splitRatio = 0.5;
    this.childA = null;
    this.childB = null;
    this.parent = null;

    // Leaf properties
    this.windowIds = [];
    this.activeTabIndex = 0;
  }

  get isLeaf() {
    return this.type === 'leaf';
  }

  get isSplit() {
    return this.type === 'split';
  }

  get activeWindowId() {
    if (!this.isLeaf || this.windowIds.length === 0) return null;
    return this.windowIds[Math.min(this.activeTabIndex, this.windowIds.length - 1)];
  }

  /**
   * Create a leaf node with the given window IDs.
   */
  static leaf(windowIds, activeTabIndex = 0) {
    const node = new DockNode();
    node.type = 'leaf';
    node.windowIds = Array.isArray(windowIds) ? [...windowIds] : [windowIds];
    node.activeTabIndex = activeTabIndex;
    return node;
  }

  /**
   * Create a split node dividing space between two children.
   * @param {'h'|'v'} direction - 'h' for horizontal (left/right), 'v' for vertical (top/bottom)
   * @param {number} ratio - Split ratio (0-1), fraction allocated to childA
   * @param {DockNode} childA - First child
   * @param {DockNode} childB - Second child
   */
  static split(direction, ratio, childA, childB) {
    const node = new DockNode();
    node.type = 'split';
    node.splitDirection = direction;
    node.splitRatio = ratio;
    node.childA = childA;
    node.childB = childB;
    childA.parent = node;
    childB.parent = node;
    return node;
  }

  /**
   * Serialize this node to a plain object.
   */
  serialize() {
    if (this.isLeaf) {
      return {
        type: 'leaf',
        wins: [...this.windowIds],
        active: this.activeTabIndex,
      };
    }
    return {
      type: 'split',
      dir: this.splitDirection,
      ratio: this.splitRatio,
      a: this.childA.serialize(),
      b: this.childB.serialize(),
    };
  }

  /**
   * Deserialize a plain object into a DockNode tree.
   */
  static deserialize(data) {
    if (!data) return null;
    if (data.type === 'leaf') {
      return DockNode.leaf(data.wins || [], data.active || 0);
    }
    if (data.type === 'split') {
      const a = DockNode.deserialize(data.a);
      const b = DockNode.deserialize(data.b);
      if (!a || !b) return a || b || null;
      return DockNode.split(data.dir, data.ratio, a, b);
    }
    return null;
  }
}
