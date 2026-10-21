/*
 * hidden-stops.js - Breakpoints that fire while their window is closed
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/*
 * Breakpoints are saved and armed in the core on every load, whether or not
 * a debugger window is open. But a breakpoint's condition and hit count are
 * judged by its window's update(), which only runs while the window is
 * visible. With the window closed, the core stopped at the breakpoint and
 * nothing either resumed it (condition not met) or said why it had stopped:
 * the machine simply froze, on every reload, until the browser's storage was
 * cleared.
 *
 * This watches for a stop the owning window cannot see. It lets that window
 * judge the stop exactly as it would if it were open, by running its update()
 * once, and if the machine is still stopped afterwards it shows the window
 * and says why.
 */

/** Which window owns a stop, from the core's hit flags, or null for a pause by hand. */
export function stopOwner({ basicHit, switchHit, cpuHit }) {
  if (basicHit) return "basic-program";
  if (switchHit) return "soft-switches";
  if (cpuHit) return "cpu-debugger";
  return null;
}

const WINDOW_NAMES = {
  "basic-program": "Applesoft BASIC",
  "soft-switches": "Soft Switches",
  "cpu-debugger": "CPU Debugger",
};

export class HiddenStopWatcher {
  /**
   * @param {object} deps
   * @param {object} deps.wasmModule
   * @param {object} deps.windowManager
   * @param {() => boolean} deps.isRunning - the machine is powered
   * @param {(message: string) => void} deps.notify
   */
  constructor({ wasmModule, windowManager, isRunning, notify }) {
    this.wasmModule = wasmModule;
    this.windowManager = windowManager;
    this.isRunning = isRunning;
    this.notify = notify;
    this.busy = false;
    // The stop already shown, so closing its window while the machine is
    // still stopped there does not open it again.
    this.shown = null;
  }

  async poll() {
    if (this.busy || !this.isRunning()) return;
    this.busy = true;
    try {
      const [paused, bpHit, bpAddr, wpHit, stackHit, beamHit, basicHit, switchHit] = await this.wasmModule.batch([
        ["_isPaused"],
        ["_isBreakpointHit"],
        ["_getBreakpointAddress"],
        ["_isWatchpointHit"],
        ["_isStackBreakpointHit"],
        ["_isBeamBreakpointHit"],
        ["_isBasicBreakpointHit"],
        ["_isSwitchBreakpointHit"],
      ]);
      if (!paused) {
        this.shown = null;
        return;
      }
      const owner = stopOwner({ basicHit, switchHit, cpuHit: bpHit || wpHit || stackHit || beamHit });
      if (!owner) return;
      const key = `${owner}:${bpAddr}`;
      if (key === this.shown) return;
      // An open window judges its own stops.
      if (this.windowManager.isWindowVisible(owner)) return;

      const win = this.windowManager.getWindow(owner);
      if (!win) return;
      // Judged as if open: a condition not met or a hit count not reached
      // resumes the machine here.
      await win.update(this.wasmModule);
      if (!(await this.wasmModule._isPaused())) return;

      this.shown = key;
      this.windowManager.showWindow(owner);
      this.notify(`Stopped at a breakpoint. ${WINDOW_NAMES[owner]} is open to show where.`);
    } catch (err) {
      console.warn("[breakpoints] could not check a stop:", err);
    } finally {
      this.busy = false;
    }
  }
}
