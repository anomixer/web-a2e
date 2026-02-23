/*
 * dock-presets.js - Layout preset factory functions
 *
 * Each preset returns a DockTree instance with a predefined layout.
 */

import { DockNode } from './dock-node.js';
import { DockTree } from './dock-tree.js';

/**
 * Play preset: single leaf with the screen window.
 */
function play() {
  const root = DockNode.leaf(['screen-window']);
  const tree = new DockTree(root);
  return tree;
}

/**
 * Debug preset: screen on left, CPU + stack on right-top, memory on bottom.
 *
 *  split(H, 0.35)
 *    leaf[screen-window]
 *    split(V, 0.6)
 *      split(H, 0.65)
 *        leaf[cpu-debugger]
 *        leaf[stack-viewer]
 *      leaf[memory-browser]
 */
function debug() {
  const root = DockNode.split('h', 0.35,
    DockNode.leaf(['screen-window']),
    DockNode.split('v', 0.6,
      DockNode.split('h', 0.65,
        DockNode.leaf(['cpu-debugger']),
        DockNode.leaf(['stack-viewer'])
      ),
      DockNode.leaf(['memory-browser'])
    )
  );
  DockTree._rebuildParents(root, null);
  return new DockTree(root);
}

/**
 * Code preset: file explorer sidebar, screen + trace, BASIC editor.
 *
 *  split(H, 0.15)
 *    leaf[file-explorer-window]
 *    split(H, 0.55)
 *      split(V, 0.65)
 *        leaf[screen-window]
 *        leaf[trace-panel]
 *      leaf[basic-program]
 */
function code() {
  const root = DockNode.split('h', 0.15,
    DockNode.leaf(['file-explorer-window']),
    DockNode.split('h', 0.55,
      DockNode.split('v', 0.65,
        DockNode.leaf(['screen-window']),
        DockNode.leaf(['trace-panel'])
      ),
      DockNode.leaf(['basic-program'])
    )
  );
  DockTree._rebuildParents(root, null);
  return new DockTree(root);
}

export const PRESETS = { play, debug, code };
