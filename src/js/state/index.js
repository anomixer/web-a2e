/*
 * index.js - State subsystem initialization and exports
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

export { StateManager } from "./state-manager.js";
export {
  saveStateToStorage,
  loadStateFromStorage,
  clearStateFromStorage,
  hasSavedState,
  getSavedStateTimestamp,
} from "./state-persistence.js";
