/*
 * index.js - Tool registry
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import * as a2eCommand from "./a2e-command.js";
import * as serverControl from "./server-control.js";
import * as setHttps from "./set-https.js";
import * as setDebug from "./set-debug.js";
import * as getState from "./get-state.js";
import * as showWindow from "./show-window.js";
import * as hideWindow from "./hide-window.js";
import * as focusWindow from "./focus-window.js";
import * as loadDiskImage from "./load-disk-image.js";

export const tools = [
  serverControl,
  setHttps,
  setDebug,
  getState,
  showWindow,
  hideWindow,
  focusWindow,
  a2eCommand,
  loadDiskImage,
];
