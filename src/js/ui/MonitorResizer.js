/**
 * MonitorResizer - Handles monitor/canvas resizing with aspect ratio lock
 * Supports both automatic window-based sizing and manual drag-to-resize
 */

export class MonitorResizer {
  constructor(options = {}) {
    // Display aspect ratio (4:3 for authentic CRT monitor)
    this.aspectRatio = options.aspectRatio || 4 / 3;

    // Callbacks
    this.onResize = options.onResize || null;
    this.onResizeComplete = options.onResizeComplete || null;

    // Custom screen size (user-defined via mouse resize)
    this.customCanvasWidth = null;

    // Resize state
    this.isResizingMonitor = false;
    this.resizeDirection = null;
    this.resizeStart = null;
    this.resizeObserver = null;

    // Bind methods for event listeners
    this.handleResize = this.handleResize.bind(this);
    this.handleMonitorMouseMove = this.handleMonitorMouseMove.bind(this);
    this.handleMonitorMouseUp = this.handleMonitorMouseUp.bind(this);
  }

  /**
   * Initialize the resizer
   */
  init() {
    this.loadSavedSize();
    this.setupResizeHandling();
    this.setupMonitorResize();
    this.handleResize();
    this.updateSizeLockIndicator();
  }

  /**
   * Load saved custom screen size from localStorage
   */
  loadSavedSize() {
    const savedWidth = localStorage.getItem("a2e-screen-width");
    if (savedWidth) {
      this.customCanvasWidth = parseInt(savedWidth, 10);
    }
  }

  /**
   * Set up window resize handling
   */
  setupResizeHandling() {
    window.addEventListener("resize", this.handleResize);

    if (typeof ResizeObserver !== "undefined") {
      const main = document.querySelector("main");
      if (main) {
        this.resizeObserver = new ResizeObserver(() => {
          this.handleResize();
        });
        this.resizeObserver.observe(main);
      }
    }
  }

  /**
   * Set up monitor corner drag handles for manual resizing
   */
  setupMonitorResize() {
    const monitorBezel = document.querySelector(".monitor-bezel");
    if (!monitorBezel) return;

    const handles = monitorBezel.querySelectorAll(".monitor-resize-handle");

    handles.forEach((handle) => {
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.startMonitorResize(e, handle.dataset.direction);
      });
    });

    document.addEventListener("mousemove", this.handleMonitorMouseMove);
    document.addEventListener("mouseup", this.handleMonitorMouseUp);

    const sizeLockIndicator = document.getElementById("size-lock-indicator");
    if (sizeLockIndicator) {
      sizeLockIndicator.addEventListener("click", () => {
        this.resetToAutoSize();
      });
    }
  }

  /**
   * Reset to automatic sizing (remove custom size)
   */
  resetToAutoSize() {
    this.customCanvasWidth = null;
    localStorage.removeItem("a2e-screen-width");
    this.updateSizeLockIndicator();
    this.handleResize();
  }

  /**
   * Update the size lock indicator visibility
   */
  updateSizeLockIndicator() {
    const indicator = document.getElementById("size-lock-indicator");
    if (!indicator) return;

    if (this.customCanvasWidth) {
      indicator.classList.remove("hidden");
    } else {
      indicator.classList.add("hidden");
    }
  }

  /**
   * Start a manual resize operation
   */
  startMonitorResize(e, direction) {
    const canvas = document.getElementById("screen");
    const monitorBezel = document.querySelector(".monitor-bezel");
    if (!canvas || !monitorBezel) return;

    this.isResizingMonitor = true;
    this.resizeDirection = direction;
    monitorBezel.classList.add("resizing");

    const rect = canvas.getBoundingClientRect();
    this.resizeStart = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
    };
  }

  /**
   * Handle mouse move during resize
   */
  handleMonitorMouseMove(e) {
    if (!this.isResizingMonitor) return;

    const dx = e.clientX - this.resizeStart.x;
    const dy = e.clientY - this.resizeStart.y;
    const dir = this.resizeDirection;

    // Calculate delta based on direction, maintaining aspect ratio
    let delta = 0;
    if (dir === "se") {
      delta = Math.max(dx, dy * this.aspectRatio);
    } else if (dir === "sw") {
      delta = Math.max(-dx, dy * this.aspectRatio);
    } else if (dir === "ne") {
      delta = Math.max(dx, -dy * this.aspectRatio);
    } else if (dir === "nw") {
      delta = Math.max(-dx, -dy * this.aspectRatio);
    }

    let newWidth = this.resizeStart.width + delta;

    // Apply constraints
    const minWidth = 280;
    const maxWidth = this.getMaxCanvasWidth();
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    this.customCanvasWidth = Math.floor(newWidth);
    this.applyCanvasSize(this.customCanvasWidth);
  }

  /**
   * Handle mouse up to complete resize
   */
  handleMonitorMouseUp() {
    if (!this.isResizingMonitor) return;

    const monitorBezel = document.querySelector(".monitor-bezel");
    if (monitorBezel) {
      monitorBezel.classList.remove("resizing");
    }

    this.isResizingMonitor = false;
    this.resizeDirection = null;
    this.resizeStart = null;

    if (this.customCanvasWidth) {
      localStorage.setItem("a2e-screen-width", this.customCanvasWidth);
      this.updateSizeLockIndicator();
    }

    if (this.onResizeComplete) {
      this.onResizeComplete();
    }
  }

  /**
   * Calculate the maximum canvas width based on available space
   */
  getMaxCanvasWidth() {
    const drivesContainer = document.querySelector(".disk-drives-container");
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");

    const headerHeight = header ? header.offsetHeight : 0;
    const footerHeight = footer ? footer.offsetHeight : 0;
    const drivesHeight = drivesContainer
      ? drivesContainer.offsetHeight + 16
      : 0;

    const padding = 32;
    const bezelPaddingX = 88;
    const bezelPaddingY = 104;

    const availableWidth = window.innerWidth - padding - bezelPaddingX;
    const availableHeight =
      window.innerHeight -
      headerHeight -
      footerHeight -
      drivesHeight -
      padding -
      bezelPaddingY;

    const maxFromWidth = availableWidth;
    const maxFromHeight = availableHeight * this.aspectRatio;

    return Math.min(maxFromWidth, maxFromHeight);
  }

  /**
   * Apply a specific canvas size
   */
  applyCanvasSize(canvasWidth) {
    const canvas = document.getElementById("screen");
    if (!canvas) return;

    const canvasHeight = Math.floor(canvasWidth / this.aspectRatio);

    canvas.style.width = canvasWidth + "px";
    canvas.style.height = canvasHeight + "px";

    if (this.onResize) {
      this.onResize(canvasWidth, canvasHeight);
    }
  }

  /**
   * Handle window/container resize
   */
  handleResize() {
    const canvas = document.getElementById("screen");
    if (!canvas) return;

    const drivesContainer = document.querySelector(".disk-drives-container");
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");

    const headerHeight = header ? header.offsetHeight : 0;
    const footerHeight = footer ? footer.offsetHeight : 0;
    const drivesHeight = drivesContainer
      ? drivesContainer.offsetHeight + 16
      : 0;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const padding = 32;
    const availableWidth = windowWidth - padding;
    const availableHeight =
      windowHeight - headerHeight - footerHeight - drivesHeight - padding;

    const bezelPaddingX = 88;
    const bezelPaddingY = 104;

    const maxCanvasWidth = availableWidth - bezelPaddingX;
    const maxCanvasHeight = availableHeight - bezelPaddingY;

    let canvasWidth, canvasHeight;

    if (this.customCanvasWidth) {
      const maxWidth = Math.min(
        maxCanvasWidth,
        maxCanvasHeight * this.aspectRatio,
      );
      canvasWidth = Math.min(this.customCanvasWidth, maxWidth);
      canvasWidth = Math.max(280, canvasWidth);
      canvasHeight = canvasWidth / this.aspectRatio;
    } else {
      if (maxCanvasWidth / maxCanvasHeight > this.aspectRatio) {
        canvasHeight = Math.max(200, maxCanvasHeight);
        canvasWidth = canvasHeight * this.aspectRatio;
      } else {
        canvasWidth = Math.max(280, maxCanvasWidth);
        canvasHeight = canvasWidth / this.aspectRatio;
      }
    }

    canvasWidth = Math.floor(canvasWidth);
    canvasHeight = Math.floor(canvasHeight);

    canvas.style.width = canvasWidth + "px";
    canvas.style.height = canvasHeight + "px";

    if (this.onResize) {
      this.onResize(canvasWidth, canvasHeight);
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("mousemove", this.handleMonitorMouseMove);
    document.removeEventListener("mouseup", this.handleMonitorMouseUp);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }
}
