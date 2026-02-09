/*
 * toast.js - Lightweight toast notification system
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

let container = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a toast notification.
 * @param {string} message - The message to display
 * @param {'info'|'error'|'warning'} [type='info'] - Toast type for styling
 * @param {number} [duration=4000] - Duration in ms before auto-dismiss
 */
export function showToast(message, type = "info", duration = 6000) {
  const parent = ensureContainer();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  parent.appendChild(toast);

  // Trigger entrance animation
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  const dismiss = () => {
    toast.classList.remove("toast-visible");
    toast.addEventListener("transitionend", () => toast.remove());
  };

  toast.addEventListener("click", dismiss);
  setTimeout(dismiss, duration);
}
