/*
 * dock-presets.js - Layout preset factory functions
 *
 * Each preset returns a DockTree instance with a predefined window layout.
 * The "play" preset is loaded by default for first-time users (see dock-manager.js).
 * Once a user customises a preset (dragging splitters, adding/removing windows),
 * their version is saved to localStorage and used instead of the factory default.
 *
 * ─── Building blocks ───────────────────────────────────────────────────────
 *
 *   DockNode.leaf(['window-id'])
 *     A single pane showing one window. Pass multiple IDs for tabbed panes:
 *       DockNode.leaf(['cpu-debugger', 'stack-viewer'])   // two tabs
 *
 *   DockNode.split(direction, ratio, childA, childB)
 *     Splits space between two children.
 *       direction : 'h' = side-by-side (horizontal split)
 *                   'v' = top/bottom   (vertical split)
 *       ratio     : 0.0–1.0, fraction of space given to childA
 *       childA    : left  (h) or top    (v) child — a leaf or nested split
 *       childB    : right (h) or bottom (v) child — a leaf or nested split
 *
 * ─── Example ───────────────────────────────────────────────────────────────
 *
 *   To create a layout with a sidebar on the left (20% width) and a main
 *   area split vertically (60% top, 40% bottom):
 *
 *     DockNode.split('h', 0.2,
 *       DockNode.leaf(['file-explorer-window']),      // left sidebar
 *       DockNode.split('v', 0.6,
 *         DockNode.leaf(['screen-window']),            // top-right
 *         DockNode.leaf(['cpu-debugger']),              // bottom-right
 *       ),
 *     )
 *
 *   Any split tree deeper than a single leaf needs:
 *     DockTree._rebuildParents(root, null);
 *
 * ─── Available window IDs ──────────────────────────────────────────────────
 *
 *   Emulator:
 *     screen-window          - Apple //e display
 *     disk-drives            - Floppy disk drive controls
 *     hard-drives            - SmartPort hard drive controls
 *     file-explorer-window   - DOS 3.3 / ProDOS file browser
 *     display-settings       - CRT shader and display options
 *     joystick               - Joystick / paddle controls
 *     slot-configuration     - Expansion slot configuration
 *     save-states            - Save state manager
 *
 *   Debug:
 *     cpu-debugger           - CPU registers, breakpoints, disassembly
 *     memory-browser         - Hex/ASCII memory viewer with search
 *     memory-heatmap         - Real-time memory access heatmap
 *     memory-map             - Address space layout overview
 *     stack-viewer           - Live stack contents
 *     zeropage-watch         - Zero page location monitor
 *     soft-switches          - Soft switch state monitor ($C000–$C0FF)
 *     trace-panel            - Execution trace log
 *     rule-builder           - Conditional breakpoint builder
 *     mockingboard-debug     - Mockingboard AY / VIA registers
 *     mouse-card-debug       - Mouse card PIA / position / state
 *
 *   Programming:
 *     basic-program          - BASIC program viewer / editor
 *     assembler-editor       - 6502 assembler editor
 *
 *   Serial:
 *     serial-connection      - Super Serial Card connection
 *
 *   Help:
 *     documentation-window   - Documentation viewer
 *     release-notes          - Release notes
 */

import { DockNode } from "./dock-node.js";
import { DockTree } from "./dock-tree.js";

/**
 * Play preset: full-screen emulator display.
 *
 *   ┌──────────────────────┐
 *   │    screen-window     │
 *   └──────────────────────┘
 */
function play() {
  const root = DockNode.leaf(["screen-window"]);
  return new DockTree(root);
}

/**
 * Debug preset: screen on the left, debugger tools on the right.
 *
 *   ┌────────┬──────────┬──────┐
 *   │        │cpu-debug │stack │
 *   │ screen ├──────────┴──────┤
 *   │        │  memory-browser │
 *   └────────┴─────────────────┘
 *     35%     ├── 65% ──┤ 35% │
 *             ├── 60% top ─────┤
 *             ├── 40% bottom ──┤
 */
function debug() {
  const root = DockNode.split(
    "h",
    0.35,
    DockNode.leaf(["screen-window"]),
    DockNode.split(
      "v",
      0.6,
      DockNode.split(
        "h",
        0.65,
        DockNode.leaf(["cpu-debugger"]),
        DockNode.leaf(["stack-viewer"]),
      ),
      DockNode.leaf(["memory-browser"]),
    ),
  );
  DockTree._rebuildParents(root, null);
  return new DockTree(root);
}

/**
 * Code preset: file explorer sidebar with screen, trace log, and BASIC editor.
 *
 *   ┌──────┬──────────┬────────────┐
 *   │      │  screen  │            │
 *   │ file ├──────────┤   basic    │
 *   │ expl │  trace   │  program   │
 *   └──────┴──────────┴────────────┘
 *    15%    ├── 55% ──┤─── 45% ────┤
 *           ├─ 65% ───┤
 *           ├─ 35% ───┤
 */
function code() {
  const root = DockNode.split(
    "h",
    0.45,
    DockNode.split(
      "v",
      0.65,
      DockNode.leaf(["screen-window"]),
      DockNode.leaf(["soft-switches"]),
    ),
    DockNode.leaf(["basic-program", "assembler-editor"]),
  );
  DockTree._rebuildParents(root, null);
  return new DockTree(root);
}

export const PRESETS = { play, debug, code };
