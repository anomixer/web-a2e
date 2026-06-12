/*
 * ari-rocks-window.js - Ari Rocks easter egg window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from '../windows/base-window.js';

/**
 * AriRocksWindow - A resizable window with a star that scales with the window
 */
export class AriRocksWindow extends BaseWindow {
  constructor() {
    super({
      id: 'ari-rocks',
      title: 'Ari Rocks',
      minWidth: 150,
      minHeight: 150,
      defaultWidth: 300,
      defaultHeight: 300,
    });
  }

  renderContent() {
    return '<div class="ari-rocks-content"><span class="ari-rocks-star">🌟</span></div>';
  }

  onContentRendered() {
    const content = this.element.querySelector('.debug-window-content');
    const star = this.element.querySelector('.ari-rocks-star');
    this._starObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      star.style.fontSize = `${Math.min(width, height) * 0.7}px`;
    });
    this._starObserver.observe(content);
  }

  update() {
    // Static content, no updates needed
  }
}
