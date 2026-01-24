import { BaseWindow } from '../ui/BaseWindow.js';

/**
 * DriveDetailWindow - Disk drive status and details
 */
export class DriveDetailWindow extends BaseWindow {
  constructor(wasmModule) {
    super({
      id: 'drive-detail',
      title: 'Disk Drives',
      minWidth: 200,
      minHeight: 150,
      defaultWidth: 240,
      defaultHeight: 220,
      defaultPosition: { x: window.innerWidth - 600, y: 60 }
    });

    this.wasmModule = wasmModule;
  }

  renderContent() {
    return `
      <div class="drive-detail-content">
        <!-- Selected Drive Info -->
        <div class="drive-info-bar">
          <span class="drive-info-label">Selected:</span>
          <span class="drive-info-value" id="dd-selected-drive">Drive 1</span>
          <span class="drive-info-label">Last Byte:</span>
          <span class="drive-info-value mono" id="dd-last-byte">00</span>
        </div>

        <!-- Drive 1 -->
        <div class="drive-panel">
          <div class="drive-header">
            <span class="drive-title">Drive 1</span>
            <span class="drive-inserted" id="dd-d1-inserted">No Disk</span>
          </div>
          <div class="drive-details">
            <div class="drive-row">
              <span class="drive-label">Quarter Track:</span>
              <span class="drive-value" id="dd-d1-qt">0</span>
            </div>
            <div class="drive-row">
              <span class="drive-label">Track:</span>
              <span class="drive-value" id="dd-d1-track">0</span>
            </div>
            <div class="drive-row">
              <span class="drive-label">Phase:</span>
              <span class="drive-value" id="dd-d1-phase">0</span>
            </div>
            <div class="drive-row">
              <span class="drive-label">Nibble Pos:</span>
              <span class="drive-value" id="dd-d1-nibble">0</span>
            </div>
            <div class="drive-row">
              <span class="drive-label">Motor:</span>
              <span class="drive-motor" id="dd-d1-motor">OFF</span>
            </div>
            <div class="drive-row">
              <span class="drive-label">Mode:</span>
              <span class="drive-mode" id="dd-d1-mode">Read</span>
            </div>
          </div>
        </div>

        <!-- Drive 2 -->
        <div class="drive-panel">
          <div class="drive-header">
            <span class="drive-title">Drive 2</span>
            <span class="drive-inserted" id="dd-d2-inserted">No Disk</span>
          </div>
          <div class="drive-details">
            <div class="drive-row">
              <span class="drive-label">Quarter Track:</span>
              <span class="drive-value" id="dd-d2-qt">0</span>
            </div>
            <div class="drive-row">
              <span class="drive-label">Track:</span>
              <span class="drive-value" id="dd-d2-track">0</span>
            </div>
            <div class="drive-row">
              <span class="drive-label">Phase:</span>
              <span class="drive-value" id="dd-d2-phase">0</span>
            </div>
            <div class="drive-row">
              <span class="drive-label">Nibble Pos:</span>
              <span class="drive-value" id="dd-d2-nibble">0</span>
            </div>
            <div class="drive-row">
              <span class="drive-label">Motor:</span>
              <span class="drive-motor" id="dd-d2-motor">OFF</span>
            </div>
            <div class="drive-row">
              <span class="drive-label">Mode:</span>
              <span class="drive-mode" id="dd-d2-mode">Read</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Update all drive status
   */
  update(wasmModule) {
    this.wasmModule = wasmModule;

    // Selected drive
    const selectedDrive = wasmModule._getSelectedDrive();
    const selElem = this.contentElement.querySelector('#dd-selected-drive');
    if (selElem) {
      selElem.textContent = `Drive ${selectedDrive + 1}`;
    }

    // Last byte
    const lastByte = wasmModule._getLastDiskByte();
    const byteElem = this.contentElement.querySelector('#dd-last-byte');
    if (byteElem) {
      byteElem.textContent = this.formatHex(lastByte);
    }

    // Update each drive
    this.updateDrive(0);
    this.updateDrive(1);
  }

  /**
   * Update a single drive's status
   */
  updateDrive(driveNum) {
    const prefix = driveNum === 0 ? 'dd-d1' : 'dd-d2';

    // Disk inserted
    const inserted = this.wasmModule._isDiskInserted(driveNum);
    const insertedElem = this.contentElement.querySelector(`#${prefix}-inserted`);
    if (insertedElem) {
      insertedElem.textContent = inserted ? 'Disk Inserted' : 'No Disk';
      insertedElem.classList.toggle('active', inserted);
    }

    // Quarter track
    const qt = this.wasmModule._getDiskHeadPosition(driveNum);
    const qtElem = this.contentElement.querySelector(`#${prefix}-qt`);
    if (qtElem) {
      qtElem.textContent = qt;
    }

    // Track
    const track = this.wasmModule._getDiskTrack(driveNum);
    const trackElem = this.contentElement.querySelector(`#${prefix}-track`);
    if (trackElem) {
      trackElem.textContent = track;
    }

    // Phase
    const phase = this.wasmModule._getDiskPhase(driveNum);
    const phaseElem = this.contentElement.querySelector(`#${prefix}-phase`);
    if (phaseElem) {
      phaseElem.textContent = phase;
    }

    // Nibble position
    const nibble = this.wasmModule._getCurrentNibblePosition(driveNum);
    const nibbleElem = this.contentElement.querySelector(`#${prefix}-nibble`);
    if (nibbleElem) {
      nibbleElem.textContent = nibble;
    }

    // Motor
    const motorOn = this.wasmModule._getDiskMotorOn(driveNum);
    const motorElem = this.contentElement.querySelector(`#${prefix}-motor`);
    if (motorElem) {
      motorElem.textContent = motorOn ? 'ON' : 'OFF';
      motorElem.classList.toggle('on', motorOn);
    }

    // Read/Write mode
    const writeMode = this.wasmModule._getDiskWriteMode(driveNum);
    const modeElem = this.contentElement.querySelector(`#${prefix}-mode`);
    if (modeElem) {
      modeElem.textContent = writeMode ? 'Write' : 'Read';
      modeElem.classList.toggle('write', writeMode);
    }
  }
}
