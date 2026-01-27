/**
 * ReminderController - Manages floating reminder tooltips
 * Handles power, resize, and drives toggle reminders with positioning and persistence
 */

export class ReminderController {
  constructor() {
    this.isPowerReminderVisible = false;
    this.isDrivesReminderVisible = false;
    this.isBasicReminderVisible = false;
  }

  /**
   * Position a reminder tooltip below a target element with an arrow pointing to it.
   * Centers the reminder on the element, clamps to viewport, and sets arrow position.
   * @param {string} reminderId - The reminder element's ID
   * @param {string|Element} target - The target element ID or element to position below
   * @param {number} defaultWidth - Fallback width if reminder not yet rendered
   */
  positionReminderBelowElement(reminderId, target, defaultWidth = 200) {
    const reminder = document.getElementById(reminderId);
    const targetEl =
      typeof target === "string" ? document.getElementById(target) : target;
    if (!reminder || !targetEl) return;

    const targetRect = targetEl.getBoundingClientRect();
    const targetCenterX = targetRect.left + targetRect.width / 2;

    const reminderRect = reminder.getBoundingClientRect();
    const reminderWidth = reminderRect.width || defaultWidth;

    // Position reminder centered below target, clamped to viewport
    let reminderLeft = targetCenterX - reminderWidth / 2;
    const padding = 16;
    const maxLeft = window.innerWidth - reminderWidth - padding;
    reminderLeft = Math.max(padding, Math.min(reminderLeft, maxLeft));

    // Calculate arrow position relative to reminder
    const arrowLeft = targetCenterX - reminderLeft;

    reminder.style.left = `${reminderLeft}px`;
    reminder.style.top = `${targetRect.bottom + 15}px`;
    reminder.style.setProperty("--arrow-left", `${arrowLeft}px`);
  }

  // Power reminder methods

  repositionPowerReminder() {
    this.positionReminderBelowElement("power-reminder", "btn-power", 200);
  }

  showPowerReminder(show) {
    const reminder = document.getElementById("power-reminder");
    if (!reminder) return;

    // Check if already dismissed (first visit)
    if (show && localStorage.getItem("a2e-power-reminder-dismissed")) {
      return;
    }

    if (show) {
      this.isPowerReminderVisible = true;
      reminder.classList.remove("hidden");
      requestAnimationFrame(() => {
        this.repositionPowerReminder();
      });
    } else {
      this.isPowerReminderVisible = false;
      reminder.classList.add("hidden");
    }
  }

  dismissPowerReminder() {
    this.showPowerReminder(false);
    localStorage.setItem("a2e-power-reminder-dismissed", "true");
  }

  // Drives toggle reminder methods

  showDrivesReminder(show) {
    const reminder = document.getElementById("drives-reminder");
    if (!reminder) return;

    // Check if already dismissed
    if (show && localStorage.getItem("a2e-drives-reminder-dismissed")) {
      return;
    }

    if (show) {
      this.isDrivesReminderVisible = true;
      reminder.classList.remove("hidden");
      requestAnimationFrame(() => {
        this.repositionDrivesReminder();
      });
    } else {
      this.isDrivesReminderVisible = false;
      reminder.classList.add("hidden");
    }
  }

  repositionDrivesReminder() {
    this.positionReminderBelowElement("drives-reminder", "btn-drives", 180);
  }

  dismissDrivesReminder() {
    this.showDrivesReminder(false);
    localStorage.setItem("a2e-drives-reminder-dismissed", "true");
  }

  // BASIC reminder methods (shows when powered on without a disk)

  showBasicReminder(show) {
    const reminder = document.getElementById("basic-reminder");
    if (!reminder) return;

    // Check if already dismissed
    if (show && localStorage.getItem("a2e-basic-reminder-dismissed")) {
      return;
    }

    if (show) {
      this.isBasicReminderVisible = true;
      reminder.classList.remove("hidden");
      requestAnimationFrame(() => {
        this.repositionBasicReminder();
      });
    } else {
      this.isBasicReminderVisible = false;
      reminder.classList.add("hidden");
    }
  }

  repositionBasicReminder() {
    this.positionReminderBelowElement("basic-reminder", "btn-warm-reset", 220);
  }

  dismissBasicReminder() {
    this.showBasicReminder(false);
    localStorage.setItem("a2e-basic-reminder-dismissed", "true");
  }

  /**
   * Reposition all visible reminders (call after resize)
   */
  repositionAll() {
    if (this.isPowerReminderVisible) {
      requestAnimationFrame(() => this.repositionPowerReminder());
    }
    if (this.isDrivesReminderVisible) {
      requestAnimationFrame(() => this.repositionDrivesReminder());
    }
    if (this.isBasicReminderVisible) {
      requestAnimationFrame(() => this.repositionBasicReminder());
    }
  }
}
