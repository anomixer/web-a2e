/*
 * release-notes-window.js - Release notes display window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from '../windows/base-window.js';
import { RELEASE_NOTES } from './release-notes.js';

/**
 * ReleaseNotesWindow - Displays curated weekly release notes
 */
export class ReleaseNotesWindow extends BaseWindow {
  constructor() {
    super({
      id: 'release-notes',
      title: 'Release Notes',
      minWidth: 400,
      minHeight: 300,
      defaultWidth: 520,
      defaultHeight: 560,
    });
  }

  renderContent() {
    let html = '<div class="release-notes-content">';

    for (const week of RELEASE_NOTES) {
      html += `<div class="release-week">`;
      html += `<h3 class="release-week-header">Week of ${this.escapeHtml(week.week)}</h3>`;

      if (week.features && week.features.length > 0) {
        html += `<div class="release-section">`;
        html += `<h4 class="release-section-header release-section-features"><span class="release-dot release-dot-feature"></span>Features</h4>`;
        html += `<ul class="release-entries">`;
        for (const entry of week.features) {
          html += `
            <li class="release-entry">
              <span class="release-entry-title">${this.escapeHtml(entry.title)}</span>
              <p class="release-entry-description">${this.escapeHtml(entry.description)}</p>
            </li>
          `;
        }
        html += `</ul></div>`;
      }

      if (week.fixes && week.fixes.length > 0) {
        html += `<div class="release-section">`;
        html += `<h4 class="release-section-header release-section-fixes"><span class="release-dot release-dot-fix"></span>Fixes</h4>`;
        html += `<ul class="release-entries">`;
        for (const entry of week.fixes) {
          html += `
            <li class="release-entry">
              <span class="release-entry-title">${this.escapeHtml(entry.title)}</span>
              <p class="release-entry-description">${this.escapeHtml(entry.description)}</p>
            </li>
          `;
        }
        html += `</ul></div>`;
      }

      html += `</div>`;
    }

    html += '</div>';
    return html;
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * No periodic updates needed
   */
  update() {
    // Static content, no updates needed
  }
}
