/**
 * DocumentationDialog - Manages the Help & Documentation modal
 * Handles F1 key shortcut, section navigation, and modal open/close
 */

export class DocumentationDialog {
  constructor() {
    this.modal = null;
    this.navButtons = null;
    this.sections = null;
    this.closeButton = null;
    this.helpButton = null;
    this.isOpen = false;
  }

  /**
   * Initialize the dialog - find elements and set up event listeners
   */
  init() {
    this.modal = document.getElementById("documentation-modal");
    if (!this.modal) {
      console.warn("Documentation modal element not found");
      return;
    }

    this.navButtons = this.modal.querySelectorAll(".documentation-nav button");
    this.sections = this.modal.querySelectorAll(".documentation-section");
    this.closeButton = this.modal.querySelector(".documentation-close");
    this.helpButton = document.getElementById("btn-help");

    this.setupEventListeners();
  }

  /**
   * Set up all event listeners
   */
  setupEventListeners() {
    // Help button click
    if (this.helpButton) {
      this.helpButton.addEventListener("click", () => this.toggle());
    }

    // Close button click
    if (this.closeButton) {
      this.closeButton.addEventListener("click", () => this.hide());
    }

    // Navigation button clicks
    this.navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const sectionId = btn.dataset.section;
        this.showSection(sectionId);
      });
    });

    // Close on backdrop click (clicking the dialog element itself, not content)
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    // Close on Escape key (handled by dialog natively, but we track state)
    this.modal.addEventListener("close", () => {
      this.isOpen = false;
      this.refocusCanvas();
    });

    // F1 key global shortcut
    document.addEventListener("keydown", (e) => {
      if (e.key === "F1") {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  /**
   * Show the documentation modal
   */
  show() {
    if (!this.modal) return;
    this.modal.showModal();
    this.isOpen = true;
  }

  /**
   * Hide the documentation modal
   */
  hide() {
    if (!this.modal) return;
    this.modal.close();
    this.isOpen = false;
    this.refocusCanvas();
  }

  /**
   * Toggle the documentation modal
   */
  toggle() {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show a specific section by ID
   * @param {string} sectionId - The section ID to show (without 'doc-' prefix)
   */
  showSection(sectionId) {
    // Update nav button active states
    this.navButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === sectionId);
    });

    // Show/hide sections
    this.sections.forEach((section) => {
      const isTarget = section.id === `doc-${sectionId}`;
      section.classList.toggle("active", isTarget);
    });
  }

  /**
   * Return focus to canvas after closing modal
   */
  refocusCanvas() {
    const canvas = document.getElementById("screen");
    if (canvas) {
      setTimeout(() => canvas.focus(), 0);
    }
  }
}
