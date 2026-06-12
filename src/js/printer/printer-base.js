/*
 * printer-base.js - Abstract base class for printer models
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export class PrinterBase {
  constructor() {
    this._listeners = {};
  }

  on(event, fn) {
    this._listeners[event] = fn;
  }

  off(event) {
    delete this._listeners[event];
  }

  emit(event, data) {
    if (this._listeners[event]) this._listeners[event](data);
  }

  // Called for every byte received from the card
  receiveByte(byte) {}

  reset() {}

  getName() { return "Printer"; }
  getId()   { return "base"; }
}
