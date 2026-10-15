import { describe, expect, it, vi } from "vitest";

import { HiddenStopWatcher, stopOwner } from "../../../src/js/debug/hidden-stops.js";

describe("stopOwner", () => {
  it("names the window that judges each kind of stop", () => {
    expect(stopOwner({ basicHit: true, switchHit: false, cpuHit: true })).toBe("basic-program");
    expect(stopOwner({ basicHit: false, switchHit: true, cpuHit: false })).toBe("soft-switches");
    expect(stopOwner({ basicHit: false, switchHit: false, cpuHit: true })).toBe("cpu-debugger");
  });

  it("leaves a pause made by hand alone", () => {
    expect(stopOwner({ basicHit: false, switchHit: false, cpuHit: false })).toBeNull();
  });
});

/** A machine stopped at a CPU breakpoint, with its window closed. */
function setup({ stillPausedAfterJudging }) {
  let paused = true;
  const wasmModule = {
    batch: vi.fn(async () => [paused, 1, 0xfd0c, 0, 0, 0, 0, 0]),
    _isPaused: vi.fn(async () => paused),
  };
  const win = {
    update: vi.fn(async () => {
      if (!stillPausedAfterJudging) paused = false;
    }),
  };
  const windowManager = {
    isWindowVisible: vi.fn(() => false),
    getWindow: vi.fn(() => win),
    showWindow: vi.fn(),
  };
  const notify = vi.fn();
  const watcher = new HiddenStopWatcher({ wasmModule, windowManager, isRunning: () => true, notify });
  return { watcher, win, windowManager, notify };
}

describe("HiddenStopWatcher", () => {
  it("lets the closed window judge the stop, and resumes quietly when it should not have stopped", async () => {
    const { watcher, win, windowManager, notify } = setup({ stillPausedAfterJudging: false });
    await watcher.poll();
    expect(win.update).toHaveBeenCalledOnce();
    expect(windowManager.showWindow).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("opens the window and says why when the stop stands, once", async () => {
    const { watcher, windowManager, notify } = setup({ stillPausedAfterJudging: true });
    await watcher.poll();
    expect(windowManager.showWindow).toHaveBeenCalledWith("cpu-debugger");
    expect(notify).toHaveBeenCalledOnce();
    // Closed again while still stopped there: not reopened.
    await watcher.poll();
    expect(windowManager.showWindow).toHaveBeenCalledOnce();
  });
});
