/*
 * printer-manager.js - Manages active printer model and WASM byte routing
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { ImageWriterII } from "./imagewriter-ii.js";
import { ImageWriterI }  from "./imagewriter-i.js";
import { EpsonFX80 }     from "./epson-fx80.js";

export const PRINTER_MODELS = [
  { id: "imagewriter-ii", name: "ImageWriter II", create: () => new ImageWriterII() },
  { id: "imagewriter-i",  name: "ImageWriter I",  create: () => new ImageWriterI() },
  { id: "epson-fx80",     name: "Epson FX-80",    create: () => new EpsonFX80() },
];

export class PrinterManager {
  constructor(wasmProxy) {
    this.wasmProxy          = wasmProxy;
    this.activePrinter      = new ImageWriterII();
    this._callbackInstalled = false;
    this._onPrinterChange   = null;
  }

  async init() {
    if (this._callbackInstalled) return;
    if (!this.wasmProxy || !this.wasmProxy._setPrinterCallback) return;

    if (!window.emulator) window.emulator = {};
    window.emulator.printer = { receiveByte: (byte) => this.receiveByte(byte) };

    await this.wasmProxy._setPrinterCallback();
    this._callbackInstalled = true;
  }

  receiveByte(byte) {
    this.activePrinter.receiveByte(byte);
  }

  setActivePrinter(printer) {
    this.activePrinter.reset();
    this.activePrinter = printer;
    if (this._onPrinterChange) this._onPrinterChange(printer);
  }

  getActivePrinter() {
    return this.activePrinter;
  }

  // Called by PrinterWindow to re-attach its listeners when the model changes
  onPrinterChange(fn) {
    this._onPrinterChange = fn;
  }
}
