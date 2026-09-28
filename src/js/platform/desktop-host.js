/*
 * desktop-host.js - What the desktop build does differently from the browser
 *
 * Nothing, in the browser: installDesktopHost() returns straight away there.
 *
 * Under Tauri it marks <html> with `tauri-host`, which is what hides the
 * header (native-menu.js puts all of it in the menu bar), rewords the hints
 * that point at header controls, and sends links meant for a new tab to the
 * user's own browser. A webview has no tabs,
 * so a target="_blank" link otherwise does nothing at all.
 */

import { isTauri } from "./runtime.js";

async function openExternal(url) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch (err) {
    console.error("[desktop-host] could not open link:", err);
  }
}

export function installDesktopHost() {
  if (!isTauri()) return;
  document.documentElement.classList.add("tauri-host");

  // Hints that name a header control name the menu item instead, since the
  // desktop build has no header.
  for (const el of document.querySelectorAll("[data-desktop-html]")) {
    el.innerHTML = el.dataset.desktopHtml;
  }

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      const external = url.origin !== window.location.origin;
      if (link.target !== "_blank" && !external) return;
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      event.preventDefault();
      openExternal(url.href);
    },
    true,
  );
}
