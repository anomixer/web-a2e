import { BaseWindow } from '../ui/BaseWindow.js';

/**
 * SoftSwitchWindow - Display all soft switches with descriptions and addresses
 */
export class SoftSwitchWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: 'soft-switches',
      title: 'Soft Switches',
      minWidth: 280,
      minHeight: 200,
      defaultWidth: 340,
      defaultHeight: 500,
      defaultPosition: { x: window.innerWidth - 400, y: 100 }
    });

    this.wasmModule = wasmModule;

    // Define all soft switches with their bit positions, addresses, and descriptions
    // Bit positions match the 64-bit state returned by getSoftSwitchState/getSoftSwitchStateHigh
    this.switchGroups = [
      {
        title: 'Display Mode',
        switches: [
          { id: 'text', bit: 0, name: 'TEXT', addr: '$C050/51', desc: 'Text mode' },
          { id: 'mixed', bit: 1, name: 'MIXED', addr: '$C052/53', desc: 'Mixed text+graphics' },
          { id: 'page2', bit: 2, name: 'PAGE2', addr: '$C054/55', desc: 'Display page 2' },
          { id: 'hires', bit: 3, name: 'HIRES', addr: '$C056/57', desc: 'Hi-res graphics' },
          { id: 'col80', bit: 4, name: '80COL', addr: '$C00C/0D', desc: '80 column mode' },
          { id: 'altchar', bit: 5, name: 'ALTCHAR', addr: '$C00E/0F', desc: 'Alt charset (MouseText)' },
          { id: 'dhires', bit: 28, name: 'DHIRES', addr: 'computed', desc: 'Double hi-res active' }
        ]
      },
      {
        title: 'Memory Banking',
        switches: [
          { id: 'store80', bit: 6, name: '80STORE', addr: '$C000/01', desc: 'PAGE2 selects aux mem' },
          { id: 'ramrd', bit: 7, name: 'RAMRD', addr: '$C002/03', desc: 'Read from aux RAM' },
          { id: 'ramwrt', bit: 8, name: 'RAMWRT', addr: '$C004/05', desc: 'Write to aux RAM' },
          { id: 'intcxrom', bit: 9, name: 'INTCXROM', addr: '$C006/07', desc: 'Internal $Cxxx ROM' },
          { id: 'altzp', bit: 10, name: 'ALTZP', addr: '$C008/09', desc: 'Aux zero page/stack' },
          { id: 'slotc3rom', bit: 11, name: 'SLOTC3ROM', addr: '$C00A/0B', desc: 'Slot 3 ROM enabled' },
          { id: 'intc8rom', bit: 12, name: 'INTC8ROM', addr: 'internal', desc: 'Internal $C800 ROM' }
        ]
      },
      {
        title: 'Language Card',
        switches: [
          { id: 'lcram', bit: 13, name: 'LCRAM', addr: '$C080-8F', desc: 'LC RAM read enabled' },
          { id: 'lcbank2', bit: 14, name: 'LCBANK2', addr: '$C080-8F', desc: 'LC bank 2 selected' },
          { id: 'lcwrite', bit: 15, name: 'LCWRITE', addr: '$C080-8F', desc: 'LC RAM write enabled' },
          { id: 'lcprewrite', bit: 16, name: 'LCPREWRT', addr: '$C080-8F', desc: 'LC pre-write state' }
        ]
      },
      {
        title: 'Annunciators',
        switches: [
          { id: 'an0', bit: 17, name: 'AN0', addr: '$C058/59', desc: 'Annunciator 0' },
          { id: 'an1', bit: 18, name: 'AN1', addr: '$C05A/5B', desc: 'Annunciator 1' },
          { id: 'an2', bit: 19, name: 'AN2', addr: '$C05C/5D', desc: 'Annunciator 2' },
          { id: 'an3', bit: 20, name: 'AN3', addr: '$C05E/5F', desc: 'Annunciator 3 / DHIRES' }
        ]
      },
      {
        title: 'I/O Status',
        switches: [
          { id: 'vblbar', bit: 21, name: 'VBLBAR', addr: '$C019', desc: 'Vertical blank', readOnly: true },
          { id: 'cassout', bit: 22, name: 'CASSOUT', addr: '$C020', desc: 'Cassette output' },
          { id: 'cassin', bit: 23, name: 'CASSIN', addr: '$C060', desc: 'Cassette input', readOnly: true }
        ]
      },
      {
        title: 'Buttons',
        switches: [
          { id: 'btn0', bit: 24, name: 'BTN0', addr: '$C061', desc: 'Open Apple / Button 0', readOnly: true },
          { id: 'btn1', bit: 25, name: 'BTN1', addr: '$C062', desc: 'Closed Apple / Button 1', readOnly: true },
          { id: 'btn2', bit: 26, name: 'BTN2', addr: '$C063', desc: 'Button 2 / Shift', readOnly: true }
        ]
      },
      {
        title: 'Keyboard',
        switches: [
          { id: 'keyavail', bit: 27, name: 'KEYAVAIL', addr: '$C000', desc: 'Key available (bit 7)', readOnly: true }
        ]
      },
      {
        title: 'Other',
        switches: [
          { id: 'ioudis', bit: 29, name: 'IOUDIS', addr: '$C07E/7F', desc: 'IOU disable (IIc)' }
        ]
      }
    ];

    // Reference addresses (read-only status registers)
    this.statusRegisters = [
      { addr: '$C011', name: 'RDLCBNK2', desc: 'LC bank 2 selected' },
      { addr: '$C012', name: 'RDLCRAM', desc: 'LC RAM read enabled' },
      { addr: '$C013', name: 'RDRAMRD', desc: 'Aux RAM read' },
      { addr: '$C014', name: 'RDRAMWRT', desc: 'Aux RAM write' },
      { addr: '$C015', name: 'RDCXROM', desc: 'Internal $Cxxx ROM' },
      { addr: '$C016', name: 'RDALTZP', desc: 'Aux zero page' },
      { addr: '$C017', name: 'RDC3ROM', desc: 'Slot 3 ROM' },
      { addr: '$C018', name: 'RD80STORE', desc: '80STORE enabled' },
      { addr: '$C019', name: 'RDVBLBAR', desc: 'Vertical blank' },
      { addr: '$C01A', name: 'RDTEXT', desc: 'Text mode' },
      { addr: '$C01B', name: 'RDMIXED', desc: 'Mixed mode' },
      { addr: '$C01C', name: 'RDPAGE2', desc: 'Page 2' },
      { addr: '$C01D', name: 'RDHIRES', desc: 'Hi-res mode' },
      { addr: '$C01E', name: 'RDALTCHAR', desc: 'Alt charset' },
      { addr: '$C01F', name: 'RD80COL', desc: '80 column mode' }
    ];

    // Other I/O addresses (for reference)
    this.ioAddresses = [
      { addr: '$C010', name: 'KBDSTRB', desc: 'Clear keyboard strobe' },
      { addr: '$C030', name: 'SPKR', desc: 'Speaker toggle' },
      { addr: '$C040', name: 'STROBE', desc: 'Utility strobe' },
      { addr: '$C064', name: 'PDL0', desc: 'Paddle 0 (joystick X)' },
      { addr: '$C065', name: 'PDL1', desc: 'Paddle 1 (joystick Y)' },
      { addr: '$C066', name: 'PDL2', desc: 'Paddle 2' },
      { addr: '$C067', name: 'PDL3', desc: 'Paddle 3' },
      { addr: '$C070', name: 'PTRIG', desc: 'Paddle trigger' }
    ];

    // Slot I/O ranges
    this.slotRanges = [
      { range: '$C090-9F', slot: 1, desc: 'Slot 1 I/O' },
      { range: '$C0A0-AF', slot: 2, desc: 'Slot 2 I/O' },
      { range: '$C0B0-BF', slot: 3, desc: 'Slot 3 I/O' },
      { range: '$C0C0-CF', slot: 4, desc: 'Slot 4 I/O' },
      { range: '$C0D0-DF', slot: 5, desc: 'Slot 5 I/O' },
      { range: '$C0E0-EF', slot: 6, desc: 'Slot 6 I/O (Disk II)' },
      { range: '$C0F0-FF', slot: 7, desc: 'Slot 7 I/O' }
    ];
  }

  renderContent() {
    let html = '<div class="softswitch-content">';

    // Render switch groups
    for (const group of this.switchGroups) {
      html += `
        <div class="switch-group">
          <div class="switch-group-title">${group.title}</div>
          <div class="switch-list">
      `;

      for (const sw of group.switches) {
        const readOnlyClass = sw.readOnly ? ' read-only' : '';
        html += `
          <div class="switch-item${readOnlyClass}" id="sw-item-${sw.id}">
            <span class="switch-addr">${sw.addr}</span>
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

    // Add collapsible reference section
    html += `
      <div class="switch-group reference-section">
        <div class="switch-group-title collapsible" id="ref-toggle">
          ▶ I/O Reference
        </div>
        <div class="switch-list reference-list hidden" id="ref-content">
    `;

    // Status registers
    html += '<div class="ref-subtitle">Status Registers ($C011-$C01F)</div>';
    for (const reg of this.statusRegisters) {
      html += `
        <div class="ref-item">
          <span class="ref-addr">${reg.addr}</span>
          <span class="ref-name">${reg.name}</span>
          <span class="ref-desc">${reg.desc}</span>
        </div>
      `;
    }

    // Other I/O
    html += '<div class="ref-subtitle">Other I/O</div>';
    for (const io of this.ioAddresses) {
      html += `
        <div class="ref-item">
          <span class="ref-addr">${io.addr}</span>
          <span class="ref-name">${io.name}</span>
          <span class="ref-desc">${io.desc}</span>
        </div>
      `;
    }

    // Slot I/O
    html += '<div class="ref-subtitle">Slot I/O</div>';
    for (const slot of this.slotRanges) {
      html += `
        <div class="ref-item">
          <span class="ref-addr">${slot.range}</span>
          <span class="ref-name">Slot ${slot.slot}</span>
          <span class="ref-desc">${slot.desc}</span>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    html += '</div>';
    return html;
  }

  /**
   * Called after content is rendered
   */
  onContentRendered() {
    // Set up collapsible reference section
    const toggle = this.contentElement.querySelector('#ref-toggle');
    const content = this.contentElement.querySelector('#ref-content');

    if (toggle && content) {
      toggle.addEventListener('click', () => {
        content.classList.toggle('hidden');
        toggle.textContent = content.classList.contains('hidden')
          ? '▶ I/O Reference'
          : '▼ I/O Reference';
      });
    }
  }

  /**
   * Update all soft switch states
   */
  update(wasmModule) {
    this.wasmModule = wasmModule;

    // Get both low and high 32-bit parts of the state
    const stateLow = wasmModule._getSoftSwitchState();
    const stateHigh = wasmModule._getSoftSwitchStateHigh ? wasmModule._getSoftSwitchStateHigh() : 0;

    for (const group of this.switchGroups) {
      for (const sw of group.switches) {
        let isOn;
        if (sw.bit < 32) {
          isOn = (stateLow & (1 << sw.bit)) !== 0;
        } else {
          isOn = (stateHigh & (1 << (sw.bit - 32))) !== 0;
        }

        const badge = this.contentElement.querySelector(`#sw-${sw.id}`);
        if (badge) {
          badge.classList.toggle('active', isOn);
        }
      }
    }
  }
}
