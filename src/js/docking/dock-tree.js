/*
 * dock-tree.js - Tree mutations and queries for the dock layout
 *
 * Wraps a root DockNode and provides operations for splitting,
 * adding/removing tabs, collapsing empty leaves, and serialization.
 */

import { DockNode } from './dock-node.js';

export class DockTree {
  constructor(root = null) {
    this.root = root;
  }

  /**
   * Find the leaf node containing the given window ID.
   */
  findLeafContaining(windowId) {
    return this._findLeaf(this.root, windowId);
  }

  _findLeaf(node, windowId) {
    if (!node) return null;
    if (node.isLeaf) {
      return node.windowIds.includes(windowId) ? node : null;
    }
    return this._findLeaf(node.childA, windowId) || this._findLeaf(node.childB, windowId);
  }

  /**
   * Find a node by its ID.
   */
  findNodeById(nodeId) {
    return this._findById(this.root, nodeId);
  }

  _findById(node, nodeId) {
    if (!node) return null;
    if (node.id === nodeId) return node;
    if (node.isSplit) {
      return this._findById(node.childA, nodeId) || this._findById(node.childB, nodeId);
    }
    return null;
  }

  /**
   * Get all leaf nodes in the tree.
   */
  getAllLeaves() {
    const leaves = [];
    this._collectLeaves(this.root, leaves);
    return leaves;
  }

  _collectLeaves(node, out) {
    if (!node) return;
    if (node.isLeaf) {
      out.push(node);
    } else {
      this._collectLeaves(node.childA, out);
      this._collectLeaves(node.childB, out);
    }
  }

  /**
   * Get all docked window IDs.
   */
  getAllDockedWindowIds() {
    const ids = new Set();
    for (const leaf of this.getAllLeaves()) {
      for (const wid of leaf.windowIds) {
        ids.add(wid);
      }
    }
    return ids;
  }

  /**
   * Add a tab to an existing leaf node.
   */
  addTab(leaf, windowId) {
    if (!leaf.isLeaf) return;
    if (leaf.windowIds.includes(windowId)) {
      leaf.activeTabIndex = leaf.windowIds.indexOf(windowId);
      return;
    }
    leaf.windowIds.push(windowId);
    leaf.activeTabIndex = leaf.windowIds.length - 1;
  }

  /**
   * Remove a tab from a leaf node. Auto-collapses empty leaves.
   * Returns true if removal happened.
   */
  removeTab(leaf, windowId) {
    if (!leaf.isLeaf) return false;
    const idx = leaf.windowIds.indexOf(windowId);
    if (idx === -1) return false;

    leaf.windowIds.splice(idx, 1);

    // Adjust active tab index
    if (leaf.activeTabIndex >= leaf.windowIds.length) {
      leaf.activeTabIndex = Math.max(0, leaf.windowIds.length - 1);
    }

    // If leaf is now empty, collapse it
    if (leaf.windowIds.length === 0) {
      this._collapseLeaf(leaf);
    }

    return true;
  }

  /**
   * Split a leaf node in the given direction, placing the new window
   * in the new child (childB).
   * @param {DockNode} leaf - The leaf to split
   * @param {'left'|'right'|'top'|'bottom'} direction - Where to place the new window
   * @param {string} windowId - Window to add
   * @param {number} [ratio=0.5] - Split ratio
   */
  splitNode(leaf, direction, windowId, ratio = 0.5) {
    if (!leaf.isLeaf) return;

    const newLeaf = DockNode.leaf([windowId]);

    // Determine split direction and child order
    let splitDir, childA, childB;
    switch (direction) {
      case 'left':
        splitDir = 'h';
        childA = newLeaf;
        childB = this._cloneLeafAsNew(leaf);
        break;
      case 'right':
        splitDir = 'h';
        childA = this._cloneLeafAsNew(leaf);
        childB = newLeaf;
        break;
      case 'top':
        splitDir = 'v';
        childA = newLeaf;
        childB = this._cloneLeafAsNew(leaf);
        break;
      case 'bottom':
        splitDir = 'v';
        childA = this._cloneLeafAsNew(leaf);
        childB = newLeaf;
        break;
      default:
        return;
    }

    // Convert the existing leaf into a split node in-place
    leaf.type = 'split';
    leaf.splitDirection = splitDir;
    leaf.splitRatio = (direction === 'left' || direction === 'top') ? (1 - ratio) : ratio;
    leaf.childA = childA;
    leaf.childB = childB;
    childA.parent = leaf;
    childB.parent = leaf;

    // Clear leaf properties
    leaf.windowIds = [];
    leaf.activeTabIndex = 0;
  }

  /**
   * Clone a leaf's data into a fresh DockNode (used when converting a leaf to a split).
   */
  _cloneLeafAsNew(leaf) {
    return DockNode.leaf([...leaf.windowIds], leaf.activeTabIndex);
  }

  /**
   * Collapse an empty leaf by replacing its parent split with the sibling.
   */
  _collapseLeaf(emptyLeaf) {
    const parent = emptyLeaf.parent;
    if (!parent || !parent.isSplit) {
      // It's the root leaf — just clear the root
      if (this.root === emptyLeaf) {
        this.root = null;
      }
      return;
    }

    // Find sibling
    const sibling = (parent.childA === emptyLeaf) ? parent.childB : parent.childA;

    // Replace parent with sibling in the grandparent
    const grandparent = parent.parent;
    if (!grandparent) {
      // Parent is root — sibling becomes root
      this.root = sibling;
      sibling.parent = null;
    } else {
      if (grandparent.childA === parent) {
        grandparent.childA = sibling;
      } else {
        grandparent.childB = sibling;
      }
      sibling.parent = grandparent;
    }
  }

  /**
   * Serialize the tree to a plain object for persistence.
   */
  serialize() {
    if (!this.root) return null;
    return {
      version: 1,
      tree: this.root.serialize(),
    };
  }

  /**
   * Deserialize from a plain object.
   */
  static deserialize(data) {
    if (!data || !data.tree) return new DockTree(null);
    const root = DockNode.deserialize(data.tree);
    if (root) {
      // Rebuild parent pointers
      DockTree._rebuildParents(root, null);
    }
    return new DockTree(root);
  }

  static _rebuildParents(node, parent) {
    if (!node) return;
    node.parent = parent;
    if (node.isSplit) {
      DockTree._rebuildParents(node.childA, node);
      DockTree._rebuildParents(node.childB, node);
    }
  }

  /**
   * Validate the tree by removing references to windows that don't exist.
   * @param {Set<string>} validWindowIds - Set of valid window IDs
   */
  validate(validWindowIds) {
    if (!this.root) return;
    this._validateNode(this.root, validWindowIds);
  }

  _validateNode(node, validIds) {
    if (!node) return;
    if (node.isLeaf) {
      node.windowIds = node.windowIds.filter(id => validIds.has(id));
      if (node.activeTabIndex >= node.windowIds.length) {
        node.activeTabIndex = Math.max(0, node.windowIds.length - 1);
      }
      if (node.windowIds.length === 0) {
        this._collapseLeaf(node);
      }
    } else {
      this._validateNode(node.childA, validIds);
      this._validateNode(node.childB, validIds);
    }
  }
}
