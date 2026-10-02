/*
 * runtime.js - Which host the app is running in
 *
 * The same src/js runs in two hosts: a browser (the web build) and a native
 * webview under Tauri v2 (the desktop build). Code that has to behave
 * differently branches on isTauri() rather than living in a second copy.
 */

/** True when running inside the Tauri (desktop) webview. */
export function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
