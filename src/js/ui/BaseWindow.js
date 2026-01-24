/**
 * BaseWindow - Base class for draggable/resizable windows
 */
export class BaseWindow {
  constructor(config) {
    this.id = config.id;
    this.title = config.title;
    this.minWidth = config.minWidth || 280;
    this.minHeight = config.minHeight || 200;
    this.defaultWidth = config.defaultWidth || 400;
    this.defaultHeight = config.defaultHeight || 300;
    this.defaultPosition = config.defaultPosition || { x: 100, y: 100 };

    this.element = null;
    this.headerElement = null;
    this.contentElement = null;
    this.isVisible = false;
    this.isDragging = false;
    this.isResizing = false;
    this.dragOffset = { x: 0, y: 0 };
    this.resizeStart = { x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 };
    this.resizeDirection = null;

    // Track current position/size (needed because getBoundingClientRect returns zeros for hidden elements)
    this.currentX = config.defaultPosition?.x || 100;
    this.currentY = config.defaultPosition?.y || 100;
    this.currentWidth = config.defaultWidth || 400;
    this.currentHeight = config.defaultHeight || 300;

    // Track distance from right/bottom edges for maintaining position on resize
    this.distanceFromRight = null;
    this.distanceFromBottom = null;
    this.lastViewportWidth = window.innerWidth;
    this.lastViewportHeight = window.innerHeight;

    // Bind event handlers
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
  }

  /**
   * Create the window DOM structure
   */
  create() {
    // Create main window element
    this.element = document.createElement("div");
    this.element.id = this.id;
    this.element.className = "debug-window hidden";
    this.element.style.width = `${this.defaultWidth}px`;
    this.element.style.height = `${this.defaultHeight}px`;
    this.element.style.left = `${this.defaultPosition.x}px`;
    this.element.style.top = `${this.defaultPosition.y}px`;

    // Header (draggable area)
    this.headerElement = document.createElement("div");
    this.headerElement.className = "debug-window-header";
    this.headerElement.innerHTML = `
      <span class="debug-window-title">${this.title}</span>
      <button class="debug-window-close" title="Close">&times;</button>
    `;

    // Content area
    this.contentElement = document.createElement("div");
    this.contentElement.className = "debug-window-content";
    this.contentElement.innerHTML = this.renderContent();

    // Resize handles
    const resizeHandles = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
    resizeHandles.forEach((dir) => {
      const handle = document.createElement("div");
      handle.className = `debug-resize-handle ${dir}`;
      handle.dataset.direction = dir;
      this.element.appendChild(handle);
    });

    // Assemble
    this.element.appendChild(this.headerElement);
    this.element.appendChild(this.contentElement);
    document.body.appendChild(this.element);

    // Set up event listeners
    this.setupEventListeners();

    // Call hook for subclasses to set up after content is rendered
    if (typeof this.onContentRendered === "function") {
      this.onContentRendered();
    }
  }

  /**
   * Set up drag, resize, and close event listeners
   */
  setupEventListeners() {
    // Close button
    const closeBtn = this.headerElement.querySelector(".debug-window-close");
    closeBtn.addEventListener("click", () => this.hide());

    // Drag start on header
    this.headerElement.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("debug-window-close")) return;
      this.startDrag(e);
    });

    // Resize start on handles
    this.element.querySelectorAll(".debug-resize-handle").forEach((handle) => {
      handle.addEventListener("mousedown", (e) => {
        this.startResize(e, handle.dataset.direction);
      });
    });

    // Bring to front on click
    this.element.addEventListener("mousedown", () => {
      if (this.onFocus) this.onFocus(this.id);
    });

    // Global mouse events for drag/resize
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mouseup", this.handleMouseUp);
  }

  /**
   * Handle mouse down for drag/resize detection
   */
  handleMouseDown(e) {
    // Handled by specific listeners
  }

  /**
   * Handle mouse move for dragging and resizing
   */
  handleMouseMove(e) {
    if (this.isDragging) {
      this.drag(e);
    } else if (this.isResizing) {
      this.resize(e);
    }
  }

  /**
   * Handle mouse up to end drag/resize
   */
  handleMouseUp(e) {
    if (this.isDragging || this.isResizing) {
      this.isDragging = false;
      this.isResizing = false;
      this.element.classList.remove("dragging", "resizing");
      if (this.onStateChange) this.onStateChange();
    }
  }

  /**
   * Start dragging the window
   */
  startDrag(e) {
    this.isDragging = true;
    this.element.classList.add("dragging");
    const rect = this.element.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    e.preventDefault();
  }

  /**
   * Handle drag movement
   */
  drag(e) {
    let x = e.clientX - this.dragOffset.x;
    let y = e.clientY - this.dragOffset.y;

    // Get header height to prevent dragging under it
    const header = document.querySelector('header');
    const minY = header ? header.offsetHeight : 0;

    // Keep window on screen and below header
    const maxX = window.innerWidth - this.element.offsetWidth;
    const maxY = window.innerHeight - this.element.offsetHeight;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(minY, Math.min(y, maxY));

    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.currentX = x;
    this.currentY = y;

    // Update edge distances after drag
    this.updateEdgeDistances();
  }

  /**
   * Update tracked distances from right and bottom edges
   */
  updateEdgeDistances() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = this.currentX + this.currentWidth / 2;
    const centerY = this.currentY + this.currentHeight / 2;

    // Track distance from right edge if window is on the right half
    if (centerX > viewportWidth / 2) {
      this.distanceFromRight =
        viewportWidth - (this.currentX + this.currentWidth);
    } else {
      this.distanceFromRight = null;
    }

    // Track distance from bottom edge if window is on the bottom half
    if (centerY > viewportHeight / 2) {
      this.distanceFromBottom =
        viewportHeight - (this.currentY + this.currentHeight);
    } else {
      this.distanceFromBottom = null;
    }

    this.lastViewportWidth = viewportWidth;
    this.lastViewportHeight = viewportHeight;
  }

  /**
   * Start resizing the window
   */
  startResize(e, direction) {
    this.isResizing = true;
    this.resizeDirection = direction;
    this.element.classList.add("resizing");
    const rect = this.element.getBoundingClientRect();
    this.resizeStart = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
    };
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * Handle resize movement
   */
  resize(e) {
    const dx = e.clientX - this.resizeStart.x;
    const dy = e.clientY - this.resizeStart.y;
    const dir = this.resizeDirection;

    let newWidth = this.resizeStart.width;
    let newHeight = this.resizeStart.height;
    let newLeft = this.resizeStart.left;
    let newTop = this.resizeStart.top;

    // Calculate new dimensions based on direction
    if (dir.includes("e")) {
      newWidth = Math.max(this.minWidth, this.resizeStart.width + dx);
    }
    if (dir.includes("w")) {
      const proposedWidth = this.resizeStart.width - dx;
      if (proposedWidth >= this.minWidth) {
        newWidth = proposedWidth;
        newLeft = this.resizeStart.left + dx;
      }
    }
    if (dir.includes("s")) {
      newHeight = Math.max(this.minHeight, this.resizeStart.height + dy);
    }
    if (dir.includes("n")) {
      const proposedHeight = this.resizeStart.height - dy;
      if (proposedHeight >= this.minHeight) {
        newHeight = proposedHeight;
        newTop = this.resizeStart.top + dy;
      }
    }

    // Keep on screen
    newLeft = Math.max(0, newLeft);
    newTop = Math.max(0, newTop);
    if (newLeft + newWidth > window.innerWidth) {
      newWidth = window.innerWidth - newLeft;
    }
    if (newTop + newHeight > window.innerHeight) {
      newHeight = window.innerHeight - newTop;
    }

    this.element.style.width = `${newWidth}px`;
    this.element.style.height = `${newHeight}px`;
    this.element.style.left = `${newLeft}px`;
    this.element.style.top = `${newTop}px`;
    this.currentWidth = newWidth;
    this.currentHeight = newHeight;
    this.currentX = newLeft;
    this.currentY = newTop;
  }

  /**
   * Show the window
   */
  show() {
    this.element.classList.remove("hidden");
    this.isVisible = true;
    // Ensure window is within viewport when shown
    this.constrainToViewport();
    if (this.onFocus) this.onFocus(this.id);
  }

  /**
   * Hide the window
   */
  hide() {
    // Set visibility flag first so getState() returns correct value
    this.isVisible = false;
    // Save state BEFORE adding hidden class, since getBoundingClientRect returns zeros for display:none
    if (this.onStateChange) this.onStateChange();
    this.element.classList.add("hidden");
    // Refocus canvas for keyboard input
    const canvas = document.getElementById("screen");
    if (canvas) {
      setTimeout(() => canvas.focus(), 0);
    }
  }

  /**
   * Toggle window visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Set window z-index
   */
  setZIndex(z) {
    this.element.style.zIndex = z;
  }

  /**
   * Get window state for persistence
   */
  getState() {
    // Use tracked values instead of getBoundingClientRect which returns zeros for hidden elements
    return {
      x: this.currentX,
      y: this.currentY,
      width: this.currentWidth,
      height: this.currentHeight,
      visible: this.isVisible,
    };
  }

  /**
   * Restore window state from persistence
   */
  restoreState(state) {
    if (state.x !== undefined) {
      this.element.style.left = `${state.x}px`;
      this.currentX = state.x;
    }
    if (state.y !== undefined) {
      this.element.style.top = `${state.y}px`;
      this.currentY = state.y;
    }
    // Enforce minimum dimensions when restoring
    if (state.width !== undefined) {
      const width = Math.max(state.width, this.minWidth);
      this.element.style.width = `${width}px`;
      this.currentWidth = width;
    }
    if (state.height !== undefined) {
      const height = Math.max(state.height, this.minHeight);
      this.element.style.height = `${height}px`;
      this.currentHeight = height;
    }

    // Calculate edge distances based on restored position
    this.updateEdgeDistances();

    if (state.visible) {
      this.show();
    }
  }

  /**
   * Constrain window position to keep it within the visible viewport
   * Maintains distance from right/bottom edges for windows on those sides
   */
  constrainToViewport() {
    if (!this.element) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = this.currentWidth;
    const height = this.currentHeight;

    // Get header height to prevent windows going under it
    const header = document.querySelector('header');
    const minTop = header ? header.offsetHeight : 0;

    let newLeft = this.currentX;
    let newTop = this.currentY;
    let changed = false;

    // If window was on the right side, maintain distance from right edge
    if (this.distanceFromRight !== null) {
      const targetLeft = viewportWidth - width - this.distanceFromRight;
      if (targetLeft !== newLeft) {
        newLeft = targetLeft;
        changed = true;
      }
    }

    // If window was on the bottom side, maintain distance from bottom edge
    if (this.distanceFromBottom !== null) {
      const targetTop = viewportHeight - height - this.distanceFromBottom;
      if (targetTop !== newTop) {
        newTop = targetTop;
        changed = true;
      }
    }

    // Ensure window stays within viewport bounds
    if (width >= viewportWidth) {
      newLeft = 0;
      changed = true;
    } else if (newLeft + width > viewportWidth) {
      newLeft = viewportWidth - width;
      changed = true;
    } else if (newLeft < 0) {
      newLeft = 0;
      changed = true;
    }

    if (height >= viewportHeight - minTop) {
      newTop = minTop;
      changed = true;
    } else if (newTop + height > viewportHeight) {
      newTop = viewportHeight - height;
      changed = true;
    } else if (newTop < minTop) {
      newTop = minTop;
      changed = true;
    }

    if (changed) {
      this.element.style.left = `${newLeft}px`;
      this.element.style.top = `${newTop}px`;
      this.currentX = newLeft;
      this.currentY = newTop;
    }

    // Update viewport tracking
    this.lastViewportWidth = viewportWidth;
    this.lastViewportHeight = viewportHeight;
  }

  /**
   * Override in subclasses to provide window content HTML
   */
  renderContent() {
    return "<p>Override renderContent() in subclass</p>";
  }

  /**
   * Override in subclasses to update window content
   */
  update(wasmModule) {
    // Override in subclasses
  }

  /**
   * Override in subclasses to set up additional event listeners
   */
  setupContentEventListeners() {
    // Override in subclasses
  }

  /**
   * Helper to format a hex byte
   */
  formatHex(value, digits = 2) {
    return value.toString(16).toUpperCase().padStart(digits, "0");
  }

  /**
   * Helper to format a hex address
   */
  formatAddr(value) {
    return "$" + this.formatHex(value, 4);
  }
}
