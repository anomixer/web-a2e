import { BaseWindow } from '../windows/base-window.js';
import { RELEASE_NOTES, groupByDate, formatDate } from '../config/release-notes.js';

/**
 * ReleaseNotesWindow - Displays git commit history as release notes
 */
export class ReleaseNotesWindow extends BaseWindow {
  constructor() {
    super({
      id: 'release-notes',
      title: 'Release Notes',
      minWidth: 400,
      minHeight: 300,
      defaultWidth: 500,
      defaultHeight: 500,
      defaultPosition: { x: Math.max(50, (window.innerWidth - 500) / 2), y: 80 }
    });
  }

  renderContent() {
    const grouped = groupByDate(RELEASE_NOTES);
    const dates = Object.keys(grouped).sort().reverse();

    let html = '<div class="release-notes-content">';

    for (const date of dates) {
      const notes = grouped[date];
      html += `
        <div class="release-date-group">
          <h3 class="release-date">${formatDate(date)}</h3>
          <ul class="release-commits">
      `;

      for (const note of notes) {
        // Categorize the commit message
        const category = this.categorizeCommit(note.message);
        html += `
          <li class="release-commit ${category}">
            <span class="commit-hash">${note.hash}</span>
            <span class="commit-message">${this.escapeHtml(note.message)}</span>
          </li>
        `;
      }

      html += `
          </ul>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /**
   * Categorize commit message for styling
   */
  categorizeCommit(message) {
    const lower = message.toLowerCase();
    if (lower.startsWith('fix')) return 'commit-fix';
    if (lower.startsWith('add')) return 'commit-feature';
    if (lower.startsWith('improve') || lower.startsWith('enhance')) return 'commit-improve';
    if (lower.startsWith('refactor')) return 'commit-refactor';
    if (lower.startsWith('update')) return 'commit-update';
    return 'commit-other';
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
