import { DebugWindow } from './DebugWindow.js';

/**
 * SoftSwitchWindow - Display all soft switches with descriptions
 */
export class SoftSwitchWindow extends DebugWindow {
  constructor(wasmModule) {
    super({
      id: 'soft-switches',
      title: 'Soft Switches',
      minWidth: 220,
      minHeight: 200,
      defaultWidth: 280,
      defaultHeight: 360,
      defaultPosition: { x: window.innerWidth - 340, y: 300 }
    });

    this.wasmModule = wasmModule;

    // Define all soft switches with their bit positions and descriptions
    this.switchGroups = [
      {
        title: 'Display',
        switches: [
          { id: 'text', bit: 0, name: 'TEXT', addr: '$C050/$C051', desc: 'Text mode (vs Graphics)' },
          { id: 'mixed', bit: 1, name: 'MIXED', addr: '$C052/$C053', desc: 'Mixed mode - 4 lines text at bottom' },
          { id: 'page2', bit: 2, name: 'PAGE2', addr: '$C054/$C055', desc: 'Display page 2 (vs page 1)' },
          { id: 'hires', bit: 3, name: 'HIRES', addr: '$C056/$C057', desc: 'Hi-res graphics (vs Lo-res)' },
          { id: 'col80', bit: 4, name: '80COL', addr: '$C00C/$C00D', desc: '80 column text mode' },
          { id: 'altchar', bit: 14, name: 'ALTCHAR', addr: '$C00E/$C00F', desc: 'Alternate character set (MouseText)' }
        ]
      },
      {
        title: 'Memory Banking',
        switches: [
          { id: 'store80', bit: 5, name: '80STORE', addr: '$C000/$C001', desc: 'PAGE2 selects aux memory for display' },
          { id: 'ramrd', bit: 6, name: 'RAMRD', addr: '$C002/$C003', desc: 'Read from auxiliary RAM' },
          { id: 'ramwrt', bit: 7, name: 'RAMWRT', addr: '$C004/$C005', desc: 'Write to auxiliary RAM' },
          { id: 'altzp', bit: 8, name: 'ALTZP', addr: '$C008/$C009', desc: 'Use aux zero page and stack' },
          { id: 'intcxrom', bit: 12, name: 'INTCXROM', addr: '$C006/$C007', desc: 'Use internal $Cxxx ROM' },
          { id: 'slotc3rom', bit: 13, name: 'SLOTC3ROM', addr: '$C00A/$C00B', desc: 'Slot 3 ROM enabled' }
        ]
      },
      {
        title: 'Language Card',
        switches: [
          { id: 'lcram', bit: 9, name: 'LCRAM', addr: '$C080-$C08F', desc: 'LC RAM read enabled (vs ROM)' },
          { id: 'lcbank2', bit: 10, name: 'LCBANK2', addr: '$C080-$C08F', desc: 'LC bank 2 selected (vs bank 1)' },
          { id: 'lcwrite', bit: 11, name: 'LCWRITE', addr: '$C080-$C08F', desc: 'LC RAM write enabled' }
        ]
      },
      {
        title: 'Annunciators',
        switches: [
          { id: 'an0', bit: 15, name: 'AN0', addr: '$C058/$C059', desc: 'Annunciator 0 output' },
          { id: 'an1', bit: 16, name: 'AN1', addr: '$C05A/$C05B', desc: 'Annunciator 1 output' },
          { id: 'an2', bit: 17, name: 'AN2', addr: '$C05C/$C05D', desc: 'Annunciator 2 output' },
          { id: 'an3', bit: 18, name: 'AN3', addr: '$C05E/$C05F', desc: 'Annunciator 3 / Double Hi-Res enable' }
        ]
      }
    ];
  }

  renderContent() {
    let html = '<div class="softswitch-content">';

    for (const group of this.switchGroups) {
      html += `
        <div class="switch-group">
          <div class="switch-group-title">${group.title}</div>
          <div class="switch-list">
      `;

      for (const sw of group.switches) {
        html += `
          <div class="switch-item" id="sw-item-${sw.id}" title="${sw.addr}">
            <span class="switch-badge" id="sw-${sw.id}">${sw.name}</span>
            <span class="switch-desc">${sw.desc}</span>
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /**
   * Update all soft switch states
   */
  update(wasmModule) {
    this.wasmModule = wasmModule;
    const state = wasmModule._getSoftSwitchState();

    for (const group of this.switchGroups) {
      for (const sw of group.switches) {
        const isOn = (state & (1 << sw.bit)) !== 0;
        const badge = this.contentElement.querySelector(`#sw-${sw.id}`);
        if (badge) {
          badge.classList.toggle('active', isOn);
        }
      }
    }
  }
}
