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
/**
 * Ask for a single line of text using the app's modal styling.
 *
 * Used where a native save dialog is wanted but unavailable: Safari and Firefox
 * have no File System Access API, so the only way to save is a download, which
 * names the file for you and offers no way to decline. This at least lets the
 * name be chosen and the save be cancelled.
 *
 * @param {string} message - Prompt text
 * @param {string} [defaultValue=''] - Initial value
 * @param {string} [confirmLabel='Save'] - Label for the confirm button
 * @returns {Promise<string|null>} The entered text, or null if cancelled
 */
export function showPrompt(message, defaultValue = "", confirmLabel = "Save") {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "modal";
    dialog.innerHTML = `
      <div class="modal-content">
        <div class="modal-body">
          <p>${message}</p>
          <input type="text" class="modal-input prompt-value" value="${defaultValue.replace(/"/g, "&quot;")}">
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-secondary prompt-cancel">Cancel</button>
          <button class="modal-btn modal-btn-primary prompt-ok">${confirmLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const input = dialog.querySelector(".prompt-value");
    input.focus();
    input.select();

    const cleanup = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    const accept = () => {
      const value = input.value.trim();
      cleanup(value || null);
    };

    dialog.querySelector(".prompt-ok").addEventListener("click", accept);
    dialog.querySelector(".prompt-cancel").addEventListener("click", () => cleanup(null));
    dialog.addEventListener("cancel", () => cleanup(null));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        accept();
      }
    });
  });
}

/**
 * Ask for a filename and a choice from a list, in one dialog.
 *
 * Used by the disk save flow, where the format decides the file extension —
 * asking for them separately would let the two disagree.
 *
 * @param {Object} options
 * @param {string} options.message - Prompt text
 * @param {string} [options.defaultValue] - Initial filename
 * @param {Array<{value: string, label: string, hint?: string, disabled?: boolean}>} options.choices
 * @param {string} options.selected - Initially selected choice value
 * @param {string} [options.confirmLabel] - Label for the confirm button
 * @param {Function} [options.onChoiceChange] - (value, currentName) => newName
 * @returns {Promise<{value: string, name: string}|null>} null if cancelled
 */
export function showChoicePrompt({
  message,
  defaultValue = "",
  choices,
  selected,
  confirmLabel = "Save",
  onChoiceChange = null,
}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "modal";

    const optionsHtml = choices
      .map((choice) => {
        const disabled = choice.disabled ? " disabled" : "";
        const checked = choice.value === selected && !choice.disabled ? " checked" : "";
        const hint = choice.hint
          ? `<span class="choice-hint">${choice.hint}</span>`
          : "";
        return `
          <label class="choice-row${choice.disabled ? " choice-disabled" : ""}">
            <input type="radio" name="save-format" value="${choice.value}"${checked}${disabled}>
            <span class="choice-label">${choice.label}</span>
            ${hint}
          </label>`;
      })
      .join("");

    dialog.innerHTML = `
      <div class="modal-content">
        <div class="modal-body">
          <p>${message}</p>
          <div class="choice-list">${optionsHtml}</div>
          <input type="text" class="modal-input prompt-value" value="${defaultValue.replace(/"/g, "&quot;")}">
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-secondary prompt-cancel">Cancel</button>
          <button class="modal-btn modal-btn-primary prompt-ok">${confirmLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const input = dialog.querySelector(".prompt-value");
    input.focus();
    input.select();

    const currentChoice = () =>
      dialog.querySelector('input[name="save-format"]:checked')?.value ?? selected;

    const cleanup = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    const accept = () => {
      const name = input.value.trim();
      cleanup(name ? { value: currentChoice(), name } : null);
    };

    if (onChoiceChange) {
      dialog.querySelectorAll('input[name="save-format"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          input.value = onChoiceChange(radio.value, input.value.trim());
        });
      });
    }

    dialog.querySelector(".prompt-ok").addEventListener("click", accept);
    dialog.querySelector(".prompt-cancel").addEventListener("click", () => cleanup(null));
    dialog.addEventListener("cancel", () => cleanup(null));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        accept();
      }
    });
  });
}

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
