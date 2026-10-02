/*
 * screen-drop.js - Insert a disk image dropped on the screen
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { mediaKind, dropUnit } from "./media-kind.js";
import { showToast } from "../ui/toast.js";

/*
 * The screen is in the Screen window normally (which may be docked, so its
 * own element is not always there to match) and in #monitor-frame in full
 * page mode, and the canvas moves between them, so the listeners go on the
 * document and a drop counts if it lands on either. A floppy goes into the
 * first empty drive, a hard disk image into the first empty SmartPort device,
 * and either replaces unit 1 when every unit is full (see media-kind.js for
 * which is which, the same rule as the native app's).
 */
const SCREEN_SELECTOR = "#monitor-frame, .screen-window-content";

function screenUnder(event) {
  return event.target instanceof Element ? event.target.closest(SCREEN_SELECTOR) : null;
}

function carriesFiles(event) {
  return event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files");
}

async function insert(file, { diskManager, hardDriveManager }) {
  const kind = mediaKind(file.name, file.size);
  if (kind === "floppy") {
    const drive = dropUnit(diskManager.drives);
    await diskManager.loadDisk(drive, file);
    if (diskManager.drives[drive].filename === file.name) {
      showToast(`${file.name} inserted in drive ${drive + 1}`, "info", 3000);
    }
    return true;
  }
  if (kind === "smartport") {
    if (!(await hardDriveManager.isSmartPortInstalled())) {
      showToast(
        `${file.name} is a hard disk image, and there is no SmartPort to take it. Fit a SmartPort card in the Expansion Slots window first.`,
        "error",
      );
      return true;
    }
    const device = dropUnit(hardDriveManager.devices);
    await hardDriveManager.loadImage(device, file);
    if (hardDriveManager.devices[device].filename === file.name) {
      showToast(`${file.name} inserted in SmartPort device ${device + 1}`, "info", 3000);
    }
    return true;
  }
  return false;
}

/**
 * @param {{diskManager: object, hardDriveManager: object, refocus?: Function}} managers
 */
export function setupScreenDrop(managers) {
  let highlighted = null;
  const highlight = (element) => {
    if (highlighted === element) return;
    highlighted?.classList.remove("drag-over");
    highlighted = element;
    highlighted?.classList.add("drag-over");
  };

  document.addEventListener("dragover", (event) => {
    const screen = screenUnder(event);
    if (!screen || !carriesFiles(event)) {
      highlight(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    highlight(screen);
  });

  document.addEventListener("dragleave", (event) => {
    // Leaving for a child of the screen is not leaving the screen.
    if (highlighted && !highlighted.contains(event.relatedTarget)) highlight(null);
  });

  document.addEventListener("drop", async (event) => {
    const screen = screenUnder(event);
    highlight(null);
    if (!screen || !carriesFiles(event)) return;
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    // The first disk image among them, as the native app takes.
    for (const file of files) {
      if (await insert(file, managers)) {
        managers.refocus?.();
        return;
      }
    }
    if (files.length > 0) {
      showToast(`${files[0].name} is not a disk image the emulator can use.`, "error");
    }
  });
}
