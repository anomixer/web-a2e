/**
 * DiskDrivePositioner - Handles drag-to-move for the disk drives container
 * Supports dragging to reposition and double-click to reset to default position
 */

export class DiskDrivePositioner {
  constructor() {
    // Custom position (user-defined via drag)
    this.customPosition = null; // { x, y } or null for default

    // Drag state
    this.isDragging = false;
    this.dragStart = null;

    // Bind methods for event listeners
    this.handleDragMove = this.handleDragMove.bind(this);
    this.handleDragEnd = this.handleDragEnd.bind(this);
  }

  /**
   * Initialize the positioner
   */
  init() {
    this.loadSavedPosition();
    this.setupDrag();
    this.applyPosition();
    this.updatePositionIndicator();
  }

  /**
   * Load saved position from localStorage
   */
  loadSavedPosition() {
    const savedPosition = localStorage.getItem("a2e-drives-position");
    if (savedPosition) {
      try {
        this.customPosition = JSON.parse(savedPosition);
      } catch (e) {
        this.customPosition = null;
      }
    }
  }

  /**
   * Set up drag-to-move functionality
   */
  setupDrag() {
    const container = document.querySelector(".disk-drives-container");
    if (!container) return;

    // Add position indicator
    this.createPositionIndicator(container);

    // Drag on the container
    container.addEventListener("mousedown", (e) => {
      // Don't start drag if clicking on buttons, inputs, or dropdowns
      if (
        e.target.closest("button") ||
        e.target.closest("input") ||
        e.target.closest(".recent-dropdown") ||
        e.target.closest(".drives-position-indicator")
      ) {
        return;
      }

      e.preventDefault();
      this.startDrag(e);
    });

    // Double-click to reset position
    container.addEventListener("dblclick", (e) => {
      // Don't reset if clicking on controls
      if (
        e.target.closest("button") ||
        e.target.closest("input") ||
        e.target.closest(".recent-dropdown") ||
        e.target.closest(".drives-position-indicator")
      ) {
        return;
      }

      this.resetToDefault();
    });

    document.addEventListener("mousemove", this.handleDragMove);
    document.addEventListener("mouseup", this.handleDragEnd);
  }

  /**
   * Create the position indicator element
   */
  createPositionIndicator(container) {
    const indicator = document.createElement("button");
    indicator.id = "drives-position-indicator";
    indicator.className = "drives-position-indicator hidden";
    indicator.title = "Custom position - Click to reset (or double-click drives)";
    indicator.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M12 2v4"></path>
        <path d="M12 18v4"></path>
        <path d="M2 12h4"></path>
        <path d="M18 12h4"></path>
      </svg>
    `;
    indicator.addEventListener("click", (e) => {
      e.stopPropagation();
      this.resetToDefault();
    });
    container.appendChild(indicator);
  }

  /**
   * Start dragging
   */
  startDrag(e) {
    // Don't allow dragging in full-page mode or fullscreen
    if (document.body.classList.contains("full-page-mode") || document.fullscreenElement) {
      return;
    }

    const container = document.querySelector(".disk-drives-container");
    if (!container) return;

    this.isDragging = true;
    container.classList.add("dragging");

    const rect = container.getBoundingClientRect();
    this.dragStart = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elemX: rect.left,
      elemY: rect.top,
    };
  }

  /**
   * Handle mouse move during drag
   */
  handleDragMove(e) {
    if (!this.isDragging) return;

    const dx = e.clientX - this.dragStart.mouseX;
    const dy = e.clientY - this.dragStart.mouseY;

    // Calculate new position
    let newX = this.dragStart.elemX + dx;
    let newY = this.dragStart.elemY + dy;

    // Get bounds
    const container = document.querySelector(".disk-drives-container");
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");

    const headerHeight = header ? header.offsetHeight : 0;
    const footerHeight = footer ? footer.offsetHeight : 0;

    // Constrain to viewport
    const minVisible = 50;
    newX = Math.max(-rect.width + minVisible, Math.min(window.innerWidth - minVisible, newX));
    newY = Math.max(headerHeight, Math.min(window.innerHeight - footerHeight - minVisible, newY));

    this.customPosition = { x: newX, y: newY };
    this.applyPosition();
  }

  /**
   * Handle mouse up to complete drag
   */
  handleDragEnd() {
    if (!this.isDragging) return;

    const container = document.querySelector(".disk-drives-container");
    if (container) {
      container.classList.remove("dragging");
    }

    this.isDragging = false;
    this.dragStart = null;

    if (this.customPosition) {
      localStorage.setItem("a2e-drives-position", JSON.stringify(this.customPosition));
      this.updatePositionIndicator();
    }
  }

  /**
   * Apply the current position
   */
  applyPosition() {
    const container = document.querySelector(".disk-drives-container");
    if (!container) return;

    if (this.customPosition) {
      container.classList.add("free-position");
      container.style.left = this.customPosition.x + "px";
      container.style.top = this.customPosition.y + "px";
    } else {
      container.classList.remove("free-position");
      container.style.left = "";
      container.style.top = "";
    }
  }

  /**
   * Reset to default position
   */
  resetToDefault() {
    this.customPosition = null;
    localStorage.removeItem("a2e-drives-position");
    this.applyPosition();
    this.updatePositionIndicator();
  }

  /**
   * Update the position indicator visibility
   */
  updatePositionIndicator() {
    const indicator = document.getElementById("drives-position-indicator");
    if (!indicator) return;

    if (this.customPosition) {
      indicator.classList.remove("hidden");
    } else {
      indicator.classList.add("hidden");
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    document.removeEventListener("mousemove", this.handleDragMove);
    document.removeEventListener("mouseup", this.handleDragEnd);
  }
}
