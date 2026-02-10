/*
 * confirm.js - Custom confirm dialog using app modal styles
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * Show a confirm dialog using the app's modal styling.
 * @param {string} message - The confirmation message
 * @param {string} [confirmLabel='OK'] - Label for the confirm button
 * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled
 */
export function showConfirm(message, confirmLabel = "OK") {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "modal";
    dialog.innerHTML = `
      <div class="modal-content">
        <div class="modal-body">
          <p>${message}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-secondary confirm-cancel">Cancel</button>
          <button class="modal-btn modal-btn-primary confirm-ok">${confirmLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const cleanup = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector(".confirm-ok").addEventListener("click", () => cleanup(true));
    dialog.querySelector(".confirm-cancel").addEventListener("click", () => cleanup(false));
    dialog.addEventListener("cancel", () => cleanup(false));
  });
}
